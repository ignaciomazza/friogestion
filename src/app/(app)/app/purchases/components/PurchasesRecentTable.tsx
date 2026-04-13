"use client";

import { formatCurrencyARS } from "@/lib/format";
import {
  PURCHASE_ARCA_STATUS_LABELS,
  PURCHASE_ARCA_STATUS_STYLES,
  PURCHASE_STATUS_LABELS,
  PURCHASE_STATUS_STYLES,
  PURCHASE_PAYMENT_STATUS_LABELS,
  PURCHASE_PAYMENT_STATUS_STYLES,
} from "../constants";
import type { PurchaseRow } from "../types";

type PurchasesRecentTableProps = {
  purchases: PurchaseRow[];
  sortOrder: string;
  onSortOrderChange: (value: string) => void;
  onRevalidate: (purchaseId: string) => void;
  revalidatingId: string | null;
};

export function PurchasesRecentTable({
  purchases,
  sortOrder,
  onSortOrderChange,
  onRevalidate,
  revalidatingId,
}: PurchasesRecentTableProps) {
  return (
    <div className="card space-y-5 p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
          Compras recientes
        </h3>
        <div className="flex flex-wrap items-center gap-3">
          {purchases.length === 0 ? (
            <span className="pill border border-emerald-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-emerald-800">
              0 resultados
            </span>
          ) : (
            <span className="text-xs text-zinc-500">
              {purchases.length} resultados
            </span>
          )}
          <select
            className="input cursor-pointer text-xs"
            value={sortOrder}
            onChange={(event) => onSortOrderChange(event.target.value)}
            aria-label="Ordenar compras"
          >
            <option value="newest">Mas recientes</option>
            <option value="oldest">Mas antiguas</option>
          </select>
        </div>
      </div>
      <div className="table-scroll">
        <table className="w-full text-left text-xs">
          <thead className="text-[11px] uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="py-2 pr-4">Factura</th>
              <th className="py-2 pr-4">Proveedor</th>
              <th className="py-2 pr-4">Fecha</th>
              <th className="py-2 pr-4">Estado</th>
              <th className="py-2 pr-4 text-right">Pago</th>
              <th className="py-2 pr-4">Total</th>
              <th className="py-2 pr-4 text-right">ARCA</th>
            </tr>
          </thead>
          <tbody>
            {purchases.length ? (
              purchases.map((purchase) => {
                const date = purchase.invoiceDate ?? purchase.createdAt ?? null;
                const total = Number(purchase.total ?? 0);
                const paid = Number(purchase.paidTotal ?? 0);
                const storedBalance = Number(purchase.balance ?? 0);
                const balance =
                  storedBalance > 0 ? storedBalance : Math.max(total - paid, 0);
                return (
                  <tr
                    key={purchase.id}
                    className="border-t border-zinc-200/60 transition-colors hover:bg-white/60"
                  >
                    <td className="py-3 pr-4 whitespace-nowrap text-zinc-600">
                      {purchase.invoiceNumber ?? "-"}
                    </td>
                    <td className="py-3 pr-4 text-zinc-900">
                      {purchase.supplierName}
                    </td>
                    <td className="py-3 pr-4 whitespace-nowrap text-zinc-600">
                      {date
                        ? new Date(date).toLocaleDateString("es-AR")
                        : "-"}
                    </td>
                    <td className="py-3 pr-4">
                      <span
                        className={`rounded-full px-3 py-1.5 text-[11px] font-semibold uppercase backdrop-blur-xl ${
                          PURCHASE_STATUS_STYLES[purchase.status] ??
                          "bg-zinc-500/10 text-zinc-700 border border-zinc-500/20"
                        }`}
                      >
                        {PURCHASE_STATUS_LABELS[purchase.status] ??
                          purchase.status}
                      </span>
                    </td>
                    <td className="py-3 pr-4">
                      <div className="flex flex-col items-end gap-1">
                        <span
                          className={`rounded-full px-3 py-1.5 text-[11px] font-semibold uppercase backdrop-blur-xl ${
                            PURCHASE_PAYMENT_STATUS_STYLES[
                              purchase.paymentStatus ?? "UNPAID"
                            ] ??
                            "bg-zinc-500/10 text-zinc-700 border border-zinc-500/20"
                          }`}
                        >
                          {PURCHASE_PAYMENT_STATUS_LABELS[
                            purchase.paymentStatus ?? "UNPAID"
                          ] ?? purchase.paymentStatus ?? "UNPAID"}
                        </span>
                        <span className="text-[11px] text-zinc-500">
                          Saldo {formatCurrencyARS(balance)}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 pr-4 text-zinc-900">
                      {purchase.total ? formatCurrencyARS(purchase.total) : "-"}
                      <span className="ml-2 text-[11px] text-zinc-500">
                        {purchase.itemsCount} items
                      </span>
                    </td>
                    <td className="py-3 pr-4">
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        <span
                          className={`rounded-full px-3 py-1.5 text-[11px] font-semibold uppercase backdrop-blur-xl ${
                            PURCHASE_ARCA_STATUS_STYLES[
                              purchase.arcaValidationStatus ?? "PENDING"
                            ] ??
                            "bg-zinc-500/10 text-zinc-700 border border-zinc-500/20"
                          }`}
                          title={purchase.arcaValidationMessage ?? undefined}
                        >
                          {PURCHASE_ARCA_STATUS_LABELS[
                            purchase.arcaValidationStatus ?? "PENDING"
                          ] ?? purchase.arcaValidationStatus ?? "PENDING"}
                        </span>
                        <button
                          type="button"
                          className="btn text-[11px]"
                          onClick={() => onRevalidate(purchase.id)}
                          disabled={revalidatingId === purchase.id}
                        >
                          {revalidatingId === purchase.id
                            ? "Revalidando..."
                            : "Revalidar"}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td className="py-3 text-sm text-zinc-500" colSpan={7}>
                  Sin compras por ahora.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
