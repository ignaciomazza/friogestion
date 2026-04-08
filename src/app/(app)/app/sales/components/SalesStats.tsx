"use client";

import { formatCurrencyARS } from "@/lib/format";

type SalesStatsProps = {
  totalSales: number;
  openBalanceSales: number;
  totalRevenue: number;
};

export function SalesStats({
  totalSales,
  openBalanceSales,
  totalRevenue,
}: SalesStatsProps) {
  const closedSales = Math.max(totalSales - openBalanceSales, 0);

  return (
    <div className="table-scroll pb-1">
      <div className="grid min-w-[760px] grid-cols-4 gap-2">
        <div className="card border border-sky-200 p-3 !bg-white">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-sky-700">Ventas</span>
            <p className="text-base font-semibold text-zinc-900">{totalSales}</p>
          </div>
        </div>
        <div className="card border border-dashed border-emerald-200 p-3 !bg-white">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-emerald-700">
              Pendientes
            </span>
            <p className="text-base font-semibold text-zinc-900">
              {openBalanceSales}
            </p>
          </div>
        </div>
        <div className="card border border-dashed border-sky-200 p-3 !bg-white">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-sky-700">
              Cobros cerrados
            </span>
            <p className="text-base font-semibold text-zinc-900">
              {closedSales}
            </p>
          </div>
        </div>
        <div className="card border border-emerald-200 p-3 !bg-white">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-emerald-700">
              Total vendido
            </span>
            <p className="text-base font-semibold text-zinc-900">
              {formatCurrencyARS(totalRevenue)}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
