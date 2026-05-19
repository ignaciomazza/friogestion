import { formatCurrencyARS } from "@/lib/format";

type PurchasePaymentMode = "CURRENT_ACCOUNT" | "IMMEDIATE_CASH_OUT" | "OFF_BOOK";

type PaymentMethodOption = {
  id: string;
  name: string;
};

type AccountOption = {
  id: string;
  name: string;
  currencyCode: string;
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
  editingCashOutPaymentMethodId: string;
  editingCashOutAccountId: string;
  paymentMethods: PaymentMethodOption[];
  accounts: AccountOption[];
  isUpdatingPaymentMode: boolean;
  onSetEditingPaymentMode: (next: PurchasePaymentMode) => void;
  onResetCashOutTargets: () => void;
  onSetEditingPaidAt: (value: string) => void;
  onSetEditingCashOutPaymentMethodId: (value: string) => void;
  onSetEditingCashOutAccountId: (value: string) => void;
  onClose: () => void;
  onSave: () => void;
};

export default function PurchasePaymentModeModal({
  editingPaymentPurchase,
  paymentModeOptions,
  editingPaymentMode,
  editingPaidAt,
  editingCashOutPaymentMethodId,
  editingCashOutAccountId,
  paymentMethods,
  accounts,
  isUpdatingPaymentMode,
  onSetEditingPaymentMode,
  onResetCashOutTargets,
  onSetEditingPaidAt,
  onSetEditingCashOutPaymentMethodId,
  onSetEditingCashOutAccountId,
  onClose,
  onSave,
}: PurchasePaymentModeModalProps) {
  if (!editingPaymentPurchase) return null;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-zinc-950/25">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="purchase-payment-mode-title"
        className="mx-4 my-6 w-full max-w-xl rounded-2xl border border-zinc-200 bg-white p-5 shadow-[0_24px_80px_-40px_rgba(24,24,27,0.55)]"
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
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="field-stack">
                <span className="input-label">Metodo de pago</span>
                <select
                  className="input cursor-pointer"
                  value={editingCashOutPaymentMethodId}
                  onChange={(event) => onSetEditingCashOutPaymentMethodId(event.target.value)}
                  disabled={!paymentMethods.length}
                >
                  <option value="">{paymentMethods.length ? "Selecciona metodo" : "Sin metodos activos"}</option>
                  {paymentMethods.map((method) => (
                    <option key={`edit-method-${method.id}`} value={method.id}>
                      {method.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="field-stack">
                <span className="input-label">Cuenta de egreso</span>
                <select
                  className="input cursor-pointer"
                  value={editingCashOutAccountId}
                  onChange={(event) => onSetEditingCashOutAccountId(event.target.value)}
                >
                  <option value="">Selecciona cuenta</option>
                  {accounts.map((account) => (
                    <option key={`edit-account-${account.id}`} value={account.id}>
                      {account.name} ({account.currencyCode})
                    </option>
                  ))}
                </select>
              </label>
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
