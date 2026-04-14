"use client";

import type { Dispatch, FormEvent, KeyboardEvent, SetStateAction } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CheckIcon, PlusIcon, TrashIcon } from "@/components/icons";
import { MoneyInput } from "@/components/inputs/MoneyInput";
import { formatCurrencyARS } from "@/lib/format";
import {
  formatPercentInput,
  formatQuantityInput,
  normalizeDecimalInput,
} from "@/lib/input-format";
import type {
  CustomerOption,
  PriceListOption,
  ProductOption,
  QuoteItemForm,
} from "../types";
import { formatProductLabel, formatUnit } from "../utils";

type NewQuoteFormProps = {
  customerSearch: string;
  customerId: string;
  isConsumerFinalAnonymous: boolean;
  isResolvingConsumerFinal: boolean;
  showConsumerFinalThresholdWarning: boolean;
  consumerFinalThresholdLabel: string;
  priceLists: PriceListOption[];
  selectedPriceListId: string;
  showPriceListMismatchWarning: boolean;
  onSelectedPriceListChange: (value: string) => void;
  isCustomerOpen: boolean;
  customerMatches: CustomerOption[];
  customerActiveIndex: number;
  hasCustomers: boolean;
  isCustomerMatchesLoading: boolean;
  onConsumerFinalToggle: (enabled: boolean) => void;
  onCustomerSearchChange: (value: string) => void;
  onCustomerFocus: () => void;
  onCustomerBlur: () => void;
  onCustomerKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
  onCustomerSelect: (customer: CustomerOption) => void;
  validUntil: string;
  onValidUntilChange: (value: string) => void;
  extraType: string;
  extraValue: string;
  onExtraTypeChange: (value: string) => void;
  onExtraValueChange: (value: string) => void;
  items: QuoteItemForm[];
  productMap: Map<string, ProductOption>;
  hasProducts: boolean;
  openProductIndex: number | null;
  productActiveIndex: number;
  getProductMatches: (query: string) => ProductOption[];
  isProductMatchesLoading: boolean;
  onItemChange: (
    index: number,
    field: keyof QuoteItemForm,
    value: string,
  ) => void;
  onOpenProductIndexChange: Dispatch<SetStateAction<number | null>>;
  onProductActiveIndexChange: Dispatch<SetStateAction<number>>;
  onProductKeyDown: (
    event: KeyboardEvent<HTMLInputElement>,
    index: number,
    matches: ProductOption[],
  ) => void;
  onSelectProduct: (index: number, product: ProductOption) => void;
  onRemoveItem: (index: number) => void;
  onAddItem: () => void;
  subtotal: number;
  taxesTotal: number;
  extraAmount: number;
  total: number;
  isSubmitting: boolean;
  status: string | null;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onSubmitAndCreateSale: () => void;
  showSubmitAndCreateSale: boolean;
  submitLabel: string;
};

export function NewQuoteForm({
  customerSearch,
  customerId,
  isConsumerFinalAnonymous,
  isResolvingConsumerFinal,
  showConsumerFinalThresholdWarning,
  consumerFinalThresholdLabel,
  priceLists,
  selectedPriceListId,
  showPriceListMismatchWarning,
  onSelectedPriceListChange,
  isCustomerOpen,
  customerMatches,
  customerActiveIndex,
  hasCustomers,
  isCustomerMatchesLoading,
  onConsumerFinalToggle,
  onCustomerSearchChange,
  onCustomerFocus,
  onCustomerBlur,
  onCustomerKeyDown,
  onCustomerSelect,
  validUntil,
  onValidUntilChange,
  extraType,
  extraValue,
  onExtraTypeChange,
  onExtraValueChange,
  items,
  productMap,
  hasProducts,
  openProductIndex,
  productActiveIndex,
  getProductMatches,
  isProductMatchesLoading,
  onItemChange,
  onOpenProductIndexChange,
  onProductActiveIndexChange,
  onProductKeyDown,
  onSelectProduct,
  onRemoveItem,
  onAddItem,
  subtotal,
  taxesTotal,
  extraAmount,
  total,
  isSubmitting,
  status,
  onSubmit,
  onSubmitAndCreateSale,
  showSubmitAndCreateSale,
  submitLabel,
}: NewQuoteFormProps) {
  const isConsumerFinalToggleDisabled = isResolvingConsumerFinal || isSubmitting;
  const isPercentExtra =
    extraType === "PERCENT" || extraType === "DISCOUNT_PERCENT";
  const isDiscountExtra =
    extraType === "DISCOUNT_PERCENT" || extraType === "DISCOUNT_FIXED";
  const extraSummaryLabel =
    extraAmount < 0 ? "Descuento" : extraAmount > 0 ? "Recargo" : "Ajuste";

  return (
    <div className="card space-y-6 p-6 lg:p-7">
      <div>
        <h2 className="text-lg font-semibold text-zinc-900">
          Nuevo presupuesto
        </h2>
      </div>

      <form onSubmit={onSubmit} className="space-y-8">
        <div className="grid gap-6 lg:grid-cols-[2fr_1fr] lg:items-start">
          <div className="field-stack">
            <div className="field-stack">
              <span className="input-label">Cliente</span>
              <div className="relative">
              <input
                className={`input w-full ${
                  isConsumerFinalAnonymous ? "bg-zinc-100/80 text-zinc-700" : ""
                }`}
                value={customerSearch}
                onChange={(event) => {
                  if (isConsumerFinalAnonymous || isResolvingConsumerFinal) return;
                  onCustomerSearchChange(event.target.value);
                }}
                onFocus={() => {
                  if (isConsumerFinalAnonymous || isResolvingConsumerFinal) return;
                  onCustomerFocus();
                }}
                onBlur={() => {
                  if (isConsumerFinalAnonymous || isResolvingConsumerFinal) return;
                  onCustomerBlur();
                }}
                onKeyDown={(event) => {
                  if (isConsumerFinalAnonymous || isResolvingConsumerFinal) return;
                  onCustomerKeyDown(event);
                }}
                placeholder="Buscar cliente"
                autoComplete="off"
                readOnly={isConsumerFinalAnonymous}
                disabled={isResolvingConsumerFinal}
                role="combobox"
                aria-autocomplete="list"
                aria-haspopup="listbox"
                aria-expanded={isCustomerOpen}
                aria-controls="quote-customer-options"
                aria-activedescendant={
                  isCustomerOpen && customerMatches[customerActiveIndex]
                    ? `quote-customer-option-${customerMatches[customerActiveIndex].id}`
                    : undefined
                }
                required
              />
              <AnimatePresence>
                {isCustomerOpen && !isConsumerFinalAnonymous ? (
                  <motion.div
                    key="quote-customer-options"
                    id="quote-customer-options"
                    role="listbox"
                    aria-label="Clientes"
                    initial={{ opacity: 0, y: -8, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -8, scale: 0.98 }}
                    transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
                    className="absolute z-20 mt-2 w-full rounded-2xl border border-zinc-200/70 bg-white/90 p-2 shadow-[0_10px_20px_-16px_rgba(82,82,91,0.38)] backdrop-blur-xl"
                  >
                    {hasCustomers ? (
                      customerMatches.length ? (
                        customerMatches.map((customer, matchIndex) => {
                          const isSelected = customer.id === customerId;
                          const isActive = matchIndex === customerActiveIndex;
                          return (
                            <button
                              key={customer.id}
                              type="button"
                              id={`quote-customer-option-${customer.id}`}
                              role="option"
                              aria-selected={isSelected}
                              className={`flex w-full cursor-pointer items-center justify-between rounded-2xl px-3 py-2 text-left text-sm transition ${
                                isActive
                                  ? "bg-white text-sky-900"
                                  : isSelected
                                    ? "bg-white text-sky-900"
                                    : "hover:bg-white/70"
                              }`}
                              onMouseDown={(event) => {
                                event.preventDefault();
                                onCustomerSelect(customer);
                              }}
                            >
                              <span className="font-medium text-zinc-900">
                                {customer.displayName}
                              </span>
                              <span className="text-xs text-zinc-500">
                                {customer.taxId ?? "Sin CUIT"}
                              </span>
                            </button>
                          );
                        })
                      ) : (
                        <div className="px-3 py-2 text-xs text-zinc-500">
                          {isCustomerMatchesLoading
                            ? "Buscando..."
                            : "Sin resultados."}
                        </div>
                      )
                    ) : (
                      <div className="px-3 py-2 text-xs text-zinc-500">
                        No hay clientes. Crea uno para continuar.
                      </div>
                    )}
                  </motion.div>
                ) : null}
              </AnimatePresence>
              </div>
              <div className="mt-2 flex items-center gap-2 text-xs text-zinc-600">
                <button
                  type="button"
                  role="switch"
                  aria-label="Consumidor final sin identificar"
                  aria-checked={isConsumerFinalAnonymous}
                  onClick={() => onConsumerFinalToggle(!isConsumerFinalAnonymous)}
                  disabled={isConsumerFinalToggleDisabled}
                  className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/40 ${
                    isConsumerFinalAnonymous
                      ? "border-sky-300 bg-sky-100"
                      : "border-zinc-300 bg-zinc-100"
                  } ${
                    isConsumerFinalToggleDisabled
                      ? "cursor-not-allowed opacity-60"
                      : "cursor-pointer"
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 rounded-full bg-white shadow-[0_1px_4px_rgba(0,0,0,0.16)] transition-transform ${
                      isConsumerFinalAnonymous ? "translate-x-4" : "translate-x-0.5"
                    }`}
                  />
                </button>
                <span>Consumidor final (sin identificar)</span>
              </div>
              {showConsumerFinalThresholdWarning ? (
                <p className="rounded-xl border border-amber-200 bg-white px-3 py-2 text-xs text-amber-800">
                  Operacion de consumidor final mayor o igual a $
                  {consumerFinalThresholdLabel}. Vas a tener que confirmar para
                  continuar.
                </p>
              ) : null}
            </div>
          </div>

          <div className="field-stack">
            <div className="field-stack">
              <span className="input-label">Valido hasta</span>
              <input
                type="date"
                className="input cursor-pointer w-full"
                value={validUntil}
                onChange={(event) => onValidUntilChange(event.target.value)}
                placeholder="dd/mm/aaaa"
              />
            </div>
            <div className="field-stack">
              <span className="input-label">Lista de precios</span>
              <select
                className="input cursor-pointer w-full"
                value={selectedPriceListId}
                onChange={(event) => onSelectedPriceListChange(event.target.value)}
              >
                <option value="">Sin lista seleccionada</option>
                {priceLists.map((priceList) => (
                  <option key={priceList.id} value={priceList.id}>
                    {priceList.name}
                    {priceList.isDefault ? " (Default)" : ""}
                    {priceList.isConsumerFinal ? " (Consumidor final)" : ""}
                  </option>
                ))}
              </select>
              {showPriceListMismatchWarning ? (
                <p className="rounded-xl border border-amber-200 bg-white px-3 py-2 text-xs text-amber-800">
                  Advertencia: la lista seleccionada no coincide con la lista del
                  cliente.
                </p>
              ) : null}
            </div>
          </div>
        </div>

        <div className="subtle-divider" />

        <div className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="field-stack">
              <p className="section-title">Items</p>
            </div>
            <button
              type="button"
              className="btn btn-sky text-xs"
              onClick={onAddItem}
            >
              <PlusIcon className="size-4" />
              Agregar item
            </button>
          </div>
          <div className="relative table-scroll overflow-visible">
            <table className="w-full min-w-[940px] table-fixed text-left text-sm">
              <colgroup>
                <col />
                <col className="w-28" />
                <col className="w-48" />
                <col className="w-28" />
                <col className="w-48" />
                <col className="w-14" />
              </colgroup>
              <thead className="text-xs uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="py-3 pl-3">Producto</th>
                  <th className="py-3 pl-3">Cant.</th>
                  <th className="py-3 pl-3">Precio unit.</th>
                  <th className="py-3 pl-3">IVA</th>
                  <th className="py-3 pl-3">Total</th>
                  <th className="py-3 pl-3" />
                </tr>
              </thead>
              <tbody>
                {items.map((item, index) => {
                  const lineTotal =
                    item.qty && item.unitPrice
                      ? Number(item.qty) * Number(item.unitPrice)
                      : Number.NaN;
                  const taxRate = Number(item.taxRate);
                  const lineTax =
                    Number.isFinite(lineTotal) && Number.isFinite(taxRate)
                      ? lineTotal * (taxRate / 100)
                      : Number.NaN;
                  const product = productMap.get(item.productId);
                  const isOpen = openProductIndex === index;
                  const productMatches = getProductMatches(item.productSearch);
                  return (
                    <tr
                      key={`${item.productId}-${index}`}
                      className="border-t border-zinc-200/60 transition-colors hover:bg-white/60"
                    >
                      <td className="align-top py-3 pr-3">
                        <div className="space-y-1">
                          <div className="relative">
                            <input
                              className="input w-full min-w-[140px]"
                              value={item.productSearch}
                              onChange={(event) => {
                                onItemChange(
                                  index,
                                  "productSearch",
                                  event.target.value,
                                );
                                onOpenProductIndexChange(index);
                                onProductActiveIndexChange(0);
                              }}
                              onFocus={() => {
                                onOpenProductIndexChange(index);
                                onProductActiveIndexChange(0);
                              }}
                              onBlur={() => {
                                window.setTimeout(() => {
                                  onOpenProductIndexChange((current) =>
                                    current === index ? null : current,
                                  );
                                }, 120);
                              }}
                              onKeyDown={(event) =>
                                onProductKeyDown(event, index, productMatches)
                              }
                              placeholder="Buscar por nombre o codigo"
                              autoComplete="off"
                              role="combobox"
                              aria-autocomplete="list"
                              aria-haspopup="listbox"
                              aria-expanded={isOpen}
                              aria-controls={`quote-product-options-${index}`}
                              aria-activedescendant={
                                isOpen && productMatches[productActiveIndex]
                                  ? `quote-product-option-${index}-${productMatches[productActiveIndex].id}`
                                  : undefined
                              }
                              required
                            />
                            <AnimatePresence>
                              {isOpen ? (
                                <motion.div
                                  key={`quote-product-options-${index}`}
                                  id={`quote-product-options-${index}`}
                                  role="listbox"
                                  aria-label="Productos"
                                  initial={{ opacity: 0, y: -8, scale: 0.98 }}
                                  animate={{ opacity: 1, y: 0, scale: 1 }}
                                  exit={{ opacity: 0, y: -8, scale: 0.98 }}
                                  transition={{
                                    duration: 0.18,
                                    ease: [0.22, 1, 0.36, 1],
                                  }}
                                  className="absolute z-50 mt-2 w-full rounded-2xl border border-zinc-200/70 bg-white/90 p-2 shadow-[0_10px_20px_-16px_rgba(82,82,91,0.38)] backdrop-blur-xl"
                                >
                                  {hasProducts ? (
                                    productMatches.length ? (
                                      productMatches.map(
                                        (productOption, matchIndex) => {
                                          const isSelected =
                                            productOption.id === item.productId;
                                          const isActive =
                                            matchIndex === productActiveIndex;
                                          return (
                                            <button
                                              key={productOption.id}
                                              type="button"
                                              id={`quote-product-option-${index}-${productOption.id}`}
                                              role="option"
                                              aria-selected={isSelected}
                                              className={`flex w-full cursor-pointer items-center justify-between rounded-2xl px-3 py-2 text-left text-sm transition ${
                                                isActive
                                                  ? "bg-white text-sky-900"
                                                  : isSelected
                                                    ? "bg-white text-sky-900"
                                                    : "hover:bg-white/70"
                                              }`}
                                              onMouseDown={(event) => {
                                                event.preventDefault();
                                                onSelectProduct(
                                                  index,
                                                  productOption,
                                                );
                                              }}
                                            >
                                              <span className="font-medium text-zinc-900">
                                                {formatProductLabel(
                                                  productOption,
                                                )}
                                              </span>
                                              <span className="text-xs text-zinc-500">
                                                {formatUnit(
                                                  productOption.unit ?? null,
                                                )}
                                              </span>
                                            </button>
                                          );
                                        },
                                      )
                                    ) : (
                                      <div className="px-3 py-2 text-xs text-zinc-500">
                                        {isProductMatchesLoading
                                          ? "Buscando..."
                                          : "Sin resultados."}
                                      </div>
                                    )
                                  ) : (
                                    <div className="px-3 py-2 text-xs text-zinc-500">
                                      No hay productos. Crea uno para continuar.
                                    </div>
                                  )}
                                </motion.div>
                              ) : null}
                            </AnimatePresence>
                          </div>
                          <p className="mt-2 pl-2 text-[11px] text-zinc-500">
                            Unidad: {formatUnit(product?.unit ?? null)}
                          </p>
                        </div>
                      </td>
                      <td className="align-top py-3 pr-3">
                        <input
                          type="text"
                          inputMode="decimal"
                          className="input no-spinner w-full text-right tabular-nums"
                          value={formatQuantityInput(item.qty)}
                          onChange={(event) => {
                            const nextValue = normalizeDecimalInput(
                              event.target.value,
                              3,
                            );
                            onItemChange(index, "qty", nextValue);
                          }}
                          placeholder="0"
                          required
                        />
                      </td>
                      <td className="align-top py-3 pr-3">
                        <div className="relative">
                          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-zinc-500">
                            $
                          </span>
                          <MoneyInput
                            className="input no-spinner w-full pl-10 text-right tabular-nums"
                            value={item.unitPrice}
                            onValueChange={(nextValue) => {
                              onItemChange(index, "unitPrice", nextValue);
                            }}
                            placeholder="0,00"
                            maxDecimals={2}
                            required
                          />
                        </div>
                      </td>
                      <td className="align-top py-3 pr-3">
                        <select
                          className="input w-full cursor-pointer text-right"
                          value={item.taxRate}
                          onChange={(event) =>
                            onItemChange(index, "taxRate", event.target.value)
                          }
                        >
                          <option value="21">21%</option>
                          <option value="10.5">10.5%</option>
                          <option value="0">Exento</option>
                        </select>
                      </td>
                      <td className="align-top whitespace-nowrap py-3 pr-3 text-right tabular-nums text-zinc-900">
                        {Number.isFinite(lineTotal)
                          ? formatCurrencyARS(lineTotal)
                          : "-"}
                        {Number.isFinite(lineTax) ? (
                          <p className="mt-1 text-[11px] text-zinc-500">
                            IVA {formatCurrencyARS(lineTax)}
                          </p>
                        ) : null}
                      </td>
                      <td className="align-top py-3 pr-2 text-right">
                        <button
                          type="button"
                          className="btn btn-rose text-xs"
                          onClick={() => onRemoveItem(index)}
                        >
                          <TrashIcon className="size-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
            <div className="space-y-3 text-sm">
              <p className="section-title">Ajuste extra</p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className={`toggle-pill ${
                    extraType === "NONE" ? "toggle-pill-active" : ""
                  }`}
                  onClick={() => onExtraTypeChange("NONE")}
                  aria-pressed={extraType === "NONE"}
                >
                  Sin ajuste
                </button>
                <button
                  type="button"
                  className={`toggle-pill ${
                    extraType === "PERCENT" ? "toggle-pill-active" : ""
                  }`}
                  onClick={() => onExtraTypeChange("PERCENT")}
                  aria-pressed={extraType === "PERCENT"}
                >
                  Recargo %
                </button>
                <button
                  type="button"
                  className={`toggle-pill ${
                    extraType === "FIXED" ? "toggle-pill-active" : ""
                  }`}
                  onClick={() => onExtraTypeChange("FIXED")}
                  aria-pressed={extraType === "FIXED"}
                >
                  Recargo $
                </button>
                <button
                  type="button"
                  className={`toggle-pill ${
                    extraType === "DISCOUNT_PERCENT" ? "toggle-pill-active" : ""
                  }`}
                  onClick={() => onExtraTypeChange("DISCOUNT_PERCENT")}
                  aria-pressed={extraType === "DISCOUNT_PERCENT"}
                >
                  Descuento %
                </button>
                <button
                  type="button"
                  className={`toggle-pill ${
                    extraType === "DISCOUNT_FIXED" ? "toggle-pill-active" : ""
                  }`}
                  onClick={() => onExtraTypeChange("DISCOUNT_FIXED")}
                  aria-pressed={extraType === "DISCOUNT_FIXED"}
                >
                  Descuento $
                </button>
              </div>
              <div className="field-stack max-w-sm">
                <span className="input-label">
                  {isPercentExtra ? "Valor (%)" : "Valor ($)"}
                </span>
                <div className="relative">
                  {isPercentExtra ? null : (
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-zinc-500">
                      $
                    </span>
                  )}
                  {isPercentExtra ? (
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-zinc-500">
                      %
                    </span>
                  ) : null}
                  {isPercentExtra ? (
                    <input
                      type="text"
                      inputMode="decimal"
                      className="input no-spinner w-full pr-10 text-right tabular-nums"
                      value={formatPercentInput(extraValue)}
                      onChange={(event) => {
                        const nextValue = normalizeDecimalInput(
                          event.target.value,
                          2,
                        );
                        onExtraValueChange(nextValue);
                      }}
                      placeholder="0"
                    />
                  ) : (
                    <MoneyInput
                      className="input no-spinner w-full pl-10 text-right tabular-nums"
                      value={extraValue}
                      onValueChange={onExtraValueChange}
                      placeholder="0,00"
                      disabled={extraType === "NONE"}
                      maxDecimals={2}
                    />
                  )}
                </div>
              </div>
              <p className="section-subtitle">
                {extraType === "NONE"
                  ? "Sin recargo ni descuento aplicado."
                  : `${isDiscountExtra ? "El descuento" : "El recargo"} se aplica sobre el subtotal.`}
              </p>
            </div>

            <div className="rounded-2xl border border-dashed border-emerald-200 bg-white p-4 text-sm text-emerald-950/80">
              <p className="section-title !text-emerald-950/70">Totales</p>
              <div className="mt-3 space-y-2 text-sm text-emerald-950/75">
                <div className="flex items-center justify-between">
                  <span>Subtotal</span>
                  <span className="font-semibold text-emerald-950/95">
                    {formatCurrencyARS(subtotal)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span>IVA</span>
                  <span className="font-semibold text-emerald-950/95">
                    {formatCurrencyARS(taxesTotal)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span>{extraSummaryLabel}</span>
                  <span className="font-semibold text-emerald-950/95">
                    {formatCurrencyARS(extraAmount)}
                  </span>
                </div>
                <div className="mt-3 border-t border-emerald-200 pt-3 text-base font-semibold text-emerald-950">
                  <div className="flex items-center justify-between">
                    <span>Total</span>
                    <span>{formatCurrencyARS(total)}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="subtle-divider" />

        <div
          className={`grid gap-3 ${
            showSubmitAndCreateSale ? "sm:grid-cols-2" : "sm:grid-cols-1"
          }`}
        >
          <button
            type="submit"
            className="btn btn-emerald w-full"
            disabled={isSubmitting}
          >
            <CheckIcon className="size-4" />
            {isSubmitting ? "Guardando..." : submitLabel}
          </button>
          {showSubmitAndCreateSale ? (
            <button
              type="button"
              className="btn btn-sky w-full"
              disabled={isSubmitting}
              onClick={onSubmitAndCreateSale}
            >
              <PlusIcon className="size-4" />
              {isSubmitting ? "Guardando..." : "Guardar y crear venta"}
            </button>
          ) : null}
        </div>
        {status ? <p className="text-xs text-zinc-500">{status}</p> : null}
      </form>
    </div>
  );
}
