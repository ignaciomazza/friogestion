import { TrashIcon } from "@/components/icons";
import { MoneyInput } from "@/components/inputs/MoneyInput";
import { formatCurrencyARS } from "@/lib/format";

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
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-zinc-950/25">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="purchase-payment-mode-title"
        className="mx-4 my-6 w-full max-w-3xl rounded-2xl border border-zinc-200 bg-white p-5 shadow-[0_24px_80px_-40px_rgba(24,24,27,0.55)] sm:p-6"
      >
        <div className="space-y-1">
          <h2 id="purchase-payment-mode-title" className="text-lg font-semibold text-zinc-900">
            Ajustar pago de compra
          </h2>
          <p className="text-xs text-zinc-500">
            {editingPaymentPurchase.supplierName} · {editingPaymentPurchase.invoiceNumber ?? "Sin comprobante"} ·{" "}
            {formatCurrencyARS(editingPaymentPurchase.total)}
          </p>
        </div>

        <div className="mt-4 space-y-4">
          <div className="grid gap-2 sm:grid-cols-3">
            {paymentModeOptions.map((option) => {
              const isActive = editingPaymentMode === option.value;
              return (
                <button
                  key={`edit-${option.value}`}
                  type="button"
                  aria-pressed={isActive}
                  onClick={() => {
                    onSetEditingPaymentMode(option.value);
                    if (option.value !== "IMMEDIATE_CASH_OUT") {
                      onResetCashOutTargets();
                    }
                  }}
                  className={`rounded-xl border px-3 py-2.5 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/40 ${
                    isActive
                      ? "border-sky-300 bg-sky-50/70 text-sky-950"
                      : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300"
                  }`}
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
            <div className="space-y-3">
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
                          <select
                            className="input w-full min-w-0 cursor-pointer"
                            value={line.paymentMethodId}
                            onChange={(event) =>
                              onUpdateCashOutLine(index, {
                                paymentMethodId: event.target.value,
                              })
                            }
                            disabled={!paymentMethods.length}
                          >
                            <option value="">
                              {paymentMethods.length
                                ? "Selecciona metodo"
                                : "Sin metodos activos"}
                            </option>
                            {paymentMethods.map((method) => (
                              <option key={`edit-method-${method.id}`} value={method.id}>
                                {method.name}
                              </option>
                            ))}
                          </select>
                        </label>

                        <label className="field-stack min-w-0">
                          <span className="input-label">Cuenta de egreso</span>
                          {requiresAccount ? (
                            <select
                              className="input w-full min-w-0 cursor-pointer"
                              value={line.accountId}
                              onChange={(event) =>
                                onUpdateCashOutLine(index, {
                                  accountId: event.target.value,
                                })
                              }
                            >
                              <option value="">Selecciona cuenta</option>
                              {accounts.map((account) => (
                                <option
                                  key={`edit-account-${account.id}`}
                                  value={account.id}
                                >
                                  {account.name} ({account.currencyCode})
                                </option>
                              ))}
                            </select>
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

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" className="btn w-full sm:w-auto" onClick={onClose} disabled={isUpdatingPaymentMode}>
            Cancelar
          </button>
          <button type="button" className="btn btn-emerald w-full sm:w-auto" onClick={onSave} disabled={isUpdatingPaymentMode}>
            {isUpdatingPaymentMode ? "Guardando..." : "Guardar ajuste"}
          </button>
        </div>
      </div>
    </div>
  );
}
