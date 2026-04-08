"use client";

import { formatCurrencyARS } from "@/lib/format";

type PurchaseStatsProps = {
  totalPurchases: number;
  totalSpent: number;
  totalItems: number;
  uniqueSuppliers: number;
};

export function PurchaseStats({
  totalPurchases,
  totalSpent,
  totalItems,
  uniqueSuppliers,
}: PurchaseStatsProps) {
  return (
    <div className="table-scroll pb-1">
      <div className="grid min-w-[760px] grid-cols-4 gap-2">
        <div className="card border !border-sky-200 p-3 !bg-white">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-sky-700">Compras</span>
            <p className="text-base font-semibold text-zinc-900">
              {totalPurchases}
            </p>
          </div>
        </div>
        <div className="card border !border-dashed !border-emerald-200 p-3 !bg-white">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-emerald-700">
              Total gastado
            </span>
            <p className="text-base font-semibold text-zinc-900">
              {formatCurrencyARS(totalSpent)}
            </p>
          </div>
        </div>
        <div className="card border !border-dashed !border-amber-200 p-3 !bg-white">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-amber-700">Items</span>
            <p className="text-base font-semibold text-zinc-900">{totalItems}</p>
          </div>
        </div>
        <div className="card border !border-rose-200 p-3 !bg-white">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-rose-700">
              Proveedores
            </span>
            <p className="text-base font-semibold text-zinc-900">
              {uniqueSuppliers}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
