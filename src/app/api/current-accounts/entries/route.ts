import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import type { LedgerSourceType } from "@prisma/client";
import { requireOrg } from "@/lib/auth/tenant";
import { parseOptionalDate } from "@/lib/validation";

const parseDateRange = (value?: string | null, endOfDay = false) => {
  if (!value) return null;
  const result = parseOptionalDate(value);
  if (result.error || !result.date) return null;
  const date = result.date;
  if (endOfDay) {
    date.setHours(23, 59, 59, 999);
  } else {
    date.setHours(0, 0, 0, 0);
  }
  return date;
};

export async function GET(req: NextRequest) {
  try {
    const organizationId = await requireOrg(req);
    const type = req.nextUrl.searchParams.get("type");
    const id = req.nextUrl.searchParams.get("id");
    const sourceFilter = req.nextUrl.searchParams.get("source") || "ALL";
    const fromParam = req.nextUrl.searchParams.get("from");
    const toParam = req.nextUrl.searchParams.get("to");
    const fromDate = parseDateRange(fromParam, false);
    const toDate = parseDateRange(toParam, true);
    const occurredAtFilter =
      fromDate || toDate
        ? {
            ...(fromDate ? { gte: fromDate } : {}),
            ...(toDate ? { lte: toDate } : {}),
          }
        : undefined;

    if (!id) {
      return NextResponse.json({ error: "Falta id" }, { status: 400 });
    }

    if (type !== "customer" && type !== "supplier") {
      return NextResponse.json({ error: "Tipo invalido" }, { status: 400 });
    }

    if (
      ![
        "ALL",
        "SALE",
        "RECEIPT",
        "PURCHASE",
        "SUPPLIER_PAYMENT",
        "ADJUSTMENT",
      ].includes(sourceFilter)
    ) {
      return NextResponse.json({ error: "Filtro invalido" }, { status: 400 });
    }

    const counterpartyFilter =
      type === "customer" ? { customerId: id } : { supplierId: id };

    const entries = await prisma.currentAccountEntry.findMany({
      where: {
        organizationId,
        counterpartyType: type === "customer" ? "CUSTOMER" : "SUPPLIER",
        ...counterpartyFilter,
        ...(sourceFilter !== "ALL"
          ? { sourceType: sourceFilter as LedgerSourceType }
          : {}),
        ...(occurredAtFilter ? { occurredAt: occurredAtFilter } : {}),
      },
      include: {
        sale: true,
        receipt: true,
        purchaseInvoice: true,
        supplierPayment: true,
      },
      orderBy: { occurredAt: "desc" },
      take: 200,
    });

    return NextResponse.json(
      entries.map((entry) => {
        const reference =
          entry.sale?.saleNumber ??
          entry.receipt?.receiptNumber ??
          entry.purchaseInvoice?.invoiceNumber ??
          (entry.supplierPaymentId ? entry.supplierPaymentId : null);
        return {
          id: entry.id,
          occurredAt: entry.occurredAt.toISOString(),
          direction: entry.direction,
          sourceType: entry.sourceType,
          amount: entry.amount.toString(),
          note: entry.note ?? null,
          reference,
        };
      })
    );
  } catch {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
}
