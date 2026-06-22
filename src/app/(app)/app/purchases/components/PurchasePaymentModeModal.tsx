import { TrashIcon } from "@/components/icons";
import { MoneyInput } from "@/components/inputs/MoneyInput";
import { formatCurrencyARS } from "@/lib/format";
import type { PurchaseDocumentType } from "@/lib/purchases/fiscal";
import { PurchaseSelect } from "./PurchaseSelect";

type PurchasePaymentMode = "CURRENT_ACCOUNT" | "IMMEDIATE_CASH_OUT" | "OFF_BOOK";

type PaymentMethodOption = {
  id: string;
  name: string;
  requiresAccount: boolean;
};

type AccountOption = {
  id: string;
  name: string;
  currencyCode: string;
};

type CashOutLineForm = {
  paymentMethodId: string;
  accountId: string;
  amount: string;
};

type PurchaseSummary = {
  supplierName: string;
  invoiceNumber: string | null;
  documentType?: PurchaseDocumentType | null;
  total: string | null;
};

type PaymentModeOption = {
  value: PurchasePaymentMode;
  label: string;
  description: string;
};

type PurchasePaymentModeModalProps = {
  editingPaymentPurchase: PurchaseSummary | null;
  paymentModeOptions: PaymentModeOption[];
  editingPaymentMode: PurchasePaymentMode;
  editingPaidAt: string;
  editingCashOutLines: CashOutLineForm[];
  paymentMethods: PaymentMethodOption[];
  accounts: AccountOption[];
  isUpdatingPaymentMode: boolean;
  onSetEditingPaymentMode: (next: PurchasePaymentMode) => void;
  onResetCashOutTargets: () => void;
  onSetEditingPaidAt: (value: string) => void;
  onAddCashOutLine: () => void;
  onRemoveCashOutLine: (index: number) => void;
  onUpdateCashOutLine: (index: number, updates: Partial<CashOutLineForm>) => void;
  onOpenSupplierGroupedPayment: () => void;
  onClose: () => void;
  onSave: () => void;
};

export default function PurchasePaymentModeModal({
  editingPaymentPurchase,
  paymentModeOptions,
  editingPaymentMode,
  editingPaidAt,
  editingCashOutLines,
  paymentMethods,
  accounts,
  isUpdatingPaymentMode,
  onSetEditingPaymentMode,
  onResetCashOutTargets,
  onSetEditingPaidAt,
  onAddCashOutLine,
  onRemoveCashOutLine,
  onUpdateCashOutLine,
  onOpenSupplierGroupedPayment,
  onClose,
  onSave,
}: PurchasePaymentModeModalProps) {
  if (!editingPaymentPurchase) return null;
  const purchaseTotal = Number(editingPaymentPurchase.total ?? 0);
  const cashOutTotal = editingCashOutLines.reduce(
    (sum, line) => sum + Number(line.amount || 0),
    0,
  );
  const cashOutDiff = purchaseTotal - cashOutTotal;
  const methodRequiresAccount = (paymentMethodId: string) =>
    Boolean(
      paymentMethods.find((method) => method.id === paymentMethodId)
        ?.requiresAccount,
    );

  return (
    <div className="fixed inset-0 z-[120] bg-zinc-950/25 p-2 sm:p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="purchase-payment-mode-title"
        className="mx-auto flex h-[calc(100dvh-1rem)] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-[0_24px_80px_-40px_rgba(24,24,27,0.55)] sm:h-[calc(100dvh-2rem)]"
      >
        <div className="shrink-0 p-5 pb-3 sm:p-6 sm:pb-4">
          <div className="space-y-1">
            <h2 id="purchase-payment-mode-title" className="text-lg font-semibold text-zinc-900">
              Ajustar pago de compra
            </h2>
            <p className="text-xs text-zinc-500">
              {editingPaymentPurchase.supplierName} · {editingPaymentPurchase.invoiceNumber ?? "Sin comprobante fiscal"} ·{" "}
              {formatCurrencyARS(editingPaymentPurchase.total)}
            </p>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5 sm:px-6 sm:pb-6">
          <div className="space-y-4">
            <div className="grid gap-2 sm:grid-cols-3">
              {paymentModeOptions.map((option) => {
                const isActive = editingPaymentMode === option.value;
                const isDisabled =
                  editingPaymentPurchase.documentType === "CREDIT_NOTE" &&
                  option.value === "IMMEDIATE_CASH_OUT";
                return (
                  <button
                    key={`edit-${option.value}`}
                    type="button"
                    aria-pressed={isActive}
                    disabled={isDisabled}
                    onClick={() => {
                      if (isDisabled) return;
                      onSetEditingPaymentMode(option.value);
                      if (option.value !== "IMMEDIATE_CASH_OUT") {
                        onResetCashOutTargets();
                      }
                    }}
                    className={`rounded-xl border px-3 py-2.5 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/40 ${
                      isActive
                        ? "border-sky-300 bg-sky-50/70 text-sky-950"
                        : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300"
                    } ${isDisabled ? "cursor-not-allowed opacity-50" : ""}`}
                  >
                    <p className="text-sm font-semibold">{option.label}</p>
                    <p className={`mt-1 text-[11px] ${isActive ? "text-sky-700" : "text-zinc-500"}`}>
                      {option.description}
                    </p>
                  </button>
                );
              })}
            </div>

            <label className="field-stack">
              <span className="input-label">Fecha</span>
              <input
                type="date"
                className="input w-full min-w-0 cursor-pointer"
                value={editingPaidAt}
                onChange={(event) => onSetEditingPaidAt(event.target.value)}
              />
            </label>

            {editingPaymentMode === "IMMEDIATE_CASH_OUT" ? (
              <div className="mt-2 space-y-3">
                <div className="rounded-2xl border border-dashed border-zinc-200/70 bg-white/40 p-4 sm:p-5">
                  <div className="space-y-3">
                    {editingCashOutLines.map((line, index) => {
                      const requiresAccount = methodRequiresAccount(
                        line.paymentMethodId,
                      );
                      return (
                        <div
                          key={`edit-cash-out-line-${index}`}
                          className="grid gap-4 rounded-xl border border-zinc-200/70 bg-white p-4 md:grid-cols-2 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1.2fr)_minmax(0,1fr)_auto] xl:items-end"
                        >
                          <label className="field-stack min-w-0">
                            <span className="input-label">Metodo de pago</span>
                            <PurchaseSelect
                              value={line.paymentMethodId}
                              options={[
                                {
                                  value: "",
                                  label: paymentMethods.length
                                    ? "Selecciona metodo"
                                    : "Sin metodos activos",
                                },
                                ...paymentMethods.map((method) => ({
                                  value: method.id,
                                  label: method.name,
                                })),
                              ]}
                              onValueChange={(value) =>
                                onUpdateCashOutLine(index, {
                                  paymentMethodId: value,
                                })
                              }
                              disabled={!paymentMethods.length}
                            />
                          </label>

                          <label className="field-stack min-w-0">
                            <span className="input-label">Cuenta de egreso</span>
                            {requiresAccount ? (
                              <PurchaseSelect
                                value={line.accountId}
                                options={[
                                  { value: "", label: "Selecciona cuenta" },
                                  ...accounts.map((account) => ({
                                    value: account.id,
                                    label: `${account.name} (${account.currencyCode})`,
                                  })),
                                ]}
                                onValueChange={(value) =>
                                  onUpdateCashOutLine(index, {
                                    accountId: value,
                                  })
                                }
                              />
                            ) : (
                              <input
                                className="input w-full min-w-0"
                                value="No requiere cuenta"
                                readOnly
                                disabled
                              />
                            )}
                          </label>

                          <label className="field-stack min-w-0">
                            <span className="input-label">Monto</span>
                            <MoneyInput
                              className="input w-full min-w-0 text-right tabular-nums"
                              value={line.amount}
                              onValueChange={(nextValue) =>
                                onUpdateCashOutLine(index, { amount: nextValue })
                              }
                              placeholder="0,00"
                              maxDecimals={2}
                            />
                          </label>

                          <button
                            type="button"
                            className="btn btn-rose h-10 w-10 justify-center p-0 xl:self-end"
                            onClick={() => onRemoveCashOutLine(index)}
                            disabled={editingCashOutLines.length <= 1}
                            aria-label="Quitar linea de pago"
                          >
                            <TrashIcon className="size-4" />
                          </button>
                        </div>
                      );
                    })}
                  </div>

                  <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                    <button
                      type="button"
                      className="btn w-full text-xs sm:w-auto lg:order-2"
                      onClick={onAddCashOutLine}
                    >
                      Agregar linea
                    </button>
                    <div className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-600 lg:order-1 lg:ml-auto">
                      <p>
                        Total compra:{" "}
                        <span className="font-semibold text-zinc-900">
                          {formatCurrencyARS(purchaseTotal)}
                        </span>
                      </p>
                      <p>
                        Total pago:{" "}
                        <span className="font-semibold text-zinc-900">
                          {formatCurrencyARS(cashOutTotal)}
                        </span>
                      </p>
                      <p>
                        Diferencia:{" "}
                        <span
                          className={`font-semibold ${
                            Math.abs(cashOutDiff) <= 0.01
                              ? "text-emerald-700"
                              : "text-rose-700"
                          }`}
                        >
                          {formatCurrencyARS(cashOutDiff)}
                        </span>
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>

        <div className="shrink-0 border-t border-zinc-200/70 px-5 py-4 sm:px-6">
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              className="btn w-full sm:mr-auto sm:w-auto"
              onClick={onOpenSupplierGroupedPayment}
              disabled={isUpdatingPaymentMode}
            >
              Pagar varias compras
            </button>
            <button type="button" className="btn w-full sm:w-auto" onClick={onClose} disabled={isUpdatingPaymentMode}>
              Cancelar
            </button>
            <button type="button" className="btn btn-emerald w-full sm:w-auto" onClick={onSave} disabled={isUpdatingPaymentMode}>
              {isUpdatingPaymentMode ? "Guardando..." : "Guardar ajuste"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
