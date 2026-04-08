"use client";

import { useMemo, useState, type ReactNode } from "react";
import clsx from "clsx";
import {
  BuildingOffice2Icon,
  CubeIcon,
  CurrencyDollarIcon,
  ShoppingBagIcon,
  ShoppingCartIcon,
  UsersIcon,
} from "@/components/icons";
import { formatCurrencyARS } from "@/lib/format";

type Counts = {
  productCount: number;
  customerCount: number;
  supplierCount: number;
  purchaseCount: number;
  saleCount: number;
  newCustomers: number;
  newSuppliers: number;
};

type SalesRecord = {
  id: string;
  name: string;
  total: number | null;
  occurredAt: string;
};

type PurchaseRecord = {
  id: string;
  name: string;
  total: number | null;
  occurredAt: string;
};

type SaleItemRecord = {
  productName: string;
  total: number;
  occurredAt: string;
};

type DashboardViewProps = {
  latestRate: { rate: number; asOf: string } | null;
  dataStart: string;
  counts: Counts;
  sales: SalesRecord[];
  purchases: PurchaseRecord[];
  saleItems: SaleItemRecord[];
};

type SectionId = "all" | "panorama" | "actividad" | "relaciones" | "productos";

type RangeId = "month" | "quarter" | "semester" | "year" | "custom";

type ParsedRecord = {
  id: string;
  name: string;
  total: number;
  hasTotal: boolean;
  occurredAt: Date;
};

type ParsedItem = {
  productName: string;
  total: number;
  occurredAt: Date;
};

type DateRange = { start: Date; end: Date };

type TopEntry = { name: string; total: number };

type MetricCardProps = {
  icon?: ReactNode;
  label: string;
  value: string | number;
  note?: string;
};

const sectionOptions: Array<{ id: SectionId; label: string }> = [
  { id: "all", label: "Todo" },
  { id: "panorama", label: "Resumen" },
  { id: "actividad", label: "Actividad" },
  { id: "relaciones", label: "Clientes" },
  { id: "productos", label: "Productos" },
];

const rangeOptions: Array<{ id: RangeId; label: string }> = [
  { id: "month", label: "Mes" },
  { id: "quarter", label: "Trimestre" },
  { id: "semester", label: "Semestre" },
  { id: "year", label: "Anual" },
  { id: "custom", label: "Personalizado" },
];

const toInputDate = (value: Date) => {
  const year = value.getFullYear();
  const month = `${value.getMonth() + 1}`.padStart(2, "0");
  const day = `${value.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const parseInputDate = (value: string) => {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
};

const endOfDay = (value: Date) => {
  const date = new Date(value);
  date.setHours(23, 59, 59, 999);
  return date;
};

const clampDate = (value: Date, min: Date, max: Date) => {
  if (value < min) return min;
  if (value > max) return max;
  return value;
};

const buildTopList = (items: Array<{ name: string; total: number }>) => {
  const totals = new Map<string, number>();

  for (const item of items) {
    if (!item.name) continue;
    totals.set(item.name, (totals.get(item.name) ?? 0) + item.total);
  }

  return [...totals.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, total]) => ({ name, total }));
};

function MetricCard({ icon, label, value, note }: MetricCardProps) {
  return (
    <div className="rounded-xl border border-zinc-200/70 bg-white/60 p-3">
      <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-zinc-500">
        {icon}
        <span>{label}</span>
      </div>
      <p className="mt-1.5 text-lg font-semibold text-zinc-900">{value}</p>
      {note ? <p className="mt-0.5 text-xs text-zinc-500">{note}</p> : null}
    </div>
  );
}

export function DashboardView({
  latestRate,
  dataStart,
  counts,
  sales,
  purchases,
  saleItems,
}: DashboardViewProps) {
  const now = useMemo(() => new Date(), []);
  const dataStartDate = useMemo(() => parseInputDate(dataStart), [dataStart]);

  const [activeSection, setActiveSection] = useState<SectionId>("panorama");
  const [range, setRange] = useState<RangeId>("month");
  const [customRange, setCustomRange] = useState({ start: "", end: "" });

  const handleRangeChange = (next: RangeId) => {
    setRange(next);

    if (next === "custom") {
      const fallbackEnd = toInputDate(now);
      const fallbackStart = toInputDate(
        new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30),
      );

      setCustomRange((current) => ({
        start: current.start || fallbackStart,
        end: current.end || fallbackEnd,
      }));
    }
  };

  const rangeDates = useMemo<DateRange>(() => {
    const maxDate = endOfDay(now);
    const minDate = dataStartDate;

    let start: Date;
    let end: Date;

    if (range === "custom") {
      const rawStart = customRange.start ? parseInputDate(customRange.start) : minDate;
      const rawEnd = customRange.end ? parseInputDate(customRange.end) : maxDate;
      start = rawStart;
      end = endOfDay(rawEnd);
    } else {
      const offsets: Record<Exclude<RangeId, "custom">, number> = {
        month: 0,
        quarter: 2,
        semester: 5,
        year: 11,
      };
      start = new Date(now.getFullYear(), now.getMonth() - offsets[range], 1);
      end = endOfDay(now);
    }

    const clampedStart = clampDate(start, minDate, maxDate);
    const clampedEnd = clampDate(end, clampedStart, maxDate);

    return { start: clampedStart, end: clampedEnd };
  }, [customRange, dataStartDate, now, range]);

  const parsedSales = useMemo<ParsedRecord[]>(
    () =>
      sales.map((sale) => ({
        id: sale.id,
        name: sale.name,
        total: sale.total ?? 0,
        hasTotal: sale.total !== null,
        occurredAt: new Date(sale.occurredAt),
      })),
    [sales],
  );

  const parsedPurchases = useMemo<ParsedRecord[]>(
    () =>
      purchases.map((purchase) => ({
        id: purchase.id,
        name: purchase.name,
        total: purchase.total ?? 0,
        hasTotal: purchase.total !== null,
        occurredAt: new Date(purchase.occurredAt),
      })),
    [purchases],
  );

  const parsedItems = useMemo<ParsedItem[]>(
    () =>
      saleItems.map((item) => ({
        productName: item.productName,
        total: item.total,
        occurredAt: new Date(item.occurredAt),
      })),
    [saleItems],
  );

  const salesFiltered = useMemo(
    () =>
      parsedSales.filter(
        (sale) => sale.occurredAt >= rangeDates.start && sale.occurredAt <= rangeDates.end,
      ),
    [parsedSales, rangeDates],
  );

  const purchasesFiltered = useMemo(
    () =>
      parsedPurchases.filter(
        (purchase) =>
          purchase.occurredAt >= rangeDates.start &&
          purchase.occurredAt <= rangeDates.end,
      ),
    [parsedPurchases, rangeDates],
  );

  const itemsFiltered = useMemo(
    () =>
      parsedItems.filter(
        (item) => item.occurredAt >= rangeDates.start && item.occurredAt <= rangeDates.end,
      ),
    [parsedItems, rangeDates],
  );

  const summary = useMemo(() => {
    const salesTotal = salesFiltered.reduce((sum, sale) => sum + sale.total, 0);
    const purchasesTotal = purchasesFiltered.reduce(
      (sum, purchase) => sum + purchase.total,
      0,
    );

    return {
      salesTotal,
      purchasesTotal,
      salesCount: salesFiltered.length,
      purchasesCount: purchasesFiltered.length,
      netTotal: salesTotal - purchasesTotal,
    };
  }, [purchasesFiltered, salesFiltered]);

  const recentSales = useMemo(
    () =>
      [...salesFiltered]
        .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())
        .slice(0, 5),
    [salesFiltered],
  );

  const recentPurchases = useMemo(
    () =>
      [...purchasesFiltered]
        .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())
        .slice(0, 5),
    [purchasesFiltered],
  );

  const topCustomers = useMemo<TopEntry[]>(
    () => buildTopList(salesFiltered.map((sale) => ({ name: sale.name, total: sale.total }))),
    [salesFiltered],
  );

  const topSuppliers = useMemo<TopEntry[]>(
    () =>
      buildTopList(
        purchasesFiltered.map((purchase) => ({
          name: purchase.name,
          total: purchase.total,
        })),
      ),
    [purchasesFiltered],
  );

  const topProducts = useMemo<TopEntry[]>(
    () =>
      buildTopList(
        itemsFiltered.map((item) => ({ name: item.productName, total: item.total })),
      ),
    [itemsFiltered],
  );

  const showSection = (id: SectionId) => activeSection === "all" || activeSection === id;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-zinc-900">Tablero general</h1>
        <p className="text-sm text-zinc-500">Resumen simple del estado actual.</p>
      </div>

      <div className="rounded-2xl border border-zinc-200/70 bg-white/55 p-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1.5">
            {sectionOptions.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => setActiveSection(option.id)}
                className={clsx(
                  "cursor-pointer rounded-full border px-3 py-1.5 text-xs font-medium uppercase tracking-wide transition",
                  activeSection === option.id
                    ? "border-sky-200 text-sky-700"
                    : "border-transparent text-zinc-600 hover:border-zinc-300/70",
                )}
                aria-pressed={activeSection === option.id}
              >
                {option.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <label
              htmlFor="dashboard-range"
              className="text-xs uppercase tracking-wide text-zinc-500"
            >
              Periodo
            </label>
            <select
              id="dashboard-range"
              className="input w-40 !rounded-xl !bg-white/70 !px-3 !py-1.5 !text-xs !shadow-none"
              value={range}
              onChange={(event) => handleRangeChange(event.target.value as RangeId)}
            >
              {rangeOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
            {range === "custom" ? (
              <>
                <input
                  type="date"
                  className="input w-36 !rounded-xl !px-3 !py-1.5 !text-xs"
                  min={toInputDate(dataStartDate)}
                  max={toInputDate(now)}
                  value={customRange.start}
                  onChange={(event) =>
                    setCustomRange((current) => ({
                      ...current,
                      start: event.target.value,
                    }))
                  }
                />
                <input
                  type="date"
                  className="input w-36 !rounded-xl !px-3 !py-1.5 !text-xs"
                  min={toInputDate(dataStartDate)}
                  max={toInputDate(now)}
                  value={customRange.end}
                  onChange={(event) =>
                    setCustomRange((current) => ({
                      ...current,
                      end: event.target.value,
                    }))
                  }
                />
              </>
            ) : null}
          </div>
        </div>
      </div>

      {showSection("panorama") ? (
        <section className="rounded-2xl border border-zinc-200/70 bg-white/50 p-4">
          <h2 className="text-sm font-semibold text-zinc-900">Resumen</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <MetricCard
              icon={<CurrencyDollarIcon className="size-4 text-sky-600" />}
              label="USD"
              value={latestRate ? formatCurrencyARS(latestRate.rate) : "Sin datos"}
              note={latestRate ? "Base USD / ARS" : "Configurar cotizacion"}
            />
            <MetricCard
              icon={<ShoppingCartIcon className="size-4 text-emerald-600" />}
              label="Ventas"
              value={formatCurrencyARS(summary.salesTotal)}
              note={`${summary.salesCount} operaciones en rango`}
            />
            <MetricCard
              icon={<ShoppingBagIcon className="size-4 text-rose-600" />}
              label="Compras"
              value={formatCurrencyARS(summary.purchasesTotal)}
              note={`${summary.purchasesCount} operaciones en rango`}
            />
            <MetricCard
              icon={<CurrencyDollarIcon className="size-4 text-indigo-600" />}
              label="Balance"
              value={formatCurrencyARS(summary.netTotal)}
              note="Ventas - compras"
            />
            <MetricCard
              icon={<UsersIcon className="size-4 text-cyan-600" />}
              label="Clientes"
              value={counts.customerCount}
              note={`${counts.newCustomers} nuevos en 30 dias`}
            />
            <MetricCard
              icon={<CubeIcon className="size-4 text-amber-600" />}
              label="Productos"
              value={counts.productCount}
              note="Catalogo activo"
            />
          </div>
        </section>
      ) : null}

      {showSection("actividad") ? (
        <section className="rounded-2xl border border-zinc-200/70 bg-white/50 p-4">
          <h2 className="text-sm font-semibold text-zinc-900">Actividad reciente</h2>
          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            <div className="rounded-xl border border-zinc-200/70 bg-white/60 p-3">
              <p className="text-xs uppercase tracking-wide text-zinc-500">Ultimas ventas</p>
              <ul className="mt-2 space-y-2 text-sm">
                {recentSales.length ? (
                  recentSales.map((sale) => (
                    <li key={sale.id} className="flex items-center justify-between gap-2">
                      <span className="truncate text-zinc-700">{sale.name}</span>
                      <span className="shrink-0 text-xs text-zinc-500">
                        {sale.hasTotal ? formatCurrencyARS(sale.total) : "-"}
                      </span>
                    </li>
                  ))
                ) : (
                  <li className="text-zinc-500">Sin ventas en este rango.</li>
                )}
              </ul>
            </div>
            <div className="rounded-xl border border-zinc-200/70 bg-white/60 p-3">
              <p className="text-xs uppercase tracking-wide text-zinc-500">Ultimas compras</p>
              <ul className="mt-2 space-y-2 text-sm">
                {recentPurchases.length ? (
                  recentPurchases.map((purchase) => (
                    <li key={purchase.id} className="flex items-center justify-between gap-2">
                      <span className="truncate text-zinc-700">{purchase.name}</span>
                      <span className="shrink-0 text-xs text-zinc-500">
                        {purchase.hasTotal ? formatCurrencyARS(purchase.total) : "-"}
                      </span>
                    </li>
                  ))
                ) : (
                  <li className="text-zinc-500">Sin compras en este rango.</li>
                )}
              </ul>
            </div>
          </div>
        </section>
      ) : null}

      {showSection("relaciones") ? (
        <section className="rounded-2xl border border-zinc-200/70 bg-white/50 p-4">
          <h2 className="text-sm font-semibold text-zinc-900">Clientes y proveedores</h2>
          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            <div className="rounded-xl border border-zinc-200/70 bg-white/60 p-3">
              <p className="text-xs uppercase tracking-wide text-zinc-500">Top clientes</p>
              <ul className="mt-2 space-y-2 text-sm">
                {topCustomers.length ? (
                  topCustomers.map((customer) => (
                    <li key={customer.name} className="flex items-center justify-between gap-2">
                      <span className="truncate text-zinc-700">{customer.name}</span>
                      <span className="shrink-0 text-xs text-zinc-500">
                        {formatCurrencyARS(customer.total)}
                      </span>
                    </li>
                  ))
                ) : (
                  <li className="text-zinc-500">Sin datos suficientes.</li>
                )}
              </ul>
            </div>
            <div className="rounded-xl border border-zinc-200/70 bg-white/60 p-3">
              <p className="text-xs uppercase tracking-wide text-zinc-500">Top proveedores</p>
              <ul className="mt-2 space-y-2 text-sm">
                {topSuppliers.length ? (
                  topSuppliers.map((supplier) => (
                    <li key={supplier.name} className="flex items-center justify-between gap-2">
                      <span className="truncate text-zinc-700">{supplier.name}</span>
                      <span className="shrink-0 text-xs text-zinc-500">
                        {formatCurrencyARS(supplier.total)}
                      </span>
                    </li>
                  ))
                ) : (
                  <li className="text-zinc-500">Sin datos suficientes.</li>
                )}
              </ul>
            </div>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <MetricCard
              icon={<UsersIcon className="size-4 text-cyan-600" />}
              label="Clientes"
              value={counts.customerCount}
              note={`${counts.newCustomers} nuevos en 30 dias`}
            />
            <MetricCard
              icon={<BuildingOffice2Icon className="size-4 text-emerald-600" />}
              label="Proveedores"
              value={counts.supplierCount}
              note={`${counts.newSuppliers} nuevos en 30 dias`}
            />
          </div>
        </section>
      ) : null}

      {showSection("productos") ? (
        <section className="rounded-2xl border border-zinc-200/70 bg-white/50 p-4">
          <h2 className="text-sm font-semibold text-zinc-900">Productos</h2>
          <div className="mt-3 rounded-xl border border-zinc-200/70 bg-white/60 p-3">
            <p className="text-xs uppercase tracking-wide text-zinc-500">Top productos por ventas</p>
            <ul className="mt-2 space-y-2 text-sm">
              {topProducts.length ? (
                topProducts.map((product, index) => (
                  <li key={product.name} className="flex items-center justify-between gap-2">
                    <span className="truncate text-zinc-700">
                      {index + 1}. {product.name}
                    </span>
                    <span className="shrink-0 text-xs text-zinc-500">
                      {formatCurrencyARS(product.total)}
                    </span>
                  </li>
                ))
              ) : (
                <li className="text-zinc-500">Sin datos suficientes.</li>
              )}
            </ul>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <MetricCard
              icon={<CubeIcon className="size-4 text-amber-600" />}
              label="Productos activos"
              value={counts.productCount}
            />
            <MetricCard
              icon={<ShoppingCartIcon className="size-4 text-sky-600" />}
              label="Ventas totales"
              value={counts.saleCount}
              note="Acumulado general"
            />
          </div>
        </section>
      ) : null}
    </div>
  );
}
