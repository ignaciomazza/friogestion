import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import type { FinanceAccountType } from "@prisma/client";
import { requireRole } from "@/lib/auth/tenant";
import { ADMIN_ROLES } from "@/lib/auth/rbac";
import { parseOptionalDate } from "@/lib/validation";
import {
  parseIncludeUnverified,
  verificationWhereClause,
} from "@/lib/cash-reconciliation/report";
import { logServerError } from "@/lib/server/log";
import { authErrorStatus, isAuthError } from "@/lib/auth/errors";

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
    const { membership } = await requireRole(req, [...ADMIN_ROLES]);
    const organizationId = membership.organizationId;
    const fromParam = req.nextUrl.searchParams.get("from");
    const toParam = req.nextUrl.searchParams.get("to");
    const accountType = req.nextUrl.searchParams.get("accountType") || "CASH";
    const includeUnverified = parseIncludeUnverified(
      req.nextUrl.searchParams.get("includeUnverified"),
      false
    );
    if (!["CASH", "BANK", "VIRTUAL", "ALL"].includes(accountType)) {
      return NextResponse.json({ error: "Tipo invalido" }, { status: 400 });
    }

    const fromDate =
      parseDateRange(fromParam, false) ??
      new Date(new Date().setHours(0, 0, 0, 0));
    const toDate =
      parseDateRange(toParam, true) ??
      new Date(new Date().setHours(23, 59, 59, 999));

    const accountWhere =
      accountType === "ALL"
        ? { organizationId }
        : { organizationId, type: accountType as FinanceAccountType };

    const accounts = await prisma.financeAccount.findMany({
      where: accountWhere,
      select: { id: true, name: true, currencyCode: true, type: true },
      orderBy: { name: "asc" },
    });
    const accountIds = accounts.map((account) => account.id);

    const movements = accountIds.length
      ? await prisma.accountMovement.findMany({
          where: {
            organizationId,
            accountId: { in: accountIds },
            occurredAt: { gte: fromDate, lte: toDate },
            ...verificationWhereClause(includeUnverified),
          },
          select: { accountId: true, direction: true, amount: true },
        })
      : [];

    const totals = new Map<
      string,
      { incoming: number; outgoing: number; net: number }
    >();
    for (const movement of movements) {
      const current = totals.get(movement.accountId) ?? {
        incoming: 0,
        outgoing: 0,
        net: 0,
      };
      const amount = Number(movement.amount ?? 0);
      if (movement.direction === "IN") {
        current.incoming += amount;
      } else {
        current.outgoing += amount;
      }
      current.net = current.incoming - current.outgoing;
      totals.set(movement.accountId, current);
    }

    return NextResponse.json({
      from: fromDate.toISOString(),
      to: toDate.toISOString(),
      includeUnverified,
      accounts: accounts.map((account) => {
        const current = totals.get(account.id) ?? {
          incoming: 0,
          outgoing: 0,
          net: 0,
        };
        return {
          accountId: account.id,
          accountName: account.name,
          currencyCode: account.currencyCode,
          accountType: account.type,
          incoming: current.incoming.toFixed(2),
          outgoing: current.outgoing.toFixed(2),
          expectedNet: current.net.toFixed(2),
        };
      }),
    });
  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json(
        { error: "No autorizado" },
        { status: authErrorStatus(error) }
      );
    }
    logServerError("api.cash-reconciliation.report.get", error);
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
}
