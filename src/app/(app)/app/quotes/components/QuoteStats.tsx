"use client";

import { formatCurrencyARS } from "@/lib/format";

type QuoteStatsProps = {
  totalQuotes: number;
  sentQuotes: number;
  acceptedQuotes: number;
  totalEstimated: number;
};

export function QuoteStats({
  totalQuotes,
  sentQuotes,
  acceptedQuotes,
  totalEstimated,
}: QuoteStatsProps) {
  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <div className="card border !border-sky-200 p-3 !bg-white">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-sky-700">
              Presupuestos
            </span>
            <p className="text-base font-semibold text-zinc-900">{totalQuotes}</p>
          </div>
        </div>
        <div className="card border !border-dashed !border-amber-200 p-3 !bg-white">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-amber-700">Enviados</span>
            <p className="text-base font-semibold text-zinc-900">{sentQuotes}</p>
          </div>
        </div>
        <div className="card border !border-dashed !border-emerald-200 p-3 !bg-white">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-emerald-700">
              Aceptados
            </span>
            <p className="text-base font-semibold text-zinc-900">
              {acceptedQuotes}
            </p>
          </div>
        </div>
        <div className="card border !border-indigo-200 p-3 !bg-white">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-indigo-700">
              Total estimado
            </span>
            <p className="text-base font-semibold text-zinc-900">
              {formatCurrencyARS(totalEstimated)}
            </p>
          </div>
        </div>
    </div>
  );
}
