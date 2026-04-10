import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOrg, requireRole } from "@/lib/auth/tenant";
import { parseOptionalDate } from "@/lib/validation";
import {
  resolveReceiptDoubleCheckRoles,
} from "@/lib/auth/receipt-controls";

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
    const org = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { receiptDoubleCheckRoles: true },
    });
    const allowedRoles = resolveReceiptDoubleCheckRoles(
      org?.receiptDoubleCheckRoles
    );
    await requireRole(req, allowedRoles);

    const fromParam = req.nextUrl.searchParams.get("from");
    const toParam = req.nextUrl.searchParams.get("to");
    const verifierId = req.nextUrl.searchParams.get("verifierId") || undefined;

    const fromDate = parseDateRange(fromParam, false);
    const toDate = parseDateRange(toParam, true);

    const occurredAtFilter =
      fromDate || toDate
        ? {
            ...(fromDate ? { gte: fromDate } : {}),
            ...(toDate ? { lte: toDate } : {}),
          }
        : undefined;

    const movements = await prisma.accountMovement.findMany({
      where: {
        organizationId,
        direction: "IN",
        receiptLineId: { not: null },
        verifiedAt: { not: null },
        ...(verifierId ? { verifiedByUserId: verifierId } : {}),
        ...(occurredAtFilter ? { occurredAt: occurredAtFilter } : {}),
      },
      include: {
        account: true,
        verifiedBy: true,
        receiptLine: {
          include: {
            paymentMethod: true,
            receipt: {
              include: {
                sale: { include: { customer: true } },
                customer: true,
              },
            },
          },
        },
      },
      orderBy: { occurredAt: "desc" },
      take: 200,
    });

    return NextResponse.json(
      movements.map((movement) => {
        const receipt = movement.receiptLine?.receipt;
        const sale = receipt?.sale;
        const customer = sale?.customer ?? receipt?.customer ?? null;
        return {
          id: movement.id,
          occurredAt: movement.occurredAt.toISOString(),
          verifiedAt: movement.verifiedAt?.toISOString() ?? null,
          amount: movement.amount.toString(),
          currencyCode: movement.currencyCode,
          accountName: movement.account.name,
          paymentMethodName:
            movement.receiptLine?.paymentMethod.name ?? "Desconocido",
          saleId: sale?.id ?? null,
          saleNumber: sale?.saleNumber ?? null,
          customerName: customer?.displayName ?? null,
          receiptId: receipt?.id ?? null,
          receiptNumber: receipt?.receiptNumber ?? null,
          verifiedByName:
            movement.verifiedBy?.name ?? movement.verifiedBy?.email ?? null,
        };
      })
    );
  } catch {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
}
