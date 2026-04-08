"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { formatCurrencyARS, formatCurrencyUSD } from "@/lib/format";

type PendingMovement = {
  id: string;
  occurredAt: string;
  amount: string;
  currencyCode: string;
  accountName: string;
  paymentMethodName: string;
  saleId: string | null;
  saleNumber: string | null;
  customerName: string | null;
  receiptId: string | null;
  receiptNumber: string | null;
  note: string | null;
};

type ReportRow = {
  date: string;
  totals: Record<string, { verified: number; pending: number }>;
};

type VerifiedMovement = {
  id: string;
  occurredAt: string;
  verifiedAt: string | null;
  amount: string;
  currencyCode: string;
  accountName: string;
  paymentMethodName: string;
  saleId: string | null;
  saleNumber: string | null;
  customerName: string | null;
  verifiedByName: string | null;
};

type VerifierOption = {
  id: string;
  name: string | null;
  email: string;
  role: string;
};

export default function IncomeCheckPage() {
  const [items, setItems] = useState<PendingMovement[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [reportRows, setReportRows] = useState<ReportRow[]>([]);
  const [reportCurrencies, setReportCurrencies] = useState<string[]>([]);
  const [reportDays, setReportDays] = useState(14);
  const [reportStatus, setReportStatus] = useState<string | null>(null);
  const [verifiedItems, setVerifiedItems] = useState<VerifiedMovement[]>([]);
  const [verifiers, setVerifiers] = useState<VerifierOption[]>([]);
  const [verifiedStatus, setVerifiedStatus] = useState<string | null>(null);
  const [isVerifiedLoading, setIsVerifiedLoading] = useState(false);
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");
  const [filterVerifierId, setFilterVerifierId] = useState("");

  const loadPending = useCallback(async () => {
    setIsLoading(true);
    setStatus(null);
    try {
      const res = await fetch("/api/account-movements/pending", {
        cache: "no-store",
      });
      if (!res.ok) {
        const data = await res.json();
        setStatus(data?.error ?? "No se pudo cargar");
        return;
      }
      const data = (await res.json()) as PendingMovement[];
      setItems(data);
      setSelectedIds((prev) => {
        if (!prev.size) return prev;
        const next = new Set<string>();
        for (const item of data) {
          if (prev.has(item.id)) next.add(item.id);
        }
        return next;
      });
    } catch {
      setStatus("No se pudo cargar");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPending().catch(() => undefined);
  }, [loadPending]);

  const loadVerifiers = useCallback(async () => {
    try {
      const res = await fetch("/api/account-movements/verifiers", {
        cache: "no-store",
      });
      if (!res.ok) return;
      const data = (await res.json()) as VerifierOption[];
      setVerifiers(data);
    } catch {
      setVerifiers([]);
    }
  }, []);

  const loadReport = useCallback(async () => {
    setReportStatus(null);
    try {
      const res = await fetch(
        `/api/account-movements/report?days=${reportDays}`,
        { cache: "no-store" }
      );
      if (!res.ok) {
        const data = await res.json();
        setReportStatus(data?.error ?? "No se pudo cargar el reporte");
        return;
      }
      const data = (await res.json()) as {
        days: number;
        currencies: string[];
        rows: ReportRow[];
      };
      setReportRows(data.rows ?? []);
      setReportCurrencies(data.currencies ?? []);
    } catch {
      setReportStatus("No se pudo cargar el reporte");
    }
  }, [reportDays]);

  useEffect(() => {
    loadReport().catch(() => undefined);
  }, [loadReport]);

  const loadVerified = useCallback(async () => {
    setIsVerifiedLoading(true);
    setVerifiedStatus(null);
    try {
      const params = new URLSearchParams();
      if (filterFrom) params.set("from", filterFrom);
      if (filterTo) params.set("to", filterTo);
      if (filterVerifierId) params.set("verifierId", filterVerifierId);
      const query = params.toString();
      const res = await fetch(
        `/api/account-movements/verified${query ? `?${query}` : ""}`,
        { cache: "no-store" }
      );
      if (!res.ok) {
        const data = await res.json();
        setVerifiedStatus(data?.error ?? "No se pudo cargar");
        return;
      }
      const data = (await res.json()) as VerifiedMovement[];
      setVerifiedItems(data);
    } catch {
      setVerifiedStatus("No se pudo cargar");
    } finally {
      setIsVerifiedLoading(false);
    }
  }, [filterFrom, filterTo, filterVerifierId]);

  useEffect(() => {
    loadVerifiers().catch(() => undefined);
  }, [loadVerifiers]);

  useEffect(() => {
    loadVerified().catch(() => undefined);
  }, [loadVerified]);

  const handleVerify = async (id: string) => {
    setVerifyingId(id);
    setStatus(null);
    try {
      const res = await fetch("/api/account-movements/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus(data?.error ?? "No se pudo verificar");
        return;
      }
      setItems((prev) => prev.filter((item) => item.id !== id));
      setSelectedIds((prev) => {
        if (!prev.has(id)) return prev;
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      loadReport().catch(() => undefined);
      loadVerified().catch(() => undefined);
    } catch {
      setStatus("No se pudo verificar");
    } finally {
      setVerifyingId(null);
    }
  };

  const handleVerifyBatch = async () => {
    if (!selectedIds.size) return;
    setStatus(null);
    setVerifyingId("BATCH");
    try {
      const res = await fetch("/api/account-movements/verify-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: Array.from(selectedIds) }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus(data?.error ?? "No se pudo verificar");
        return;
      }
      setItems((prev) => prev.filter((item) => !selectedIds.has(item.id)));
      setSelectedIds(new Set());
      loadReport().catch(() => undefined);
      loadVerified().catch(() => undefined);
    } catch {
      setStatus("No se pudo verificar");
    } finally {
      setVerifyingId(null);
    }
  };

  const totalsByCurrency = useMemo(() => {
    const totals = new Map<string, number>();
    for (const item of items) {
      const current = totals.get(item.currencyCode) ?? 0;
      totals.set(item.currencyCode, current + Number(item.amount || 0));
    }
    return Array.from(totals.entries());
  }, [items]);

  const allSelected = items.length > 0 && items.every((item) => selectedIds.has(item.id));

  const formatAmount = (amount: string | number, currencyCode: string) => {
    if (currencyCode === "USD") return formatCurrencyUSD(amount);
    if (currencyCode === "ARS") return formatCurrencyARS(amount);
    const numeric = Number(amount ?? 0);
    return `${numeric.toFixed(2)} ${currencyCode}`;
  };

  const escapeCsvValue = (value: string) => {
    if (value.includes(",") || value.includes("\"") || value.includes("\n")) {
      return `"${value.replace(/\"/g, "\"\"")}"`;
    }
    return value;
  };

  const handleExportReportCsv = () => {
    if (!reportRows.length) return;
    const header = [
      "Fecha",
      ...reportCurrencies.map((currency) => `Verificado ${currency}`),
      ...reportCurrencies.map((currency) => `Pendiente ${currency}`),
    ];
    const rows = reportRows.map((row) => {
      const verified = reportCurrencies.map((currency) => {
        const totals = row.totals[currency] ?? { verified: 0, pending: 0 };
        return totals.verified.toFixed(2);
      });
      const pending = reportCurrencies.map((currency) => {
        const totals = row.totals[currency] ?? { verified: 0, pending: 0 };
        return totals.pending.toFixed(2);
      });
      return [row.date, ...verified, ...pending];
    });

    const csv = [header, ...rows]
      .map((row) => row.map((value) => escapeCsvValue(String(value))).join(","))
      .join("\n");
    const blob = new Blob([`\uFEFF${csv}`], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `reporte-doble-control-${reportDays}d.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const handleExportVerifiedCsv = () => {
    if (!verifiedItems.length) return;
    const header = [
      "Fecha",
      "Cliente",
      "Venta",
      "Metodo",
      "Cuenta",
      "Importe",
      "Moneda",
      "Verificado por",
      "Verificado el",
    ];
    const rows = verifiedItems.map((item) => [
      new Date(item.occurredAt).toLocaleDateString("es-AR"),
      item.customerName ?? "",
      item.saleNumber ?? item.saleId ?? "",
      item.paymentMethodName,
      item.accountName,
      item.amount,
      item.currencyCode,
      item.verifiedByName ?? "",
      item.verifiedAt
        ? new Date(item.verifiedAt).toLocaleDateString("es-AR")
        : "",
    ]);
    const csv = [header, ...rows]
      .map((row) => row.map((value) => escapeCsvValue(String(value))).join(","))
      .join("\n");
    const blob = new Blob([`\uFEFF${csv}`], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "historial-doble-control.csv";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900">
          Doble control de ingresos
        </h1>
        <p className="mt-2 text-sm text-zinc-600">
          Confirma los ingresos registrados antes de cerrar la jornada.
        </p>
      </div>

      <div className="card space-y-4 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
              Pendientes
            </h3>
            <p className="text-xs text-zinc-500">
              {items.length} ingresos
              {totalsByCurrency.length
                ? ` · ${totalsByCurrency
                    .map(([currency, total]) =>
                      formatAmount(total.toString(), currency),
                    )
                    .join(" / ")}`
                : ""}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="btn text-xs"
              onClick={() => loadPending()}
              disabled={isLoading}
            >
              {isLoading ? "Actualizando..." : "Actualizar"}
            </button>
            <button
              type="button"
              className="btn btn-sky text-xs"
              onClick={handleVerifyBatch}
              disabled={!selectedIds.size || verifyingId === "BATCH"}
            >
              {verifyingId === "BATCH"
                ? "Confirmando..."
                : `Confirmar ${selectedIds.size} seleccionado(s)`}
            </button>
          </div>
        </div>

        {status ? <p className="text-xs text-zinc-500">{status}</p> : null}

        <div className="table-scroll">
          <table className="w-full text-left text-xs">
            <thead className="text-[10px] uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="py-2 pr-3">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={() => {
                      if (allSelected) {
                        setSelectedIds(new Set());
                      } else {
                        setSelectedIds(new Set(items.map((item) => item.id)));
                      }
                    }}
                    aria-label="Seleccionar todos"
                  />
                </th>
                <th className="py-2 pr-3">Fecha</th>
                <th className="py-2 pr-3">Cliente</th>
                <th className="py-2 pr-3">Venta</th>
                <th className="py-2 pr-3">Metodo</th>
                <th className="py-2 pr-3">Cuenta</th>
                <th className="py-2 pr-3 text-right">Importe</th>
                <th className="py-2 pr-3 text-right">Accion</th>
              </tr>
            </thead>
            <tbody>
              {items.length ? (
                items.map((item) => (
                  <tr
                    key={item.id}
                    className="border-t border-zinc-200/60 text-zinc-600"
                  >
                    <td className="py-2 pr-3">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(item.id)}
                        onChange={() =>
                          setSelectedIds((prev) => {
                            const next = new Set(prev);
                            if (next.has(item.id)) {
                              next.delete(item.id);
                            } else {
                              next.add(item.id);
                            }
                            return next;
                          })
                        }
                        aria-label="Seleccionar ingreso"
                      />
                    </td>
                    <td className="py-2 pr-3">
                      {new Date(item.occurredAt).toLocaleDateString("es-AR")}
                    </td>
                    <td className="py-2 pr-3 text-zinc-900">
                      {item.customerName ?? "-"}
                    </td>
                    <td className="py-2 pr-3">
                      {item.saleNumber ?? item.saleId ?? "-"}
                    </td>
                    <td className="py-2 pr-3">{item.paymentMethodName}</td>
                    <td className="py-2 pr-3">{item.accountName}</td>
                    <td className="py-2 pr-3 text-right text-zinc-900">
                      {formatAmount(item.amount, item.currencyCode)}
                    </td>
                    <td className="py-2 pr-3 text-right">
                      <button
                        type="button"
                        className="btn btn-sky text-xs"
                        disabled={verifyingId === item.id}
                        onClick={() => handleVerify(item.id)}
                      >
                        {verifyingId === item.id ? "Confirmando..." : "Confirmar"}
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="py-3 text-sm text-zinc-500" colSpan={8}>
                    Sin ingresos pendientes.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card space-y-4 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
              Historial verificado
            </h3>
            <p className="text-xs text-zinc-500">
              Filtra por verificador y fecha.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="btn text-xs"
              onClick={loadVerified}
              disabled={isVerifiedLoading}
            >
              {isVerifiedLoading ? "Actualizando..." : "Actualizar"}
            </button>
            <button
              type="button"
              className="btn btn-sky text-xs"
              onClick={handleExportVerifiedCsv}
              disabled={!verifiedItems.length}
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
              value={filterFrom}
              onChange={(event) => setFilterFrom(event.target.value)}
            />
          </label>
          <label className="flex flex-col gap-3 text-[11px] text-zinc-500">
            Hasta
            <input
              type="date"
              className="input cursor-pointer text-xs"
              value={filterTo}
              onChange={(event) => setFilterTo(event.target.value)}
            />
          </label>
          <label className="flex flex-col gap-3 text-[11px] text-zinc-500 sm:w-52">
            Verificador
            <select
              className="input cursor-pointer text-xs"
              value={filterVerifierId}
              onChange={(event) => setFilterVerifierId(event.target.value)}
            >
              <option value="">Todos</option>
              {verifiers.map((verifier) => (
                <option key={verifier.id} value={verifier.id}>
                  {verifier.name ?? verifier.email}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="btn text-xs"
            onClick={() => {
              setFilterFrom("");
              setFilterTo("");
              setFilterVerifierId("");
            }}
          >
            Limpiar
          </button>
        </div>

        {verifiedStatus ? (
          <p className="text-xs text-zinc-500">{verifiedStatus}</p>
        ) : null}

        {isVerifiedLoading ? (
          <p className="text-xs text-zinc-500">Cargando...</p>
        ) : verifiedItems.length ? (
          <div className="table-scroll">
            <table className="w-full text-left text-xs">
              <thead className="text-[10px] uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="py-2 pr-3">Fecha</th>
                  <th className="py-2 pr-3">Cliente</th>
                  <th className="py-2 pr-3">Venta</th>
                  <th className="py-2 pr-3">Metodo</th>
                  <th className="py-2 pr-3">Cuenta</th>
                  <th className="py-2 pr-3 text-right">Importe</th>
                  <th className="py-2 pr-3">Verificado por</th>
                  <th className="py-2 pr-3">Verificado</th>
                </tr>
              </thead>
              <tbody>
                {verifiedItems.map((item) => (
                  <tr
                    key={item.id}
                    className="border-t border-zinc-200/60 text-zinc-600"
                  >
                    <td className="py-2 pr-3">
                      {new Date(item.occurredAt).toLocaleDateString("es-AR")}
                    </td>
                    <td className="py-2 pr-3 text-zinc-900">
                      {item.customerName ?? "-"}
                    </td>
                    <td className="py-2 pr-3">
                      {item.saleNumber ?? item.saleId ?? "-"}
                    </td>
                    <td className="py-2 pr-3">{item.paymentMethodName}</td>
                    <td className="py-2 pr-3">{item.accountName}</td>
                    <td className="py-2 pr-3 text-right text-zinc-900">
                      {formatAmount(item.amount, item.currencyCode)}
                    </td>
                    <td className="py-2 pr-3">
                      {item.verifiedByName ?? "-"}
                    </td>
                    <td className="py-2 pr-3">
                      {item.verifiedAt
                        ? new Date(item.verifiedAt).toLocaleDateString("es-AR")
                        : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-xs text-zinc-500">Sin registros verificados.</p>
        )}
      </div>

      <div className="card space-y-4 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
              Reporte diario
            </h3>
            <p className="text-xs text-zinc-500">
              Ingresos verificados vs pendientes por dia.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <select
              className="input text-xs"
              value={reportDays}
              onChange={(event) => setReportDays(Number(event.target.value))}
            >
              <option value={7}>Ultimos 7 dias</option>
              <option value={14}>Ultimos 14 dias</option>
              <option value={30}>Ultimos 30 dias</option>
            </select>
            <button type="button" className="btn text-xs" onClick={loadReport}>
              Actualizar
            </button>
            <button
              type="button"
              className="btn btn-sky text-xs"
              onClick={handleExportReportCsv}
              disabled={!reportRows.length}
            >
              Exportar CSV
            </button>
          </div>
        </div>

        {reportStatus ? (
          <p className="text-xs text-zinc-500">{reportStatus}</p>
        ) : null}

        {reportRows.length ? (
          <div className="table-scroll">
            <table className="w-full text-left text-xs">
              <thead className="text-[10px] uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="py-2 pr-3">Fecha</th>
                  {reportCurrencies.map((currency) => (
                    <th key={`${currency}-verified`} className="py-2 pr-3 text-right">
                      Verificado {currency}
                    </th>
                  ))}
                  {reportCurrencies.map((currency) => (
                    <th key={`${currency}-pending`} className="py-2 pr-3 text-right">
                      Pendiente {currency}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {reportRows.map((row) => (
                  <tr
                    key={row.date}
                    className="border-t border-zinc-200/60 text-zinc-600"
                  >
                    <td className="py-2 pr-3">
                      {new Date(`${row.date}T00:00:00`).toLocaleDateString("es-AR")}
                    </td>
                    {reportCurrencies.map((currency) => {
                      const totals = row.totals[currency] ?? { verified: 0, pending: 0 };
                      return (
                        <td key={`${row.date}-${currency}-v`} className="py-2 pr-3 text-right">
                          {formatAmount(totals.verified, currency)}
                        </td>
                      );
                    })}
                    {reportCurrencies.map((currency) => {
                      const totals = row.totals[currency] ?? { verified: 0, pending: 0 };
                      return (
                        <td key={`${row.date}-${currency}-p`} className="py-2 pr-3 text-right">
                          {formatAmount(totals.pending, currency)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-xs text-zinc-500">Sin datos para el periodo.</p>
        )}
      </div>
    </div>
  );
}
