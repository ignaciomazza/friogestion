"use client";

import type {
  Dispatch,
  FormEvent,
  KeyboardEvent,
  ReactNode,
  SetStateAction,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CheckIcon, PlusIcon, TrashIcon } from "@/components/icons";
import { MoneyInput } from "@/components/inputs/MoneyInput";
import { formatCurrencyARS } from "@/lib/format";
import {
  formatQuantityInput,
  normalizeDecimalInput,
} from "@/lib/input-format";
import type { ProductOption, PurchaseItemForm, SupplierOption } from "../types";
import { formatProductLabel, formatUnit } from "../utils";

type NewPurchaseFormProps = {
  supplierSearch: string;
  supplierId: string;
  isSupplierOpen: boolean;
  supplierMatches: SupplierOption[];
  supplierActiveIndex: number;
  hasSuppliers: boolean;
  onSupplierSearchChange: (value: string) => void;
  onSupplierFocus: () => void;
  onSupplierBlur: () => void;
  onSupplierKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
  onSupplierSelect: (supplier: SupplierOption) => void;
  invoiceNumber: string;
  invoiceDate: string;
  onInvoiceNumberChange: (value: string) => void;
  onInvoiceDateChange: (value: string) => void;
  items: PurchaseItemForm[];
  productMap: Map<string, ProductOption>;
  hasProducts: boolean;
  openProductIndex: number | null;
  productActiveIndex: number;
  getProductMatches: (query: string) => ProductOption[];
  onItemChange: (
    index: number,
    field: keyof PurchaseItemForm,
    value: string
  ) => void;
  onOpenProductIndexChange: Dispatch<SetStateAction<number | null>>;
  onProductActiveIndexChange: Dispatch<SetStateAction<number>>;
  onProductKeyDown: (
    event: KeyboardEvent<HTMLInputElement>,
    index: number,
    matches: ProductOption[]
  ) => void;
  onSelectProduct: (index: number, product: ProductOption) => void;
  onRemoveItem: (index: number) => void;
  onAddItem: () => void;
  subtotal: number;
  extraSection?: ReactNode;
  isSubmitting: boolean;
  status: string | null;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
};

export function NewPurchaseForm({
  supplierSearch,
  supplierId,
  isSupplierOpen,
  supplierMatches,
  supplierActiveIndex,
  onSupplierSearchChange,
  onSupplierFocus,
  onSupplierBlur,
  onSupplierKeyDown,
  onSupplierSelect,
  hasSuppliers,
  invoiceNumber,
  invoiceDate,
  onInvoiceNumberChange,
  onInvoiceDateChange,
  items,
  productMap,
  hasProducts,
  openProductIndex,
  productActiveIndex,
  getProductMatches,
  onItemChange,
  onOpenProductIndexChange,
  onProductActiveIndexChange,
  onProductKeyDown,
  onSelectProduct,
  onRemoveItem,
  onAddItem,
  subtotal,
  extraSection,
  isSubmitting,
  status,
  onSubmit,
}: NewPurchaseFormProps) {
  return (
    <div className="card space-y-6 p-6 lg:p-7">
      <div>
        <h2 className="text-lg font-semibold text-zinc-900">
          Nueva compra
        </h2>
      </div>

      <form onSubmit={onSubmit} className="space-y-8">
        <div className="grid gap-6 lg:grid-cols-[2fr_1fr] lg:items-start">
          <div className="field-stack">
            <div className="field-stack">
              <span className="input-label">Proveedor</span>
              <div className="relative">
                <input
                  className="input w-full"
                  value={supplierSearch}
                  onChange={(event) => onSupplierSearchChange(event.target.value)}
                  onFocus={onSupplierFocus}
                  onBlur={onSupplierBlur}
                  onKeyDown={onSupplierKeyDown}
                  placeholder="Buscar proveedor por nombre o CUIT"
                  autoComplete="off"
                  role="combobox"
                  aria-autocomplete="list"
                  aria-haspopup="listbox"
                  aria-expanded={isSupplierOpen}
                  aria-controls="supplier-options"
                  aria-activedescendant={
                    isSupplierOpen && supplierMatches[supplierActiveIndex]
                      ? `supplier-option-${supplierMatches[supplierActiveIndex].id}`
                      : undefined
                  }
                  required
                />
                <AnimatePresence>
                  {isSupplierOpen ? (
                    <motion.div
                      key="purchase-supplier-options"
                      id="supplier-options"
                      role="listbox"
                      aria-label="Proveedores"
                      initial={{ opacity: 0, y: -8, scale: 0.98 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -8, scale: 0.98 }}
                      transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
                      className="absolute z-20 mt-2 w-full rounded-2xl border border-zinc-200/70 bg-white/90 p-2 shadow-[0_10px_20px_-16px_rgba(82,82,91,0.38)] backdrop-blur-xl"
                    >
                      {hasSuppliers ? (
                        supplierMatches.length ? (
                          supplierMatches.map((supplier, matchIndex) => {
                            const isSelected = supplier.id === supplierId;
                            const isActive = matchIndex === supplierActiveIndex;
                            return (
                              <button
                                key={supplier.id}
                                type="button"
                                id={`supplier-option-${supplier.id}`}
                                role="option"
                                aria-selected={isSelected}
                                className={`flex w-full items-center cursor-pointer justify-between rounded-2xl px-3 py-2 text-left text-sm transition ${
                                  isActive
                                    ? "bg-white text-sky-900"
                                    : isSelected
                                      ? "bg-white text-sky-900"
                                      : "hover:bg-white/70"
                                }`}
                                onMouseDown={(event) => {
                                  event.preventDefault();
                                  onSupplierSelect(supplier);
                                }}
                              >
                                <span className="font-medium text-zinc-900">
                                  {supplier.displayName}
                                </span>
                                <span className="text-xs text-zinc-500">
                                  {supplier.taxId ?? "Sin CUIT"}
                                </span>
                              </button>
                            );
                          })
                        ) : (
                          <div className="px-3 py-2 text-xs text-zinc-500">
                            Sin resultados.
                          </div>
                        )
                      ) : (
                        <div className="px-3 py-2 text-xs text-zinc-500">
                          No hay proveedores. Crea uno para continuar.
                        </div>
                      )}
                    </motion.div>
                  ) : null}
                </AnimatePresence>
              </div>
            </div>
          </div>

          <div className="field-stack">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
              <label className="flex flex-col gap-2">
                <span className="input-label">Factura</span>
                <input
                  className="input w-full"
                  value={invoiceNumber}
                  onChange={(event) => onInvoiceNumberChange(event.target.value)}
                  placeholder="Factura"
                />
              </label>
              <label className="flex flex-col gap-2">
                <span className="input-label">Fecha</span>
                <input
                  type="date"
                  className="input cursor-pointer w-full"
                  value={invoiceDate}
                  onChange={(event) => onInvoiceDateChange(event.target.value)}
                />
              </label>
            </div>
          </div>
        </div>

        <div className="subtle-divider" />

        <div className="space-y-3">
          <div className="table-scroll overflow-visible">
            <table className="w-full min-w-[920px] table-fixed text-left text-sm">
              <colgroup>
                <col />
                <col className="w-28" />
                <col className="w-[8.5rem]" />
                <col className="w-44" />
                <col className="w-48" />
                <col className="w-14" />
              </colgroup>
              <thead className="text-xs uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="py-2 pl-3">Producto</th>
                  <th className="py-2 pl-3">Cant.</th>
                  <th className="py-2 pl-3">Costo unit.</th>
                  <th className="py-2 pl-3">Precio venta (opc.)</th>
                  <th className="py-2 pl-3">Total</th>
                  <th className="py-2 pl-3"></th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, index) => {
                  const lineTotal =
                    item.qty && item.unitCost
                      ? Number(item.qty) * Number(item.unitCost)
                      : Number.NaN;
                  const product = productMap.get(item.productId);
                  const isOpen = openProductIndex === index;
                  const productMatches = getProductMatches(item.productSearch);
                  return (
                    <tr
                      key={`${item.productId}-${index}`}
                      className="border-t border-zinc-200/60"
                    >
                      <td className="align-top py-2 pr-3">
                        <div className="space-y-1">
                          <div className="relative">
                            <input
                              className="input w-full min-w-[140px]"
                              value={item.productSearch}
                              onChange={(event) => {
                                onItemChange(
                                  index,
                                  "productSearch",
                                  event.target.value
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
                                    current === index ? null : current
                                  );
                                }, 120);
                              }}
                              onKeyDown={(event) =>
                                onProductKeyDown(event, index, productMatches)
                              }
                              placeholder="Buscar por nombre, codigo interno o codigo compra"
                              autoComplete="off"
                              role="combobox"
                              aria-autocomplete="list"
                              aria-haspopup="listbox"
                              aria-expanded={isOpen}
                              aria-controls={`product-options-${index}`}
                              aria-activedescendant={
                                isOpen && productMatches[productActiveIndex]
                                  ? `product-option-${index}-${productMatches[productActiveIndex].id}`
                                  : undefined
                              }
                              required
                            />
                            <AnimatePresence>
                              {isOpen ? (
                                <motion.div
                                  key={`purchase-product-options-${index}`}
                                  id={`product-options-${index}`}
                                  role="listbox"
                                  aria-label="Productos"
                                  initial={{ opacity: 0, y: -8, scale: 0.98 }}
                                  animate={{ opacity: 1, y: 0, scale: 1 }}
                                  exit={{ opacity: 0, y: -8, scale: 0.98 }}
                                  transition={{
                                    duration: 0.18,
                                    ease: [0.22, 1, 0.36, 1],
                                  }}
                                  className="absolute z-20 mt-2 w-full rounded-2xl border border-zinc-200/70 bg-white/90 p-2 shadow-[0_10px_20px_-16px_rgba(82,82,91,0.38)] backdrop-blur-xl"
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
                                              id={`product-option-${index}-${productOption.id}`}
                                              role="option"
                                              aria-selected={isSelected}
                                              className={`flex w-full items-center cursor-pointer justify-between rounded-2xl px-3 py-2 text-left text-sm transition ${
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
                                                  productOption
                                                );
                                              }}
                                            >
                                              <span className="font-medium text-zinc-900">
                                                {formatProductLabel(
                                                  productOption
                                                )}
                                              </span>
                                              <span className="text-xs text-zinc-500">
                                                {formatUnit(
                                                  productOption.unit ?? null
                                                )}
                                              </span>
                                            </button>
                                          );
                                        }
                                      )
                                    ) : (
                                      <div className="px-3 py-2 text-xs text-zinc-500">
                                        Sin resultados.
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
                          <p className="text-xs text-zinc-500">
                            Unidad: {formatUnit(product?.unit ?? null)}
                          </p>
                        </div>
                      </td>
                      <td className="align-top py-2 pr-3">
                        <input
                          type="text"
                          inputMode="decimal"
                          className="input no-spinner w-full text-right tabular-nums"
                          value={formatQuantityInput(item.qty)}
                          onChange={(event) => {
                            const nextValue = normalizeDecimalInput(
                              event.target.value,
                              3
                            );
                            onItemChange(index, "qty", nextValue);
                          }}
                          placeholder="0"
                          required
                        />
                      </td>
                      <td className="align-top py-2 pr-3">
                        <div className="relative">
                          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-zinc-500">
                            $
                          </span>
                          <MoneyInput
                            className="input no-spinner w-full pl-10 text-right tabular-nums"
                            value={item.unitCost}
                            onValueChange={(nextValue) => {
                              onItemChange(index, "unitCost", nextValue);
                            }}
                            placeholder="0,00"
                            maxDecimals={2}
                            required
                          />
                        </div>
                      </td>
                      <td className="align-top py-2 pr-3">
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
                          />
                        </div>
                      </td>
                      <td className="align-top whitespace-nowrap py-2 pr-3 text-right tabular-nums text-zinc-900">
                        {Number.isFinite(lineTotal)
                          ? formatCurrencyARS(lineTotal)
                          : "-"}
                      </td>
                      <td className="align-top py-2 pr-3">
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

          <div className="flex flex-wrap items-center justify-between gap-2">
            <button type="button" className="btn btn-sky" onClick={onAddItem}>
              <PlusIcon className="size-4" />
              Agregar item
            </button>
            <div className="text-sm text-zinc-600">
              Subtotal:{" "}
              <span className="font-semibold text-zinc-900">
                {formatCurrencyARS(subtotal)}
              </span>
            </div>
          </div>
        </div>

        {extraSection}

        <button
          type="submit"
          className="btn btn-emerald w-full"
          disabled={isSubmitting}
        >
          <CheckIcon className="size-4" />
          {isSubmitting ? "Guardando..." : "Guardar compra"}
        </button>
        {status ? <p className="text-xs text-zinc-500">{status}</p> : null}
      </form>
    </div>
  );
}
