"use client";

import type { FormEvent } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  CheckIcon,
  CubeIcon,
  MinusIcon,
  PlusIcon,
} from "@/components/icons";
import { MoneyInput } from "@/components/inputs/MoneyInput";
import { normalizeDecimalInput } from "@/lib/input-format";
import { UNIT_LABELS, UNIT_VALUES, UNIT_OPTIONS } from "@/lib/units";

type PriceListOption = {
  id: string;
  name: string;
  currencyCode: string;
  isDefault: boolean;
  isActive: boolean;
};

type StockPrice = {
  priceListId: string;
  price: string;
};

type StockProduct = {
  id: string;
  name: string;
  sku: string | null;
  brand: string | null;
  model: string | null;
  unit: string | null;
  cost: string | null;
  costUsd: string | null;
  price: string | null;
  stock: string;
  prices: StockPrice[];
};

type RowDraft = {
  cost: string;
  costUsd: string;
  percentages: Record<string, string>;
  adjustmentQty: string;
  isSaving: boolean;
  warning: string | null;
};

const normalizeQuery = (value: string) => value.trim().toLowerCase();

const normalizeMoney = (value: string) => normalizeDecimalInput(value, 2);
const normalizePercent = (value: string) => normalizeDecimalInput(value, 4);

const normalizeSignedQuantity = (value: string) => {
  const trimmed = value.trim();
  const isNegative = trimmed.startsWith("-");
  const normalized = normalizeDecimalInput(trimmed.replace(/-/g, ""), 3);

  if (!normalized) {
    return isNegative ? "-" : "";
  }
  return isNegative ? `-${normalized}` : normalized;
};

const parseNumber = (value: string | null | undefined) => {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const normalizePriceNumber = (value: number | null) => {
  if (value === null || !Number.isFinite(value)) return null;
  return Number(value.toFixed(2));
};

const formatPercentageValue = (value: number) => {
  if (!Number.isFinite(value)) return "";
  const normalized = value.toFixed(4).replace(/\.?0+$/, "");
  return normalized === "-0" ? "0" : normalized;
};

const formatSignedQuantity = (value: number) => {
  if (!Number.isFinite(value) || value === 0) return "";
  const normalized = value.toFixed(3).replace(/\.?0+$/, "");
  return normalized === "-0" ? "" : normalized;
};

const formatStock = (value: string | number) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return "0";
  return parsed.toLocaleString("es-AR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3,
  });
};

const formatUnit = (unit: string | null) => {
  if (!unit) return "-";
  return UNIT_LABELS[unit as (typeof UNIT_VALUES)[number]] ?? unit;
};

const getProductPriceForList = (
  product: StockProduct,
  priceList: PriceListOption,
) => {
  const explicit = product.prices.find(
    (price) => price.priceListId === priceList.id,
  )?.price;
  if (explicit !== undefined) return explicit;
  if (priceList.isDefault) return product.price ?? "";
  return "";
};

const calculatePricesFromPercentages = (
  cost: number | null,
  percentages: Record<string, string>,
  priceLists: PriceListOption[],
) => {
  const computedPrices: Record<string, number | null> = {};
  let basePrice = cost;

  for (const priceList of priceLists) {
    const percentage = parseNumber(percentages[priceList.id]);
    if (basePrice === null || percentage === null) {
      computedPrices[priceList.id] = null;
      continue;
    }

    const nextPrice = normalizePriceNumber(basePrice * (1 + percentage / 100));
    computedPrices[priceList.id] = nextPrice;
    basePrice = nextPrice;
  }

  return computedPrices;
};

const derivePercentagesFromPrices = (
  product: StockProduct,
  priceLists: PriceListOption[],
) => {
  const derived: Record<string, string> = {};
  let basePrice = parseNumber(product.cost);

  for (const priceList of priceLists) {
    const listPrice = parseNumber(getProductPriceForList(product, priceList));

    if (basePrice === null || listPrice === null) {
      derived[priceList.id] = "";
      continue;
    }

    if (basePrice === 0) {
      derived[priceList.id] = listPrice === 0 ? "0" : "";
      basePrice = listPrice;
      continue;
    }

    const percentage = ((listPrice - basePrice) / basePrice) * 100;
    derived[priceList.id] = formatPercentageValue(percentage);
    basePrice = listPrice;
  }

  return derived;
};

export default function StockPage() {
  const [products, setProducts] = useState<StockProduct[]>([]);
  const [priceLists, setPriceLists] = useState<PriceListOption[]>([]);
  const [rows, setRows] = useState<Record<string, RowDraft>>({});
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showProductForm, setShowProductForm] = useState(false);
  const [isCreatingProduct, setIsCreatingProduct] = useState(false);
  const [productForm, setProductForm] = useState({
    name: "",
    sku: "",
    brand: "",
    model: "",
    unit: "",
  });

  const hydrateRows = (
    nextProducts: StockProduct[],
    nextPriceLists: PriceListOption[],
    previous: Record<string, RowDraft>,
  ) => {
    const nextRows: Record<string, RowDraft> = {};

    for (const product of nextProducts) {
      const previousDraft = previous[product.id];
      const derivedPercentages = derivePercentagesFromPrices(
        product,
        nextPriceLists,
      );
      const nextPercentages: Record<string, string> = {};

      for (const priceList of nextPriceLists) {
        nextPercentages[priceList.id] =
          previousDraft?.percentages[priceList.id] ??
          derivedPercentages[priceList.id] ??
          "";
      }

      nextRows[product.id] = {
        cost: previousDraft?.cost ?? product.cost ?? "",
        costUsd: previousDraft?.costUsd ?? product.costUsd ?? "",
        percentages: nextPercentages,
        adjustmentQty: previousDraft?.adjustmentQty ?? "",
        isSaving: false,
        warning: previousDraft?.warning ?? null,
      };
    }

    return nextRows;
  };

  const loadStock = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/stock", { cache: "no-store" });
      if (!res.ok) {
        setStatus("No se pudo cargar stock");
        return;
      }

      const data = (await res.json()) as {
        products: StockProduct[];
        priceLists: PriceListOption[];
      };

      setProducts(data.products);
      setPriceLists(data.priceLists);
      setRows((previous) =>
        hydrateRows(data.products, data.priceLists, previous),
      );
    } catch {
      setStatus("No se pudo cargar stock");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStock().catch(() => undefined);
  }, [loadStock]);

  const filteredProducts = useMemo(() => {
    const normalized = normalizeQuery(query);
    return products.filter((product) => {
      if (!normalized) return true;
      const haystack = normalizeQuery(
        `${product.name} ${product.sku ?? ""} ${product.brand ?? ""} ${product.model ?? ""}`,
      );
      return haystack.includes(normalized);
    });
  }, [products, query]);

  const totalProducts = products.length;
  const totalStock = products.reduce((sum, product) => {
    const parsed = Number(product.stock ?? 0);
    return Number.isFinite(parsed) ? sum + parsed : sum;
  }, 0);

  const updateRow = (productId: string, updates: Partial<RowDraft>) => {
    setRows((previous) => ({
      ...previous,
      [productId]: {
        ...(previous[productId] ?? {
          cost: "",
          costUsd: "",
          percentages: {},
          adjustmentQty: "",
          isSaving: false,
          warning: null,
        }),
        ...updates,
      },
    }));
  };

  const updateRowPercentage = (
    productId: string,
    priceListId: string,
    value: string,
  ) => {
    setRows((previous) => {
      const current = previous[productId] ?? {
        cost: "",
        costUsd: "",
        percentages: {},
        adjustmentQty: "",
        isSaving: false,
        warning: null,
      };
      return {
        ...previous,
        [productId]: {
          ...current,
          percentages: {
            ...current.percentages,
            [priceListId]: value,
          },
        },
      };
    });
  };

  const nudgeStockAdjustment = (productId: string, step: number) => {
    setRows((previous) => {
      const current = previous[productId] ?? {
        cost: "",
        costUsd: "",
        percentages: {},
        adjustmentQty: "",
        isSaving: false,
        warning: null,
      };
      const parsedCurrent = Number(current.adjustmentQty);
      const next =
        (Number.isFinite(parsedCurrent) ? parsedCurrent : 0) + step;

      return {
        ...previous,
        [productId]: {
          ...current,
          adjustmentQty: formatSignedQuantity(next),
        },
      };
    });
  };

  const saveRow = async (productId: string) => {
    const draft = rows[productId];
    const product = products.find((item) => item.id === productId);
    if (!draft || !product) return;

    updateRow(productId, { isSaving: true, warning: null });
    setStatus(null);

    try {
      const costNumber = parseNumber(draft.cost);
      const costUsdNumber = parseNumber(draft.costUsd);
      const hasAnyPercentage = priceLists.some(
        (priceList) => parseNumber(draft.percentages[priceList.id]) !== null,
      );
      if (hasAnyPercentage && costNumber === null) {
        setStatus("Carga el costo para calcular precios por porcentaje");
        return;
      }

      const computedPrices = calculatePricesFromPercentages(
        costNumber,
        draft.percentages,
        priceLists,
      );

      const currentCost = normalizePriceNumber(costNumber);
      const originalCost = normalizePriceNumber(parseNumber(product.cost));
      const costChanged = currentCost !== originalCost;
      const currentCostUsd = normalizePriceNumber(costUsdNumber);
      const originalCostUsd = normalizePriceNumber(parseNumber(product.costUsd));
      const costUsdChanged = currentCostUsd !== originalCostUsd;

      const pricesPayload =
        costNumber === null
          ? []
          : priceLists.reduce<Array<{ priceListId: string; price: number | null }>>(
              (updates, priceList) => {
                const originalPrice = normalizePriceNumber(
                  parseNumber(getProductPriceForList(product, priceList)),
                );
                const nextPrice = normalizePriceNumber(
                  computedPrices[priceList.id],
                );

                if (originalPrice !== nextPrice) {
                  updates.push({
                    priceListId: priceList.id,
                    price: nextPrice,
                  });
                }
                return updates;
              },
              [],
            );

      if (costChanged || costUsdChanged || pricesPayload.length > 0) {
        const patchRes = await fetch("/api/stock", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            productId,
            ...(costChanged ? { cost: currentCost } : {}),
            ...(costUsdChanged ? { costUsd: currentCostUsd } : {}),
            ...(pricesPayload.length > 0 ? { prices: pricesPayload } : {}),
          }),
        });
        const patchData = await patchRes.json();
        if (!patchRes.ok) {
          setStatus(patchData?.error ?? "No se pudo guardar");
          return;
        }
      }

      const adjustmentNumber = Number(draft.adjustmentQty);
      if (Number.isFinite(adjustmentNumber) && adjustmentNumber !== 0) {
        const adjustRes = await fetch("/api/stock/adjustments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            productId,
            qty: adjustmentNumber,
          }),
        });
        const adjustData = await adjustRes.json();
        if (!adjustRes.ok) {
          setStatus(adjustData?.error ?? "No se pudo ajustar stock");
          return;
        }

        if (adjustData?.warning) {
          updateRow(productId, { warning: adjustData.warning as string });
        }
      }

      updateRow(productId, {
        adjustmentQty: "",
      });
      setStatus(`Guardado ${product.name}`);
      await loadStock();
    } catch {
      setStatus("No se pudo guardar");
    } finally {
      updateRow(productId, { isSaving: false });
    }
  };

  const handleCreateProduct = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!productForm.name.trim()) return;

    setIsCreatingProduct(true);
    setStatus(null);
    try {
      const res = await fetch("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: productForm.name.trim(),
          sku: productForm.sku || undefined,
          brand: productForm.brand || undefined,
          model: productForm.model || undefined,
          unit: productForm.unit || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus(data?.error ?? "No se pudo crear producto");
        return;
      }
      setProductForm({
        name: "",
        sku: "",
        brand: "",
        model: "",
        unit: "",
      });
      setShowProductForm(false);
      await loadStock();
      setStatus("Producto creado");
    } catch {
      setStatus("No se pudo crear producto");
    } finally {
      setIsCreatingProduct(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900">Stock</h1>
        <p className="mt-2 text-sm text-zinc-600">
          Ajusta costo ARS/USD, precios por lista y stock por producto en una sola grilla.
        </p>
      </div>

      <div className="table-scroll pb-1">
        <div className="grid min-w-[680px] grid-cols-3 gap-2">
          <div className="card border !border-sky-200 p-3 !bg-white">
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2 text-xs font-medium text-sky-700">
                <CubeIcon className="size-3.5" />
                Productos
              </span>
              <p className="text-base font-semibold text-zinc-900">
                {totalProducts}
              </p>
            </div>
          </div>
          <div className="card border !border-emerald-200 p-3 !bg-white">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-emerald-700">
                Listas activas
              </span>
              <p className="text-base font-semibold text-zinc-900">
                {priceLists.length}
              </p>
            </div>
          </div>
          <div className="card border !border-amber-200 p-3 !bg-white">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-amber-700">
                Stock total
              </span>
              <p className="text-base font-semibold text-zinc-900">
                {totalStock.toLocaleString("es-AR", {
                  minimumFractionDigits: 0,
                  maximumFractionDigits: 3,
                })}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="card w-full space-y-2 border-dashed border-sky-200 p-3 md:p-4">
        <button
          type="button"
          className="w-full rounded-2xl bg-white/30 px-3 py-2 text-left transition hover:bg-white/50"
          onClick={() => setShowProductForm((prev) => !prev)}
          aria-expanded={showProductForm}
          aria-controls="stock-product-form"
        >
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h3 className="section-title">Nuevo producto</h3>
              <p className="mt-0.5 text-xs text-zinc-500">
                {showProductForm ? "Alta rapida." : "Crea un producto rapido."}
              </p>
            </div>
            <span
              className={`pill border px-2.5 py-1 text-[11px] font-semibold ${
                showProductForm
                  ? "border-sky-200 bg-white text-sky-900"
                  : "border-sky-200 bg-white/60 text-sky-800"
              }`}
            >
              {showProductForm ? "Ocultar" : "Mostrar"}
            </span>
          </div>
        </button>

        <AnimatePresence initial={false} mode="wait">
          {showProductForm ? (
            <motion.div
              key="stock-product-form"
              initial={{ opacity: 0, height: 0, y: -8 }}
              animate={{ opacity: 1, height: "auto", y: 0 }}
              exit={{ opacity: 0, height: 0, y: -8 }}
              transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
              className="reveal-motion px-1 pb-1"
            >
              <form
                id="stock-product-form"
                onSubmit={handleCreateProduct}
                className="grid gap-3 rounded-2xl border border-zinc-200/70 bg-white/80 p-3 sm:grid-cols-2 lg:grid-cols-3"
              >
                <input
                  className="input"
                  value={productForm.name}
                  onChange={(event) =>
                    setProductForm((previous) => ({
                      ...previous,
                      name: event.target.value,
                    }))
                  }
                  placeholder="Nombre"
                  required
                />
                <input
                  className="input"
                  value={productForm.sku}
                  onChange={(event) =>
                    setProductForm((previous) => ({
                      ...previous,
                      sku: event.target.value,
                    }))
                  }
                  placeholder="Codigo"
                />
                <select
                  className="input cursor-pointer"
                  value={productForm.unit}
                  onChange={(event) =>
                    setProductForm((previous) => ({
                      ...previous,
                      unit: event.target.value,
                    }))
                  }
                >
                  <option value="">Unidad</option>
                  {UNIT_OPTIONS.map((unit) => (
                    <option key={unit.value} value={unit.value}>
                      {unit.label}
                    </option>
                  ))}
                </select>
                <input
                  className="input"
                  value={productForm.brand}
                  onChange={(event) =>
                    setProductForm((previous) => ({
                      ...previous,
                      brand: event.target.value,
                    }))
                  }
                  placeholder="Marca"
                />
                <input
                  className="input"
                  value={productForm.model}
                  onChange={(event) =>
                    setProductForm((previous) => ({
                      ...previous,
                      model: event.target.value,
                    }))
                  }
                  placeholder="Modelo"
                />
                <button
                  type="submit"
                  className="btn btn-emerald"
                  disabled={isCreatingProduct}
                >
                  <CheckIcon className="size-4" />
                  {isCreatingProduct ? "Guardando..." : "Guardar"}
                </button>
              </form>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>

      <div className="card space-y-4 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
            Stock de productos
          </h2>
          <input
            className="input w-full max-w-sm"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar por nombre o codigo"
          />
        </div>
        <div className="table-scroll">
          <table className="w-full min-w-[1280px] text-left text-xs">
            <thead className="text-[11px] uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="py-2 pr-3">Producto</th>
                <th className="py-2 pr-3">Costo ARS</th>
                <th className="py-2 pr-3">Costo USD</th>
                {priceLists.map((priceList) => (
                  <th key={priceList.id} className="py-2 pr-3">
                    Precio {priceList.name}
                  </th>
                ))}
                <th className="py-2 pr-3">Stock</th>
                <th className="py-2 pr-3 text-right">Guardar</th>
              </tr>
            </thead>
            <tbody>
              {filteredProducts.map((product) => {
                const derivedPercentages = derivePercentagesFromPrices(
                  product,
                  priceLists,
                );
                const draft = rows[product.id] ?? {
                  cost: product.cost ?? "",
                  costUsd: product.costUsd ?? "",
                  percentages: derivedPercentages,
                  adjustmentQty: "",
                  isSaving: false,
                  warning: null,
                };
                const currentStock = Number(product.stock ?? 0);
                const adjustment = Number(draft.adjustmentQty || 0);
                const projectedStock =
                  Number.isFinite(currentStock) && Number.isFinite(adjustment)
                    ? currentStock + adjustment
                    : currentStock;
                const isProjectedNegative = projectedStock < 0;
                const originalCost = parseNumber(product.cost ?? null);
                const currentCost = parseNumber(draft.cost);
                const costChanged = originalCost !== currentCost;
                const originalCostUsd = parseNumber(product.costUsd ?? null);
                const currentCostUsd = parseNumber(draft.costUsd);
                const costUsdChanged = originalCostUsd !== currentCostUsd;
                const computedPrices = calculatePricesFromPercentages(
                  currentCost,
                  draft.percentages,
                  priceLists,
                );
                const hasPercentagesWithoutCost =
                  currentCost === null &&
                  priceLists.some(
                    (priceList) =>
                      parseNumber(draft.percentages[priceList.id]) !== null,
                  );
                const pricesChanged =
                  currentCost === null
                    ? false
                    : priceLists.some((priceList) => {
                        const originalPrice = normalizePriceNumber(
                          parseNumber(getProductPriceForList(product, priceList)),
                        );
                        const currentPrice = normalizePriceNumber(
                          computedPrices[priceList.id],
                        );
                        return originalPrice !== currentPrice;
                      });
                const adjustmentChanged =
                  Number.isFinite(adjustment) && adjustment !== 0;
                const hasRowChanges =
                  costChanged ||
                  costUsdChanged ||
                  pricesChanged ||
                  adjustmentChanged ||
                  hasPercentagesWithoutCost;
                const adjustmentLabel =
                  Number.isFinite(adjustment) && adjustment !== 0
                    ? `${adjustment > 0 ? "+" : ""}${formatStock(adjustment)}`
                    : "0";
                const adjustmentClass =
                  adjustment > 0
                    ? "text-emerald-700"
                    : adjustment < 0
                      ? "text-rose-700"
                      : "text-zinc-500";

                return (
                  <tr
                    key={product.id}
                    className="border-t border-zinc-200/60 align-middle transition-colors hover:bg-white/60"
                  >
                    <td className="py-3 pr-3">
                      <div className="flex max-w-[320px] items-center gap-2 whitespace-nowrap">
                        <p className="truncate text-sm font-medium text-zinc-900">
                          {product.name}
                        </p>
                        <p className="truncate text-[11px] text-zinc-500">
                          {product.sku ? `Cod ${product.sku} · ` : ""}
                          {formatUnit(product.unit)}
                        </p>
                      </div>
                    </td>
                    <td className="py-3 pr-3">
                      <div className="w-32">
                        <MoneyInput
                          className="input no-spinner w-full px-2 text-right tabular-nums"
                          value={draft.cost}
                          onValueChange={(nextValue) =>
                            updateRow(product.id, {
                              cost: normalizeMoney(nextValue),
                            })
                          }
                          placeholder="0,00"
                          maxDecimals={2}
                          prefix="$"
                        />
                      </div>
                    </td>
                    <td className="py-3 pr-3">
                      <div className="w-32">
                        <MoneyInput
                          className="input no-spinner w-full px-2 text-right tabular-nums"
                          value={draft.costUsd}
                          onValueChange={(nextValue) =>
                            updateRow(product.id, {
                              costUsd: normalizeMoney(nextValue),
                            })
                          }
                          placeholder="0,00"
                          maxDecimals={2}
                          prefix="USD "
                        />
                      </div>
                    </td>
                    {priceLists.map((priceList) => (
                      <td key={`${product.id}-${priceList.id}`} className="py-3 pr-3">
                        <div className="w-32">
                          <MoneyInput
                            className="input no-spinner w-full px-2 text-right tabular-nums"
                            value={draft.percentages[priceList.id] ?? ""}
                            onValueChange={(nextValue) =>
                              updateRowPercentage(
                                product.id,
                                priceList.id,
                                normalizePercent(nextValue),
                              )
                            }
                            placeholder="0"
                            maxDecimals={4}
                            suffix="%"
                          />
                        </div>
                      </td>
                    ))}
                    <td className="py-3 pr-3">
                      <div className="flex items-center gap-2 whitespace-nowrap">
                        <span className="font-semibold text-zinc-800">
                          {formatStock(product.stock)}
                        </span>
                        <button
                          type="button"
                          className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-zinc-200 text-zinc-700 transition hover:bg-white"
                          onClick={() => nudgeStockAdjustment(product.id, -1)}
                          aria-label="Restar una unidad"
                        >
                          <MinusIcon className="size-3.5" />
                        </button>
                        <input
                          className="input w-20 text-right tabular-nums"
                          inputMode="decimal"
                          value={draft.adjustmentQty}
                          onChange={(event) =>
                            updateRow(product.id, {
                              adjustmentQty: normalizeSignedQuantity(
                                event.target.value,
                              ),
                            })
                          }
                          placeholder="+/-"
                        />
                        <button
                          type="button"
                          className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-zinc-200 text-zinc-700 transition hover:bg-white"
                          onClick={() => nudgeStockAdjustment(product.id, 1)}
                          aria-label="Sumar una unidad"
                        >
                          <PlusIcon className="size-3.5" />
                        </button>
                        <span className={`text-[11px] font-semibold ${adjustmentClass}`}>
                          {adjustmentLabel}
                        </span>
                        <span className="text-zinc-500">=</span>
                        <span
                          className={`font-semibold ${
                            isProjectedNegative
                              ? "text-amber-700"
                              : "text-emerald-700"
                          }`}
                        >
                          {formatStock(projectedStock)}
                        </span>
                      </div>
                      {draft.warning ? (
                        <p className="mt-1 text-[11px] text-amber-700">
                          {draft.warning}
                        </p>
                      ) : null}
                    </td>
                    <td className="py-3 pr-3 text-right">
                      <button
                        type="button"
                        className="btn btn-emerald text-xs"
                        disabled={draft.isSaving || isLoading || !hasRowChanges}
                        onClick={() => saveRow(product.id)}
                      >
                        <CheckIcon className="size-4" />
                        {draft.isSaving ? "Guardando..." : "Guardar"}
                      </button>
                    </td>
                  </tr>
                );
              })}
              {!filteredProducts.length ? (
                <tr>
                  <td
                    className="py-4 text-sm text-zinc-500"
                    colSpan={priceLists.length + 5}
                  >
                    No hay productos para mostrar.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      {status ? <p className="text-xs text-zinc-500">{status}</p> : null}
    </div>
  );
}
