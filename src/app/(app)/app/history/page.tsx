import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AUTH_COOKIE_NAME, verifyToken } from "@/lib/auth/jwt";
import { ADMIN_ROLES } from "@/lib/auth/rbac";
import { formatCurrencyARS } from "@/lib/format";
import { prisma } from "@/lib/prisma";

const ENTITY_LABELS: Record<string, string> = {
  SALE: "Venta",
  QUOTE: "Presupuesto",
  RECEIPT: "Cobro",
  DELIVERY_NOTE: "Remito",
};

const ACTION_LABELS: Record<string, string> = {
  SALE_CREATED: "Venta creada",
  SALE_CREATED_FROM_QUOTE: "Venta desde presupuesto",
  SALE_UPDATED: "Venta actualizada",
  SALE_BILLING_STATUS_UPDATED: "Estado fiscal actualizado",
  SALE_DELETED: "Venta eliminada",
  QUOTE_CREATED: "Presupuesto creado",
  QUOTE_UPDATED: "Presupuesto actualizado",
  QUOTE_CONFIRMED: "Presupuesto confirmado",
  QUOTE_DELETED: "Presupuesto eliminado",
  RECEIPT_CREATED: "Cobro registrado",
  RECEIPT_UPDATED: "Cobro editado",
  RECEIPT_DELETED: "Cobro eliminado",
  DELIVERY_NOTE_CREATED: "Remito creado",
  DELIVERY_NOTE_UPDATED: "Remito actualizado",
  DELIVERY_NOTE_ISSUED: "Remito emitido",
  DELIVERY_NOTE_DELIVERED: "Remito entregado",
  DELIVERY_NOTE_CANCELLED: "Remito cancelado",
};

type EventDetail = {
  customerName: string | null;
  total: string | null;
  saleNumber?: string | null;
};

const toRecord = (value: unknown) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
};

const readString = (record: Record<string, unknown> | null, key: string) => {
  const value = record?.[key];
  return typeof value === "string" && value.trim() ? value : null;
};

const readTotal = (record: Record<string, unknown> | null) => {
  const value = record?.total;
  if (typeof value === "string" && value.trim()) return value;
  if (typeof value === "number" && Number.isFinite(value)) return value.toString();
  return null;
};

const buildDetailLine = (detail: EventDetail | null) => {
  if (!detail) return null;
  const parts = [
    detail.customerName ? `Cliente: ${detail.customerName}` : null,
    detail.total ? `Total: ${formatCurrencyARS(detail.total)}` : null,
    detail.saleNumber ? `Venta: ${detail.saleNumber}` : null,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
};

export default async function HistoryPage() {
  const token = (await cookies()).get(AUTH_COOKIE_NAME)?.value;
  if (!token) {
    redirect("/login");
  }

  let payload;
  try {
    payload = await verifyToken(token);
  } catch {
    redirect("/login");
  }

  if (!payload.activeOrgId) {
    redirect("/login");
  }

  const membership = await prisma.membership.findUnique({
    where: {
      organizationId_userId: {
        organizationId: payload.activeOrgId,
        userId: payload.userId,
      },
    },
  });

  if (!membership || !ADMIN_ROLES.some((role) => role === membership.role)) {
    redirect("/app");
  }

  const now = new Date();
  const events = await prisma.operationEvent.findMany({
    where: {
      organizationId: membership.organizationId,
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
    include: {
      actor: { select: { name: true, email: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  const jsonSaleIds = events
    .flatMap((event) => [toRecord(event.after), toRecord(event.before)])
    .map((record) => readString(record, "saleId"))
    .filter((value): value is string => Boolean(value));
  const saleIds = Array.from(
    new Set([
      ...events
        .filter((event) => event.entityType === "SALE")
        .map((event) => event.entityId),
      ...jsonSaleIds,
    ]),
  );
  const quoteIds = events
    .filter((event) => event.entityType === "QUOTE")
    .map((event) => event.entityId);
  const receiptIds = events
    .filter((event) => event.entityType === "RECEIPT")
    .map((event) => event.entityId);

  const [sales, quotes, receipts] = await Promise.all([
    saleIds.length
      ? prisma.sale.findMany({
          where: { organizationId: membership.organizationId, id: { in: saleIds } },
          select: {
            id: true,
            saleNumber: true,
            total: true,
            customer: { select: { displayName: true } },
          },
        })
      : Promise.resolve([]),
    quoteIds.length
      ? prisma.quote.findMany({
          where: {
            organizationId: membership.organizationId,
            id: { in: quoteIds },
          },
          select: {
            id: true,
            total: true,
            customer: { select: { displayName: true } },
          },
        })
      : Promise.resolve([]),
    receiptIds.length
      ? prisma.receipt.findMany({
          where: {
            organizationId: membership.organizationId,
            id: { in: receiptIds },
          },
          select: {
            id: true,
            total: true,
            customer: { select: { displayName: true } },
            sale: { select: { saleNumber: true } },
          },
        })
      : Promise.resolve([]),
  ]);

  const saleDetails = new Map<string, EventDetail>(
    sales.map((sale) => [
      sale.id,
      {
        customerName: sale.customer.displayName,
        total: sale.total?.toString() ?? null,
        saleNumber: sale.saleNumber,
      },
    ]),
  );
  const quoteDetails = new Map<string, EventDetail>(
    quotes.map((quote) => [
      quote.id,
      {
        customerName: quote.customer.displayName,
        total: quote.total?.toString() ?? null,
      },
    ]),
  );
  const receiptDetails = new Map<string, EventDetail>(
    receipts.map((receipt) => [
      receipt.id,
      {
        customerName: receipt.customer.displayName,
        total: receipt.total.toString(),
        saleNumber: receipt.sale?.saleNumber ?? null,
      },
    ]),
  );

  const resolveEventDetail = (event: (typeof events)[number]) => {
    if (event.entityType === "SALE") {
      return saleDetails.get(event.entityId) ?? null;
    }
    if (event.entityType === "QUOTE") {
      return quoteDetails.get(event.entityId) ?? null;
    }
    if (event.entityType === "RECEIPT") {
      const receiptDetail = receiptDetails.get(event.entityId);
      if (receiptDetail) return receiptDetail;
      const after = toRecord(event.after);
      const before = toRecord(event.before);
      const saleId = readString(after, "saleId") ?? readString(before, "saleId");
      const saleDetail = saleId ? saleDetails.get(saleId) : null;
      return {
        customerName: saleDetail?.customerName ?? null,
        total: readTotal(after) ?? readTotal(before),
        saleNumber: saleDetail?.saleNumber ?? null,
      };
    }
    return null;
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900">Historial</h1>
        <p className="mt-2 text-sm text-zinc-600">
          Movimientos operativos recientes de ventas, cobros, presupuestos y remitos.
        </p>
      </div>

      <div className="card space-y-3 p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
            Actividad
          </h2>
          <span className="text-xs text-zinc-500">
            {events.length} registros
          </span>
        </div>

        <div className="space-y-2">
          {events.length ? (
            events.map((event) => {
              const detailLine = buildDetailLine(resolveEventDetail(event));
              return (
                <article
                  key={event.id}
                  className="rounded-2xl border border-zinc-200/70 bg-white p-3 text-sm"
                >
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="pill border border-sky-200 bg-sky-50 px-2 py-0.5 text-[10px] font-semibold uppercase text-sky-700">
                          {ENTITY_LABELS[event.entityType] ?? event.entityType}
                        </span>
                        <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                          {ACTION_LABELS[event.action] ?? event.action}
                        </span>
                      </div>
                      <p className="text-zinc-900">{event.summary}</p>
                      {detailLine ? (
                        <p className="text-xs text-zinc-600">{detailLine}</p>
                      ) : null}
                      <p className="break-all text-xs text-zinc-500">
                        ID: {event.entityId}
                      </p>
                    </div>
                    <div className="shrink-0 text-left text-xs text-zinc-500 sm:text-right">
                      <p>
                        {event.actor?.name || event.actor?.email || "Sistema"}
                      </p>
                      <p>{event.createdAt.toLocaleString("es-AR")}</p>
                    </div>
                  </div>
                </article>
              );
            })
          ) : (
            <p className="text-sm text-zinc-500">Sin movimientos registrados.</p>
          )}
        </div>
      </div>
    </div>
  );
}
