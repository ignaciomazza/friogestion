import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireOrg, requireRole } from "@/lib/auth/tenant";
import { parseOptionalDate } from "@/lib/validation";
import { recalcPurchaseTotals } from "@/lib/purchases";

const lineSchema = z.object({
  paymentMethodId: z.string().min(1),
  accountId: z.string().optional(),
  currencyCode: z.string().min(1),
  amount: z.coerce.number().positive(),
  fxRateUsed: z.coerce.number().positive().optional(),
});

const allocationSchema = z.object({
  purchaseInvoiceId: z.string().min(1),
  amount: z.coerce.number().positive(),
});

const retentionSchema = z.object({
  type: z.enum(["VAT", "INCOME", "IIBB", "OTHER"]),
  amount: z.coerce.number().positive(),
  baseAmount: z.coerce.number().positive().optional(),
  rate: z.coerce.number().positive().optional(),
  note: z.string().max(280).optional(),
});

const paymentSchema = z.object({
  supplierId: z.string().min(1),
  paidAt: z.string().optional(),
  lines: z.array(lineSchema).min(1),
  allocations: z.array(allocationSchema).optional(),
  retentions: z.array(retentionSchema).optional(),
});

const ALLOWED_ROLES = ["OWNER", "ADMIN", "CASHIER"];

export async function GET(req: NextRequest) {
  try {
    const organizationId = await requireOrg(req);
    const supplierId = req.nextUrl.searchParams.get("supplierId") || undefined;

    const payments = await prisma.supplierPayment.findMany({
      where: { organizationId, supplierId },
      include: {
        supplier: true,
        lines: {
          include: { paymentMethod: true, account: true },
        },
        allocations: {
          include: { purchaseInvoice: true },
        },
        retentions: true,
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    return NextResponse.json(
      payments.map((payment) => ({
        id: payment.id,
        supplierId: payment.supplierId,
        supplierName: payment.supplier.displayName,
        status: payment.status,
        paidAt: payment.paidAt.toISOString(),
        total: payment.total.toString(),
        withheldTotal: payment.withheldTotal?.toString() ?? "0",
        cancelledAt: payment.cancelledAt?.toISOString() ?? null,
        cancellationNote: payment.cancellationNote ?? null,
        lines: payment.lines.map((line) => ({
          id: line.id,
          paymentMethodName: line.paymentMethod.name,
          accountName: line.account?.name ?? null,
          currencyCode: line.currencyCode,
          amount: line.amount.toString(),
          amountBase: line.amountBase.toString(),
          fxRateUsed: line.fxRateUsed?.toString() ?? null,
        })),
        allocations: payment.allocations.map((allocation) => ({
          id: allocation.id,
          purchaseInvoiceId: allocation.purchaseInvoiceId,
          invoiceNumber: allocation.purchaseInvoice.invoiceNumber ?? null,
          amount: allocation.amount.toString(),
        })),
        retentions: payment.retentions?.map((retention) => ({
          id: retention.id,
          type: retention.type,
          baseAmount: retention.baseAmount?.toString() ?? null,
          rate: retention.rate?.toString() ?? null,
          amount: retention.amount.toString(),
          note: retention.note ?? null,
        })) ?? [],
      }))
    );
  } catch {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { membership } = await requireRole(req, ALLOWED_ROLES);
    const body = paymentSchema.parse(await req.json());

    const supplier = await prisma.supplier.findFirst({
      where: { id: body.supplierId, organizationId: membership.organizationId },
      select: { id: true, displayName: true },
    });

    if (!supplier) {
      return NextResponse.json(
        { error: "Proveedor no encontrado" },
        { status: 404 }
      );
    }

    const paymentMethodIds = Array.from(
      new Set(body.lines.map((line) => line.paymentMethodId))
    );
    const methods = await prisma.paymentMethod.findMany({
      where: {
        organizationId: membership.organizationId,
        id: { in: paymentMethodIds },
      },
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
          where: {
            organizationId: membership.organizationId,
            id: { in: accountIds },
          },
        })
      : [];
    if (accounts.length !== accountIds.length) {
      return NextResponse.json({ error: "Cuenta invalida" }, { status: 400 });
    }
    const accountById = new Map(accounts.map((account) => [account.id, account]));

    const paidAtResult = parseOptionalDate(body.paidAt);
    if (paidAtResult.error) {
      return NextResponse.json(
        { error: "Fecha invalida" },
        { status: 400 }
      );
    }
    const paidAt = paidAtResult.date ?? new Date();

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

    const allocationsInput = body.allocations ?? [];
    const retentionsInput = body.retentions ?? [];
    const withheldTotal = retentionsInput.reduce(
      (sum, retention) => sum + retention.amount,
      0
    );
    const purchaseIds = Array.from(
      new Set(allocationsInput.map((allocation) => allocation.purchaseInvoiceId))
    );
    const purchases = purchaseIds.length
      ? await prisma.purchaseInvoice.findMany({
          where: {
            organizationId: membership.organizationId,
            supplierId: body.supplierId,
            id: { in: purchaseIds },
          },
          select: { id: true, total: true, paidTotal: true },
        })
      : [];
    if (purchases.length !== purchaseIds.length) {
      return NextResponse.json(
        { error: "Compra invalida" },
        { status: 400 }
      );
    }
    const purchaseById = new Map(purchases.map((purchase) => [purchase.id, purchase]));

    let allocationsTotal = 0;
    for (const allocation of allocationsInput) {
      const purchase = purchaseById.get(allocation.purchaseInvoiceId);
      if (!purchase) {
        return NextResponse.json(
          { error: "Compra invalida" },
          { status: 400 }
        );
      }
      const total = Number(purchase.total ?? 0);
      const paid = Number(purchase.paidTotal ?? 0);
      const open = Math.max(total - paid, 0);
      if (allocation.amount > open + 0.005) {
        return NextResponse.json(
          { error: "El pago excede el saldo de la compra" },
          { status: 400 }
        );
      }
      allocationsTotal += allocation.amount;
    }

    if (allocationsTotal > totalBase + withheldTotal + 0.005) {
      return NextResponse.json(
        { error: "El total asignado supera el pago" },
        { status: 400 }
      );
    }

    const payment = await prisma.$transaction(async (tx) => {
      const created = await tx.supplierPayment.create({
        data: {
          organizationId: membership.organizationId,
          supplierId: body.supplierId,
          paidAt,
          status: "CONFIRMED",
          total: totalBase.toFixed(2),
          withheldTotal: withheldTotal.toFixed(2),
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
          retentions: retentionsInput.length
            ? {
                create: retentionsInput.map((retention) => ({
                  type: retention.type,
                  amount: retention.amount.toFixed(2),
                  baseAmount: retention.baseAmount
                    ? retention.baseAmount.toFixed(2)
                    : undefined,
                  rate: retention.rate ? retention.rate.toFixed(2) : undefined,
                  note: retention.note?.trim() || undefined,
                })),
              }
            : undefined,
        },
        include: {
          supplier: true,
          lines: { include: { paymentMethod: true, account: true } },
        },
      });

      if (allocationsInput.length) {
        await tx.supplierPaymentAllocation.createMany({
          data: allocationsInput.map((allocation) => ({
            supplierPaymentId: created.id,
            purchaseInvoiceId: allocation.purchaseInvoiceId,
            amount: allocation.amount.toFixed(2),
          })),
        });

        for (const purchaseId of purchaseIds) {
          await recalcPurchaseTotals(tx, purchaseId);
        }
      }

      for (const line of created.lines) {
        if (!line.accountId) continue;
        await tx.accountMovement.create({
          data: {
            organizationId: membership.organizationId,
            accountId: line.accountId,
            occurredAt: paidAt,
            direction: "OUT",
            amount: line.amount,
            currencyCode: line.currencyCode,
            note: `Pago proveedor ${supplier.displayName}`,
            supplierPaymentLineId: line.id,
          },
        });
      }

      await tx.currentAccountEntry.create({
        data: {
          organizationId: membership.organizationId,
          counterpartyType: "SUPPLIER",
          supplierId: body.supplierId,
          direction: "DEBIT",
          sourceType: "SUPPLIER_PAYMENT",
          supplierPaymentId: created.id,
          amount: (totalBase + withheldTotal).toFixed(2),
          occurredAt: paidAt,
          note: `Pago proveedor ${supplier.displayName}`,
        },
      });

      return created;
    });

    return NextResponse.json({
      id: payment.id,
      supplierId: payment.supplierId,
      supplierName: payment.supplier.displayName,
      status: payment.status,
      paidAt: payment.paidAt.toISOString(),
      total: payment.total.toString(),
      withheldTotal: payment.withheldTotal?.toString() ?? "0",
      lines: payment.lines.map((line) => ({
        id: line.id,
        paymentMethodName: line.paymentMethod.name,
        accountName: line.account?.name ?? null,
        currencyCode: line.currencyCode,
        amount: line.amount.toString(),
        amountBase: line.amountBase.toString(),
        fxRateUsed: line.fxRateUsed?.toString() ?? null,
      })),
      allocations: allocationsInput.map((allocation) => ({
        purchaseInvoiceId: allocation.purchaseInvoiceId,
        amount: allocation.amount.toString(),
      })),
      retentions: retentionsInput.map((retention) => ({
        type: retention.type,
        baseAmount: retention.baseAmount?.toString() ?? null,
        rate: retention.rate?.toString() ?? null,
        amount: retention.amount.toString(),
        note: retention.note ?? null,
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
