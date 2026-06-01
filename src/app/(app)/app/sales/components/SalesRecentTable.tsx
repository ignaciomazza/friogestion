"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowDownTrayIcon,
  CurrencyDollarIcon,
  EyeIcon,
  PencilSquareIcon,
  TrashIcon,
  XMarkIcon,
} from "@/components/icons";
import { formatCurrencyARS } from "@/lib/format";
import { getAdjustmentLabel } from "@/lib/sale-adjustments";
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
  paymentMethodId: string;
  accountId: string | null;
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
  receiptNumber: string | null;
  status: string;
  total: string;
  receivedAt: string;
  confirmedAt: string | null;
  lines: ReceiptLineRow[];
};

type SalesRecentTableProps = {
  sales: SaleRow[];
  sortOrder: string;
  onSortOrderChange: (value: string) => void;
  canManage: boolean;
  paymentMethods: PaymentMethodOption[];
  accounts: AccountOption[];
  currencies: CurrencyOption[];
  latestUsdRate: string | null;
  onReceiptsUpdated: () => void;
};

const formatItemTaxRate = (value: string | null | undefined) => {
  const rate = Number(value ?? 0);
  if (!Number.isFinite(rate)) return "0%";
  if (Math.abs(rate) < 0.0001) return "Sin IVA";
  if (Math.abs(rate - Math.round(rate)) < 0.001) return `${Math.round(rate)}%`;
  return `${rate.toString().replace(".", ",")}%`;
};

const PAYMENT_SETTLEMENT_TOLERANCE = 0.01;

export function SalesRecentTable({
  sales,
  sortOrder,
  onSortOrderChange,
  canManage,
  paymentMethods,
  accounts,
  currencies,
  latestUsdRate,
  onReceiptsUpdated,
}: SalesRecentTableProps) {
  const [selectedSaleId, setSelectedSaleId] = useState<string | null>(null);
  const [isPortalReady, setIsPortalReady] = useState(false);
  const [isReceiptPanelOpen, setIsReceiptPanelOpen] = useState(false);
  const [receiptsBySale, setReceiptsBySale] = useState<
    Record<string, ReceiptRow[]>
  >({});
  const [loadingReceiptId, setLoadingReceiptId] = useState<string | null>(null);
  const [receiptStatus, setReceiptStatus] = useState<Record<string, string>>({});
  const [tableStatus, setTableStatus] = useState<string | null>(null);
  const [deletingSaleId, setDeletingSaleId] = useState<string | null>(null);
  const [editingReceiptId, setEditingReceiptId] = useState<string | null>(null);
  const [deletingReceiptId, setDeletingReceiptId] = useState<string | null>(null);

  const selectedSale = useMemo(
    () => sales.find((sale) => sale.id === selectedSaleId) ?? null,
    [sales, selectedSaleId],
  );

  useEffect(() => {
    setIsPortalReady(true);
  }, []);

  useEffect(() => {
    if (!selectedSaleId) return;
    const stillExists = sales.some((sale) => sale.id === selectedSaleId);
    if (!stillExists) {
      setSelectedSaleId(null);
      setIsReceiptPanelOpen(false);
      setEditingReceiptId(null);
    }
  }, [sales, selectedSaleId]);

  useEffect(() => {
    if (!selectedSaleId) return;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setSelectedSaleId(null);
      setIsReceiptPanelOpen(false);
      setEditingReceiptId(null);
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [selectedSaleId]);

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

  const handleDeleteSale = async (sale: SaleRow) => {
    if (sale.billingStatus === "BILLED") {
      setTableStatus("Solo se pueden cancelar ventas no facturadas");
      return;
    }
    if (!window.confirm("Seguro quiere cancelar esta venta?")) return;
    setTableStatus(null);
    setDeletingSaleId(sale.id);
    try {
      const res = await fetch(`/api/sales?id=${sale.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json();
        setTableStatus(data?.error ?? "No se pudo cancelar");
        return;
      }
      setTableStatus("Venta cancelada");
      setSelectedSaleId((prev) => (prev === sale.id ? null : prev));
      setIsReceiptPanelOpen(false);
      setEditingReceiptId(null);
      setReceiptsBySale((prev) => {
        const next = { ...prev };
        delete next[sale.id];
        return next;
      });
      setReceiptStatus((prev) => {
        const next = { ...prev };
        delete next[sale.id];
        return next;
      });
      await onReceiptsUpdated();
    } catch {
      setTableStatus("No se pudo cancelar");
    } finally {
      setDeletingSaleId(null);
    }
  };

  const handleDeleteReceipt = async (saleId: string, receipt: ReceiptRow) => {
    if (!window.confirm("Eliminar este cobro? La venta volvera a recalcular su saldo.")) {
      return;
    }

    setDeletingReceiptId(receipt.id);
    setReceiptStatus((prev) => ({ ...prev, [saleId]: "" }));
    try {
      const res = await fetch(`/api/receipts?id=${encodeURIComponent(receipt.id)}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json();
        setReceiptStatus((prev) => ({
          ...prev,
          [saleId]: data?.error ?? "No se pudo eliminar el cobro",
        }));
        return;
      }

      setEditingReceiptId((prev) => (prev === receipt.id ? null : prev));
      setReceiptStatus((prev) => ({
        ...prev,
        [saleId]: "Cobro eliminado",
      }));
      await loadReceipts(saleId);
      await onReceiptsUpdated();
    } catch {
      setReceiptStatus((prev) => ({
        ...prev,
        [saleId]: "No se pudo eliminar el cobro",
      }));
    } finally {
      setDeletingReceiptId(null);
    }
  };

  const handleOpenSaleModal = (saleId: string) => {
    setSelectedSaleId(saleId);
    setIsReceiptPanelOpen(false);
    setEditingReceiptId(null);
  };

  const handleCloseSaleModal = () => {
    setSelectedSaleId(null);
    setIsReceiptPanelOpen(false);
    setEditingReceiptId(null);
  };

  const handleToggleReceiptsPanel = (saleId: string) => {
    setIsReceiptPanelOpen((prev) => {
      const next = !prev;
      if (next && !receiptsBySale[saleId]) {
        void loadReceipts(saleId);
      }
      return next;
    });
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

      {tableStatus ? (
        <p className="text-xs text-zinc-600">{tableStatus}</p>
      ) : null}

      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="text-[11px] uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="py-2 pr-4">Venta</th>
              <th className="py-2 pr-4">Cliente</th>
              <th className="py-2 pr-4">Fecha</th>
              <th className="py-2 pr-4">Resumen</th>
              <th className="py-2 pr-4 text-right">Ajuste</th>
              <th className="py-2 pr-4 text-right">Total</th>
              <th className="py-2 pr-4 text-right">Cobrado</th>
              <th className="py-2 pr-4 text-right">Pendiente</th>
              <th className="py-2 pr-4 text-right">Accion</th>
            </tr>
          </thead>
          <tbody>
            {sales.length ? (
              sales.map((sale) => {
                const paidTotal = sale.paidTotal ?? "0";
                const rawBalance = Number(sale.balance ?? sale.total ?? 0);
                const normalizedBalance =
                  Number.isFinite(rawBalance) &&
                  Math.abs(rawBalance) <= PAYMENT_SETTLEMENT_TOLERANCE
                    ? 0
                    : rawBalance;
                const balance = Number.isFinite(normalizedBalance)
                  ? normalizedBalance.toFixed(2)
                  : sale.balance ?? sale.total ?? "0";
                const adjustmentAmount =
                  Number(sale.total ?? 0) -
                  Number(sale.subtotal ?? 0) -
                  Number(sale.taxes ?? 0);
                const adjustmentLabel = getAdjustmentLabel(
                  sale.extraType,
                  adjustmentAmount,
                );
                const itemCount = sale.items?.length ?? 0;
                const firstItemName =
                  itemCount > 0
                    ? sale.items?.[0]?.productName ?? "Item"
                    : "Sin items";
                const isSelected = selectedSaleId === sale.id;

                return (
                  <tr
                    key={sale.id}
                    className="border-t border-sky-200 transition-colors hover:bg-white/50"
                  >
                    <td className="py-2 pr-4 whitespace-nowrap text-zinc-600">
                      <div className="space-y-1">
                        <p>{sale.saleNumber ?? "-"}</p>
                        {sale.billingStatus === "NOT_BILLED" ? (
                          <p className="text-[10px] uppercase tracking-wide text-zinc-500">
                            Registro interno
                          </p>
                        ) : sale.billingStatus === "TO_BILL" ? (
                          <p className="text-[10px] uppercase tracking-wide text-sky-700">
                            Pendiente de facturacion
                          </p>
                        ) : null}
                      </div>
                    </td>
                    <td className="py-2 pr-4 text-zinc-900">
                      {sale.customerName}
                    </td>
                    <td className="py-2 pr-4 whitespace-nowrap text-zinc-600">
                      {sale.saleDate
                        ? new Date(sale.saleDate).toLocaleDateString("es-AR")
                        : new Date(sale.createdAt).toLocaleDateString("es-AR")}
                    </td>
                    <td className="py-2 pr-4 text-zinc-700">
                      <div className="space-y-1">
                        <p className="text-[11px] font-medium text-zinc-900">
                          {firstItemName}
                        </p>
                        <p className="text-[11px] text-zinc-500">
                          {itemCount} {itemCount === 1 ? "item" : "items"}
                        </p>
                      </div>
                    </td>
                    <td className="py-2 pr-4 text-right text-zinc-700">
                      {Math.abs(adjustmentAmount) > 0.005 ? (
                        <span title={adjustmentLabel}>
                          {formatCurrencyARS(adjustmentAmount.toFixed(2))}
                        </span>
                      ) : (
                        "-"
                      )}
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
                      <div className="flex justify-end">
                        <button
                          type="button"
                          className={`btn h-9 gap-1 border-emerald-300 border-dashed px-3 text-emerald-700 hover:bg-emerald-50 ${
                            isSelected ? "bg-emerald-50" : ""
                          }`}
                          onClick={() => handleOpenSaleModal(sale.id)}
                          aria-label="Ver venta"
                        >
                          <EyeIcon className="size-4" />
                          <span>Ver</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td className="py-4 text-sm text-zinc-500" colSpan={9}>
                  Sin ventas por ahora.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {selectedSale && isPortalReady
        ? createPortal(
            <div
              className="fixed inset-0 z-[120] flex items-end justify-center bg-zinc-950/35 p-3 backdrop-blur-sm sm:items-center sm:p-4"
              onClick={(event) => {
                if (event.target !== event.currentTarget) return;
                handleCloseSaleModal();
              }}
            >
              <div
                className="card max-h-[92vh] w-full max-w-5xl space-y-4 overflow-y-auto p-4 sm:p-5"
                onClick={(event) => event.stopPropagation()}
              >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h4 className="text-base font-semibold text-zinc-900">
                  Venta {selectedSale.saleNumber ?? "-"}
                </h4>
                <p className="text-xs text-zinc-600">
                  {selectedSale.customerName} ·{" "}
                  {selectedSale.saleDate
                    ? new Date(selectedSale.saleDate).toLocaleDateString("es-AR")
                    : new Date(selectedSale.createdAt).toLocaleDateString("es-AR")}
                </p>
              </div>
              <button
                type="button"
                className="btn h-9 w-9 justify-center p-0"
                onClick={handleCloseSaleModal}
                aria-label="Cerrar"
              >
                <XMarkIcon className="size-4" />
              </button>
            </div>

            <div className="rounded-2xl border border-sky-200 bg-white p-3">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h5 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  Detalles
                </h5>
                <span className="text-[11px] text-zinc-500">
                  {selectedSale.items?.length ?? 0}{" "}
                  {(selectedSale.items?.length ?? 0) === 1 ? "item" : "items"}
                </span>
              </div>
              {(selectedSale.items?.length ?? 0) > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[560px] text-left text-xs">
                    <thead className="text-[11px] uppercase tracking-wide text-zinc-500">
                      <tr>
                        <th className="py-2 pr-3">Producto</th>
                        <th className="py-2 pr-3 text-right">Cantidad</th>
                        <th className="py-2 pr-3 text-right">Precio unit.</th>
                        <th className="py-2 pr-3 text-right">IVA</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedSale.items?.map((item, itemIndex) => (
                        <tr
                          key={`${item.id ?? item.productName}-detail-${itemIndex}`}
                          className="border-t border-zinc-200/70"
                        >
                          <td className="py-2 pr-3 text-zinc-900">
                            {item.productName}
                          </td>
                          <td className="py-2 pr-3 text-right text-zinc-700">
                            {item.qty}
                          </td>
                          <td className="py-2 pr-3 text-right text-zinc-700">
                            {formatCurrencyARS(item.unitPrice)}
                          </td>
                          <td className="py-2 pr-3 text-right text-zinc-700">
                            {formatItemTaxRate(item.taxRate)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-xs text-zinc-500">Sin items cargados.</p>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-zinc-200 pt-3">
              <button
                type="button"
                className={`btn gap-2 ${
                  isReceiptPanelOpen ? "border-sky-300 bg-sky-50 text-sky-700" : ""
                }`}
                onClick={() => handleToggleReceiptsPanel(selectedSale.id)}
              >
                <CurrencyDollarIcon className="size-4" />
                Cobro
              </button>
              <a
                className="btn gap-2"
                href={`/api/pdf/sale?id=${selectedSale.id}`}
                target="_blank"
                rel="noreferrer"
              >
                <ArrowDownTrayIcon className="size-4" />
                Descargar
              </a>
              {canManage ? (
                <button
                  type="button"
                  className="btn gap-2 border-rose-200 text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
                  onClick={() => void handleDeleteSale(selectedSale)}
                  disabled={
                    selectedSale.billingStatus === "BILLED" ||
                    deletingSaleId === selectedSale.id
                  }
                >
                  <TrashIcon className="size-4" />
                  {deletingSaleId === selectedSale.id ? "Eliminando..." : "Eliminar"}
                </button>
              ) : null}
            </div>

            {isReceiptPanelOpen ? (
              <div className="space-y-4 rounded-2xl border border-sky-200 bg-white p-3">
                <h5 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  Cobros
                </h5>

                {receiptStatus[selectedSale.id] ? (
                  <p className="text-xs text-zinc-500">
                    {receiptStatus[selectedSale.id]}
                  </p>
                ) : null}

                {loadingReceiptId === selectedSale.id ? (
                  <p className="text-xs text-zinc-500">Cargando cobros...</p>
                ) : receiptsBySale[selectedSale.id]?.length ? (
                  <div className="space-y-2">
                    {receiptsBySale[selectedSale.id].map((receipt) => (
                      <div
                        key={receipt.id}
                        className="rounded-2xl border border-sky-200 bg-white p-3 text-xs text-zinc-600"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <p className="text-[11px] uppercase tracking-wide text-zinc-500">
                              Recibo Nro {receipt.receiptNumber ?? "-"}
                            </p>
                            <p className="mt-1 text-[11px] text-zinc-500">
                              {new Date(receipt.receivedAt).toLocaleDateString("es-AR")}
                            </p>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-semibold text-zinc-900">
                              {formatCurrencyARS(receipt.total)}
                            </span>
                            <a
                              className="btn h-9 w-9 justify-center p-0"
                              href={`/api/pdf/receipt?id=${receipt.id}`}
                              target="_blank"
                              rel="noreferrer"
                              aria-label="Descargar recibo"
                              title="Recibo PDF"
                            >
                              <ArrowDownTrayIcon className="size-4" />
                            </a>
                            {canManage ? (
                              <>
                                <button
                                  type="button"
                                  className="btn h-9 w-9 justify-center p-0"
                                  onClick={() =>
                                    setEditingReceiptId((prev) =>
                                      prev === receipt.id ? null : receipt.id
                                    )
                                  }
                                  aria-label="Editar cobro"
                                  title="Editar cobro"
                                >
                                  <PencilSquareIcon className="size-4" />
                                </button>
                                <button
                                  type="button"
                                  className="btn h-9 w-9 justify-center border-rose-200 p-0 text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
                                  onClick={() =>
                                    void handleDeleteReceipt(selectedSale.id, receipt)
                                  }
                                  disabled={deletingReceiptId === receipt.id}
                                  aria-label="Eliminar cobro"
                                  title={
                                    deletingReceiptId === receipt.id
                                      ? "Eliminando..."
                                      : "Eliminar cobro"
                                  }
                                >
                                  <TrashIcon className="size-4" />
                                </button>
                              </>
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
                              </li>
                            ))}
                          </ul>
                        ) : null}
                        {editingReceiptId === receipt.id ? (
                          <div className="mt-3 rounded-2xl border border-dashed border-sky-200 bg-sky-50/40 p-3">
                            <ReceiptForm
                              saleId={selectedSale.id}
                              saleTotal={selectedSale.total}
                              paymentMethods={paymentMethods}
                              accounts={accounts}
                              currencies={currencies}
                              latestUsdRate={latestUsdRate}
                              receipt={receipt}
                              allowFinancing={false}
                              submitLabel="Guardar cobro"
                              onCancel={() => setEditingReceiptId(null)}
                              onCreated={() => {
                                setEditingReceiptId(null);
                                void loadReceipts(selectedSale.id);
                                onReceiptsUpdated();
                              }}
                            />
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-zinc-500">Sin cobros registrados.</p>
                )}

                <div className="rounded-2xl border border-dashed border-sky-200 bg-white p-3">
                  <ReceiptForm
                    saleId={selectedSale.id}
                    saleTotal={selectedSale.total}
                    paymentMethods={paymentMethods}
                    accounts={accounts}
                    currencies={currencies}
                    latestUsdRate={latestUsdRate}
                    onCreated={() => {
                      void loadReceipts(selectedSale.id);
                      onReceiptsUpdated();
                    }}
                  />
                </div>
              </div>
            ) : null}
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
