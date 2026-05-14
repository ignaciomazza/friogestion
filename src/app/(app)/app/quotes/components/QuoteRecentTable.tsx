"use client";

import { Fragment, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowDownTrayIcon,
  CheckIcon,
  PencilSquareIcon,
  TrashIcon,
} from "@/components/icons";
import { WhatsappPdfButton } from "@/components/WhatsappPdfButton";
import { formatCurrencyARS } from "@/lib/format";
import { getAdjustmentLabel } from "@/lib/sale-adjustments";
import { QUOTE_STATUS_LABELS, QUOTE_STATUS_STYLES } from "../constants";
import type { ProductOption, QuoteRow } from "../types";
import { formatProductLabel, formatUnit } from "../utils";

type QuoteDetailItem = {
  productId: string;
  qty: string;
  unitPrice: string;
  taxRate: string;
  product: ProductOption;
};

type QuoteDetail = {
  id: string;
  subtotal: string | null;
  taxes: string | null;
  extraType: string | null;
  extraAmount: string | null;
  total: string | null;
  items: QuoteDetailItem[];
};

const toNumber = (value: string | null | undefined) => {
  if (value === null || value === undefined) return null;
  const numeric = Number(value.replace(",", "."));
  return Number.isFinite(numeric) ? numeric : null;
};

type QuoteRecentTableProps = {
  quotes: QuoteRow[];
  sortOrder: string;
  onSortOrderChange: (value: string) => void;
  onEdit: (quote: QuoteRow) => void;
  onDelete: (quote: QuoteRow) => void;
  onConfirmSale: (quote: QuoteRow) => void;
  isBusyId: string | null;
};

export function QuoteRecentTable({
  quotes,
  sortOrder,
  onSortOrderChange,
  onEdit,
  onDelete,
  onConfirmSale,
  isBusyId,
}: QuoteRecentTableProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detailsById, setDetailsById] = useState<Record<string, QuoteDetail>>(
    {},
  );
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<Record<string, string>>({});

  const handleToggleRow = async (quote: QuoteRow) => {
    if (expandedId === quote.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(quote.id);

    if (detailsById[quote.id] || loadingId === quote.id) {
      return;
    }

    setLoadingId(quote.id);
    setDetailError((prev) => ({ ...prev, [quote.id]: "" }));

    try {
      const res = await fetch(`/api/quotes?id=${quote.id}`);
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? "No se pudo cargar");
      }
      const detail = (await res.json()) as QuoteDetail;
      setDetailsById((prev) => ({ ...prev, [quote.id]: detail }));
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "No se pudo cargar";
      setDetailError((prev) => ({ ...prev, [quote.id]: message }));
    } finally {
      setLoadingId((prev) => (prev === quote.id ? null : prev));
    }
  };

  return (
    <div className="card space-y-5 p-4 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
          Presupuestos recientes
        </h3>
        <div className="flex flex-wrap items-center gap-3 sm:justify-end">
          {quotes.length === 0 ? (
            <span className="pill border border-emerald-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-emerald-800">
              0 resultados
            </span>
          ) : (
            <span className="text-xs text-zinc-500">
              {quotes.length} resultados
            </span>
          )}
          <select
            className="input w-full cursor-pointer text-xs sm:w-auto"
            value={sortOrder}
            onChange={(event) => onSortOrderChange(event.target.value)}
            aria-label="Ordenar presupuestos"
          >
            <option value="newest">Mas recientes</option>
            <option value="oldest">Mas antiguos</option>
          </select>
        </div>
      </div>
      <div className="table-scroll">
        <table className="w-full min-w-[900px] text-left text-xs">
          <thead className="text-[11px] uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="py-2 pr-4">Presupuesto</th>
              <th className="py-2 pr-4">Cliente</th>
              <th className="py-2 pr-4">Vigencia</th>
              <th className="py-2 pr-4">Estado</th>
              <th className="py-2 pr-4">Total</th>
              <th className="py-2 pr-4 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {quotes.length ? (
              quotes.map((quote) => {
                const isBusy = isBusyId === quote.id;
                const isLocked = Boolean(quote.saleId);
                const isExpanded = expandedId === quote.id;
                const detail = detailsById[quote.id];
                const subtotal = detail?.subtotal ?? quote.subtotal;
                const taxes = detail?.taxes ?? quote.taxes;
                const extraAmount = detail?.extraAmount ?? null;
                const total = detail?.total ?? quote.total;
                const extraAmountNumeric = toNumber(extraAmount);
                const extraLabel = getAdjustmentLabel(
                  detail?.extraType,
                  extraAmountNumeric,
                );
                return (
                  <Fragment key={quote.id}>
                    <tr
                      className="border-t border-zinc-200/60 transition-colors hover:bg-white/60 cursor-pointer"
                      onClick={() => {
                        void handleToggleRow(quote);
                      }}
                      aria-expanded={isExpanded}
                    >
                      <td className="py-2 pr-4 whitespace-nowrap text-zinc-600">
                        {quote.quoteNumber ?? "-"}
                      </td>
                      <td className="py-2 pr-4 text-zinc-900">
                        <div className="max-w-[220px] space-y-0.5">
                          <p className="truncate">{quote.customerName}</p>
                          {quote.priceListName ? (
                            <p className="text-[11px] text-zinc-500">
                              Lista: {quote.priceListName}
                            </p>
                          ) : null}
                        </div>
                      </td>
                      <td className="py-2 pr-4 whitespace-nowrap text-zinc-600">
                        {quote.validUntil
                          ? new Date(quote.validUntil).toLocaleDateString(
                              "es-AR",
                            )
                          : new Date(quote.createdAt).toLocaleDateString(
                              "es-AR",
                            )}
                      </td>
                      <td className="py-2 pr-4">
                        <span
                          className={`rounded-full px-3 py-1.5 text-[11px] font-semibold uppercase backdrop-blur-xl ${
                            QUOTE_STATUS_STYLES[quote.status] ??
                            "bg-zinc-500/10 text-zinc-700 border border-zinc-500/20"
                          }`}
                        >
                          {QUOTE_STATUS_LABELS[quote.status] ?? quote.status}
                        </span>
                      </td>
                      <td className="py-2 pr-4 text-zinc-900">
                        {total ? formatCurrencyARS(total) : "-"}
                      </td>
                      <td className="py-2 pr-4">
                        <div className="flex flex-wrap items-center justify-end gap-2">
                          <a
                            className="btn text-xs transition-transform hover:-translate-y-0.5"
                            href={`/api/pdf/quote?id=${quote.id}`}
                            target="_blank"
                            rel="noreferrer"
                            onClick={(event) => event.stopPropagation()}
                          >
                            <ArrowDownTrayIcon className="size-4" />
                            PDF
                          </a>
                          <WhatsappPdfButton
                            documentType="quote"
                            documentId={quote.id}
                            documentLabel={
                              quote.quoteNumber
                                ? `Presupuesto ${quote.quoteNumber}`
                                : "Presupuesto"
                            }
                            customerName={quote.customerName}
                            customerPhone={quote.customerPhone}
                            stopPropagation
                          />
                          <button
                            type="button"
                            className="btn btn-emerald text-xs transition-transform hover:-translate-y-0.5"
                            onClick={(event) => {
                              event.stopPropagation();
                              onConfirmSale(quote);
                            }}
                            disabled={isLocked || isBusy}
                          >
                            <CheckIcon className="size-4" />
                            {isLocked ? "Confirmada" : "Confirmar venta"}
                          </button>
                          <button
                            type="button"
                            className="btn text-xs transition-transform hover:-translate-y-0.5"
                            onClick={(event) => {
                              event.stopPropagation();
                              onEdit(quote);
                            }}
                            disabled={isLocked || isBusy}
                            aria-label="Editar"
                          >
                            <PencilSquareIcon className="size-4" />
                          </button>
                          <button
                            type="button"
                            className="btn btn-rose text-xs transition-transform hover:-translate-y-0.5"
                            onClick={(event) => {
                              event.stopPropagation();
                              onDelete(quote);
                            }}
                            disabled={isLocked || isBusy}
                            aria-label="Eliminar"
                          >
                            <TrashIcon className="size-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                    <AnimatePresence initial={false}>
                      {isExpanded ? (
                        <motion.tr
                          key={`quote-row-expanded-${quote.id}`}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          className="bg-white/40"
                        >
                          <td className="px-4 py-0" colSpan={6}>
                            <motion.div
                              initial={{ height: 0, opacity: 0, y: -8 }}
                              animate={{ height: "auto", opacity: 1, y: 0 }}
                              exit={{ height: 0, opacity: 0, y: -8 }}
                              transition={{
                                duration: 0.24,
                                ease: [0.22, 1, 0.36, 1],
                              }}
                              className="overflow-hidden py-4"
                            >
                              {loadingId === quote.id ? (
                                <p className="text-xs text-zinc-500">
                                  Cargando detalle...
                                </p>
                              ) : detailError[quote.id] ? (
                                <p className="text-xs text-rose-500">
                                  {detailError[quote.id]}
                                </p>
                              ) : detail ? (
                                <div className="space-y-4">
                                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                                    <div className="space-y-1">
                                      <p className="text-[11px] uppercase tracking-wide text-zinc-500">
                                        Subtotal
                                      </p>
                                      <p className="text-sm font-semibold text-zinc-900">
                                        {formatCurrencyARS(subtotal)}
                                      </p>
                                    </div>
                                    <div className="space-y-1">
                                      <p className="text-[11px] uppercase tracking-wide text-zinc-500">
                                        IVA
                                      </p>
                                      <p className="text-sm font-semibold text-zinc-900">
                                        {formatCurrencyARS(taxes)}
                                      </p>
                                    </div>
                                    <div className="space-y-1">
                                      <p className="text-[11px] uppercase tracking-wide text-zinc-500">
                                        {extraLabel}
                                      </p>
                                      <p className="text-sm font-semibold text-zinc-900">
                                        {formatCurrencyARS(extraAmount)}
                                      </p>
                                    </div>
                                    <div className="space-y-1">
                                      <p className="text-[11px] uppercase tracking-wide text-zinc-500">
                                        Total
                                      </p>
                                      <p className="text-sm font-semibold text-zinc-900">
                                        {formatCurrencyARS(total)}
                                      </p>
                                    </div>
                                  </div>

                                  <div className="table-scroll">
                                    <table className="w-full min-w-[760px] text-left text-xs">
                                      <thead className="text-[11px] uppercase tracking-wide text-zinc-500">
                                        <tr>
                                          <th className="py-2 pr-3">Producto</th>
                                          <th className="py-2 pr-3 text-right">
                                            Cantidad
                                          </th>
                                          <th className="py-2 pr-3 text-right">
                                            Precio unit.
                                          </th>
                                          <th className="py-2 pr-3 text-right">
                                            IVA
                                          </th>
                                          <th className="py-2 pr-3 text-right">
                                            Total
                                          </th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {detail.items.map((item, itemIndex) => {
                                          const qty = toNumber(item.qty) ?? 0;
                                          const unitPrice =
                                            toNumber(item.unitPrice) ?? 0;
                                          const taxRate =
                                            toNumber(item.taxRate) ?? 0;
                                          const lineTotal = qty * unitPrice;
                                          const lineTax =
                                            lineTotal * (taxRate / 100);
                                          return (
                                            <tr
                                              key={`${item.productId}-${itemIndex}`}
                                              className="border-t border-zinc-200/60"
                                            >
                                              <td className="py-2 pr-3 text-zinc-900">
                                                <div className="space-y-1">
                                                  <p className="font-medium">
                                                    {formatProductLabel(
                                                      item.product,
                                                    )}
                                                  </p>
                                                  <p className="text-[11px] text-zinc-500">
                                                    Unidad:{" "}
                                                    {formatUnit(
                                                      item.product.unit ?? null,
                                                    )}
                                                  </p>
                                                </div>
                                              </td>
                                              <td className="py-2 pr-3 text-right text-zinc-600">
                                                {item.qty}
                                              </td>
                                              <td className="py-2 pr-3 text-right text-zinc-600">
                                                {formatCurrencyARS(
                                                  item.unitPrice,
                                                )}
                                              </td>
                                              <td className="py-2 pr-3 text-right text-zinc-600">
                                                {item.taxRate}%
                                              </td>
                                              <td className="py-2 pr-3 text-right text-zinc-900">
                                                {formatCurrencyARS(lineTotal)}
                                                <span className="ml-2 text-[11px] text-zinc-500">
                                                  IVA{" "}
                                                  {formatCurrencyARS(lineTax)}
                                                </span>
                                              </td>
                                            </tr>
                                          );
                                        })}
                                      </tbody>
                                    </table>
                                  </div>
                                </div>
                              ) : (
                                <p className="text-xs text-zinc-500">
                                  Sin detalle disponible.
                                </p>
                              )}
                            </motion.div>
                          </td>
                        </motion.tr>
                      ) : null}
                    </AnimatePresence>
                  </Fragment>
                );
              })
            ) : (
              <tr>
                <td className="py-4 text-sm text-zinc-500" colSpan={6}>
                  Sin presupuestos por ahora.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
