import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireOrg, requireRole } from "@/lib/auth/tenant";
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

const ALLOWED_ROLES = ["OWNER", "ADMIN", "SALES"];

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
      receipts.map((receipt) => ({
        id: receipt.id,
        status: receipt.status,
        total: receipt.total.toString(),
        receivedAt: receipt.receivedAt.toISOString(),
        confirmedAt: receipt.confirmedAt?.toISOString() ?? null,
        lines: receipt.lines.map((line) => {
          const requiresVerification =
            receipt.status === "CONFIRMED" && Boolean(line.accountId);
          return {
            id: line.id,
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
      }))
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

    const paymentMethodIds = Array.from(
      new Set(body.lines.map((line) => line.paymentMethodId))
    );
    const methods = await prisma.paymentMethod.findMany({
      where: { organizationId: membership.organizationId, id: { in: paymentMethodIds } },
    });
    if (methods.length !== paymentMethodIds.length) {
      return NextResponse.json(
        { error: "Metodo de pago invalido" },
        { status: 400 }
      );
    }
    const methodById = new Map(methods.map((method) => [method.id, method]));

    const accountIds = Array.from(
      new Set(body.lines.map((line) => line.accountId).filter(Boolean))
    ) as string[];
    const accounts = accountIds.length
      ? await prisma.financeAccount.findMany({
          where: { organizationId: membership.organizationId, id: { in: accountIds } },
        })
      : [];
    if (accounts.length !== accountIds.length) {
      return NextResponse.json({ error: "Cuenta invalida" }, { status: 400 });
    }
    const accountById = new Map(accounts.map((account) => [account.id, account]));

    const receivedAtResult = parseOptionalDate(body.receivedAt);
    if (receivedAtResult.error) {
      return NextResponse.json(
        { error: "Fecha invalida" },
        { status: 400 }
      );
    }
    const receivedAt = receivedAtResult.date ?? new Date();

    let totalBase = 0;
    const lines = body.lines.map((line) => {
      const method = methodById.get(line.paymentMethodId);
      if (!method) {
        throw new Error("INVALID_METHOD");
      }
      if (method.requiresAccount && !line.accountId) {
        throw new Error("ACCOUNT_REQUIRED");
      }
      if (line.accountId) {
        const account = accountById.get(line.accountId);
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
        accountId: line.accountId || null,
        currencyCode,
        amount: line.amount.toFixed(2),
        amountBase: amountBase.toFixed(2),
        fxRateUsed: line.fxRateUsed ? line.fxRateUsed.toFixed(6) : undefined,
      };
    });

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
          lines: { include: { paymentMethod: true, account: true } },
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

    return NextResponse.json({
      id: receipt.id,
      status: receipt.status,
      total: receipt.total.toString(),
      receivedAt: receipt.receivedAt.toISOString(),
      confirmedAt: receipt.confirmedAt?.toISOString() ?? null,
      lines: receipt.lines.map((line) => ({
        id: line.id,
        paymentMethodName: line.paymentMethod.name,
        accountName: line.account?.name ?? null,
        currencyCode: line.currencyCode,
        amount: line.amount.toString(),
        amountBase: line.amountBase.toString(),
        fxRateUsed: line.fxRateUsed?.toString() ?? null,
      })),
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Datos invalidos" }, { status: 400 });
    }
    if (error instanceof Error) {
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
