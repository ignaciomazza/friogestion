"use client";

import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  BarChart,
  Bar,
  AreaChart,
  Area,
} from "recharts";

type DashboardChartPoint = {
  label: string;
  salesTotal: number;
  purchaseTotal: number;
  salesCount: number;
  purchaseCount: number;
};

type WeeklyChartPoint = {
  label: string;
  salesTotal: number;
  purchaseTotal: number;
  netTotal: number;
};

type DashboardChartsProps = {
  monthly: DashboardChartPoint[];
  weekly: WeeklyChartPoint[];
};

const tooltipStyle = {
  background: "rgba(24, 24, 27, 0.9)",
  border: "1px solid rgba(63, 63, 70, 0.6)",
  borderRadius: 12,
  color: "#f4f4f5",
};

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(value);

const formatNumber = (value: number) =>
  new Intl.NumberFormat("es-AR", {
    maximumFractionDigits: 0,
  }).format(value);

export type { DashboardChartPoint };

export type { WeeklyChartPoint };

export function DashboardCharts({ monthly, weekly }: DashboardChartsProps) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="rounded-2xl border border-zinc-200/70 bg-white/40 p-4 transition-[border-color,background-color,box-shadow] hover:border-zinc-300/80 hover:bg-white/60 hover:shadow-[0_8px_16px_-14px_rgba(82,82,91,0.35)]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-zinc-500">
              Facturacion
            </p>
            <p className="text-sm text-zinc-600">
              Ultimos 6 meses
            </p>
          </div>
          <div className="flex items-center gap-2 text-[11px] text-zinc-500">
            <span className="flex items-center gap-1">
              <span className="size-2 rounded-full bg-white" />
              Ventas
            </span>
            <span className="flex items-center gap-1">
              <span className="size-2 rounded-full bg-white" />
              Compras
            </span>
          </div>
        </div>
        <div className="mt-4 h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={monthly}
              margin={{ top: 10, right: 18, left: 0, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="4 4" stroke="#27272a" opacity={0.25} />
              <XAxis
                dataKey="label"
                tick={{ fill: "#71717a", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: "#71717a", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(value) => formatNumber(Number(value))}
              />
              <Tooltip
                contentStyle={tooltipStyle}
                labelStyle={{ color: "#f4f4f5" }}
                formatter={(value, name) => {
                  const label = name === "salesTotal" ? "Ventas" : "Compras";
                  return [formatCurrency(Number(value)), label];
                }}
              />
              <Line
                type="monotone"
                dataKey="salesTotal"
                stroke="#38bdf8"
                strokeWidth={2.5}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="purchaseTotal"
                stroke="#fb7185"
                strokeWidth={2.5}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="rounded-2xl border border-zinc-200/70 bg-white/40 p-4 transition-[border-color,background-color,box-shadow] hover:border-zinc-300/80 hover:bg-white/60 hover:shadow-[0_8px_16px_-14px_rgba(82,82,91,0.35)]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-zinc-500">
              Volumen
            </p>
            <p className="text-sm text-zinc-600">
              Operaciones por mes
            </p>
          </div>
          <div className="flex items-center gap-2 text-[11px] text-zinc-500">
            <span className="flex items-center gap-1">
              <span className="size-2 rounded-full bg-white" />
              Ventas
            </span>
            <span className="flex items-center gap-1">
              <span className="size-2 rounded-full bg-white" />
              Compras
            </span>
          </div>
        </div>
        <div className="mt-4 h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={monthly}
              margin={{ top: 10, right: 18, left: 0, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="4 4" stroke="#27272a" opacity={0.25} />
              <XAxis
                dataKey="label"
                tick={{ fill: "#71717a", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: "#71717a", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                allowDecimals={false}
              />
              <Tooltip
                contentStyle={tooltipStyle}
                labelStyle={{ color: "#f4f4f5" }}
                formatter={(value, name) => {
                  const label = name === "salesCount" ? "Ventas" : "Compras";
                  return [formatNumber(Number(value)), label];
                }}
              />
              <Bar dataKey="salesCount" fill="#34d399" radius={[10, 10, 0, 0]} />
              <Bar dataKey="purchaseCount" fill="#fbbf24" radius={[10, 10, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="rounded-2xl border border-zinc-200/70 bg-white/40 p-4 transition-[border-color,background-color,box-shadow] hover:border-zinc-300/80 hover:bg-white/60 hover:shadow-[0_8px_16px_-14px_rgba(82,82,91,0.35)] lg:col-span-2">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-zinc-500">
              Flujo neto
            </p>
            <p className="text-sm text-zinc-600">
              Ultimas 8 semanas
            </p>
          </div>
          <div className="text-[11px] text-zinc-500">Ventas - Compras</div>
        </div>
        <div className="mt-4 h-56">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={weekly}
              margin={{ top: 10, right: 18, left: 0, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="4 4" stroke="#27272a" opacity={0.25} />
              <XAxis
                dataKey="label"
                tick={{ fill: "#71717a", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: "#71717a", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(value) => formatNumber(Number(value))}
              />
              <Tooltip
                contentStyle={tooltipStyle}
                labelStyle={{ color: "#f4f4f5" }}
                formatter={(value) => [formatCurrency(Number(value)), "Neto"]}
              />
              <Area
                type="monotone"
                dataKey="netTotal"
                stroke="#0ea5e9"
                fill="#0ea5e9"
                fillOpacity={0.2}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
