import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOrg, requireRole } from "@/lib/auth/tenant";
import {
  resolveReceiptDoubleCheckRoles,
} from "@/lib/auth/receipt-controls";

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

    const daysParam = req.nextUrl.searchParams.get("days");
    const days = Math.min(
      Math.max(Number(daysParam ?? 14), 1),
      90
    );
    const since = new Date();
    since.setDate(since.getDate() - (days - 1));
    since.setHours(0, 0, 0, 0);

    const movements = await prisma.accountMovement.findMany({
      where: {
        organizationId,
        direction: "IN",
        receiptLineId: { not: null },
        occurredAt: { gte: since },
      },
      select: {
        occurredAt: true,
        amount: true,
        currencyCode: true,
        verifiedAt: true,
      },
      orderBy: { occurredAt: "asc" },
    });

    const currencies = new Set<string>();
    const rows = new Map<
      string,
      Record<string, { verified: number; pending: number }>
    >();

    for (const movement of movements) {
      const dateKey = movement.occurredAt.toISOString().slice(0, 10);
      const currency = movement.currencyCode;
      currencies.add(currency);
      if (!rows.has(dateKey)) {
        rows.set(dateKey, {});
      }
      const byCurrency = rows.get(dateKey) as Record<
        string,
        { verified: number; pending: number }
      >;
      if (!byCurrency[currency]) {
        byCurrency[currency] = { verified: 0, pending: 0 };
      }
      const amount = Number(movement.amount ?? 0);
      if (movement.verifiedAt) {
        byCurrency[currency].verified += amount;
      } else {
        byCurrency[currency].pending += amount;
      }
    }

    const sortedDates = Array.from(rows.keys()).sort();
    return NextResponse.json({
      days,
      currencies: Array.from(currencies).sort(),
      rows: sortedDates.map((date) => ({
        date,
        totals: rows.get(date) ?? {},
      })),
    });
  } catch {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
}
