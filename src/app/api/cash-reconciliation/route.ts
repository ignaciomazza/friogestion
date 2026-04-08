import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth/tenant";
import { ADMIN_ROLES } from "@/lib/auth/rbac";
import { parseOptionalDate } from "@/lib/validation";
import { verificationWhereClause } from "@/lib/cash-reconciliation/report";
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

const lineSchema = z.object({
  accountId: z.string().min(1),
  countedAmount: z.coerce.number(),
  note: z.string().max(280).optional(),
});

const reconciliationSchema = z.object({
  periodStart: z.string().min(1),
  periodEnd: z.string().min(1),
  includeUnverified: z.boolean().optional(),
  note: z.string().max(280).optional(),
  lines: z.array(lineSchema).min(1),
});

export async function GET(req: NextRequest) {
  try {
    const { membership } = await requireRole(req, [...ADMIN_ROLES]);
    const organizationId = membership.organizationId;

    const reconciliations = await prisma.cashReconciliation.findMany({
      where: { organizationId },
      include: {
        createdBy: { select: { name: true, email: true } },
        lines: {
          include: {
            account: { select: { name: true, currencyCode: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 20,
    });

    return NextResponse.json(
      reconciliations.map((item) => ({
        id: item.id,
        periodStart: item.periodStart.toISOString(),
        periodEnd: item.periodEnd.toISOString(),
        note: item.note ?? null,
        createdAt: item.createdAt.toISOString(),
        createdBy:
          item.createdBy?.name ?? item.createdBy?.email ?? "Desconocido",
        lines: item.lines.map((line) => ({
          id: line.id,
          accountName: line.account.name,
          currencyCode: line.currencyCode,
          expectedAmount: line.expectedAmount.toString(),
          countedAmount: line.countedAmount.toString(),
          difference: line.difference.toString(),
          note: line.note ?? null,
        })),
      }))
    );
  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json(
        { error: "No autorizado" },
        { status: authErrorStatus(error) }
      );
    }
    logServerError("api.cash-reconciliation.get", error);
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { membership } = await requireRole(req, [...ADMIN_ROLES]);
    const body = reconciliationSchema.parse(await req.json());

    const periodStart = parseDateRange(body.periodStart, false);
    const periodEnd = parseDateRange(body.periodEnd, true);
    if (!periodStart || !periodEnd) {
      return NextResponse.json({ error: "Periodo invalido" }, { status: 400 });
    }

    const accountIds = Array.from(
      new Set(body.lines.map((line) => line.accountId))
    );
    const accounts = await prisma.financeAccount.findMany({
      where: { organizationId: membership.organizationId, id: { in: accountIds } },
      select: { id: true, name: true, currencyCode: true },
    });
    if (accounts.length !== accountIds.length) {
      return NextResponse.json({ error: "Cuenta invalida" }, { status: 400 });
    }
    const accountById = new Map(accounts.map((account) => [account.id, account]));

    const movements = await prisma.accountMovement.findMany({
      where: {
        organizationId: membership.organizationId,
        accountId: { in: accountIds },
        occurredAt: { gte: periodStart, lte: periodEnd },
        ...verificationWhereClause(Boolean(body.includeUnverified)),
      },
      select: { accountId: true, direction: true, amount: true },
    });

    const totals = new Map<string, { incoming: number; outgoing: number; net: number }>();
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

    const created = await prisma.cashReconciliation.create({
      data: {
        organizationId: membership.organizationId,
        periodStart,
        periodEnd,
        note: body.note?.trim() || null,
        createdByUserId: membership.userId,
        lines: {
          create: body.lines.map((line) => {
            const account = accountById.get(line.accountId);
            const expected = totals.get(line.accountId)?.net ?? 0;
            const counted = Number(line.countedAmount ?? 0);
            return {
              accountId: line.accountId,
              currencyCode: account?.currencyCode ?? "ARS",
              expectedAmount: expected.toFixed(2),
              countedAmount: counted.toFixed(2),
              difference: (counted - expected).toFixed(2),
              note: line.note?.trim() || null,
            };
          }),
        },
      },
      include: {
        lines: {
          include: { account: { select: { name: true, currencyCode: true } } },
        },
        createdBy: { select: { name: true, email: true } },
      },
    });

    return NextResponse.json({
      id: created.id,
      periodStart: created.periodStart.toISOString(),
      periodEnd: created.periodEnd.toISOString(),
      createdAt: created.createdAt.toISOString(),
      createdBy:
        created.createdBy?.name ?? created.createdBy?.email ?? "Desconocido",
      lines: created.lines.map((line) => ({
        id: line.id,
        accountName: line.account.name,
        currencyCode: line.currencyCode,
        expectedAmount: line.expectedAmount.toString(),
        countedAmount: line.countedAmount.toString(),
        difference: line.difference.toString(),
        note: line.note ?? null,
      })),
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Datos invalidos" }, { status: 400 });
    }
    if (isAuthError(error)) {
      return NextResponse.json(
        { error: "No autorizado" },
        { status: authErrorStatus(error) }
      );
    }
    logServerError("api.cash-reconciliation.post", error);
    return NextResponse.json(
      { error: "No se pudo registrar" },
      { status: 400 }
    );
  }
}
