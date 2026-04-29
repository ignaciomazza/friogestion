import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireOrg, requireRole } from "@/lib/auth/tenant";
import { ADMIN_ROLES } from "@/lib/auth/rbac";
import { parseOptionalDate } from "@/lib/validation";
import { applyReceiptToInstallments } from "@/lib/installments";
import { backfillPendingReceipts, recalcSaleTotals } from "@/lib/receipts/backfill";

const lineSchema = z.object({
  paymentMethodId: z.string().min(1),
  accountId: z.string().optional(),
  currencyCode: z.string().min(1),
  amount: z.coerce.number().positive(),
  fxRateUsed: z.coerce.number().positive().optional(),
});

const receiptSchema = z.object({
  saleId: z.string().min(1),
  receivedAt: z.string().optional(),
  lines: z.array(lineSchema).min(1),
});

const receiptUpdateSchema = receiptSchema.extend({
  id: z.string().min(1),
});

const ALLOWED_ROLES = ["OWNER", "ADMIN", "SALES"];
const MANAGE_ROLES = [...ADMIN_ROLES];

type ReceiptLineInput = z.infer<typeof lineSchema>;
type ReceiptWithLines = Prisma.ReceiptGetPayload<{
  include: {
    lines: {
      include: {
        paymentMethod: true;
        account: true;
        accountMovement: true;
      };
    };
  };
}>;

const serializeReceipt = (receipt: ReceiptWithLines) => ({
  id: receipt.id,
  receiptNumber: receipt.receiptNumber,
  status: receipt.status,
  total: receipt.total.toString(),
  receivedAt: receipt.receivedAt.toISOString(),
  confirmedAt: receipt.confirmedAt?.toISOString() ?? null,
  lines: receipt.lines.map((line) => {
    const requiresVerification =
      receipt.status === "CONFIRMED" && Boolean(line.accountId);
    return {
      id: line.id,
      paymentMethodId: line.paymentMethodId,
      accountId: line.accountId,
      paymentMethodName: line.paymentMethod.name,
      accountName: line.account?.name ?? null,
      currencyCode: line.currencyCode,
      amount: line.amount.toString(),
      amountBase: line.amountBase.toString(),
      fxRateUsed: line.fxRateUsed?.toString() ?? null,
      requiresVerification,
      verifiedAt: line.accountMovement?.verifiedAt?.toISOString() ?? null,
    };
  }),
});

async function buildReceiptLines(
  organizationId: string,
  inputLines: ReceiptLineInput[]
) {
  const paymentMethodIds = Array.from(
    new Set(inputLines.map((line) => line.paymentMethodId))
  );
  const methods = await prisma.paymentMethod.findMany({
    where: { organizationId, id: { in: paymentMethodIds } },
  });
  if (methods.length !== paymentMethodIds.length) {
    throw new Error("INVALID_METHOD");
  }
  const methodById = new Map(methods.map((method) => [method.id, method]));

  const accountIds = Array.from(
    new Set(inputLines.map((line) => line.accountId?.trim()).filter(Boolean))
  ) as string[];
  const accounts = accountIds.length
    ? await prisma.financeAccount.findMany({
        where: { organizationId, id: { in: accountIds } },
      })
    : [];
  if (accounts.length !== accountIds.length) {
    throw new Error("INVALID_ACCOUNT");
  }
  const accountById = new Map(accounts.map((account) => [account.id, account]));

  let totalBase = 0;
  const lines = inputLines.map((line) => {
    const method = methodById.get(line.paymentMethodId);
    if (!method) {
      throw new Error("INVALID_METHOD");
    }

    const accountId = line.accountId?.trim() || undefined;
    if (method.requiresAccount && !accountId) {
      throw new Error("ACCOUNT_REQUIRED");
    }
    if (accountId) {
      const account = accountById.get(accountId);
      if (!account) {
        throw new Error("INVALID_ACCOUNT");
      }
      if (account.currencyCode !== line.currencyCode.toUpperCase()) {
        throw new Error("ACCOUNT_CURRENCY_MISMATCH");
      }
    }

    const currencyCode = line.currencyCode.toUpperCase();
    if (currencyCode !== "ARS" && !line.fxRateUsed) {
      throw new Error("FX_REQUIRED");
    }
    const amountBase =
      currencyCode === "ARS"
        ? line.amount
        : line.amount * (line.fxRateUsed ?? 0);
    totalBase += amountBase;
    return {
      paymentMethodId: line.paymentMethodId,
      accountId: accountId ?? null,
      currencyCode,
      amount: line.amount.toFixed(2),
      amountBase: amountBase.toFixed(2),
      fxRateUsed: line.fxRateUsed ? line.fxRateUsed.toFixed(6) : undefined,
    };
  });

  return { lines, totalBase };
}

async function resetSaleInstallments(
  tx: Prisma.TransactionClient,
  saleId: string
) {
  const plan = await tx.installmentPlan.findFirst({
    where: { saleId },
    select: { id: true },
  });
  if (!plan) return;

  await tx.installmentPayment.deleteMany({
    where: { installment: { planId: plan.id } },
  });
  await tx.installment.updateMany({
    where: { planId: plan.id },
    data: {
      paidAmount: "0.00",
      status: "PENDING",
      paidAt: null,
    },
  });
}

async function applyConfirmedReceiptsToInstallments(
  tx: Prisma.TransactionClient,
  saleId: string
) {
  const receipts = await tx.receipt.findMany({
    where: { saleId, status: "CONFIRMED" },
    orderBy: [{ receivedAt: "asc" }, { createdAt: "asc" }],
    select: { id: true, total: true },
  });

  for (const receipt of receipts) {
    await applyReceiptToInstallments(
      tx,
      saleId,
      receipt.id,
      Number(receipt.total ?? 0)
    );
  }
}

async function deleteReceiptEffects(
  tx: Prisma.TransactionClient,
  organizationId: string,
  receiptId: string,
  lineIds: string[]
) {
  if (lineIds.length) {
    await tx.accountMovement.deleteMany({
      where: { organizationId, receiptLineId: { in: lineIds } },
    });
  }
  await tx.currentAccountEntry.deleteMany({
    where: { organizationId, receiptId, sourceType: "RECEIPT" },
  });
  await tx.receiptLine.deleteMany({ where: { receiptId } });
}

export async function GET(req: NextRequest) {
  try {
    const organizationId = await requireOrg(req);
    await backfillPendingReceipts(organizationId);
    const saleId = req.nextUrl.searchParams.get("saleId") || undefined;

    const receipts = await prisma.receipt.findMany({
      where: { organizationId, saleId },
      include: {
        lines: {
          include: {
            paymentMethod: true,
            account: true,
            accountMovement: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(
      receipts.map((receipt) => serializeReceipt(receipt))
    );
  } catch {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { membership, payload } = await requireRole(req, ALLOWED_ROLES);
    await backfillPendingReceipts(membership.organizationId, payload.userId);
    const body = receiptSchema.parse(await req.json());

    const sale = await prisma.sale.findFirst({
      where: { id: body.saleId, organizationId: membership.organizationId },
      select: { id: true, customerId: true },
    });

    if (!sale) {
      return NextResponse.json(
        { error: "Venta no encontrada" },
        { status: 404 }
      );
    }

    const receivedAtResult = parseOptionalDate(body.receivedAt);
    if (receivedAtResult.error) {
      return NextResponse.json(
        { error: "Fecha invalida" },
        { status: 400 }
      );
    }
    const receivedAt = receivedAtResult.date ?? new Date();
    const { lines, totalBase } = await buildReceiptLines(
      membership.organizationId,
      body.lines
    );

    const receipt = await prisma.$transaction(async (tx) => {
      const confirmedAt = new Date();
      const created = await tx.receipt.create({
        data: {
          organizationId: membership.organizationId,
          customerId: sale.customerId,
          saleId: sale.id,
          status: "CONFIRMED",
          createdByUserId: payload.userId,
          confirmedByUserId: payload.userId,
          confirmedAt,
          receivedAt,
          total: totalBase.toFixed(2),
          lines: {
            create: lines.map((line) => ({
              paymentMethodId: line.paymentMethodId,
              accountId: line.accountId ?? undefined,
              currencyCode: line.currencyCode,
              amount: line.amount,
              amountBase: line.amountBase,
              fxRateUsed: line.fxRateUsed ?? undefined,
            })),
          },
        },
        include: {
          lines: {
            include: {
              paymentMethod: true,
              account: true,
              accountMovement: true,
            },
          },
        },
      });

      for (const line of created.lines) {
        if (!line.accountId) continue;
        await tx.accountMovement.create({
          data: {
            organizationId: membership.organizationId,
            accountId: line.accountId,
            occurredAt: receivedAt,
            direction: "IN",
            amount: line.amount,
            currencyCode: line.currencyCode,
            requiresVerification: true,
            note: `Cobro venta ${sale.id}`,
            receiptLineId: line.id,
          },
        });
      }
      await tx.currentAccountEntry.create({
        data: {
          organizationId: membership.organizationId,
          counterpartyType: "CUSTOMER",
          customerId: sale.customerId,
          direction: "CREDIT",
          sourceType: "RECEIPT",
          saleId: sale.id,
          receiptId: created.id,
          amount: totalBase.toFixed(2),
          occurredAt: receivedAt,
          note: `Cobro venta ${sale.id}`,
        },
      });
      await applyReceiptToInstallments(
        tx,
        sale.id,
        created.id,
        totalBase
      );
      await recalcSaleTotals(tx, sale.id);

      return created;
    });

    return NextResponse.json(serializeReceipt(receipt));
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Datos invalidos" }, { status: 400 });
    }
    if (error instanceof Error) {
      if (error.message === "INVALID_METHOD") {
        return NextResponse.json(
          { error: "Metodo de pago invalido" },
          { status: 400 }
        );
      }
      if (error.message === "INVALID_ACCOUNT") {
        return NextResponse.json(
          { error: "Cuenta invalida" },
          { status: 400 }
        );
      }
      if (error.message === "ACCOUNT_REQUIRED") {
        return NextResponse.json(
          { error: "Cuenta requerida para el metodo" },
          { status: 400 }
        );
      }
      if (error.message === "ACCOUNT_CURRENCY_MISMATCH") {
        return NextResponse.json(
          { error: "La cuenta no coincide con la moneda" },
          { status: 400 }
        );
      }
      if (error.message === "FX_REQUIRED") {
        return NextResponse.json(
          { error: "Falta cotizacion" },
          { status: 400 }
        );
      }
    }
    return NextResponse.json({ error: "No se pudo registrar" }, { status: 400 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { membership, payload } = await requireRole(req, MANAGE_ROLES);
    await backfillPendingReceipts(membership.organizationId, payload.userId);
    const body = receiptUpdateSchema.parse(await req.json());

    const receipt = await prisma.receipt.findFirst({
      where: { id: body.id, organizationId: membership.organizationId },
      include: {
        sale: {
          select: {
            id: true,
            billingStatus: true,
            fiscalInvoice: { select: { id: true } },
          },
        },
        lines: { select: { id: true } },
      },
    });

    if (!receipt) {
      return NextResponse.json(
        { error: "Cobro no encontrado" },
        { status: 404 }
      );
    }

    if (receipt.saleId !== body.saleId) {
      return NextResponse.json(
        { error: "El cobro no corresponde a la venta" },
        { status: 400 }
      );
    }

    if (
      receipt.sale &&
      (receipt.sale.billingStatus === "BILLED" || receipt.sale.fiscalInvoice)
    ) {
      return NextResponse.json(
        { error: "No se pueden modificar cobros de una venta facturada" },
        { status: 409 }
      );
    }

    const receivedAtResult = parseOptionalDate(body.receivedAt);
    if (receivedAtResult.error) {
      return NextResponse.json(
        { error: "Fecha invalida" },
        { status: 400 }
      );
    }
    const receivedAt = receivedAtResult.date ?? receipt.receivedAt;
    const { lines, totalBase } = await buildReceiptLines(
      membership.organizationId,
      body.lines
    );

    const updated = await prisma.$transaction(async (tx) => {
      if (receipt.saleId) {
        await resetSaleInstallments(tx, receipt.saleId);
      }

      await deleteReceiptEffects(
        tx,
        membership.organizationId,
        receipt.id,
        receipt.lines.map((line) => line.id)
      );

      const saved = await tx.receipt.update({
        where: { id: receipt.id },
        data: {
          receivedAt,
          total: totalBase.toFixed(2),
          lines: {
            create: lines.map((line) => ({
              paymentMethodId: line.paymentMethodId,
              accountId: line.accountId ?? undefined,
              currencyCode: line.currencyCode,
              amount: line.amount,
              amountBase: line.amountBase,
              fxRateUsed: line.fxRateUsed ?? undefined,
            })),
          },
        },
        include: {
          lines: {
            include: {
              paymentMethod: true,
              account: true,
              accountMovement: true,
            },
          },
        },
      });

      for (const line of saved.lines) {
        if (!line.accountId) continue;
        await tx.accountMovement.create({
          data: {
            organizationId: membership.organizationId,
            accountId: line.accountId,
            occurredAt: receivedAt,
            direction: "IN",
            amount: line.amount,
            currencyCode: line.currencyCode,
            requiresVerification: true,
            note: `Cobro venta ${receipt.saleId ?? receipt.id}`,
            receiptLineId: line.id,
          },
        });
      }

      await tx.currentAccountEntry.create({
        data: {
          organizationId: membership.organizationId,
          counterpartyType: "CUSTOMER",
          customerId: receipt.customerId,
          direction: "CREDIT",
          sourceType: "RECEIPT",
          saleId: receipt.saleId ?? undefined,
          receiptId: receipt.id,
          amount: totalBase.toFixed(2),
          occurredAt: receivedAt,
          note: `Cobro venta ${receipt.saleId ?? receipt.id}`,
        },
      });

      if (receipt.saleId) {
        await applyConfirmedReceiptsToInstallments(tx, receipt.saleId);
        await recalcSaleTotals(tx, receipt.saleId);
        await tx.saleEvent.create({
          data: {
            organizationId: membership.organizationId,
            saleId: receipt.saleId,
            actorUserId: payload.userId,
            action: "UPDATED",
            note: `Cobro ${receipt.receiptNumber ?? receipt.id} editado`,
          },
        });
      }

      return saved;
    });

    return NextResponse.json(serializeReceipt(updated));
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Datos invalidos" }, { status: 400 });
    }
    if (error instanceof Error) {
      if (error.message === "INVALID_METHOD") {
        return NextResponse.json(
          { error: "Metodo de pago invalido" },
          { status: 400 }
        );
      }
      if (error.message === "INVALID_ACCOUNT") {
        return NextResponse.json(
          { error: "Cuenta invalida" },
          { status: 400 }
        );
      }
      if (error.message === "ACCOUNT_REQUIRED") {
        return NextResponse.json(
          { error: "Cuenta requerida para el metodo" },
          { status: 400 }
        );
      }
      if (error.message === "ACCOUNT_CURRENCY_MISMATCH") {
        return NextResponse.json(
          { error: "La cuenta no coincide con la moneda" },
          { status: 400 }
        );
      }
      if (error.message === "FX_REQUIRED") {
        return NextResponse.json(
          { error: "Falta cotizacion" },
          { status: 400 }
        );
      }
    }
    return NextResponse.json(
      { error: "No se pudo actualizar el cobro" },
      { status: 400 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { membership, payload } = await requireRole(req, MANAGE_ROLES);
    await backfillPendingReceipts(membership.organizationId, payload.userId);

    const id = req.nextUrl.searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "Falta id" }, { status: 400 });
    }

    const receipt = await prisma.receipt.findFirst({
      where: { id, organizationId: membership.organizationId },
      include: {
        sale: {
          select: {
            id: true,
            billingStatus: true,
            fiscalInvoice: { select: { id: true } },
          },
        },
        lines: { select: { id: true } },
      },
    });

    if (!receipt) {
      return NextResponse.json(
        { error: "Cobro no encontrado" },
        { status: 404 }
      );
    }

    if (
      receipt.sale &&
      (receipt.sale.billingStatus === "BILLED" || receipt.sale.fiscalInvoice)
    ) {
      return NextResponse.json(
        { error: "No se pueden eliminar cobros de una venta facturada" },
        { status: 409 }
      );
    }

    await prisma.$transaction(async (tx) => {
      if (receipt.saleId) {
        await resetSaleInstallments(tx, receipt.saleId);
      }

      await deleteReceiptEffects(
        tx,
        membership.organizationId,
        receipt.id,
        receipt.lines.map((line) => line.id)
      );
      await tx.receipt.delete({ where: { id: receipt.id } });

      if (receipt.saleId) {
        await applyConfirmedReceiptsToInstallments(tx, receipt.saleId);
        await recalcSaleTotals(tx, receipt.saleId);
        await tx.saleEvent.create({
          data: {
            organizationId: membership.organizationId,
            saleId: receipt.saleId,
            actorUserId: payload.userId,
            action: "UPDATED",
            note: `Cobro ${receipt.receiptNumber ?? receipt.id} eliminado`,
          },
        });
      }
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { error: "No se pudo eliminar el cobro" },
      { status: 400 }
    );
  }
}
