"use client";

import type { FocusEvent, FormEvent, MouseEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { ToastContainer, toast, type Id as ToastId } from "react-toastify";
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
import { APP_NAVIGATION_GUARD_EVENT } from "@/lib/navigation-guard";
import { UNIT_LABELS, UNIT_VALUES, UNIT_OPTIONS } from "@/lib/units";
import "react-toastify/dist/ReactToastify.css";

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
  percentage: string | null;
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

type StockSaveStatus = "idle" | "queued" | "saving" | "saved" | "failed";
type CalculatorPriceBasis = "ars" | "usd";

type RowDraft = {
  cost: string;
  costUsd: string;
  percentages: Record<string, string>;
  adjustmentQty: string;
  adjustmentRequestId: string | null;
  calculatorQty: string;
  calculatorPriceBasis: CalculatorPriceBasis;
  isSaving: boolean;
  saveStatus: StockSaveStatus;
  saveError: string | null;
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
  latestUsdRate: string | null;
};

type LoadStockOptions = {
  offset?: number;
  append?: boolean;
  limit?: number;
  searchQuery?: string;
  sortOrder?: StockSort;
};

type StockPriceUpdate = {
  priceListId: string;
  price: number | null;
  percentage: number | null;
  isDefault: boolean;
};

type StockSaveJob = {
  productId: string;
  cost: number | null;
  costChanged: boolean;
  costUsd: number | null;
  costUsdChanged: boolean;
  priceUpdates: StockPriceUpdate[];
  adjustmentQty: number | null;
  adjustmentRequestId: string | null;
};

type StockSaveQueueStats = {
  total: number;
  saved: number;
  failed: number;
};

type StockSaveQueueSummary = StockSaveQueueStats & {
  pending: number;
  active: number;
};

type StockRowChangeState = {
  currentCost: number | null;
  currentCostUsd: number | null;
  currentCostUsdArs: number | null;
  effectiveCost: number | null;
  computedPrices: Record<string, number | null>;
  computedPricesFromArs: Record<string, number | null>;
  computedPricesFromUsd: Record<string, number | null>;
  costChanged: boolean;
  costUsdChanged: boolean;
  percentagesChanged: boolean;
  pricesChanged: boolean;
  adjustment: number;
  adjustmentChanged: boolean;
  hasPercentagesWithoutCost: boolean;
  hasUsdCostWithoutRate: boolean;
  hasRowChanges: boolean;
};

type StockSaveBuildResult =
  | { ok: true; job: StockSaveJob }
  | { ok: false; error: string };

const DEFAULT_STOCK_PAGE_SIZE = 60;
const SEARCH_DEBOUNCE_MS = 260;
const STOCK_SAVE_CONCURRENCY = 3;
const STOCK_SORT_STORAGE_KEY = "friogestion.stock.sort";
const STOCK_SAVE_TOAST_ID = "stock-save-queue";
const STOCK_EXIT_BLOCKED_TOAST_ID = "stock-exit-blocked";

const INITIAL_SAVE_QUEUE_SUMMARY: StockSaveQueueSummary = {
  total: 0,
  saved: 0,
  failed: 0,
  pending: 0,
  active: 0,
};

const createEmptyRowDraft = (
  overrides: Partial<RowDraft> = {},
): RowDraft => ({
  cost: "",
  costUsd: "",
  percentages: {},
  adjustmentQty: "",
  adjustmentRequestId: null,
  calculatorQty: "1",
  calculatorPriceBasis: "ars",
  isSaving: false,
  saveStatus: "idle",
  saveError: null,
  warning: null,
  ...overrides,
});

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

const createStockAdjustmentRequestId = () => {
  const random =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2, 12);
  return `stock-adjustment-${Date.now()}-${random}`;
};

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

const parsePositiveNumber = (value: string | number | null | undefined) => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const normalizePriceNumber = (value: number | null) => {
  if (value === null || !Number.isFinite(value)) return null;
  return Number(value.toFixed(2));
};

const normalizePercentageNumber = (value: string | null | undefined) => {
  const parsed = parseNumber(value);
  if (parsed === null || !Number.isFinite(parsed)) return null;
  return Number(parsed.toFixed(4));
};

const convertUsdCostToArs = (
  costUsd: number | null,
  latestUsdRate: number | null,
) => {
  if (costUsd === null || latestUsdRate === null) return null;
  return normalizePriceNumber(costUsd * latestUsdRate);
};

const resolveEffectiveCost = ({
  cost,
  costUsd,
  latestUsdRate,
}: {
  cost: number | null;
  costUsd: number | null;
  latestUsdRate: number | null;
}) => cost ?? convertUsdCostToArs(costUsd, latestUsdRate);

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

const getProductPercentageForList = (
  product: StockProduct,
  priceList: PriceListOption,
) =>
  product.prices.find((price) => price.priceListId === priceList.id)
    ?.percentage ?? null;

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
  latestUsdRate: number | null,
) => {
  const derived: Record<string, string> = {};
  let basePrice =
    parseNumber(product.cost) ??
    convertUsdCostToArs(parseNumber(product.costUsd), latestUsdRate);

  for (const priceList of priceLists) {
    const storedPercentage = getProductPercentageForList(product, priceList);
    const listPrice = parseNumber(getProductPriceForList(product, priceList));

    if (storedPercentage !== null) {
      derived[priceList.id] = formatPercentageValue(Number(storedPercentage));
      basePrice = listPrice;
      continue;
    }

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

const getStockRowChangeState = (
  product: StockProduct,
  draft: RowDraft,
  priceLists: PriceListOption[],
  latestUsdRate: number | null,
): StockRowChangeState => {
  const currentCost = parseNumber(draft.cost);
  const currentCostUsd = parseNumber(draft.costUsd);
  const currentCostUsdArs = convertUsdCostToArs(
    currentCostUsd,
    latestUsdRate,
  );
  const effectiveCost = resolveEffectiveCost({
    cost: currentCost,
    costUsd: currentCostUsd,
    latestUsdRate,
  });
  const computedPricesFromArs = calculatePricesFromPercentages(
    currentCost,
    draft.percentages,
    priceLists,
  );
  const computedPricesFromUsd = calculatePricesFromPercentages(
    currentCostUsdArs,
    draft.percentages,
    priceLists,
  );
  const computedPrices = calculatePricesFromPercentages(
    effectiveCost,
    draft.percentages,
    priceLists,
  );
  const costChanged =
    normalizePriceNumber(currentCost) !==
    normalizePriceNumber(parseNumber(product.cost));
  const costUsdChanged =
    normalizePriceNumber(currentCostUsd) !==
    normalizePriceNumber(parseNumber(product.costUsd));
  const derivedPercentages = derivePercentagesFromPrices(
    product,
    priceLists,
    latestUsdRate,
  );
  const percentagesChanged = priceLists.some(
    (priceList) =>
      normalizePercentageNumber(draft.percentages[priceList.id]) !==
      normalizePercentageNumber(derivedPercentages[priceList.id]),
  );
  const hasDraftPercentages = priceLists.some(
    (priceList) => parseNumber(draft.percentages[priceList.id]) !== null,
  );
  const hasPercentagesWithoutCost =
    effectiveCost === null &&
    hasDraftPercentages &&
    (costChanged || costUsdChanged || percentagesChanged);
  const hasUsdCostWithoutRate =
    currentCostUsd !== null &&
    latestUsdRate === null &&
    currentCost === null &&
    (costChanged || costUsdChanged || percentagesChanged);
  const pricesChanged =
    effectiveCost === null ||
    !(costChanged || costUsdChanged || percentagesChanged)
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
  const adjustment = Number(draft.adjustmentQty);
  const adjustmentChanged = Number.isFinite(adjustment) && adjustment !== 0;

  return {
    currentCost,
    currentCostUsd,
    currentCostUsdArs,
    effectiveCost,
    computedPrices,
    computedPricesFromArs,
    computedPricesFromUsd,
    costChanged,
    costUsdChanged,
    percentagesChanged,
    pricesChanged,
    adjustment,
    adjustmentChanged,
    hasPercentagesWithoutCost,
    hasUsdCostWithoutRate,
    hasRowChanges:
      costChanged ||
      costUsdChanged ||
      percentagesChanged ||
      pricesChanged ||
      adjustmentChanged ||
      hasUsdCostWithoutRate ||
      hasPercentagesWithoutCost,
  };
};

const buildStockSaveJob = (
  product: StockProduct,
  draft: RowDraft,
  priceLists: PriceListOption[],
  latestUsdRate: number | null,
): StockSaveBuildResult => {
  const rowState = getStockRowChangeState(
    product,
    draft,
    priceLists,
    latestUsdRate,
  );

  if (!rowState.hasRowChanges) {
    return { ok: false, error: "No hay cambios para guardar" };
  }

  if (rowState.hasUsdCostWithoutRate) {
    return {
      ok: false,
      error: "Configura la cotizacion interna USD -> ARS para usar costo USD",
    };
  }

  if (rowState.hasPercentagesWithoutCost) {
    return {
      ok: false,
      error: "Carga costo ARS o costo USD para calcular precios por porcentaje",
    };
  }

  const shouldSyncComputedPrices =
    rowState.effectiveCost !== null &&
    (rowState.costChanged ||
      rowState.costUsdChanged ||
      rowState.percentagesChanged ||
      rowState.pricesChanged);
  const priceUpdates = priceLists.reduce<StockPriceUpdate[]>(
    (updates, priceList) => {
      const originalPrice = normalizePriceNumber(
        parseNumber(getProductPriceForList(product, priceList)),
      );
      const originalPercentage = normalizePercentageNumber(
        getProductPercentageForList(product, priceList),
      );
      const nextPercentage = normalizePercentageNumber(
        draft.percentages[priceList.id],
      );
      const shouldConsiderPriceDiff =
        rowState.costChanged ||
        rowState.costUsdChanged ||
        rowState.percentagesChanged ||
        rowState.pricesChanged;

      if (shouldSyncComputedPrices) {
        updates.push({
          priceListId: priceList.id,
          price: normalizePriceNumber(rowState.computedPrices[priceList.id]),
          percentage: nextPercentage,
          isDefault: priceList.isDefault,
        });
        return updates;
      }

      if (!shouldConsiderPriceDiff) {
        return updates;
      }

      if (
        rowState.effectiveCost === null &&
        rowState.percentagesChanged &&
        nextPercentage === null &&
        originalPercentage !== null
      ) {
        updates.push({
          priceListId: priceList.id,
          price: null,
          percentage: null,
          isDefault: priceList.isDefault,
        });
        return updates;
      }

      const nextPrice = normalizePriceNumber(rowState.computedPrices[priceList.id]);
      if (originalPrice !== nextPrice || originalPercentage !== nextPercentage) {
        updates.push({
          priceListId: priceList.id,
          price: nextPrice,
          percentage: nextPercentage,
          isDefault: priceList.isDefault,
        });
      }
      return updates;
    },
    [],
  );

  if (
    !rowState.costChanged &&
    !rowState.costUsdChanged &&
    priceUpdates.length === 0 &&
    !rowState.adjustmentChanged
  ) {
    return { ok: false, error: "No hay cambios para guardar" };
  }

  return {
    ok: true,
    job: {
      productId: product.id,
      cost: normalizePriceNumber(rowState.currentCost),
      costChanged: rowState.costChanged,
      costUsd: normalizePriceNumber(rowState.currentCostUsd),
      costUsdChanged: rowState.costUsdChanged,
      priceUpdates,
      adjustmentQty: rowState.adjustmentChanged ? rowState.adjustment : null,
      adjustmentRequestId: rowState.adjustmentChanged
        ? (draft.adjustmentRequestId ?? createStockAdjustmentRequestId())
        : null,
    },
  };
};

const formatSaveQueueMessage = (summary: StockSaveQueueSummary) => {
  const parts = [
    `${summary.pending} pendientes`,
    `${summary.active} en curso`,
    `${summary.saved} guardados`,
  ];

  if (summary.failed > 0) {
    parts.push(`${summary.failed} con error`);
  }

  return `Guardando stock: ${parts.join(", ")}`;
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
  const [saveQueueSummary, setSaveQueueSummary] =
    useState<StockSaveQueueSummary>(INITIAL_SAVE_QUEUE_SUMMARY);
  const [latestUsdRate, setLatestUsdRate] = useState<number | null>(null);
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
  const saveQueueRef = useRef<StockSaveJob[]>([]);
  const saveProductIdsRef = useRef<Set<string>>(new Set());
  const activeSaveCountRef = useRef(0);
  const saveQueueStatsRef = useRef<StockSaveQueueStats>({
    total: 0,
    saved: 0,
    failed: 0,
  });
  const saveToastIdRef = useRef<ToastId | null>(null);
  const saveReconcileTimeoutRef = useRef<number | null>(null);
  const productsLengthRef = useRef(0);
  const debouncedQueryRef = useRef("");
  const sortOrderRef = useRef<StockSort>(DEFAULT_STOCK_SORT);
  const shouldBlockStockExitRef = useRef(false);
  const hasSaveQueueActivityRef = useRef(false);
  const productsRef = useRef<StockProduct[]>([]);
  const rowsRef = useRef<Record<string, RowDraft>>({});

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

  useEffect(() => {
    productsRef.current = products;
    productsLengthRef.current = products.length;
  }, [products]);

  useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);

  useEffect(() => {
    debouncedQueryRef.current = debouncedQuery;
  }, [debouncedQuery]);

  useEffect(() => {
    sortOrderRef.current = sortOrder;
  }, [sortOrder]);

  useEffect(() => {
    return () => {
      if (saveReconcileTimeoutRef.current) {
        clearTimeout(saveReconcileTimeoutRef.current);
      }
    };
  }, []);

  const hydrateRows = (
    nextProducts: StockProduct[],
    nextPriceLists: PriceListOption[],
    previous: Record<string, RowDraft>,
    usdRate: number | null,
  ) => {
    const nextRows: Record<string, RowDraft> = {};

    for (const product of nextProducts) {
      const previousDraft = previous[product.id];
      const derivedPercentages = derivePercentagesFromPrices(
        product,
        nextPriceLists,
        usdRate,
      );
      const shouldKeepEditableDraft =
        previousDraft?.saveStatus === "queued" ||
        previousDraft?.saveStatus === "saving" ||
        previousDraft?.saveStatus === "failed" ||
        (previousDraft?.saveStatus === "idle" &&
          getStockRowChangeState(
            product,
            previousDraft,
            nextPriceLists,
            usdRate,
          ).hasRowChanges);
      const nextPercentages: Record<string, string> = {};

      for (const priceList of nextPriceLists) {
        nextPercentages[priceList.id] =
          shouldKeepEditableDraft && previousDraft
            ? (previousDraft.percentages[priceList.id] ??
              derivedPercentages[priceList.id] ??
              "")
            : (derivedPercentages[priceList.id] ?? "");
      }

      nextRows[product.id] = createEmptyRowDraft({
        cost:
          shouldKeepEditableDraft && previousDraft
            ? previousDraft.cost
            : (product.cost ?? ""),
        costUsd:
          shouldKeepEditableDraft && previousDraft
            ? previousDraft.costUsd
            : (product.costUsd ?? ""),
        percentages: nextPercentages,
        adjustmentQty:
          shouldKeepEditableDraft && previousDraft
            ? previousDraft.adjustmentQty
            : "",
        adjustmentRequestId:
          shouldKeepEditableDraft && previousDraft
            ? previousDraft.adjustmentRequestId
            : null,
        calculatorQty: previousDraft?.calculatorQty ?? "1",
        calculatorPriceBasis: previousDraft?.calculatorPriceBasis ?? "ars",
        isSaving:
          shouldKeepEditableDraft &&
          (previousDraft?.saveStatus === "queued" ||
            previousDraft?.saveStatus === "saving"),
        saveStatus:
          previousDraft?.saveStatus === "saved"
            ? "saved"
            : shouldKeepEditableDraft && previousDraft
              ? previousDraft.saveStatus
              : "idle",
        saveError:
          shouldKeepEditableDraft && previousDraft
            ? previousDraft.saveError
            : null,
        warning: previousDraft?.warning ?? null,
      });
    }

    return nextRows;
  };

  const replaceRows = useCallback((nextRows: Record<string, RowDraft>) => {
    rowsRef.current = nextRows;
    setRows(nextRows);
  }, []);

  const updateRows = useCallback(
    (
      updater: (
        previousRows: Record<string, RowDraft>,
      ) => Record<string, RowDraft>,
    ) => {
      replaceRows(updater(rowsRef.current));
    },
    [replaceRows],
  );

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

        const usdRate = parsePositiveNumber(data.latestUsdRate);
        setLatestUsdRate(usdRate);
        setPriceLists(data.priceLists);
        setTotalProducts(data.total);
        setHasMoreProducts(data.hasMore);
        setNextOffset(data.nextOffset);
        setProducts((previousProducts) => {
          const nextProducts = append
            ? mergeProductsById(previousProducts, data.products)
            : data.products;
          productsRef.current = nextProducts;
          replaceRows(
            hydrateRows(nextProducts, data.priceLists, rowsRef.current, usdRate),
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
    [replaceRows, sortOrder],
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
  const hasSaveQueueActivity =
    saveQueueSummary.pending > 0 || saveQueueSummary.active > 0;
  const hasVisibleUnsavedChanges = useMemo(
    () =>
      products.some((product) => {
        const draft = rows[product.id];
        if (!draft) return false;
        if (draft.saveStatus === "queued" || draft.saveStatus === "saving") {
          return false;
        }
        return getStockRowChangeState(
          product,
          draft,
          priceLists,
          latestUsdRate,
        ).hasRowChanges;
      }),
    [latestUsdRate, priceLists, products, rows],
  );
  const shouldBlockStockExit =
    hasSaveQueueActivity || hasVisibleUnsavedChanges;

  const showStockExitBlockedToast = useCallback(() => {
    toast.warn(
      hasSaveQueueActivityRef.current
        ? "Espera a que terminen los guardados de stock antes de salir."
        : "Guarda los cambios de stock antes de buscar, ordenar o salir.",
      { toastId: STOCK_EXIT_BLOCKED_TOAST_ID },
    );
  }, []);

  useEffect(() => {
    shouldBlockStockExitRef.current = shouldBlockStockExit;
    hasSaveQueueActivityRef.current = hasSaveQueueActivity;
  }, [hasSaveQueueActivity, shouldBlockStockExit]);

  useEffect(() => {
    if (!STOCK_PAGE_ENABLED) return;

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!shouldBlockStockExitRef.current) return;
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, []);

  useEffect(() => {
    if (!STOCK_PAGE_ENABLED) return;

    const handleAppNavigation = (event: Event) => {
      if (!shouldBlockStockExitRef.current) return;
      event.preventDefault();
      showStockExitBlockedToast();
    };

    window.addEventListener(APP_NAVIGATION_GUARD_EVENT, handleAppNavigation);
    return () =>
      window.removeEventListener(APP_NAVIGATION_GUARD_EVENT, handleAppNavigation);
  }, [showStockExitBlockedToast]);

  useEffect(() => {
    if (!STOCK_PAGE_ENABLED) return;

    const handleDocumentClick = (event: globalThis.MouseEvent) => {
      if (!shouldBlockStockExitRef.current || event.defaultPrevented) return;
      if (
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }

      const target = event.target;
      const anchor =
        target instanceof Element ? target.closest<HTMLAnchorElement>("a[href]") : null;
      if (!anchor || anchor.target || anchor.hasAttribute("download")) return;

      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#")) return;

      const url = new URL(anchor.href);
      if (url.origin !== window.location.origin) return;
      if (
        url.pathname === window.location.pathname &&
        url.search === window.location.search
      ) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      showStockExitBlockedToast();
    };

    document.addEventListener("click", handleDocumentClick, true);
    return () => document.removeEventListener("click", handleDocumentClick, true);
  }, [showStockExitBlockedToast]);

  const updateRow = (productId: string, updates: Partial<RowDraft>) => {
    updateRows((previous) => ({
      ...previous,
      [productId]: {
        ...(previous[productId] ?? createEmptyRowDraft()),
        ...updates,
      },
    }));
  };

  const updateEditableRow = (
    productId: string,
    updates: Partial<RowDraft>,
  ) => {
    updateRow(productId, {
      ...updates,
      saveStatus: "idle",
      saveError: null,
    });
  };

  const updateUsdCost = (productId: string, value: string) => {
    updateEditableRow(productId, {
      costUsd: normalizeMoney(value),
    });
  };

  const updateRowPercentage = (
    productId: string,
    priceListId: string,
    value: string,
  ) => {
    updateRows((previous) => {
      const current = previous[productId] ?? createEmptyRowDraft();
      return {
        ...previous,
        [productId]: {
          ...current,
          percentages: {
            ...current.percentages,
            [priceListId]: value,
          },
          saveStatus: "idle",
          saveError: null,
        },
      };
    });
  };

  const nudgeStockAdjustment = (productId: string, step: number) => {
    updateRows((previous) => {
      const current = previous[productId] ?? createEmptyRowDraft();
      const parsedCurrent = Number(current.adjustmentQty);
      const next =
        (Number.isFinite(parsedCurrent) ? parsedCurrent : 0) + step;

      return {
        ...previous,
        [productId]: {
          ...current,
          adjustmentQty: formatSignedQuantity(next),
          adjustmentRequestId: null,
          saveStatus: "idle",
          saveError: null,
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
    if (shouldBlockStockExit) {
      showStockExitBlockedToast();
      return;
    }
    setSortOrder(normalizeStockSort(value));
  };

  const handleSearchQueryChange = (value: string) => {
    if (shouldBlockStockExit) {
      showStockExitBlockedToast();
      return;
    }
    setQuery(value);
  };

  const nudgeCalculatorQuantity = (productId: string, step: number) => {
    updateRows((previous) => {
      const current = previous[productId] ?? createEmptyRowDraft();
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

  const setCalculatorPriceBasis = (
    productId: string,
    calculatorPriceBasis: CalculatorPriceBasis,
  ) => {
    updateRow(productId, { calculatorPriceBasis });
  };

  const handleLoadMore = () => {
    if (shouldBlockStockExit) {
      showStockExitBlockedToast();
      return;
    }
    if (nextOffset === null || isLoading || isLoadingMore) return;
    loadStock({
      offset: nextOffset,
      append: true,
      searchQuery: debouncedQuery,
    }).catch(() => undefined);
  };

  const publishSaveQueueSummary = () => {
    const summary: StockSaveQueueSummary = {
      ...saveQueueStatsRef.current,
      pending: saveQueueRef.current.length,
      active: activeSaveCountRef.current,
    };

    setSaveQueueSummary(summary);

    if (summary.total <= 0) {
      return summary;
    }

    const hasOpenWork = summary.pending > 0 || summary.active > 0;
    if (hasOpenWork) {
      const message = formatSaveQueueMessage(summary);
      if (saveToastIdRef.current && toast.isActive(saveToastIdRef.current)) {
        toast.update(saveToastIdRef.current, {
          render: message,
          type: "default",
          isLoading: true,
          autoClose: false,
          closeOnClick: false,
        });
      } else {
        saveToastIdRef.current = toast.loading(message, {
          toastId: STOCK_SAVE_TOAST_ID,
          autoClose: false,
          closeOnClick: false,
        });
      }
      return summary;
    }

    const message =
      summary.failed > 0
        ? `Stock con errores: ${summary.failed} no se pudieron guardar`
        : `Stock guardado: ${summary.saved} productos actualizados`;
    const toastOptions = {
      render: message,
      type: summary.failed > 0 ? ("error" as const) : ("success" as const),
      isLoading: false,
      autoClose: summary.failed > 0 ? (false as const) : 3500,
      closeOnClick: true,
    };

    if (saveToastIdRef.current && toast.isActive(saveToastIdRef.current)) {
      toast.update(saveToastIdRef.current, toastOptions);
    } else if (summary.failed > 0) {
      saveToastIdRef.current = toast.error(message, {
        toastId: STOCK_SAVE_TOAST_ID,
        autoClose: false,
      });
    } else {
      saveToastIdRef.current = toast.success(message, {
        toastId: STOCK_SAVE_TOAST_ID,
        autoClose: 3500,
      });
    }

    if (summary.failed === 0) {
      window.setTimeout(() => {
        if (
          saveToastIdRef.current &&
          !toast.isActive(saveToastIdRef.current)
        ) {
          saveToastIdRef.current = null;
        }
      }, 4000);
    }

    return summary;
  };

  const reconcileStockAfterQueue = () => {
    if (saveReconcileTimeoutRef.current) {
      clearTimeout(saveReconcileTimeoutRef.current);
    }

    saveReconcileTimeoutRef.current = window.setTimeout(() => {
      loadStock({
        offset: 0,
        append: false,
        limit: Math.max(DEFAULT_STOCK_PAGE_SIZE, productsLengthRef.current),
        searchQuery: debouncedQueryRef.current,
        sortOrder: sortOrderRef.current,
      }).catch(() => undefined);
    }, 150);
  };

  const finishSaveQueue = () => {
    const summary = publishSaveQueueSummary();
    setStatus(
      summary.failed > 0
        ? `${summary.failed} productos no se pudieron guardar`
        : `Stock guardado (${summary.saved} productos)`,
    );
    reconcileStockAfterQueue();
  };

  const applySuccessfulSave = (
    job: StockSaveJob,
    result: { projectedStock?: string | null; warning?: string | null },
  ) => {
    const nextCost = job.cost === null ? null : job.cost.toFixed(2);
    const nextCostUsd = job.costUsd === null ? null : job.costUsd.toFixed(2);

    setProducts((previousProducts) => {
      const nextProducts = previousProducts.map((product) => {
        if (product.id !== job.productId) return product;

        let nextPrices = [...product.prices];
        let nextDefaultPrice = product.price;

        for (const update of job.priceUpdates) {
          nextPrices = nextPrices.filter(
            (price) => price.priceListId !== update.priceListId,
          );
          const formattedPrice =
            update.price === null ? null : update.price.toFixed(2);
          if (formattedPrice !== null) {
            nextPrices.push({
              priceListId: update.priceListId,
              price: formattedPrice,
              percentage:
                update.percentage === null ? null : update.percentage.toFixed(4),
            });
          }
          if (update.isDefault) {
            nextDefaultPrice = formattedPrice;
          }
        }

        return {
          ...product,
          cost: job.costChanged ? nextCost : product.cost,
          costUsd: job.costUsdChanged ? nextCostUsd : product.costUsd,
          price: nextDefaultPrice,
          prices: nextPrices,
          stock: result.projectedStock ?? product.stock,
        };
      });
      productsRef.current = nextProducts;
      return nextProducts;
    });

    updateRows((previousRows) => {
      const current = previousRows[job.productId] ?? createEmptyRowDraft();
      const nextPercentages = { ...current.percentages };
      for (const update of job.priceUpdates) {
        nextPercentages[update.priceListId] =
          update.percentage === null
            ? ""
            : formatPercentageValue(update.percentage);
      }

      return {
        ...previousRows,
        [job.productId]: {
          ...current,
          cost: job.costChanged ? (nextCost ?? "") : current.cost,
          costUsd: job.costUsdChanged ? (nextCostUsd ?? "") : current.costUsd,
          percentages: nextPercentages,
          adjustmentQty: "",
          adjustmentRequestId: null,
          isSaving: false,
          saveStatus: "saved",
          saveError: null,
          warning: result.warning ?? null,
        },
      };
    });
  };

  const readResponseJson = async (response: Response) => {
    try {
      return await response.json();
    } catch {
      return null;
    }
  };

  const executeStockSaveJob = async (job: StockSaveJob) => {
    if (job.costChanged || job.costUsdChanged || job.priceUpdates.length > 0) {
      const patchRes = await fetch("/api/stock", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId: job.productId,
          ...(job.costChanged ? { cost: job.cost } : {}),
          ...(job.costUsdChanged ? { costUsd: job.costUsd } : {}),
          ...(job.priceUpdates.length > 0
            ? {
                prices: job.priceUpdates.map((update) => ({
                  priceListId: update.priceListId,
                  price: update.price,
                  percentage: update.percentage,
                })),
              }
            : {}),
        }),
      });
      const patchData = await readResponseJson(patchRes);
      if (!patchRes.ok) {
        throw new Error(patchData?.error ?? "No se pudo guardar");
      }
    }

    let projectedStock: string | null = null;
    let warning: string | null = null;

    if (STOCK_ACCOUNTING_ENABLED && job.adjustmentQty !== null) {
      const adjustRes = await fetch("/api/stock/adjustments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId: job.productId,
          qty: job.adjustmentQty,
          ...(job.adjustmentRequestId
            ? { clientRequestId: job.adjustmentRequestId }
            : {}),
        }),
      });
      const adjustData = await readResponseJson(adjustRes);
      if (!adjustRes.ok) {
        throw new Error(adjustData?.error ?? "No se pudo ajustar stock");
      }

      projectedStock =
        typeof adjustData?.projectedStock === "string"
          ? adjustData.projectedStock
          : null;
      warning =
        typeof adjustData?.warning === "string" ? adjustData.warning : null;
    }

    applySuccessfulSave(job, { projectedStock, warning });
  };

  const startNextSaveJobs = () => {
    while (
      activeSaveCountRef.current < STOCK_SAVE_CONCURRENCY &&
      saveQueueRef.current.length > 0
    ) {
      const job = saveQueueRef.current.shift();
      if (!job) return;

      activeSaveCountRef.current += 1;
      updateRow(job.productId, {
        isSaving: true,
        saveStatus: "saving",
        saveError: null,
        warning: null,
      });
      publishSaveQueueSummary();

      executeStockSaveJob(job)
        .then(() => {
          saveQueueStatsRef.current.saved += 1;
        })
        .catch((error: unknown) => {
          const message =
            error instanceof Error ? error.message : "No se pudo guardar";
          saveQueueStatsRef.current.failed += 1;
          updateRow(job.productId, {
            isSaving: false,
            saveStatus: "failed",
            saveError: message,
          });
        })
        .finally(() => {
          saveProductIdsRef.current.delete(job.productId);
          activeSaveCountRef.current = Math.max(
            0,
            activeSaveCountRef.current - 1,
          );
          publishSaveQueueSummary();
          startNextSaveJobs();
          if (
            activeSaveCountRef.current === 0 &&
            saveQueueRef.current.length === 0
          ) {
            finishSaveQueue();
          }
        });
    }
  };

  const saveRow = (productId: string) => {
    const draft = rowsRef.current[productId];
    const product = productsRef.current.find((item) => item.id === productId);
    if (!draft || !product) return;
    if (saveProductIdsRef.current.has(productId)) return;
    if (draft.saveStatus === "queued" || draft.saveStatus === "saving") return;

    const saveBuild = buildStockSaveJob(
      product,
      draft,
      priceLists,
      latestUsdRate,
    );
    if (!saveBuild.ok) {
      setStatus(saveBuild.error);
      updateRow(productId, {
        isSaving: false,
        saveStatus:
          saveBuild.error === "No hay cambios para guardar" ? "idle" : "failed",
        saveError:
          saveBuild.error === "No hay cambios para guardar"
            ? null
            : saveBuild.error,
      });
      if (saveBuild.error !== "No hay cambios para guardar") {
        toast.error(saveBuild.error);
      }
      return;
    }

    if (
      activeSaveCountRef.current === 0 &&
      saveQueueRef.current.length === 0
    ) {
      if (saveReconcileTimeoutRef.current) {
        clearTimeout(saveReconcileTimeoutRef.current);
        saveReconcileTimeoutRef.current = null;
      }
      saveQueueStatsRef.current = { total: 0, saved: 0, failed: 0 };
    }

    saveQueueStatsRef.current.total += 1;
    saveProductIdsRef.current.add(productId);
    saveQueueRef.current.push(saveBuild.job);
    updateRow(productId, {
      isSaving: true,
      adjustmentRequestId: saveBuild.job.adjustmentRequestId,
      saveStatus: "queued",
      saveError: null,
      warning: null,
    });
    setStatus(null);
    publishSaveQueueSummary();
    startNextSaveJobs();
  };

  const handleCreateProduct = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (shouldBlockStockExit) {
      showStockExitBlockedToast();
      return;
    }
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
                  disabled={isCreatingProduct || shouldBlockStockExit}
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
          <h2 className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm font-semibold uppercase tracking-wide text-zinc-500">
            <span>Costos y listas de precios</span>
            <span className="text-xs font-medium normal-case tracking-normal text-zinc-400">
              • {products.length} de {totalProducts}
            </span>
          </h2>
          <div className="flex w-full flex-wrap items-center justify-start gap-3 sm:w-auto sm:flex-nowrap sm:justify-end">
            <label className="inline-flex items-center gap-2">
              <span className="text-xs font-medium text-zinc-500">Ordenar</span>
              <select
                className="input cursor-pointer border-sky-200 text-xs text-sky-950 focus:border-sky-300"
                value={sortOrder}
                onChange={(event) => handleSortOrderChange(event.target.value)}
                disabled={shouldBlockStockExit}
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
              onChange={(event) => handleSearchQueryChange(event.target.value)}
              disabled={shouldBlockStockExit}
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
                  <th key={priceList.id} className="w-[112px] py-2 pr-2">
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
                  latestUsdRate,
                );
                const draft = rows[product.id] ?? createEmptyRowDraft({
                  cost: product.cost ?? "",
                  costUsd: product.costUsd ?? "",
                  percentages: derivedPercentages,
                });
                const rowState = getStockRowChangeState(
                  product,
                  draft,
                  priceLists,
                  latestUsdRate,
                );
                const currentStock = Number(product.stock ?? 0);
                const adjustment = rowState.adjustment;
                const projectedStock =
                  Number.isFinite(currentStock) && Number.isFinite(adjustment)
                    ? currentStock + adjustment
                    : currentStock;
                const isProjectedNegative = projectedStock < 0;
                const currentCostUsd = rowState.currentCostUsd;
                const hasCurrentCostUsd = currentCostUsd !== null;
                const computedPrices = rowState.computedPrices;
                const calculatorActive = calculatorRows.has(product.id);
                const calculatorQuantity = parseNumber(draft.calculatorQty);
                const canUseCalculatorArs = rowState.currentCost !== null;
                const canUseCalculatorUsd = rowState.currentCostUsdArs !== null;
                const calculatorPriceBasis =
                  draft.calculatorPriceBasis === "usd" && canUseCalculatorUsd
                    ? "usd"
                    : draft.calculatorPriceBasis === "ars" && canUseCalculatorArs
                      ? "ars"
                      : canUseCalculatorUsd
                        ? "usd"
                        : "ars";
                const calculatorUnitCost =
                  calculatorPriceBasis === "usd"
                    ? rowState.currentCostUsdArs
                    : rowState.currentCost;
                const calculatorPrices =
                  calculatorPriceBasis === "usd"
                    ? rowState.computedPricesFromUsd
                    : rowState.computedPricesFromArs;
                const calculatorPriceBasisLabel =
                  calculatorPriceBasis === "usd" ? "USD" : "ARS";
                const calculatorColSpan =
                  priceLists.length + 2 + (STOCK_ACCOUNTING_ENABLED ? 1 : 0);
                const hasRowChanges = rowState.hasRowChanges;
                const isRowSavePending =
                  draft.saveStatus === "queued" || draft.saveStatus === "saving";
                const saveButtonLabel =
                  draft.saveStatus === "queued"
                    ? "En cola"
                    : draft.saveStatus === "saving"
                      ? "Guardando cambios"
                      : draft.saveStatus === "failed"
                        ? "Reintentar guardado"
                        : draft.saveStatus === "saved"
                          ? "Guardado"
                          : "Guardar cambios";
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
                            <span className="text-zinc-400">Base</span>
                            <span
                              className="cursor-help whitespace-nowrap font-semibold tabular-nums text-zinc-800 outline-none"
                              onMouseEnter={(event) =>
                                updateTaxTooltip(
                                  `${product.id}-calculator-cost-${calculatorPriceBasis}`,
                                  `Costo unitario base ${calculatorPriceBasisLabel}`,
                                  calculatorUnitCost,
                                  event,
                                )
                              }
                              onMouseMove={(event) =>
                                updateTaxTooltip(
                                  `${product.id}-calculator-cost-${calculatorPriceBasis}`,
                                  `Costo unitario base ${calculatorPriceBasisLabel}`,
                                  calculatorUnitCost,
                                  event,
                                )
                              }
                              onMouseLeave={() => setTaxTooltip(null)}
                              onFocus={(event) =>
                                focusTaxTooltip(
                                  `${product.id}-calculator-cost-${calculatorPriceBasis}`,
                                  `Costo unitario base ${calculatorPriceBasisLabel}`,
                                  calculatorUnitCost,
                                  event,
                                )
                              }
                              onBlur={() => setTaxTooltip(null)}
                              tabIndex={0}
                            >
                              {calculatorPriceBasisLabel}{" "}
                              {formatPriceWithIva21Preview(calculatorUnitCost)}
                              <span className="ml-1 text-[10px] font-semibold text-zinc-400">
                                c/IVA 21
                              </span>
                            </span>
                            {calculatorPriceBasis === "usd" && hasCurrentCostUsd ? (
                              <>
                                <span className="text-zinc-300">/</span>
                                <span className="font-semibold tabular-nums text-zinc-600">
                                  {formatUsdPreview(currentCostUsd)}
                                </span>
                              </>
                            ) : null}
                          </div>
                          {canUseCalculatorArs && canUseCalculatorUsd ? (
                            <div className="flex items-center rounded-full bg-white p-0.5 text-[11px] font-semibold shadow-[inset_0_0_0_1px_rgba(228,228,231,0.95)]">
                              {(["ars", "usd"] as const).map((basis) => {
                                const isActive = calculatorPriceBasis === basis;
                                return (
                                  <button
                                    key={`${product.id}-calculator-${basis}`}
                                    type="button"
                                    className={`h-7 rounded-full px-3 transition ${
                                      isActive
                                        ? "bg-sky-100 text-sky-900 shadow-[inset_0_0_0_1px_rgba(125,211,252,0.75)]"
                                        : "text-zinc-500 hover:bg-zinc-100"
                                    }`}
                                    onClick={() =>
                                      setCalculatorPriceBasis(product.id, basis)
                                    }
                                    disabled={isRowSavePending}
                                    aria-pressed={isActive}
                                  >
                                    {basis.toUpperCase()}
                                  </button>
                                );
                              })}
                            </div>
                          ) : null}
                          <div className="flex items-center gap-1 rounded-full bg-white p-0.5 shadow-[inset_0_0_0_1px_rgba(228,228,231,0.9)]">
                            <button
                              type="button"
                              className="inline-flex h-7 w-7 items-center justify-center rounded-full text-zinc-600 transition hover:bg-zinc-100"
                              onClick={() => nudgeCalculatorQuantity(product.id, -1)}
                              disabled={isRowSavePending}
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
                              disabled={isRowSavePending}
                              aria-label="Cantidad"
                            />
                            <button
                              type="button"
                              className="inline-flex h-7 w-7 items-center justify-center rounded-full text-zinc-600 transition hover:bg-zinc-100"
                              onClick={() => nudgeCalculatorQuantity(product.id, 1)}
                              disabled={isRowSavePending}
                              aria-label="Sumar cantidad"
                            >
                              <PlusIcon className="size-3.5" />
                            </button>
                          </div>
                          {priceLists.map((priceList) => {
                            const unitPrice = calculatorPrices[priceList.id];
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
                                      `${priceList.name} total base ${calculatorPriceBasisLabel}`,
                                      finalPrice,
                                      event,
                                    )
                                  }
                                  onMouseMove={(event) =>
                                    updateTaxTooltip(
                                      `${product.id}-${priceList.id}-total`,
                                      `${priceList.name} total base ${calculatorPriceBasisLabel}`,
                                      finalPrice,
                                      event,
                                    )
                                  }
                                  onMouseLeave={() => setTaxTooltip(null)}
                                  onFocus={(event) =>
                                    focusTaxTooltip(
                                      `${product.id}-${priceList.id}-total`,
                                      `${priceList.name} total base ${calculatorPriceBasisLabel}`,
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
                                updateEditableRow(product.id, {
                                  cost: normalizeMoney(nextValue),
                                })
                              }
                              placeholder="0,00"
                              maxDecimals={2}
                              prefix="$"
                              disabled={isRowSavePending}
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
                                updateUsdCost(product.id, nextValue)
                              }
                              placeholder="0,00"
                              maxDecimals={2}
                              prefix="USD "
                              disabled={isRowSavePending}
                            />
                            <span aria-hidden="true" className="block min-h-4" />
                          </div>
                        </td>
                        {priceLists.map((priceList) => {
                          const priceFromArs =
                            rowState.computedPricesFromArs[priceList.id];
                          const priceFromUsd =
                            rowState.computedPricesFromUsd[priceList.id];
                          const showDualCostPrices =
                            rowState.currentCost !== null &&
                            rowState.currentCostUsdArs !== null &&
                            priceFromArs !== null &&
                            priceFromUsd !== null &&
                            normalizePriceNumber(priceFromArs) !==
                              normalizePriceNumber(priceFromUsd);

                          return (
                            <td
                              key={`${product.id}-${priceList.id}`}
                              className="py-3 pr-2 align-top"
                            >
                              <div className="w-28 space-y-1">
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
                                  disabled={isRowSavePending}
                                />
                                {showDualCostPrices ? (
                                  <div className="min-h-8 space-y-0.5 text-right text-[10px] font-medium tabular-nums leading-tight">
                                    <p
                                      className="cursor-help whitespace-nowrap text-zinc-700 outline-none"
                                      onMouseEnter={(event) =>
                                        updateTaxTooltip(
                                          `${product.id}-${priceList.id}-ars-unit`,
                                          `Precio ${priceList.name} base ARS`,
                                          priceFromArs,
                                          event,
                                        )
                                      }
                                      onMouseMove={(event) =>
                                        updateTaxTooltip(
                                          `${product.id}-${priceList.id}-ars-unit`,
                                          `Precio ${priceList.name} base ARS`,
                                          priceFromArs,
                                          event,
                                        )
                                      }
                                      onMouseLeave={() => setTaxTooltip(null)}
                                      onFocus={(event) =>
                                        focusTaxTooltip(
                                          `${product.id}-${priceList.id}-ars-unit`,
                                          `Precio ${priceList.name} base ARS`,
                                          priceFromArs,
                                          event,
                                        )
                                      }
                                      onBlur={() => setTaxTooltip(null)}
                                      tabIndex={0}
                                    >
                                      ARS{" "}
                                      {formatPriceWithIva21Preview(priceFromArs)}
                                      <span className="ml-1 font-semibold text-zinc-400">
                                        c/IVA
                                      </span>
                                    </p>
                                    <p
                                      className="cursor-help whitespace-nowrap text-amber-700 outline-none"
                                      onMouseEnter={(event) =>
                                        updateTaxTooltip(
                                          `${product.id}-${priceList.id}-usd-unit`,
                                          `Precio ${priceList.name} base USD`,
                                          priceFromUsd,
                                          event,
                                        )
                                      }
                                      onMouseMove={(event) =>
                                        updateTaxTooltip(
                                          `${product.id}-${priceList.id}-usd-unit`,
                                          `Precio ${priceList.name} base USD`,
                                          priceFromUsd,
                                          event,
                                        )
                                      }
                                      onMouseLeave={() => setTaxTooltip(null)}
                                      onFocus={(event) =>
                                        focusTaxTooltip(
                                          `${product.id}-${priceList.id}-usd-unit`,
                                          `Precio ${priceList.name} base USD`,
                                          priceFromUsd,
                                          event,
                                        )
                                      }
                                      onBlur={() => setTaxTooltip(null)}
                                      tabIndex={0}
                                    >
                                      USD{" "}
                                      {formatPriceWithIva21Preview(priceFromUsd)}
                                      <span className="ml-1 font-semibold text-amber-600/70">
                                        c/IVA
                                      </span>
                                    </p>
                                  </div>
                                ) : (
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
                                )}
                              </div>
                            </td>
                          );
                        })}
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
                                disabled={isRowSavePending}
                                aria-label="Restar una unidad"
                              >
                                <MinusIcon className="size-3.5" />
                              </button>
                              <input
                                className="input w-20 text-right tabular-nums"
                                inputMode="decimal"
                                value={draft.adjustmentQty}
                                onChange={(event) =>
                                  updateEditableRow(product.id, {
                                    adjustmentQty: normalizeSignedQuantity(
                                      event.target.value,
                                    ),
                                    adjustmentRequestId: null,
                                  })
                                }
                                disabled={isRowSavePending}
                                placeholder="+/-"
                              />
                              <button
                                type="button"
                                className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-zinc-200 text-zinc-700 transition hover:bg-white"
                                onClick={() => nudgeStockAdjustment(product.id, 1)}
                                disabled={isRowSavePending}
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
                      <div className="flex min-h-10 flex-col items-end gap-1">
                        <div className="flex items-center justify-end gap-2">
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
                            className={`btn h-10 w-10 p-0 ${
                              draft.saveStatus === "failed"
                                ? "btn-rose"
                                : "btn-emerald"
                            }`}
                            disabled={draft.isSaving || isLoading || !hasRowChanges}
                            onClick={() => saveRow(product.id)}
                            aria-label={saveButtonLabel}
                            title={saveButtonLabel}
                          >
                            <CheckIcon className="size-4" />
                            <span className="sr-only">{saveButtonLabel}</span>
                          </button>
                        </div>
                        {draft.saveStatus === "queued" ? (
                          <span className="max-w-[96px] truncate text-[10px] font-semibold text-sky-700">
                            En cola
                          </span>
                        ) : null}
                        {draft.saveStatus === "saving" ? (
                          <span className="max-w-[96px] truncate text-[10px] font-semibold text-emerald-700">
                            Guardando
                          </span>
                        ) : null}
                        {draft.saveStatus === "failed" && draft.saveError ? (
                          <span
                            className="max-w-[96px] truncate text-[10px] font-semibold text-rose-700"
                            title={draft.saveError}
                          >
                            Error
                          </span>
                        ) : null}
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
            disabled={
              isLoading ||
              isLoadingMore ||
              shouldBlockStockExit ||
              nextOffset === null
            }
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
      <ToastContainer position="bottom-right" theme="light" />
    </div>
  );
}
