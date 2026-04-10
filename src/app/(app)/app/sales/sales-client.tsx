"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Cog6ToothIcon } from "@/components/icons";
import { SalesEvents } from "./components/SalesEvents";
import { SalesRecentTable } from "./components/SalesRecentTable";
import { SalesStats } from "./components/SalesStats";
import type { SaleEventRow, SaleRow } from "./types";

const normalizeQuery = (value: string) => value.trim().toLowerCase();

const parseDateInput = (value: string) => {
  if (!value) return null;
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
};

const endOfDay = (value: Date) => {
  const date = new Date(value);
  date.setHours(23, 59, 59, 999);
  return date;
};

const formatDateInput = (value: Date) => {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

type SalesClientProps = {
  initialSales: SaleRow[];
  initialEvents: SaleEventRow[];
  role: string | null;
  paymentMethods: Array<{
    id: string;
    name: string;
    type: string;
    requiresAccount: boolean;
    requiresApproval: boolean;
    requiresDoubleCheck: boolean;
  }>;
  accounts: Array<{
    id: string;
    name: string;
    type: string;
    currencyCode: string;
  }>;
  currencies: Array<{
    id: string;
    code: string;
    name: string;
    symbol?: string | null;
    isDefault: boolean;
  }>;
  latestUsdRate: string | null;
};

export default function SalesClient({
  initialSales,
  initialEvents,
  role,
  paymentMethods,
  accounts,
  currencies,
  latestUsdRate,
}: SalesClientProps) {
  const [sales, setSales] = useState<SaleRow[]>(initialSales);
  const [events] = useState<SaleEventRow[]>(initialEvents);
  const [saleQuery, setSaleQuery] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sortOrder, setSortOrder] = useState("newest");
  const [quickRange, setQuickRange] = useState<string | null>(null);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [isActivityOpen, setIsActivityOpen] = useState(false);

  const canManage = useMemo(
    () => role === "OWNER" || role === "ADMIN",
    [role]
  );

  const loadSales = async () => {
    const res = await fetch("/api/sales", { cache: "no-store" });
    if (res.ok) {
      const data = (await res.json()) as SaleRow[];
      setSales(data);
    }
  };

  const totalSales = sales.length;
  const openBalanceSales = sales.filter(
    (sale) => Number(sale.balance ?? 0) > 0.005
  ).length;
  const totalRevenue = sales.reduce((totalValue, sale) => {
    if (!sale.total) return totalValue;
    const value = Number(sale.total);
    return Number.isFinite(value) ? totalValue + value : totalValue;
  }, 0);

  const filteredSales = useMemo(() => {
    const query = normalizeQuery(saleQuery);
    const from = parseDateInput(dateFrom);
    const to = dateTo ? endOfDay(parseDateInput(dateTo) ?? new Date()) : null;

    const filtered = sales.filter((sale) => {
      if (query) {
        const haystack = normalizeQuery(
          `${sale.customerName} ${sale.saleNumber ?? ""}`
        );
        if (!haystack.includes(query)) return false;
      }
      const occurredAt = new Date(sale.saleDate ?? sale.createdAt);
      if (from && occurredAt < from) return false;
      if (to && occurredAt > to) return false;
      return true;
    });

    filtered.sort((a, b) => {
      const aDate = new Date(a.saleDate ?? a.createdAt).getTime();
      const bDate = new Date(b.saleDate ?? b.createdAt).getTime();
      return sortOrder === "oldest" ? aDate - bDate : bDate - aDate;
    });

    return filtered;
  }, [
    dateFrom,
    dateTo,
    saleQuery,
    sales,
    sortOrder,
  ]);

  const applyQuickRange = (
    range: "month" | "quarter" | "semester" | "year" | "last30"
  ) => {
    if (quickRange === range) {
      setQuickRange(null);
      setDateFrom("");
      setDateTo("");
      return;
    }

    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    let start = new Date(now);
    let end = new Date(now);

    if (range === "month") {
      start = new Date(year, month, 1);
      end = new Date(year, month + 1, 0);
    }

    if (range === "quarter") {
      const quarterStart = Math.floor(month / 3) * 3;
      start = new Date(year, quarterStart, 1);
      end = new Date(year, quarterStart + 3, 0);
    }

    if (range === "semester") {
      const semesterStart = month < 6 ? 0 : 6;
      start = new Date(year, semesterStart, 1);
      end = new Date(year, semesterStart + 6, 0);
    }

    if (range === "year") {
      start = new Date(year, 0, 1);
      end = new Date(year, 11, 31);
    }

    if (range === "last30") {
      start = new Date(now);
      start.setDate(now.getDate() - 29);
      end = new Date(now);
    }

    setQuickRange(range);
    setDateFrom(formatDateInput(start));
    setDateTo(formatDateInput(end));
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900">
          Ventas
        </h1>
        <p className="mt-2 text-sm text-zinc-600">
          Ventas registradas y estado de cobros.
        </p>
      </div>

      <SalesStats
        totalSales={totalSales}
        openBalanceSales={openBalanceSales}
        totalRevenue={totalRevenue}
      />

      <div className="card space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="field-stack">
            <h3 className="section-title">Filtros de ventas</h3>
          </div>
          <button
            type="button"
            className={`btn btn-sky text-xs gap-1.5 ${
              showAdvancedFilters ? "ring-1 ring-sky-300/70" : ""
            }`}
            onClick={() => setShowAdvancedFilters((prev) => !prev)}
            aria-pressed={showAdvancedFilters}
          >
            <Cog6ToothIcon className="size-3.5" />
            Avanzados
          </button>
        </div>
        <div className="grid gap-3 lg:grid-cols-[2fr_1fr]">
          <label className="field-stack">
            <span className="input-label">Buscar</span>
            <input
              className="input w-full"
              value={saleQuery}
              onChange={(event) => setSaleQuery(event.target.value)}
              placeholder="Cliente o numero"
            />
          </label>
          <div className="flex h-full items-end justify-end text-right">
            <span className="pill border border-emerald-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-emerald-800">
              Con saldo: {openBalanceSales}
            </span>
          </div>
        </div>
        <AnimatePresence initial={false}>
          {showAdvancedFilters ? (
            <motion.div
              key="sales-advanced-filters"
              initial={{ height: 0, opacity: 0, y: -8 }}
              animate={{ height: "auto", opacity: 1, y: 0 }}
              exit={{ height: 0, opacity: 0, y: -8 }}
              transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
              className="reveal-motion"
            >
              <div className="space-y-3 rounded-2xl border border-dashed border-sky-200 bg-white/30 p-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="field-stack">
                    <span className="input-label">Desde</span>
                    <input
                      type="date"
                      className="input cursor-pointer text-xs"
                      value={dateFrom}
                      onChange={(event) => {
                        setDateFrom(event.target.value);
                        setQuickRange(null);
                      }}
                    />
                  </label>
                  <label className="field-stack">
                    <span className="input-label">Hasta</span>
                    <input
                      type="date"
                      className="input cursor-pointer text-xs"
                      value={dateTo}
                      onChange={(event) => {
                        setDateTo(event.target.value);
                        setQuickRange(null);
                      }}
                    />
                  </label>
                </div>
                <div className="space-y-2">
                  <p className="input-label">Rangos rapidos</p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className={`toggle-pill ${
                        quickRange === "month" ? "toggle-pill-active" : ""
                      }`}
                      onClick={() => applyQuickRange("month")}
                      aria-pressed={quickRange === "month"}
                    >
                      Mes actual
                    </button>
                    <button
                      type="button"
                      className={`toggle-pill ${
                        quickRange === "quarter" ? "toggle-pill-active" : ""
                      }`}
                      onClick={() => applyQuickRange("quarter")}
                      aria-pressed={quickRange === "quarter"}
                    >
                      Trimestre
                    </button>
                    <button
                      type="button"
                      className={`toggle-pill ${
                        quickRange === "semester" ? "toggle-pill-active" : ""
                      }`}
                      onClick={() => applyQuickRange("semester")}
                      aria-pressed={quickRange === "semester"}
                    >
                      Semestre
                    </button>
                    <button
                      type="button"
                      className={`toggle-pill ${
                        quickRange === "year" ? "toggle-pill-active" : ""
                      }`}
                      onClick={() => applyQuickRange("year")}
                      aria-pressed={quickRange === "year"}
                    >
                      Anual
                    </button>
                    <button
                      type="button"
                      className={`toggle-pill ${
                        quickRange === "last30" ? "toggle-pill-active" : ""
                      }`}
                      onClick={() => applyQuickRange("last30")}
                      aria-pressed={quickRange === "last30"}
                    >
                      Ultimos 30 dias
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>

      <SalesRecentTable
        sales={filteredSales}
        sortOrder={sortOrder}
        onSortOrderChange={setSortOrder}
        canManage={canManage}
        paymentMethods={paymentMethods}
        accounts={accounts}
        currencies={currencies}
        latestUsdRate={latestUsdRate}
        onReceiptsUpdated={loadSales}
      />

      {canManage ? (
        <div className="card p-0 border-dashed border-sky-200">
          <button
            type="button"
            className="flex w-full cursor-pointer items-center justify-between gap-3 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500"
            onClick={() => setIsActivityOpen((prev) => !prev)}
            aria-expanded={isActivityOpen}
          >
            <span>Actividad reciente · {events.length}</span>
            <span className="text-[10px] font-medium text-zinc-500">
              {isActivityOpen ? "Ocultar" : "Mostrar"}
            </span>
          </button>
          <AnimatePresence initial={false}>
            {isActivityOpen ? (
              <motion.div
                key="sales-activity-panel"
                initial={{ height: 0, opacity: 0, y: -8 }}
                animate={{ height: "auto", opacity: 1, y: 0 }}
                exit={{ height: 0, opacity: 0, y: -8 }}
                transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
                className="overflow-hidden"
              >
                <div className="border-t border-zinc-200/70 px-4 pb-4 pt-3">
                  <SalesEvents
                    events={events}
                    showHeader={false}
                    withCard={false}
                  />
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      ) : null}
    </div>
  );
}
