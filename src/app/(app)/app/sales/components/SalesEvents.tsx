"use client";

import {
  SALE_EVENT_LABELS,
  SALE_EVENT_STYLES,
} from "../constants";
import type { SaleEventRow } from "../types";

type SalesEventsProps = {
  events: SaleEventRow[];
  showHeader?: boolean;
  withCard?: boolean;
};

export function SalesEvents({
  events,
  showHeader = true,
  withCard = true,
}: SalesEventsProps) {
  const containerClass = withCard ? "card space-y-6 p-6" : "space-y-6";

  return (
    <div className={containerClass}>
      {showHeader ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
            Actividad reciente
          </h3>
          <span className="text-xs text-zinc-500">{events.length} eventos</span>
        </div>
      ) : null}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="text-xs uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="py-3 pr-4">Venta</th>
              <th className="py-3 pr-4">Accion</th>
              <th className="py-3 pr-4">Usuario</th>
              <th className="py-3 pr-4">Fecha</th>
              <th className="py-3 pr-4">Nota</th>
            </tr>
          </thead>
          <tbody>
            {events.length ? (
              events.map((event) => (
                <tr
                  key={event.id}
                  className="border-t border-zinc-200/60 transition-colors hover:bg-white/60"
                >
                  <td className="py-3 pr-4 text-zinc-900">
                    {event.customerName}
                    <span className="ml-2 text-xs text-zinc-500">
                      {event.saleNumber ?? "Sin numero"}
                    </span>
                  </td>
                  <td className="py-3 pr-4">
                    <span
                      className={`rounded-full px-3 py-1.5 text-[11px] font-semibold uppercase backdrop-blur-xl ${
                        SALE_EVENT_STYLES[event.action] ??
                        "bg-zinc-500/10 text-zinc-700 border border-zinc-500/20"
                      }`}
                    >
                      {SALE_EVENT_LABELS[event.action] ?? event.action}
                    </span>
                  </td>
                  <td className="py-3 pr-4 text-zinc-600">
                    {event.actorName || event.actorEmail || "Sistema"}
                  </td>
                  <td className="py-3 pr-4 whitespace-nowrap text-zinc-600">
                    {new Date(event.createdAt).toLocaleString("es-AR")}
                  </td>
                  <td className="py-3 pr-4 text-zinc-600">
                    {event.note ?? "-"}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td className="py-4 text-sm text-zinc-500" colSpan={5}>
                  Sin actividad registrada.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
