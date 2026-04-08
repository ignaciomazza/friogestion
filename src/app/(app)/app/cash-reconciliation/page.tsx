"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { formatCurrencyARS, formatCurrencyUSD } from "@/lib/format";
import { normalizeDecimalInput } from "@/lib/input-format";
import { canAccessCashReconciliation } from "@/lib/auth/rbac";

type ReportAccount = {
  accountId: string;
  accountName: string;
  currencyCode: string;
  accountType: string;
  incoming: string;
  outgoing: string;
  expectedNet: string;
};

type ReportResponse = {
  from: string;
  to: string;
  includeUnverified?: boolean;
  accounts: ReportAccount[];
};

type ReconciliationRow = {
  id: string;
  periodStart: string;
  periodEnd: string;
  createdAt: string;
  createdBy: string;
  note: string | null;
  lines: Array<{
    id: string;
    accountName: string;
    currencyCode: string;
    expectedAmount: string;
    countedAmount: string;
    difference: string;
    note: string | null;
  }>;
};

const formatAmount = (amount: string | number, currencyCode: string) => {
  if (currencyCode === "USD") return formatCurrencyUSD(amount);
  if (currencyCode === "ARS") return formatCurrencyARS(amount);
  const numeric = Number(amount ?? 0);
  return `${numeric.toFixed(2)} ${currencyCode}`;
};

export default function CashReconciliationPage() {
  const today = new Date().toISOString().slice(0, 10);
  const [fromDate, setFromDate] = useState(today);
  const [toDate, setToDate] = useState(today);
  const [accountType, setAccountType] = useState("CASH");
  const [report, setReport] = useState<ReportResponse | null>(null);
  const [countedByAccount, setCountedByAccount] = useState<Record<string, string>>(
    {},
  );
  const [note, setNote] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [history, setHistory] = useState<ReconciliationRow[]>([]);
  const [includeUnverified, setIncludeUnverified] = useState(false);
  const [role, setRole] = useState<string | null>(null);
  const [roleLoaded, setRoleLoaded] = useState(false);

  const loadReport = useCallback(async () => {
    setIsLoading(true);
    setStatus(null);
    try {
      const params = new URLSearchParams();
      if (fromDate) params.set("from", fromDate);
      if (toDate) params.set("to", toDate);
      if (accountType) params.set("accountType", accountType);
      if (includeUnverified) params.set("includeUnverified", "true");
      const res = await fetch(`/api/cash-reconciliation/report?${params.toString()}`, {
        cache: "no-store",
      });
      if (!res.ok) {
        const data = await res.json();
        setStatus(data?.error ?? "No se pudo cargar el reporte");
        return;
      }
      const data = (await res.json()) as ReportResponse;
      setReport(data);
      const nextCounted: Record<string, string> = {};
      data.accounts.forEach((account) => {
        nextCounted[account.accountId] = account.expectedNet;
      });
      setCountedByAccount(nextCounted);
    } catch {
      setStatus("No se pudo cargar el reporte");
    } finally {
      setIsLoading(false);
    }
  }, [accountType, fromDate, includeUnverified, toDate]);

  const loadHistory = useCallback(async () => {
    try {
      const res = await fetch("/api/cash-reconciliation", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as ReconciliationRow[];
      setHistory(data);
    } catch {
      setHistory([]);
    }
  }, []);

  useEffect(() => {
    loadReport().catch(() => undefined);
  }, [loadReport]);

  useEffect(() => {
    loadHistory().catch(() => undefined);
  }, [loadHistory]);

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

  const totalsByCurrency = useMemo(() => {
    const rows = report?.accounts ?? [];
    const totals = new Map<
      string,
      { incoming: number; outgoing: number; expected: number; counted: number; difference: number }
    >();
    rows.forEach((row) => {
      const incoming = Number(row.incoming || 0);
      const outgoing = Number(row.outgoing || 0);
      const expected = Number(row.expectedNet || 0);
      const counted = Number(countedByAccount[row.accountId] || 0);
      const current = totals.get(row.currencyCode) ?? {
        incoming: 0,
        outgoing: 0,
        expected: 0,
        counted: 0,
        difference: 0,
      };
      current.incoming += incoming;
      current.outgoing += outgoing;
      current.expected += expected;
      current.counted += counted;
      current.difference += counted - expected;
      totals.set(row.currencyCode, current);
    });
    return Array.from(totals.entries());
  }, [countedByAccount, report]);

  const handleSave = async () => {
    if (!report?.accounts.length) return;
    setIsSaving(true);
    setStatus(null);
    try {
      const res = await fetch("/api/cash-reconciliation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          periodStart: fromDate,
          periodEnd: toDate,
          includeUnverified,
          note,
          lines: report.accounts.map((account) => ({
            accountId: account.accountId,
            countedAmount: Number(countedByAccount[account.accountId] || 0),
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus(data?.error ?? "No se pudo guardar");
        return;
      }
      setStatus("Arqueo registrado");
      setNote("");
      loadHistory().catch(() => undefined);
    } catch {
      setStatus("No se pudo guardar");
    } finally {
      setIsSaving(false);
    }
  };

  const canAccess = canAccessCashReconciliation(role);

  if (roleLoaded && role !== null && !canAccess) {
    return (
      <div className="card">
        <h1 className="text-xl font-semibold text-zinc-900">
          Arqueo y conciliación
        </h1>
        <p className="mt-2 text-sm text-zinc-600">
          Solo OWNER/ADMIN pueden acceder a este módulo.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900">
          Arqueo y conciliación
        </h1>
        <p className="mt-2 text-sm text-zinc-600">
          Revisa ingresos y egresos por cuenta y guarda el arqueo del periodo.
        </p>
      </div>

      <div className="card space-y-4 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
              Reporte de caja
            </h3>
            <p className="text-xs text-zinc-500">
              Ingresos vs egresos del periodo seleccionado.
            </p>
          </div>
          <button
            type="button"
            className="btn text-xs"
            onClick={loadReport}
            disabled={isLoading}
          >
            {isLoading ? "Actualizando..." : "Actualizar"}
          </button>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-3 text-[11px] text-zinc-500">
            Desde
            <input
              type="date"
              className="input cursor-pointer text-xs"
              value={fromDate}
              onChange={(event) => setFromDate(event.target.value)}
            />
          </label>
          <label className="flex flex-col gap-3 text-[11px] text-zinc-500">
            Hasta
            <input
              type="date"
              className="input cursor-pointer text-xs"
              value={toDate}
              onChange={(event) => setToDate(event.target.value)}
            />
          </label>
          <label className="flex flex-col gap-3 text-[11px] text-zinc-500">
            Tipo de cuenta
            <select
              className="input cursor-pointer text-xs"
              value={accountType}
              onChange={(event) => setAccountType(event.target.value)}
            >
              <option value="CASH">Caja</option>
              <option value="BANK">Banco</option>
              <option value="VIRTUAL">Virtual</option>
              <option value="ALL">Todas</option>
            </select>
          </label>
          <label className="flex items-center gap-2 text-[11px] text-zinc-500">
            <input
              type="checkbox"
              checked={includeUnverified}
              onChange={(event) => setIncludeUnverified(event.target.checked)}
            />
            Incluir movimientos pendientes de verificación
          </label>
        </div>

        {status ? <p className="text-xs text-zinc-500">{status}</p> : null}
        {!includeUnverified ? (
          <p className="text-[11px] text-zinc-500">
            Se excluyen movimientos pendientes de verificación.
          </p>
        ) : null}

        {report?.accounts.length ? (
          <div className="table-scroll">
            <table className="w-full text-left text-xs">
              <thead className="text-[10px] uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="py-2 pr-3">Cuenta</th>
                  <th className="py-2 pr-3 text-right">Ingresos</th>
                  <th className="py-2 pr-3 text-right">Egresos</th>
                  <th className="py-2 pr-3 text-right">Neto esperado</th>
                  <th className="py-2 pr-3 text-right">Contado</th>
                  <th className="py-2 pr-3 text-right">Diferencia</th>
                </tr>
              </thead>
              <tbody>
                {report.accounts.map((account) => {
                  const expected = Number(account.expectedNet || 0);
                  const counted = Number(
                    countedByAccount[account.accountId] || 0,
                  );
                  const difference = counted - expected;
                  return (
                    <tr
                      key={account.accountId}
                      className="border-t border-zinc-200/60 text-zinc-600"
                    >
                      <td className="py-2 pr-3 text-zinc-900">
                        {account.accountName}
                        <span className="ml-2 text-[10px] text-zinc-500">
                          {account.currencyCode}
                        </span>
                      </td>
                      <td className="py-2 pr-3 text-right">
                        {formatAmount(account.incoming, account.currencyCode)}
                      </td>
                      <td className="py-2 pr-3 text-right">
                        {formatAmount(account.outgoing, account.currencyCode)}
                      </td>
                      <td className="py-2 pr-3 text-right">
                        {formatAmount(account.expectedNet, account.currencyCode)}
                      </td>
                      <td className="py-2 pr-3 text-right">
                        <input
                          className="input text-xs text-right"
                          inputMode="decimal"
                          value={countedByAccount[account.accountId] ?? ""}
                          onChange={(event) =>
                            setCountedByAccount((prev) => ({
                              ...prev,
                              [account.accountId]: normalizeDecimalInput(
                                event.target.value,
                                2,
                              ),
                            }))
                          }
                        />
                      </td>
                      <td
                        className={`py-2 pr-3 text-right font-semibold ${
                          Math.abs(difference) <= 0.005
                            ? "text-emerald-700"
                            : "text-rose-700"
                        }`}
                      >
                        {formatAmount(difference, account.currencyCode)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-xs text-zinc-500">
            No hay movimientos para el periodo.
          </p>
        )}

        {report?.accounts.length ? (
          <div className="rounded-2xl border border-dashed border-zinc-200/70 bg-white/40 p-3 text-xs text-zinc-600">
            <p className="font-semibold text-zinc-900">
              Totales por moneda
            </p>
            <div className="mt-2 space-y-2">
              {totalsByCurrency.map(([currency, totals]) => (
                <div
                  key={currency}
                  className="flex flex-wrap items-center justify-between gap-2"
                >
                  <div>
                    <p className="text-[11px] text-zinc-500">{currency}</p>
                    <p>
                      Ingresos {formatAmount(totals.incoming, currency)} ·
                      Egresos {formatAmount(totals.outgoing, currency)}
                    </p>
                    <p>
                      Esperado {formatAmount(totals.expected, currency)} ·
                      Contado {formatAmount(totals.counted, currency)}
                    </p>
                  </div>
                  <div
                    className={`text-sm font-semibold ${
                      Math.abs(totals.difference) <= 0.005
                        ? "text-emerald-700"
                        : "text-rose-700"
                    }`}
                  >
                    Diferencia {formatAmount(totals.difference, currency)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-1 flex-col gap-3 text-[11px] text-zinc-500">
            Nota
            <input
              className="input text-xs"
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </label>
          <button
            type="button"
            className="btn btn-sky text-xs"
            onClick={handleSave}
            disabled={!report?.accounts.length || isSaving}
          >
            {isSaving ? "Guardando..." : "Guardar arqueo"}
          </button>
        </div>
      </div>

      <div className="card space-y-4 p-6">
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
            Auditoría reciente
          </h3>
          <p className="text-xs text-zinc-500">
            Ultimos arqueos registrados.
          </p>
        </div>

        {history.length ? (
          <div className="space-y-3 text-xs text-zinc-600">
            {history.map((item) => (
              <div
                key={item.id}
                className="rounded-2xl border border-zinc-200/70 bg-white/40 p-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-zinc-500">
                      {new Date(item.periodStart).toLocaleDateString("es-AR")} ·{" "}
                      {new Date(item.periodEnd).toLocaleDateString("es-AR")}
                    </p>
                    <p className="text-[11px] text-zinc-500">
                      {new Date(item.createdAt).toLocaleString("es-AR")} ·{" "}
                      {item.createdBy}
                    </p>
                    {item.note ? (
                      <p className="text-[11px] text-zinc-500">{item.note}</p>
                    ) : null}
                  </div>
                  <span className="text-[11px] text-zinc-500">
                    {item.lines.length} cuentas
                  </span>
                </div>
                <div className="mt-3 space-y-1">
                  {item.lines.map((line) => (
                    <div
                      key={line.id}
                      className="flex flex-wrap items-center justify-between gap-2 text-[11px]"
                    >
                      <span>
                        {line.accountName} · {line.currencyCode}
                      </span>
                      <span>
                        Esperado {formatAmount(line.expectedAmount, line.currencyCode)} ·
                        Contado {formatAmount(line.countedAmount, line.currencyCode)} ·
                        Dif. {formatAmount(line.difference, line.currencyCode)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-zinc-500">Sin arqueos registrados.</p>
        )}
      </div>
    </div>
  );
}
