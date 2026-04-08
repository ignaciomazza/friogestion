"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { formatCurrencyARS } from "@/lib/format";
import { normalizeDecimalInput } from "@/lib/input-format";
import { canManageAdjustments } from "@/lib/auth/rbac";

type AccountRow = {
  id: string;
  displayName: string;
  taxId: string | null;
  debit: string;
  credit: string;
  balance: string;
  aging0: string;
  aging30: string;
  aging60: string;
  aging90: string;
};

type EntryRow = {
  id: string;
  occurredAt: string;
  direction: string;
  sourceType: string;
  amount: string;
  note: string | null;
  reference: string | null;
};

const DIRECTION_LABELS: Record<string, string> = {
  DEBIT: "Debe",
  CREDIT: "Haber",
};

const SOURCE_LABELS: Record<string, string> = {
  SALE: "Venta",
  RECEIPT: "Cobro",
  PURCHASE: "Compra",
  SUPPLIER_PAYMENT: "Pago proveedor",
  ADJUSTMENT: "Ajuste",
};

export default function CurrentAccountsPage() {
  const [tab, setTab] = useState<"customer" | "supplier">("customer");
  const [rows, setRows] = useState<AccountRow[]>([]);
  const [entries, setEntries] = useState<EntryRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [loadingEntries, setLoadingEntries] = useState(false);
  const [query, setQuery] = useState("");
  const [balanceFilter, setBalanceFilter] = useState("all");
  const [minBalance, setMinBalance] = useState("");
  const [maxBalance, setMaxBalance] = useState("");
  const [entryFrom, setEntryFrom] = useState("");
  const [entryTo, setEntryTo] = useState("");
  const [entrySource, setEntrySource] = useState("ALL");
  const [adjustmentDate, setAdjustmentDate] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [adjustmentDirection, setAdjustmentDirection] = useState<"DEBIT" | "CREDIT">(
    "DEBIT"
  );
  const [adjustmentAmount, setAdjustmentAmount] = useState("");
  const [adjustmentNote, setAdjustmentNote] = useState("");
  const [adjustmentStatus, setAdjustmentStatus] = useState<string | null>(null);
  const [isSubmittingAdjustment, setIsSubmittingAdjustment] = useState(false);
  const [role, setRole] = useState<string | null>(null);
  const [roleLoaded, setRoleLoaded] = useState(false);

  const loadSummary = useCallback(async () => {
    setStatus(null);
    try {
      const params = new URLSearchParams({ type: tab });
      if (query.trim()) params.set("q", query.trim());
      if (balanceFilter !== "all") params.set("balance", balanceFilter);
      if (minBalance) params.set("minBalance", minBalance);
      if (maxBalance) params.set("maxBalance", maxBalance);
      const res = await fetch(`/api/current-accounts?${params.toString()}`, {
        cache: "no-store",
      });
      if (!res.ok) {
        setStatus("No se pudo cargar la cuenta corriente");
        return;
      }
      const data = (await res.json()) as AccountRow[];
      setRows(data);
      if (selectedId && !data.some((row) => row.id === selectedId)) {
        setSelectedId(null);
        setEntries([]);
      }
    } catch {
      setStatus("No se pudo cargar la cuenta corriente");
    }
  }, [balanceFilter, maxBalance, minBalance, query, selectedId, tab]);

  const loadEntries = useCallback(async (id: string) => {
    setLoadingEntries(true);
    try {
      const params = new URLSearchParams({
        type: tab,
        id,
      });
      if (entrySource !== "ALL") params.set("source", entrySource);
      if (entryFrom) params.set("from", entryFrom);
      if (entryTo) params.set("to", entryTo);
      const res = await fetch(`/api/current-accounts/entries?${params.toString()}`, {
        cache: "no-store",
      });
      if (!res.ok) {
        setStatus("No se pudo cargar el detalle");
        return;
      }
      const data = (await res.json()) as EntryRow[];
      setEntries(data);
    } catch {
      setStatus("No se pudo cargar el detalle");
    } finally {
      setLoadingEntries(false);
    }
  }, [entryFrom, entrySource, entryTo, tab]);

  useEffect(() => {
    loadSummary().catch(() => undefined);
  }, [loadSummary, tab]);

  useEffect(() => {
    if (!selectedId) return;
    loadEntries(selectedId).catch(() => undefined);
  }, [entryFrom, entrySource, entryTo, loadEntries, selectedId]);

  useEffect(() => {
    const loadRole = async () => {
      try {
        const res = await fetch("/api/auth/me", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { role?: string };
        setRole(data.role ?? null);
      } catch {
        setRole(null);
      } finally {
        setRoleLoaded(true);
      }
    };
    loadRole().catch(() => undefined);
  }, []);

  const totals = useMemo(() => {
    return rows.reduce(
      (acc, row) => ({
        debit: acc.debit + Number(row.debit || 0),
        credit: acc.credit + Number(row.credit || 0),
        balance: acc.balance + Number(row.balance || 0),
        aging0: acc.aging0 + Number(row.aging0 || 0),
        aging30: acc.aging30 + Number(row.aging30 || 0),
        aging60: acc.aging60 + Number(row.aging60 || 0),
        aging90: acc.aging90 + Number(row.aging90 || 0),
      }),
      { debit: 0, credit: 0, balance: 0, aging0: 0, aging30: 0, aging60: 0, aging90: 0 }
    );
  }, [rows]);

  const escapeCsvValue = (value: string) => {
    if (value.includes(",") || value.includes("\"") || value.includes("\n")) {
      return `"${value.replace(/\"/g, "\"\"")}"`;
    }
    return value;
  };

  const handleExportSummaryCsv = () => {
    if (!rows.length) return;
    const header = [
      "Nombre",
      "CUIT",
      "Debe",
      "Haber",
      "Saldo",
      "0-30",
      "31-60",
      "61-90",
      "90+",
    ];
    const dataRows = rows.map((row) => [
      row.displayName,
      row.taxId ?? "",
      row.debit,
      row.credit,
      row.balance,
      row.aging0,
      row.aging30,
      row.aging60,
      row.aging90,
    ]);
    const csv = [header, ...dataRows]
      .map((row) => row.map((value) => escapeCsvValue(String(value))).join(","))
      .join("\n");
    const blob = new Blob([`\uFEFF${csv}`], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `cuenta-corriente-${tab}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const handleExportEntriesCsv = () => {
    if (!entries.length) return;
    const header = [
      "Fecha",
      "Tipo",
      "Direccion",
      "Referencia",
      "Importe",
      "Nota",
    ];
    const dataRows = entries.map((entry) => [
      new Date(entry.occurredAt).toLocaleDateString("es-AR"),
      entry.sourceType,
      entry.direction,
      entry.reference ?? "",
      entry.amount,
      entry.note ?? "",
    ]);
    const csv = [header, ...dataRows]
      .map((row) => row.map((value) => escapeCsvValue(String(value))).join(","))
      .join("\n");
    const blob = new Blob([`\uFEFF${csv}`], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `cuenta-corriente-detalle-${tab}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const handleSubmitAdjustment = async () => {
    if (!selectedId) return;
    if (!adjustmentAmount || Number(adjustmentAmount) <= 0) {
      setAdjustmentStatus("Ingresa un importe valido");
      return;
    }
    setAdjustmentStatus(null);
    setIsSubmittingAdjustment(true);
    try {
      const res = await fetch("/api/current-accounts/adjustments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: tab,
          counterpartyId: selectedId,
          direction: adjustmentDirection,
          amount: Number(adjustmentAmount),
          occurredAt: adjustmentDate,
          note: adjustmentNote,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAdjustmentStatus(data?.error ?? "No se pudo registrar");
        return;
      }
      setAdjustmentStatus("Ajuste registrado");
      setAdjustmentAmount("");
      setAdjustmentNote("");
      await loadSummary();
      await loadEntries(selectedId);
    } catch {
      setAdjustmentStatus("No se pudo registrar");
    } finally {
      setIsSubmittingAdjustment(false);
    }
  };

  const directionLabels =
    tab === "customer"
      ? {
          DEBIT: "Debito (cliente debe)",
          CREDIT: "Credito (a favor del cliente)",
        }
      : {
          CREDIT: "Credito (a favor del proveedor)",
          DEBIT: "Debito (pago / a favor nuestro)",
        };
  const canAdjust = canManageAdjustments(role);
  const adjustmentAmountPreview = Number(adjustmentAmount || 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900">
          Cuenta corriente
        </h1>
        <p className="mt-2 text-sm text-zinc-600">
          Seguimiento de saldos a favor y en contra con clientes y proveedores.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className={`btn text-xs ${
            tab === "customer" ? "btn-sky" : ""
          }`}
          onClick={() => {
            setTab("customer");
            setSelectedId(null);
            setEntries([]);
          }}
        >
          Clientes
        </button>
        <button
          type="button"
          className={`btn text-xs ${
            tab === "supplier" ? "btn-sky" : ""
          }`}
          onClick={() => {
            setTab("supplier");
            setSelectedId(null);
            setEntries([]);
          }}
        >
          Proveedores
        </button>
        <button
          type="button"
          className="btn text-xs"
          onClick={() => loadSummary()}
        >
          Actualizar
        </button>
        <button
          type="button"
          className="btn btn-sky text-xs"
          onClick={handleExportSummaryCsv}
          disabled={!rows.length}
        >
          Exportar CSV
        </button>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex w-full flex-col gap-3 text-[11px] text-zinc-500 sm:w-48">
          Buscar
          <input
            className="input text-xs"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Nombre o CUIT"
          />
        </label>
        <label className="flex w-full flex-col gap-3 text-[11px] text-zinc-500 sm:w-40">
          Balance
          <select
            className="input cursor-pointer text-xs"
            value={balanceFilter}
            onChange={(event) => setBalanceFilter(event.target.value)}
          >
            <option value="all">Todos</option>
            <option value="positive">Saldo positivo</option>
            <option value="negative">Saldo negativo</option>
            <option value="zero">Saldo cero</option>
            <option value="nonzero">Con saldo</option>
          </select>
        </label>
        <label className="flex w-full flex-col gap-3 text-[11px] text-zinc-500 sm:w-28">
          Min
          <input
            className="input text-xs"
            inputMode="decimal"
            value={minBalance}
            onChange={(event) =>
              setMinBalance(normalizeDecimalInput(event.target.value, 2))
            }
          />
        </label>
        <label className="flex w-full flex-col gap-3 text-[11px] text-zinc-500 sm:w-28">
          Max
          <input
            className="input text-xs"
            inputMode="decimal"
            value={maxBalance}
            onChange={(event) =>
              setMaxBalance(normalizeDecimalInput(event.target.value, 2))
            }
          />
        </label>
        <button
          type="button"
          className="btn text-xs"
          onClick={() => {
            setQuery("");
            setBalanceFilter("all");
            setMinBalance("");
            setMaxBalance("");
          }}
        >
          Limpiar filtros
        </button>
      </div>

      {status ? <p className="text-xs text-zinc-500">{status}</p> : null}

      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <div className="card space-y-3 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
              Resumen
            </h3>
            <div className="text-xs text-zinc-500">
              Total saldo {formatCurrencyARS(totals.balance)}
            </div>
          </div>
          <div className="table-scroll">
            <table className="w-full text-left text-xs">
              <thead className="text-[10px] uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="py-2 pr-3">Nombre</th>
                  <th className="py-2 pr-3">CUIT</th>
                  <th className="py-2 pr-3 text-right">Debe</th>
                  <th className="py-2 pr-3 text-right">Haber</th>
                  <th className="py-2 pr-3 text-right">Saldo</th>
                  <th className="py-2 pr-3 text-right">0-30</th>
                  <th className="py-2 pr-3 text-right">31-60</th>
                  <th className="py-2 pr-3 text-right">61-90</th>
                  <th className="py-2 pr-3 text-right">90+</th>
                </tr>
              </thead>
              <tbody>
                {rows.length ? (
                  rows.map((row) => {
                    const balance = Number(row.balance || 0);
                    const isActive = row.id === selectedId;
                    return (
                      <tr
                        key={row.id}
                        className={`cursor-pointer border-t border-zinc-200/60 text-zinc-600 transition-colors hover:bg-white/60 ${
                          isActive ? "bg-white/70" : ""
                        }`}
                        onClick={() => {
                          setSelectedId(row.id);
                          loadEntries(row.id).catch(() => undefined);
                        }}
                      >
                        <td className="py-2 pr-3 text-zinc-900">
                          {row.displayName}
                        </td>
                        <td className="py-2 pr-3 text-[11px] text-zinc-500">
                          {row.taxId ?? "-"}
                        </td>
                        <td className="py-2 pr-3 text-right">
                          {formatCurrencyARS(row.debit)}
                        </td>
                        <td className="py-2 pr-3 text-right">
                          {formatCurrencyARS(row.credit)}
                        </td>
                        <td
                          className={`py-2 pr-3 text-right font-semibold ${
                            balance >= 0
                              ? "text-emerald-700"
                              : "text-rose-700"
                          }`}
                        >
                          {formatCurrencyARS(balance)}
                        </td>
                        <td className="py-2 pr-3 text-right text-[11px] text-zinc-500">
                          {formatCurrencyARS(row.aging0)}
                        </td>
                        <td className="py-2 pr-3 text-right text-[11px] text-zinc-500">
                          {formatCurrencyARS(row.aging30)}
                        </td>
                        <td className="py-2 pr-3 text-right text-[11px] text-zinc-500">
                          {formatCurrencyARS(row.aging60)}
                        </td>
                        <td className="py-2 pr-3 text-right text-[11px] text-zinc-500">
                          {formatCurrencyARS(row.aging90)}
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td
                      colSpan={9}
                      className="py-3 text-sm text-zinc-500"
                    >
                      Sin datos.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card space-y-3 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
              Detalle
            </h3>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                className="btn text-xs"
                onClick={() => selectedId && loadEntries(selectedId)}
                disabled={!selectedId || loadingEntries}
              >
                {loadingEntries ? "Actualizando..." : "Actualizar"}
              </button>
              <button
                type="button"
                className="btn btn-sky text-xs"
                onClick={handleExportEntriesCsv}
                disabled={!entries.length}
              >
                Exportar CSV
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-3 text-[11px] text-zinc-500">
              Desde
              <input
                type="date"
                className="input cursor-pointer text-xs"
                value={entryFrom}
                onChange={(event) => setEntryFrom(event.target.value)}
              />
            </label>
            <label className="flex flex-col gap-3 text-[11px] text-zinc-500">
              Hasta
              <input
                type="date"
                className="input cursor-pointer text-xs"
                value={entryTo}
                onChange={(event) => setEntryTo(event.target.value)}
              />
            </label>
            <label className="flex flex-col gap-3 text-[11px] text-zinc-500">
              Tipo
              <select
                className="input cursor-pointer text-xs"
                value={entrySource}
                onChange={(event) => setEntrySource(event.target.value)}
              >
                <option value="ALL">Todos</option>
                <option value="SALE">Venta</option>
                <option value="RECEIPT">Cobro</option>
                <option value="PURCHASE">Compra</option>
                <option value="SUPPLIER_PAYMENT">Pago proveedor</option>
                <option value="ADJUSTMENT">Ajuste</option>
              </select>
            </label>
            <button
              type="button"
              className="btn text-xs"
              onClick={() => {
                setEntryFrom("");
                setEntryTo("");
                setEntrySource("ALL");
              }}
            >
              Limpiar
            </button>
          </div>

          {loadingEntries ? (
            <p className="text-xs text-zinc-500">Cargando...</p>
          ) : entries.length ? (
            <div className="space-y-2 text-xs text-zinc-600">
              {entries.map((entry) => (
                <div
                  key={entry.id}
                  className="rounded-2xl border border-zinc-200/70 bg-white/40 p-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[11px] text-zinc-500">
                      {new Date(entry.occurredAt).toLocaleDateString("es-AR")}
                    </span>
                    <span className="text-[11px] uppercase tracking-wide text-zinc-500">
                      {SOURCE_LABELS[entry.sourceType] ?? entry.sourceType}
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-[11px] text-zinc-500">
                        {DIRECTION_LABELS[entry.direction] ?? entry.direction}
                        {entry.reference ? ` · ${entry.reference}` : ""}
                      </p>
                      {entry.note ? (
                        <p className="text-[11px] text-zinc-500">
                          {entry.note}
                        </p>
                      ) : null}
                    </div>
                    <p className="text-sm font-semibold text-zinc-900">
                      {formatCurrencyARS(entry.amount)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-zinc-500">
              Selecciona un registro para ver movimientos.
            </p>
          )}

          {selectedId && canAdjust ? (
            <div className="mt-4 rounded-2xl border border-dashed border-zinc-200/70 bg-white/40 p-3 text-xs text-zinc-600">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                Ajuste manual
              </p>
              <div className="mt-3 flex flex-wrap items-end gap-3">
                <label className="flex flex-col gap-3 text-[11px] text-zinc-500">
                  Fecha
                  <input
                    type="date"
                    className="input cursor-pointer text-xs"
                    value={adjustmentDate}
                    onChange={(event) => setAdjustmentDate(event.target.value)}
                  />
                </label>
                <label className="flex flex-col gap-3 text-[11px] text-zinc-500">
                  Direccion
                  <select
                    className="input cursor-pointer text-xs"
                    value={adjustmentDirection}
                    onChange={(event) =>
                      setAdjustmentDirection(
                        event.target.value as "DEBIT" | "CREDIT",
                      )
                    }
                  >
                    <option value="DEBIT">{directionLabels.DEBIT}</option>
                    <option value="CREDIT">{directionLabels.CREDIT}</option>
                  </select>
                </label>
                <label className="flex flex-col gap-2 text-[11px] text-zinc-500">
                  Importe
                  <input
                    className="input text-xs"
                    inputMode="decimal"
                    placeholder="0,00"
                    value={adjustmentAmount}
                    onChange={(event) =>
                      setAdjustmentAmount(
                        normalizeDecimalInput(event.target.value, 2),
                      )
                    }
                  />
                </label>
                <label className="flex flex-1 flex-col gap-2 text-[11px] text-zinc-500">
                  Nota
                  <input
                    className="input text-xs"
                    value={adjustmentNote}
                    onChange={(event) => setAdjustmentNote(event.target.value)}
                  />
                </label>
                <button
                  type="button"
                  className="btn btn-sky text-xs"
                  onClick={handleSubmitAdjustment}
                  disabled={isSubmittingAdjustment}
                >
                  {isSubmittingAdjustment ? "Guardando..." : "Guardar ajuste"}
                </button>
              </div>
              {adjustmentStatus ? (
                <p className="mt-2 text-[11px] text-zinc-500">
                  {adjustmentStatus}
                </p>
              ) : null}
              {adjustmentAmountPreview > 0 ? (
                <p className="mt-1 text-[11px] text-zinc-500">
                  Vista previa: {formatCurrencyARS(adjustmentAmountPreview)}
                </p>
              ) : null}
            </div>
          ) : null}
          {selectedId && roleLoaded && role !== null && !canAdjust ? (
            <p className="mt-3 text-[11px] text-zinc-500">
              Solo OWNER/ADMIN pueden registrar ajustes manuales.
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
