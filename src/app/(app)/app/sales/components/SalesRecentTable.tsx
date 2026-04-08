"use client";

import { Fragment, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowDownTrayIcon } from "@/components/icons";
import { formatCurrencyARS } from "@/lib/format";
import type { SaleRow } from "../types";
import { ReceiptForm } from "./ReceiptForm";

type PaymentMethodOption = {
  id: string;
  name: string;
  type: string;
  requiresAccount: boolean;
  requiresApproval: boolean;
  requiresDoubleCheck: boolean;
};

type AccountOption = {
  id: string;
  name: string;
  type: string;
  currencyCode: string;
};

type CurrencyOption = {
  id: string;
  code: string;
  name: string;
  symbol?: string | null;
  isDefault: boolean;
};

type ReceiptLineRow = {
  id: string;
  paymentMethodName: string;
  accountName: string | null;
  currencyCode: string;
  amount: string;
  amountBase: string;
  fxRateUsed: string | null;
  requiresVerification: boolean;
  verifiedAt: string | null;
};

type ReceiptRow = {
  id: string;
  status: string;
  total: string;
  receivedAt: string;
  confirmedAt: string | null;
  lines: ReceiptLineRow[];
};

const RECEIPT_STATUS_LABELS: Record<string, string> = {
  PENDING: "Pendiente",
  CONFIRMED: "Confirmado",
  REJECTED: "Rechazado",
};

const DOUBLE_CHECK_LABELS: Record<string, string> = {
  PENDING: "Doble control pendiente",
  VERIFIED: "Doble control OK",
};

const DOUBLE_CHECK_STYLES: Record<string, string> = {
  PENDING:
    "bg-white text-amber-800 border border-amber-200",
  VERIFIED:
    "bg-white text-emerald-800 border border-emerald-200",
};

type SalesRecentTableProps = {
  sales: SaleRow[];
  sortOrder: string;
  onSortOrderChange: (value: string) => void;
  paymentMethods: PaymentMethodOption[];
  accounts: AccountOption[];
  currencies: CurrencyOption[];
  canApproveReceipts: boolean;
  latestUsdRate: string | null;
  onReceiptsUpdated: () => void;
};

export function SalesRecentTable({
  sales,
  sortOrder,
  onSortOrderChange,
  paymentMethods,
  accounts,
  currencies,
  canApproveReceipts,
  latestUsdRate,
  onReceiptsUpdated,
}: SalesRecentTableProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [receiptsBySale, setReceiptsBySale] = useState<
    Record<string, ReceiptRow[]>
  >({});
  const [loadingReceiptId, setLoadingReceiptId] = useState<string | null>(null);
  const [receiptStatus, setReceiptStatus] = useState<Record<string, string>>({});
  const [confirmingReceiptId, setConfirmingReceiptId] = useState<string | null>(
    null,
  );

  const loadReceipts = async (saleId: string) => {
    setLoadingReceiptId(saleId);
    try {
      const res = await fetch(`/api/receipts?saleId=${encodeURIComponent(saleId)}`);
      if (!res.ok) {
        setReceiptStatus((prev) => ({
          ...prev,
          [saleId]: "No se pudieron cargar cobros",
        }));
        return;
      }
      const data = (await res.json()) as ReceiptRow[];
      setReceiptsBySale((prev) => ({ ...prev, [saleId]: data }));
    } catch {
      setReceiptStatus((prev) => ({
        ...prev,
        [saleId]: "No se pudieron cargar cobros",
      }));
    } finally {
      setLoadingReceiptId(null);
    }
  };

  const handleConfirmReceipt = async (saleId: string, receiptId: string) => {
    setConfirmingReceiptId(receiptId);
    setReceiptStatus((prev) => ({ ...prev, [saleId]: "" }));
    try {
      const res = await fetch("/api/receipts/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: receiptId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setReceiptStatus((prev) => ({
          ...prev,
          [saleId]: data?.error ?? "No se pudo confirmar",
        }));
        return;
      }
      setReceiptStatus((prev) => ({
        ...prev,
        [saleId]: "Cobro confirmado",
      }));
      await loadReceipts(saleId);
      onReceiptsUpdated();
    } catch {
      setReceiptStatus((prev) => ({
        ...prev,
        [saleId]: "No se pudo confirmar",
      }));
    } finally {
      setConfirmingReceiptId(null);
    }
  };

  return (
    <div className="card space-y-5 border border-sky-200 p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
          Ventas recientes
        </h3>
        <div className="flex flex-wrap items-center gap-3">
          {sales.length > 0 ? (
            <span className="text-xs text-zinc-500">
              {sales.length} resultados
            </span>
          ) : null}
          <select
            className="input cursor-pointer text-xs"
            value={sortOrder}
            onChange={(event) => onSortOrderChange(event.target.value)}
            aria-label="Ordenar ventas"
          >
            <option value="newest">Mas recientes</option>
            <option value="oldest">Mas antiguos</option>
          </select>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="text-[11px] uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="py-2 pr-4">Venta</th>
              <th className="py-2 pr-4">Cliente</th>
              <th className="py-2 pr-4">Fecha</th>
              <th className="py-2 pr-4">Producto</th>
              <th className="py-2 pr-4 text-right">Cantidad</th>
              <th className="py-2 pr-4 text-right">Precio unit.</th>
              <th className="py-2 pr-4 text-right">IVA</th>
              <th className="py-2 pr-4 text-right">Total</th>
              <th className="py-2 pr-4 text-right">Cobrado</th>
              <th className="py-2 pr-4 text-right">Pendiente</th>
              <th className="py-2 pr-4 text-right">PDF</th>
            </tr>
          </thead>
          <tbody>
            {sales.length ? (
              sales.map((sale) => {
                const isExpanded = expandedId === sale.id;
                const paidTotal = sale.paidTotal ?? "0";
                const balance = sale.balance ?? sale.total ?? "0";
                return (
                  <Fragment key={sale.id}>
                    <tr
                      key={sale.id}
                      className="cursor-pointer border-t border-sky-200 transition-colors hover:bg-white/60"
                      onClick={() => {
                        const nextId = isExpanded ? null : sale.id;
                        setExpandedId(nextId);
                        if (!isExpanded && !receiptsBySale[sale.id]) {
                          void loadReceipts(sale.id);
                        }
                      }}
                      aria-expanded={isExpanded}
                    >
                      <td className="py-2 pr-4 whitespace-nowrap text-zinc-600">
                        {sale.saleNumber ?? "-"}
                      </td>
                      <td className="py-2 pr-4 text-zinc-900">
                        {sale.customerName}
                      </td>
                      <td className="py-2 pr-4 whitespace-nowrap text-zinc-600">
                        {sale.saleDate
                          ? new Date(sale.saleDate).toLocaleDateString("es-AR")
                          : new Date(sale.createdAt).toLocaleDateString("es-AR")}
                      </td>
                      <td className="py-2 pr-4 align-top">
                        <div className="space-y-1 pt-0.5">
                          {sale.items?.length ? (
                            sale.items.map((item, itemIndex) => (
                              <div
                                key={`${item.id ?? item.productName}-${itemIndex}`}
                                className="text-[11px]"
                              >
                                <span className="truncate font-medium text-zinc-900">
                                  {item.productName}
                                </span>
                              </div>
                            ))
                          ) : (
                            <span className="text-[11px] text-zinc-500">
                              Sin items
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-2 pr-4 align-top text-right">
                        <div className="space-y-1 pt-0.5 text-[11px] text-zinc-600">
                          {sale.items?.length
                            ? sale.items.map((item, itemIndex) => (
                                <div key={`${item.id ?? item.productName}-qty-${itemIndex}`}>
                                  {item.qty}
                                </div>
                              ))
                            : "-"}
                        </div>
                      </td>
                      <td className="py-2 pr-4 align-top text-right">
                        <div className="space-y-1 pt-0.5 text-[11px] text-zinc-600">
                          {sale.items?.length
                            ? sale.items.map((item, itemIndex) => (
                                <div key={`${item.id ?? item.productName}-unit-${itemIndex}`}>
                                  {formatCurrencyARS(item.unitPrice)}
                                </div>
                              ))
                            : "-"}
                        </div>
                      </td>
                      <td className="py-2 pr-4 align-top text-right">
                        <div className="space-y-1 pt-0.5 text-[11px] text-zinc-600">
                          {sale.items?.length
                            ? sale.items.map((item, itemIndex) => (
                                <div key={`${item.id ?? item.productName}-tax-${itemIndex}`}>
                                  {item.taxRate ?? "0"}%
                                </div>
                              ))
                            : "-"}
                        </div>
                      </td>
                      <td className="py-2 pr-4 text-right text-zinc-900">
                        {sale.total
                          ? formatCurrencyARS(sale.total.toString())
                          : "-"}
                      </td>
                      <td className="py-2 pr-4 text-right text-zinc-900">
                        {formatCurrencyARS(paidTotal)}
                      </td>
                      <td className="py-2 pr-4 text-right text-zinc-900">
                        {formatCurrencyARS(balance)}
                      </td>
                      <td className="py-2 pr-4">
                        <div className="flex flex-wrap items-center justify-end">
                          <a
                            className="btn text-xs transition-transform hover:-translate-y-0.5"
                            href={`/api/pdf/sale?id=${sale.id}`}
                            target="_blank"
                            rel="noreferrer"
                            onClick={(event) => event.stopPropagation()}
                          >
                            <ArrowDownTrayIcon className="size-4" />
                            PDF
                          </a>
                        </div>
                      </td>
                    </tr>
                    <AnimatePresence initial={false}>
                      {isExpanded ? (
                        <motion.tr
                          key={`sale-row-expanded-${sale.id}`}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          className="bg-white/40"
                        >
                          <td colSpan={11} className="px-4 py-0">
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
                              <div className="space-y-4">
                                <div className="space-y-3">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <h4 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                                  Cobros
                                </h4>
                              </div>

                              {receiptStatus[sale.id] ? (
                                <p className="text-xs text-zinc-500">
                                  {receiptStatus[sale.id]}
                                </p>
                              ) : null}

                              {loadingReceiptId === sale.id ? (
                                <p className="text-xs text-zinc-500">
                                  Cargando cobros...
                                </p>
                              ) : receiptsBySale[sale.id]?.length ? (
                                <div className="space-y-2">
                                  {receiptsBySale[sale.id].map((receipt) => {
                                    const verificationLines = receipt.lines.filter(
                                      (line) => line.requiresVerification,
                                    );
                                    const hasPendingVerification =
                                      verificationLines.some((line) => !line.verifiedAt);
                                    return (
                                      <div
                                        key={receipt.id}
                                        className="rounded-2xl border border-sky-200 bg-white p-3 text-xs text-zinc-600"
                                      >
                                      <div className="flex flex-wrap items-center justify-between gap-3">
                                        <div>
                                          <p className="text-[11px] uppercase tracking-wide text-zinc-500">
                                            {RECEIPT_STATUS_LABELS[receipt.status] ??
                                              receipt.status}
                                          </p>
                                          <p className="text-xs text-zinc-500">
                                            Recibido{" "}
                                            {new Date(receipt.receivedAt).toLocaleDateString(
                                              "es-AR",
                                            )}
                                          </p>
                                          {verificationLines.length ? (
                                            <span
                                              className={`mt-2 inline-flex rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase ${
                                                hasPendingVerification
                                                  ? DOUBLE_CHECK_STYLES.PENDING
                                                  : DOUBLE_CHECK_STYLES.VERIFIED
                                              }`}
                                            >
                                              {hasPendingVerification
                                                ? DOUBLE_CHECK_LABELS.PENDING
                                                : DOUBLE_CHECK_LABELS.VERIFIED}
                                            </span>
                                          ) : null}
                                        </div>
                                        <div className="flex items-center gap-2">
                                          <span className="text-sm font-semibold text-zinc-900">
                                            {formatCurrencyARS(receipt.total)}
                                          </span>
                                          <a
                                            className="btn text-xs"
                                            href={`/api/pdf/receipt?id=${receipt.id}`}
                                            target="_blank"
                                            rel="noreferrer"
                                          >
                                            <ArrowDownTrayIcon className="size-4" />
                                            Recibo
                                          </a>
                                          {receipt.status === "PENDING" &&
                                          canApproveReceipts ? (
                                            <button
                                              type="button"
                                              className="btn btn-emerald text-xs"
                                              disabled={confirmingReceiptId === receipt.id}
                                              onClick={() =>
                                                handleConfirmReceipt(sale.id, receipt.id)
                                              }
                                            >
                                              {confirmingReceiptId === receipt.id
                                                ? "Confirmando..."
                                                : "Confirmar"}
                                            </button>
                                          ) : null}
                                        </div>
                                      </div>
                                      {receipt.lines.length ? (
                                        <ul className="mt-2 space-y-1 text-[11px] text-zinc-500">
                                          {receipt.lines.map((line) => (
                                            <li
                                              key={line.id}
                                              className="flex flex-wrap items-center gap-2"
                                            >
                                              <span className="pill text-[9px] px-2 py-0.5 font-semibold bg-white text-sky-800 border border-sky-200">
                                                {line.paymentMethodName}
                                              </span>
                                              {line.accountName ? (
                                                <span className="pill text-[9px] px-2 py-0.5 font-semibold bg-zinc-100/30 text-zinc-700 border border-zinc-200/70">
                                                  {line.accountName}
                                                </span>
                                              ) : null}
                                              {line.requiresVerification ? (
                                                <span
                                                  className={`pill text-[9px] px-2 py-0.5 font-semibold ${
                                                    line.verifiedAt
                                                      ? DOUBLE_CHECK_STYLES.VERIFIED
                                                      : DOUBLE_CHECK_STYLES.PENDING
                                                  }`}
                                                >
                                                  {line.verifiedAt
                                                    ? "Doble control OK"
                                                    : "Doble control pendiente"}
                                                </span>
                                              ) : null}
                                            </li>
                                          ))}
                                        </ul>
                                      ) : null}
                                    </div>
                                    );
                                  })}
                                </div>
                              ) : (
                                <p className="text-xs text-zinc-500">
                                  Sin cobros registrados.
                                </p>
                              )}

                              <div className="rounded-2xl border border-dashed border-sky-200 bg-white p-3">
                                <ReceiptForm
                                  saleId={sale.id}
                                  saleTotal={sale.total}
                                  paymentMethods={paymentMethods}
                                  accounts={accounts}
                                  currencies={currencies}
                                  latestUsdRate={latestUsdRate}
                                  onCreated={() => {
                                    void loadReceipts(sale.id);
                                    onReceiptsUpdated();
                                  }}
                                />
                              </div>
                                </div>
                              </div>
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
                <td className="py-4 text-sm text-zinc-500" colSpan={11}>
                  Sin ventas por ahora.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
