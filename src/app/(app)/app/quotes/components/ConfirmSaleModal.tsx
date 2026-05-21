import type { Dispatch, SetStateAction } from "react";
import { PlusIcon, TrashIcon } from "@/components/icons";
import { MoneyInput } from "@/components/inputs/MoneyInput";
import { formatCurrencyARS } from "@/lib/format";
import { normalizeDecimalInput, normalizeIntegerInput } from "@/lib/input-format";

type ConfirmReceiptMode = "SIMPLE" | "INSTALLMENTS";

type ConfirmInstallmentsForm = {
  installmentsCount: string;
  interestRate: string;
  startDate: string;
};

type ConfirmReceiptLine = {
  paymentMethodId: string;
  accountId: string;
  currencyCode: string;
  amount: string;
  fxRateUsed: string;
};

type PaymentMethodOption = {
  id: string;
  name: string;
  requiresAccount: boolean;
};

type CurrencyOption = {
  id: string;
  code: string;
};

type AccountOption = {
  id: string;
  name: string;
  currencyCode: string;
};

type ConfirmPreviewItem = {
  id: string;
  productName: string;
};

type ConfirmSaleModalProps = {
  isOpen: boolean;
  customerName: string;
  confirmPreviewItems: ConfirmPreviewItem[];
  confirmPreviewSubtotal: number;
  confirmPreviewIva: number;
  confirmPreviewExtra: number;
  confirmPreviewTotal: number;
  confirmExtraLabel: string;
  registerReceiptOnConfirm: boolean;
  isConfirmingSale: boolean;
  confirmReceiptMode: ConfirmReceiptMode;
  confirmInstallmentsForm: ConfirmInstallmentsForm;
  isFinanceCatalogLoading: boolean;
  confirmReceiptLines: ConfirmReceiptLine[];
  paymentMethods: PaymentMethodOption[];
  accounts: AccountOption[];
  currencies: CurrencyOption[];
  latestUsdRateForReceipts: string | null;
  confirmSaleStatus: string | null;
  onClose: () => void;
  onConfirm: () => void;
  onSetRegisterReceiptOnConfirm: (next: boolean) => void;
  onSetConfirmReceiptMode: (next: ConfirmReceiptMode) => void;
  onSetConfirmInstallmentsForm: Dispatch<SetStateAction<ConfirmInstallmentsForm>>;
  onAddConfirmReceiptLine: () => void;
  onRemoveConfirmReceiptLine: (index: number) => void;
  onUpdateConfirmReceiptLine: (
    index: number,
    updates: Partial<ConfirmReceiptLine>,
  ) => void;
};

function MiniToggle({
  checked,
  label,
  disabled,
  onChange,
}: {
  checked: boolean;
  label: string;
  disabled?: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <div className="inline-flex items-center gap-2 text-xs text-zinc-700">
      <button
        type="button"
        role="switch"
        aria-label={label}
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/40 ${
          checked ? "border-sky-300 bg-sky-100" : "border-zinc-300 bg-zinc-100"
        } ${disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}
      >
        <span
          className={`inline-block h-4 w-4 rounded-full bg-white shadow-[0_1px_4px_rgba(0,0,0,0.16)] transition-transform ${
            checked ? "translate-x-4" : "translate-x-0.5"
          }`}
        />
      </button>
      <span>{label}</span>
    </div>
  );
}

export default function ConfirmSaleModal({
  isOpen,
  customerName,
  confirmPreviewItems,
  confirmPreviewSubtotal,
  confirmPreviewIva,
  confirmPreviewExtra,
  confirmPreviewTotal,
  confirmExtraLabel,
  registerReceiptOnConfirm,
  isConfirmingSale,
  confirmReceiptMode,
  confirmInstallmentsForm,
  isFinanceCatalogLoading,
  confirmReceiptLines,
  paymentMethods,
  accounts,
  currencies,
  latestUsdRateForReceipts,
  confirmSaleStatus,
  onClose,
  onConfirm,
  onSetRegisterReceiptOnConfirm,
  onSetConfirmReceiptMode,
  onSetConfirmInstallmentsForm,
  onAddConfirmReceiptLine,
  onRemoveConfirmReceiptLine,
  onUpdateConfirmReceiptLine,
}: ConfirmSaleModalProps) {
  if (!isOpen) return null;

  const paymentMethodById = new Map(paymentMethods.map((method) => [method.id, method]));
  const primaryReceiptLine = confirmReceiptLines[0] ?? {
    paymentMethodId: paymentMethods[0]?.id ?? "",
    accountId: "",
    currencyCode: currencies[0]?.code ?? "ARS",
    amount: "",
    fxRateUsed: "",
  };
  const simpleReceiptTotalBase = confirmReceiptLines.reduce((sum, line) => {
    const amount = Number(line.amount || 0);
    if (!Number.isFinite(amount) || amount <= 0) return sum;
    if ((line.currencyCode || "ARS").toUpperCase() === "ARS") return sum + amount;
    const fxRate = Number(line.fxRateUsed || 0);
    if (!Number.isFinite(fxRate) || fxRate <= 0) return sum;
    return sum + amount * fxRate;
  }, 0);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/35 p-4 sm:items-center">
      <div className="card w-full max-w-3xl space-y-4 p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-zinc-900">Confirmar venta</h3>
          </div>
          <button type="button" className="btn text-xs" onClick={onClose} disabled={isConfirmingSale}>
            Cerrar
          </button>
        </div>

        <div className="rounded-xl border border-zinc-200/70 bg-white p-3">
          <p className="text-sm font-semibold text-zinc-900">{customerName}</p>
          {confirmPreviewItems.length ? (
            <div className="mt-2 space-y-1 text-xs text-zinc-700">
              {confirmPreviewItems.map((item) => (
                <p key={item.id}>{item.productName}</p>
              ))}
            </div>
          ) : null}

          <div className="mt-3 rounded-lg border border-zinc-200/70 bg-zinc-50 p-2 text-xs text-zinc-700">
            <p className="flex flex-wrap items-center gap-3">
              <span>
                Neto: <span className="font-semibold text-zinc-900">{formatCurrencyARS(confirmPreviewSubtotal)}</span>
              </span>
              <span>
                IVA: <span className="font-semibold text-zinc-900">{formatCurrencyARS(confirmPreviewIva)}</span>
              </span>
              <span>
                {confirmExtraLabel}: <span className="font-semibold text-zinc-900">{formatCurrencyARS(confirmPreviewExtra)}</span>
              </span>
              <span>
                Total: <span className="font-semibold text-zinc-900">{formatCurrencyARS(confirmPreviewTotal)}</span>
              </span>
            </p>
          </div>
        </div>

        <MiniToggle
          checked={registerReceiptOnConfirm}
          onChange={onSetRegisterReceiptOnConfirm}
          disabled={isConfirmingSale}
          label="Registrar cobro ahora"
        />

        {registerReceiptOnConfirm ? (
          <div className="space-y-3 rounded-xl border border-dashed border-sky-200 bg-white p-3">
            <div className="field-stack">
              <span className="input-label">Modo</span>
              <div className="segmented-toggle w-56">
                <span
                  className={`segmented-toggle-indicator ${
                    confirmReceiptMode === "INSTALLMENTS" ? "translate-x-full" : "translate-x-0"
                  }`}
                  aria-hidden
                />
                <button
                  type="button"
                  className={`segmented-toggle-item ${
                    confirmReceiptMode === "SIMPLE" ? "segmented-toggle-item-active" : ""
                  }`}
                  onClick={() => onSetConfirmReceiptMode("SIMPLE")}
                  aria-pressed={confirmReceiptMode === "SIMPLE"}
                >
                  Simple
                </button>
                <button
                  type="button"
                  className={`segmented-toggle-item ${
                    confirmReceiptMode === "INSTALLMENTS" ? "segmented-toggle-item-active" : ""
                  }`}
                  onClick={() => onSetConfirmReceiptMode("INSTALLMENTS")}
                  aria-pressed={confirmReceiptMode === "INSTALLMENTS"}
                >
                  Cuotas
                </button>
              </div>
            </div>

            {confirmReceiptMode === "INSTALLMENTS" ? (
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="field-stack">
                  <span className="input-label">Cuotas</span>
                  <input
                    className="input text-xs"
                    inputMode="numeric"
                    value={confirmInstallmentsForm.installmentsCount}
                    onChange={(event) =>
                      onSetConfirmInstallmentsForm((prev) => ({
                        ...prev,
                        installmentsCount: normalizeIntegerInput(event.target.value),
                      }))
                    }
                  />
                </label>
                <label className="field-stack">
                  <span className="input-label">Interes (%)</span>
                  <input
                    className="input text-xs"
                    inputMode="decimal"
                    value={confirmInstallmentsForm.interestRate}
                    onChange={(event) =>
                      onSetConfirmInstallmentsForm((prev) => ({
                        ...prev,
                        interestRate: normalizeDecimalInput(event.target.value, 2),
                      }))
                    }
                    placeholder="0,00"
                  />
                </label>
                <label className="field-stack">
                  <span className="input-label">Primera cuota</span>
                  <input
                    type="date"
                    className="input text-xs"
                    value={confirmInstallmentsForm.startDate}
                    onChange={(event) =>
                      onSetConfirmInstallmentsForm((prev) => ({
                        ...prev,
                        startDate: event.target.value,
                      }))
                    }
                  />
                </label>
              </div>
            ) : null}

            {isFinanceCatalogLoading ? (
              <p className="text-xs text-zinc-500">Cargando metodos, cuentas y monedas...</p>
            ) : confirmReceiptMode === "SIMPLE" ? (
              <div className="space-y-3">
                <div className="space-y-2">
                  {confirmReceiptLines.map((line, index) => {
                    const method = paymentMethodById.get(line.paymentMethodId);
                    const requiresAccount = Boolean(method?.requiresAccount);
                    const currencyAccounts = accounts.filter(
                      (account) => account.currencyCode === line.currencyCode,
                    );

                    return (
                      <div
                        key={`confirm-receipt-line-${index}`}
                        className="flex flex-wrap items-end gap-3 rounded-xl border border-zinc-200/70 bg-white/80 p-3"
                      >
                        <label className="field-stack min-w-0 w-full sm:w-44">
                          <span className="input-label">Metodo</span>
                          <select
                            className="input w-full min-w-0 text-xs"
                            value={line.paymentMethodId}
                            onChange={(event) => {
                              const methodId = event.target.value;
                              const nextMethod = paymentMethodById.get(methodId);
                              onUpdateConfirmReceiptLine(index, {
                                paymentMethodId: methodId,
                                accountId: nextMethod?.requiresAccount
                                  ? line.accountId
                                  : "",
                              });
                            }}
                          >
                            <option value="">Seleccionar</option>
                            {paymentMethods.map((methodOption) => (
                              <option key={methodOption.id} value={methodOption.id}>
                                {methodOption.name}
                              </option>
                            ))}
                          </select>
                        </label>

                        <label className="field-stack min-w-0 w-full sm:w-24">
                          <span className="input-label">Moneda</span>
                          <select
                            className="input w-full min-w-0 text-xs"
                            value={line.currencyCode}
                            onChange={(event) => {
                              const currencyCode = event.target.value;
                              onUpdateConfirmReceiptLine(index, {
                                currencyCode,
                                accountId: "",
                                fxRateUsed:
                                  currencyCode === "ARS"
                                    ? ""
                                    : line.fxRateUsed || latestUsdRateForReceipts || "",
                              });
                            }}
                          >
                            {currencies.map((currency) => (
                              <option key={currency.id} value={currency.code}>
                                {currency.code}
                              </option>
                            ))}
                          </select>
                        </label>

                        {requiresAccount ? (
                          <label className="field-stack min-w-0 w-full sm:w-44">
                            <span className="input-label">Cuenta</span>
                            <select
                              className="input w-full min-w-0 text-xs"
                              value={line.accountId}
                              onChange={(event) =>
                                onUpdateConfirmReceiptLine(index, {
                                  accountId: event.target.value,
                                })
                              }
                            >
                              <option value="">Seleccionar</option>
                              {currencyAccounts.map((account) => (
                                <option key={account.id} value={account.id}>
                                  {account.name}
                                </option>
                              ))}
                            </select>
                          </label>
                        ) : null}

                        <label className="field-stack min-w-0 w-full sm:w-28">
                          <span className="input-label">Importe</span>
                          <MoneyInput
                            className="input w-full min-w-0 text-xs"
                            value={line.amount}
                            onValueChange={(nextValue) =>
                              onUpdateConfirmReceiptLine(index, { amount: nextValue })
                            }
                            placeholder="0,00"
                            maxDecimals={2}
                          />
                        </label>

                        {line.currencyCode !== "ARS" ? (
                          <label className="field-stack min-w-0 w-full sm:w-28">
                            <span className="input-label">Cotizacion</span>
                            <input
                              className="input w-full min-w-0 text-xs"
                              inputMode="decimal"
                              value={line.fxRateUsed}
                              onChange={(event) =>
                                onUpdateConfirmReceiptLine(index, {
                                  fxRateUsed: normalizeDecimalInput(
                                    event.target.value,
                                    6,
                                  ),
                                })
                              }
                            />
                          </label>
                        ) : null}

                        <button
                          type="button"
                          className="btn btn-rose h-9 w-9 p-0"
                          onClick={() => onRemoveConfirmReceiptLine(index)}
                          disabled={confirmReceiptLines.length <= 1}
                          aria-label="Quitar linea de ingreso"
                        >
                          <TrashIcon className="size-4" />
                        </button>
                      </div>
                    );
                  })}
                </div>

                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <button type="button" className="btn w-full text-xs sm:w-auto" onClick={onAddConfirmReceiptLine}>
                    <PlusIcon className="size-4" />
                    Agregar linea
                  </button>
                  <span className="text-xs text-zinc-600">
                    Total cobro ARS:{" "}
                    <strong className="text-zinc-900">
                      {formatCurrencyARS(simpleReceiptTotalBase)}
                    </strong>
                  </span>
                </div>
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                <label className="field-stack">
                  <span className="input-label">Metodo</span>
                  <select
                    className="input text-xs"
                    value={primaryReceiptLine.paymentMethodId}
                    onChange={(event) => {
                      const methodId = event.target.value;
                      const method = paymentMethodById.get(methodId);
                      onUpdateConfirmReceiptLine(0, {
                        paymentMethodId: methodId,
                        accountId: method?.requiresAccount
                          ? primaryReceiptLine.accountId
                          : "",
                      });
                    }}
                  >
                    <option value="">Seleccionar</option>
                    {paymentMethods.map((method) => (
                      <option key={method.id} value={method.id}>
                        {method.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="field-stack">
                  <span className="input-label">Moneda</span>
                  <select
                    className="input text-xs"
                    value={primaryReceiptLine.currencyCode}
                    onChange={(event) => {
                      const currencyCode = event.target.value;
                      onUpdateConfirmReceiptLine(0, {
                        currencyCode,
                        accountId: "",
                        fxRateUsed:
                          currencyCode === "ARS"
                            ? ""
                            : primaryReceiptLine.fxRateUsed ||
                              latestUsdRateForReceipts ||
                              "",
                      });
                    }}
                  >
                    {currencies.map((currency) => (
                      <option key={currency.id} value={currency.code}>
                        {currency.code}
                      </option>
                    ))}
                  </select>
                </label>

                {Boolean(
                  paymentMethodById.get(primaryReceiptLine.paymentMethodId)
                    ?.requiresAccount,
                ) ? (
                  <label className="field-stack">
                    <span className="input-label">Cuenta</span>
                    <select
                      className="input text-xs"
                      value={primaryReceiptLine.accountId}
                      onChange={(event) =>
                        onUpdateConfirmReceiptLine(0, {
                          accountId: event.target.value,
                        })
                      }
                    >
                      <option value="">Seleccionar</option>
                      {accounts
                        .filter(
                          (account) =>
                            account.currencyCode === primaryReceiptLine.currencyCode,
                        )
                        .map((account) => (
                        <option key={account.id} value={account.id}>
                          {account.name}
                        </option>
                        ))}
                    </select>
                  </label>
                ) : null}

                <label className="field-stack">
                  <span className="input-label">Importe</span>
                  <MoneyInput
                    className="input text-xs"
                    value={primaryReceiptLine.amount}
                    onValueChange={(nextValue) =>
                      onUpdateConfirmReceiptLine(0, {
                        amount: nextValue,
                      })
                    }
                    placeholder="0,00"
                    maxDecimals={2}
                  />
                </label>

                {primaryReceiptLine.currencyCode !== "ARS" ? (
                  <label className="field-stack">
                    <span className="input-label">Cotizacion</span>
                    <input
                      className="input text-xs"
                      inputMode="decimal"
                      value={primaryReceiptLine.fxRateUsed}
                      onChange={(event) =>
                        onUpdateConfirmReceiptLine(0, {
                          fxRateUsed: normalizeDecimalInput(event.target.value, 6),
                        })
                      }
                    />
                  </label>
                ) : null}
              </div>
            )}
          </div>
        ) : null}

        {confirmSaleStatus ? <p className="text-xs text-zinc-500">{confirmSaleStatus}</p> : null}

        <div className="flex items-center justify-end gap-2">
          <button type="button" className="btn text-xs" onClick={onClose} disabled={isConfirmingSale}>
            Cancelar
          </button>
          <button
            type="button"
            className="btn btn-emerald text-xs"
            onClick={onConfirm}
            disabled={isConfirmingSale || (registerReceiptOnConfirm && isFinanceCatalogLoading)}
          >
            {isConfirmingSale
              ? "Confirmando..."
              : registerReceiptOnConfirm
                ? "Confirmar venta y cobro"
                : "Confirmar venta"}
          </button>
        </div>
      </div>
    </div>
  );
}
