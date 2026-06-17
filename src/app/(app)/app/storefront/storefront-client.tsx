"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ToastContainer, toast } from "react-toastify";
import {
  ChartBarIcon,
  CheckIcon,
  ClockIcon,
  CubeIcon,
  CurrencyDollarIcon,
  DocumentTextIcon,
  EyeIcon,
  PencilSquareIcon,
  PlusIcon,
  SaveIcon,
  ShoppingBagIcon,
  ShoppingCartIcon,
  TrashIcon,
  TruckIcon,
  XMarkIcon,
} from "@/components/icons";
import { MoneyInput } from "@/components/inputs/MoneyInput";
import { APP_NAVIGATION_GUARD_EVENT } from "@/lib/navigation-guard";
import "react-toastify/dist/ReactToastify.css";

type MercadoPagoFeeRule = {
  days: number;
  netPercent: number;
};

type MercadoPagoFeeRuleForm = {
  days: string;
  netPercent: string;
};

type ChannelResponse = {
  channel: {
    id: string;
    name: string;
    storeName: string;
    supportEmail: string | null;
    supportPhone: string | null;
    pickupAddress: string | null;
    currencyCode: string;
    defaultPriceListId: string | null;
    allowsCustomerAccounts: boolean;
    customerAccountsMode: "prepared" | "enabled";
    defaultPaymentMethod: string;
    globalPriceAdjustmentPercent: string | number;
    normalShippingAmount: string | number;
    reserveTtlMinutes: number;
    manualBillingByDefault: boolean;
    productCategories: string[];
    mercadoPagoFeeRegion?: string | null;
    mercadoPagoFeeRules?: MercadoPagoFeeRule[];
    mercadoPagoDefaultFeeDays?: number | null;
    paymentAdjustments: Array<{
      id: string;
      paymentMethod: string;
      percent: string | number;
    }>;
  };
  priceLists: Array<{
    id: string;
    name: string;
    isConsumerFinal: boolean;
    isDefault: boolean;
  }>;
  apiKeys: Array<{
    id: string;
    label: string;
    keyPrefix: string;
    isActive: boolean;
    lastUsedAt: string | null;
    createdAt: string;
  }>;
};

type PublicationRow = {
  publicationId: string | null;
  productId: string;
  productName: string;
  sku: string | null;
  brand: string | null;
  unit: string | null;
  slug: string;
  publicName: string;
  shortDescription: string;
  longDescription: string;
  category: string;
  publicationStatus: "PUBLISHED" | "PAUSED";
  stockMode: "STRICT" | "CONSULT" | "BACKORDER" | "OUT_OF_STOCK";
  webStockAvailable: number;
  webStockReserved: number;
  shippingType: "NORMAL" | "PICKUP" | "OWN_DELIVERY" | "QUOTE" | "RESTRICTED";
  normalShippingOverrideAmount: number | null;
  pricingMode: "AUTO" | "FIXED";
  fixedFinalPrice: number | null;
  mercadoPagoFeeDays: number | null;
  mercadoPagoFeePercent: number;
  priceAdjustmentPercent: number;
  billingMode: "DEFAULT" | "MANUAL" | "AUTO";
  featured: boolean;
  computedPriceFinal: number;
  salesCount: number;
};

type OrderRow = {
  id: string;
  displayNumber: string | null;
  saleId: string | null;
  saleNumber: string | null;
  status: string;
  paymentStatus: string;
  customerDisplayName: string;
  customerEmail: string;
  customerPhone: string | null;
  customerTaxId: string | null;
  customerFiscalCondition: string | null;
  subtotal: number;
  shippingTotal: number;
  total: number;
  deliveryMethod: "normal" | "pickup" | "own_delivery" | "quote";
  deliveryAddress: {
    street?: string;
    city?: string;
    state?: string;
    zipCode?: string;
    notes?: string;
  } | null;
  paymentMethod: string;
  manualBillingRequired: boolean;
  itemCount: number;
  items: Array<{
    id: string;
    productId: string;
    publicationId: string | null;
    sku: string | null;
    publicName: string;
    quantity: number;
    unitPriceFinal: number;
    lineTotal: number;
    stockMode: PublicationRow["stockMode"];
    shippingType: PublicationRow["shippingType"];
    pricingMode: PublicationRow["pricingMode"];
    manualBilling: boolean;
  }>;
  createdAt: string;
  expiresAt: string | null;
  approvedAt: string | null;
  rejectedAt: string | null;
  cancelledAt: string | null;
  deliverySummary: {
    status: "NONE" | "DRAFT" | "ISSUED" | "DELIVERED" | "CANCELLED";
    issuedAt: string | null;
    deliveredAt: string | null;
    noteNumber: string | null;
  };
};

type ConfigFormState = {
  name: string;
  storeName: string;
  supportEmail: string;
  supportPhone: string;
  pickupAddress: string;
  defaultPriceListId: string;
  allowsCustomerAccounts: boolean;
  customerAccountsMode: "prepared" | "enabled";
  defaultPaymentMethod: string;
  globalPriceAdjustmentPercent: string;
  normalShippingAmount: string;
  reserveTtlMinutes: string;
  manualBillingByDefault: boolean;
  productCategories: string[];
  mercadoPagoFeeRegion: string;
  mercadoPagoFeeRules: MercadoPagoFeeRuleForm[];
  mercadoPagoDefaultFeeDays: string;
};

export type StorefrontSectionKey = "config" | "publications" | "orders";
type PublicationSortKey =
  | "name-asc"
  | "name-desc"
  | "price-desc"
  | "price-asc"
  | "stock-desc"
  | "stock-asc";
type PublicationStatusFilter = "active" | "paused" | "all";
type OrderSortKey = "created-desc" | "created-asc" | "total-desc" | "total-asc";
type OrderStatusFilter = "pending" | "to-deliver" | "delivered" | "closed" | "all";
type OrderDateRangeFilter = "operational" | "day" | "week" | "month" | "all";

const stockModeTone: Record<PublicationRow["stockMode"], string> = {
  STRICT: "border-sky-200 bg-sky-50 text-sky-900",
  CONSULT: "border-amber-200 bg-amber-50 text-amber-900",
  BACKORDER: "border-violet-200 bg-violet-50 text-violet-900",
  OUT_OF_STOCK: "border-rose-200 bg-rose-50 text-rose-900",
};

const statusTone: Record<PublicationRow["publicationStatus"], string> = {
  PUBLISHED: "border-emerald-200 bg-emerald-50 text-emerald-900",
  PAUSED: "border-zinc-200 bg-zinc-100 text-zinc-700",
};

const publicationStatusLabels: Record<PublicationRow["publicationStatus"], string> = {
  PUBLISHED: "Publicado",
  PAUSED: "Pausado",
};

const stockModeLabels: Record<PublicationRow["stockMode"], string> = {
  STRICT: "Compra con stock",
  CONSULT: "Consultar stock",
  BACKORDER: "Por encargo",
  OUT_OF_STOCK: "Sin stock",
};

const shippingTypeLabels: Record<PublicationRow["shippingType"], string> = {
  NORMAL: "Envio normal",
  PICKUP: "Retiro",
  OWN_DELIVERY: "Entrega propia",
  QUOTE: "A coordinar",
  RESTRICTED: "Logistica especial",
};

const billingModeLabels: Record<PublicationRow["billingMode"], string> = {
  DEFAULT: "Regla general",
  MANUAL: "Manual",
  AUTO: "Automatico",
};

const deliveryStatusLabels: Record<OrderRow["deliverySummary"]["status"], string> = {
  NONE: "Entrega pendiente",
  DRAFT: "Remito en borrador",
  ISSUED: "Remito emitido",
  DELIVERED: "Entregado",
  CANCELLED: "Remito cancelado",
};

const deliveryTone: Record<OrderRow["deliverySummary"]["status"], string> = {
  NONE: "border-amber-200 bg-amber-50 text-amber-900",
  DRAFT: "border-amber-200 bg-amber-50 text-amber-900",
  ISSUED: "border-sky-200 bg-sky-50 text-sky-900",
  DELIVERED: "border-emerald-200 bg-emerald-50 text-emerald-900",
  CANCELLED: "border-zinc-200 bg-zinc-100 text-zinc-700",
};

const deliveryMethodLabels: Record<OrderRow["deliveryMethod"], string> = {
  normal: "Envio por transporte",
  pickup: "Retiro en local",
  own_delivery: "Retiro con transporte del cliente",
  quote: "Coordinar despacho",
};

const closedOrderStatuses = new Set(["CANCELLED", "EXPIRED", "REJECTED"]);
const closedPaymentStatuses = new Set(["CANCELLED", "REJECTED", "REFUNDED"]);

const isClosedOrder = (order: Pick<OrderRow, "status" | "paymentStatus">) =>
  closedOrderStatuses.has(order.status) ||
  closedPaymentStatuses.has(order.paymentStatus);

const isPendingOrder = (order: Pick<OrderRow, "status" | "paymentStatus">) =>
  !isClosedOrder(order) &&
  (order.status === "PENDING_PAYMENT" || order.paymentStatus === "PENDING");

const isConfirmedOrder = (order: Pick<OrderRow, "status" | "paymentStatus">) =>
  !isClosedOrder(order) && order.status === "CONFIRMED";

const isDeliveredOrder = (
  order: Pick<OrderRow, "status" | "paymentStatus" | "deliverySummary">,
) => isConfirmedOrder(order) && order.deliverySummary.status === "DELIVERED";

const isToDeliverOrder = (
  order: Pick<OrderRow, "status" | "paymentStatus" | "deliverySummary">,
) => isConfirmedOrder(order) && order.deliverySummary.status !== "DELIVERED";

const matchesOrderStatusFilter = (
  order: Pick<OrderRow, "status" | "paymentStatus" | "deliverySummary">,
  filter: OrderStatusFilter,
) => {
  if (filter === "pending") return isPendingOrder(order);
  if (filter === "to-deliver") return isToDeliverOrder(order);
  if (filter === "delivered") return isDeliveredOrder(order);
  if (filter === "closed") return isClosedOrder(order);
  return true;
};

const getOrderDateRangeStart = (
  rangeFilter: OrderDateRangeFilter,
  statusFilter: OrderStatusFilter,
) => {
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;

  if (rangeFilter === "day") return now - day;
  if (rangeFilter === "week") return now - 7 * day;
  if (rangeFilter === "month") return now - 30 * day;
  if (rangeFilter === "operational") {
    if (statusFilter === "closed") return now - 7 * day;
    if (statusFilter === "delivered") return now - 30 * day;
  }

  return null;
};

const panelClass =
  "rounded-[22px] border border-zinc-200 bg-white shadow-[0_16px_50px_-42px_rgba(24,39,75,0.28)]";
const fieldClass =
  "input w-full min-h-[46px] rounded-2xl border-zinc-200 px-4 text-[15px] placeholder:text-zinc-400";
const textareaClass =
  "min-h-[118px] w-full rounded-[20px] border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-900 outline-none transition placeholder:text-zinc-400 focus:border-sky-200 focus:ring-2 focus:ring-sky-400/40";
const PUBLICATIONS_PAGE_SIZE = 18;
const MERCADOPAGO_FEE_IVA_PERCENT = 21;
const DEFAULT_MERCADOPAGO_FEE_REGION = "ba_ch_er";
const MERCADOPAGO_MAX_FEE_RULES = [
  { days: 0, netPercent: 6.6 },
  { days: 10, netPercent: 4.61 },
  { days: 18, netPercent: 3.56 },
  { days: 35, netPercent: 1.56 },
] satisfies MercadoPagoFeeRule[];

const mercadoPagoFeeRulesToForm = (rules: MercadoPagoFeeRule[]) =>
  rules.map((rule) => ({
    days: String(rule.days),
    netPercent: String(rule.netPercent),
  }));

const DEFAULT_MERCADOPAGO_FEE_RULES = mercadoPagoFeeRulesToForm(
  MERCADOPAGO_MAX_FEE_RULES,
);

const getMercadoPagoDaysLabel = (days: number) =>
  days === 0 ? "Al instante" : `${days} dias`;

const createDefaultConfigForm = (): ConfigFormState => ({
  name: "Storefront",
  storeName: "",
  supportEmail: "",
  supportPhone: "",
  pickupAddress: "",
  defaultPriceListId: "",
  allowsCustomerAccounts: true,
  customerAccountsMode: "prepared",
  defaultPaymentMethod: "mercadopago_checkout_api",
  globalPriceAdjustmentPercent: "0",
  normalShippingAmount: "0",
  reserveTtlMinutes: "30",
  manualBillingByDefault: true,
  productCategories: ["General"],
  mercadoPagoFeeRegion: DEFAULT_MERCADOPAGO_FEE_REGION,
  mercadoPagoFeeRules: DEFAULT_MERCADOPAGO_FEE_RULES,
  mercadoPagoDefaultFeeDays: "0",
});

const serializePublicationDraft = (row: PublicationRow) =>
  JSON.stringify({
    productId: row.productId,
    publicationStatus: row.publicationStatus,
    publicName: row.publicName,
    shortDescription: row.shortDescription,
    longDescription: row.longDescription,
    category: row.category,
    featured: row.featured,
    shippingType: row.shippingType,
    normalShippingOverrideAmount: row.normalShippingOverrideAmount,
    stockMode: row.stockMode,
    webStockAvailable: row.webStockAvailable,
    pricingMode: row.pricingMode,
    fixedFinalPrice: row.fixedFinalPrice,
    mercadoPagoFeeDays: row.mercadoPagoFeeDays,
    priceAdjustmentPercent: row.priceAdjustmentPercent,
    billingMode: row.billingMode,
  });

const serializeConfigForm = (form: ConfigFormState) =>
  JSON.stringify({
    defaultPriceListId: form.defaultPriceListId,
    globalPriceAdjustmentPercent: form.globalPriceAdjustmentPercent,
    normalShippingAmount: form.normalShippingAmount,
    reserveTtlMinutes: form.reserveTtlMinutes,
    manualBillingByDefault: form.manualBillingByDefault,
    productCategories: form.productCategories,
    mercadoPagoFeeRegion: form.mercadoPagoFeeRegion,
    mercadoPagoFeeRules: normalizeMercadoPagoFeeRulesForPayload(
      form.mercadoPagoFeeRules,
    ),
    mercadoPagoDefaultFeeDays: normalizeMercadoPagoDefaultFeeDays(
      form.mercadoPagoDefaultFeeDays,
      form.mercadoPagoFeeRules,
    ),
  });

const toNumber = (value: string | number | null | undefined) => {
  if (value === null || value === undefined || value === "") return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const roundPercent = (value: number) =>
  Number.isFinite(value) ? Number(value.toFixed(4)) : 0;

const formatPercent = (value: number) =>
  roundPercent(value).toLocaleString("es-AR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });

const getMercadoPagoFeeBreakdown = (netPercent: number) => {
  const normalizedNet = Math.max(0, roundPercent(netPercent));
  const ivaPercent = roundPercent(
    normalizedNet * (MERCADOPAGO_FEE_IVA_PERCENT / 100),
  );

  return {
    netPercent: normalizedNet,
    ivaPercent,
    finalPercent: roundPercent(normalizedNet + ivaPercent),
  };
};

const normalizeMercadoPagoFeeRulesForPayload = (
  rules: MercadoPagoFeeRuleForm[],
) => {
  const normalized = rules
    .map((rule) => ({
      days: Math.max(0, Math.trunc(toNumber(rule.days))),
      netPercent: Math.max(0, roundPercent(toNumber(rule.netPercent))),
    }))
    .filter((rule) => Number.isFinite(rule.days) && Number.isFinite(rule.netPercent));
  const unique = Array.from(
    new Map(normalized.map((rule) => [rule.days, rule])).values(),
  )
    .sort((a, b) => a.days - b.days)
    .slice(0, 12);

  return unique.length ? unique : [{ days: 0, netPercent: 0 }];
};

const normalizeMercadoPagoDefaultFeeDays = (
  value: string | number | null | undefined,
  rules: MercadoPagoFeeRuleForm[],
) => {
  const normalizedRules = normalizeMercadoPagoFeeRulesForPayload(rules);
  const days =
    value === null || value === undefined || value === ""
      ? null
      : Math.trunc(Number(value));
  if (days !== null && normalizedRules.some((rule) => rule.days === days)) {
    return days;
  }
  return normalizedRules.at(0)?.days ?? 0;
};

const getMercadoPagoRuleLabel = (rule: MercadoPagoFeeRule) => {
  const breakdown = getMercadoPagoFeeBreakdown(rule.netPercent);
  return `${getMercadoPagoDaysLabel(rule.days)} · ${formatPercent(
    breakdown.finalPercent,
  )}% final`;
};

const normalizeProductCategoryName = (value: string) =>
  value.trim().replace(/\s+/g, " ").slice(0, 80);

const normalizeProductCategoryList = (value: unknown) => {
  const rawItems = Array.isArray(value) ? value : [];
  const categories = rawItems
    .map((item) => normalizeProductCategoryName(String(item ?? "")))
    .filter(Boolean);
  const unique = Array.from(
    new Map(
      categories.map((category) => [
        category.toLocaleLowerCase("es-AR"),
        category,
      ]),
    ).values(),
  ).slice(0, 24);

  return unique.length ? unique : ["General"];
};

const formatMoney = (value: number) =>
  value.toLocaleString("es-AR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });

const formatDateTime = (value: string | null) => {
  if (!value) return "Sin registrar";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Sin registrar";
  return parsed.toLocaleString("es-AR");
};

const isPastDateTime = (value: string | null) => {
  if (!value) return false;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) && parsed <= Date.now();
};

const getOrderCommercialState = (order: OrderRow) => {
  if (order.status === "PENDING_PAYMENT") {
    const expiredLocally = isPastDateTime(order.expiresAt);
    return {
      label: expiredLocally
        ? `Reserva vencida ${formatDateTime(order.expiresAt)}`
        : `Pago pendiente hasta ${formatDateTime(order.expiresAt)}`,
      tone: expiredLocally
        ? "border-zinc-200 bg-zinc-100 text-zinc-700"
        : "border-amber-200 bg-amber-50 text-amber-900",
      icon: expiredLocally ? "x" : "clock",
    };
  }

  if (order.status === "CONFIRMED") {
    return {
      label: `Pago confirmado ${formatDateTime(order.approvedAt ?? order.createdAt)}`,
      tone: "border-emerald-200 bg-emerald-50 text-emerald-900",
      icon: "check",
    };
  }

  if (order.status === "REJECTED") {
    return {
      label: `Pago rechazado ${formatDateTime(order.rejectedAt)}`,
      tone: "border-rose-200 bg-rose-50 text-rose-900",
      icon: "x",
    };
  }

  if (order.status === "CANCELLED") {
    return {
      label: `Pedido cancelado ${formatDateTime(order.cancelledAt)}`,
      tone: "border-zinc-200 bg-zinc-100 text-zinc-700",
      icon: "x",
    };
  }

  if (order.paymentStatus === "REFUNDED") {
    return {
      label: `Pago reintegrado ${formatDateTime(
        order.cancelledAt ?? order.createdAt,
      )}`,
      tone: "border-zinc-200 bg-zinc-100 text-zinc-700",
      icon: "x",
    };
  }

  return {
    label: `Reserva vencida ${formatDateTime(
      order.cancelledAt ?? order.expiresAt,
    )}`,
    tone: "border-zinc-200 bg-zinc-100 text-zinc-700",
    icon: "x",
  };
};

const getOrderCommercialIcon = (
  icon: ReturnType<typeof getOrderCommercialState>["icon"],
) => {
  if (icon === "check") return <CheckIcon />;
  if (icon === "clock") return <ClockIcon />;
  return <XMarkIcon />;
};

const getOrderOperationalDate = (order: OrderRow) => {
  if (order.status === "CONFIRMED") return order.approvedAt ?? order.createdAt;
  if (order.status === "REJECTED") return order.rejectedAt ?? order.createdAt;
  if (order.status === "CANCELLED") return order.cancelledAt ?? order.createdAt;
  if (order.status === "EXPIRED") {
    return order.cancelledAt ?? order.expiresAt ?? order.createdAt;
  }
  return order.createdAt;
};

const getDateTimeMs = (value: string | null) => {
  if (!value) return 0;
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
};

const isOrderInsideDateRange = (order: OrderRow, rangeStart: number | null) =>
  rangeStart === null || getDateTimeMs(getOrderOperationalDate(order)) >= rangeStart;

const getOrderTimelineRows = (order: OrderRow) => {
  const rows = [{ label: "Creado", value: formatDateTime(order.createdAt) }];

  if (order.status === "PENDING_PAYMENT") {
    rows.push({
      label: isPastDateTime(order.expiresAt)
        ? "Reserva vencida"
        : "Reserva vigente hasta",
      value: formatDateTime(order.expiresAt),
    });
  } else if (order.status === "CONFIRMED") {
    rows.push({
      label: "Confirmado",
      value: formatDateTime(order.approvedAt ?? order.createdAt),
    });
    rows.push({
      label: "Reserva",
      value: "Consumida al aprobar pago",
    });
  } else if (order.status === "REJECTED") {
    rows.push({
      label: "Rechazado",
      value: formatDateTime(order.rejectedAt),
    });
  } else if (order.status === "CANCELLED") {
    rows.push({
      label: "Cancelado",
      value: formatDateTime(order.cancelledAt),
    });
  } else {
    rows.push({
      label: "Reserva vencio",
      value: formatDateTime(order.cancelledAt ?? order.expiresAt),
    });
  }

  return rows;
};

const getOrderDeliveryLabel = (order: OrderRow) => {
  if (order.status !== "CONFIRMED") return null;
  const baseLabel = deliveryStatusLabels[order.deliverySummary.status];
  if (order.deliverySummary.status === "DELIVERED") {
    return `${baseLabel} ${formatDateTime(order.deliverySummary.deliveredAt)}`;
  }
  if (order.deliverySummary.status === "ISSUED") {
    return `${baseLabel} ${formatDateTime(order.deliverySummary.issuedAt)}`;
  }
  return baseLabel;
};

const formatDeliveryAddress = (address: OrderRow["deliveryAddress"]) => {
  if (!address) return null;
  const location = [address.city, address.state, address.zipCode]
    .filter(Boolean)
    .join(", ");
  const formatted = [address.street, location, address.notes ? `Notas: ${address.notes}` : null]
    .filter(Boolean)
    .join(" · ");
  return formatted || null;
};

const formatPaymentMethod = (value: string) => {
  const normalized = value.trim().toLowerCase();
  if (normalized.includes("mercadopago")) return "Mercado Pago";
  if (normalized.includes("cash") || normalized.includes("efectivo")) return "Efectivo";
  if (!value.trim()) return "Sin metodo registrado";
  return value;
};

const formatFiscalCondition = (value: string | null) => {
  if (!value) return null;
  const normalized = value.trim().toUpperCase();
  const labels: Record<string, string> = {
    CONSUMIDOR_FINAL: "Consumidor final",
    RESPONSABLE_INSCRIPTO: "Responsable inscripto",
    MONOTRIBUTISTA: "Monotributista",
    EXENTO: "Exento",
  };
  if (labels[normalized]) return labels[normalized];
  return normalized
    .split("_")
    .filter(Boolean)
    .map((word) => word.charAt(0) + word.slice(1).toLowerCase())
    .join(" ");
};

function ChevronDownSmallIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.9}
      className={className}
      aria-hidden
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="m5 7.5 5 5 5-5" />
    </svg>
  );
}

function PlaySmallIcon({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className={className} aria-hidden>
      <path d="M7 5.75c0-.62.68-1.01 1.22-.68l6.06 3.75a.8.8 0 0 1 0 1.36l-6.06 3.75A.8.8 0 0 1 7 13.25v-7.5Z" />
    </svg>
  );
}

function PauseSmallIcon({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className={className} aria-hidden>
      <path d="M6.75 5.5c0-.41.34-.75.75-.75h1.25c.41 0 .75.34.75.75v9c0 .41-.34.75-.75.75H7.5a.75.75 0 0 1-.75-.75v-9Zm4.75 0c0-.41.34-.75.75-.75h1.25c.41 0 .75.34.75.75v9c0 .41-.34.75-.75.75h-1.25a.75.75 0 0 1-.75-.75v-9Z" />
    </svg>
  );
}

function MiniToggle({
  checked,
  onChange,
  label,
  help,
  className,
  contentClassName,
  helpClassName,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
  help?: string;
  className?: string;
  contentClassName?: string;
  helpClassName?: string;
}) {
  return (
    <div className={`flex items-start justify-between gap-3 rounded-[18px] border border-zinc-200 bg-zinc-50/70 px-3.5 py-3 ${className ?? ""}`}>
      <div className={`min-w-0 ${contentClassName ?? ""}`}>
        <div className="text-sm font-medium text-zinc-900">{label}</div>
        {help ? <p className={`${helpClassName ?? "mt-1"} text-xs leading-relaxed text-zinc-500`}>{help}</p> : null}
      </div>
      <button
        type="button"
        role="switch"
        aria-label={label}
        aria-checked={checked}
        onClick={onChange}
        className={`relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/40 ${
          checked ? "border-sky-300 bg-sky-100" : "border-zinc-300 bg-zinc-100"
        }`}
      >
        <span
          className={`inline-block h-4.5 w-4.5 rounded-full bg-white shadow-[0_1px_5px_rgba(0,0,0,0.16)] transition-transform ${
            checked ? "translate-x-[22px]" : "translate-x-1"
          }`}
        />
      </button>
    </div>
  );
}

function Field({
  label,
  helper,
  children,
}: {
  label: string;
  helper?: string;
  children: ReactNode;
}) {
  return (
    <label className="field-stack block min-w-0 w-full">
      <span className="input-label">{label}</span>
      {children}
      {helper ? (
        <span className="block text-[11px] leading-relaxed text-zinc-500">{helper}</span>
      ) : null}
    </label>
  );
}

function SelectInput({
  value,
  onChange,
  options,
  placeholder,
  embedded = false,
}: {
  value: string;
  onChange: (value: string) => void;
  options: Array<{ label: string; value: string }>;
  placeholder?: string;
  embedded?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const selected = options.find((option) => option.value === value);
  const buttonClassName = embedded
    ? `relative flex w-full min-h-[38px] items-center rounded-xl border border-transparent bg-transparent px-2 pr-8 text-left text-sm transition hover:bg-zinc-50/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/30 ${
        open ? "bg-white text-sky-950 ring-2 ring-sky-400/20" : ""
      }`
    : `input relative flex w-full min-h-[46px] items-center rounded-2xl border border-zinc-200 bg-white px-4 pr-12 text-left text-[15px] shadow-[0_10px_24px_-22px_rgba(24,39,75,0.4)] transition hover:border-sky-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/40 ${
        open ? "border-sky-300 ring-2 ring-sky-400/20" : ""
      }`;

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (containerRef.current?.contains(target)) return;
      setOpen(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div
      ref={containerRef}
      className="relative"
    >
      <button
        type="button"
        className={buttonClassName}
        onClick={() => setOpen((current) => !current)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className={`block min-w-0 truncate ${selected ? "text-zinc-900" : "text-zinc-500"}`}>
          {selected?.label ?? placeholder ?? "Seleccionar"}
        </span>
        <span className={`pointer-events-none absolute top-1/2 inline-flex -translate-y-1/2 items-center justify-center text-zinc-500 ${embedded ? "right-2" : "right-4"}`}>
          <ChevronDownSmallIcon className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
        </span>
      </button>
      {open ? (
        <div
          role="listbox"
          className="absolute z-20 mt-2 max-h-72 w-full overflow-y-auto rounded-[20px] border border-zinc-200 bg-white p-1.5 shadow-[0_20px_40px_-28px_rgba(24,24,27,0.45)]"
        >
          {options.map((option) => {
            const isSelected = option.value === value;
            return (
              <button
                key={option.value || "__empty"}
                type="button"
                role="option"
                aria-selected={isSelected}
                className={`flex w-full items-center justify-between rounded-2xl px-3 py-2.5 text-left text-sm transition ${
                  isSelected
                    ? "border border-sky-200 bg-sky-50 text-sky-950"
                    : "border border-transparent text-zinc-700 hover:bg-zinc-50"
                }`}
                onMouseDown={(event) => {
                  event.preventDefault();
                  onChange(option.value);
                  setOpen(false);
                }}
              >
                <span className="min-w-0 truncate">{option.label}</span>
                {isSelected ? (
                  <span className="ml-3 shrink-0 text-xs font-semibold text-sky-700">
                    Actual
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function ChoicePills<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (value: T) => void;
  options: Array<{ label: string; value: T; icon?: ReactNode }>;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={`toggle-pill px-3 py-2 text-sm ${
            value === option.value ? "toggle-pill-active border-sky-300 bg-sky-50 text-sky-950" : ""
          }`}
        >
          <span className="inline-flex items-center gap-1.5">
            {option.icon ? <span className="shrink-0">{option.icon}</span> : null}
            <span>{option.label}</span>
          </span>
        </button>
      ))}
    </div>
  );
}

function PercentInput({
  value,
  onChange,
  placeholder = "0",
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="relative mt-1">
      <input
        className="input no-spinner w-full min-h-[46px] rounded-2xl pl-3 pr-9 text-right tabular-nums placeholder:text-zinc-400"
        inputMode="decimal"
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onFocus={(event) => {
          const length = event.currentTarget.value.length;
          event.currentTarget.setSelectionRange(length, length);
        }}
        onMouseUp={(event) => {
          event.preventDefault();
          const length = event.currentTarget.value.length;
          event.currentTarget.setSelectionRange(length, length);
        }}
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-1 right-1.5 inline-flex min-w-[1.5rem] items-center justify-center rounded-md border border-transparent bg-transparent px-1 text-[10px] font-semibold text-zinc-500 sm:right-2"
      >
        %
      </span>
    </div>
  );
}

function Badge({ tone, children }: { tone: string; children: ReactNode }) {
  return (
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.04em] ${tone}`}>
      {children}
    </span>
  );
}

function InfoPill({
  icon,
  children,
  tone = "border-zinc-200 bg-white text-zinc-700",
}: {
  icon: ReactNode;
  children: ReactNode;
  tone?: string;
}) {
  return (
    <span className={`inline-flex min-h-[28px] items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium leading-none ${tone}`}>
      <span className="inline-flex shrink-0 items-center text-current [&>svg]:size-3.5">
        {icon}
      </span>
      <span className="inline-flex items-center">{children}</span>
    </span>
  );
}

function StorefrontLoadingCard({
  title = "Cargando tienda online",
  description = "Sincronizando productos, pedidos y configuracion.",
}: {
  title?: string;
  description?: string;
}) {
  return (
    <div className="rounded-[22px] border border-dashed border-sky-200 bg-sky-50/45 px-4 py-5 shadow-[0_18px_36px_-34px_rgba(24,39,75,0.34)] sm:px-5">
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className="inline-flex size-9 shrink-0 items-center justify-center rounded-full border border-sky-200 bg-white text-sky-700 shadow-[0_10px_24px_-22px_rgba(14,165,233,0.9)]"
        >
          <span className="size-4 rounded-full border-2 border-sky-200 border-t-sky-600 animate-spin" />
        </span>
        <div className="min-w-0">
          <div className="text-sm font-semibold text-zinc-950">{title}</div>
          <div className="mt-0.5 text-xs text-zinc-500">{description}</div>
        </div>
      </div>
    </div>
  );
}

function PublicationEditorCard({
  row,
  onOpen,
}: {
  row: PublicationRow;
  onOpen: () => void;
}) {
  const productMeta = [
    row.sku || "Sin codigo",
    row.brand,
    row.unit,
    row.featured ? "destacado" : null,
  ].filter((item): item is string => Boolean(item));

  return (
    <article className="overflow-visible rounded-[22px] border border-dashed border-zinc-200 bg-white px-4 py-4 shadow-[0_18px_36px_-34px_rgba(24,39,75,0.34)] sm:px-5">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
        <div className="min-w-0 pl-2.5">
          <h3 className="text-base font-semibold leading-snug text-zinc-950">
            <span>{row.productName}</span>
            {productMeta.map((item) => (
              <span key={item} className="text-xs font-medium text-zinc-500">
                <span className="px-1.5 text-zinc-300">·</span>
                {item}
              </span>
            ))}
          </h3>
        </div>
        <div className="flex shrink-0 items-start lg:justify-end">
          <div className="pr-4 text-right text-base font-semibold text-zinc-950 sm:text-lg">
            ${formatMoney(row.computedPriceFinal)}
          </div>
        </div>
      </div>

      <div className="mt-3 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-2">
          <InfoPill icon={<CheckIcon />} tone={statusTone[row.publicationStatus]}>
            {publicationStatusLabels[row.publicationStatus]}
          </InfoPill>
          <InfoPill icon={<CubeIcon />} tone={stockModeTone[row.stockMode]}>
            {stockModeLabels[row.stockMode]}
          </InfoPill>
          <InfoPill icon={<CubeIcon />}>
            {row.webStockAvailable.toLocaleString("es-AR")} Unidades
          </InfoPill>
          <InfoPill icon={<ShoppingBagIcon />}>
            {row.webStockReserved.toLocaleString("es-AR")} Reservas
          </InfoPill>
          <InfoPill icon={<ChartBarIcon />}>
            {row.salesCount.toLocaleString("es-AR")} Ventas
          </InfoPill>
          <InfoPill icon={<TruckIcon />}>
            {shippingTypeLabels[row.shippingType]}
          </InfoPill>
          <InfoPill icon={<CurrencyDollarIcon />}>
            MP {formatPercent(row.mercadoPagoFeePercent)}%
          </InfoPill>
          <InfoPill icon={<DocumentTextIcon />}>
            Factura - {billingModeLabels[row.billingMode]}
          </InfoPill>
        </div>
        <button
          type="button"
          onClick={onOpen}
          className="btn btn-sky shrink-0 self-start gap-1.5 px-4 py-2 text-xs leading-none transition hover:-translate-y-0.5 hover:shadow-[0_10px_20px_-14px_rgba(14,165,233,0.9)] lg:self-center"
        >
          <PencilSquareIcon className="size-4" />
          Editar
        </button>
      </div>
    </article>
  );
}

function PublicationEditorModal({
  row,
  onChange,
  onSave,
  onClose,
  categoryOptions,
  mercadoPagoFeeRules,
  mercadoPagoDefaultFeeDays,
}: {
  row: PublicationRow;
  onChange: (patch: Partial<PublicationRow>) => void;
  onSave: () => void;
  onClose: () => void;
  categoryOptions: Array<{ label: string; value: string }>;
  mercadoPagoFeeRules: MercadoPagoFeeRule[];
  mercadoPagoDefaultFeeDays: number;
}) {
  const effectiveMercadoPagoFeeDays =
    row.mercadoPagoFeeDays ?? mercadoPagoDefaultFeeDays;
  const effectiveMercadoPagoRule =
    mercadoPagoFeeRules.find((rule) => rule.days === effectiveMercadoPagoFeeDays) ??
    mercadoPagoFeeRules[0] ??
    { days: 0, netPercent: 0 };
  const effectiveMercadoPagoBreakdown = getMercadoPagoFeeBreakdown(
    effectiveMercadoPagoRule.netPercent,
  );
  const mercadoPagoDefaultRule =
    mercadoPagoFeeRules.find((rule) => rule.days === mercadoPagoDefaultFeeDays) ??
    mercadoPagoFeeRules[0] ??
    { days: 0, netPercent: 0 };
  const mercadoPagoFeeOptions = [
    {
      value: "DEFAULT",
      label: `Usar configuracion (${getMercadoPagoRuleLabel(mercadoPagoDefaultRule)})`,
    },
    ...mercadoPagoFeeRules.map((rule) => ({
      value: String(rule.days),
      label: getMercadoPagoRuleLabel(rule),
    })),
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-zinc-950/30 px-3 py-3 backdrop-blur-sm sm:px-6 sm:py-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="publication-editor-title"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="flex max-h-[calc(100dvh-1.5rem)] w-full max-w-[1120px] flex-col overflow-hidden rounded-[22px] border border-zinc-200 bg-white shadow-[0_24px_80px_-32px_rgba(24,39,75,0.48)] sm:max-h-[calc(100dvh-3rem)] sm:rounded-[24px]">
        <div className="grid shrink-0 gap-3 border-b border-zinc-100 px-5 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:px-6">
          <div className="min-w-0 sm:pr-4">
            <h3 id="publication-editor-title" className="text-xl font-semibold tracking-[-0.02em] text-zinc-950 break-words">
              {row.productName}
            </h3>
          </div>
          <div className="flex min-w-0 items-center justify-between gap-3 sm:justify-end">
            <div className="flex min-w-0 flex-wrap items-center gap-2 sm:justify-end">
              <Badge tone={statusTone[row.publicationStatus]}>
                {publicationStatusLabels[row.publicationStatus]}
              </Badge>
              <Badge tone={stockModeTone[row.stockMode]}>
                {stockModeLabels[row.stockMode]}
              </Badge>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar"
              className="inline-flex size-9 items-center justify-center rounded-full border border-zinc-200 bg-white text-zinc-600 transition hover:bg-zinc-50 hover:text-zinc-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/30"
            >
              <XMarkIcon className="size-4" />
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6 sm:py-5">
          <div className="space-y-4">
            <div className="pb-4">
              <div className="grid gap-4 lg:grid-cols-3">
                <Field label="Nombre publico">
                  <input
                    className={fieldClass}
                    placeholder="Ej. Manifold digital R410A / R32"
                    value={row.publicName}
                    onChange={(event) => onChange({ publicName: event.target.value })}
                  />
                </Field>
                <Field label="Categoria">
                  <SelectInput
                    value={row.category}
                    onChange={(value) => onChange({ category: value })}
                    options={categoryOptions}
                    placeholder="Elegir categoria"
                  />
                </Field>
                <Field label="Descripcion corta">
                  <input
                    className={fieldClass}
                    placeholder="Instrumento de diagnostico para instaladores."
                    value={row.shortDescription}
                    onChange={(event) =>
                      onChange({ shortDescription: event.target.value })
                    }
                  />
                </Field>
                <div className="lg:col-span-3">
                  <Field
                    label="Descripcion larga"
                  >
                    <textarea
                      className={textareaClass}
                      placeholder="Describe caracteristicas, compatibilidades, limitaciones logísticas y cualquier aclaracion operativa."
                      value={row.longDescription}
                      onChange={(event) => onChange({ longDescription: event.target.value })}
                    />
                  </Field>
                </div>
              </div>
            </div>

            <div className="pb-4">
              <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
                <div className="rounded-[20px] border border-zinc-200 bg-zinc-50/45 px-4 py-4">
                  <div className="grid gap-4 lg:grid-cols-2">
                    <Field label="Estado de la publicacion">
                      <ChoicePills
                        value={row.publicationStatus}
                        onChange={(value) =>
                          onChange({
                            publicationStatus: value as PublicationRow["publicationStatus"],
                          })
                        }
                        options={[
                          { value: "PUBLISHED", label: publicationStatusLabels.PUBLISHED, icon: <PlaySmallIcon /> },
                          { value: "PAUSED", label: publicationStatusLabels.PAUSED, icon: <PauseSmallIcon /> },
                        ]}
                      />
                    </Field>
                    <div className="lg:col-span-2">
                      <Field label="Como se entrega">
                        <div
                          className={`grid gap-3 ${
                            row.shippingType === "NORMAL"
                              ? "md:grid-cols-[minmax(0,1fr)_minmax(230px,0.72fr)]"
                              : ""
                          }`}
                        >
                          <SelectInput
                            value={row.shippingType}
                            onChange={(value) =>
                              onChange({
                                shippingType: value as PublicationRow["shippingType"],
                                normalShippingOverrideAmount:
                                  value === "NORMAL"
                                    ? row.normalShippingOverrideAmount
                                    : null,
                              })
                            }
                            options={[
                              { value: "NORMAL", label: shippingTypeLabels.NORMAL },
                              { value: "PICKUP", label: shippingTypeLabels.PICKUP },
                              { value: "OWN_DELIVERY", label: shippingTypeLabels.OWN_DELIVERY },
                              { value: "QUOTE", label: shippingTypeLabels.QUOTE },
                              { value: "RESTRICTED", label: shippingTypeLabels.RESTRICTED },
                            ]}
                          />
                          {row.shippingType === "NORMAL" ? (
                            <div className="relative">
                              <MoneyInput
                                className="input no-spinner w-full min-h-[46px] rounded-2xl pl-9 pr-3 text-right text-[15px] tabular-nums"
                                value={
                                  row.normalShippingOverrideAmount === null
                                    ? ""
                                    : String(row.normalShippingOverrideAmount)
                                }
                                onValueChange={(value) =>
                                  onChange({
                                    normalShippingOverrideAmount: value
                                      ? Number(value)
                                      : null,
                                  })
                                }
                                placeholder="Costo envio propio"
                                maxDecimals={2}
                                caretToEndOnFocus
                              />
                              <span
                                aria-hidden="true"
                                className="pointer-events-none absolute inset-y-1 left-1.5 inline-flex min-w-[1.5rem] items-center justify-center rounded-md border border-transparent bg-transparent px-1 text-[10px] font-semibold text-zinc-500 sm:left-2"
                              >
                                $
                              </span>
                            </div>
                          ) : null}
                        </div>
                      </Field>
                    </div>
                    <Field label="Disponibilidad">
                      <SelectInput
                        value={row.stockMode}
                        onChange={(value) =>
                          onChange({
                            stockMode: value as PublicationRow["stockMode"],
                          })
                        }
                        options={[
                          { value: "STRICT", label: stockModeLabels.STRICT },
                          { value: "CONSULT", label: stockModeLabels.CONSULT },
                          { value: "BACKORDER", label: stockModeLabels.BACKORDER },
                          { value: "OUT_OF_STOCK", label: stockModeLabels.OUT_OF_STOCK },
                        ]}
                      />
                    </Field>
                    {row.stockMode === "STRICT" ? (
                      <Field label="Cantidad para vender">
                        <input
                          className={fieldClass}
                          inputMode="numeric"
                          placeholder="0"
                          value={row.webStockAvailable}
                          onChange={(event) =>
                            onChange({
                              webStockAvailable: Math.max(
                                0,
                                Math.trunc(Number(event.target.value) || 0),
                              ),
                            })
                          }
                        />
                      </Field>
                    ) : null}
                  </div>
                </div>

                <div className="rounded-[20px] border border-zinc-200 bg-zinc-50/45 px-4 py-4">
                  <div className="grid gap-5">
                    <div className="field-stack">
                      <span className="input-label">
                        Facturacion del pedido
                      </span>
                      <ChoicePills
                        value={row.billingMode}
                        onChange={(value) =>
                          onChange({
                            billingMode: value as PublicationRow["billingMode"],
                          })
                        }
                        options={[
                          { value: "DEFAULT", label: "Regla general" },
                          { value: "MANUAL", label: "Factura manual" },
                          { value: "AUTO", label: "Factura automatica" },
                        ]}
                      />
                    </div>

                    <div className="grid gap-4">
                      <div className="field-stack">
                        <span className="input-label">
                          Precio publicado
                        </span>
                        <ChoicePills
                          value={row.pricingMode}
                          onChange={(value) =>
                            onChange({
                              pricingMode: value as PublicationRow["pricingMode"],
                              fixedFinalPrice:
                                value === "FIXED"
                                  ? row.fixedFinalPrice
                                  : null,
                            })
                          }
                          options={[
                            { value: "AUTO", label: "Usar lista" },
                            { value: "FIXED", label: "Fijar precio" },
                          ]}
                        />
                      </div>
                      {row.pricingMode === "AUTO" ? (
                        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(170px,0.38fr)]">
                          <Field
                            label="Mercado Pago"
                            helper={`Aplica ${formatPercent(effectiveMercadoPagoBreakdown.finalPercent)}% final (${formatPercent(effectiveMercadoPagoBreakdown.netPercent)}% neto + IVA).`}
                          >
                            <SelectInput
                              value={
                                row.mercadoPagoFeeDays === null
                                  ? "DEFAULT"
                                  : String(row.mercadoPagoFeeDays)
                              }
                              onChange={(value) =>
                                onChange({
                                  mercadoPagoFeeDays:
                                    value === "DEFAULT" ? null : Number(value),
                                })
                              }
                              options={mercadoPagoFeeOptions}
                            />
                          </Field>
                          <Field label="Extra sobre lista">
                            <PercentInput
                              value={String(row.priceAdjustmentPercent ?? 0)}
                              onChange={(value) =>
                                onChange({
                                  priceAdjustmentPercent: Number(value) || 0,
                                })
                              }
                            />
                          </Field>
                        </div>
                      ) : (
                        <Field label="Monto fijo">
                          <div className="relative mt-1">
                            <MoneyInput
                              className="input no-spinner w-full min-h-[46px] rounded-2xl pl-9 pr-3 text-right tabular-nums"
                              value={row.fixedFinalPrice === null ? "" : String(row.fixedFinalPrice)}
                              onValueChange={(value) =>
                                onChange({
                                  fixedFinalPrice: value ? Number(value) : null,
                                })
                              }
                              placeholder="0"
                              maxDecimals={2}
                              caretToEndOnFocus
                            />
                            <span
                              aria-hidden="true"
                              className="pointer-events-none absolute inset-y-1 left-1.5 inline-flex min-w-[1.5rem] items-center justify-center rounded-md border border-transparent bg-transparent px-1 text-[10px] font-semibold text-zinc-500 sm:left-2"
                            >
                              $
                            </span>
                          </div>
                        </Field>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-4 pt-4 lg:flex-row lg:items-end lg:justify-between">
              <div className="flex w-full flex-col gap-4 lg:max-w-[920px] lg:flex-row lg:items-stretch">
                <div className="w-full lg:max-w-[520px]">
                  <MiniToggle
                    checked={row.featured}
                    onChange={() => onChange({ featured: !row.featured })}
                    label="Producto destacado"
                    help="Le da prioridad visual dentro del catalogo y los listados de la tienda."
                    className="h-full min-h-[84px]"
                    contentClassName="flex h-full flex-col justify-between"
                    helpClassName="mt-3"
                  />
                </div>
                <div className="flex h-full min-h-[84px] flex-col justify-between rounded-[18px] border border-dashed border-sky-200 bg-sky-50/60 px-3.5 py-3 text-sm text-sky-950 lg:min-w-[320px]">
                  <div className="text-sm font-medium">Resumen</div>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs">
                    <span className="rounded-full border border-sky-200 bg-white px-2.5 py-1">
                      Reservado actual: {row.webStockReserved}
                    </span>
                    <span className="rounded-full border border-sky-200 bg-white px-2.5 py-1">
                      Precio final estimado: ${formatMoney(row.computedPriceFinal)}
                    </span>
                    <span className="rounded-full border border-sky-200 bg-white px-2.5 py-1">
                      MP: {effectiveMercadoPagoFeeDays} dias · {formatPercent(row.mercadoPagoFeePercent)}%
                    </span>
                    {row.shippingType === "NORMAL" ? (
                      <span className="rounded-full border border-sky-200 bg-white px-2.5 py-1">
                        Envio:{" "}
                        {row.normalShippingOverrideAmount === null
                          ? "regla general"
                          : `$${formatMoney(row.normalShippingOverrideAmount)}`}
                      </span>
                    ) : null}
                    <span className="rounded-full border border-sky-200 bg-white px-2.5 py-1">
                      Extra: {formatPercent(row.priceAdjustmentPercent)}%
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex justify-end">
                <button className="btn btn-sky" onClick={onSave} type="button">
                  <SaveIcon className="size-4" />
                  Guardar
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function OrderCard({
  order,
  onOpen,
}: {
  order: OrderRow;
  onOpen: () => void;
}) {
  const commercialState = getOrderCommercialState(order);
  const deliveryLabel = getOrderDeliveryLabel(order);
  const orderMeta = [
    order.customerDisplayName,
    order.customerEmail,
  ].filter((item): item is string => Boolean(item));

  return (
    <article className="overflow-visible rounded-[22px] border border-dashed border-zinc-200 bg-white px-4 py-4 shadow-[0_18px_36px_-34px_rgba(24,39,75,0.34)] sm:px-5">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
        <div className="min-w-0 pl-2.5">
          <h3 className="text-base font-semibold leading-snug text-zinc-950">
            <span>{order.displayNumber || order.id}</span>
            {orderMeta.map((item) => (
              <span key={item} className="text-xs font-medium text-zinc-500">
                <span className="px-1.5 text-zinc-300">·</span>
                {item}
              </span>
            ))}
          </h3>
        </div>
        <div className="flex shrink-0 items-start lg:justify-end">
          <div className="pr-4 text-right text-base font-semibold text-zinc-950 sm:text-lg">
            ${formatMoney(order.total)}
          </div>
        </div>
      </div>

      <div className="mt-3 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-2">
          <InfoPill
            icon={getOrderCommercialIcon(commercialState.icon)}
            tone={commercialState.tone}
          >
            {commercialState.label}
          </InfoPill>
          <InfoPill icon={<ShoppingCartIcon />}>
            {order.itemCount.toLocaleString("es-AR")}{" "}
            {order.itemCount === 1 ? "item" : "items"}
          </InfoPill>
          {deliveryLabel ? (
            <InfoPill
              icon={<TruckIcon />}
              tone={deliveryTone[order.deliverySummary.status]}
            >
              {deliveryLabel}
            </InfoPill>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onOpen}
          className="btn btn-sky shrink-0 self-start gap-1.5 px-4 py-2 text-xs leading-none transition hover:-translate-y-0.5 hover:shadow-[0_10px_20px_-14px_rgba(14,165,233,0.9)] lg:self-center"
        >
          <EyeIcon className="size-4" />
          Ver
        </button>
      </div>
    </article>
  );
}

function OrderDetailModal({
  order,
  onClose,
}: {
  order: OrderRow;
  onClose: () => void;
}) {
  const orderNumber = order.displayNumber || order.id;
  const commercialState = getOrderCommercialState(order);
  const timelineRows = getOrderTimelineRows(order);
  const deliveryLabel = getOrderDeliveryLabel(order);
  const deliveryAddress = formatDeliveryAddress(order.deliveryAddress);
  const customerFiscalCondition = formatFiscalCondition(
    order.customerFiscalCondition,
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-zinc-950/30 px-3 py-3 backdrop-blur-sm sm:px-6 sm:py-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="order-detail-title"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="flex max-h-[calc(100dvh-1.5rem)] w-full max-w-[1040px] flex-col overflow-hidden rounded-[22px] border border-zinc-200 bg-white shadow-[0_24px_80px_-32px_rgba(24,39,75,0.48)] sm:max-h-[calc(100dvh-3rem)] sm:rounded-[24px]">
        <div className="grid shrink-0 gap-3 border-b border-zinc-100 px-5 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:px-6">
          <div className="min-w-0">
            <h3
              id="order-detail-title"
              className="text-xl font-semibold tracking-[-0.02em] text-zinc-950"
            >
              {orderNumber}
            </h3>
          </div>
          <div className="flex min-w-0 items-center justify-between gap-3 sm:justify-end">
            <div className="flex min-w-0 flex-wrap items-center gap-2 sm:justify-end">
              <Badge tone={commercialState.tone}>{commercialState.label}</Badge>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar"
              className="inline-flex size-9 items-center justify-center rounded-full border border-zinc-200 bg-white text-zinc-600 transition hover:bg-zinc-50 hover:text-zinc-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/30"
            >
              <XMarkIcon className="size-4" />
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6 sm:py-5">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(300px,0.65fr)] lg:items-stretch">
            <div className="flex h-full flex-col gap-4 lg:col-start-1 lg:row-start-1">
              <section className="flex-1 rounded-[20px] border border-zinc-200 bg-zinc-50/45 px-4 py-4">
                <div className="flex items-center gap-2">
                  <ShoppingCartIcon className="size-4 text-zinc-500" />
                  <h4 className="text-sm font-semibold text-zinc-950">Productos</h4>
                </div>
                <div className="mt-3 divide-y divide-zinc-200/80">
                  {order.items.map((item) => (
                    <div key={item.id} className="py-3 first:pt-0 last:pb-0">
                      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-zinc-950">
                            {item.publicName}
                          </div>
                          {item.sku ? (
                            <div className="mt-1 text-xs text-zinc-500">
                              {item.sku}
                            </div>
                          ) : null}
                        </div>
                        <div className="grid min-w-[180px] grid-cols-3 gap-2 text-right text-sm">
                          <div>
                            <div className="text-[11px] font-medium text-zinc-500">Cant.</div>
                            <div className="mt-1 font-semibold text-zinc-950">
                              {item.quantity.toLocaleString("es-AR")}
                            </div>
                          </div>
                          <div>
                            <div className="text-[11px] font-medium text-zinc-500">Unit.</div>
                            <div className="mt-1 font-semibold text-zinc-950">
                              ${formatMoney(item.unitPriceFinal)}
                            </div>
                          </div>
                          <div>
                            <div className="text-[11px] font-medium text-zinc-500">Total</div>
                            <div className="mt-1 font-semibold text-zinc-950">
                              ${formatMoney(item.lineTotal)}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              <section className="rounded-[20px] border border-zinc-200 bg-zinc-50/45 px-4 py-4">
                <div className="flex items-center gap-2">
                  <TruckIcon className="size-4 text-zinc-500" />
                  <h4 className="text-sm font-semibold text-zinc-950">Entrega</h4>
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div>
                    <div className="text-xs font-medium text-zinc-500">Modalidad</div>
                    <div className="mt-1 text-sm font-semibold text-zinc-950">
                      {deliveryMethodLabels[order.deliveryMethod]}
                    </div>
                  </div>
                  {order.shippingTotal > 0 ? (
                    <div>
                      <div className="text-xs font-medium text-zinc-500">Costo de envio</div>
                      <div className="mt-1 text-sm font-semibold text-zinc-950">
                        ${formatMoney(order.shippingTotal)}
                      </div>
                    </div>
                  ) : null}
                  {deliveryAddress ? (
                    <div className="sm:col-span-2">
                      <div className="text-xs font-medium text-zinc-500">Direccion / notas</div>
                      <div className="mt-1 text-sm font-medium text-zinc-800">
                        {deliveryAddress}
                      </div>
                    </div>
                  ) : null}
                  {deliveryLabel ? (
                    <div className="sm:col-span-2">
                      <div className="text-xs font-medium text-zinc-500">Estado operativo</div>
                      <div className="mt-1 text-sm font-semibold text-zinc-950">
                        {deliveryLabel}
                      </div>
                      {order.deliverySummary.noteNumber ? (
                        <div className="mt-1 text-xs font-medium text-zinc-500">
                          Remito {order.deliverySummary.noteNumber}
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </section>
            </div>

            <section className="h-full rounded-[20px] border border-zinc-200 bg-white px-4 py-4 lg:col-start-1 lg:row-start-2">
                <div className="flex items-center gap-2">
                  <CurrencyDollarIcon className="size-4 text-zinc-500" />
                  <h4 className="text-sm font-semibold text-zinc-950">Resumen</h4>
                </div>
                <div className="mt-4 space-y-3 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-zinc-500">Subtotal</span>
                    <span className="font-semibold text-zinc-950">
                      ${formatMoney(order.subtotal)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-zinc-500">Envio</span>
                    <span className="font-semibold text-zinc-950">
                      ${formatMoney(order.shippingTotal)}
                    </span>
                  </div>
                  <div className="border-t border-zinc-200 pt-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-semibold text-zinc-950">Total</span>
                      <span className="text-lg font-semibold text-zinc-950">
                        ${formatMoney(order.total)}
                      </span>
                    </div>
                  </div>
                </div>
            </section>

            <section className="h-full rounded-[20px] border border-zinc-200 bg-zinc-50/45 px-4 py-4 lg:col-start-2 lg:row-start-1">
                <div className="flex items-center gap-2">
                  <DocumentTextIcon className="size-4 text-zinc-500" />
                  <h4 className="text-sm font-semibold text-zinc-950">Pedido</h4>
                </div>
                <div className="mt-3 space-y-3 text-sm">
                  {timelineRows.map((row) => (
                    <div key={row.label}>
                      <div className="text-xs font-medium text-zinc-500">{row.label}</div>
                      <div className="mt-1 font-semibold text-zinc-950">
                        {row.value}
                      </div>
                    </div>
                  ))}
                  {order.saleNumber ? (
                    <div>
                      <div className="text-xs font-medium text-zinc-500">Venta</div>
                      <div className="mt-1 font-semibold text-zinc-950">
                        #{order.saleNumber}
                      </div>
                    </div>
                  ) : null}
                  <div>
                    <div className="text-xs font-medium text-zinc-500">Metodo de pago</div>
                    <div className="mt-1 font-semibold text-zinc-950">
                      {formatPaymentMethod(order.paymentMethod)}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs font-medium text-zinc-500">Facturacion</div>
                    <div className="mt-1 font-semibold text-zinc-950">
                      {order.manualBillingRequired ? "Manual" : "Automatica"}
                    </div>
                  </div>
                </div>
            </section>

            <section className="h-full rounded-[20px] border border-zinc-200 bg-zinc-50/45 px-4 py-4 lg:col-start-2 lg:row-start-2">
                <div className="flex items-center gap-2">
                  <DocumentTextIcon className="size-4 text-zinc-500" />
                  <h4 className="text-sm font-semibold text-zinc-950">Cliente</h4>
                </div>
                <div className="mt-3 space-y-2 text-sm text-zinc-700">
                  <div className="font-semibold text-zinc-950">
                    {order.customerDisplayName}
                  </div>
                  <div>{order.customerEmail}</div>
                  {order.customerPhone ? <div>{order.customerPhone}</div> : null}
                  {order.customerTaxId ? <div>CUIT/DNI {order.customerTaxId}</div> : null}
                  {customerFiscalCondition ? (
                    <div>{customerFiscalCondition}</div>
                  ) : null}
                </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function StorefrontClient({
  role: _role,
  section,
}: {
  role: string;
  section: StorefrontSectionKey;
}) {
  void _role;
  const [channelData, setChannelData] = useState<ChannelResponse | null>(null);
  const [publications, setPublications] = useState<PublicationRow[]>([]);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [query, setQuery] = useState("");
  const [orderQuery, setOrderQuery] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingConfig, setIsSavingConfig] = useState(false);
  const [isCreatingKey, setIsCreatingKey] = useState(false);
  const [newApiKey, setNewApiKey] = useState<string | null>(null);
  const [isNewApiKeyCopied, setIsNewApiKeyCopied] = useState(false);
  const [apiKeyActionId, setApiKeyActionId] = useState<string | null>(null);
  const [isApiKeysOpen, setIsApiKeysOpen] = useState(false);
  const [configForm, setConfigForm] = useState<ConfigFormState>(
    createDefaultConfigForm(),
  );
  const [categoryDraft, setCategoryDraft] = useState("");
  const [visiblePublicationsCount, setVisiblePublicationsCount] = useState(
    PUBLICATIONS_PAGE_SIZE,
  );
  const [publicationStatusFilter, setPublicationStatusFilter] =
    useState<PublicationStatusFilter>("active");
  const [selectedPublicationId, setSelectedPublicationId] = useState<string | null>(null);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [publicationSort, setPublicationSort] =
    useState<PublicationSortKey>("name-asc");
  const [orderStatusFilter, setOrderStatusFilter] =
    useState<OrderStatusFilter>("to-deliver");
  const [orderDateRangeFilter, setOrderDateRangeFilter] =
    useState<OrderDateRangeFilter>("operational");
  const [orderSort, setOrderSort] = useState<OrderSortKey>("created-desc");
  const skipInitialQuerySyncRef = useRef(true);
  const publicationBaselineRef = useRef<Record<string, string>>({});
  const configBaselineRef = useRef("");
  const hasUnsavedChangesRef = useRef(false);

  async function loadDashboard(search = "") {
    setIsLoading(true);
    try {
      const [channelRes, publicationsRes, ordersRes] = await Promise.all([
        fetch("/api/storefront/admin/channel", { cache: "no-store" }),
        fetch(
          `/api/storefront/admin/publications${
            search ? `?q=${encodeURIComponent(search)}` : ""
          }`,
          { cache: "no-store" },
        ),
        fetch("/api/storefront/admin/orders", { cache: "no-store" }),
      ]);

      if (!channelRes.ok || !publicationsRes.ok || !ordersRes.ok) {
        setStatus("No se pudo cargar Storefront.");
        return;
      }

      const [channelJson, publicationsJson, ordersJson] = (await Promise.all([
        channelRes.json(),
        publicationsRes.json(),
        ordersRes.json(),
      ])) as [ChannelResponse, PublicationRow[], OrderRow[]];

      setChannelData(channelJson);
      const normalizedPublications = publicationsJson.map((row) => ({
        ...row,
        normalShippingOverrideAmount:
          row.normalShippingOverrideAmount === null ||
          row.normalShippingOverrideAmount === undefined
            ? null
            : toNumber(row.normalShippingOverrideAmount),
        mercadoPagoFeeDays: row.mercadoPagoFeeDays ?? null,
        mercadoPagoFeePercent: toNumber(row.mercadoPagoFeePercent),
      }));
      setPublications(normalizedPublications);
      setOrders(ordersJson);
      setVisiblePublicationsCount(PUBLICATIONS_PAGE_SIZE);
      setStatus(null);

      const mercadoPagoFeeRules = DEFAULT_MERCADOPAGO_FEE_RULES;
      const mercadoPagoDefaultFeeDays = normalizeMercadoPagoDefaultFeeDays(
        channelJson.channel.mercadoPagoDefaultFeeDays,
        mercadoPagoFeeRules,
      );

      const loadedConfigForm = {
        name: channelJson.channel.name,
        storeName: channelJson.channel.storeName,
        supportEmail: channelJson.channel.supportEmail ?? "",
        supportPhone: channelJson.channel.supportPhone ?? "",
        pickupAddress: channelJson.channel.pickupAddress ?? "",
        defaultPriceListId: channelJson.channel.defaultPriceListId ?? "",
        allowsCustomerAccounts: channelJson.channel.allowsCustomerAccounts,
        customerAccountsMode: channelJson.channel.customerAccountsMode,
        defaultPaymentMethod: channelJson.channel.defaultPaymentMethod,
        globalPriceAdjustmentPercent: String(
          channelJson.channel.globalPriceAdjustmentPercent ?? 0,
        ),
        normalShippingAmount: String(channelJson.channel.normalShippingAmount ?? 0),
        reserveTtlMinutes: String(channelJson.channel.reserveTtlMinutes ?? 30),
        manualBillingByDefault: channelJson.channel.manualBillingByDefault,
        productCategories: normalizeProductCategoryList(
          channelJson.channel.productCategories,
        ),
        mercadoPagoFeeRegion: DEFAULT_MERCADOPAGO_FEE_REGION,
        mercadoPagoFeeRules,
        mercadoPagoDefaultFeeDays: String(mercadoPagoDefaultFeeDays),
      };

      publicationBaselineRef.current = Object.fromEntries(
        normalizedPublications.map((row) => [
          row.productId,
          serializePublicationDraft(row),
        ]),
      );
      configBaselineRef.current = serializeConfigForm(loadedConfigForm);
      setConfigForm(loadedConfigForm);
      setCategoryDraft("");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadDashboard().catch(() => {
      setStatus("No se pudo cargar Storefront.");
      setIsLoading(false);
    });
  }, []);

  useEffect(() => {
    if (skipInitialQuerySyncRef.current) {
      skipInitialQuerySyncRef.current = false;
      return;
    }

    const timeout = window.setTimeout(() => {
      loadDashboard(query).catch(() => {
        setStatus("No se pudo cargar Storefront.");
        setIsLoading(false);
      });
    }, 250);

    return () => window.clearTimeout(timeout);
  }, [query]);

  const dirtyPublicationIds = useMemo(
    () =>
      publications
        .filter(
          (row) =>
            publicationBaselineRef.current[row.productId] !==
            serializePublicationDraft(row),
        )
        .map((row) => row.productId),
    [publications],
  );
  const hasPendingPublicationChanges = dirtyPublicationIds.length > 0;
  const hasDirtyConfig = useMemo(() => {
    if (!configBaselineRef.current) return false;
    return serializeConfigForm(configForm) !== configBaselineRef.current;
  }, [configForm]);
  const hasUnsavedChanges = hasDirtyConfig || hasPendingPublicationChanges;

  useEffect(() => {
    hasUnsavedChangesRef.current = hasUnsavedChanges;
  }, [hasUnsavedChanges]);

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!hasUnsavedChangesRef.current) return;
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, []);

  useEffect(() => {
    const handleAppNavigation = (event: Event) => {
      if (!hasUnsavedChangesRef.current) return;
      const shouldLeave = window.confirm(
        "Tenes cambios sin guardar en Storefront. Si salis ahora, se van a perder. Queres continuar?",
      );
      if (!shouldLeave) {
        event.preventDefault();
      }
    };

    window.addEventListener(APP_NAVIGATION_GUARD_EVENT, handleAppNavigation);
    return () =>
      window.removeEventListener(
        APP_NAVIGATION_GUARD_EVENT,
        handleAppNavigation,
      );
  }, []);

  useEffect(() => {
    if (!selectedPublicationId && !selectedOrderId) return;

    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSelectedPublicationId(null);
        setSelectedOrderId(null);
      }
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [selectedOrderId, selectedPublicationId]);

  async function handleSaveConfig() {
    setIsSavingConfig(true);
    setStatus(null);
    try {
      const mercadoPagoFeeRules = normalizeMercadoPagoFeeRulesForPayload(
        configForm.mercadoPagoFeeRules,
      );
      const mercadoPagoDefaultFeeDays = normalizeMercadoPagoDefaultFeeDays(
        configForm.mercadoPagoDefaultFeeDays,
        configForm.mercadoPagoFeeRules,
      );
      const defaultMercadoPagoRule =
        mercadoPagoFeeRules.find((rule) => rule.days === mercadoPagoDefaultFeeDays) ??
        mercadoPagoFeeRules[0] ??
        { days: 0, netPercent: 0 };
      const defaultMercadoPagoFinalPercent = getMercadoPagoFeeBreakdown(
        defaultMercadoPagoRule.netPercent,
      ).finalPercent;
      const response = await fetch("/api/storefront/admin/channel", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: configForm.name,
          storeName: configForm.storeName,
          supportEmail: configForm.supportEmail || null,
          supportPhone: configForm.supportPhone || null,
          pickupAddress: configForm.pickupAddress || null,
          currencyCode: "ARS",
          defaultPriceListId: configForm.defaultPriceListId || null,
          allowsCustomerAccounts: configForm.allowsCustomerAccounts,
          customerAccountsMode: configForm.customerAccountsMode,
          defaultPaymentMethod: configForm.defaultPaymentMethod,
          globalPriceAdjustmentPercent: toNumber(
            configForm.globalPriceAdjustmentPercent,
          ),
          normalShippingAmount: toNumber(configForm.normalShippingAmount),
          reserveTtlMinutes: toNumber(configForm.reserveTtlMinutes),
          manualBillingByDefault: configForm.manualBillingByDefault,
          productCategories: normalizeProductCategoryList(
            configForm.productCategories,
          ),
          mercadoPagoFeeRegion: configForm.mercadoPagoFeeRegion,
          mercadoPagoFeeRules,
          mercadoPagoDefaultFeeDays,
          paymentAdjustments: [
            {
              paymentMethod: "mercadopago_checkout_api",
              percent: defaultMercadoPagoFinalPercent,
            },
          ],
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        setStatus(data?.error ?? "No se pudo guardar la configuracion.");
        toast.error(data?.error ?? "No se pudo guardar la configuracion.");
        return;
      }

      setStatus("Configuracion de la tienda actualizada.");
      toast.success("Configuracion guardada.");
      await loadDashboard(query);
    } finally {
      setIsSavingConfig(false);
    }
  }

  async function handleCreateApiKey() {
    setIsCreatingKey(true);
    setStatus(null);
    setNewApiKey(null);
    setIsNewApiKeyCopied(false);
    try {
      const response = await fetch("/api/storefront/admin/channel/api-keys", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ label: nextApiKeyLabel }),
      });

      const data = await response.json().catch(() => null);
      if (!response.ok) {
        setStatus(data?.error ?? "No se pudo generar la clave de conexion.");
        toast.error(data?.error ?? "No se pudo generar la clave de conexion.");
        return;
      }

      setNewApiKey(data.value);
      setIsApiKeysOpen(true);
      setStatus("Clave de conexion generada.");
      toast.success("Clave de conexion generada.");
      await loadDashboard(query);
    } finally {
      setIsCreatingKey(false);
    }
  }

  async function handleCopyNewApiKey() {
    if (!newApiKey) return;
    try {
      await navigator.clipboard.writeText(newApiKey);
      setIsNewApiKeyCopied(true);
      toast.success("Clave copiada.");
    } catch {
      toast.error("No se pudo copiar la clave.");
    }
  }

  async function handleDeactivateApiKey(apiKeyId: string, label: string) {
    const shouldDeactivate = window.confirm(
      `Vas a desactivar la clave "${label}". Si alguna tienda la esta usando, va a dejar de poder consultar Storefront. Queres continuar?`,
    );
    if (!shouldDeactivate) return;

    setApiKeyActionId(apiKeyId);
    setStatus(null);
    try {
      const response = await fetch(
        `/api/storefront/admin/channel/api-keys/${apiKeyId}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
        },
      );

      const data = await response.json().catch(() => null);
      if (!response.ok) {
        setStatus(data?.error ?? "No se pudo desactivar la clave.");
        toast.error(data?.error ?? "No se pudo desactivar la clave.");
        return;
      }

      setStatus("Clave de conexion desactivada.");
      toast.success("Clave desactivada.");
      await loadDashboard(query);
    } finally {
      setApiKeyActionId(null);
    }
  }

  async function handleSavePublication(row: PublicationRow) {
    setStatus(null);
    const response = await fetch("/api/storefront/admin/publications", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        productId: row.productId,
        slug: null,
        publicationStatus: row.publicationStatus,
        publicName: row.publicName,
        shortDescription: row.shortDescription,
        longDescription: row.longDescription,
        category: row.category,
        featured: row.featured,
        shippingType: row.shippingType,
        normalShippingOverrideAmount: row.normalShippingOverrideAmount,
        stockMode: row.stockMode,
        webStockAvailable: row.webStockAvailable,
        pricingMode: row.pricingMode,
        fixedFinalPrice: row.fixedFinalPrice,
        mercadoPagoFeeDays: row.mercadoPagoFeeDays,
        priceAdjustmentPercent: row.priceAdjustmentPercent,
        billingMode: row.billingMode,
      }),
    });

    const data = await response.json().catch(() => null);
    if (!response.ok) {
      setStatus(data?.error ?? `No se pudo guardar ${row.productName}.`);
      toast.error(data?.error ?? `No se pudo guardar ${row.productName}.`);
      return;
    }

    setSelectedPublicationId(null);
    setStatus(`Publicacion actualizada: ${row.productName}.`);
    toast.success(`Cambios guardados en ${row.productName}.`);
    await loadDashboard(query);
  }

  function updatePublication(productId: string, patch: Partial<PublicationRow>) {
    setPublications((current) =>
      current.map((row) =>
        row.productId === productId ? { ...row, ...patch } : row,
      ),
    );
  }

  function addProductCategory() {
    const nextCategory = normalizeProductCategoryName(categoryDraft);
    if (!nextCategory) return;
    setConfigForm((current) => ({
      ...current,
      productCategories: normalizeProductCategoryList([
        ...current.productCategories,
        nextCategory,
      ]),
    }));
    setCategoryDraft("");
  }

  function removeProductCategory(category: string) {
    setConfigForm((current) => {
      const nextCategories = current.productCategories.filter(
        (item) =>
          item.toLocaleLowerCase("es-AR") !==
          category.toLocaleLowerCase("es-AR"),
      );
      return {
        ...current,
        productCategories: normalizeProductCategoryList(nextCategories),
      };
    });
  }

  const publishedCount = publications.filter(
    (row) => row.publicationStatus === "PUBLISHED",
  ).length;
  const pendingOrders = orders.filter(
    (order) => isPendingOrder(order),
  ).length;
  const mercadoPagoFeeRules = useMemo(
    () => normalizeMercadoPagoFeeRulesForPayload(configForm.mercadoPagoFeeRules),
    [configForm.mercadoPagoFeeRules],
  );
  const mercadoPagoDefaultFeeDays = useMemo(
    () =>
      normalizeMercadoPagoDefaultFeeDays(
        configForm.mercadoPagoDefaultFeeDays,
        configForm.mercadoPagoFeeRules,
      ),
    [configForm.mercadoPagoDefaultFeeDays, configForm.mercadoPagoFeeRules],
  );
  const mercadoPagoDefaultRule =
    mercadoPagoFeeRules.find((rule) => rule.days === mercadoPagoDefaultFeeDays) ??
    mercadoPagoFeeRules[0] ??
    { days: 0, netPercent: 0 };
  const mercadoPagoDefaultBreakdown = getMercadoPagoFeeBreakdown(
    mercadoPagoDefaultRule.netPercent,
  );
  const countOrdersForStatus = (statusFilter: OrderStatusFilter) => {
    const rangeStart = getOrderDateRangeStart(orderDateRangeFilter, statusFilter);
    return orders.filter(
      (order) =>
        matchesOrderStatusFilter(order, statusFilter) &&
        isOrderInsideDateRange(order, rangeStart),
    ).length;
  };
  const filteredPublications = useMemo(() => {
    const items = publications.filter((row) => {
      if (publicationStatusFilter === "active") {
        return row.publicationStatus === "PUBLISHED";
      }
      if (publicationStatusFilter === "paused") {
        return row.publicationStatus === "PAUSED";
      }
      return true;
    });

    items.sort((left, right) => {
      switch (publicationSort) {
        case "name-desc":
          return right.productName.localeCompare(left.productName, "es", {
            sensitivity: "base",
          });
        case "price-desc":
          return right.computedPriceFinal - left.computedPriceFinal;
        case "price-asc":
          return left.computedPriceFinal - right.computedPriceFinal;
        case "stock-desc":
          return right.webStockAvailable - left.webStockAvailable;
        case "stock-asc":
          return left.webStockAvailable - right.webStockAvailable;
        case "name-asc":
        default:
          return left.productName.localeCompare(right.productName, "es", {
            sensitivity: "base",
          });
      }
    });

    return items;
  }, [publicationSort, publicationStatusFilter, publications]);
  const filteredOrders = useMemo(() => {
    const normalizedQuery = orderQuery.trim().toLowerCase();
    const rangeStart = getOrderDateRangeStart(
      orderDateRangeFilter,
      orderStatusFilter,
    );
    const items = orders.filter((order) => {
      if (!matchesOrderStatusFilter(order, orderStatusFilter)) return false;
      if (!isOrderInsideDateRange(order, rangeStart)) return false;

      if (!normalizedQuery) return true;

      const searchable = [
        order.displayNumber,
        order.id,
        order.customerDisplayName,
        order.customerEmail,
        getOrderCommercialState(order).label,
        getOrderDeliveryLabel(order),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return searchable.includes(normalizedQuery);
    });

    items.sort((left, right) => {
      switch (orderSort) {
        case "created-asc":
          return (
            getDateTimeMs(getOrderOperationalDate(left)) -
            getDateTimeMs(getOrderOperationalDate(right))
          );
        case "total-desc":
          return right.total - left.total;
        case "total-asc":
          return left.total - right.total;
        case "created-desc":
        default:
          return (
            getDateTimeMs(getOrderOperationalDate(right)) -
            getDateTimeMs(getOrderOperationalDate(left))
          );
      }
    });

    return items;
  }, [orderDateRangeFilter, orderQuery, orderSort, orderStatusFilter, orders]);
  const publicationCategoryOptions = useMemo(() => {
    const categories = normalizeProductCategoryList(configForm.productCategories);
    return categories.map((category) => ({
      label: category,
      value: category,
    }));
  }, [configForm.productCategories]);
  const selectedPublication =
    publications.find((row) => row.productId === selectedPublicationId) ?? null;
  const selectedOrder = orders.find((order) => order.id === selectedOrderId) ?? null;
  const getPublicationCategoryOptions = (row: PublicationRow) =>
    publicationCategoryOptions.some((option) => option.value === row.category)
      ? publicationCategoryOptions
      : [
          ...publicationCategoryOptions,
          { label: row.category || "General", value: row.category || "General" },
        ];
  const visiblePublications = filteredPublications.slice(0, visiblePublicationsCount);
  const hasMorePublications = visiblePublicationsCount < filteredPublications.length;
  const nextApiKeyLabel =
    (channelData?.apiKeys.length ?? 0) > 0
      ? `Conexion principal #${(channelData?.apiKeys.length ?? 0) + 1}`
      : "Conexion principal";
  const orderEmptyMessage = !orders.length
    ? "Todavia no hay pedidos registrados en esta tienda."
    : orderStatusFilter === "closed"
      ? "No hay pedidos vencidos, rechazados o cancelados en este periodo."
      : orderStatusFilter === "pending"
        ? "No hay reservas pendientes de pago en este periodo."
        : orderStatusFilter === "to-deliver"
          ? "No hay pedidos para entregar en este periodo."
          : orderStatusFilter === "delivered"
            ? "No hay pedidos entregados en este periodo."
            : "No hay pedidos para mostrar con el filtro actual.";
  const summaryPills = (
    <div className="flex shrink-0 flex-wrap items-center gap-2 pt-1 sm:justify-end">
      <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-900">
        Publicadas: {publishedCount}
      </span>
      <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900">
        Pendientes: {pendingOrders}
      </span>
    </div>
  );

  return (
    <div className="space-y-5 px-2 pb-8 lg:px-0">
      {status ? (
        <div
          className={`rounded-[18px] border px-4 py-3 text-sm ${
            status.toLowerCase().includes("no se pudo")
              ? "border-rose-200 bg-rose-50 text-rose-950"
              : "border-sky-200 bg-sky-50 text-sky-950"
          }`}
        >
          {status}
        </div>
      ) : null}

      {section === "config" ? (
        <>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-1">
              <h2 className="text-[2rem] font-semibold tracking-[-0.03em] text-zinc-950">
                Configuracion
              </h2>
              <p className="text-sm text-zinc-500">
                Precios generales, claves de conexion y reglas de funcionamiento de la tienda.
              </p>
            </div>
            {summaryPills}
          </div>
          <div className="space-y-4">
            <section className={`${panelClass} px-5 py-6 sm:px-6 sm:py-7`}>
              <div>
                <div className="mb-6">
                  <h3 className="text-base font-semibold text-zinc-950">
                    Precios y funcionamiento
                  </h3>
                  <p className="mt-1 text-sm text-zinc-500">
                    Elegi la lista base, defini recargos y ajusta las reglas generales de la tienda.
                  </p>
                </div>

                <div className="space-y-6">
                  <div className="grid gap-5 md:grid-cols-3">
                    <div>
                      <Field label="Lista base">
                        <SelectInput
                          value={configForm.defaultPriceListId}
                          placeholder="Elegir lista"
                          onChange={(value) =>
                            setConfigForm((current) => ({
                              ...current,
                              defaultPriceListId: value,
                            }))
                          }
                          options={[
                            { label: "Elegir lista", value: "" },
                            ...(
                              channelData?.priceLists.map((priceList) => ({
                                value: priceList.id,
                                label: `${priceList.name}${
                                  priceList.isConsumerFinal ? " · consumidor final" : ""
                                }${priceList.isDefault ? " · default" : ""}`,
                              })) ?? []
                            ),
                          ]}
                        />
                      </Field>
                    </div>
                  </div>

                  <div className="grid gap-5 md:grid-cols-2">
                    <Field label="Recargo o descuento general">
                      <PercentInput
                        value={configForm.globalPriceAdjustmentPercent}
                        onChange={(value) =>
                          setConfigForm((current) => ({
                            ...current,
                            globalPriceAdjustmentPercent: value,
                          }))
                        }
                      />
                    </Field>
                    <Field label="Costo fijo de envio normal">
                      <div className="relative mt-1">
                        <MoneyInput
                          className="input no-spinner w-full min-h-[46px] rounded-2xl pl-9 pr-3 text-right tabular-nums"
                          value={configForm.normalShippingAmount}
                          onValueChange={(value) =>
                            setConfigForm((current) => ({
                              ...current,
                              normalShippingAmount: value,
                            }))
                          }
                          placeholder="0"
                          maxDecimals={2}
                          caretToEndOnFocus
                        />
                        <span
                          aria-hidden="true"
                          className="pointer-events-none absolute inset-y-1 left-1.5 inline-flex min-w-[1.5rem] items-center justify-center rounded-md border border-transparent bg-transparent px-1 text-[10px] font-semibold text-zinc-500 sm:left-2"
                        >
                          $
                        </span>
                      </div>
                    </Field>
                  </div>

                  <div className="rounded-[18px] border border-zinc-200 bg-zinc-50/70 p-3">
                    <div className="grid gap-2 lg:grid-cols-[minmax(140px,auto)_1fr] lg:items-center">
                      <div className="text-sm font-medium leading-none text-zinc-900">
                        Mercado Pago
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5 text-[11px] lg:justify-end">
                        <span className="inline-flex h-6 items-center rounded-full border border-zinc-200 bg-white px-2 text-zinc-700">
                          Neto {formatPercent(mercadoPagoDefaultBreakdown.netPercent)}%
                        </span>
                        <span className="inline-flex h-6 items-center rounded-full border border-zinc-200 bg-white px-2 text-zinc-700">
                          IVA {formatPercent(mercadoPagoDefaultBreakdown.ivaPercent)}%
                        </span>
                        <span className="inline-flex h-6 items-center rounded-full border border-emerald-200 bg-emerald-50 px-2 font-semibold text-emerald-900">
                          Final {formatPercent(mercadoPagoDefaultBreakdown.finalPercent)}%
                        </span>
                      </div>
                    </div>

                    <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                      {mercadoPagoFeeRules.map((rule) => {
                        const breakdown = getMercadoPagoFeeBreakdown(rule.netPercent);
                        const isDefault = rule.days === mercadoPagoDefaultFeeDays;

                        return (
                          <button
                            key={rule.days}
                            aria-pressed={isDefault}
                            className={`grid min-h-[62px] grid-rows-[auto_1fr] rounded-xl border px-3 py-2 text-left transition ${
                              isDefault
                                ? "border-sky-200 bg-sky-50 text-sky-950"
                                : "border-zinc-200 bg-white text-zinc-800 hover:border-sky-100 hover:bg-sky-50/40"
                            }`}
                            onClick={() =>
                              setConfigForm((current) => ({
                                ...current,
                                mercadoPagoDefaultFeeDays: String(rule.days),
                              }))
                            }
                            type="button"
                          >
                            <div className="flex min-h-5 items-center justify-between gap-2">
                              <span className="truncate text-xs font-semibold">
                                {getMercadoPagoDaysLabel(rule.days)}
                              </span>
                              {isDefault ? (
                                <span className="inline-flex h-5 shrink-0 items-center rounded-full border border-sky-200 bg-white px-1.5 text-[10px] font-semibold text-sky-900">
                                  Default
                                </span>
                              ) : null}
                            </div>
                            <div className="mt-1 grid grid-cols-3 items-end gap-2 text-[11px] leading-snug text-zinc-500">
                              <span className="truncate">Neto {formatPercent(breakdown.netPercent)}%</span>
                              <span className="truncate text-center">IVA {formatPercent(breakdown.ivaPercent)}%</span>
                              <span className="truncate text-right font-semibold text-emerald-800">
                                Final {formatPercent(breakdown.finalPercent)}%
                              </span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="grid gap-5 lg:grid-cols-2">
                    <MiniToggle checked={configForm.manualBillingByDefault} onChange={() => setConfigForm((current) => ({ ...current, manualBillingByDefault: !current.manualBillingByDefault }))} label="Facturacion manual por defecto" help="Si un producto no define excepcion propia, el pedido queda en circuito manual." />
                    <div className="rounded-[18px] border border-zinc-200 bg-zinc-50/70 px-4 py-4">
                      <Field label="Tiempo de reserva">
                        <div className="mt-1 flex flex-wrap gap-2">
                          {[15, 30, 45, 60].map((minutes) => (
                            <button
                              key={minutes}
                              type="button"
                              onClick={() =>
                                setConfigForm((current) => ({
                                  ...current,
                                  reserveTtlMinutes: String(minutes),
                                }))
                              }
                              className={`toggle-pill ${
                                configForm.reserveTtlMinutes === String(minutes)
                                  ? "toggle-pill-active border-sky-300 bg-sky-50 text-sky-950"
                                  : ""
                              }`}
                            >
                              {minutes} min
                            </button>
                          ))}
                        </div>
                      </Field>
                    </div>
                  </div>

                  <div className="rounded-[18px] border border-zinc-200 bg-zinc-50/70 px-4 py-4">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-zinc-900">
                          Categorias de producto
                        </div>
                        <p className="mt-1 text-xs leading-relaxed text-zinc-500">
                          Opciones disponibles al editar publicaciones.
                        </p>
                      </div>
                      <div className="flex w-full gap-2 lg:max-w-[360px]">
                        <input
                          className="input min-h-[38px] flex-1 rounded-xl border-zinc-200 px-3 text-sm placeholder:text-zinc-400"
                          value={categoryDraft}
                          onChange={(event) => setCategoryDraft(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key !== "Enter") return;
                            event.preventDefault();
                            addProductCategory();
                          }}
                          placeholder="Nueva categoria"
                        />
                        <button
                          className="btn min-h-[38px] shrink-0 rounded-xl px-3 text-sm"
                          disabled={!normalizeProductCategoryName(categoryDraft)}
                          onClick={addProductCategory}
                          type="button"
                        >
                          <PlusIcon className="size-4" />
                          Agregar
                        </button>
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {configForm.productCategories.map((category) => (
                        <span
                          key={category}
                          className="inline-flex min-h-[30px] items-center gap-1 rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-xs font-medium text-zinc-700"
                        >
                          {category}
                          {configForm.productCategories.length > 1 ? (
                            <button
                              aria-label={`Quitar ${category}`}
                              className="inline-flex size-5 items-center justify-center rounded-full text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700"
                              onClick={() => removeProductCategory(category)}
                              type="button"
                            >
                              <XMarkIcon className="size-3.5" />
                            </button>
                          ) : null}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="mt-7 border-t border-zinc-200 pt-6">
                  <div className="flex justify-end">
                    <button className="btn btn-sky min-w-[160px]" disabled={isSavingConfig || isLoading} onClick={handleSaveConfig} type="button">
                      <CheckIcon className="size-4" />
                      {isSavingConfig ? "Guardando..." : "Guardar"}
                    </button>
                  </div>
                </div>
              </div>
            </section>

            <section className={panelClass}>
              <button
                type="button"
                onClick={() => setIsApiKeysOpen((current) => !current)}
                aria-expanded={isApiKeysOpen}
                className="flex w-full flex-col gap-3 px-5 py-5 text-left transition hover:bg-zinc-50/70 sm:flex-row sm:items-center sm:justify-between sm:px-6"
              >
                <div className="min-w-0">
                  <h3 className="text-base font-semibold text-zinc-950">
                    Claves de conexion
                  </h3>
                  <p className="mt-1 text-sm text-zinc-500">
                    Permiten que la tienda online consulte productos, precios y stock desde Frio Gestion.
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="inline-flex size-8 items-center justify-center rounded-full border border-zinc-200 bg-white text-zinc-500">
                    <ChevronDownSmallIcon className={`size-4 transition-transform ${isApiKeysOpen ? "rotate-180" : ""}`} />
                  </span>
                </div>
              </button>

              {isApiKeysOpen ? (
                <div className="border-t border-zinc-200 px-5 py-5 sm:px-6">
                  {newApiKey ? (
                    <div className="mb-4 rounded-[18px] border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm text-emerald-950">
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-emerald-950">
                            Clave nueva generada
                          </div>
                          <div className="mt-1 text-sm text-emerald-900">
                            Copiala ahora. Despues no se vuelve a mostrar completa.
                          </div>
                          <div className="mt-3 rounded-2xl border border-emerald-200 bg-white/80 px-4 py-3 font-mono text-xs break-all text-emerald-950">
                            {newApiKey}
                          </div>
                        </div>

                        <div className="flex shrink-0 flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={handleCopyNewApiKey}
                            className="btn btn-emerald min-w-[150px]"
                          >
                            {isNewApiKeyCopied ? "Clave copiada" : "Copiar clave"}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setNewApiKey(null);
                              setIsNewApiKeyCopied(false);
                            }}
                            className="btn min-w-[120px] border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
                          >
                            Cerrar
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : null}

                  <div className="flex justify-end">
                    <button className="btn btn-emerald min-w-[170px]" disabled={isCreatingKey || isLoading} onClick={handleCreateApiKey} type="button">
                      <PlusIcon className="size-4" />
                      {isCreatingKey ? "Generando..." : "Generar clave"}
                    </button>
                  </div>

                  <div className="mt-4 grid gap-3 lg:grid-cols-2">
                    {channelData?.apiKeys.length ? (
                      channelData.apiKeys.map((apiKey) => (
                        <div key={apiKey.id} className="rounded-[18px] border border-zinc-200 bg-zinc-50/40 px-4 py-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="text-sm font-medium text-zinc-950">{apiKey.label}</div>
                              <div className="mt-1 font-mono text-[11px] text-zinc-500">{apiKey.keyPrefix}...</div>
                            </div>
                            <div className="shrink-0">
                              <Badge tone={apiKey.isActive ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-zinc-200 bg-zinc-100 text-zinc-700"}>
                                {apiKey.isActive ? "Activa" : "Inactiva"}
                              </Badge>
                            </div>
                          </div>
                          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                            {apiKey.isActive ? (
                              <button
                                type="button"
                                onClick={() => handleDeactivateApiKey(apiKey.id, apiKey.label)}
                                disabled={apiKeyActionId === apiKey.id}
                                className="inline-flex min-h-8 items-center gap-1.5 rounded-xl border border-rose-200 bg-white px-2.5 py-1.5 text-xs font-medium text-rose-700 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                <TrashIcon className="size-3.5" />
                                {apiKeyActionId === apiKey.id ? "Desactivando..." : "Desactivar"}
                              </button>
                            ) : null}
                            <div className="ml-auto text-right text-xs text-zinc-500">
                              Ultimo uso: {formatDateTime(apiKey.lastUsedAt)}
                            </div>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="rounded-[18px] border border-dashed border-zinc-200 bg-zinc-50/40 px-4 py-4 text-sm text-zinc-500 lg:col-span-2">
                        Todavia no hay claves de conexion creadas para esta tienda.
                      </div>
                    )}
                  </div>
                </div>
              ) : null}
            </section>
          </div>
        </>
      ) : null}

      {section === "publications" ? (
        <>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-1">
              <h2 className="text-[2rem] font-semibold tracking-[-0.03em] text-zinc-950">
                Publicaciones
              </h2>
              <p className="text-sm text-zinc-500">
                Publica, pausa y ajusta reglas por producto desde una vista simple.
              </p>
            </div>
            {summaryPills}
          </div>
          <div className="flex">
            <div className="flex max-w-full flex-wrap gap-1 rounded-2xl border border-zinc-200 bg-zinc-50/80 p-1">
              {[
                { value: "active", label: "Activas" },
                { value: "paused", label: "Pausadas" },
                { value: "all", label: "Todas" },
              ].map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => {
                    setPublicationStatusFilter(option.value as PublicationStatusFilter);
                    setVisiblePublicationsCount(PUBLICATIONS_PAGE_SIZE);
                  }}
                  className={`inline-flex items-center rounded-[12px] px-4 py-2 text-sm font-medium transition ${
                    publicationStatusFilter === option.value
                      ? "bg-white text-zinc-950 shadow-[0_1px_2px_rgba(0,0,0,0.06)]"
                      : "text-zinc-600 hover:text-zinc-900"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        <div className="space-y-5">
          <div className="sticky top-4 z-20 rounded-[20px] border border-zinc-200 bg-white/92 px-3 py-2.5 shadow-[0_18px_38px_-30px_rgba(24,39,75,0.32)] backdrop-blur supports-[backdrop-filter]:bg-white/82">
            <div className="flex flex-col gap-2">
              <div className="grid gap-2 lg:grid-cols-[minmax(260px,340px)_minmax(0,1fr)] lg:items-center">
                <div className="flex min-h-[38px] items-center rounded-2xl border border-zinc-200 bg-white px-1.5 shadow-[0_10px_24px_-24px_rgba(24,39,75,0.32)]">
                  <span className="shrink-0 border-r border-zinc-200 px-1.5 text-xs font-medium text-zinc-500">
                    Ordenar
                  </span>
                  <div className="min-w-0 flex-1">
                    <SelectInput
                      embedded
                      value={publicationSort}
                      onChange={(value) =>
                        setPublicationSort(value as PublicationSortKey)
                      }
                      options={[
                        { label: "Nombre A-Z", value: "name-asc" },
                        { label: "Nombre Z-A", value: "name-desc" },
                        { label: "Precio mas alto", value: "price-desc" },
                        { label: "Precio mas bajo", value: "price-asc" },
                        { label: "Mas stock", value: "stock-desc" },
                        { label: "Menos stock", value: "stock-asc" },
                      ]}
                    />
                  </div>
                </div>

                <div>
                  <input
                    className="input w-full min-h-[38px] rounded-2xl border-zinc-200 px-2.5 text-sm placeholder:text-zinc-400"
                    placeholder="Buscar por nombre, codigo o marca"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            {isLoading ? (
              <StorefrontLoadingCard
                title="Cargando publicaciones"
                description="Actualizando productos publicados, stock y reglas de venta."
              />
            ) : filteredPublications.length ? (
              visiblePublications.map((row) => (
                <PublicationEditorCard
                  key={row.productId}
                  row={row}
                  onOpen={() => setSelectedPublicationId(row.productId)}
                />
              ))
            ) : (
              <div className="rounded-[20px] border border-dashed border-zinc-200 bg-zinc-50/50 px-4 py-6 text-sm text-zinc-500">
                No hay productos para mostrar con el filtro actual.
              </div>
            )}
          </div>

          {selectedPublication ? (
            <PublicationEditorModal
              row={selectedPublication}
              categoryOptions={getPublicationCategoryOptions(selectedPublication)}
              mercadoPagoFeeRules={mercadoPagoFeeRules}
              mercadoPagoDefaultFeeDays={mercadoPagoDefaultFeeDays}
              onClose={() => setSelectedPublicationId(null)}
              onChange={(patch) => updatePublication(selectedPublication.productId, patch)}
              onSave={() => handleSavePublication(selectedPublication)}
            />
          ) : null}

          {hasMorePublications ? (
            <div className="flex justify-center">
              <button
                className="btn min-w-[220px]"
                onClick={() =>
                  setVisiblePublicationsCount((current) =>
                    Math.min(current + PUBLICATIONS_PAGE_SIZE, filteredPublications.length),
                  )
                }
                type="button"
              >
                Cargar mas publicaciones
              </button>
            </div>
          ) : null}
        </div>
        </>
      ) : null}

      {section === "orders" ? (
        <>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-1">
              <h2 className="text-[2rem] font-semibold tracking-[-0.03em] text-zinc-950">
                Pedidos
              </h2>
              <p className="text-sm text-zinc-500">
                Pedidos separados por accion operativa: cobrar, entregar, revisar entregados o consultar no concretados.
              </p>
            </div>
            {summaryPills}
          </div>
          <div className="flex">
            <div className="inline-flex gap-1 rounded-2xl border border-zinc-200 bg-zinc-50/80 p-1">
              {[
                {
                  value: "pending",
                  label: "Pendientes",
                  count: countOrdersForStatus("pending"),
                  textTone: "text-amber-800",
                  countTone: "border-amber-200 bg-amber-50 text-amber-800",
                  activeTone: "ring-1 ring-amber-100",
                },
                {
                  value: "to-deliver",
                  label: "A entregar",
                  count: countOrdersForStatus("to-deliver"),
                  textTone: "text-sky-800",
                  countTone: "border-sky-200 bg-sky-50 text-sky-800",
                  activeTone: "ring-1 ring-sky-100",
                },
                {
                  value: "delivered",
                  label: "Entregados",
                  count: countOrdersForStatus("delivered"),
                  textTone: "text-emerald-800",
                  countTone: "border-emerald-200 bg-emerald-50 text-emerald-800",
                  activeTone: "ring-1 ring-emerald-100",
                },
                {
                  value: "closed",
                  label: "No concretados",
                  count: countOrdersForStatus("closed"),
                  textTone: "text-rose-800",
                  countTone: "border-rose-200 bg-rose-50 text-rose-800",
                  activeTone: "ring-1 ring-rose-100",
                },
                {
                  value: "all",
                  label: "Todos",
                  count: countOrdersForStatus("all"),
                  textTone: "text-zinc-700",
                  countTone: "border-zinc-200 bg-white/80 text-zinc-500",
                  activeTone: "ring-1 ring-zinc-100",
                },
              ].map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setOrderStatusFilter(option.value as OrderStatusFilter)}
                  className={`rounded-[12px] px-4 py-2 text-sm font-medium transition ${
                    orderStatusFilter === option.value
                      ? `bg-white shadow-[0_1px_2px_rgba(0,0,0,0.06)] ${option.activeTone}`
                      : "hover:bg-white/60"
                  }`}
                >
                  <span className={option.textTone}>{option.label}</span>
                  <span className={`ml-2 rounded-full border px-1.5 py-0.5 text-[11px] leading-none ${option.countTone}`}>
                    {option.count.toLocaleString("es-AR")}
                  </span>
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-5">
            <div className="sticky top-4 z-20 rounded-[20px] border border-zinc-200 bg-white/92 px-3 py-2.5 shadow-[0_18px_38px_-30px_rgba(24,39,75,0.32)] backdrop-blur supports-[backdrop-filter]:bg-white/82">
              <div className="grid gap-2 lg:grid-cols-[minmax(220px,300px)_minmax(180px,220px)_minmax(0,1fr)] lg:items-center">
                <div className="flex min-h-[38px] items-center rounded-2xl border border-zinc-200 bg-white px-1.5 shadow-[0_10px_24px_-24px_rgba(24,39,75,0.32)]">
                  <span className="shrink-0 border-r border-zinc-200 px-1.5 text-xs font-medium text-zinc-500">
                    Ordenar
                  </span>
                  <div className="min-w-0 flex-1">
                    <SelectInput
                      embedded
                      value={orderSort}
                      onChange={(value) => setOrderSort(value as OrderSortKey)}
                      options={[
                        { label: "Mas recientes", value: "created-desc" },
                        { label: "Mas antiguos", value: "created-asc" },
                        { label: "Total mas alto", value: "total-desc" },
                        { label: "Total mas bajo", value: "total-asc" },
                      ]}
                    />
                  </div>
                </div>

                <div className="flex min-h-[38px] items-center rounded-2xl border border-zinc-200 bg-white px-1.5 shadow-[0_10px_24px_-24px_rgba(24,39,75,0.32)]">
                  <span className="shrink-0 border-r border-zinc-200 px-1.5 text-xs font-medium text-zinc-500">
                    Periodo
                  </span>
                  <div className="min-w-0 flex-1">
                    <SelectInput
                      embedded
                      value={orderDateRangeFilter}
                      onChange={(value) =>
                        setOrderDateRangeFilter(value as OrderDateRangeFilter)
                      }
                      options={[
                        { label: "Operativo", value: "operational" },
                        { label: "Dia", value: "day" },
                        { label: "Semana", value: "week" },
                        { label: "Mes", value: "month" },
                        { label: "Todos", value: "all" },
                      ]}
                    />
                  </div>
                </div>

                <div>
                  <input
                    className="input w-full min-h-[38px] rounded-2xl border-zinc-200 px-2.5 text-sm placeholder:text-zinc-400"
                    placeholder="Buscar por pedido, cliente o email"
                    value={orderQuery}
                    onChange={(event) => setOrderQuery(event.target.value)}
                  />
                </div>
              </div>
            </div>

            <div className="space-y-4">
              {isLoading ? (
                <StorefrontLoadingCard
                  title="Cargando pedidos"
                  description="Consultando pedidos, pagos y vencimientos de la tienda."
                />
              ) : filteredOrders.length ? (
                filteredOrders.map((order) => (
                  <OrderCard
                    key={order.id}
                    order={order}
                    onOpen={() => setSelectedOrderId(order.id)}
                  />
                ))
              ) : (
                <div className="rounded-[20px] border border-dashed border-zinc-200 bg-zinc-50/50 px-4 py-6 text-sm text-zinc-500">
                  {orderEmptyMessage}
                </div>
              )}
            </div>

            {selectedOrder ? (
              <OrderDetailModal
                order={selectedOrder}
                onClose={() => setSelectedOrderId(null)}
              />
            ) : null}
          </div>
        </>
      ) : null}

      {isLoading && section === "config" ? (
        <StorefrontLoadingCard
          title="Cargando configuracion"
          description="Preparando precios, reglas generales y claves de conexion."
        />
      ) : null}

      <ToastContainer position="bottom-right" theme="light" />
    </div>
  );
}
