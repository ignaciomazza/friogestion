"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Cog6ToothIcon } from "@/components/icons";
import { DailyCashPanel } from "./components/DailyCashPanel";
import { NewSaleForm } from "./components/NewSaleForm";
import { SalesEvents } from "./components/SalesEvents";
import { SalesRecentTable } from "./components/SalesRecentTable";
import { SalesStats } from "./components/SalesStats";
import type { PriceListOption, SaleEventRow, SaleRow } from "./types";
import type { SalesStatsSummary } from "@/lib/sales/list";

const PAGE_SIZE = 25;
type SalesView = "daily" | "complete" | "list";

const formatDateInput = (value: Date) => {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

type SalesClientProps = {
  initialSales: SaleRow[];
  initialStats: SalesStatsSummary;
  initialTotalResults: number;
  initialNextOffset: number | null;
  initialHasMore: boolean;
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
  initialPriceLists: PriceListOption[];
};

export default function SalesClient({
  initialSales,
  initialStats,
  initialTotalResults,
  initialNextOffset,
  initialHasMore,
  initialEvents,
  role,
  paymentMethods,
  accounts,
  currencies,
  latestUsdRate,
  initialPriceLists,
}: SalesClientProps) {
  const [sales, setSales] = useState<SaleRow[]>(initialSales);
  const [stats, setStats] = useState<SalesStatsSummary>(initialStats);
  const [totalResults, setTotalResults] = useState(initialTotalResults);
  const [nextOffset, setNextOffset] = useState<number | null>(initialNextOffset);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [events] = useState<SaleEventRow[]>(initialEvents);
  const [saleQuery, setSaleQuery] = useState("");
  const [debouncedSaleQuery, setDebouncedSaleQuery] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sortOrder, setSortOrder] = useState("newest");
  const [quickRange, setQuickRange] = useState<string | null>(null);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [isActivityOpen, setIsActivityOpen] = useState(false);
  const [isLoadingList, setIsLoadingList] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [activeView, setActiveView] = useState<SalesView>("daily");
  const didMountRef = useRef(false);

  const canManage = useMemo(
    () => role === "OWNER" || role === "ADMIN" || role === "SALES",
    [role]
  );
  const canViewActivity = useMemo(
    () => role === "OWNER" || role === "ADMIN",
    [role],
  );

  const loadSales = useCallback(
    async ({
      offset,
      append,
      limit = PAGE_SIZE,
    }: {
      offset: number;
      append: boolean;
      limit?: number;
    }) => {
      if (append) {
        setIsLoadingMore(true);
      } else {
        setIsLoadingList(true);
      }

      const params = new URLSearchParams();
      params.set("limit", String(limit));
      params.set("offset", String(offset));
      params.set("sort", sortOrder);
      if (debouncedSaleQuery.trim()) {
        params.set("q", debouncedSaleQuery.trim());
      }
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);

      try {
        const res = await fetch(`/api/sales?${params.toString()}`, {
          cache: "no-store",
        });
        if (!res.ok) return;
        const data = (await res.json()) as {
          items: SaleRow[];
          total: number;
          nextOffset: number | null;
          hasMore: boolean;
          stats: SalesStatsSummary;
        };
        setSales((previous) =>
          append ? [...previous, ...data.items] : data.items,
        );
        setStats(data.stats);
        setTotalResults(data.total);
        setNextOffset(data.nextOffset);
        setHasMore(data.hasMore);
      } finally {
        setIsLoadingList(false);
        setIsLoadingMore(false);
      }
    },
    [dateFrom, dateTo, debouncedSaleQuery, sortOrder],
  );

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDebouncedSaleQuery(saleQuery);
    }, 250);

    return () => window.clearTimeout(timeoutId);
  }, [saleQuery]);

  useEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true;
      return;
    }

    loadSales({ offset: 0, append: false }).catch(() => undefined);
  }, [loadSales]);

  const reloadLoadedSales = async () => {
    await loadSales({
      offset: 0,
      append: false,
      limit: Math.max(sales.length, PAGE_SIZE),
    });
  };

  const handleLoadMore = async () => {
    if (nextOffset === null || isLoadingMore) return;
    await loadSales({ offset: nextOffset, append: true });
  };

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

      <div className="grid w-full grid-cols-3 gap-1 rounded-2xl border border-zinc-200 bg-white p-1">
        {[
          { id: "daily" as const, label: "Caja diaria" },
          { id: "complete" as const, label: "Venta completa" },
          { id: "list" as const, label: "Lista de ventas" },
        ].map((view) => (
          <button
            key={view.id}
            type="button"
            className={`flex min-w-0 items-center justify-center rounded-xl px-2 py-2 text-center text-xs font-semibold transition sm:text-sm ${
              activeView === view.id
                ? "bg-sky-100 text-sky-900"
                : "text-zinc-500 hover:bg-zinc-50 hover:text-zinc-900"
            }`}
            onClick={() => setActiveView(view.id)}
            aria-pressed={activeView === view.id}
          >
            {view.label}
          </button>
        ))}
      </div>

      {activeView === "daily" && canManage ? (
        <DailyCashPanel
          paymentMethods={paymentMethods}
          accounts={accounts}
          currencies={currencies}
          latestUsdRate={latestUsdRate}
          onSalesChanged={reloadLoadedSales}
        />
      ) : null}

      {activeView === "complete" && canManage ? (
        <NewSaleForm
          paymentMethods={paymentMethods}
          accounts={accounts}
          currencies={currencies}
          latestUsdRate={latestUsdRate}
          priceLists={initialPriceLists}
          onSaleCreated={reloadLoadedSales}
        />
      ) : null}

      {activeView === "list" ? (
        <>
      {canViewActivity ? (
        <SalesStats
          totalSales={stats.totalSales}
          openBalanceSales={stats.openBalanceSales}
          totalRevenue={stats.totalRevenue}
        />
      ) : null}

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
              Con saldo: {stats.openBalanceSales}
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
        sales={sales}
        totalResults={totalResults}
        sortOrder={sortOrder}
        onSortOrderChange={setSortOrder}
        isLoadingList={isLoadingList}
        hasMore={hasMore}
        isLoadingMore={isLoadingMore}
        onLoadMore={handleLoadMore}
        canManage={canManage}
        paymentMethods={paymentMethods}
        accounts={accounts}
        currencies={currencies}
        latestUsdRate={latestUsdRate}
        onReceiptsUpdated={reloadLoadedSales}
      />
        </>
      ) : null}

      {activeView === "list" && canViewActivity ? (
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
