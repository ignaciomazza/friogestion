"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowDownTrayIcon,
  CurrencyDollarIcon,
  ChevronDownIcon,
  DocumentTextIcon,
} from "@/components/icons";
import { getAfipMissingItems, summarizeAfipMissing } from "@/lib/afip/messages";
import { formatCurrencyARS } from "@/lib/format";
import type { SaleRow } from "../sales/types";

type AfipStatus = {
  ok: boolean;
  env: string;
  missing: string[];
  missingOptional: string[];
  clientReady?: boolean;
  helpLinks?: Array<{ label: string; url: string }>;
};

type BillingClientProps = {
  initialSales: SaleRow[];
  afipStatus: AfipStatus;
};

const CONSUMER_FINAL_THRESHOLD = 10_000_000;

export default function BillingClient({
  initialSales,
  afipStatus,
}: BillingClientProps) {
  const [sales, setSales] = useState<SaleRow[]>(initialSales);
  const [sortOrder, setSortOrder] = useState("newest");
  const [billingQuery, setBillingQuery] = useState("");
  const [onlyCurrentMonth, setOnlyCurrentMonth] = useState(false);
  const [isAfipHelpOpen, setIsAfipHelpOpen] = useState(false);
  const [isToBillOpen, setIsToBillOpen] = useState(true);
  const [saleToInvoice, setSaleToInvoice] = useState<SaleRow | null>(null);
  const [isIssuing, setIsIssuing] = useState(false);
  const [invoiceStatus, setInvoiceStatus] = useState<string | null>(null);
  const [invoiceWarnings, setInvoiceWarnings] = useState<string[]>([]);
  const [invoiceForm, setInvoiceForm] = useState({
    type: "B" as "A" | "B",
    pointOfSale: "",
    docType: "",
    docNumber: "",
    requiresIncomeTaxDeduction: false,
  });

  const toBillSales = useMemo(
    () => sales.filter((sale) => sale.billingStatus === "TO_BILL"),
    [sales],
  );

  const filteredToBill = useMemo(() => {
    const query = billingQuery.trim().toLowerCase();
    const now = new Date();
    const list = toBillSales.filter((sale) => {
      if (query) {
        const haystack =
          `${sale.customerName} ${sale.saleNumber ?? ""}`.toLowerCase();
        if (!haystack.includes(query)) return false;
      }

      if (onlyCurrentMonth) {
        const saleDate = new Date(sale.saleDate ?? sale.createdAt);
        const sameMonth =
          saleDate.getMonth() === now.getMonth() &&
          saleDate.getFullYear() === now.getFullYear();
        if (!sameMonth) return false;
      }

      return true;
    });

    list.sort((a, b) => {
      const aDate = new Date(a.saleDate ?? a.createdAt).getTime();
      const bDate = new Date(b.saleDate ?? b.createdAt).getTime();
      return sortOrder === "oldest" ? aDate - bDate : bDate - aDate;
    });

    return list;
  }, [billingQuery, onlyCurrentMonth, sortOrder, toBillSales]);

  const activeFilterCount = useMemo(
    () =>
      [Boolean(billingQuery.trim()), onlyCurrentMonth, sortOrder !== "newest"]
        .filter(Boolean).length,
    [billingQuery, onlyCurrentMonth, sortOrder],
  );

  const billed = useMemo(
    () => sales.filter((sale) => sale.billingStatus === "BILLED"),
    [sales]
  );

  const totalToBill = toBillSales.reduce((total, sale) => {
    if (!sale.total) return total;
    const value = Number(sale.total);
    return Number.isFinite(value) ? total + value : total;
  }, 0);

  const afipReady = Boolean(afipStatus.ok && afipStatus.clientReady);
  const afipMissingItems = getAfipMissingItems(afipStatus.missing);
  const afipOptionalItems = getAfipMissingItems(afipStatus.missingOptional);
  const afipRequiredSummary = summarizeAfipMissing(afipStatus.missing);
  const afipOptionalSummary = summarizeAfipMissing(afipStatus.missingOptional);
  const afipHint = afipReady
    ? "Conexion ARCA activa"
    : afipStatus.ok
      ? afipOptionalSummary || "Cliente ARCA no disponible"
      : afipRequiredSummary ||
        afipOptionalSummary ||
        "Configuracion pendiente";
  const afipCardHint =
    afipHint === "Faltan certificados ARCA" ? null : afipHint;
  const afipStatusClass = afipReady
    ? "bg-white text-emerald-800 border border-emerald-200"
    : "bg-white text-rose-800 border border-rose-200";
  const helpLinkClass = (label: string) => {
    const normalized = label.toLowerCase();
    if (normalized.includes("token")) return "btn-sky";
    if (normalized.includes("certificado")) return "btn-amber";
    if (normalized.includes("autorizar")) return "btn-indigo";
    if (normalized.includes("punto de venta")) return "btn-emerald";
    return "";
  };

  const openInvoiceModal = (sale: SaleRow) => {
    setSaleToInvoice(sale);
    setInvoiceWarnings([]);
    setInvoiceStatus(null);
    setInvoiceForm({
      type: "B",
      pointOfSale: "",
      docType: sale.customerTaxId ? "80" : "",
      docNumber: sale.customerTaxId?.replace(/\D/g, "") ?? "",
      requiresIncomeTaxDeduction: false,
    });
  };

  const closeInvoiceModal = () => {
    if (isIssuing) return;
    setSaleToInvoice(null);
  };

  const invoiceTotal = Number(saleToInvoice?.total ?? 0);
  const isConsumerFinal =
    (saleToInvoice?.customerType ?? "CONSUMER_FINAL") === "CONSUMER_FINAL";
  const requiresIdentification =
    isConsumerFinal &&
    (invoiceTotal >= CONSUMER_FINAL_THRESHOLD ||
      invoiceForm.requiresIncomeTaxDeduction);
  const hasRecipientDoc =
    invoiceForm.docType.trim().length > 0 && invoiceForm.docNumber.trim().length > 0;

  const submitInvoice = async () => {
    if (!saleToInvoice) return;
    setInvoiceStatus(null);
    setInvoiceWarnings([]);
    setIsIssuing(true);
    try {
      const subtotal = Number(saleToInvoice.subtotal ?? saleToInvoice.total ?? 0);
      const iva = Number(saleToInvoice.taxes ?? 0);
      const total = Number(saleToInvoice.total ?? subtotal + iva);
      if (!Number.isFinite(total) || total <= 0) {
        setInvoiceStatus("No se pudo calcular totales de la venta.");
        return;
      }

      const res = await fetch("/api/fiscal-invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          saleId: saleToInvoice.id,
          type: invoiceForm.type,
          pointOfSale: invoiceForm.pointOfSale
            ? Number(invoiceForm.pointOfSale)
            : undefined,
          docType: invoiceForm.docType || undefined,
          docNumber: invoiceForm.docNumber || undefined,
          manualTotals: {
            net: Number.isFinite(subtotal) ? subtotal : total,
            iva: Number.isFinite(iva) ? iva : 0,
            total,
            exempt: 0,
          },
          requiresIncomeTaxDeduction: invoiceForm.requiresIncomeTaxDeduction,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setInvoiceStatus(data?.error ?? "No se pudo emitir factura");
        return;
      }

      const warnings = Array.isArray(data?.warnings)
        ? data.warnings.filter((item: unknown): item is string => typeof item === "string")
        : [];
      setInvoiceWarnings(warnings);
      setInvoiceStatus("Factura emitida correctamente.");
      setSales((prev) =>
        prev.map((sale) =>
          sale.id === saleToInvoice.id
            ? { ...sale, billingStatus: "BILLED" }
            : sale
        )
      );
      if (data?.id) {
        window.open(`/api/fiscal-invoices/${data.id}/pdf`, "_blank", "noopener,noreferrer");
      }
      setSaleToInvoice(null);
    } catch {
      setInvoiceStatus("No se pudo emitir factura");
    } finally {
      setIsIssuing(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900">
          Facturacion
        </h1>
        <p className="mt-2 text-sm text-zinc-600">
          Cola de ventas por facturar y documentos asociados.
        </p>
      </div>

      <div className="table-scroll pb-1">
        <div className="grid min-w-[760px] grid-cols-4 gap-2">
          <div className="card border !border-amber-200 p-3 !bg-white">
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2 text-xs font-medium text-amber-700">
                <DocumentTextIcon className="size-3.5" />
                Por facturar
              </span>
              <p className="text-base font-semibold text-zinc-900">
                {toBillSales.length}
              </p>
            </div>
          </div>
          <div className="card border !border-dashed !border-emerald-200 p-3 !bg-white">
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2 text-xs font-medium text-emerald-700">
                <CurrencyDollarIcon className="size-3.5" />
                Facturadas
              </span>
              <p className="text-base font-semibold text-zinc-900">
                {billed.length}
              </p>
            </div>
          </div>
          <div className="card border !border-dashed !border-indigo-200 p-3 !bg-white">
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2 text-xs font-medium text-indigo-700">
                <CurrencyDollarIcon className="size-3.5" />
                Total pendiente
              </span>
              <p className="text-base font-semibold text-zinc-900">
                {formatCurrencyARS(totalToBill)}
              </p>
            </div>
          </div>
          <div
            className={`card border p-3 ${
              afipReady
                ? "!border-emerald-200 !bg-white"
                : "!border-rose-200 !bg-white"
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span
                className={`flex items-center gap-2 text-xs font-medium ${
                  afipReady
                    ? "text-emerald-700"
                    : "text-rose-700"
                }`}
              >
                <DocumentTextIcon className="size-3.5" />
                ARCA
              </span>
              <p className="text-base font-semibold text-zinc-900">
                {afipReady ? "Conectado" : "Pendiente"}
              </p>
            </div>
            {afipCardHint ? (
              <p className="mt-1 text-xs text-zinc-500">{afipCardHint}</p>
            ) : null}
          </div>
        </div>
      </div>

      {afipMissingItems.length ||
      afipOptionalItems.length ||
      afipStatus.helpLinks?.length ? (
        <div className="card p-0 border-dashed border-sky-200">
          <button
            type="button"
            className="flex w-full cursor-pointer items-center justify-between gap-3 px-4 py-3 text-left [&::-webkit-details-marker]:hidden"
            onClick={() => setIsAfipHelpOpen((prev) => !prev)}
            aria-expanded={isAfipHelpOpen}
          >
            <div className="flex items-center gap-2">
              <DocumentTextIcon className="size-4 text-zinc-400" />
              <div>
                <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
                  Estado ARCA y ayuda
                </h3>
                <p className="text-xs text-zinc-500">{afipHint}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span
                className={`pill text-[9px] px-1.5 py-0.5 font-semibold ${afipStatusClass}`}
              >
                {afipReady ? "Listo" : "Pendiente"}
              </span>
              <span className="text-[10px] text-zinc-500">
                {isAfipHelpOpen ? "Ocultar" : "Mostrar"}
              </span>
              <ChevronDownIcon
                className={`size-4 text-zinc-500 transition-transform ${
                  isAfipHelpOpen ? "rotate-180" : ""
                }`}
              />
            </div>
          </button>
          <AnimatePresence initial={false}>
            {isAfipHelpOpen ? (
              <motion.div
                key="billing-afip-help"
                initial={{ height: 0, opacity: 0, y: -8 }}
                animate={{ height: "auto", opacity: 1, y: 0 }}
                exit={{ height: 0, opacity: 0, y: -8 }}
                transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
                className="reveal-motion"
              >
                <div className="border-t border-zinc-200/70 px-4 pb-5 pt-4">
                  <div className="space-y-4">
                    {afipMissingItems.length ? (
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                            Pendientes
                          </p>
                          <span className="pill text-[9px] px-1.5 py-0.5 font-semibold bg-white text-rose-800 border border-rose-200">
                            {afipMissingItems.length}
                          </span>
                        </div>
                        <ul className="mt-2 space-y-1 text-xs text-zinc-600">
                          {afipMissingItems.map((item) => (
                            <li key={item.key}>
                              <span className="font-medium text-zinc-900">
                                {item.title}
                              </span>
                              {item.description ? (
                                <span className="text-zinc-500">
                                  {" "}
                                  · {item.description}
                                </span>
                              ) : null}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                    {afipOptionalItems.length ? (
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                            Opcional
                          </p>
                          <span className="pill text-[9px] px-1.5 py-0.5 font-semibold bg-white text-amber-800 border border-amber-200">
                            {afipOptionalItems.length}
                          </span>
                        </div>
                        <ul className="mt-2 space-y-1 text-xs text-zinc-600">
                          {afipOptionalItems.map((item) => (
                            <li key={item.key}>
                              <span className="font-medium text-zinc-900">
                                {item.title}
                              </span>
                              {item.description ? (
                                <span className="text-zinc-500">
                                  {" "}
                                  · {item.description}
                                </span>
                              ) : null}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                    {afipStatus.helpLinks?.length ? (
                      <div className="flex flex-wrap gap-3">
                        {afipStatus.helpLinks.map((link) => (
                          <a
                            key={link.url}
                            className={`btn text-xs ${helpLinkClass(link.label)}`}
                            href={link.url}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {link.label}
                          </a>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      ) : null}

      {invoiceStatus || invoiceWarnings.length ? (
        <div className="card space-y-2 p-4">
          {invoiceStatus ? (
            <p className="text-sm font-medium text-zinc-800">{invoiceStatus}</p>
          ) : null}
          {invoiceWarnings.length ? (
            <ul className="space-y-1 text-xs text-amber-700">
              {invoiceWarnings.map((warning) => (
                <li key={warning}>• {warning}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <div className="card p-0 border-dashed border-sky-200">
        <button
          type="button"
          className="flex w-full cursor-pointer items-center justify-between gap-3 px-4 py-3 text-left"
          onClick={() => setIsToBillOpen((prev) => !prev)}
          aria-expanded={isToBillOpen}
        >
          <div className="flex items-center gap-2">
            <CurrencyDollarIcon className="size-4 text-zinc-400" />
            <div>
              <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
                Ventas pendientes de facturar
              </h3>
              <p className="text-xs text-zinc-500">
                {filteredToBill.length} de {toBillSales.length} resultados
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-zinc-500">
              {isToBillOpen ? "Ocultar" : "Mostrar"}
            </span>
            <ChevronDownIcon
              className={`size-4 text-zinc-500 transition-transform ${
                isToBillOpen ? "rotate-180" : ""
              }`}
            />
          </div>
        </button>
        <AnimatePresence initial={false}>
          {isToBillOpen ? (
            <motion.div
              key="billing-to-bill-panel"
              initial={{ height: 0, opacity: 0, y: -8 }}
              animate={{ height: "auto", opacity: 1, y: 0 }}
              exit={{ height: 0, opacity: 0, y: -8 }}
              transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
              className="reveal-motion"
            >
              <div className="border-t border-zinc-200/70 px-4 pb-4 pt-3">
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="pill border border-zinc-200/70 bg-zinc-100/50 px-2.5 py-1 text-[11px] font-semibold text-zinc-600">
                      {activeFilterCount} activos
                    </span>
                    <button
                      type="button"
                      className={`toggle-pill ${
                        onlyCurrentMonth ? "toggle-pill-active" : ""
                      }`}
                      onClick={() => setOnlyCurrentMonth((prev) => !prev)}
                      aria-pressed={onlyCurrentMonth}
                    >
                      Solo mes actual
                    </button>
                    <button
                      type="button"
                      className="btn btn-sky text-xs"
                      onClick={() => {
                        setBillingQuery("");
                        setOnlyCurrentMonth(false);
                        setSortOrder("newest");
                      }}
                    >
                      Limpiar
                    </button>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
                    <label className="field-stack">
                      <span className="input-label">Buscar</span>
                      <input
                        className="input w-full"
                        value={billingQuery}
                        onChange={(event) => setBillingQuery(event.target.value)}
                        placeholder="Cliente o numero de venta"
                      />
                    </label>
                    <label className="field-stack">
                      <span className="input-label">Orden</span>
                      <select
                        className="input cursor-pointer text-xs"
                        value={sortOrder}
                        onChange={(event) => setSortOrder(event.target.value)}
                        aria-label="Ordenar ventas por facturar"
                      >
                        <option value="newest">Mas recientes</option>
                        <option value="oldest">Mas antiguas</option>
                      </select>
                    </label>
                  </div>
                </div>
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <tbody>
                      {filteredToBill.length ? (
                        filteredToBill.map((sale) => (
                          <tr
                            key={sale.id}
                            className="border-t border-zinc-200/60 transition-colors hover:bg-white/60"
                          >
                            <td className="py-2 pr-4 text-zinc-600">
                              {sale.saleNumber ?? "-"}
                            </td>
                            <td className="py-2 pr-4 text-zinc-900">
                              {sale.customerName}
                            </td>
                            <td className="py-2 pr-4 text-zinc-600">
                              {sale.saleDate
                                ? new Date(sale.saleDate).toLocaleDateString(
                                    "es-AR",
                                  )
                                : new Date(sale.createdAt).toLocaleDateString(
                                    "es-AR",
                                  )}
                            </td>
                            <td className="py-2 pr-4 text-zinc-900">
                              {sale.total
                                ? formatCurrencyARS(sale.total.toString())
                                : "-"}
                            </td>
                            <td className="py-2 pr-4">
                              <div className="flex flex-wrap items-center gap-2">
                                <a
                                  className="btn text-xs"
                                  href={`/api/pdf/sale?id=${sale.id}`}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  <ArrowDownTrayIcon className="size-4" />
                                  PDF venta
                                </a>
                                <button
                                  type="button"
                                  className="btn btn-emerald text-xs"
                                  onClick={() => openInvoiceModal(sale)}
                                  disabled={!afipReady}
                                >
                                  Facturar
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td className="py-3 text-sm text-zinc-500" colSpan={5}>
                            {toBillSales.length
                              ? "No hay resultados para los filtros aplicados."
                              : "Sin ventas pendientes."}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>

      {saleToInvoice ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/35 p-4 sm:items-center">
          <div className="card w-full max-w-xl space-y-4 p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-zinc-900">
                  Emitir factura
                </h3>
                <p className="text-xs text-zinc-500">
                  Venta {saleToInvoice.saleNumber ?? saleToInvoice.id} ·{" "}
                  {saleToInvoice.customerName}
                </p>
              </div>
              <button
                type="button"
                className="btn text-xs"
                onClick={closeInvoiceModal}
                disabled={isIssuing}
              >
                Cerrar
              </button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="field-stack">
                <span className="input-label">Tipo</span>
                <select
                  className="input cursor-pointer"
                  value={invoiceForm.type}
                  onChange={(event) =>
                    setInvoiceForm((prev) => ({
                      ...prev,
                      type: event.target.value as "A" | "B",
                    }))
                  }
                >
                  <option value="A">Factura A</option>
                  <option value="B">Factura B</option>
                </select>
              </label>
              <label className="field-stack">
                <span className="input-label">Punto de venta (opc.)</span>
                <input
                  className="input no-spinner"
                  inputMode="numeric"
                  value={invoiceForm.pointOfSale}
                  onChange={(event) =>
                    setInvoiceForm((prev) => ({
                      ...prev,
                      pointOfSale: event.target.value.replace(/\D/g, ""),
                    }))
                  }
                  placeholder="Auto"
                />
              </label>
              <label className="field-stack">
                <span className="input-label">Doc tipo (opc.)</span>
                <input
                  className="input"
                  value={invoiceForm.docType}
                  onChange={(event) =>
                    setInvoiceForm((prev) => ({
                      ...prev,
                      docType: event.target.value,
                    }))
                  }
                  placeholder="80 o CUIT"
                />
              </label>
              <label className="field-stack">
                <span className="input-label">Doc numero (opc.)</span>
                <input
                  className="input no-spinner"
                  inputMode="numeric"
                  value={invoiceForm.docNumber}
                  onChange={(event) =>
                    setInvoiceForm((prev) => ({
                      ...prev,
                      docNumber: event.target.value.replace(/\D/g, ""),
                    }))
                  }
                />
              </label>
            </div>
            <label className="flex items-center gap-2 text-xs text-zinc-600">
              <input
                type="checkbox"
                checked={invoiceForm.requiresIncomeTaxDeduction}
                onChange={(event) =>
                  setInvoiceForm((prev) => ({
                    ...prev,
                    requiresIncomeTaxDeduction: event.target.checked,
                  }))
                }
              />
              El receptor solicita deduccion en Ganancias
            </label>
            {requiresIdentification && !hasRecipientDoc ? (
              <p className="rounded-xl border border-amber-200 bg-white px-3 py-2 text-xs text-amber-800">
                Advertencia: por monto o deduccion corresponde identificar receptor.
                Se puede continuar, pero quedara aviso de cumplimiento.
              </p>
            ) : null}
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm text-zinc-600">
                Total:{" "}
                <span className="font-semibold text-zinc-900">
                  {formatCurrencyARS(saleToInvoice.total ?? "0")}
                </span>
              </p>
              <button
                type="button"
                className="btn btn-emerald text-xs"
                onClick={submitInvoice}
                disabled={isIssuing}
              >
                {isIssuing ? "Emitiendo..." : "Emitir factura"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
