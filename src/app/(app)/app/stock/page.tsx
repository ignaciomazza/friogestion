"use client";

import type { FocusEvent, FormEvent, MouseEvent } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  CalculatorIcon,
  CheckIcon,
  MinusIcon,
  PlusIcon,
} from "@/components/icons";
import { MoneyInput } from "@/components/inputs/MoneyInput";
import { STOCK_ACCOUNTING_ENABLED, STOCK_PAGE_ENABLED } from "@/lib/features";
import { normalizeDecimalInput } from "@/lib/input-format";
import {
  DEFAULT_STOCK_SORT,
  normalizeStockSort,
  type StockSort,
} from "@/lib/stock-sort";
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
  calculatorQty: string;
  isSaving: boolean;
  warning: string | null;
};

type ProductTooltip = {
  id: string;
  name: string;
  x: number;
  y: number;
};

type TaxTooltip = {
  id: string;
  title: string;
  base: number;
  x: number;
  y: number;
};

type StockListResponse = {
  products: StockProduct[];
  priceLists: PriceListOption[];
  total: number;
  hasMore: boolean;
  nextOffset: number | null;
};

type LoadStockOptions = {
  offset?: number;
  append?: boolean;
  limit?: number;
  searchQuery?: string;
  sortOrder?: StockSort;
};

const DEFAULT_STOCK_PAGE_SIZE = 60;
const SEARCH_DEBOUNCE_MS = 260;
const STOCK_SORT_STORAGE_KEY = "friogestion.stock.sort";

const STOCK_SORT_OPTIONS: Array<{ value: StockSort; label: string }> = [
  { value: "created-desc", label: "Creacion reciente" },
  { value: "created-asc", label: "Creacion antigua" },
  { value: "code-asc", label: "Codigo A-Z" },
  { value: "code-desc", label: "Codigo Z-A" },
  { value: "name-asc", label: "Nombre A-Z" },
  { value: "name-desc", label: "Nombre Z-A" },
  { value: "brand-asc", label: "Marca A-Z" },
  { value: "brand-desc", label: "Marca Z-A" },
];

const readSavedStockSort = () => {
  if (typeof window === "undefined") return DEFAULT_STOCK_SORT;

  try {
    const savedSort = window.localStorage.getItem(STOCK_SORT_STORAGE_KEY);
    return normalizeStockSort(savedSort);
  } catch {
    return DEFAULT_STOCK_SORT;
  }
};

const normalizeMoney = (value: string) => normalizeDecimalInput(value, 2);
const normalizePercent = (value: string) => normalizeDecimalInput(value, 4);
const normalizeCalculatorQuantity = (value: string) =>
  normalizeDecimalInput(value, 3);

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

const pricePreviewNumberFormatter = new Intl.NumberFormat("es-AR", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

const IVA_21_MULTIPLIER = 1.21;

const formatPricePreview = (value: number | null | undefined) => {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "-";
  }
  return `$${pricePreviewNumberFormatter.format(value)}`;
};

const formatPriceWithIva21Preview = (value: number | null | undefined) => {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "-";
  }
  return formatPricePreview(normalizePriceNumber(value * IVA_21_MULTIPLIER));
};

const formatUsdPreview = (value: number | null | undefined) => {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "USD -";
  }
  return `USD ${pricePreviewNumberFormatter.format(value)}`;
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

const mergeProductsById = (current: StockProduct[], incoming: StockProduct[]) => {
  if (!current.length) return incoming;
  if (!incoming.length) return current;
  const seen = new Set(current.map((product) => product.id));
  const merged = [...current];
  for (const product of incoming) {
    if (seen.has(product.id)) continue;
    seen.add(product.id);
    merged.push(product);
  }
  return merged;
};

const getTooltipPosition = (event: MouseEvent<HTMLElement>) => ({
  x: Math.max(12, Math.min(event.clientX + 16, window.innerWidth - 320)),
  y: Math.max(12, Math.min(event.clientY + 18, window.innerHeight - 88)),
});

const getTaxTooltipPosition = (event: MouseEvent<HTMLElement>) => ({
  x: Math.max(12, Math.min(event.clientX + 16, window.innerWidth - 260)),
  y: Math.max(12, Math.min(event.clientY + 18, window.innerHeight - 132)),
});

const getTaxTooltipFocusPosition = (event: FocusEvent<HTMLElement>) => {
  const rect = event.currentTarget.getBoundingClientRect();
  return {
    x: Math.max(12, Math.min(rect.left, window.innerWidth - 260)),
    y: Math.max(12, Math.min(rect.bottom + 10, window.innerHeight - 132)),
  };
};

export default function StockPage() {
  const router = useRouter();
  const [products, setProducts] = useState<StockProduct[]>([]);
  const [priceLists, setPriceLists] = useState<PriceListOption[]>([]);
  const [rows, setRows] = useState<Record<string, RowDraft>>({});
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [sortOrder, setSortOrder] = useState<StockSort>(DEFAULT_STOCK_SORT);
  const [isSortOrderReady, setIsSortOrderReady] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [totalProducts, setTotalProducts] = useState(0);
  const [hasMoreProducts, setHasMoreProducts] = useState(false);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [showProductForm, setShowProductForm] = useState(false);
  const [isCreatingProduct, setIsCreatingProduct] = useState(false);
  const [productFormStatus, setProductFormStatus] = useState<string | null>(null);
  const [calculatorRows, setCalculatorRows] = useState<Set<string>>(
    () => new Set(),
  );
  const [productTooltip, setProductTooltip] = useState<ProductTooltip | null>(
    null,
  );
  const [taxTooltip, setTaxTooltip] = useState<TaxTooltip | null>(null);
  const [productForm, setProductForm] = useState({
    name: "",
    sku: "",
    brand: "",
    model: "",
    unit: "",
  });
  const productNameInputRef = useRef<HTMLInputElement | null>(null);
  const productSearchInputRef = useRef<HTMLInputElement | null>(null);
  const stockRequestIdRef = useRef(0);

  const updateProductTooltip = (
    product: StockProduct,
    event: MouseEvent<HTMLElement>,
  ) => {
    if (event.currentTarget.scrollWidth <= event.currentTarget.clientWidth) {
      setProductTooltip(null);
      return;
    }

    setProductTooltip({
      id: product.id,
      name: product.name,
      ...getTooltipPosition(event),
    });
  };

  const updateTaxTooltip = (
    id: string,
    title: string,
    value: number | null | undefined,
    event: MouseEvent<HTMLElement>,
  ) => {
    if (value === null || value === undefined || !Number.isFinite(value)) {
      setTaxTooltip(null);
      return;
    }

    setTaxTooltip({
      id,
      title,
      base: value,
      ...getTaxTooltipPosition(event),
    });
  };

  const focusTaxTooltip = (
    id: string,
    title: string,
    value: number | null | undefined,
    event: FocusEvent<HTMLElement>,
  ) => {
    if (value === null || value === undefined || !Number.isFinite(value)) {
      setTaxTooltip(null);
      return;
    }

    setTaxTooltip({
      id,
      title,
      base: value,
      ...getTaxTooltipFocusPosition(event),
    });
  };

  useEffect(() => {
    if (!STOCK_PAGE_ENABLED) {
      router.replace("/app/products");
    }
  }, [router]);

  useEffect(() => {
    if (!STOCK_PAGE_ENABLED) return;
    setSortOrder(readSavedStockSort());
    setIsSortOrderReady(true);
  }, []);

  useEffect(() => {
    if (!isSortOrderReady) return;
    try {
      window.localStorage.setItem(STOCK_SORT_STORAGE_KEY, sortOrder);
    } catch {
      // Ignore storage failures and keep the in-memory order.
    }
  }, [isSortOrderReady, sortOrder]);

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
        calculatorQty: previousDraft?.calculatorQty ?? "1",
        isSaving: false,
        warning: previousDraft?.warning ?? null,
      };
    }

    return nextRows;
  };

  const loadStock = useCallback(
    async ({
      offset = 0,
      append = false,
      limit = DEFAULT_STOCK_PAGE_SIZE,
      searchQuery = "",
      sortOrder: requestedSortOrder = sortOrder,
    }: LoadStockOptions = {}) => {
      if (!STOCK_PAGE_ENABLED) return;

      const requestId = ++stockRequestIdRef.current;
      if (append) {
        setIsLoadingMore(true);
      } else {
        setIsLoadingMore(false);
        setIsLoading(true);
      }

      try {
        const searchParams = new URLSearchParams();
        searchParams.set("limit", String(limit));
        searchParams.set("offset", String(offset));
        searchParams.set("sort", requestedSortOrder);
        if (searchQuery) {
          searchParams.set("q", searchQuery);
        }

        const res = await fetch(`/api/stock?${searchParams.toString()}`, {
          cache: "no-store",
        });
        if (!res.ok) {
          if (requestId === stockRequestIdRef.current) {
            setStatus("No se pudo cargar stock");
          }
          return;
        }

        const data = (await res.json()) as StockListResponse;
        if (requestId !== stockRequestIdRef.current) {
          return;
        }

        setPriceLists(data.priceLists);
        setTotalProducts(data.total);
        setHasMoreProducts(data.hasMore);
        setNextOffset(data.nextOffset);
        setProducts((previousProducts) => {
          const nextProducts = append
            ? mergeProductsById(previousProducts, data.products)
            : data.products;
          setRows((previousRows) =>
            hydrateRows(nextProducts, data.priceLists, previousRows),
          );
          return nextProducts;
        });
      } catch {
        if (requestId === stockRequestIdRef.current) {
          setStatus("No se pudo cargar stock");
        }
      } finally {
        if (requestId === stockRequestIdRef.current) {
          if (append) {
            setIsLoadingMore(false);
          } else {
            setIsLoading(false);
          }
        }
      }
    },
    [sortOrder],
  );

  useEffect(() => {
    if (!STOCK_PAGE_ENABLED) return;
    const timeoutId = window.setTimeout(() => {
      setDebouncedQuery(query.trim());
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timeoutId);
  }, [query]);

  useEffect(() => {
    if (!STOCK_PAGE_ENABLED || !isSortOrderReady) return;
    loadStock({
      offset: 0,
      append: false,
      searchQuery: debouncedQuery,
    }).catch(() => undefined);
  }, [loadStock, debouncedQuery, isSortOrderReady]);

  useEffect(() => {
    if (!showProductForm) return;
    productNameInputRef.current?.focus();
  }, [showProductForm]);

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
          calculatorQty: "1",
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
        calculatorQty: "1",
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
        calculatorQty: "1",
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

  const toggleCalculatorRow = (productId: string) => {
    setCalculatorRows((previous) => {
      const next = new Set(previous);
      if (next.has(productId)) {
        next.delete(productId);
      } else {
        next.add(productId);
      }
      return next;
    });
  };

  const handleSortOrderChange = (value: string) => {
    setSortOrder(normalizeStockSort(value));
  };

  const nudgeCalculatorQuantity = (productId: string, step: number) => {
    setRows((previous) => {
      const current = previous[productId] ?? {
        cost: "",
        costUsd: "",
        percentages: {},
        adjustmentQty: "",
        calculatorQty: "1",
        isSaving: false,
        warning: null,
      };
      const parsedCurrent = parseNumber(current.calculatorQty) ?? 0;
      const next = Math.max(0, parsedCurrent + step);

      return {
        ...previous,
        [productId]: {
          ...current,
          calculatorQty: formatSignedQuantity(next) || "0",
        },
      };
    });
  };

  const handleLoadMore = () => {
    if (nextOffset === null || isLoading || isLoadingMore) return;
    loadStock({
      offset: nextOffset,
      append: true,
      searchQuery: debouncedQuery,
    }).catch(() => undefined);
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
      if (
        STOCK_ACCOUNTING_ENABLED &&
        Number.isFinite(adjustmentNumber) &&
        adjustmentNumber !== 0
      ) {
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
      await loadStock({
        offset: 0,
        append: false,
        limit: Math.max(DEFAULT_STOCK_PAGE_SIZE, products.length),
        searchQuery: debouncedQuery,
      });
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
    setProductFormStatus(null);
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
        setProductFormStatus(data?.error ?? "No se pudo crear producto");
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
      await loadStock({
        offset: 0,
        append: false,
        limit: Math.max(DEFAULT_STOCK_PAGE_SIZE, products.length + 1),
        searchQuery: debouncedQuery,
      });
      setProductFormStatus("Producto creado.");
      window.setTimeout(() => {
        productSearchInputRef.current?.focus();
      }, 0);
    } catch {
      setProductFormStatus("No se pudo crear producto");
    } finally {
      setIsCreatingProduct(false);
    }
  };

  if (!STOCK_PAGE_ENABLED) {
    return null;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900">Stock</h1>
          <p className="mt-2 text-sm text-zinc-600">
            Ajusta costo ARS/USD y precios por lista en una sola grilla.
          </p>
        </div>
        <div className="shrink-0 rounded-lg border border-sky-200 bg-sky-50/70 px-2.5 py-1.5 text-right">
          <div className="flex items-baseline justify-end gap-1.5">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-sky-700">
              Productos
            </p>
            <p className="text-sm font-semibold tabular-nums text-sky-950">
              {totalProducts}
            </p>
          </div>
          {totalProducts > products.length ? (
            <p className="-mt-0.5 text-[10px] text-sky-700/80">
              Cargados {products.length}
            </p>
          ) : null}
        </div>
      </div>

      {STOCK_ACCOUNTING_ENABLED ? (
        <div className="max-w-xs rounded-xl border border-amber-200 bg-white px-3 py-2">
          <div className="flex items-center justify-between gap-4">
            <span className="text-xs font-medium text-amber-700">
              Stock cargado
            </span>
            <p className="text-sm font-semibold tabular-nums text-zinc-900">
              {totalStock.toLocaleString("es-AR", {
                minimumFractionDigits: 0,
                maximumFractionDigits: 3,
              })}
            </p>
          </div>
        </div>
      ) : null}

      <div className="card w-full space-y-2 border-dashed border-sky-200 p-3 md:p-4">
        <button
          type="button"
          className="w-full rounded-2xl bg-white/30 px-3 py-2 text-left transition hover:bg-white/50"
          onClick={() => {
            setProductFormStatus(null);
            setShowProductForm((prev) => !prev);
          }}
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
                  ref={productNameInputRef}
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
        {productFormStatus ? (
          <p
            className={`mt-2 text-xs ${
              productFormStatus.toLowerCase().includes("no se pudo")
                ? "text-rose-700"
                : "text-emerald-700"
            }`}
            role="status"
            aria-live="polite"
          >
            {productFormStatus}
          </p>
        ) : null}
      </div>

      <div className="card space-y-4 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
            Costos y listas de precios
          </h2>
          <div className="flex w-full flex-wrap items-center justify-start gap-3 sm:w-auto sm:flex-nowrap sm:justify-end">
            <label className="inline-flex items-center gap-2">
              <span className="text-xs font-medium text-zinc-500">Ordenar</span>
              <select
                className="input cursor-pointer border-sky-200 text-xs text-sky-950 focus:border-sky-300"
                value={sortOrder}
                onChange={(event) => handleSortOrderChange(event.target.value)}
                aria-label="Ordenar stock"
              >
                {STOCK_SORT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <input
              className="input min-w-[260px] flex-1 sm:w-96 sm:flex-none"
              ref={productSearchInputRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar por nombre o codigo"
            />
          </div>
        </div>
        <div className="table-scroll">
          <table className="w-full min-w-[860px] text-left text-xs">
            <thead className="text-[11px] uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="w-[220px] py-2 pr-2">Producto</th>
                <th className="w-[108px] py-2 pr-2">Costo ARS</th>
                <th className="w-[108px] py-2 pr-2">Costo USD</th>
                {priceLists.map((priceList) => (
                  <th key={priceList.id} className="w-[96px] py-2 pr-2">
                    Precio {priceList.name}
                  </th>
                ))}
                {STOCK_ACCOUNTING_ENABLED ? (
                  <th className="w-[220px] py-2 pr-2">Stock</th>
                ) : null}
                <th className="sticky right-0 z-20 w-[104px] bg-white/95 py-2 pr-2 text-right">
                  <span className="sr-only">Acciones</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {products.map((product) => {
                const derivedPercentages = derivePercentagesFromPrices(
                  product,
                  priceLists,
                );
                const draft = rows[product.id] ?? {
                  cost: product.cost ?? "",
                  costUsd: product.costUsd ?? "",
                  percentages: derivedPercentages,
                  adjustmentQty: "",
                  calculatorQty: "1",
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
                const hasCurrentCostUsd = currentCostUsd !== null;
                const computedPrices = calculatePricesFromPercentages(
                  currentCost,
                  draft.percentages,
                  priceLists,
                );
                const calculatorActive = calculatorRows.has(product.id);
                const calculatorQuantity = parseNumber(draft.calculatorQty);
                const calculatorColSpan =
                  priceLists.length + 2 + (STOCK_ACCOUNTING_ENABLED ? 1 : 0);
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
                    className="border-t border-zinc-200/60 transition-colors hover:bg-white/60"
                  >
                    <td className="py-3 pr-2 align-top">
                      <div
                        className="flex min-h-10 max-w-[220px] min-w-0 flex-col justify-center gap-0.5"
                      >
                        <p
                          className="min-w-0 truncate text-sm font-medium text-zinc-900"
                          onMouseEnter={(event) =>
                            updateProductTooltip(product, event)
                          }
                          onMouseMove={(event) =>
                            updateProductTooltip(product, event)
                          }
                          onMouseLeave={() => setProductTooltip(null)}
                          aria-label={product.name}
                        >
                          {product.name}
                        </p>
                        <p className="max-w-full text-[11px] leading-snug text-zinc-500">
                          {product.sku ? (
                            <>
                              <span className="break-all font-medium tabular-nums text-zinc-600">
                                {product.sku}
                              </span>
                              <span className="text-zinc-400"> · </span>
                            </>
                          ) : null}
                          <span className="whitespace-nowrap">
                            {formatUnit(product.unit)}
                          </span>
                        </p>
                      </div>
                    </td>
                    {calculatorActive ? (
                      <td
                        className="py-3 pr-2 align-top"
                        colSpan={calculatorColSpan}
                      >
                        <motion.div
                          initial={{ opacity: 0, y: -4 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.18, ease: "easeOut" }}
                          className="flex min-h-[3.75rem] flex-wrap items-center gap-4"
                        >
                          <div className="flex items-center gap-2 pr-1 text-[11px]">
                            <span className="text-zinc-400">Unit.</span>
                            <span
                              className="cursor-help whitespace-nowrap font-semibold tabular-nums text-zinc-800 outline-none"
                              onMouseEnter={(event) =>
                                updateTaxTooltip(
                                  `${product.id}-cost-ars`,
                                  "Costo unitario",
                                  currentCost,
                                  event,
                                )
                              }
                              onMouseMove={(event) =>
                                updateTaxTooltip(
                                  `${product.id}-cost-ars`,
                                  "Costo unitario",
                                  currentCost,
                                  event,
                                )
                              }
                              onMouseLeave={() => setTaxTooltip(null)}
                              onFocus={(event) =>
                                focusTaxTooltip(
                                  `${product.id}-cost-ars`,
                                  "Costo unitario",
                                  currentCost,
                                  event,
                                )
                              }
                              onBlur={() => setTaxTooltip(null)}
                              tabIndex={0}
                            >
                              ARS {formatPriceWithIva21Preview(currentCost)}
                              <span className="ml-1 text-[10px] font-semibold text-zinc-400">
                                c/IVA 21
                              </span>
                            </span>
                            {hasCurrentCostUsd ? (
                              <>
                                <span className="text-zinc-300">/</span>
                                <span className="font-semibold tabular-nums text-zinc-600">
                                  {formatUsdPreview(currentCostUsd)}
                                </span>
                              </>
                            ) : null}
                          </div>
                          <div className="flex items-center gap-1 rounded-full bg-white p-0.5 shadow-[inset_0_0_0_1px_rgba(228,228,231,0.9)]">
                            <button
                              type="button"
                              className="inline-flex h-7 w-7 items-center justify-center rounded-full text-zinc-600 transition hover:bg-zinc-100"
                              onClick={() => nudgeCalculatorQuantity(product.id, -1)}
                              aria-label="Restar cantidad"
                            >
                              <MinusIcon className="size-3.5" />
                            </button>
                            <MoneyInput
                              className="h-7 w-16 bg-transparent px-1 text-center text-xs font-semibold tabular-nums text-zinc-900 outline-none"
                              value={draft.calculatorQty}
                              onValueChange={(nextValue) =>
                                updateRow(product.id, {
                                  calculatorQty:
                                    normalizeCalculatorQuantity(nextValue),
                                })
                              }
                              placeholder="1"
                              maxDecimals={3}
                              aria-label="Cantidad"
                            />
                            <button
                              type="button"
                              className="inline-flex h-7 w-7 items-center justify-center rounded-full text-zinc-600 transition hover:bg-zinc-100"
                              onClick={() => nudgeCalculatorQuantity(product.id, 1)}
                              aria-label="Sumar cantidad"
                            >
                              <PlusIcon className="size-3.5" />
                            </button>
                          </div>
                          {priceLists.map((priceList) => {
                            const unitPrice = computedPrices[priceList.id];
                            const finalPrice =
                              unitPrice !== null && calculatorQuantity !== null
                                ? normalizePriceNumber(
                                    unitPrice * calculatorQuantity,
                                  )
                                : null;

                            return (
                              <div
                                key={`${product.id}-${priceList.id}-calculator`}
                                className="flex min-w-[154px] items-center justify-between gap-2 rounded-full bg-white px-3 py-1.5 shadow-[inset_0_0_0_1px_rgba(212,212,216,0.95),0_8px_22px_-20px_rgba(39,39,42,0.45)]"
                              >
                                <span className="truncate text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
                                  {priceList.name}
                                </span>
                                <span
                                  className="cursor-help whitespace-nowrap text-sm font-semibold tabular-nums text-zinc-900 outline-none"
                                  onMouseEnter={(event) =>
                                    updateTaxTooltip(
                                      `${product.id}-${priceList.id}-total`,
                                      `${priceList.name} total`,
                                      finalPrice,
                                      event,
                                    )
                                  }
                                  onMouseMove={(event) =>
                                    updateTaxTooltip(
                                      `${product.id}-${priceList.id}-total`,
                                      `${priceList.name} total`,
                                      finalPrice,
                                      event,
                                    )
                                  }
                                  onMouseLeave={() => setTaxTooltip(null)}
                                  onFocus={(event) =>
                                    focusTaxTooltip(
                                      `${product.id}-${priceList.id}-total`,
                                      `${priceList.name} total`,
                                      finalPrice,
                                      event,
                                    )
                                  }
                                  onBlur={() => setTaxTooltip(null)}
                                  tabIndex={0}
                                >
                                  {formatPriceWithIva21Preview(finalPrice)}
                                  <span className="ml-1 text-[10px] font-semibold text-zinc-400">
                                    c/IVA 21
                                  </span>
                                </span>
                              </div>
                            );
                          })}
                        </motion.div>
                      </td>
                    ) : (
                      <>
                        <td className="py-3 pr-2 align-top">
                          <div className="w-24 space-y-1">
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
                            <span aria-hidden="true" className="block min-h-4" />
                          </div>
                        </td>
                        <td className="py-3 pr-2 align-top">
                          <div className="w-24 space-y-1">
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
                            <span aria-hidden="true" className="block min-h-4" />
                          </div>
                        </td>
                        {priceLists.map((priceList) => (
                          <td
                            key={`${product.id}-${priceList.id}`}
                            className="py-3 pr-2 align-top"
                          >
                            <div className="w-20 space-y-1">
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
                              <p
                                className="min-h-4 cursor-help whitespace-nowrap text-right text-[11px] font-medium tabular-nums text-zinc-600 outline-none"
                                onMouseEnter={(event) =>
                                  updateTaxTooltip(
                                    `${product.id}-${priceList.id}-unit`,
                                    `Precio ${priceList.name}`,
                                    computedPrices[priceList.id],
                                    event,
                                  )
                                }
                                onMouseMove={(event) =>
                                  updateTaxTooltip(
                                    `${product.id}-${priceList.id}-unit`,
                                    `Precio ${priceList.name}`,
                                    computedPrices[priceList.id],
                                    event,
                                  )
                                }
                                onMouseLeave={() => setTaxTooltip(null)}
                                onFocus={(event) =>
                                  focusTaxTooltip(
                                    `${product.id}-${priceList.id}-unit`,
                                    `Precio ${priceList.name}`,
                                    computedPrices[priceList.id],
                                    event,
                                  )
                                }
                                onBlur={() => setTaxTooltip(null)}
                                tabIndex={0}
                              >
                                {formatPriceWithIva21Preview(
                                  computedPrices[priceList.id],
                                )}
                                <span className="ml-1 text-[10px] font-semibold text-zinc-400">
                                  c/IVA 21
                                </span>
                              </p>
                            </div>
                          </td>
                        ))}
                        {STOCK_ACCOUNTING_ENABLED ? (
                          <td className="py-3 pr-2 align-top">
                            <div className="flex min-h-10 items-center gap-2 whitespace-nowrap">
                              <span className="font-semibold text-zinc-800">
                                {formatStock(product.stock)}
                              </span>
                              <button
                                type="button"
                                className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-zinc-200 text-zinc-700 transition hover:bg-white"
                                onClick={() =>
                                  nudgeStockAdjustment(product.id, -1)
                                }
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
                              <span
                                className={`text-[11px] font-semibold ${adjustmentClass}`}
                              >
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
                        ) : null}
                      </>
                    )}
                    <td className="sticky right-0 z-10 bg-white/95 py-3 pr-2 text-right align-top hover:z-30 focus-within:z-30">
                      <div className="flex min-h-10 items-center justify-end gap-2">
                        <div className="group relative">
                          <button
                            type="button"
                            className={`inline-flex h-10 w-10 items-center justify-center rounded-full border text-zinc-700 transition ${
                              calculatorActive
                                ? "border-sky-200 bg-sky-50 text-sky-700 shadow-[0_8px_20px_-18px_rgba(2,132,199,0.65)]"
                                : "border-zinc-200 bg-white hover:bg-zinc-50"
                            }`}
                            onClick={() => toggleCalculatorRow(product.id)}
                            aria-label={
                              calculatorActive
                                ? "Cerrar simulador"
                                : "Abrir simulador"
                            }
                            aria-pressed={calculatorActive}
                          >
                            <CalculatorIcon className="size-4" />
                          </button>
                          <span className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 -translate-x-1/2 translate-y-1 rounded-full border border-zinc-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-zinc-900 opacity-0 shadow-[0_12px_30px_-20px_rgba(24,24,27,0.7)] transition duration-150 group-hover:translate-y-0 group-hover:opacity-100">
                            Simulador
                          </span>
                        </div>
                        <button
                          type="button"
                          className="btn btn-emerald h-10 w-10 p-0"
                          disabled={draft.isSaving || isLoading || !hasRowChanges}
                          onClick={() => saveRow(product.id)}
                          aria-label={
                            draft.isSaving ? "Guardando cambios" : "Guardar cambios"
                          }
                          title={
                            draft.isSaving ? "Guardando cambios" : "Guardar cambios"
                          }
                        >
                          <CheckIcon className="size-4" />
                          <span className="sr-only">
                            {draft.isSaving ? "Guardando..." : "Guardar"}
                          </span>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!products.length ? (
                <tr>
                  <td
                    className="py-4 text-sm text-zinc-500"
                    colSpan={priceLists.length + (STOCK_ACCOUNTING_ENABLED ? 5 : 4)}
                  >
                    No hay productos para mostrar.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      {hasMoreProducts ? (
        <div className="flex justify-center">
          <button
            type="button"
            className="btn"
            disabled={isLoading || isLoadingMore || nextOffset === null}
            onClick={handleLoadMore}
          >
            {isLoadingMore ? "Cargando..." : "Cargar mas"}
          </button>
        </div>
      ) : null}

      <AnimatePresence>
        {productTooltip ? (
          <motion.div
            key={productTooltip.id}
            className="pointer-events-none fixed left-0 top-0 z-50 max-w-xs rounded-xl border border-zinc-400 bg-white px-3 py-2 text-xs font-medium leading-snug text-zinc-950 shadow-[0_18px_50px_-24px_rgba(24,24,27,0.65)]"
            initial={{
              opacity: 0,
              scale: 0.98,
              x: productTooltip.x,
              y: productTooltip.y,
            }}
            animate={{
              opacity: 1,
              scale: 1,
              x: productTooltip.x,
              y: productTooltip.y,
            }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{
              opacity: { duration: 0.12 },
              scale: { duration: 0.12 },
              x: { duration: 0 },
              y: { duration: 0 },
            }}
          >
            {productTooltip.name}
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {taxTooltip ? (
          <motion.div
            key={taxTooltip.id}
            className="pointer-events-none fixed left-0 top-0 z-[60] w-56 rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-xs text-zinc-900 shadow-[0_18px_50px_-24px_rgba(24,24,27,0.7)]"
            initial={{
              opacity: 0,
              scale: 0.98,
              x: taxTooltip.x,
              y: taxTooltip.y,
            }}
            animate={{
              opacity: 1,
              scale: 1,
              x: taxTooltip.x,
              y: taxTooltip.y,
            }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{
              opacity: { duration: 0.12 },
              scale: { duration: 0.12 },
              x: { duration: 0 },
              y: { duration: 0 },
            }}
          >
            <p className="mb-2 truncate text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
              {taxTooltip.title}
            </p>
            <div className="space-y-1">
              <div className="flex items-center justify-between gap-3">
                <span className="text-zinc-500">Exento</span>
                <span className="font-semibold tabular-nums">
                  {formatPricePreview(taxTooltip.base)}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-zinc-500">IVA 10.5%</span>
                <span className="font-semibold tabular-nums">
                  {formatPricePreview(
                    normalizePriceNumber(taxTooltip.base * 1.105),
                  )}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-zinc-500">IVA 21%</span>
                <span className="font-semibold tabular-nums">
                  {formatPricePreview(
                    normalizePriceNumber(taxTooltip.base * IVA_21_MULTIPLIER),
                  )}
                </span>
              </div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {status ? <p className="text-xs text-zinc-500">{status}</p> : null}
    </div>
  );
}
