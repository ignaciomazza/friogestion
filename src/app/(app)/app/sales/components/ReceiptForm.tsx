"use client";

import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import { TrashIcon } from "@/components/icons";
import { MoneyInput } from "@/components/inputs/MoneyInput";
import { formatCurrencyARS } from "@/lib/format";
import {
  normalizeDecimalInput,
  normalizeIntegerInput,
} from "@/lib/input-format";

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

type ReceiptLineMode = "SIMPLE" | "INSTALLMENTS";

type ReceiptLineForm = {
  mode: ReceiptLineMode;
  paymentMethodId: string;
  accountId: string;
  currencyCode: string;
  amount: string;
  fxRateUsed: string;
};

type FinancingFormState = {
  installmentsCount: string;
  interestRate: string;
  startDate: string;
};

type EditableReceipt = {
  id: string;
  receivedAt: string;
  lines: Array<{
    paymentMethodId: string;
    accountId: string | null;
    currencyCode: string;
    amount: string;
    fxRateUsed: string | null;
  }>;
};

type ReceiptFormProps = {
  saleId: string;
  saleTotal: string | null;
  paymentMethods: PaymentMethodOption[];
  accounts: AccountOption[];
  currencies: CurrencyOption[];
  latestUsdRate: string | null;
  receipt?: EditableReceipt;
  allowFinancing?: boolean;
  submitLabel?: string;
  onCancel?: () => void;
  onCreated: () => void;
};

const buildLine = (
  paymentMethods: PaymentMethodOption[],
  currencies: CurrencyOption[],
  latestUsdRate: string | null,
  mode: ReceiptLineMode = "SIMPLE",
): ReceiptLineForm => {
  const defaultMethod = paymentMethods[0]?.id ?? "";
  const defaultCurrency =
    currencies.find((currency) => currency.isDefault)?.code ??
    currencies[0]?.code ??
    "ARS";
  const fxRateUsed = defaultCurrency === "ARS" ? "" : latestUsdRate ?? "";

  return {
    mode,
    paymentMethodId: defaultMethod,
    accountId: "",
    currencyCode: defaultCurrency,
    amount: "",
    fxRateUsed,
  };
};

const buildFinancingForm = (): FinancingFormState => ({
  installmentsCount: "3",
  interestRate: "",
  startDate: new Date().toISOString().slice(0, 10),
});

const buildReceiptLines = (
  receipt: EditableReceipt | undefined,
  paymentMethods: PaymentMethodOption[],
  currencies: CurrencyOption[],
  latestUsdRate: string | null,
) => {
  if (!receipt?.lines.length) {
    return [buildLine(paymentMethods, currencies, latestUsdRate)];
  }

  return receipt.lines.map((line) => ({
    mode: "SIMPLE" as const,
    paymentMethodId: line.paymentMethodId,
    accountId: line.accountId ?? "",
    currencyCode: line.currencyCode,
    amount: line.amount,
    fxRateUsed: line.fxRateUsed ?? "",
  }));
};

const toLineBaseAmount = (line: Pick<ReceiptLineForm, "currencyCode" | "amount" | "fxRateUsed">) => {
  const amount = Number(line.amount || 0);
  const fx = Number(line.fxRateUsed || 0);
  const base =
    line.currencyCode === "ARS" || !line.currencyCode ? amount : amount * fx;
  return Number.isFinite(base) ? base : 0;
};

export function ReceiptForm({
  saleId,
  saleTotal,
  paymentMethods,
  accounts,
  currencies,
  latestUsdRate,
  receipt,
  allowFinancing = true,
  submitLabel,
  onCancel,
  onCreated,
}: ReceiptFormProps) {
  const isEditing = Boolean(receipt);
  const canUseFinancing = allowFinancing && !isEditing;
  const [lines, setLines] = useState<ReceiptLineForm[]>(() =>
    buildReceiptLines(receipt, paymentMethods, currencies, latestUsdRate),
  );
  const [receivedAtInput, setReceivedAtInput] = useState(
    receipt?.receivedAt ? receipt.receivedAt.slice(0, 10) : "",
  );
  const [status, setStatus] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasFinancingPlan, setHasFinancingPlan] = useState(false);
  const [isPlanLoading, setIsPlanLoading] = useState(false);
  const [financingForm, setFinancingForm] = useState<FinancingFormState>(
    buildFinancingForm,
  );

  const methodsById = useMemo(
    () => new Map(paymentMethods.map((method) => [method.id, method])),
    [paymentMethods],
  );

  const fallbackFinancingMethodId = useMemo(() => {
    const methodWithoutAccount = paymentMethods.find(
      (method) => !method.requiresAccount,
    );
    return methodWithoutAccount?.id ?? paymentMethods[0]?.id ?? "";
  }, [paymentMethods]);

  const defaultCurrency =
    currencies.find((currency) => currency.isDefault)?.code ??
    currencies[0]?.code ??
    "ARS";
  const saleTotalBase = Number(saleTotal ?? 0);

  const installmentLines = useMemo(
    () =>
      canUseFinancing
        ? lines.filter((line) => line.mode === "INSTALLMENTS")
        : [],
    [canUseFinancing, lines],
  );
  const hasInstallmentLines = installmentLines.length > 0;
  const firstInstallmentLineIndex = lines.findIndex(
    (line) => line.mode === "INSTALLMENTS",
  );

  const installmentPrincipalBase = useMemo(
    () => installmentLines.reduce((sum, line) => sum + toLineBaseAmount(line), 0),
    [installmentLines],
  );
  const effectiveInstallmentPrincipal = hasInstallmentLines
    ? installmentPrincipalBase > 0
      ? installmentPrincipalBase
      : saleTotalBase
    : 0;

  const interestRateValue = Number(financingForm.interestRate || 0);
  const installmentsCountValue = Math.max(
    Number(financingForm.installmentsCount || 1),
    1,
  );
  const financingTotal = useMemo(() => {
    const interestAmount = effectiveInstallmentPrincipal * (interestRateValue / 100);
    return effectiveInstallmentPrincipal + (Number.isFinite(interestAmount) ? interestAmount : 0);
  }, [effectiveInstallmentPrincipal, interestRateValue]);
  const financingInstallmentValue = financingTotal / installmentsCountValue;

  useEffect(() => {
    if (!receipt) return;
    setLines(buildReceiptLines(receipt, paymentMethods, currencies, latestUsdRate));
    setReceivedAtInput(receipt.receivedAt.slice(0, 10));
    setStatus(null);
  }, [receipt, paymentMethods, currencies, latestUsdRate]);

  useEffect(() => {
    if (!canUseFinancing) {
      setHasFinancingPlan(false);
      setIsPlanLoading(false);
      return;
    }

    let cancelled = false;

    const loadPlan = async () => {
      setIsPlanLoading(true);
      try {
        const res = await fetch(
          `/api/installments?saleId=${encodeURIComponent(saleId)}`,
        );
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;

        if (data?.plan) {
          setHasFinancingPlan(true);
          setFinancingForm({
            installmentsCount: String(data.plan.installmentsCount ?? 1),
            interestRate: data.plan.interestRate ?? "",
            startDate: String(data.plan.startDate).slice(0, 10),
          });
          setLines((prev) => {
            const baseLine =
              prev[0] ??
              buildLine(paymentMethods, currencies, latestUsdRate, "INSTALLMENTS");
            return [
              {
                ...baseLine,
                mode: "INSTALLMENTS",
                currencyCode: "ARS",
                fxRateUsed: "",
                amount: String(data.plan.principal ?? ""),
              },
            ];
          });
        } else {
          setHasFinancingPlan(false);
          setFinancingForm(buildFinancingForm());
        }
      } finally {
        if (!cancelled) {
          setIsPlanLoading(false);
        }
      }
    };

    void loadPlan();

    return () => {
      cancelled = true;
    };
  }, [canUseFinancing, saleId, paymentMethods, currencies, latestUsdRate]);

  const addLine = () => {
    setLines((prev) => [
      ...prev,
      buildLine(paymentMethods, currencies, latestUsdRate),
    ]);
  };

  const removeLine = (index: number) => {
    setLines((prev) => prev.filter((_, currentIndex) => currentIndex !== index));
  };

  const updateLine = (index: number, updates: Partial<ReceiptLineForm>) => {
    setLines((prev) => {
      const next = [...prev];
      const current = next[index];
      const updated = { ...current, ...updates };
      const method = methodsById.get(updated.paymentMethodId);
      if (
        updated.mode === "SIMPLE" &&
        updates.paymentMethodId &&
        method &&
        !method.requiresAccount
      ) {
        updated.accountId = "";
      }
      if (updates.currencyCode && updates.currencyCode === "ARS") {
        updated.fxRateUsed = "";
      }
      if (updates.currencyCode && updates.currencyCode !== "ARS") {
        updated.fxRateUsed = updated.fxRateUsed || latestUsdRate || "";
      }
      next[index] = updated;
      return next;
    });
  };

  const updateLineMode = (index: number, mode: ReceiptLineMode) => {
    setLines((prev) => {
      const next = [...prev];
      const current = next[index];
      if (!current) return prev;
      next[index] = {
        ...current,
        mode,
        accountId: mode === "INSTALLMENTS" ? "" : current.accountId,
      };
      return next;
    });
  };

  const totals = useMemo(() => {
    return lines.reduce(
      (acc, line) => {
        const amount = Number(line.amount || 0);
        const base = toLineBaseAmount(line);
        return {
          amount: acc.amount + amount,
          base: acc.base + base,
        };
      },
      { amount: 0, base: 0 },
    );
  }, [lines]);

  const saveFinancingPlan = async (principalAmount: number) => {
    const installmentsCount = Number(financingForm.installmentsCount || 0);
    if (!Number.isInteger(installmentsCount) || installmentsCount <= 0) {
      setStatus("Revisa la cantidad de cuotas");
      return false;
    }
    if (!financingForm.startDate) {
      setStatus("Completa la fecha de primera cuota");
      return false;
    }
    if (!Number.isFinite(principalAmount) || principalAmount <= 0) {
      setStatus("Ingresa un importe valido para cuotas");
      return false;
    }

    const res = await fetch("/api/installments", {
      method: hasFinancingPlan ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        saleId,
        type: "CARD",
        installmentsCount,
        interestRate: financingForm.interestRate
          ? Number(financingForm.interestRate)
          : 0,
        startDate: financingForm.startDate,
        frequency: "MONTHLY",
        principalAmount,
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      setStatus(data?.error ?? "No se pudo guardar la financiacion");
      return false;
    }

    setHasFinancingPlan(Boolean(data?.plan));
    return true;
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatus(null);
    setIsSubmitting(true);

    try {
      if (hasInstallmentLines) {
        const fallbackMethod = methodsById.get(fallbackFinancingMethodId);
        if (
          !fallbackMethod ||
          fallbackMethod.requiresAccount
        ) {
          setStatus(
            "Para cuotas hace falta un metodo disponible sin cuenta obligatoria",
          );
          return;
        }
      }

      const normalizedLines = lines.map((line) => ({
        mode: line.mode,
        paymentMethodId:
          line.mode === "INSTALLMENTS"
            ? fallbackFinancingMethodId
            : line.paymentMethodId,
        accountId: line.mode === "INSTALLMENTS" ? undefined : line.accountId || undefined,
        currencyCode: line.currencyCode || defaultCurrency,
        amount: Number(line.amount || 0),
        fxRateUsed: line.fxRateUsed ? Number(line.fxRateUsed) : undefined,
      }));

      const linesWithAmount = normalizedLines.filter((line) => line.amount > 0);
      const simpleLines = linesWithAmount.filter((line) => line.mode === "SIMPLE");
      const installmentReceiptLines = linesWithAmount.filter(
        (line) => line.mode === "INSTALLMENTS",
      );

      if (!linesWithAmount.length && !hasInstallmentLines) {
        setStatus("Ingresa al menos un importe");
        return;
      }

      const hasInvalidSimple = simpleLines.some((line) => {
        const method = methodsById.get(line.paymentMethodId);
        if (!line.paymentMethodId) return true;
        if (method?.requiresAccount && !line.accountId) {
          return true;
        }
        if (line.currencyCode !== "ARS" && !line.fxRateUsed) return true;
        return false;
      });
      if (hasInvalidSimple) {
        setStatus("Revisa cuentas, importes y cotizacion");
        return;
      }

      const hasInvalidInstallments = installmentReceiptLines.some((line) => {
        if (line.currencyCode !== "ARS" && !line.fxRateUsed) return true;
        return false;
      });
      if (hasInvalidInstallments) {
        setStatus("Revisa importes de cuotas y cotizacion");
        return;
      }

      let financingSaved = false;
      if (hasInstallmentLines) {
        const financingPrincipal = lines.reduce((sum, line) => {
          if (line.mode !== "INSTALLMENTS") return sum;
          return sum + toLineBaseAmount(line);
        }, 0);
        const financingOk = await saveFinancingPlan(financingPrincipal);
        if (!financingOk) return;
        financingSaved = true;
      }

      if (linesWithAmount.length) {
        const res = await fetch("/api/receipts", {
          method: isEditing ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: receipt?.id,
            saleId,
            receivedAt: isEditing ? receivedAtInput : undefined,
            lines: linesWithAmount.map((line) => ({
              paymentMethodId: line.paymentMethodId,
              accountId: line.accountId,
              currencyCode: line.currencyCode,
              amount: line.amount,
              fxRateUsed: line.fxRateUsed,
            })),
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          if (financingSaved) {
            setStatus(
              "Plan de cuotas guardado, pero no se pudo registrar el cobro",
            );
            onCreated();
            return;
          }
          setStatus(data?.error ?? "No se pudo registrar");
          return;
        }

        if (!isEditing) {
          setLines([buildLine(paymentMethods, currencies, latestUsdRate)]);
        }
        const receiptMessage = isEditing ? "Cobro actualizado" : "Cobro confirmado";
        setStatus(
          financingSaved
            ? `${receiptMessage}. Plan de cuotas guardado`
            : receiptMessage,
        );
        onCreated();
        return;
      }

      if (financingSaved) {
        setStatus("Plan de cuotas guardado");
        onCreated();
      }
    } catch {
      setStatus("No se pudo registrar");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!paymentMethods.length) {
    return <p className="text-xs text-zinc-500">No hay metodos de pago activos.</p>;
  }

  if (!currencies.length) {
    return (
      <p className="text-xs text-zinc-500">No hay monedas activas configuradas.</p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {isEditing ? (
        <label className="field-stack max-w-48">
          <span className="input-label">Fecha de cobro</span>
          <input
            type="date"
            className="input cursor-pointer text-xs"
            value={receivedAtInput}
            onChange={(event) => setReceivedAtInput(event.target.value)}
            required
          />
        </label>
      ) : null}

      <div className="space-y-3">
        {lines.map((line, index) => {
          const isInstallmentLine =
            canUseFinancing && line.mode === "INSTALLMENTS";
          const isFinancingConfigHost =
            isInstallmentLine && index === firstInstallmentLineIndex;

          const method = methodsById.get(line.paymentMethodId);
          const requiresAccount = Boolean(
            method?.requiresAccount,
          );
          const currencyAccounts = accounts.filter(
            (account) => account.currencyCode === line.currencyCode,
          );
          const base = toLineBaseAmount(line);

          return (
            <div
              key={`${line.paymentMethodId}-${index}`}
              className="flex flex-wrap items-end gap-3 rounded-2xl border border-sky-200 bg-white/70 p-3"
            >
              {canUseFinancing ? (
                <div className="field-stack min-w-36">
                  <span className="input-label">Modo</span>
                  <div className="segmented-toggle">
                    <span
                      className={`segmented-toggle-indicator ${
                        isInstallmentLine ? "translate-x-full" : "translate-x-0"
                      }`}
                      aria-hidden
                    />
                    <button
                      type="button"
                      className={`segmented-toggle-item ${
                        !isInstallmentLine ? "segmented-toggle-item-active" : ""
                      }`}
                      onClick={() => updateLineMode(index, "SIMPLE")}
                      aria-pressed={!isInstallmentLine}
                    >
                      Simple
                    </button>
                    <button
                      type="button"
                      className={`segmented-toggle-item ${
                        isInstallmentLine ? "segmented-toggle-item-active" : ""
                      }`}
                      onClick={() => updateLineMode(index, "INSTALLMENTS")}
                      aria-pressed={isInstallmentLine}
                    >
                      Cuotas
                    </button>
                  </div>
                  {index === 0 && isPlanLoading ? (
                    <p className="mt-1 text-[10px] text-zinc-500">Cargando plan...</p>
                  ) : null}
                  {index === 0 && !hasInstallmentLines && hasFinancingPlan && !isPlanLoading ? (
                    <p className="mt-1 text-[10px] text-zinc-500">
                      Hay un plan de cuotas guardado.
                    </p>
                  ) : null}
                </div>
              ) : null}

              {!isInstallmentLine ? (
                <label className="flex w-full flex-col gap-2 text-[11px] text-zinc-500 sm:w-44">
                  Metodo
                  <select
                    className="input text-xs"
                    value={line.paymentMethodId}
                    onChange={(event) =>
                      updateLine(index, { paymentMethodId: event.target.value })
                    }
                  >
                    {paymentMethods.map((methodOption) => (
                      <option key={methodOption.id} value={methodOption.id}>
                        {methodOption.name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}

              {!isInstallmentLine && requiresAccount ? (
                <label className="flex w-full flex-col gap-2 text-[11px] text-zinc-500 sm:w-44">
                  Cuenta
                  <select
                    className="input text-xs"
                    value={line.accountId}
                    onChange={(event) =>
                      updateLine(index, { accountId: event.target.value })
                    }
                    required
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

              <label className="flex w-full flex-col gap-2 text-[11px] text-zinc-500 sm:w-24">
                Moneda
                <select
                  className="input text-xs"
                  value={line.currencyCode}
                  onChange={(event) =>
                    updateLine(index, { currencyCode: event.target.value })
                  }
                >
                  {currencies.map((currency) => (
                    <option key={currency.id} value={currency.code}>
                      {currency.code}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex w-full flex-col gap-2 text-[11px] text-zinc-500 sm:w-28">
                Importe
                <MoneyInput
                  className="input text-xs"
                  value={line.amount}
                  onValueChange={(nextValue) => {
                    updateLine(index, { amount: nextValue });
                  }}
                  placeholder="0,00"
                  maxDecimals={2}
                  required
                />
              </label>

              {line.currencyCode !== "ARS" ? (
                <label className="flex w-full flex-col gap-2 text-[11px] text-zinc-500 sm:w-28">
                  Cotizacion
                  <input
                    className="input text-xs"
                    inputMode="decimal"
                    value={line.fxRateUsed}
                    onChange={(event) =>
                      updateLine(index, {
                        fxRateUsed: normalizeDecimalInput(event.target.value, 6),
                      })
                    }
                    required
                  />
                </label>
              ) : null}

              {isFinancingConfigHost ? (
                <>
                  <label className="flex w-full flex-col gap-2 text-[11px] text-zinc-500 sm:w-24">
                    Cuotas
                    <input
                      className="input text-xs"
                      inputMode="numeric"
                      value={financingForm.installmentsCount}
                      onChange={(event) =>
                        setFinancingForm((prev) => ({
                          ...prev,
                          installmentsCount: normalizeIntegerInput(event.target.value),
                        }))
                      }
                    />
                  </label>
                  <label className="flex w-full flex-col gap-2 text-[11px] text-zinc-500 sm:w-24">
                    Interes %
                    <input
                      className="input text-xs"
                      inputMode="decimal"
                      placeholder="0,00"
                      value={financingForm.interestRate}
                      onChange={(event) =>
                        setFinancingForm((prev) => ({
                          ...prev,
                          interestRate: normalizeDecimalInput(event.target.value, 2),
                        }))
                      }
                    />
                  </label>
                  <label className="flex w-full flex-col gap-2 text-[11px] text-zinc-500 sm:w-36">
                    Primera cuota
                    <input
                      className="input text-xs"
                      type="date"
                      value={financingForm.startDate}
                      onChange={(event) =>
                        setFinancingForm((prev) => ({
                          ...prev,
                          startDate: event.target.value,
                        }))
                      }
                    />
                  </label>
                  <div className="text-[11px] text-zinc-500">
                    Total con interes
                    <p className="text-sm font-semibold text-zinc-900">
                      {formatCurrencyARS(financingTotal)}
                    </p>
                  </div>
                  <div className="text-[11px] text-zinc-500">
                    Cuota estimada
                    <p className="text-sm font-semibold text-zinc-900">
                      {formatCurrencyARS(financingInstallmentValue)}
                    </p>
                  </div>
                </>
              ) : null}

              {!isInstallmentLine ? (
                <div className="text-[11px] text-zinc-500">
                  Base ARS
                  <p className="text-sm font-semibold text-zinc-900">
                    {formatCurrencyARS(base)}
                  </p>
                </div>
              ) : null}

              {lines.length > 1 ? (
                <button
                  type="button"
                  className="btn btn-rose px-2"
                  onClick={() => removeLine(index)}
                  aria-label="Quitar linea"
                >
                  <TrashIcon className="size-4" />
                </button>
              ) : null}
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-zinc-500">
        <button type="button" className="btn text-xs" onClick={addLine}>
          Agregar linea
        </button>
        <span>
          Total ARS:{" "}
          <strong className="text-zinc-900">{formatCurrencyARS(totals.base)}</strong>
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {status ? <span className="text-xs text-zinc-500">{status}</span> : null}
        {onCancel ? (
          <button
            type="button"
            className="btn text-xs"
            onClick={onCancel}
            disabled={isSubmitting}
          >
            Cancelar
          </button>
        ) : null}
        <button
          type="submit"
          className="btn btn-sky ml-auto"
          disabled={isSubmitting}
        >
          {isSubmitting
            ? isEditing
              ? "Guardando..."
              : "Registrando..."
            : submitLabel ?? (isEditing ? "Guardar cobro" : "Registrar cobro")}
        </button>
      </div>
    </form>
  );
}
