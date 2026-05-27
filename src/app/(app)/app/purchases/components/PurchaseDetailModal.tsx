import {
  ArrowPathIcon,
  CurrencyDollarIcon,
  PencilSquareIcon,
  TrashIcon,
} from "@/components/icons";
import { formatCurrencyARS } from "@/lib/format";
import type { PurchaseRow } from "../types";
import { formatProductLabel, formatUnit } from "../utils";

type PurchaseDetailData = {
  id: string;
  invoiceNumber: string | null;
  invoiceDate: string | null;
  total: string | null;
  taxes: string | null;
  netTaxed: string | null;
  netNonTaxed: string | null;
  exemptAmount: string | null;
  vatTotal: string | null;
  otherTaxesTotal: string | null;
  authorizationCode: string | null;
  hasInvoice?: boolean;
  impactsAccount: boolean;
  confirmedAllocatedTotal: string;
  items: Array<{
    productId: string;
    qty: string;
    unitCost: string;
    taxRate: string | null;
    product: {
      id: string;
      name: string;
      sku: string | null;
      purchaseCode: string | null;
      brand: string | null;
      model: string | null;
      unit: string | null;
      cost: string | null;
      price: string | null;
    };
  }>;
  fiscalLines: Array<{
    type: string;
    jurisdiction: string | null;
    baseAmount: string | null;
    rate: string | null;
    amount: string;
    note: string | null;
  }>;
};

type PurchaseDetailModalProps = {
  purchase: PurchaseRow | null;
  detail: PurchaseDetailData | null;
  isLoading: boolean;
  loadError: string | null;
  paymentStatus: {
    label: string;
    tone: "immediate" | "current-account" | "none";
  };
  arcaStatusLabel: string;
  isLoadingEdit: boolean;
  isRevalidating: boolean;
  isDeleting: boolean;
  onClose: () => void;
  onEdit: () => void;
  onPayment: () => void;
  onRevalidate: () => void;
  onDelete: () => void;
};

const FISCAL_LINE_LABELS: Record<string, string> = {
  IIBB_PERCEPTION: "Percepcion IIBB",
  VAT_PERCEPTION: "Percepcion IVA",
  INCOME_TAX_PERCEPTION: "Percepcion Ganancias",
  MUNICIPAL_PERCEPTION: "Percepcion municipal",
  INTERNAL_TAX: "Impuesto interno",
  OTHER: "Otro",
};

const toNumber = (value: string | number | null | undefined) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

const formatDateLabel = (value: string | null | undefined) => {
  if (!value) return "-";
  const normalized = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (normalized) {
    return `${normalized[3]}/${normalized[2]}/${normalized[1]}`;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleDateString("es-AR");
};

export default function PurchaseDetailModal({
  purchase,
  detail,
  isLoading,
  loadError,
  paymentStatus,
  arcaStatusLabel,
  isLoadingEdit,
  isRevalidating,
  isDeleting,
  onClose,
  onEdit,
  onPayment,
  onRevalidate,
  onDelete,
}: PurchaseDetailModalProps) {
  if (!purchase) return null;

  const dateLabel = formatDateLabel(
    detail?.invoiceDate ?? purchase.invoiceDate ?? purchase.createdAt,
  );
  const invoiceLabel =
    detail?.invoiceNumber ?? purchase.invoiceNumber ?? "Sin comprobante fiscal";
  const totalAmount = toNumber(detail?.total ?? purchase.total);
  const vatAmount = toNumber(detail?.vatTotal ?? detail?.taxes ?? purchase.taxes);
  const otherTaxesAmount = toNumber(
    detail?.otherTaxesTotal ?? purchase.otherTaxesTotal,
  );
  const itemCount = detail?.items.length ?? purchase.itemsCount;
  const allocatedAmount = detail
    ? toNumber(detail.confirmedAllocatedTotal)
    : toNumber(purchase.paidTotal);

  return (
    <div className="fixed inset-0 z-[124] bg-zinc-950/35 p-2 sm:p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="purchase-detail-title"
        className="mx-auto flex h-[calc(100dvh-1rem)] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-[0_24px_80px_-40px_rgba(24,24,27,0.55)] sm:h-[calc(100dvh-2rem)]"
      >
        <div className="shrink-0 border-b border-zinc-200/70 p-5 sm:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <h2 id="purchase-detail-title" className="text-lg font-semibold text-zinc-900">
                Detalle de compra
              </h2>
              <p className="mt-1 truncate text-xs text-zinc-500">
                {purchase.supplierName} · {invoiceLabel} · {dateLabel}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`pill border px-2 py-1 text-[10px] font-semibold ${
                  paymentStatus.tone === "immediate"
                    ? "border-sky-200 bg-white text-sky-800"
                    : paymentStatus.tone === "current-account"
                      ? "border-emerald-200 bg-white text-emerald-800"
                      : "border-zinc-200 bg-white text-zinc-600"
                }`}
              >
                {paymentStatus.label}
              </span>
              <span className="text-[11px] text-zinc-500">{arcaStatusLabel}</span>
            </div>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 sm:px-6 sm:py-5">
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-xl border border-zinc-200/80 bg-white p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                  Total
                </p>
                <p className="mt-1 text-sm font-semibold tabular-nums text-zinc-900">
                  {formatCurrencyARS(totalAmount)}
                </p>
              </div>
              <div className="rounded-xl border border-zinc-200/80 bg-white p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                  Productos
                </p>
                <p className="mt-1 text-sm font-semibold text-zinc-900">{itemCount}</p>
              </div>
              <div className="rounded-xl border border-zinc-200/80 bg-white p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                  IVA compra
                </p>
                <p className="mt-1 text-sm font-semibold tabular-nums text-zinc-900">
                  {formatCurrencyARS(vatAmount)}
                </p>
              </div>
              <div className="rounded-xl border border-zinc-200/80 bg-white p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                  Perc./otros
                </p>
                <p className="mt-1 text-sm font-semibold tabular-nums text-zinc-900">
                  {formatCurrencyARS(otherTaxesAmount)}
                </p>
              </div>
            </div>

            {isLoading ? (
              <p className="text-xs text-zinc-500">Cargando detalle...</p>
            ) : loadError ? (
              <p className="rounded-xl border border-amber-200 bg-amber-50/60 px-3 py-2 text-xs text-amber-800">
                {loadError}
              </p>
            ) : null}

            {detail ? (
              <>
                <section className="space-y-2 rounded-xl border border-zinc-200/80 bg-zinc-50/40 p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                    Productos
                  </p>
                  {detail.items.length ? (
                    <div className="space-y-2">
                      {detail.items.map((item, index) => {
                        const qty = toNumber(item.qty);
                        const unitCost = toNumber(item.unitCost);
                        const taxRate = toNumber(item.taxRate);
                        const subtotal = qty * unitCost;
                        const totalWithTax = subtotal + subtotal * (taxRate / 100);
                        return (
                          <div
                            key={`${item.productId}-${index}`}
                            className="grid gap-2 rounded-lg border border-zinc-200/80 bg-white p-3 sm:grid-cols-[minmax(0,1fr)_120px_140px] sm:items-center"
                          >
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium text-zinc-900">
                                {formatProductLabel(item.product)}
                              </p>
                              <p className="text-[11px] text-zinc-500">
                                {qty.toLocaleString("es-AR", {
                                  minimumFractionDigits: 0,
                                  maximumFractionDigits: 3,
                                })}{" "}
                                {formatUnit(item.product.unit)}
                                {taxRate > 0 ? ` · IVA ${taxRate}%` : " · Sin IVA"}
                              </p>
                            </div>
                            <p className="text-right text-xs tabular-nums text-zinc-600">
                              {formatCurrencyARS(unitCost)}
                            </p>
                            <p className="text-right text-sm font-semibold tabular-nums text-zinc-900">
                              {formatCurrencyARS(totalWithTax)}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-xs text-zinc-500">Sin detalle de productos.</p>
                  )}
                </section>

                <section className="space-y-2 rounded-xl border border-zinc-200/80 bg-zinc-50/40 p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                    Totales fiscales
                  </p>
                  <div className="grid gap-2 text-xs text-zinc-600 sm:grid-cols-2">
                    <p>
                      Neto gravado:{" "}
                      <span className="font-semibold text-zinc-900">
                        {formatCurrencyARS(toNumber(detail.netTaxed))}
                      </span>
                    </p>
                    <p>
                      No gravado:{" "}
                      <span className="font-semibold text-zinc-900">
                        {formatCurrencyARS(toNumber(detail.netNonTaxed))}
                      </span>
                    </p>
                    <p>
                      Exento:{" "}
                      <span className="font-semibold text-zinc-900">
                        {formatCurrencyARS(toNumber(detail.exemptAmount))}
                      </span>
                    </p>
                    <p>
                      Aplicado:{" "}
                      <span className="font-semibold text-zinc-900">
                        {formatCurrencyARS(allocatedAmount)}
                      </span>
                    </p>
                  </div>
                </section>

                <section className="space-y-2 rounded-xl border border-zinc-200/80 bg-zinc-50/40 p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                    Percepciones y otros
                  </p>
                  {detail.fiscalLines.length ? (
                    <div className="space-y-2">
                      {detail.fiscalLines.map((line, index) => (
                        <div
                          key={`${line.type}-${index}`}
                          className="grid gap-2 rounded-lg border border-zinc-200/80 bg-white p-3 text-xs sm:grid-cols-[minmax(0,1fr)_120px] sm:items-center"
                        >
                          <div className="min-w-0">
                            <p className="font-semibold text-zinc-900">
                              {FISCAL_LINE_LABELS[line.type] ?? "Otro"}
                            </p>
                            <p className="truncate text-zinc-500">
                              {line.jurisdiction?.trim() || line.note?.trim() || "-"}
                            </p>
                          </div>
                          <p className="text-right font-semibold tabular-nums text-zinc-900">
                            {formatCurrencyARS(toNumber(line.amount))}
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-zinc-500">
                      No hay percepciones u otros tributos cargados.
                    </p>
                  )}
                </section>

                {detail.hasInvoice ? (
                  <section className="rounded-xl border border-zinc-200/80 bg-zinc-50/40 p-3 text-xs text-zinc-600">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                      Comprobante fiscal
                    </p>
                    <p className="mt-1">
                      CAE/CAEA:{" "}
                      <span className="font-semibold text-zinc-900">
                        {detail.authorizationCode?.trim() || "-"}
                      </span>
                    </p>
                  </section>
                ) : null}
              </>
            ) : null}
          </div>
        </div>

        <div className="shrink-0 border-t border-zinc-200/70 px-5 py-4 sm:px-6">
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
              <button
                type="button"
                className="btn w-full text-xs sm:w-auto"
                onClick={onEdit}
                disabled={
                  purchase.status === "CANCELLED" || isLoadingEdit || isDeleting
                }
              >
                <PencilSquareIcon className="size-4" />
                Editar
              </button>
              <button
                type="button"
                className="btn btn-emerald w-full text-xs sm:w-auto"
                onClick={onPayment}
                disabled={purchase.status === "CANCELLED" || isDeleting}
              >
                <CurrencyDollarIcon className="size-4" />
                Pago
              </button>
              {purchase.hasInvoice ? (
                <button
                  type="button"
                  className="btn btn-sky w-full text-xs sm:w-auto"
                  onClick={onRevalidate}
                  disabled={isRevalidating || isDeleting}
                >
                  <ArrowPathIcon
                    className={`size-4 ${isRevalidating ? "animate-spin" : ""}`}
                  />
                  {isRevalidating ? "Procesando..." : "ARCA"}
                </button>
              ) : null}
              <button
                type="button"
                className="btn btn-rose w-full text-xs sm:w-auto"
                onClick={onDelete}
                disabled={isDeleting}
              >
                <TrashIcon className={`size-4 ${isDeleting ? "animate-pulse" : ""}`} />
                Eliminar
              </button>
            </div>

            <button type="button" className="btn w-full text-xs sm:w-auto" onClick={onClose}>
              Cerrar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
