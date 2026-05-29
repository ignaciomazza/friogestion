"use client";

import type { ChangeEvent, FormEvent, KeyboardEvent, ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import dynamic from "next/dynamic";
import { AnimatePresence, motion } from "framer-motion";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import {
  ChevronDownIcon,
  CheckIcon,
  EyeIcon,
  ExclamationTriangleIcon,
  PlusIcon,
  TrashIcon,
} from "@/components/icons";
import { MoneyInput } from "@/components/inputs/MoneyInput";
import { STOCK_ENABLED } from "@/lib/features";
import { formatCurrencyARS } from "@/lib/format";
import { normalizeDecimalInput } from "@/lib/input-format";
import {
  calculateAutoTotalsFromProducts,
  calculateFiscalLineAmount,
  compareArcaVoucherAgainstForm,
  normalizeJurisdiction,
  suggestJurisdictions,
  summarizeArcaMismatches,
  type PurchaseArcaMismatchField,
  type PurchaseArcaVoucherSnapshot,
  type PurchaseTotalsSource,
} from "@/lib/purchases/new-purchase";
import type { ProductOption, PurchaseRow, SupplierOption } from "./types";
import {
  formatProductLabel,
  formatSupplierLabel,
  formatUnit,
  normalizeQuery,
} from "./utils";

const PurchaseConfirmModal = dynamic(
  () => import("./components/PurchaseConfirmModal"),
  { ssr: false },
);

const PurchasePaymentModeModal = dynamic(
  () => import("./components/PurchasePaymentModeModal"),
  { ssr: false },
);

const SupplierGroupedPaymentModal = dynamic(
  () => import("./components/SupplierGroupedPaymentModal"),
  { ssr: false },
);

const PurchaseQrScannerModal = dynamic(
  () => import("./components/PurchaseQrScannerModal"),
  { ssr: false },
);

const PurchaseEditInvoiceModal = dynamic(
  () => import("./components/PurchaseEditInvoiceModal"),
  { ssr: false },
);

const PurchaseDetailModal = dynamic(
  () => import("./components/PurchaseDetailModal"),
  { ssr: false },
);

type PaymentMethodOption = {
  id: string;
  name: string;
  type: string;
  requiresAccount: boolean;
  isActive?: boolean;
};

type AccountOption = {
  id: string;
  name: string;
  type: string;
  currencyCode: string;
  isActive?: boolean;
};

type PurchaseProductForm = {
  productId: string;
  productSearch: string;
  qty: string;
  unitCost: string;
  discountPercent: string;
  taxRate: string;
};

type PurchaseFiscalLineType =
  | "IIBB_PERCEPTION"
  | "VAT_PERCEPTION"
  | "INCOME_TAX_PERCEPTION"
  | "MUNICIPAL_PERCEPTION"
  | "INTERNAL_TAX"
  | "OTHER";

type PurchaseFiscalLineForm = {
  type: PurchaseFiscalLineType;
  jurisdiction: string;
  baseAmount: string;
  rate: string;
  amount: string;
  manualAmountOverride: boolean;
  note: string;
};

type PurchasePaymentMode =
  | "CURRENT_ACCOUNT"
  | "IMMEDIATE_CASH_OUT"
  | "OFF_BOOK";

type CashOutLineForm = {
  paymentMethodId: string;
  accountId: string;
  amount: string;
};

type SimpleFiscalCondition = "GRAVADO" | "NO_GRAVADO" | "EXENTO";

type PurchaseSectionId =
  | "supplier"
  | "invoice"
  | "products"
  | "totals"
  | "taxes"
  | "payment";

type FiscalDetailPayload = {
  netTaxed: number;
  netNonTaxed: number;
  exemptAmount: number;
  vatTotal: number;
  lines: Array<{
    type: PurchaseFiscalLineType;
    jurisdiction?: string;
    baseAmount?: number;
    rate?: number;
    amount: number;
    note?: string;
  }>;
};

type PurchasePayload = {
  supplierId: string;
  hasInvoice: boolean;
  invoiceNumber?: string;
  invoiceDate?: string;
  totalAmount: number;
  purchaseVatAmount?: number;
  fiscalDetail?: FiscalDetailPayload;
  impactCurrentAccount: boolean;
  items?: Array<{
    productId: string;
    qty: number;
    unitCost: number;
    taxRate: number;
  }>;
  adjustStock: boolean;
  registerCashOut: boolean;
  cashOutLines?: Array<{
    paymentMethodId: string;
    accountId?: string;
    amount: number;
  }>;
  validateWithArca: boolean;
  arcaValidation?: Record<string, string | number>;
};

type PreparedPurchase = {
  payload: PurchasePayload;
  supplierLabel: string;
  dateLabel: string;
  invoiceLabel: string;
  paymentLabel: string;
  total: number;
  vatAmount: number | null;
  productCount: number;
  productTotal: number;
  fiscalOtherTotal: number;
  fiscalDifference: number;
};

type PurchaseQrImportResponse = {
  issuerTaxId: string;
  pointOfSale: number;
  voucherType: number;
  voucherKind: "A" | "B" | "C" | null;
  voucherNumber: number;
  invoiceNumber: string;
  voucherDate: string;
  totalAmount: number;
  authorizationCode: string | null;
  netTaxedAmount?: number | null;
  nonTaxedAmount?: number | null;
  exemptAmount?: number | null;
  vatAmount?: number | null;
  otherTaxesAmount?: number | null;
  warning?: string | null;
  arcaValidation: Record<string, string | number>;
};

type PurchaseArcaRevalidationFeedback = {
  purchaseId: string;
  status: string;
  message: string;
  checkedAt?: string | null;
  request?: Record<string, unknown> | null;
  rawResponse?: unknown;
  details: Array<{
    label: string;
    value: string;
  }>;
  hints: string[];
};

type PurchaseEditResponse = {
  id: string;
  supplier: SupplierOption;
  hasInvoice?: boolean;
  fiscalComputable?: boolean;
  fiscalRecordType?: "FISCAL_COMPUTABLE" | "INTERNAL_NON_COMPUTABLE";
  invoiceNumber: string | null;
  invoiceDate: string | null;
  total: string | null;
  taxes: string | null;
  netTaxed: string | null;
  netNonTaxed: string | null;
  exemptAmount: string | null;
  vatTotal: string | null;
  otherTaxesTotal: string | null;
  fiscalVoucherKind: string | null;
  fiscalVoucherType: number | null;
  authorizationCode: string | null;
  items: Array<{
    productId: string;
    qty: string;
    unitCost: string;
    taxRate: string | null;
    product: ProductOption;
  }>;
  fiscalLines: Array<{
    type: PurchaseFiscalLineType;
    jurisdiction: string | null;
    baseAmount: string | null;
    rate: string | null;
    amount: string;
    note: string | null;
  }>;
  impactsAccount: boolean;
  confirmedAllocatedTotal: string;
  hasStockMovements: boolean;
};

const emptyPurchaseProduct = (): PurchaseProductForm => ({
  productId: "",
  productSearch: "",
  qty: "1",
  unitCost: "",
  discountPercent: "0",
  taxRate: "21",
});

const emptyFiscalLine = (): PurchaseFiscalLineForm => ({
  type: "IIBB_PERCEPTION",
  jurisdiction: "",
  baseAmount: "",
  rate: "",
  amount: "",
  manualAmountOverride: false,
  note: "",
});

const PURCHASE_FISCAL_LINE_OPTIONS: Array<{
  value: PurchaseFiscalLineType;
  label: string;
}> = [
  { value: "IIBB_PERCEPTION", label: "Percepcion IIBB" },
  { value: "VAT_PERCEPTION", label: "Percepcion IVA" },
  { value: "INCOME_TAX_PERCEPTION", label: "Percepcion Ganancias" },
  { value: "MUNICIPAL_PERCEPTION", label: "Percepcion municipal" },
  { value: "INTERNAL_TAX", label: "Impuesto interno" },
  { value: "OTHER", label: "Otro" },
];

const parsePositiveNumber = (value: string) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
};

const parseOptionalNumber = (value: string) => {
  if (!value.trim()) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return parsed;
};

const normalizeMoneyNumber = (value: unknown) => {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  if (value < 0) return null;
  return Math.round((value + Number.EPSILON) * 100) / 100;
};

const mapArcaTributeTypeFromText = (
  description: string | null | undefined,
): PurchaseFiscalLineType => {
  const normalized = normalizeArcaText(description ?? "");
  if (!normalized) return "OTHER";
  if (normalized.includes("iibb") || normalized.includes("ingresos brutos")) {
    return "IIBB_PERCEPTION";
  }
  if (normalized.includes("iva")) {
    return "VAT_PERCEPTION";
  }
  if (normalized.includes("ganancia")) {
    return "INCOME_TAX_PERCEPTION";
  }
  if (normalized.includes("municip")) {
    return "MUNICIPAL_PERCEPTION";
  }
  if (normalized.includes("interno")) {
    return "INTERNAL_TAX";
  }
  return "OTHER";
};

const mapArcaTributesToFiscalLines = (
  tributes: PurchaseArcaVoucherSnapshot["tributes"] | null | undefined,
) => {
  if (!tributes?.length) return [] as PurchaseFiscalLineForm[];
  return tributes
    .map((tribute): PurchaseFiscalLineForm | null => {
      const amount = normalizeMoneyNumber(tribute.amount);
      if (amount === null || amount <= 0) return null;

      const description = tribute.description?.trim() || "";
      return {
        type: mapArcaTributeTypeFromText(description || null),
        jurisdiction: "",
        baseAmount:
          typeof tribute.baseAmount === "number" &&
          Number.isFinite(tribute.baseAmount) &&
          tribute.baseAmount >= 0
            ? tribute.baseAmount.toFixed(2)
            : "",
        rate:
          typeof tribute.rate === "number" &&
          Number.isFinite(tribute.rate) &&
          tribute.rate >= 0
            ? tribute.rate.toFixed(4)
            : "",
        amount: amount.toFixed(2),
        manualAmountOverride: true,
        note: description,
      };
    })
    .filter((line): line is PurchaseFiscalLineForm => Boolean(line));
};

const normalizeTaxId = (value: string) => value.replace(/\D/g, "");

let jsQrDecoderPromise: Promise<typeof import("jsqr")> | null = null;

const decodeQrValueFromPixels = async (
  data: Uint8ClampedArray,
  width: number,
  height: number,
) => {
  if (!jsQrDecoderPromise) {
    jsQrDecoderPromise = import("jsqr");
  }

  const { default: jsQr } = await jsQrDecoderPromise;
  const decoded = jsQr(data, width, height, {
    inversionAttempts: "attemptBoth",
  });
  const rawValue = decoded?.data?.trim();
  return rawValue ? rawValue : null;
};

const toDateInputValue = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const formatDateInputLabel = (value: string) => {
  const [year, month, day] = value.split("-");
  if (!year || !month || !day) return value;
  return `${day}/${month}/${year}`;
};

const toCalendarDateInput = (value: string | null | undefined) => {
  if (!value) return "";
  const trimmed = value.trim();
  const normalized = trimmed.replace(/\//g, "-");
  const dashedMatch = normalized.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (dashedMatch) {
    return `${dashedMatch[1]}-${dashedMatch[2]}-${dashedMatch[3]}`;
  }
  const compactMatch = normalized.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (compactMatch) {
    return `${compactMatch[1]}-${compactMatch[2]}-${compactMatch[3]}`;
  }
  return "";
};

const formatCalendarDate = (value: string | null | undefined) => {
  const normalized = toCalendarDateInput(value);
  if (!normalized) return "-";
  return formatDateInputLabel(normalized);
};

const formatTimestampDate = (value: string | null | undefined) => {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleDateString("es-AR");
};

const toCalendarDateTimestamp = (value: string | null | undefined) => {
  const normalized = toCalendarDateInput(value);
  if (!normalized) return Number.NaN;
  const [year, month, day] = normalized.split("-").map(Number);
  if (!year || !month || !day) return Number.NaN;
  return new Date(year, month - 1, day, 12, 0, 0, 0).getTime();
};

const inferPurchasePaymentMode = (purchase: PurchaseRow): PurchasePaymentMode => {
  if (purchase.impactsAccount) return "CURRENT_ACCOUNT";
  if (purchase.immediatePaymentMethodName?.trim()) return "IMMEDIATE_CASH_OUT";
  return "OFF_BOOK";
};

const getPurchasePaymentStatus = (purchase: PurchaseRow) => {
  if (purchase.impactsAccount) {
    const normalizedPaymentStatus = purchase.paymentStatus?.toUpperCase();
    const paymentMethodLabel = purchase.immediatePaymentMethodName?.trim();
    if (normalizedPaymentStatus === "PAID") {
      return {
        label: paymentMethodLabel || "Pagada",
        tone: "immediate" as const,
      };
    }
    if (normalizedPaymentStatus === "PARTIAL") {
      return {
        label: paymentMethodLabel
          ? `${paymentMethodLabel} (Parcial)`
          : "Cta. Cte (Parcial)",
        tone: "current-account" as const,
      };
    }
    if (paymentMethodLabel) {
      return {
        label: `${paymentMethodLabel} (Parcial)`,
        tone: "current-account" as const,
      };
    }
    return {
      label: "Cta. Cte",
      tone: "current-account" as const,
    };
  }

  const immediatePaymentMethod = purchase.immediatePaymentMethodName?.trim();
  if (immediatePaymentMethod) {
    return {
      label: immediatePaymentMethod,
      tone: "immediate" as const,
    };
  }

  const normalizedPaymentStatus = purchase.paymentStatus?.toUpperCase();
  const paidTotal = Number(purchase.paidTotal ?? 0);
  const pendingBalance = Number(purchase.balance ?? 0);
  const hasNoPendingBalance = Number.isFinite(pendingBalance)
    ? pendingBalance <= 0.005
    : false;
  const hasPaidAmount = Number.isFinite(paidTotal) ? paidTotal > 0.005 : false;
  if (
    normalizedPaymentStatus === "PAID" ||
    (hasNoPendingBalance && hasPaidAmount)
  ) {
    return {
      label: "Sin impacto",
      tone: "none" as const,
    };
  }

  return {
    label: "No",
    tone: "none" as const,
  };
};

const formatPurchaseDateLabel = (purchase: PurchaseRow) =>
  purchase.invoiceDate
    ? formatCalendarDate(purchase.invoiceDate)
    : formatTimestampDate(purchase.createdAt);

const normalizeArcaText = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

const collectArcaMessages = (value: unknown, depth = 0): string[] => {
  if (depth > 6 || value === null || value === undefined) return [];
  if (Array.isArray(value)) {
    return value.flatMap((item) => collectArcaMessages(item, depth + 1));
  }
  if (typeof value !== "object") {
    if (typeof value === "string" && value.trim()) return [value.trim()];
    return [];
  }
  const record = value as Record<string, unknown>;
  const messages: string[] = [];
  for (const [key, raw] of Object.entries(record)) {
    const normalized = normalizeArcaText(key);
    if (
      normalized.includes("msg") ||
      normalized.includes("observ") ||
      normalized.includes("error") ||
      normalized.includes("descripcion")
    ) {
      if (typeof raw === "string" && raw.trim()) {
        messages.push(raw.trim());
      }
    }
    messages.push(...collectArcaMessages(raw, depth + 1));
  }
  return messages;
};

const buildArcaHints = (messages: string[]) => {
  const text = normalizeArcaText(messages.join(" "));
  const hints: string[] = [];
  if (text.includes("cuit")) {
    hints.push("Revisa el CUIT del proveedor y que coincida con el comprobante.");
  }
  if (text.includes("punto") || text.includes("ptovta") || text.includes("vta")) {
    hints.push("Verifica el punto de venta del comprobante.");
  }
  if (text.includes("fecha") || text.includes("cbtefch")) {
    hints.push("Confirma la fecha del comprobante.");
  }
  if (text.includes("importe") || text.includes("total") || text.includes("imptotal")) {
    hints.push("Corrobora que el total cargado sea igual al del comprobante.");
  }
  if (text.includes("cae") || text.includes("codautorizacion")) {
    hints.push("Valida que el CAE esté completo y sin errores.");
  }
  if (text.includes("tipo") || text.includes("cbtetipo")) {
    hints.push("Revisa el tipo de comprobante (A/B/C).");
  }
  if (text.includes("numero") || text.includes("cbtenro")) {
    hints.push("Verifica el número de comprobante.");
  }
  return Array.from(new Set(hints));
};

const ARCA_DETAIL_LABELS: Array<{ includes: string[]; label: string }> = [
  { includes: ["cae", "caea", "codautorizacion"], label: "Código CAE/CAEA" },
  { includes: ["cbtemodo", "modo"], label: "Modo de comprobante" },
  { includes: ["cbtetipo"], label: "Tipo de comprobante" },
  { includes: ["ptovta", "puntoventa"], label: "Punto de venta" },
  { includes: ["cbtenro", "numerocomprobante"], label: "Número de comprobante" },
  { includes: ["cbtefch"], label: "Fecha del comprobante" },
  { includes: ["imptotal"], label: "Importe total" },
  { includes: ["impneto"], label: "Neto gravado" },
  { includes: ["imptotconc"], label: "No gravado" },
  { includes: ["impopex"], label: "Exento" },
  { includes: ["impiva"], label: "IVA" },
  { includes: ["imptrib"], label: "Otros tributos" },
  { includes: ["tributo", "tributos"], label: "Tributos ARCA" },
  { includes: ["cuitemisor", "issuertaxid"], label: "CUIT emisor" },
  {
    includes: ["doctiporeceptor", "tipodocreceptor"],
    label: "Tipo de documento receptor",
  },
  {
    includes: ["docnroreceptor", "nrodocreceptor"],
    label: "Documento receptor",
  },
  { includes: ["resultado"], label: "Resultado" },
  { includes: ["observacion", "observaciones"], label: "Observación ARCA" },
  { includes: ["descripcion", "detalle"], label: "Detalle ARCA" },
];

const resolveArcaDetailLabel = (normalizedKey: string) => {
  const match = ARCA_DETAIL_LABELS.find((item) =>
    item.includes.some((candidate) => normalizedKey.includes(candidate)),
  );
  return match?.label ?? null;
};

const formatArcaReceiverDocTypeLabel = (value: unknown) => {
  const numeric =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : Number.NaN;
  if (!Number.isFinite(numeric)) return String(value ?? "-");
  const labels: Record<number, string> = {
    80: "CUIT",
    86: "CUIL",
    87: "CDI",
    89: "LE",
    90: "LC",
    94: "Pasaporte",
    96: "DNI",
    99: "Consumidor final",
  };
  const label = labels[numeric];
  return label ? `${label} (${numeric})` : `Tipo ${numeric}`;
};

const formatArcaAuthorizationModeLabel = (value: unknown) => {
  const mode = String(value ?? "").trim().toUpperCase();
  if (!mode) return "-";
  if (mode === "CAE" || mode === "E") return "CAE";
  if (mode === "CAEA" || mode === "A") return "CAEA";
  return mode;
};

const formatArcaDetailValue = (label: string, rawValue: unknown) => {
  if (rawValue === null || rawValue === undefined) return null;
  if (label === "Tipo de comprobante") {
    return formatArcaVoucherTypeLabel(rawValue);
  }
  if (label === "Tipo de documento receptor") {
    return formatArcaReceiverDocTypeLabel(rawValue);
  }
  if (label === "Modo de comprobante") {
    return formatArcaAuthorizationModeLabel(rawValue);
  }
  if (label === "Importe total") {
    return formatArcaRequestAmount(rawValue);
  }
  if (label === "Fecha del comprobante") {
    return formatArcaRequestDate(rawValue);
  }
  if (typeof rawValue === "string") {
    const trimmed = rawValue.trim();
    if (!trimmed) return null;
    const dateMatch = /^(\d{4})(\d{2})(\d{2})$/.exec(trimmed);
    if (dateMatch) {
      return `${dateMatch[3]}/${dateMatch[2]}/${dateMatch[1]}`;
    }
    return trimmed;
  }
  if (typeof rawValue === "number" || typeof rawValue === "bigint") {
    return String(rawValue);
  }
  return null;
};

const collectArcaFriendlyDetails = (
  value: unknown,
  depth = 0,
): Array<{ label: string; value: string }> => {
  if (depth > 6 || value === null || value === undefined) return [];
  if (Array.isArray(value)) {
    return value.flatMap((item) => collectArcaFriendlyDetails(item, depth + 1));
  }
  if (typeof value !== "object") return [];
  const record = value as Record<string, unknown>;
  const details: Array<{ label: string; value: string }> = [];
  for (const [key, raw] of Object.entries(record)) {
    const normalizedKey = normalizeArcaText(key).replace(/[^a-z0-9]/g, "");
    const detailLabel = resolveArcaDetailLabel(normalizedKey);
    const detailValue = detailLabel ? formatArcaDetailValue(detailLabel, raw) : null;
    if (detailLabel && detailValue) {
      details.push({ label: detailLabel, value: detailValue });
    }
    details.push(...collectArcaFriendlyDetails(raw, depth + 1));
  }
  return details;
};

const dedupeArcaFriendlyDetails = (
  details: Array<{ label: string; value: string }>,
) => {
  const unique = new Map<string, { label: string; value: string }>();
  for (const item of details) {
    const key = `${item.label}::${item.value}`;
    if (!unique.has(key)) {
      unique.set(key, item);
    }
  }
  return Array.from(unique.values());
};

const normalizeArcaDetailCompare = (value: string) =>
  normalizeArcaText(value)
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const isLowSignalArcaMessage = (value: string) => {
  const normalized = normalizeArcaDetailCompare(value);
  if (!normalized) return true;
  if (normalized.length <= 1) return true;
  if (/^\d{6,18}$/.test(normalized)) return true;
  if (/^(cae|caea|r|a|e)$/.test(normalized)) return true;
  const words = normalized.split(" ").filter(Boolean);
  return words.length === 1 && words[0].length <= 3;
};

const formatArcaVoucherTypeLabel = (value: unknown) => {
  const numeric =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : Number.NaN;
  if (!Number.isFinite(numeric)) return String(value ?? "-");
  if (numeric === 1) return "Factura A (1)";
  if (numeric === 6) return "Factura B (6)";
  if (numeric === 11) return "Factura C (11)";
  return `Tipo ${numeric}`;
};

const formatArcaRequestDate = (value: unknown) => {
  if (typeof value !== "string") return String(value ?? "-");
  const normalized = toCalendarDateInput(value);
  return normalized ? formatDateInputLabel(normalized) : value;
};

const formatArcaRequestAmount = (value: unknown) => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return formatCurrencyARS(value);
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return formatCurrencyARS(parsed);
    }
    return value;
  }
  return String(value ?? "-");
};

const normalizeCalendarDateForCompare = (value: string | null | undefined) => {
  if (!value) return null;
  const normalized = toCalendarDateInput(value);
  if (normalized) return normalized;
  const localMatch = value.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (localMatch) {
    return `${localMatch[3]}-${localMatch[2]}-${localMatch[1]}`;
  }
  return null;
};

const purchaseVoucherKindFromFiscalType = (
  voucherType: number | null | undefined,
): "A" | "B" | "C" => {
  if (voucherType === 1) return "A";
  if (voucherType === 6) return "B";
  if (voucherType === 11) return "C";
  return "B";
};

const extractPointOfSaleFromInvoiceNumber = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const withDash = /^(\d{1,5})-(\d{1,12})$/.exec(trimmed);
  return withDash?.[1] ? String(Number(withDash[1])) : "";
};

const isInvoiceNumberWithDashFormat = (value: string) =>
  /^(\d{1,5})-(\d{1,12})$/.test(value.trim());

const arcaStatusLabel = (value: string | null | undefined) => {
  const labels: Record<string, string> = {
    AUTHORIZED: "Autorizado",
    OBSERVED: "Observado",
    REJECTED: "Rechazado",
    ERROR: "Error",
    PENDING: "Pendiente",
  };
  return value ? labels[value] ?? value : "Pendiente";
};

const PURCHASE_PAYMENT_MODE_OPTIONS: Array<{
  value: PurchasePaymentMode;
  label: string;
  description: string;
}> = [
  {
    value: "CURRENT_ACCOUNT",
    label: "Cuenta corriente",
    description: "La compra queda pendiente para pagar luego.",
  },
  {
    value: "IMMEDIATE_CASH_OUT",
    label: "Pago inmediato",
    description: "Registra egreso ahora y no deja deuda.",
  },
  {
    value: "OFF_BOOK",
    label: "Sin impacto",
    description: "No impacta cuenta corriente ni egreso.",
  },
];

const PURCHASE_ITEM_TAX_RATE_OPTIONS = [
  { value: "21", label: "IVA 21%" },
  { value: "10.5", label: "IVA 10,5%" },
  { value: "27", label: "IVA 27%" },
  { value: "0", label: "Sin IVA" },
];

const SIMPLE_FISCAL_CONDITION_OPTIONS: Array<{
  value: SimpleFiscalCondition;
  label: string;
}> = [
  { value: "GRAVADO", label: "Gravado" },
  { value: "NO_GRAVADO", label: "No gravado" },
  { value: "EXENTO", label: "Exento" },
];

const roundMoney = (value: number) =>
  Math.round((value + Number.EPSILON) * 100) / 100;

const toMoneyValue = (value: number) => roundMoney(value).toFixed(2);

const paymentMethodRequiresAccount = (
  paymentMethodId: string,
  paymentMethods: PaymentMethodOption[],
) => {
  const method = paymentMethods.find(
    (candidate) => candidate.id === paymentMethodId,
  );
  return Boolean(method?.requiresAccount);
};

const resolveDefaultCashOutAccountId = (
  paymentMethodId: string,
  paymentMethods: PaymentMethodOption[],
  accounts: AccountOption[],
) => {
  const method = paymentMethods.find(
    (candidate) => candidate.id === paymentMethodId,
  );
  if (!method?.requiresAccount) return "";
  return (
    accounts.find((account) => account.currencyCode === "ARS")?.id ??
    accounts[0]?.id ??
    ""
  );
};

const buildCashOutLine = (
  paymentMethods: PaymentMethodOption[],
  accounts: AccountOption[],
  amount?: string,
): CashOutLineForm => {
  const methodId = paymentMethods[0]?.id ?? "";
  return {
    paymentMethodId: methodId,
    accountId: resolveDefaultCashOutAccountId(methodId, paymentMethods, accounts),
    amount: amount ?? "",
  };
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
          checked
            ? "border-sky-300 bg-sky-100"
            : "border-zinc-300 bg-zinc-100"
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

function PurchaseSection({
  title,
  summary,
  open,
  error = false,
  className = "",
  onToggle,
  children,
}: {
  title: string;
  summary: string;
  open: boolean;
  error?: boolean;
  className?: string;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <section
      className={`overflow-visible rounded-2xl border bg-white transition-[border-color,border-style,box-shadow] ${className} ${
        error
          ? "border-solid border-rose-300"
          : open
            ? "border-solid border-sky-300"
            : "border-dashed border-sky-300"
      }`}
    >
      <button
        type="button"
        className="flex w-full flex-col gap-2 px-4 py-3 text-left sm:flex-row sm:items-center sm:justify-between"
        onClick={onToggle}
        aria-expanded={open}
      >
        <div>
          <h3 className="text-sm font-semibold text-zinc-900">{title}</h3>
          <p className="mt-0.5 text-xs text-zinc-500">{summary}</p>
        </div>
        <ChevronDownIcon
          className={`size-4 shrink-0 text-zinc-500 transition-transform ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>
      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            key="purchase-section-content"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="-mx-1 -mb-1 overflow-visible px-1 pb-1"
          >
            <div className="border-t border-zinc-200/70 px-4 pb-4 pt-4">
              {children}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </section>
  );
}

function InlineDataNotice({
  tone = "amber",
  title,
  message,
  children,
}: {
  tone?: "amber" | "rose" | "zinc";
  title: string;
  message: string;
  children?: ReactNode;
}) {
  const toneClass =
    tone === "rose"
      ? "border-rose-200 text-rose-800"
      : tone === "zinc"
        ? "border-zinc-200 text-zinc-700"
        : "border-amber-200 text-amber-800";

  return (
    <div className={`rounded-xl border bg-white px-3 py-2 ${toneClass}`}>
      <div className="flex items-start gap-2">
        <ExclamationTriangleIcon className="mt-0.5 size-3.5 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-wide">
            {title}
          </p>
          <p className="mt-0.5 text-xs leading-relaxed text-zinc-600">
            {message}
          </p>
          {children ? <div className="mt-2">{children}</div> : null}
        </div>
      </div>
    </div>
  );
}

export default function PurchasesPage() {
  const [supplierMatches, setSupplierMatches] = useState<SupplierOption[]>([]);
  const [productMatchesByQuery, setProductMatchesByQuery] = useState<
    Record<string, ProductOption[]>
  >({});
  const [selectedProductsById, setSelectedProductsById] = useState<
    Record<string, ProductOption>
  >({});
  const [isSupplierMatchesLoading, setIsSupplierMatchesLoading] = useState(false);
  const [isProductMatchesLoading, setIsProductMatchesLoading] = useState(false);
  const [purchases, setPurchases] = useState<PurchaseRow[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodOption[]>(
    [],
  );
  const [accounts, setAccounts] = useState<AccountOption[]>([]);

  const [supplierSearch, setSupplierSearch] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [selectedSupplier, setSelectedSupplier] =
    useState<SupplierOption | null>(null);
  const [selectedSupplierTaxId, setSelectedSupplierTaxId] = useState("");
  const [supplierDataStatus, setSupplierDataStatus] = useState<string | null>(
    null,
  );
  const [isUpdatingSelectedSupplier, setIsUpdatingSelectedSupplier] =
    useState(false);
  const [isVerifyingSelectedSupplier, setIsVerifyingSelectedSupplier] =
    useState(false);
  const [isSupplierOpen, setIsSupplierOpen] = useState(false);
  const [supplierActiveIndex, setSupplierActiveIndex] = useState(0);

  const [hasInvoice, setHasInvoice] = useState(false);
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(() => toDateInputValue(new Date()));
  const [isImportingQr, setIsImportingQr] = useState(false);
  const [simpleNetAmount, setSimpleNetAmount] = useState("");
  const [simpleFiscalCondition, setSimpleFiscalCondition] =
    useState<SimpleFiscalCondition>("GRAVADO");
  const [purchaseVatAmount, setPurchaseVatAmount] = useState("");
  const [globalDiscountAmount, setGlobalDiscountAmount] = useState("");
  const [totalsSource, setTotalsSource] =
    useState<PurchaseTotalsSource>("AUTO_FROM_PRODUCTS");
  const [showFiscalDetail, setShowFiscalDetail] = useState(false);
  const [netTaxedAmount, setNetTaxedAmount] = useState("");
  const [netNonTaxedAmount, setNetNonTaxedAmount] = useState("");
  const [exemptAmount, setExemptAmount] = useState("");
  const [fiscalLines, setFiscalLines] = useState<PurchaseFiscalLineForm[]>([]);
  const [paymentMode, setPaymentMode] = useState<PurchasePaymentMode>(
    "CURRENT_ACCOUNT",
  );

  const [includeProductDetails, setIncludeProductDetails] = useState(false);
  const [adjustStock, setAdjustStock] = useState(false);
  const [purchaseProducts, setPurchaseProducts] = useState<PurchaseProductForm[]>([
    emptyPurchaseProduct(),
  ]);
  const [openProductIndex, setOpenProductIndex] = useState<number | null>(null);
  const [productActiveIndex, setProductActiveIndex] = useState(0);
  const [openJurisdictionIndex, setOpenJurisdictionIndex] = useState<number | null>(
    null,
  );
  const [jurisdictionActiveIndex, setJurisdictionActiveIndex] = useState(0);
  const [creatingProductIndex, setCreatingProductIndex] = useState<
    number | null
  >(null);

  const [cashOutLines, setCashOutLines] = useState<CashOutLineForm[]>([]);

  const [arcaVoucherKind, setArcaVoucherKind] = useState<"A" | "B" | "C">(
    "B",
  );
  const [arcaAuthorizationCode, setArcaAuthorizationCode] = useState("");
  const [arcaValidationResult, setArcaValidationResult] = useState<{
    status: string;
    message: string;
    checkedAt: string;
    comprobante: PurchaseArcaVoucherSnapshot | null;
  } | null>(null);

  const now = new Date();
  const [reportFrom, setReportFrom] = useState(() =>
    toDateInputValue(new Date(now.getFullYear(), now.getMonth(), 1)),
  );
  const [reportTo, setReportTo] = useState(() =>
    toDateInputValue(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
  );

  const [purchaseView, setPurchaseView] = useState<"new" | "list">("new");
  const [editingPurchaseId, setEditingPurchaseId] = useState<string | null>(
    null,
  );
  const [isLoadingPurchaseEdit, setIsLoadingPurchaseEdit] = useState(false);
  const [openPurchaseSection, setOpenPurchaseSection] =
    useState<PurchaseSectionId>("supplier");
  const [pendingPurchase, setPendingPurchase] = useState<PreparedPurchase | null>(
    null,
  );
  const [query, setQuery] = useState("");
  const [sortOrder, setSortOrder] = useState<"newest" | "oldest">("newest");
  const [purchaseListMode, setPurchaseListMode] = useState<"general" | "finance">(
    "general",
  );
  const [status, setStatus] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isArcaValidating, setIsArcaValidating] = useState(false);
  const [revalidatingPurchaseId, setRevalidatingPurchaseId] = useState<
    string | null
  >(null);
  const [deletingPurchaseId, setDeletingPurchaseId] = useState<string | null>(
    null,
  );
  const [revalidationFeedback, setRevalidationFeedback] =
    useState<PurchaseArcaRevalidationFeedback | null>(null);
  const [editingInvoicePurchase, setEditingInvoicePurchase] =
    useState<PurchaseRow | null>(null);
  const [editingInvoiceNumber, setEditingInvoiceNumber] = useState("");
  const [editingInvoiceDate, setEditingInvoiceDate] = useState(() =>
    toDateInputValue(new Date()),
  );
  const [editingVoucherKind, setEditingVoucherKind] = useState<"A" | "B" | "C">(
    "B",
  );
  const [editingAuthorizationCode, setEditingAuthorizationCode] = useState("");
  const [isSavingInvoiceEdit, setIsSavingInvoiceEdit] = useState(false);
  const [revalidateAfterInvoiceEdit, setRevalidateAfterInvoiceEdit] =
    useState(false);
  const [editingPaymentPurchase, setEditingPaymentPurchase] =
    useState<PurchaseRow | null>(null);
  const [supplierGroupedPaymentPurchase, setSupplierGroupedPaymentPurchase] =
    useState<PurchaseRow | null>(null);
  const [detailPurchase, setDetailPurchase] = useState<PurchaseRow | null>(null);
  const [detailData, setDetailData] = useState<PurchaseEditResponse | null>(null);
  const [isLoadingDetailPurchase, setIsLoadingDetailPurchase] = useState(false);
  const [detailPurchaseError, setDetailPurchaseError] = useState<string | null>(
    null,
  );
  const [editingPaymentMode, setEditingPaymentMode] =
    useState<PurchasePaymentMode>("OFF_BOOK");
  const [editingPaidAt, setEditingPaidAt] = useState(() =>
    toDateInputValue(new Date()),
  );
  const [editingCashOutLines, setEditingCashOutLines] = useState<
    CashOutLineForm[]
  >([]);
  const [isUpdatingPaymentMode, setIsUpdatingPaymentMode] = useState(false);
  const [isQrScannerOpen, setIsQrScannerOpen] = useState(false);
  const [isQrScannerActive, setIsQrScannerActive] = useState(false);
  const [qrScannerError, setQrScannerError] = useState<string | null>(null);
  const [qrVideoDevices, setQrVideoDevices] = useState<
    Array<{ id: string; label: string }>
  >([]);
  const [qrSelectedDeviceId, setQrSelectedDeviceId] = useState("");
  const [isImportingQrFromImage, setIsImportingQrFromImage] = useState(false);
  const [isPortalReady, setIsPortalReady] = useState(false);
  const [highlightedFields, setHighlightedFields] = useState<
    Partial<Record<PurchaseArcaMismatchField | "totals.vatAmount" | "totals.netTaxed", true>>
  >({});
  const [highlightedSection, setHighlightedSection] =
    useState<PurchaseSectionId | null>(null);
  const supplierMatchesCacheRef = useRef<Map<string, SupplierOption[]>>(
    new Map(),
  );
  const productMatchesCacheRef = useRef<Map<string, ProductOption[]>>(
    new Map(),
  );
  const fieldHighlightTimeoutRef = useRef<number | null>(null);
  const sectionHighlightTimeoutRef = useRef<number | null>(null);
  const qrVideoRef = useRef<HTMLVideoElement | null>(null);
  const qrImageInputRef = useRef<HTMLInputElement | null>(null);
  const qrStreamRef = useRef<MediaStream | null>(null);
  const qrScannerIntervalRef = useRef<number | null>(null);
  const qrScannerBusyRef = useRef(false);
  const detailRequestRef = useRef(0);
  const importQrTextHandlerRef = useRef<(qrText: string) => Promise<void>>(
    async () => undefined,
  );

  const productMap = useMemo(
    () => new Map(Object.values(selectedProductsById).map((product) => [product.id, product])),
    [selectedProductsById],
  );

  const getProductMatches = (value: string) => {
    const normalized = normalizeQuery(value);
    return productMatchesByQuery[normalized] ?? [];
  };
  const getJurisdictionMatches = (value: string) =>
    suggestJurisdictions(value, 8);

  const arcaEnabled = hasInvoice;
  const isInternalRecord = !hasInvoice;
  const impactCurrentAccount = paymentMode === "CURRENT_ACCOUNT";
  const registerCashOut = paymentMode === "IMMEDIATE_CASH_OUT";
  const paymentModeLabel =
    PURCHASE_PAYMENT_MODE_OPTIONS.find((option) => option.value === paymentMode)
      ?.label ?? "Sin impacto";
  const inferredPointOfSale = extractPointOfSaleFromInvoiceNumber(invoiceNumber);
  const hasInvoiceNumberDashFormat = isInvoiceNumberWithDashFormat(invoiceNumber);
  const invoiceFormatWarning =
    hasInvoice && invoiceNumber.trim() && !hasInvoiceNumberDashFormat
      ? "Formato requerido: 0001-00001234 (con guion)."
      : null;

  const renderModalPortal = (content: ReactNode) => {
    if (!isPortalReady) return null;
    return createPortal(content, document.body);
  };

  const highlightFields = (
    fields: Array<PurchaseArcaMismatchField | "totals.vatAmount" | "totals.netTaxed">,
  ) => {
    if (!fields.length) return;
    setHighlightedFields(
      fields.reduce(
        (accumulator, field) => ({ ...accumulator, [field]: true }),
        {} as Partial<
          Record<
            PurchaseArcaMismatchField | "totals.vatAmount" | "totals.netTaxed",
            true
          >
        >,
      ),
    );
    if (fieldHighlightTimeoutRef.current) {
      window.clearTimeout(fieldHighlightTimeoutRef.current);
    }
    fieldHighlightTimeoutRef.current = window.setTimeout(() => {
      setHighlightedFields({});
      fieldHighlightTimeoutRef.current = null;
    }, 3200);
  };

  const highlightSection = (section: PurchaseSectionId) => {
    setHighlightedSection(section);
    if (sectionHighlightTimeoutRef.current) {
      window.clearTimeout(sectionHighlightTimeoutRef.current);
    }
    sectionHighlightTimeoutRef.current = window.setTimeout(() => {
      setHighlightedSection(null);
      sectionHighlightTimeoutRef.current = null;
    }, 3200);
  };

  const getHighlightClass = (
    field: PurchaseArcaMismatchField | "totals.vatAmount" | "totals.netTaxed",
  ) =>
    highlightedFields[field]
      ? "border-rose-400 ring-2 ring-rose-200 focus-visible:ring-rose-300/60"
      : "";

  const loadPurchases = async () => {
    const res = await fetch("/api/purchases", { cache: "no-store" });
    if (res.ok) {
      const data = (await res.json()) as PurchaseRow[];
      setPurchases(data);
    }
  };

  const loadFinance = async () => {
    const [methodsRes, accountsRes] =
      await Promise.all([
        fetch("/api/payment-methods", { cache: "no-store" }),
        fetch("/api/accounts", { cache: "no-store" }),
      ]);

    if (methodsRes.ok) {
      const data = (await methodsRes.json()) as PaymentMethodOption[];
      setPaymentMethods(data.filter((method) => method.isActive !== false));
    }
    if (accountsRes.ok) {
      const data = (await accountsRes.json()) as AccountOption[];
      setAccounts(data.filter((account) => account.isActive !== false));
    }
  };

  const stopQrScanner = () => {
    if (qrScannerIntervalRef.current) {
      window.clearInterval(qrScannerIntervalRef.current);
      qrScannerIntervalRef.current = null;
    }
    if (qrStreamRef.current) {
      qrStreamRef.current.getTracks().forEach((track) => track.stop());
      qrStreamRef.current = null;
    }
    if (qrVideoRef.current) {
      qrVideoRef.current.srcObject = null;
    }
    qrScannerBusyRef.current = false;
    setIsQrScannerActive(false);
  };

  useEffect(() => {
    loadPurchases().catch(() => undefined);
    loadFinance().catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!paymentMethods.length) return;
    setCashOutLines((prev) => {
      if (prev.length) return prev;
      return [buildCashOutLine(paymentMethods, accounts)];
    });
  }, [paymentMethods, accounts]);

  useEffect(() => {
    if (hasInvoice) return;
    setShowFiscalDetail(false);
    setFiscalLines([]);
  }, [hasInvoice]);

  useEffect(() => {
    setIsPortalReady(true);
  }, []);

  useEffect(() => {
    return () => {
      if (fieldHighlightTimeoutRef.current) {
        window.clearTimeout(fieldHighlightTimeoutRef.current);
      }
      if (sectionHighlightTimeoutRef.current) {
        window.clearTimeout(sectionHighlightTimeoutRef.current);
      }
      stopQrScanner();
    };
  }, []);

  useEffect(() => {
    if (!isQrScannerOpen) {
      stopQrScanner();
      return;
    }

    const start = async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          setQrScannerError(
            "Este dispositivo no permite abrir camara para escanear QR.",
          );
          return;
        }

        setQrScannerError(null);
        const videoConstraint: MediaTrackConstraints = qrSelectedDeviceId
          ? { deviceId: { exact: qrSelectedDeviceId } }
          : { facingMode: { ideal: "environment" } };
        const stream = await navigator.mediaDevices.getUserMedia({
          video: videoConstraint,
          audio: false,
        });
        qrStreamRef.current = stream;

        const video = qrVideoRef.current;
        if (!video) {
          stopQrScanner();
          return;
        }

        video.srcObject = stream;
        await video.play();

        if (navigator.mediaDevices?.enumerateDevices) {
          const devices = await navigator.mediaDevices.enumerateDevices();
          const nextVideoDevices = devices
            .filter((device) => device.kind === "videoinput")
            .map((device, index) => ({
              id: device.deviceId,
              label: device.label || `Camara ${index + 1}`,
            }));
          setQrVideoDevices(nextVideoDevices);
          if (!qrSelectedDeviceId && nextVideoDevices.length > 0) {
            const preferred =
              nextVideoDevices.find((device) =>
                /(back|rear|environment|trasera|posterior)/i.test(device.label),
              ) ?? nextVideoDevices[0];
            if (preferred) {
              setQrSelectedDeviceId(preferred.id);
            }
          }
        }

        const detectorCtor = (
          window as Window & {
            BarcodeDetector?: new (options?: {
              formats?: string[];
            }) => {
              detect: (source: ImageBitmapSource) => Promise<
                Array<{ rawValue?: string | null }>
              >;
            };
          }
        ).BarcodeDetector;

        let detectQrFrame: () => Promise<string | null>;
        if (detectorCtor) {
          const detector = new detectorCtor({ formats: ["qr_code"] });
          detectQrFrame = async () => {
            const scannerVideo = qrVideoRef.current;
            if (!scannerVideo) return null;
            const codes = await detector.detect(scannerVideo);
            const rawValue = codes.find(
              (candidate) =>
                typeof candidate.rawValue === "string" &&
                candidate.rawValue.trim().length > 0,
            )?.rawValue;
            return typeof rawValue === "string" ? rawValue.trim() : null;
          };
        } else {
          const frameCanvas = document.createElement("canvas");
          const frameContext = frameCanvas.getContext("2d", {
            willReadFrequently: true,
          });
          if (!frameContext) {
            setQrScannerError(
              "No se pudo inicializar el lector QR en este dispositivo.",
            );
            return;
          }
          detectQrFrame = async () => {
            const scannerVideo = qrVideoRef.current;
            if (!scannerVideo) return null;
            const width = scannerVideo.videoWidth;
            const height = scannerVideo.videoHeight;
            if (!width || !height) return null;
            if (frameCanvas.width !== width || frameCanvas.height !== height) {
              frameCanvas.width = width;
              frameCanvas.height = height;
            }
            frameContext.drawImage(scannerVideo, 0, 0, width, height);
            const imageData = frameContext.getImageData(0, 0, width, height);
            return decodeQrValueFromPixels(imageData.data, width, height);
          };
        }

        setIsQrScannerActive(true);
        qrScannerIntervalRef.current = window.setInterval(async () => {
          if (!isQrScannerOpen || qrScannerBusyRef.current || !qrVideoRef.current) {
            return;
          }
          if (qrVideoRef.current.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
            return;
          }
          qrScannerBusyRef.current = true;
          try {
            const rawValue = await detectQrFrame();
            if (!rawValue) return;
            setIsQrScannerOpen(false);
            stopQrScanner();
            await importQrTextHandlerRef.current(rawValue);
          } catch {
            // Keep scanner alive until a valid frame is detected or user closes.
          } finally {
            qrScannerBusyRef.current = false;
          }
        }, 360);
      } catch (error) {
        if (qrSelectedDeviceId) {
          setQrSelectedDeviceId("");
          setQrScannerError("No se pudo abrir esa camara. Probando otra...");
          return;
        }
        if (error instanceof DOMException && error.name === "NotAllowedError") {
          setQrScannerError(
            "Permite el acceso a camara en el navegador para escanear QR.",
          );
          return;
        }
        setQrScannerError("No se pudo abrir la camara.");
      }
    };

    start().catch(() => {
      setQrScannerError("No se pudo iniciar el scanner.");
    });

    return () => {
      stopQrScanner();
    };
  }, [isQrScannerOpen, qrSelectedDeviceId]);

  useEffect(() => {
    if (!isSupplierOpen) return;
    const normalized = normalizeQuery(supplierSearch);
    const timeoutId = window.setTimeout(async () => {
      if (supplierMatchesCacheRef.current.has(normalized)) {
        setSupplierMatches(supplierMatchesCacheRef.current.get(normalized) ?? []);
        return;
      }

      setIsSupplierMatchesLoading(true);
      try {
        const params = new URLSearchParams();
        params.set("limit", "8");
        params.set("offset", "0");
        params.set("sort", "az");
        if (normalized) {
          params.set("q", normalized);
        }
        const res = await fetch(`/api/suppliers?${params.toString()}`, {
          cache: "no-store",
        });
        if (!res.ok) return;
        const data = (await res.json()) as {
          items: SupplierOption[];
        };
        supplierMatchesCacheRef.current.set(normalized, data.items);
        setSupplierMatches(data.items);
      } finally {
        setIsSupplierMatchesLoading(false);
      }
    }, 250);

    return () => window.clearTimeout(timeoutId);
  }, [isSupplierOpen, supplierSearch]);

  useEffect(() => {
    if (openProductIndex === null) return;
    const normalized = normalizeQuery(
      purchaseProducts[openProductIndex]?.productSearch ?? "",
    );
    const timeoutId = window.setTimeout(async () => {
      if (productMatchesCacheRef.current.has(normalized)) {
        const cached = productMatchesCacheRef.current.get(normalized) ?? [];
        setProductMatchesByQuery((previous) =>
          previous[normalized] ? previous : { ...previous, [normalized]: cached },
        );
        return;
      }

      setIsProductMatchesLoading(true);
      try {
        const params = new URLSearchParams();
        params.set("limit", "8");
        params.set("offset", "0");
        params.set("sort", "az");
        if (normalized) {
          params.set("q", normalized);
        }
        const res = await fetch(`/api/products?${params.toString()}`, {
          cache: "no-store",
        });
        if (!res.ok) return;
        const data = (await res.json()) as {
          items: ProductOption[];
        };
        productMatchesCacheRef.current.set(normalized, data.items);
        setProductMatchesByQuery((previous) => ({
          ...previous,
          [normalized]: data.items,
        }));
      } finally {
        setIsProductMatchesLoading(false);
      }
    }, 250);

    return () => window.clearTimeout(timeoutId);
  }, [openProductIndex, purchaseProducts]);

  const handleSupplierSearchChange = (value: string) => {
    setSupplierSearch(value);
    setSupplierId("");
    setSelectedSupplier(null);
    setSelectedSupplierTaxId("");
    setSupplierDataStatus(null);
    setIsSupplierOpen(true);
    setSupplierActiveIndex(0);
  };

  const handleSupplierSelect = (supplier: SupplierOption) => {
    setSupplierId(supplier.id);
    setSelectedSupplier(supplier);
    setSelectedSupplierTaxId(normalizeTaxId(supplier.taxId ?? ""));
    setSupplierDataStatus(null);
    setSupplierSearch(formatSupplierLabel(supplier));
    setIsSupplierOpen(false);
  };

  const handleSupplierKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (!supplierMatches.length) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!isSupplierOpen) {
        setIsSupplierOpen(true);
        setSupplierActiveIndex(0);
        return;
      }
      setSupplierActiveIndex((prev) =>
        Math.min(prev + 1, supplierMatches.length - 1),
      );
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (!isSupplierOpen) {
        setIsSupplierOpen(true);
        setSupplierActiveIndex(supplierMatches.length - 1);
        return;
      }
      setSupplierActiveIndex((prev) => Math.max(prev - 1, 0));
    }

    if (event.key === "Enter") {
      if (!isSupplierOpen) return;
      event.preventDefault();
      const candidate = supplierMatches[supplierActiveIndex];
      if (candidate) {
        handleSupplierSelect(candidate);
      }
    }

    if (event.key === "Escape") {
      setIsSupplierOpen(false);
    }
  };

  const mergeSupplier = (supplier: SupplierOption) => {
    setSelectedSupplier(supplier);
    setSupplierSearch(formatSupplierLabel(supplier));
    setSupplierMatches((previous) => {
      const byId = new Map(previous.map((item) => [item.id, item]));
      byId.set(supplier.id, supplier);
      return Array.from(byId.values());
    });
    supplierMatchesCacheRef.current.clear();
  };

  const updateSelectedSupplier = async (patch: {
    taxId?: string;
    legalName?: string | null;
    address?: string | null;
  }) => {
    if (!selectedSupplier) return null;

    setSupplierDataStatus(null);
    setIsUpdatingSelectedSupplier(true);
    try {
      const res = await fetch("/api/suppliers", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: selectedSupplier.id,
          displayName: selectedSupplier.displayName,
          legalName:
            patch.legalName !== undefined
              ? patch.legalName || undefined
              : selectedSupplier.legalName ?? undefined,
          taxId:
            patch.taxId !== undefined
              ? normalizeTaxId(patch.taxId) || undefined
              : selectedSupplier.taxId ?? undefined,
          email: selectedSupplier.email ?? undefined,
          phone: selectedSupplier.phone ?? undefined,
          address:
            patch.address !== undefined
              ? patch.address || undefined
              : selectedSupplier.address ?? undefined,
        }),
      });
      const data = (await res.json()) as SupplierOption | { error?: string };
      if (!res.ok) {
        const errorMessage =
          typeof data === "object" &&
          data !== null &&
          "error" in data &&
          typeof data.error === "string"
            ? data.error
            : "No se pudo actualizar proveedor";
        setSupplierDataStatus(errorMessage);
        return null;
      }

      const updatedSupplier = data as SupplierOption;
      mergeSupplier(updatedSupplier);
      setSelectedSupplierTaxId(normalizeTaxId(updatedSupplier.taxId ?? ""));
      setSupplierDataStatus("Proveedor actualizado.");
      return updatedSupplier;
    } catch {
      setSupplierDataStatus("No se pudo actualizar proveedor");
      return null;
    } finally {
      setIsUpdatingSelectedSupplier(false);
    }
  };

  const handleSaveSelectedSupplierTaxId = async () => {
    await updateSelectedSupplier({ taxId: selectedSupplierTaxId });
  };

  const handleLookupAndSaveSelectedSupplier = async () => {
    if (!selectedSupplier) return;
    const taxId = normalizeTaxId(selectedSupplierTaxId);
    if (!taxId) {
      setSupplierDataStatus("Ingresa un CUIT para buscar.");
      return;
    }

    setSupplierDataStatus(null);
    setIsUpdatingSelectedSupplier(true);
    try {
      const res = await fetch("/api/arca/taxpayer-lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taxId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSupplierDataStatus(data?.error ?? "No se pudo consultar ARCA");
        return;
      }

      const taxpayer = data?.taxpayer;
      const legalName =
        typeof taxpayer?.legalName === "string"
          ? taxpayer.legalName
          : typeof taxpayer?.displayName === "string"
            ? taxpayer.displayName
            : null;
      const address =
        typeof taxpayer?.address === "string" ? taxpayer.address : null;

      const updatedSupplier = await updateSelectedSupplier({
        taxId,
        legalName: legalName ?? selectedSupplier.legalName ?? null,
        address: address ?? selectedSupplier.address ?? null,
      });
      if (updatedSupplier) {
        const source =
          typeof data?.source === "string" ? ` (${data.source})` : "";
        setSupplierDataStatus(`Datos ARCA actualizados${source}.`);
      }
    } catch {
      setSupplierDataStatus("No se pudo consultar ARCA");
    } finally {
      setIsUpdatingSelectedSupplier(false);
    }
  };

  const handleVerifySelectedSupplier = async () => {
    if (!selectedSupplier) return;
    if (!normalizeTaxId(selectedSupplier.taxId ?? selectedSupplierTaxId)) {
      setSupplierDataStatus("Carga CUIT antes de verificar.");
      return;
    }

    setSupplierDataStatus(null);
    setIsVerifyingSelectedSupplier(true);
    try {
      const res = await fetch("/api/suppliers/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplierId: selectedSupplier.id,
          taxId: normalizeTaxId(selectedSupplierTaxId) || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSupplierDataStatus(data?.error ?? "No se pudo verificar");
        return;
      }

      const updatedSupplier: SupplierOption = {
        ...selectedSupplier,
        taxId: typeof data?.taxId === "string" ? data.taxId : selectedSupplier.taxId,
        arcaVerificationStatus:
          typeof data?.status === "string"
            ? data.status
            : selectedSupplier.arcaVerificationStatus,
        arcaVerificationCheckedAt:
          typeof data?.checkedAt === "string"
            ? data.checkedAt
            : selectedSupplier.arcaVerificationCheckedAt,
        arcaVerificationMessage:
          typeof data?.message === "string"
            ? data.message
            : selectedSupplier.arcaVerificationMessage,
      };
      mergeSupplier(updatedSupplier);
      setSelectedSupplierTaxId(normalizeTaxId(updatedSupplier.taxId ?? ""));
      setSupplierDataStatus(`ARCA: ${data.status} - ${data.message}`);
    } catch {
      setSupplierDataStatus("No se pudo verificar");
    } finally {
      setIsVerifyingSelectedSupplier(false);
    }
  };

  const handlePurchaseProductChange = (
    index: number,
    field: keyof PurchaseProductForm,
    value: string,
  ) => {
    setPurchaseProducts((previous) => {
      const next = [...previous];
      const updated = { ...next[index], [field]: value };
      if (field === "productSearch") {
        updated.productId = "";
      }
      next[index] = updated;
      return next;
    });
  };

  const handleSelectPurchaseProduct = (index: number, product: ProductOption) => {
    setPurchaseProducts((previous) => {
      const next = [...previous];
      next[index] = {
        ...next[index],
        productId: product.id,
        productSearch: formatProductLabel(product),
        unitCost: next[index].unitCost || product.cost || "",
      };
      return next;
    });
    setSelectedProductsById((previous) => ({
      ...previous,
      [product.id]: product,
    }));
    setOpenProductIndex(null);
  };

  const handlePurchaseProductKeyDown = (
    event: KeyboardEvent<HTMLInputElement>,
    index: number,
    matches: ProductOption[],
  ) => {
    if (!matches.length) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (openProductIndex !== index) {
        setOpenProductIndex(index);
        setProductActiveIndex(0);
        return;
      }
      setProductActiveIndex((prev) => Math.min(prev + 1, matches.length - 1));
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (openProductIndex !== index) {
        setOpenProductIndex(index);
        setProductActiveIndex(matches.length - 1);
        return;
      }
      setProductActiveIndex((prev) => Math.max(prev - 1, 0));
    }

    if (event.key === "Enter") {
      if (openProductIndex !== index) return;
      event.preventDefault();
      const candidate = matches[productActiveIndex];
      if (candidate) {
        handleSelectPurchaseProduct(index, candidate);
      }
    }

    if (event.key === "Escape") {
      setOpenProductIndex(null);
    }
  };

  const applyFiscalJurisdictionSuggestion = (index: number, value: string) => {
    handleFiscalLineChange(index, "jurisdiction", normalizeJurisdiction(value));
    setOpenJurisdictionIndex(null);
  };

  const handleFiscalJurisdictionKeyDown = (
    event: KeyboardEvent<HTMLInputElement>,
    index: number,
    matches: readonly string[],
  ) => {
    if (!matches.length) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (openJurisdictionIndex !== index) {
        setOpenJurisdictionIndex(index);
        setJurisdictionActiveIndex(0);
        return;
      }
      setJurisdictionActiveIndex((prev) => Math.min(prev + 1, matches.length - 1));
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (openJurisdictionIndex !== index) {
        setOpenJurisdictionIndex(index);
        setJurisdictionActiveIndex(matches.length - 1);
        return;
      }
      setJurisdictionActiveIndex((prev) => Math.max(prev - 1, 0));
    }

    if (event.key === "Enter") {
      if (openJurisdictionIndex !== index) return;
      event.preventDefault();
      const candidate = matches[jurisdictionActiveIndex];
      if (candidate) {
        applyFiscalJurisdictionSuggestion(index, candidate);
      }
    }

    if (event.key === "Escape") {
      setOpenJurisdictionIndex(null);
    }
  };

  const addPurchaseProduct = () => {
    setPurchaseProducts((previous) => [...previous, emptyPurchaseProduct()]);
  };

  const removePurchaseProduct = (index: number) => {
    setPurchaseProducts((previous) => {
      if (previous.length === 1) return previous;
      return previous.filter((_, currentIndex) => currentIndex !== index);
    });
  };

  const handleCreateProductFromPurchase = async (index: number) => {
    const name = purchaseProducts[index]?.productSearch.trim();
    if (!name || name.length < 2) {
      setStatus("Escribe un nombre de producto para crearlo");
      return;
    }

    setStatus(null);
    setCreatingProductIndex(index);
    try {
      const res = await fetch("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = (await res.json()) as ProductOption | { error?: string };
      if (!res.ok) {
        setStatus(
          "error" in data && data.error ? data.error : "No se pudo crear producto",
        );
        return;
      }

      const product = data as ProductOption;
      handleSelectPurchaseProduct(index, product);
      setProductMatchesByQuery((previous) => {
        const normalized = normalizeQuery(name);
        const current = previous[normalized] ?? [];
        return { ...previous, [normalized]: [product, ...current] };
      });
      productMatchesCacheRef.current.clear();
    } catch {
      setStatus("No se pudo crear producto");
    } finally {
      setCreatingProductIndex(null);
    }
  };

  const handleFiscalLineChange = (
    index: number,
    field: keyof PurchaseFiscalLineForm,
    value: string,
  ) => {
    setFiscalLines((previous) => {
      const next = [...previous];
      const updated = { ...next[index], [field]: value } as PurchaseFiscalLineForm;
      if (field === "amount") {
        const hasManualAmount = value.trim().length > 0;
        updated.manualAmountOverride = hasManualAmount;
        if (!hasManualAmount) {
          const autoAmount = calculateFiscalLineAmount(
            parseOptionalNumber(updated.baseAmount),
            parseOptionalNumber(updated.rate),
          );
          updated.amount = autoAmount !== null ? toMoneyValue(autoAmount) : "";
        }
      }

      if ((field === "baseAmount" || field === "rate") && !updated.manualAmountOverride) {
        const baseAmount = parseOptionalNumber(updated.baseAmount);
        const rate = parseOptionalNumber(updated.rate);
        const autoAmount = calculateFiscalLineAmount(baseAmount, rate);
        updated.amount = autoAmount !== null ? toMoneyValue(autoAmount) : "";
      }
      next[index] = updated;
      return next;
    });
  };

  const addFiscalLine = () => {
    if (isInternalRecord) {
      setStatus(
        "Registro interno: no computa tributos fiscales mientras este sin comprobante fiscal.",
      );
      return;
    }
    setFiscalLines((previous) => [...previous, emptyFiscalLine()]);
  };

  const removeFiscalLine = (index: number) => {
    setFiscalLines((previous) =>
      previous.filter((_, currentIndex) => currentIndex !== index),
    );
  };

  const buildArcaPayload = () => {
    if (!hasInvoice) return null;
    const amount = parsePositiveNumber(effectiveTotalAmount);
    if (!invoiceDate || !amount || !arcaAuthorizationCode.trim()) return null;

    const normalizedInvoiceNumber = invoiceNumber.trim();
    if (!normalizedInvoiceNumber || !hasInvoiceNumberDashFormat) return null;
    if (!inferredPointOfSale) return null;

    const payload: Record<string, string | number> = {
      voucherKind: arcaVoucherKind,
      invoiceNumber: normalizedInvoiceNumber,
      voucherDate: invoiceDate,
      totalAmount: amount,
      authorizationCode: arcaAuthorizationCode.trim(),
      pointOfSale: Number(inferredPointOfSale),
    };

    return payload;
  };

  const applyArcaFiscalBreakdown = (
    source: {
      totalAmount?: number | null;
      netTaxedAmount?: number | null;
      nonTaxedAmount?: number | null;
      exemptAmount?: number | null;
      vatAmount?: number | null;
      otherTaxesAmount?: number | null;
      tributes?: PurchaseArcaVoucherSnapshot["tributes"];
    },
    options: { fallbackToTotalNet: boolean },
  ) => {
    const totalAmount = normalizeMoneyNumber(source.totalAmount);
    if (totalAmount === null || totalAmount <= 0) {
      return { usedBreakdown: false, usedFallback: false, missingBreakdown: true };
    }

    const netTaxedAmount = normalizeMoneyNumber(source.netTaxedAmount);
    const nonTaxedAmount = normalizeMoneyNumber(source.nonTaxedAmount);
    const exemptAmount = normalizeMoneyNumber(source.exemptAmount);
    const vatAmount = normalizeMoneyNumber(source.vatAmount);
    const tributeLines = mapArcaTributesToFiscalLines(source.tributes);
    const tributeLinesTotal = roundMoney(
      tributeLines.reduce((sum, line) => {
        const amount = Number(line.amount);
        return Number.isFinite(amount) ? sum + amount : sum;
      }, 0),
    );
    const otherTaxesFromAmount = normalizeMoneyNumber(source.otherTaxesAmount);
    const otherTaxesAmount =
      tributeLinesTotal > 0 ? tributeLinesTotal : otherTaxesFromAmount;

    const hasBreakdown = [
      netTaxedAmount,
      nonTaxedAmount,
      exemptAmount,
      vatAmount,
      otherTaxesAmount,
    ].some((value) => value !== null && value > 0);

    if (!hasBreakdown) {
      if (!options.fallbackToTotalNet) {
        return { usedBreakdown: false, usedFallback: false, missingBreakdown: true };
      }
      setTotalsSource("MANUAL");
      setSimpleFiscalCondition("GRAVADO");
      setShowFiscalDetail(false);
      setNetTaxedAmount("");
      setNetNonTaxedAmount("");
      setExemptAmount("");
      setFiscalLines([]);
      setSimpleNetAmount(toMoneyValue(totalAmount));
      setPurchaseVatAmount("0");
      setGlobalDiscountAmount("");
      return { usedBreakdown: false, usedFallback: true, missingBreakdown: true };
    }

    const nextNonTaxed = nonTaxedAmount ?? 0;
    const nextExempt = exemptAmount ?? 0;
    const nextVat = vatAmount ?? 0;
    const nextOtherTaxes = otherTaxesAmount ?? 0;
    const baseWithoutNet = nextNonTaxed + nextExempt + nextVat + nextOtherTaxes;
    let nextNetTaxed = netTaxedAmount ?? 0;
    const currentTotal = roundMoney(nextNetTaxed + baseWithoutNet);
    if (Math.abs(currentTotal - totalAmount) > 0.01) {
      nextNetTaxed = Math.max(0, roundMoney(totalAmount - baseWithoutNet));
    }

    const nextSimpleCondition: SimpleFiscalCondition =
      nextNetTaxed > 0 && nextNonTaxed <= 0 && nextExempt <= 0
        ? "GRAVADO"
        : nextNonTaxed > 0 && nextNetTaxed <= 0 && nextExempt <= 0
          ? "NO_GRAVADO"
          : nextExempt > 0 && nextNetTaxed <= 0 && nextNonTaxed <= 0
            ? "EXENTO"
            : "GRAVADO";

    setTotalsSource("MANUAL");
    setGlobalDiscountAmount("");
    setSimpleFiscalCondition(nextSimpleCondition);
    setSimpleNetAmount(
      toMoneyValue(roundMoney(nextNetTaxed + nextNonTaxed + nextExempt)),
    );
    setPurchaseVatAmount(toMoneyValue(nextVat));
    setShowFiscalDetail(true);
    setNetTaxedAmount(toMoneyValue(nextNetTaxed));
    setNetNonTaxedAmount(toMoneyValue(nextNonTaxed));
    setExemptAmount(toMoneyValue(nextExempt));
    setFiscalLines(
      tributeLines.length
        ? tributeLines
        : nextOtherTaxes > 0
          ? [
              {
                ...emptyFiscalLine(),
                type: "OTHER",
                amount: toMoneyValue(nextOtherTaxes),
                manualAmountOverride: true,
                note: "Tributos informados por ARCA",
              },
            ]
          : [],
    );

    return { usedBreakdown: true, usedFallback: false, missingBreakdown: false };
  };

  const applyArcaValidationFeedback = (
    statusValue: string | null | undefined,
    messageValue: unknown,
    context: "manual" | "submit" | "qr",
  ) => {
    const statusCode = String(statusValue ?? "ERROR");
    const statusLabel = arcaStatusLabel(statusCode);
    const rawMessage =
      typeof messageValue === "string" ? messageValue.trim() : "";
    const hint = rawMessage ? buildArcaHints([rawMessage])[0] : null;
    const detailText = rawMessage ? ` ${rawMessage}` : "";
    const hintText = hint ? ` ${hint}` : "";

    if (statusCode === "AUTHORIZED") {
      const message =
        context === "qr"
          ? `QR importado y ARCA validado (${statusLabel}).${detailText}`.trim()
          : context === "submit"
            ? `ARCA validado (${statusLabel}). Listo para revisar compra.${detailText}`.trim()
            : `ARCA validado (${statusLabel}).${detailText}`.trim();
      setStatus(message);
      toast.success(message);
      return;
    }

    if (statusCode === "OBSERVED") {
      const message =
        context === "qr"
          ? `QR importado con observaciones ARCA.${detailText}${hintText}`.trim()
          : context === "submit"
            ? `ARCA devolvio observaciones. Revisa antes de confirmar.${detailText}${hintText}`.trim()
          : `ARCA devolvio observaciones.${detailText}${hintText}`.trim();
      setStatus(message);
      toast.warn(message);
      return;
    }

    const message =
      context === "qr"
        ? `QR importado, pero ARCA devolvio ${statusLabel.toLowerCase()}.${detailText}${hintText}`.trim()
        : statusCode === "REJECTED"
          ? `ARCA rechazo el comprobante.${detailText}${hintText}`.trim()
          : `No se pudo validar en ARCA (${statusLabel}).${detailText}${hintText}`.trim();
    setStatus(message);
    toast.error(message);
  };

  const validateArcaFromForm = async (context: "manual" | "submit" = "manual") => {
    if (!supplierId) {
      setStatus("Selecciona un proveedor");
      toast.error("Selecciona un proveedor antes de validar ARCA.");
      return null;
    }
    if (!hasInvoiceNumberDashFormat) {
      const message =
        "El numero de comprobante debe tener formato 0001-00001234 (con guion).";
      setStatus(message);
      toast.error(message);
      setOpenPurchaseSection("invoice");
      highlightSection("invoice");
      highlightFields(["invoice.invoiceNumber"]);
      return null;
    }
    const payload = buildArcaPayload();
    if (!payload) {
      setStatus("Completa los datos del comprobante para validar con ARCA.");
      toast.error("Completa los datos del comprobante para validar con ARCA.");
      return null;
    }

    setStatus(null);
    setIsArcaValidating(true);
    try {
      const res = await fetch("/api/purchases/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...payload,
          supplierId,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        const message = data?.error ?? "No se pudo validar con ARCA";
        setStatus(message);
        toast.error(message);
        return null;
      }

      const normalizedComprobante = (data.comprobante ??
        null) as PurchaseArcaVoucherSnapshot | null;
      setArcaValidationResult({
        status: data.status,
        message: data.message,
        checkedAt: data.checkedAt,
        comprobante: normalizedComprobante,
      });
      const breakdownResult = normalizedComprobante
        ? applyArcaFiscalBreakdown(normalizedComprobante, {
            fallbackToTotalNet: false,
          })
        : { usedBreakdown: false, usedFallback: false, missingBreakdown: true };

      applyArcaValidationFeedback(data.status, data.message, context);
      if (
        breakdownResult.missingBreakdown &&
        (data.status === "AUTHORIZED" || data.status === "OBSERVED")
      ) {
        toast.info(
          "ARCA valido el comprobante, pero no informa desglose de IVA ni percepciones. Completa esos importes manualmente.",
        );
      }
      return {
        status: String(data.status ?? "ERROR"),
        comprobante: normalizedComprobante,
      };
    } catch {
      setStatus("No se pudo validar con ARCA");
      toast.error("No se pudo validar con ARCA.");
      return null;
    } finally {
      setIsArcaValidating(false);
    }
  };

  const handleValidateArcaOnly = async () => {
    await validateArcaFromForm("manual");
  };

  const findSupplierByTaxId = async (taxId: string) => {
    const normalizedTaxId = normalizeTaxId(taxId);
    if (!normalizedTaxId) return null;

    const params = new URLSearchParams();
    params.set("limit", "8");
    params.set("offset", "0");
    params.set("sort", "az");
    params.set("q", normalizedTaxId);

    const res = await fetch(`/api/suppliers?${params.toString()}`, {
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { items: SupplierOption[] };
    return (
      data.items.find(
        (candidate) => normalizeTaxId(candidate.taxId ?? "") === normalizedTaxId,
      ) ?? null
    );
  };

  const importPurchaseFromQrText = async (qrText: string) => {
    const normalizedQr = qrText.trim();
    if (!normalizedQr) return;
    setIsImportingQr(true);
    setStatus(null);
    try {
      const qrRes = await fetch("/api/purchases/qr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          qrText: normalizedQr,
          supplierId: supplierId || undefined,
        }),
      });
      const qrData = (await qrRes.json()) as
        | PurchaseQrImportResponse
        | { error?: string };
      if (!qrRes.ok) {
        const message =
          "error" in qrData && qrData.error
            ? qrData.error
            : "No se pudo importar el QR";
        setStatus(message);
        toast.error(message);
        return;
      }

      const parsedQr = qrData as PurchaseQrImportResponse;
      setHasInvoice(true);
      if (parsedQr.voucherKind === "A" || parsedQr.voucherKind === "B" || parsedQr.voucherKind === "C") {
        setArcaVoucherKind(parsedQr.voucherKind);
      }
      setInvoiceNumber(parsedQr.invoiceNumber ?? "");
      setInvoiceDate(
        toCalendarDateInput(parsedQr.voucherDate) || toDateInputValue(new Date()),
      );
      setArcaAuthorizationCode(parsedQr.authorizationCode ?? "");
      setArcaValidationResult(null);
      const qrFiscalSync = applyArcaFiscalBreakdown(parsedQr, {
        fallbackToTotalNet: true,
      });
      setOpenPurchaseSection("invoice");
      highlightSection("invoice");

      let resolvedSupplierId = supplierId;
      if (!resolvedSupplierId && parsedQr.issuerTaxId) {
        const matchedSupplier = await findSupplierByTaxId(parsedQr.issuerTaxId);
        if (matchedSupplier) {
          handleSupplierSelect(matchedSupplier);
          resolvedSupplierId = matchedSupplier.id;
          toast.success("Proveedor detectado automaticamente por CUIT del QR.");
        }
      }

      if (!resolvedSupplierId) {
        const message =
          "Selecciona proveedor para completar validacion automatica ARCA.";
        setStatus(message);
        toast.error(message);
        return;
      }

      const validateRes = await fetch("/api/purchases/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...parsedQr.arcaValidation,
          supplierId: resolvedSupplierId,
        }),
      });
      const validateData = await validateRes.json();
      if (!validateRes.ok) {
        const message = validateData?.error ?? "No se pudo validar con ARCA";
        setStatus(message);
        toast.error(message);
        return;
      }

      setArcaValidationResult({
        status: validateData.status,
        message: validateData.message,
        checkedAt: validateData.checkedAt,
        comprobante: (validateData.comprobante ?? null) as PurchaseArcaVoucherSnapshot | null,
      });
      const validatedComprobante = (validateData.comprobante ??
        null) as PurchaseArcaVoucherSnapshot | null;
      const validatedSync = validatedComprobante
        ? applyArcaFiscalBreakdown(validatedComprobante, {
            fallbackToTotalNet: false,
          })
        : { usedBreakdown: false, usedFallback: false, missingBreakdown: true };

      applyArcaValidationFeedback(validateData.status, validateData.message, "qr");
      if (
        qrFiscalSync.missingBreakdown &&
        validatedSync.missingBreakdown &&
        (validateData.status === "AUTHORIZED" || validateData.status === "OBSERVED")
      ) {
        toast.info(
          "El QR y la validacion ARCA solo informan el total del comprobante. Carga IVA y percepciones manualmente.",
        );
      }

      if (parsedQr.warning) {
        toast.error(parsedQr.warning);
      }
    } catch {
      setStatus("No se pudo importar el QR");
      toast.error("No se pudo importar el QR.");
    } finally {
      setIsImportingQr(false);
    }
  };

  importQrTextHandlerRef.current = importPurchaseFromQrText;

  const handleImportQrFromPrompt = async () => {
    const qrText =
      window.prompt("Escanea y pega el texto/URL del QR de ARCA")?.trim() ?? "";
    if (!qrText) return;
    await importPurchaseFromQrText(qrText);
  };

  const decodeQrFromImageFile = async (file: File) => {
    const imageUrl = URL.createObjectURL(file);
    try {
      const image = await new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error("IMAGE_LOAD_ERROR"));
        img.src = imageUrl;
      });

      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) return null;

      const sourceWidth = image.naturalWidth || image.width;
      const sourceHeight = image.naturalHeight || image.height;
      if (!sourceWidth || !sourceHeight) return null;

      const maxSide = 2200;
      const baseScale = Math.min(1, maxSide / Math.max(sourceWidth, sourceHeight));
      const scaleCandidates = [1, 0.8, 0.6, 0.45, 0.3];
      for (const scaleFactor of scaleCandidates) {
        const scale = baseScale * scaleFactor;
        const width = Math.max(240, Math.round(sourceWidth * scale));
        const height = Math.max(240, Math.round(sourceHeight * scale));
        canvas.width = width;
        canvas.height = height;
        context.drawImage(image, 0, 0, width, height);
        const imageData = context.getImageData(0, 0, width, height);
        const rawValue = await decodeQrValueFromPixels(
          imageData.data,
          width,
          height,
        );
        if (rawValue) return rawValue;
      }

      return null;
    } finally {
      URL.revokeObjectURL(imageUrl);
    }
  };

  const handleImportQrFromImage = async (
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setIsImportingQrFromImage(true);
    setQrScannerError(null);
    try {
      const rawValue = await decodeQrFromImageFile(file);
      if (!rawValue) {
        setQrScannerError(
          "No se detecto un QR en la imagen. Intenta con otra foto mas nitida.",
        );
        return;
      }
      setIsQrScannerOpen(false);
      stopQrScanner();
      await importQrTextHandlerRef.current(rawValue);
    } catch {
      setQrScannerError("No se pudo leer la imagen seleccionada.");
    } finally {
      setIsImportingQrFromImage(false);
    }
  };

  const openQrScanner = () => {
    setQrScannerError(null);
    setIsQrScannerOpen(true);
  };

  const closeQrScanner = () => {
    setIsQrScannerOpen(false);
    stopQrScanner();
  };

  const normalizedPurchaseProducts = useMemo(() => {
    return purchaseProducts
      .map((item) => ({
        productId: item.productId,
        qty: parseOptionalNumber(item.qty),
        unitCost: parseOptionalNumber(item.unitCost),
        discountPercent: Math.max(
          0,
          parseOptionalNumber(item.discountPercent) ?? 0,
        ),
        taxRate: parseOptionalNumber(item.taxRate) ?? 0,
      }))
      .filter(
        (item): item is {
          productId: string;
          qty: number;
          unitCost: number;
          discountPercent: number;
          taxRate: number;
        } =>
          Boolean(item.productId) &&
          item.qty !== null &&
          Number.isFinite(item.qty) &&
          item.qty > 0 &&
          item.unitCost !== null &&
          Number.isFinite(item.unitCost) &&
          item.unitCost >= 0 &&
          Number.isFinite(item.discountPercent) &&
          item.discountPercent >= 0 &&
          item.discountPercent <= 100 &&
          Number.isFinite(item.taxRate) &&
          item.taxRate >= 0 &&
          item.taxRate <= 100,
      );
  }, [purchaseProducts]);

  const productTotals = useMemo(() => {
    return normalizedPurchaseProducts.reduce(
      (totals, item) => {
        const grossSubtotal = item.qty * item.unitCost;
        const discountAmount = roundMoney(
          grossSubtotal * (item.discountPercent / 100),
        );
        const subtotal = Math.max(0, grossSubtotal - discountAmount);
        const tax = subtotal * (item.taxRate / 100);
        return {
          grossSubtotal: totals.grossSubtotal + grossSubtotal,
          discountTotal: totals.discountTotal + discountAmount,
          subtotal: totals.subtotal + subtotal,
          tax: totals.tax + tax,
          total: totals.total + subtotal + tax,
        };
      },
      { grossSubtotal: 0, discountTotal: 0, subtotal: 0, tax: 0, total: 0 },
    );
  }, [normalizedPurchaseProducts]);

  const hasPurchaseProductTotals =
    includeProductDetails && normalizedPurchaseProducts.length > 0;

  const normalizedFiscalLines = useMemo(() => {
    return fiscalLines
      .map((line) => ({
        type: line.type,
        jurisdiction: normalizeJurisdiction(line.jurisdiction) || undefined,
        baseAmount: parseOptionalNumber(line.baseAmount),
        rate: parseOptionalNumber(line.rate),
        amount: parseOptionalNumber(line.amount),
        note: line.note.trim() || undefined,
      }))
      .filter((line) => line.amount !== null && line.amount > 0);
  }, [fiscalLines]);

  const fiscalOtherTotal = normalizedFiscalLines.reduce(
    (sum, line) => sum + (line.amount ?? 0),
    0,
  );
  const globalDiscountValue = Math.max(
    parseOptionalNumber(globalDiscountAmount) ?? 0,
    0,
  );
  const simpleNetValue = Math.max(parseOptionalNumber(simpleNetAmount) ?? 0, 0);
  const simpleVatInputValue = Math.max(parseOptionalNumber(purchaseVatAmount) ?? 0, 0);
  const effectivePurchaseVatAmount = isInternalRecord
    ? purchaseVatAmount
    : simpleFiscalCondition === "GRAVADO"
      ? purchaseVatAmount
      : "0";
  const simpleVatValue = isInternalRecord
    ? simpleVatInputValue
    : simpleFiscalCondition === "GRAVADO"
      ? simpleVatInputValue
      : 0;
  const simpleNetTaxed = isInternalRecord
    ? simpleNetValue
    : simpleFiscalCondition === "GRAVADO"
      ? simpleNetValue
      : 0;
  const simpleNetNonTaxed =
    !isInternalRecord && simpleFiscalCondition === "NO_GRAVADO"
      ? simpleNetValue
      : 0;
  const simpleExempt =
    !isInternalRecord && simpleFiscalCondition === "EXENTO" ? simpleNetValue : 0;
  const simpleTotal = roundMoney(
    Math.max(
      0,
      simpleNetTaxed +
        simpleNetNonTaxed +
        simpleExempt +
        simpleVatValue +
        fiscalOtherTotal -
        globalDiscountValue,
    ),
  );
  const advancedNetTaxed = Math.max(parseOptionalNumber(netTaxedAmount) ?? 0, 0);
  const advancedNetNonTaxed = Math.max(parseOptionalNumber(netNonTaxedAmount) ?? 0, 0);
  const advancedExempt = Math.max(parseOptionalNumber(exemptAmount) ?? 0, 0);
  const advancedTotal = roundMoney(
    Math.max(
      0,
      advancedNetTaxed +
        advancedNetNonTaxed +
        advancedExempt +
        simpleVatValue +
        fiscalOtherTotal -
        globalDiscountValue,
    ),
  );
  const hasAdvancedData =
    netTaxedAmount.trim() || netNonTaxedAmount.trim() || exemptAmount.trim();
  const effectiveTotalAmount = showFiscalDetail
    ? hasAdvancedData || fiscalOtherTotal > 0 || globalDiscountValue > 0
      ? toMoneyValue(advancedTotal)
      : ""
    : simpleNetAmount.trim() || fiscalOtherTotal > 0 || globalDiscountValue > 0
      ? toMoneyValue(simpleTotal)
      : "";
  const effectiveTotalNumeric = parseOptionalNumber(effectiveTotalAmount) ?? 0;
  const expectedTotalFromProducts = Math.max(
    0,
    roundMoney(productTotals.total - globalDiscountValue),
  );
  const productTotalDifference =
    includeProductDetails && hasPurchaseProductTotals
      ? roundMoney(effectiveTotalNumeric - expectedTotalFromProducts)
      : 0;
  const hasProductTotalMismatch =
    includeProductDetails &&
    hasPurchaseProductTotals &&
    Math.abs(productTotalDifference) > 0.01;

  const autoTotalsFromProducts = useMemo(
    () =>
      calculateAutoTotalsFromProducts({
        subtotal: productTotals.subtotal,
        vat: productTotals.tax,
        fiscalOtherTotal,
      }),
    [fiscalOtherTotal, productTotals.subtotal, productTotals.tax],
  );

  useEffect(() => {
    if (totalsSource !== "AUTO_FROM_PRODUCTS" || !includeProductDetails) {
      return;
    }
    if (!hasPurchaseProductTotals) {
      return;
    }
    setSimpleFiscalCondition("GRAVADO");
    setSimpleNetAmount(toMoneyValue(autoTotalsFromProducts.netTaxed));
    setPurchaseVatAmount(toMoneyValue(autoTotalsFromProducts.vat));
    setNetTaxedAmount(toMoneyValue(autoTotalsFromProducts.netTaxed));
  }, [
    autoTotalsFromProducts.netTaxed,
    autoTotalsFromProducts.total,
    autoTotalsFromProducts.vat,
    hasPurchaseProductTotals,
    includeProductDetails,
    totalsSource,
  ]);

  const fiscalPreview = useMemo(() => {
    const total = parseOptionalNumber(effectiveTotalAmount) ?? 0;
    const vat = showFiscalDetail
      ? (parseOptionalNumber(effectivePurchaseVatAmount) ?? 0)
      : simpleVatValue;
    const netTaxed = showFiscalDetail
      ? (parseOptionalNumber(netTaxedAmount) ?? 0)
      : simpleNetTaxed;
    const netNonTaxed = showFiscalDetail
      ? (parseOptionalNumber(netNonTaxedAmount) ?? 0)
      : simpleNetNonTaxed;
    const exempt = showFiscalDetail
      ? (parseOptionalNumber(exemptAmount) ?? 0)
      : simpleExempt;
    const fiscalTotal =
      netTaxed + netNonTaxed + exempt + vat + fiscalOtherTotal - globalDiscountValue;
    return {
      total,
      vat,
      netTaxed,
      netNonTaxed,
      exempt,
      fiscalTotal,
      difference: total - fiscalTotal,
    };
  }, [
    effectivePurchaseVatAmount,
    exemptAmount,
    fiscalOtherTotal,
    netNonTaxedAmount,
    netTaxedAmount,
    effectiveTotalAmount,
    simpleExempt,
    simpleNetNonTaxed,
    simpleNetTaxed,
    simpleVatValue,
    globalDiscountValue,
    showFiscalDetail,
  ]);
  const fiscalDifferenceOk = Math.abs(fiscalPreview.difference) <= 0.01;
  const fiscalSummaryItems = [
    { label: "Neto", value: fiscalPreview.netTaxed },
    { label: "IVA", value: fiscalPreview.vat },
    { label: "Perc./otros", value: fiscalOtherTotal },
    { label: "Desc.", value: -globalDiscountValue },
    { label: "Total fiscal", value: fiscalPreview.fiscalTotal },
    { label: "Diferencia", value: fiscalPreview.difference },
  ];
  const enableFiscalEditor = () => {
    if (!showFiscalDetail) {
      setNetTaxedAmount(toMoneyValue(simpleNetTaxed));
      setNetNonTaxedAmount(toMoneyValue(simpleNetNonTaxed));
      setExemptAmount(toMoneyValue(simpleExempt));
    }
    setShowFiscalDetail(true);
  };
  const toggleFiscalEditor = () => {
    if (showFiscalDetail) {
      setShowFiscalDetail(false);
      return;
    }
    enableFiscalEditor();
  };
  const addFiscalLineAndOpen = () => {
    setOpenPurchaseSection("taxes");
    addFiscalLine();
  };
  const validateArcaConsistency = (
    total: number,
    comprobanteOverride?: PurchaseArcaVoucherSnapshot | null,
  ) => {
    const comprobante = comprobanteOverride ?? arcaValidationResult?.comprobante;
    if (!arcaEnabled || !comprobante) return true;
    const mismatches = compareArcaVoucherAgainstForm({
      form: {
        voucherKind: arcaVoucherKind,
        pointOfSale: inferredPointOfSale,
        invoiceNumber,
        invoiceDate,
        totalAmount: total,
        authorizationCode: arcaAuthorizationCode,
      },
      arca: comprobante,
    });
    if (!mismatches.length) return true;

    const message = summarizeArcaMismatches(mismatches);
    setStatus(message);
    toast.error(message);
    const targetSection = mismatches.some((item) => item.section === "invoice")
      ? "invoice"
      : "totals";
    setOpenPurchaseSection(targetSection);
    highlightSection(targetSection);
    highlightFields(mismatches.map((item) => item.field));
    return false;
  };

  const supplierSectionSummary = supplierId
    ? `${selectedSupplier?.displayName ?? supplierSearch} · ${formatDateInputLabel(
        invoiceDate,
      )}`
    : `Sin proveedor · ${formatDateInputLabel(invoiceDate)}`;
  const invoiceSectionSummary = hasInvoice
    ? invoiceNumber.trim()
      ? `Comprobante ${arcaVoucherKind} · ${invoiceNumber.trim()}`
      : `Comprobante ${arcaVoucherKind} pendiente`
    : "Sin comprobante fiscal · Registro interno";
  const productsSectionSummary = includeProductDetails
    ? `${normalizedPurchaseProducts.length} items · ${formatCurrencyARS(
        productTotals.total,
      )}`
    : "Sin detalle de productos";
  const totalsSectionSummary = fiscalPreview.total
    ? `${totalsSource === "AUTO_FROM_PRODUCTS" ? "Auto" : "Manual"} · ${formatCurrencyARS(
        fiscalPreview.total,
      )} · diferencia ${formatCurrencyARS(fiscalPreview.difference)}`
    : "Sin total";
  const taxesSectionSummary = fiscalLines.length
    ? `${fiscalLines.length} tributo${
        fiscalLines.length === 1 ? "" : "s"
      } · ${formatCurrencyARS(fiscalOtherTotal)}`
    : isInternalRecord
      ? "Registro interno · No computable fiscalmente"
      : "Sin percepciones";
  const paymentSectionSummary = paymentModeLabel;

  const preparePurchaseForConfirmation = (options?: {
    skipArcaConsistency?: boolean;
  }): PreparedPurchase | null => {
    setStatus(null);
    const shouldAdjustStock = STOCK_ENABLED && adjustStock && includeProductDetails;

    if (!supplierId) {
      setStatus("Selecciona un proveedor");
      setOpenPurchaseSection("supplier");
      highlightSection("supplier");
      return null;
    }

    const total = parsePositiveNumber(effectiveTotalAmount);
    if (!total) {
      setStatus("Ingresa un total valido");
      setOpenPurchaseSection("totals");
      highlightSection("totals");
      highlightFields(["totals.totalAmount"]);
      return null;
    }

    const vatAmount = parseOptionalNumber(effectivePurchaseVatAmount);
    if (vatAmount !== null && vatAmount < 0) {
      setStatus("IVA compra invalido");
      setOpenPurchaseSection("totals");
      highlightSection("totals");
      highlightFields(["totals.vatAmount"]);
      return null;
    }

    if (includeProductDetails) {
      const hasIncompleteProduct = purchaseProducts.some((item) => {
        const hasData = Boolean(
          item.productId ||
            item.productSearch.trim() ||
            item.unitCost.trim() ||
            item.discountPercent.trim() !== "0" ||
            item.qty.trim() !== "1" ||
            item.taxRate.trim() !== "21",
        );
        if (!hasData) return false;
        const qty = parseOptionalNumber(item.qty);
        const unitCost = parseOptionalNumber(item.unitCost);
        const discountPercent = Math.max(
          0,
          parseOptionalNumber(item.discountPercent) ?? 0,
        );
        const taxRate = parseOptionalNumber(item.taxRate) ?? 0;
        return (
          !item.productId ||
          qty === null ||
          qty <= 0 ||
          unitCost === null ||
          unitCost < 0 ||
          discountPercent < 0 ||
          discountPercent > 100 ||
          taxRate < 0 ||
          taxRate > 100
        );
      });

      if (normalizedPurchaseProducts.length === 0 || hasIncompleteProduct) {
        setStatus("Completa producto, cantidad, costo e IVA en cada item");
        setOpenPurchaseSection("products");
        highlightSection("products");
        return null;
      }
      if (totalsSource === "AUTO_FROM_PRODUCTS" && !hasPurchaseProductTotals) {
        setStatus("Activa productos validos para sincronizar totales automaticamente");
        setOpenPurchaseSection("products");
        highlightSection("products");
        return null;
      }
    }

    let fiscalDetailPayload: FiscalDetailPayload | undefined;

    const shouldSaveFiscalDetail =
      !isInternalRecord &&
      (showFiscalDetail ||
        fiscalLines.length > 0 ||
        simpleFiscalCondition !== "GRAVADO");
    if (shouldSaveFiscalDetail) {
      const netTaxed = showFiscalDetail
        ? (parseOptionalNumber(netTaxedAmount) ?? 0)
        : fiscalPreview.netTaxed;
      const netNonTaxed = showFiscalDetail
        ? (parseOptionalNumber(netNonTaxedAmount) ?? 0)
        : fiscalPreview.netNonTaxed;
      const exempt = showFiscalDetail
        ? (parseOptionalNumber(exemptAmount) ?? 0)
        : fiscalPreview.exempt;
      if (netTaxed < 0 || netNonTaxed < 0 || exempt < 0) {
        setStatus("Los netos fiscales no pueden ser negativos");
        setOpenPurchaseSection("totals");
        highlightSection("totals");
        highlightFields(["totals.netTaxed"]);
        return null;
      }
      const incompleteFiscalLine = fiscalLines.some((line) => {
        const hasData = Boolean(
          line.jurisdiction.trim() ||
            line.baseAmount.trim() ||
            line.rate.trim() ||
            line.amount.trim(),
        );
        const amount = parseOptionalNumber(line.amount);
        return hasData && (!amount || amount <= 0);
      });
      if (incompleteFiscalLine) {
        setStatus("Completa el importe de cada percepcion/tributo fiscal");
        setOpenPurchaseSection("taxes");
        highlightSection("taxes");
        return null;
      }
      const fiscalTotal =
        netTaxed +
        netNonTaxed +
        exempt +
        (vatAmount ?? 0) +
        fiscalOtherTotal -
        globalDiscountValue;
      if (Math.abs(total - fiscalTotal) > 0.01) {
        setStatus("El detalle fiscal no coincide con el total de la compra");
        setOpenPurchaseSection("totals");
        highlightSection("totals");
        highlightFields(["totals.totalAmount", "totals.vatAmount", "totals.netTaxed"]);
        return null;
      }
      fiscalDetailPayload = {
        netTaxed,
        netNonTaxed,
        exemptAmount: exempt,
        vatTotal: vatAmount ?? 0,
        lines: normalizedFiscalLines.map((line) => ({
          type: line.type,
          jurisdiction: line.jurisdiction,
          baseAmount: line.baseAmount ?? undefined,
          rate: line.rate ?? undefined,
          amount: line.amount ?? 0,
          note: line.note,
        })),
      };
    }

    if (hasInvoice && !invoiceNumber.trim()) {
      setStatus("Ingresa numero de comprobante");
      setOpenPurchaseSection("invoice");
      highlightSection("invoice");
      highlightFields(["invoice.invoiceNumber"]);
      return null;
    }
    if (hasInvoice && !hasInvoiceNumberDashFormat) {
      setStatus(
        "El numero de comprobante debe tener formato 0001-00001234 (con guion).",
      );
      setOpenPurchaseSection("invoice");
      highlightSection("invoice");
      highlightFields(["invoice.invoiceNumber"]);
      return null;
    }

    if (shouldAdjustStock && normalizedPurchaseProducts.length === 0) {
      setStatus("Agrega productos para ingresar stock");
      setOpenPurchaseSection("products");
      return null;
    }

    const normalizedCashOutLines = registerCashOut
      ? cashOutLines
          .map((line) => ({
            paymentMethodId: line.paymentMethodId,
            accountId: paymentMethodRequiresAccount(
              line.paymentMethodId,
              paymentMethods,
            )
              ? line.accountId
              : undefined,
            amount: Number(line.amount || 0),
          }))
          .filter((line) => line.amount > 0)
      : [];

    if (registerCashOut && !normalizedCashOutLines.length) {
      setStatus("Agrega al menos una linea de pago para el egreso");
      setOpenPurchaseSection("payment");
      return null;
    }

    const hasInvalidCashOutLine =
      registerCashOut &&
      normalizedCashOutLines.some((line) => {
        if (!line.paymentMethodId || line.amount <= 0) return true;
        const method = paymentMethods.find(
          (candidate) => candidate.id === line.paymentMethodId,
        );
        if (!method) return true;
        return method.requiresAccount && !line.accountId;
      });

    if (hasInvalidCashOutLine) {
      setStatus(
        "Completa metodo y monto en cada linea. Selecciona cuenta solo cuando corresponda.",
      );
      setOpenPurchaseSection("payment");
      return null;
    }

    if (registerCashOut) {
      const linesTotal = roundMoney(
        normalizedCashOutLines.reduce((sum, line) => sum + line.amount, 0),
      );
      if (Math.abs(linesTotal - total) > 0.01) {
        setStatus("La suma de lineas debe coincidir con el total de la compra");
        setOpenPurchaseSection("payment");
        return null;
      }
    }

    const arcaPayload = arcaEnabled ? buildArcaPayload() : null;
    if (arcaEnabled && !arcaPayload) {
      setStatus("Completa los datos del comprobante para validar ARCA");
      setOpenPurchaseSection("invoice");
      highlightSection("invoice");
      return null;
    }
    if (!options?.skipArcaConsistency && !validateArcaConsistency(total)) {
      return null;
    }

    const payload: PurchasePayload = {
      supplierId,
      hasInvoice: arcaEnabled,
      invoiceNumber: arcaEnabled ? invoiceNumber || undefined : undefined,
      invoiceDate: invoiceDate || undefined,
      totalAmount: total,
      purchaseVatAmount: vatAmount ?? undefined,
      fiscalDetail: fiscalDetailPayload,
      impactCurrentAccount,
      items: includeProductDetails
        ? normalizedPurchaseProducts.map((item) => ({
            productId: item.productId,
            qty: item.qty,
            unitCost: roundMoney(
              Math.max(
                0,
                item.unitCost * (1 - item.discountPercent / 100),
              ),
            ),
            taxRate: item.taxRate,
          }))
        : editingPurchaseId
          ? []
          : undefined,
      adjustStock: shouldAdjustStock,
      registerCashOut,
      cashOutLines: registerCashOut
        ? normalizedCashOutLines.map((line) => ({
            paymentMethodId: line.paymentMethodId,
            accountId: line.accountId || undefined,
            amount: line.amount,
          }))
        : undefined,
      validateWithArca: arcaEnabled,
      arcaValidation: arcaEnabled && arcaPayload ? { ...arcaPayload } : undefined,
    };

    const paymentPreviewLabel = registerCashOut
      ? normalizedCashOutLines.length > 1
        ? `Pago mixto (${normalizedCashOutLines.length} lineas)`
        : paymentMethods.find(
            (method) =>
              method.id === normalizedCashOutLines[0]?.paymentMethodId,
          )?.name ?? "Pago inmediato"
      : paymentModeLabel;

    return {
      payload,
      supplierLabel: selectedSupplier?.displayName ?? supplierSearch,
      dateLabel: formatDateInputLabel(invoiceDate),
      invoiceLabel: invoiceSectionSummary,
      paymentLabel: paymentPreviewLabel,
      total,
      vatAmount,
      productCount: normalizedPurchaseProducts.length,
      productTotal: productTotals.total,
      fiscalOtherTotal,
      fiscalDifference: fiscalPreview.difference,
    };
  };

  const resetPurchaseForm = () => {
    setSupplierSearch("");
    setSupplierId("");
    setSelectedSupplier(null);
    setSelectedSupplierTaxId("");
    setSupplierDataStatus(null);
    setHasInvoice(false);
    setInvoiceNumber("");
    setInvoiceDate(toDateInputValue(new Date()));
    setSimpleNetAmount("");
    setSimpleFiscalCondition("GRAVADO");
    setPurchaseVatAmount("");
    setGlobalDiscountAmount("");
    setTotalsSource("AUTO_FROM_PRODUCTS");
    setShowFiscalDetail(false);
    setNetTaxedAmount("");
    setNetNonTaxedAmount("");
    setExemptAmount("");
    setFiscalLines([]);
    setPaymentMode("CURRENT_ACCOUNT");
    setIncludeProductDetails(false);
    setAdjustStock(false);
    setPurchaseProducts([emptyPurchaseProduct()]);
    setSelectedProductsById({});
    setCashOutLines([buildCashOutLine(paymentMethods, accounts)]);
    setArcaVoucherKind("B");
    setArcaAuthorizationCode("");
    setArcaValidationResult(null);
    setHighlightedFields({});
    setHighlightedSection(null);
    setPendingPurchase(null);
    setOpenPurchaseSection("supplier");
    setEditingPurchaseId(null);
  };

  const handleStartPurchaseEdit = async (purchaseId: string) => {
    setStatus(null);
    setIsLoadingPurchaseEdit(true);
    try {
      const res = await fetch(`/api/purchases/${purchaseId}`, {
        cache: "no-store",
      });
      const data = (await res.json()) as PurchaseEditResponse | { error?: string };
      if (!res.ok) {
        const message =
          typeof data === "object" &&
          data !== null &&
          "error" in data &&
          typeof data.error === "string"
            ? data.error
            : "No se pudo cargar la compra para editar";
        setStatus(message);
        toast.error(message);
        return;
      }

      const purchase = data as PurchaseEditResponse;
      const supplier = purchase.supplier;
      const toNumber = (value: string | null | undefined) => {
        const parsed = Number(value ?? 0);
        return Number.isFinite(parsed) ? parsed : 0;
      };
      const total = toNumber(purchase.total);
      const netTaxed = toNumber(purchase.netTaxed);
      const netNonTaxed = toNumber(purchase.netNonTaxed);
      const exemptAmount = toNumber(purchase.exemptAmount);
      const vatTotal = toNumber(purchase.vatTotal || purchase.taxes);
      const otherTaxesTotal = toNumber(purchase.otherTaxesTotal);
      const grossBeforeDiscount =
        netTaxed + netNonTaxed + exemptAmount + vatTotal + otherTaxesTotal;
      const inferredGlobalDiscount = Math.max(
        0,
        roundMoney(grossBeforeDiscount - total),
      );
      const fiscalCondition: SimpleFiscalCondition =
        netTaxed > 0 && netNonTaxed <= 0 && exemptAmount <= 0
          ? "GRAVADO"
          : netNonTaxed > 0 && netTaxed <= 0 && exemptAmount <= 0
            ? "NO_GRAVADO"
            : exemptAmount > 0 && netTaxed <= 0 && netNonTaxed <= 0
              ? "EXENTO"
              : "GRAVADO";

      const purchaseProductsFromEdit = purchase.items.length
        ? purchase.items.map((item) => ({
            productId: item.productId,
            productSearch: formatProductLabel(item.product),
            qty: String(toNumber(item.qty)),
            unitCost: toMoneyValue(toNumber(item.unitCost)),
            discountPercent: "0",
            taxRate: String(toNumber(item.taxRate)),
          }))
        : [emptyPurchaseProduct()];

      const selectedProducts = purchase.items.reduce(
        (accumulator, item) => ({
          ...accumulator,
          [item.productId]: item.product,
        }),
        {} as Record<string, ProductOption>,
      );

      const voucherKind =
        purchase.fiscalVoucherKind === "A" ||
        purchase.fiscalVoucherKind === "B" ||
        purchase.fiscalVoucherKind === "C"
          ? purchase.fiscalVoucherKind
          : purchaseVoucherKindFromFiscalType(purchase.fiscalVoucherType);

      setSupplierId(supplier.id);
      setSelectedSupplier(supplier);
      setSupplierSearch(formatSupplierLabel(supplier));
      setSelectedSupplierTaxId(normalizeTaxId(supplier.taxId ?? ""));
      setHasInvoice(Boolean(purchase.hasInvoice ?? purchase.invoiceNumber));
      setInvoiceNumber(purchase.invoiceNumber ?? "");
      setInvoiceDate(
        toCalendarDateInput(purchase.invoiceDate) || toDateInputValue(new Date()),
      );
      setSimpleFiscalCondition(fiscalCondition);
      setSimpleNetAmount(
        toMoneyValue(
          fiscalCondition === "GRAVADO"
            ? netTaxed
            : fiscalCondition === "NO_GRAVADO"
              ? netNonTaxed
              : exemptAmount,
        ),
      );
      setPurchaseVatAmount(toMoneyValue(vatTotal));
      setGlobalDiscountAmount(
        inferredGlobalDiscount > 0.01 ? toMoneyValue(inferredGlobalDiscount) : "",
      );
      setTotalsSource("MANUAL");
      setShowFiscalDetail(true);
      setNetTaxedAmount(toMoneyValue(netTaxed));
      setNetNonTaxedAmount(toMoneyValue(netNonTaxed));
      setExemptAmount(toMoneyValue(exemptAmount));
      setFiscalLines(
        purchase.fiscalLines.map((line) => ({
          type: line.type,
          jurisdiction: line.jurisdiction ?? "",
          baseAmount: line.baseAmount ?? "",
          rate: line.rate ?? "",
          amount: line.amount,
          manualAmountOverride: true,
          note: line.note ?? "",
        })),
      );
      setIncludeProductDetails(purchase.items.length > 0);
      setPurchaseProducts(purchaseProductsFromEdit);
      setSelectedProductsById(selectedProducts);
      setAdjustStock(false);
      setPaymentMode(purchase.impactsAccount ? "CURRENT_ACCOUNT" : "OFF_BOOK");
      setCashOutLines([buildCashOutLine(paymentMethods, accounts)]);
      setArcaVoucherKind(voucherKind);
      setArcaAuthorizationCode(purchase.authorizationCode ?? "");
      setArcaValidationResult(null);
      setPendingPurchase(null);
      setEditingPurchaseId(purchase.id);
      setOpenPurchaseSection("supplier");
      setPurchaseView("new");
      const statusMessage = purchase.hasStockMovements
        ? "Editando compra. Esta compra ya impacto stock: puedes corregir datos fiscales, proveedor y montos, pero no cambiar productos/cantidades."
        : "Editando compra. Revisa y guarda los cambios.";
      setStatus(statusMessage);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      setStatus("No se pudo cargar la compra para editar");
      toast.error("No se pudo cargar la compra para editar.");
    } finally {
      setIsLoadingPurchaseEdit(false);
    }
  };

  const handleCancelPurchaseEdit = () => {
    resetPurchaseForm();
    setStatus("Edicion cancelada.");
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const prepared = preparePurchaseForConfirmation({ skipArcaConsistency: true });
    if (!prepared) return;

    if (prepared.payload.validateWithArca) {
      const validation = await validateArcaFromForm("submit");
      if (!validation) return;
      const validationStatus = validation.status;
      if (validationStatus !== "AUTHORIZED" && validationStatus !== "OBSERVED") {
        return;
      }
      if (!validateArcaConsistency(prepared.total, validation.comprobante ?? null)) {
        return;
      }
    }

    setPendingPurchase(prepared);
  };

  const handleConfirmPurchase = async () => {
    if (!pendingPurchase) return;
    setIsSubmitting(true);
    try {
      const isEditing = Boolean(editingPurchaseId);
      const endpoint = isEditing
        ? `/api/purchases/${editingPurchaseId}/full`
        : "/api/purchases";
      const method = isEditing ? "PATCH" : "POST";

      const res = await fetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(pendingPurchase.payload),
      });
      const data = await res.json();
      if (!res.ok) {
        const message = data?.error ?? "No se pudo guardar";
        setStatus(message);
        toast.error(message);
        return;
      }

      resetPurchaseForm();
      setStatus(isEditing ? "Compra actualizada" : "Compra registrada");
      toast.success(isEditing ? "Compra actualizada." : "Compra registrada.");
      if (isEditing) {
        setPurchaseView("list");
      }
      await loadPurchases();
    } catch {
      setStatus("No se pudo guardar");
      toast.error("No se pudo guardar la compra.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRevalidatePurchase = async (purchaseId: string) => {
    setStatus(null);
    setRevalidatingPurchaseId(purchaseId);
    setRevalidationFeedback(null);
    try {
      const res = await fetch(`/api/purchases/${purchaseId}/revalidate`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) {
        const message = data?.error ?? "No se pudo revalidar";
        setStatus(message);
        toast.error(message);
        setRevalidationFeedback({
          purchaseId,
          status: "ERROR",
          message,
          checkedAt: null,
          request: null,
          details: [],
          hints: buildArcaHints([message]),
        });
        return;
      }
      const detailedMessages = Array.from(
        new Set([
          ...(typeof data?.message === "string" ? [data.message] : []),
          ...collectArcaMessages(data?.response ?? null),
        ]),
      );
      const friendlyDetails = dedupeArcaFriendlyDetails(
        collectArcaFriendlyDetails(data?.response ?? null),
      );
      const primaryMessage =
        typeof data?.message === "string" ? data.message.trim() : "";
      const primaryMessageKey = normalizeArcaDetailCompare(primaryMessage);
      const friendlyValueKeys = new Set(
        friendlyDetails
          .map((item) => normalizeArcaDetailCompare(item.value))
          .filter(Boolean),
      );
      const cleanedMessages = detailedMessages
        .map((item) => item.trim())
        .filter((item) => item.length > 0)
        .filter((item) => !isLowSignalArcaMessage(item));
      const fallbackHintMessage = primaryMessage;
      const hintMessages = Array.from(
        new Set(
          cleanedMessages.length
            ? cleanedMessages
            : fallbackHintMessage
              ? [fallbackHintMessage]
              : [],
        ),
      );
      const fallbackMessages = Array.from(
        new Set(
          cleanedMessages.filter((item) => {
            const normalized = normalizeArcaDetailCompare(item);
            if (!normalized) return false;
            if (primaryMessageKey && normalized === primaryMessageKey) return false;
            return !friendlyValueKeys.has(normalized);
          }),
        ),
      ).slice(0, 6);
      const fallbackMessageDetails = fallbackMessages.length
        ? [
            {
              label: "Mensaje del organismo",
              value: fallbackMessages.join(" • "),
            },
          ]
        : [];
      const details = dedupeArcaFriendlyDetails([
        ...friendlyDetails,
        ...fallbackMessageDetails,
      ]).slice(0, 40);
      const message = `Comprobante revalidado (${arcaStatusLabel(data.status)})`;
      setStatus(message);
      if (data.status === "AUTHORIZED") {
        toast.success(message);
      } else {
        toast.error(message);
      }
      setRevalidationFeedback({
        purchaseId,
        status: String(data.status ?? "ERROR"),
        message: String(data?.message ?? message),
        checkedAt:
          typeof data?.checkedAt === "string" ? data.checkedAt : undefined,
        request:
          data?.request && typeof data.request === "object"
            ? (data.request as Record<string, unknown>)
            : null,
        rawResponse: data?.response ?? null,
        details,
        hints: buildArcaHints(hintMessages),
      });
      await loadPurchases();
    } catch {
      setStatus("No se pudo revalidar");
      toast.error("No se pudo revalidar.");
      setRevalidationFeedback({
        purchaseId,
        status: "ERROR",
        message: "No se pudo revalidar.",
        checkedAt: null,
        request: null,
        details: [],
        hints: [],
      });
    } finally {
      setRevalidatingPurchaseId(null);
    }
  };

  const handleDeletePurchase = async (purchase: PurchaseRow) => {
    const reference = purchase.invoiceNumber?.trim() || purchase.id;
    const shouldDelete = window.confirm(
      `Vas a eliminar la compra ${reference} de ${purchase.supplierName}. Esta accion no se puede deshacer. Continuar?`,
    );
    if (!shouldDelete) return;

    setStatus(null);
    setDeletingPurchaseId(purchase.id);
    try {
      const res = await fetch(`/api/purchases/${purchase.id}`, {
        method: "DELETE",
      });
      const data = (await res.json()) as { error?: string; ok?: boolean };
      if (!res.ok) {
        const message = data?.error ?? "No se pudo eliminar la compra";
        setStatus(message);
        toast.error(message);
        return;
      }

      if (editingPurchaseId === purchase.id) {
        resetPurchaseForm();
        setPurchaseView("list");
      }
      if (revalidationFeedback?.purchaseId === purchase.id) {
        setRevalidationFeedback(null);
      }
      if (editingInvoicePurchase?.id === purchase.id) {
        setEditingInvoicePurchase(null);
        setRevalidateAfterInvoiceEdit(false);
      }
      if (editingPaymentPurchase?.id === purchase.id) {
        setEditingPaymentPurchase(null);
      }
      if (detailPurchase?.id === purchase.id) {
        setDetailPurchase(null);
        setDetailData(null);
        setDetailPurchaseError(null);
      }

      setStatus("Compra eliminada");
      toast.success("Compra eliminada.");
      await loadPurchases();
    } catch {
      setStatus("No se pudo eliminar la compra");
      toast.error("No se pudo eliminar la compra.");
    } finally {
      setDeletingPurchaseId(null);
    }
  };

  const openInvoiceEditor = (
    purchase: PurchaseRow,
    options?: { revalidateAfterSave?: boolean; closeRevalidation?: boolean },
  ) => {
    setEditingInvoicePurchase(purchase);
    setEditingInvoiceNumber(purchase.invoiceNumber ?? "");
    setEditingInvoiceDate(
      toCalendarDateInput(purchase.invoiceDate) ||
        toCalendarDateInput(purchase.createdAt) ||
        toDateInputValue(new Date()),
    );
    const voucherKind =
      purchase.fiscalVoucherKind === "A" ||
      purchase.fiscalVoucherKind === "B" ||
      purchase.fiscalVoucherKind === "C"
        ? purchase.fiscalVoucherKind
        : purchaseVoucherKindFromFiscalType(purchase.fiscalVoucherType);
    setEditingVoucherKind(voucherKind);
    setEditingAuthorizationCode(purchase.authorizationCode ?? "");
    setRevalidateAfterInvoiceEdit(Boolean(options?.revalidateAfterSave));
    if (options?.closeRevalidation) {
      setRevalidationFeedback(null);
    }
  };

  const closeInvoiceEditor = () => {
    if (isSavingInvoiceEdit) return;
    setEditingInvoicePurchase(null);
    setRevalidateAfterInvoiceEdit(false);
  };

  const handleSaveInvoiceEdit = async () => {
    if (!editingInvoicePurchase) return;
    const normalizedInvoiceNumber = editingInvoiceNumber.trim();
    if (!normalizedInvoiceNumber) {
      const message = "Ingresa numero de comprobante.";
      setStatus(message);
      toast.error(message);
      return;
    }
    if (!isInvoiceNumberWithDashFormat(normalizedInvoiceNumber)) {
      const message =
        "El numero de comprobante debe tener formato 0001-00001234 (con guion).";
      setStatus(message);
      toast.error(message);
      return;
    }
    if (!editingInvoiceDate) {
      const message = "Ingresa fecha del comprobante.";
      setStatus(message);
      toast.error(message);
      return;
    }

    setStatus(null);
    setIsSavingInvoiceEdit(true);
    try {
      const res = await fetch(
        `/api/purchases/${editingInvoicePurchase.id}/invoice`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            hasInvoice: true,
            invoiceNumber: normalizedInvoiceNumber,
            invoiceDate: editingInvoiceDate,
            voucherKind: editingVoucherKind,
            authorizationCode: editingAuthorizationCode.trim() || null,
          }),
        },
      );
      const data = await res.json();
      if (!res.ok) {
        const message = data?.error ?? "No se pudo guardar la edicion";
        setStatus(message);
        toast.error(message);
        return;
      }

      const purchaseId = editingInvoicePurchase.id;
      const shouldRevalidate = revalidateAfterInvoiceEdit;
      const successMessage = data?.message ?? "Comprobante actualizado";

      setStatus(successMessage);
      toast.success(successMessage);
      setEditingInvoicePurchase(null);
      setRevalidateAfterInvoiceEdit(false);
      await loadPurchases();

      if (shouldRevalidate) {
        await handleRevalidatePurchase(purchaseId);
      }
    } catch {
      const message = "No se pudo guardar la edicion";
      setStatus(message);
      toast.error(message);
    } finally {
      setIsSavingInvoiceEdit(false);
    }
  };

  const openPaymentModeEditor = (purchase: PurchaseRow) => {
    const totalAmount = Number(purchase.total ?? 0);
    setEditingPaymentPurchase(purchase);
    setEditingPaymentMode(inferPurchasePaymentMode(purchase));
    setEditingCashOutLines([
      buildCashOutLine(
        paymentMethods,
        accounts,
        totalAmount > 0 ? toMoneyValue(totalAmount) : "",
      ),
    ]);
    setEditingPaidAt(
      toCalendarDateInput(purchase.invoiceDate) ||
        toCalendarDateInput(purchase.createdAt) ||
        toDateInputValue(new Date()),
    );
  };

  const closePaymentModeEditor = () => {
    if (isUpdatingPaymentMode) return;
    setEditingPaymentPurchase(null);
  };

  const openSupplierGroupedPayment = (purchase: PurchaseRow) => {
    setEditingPaymentPurchase(null);
    setSupplierGroupedPaymentPurchase(purchase);
  };

  const closeSupplierGroupedPayment = () => {
    setSupplierGroupedPaymentPurchase(null);
  };

  const closePurchaseDetail = () => {
    detailRequestRef.current += 1;
    setDetailPurchase(null);
    setDetailData(null);
    setDetailPurchaseError(null);
    setIsLoadingDetailPurchase(false);
  };

  const openPurchaseDetail = async (purchase: PurchaseRow) => {
    const requestId = detailRequestRef.current + 1;
    detailRequestRef.current = requestId;
    setDetailPurchase(purchase);
    setDetailData(null);
    setDetailPurchaseError(null);
    setIsLoadingDetailPurchase(true);
    try {
      const res = await fetch(`/api/purchases/${purchase.id}`, {
        cache: "no-store",
      });
      const data = (await res.json()) as PurchaseEditResponse | { error?: string };
      if (!res.ok) {
        const message =
          typeof data === "object" &&
          data !== null &&
          "error" in data &&
          typeof data.error === "string"
            ? data.error
            : "No se pudo cargar el detalle de la compra";
        if (detailRequestRef.current !== requestId) return;
        setDetailPurchaseError(message);
        return;
      }

      if (detailRequestRef.current !== requestId) return;
      setDetailData(data as PurchaseEditResponse);
    } catch {
      if (detailRequestRef.current !== requestId) return;
      setDetailPurchaseError("No se pudo cargar el detalle de la compra");
    } finally {
      if (detailRequestRef.current !== requestId) return;
      setIsLoadingDetailPurchase(false);
    }
  };

  const handleDetailEdit = () => {
    if (!detailPurchase) return;
    const purchaseId = detailPurchase.id;
    closePurchaseDetail();
    void handleStartPurchaseEdit(purchaseId);
  };

  const handleDetailPayment = () => {
    if (!detailPurchase) return;
    const selectedPurchase = detailPurchase;
    closePurchaseDetail();
    openPaymentModeEditor(selectedPurchase);
  };

  const handleDetailRevalidate = () => {
    if (!detailPurchase?.hasInvoice) return;
    const purchaseId = detailPurchase.id;
    closePurchaseDetail();
    void handleRevalidatePurchase(purchaseId);
  };

  const handleDetailDelete = () => {
    if (!detailPurchase) return;
    const selectedPurchase = detailPurchase;
    closePurchaseDetail();
    void handleDeletePurchase(selectedPurchase);
  };

  const handleSupplierGroupedPaymentCreated = async () => {
    await loadPurchases();
    const message = "Pago a proveedor registrado";
    setStatus(message);
    toast.success(message);
  };

  const closeRevalidationFeedback = () => {
    setRevalidationFeedback(null);
  };

  const addCashOutLine = () => {
    setCashOutLines((prev) => [...prev, buildCashOutLine(paymentMethods, accounts)]);
  };

  const removeCashOutLine = (index: number) => {
    setCashOutLines((prev) => prev.filter((_, currentIndex) => currentIndex !== index));
  };

  const updateCashOutLine = (index: number, updates: Partial<CashOutLineForm>) => {
    setCashOutLines((prev) => {
      const next = [...prev];
      const current = next[index];
      if (!current) return prev;
      const updated: CashOutLineForm = { ...current, ...updates };
      if (updates.paymentMethodId !== undefined) {
        updated.accountId = resolveDefaultCashOutAccountId(
          updates.paymentMethodId,
          paymentMethods,
          accounts,
        );
      }
      if (updates.amount !== undefined) {
        updated.amount = normalizeDecimalInput(updates.amount, 2);
      }
      next[index] = updated;
      return next;
    });
  };

  const addEditingCashOutLine = () => {
    setEditingCashOutLines((prev) => [
      ...prev,
      buildCashOutLine(paymentMethods, accounts),
    ]);
  };

  const removeEditingCashOutLine = (index: number) => {
    setEditingCashOutLines((prev) =>
      prev.filter((_, currentIndex) => currentIndex !== index),
    );
  };

  const updateEditingCashOutLine = (
    index: number,
    updates: Partial<CashOutLineForm>,
  ) => {
    setEditingCashOutLines((prev) => {
      const next = [...prev];
      const current = next[index];
      if (!current) return prev;
      const updated: CashOutLineForm = { ...current, ...updates };
      if (updates.paymentMethodId !== undefined) {
        updated.accountId = resolveDefaultCashOutAccountId(
          updates.paymentMethodId,
          paymentMethods,
          accounts,
        );
      }
      if (updates.amount !== undefined) {
        updated.amount = normalizeDecimalInput(updates.amount, 2);
      }
      next[index] = updated;
      return next;
    });
  };

  const handleUpdatePurchasePaymentMode = async () => {
    if (!editingPaymentPurchase) return;
    setIsUpdatingPaymentMode(true);
    setStatus(null);
    try {
      const payload: Record<string, unknown> = {
        paymentMode: editingPaymentMode,
      };
      if (editingPaidAt) {
        payload.paidAt = editingPaidAt;
      }
      if (editingPaymentMode === "IMMEDIATE_CASH_OUT") {
        const normalizedLines = editingCashOutLines
          .map((line) => ({
            paymentMethodId: line.paymentMethodId,
            accountId: paymentMethodRequiresAccount(
              line.paymentMethodId,
              paymentMethods,
            )
              ? line.accountId
              : undefined,
            amount: Number(line.amount || 0),
          }))
          .filter((line) => line.amount > 0);

        if (!normalizedLines.length) {
          const message = "Agrega al menos una linea para registrar el pago.";
          setStatus(message);
          toast.error(message);
          return;
        }

        const invalidLine = normalizedLines.some((line) => {
          if (!line.paymentMethodId || line.amount <= 0) return true;
          const method = paymentMethods.find(
            (candidate) => candidate.id === line.paymentMethodId,
          );
          if (!method) return true;
          return method.requiresAccount && !line.accountId;
        });
        if (invalidLine) {
          const message =
            "Completa metodo y monto en cada linea. Selecciona cuenta solo cuando corresponda.";
          setStatus(message);
          toast.error(message);
          return;
        }

        const linesTotal = roundMoney(
          normalizedLines.reduce((sum, line) => sum + line.amount, 0),
        );
        const purchaseTotal = roundMoney(Number(editingPaymentPurchase.total ?? 0));
        if (Math.abs(linesTotal - purchaseTotal) > 0.01) {
          const message =
            "La suma de lineas debe coincidir con el total de la compra.";
          setStatus(message);
          toast.error(message);
          return;
        }

        payload.cashOutLines = normalizedLines;
      }

      const res = await fetch(`/api/purchases/${editingPaymentPurchase.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        const message = data?.error ?? "No se pudo actualizar la compra";
        setStatus(message);
        toast.error(message);
        return;
      }

      const message = data?.message ?? "Compra actualizada";
      setStatus(message);
      toast.success(message);
      setEditingPaymentPurchase(null);
      await loadPurchases();
    } catch {
      setStatus("No se pudo actualizar la compra");
      toast.error("No se pudo actualizar la compra.");
    } finally {
      setIsUpdatingPaymentMode(false);
    }
  };

  const handleDownloadPurchasesReport = (format: "csv" | "pdf") => {
    const params = new URLSearchParams();
    params.set("format", format);
    if (reportFrom) params.set("from", reportFrom);
    if (reportTo) params.set("to", reportTo);
    window.location.href = `/api/purchases/report?${params.toString()}`;
  };

  const totalPurchases = purchases.length;
  const totalAmountRegistered = purchases.reduce((sum, purchase) => {
    const value = Number(purchase.total ?? 0);
    return Number.isFinite(value) ? sum + value : sum;
  }, 0);
  const impactCount = purchases.filter((purchase) => purchase.impactsAccount)
    .length;

  const filteredPurchases = useMemo(() => {
    const normalized = normalizeQuery(query);
    const next = purchases.filter((purchase) => {
      if (!normalized) return true;
      const haystack = normalizeQuery(
        `${purchase.supplierName} ${purchase.invoiceNumber ?? ""}`,
      );
      return haystack.includes(normalized);
    });

    next.sort((a, b) => {
      const aTime =
        toCalendarDateTimestamp(a.invoiceDate) ||
        new Date(a.createdAt).getTime();
      const bTime =
        toCalendarDateTimestamp(b.invoiceDate) ||
        new Date(b.createdAt).getTime();
      return sortOrder === "oldest" ? aTime - bTime : bTime - aTime;
    });

    return next;
  }, [purchases, query, sortOrder]);

  const selectedSupplierVerificationStatus =
    selectedSupplier?.arcaVerificationStatus ?? "PENDING";
  const selectedSupplierEffectiveTaxId =
    normalizeTaxId(selectedSupplierTaxId) ||
    normalizeTaxId(selectedSupplier?.taxId ?? "");
  const selectedSupplierHasTaxId = Boolean(
    selectedSupplierEffectiveTaxId,
  );
  const shouldShowSupplierDataNotice = Boolean(
    selectedSupplier &&
      (!selectedSupplierHasTaxId ||
        selectedSupplierVerificationStatus !== "MATCH"),
  );
  const supplierNoticeTone =
    selectedSupplierVerificationStatus === "MISMATCH" ||
    selectedSupplierVerificationStatus === "NO_ENCONTRADO" ||
    selectedSupplierVerificationStatus === "ERROR"
      ? "rose"
      : "amber";
  const supplierNoticeMessage = !selectedSupplierHasTaxId
    ? "Falta CUIT para validar comprobantes y ordenar la ficha del proveedor."
    : selectedSupplierVerificationStatus === "PARTIAL"
      ? "La razon social tiene coincidencia parcial con ARCA."
      : selectedSupplierVerificationStatus === "MISMATCH"
        ? "La razon social no coincide con ARCA."
        : selectedSupplierVerificationStatus === "NO_ENCONTRADO"
          ? "ARCA no encontro un proveedor para ese CUIT. Revisa que este bien escrito."
          : selectedSupplierVerificationStatus === "ERROR"
            ? selectedSupplier?.arcaVerificationMessage ??
              "No se pudo verificar el proveedor."
            : "Proveedor pendiente de verificacion ARCA.";
  const supplierDataNotice = shouldShowSupplierDataNotice ? (
    <InlineDataNotice
      tone={supplierNoticeTone}
      title="Datos del proveedor"
      message={supplierNoticeMessage}
    >
      <div className="grid gap-2 sm:grid-cols-[minmax(140px,1fr)_auto]">
        <input
          className="input h-8 text-xs"
          value={selectedSupplierTaxId}
          onChange={(event) =>
            setSelectedSupplierTaxId(normalizeTaxId(event.target.value))
          }
          placeholder="CUIT"
          inputMode="numeric"
        />
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            className="btn h-8 px-2 text-[11px]"
            onClick={handleLookupAndSaveSelectedSupplier}
            disabled={isUpdatingSelectedSupplier}
          >
            {isUpdatingSelectedSupplier ? "Buscando..." : "Buscar ARCA"}
          </button>
          <button
            type="button"
            className="btn h-8 px-2 text-[11px]"
            onClick={handleSaveSelectedSupplierTaxId}
            disabled={isUpdatingSelectedSupplier}
          >
            Guardar
          </button>
          {selectedSupplierHasTaxId ? (
            <button
              type="button"
              className="btn h-8 px-2 text-[11px]"
              onClick={handleVerifySelectedSupplier}
              disabled={isVerifyingSelectedSupplier}
            >
              {isVerifyingSelectedSupplier ? "Verificando..." : "Verificar"}
            </button>
          ) : null}
        </div>
      </div>
      {supplierDataStatus ? (
        <p className="mt-1.5 text-[11px] text-zinc-500">
          {supplierDataStatus}
        </p>
      ) : null}
    </InlineDataNotice>
  ) : null;
  const confirmationRows = pendingPurchase
    ? [
        { label: "Proveedor", value: pendingPurchase.supplierLabel },
        { label: "Fecha", value: pendingPurchase.dateLabel },
        { label: "Comprobante fiscal", value: pendingPurchase.invoiceLabel },
        { label: "Total", value: formatCurrencyARS(pendingPurchase.total) },
        {
          label: "IVA",
          value:
            pendingPurchase.vatAmount !== null
              ? formatCurrencyARS(pendingPurchase.vatAmount)
              : "Sin IVA",
        },
        {
          label: "Productos",
          value: pendingPurchase.productCount
            ? `${pendingPurchase.productCount} item${
                pendingPurchase.productCount === 1 ? "" : "s"
              } · ${formatCurrencyARS(pendingPurchase.productTotal)}`
            : "Sin detalle",
        },
        {
          label: "Percepciones",
          value: formatCurrencyARS(pendingPurchase.fiscalOtherTotal),
        },
        {
          label: "Diferencia fiscal",
          value: formatCurrencyARS(pendingPurchase.fiscalDifference),
        },
        { label: "Pago", value: pendingPurchase.paymentLabel },
      ]
    : [];
  const revalidationPurchase = revalidationFeedback
    ? purchases.find((purchase) => purchase.id === revalidationFeedback.purchaseId) ??
      null
    : null;
  const revalidationArcaVoucherDate = revalidationFeedback
    ? revalidationFeedback.details.find((detail) => detail.label === "Fecha del comprobante")
        ?.value ?? null
    : null;
  const revalidationRequestVoucherDate = revalidationFeedback?.request
    ? formatArcaRequestDate(revalidationFeedback.request.voucherDate)
    : null;
  const hasRevalidationDateMismatch =
    Boolean(revalidationArcaVoucherDate) &&
    Boolean(revalidationRequestVoucherDate) &&
    normalizeCalendarDateForCompare(revalidationArcaVoucherDate) !==
      normalizeCalendarDateForCompare(revalidationRequestVoucherDate);
  const detailPaymentStatus = detailPurchase
    ? getPurchasePaymentStatus(detailPurchase)
    : { label: "No", tone: "none" as const };
  const detailArcaStatusLabel = detailPurchase
    ? detailPurchase.hasInvoice
      ? `ARCA ${arcaStatusLabel(detailPurchase.arcaValidationStatus)}`
      : "Registro interno · No computable fiscalmente"
    : "Registro interno";
  const purchasesTableColSpan = purchaseListMode === "finance" ? 11 : 7;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900">Compras</h1>
        <p className="mt-2 text-sm text-zinc-600">
          Carga compras con o sin factura y registra egresos.
        </p>
      </div>

      <div className="flex flex-row flex-wrap gap-2">
          <div className="min-w-0 flex-1 basis-[calc(33.333%-0.5rem)] rounded-2xl border border-zinc-200 bg-white/80 p-3">
            <div className="flex flex-col items-start gap-1">
              <span className="text-[10px] font-medium leading-tight text-zinc-500">
                Compras
              </span>
              <p className="text-sm font-semibold leading-tight text-zinc-900">
                {totalPurchases}
              </p>
            </div>
          </div>
          <div className="min-w-0 flex-1 basis-[calc(33.333%-0.5rem)] rounded-2xl border border-zinc-200 bg-white/80 p-3">
            <div className="flex flex-col items-start gap-1">
              <span className="text-[10px] font-medium leading-tight text-zinc-500">
                Impactan cta. cte.
              </span>
              <p className="text-sm font-semibold leading-tight text-zinc-900">
                {impactCount}
              </p>
            </div>
          </div>
          <div className="min-w-0 flex-1 basis-[calc(33.333%-0.5rem)] rounded-2xl border border-zinc-200 bg-white/80 p-3">
            <div className="flex flex-col items-start gap-1">
              <span className="text-[10px] font-medium leading-tight text-zinc-500">
                Total registrado
              </span>
              <p className="text-sm font-semibold leading-tight text-zinc-900">
                {formatCurrencyARS(totalAmountRegistered)}
              </p>
            </div>
          </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative inline-grid w-full grid-cols-2 rounded-2xl border border-zinc-200/70 bg-white/55 p-1.5 sm:w-auto">
          <span
            aria-hidden="true"
            className={`pointer-events-none absolute inset-y-1.5 left-1.5 w-[calc(50%-0.375rem)] rounded-xl border border-sky-200 bg-white shadow-[0_4px_10px_-8px_rgba(14,116,144,0.32)] transition-transform duration-200 ease-out ${
              purchaseView === "list" ? "translate-x-full" : ""
            }`}
          />
          <button
            type="button"
            className={`relative z-10 inline-flex items-center justify-center rounded-xl px-3 py-2.5 text-xs font-semibold transition-colors sm:px-6 sm:text-sm ${
              purchaseView === "new" ? "text-sky-900" : "text-zinc-600"
            }`}
            onClick={() => setPurchaseView("new")}
            aria-pressed={purchaseView === "new"}
          >
            Nueva compra
          </button>
          <button
            type="button"
            className={`relative z-10 inline-flex items-center justify-center rounded-xl px-3 py-2.5 text-xs font-semibold transition-colors sm:px-6 sm:text-sm ${
              purchaseView === "list" ? "text-sky-900" : "text-zinc-600"
            }`}
            onClick={() => setPurchaseView("list")}
            aria-pressed={purchaseView === "list"}
          >
            Compras
          </button>
        </div>
      </div>

      {purchaseView === "new" ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold text-zinc-900">
              {editingPurchaseId ? "Editar compra" : "Nueva compra"}
            </h2>
            {editingPurchaseId ? (
              <button
                type="button"
                className="btn text-xs"
                onClick={handleCancelPurchaseEdit}
              >
                Cancelar edicion
              </button>
            ) : null}
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <PurchaseSection
              title="Proveedor y comprobante"
              summary={supplierSectionSummary}
              open={openPurchaseSection === "supplier"}
              error={highlightedSection === "supplier"}
              onToggle={() => setOpenPurchaseSection("supplier")}
              className="order-1"
            >
              <div className="grid gap-4 md:grid-cols-3">
              <label className="field-stack min-w-0 w-full md:col-span-2">
                <span className="input-label">Proveedor</span>
                <div className="relative">
                  <input
                    className="input w-full"
                    value={supplierSearch}
                    onChange={(event) =>
                      handleSupplierSearchChange(event.target.value)
                    }
                    onFocus={() => {
                      setIsSupplierOpen(true);
                      setSupplierActiveIndex(0);
                    }}
                    onBlur={() => {
                      window.setTimeout(() => setIsSupplierOpen(false), 120);
                    }}
                    onKeyDown={handleSupplierKeyDown}
                    placeholder="Buscar proveedor por nombre o CUIT"
                    autoComplete="off"
                    role="combobox"
                    aria-autocomplete="list"
                    aria-haspopup="listbox"
                    aria-expanded={isSupplierOpen}
                    aria-controls="purchase-supplier-options"
                    aria-activedescendant={
                      isSupplierOpen && supplierMatches[supplierActiveIndex]
                        ? `purchase-supplier-option-${
                            supplierMatches[supplierActiveIndex].id
                          }`
                        : undefined
                    }
                  />
                  <AnimatePresence>
                    {isSupplierOpen ? (
                      <motion.div
                        key="purchase-supplier-options"
                        id="purchase-supplier-options"
                        role="listbox"
                        aria-label="Proveedores"
                        initial={{ opacity: 0, y: -8, scale: 0.98 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -8, scale: 0.98 }}
                        transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
                        className="absolute z-20 mt-2 w-full rounded-2xl border border-zinc-200/70 bg-white/90 p-2 shadow-[0_10px_20px_-16px_rgba(82,82,91,0.38)] backdrop-blur-xl"
                      >
                        {supplierMatches.length ? (
                          supplierMatches.map((supplier, matchIndex) => {
                            const isSelected = supplier.id === supplierId;
                            const isActive = matchIndex === supplierActiveIndex;
                            return (
                              <button
                                key={supplier.id}
                                type="button"
                                id={`purchase-supplier-option-${supplier.id}`}
                                role="option"
                                aria-selected={isSelected}
                                className={`flex w-full items-center justify-between rounded-2xl px-3 py-2 text-left text-sm transition ${
                                  isActive
                                    ? "bg-white text-sky-900"
                                    : isSelected
                                      ? "bg-white text-sky-900"
                                      : "hover:bg-white/70"
                                }`}
                                onMouseDown={(event) => {
                                  event.preventDefault();
                                  handleSupplierSelect(supplier);
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
                        ) : isSupplierMatchesLoading ? (
                          <div className="px-3 py-2 text-xs text-zinc-500">
                            Buscando...
                          </div>
                        ) : (
                          <div className="px-3 py-2 text-xs text-zinc-500">
                            Sin resultados.
                          </div>
                        )}
                      </motion.div>
                    ) : null}
                  </AnimatePresence>
                </div>
                {supplierDataNotice}
              </label>

              <label className="field-stack min-w-0 w-full">
                <span className="input-label">Fecha comprobante</span>
                <input
                  type="date"
                  className={`input w-full min-w-0 cursor-pointer ${getHighlightClass("invoice.invoiceDate")}`}
                  value={invoiceDate}
                  onChange={(event) => setInvoiceDate(event.target.value)}
                />
              </label>
              </div>
            </PurchaseSection>

            <PurchaseSection
              title="Totales y detalle fiscal"
              summary={totalsSectionSummary}
              open={openPurchaseSection === "totals"}
              error={highlightedSection === "totals"}
              onToggle={() => setOpenPurchaseSection("totals")}
              className="order-4"
            >
              <div className="space-y-4">
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                  <label className="field-stack min-w-0">
                    <span className="input-label">Neto</span>
                    <div className="relative">
                      <span className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-xs font-semibold text-zinc-500">
                        $
                      </span>
                      <MoneyInput
                        className={`input no-spinner w-full pl-10 text-right tabular-nums ${getHighlightClass("totals.netTaxed")}`}
                        value={simpleNetAmount}
                        onValueChange={(value) => {
                          setSimpleNetAmount(value);
                          if (includeProductDetails && hasPurchaseProductTotals) {
                            setTotalsSource("MANUAL");
                          }
                        }}
                        placeholder="0,00"
                        maxDecimals={2}
                      />
                    </div>
                  </label>
                  <label className="field-stack min-w-0">
                    <span className="input-label">Condicion</span>
                    {isInternalRecord ? (
                      <input
                        className="input w-full min-w-0 bg-zinc-50 text-zinc-600"
                        value="Registro interno"
                        title="Registro interno (no computable fiscalmente)"
                        readOnly
                      />
                    ) : (
                      <select
                        className="input w-full min-w-0 cursor-pointer"
                        value={simpleFiscalCondition}
                        onChange={(event) => {
                          const next = event.target.value as SimpleFiscalCondition;
                          setSimpleFiscalCondition(next);
                          if (next !== "GRAVADO") {
                            setPurchaseVatAmount("0");
                          }
                          if (includeProductDetails && hasPurchaseProductTotals) {
                            setTotalsSource("MANUAL");
                          }
                        }}
                      >
                        {SIMPLE_FISCAL_CONDITION_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    )}
                  </label>
                  <label className="field-stack min-w-0">
                    <span className="input-label">
                      {isInternalRecord
                        ? "IVA interno (no computable)"
                        : "IVA compra"}
                    </span>
                    <div className="relative">
                      <span className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-xs font-semibold text-zinc-500">
                        $
                      </span>
                      <MoneyInput
                        className={`input no-spinner w-full pl-10 text-right tabular-nums ${getHighlightClass("totals.vatAmount")}`}
                        value={
                          isInternalRecord
                            ? purchaseVatAmount
                            : simpleFiscalCondition === "GRAVADO"
                            ? purchaseVatAmount
                            : "0"
                        }
                        onValueChange={(value) => {
                          if (!isInternalRecord && simpleFiscalCondition !== "GRAVADO") {
                            return;
                          }
                          setPurchaseVatAmount(value);
                          if (includeProductDetails && hasPurchaseProductTotals) {
                            setTotalsSource("MANUAL");
                          }
                        }}
                        placeholder="0,00"
                        maxDecimals={2}
                        readOnly={!isInternalRecord && simpleFiscalCondition !== "GRAVADO"}
                      />
                    </div>
                    {isInternalRecord ? (
                      <p className="text-[11px] text-zinc-500">
                        No genera credito fiscal de IVA sin comprobante fiscal.
                      </p>
                    ) : null}
                  </label>
                  <label className="field-stack min-w-0">
                    <span className="input-label">Descuento global</span>
                    <div className="relative">
                      <span className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-xs font-semibold text-zinc-500">
                        $
                      </span>
                      <MoneyInput
                        className="input no-spinner w-full pl-10 text-right tabular-nums"
                        value={globalDiscountAmount}
                        onValueChange={setGlobalDiscountAmount}
                        placeholder="0,00"
                        maxDecimals={2}
                      />
                    </div>
                  </label>
                  <div className="field-stack min-w-0">
                    <span className="input-label text-right">Total compra</span>
                    <div className="flex min-h-11 w-full items-center justify-end text-right text-lg font-semibold tabular-nums text-zinc-900">
                      {effectiveTotalAmount
                        ? formatCurrencyARS(parseOptionalNumber(effectiveTotalAmount) ?? 0)
                        : "0,00"}
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="space-y-1">
                    {isInternalRecord ? (
                      <p className="text-xs text-zinc-600">
                        Sin comprobante fiscal: se guarda como registro interno y no
                        computa para IVA ni reportes fiscales.
                      </p>
                    ) : null}
                    {totalsSource === "MANUAL" && hasPurchaseProductTotals ? (
                      <p className="text-[11px] font-medium text-amber-700">
                        Modo manual activo: el calculo automatico desde productos
                        quedo pausado porque editaste importes.
                      </p>
                    ) : null}
                    {totalsSource === "AUTO_FROM_PRODUCTS" && !hasPurchaseProductTotals ? (
                      <p className="text-xs text-amber-700">
                        Carga al menos un producto completo para calcular total e IVA en modo
                        automatico.
                      </p>
                    ) : null}
                    {hasProductTotalMismatch ? (
                      <p className="text-xs text-amber-700">
                        El total esperado por productos ({formatCurrencyARS(
                          expectedTotalFromProducts,
                        )}) no coincide con el monto de compra ({formatCurrencyARS(
                          effectiveTotalNumeric,
                        )}). Diferencia {formatCurrencyARS(productTotalDifference)}.
                      </p>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    className={`btn text-xs ${showFiscalDetail ? "" : "btn-sky"}`}
                    onClick={toggleFiscalEditor}
                    disabled={isInternalRecord}
                  >
                    {showFiscalDetail ? "Ocultar avanzado" : "Avanzado"}
                  </button>
                </div>

                <AnimatePresence initial={false}>
                  {showFiscalDetail ? (
                    <motion.div
                      key="purchase-fiscal-editor"
                      initial={{ opacity: 0, y: -6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -6 }}
                      transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
                      className="space-y-3"
                    >
                      <div className="grid gap-3 sm:grid-cols-3">
                        <label className="field-stack min-w-0">
                          <span className="input-label">Neto gravado</span>
                          <MoneyInput
                            className={`input no-spinner w-full min-w-0 text-right tabular-nums ${getHighlightClass("totals.netTaxed")}`}
                            value={netTaxedAmount}
                            onValueChange={(value) => {
                              setNetTaxedAmount(value);
                              if (includeProductDetails && hasPurchaseProductTotals) {
                                setTotalsSource("MANUAL");
                              }
                            }}
                            placeholder="0,00"
                            maxDecimals={2}
                          />
                        </label>
                        <label className="field-stack min-w-0">
                          <span className="input-label">No gravado</span>
                          <MoneyInput
                            className="input no-spinner w-full min-w-0 text-right tabular-nums"
                            value={netNonTaxedAmount}
                            onValueChange={setNetNonTaxedAmount}
                            placeholder="0,00"
                            maxDecimals={2}
                          />
                        </label>
                        <label className="field-stack min-w-0">
                          <span className="input-label">Exento</span>
                          <MoneyInput
                            className="input no-spinner w-full min-w-0 text-right tabular-nums"
                            value={exemptAmount}
                            onValueChange={setExemptAmount}
                            placeholder="0,00"
                            maxDecimals={2}
                          />
                        </label>
                      </div>
                    </motion.div>
                  ) : null}
                </AnimatePresence>

                <div className="flex flex-row flex-wrap gap-3 border-y border-zinc-200/70 py-3">
                  {fiscalSummaryItems.map((item) => {
                    const isDifference = item.label === "Diferencia";
                    return (
                      <div
                        key={item.label}
                        className="min-w-0 flex-1 basis-[calc(33.333%-0.5rem)]"
                      >
                        <span className="block text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                          {item.label}
                        </span>
                        <span
                          className={`mt-1 block text-sm font-semibold tabular-nums ${
                            isDifference
                              ? fiscalDifferenceOk
                                ? "text-emerald-700"
                                : "text-rose-700"
                              : "text-zinc-900"
                          }`}
                        >
                          {formatCurrencyARS(item.value)}
                        </span>
                      </div>
                    );
                  })}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span
                    className={
                      fiscalDifferenceOk ? "text-emerald-700" : "text-rose-700"
                    }
                  >
                    {fiscalDifferenceOk
                      ? "Total fiscal consistente"
                      : `Revisar diferencia ${formatCurrencyARS(
                          fiscalPreview.difference,
                        )}`}
                  </span>
                  <span className="text-zinc-500">
                    {fiscalLines.length
                      ? `${fiscalLines.length} tributo${
                          fiscalLines.length === 1 ? "" : "s"
                        } cargado${fiscalLines.length === 1 ? "" : "s"}`
                      : "Sin percepciones cargadas"}
                  </span>
                </div>

              </div>
            </PurchaseSection>

            <PurchaseSection
              title="Productos"
              summary={productsSectionSummary}
              open={openPurchaseSection === "products"}
              error={highlightedSection === "products"}
              onToggle={() => setOpenPurchaseSection("products")}
              className="order-3"
            >
              <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                    Productos
                  </p>
                  <p className="text-xs text-zinc-500">
                    {includeProductDetails
                      ? `${normalizedPurchaseProducts.length} items · ${formatCurrencyARS(
                          productTotals.total,
                        )}`
                      : "Compra rápida sin detalle de productos"}
                  </p>
                </div>
                <MiniToggle
                  checked={includeProductDetails}
                  onChange={(next) => {
                    setIncludeProductDetails(next);
                    if (!next) {
                      setTotalsSource("MANUAL");
                      setAdjustStock(false);
                      setOpenProductIndex(null);
                    } else {
                      setTotalsSource(
                        parsePositiveNumber(effectiveTotalAmount)
                          ? "MANUAL"
                          : "AUTO_FROM_PRODUCTS",
                      );
                    }
                  }}
                  label="Cargar productos"
                />
              </div>

              {includeProductDetails ? (
                <>
                  <div className="space-y-2">
                    {purchaseProducts.map((item, index) => {
                      const matches = getProductMatches(item.productSearch);
                      const isOpen = openProductIndex === index;
                      const selectedProduct = productMap.get(item.productId);
                      const qty = parseOptionalNumber(item.qty) ?? 0;
                      const unitCost = parseOptionalNumber(item.unitCost) ?? 0;
                      const discountPercent = Math.max(
                        0,
                        Math.min(
                          100,
                          parseOptionalNumber(item.discountPercent) ?? 0,
                        ),
                      );
                      const taxRate = parseOptionalNumber(item.taxRate) ?? 0;
                      const lineGrossSubtotal = qty * unitCost;
                      const lineDiscount = roundMoney(
                        lineGrossSubtotal * (discountPercent / 100),
                      );
                      const lineSubtotal = Math.max(
                        0,
                        lineGrossSubtotal - lineDiscount,
                      );
                      const lineTax = lineSubtotal * (taxRate / 100);
                      const lineTotal = lineSubtotal + lineTax;
                      const searchedProductName = item.productSearch.trim();
                      const canCreateProduct =
                        searchedProductName.length >= 2 &&
                        !matches.some(
                          (product) =>
                            normalizeQuery(product.name) ===
                              normalizeQuery(searchedProductName) ||
                            product.id === item.productId,
                        );

                      return (
                        <div
                          key={`purchase-product-${index}`}
                          className="grid gap-4 border-t border-zinc-200/70 py-3 first:border-t-0 lg:grid-cols-[minmax(220px,1fr)_96px_136px_108px_112px_104px_40px] lg:items-start xl:grid-cols-[minmax(280px,1fr)_100px_144px_112px_120px_112px_40px]"
                        >
                          <label className="field-stack min-w-0">
                            <span className="input-label">Producto</span>
                            <div className="relative">
                              <input
                                className="input w-full"
                                value={item.productSearch}
                                onChange={(event) => {
                                  handlePurchaseProductChange(
                                    index,
                                    "productSearch",
                                    event.target.value,
                                  );
                                  setOpenProductIndex(index);
                                  setProductActiveIndex(0);
                                }}
                                onFocus={() => {
                                  setOpenProductIndex(index);
                                  setProductActiveIndex(0);
                                }}
                                onBlur={() => {
                                  window.setTimeout(() => {
                                    setOpenProductIndex((current) =>
                                      current === index ? null : current,
                                    );
                                  }, 120);
                                }}
                                onKeyDown={(event) =>
                                  handlePurchaseProductKeyDown(
                                    event,
                                    index,
                                    matches,
                                  )
                                }
                                placeholder="Buscar o crear producto"
                                autoComplete="off"
                                role="combobox"
                                aria-autocomplete="list"
                                aria-haspopup="listbox"
                                aria-expanded={isOpen}
                                aria-controls={`purchase-product-options-${index}`}
                                aria-activedescendant={
                                  isOpen && matches[productActiveIndex]
                                    ? `purchase-product-option-${index}-${
                                        matches[productActiveIndex].id
                                      }`
                                    : undefined
                                }
                              />
                              <AnimatePresence>
                                {isOpen ? (
                                  <motion.div
                                    key={`purchase-product-options-${index}`}
                                    id={`purchase-product-options-${index}`}
                                    role="listbox"
                                    aria-label="Productos"
                                    initial={{ opacity: 0, y: -8, scale: 0.98 }}
                                    animate={{ opacity: 1, y: 0, scale: 1 }}
                                    exit={{ opacity: 0, y: -8, scale: 0.98 }}
                                    transition={{
                                      duration: 0.18,
                                      ease: [0.22, 1, 0.36, 1],
                                    }}
                                    className="absolute z-[90] mt-2 max-h-64 w-full overflow-y-auto rounded-xl border border-zinc-200/70 bg-white/95 p-2 shadow-[0_14px_24px_-18px_rgba(82,82,91,0.45)] backdrop-blur-xl"
                                  >
                                    {matches.length ? (
                                      matches.map((product, matchIndex) => {
                                        const isSelected =
                                          product.id === item.productId;
                                        const isActive =
                                          matchIndex === productActiveIndex;
                                        return (
                                          <button
                                            key={product.id}
                                            type="button"
                                            id={`purchase-product-option-${index}-${product.id}`}
                                            role="option"
                                            aria-selected={isSelected}
                                            className={`flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left text-sm transition ${
                                              isActive || isSelected
                                                ? "bg-sky-50 text-sky-950"
                                                : "hover:bg-zinc-50"
                                            }`}
                                            onMouseDown={(event) => {
                                              event.preventDefault();
                                              handleSelectPurchaseProduct(
                                                index,
                                                product,
                                              );
                                            }}
                                          >
                                            <span className="min-w-0 truncate font-medium text-zinc-900">
                                              {formatProductLabel(product)}
                                            </span>
                                            <span className="shrink-0 text-xs text-zinc-500">
                                              {formatUnit(product.unit ?? null)}
                                            </span>
                                          </button>
                                        );
                                      })
                                    ) : isProductMatchesLoading ? (
                                      <div className="px-3 py-2 text-xs text-zinc-500">
                                        Buscando...
                                      </div>
                                    ) : (
                                      <div className="px-3 py-2 text-xs text-zinc-500">
                                        Sin resultados.
                                      </div>
                                    )}
                                    {canCreateProduct ? (
                                      <button
                                        type="button"
                                        className="mt-1 flex w-full items-center gap-2 rounded-xl border border-dashed border-sky-200 px-3 py-2 text-left text-xs font-semibold text-sky-800 transition hover:bg-sky-50"
                                        onMouseDown={(event) => {
                                          event.preventDefault();
                                          handleCreateProductFromPurchase(index);
                                        }}
                                        disabled={creatingProductIndex === index}
                                      >
                                        <PlusIcon className="size-4" />
                                        {creatingProductIndex === index
                                          ? "Creando..."
                                          : `Crear "${searchedProductName}"`}
                                      </button>
                                    ) : null}
                                  </motion.div>
                                ) : null}
                              </AnimatePresence>
                            </div>
                            {selectedProduct?.unit ? (
                              <span className="text-[11px] text-zinc-500">
                                Unidad: {formatUnit(selectedProduct.unit)}
                              </span>
                            ) : null}
                          </label>

                          <label className="field-stack min-w-0">
                            <span className="input-label">Cantidad</span>
                            <input
                              className="input w-full min-w-0 text-right tabular-nums"
                              inputMode="decimal"
                              value={item.qty}
                              onChange={(event) =>
                                handlePurchaseProductChange(
                                  index,
                                  "qty",
                                  normalizeDecimalInput(event.target.value, 3),
                                )
                              }
                              placeholder="0"
                            />
                          </label>

                          <label className="field-stack min-w-0">
                            <span className="input-label">Costo unit.</span>
                            <div className="relative min-w-0">
                              <span className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-xs font-semibold text-zinc-500">
                                $
                              </span>
                              <MoneyInput
                                className="input no-spinner w-full min-w-0 pl-10 text-right tabular-nums"
                                value={item.unitCost}
                                onValueChange={(value) =>
                                  handlePurchaseProductChange(
                                    index,
                                    "unitCost",
                                    value,
                                  )
                                }
                                placeholder="0,00"
                                maxDecimals={2}
                              />
                            </div>
                          </label>

                          <label className="field-stack min-w-0">
                            <span className="input-label">IVA</span>
                            <select
                              className="input w-full min-w-0 cursor-pointer text-right"
                              value={item.taxRate}
                              onChange={(event) =>
                                handlePurchaseProductChange(
                                  index,
                                  "taxRate",
                                  event.target.value,
                                )
                              }
                            >
                              {PURCHASE_ITEM_TAX_RATE_OPTIONS.map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                          </label>

                          <label className="field-stack min-w-0">
                            <span className="input-label">Desc. %</span>
                            <div className="relative min-w-0">
                              <span className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-[10px] font-semibold text-zinc-500">
                                %
                              </span>
                              <input
                                className="input w-full min-w-0 pl-8 text-right text-xs tabular-nums"
                                inputMode="decimal"
                                value={item.discountPercent}
                                onChange={(event) =>
                                  handlePurchaseProductChange(
                                    index,
                                    "discountPercent",
                                    normalizeDecimalInput(event.target.value, 2),
                                  )
                                }
                                placeholder="0"
                              />
                            </div>
                          </label>

                          <div className="field-stack min-w-0">
                            <span className="input-label">Total item</span>
                            <div className="flex h-10 items-center justify-end text-sm font-semibold tabular-nums text-zinc-900">
                              {formatCurrencyARS(lineTotal)}
                            </div>
                            <span className="text-right text-[11px] text-zinc-500">
                              Desc. {formatCurrencyARS(lineDiscount)} · IVA{" "}
                              {formatCurrencyARS(lineTax)}
                            </span>
                          </div>

                          <button
                            type="button"
                            className="btn btn-rose h-10 w-10 justify-center self-end p-0 text-xs"
                            onClick={() => removePurchaseProduct(index)}
                            disabled={purchaseProducts.length <= 1}
                            aria-label="Quitar producto"
                          >
                            <TrashIcon className="size-4" />
                          </button>
                        </div>
                      );
                    })}
                  </div>

                  <div className="flex flex-col gap-3 border-t border-zinc-200/70 pt-3 md:flex-row md:items-center md:justify-between">
                    <div className="flex flex-row flex-wrap gap-x-3 gap-y-2 text-xs text-zinc-600">
                      <span className="whitespace-nowrap">
                        Bruto:{" "}
                        <strong className="text-zinc-900">
                          {formatCurrencyARS(productTotals.grossSubtotal)}
                        </strong>
                      </span>
                      <span className="whitespace-nowrap">
                        Desc.:{" "}
                        <strong className="text-zinc-900">
                          -{formatCurrencyARS(productTotals.discountTotal)}
                        </strong>
                      </span>
                      <span className="whitespace-nowrap">
                        Neto:{" "}
                        <strong className="text-zinc-900">
                          {formatCurrencyARS(productTotals.subtotal)}
                        </strong>
                      </span>
                      <span className="whitespace-nowrap">
                        IVA:{" "}
                        <strong className="text-zinc-900">
                          {formatCurrencyARS(productTotals.tax)}
                        </strong>
                      </span>
                      <span className="whitespace-nowrap">
                        Total:{" "}
                        <strong className="text-zinc-900">
                          {formatCurrencyARS(productTotals.total)}
                        </strong>
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {STOCK_ENABLED ? (
                        <MiniToggle
                          checked={adjustStock}
                          onChange={setAdjustStock}
                          label="Ingresar stock"
                        />
                      ) : null}
                      <button
                        type="button"
                        className="btn btn-sky text-xs"
                        onClick={addPurchaseProduct}
                      >
                        <PlusIcon className="size-4" />
                        Agregar producto
                      </button>
                    </div>
                  </div>
                </>
              ) : null}
              </div>
            </PurchaseSection>

            <PurchaseSection
              title="Percepciones y otros tributos"
              summary={taxesSectionSummary}
              open={openPurchaseSection === "taxes"}
              error={highlightedSection === "taxes"}
              onToggle={() => setOpenPurchaseSection("taxes")}
              className="order-5"
            >
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span className="text-xs font-medium text-zinc-500">
                    Total {formatCurrencyARS(fiscalOtherTotal)}
                  </span>
                  <button
                    type="button"
                    className="btn btn-sky text-xs"
                    onClick={addFiscalLineAndOpen}
                    disabled={isInternalRecord}
                  >
                    <PlusIcon className="size-4" />
                    Agregar tributo
                  </button>
                </div>

                {isInternalRecord ? (
                  <p className="text-xs text-zinc-600">
                    Registro interno: percepciones y tributos no se computan
                    fiscalmente sin comprobante fiscal.
                  </p>
                ) : null}

                {fiscalLines.length ? (
                  <div className="space-y-1 border-t border-zinc-200/70 pt-3">
                    {fiscalLines.map((line, index) => (
                      <div
                        key={`fiscal-line-${index}`}
                        className="grid gap-3 border-t border-zinc-200/70 py-3 first:border-t-0 md:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,0.9fr)_minmax(0,0.7fr)_minmax(0,0.9fr)_40px] xl:items-start"
                      >
                        <label className="field-stack min-w-0 w-full">
                          <span className="input-label">Tipo</span>
                          <select
                            className="input w-full min-w-0 cursor-pointer text-xs"
                            value={line.type}
                            onChange={(event) =>
                              handleFiscalLineChange(
                                index,
                                "type",
                                event.target.value,
                              )
                            }
                          >
                            {PURCHASE_FISCAL_LINE_OPTIONS.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="field-stack min-w-0 w-full">
                          <span className="input-label">Jurisdiccion</span>
                          <div
                            className={`relative ${
                              openJurisdictionIndex === index ? "z-[120]" : "z-0"
                            }`}
                          >
                            <input
                              className="input w-full min-w-0 text-xs"
                              value={line.jurisdiction}
                              onChange={(event) => {
                                handleFiscalLineChange(
                                  index,
                                  "jurisdiction",
                                  event.target.value,
                                );
                                setOpenJurisdictionIndex(index);
                                setJurisdictionActiveIndex(0);
                              }}
                              onFocus={() => {
                                setOpenJurisdictionIndex(index);
                                setJurisdictionActiveIndex(0);
                              }}
                              onBlur={() => {
                                window.setTimeout(() => {
                                  setOpenJurisdictionIndex((current) =>
                                    current === index ? null : current,
                                  );
                                  handleFiscalLineChange(
                                    index,
                                    "jurisdiction",
                                    normalizeJurisdiction(
                                      fiscalLines[index]?.jurisdiction ?? "",
                                    ),
                                  );
                                }, 120);
                              }}
                              onKeyDown={(event) =>
                                handleFiscalJurisdictionKeyDown(
                                  event,
                                  index,
                                  getJurisdictionMatches(line.jurisdiction),
                                )
                              }
                              placeholder="Ej: Buenos Aires"
                              autoComplete="off"
                              role="combobox"
                              aria-autocomplete="list"
                              aria-haspopup="listbox"
                              aria-expanded={openJurisdictionIndex === index}
                              aria-controls={`purchase-jurisdiction-options-${index}`}
                              aria-activedescendant={
                                openJurisdictionIndex === index &&
                                getJurisdictionMatches(line.jurisdiction)[
                                  jurisdictionActiveIndex
                                ]
                                  ? `purchase-jurisdiction-option-${index}-${normalizeQuery(
                                      getJurisdictionMatches(line.jurisdiction)[
                                        jurisdictionActiveIndex
                                      ] ?? "",
                                    )}`
                                  : undefined
                              }
                            />
                            <AnimatePresence>
                              {openJurisdictionIndex === index ? (
                                <motion.div
                                  key={`purchase-jurisdiction-options-${index}`}
                                  id={`purchase-jurisdiction-options-${index}`}
                                  role="listbox"
                                  aria-label="Jurisdicciones"
                                  initial={{ opacity: 0, y: -8, scale: 0.98 }}
                                  animate={{ opacity: 1, y: 0, scale: 1 }}
                                  exit={{ opacity: 0, y: -8, scale: 0.98 }}
                                  transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
                                  className="absolute z-[130] mt-2 max-h-56 w-full overflow-y-auto rounded-xl border border-zinc-200/70 bg-white/95 p-2 shadow-[0_14px_24px_-18px_rgba(82,82,91,0.45)] backdrop-blur-xl"
                                >
                                  {getJurisdictionMatches(line.jurisdiction).length ? (
                                    getJurisdictionMatches(line.jurisdiction).map(
                                      (jurisdiction, matchIndex) => {
                                        const isActive =
                                          matchIndex === jurisdictionActiveIndex;
                                        const normalizedMatch = normalizeQuery(jurisdiction);
                                        return (
                                          <button
                                            key={`${jurisdiction}-${matchIndex}`}
                                            type="button"
                                            id={`purchase-jurisdiction-option-${index}-${normalizedMatch}`}
                                            role="option"
                                            aria-selected={isActive}
                                            className={`flex w-full items-center rounded-xl px-3 py-2 text-left text-xs transition ${
                                              isActive
                                                ? "bg-sky-50 text-sky-950"
                                                : "hover:bg-zinc-50 text-zinc-700"
                                            }`}
                                            onMouseDown={(event) => {
                                              event.preventDefault();
                                              applyFiscalJurisdictionSuggestion(
                                                index,
                                                jurisdiction,
                                              );
                                            }}
                                          >
                                            {jurisdiction}
                                          </button>
                                        );
                                      },
                                    )
                                  ) : (
                                    <div className="px-3 py-2 text-xs text-zinc-500">
                                      Sin coincidencias.
                                    </div>
                                  )}
                                </motion.div>
                              ) : null}
                            </AnimatePresence>
                          </div>
                        </label>
                        <label className="field-stack min-w-0 w-full">
                          <span className="input-label">Base</span>
                          <div className="relative min-w-0">
                            <span className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-xs font-semibold text-zinc-500">
                              $
                            </span>
                            <MoneyInput
                              className="input no-spinner w-full min-w-0 pl-8 text-right text-xs tabular-nums"
                              value={line.baseAmount}
                              onValueChange={(value) =>
                                handleFiscalLineChange(index, "baseAmount", value)
                              }
                              placeholder="0,00"
                              maxDecimals={2}
                            />
                          </div>
                        </label>
                        <label className="field-stack min-w-0 w-full">
                          <span className="input-label">%</span>
                          <div className="relative min-w-0">
                            <span className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-[10px] font-semibold text-zinc-500">
                              %
                            </span>
                            <input
                              className="input w-full min-w-0 pl-8 text-right text-xs tabular-nums"
                              inputMode="decimal"
                              value={line.rate}
                              onChange={(event) =>
                                handleFiscalLineChange(
                                  index,
                                  "rate",
                                  normalizeDecimalInput(event.target.value, 4),
                                )
                              }
                              placeholder="0"
                            />
                          </div>
                        </label>
                        <label className="field-stack min-w-0 w-full">
                          <span className="input-label">Importe</span>
                          <div className="relative min-w-0">
                            <span className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-xs font-semibold text-zinc-500">
                              $
                            </span>
                            <MoneyInput
                              className="input no-spinner w-full min-w-0 pl-8 text-right text-xs tabular-nums"
                              value={line.amount}
                              onValueChange={(value) =>
                                handleFiscalLineChange(index, "amount", value)
                              }
                              placeholder="0,00"
                              maxDecimals={2}
                            />
                          </div>
                          {line.manualAmountOverride ? (
                            <div className="flex items-center justify-end pt-1 text-[10px]">
                              <button
                                type="button"
                                className="text-sky-700 transition hover:text-sky-900"
                                onClick={() => handleFiscalLineChange(index, "amount", "")}
                              >
                                Volver a auto
                              </button>
                            </div>
                          ) : null}
                        </label>
                        <button
                          type="button"
                          className="btn btn-rose h-10 w-10 justify-center self-end p-0 text-xs"
                          onClick={() => removeFiscalLine(index)}
                          aria-label="Quitar tributo"
                        >
                          <TrashIcon className="size-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="border-t border-zinc-200/70 pt-3 text-xs text-zinc-500">
                    Sin percepciones u otros tributos en esta compra.
                  </p>
                )}
              </div>
            </PurchaseSection>

            <PurchaseSection
              title="Comprobante fiscal"
              summary={invoiceSectionSummary}
              open={openPurchaseSection === "invoice"}
              error={highlightedSection === "invoice"}
              onToggle={() => setOpenPurchaseSection("invoice")}
              className="order-2"
            >
              <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                  Comprobante fiscal
                </p>
                <MiniToggle
                  checked={hasInvoice}
                  onChange={(next) => {
                    setHasInvoice(next);
                    if (!next) {
                      setInvoiceNumber("");
                      setArcaAuthorizationCode("");
                      setArcaValidationResult(null);
                    }
                  }}
                  label="Tiene comprobante fiscal"
                />
              </div>

              {hasInvoice ? (
                <>
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    <label className="field-stack min-w-0 w-full">
                      <span className="input-label">Tipo</span>
                      <select
                        className={`input w-full min-w-0 cursor-pointer ${getHighlightClass("invoice.voucherKind")}`}
                        value={arcaVoucherKind}
                        onChange={(event) =>
                          setArcaVoucherKind(event.target.value as "A" | "B" | "C")
                        }
                      >
                        <option value="A">Factura A</option>
                        <option value="B">Factura B</option>
                        <option value="C">Factura C</option>
                      </select>
                      {arcaVoucherKind === "C" ? (
                        <p className="text-[11px] text-zinc-500">
                          Factura C: no genera credito fiscal de IVA.
                        </p>
                      ) : null}
                    </label>
                    <label className="field-stack min-w-0 w-full">
                      <span className="input-label">Numero comprobante</span>
                      <input
                        className={`input w-full min-w-0 ${getHighlightClass("invoice.invoiceNumber")}`}
                        value={invoiceNumber}
                        onChange={(event) => setInvoiceNumber(event.target.value)}
                        placeholder="0001-00001234"
                      />
                      <p className="text-[11px] text-zinc-500">
                        Formato obligatorio: 0001-00001234 (con guion).
                      </p>
                      {invoiceFormatWarning ? (
                        <p className="text-[11px] text-amber-700">
                          {invoiceFormatWarning}
                        </p>
                      ) : inferredPointOfSale ? (
                        <p className="text-[11px] text-zinc-500">
                          Punto de venta detectado: {inferredPointOfSale}.
                        </p>
                      ) : null}
                    </label>
                    <label className="field-stack min-w-0 w-full">
                      <span className="input-label">CAE</span>
                      <input
                        className={`input w-full min-w-0 ${getHighlightClass("invoice.authorizationCode")}`}
                        value={arcaAuthorizationCode}
                        onChange={(event) =>
                          setArcaAuthorizationCode(event.target.value)
                        }
                        placeholder="Codigo autorizacion"
                      />
                    </label>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <div className="grid w-full grid-cols-2 gap-2 sm:w-auto">
                      <button
                        type="button"
                        className="btn btn-sky w-full text-xs sm:w-auto"
                        onClick={openQrScanner}
                        disabled={isImportingQr || isArcaValidating}
                      >
                        {isImportingQr ? "Importando..." : "Escanear QR"}
                      </button>
                      <button
                        type="button"
                        className="btn w-full text-xs sm:w-auto"
                        onClick={handleImportQrFromPrompt}
                        disabled={isImportingQr || isArcaValidating}
                      >
                        Pegar texto QR
                      </button>
                    </div>
                    <button
                      type="button"
                      className="btn text-xs"
                      onClick={handleValidateArcaOnly}
                      disabled={isArcaValidating || isImportingQr}
                    >
                      {isArcaValidating ? "Validando..." : "Validar ARCA"}
                    </button>
                    {arcaValidationResult ? (
                      <span className="pill border border-zinc-200 bg-white px-3 py-1.5 text-[11px] font-semibold uppercase text-zinc-700">
                        {arcaStatusLabel(arcaValidationResult.status)}
                      </span>
                    ) : null}
                    {arcaValidationResult ? (
                      <span className="text-xs text-zinc-500">
                        {arcaValidationResult.message}
                      </span>
                    ) : null}
                    {arcaValidationResult?.comprobante ? (
                      <span className="text-[11px] text-zinc-500">
                        ARCA se usa para correlacion de tipo/punto/numero/fecha/total/CAE; si no trae desglose fiscal, IVA y percepciones se cargan manualmente.
                      </span>
                    ) : null}
                  </div>
                </>
              ) : (
                <p className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-600">
                  Sin comprobante fiscal: esta compra se guarda como registro interno
                  y no computa fiscalmente.
                </p>
              )}
              </div>
            </PurchaseSection>

            <PurchaseSection
              title="Pago"
              summary={paymentSectionSummary}
              open={openPurchaseSection === "payment"}
              error={highlightedSection === "payment"}
              onToggle={() => setOpenPurchaseSection("payment")}
              className="order-6"
            >
              <div className="space-y-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                Pago
              </p>

              <div className="grid gap-2 sm:grid-cols-3">
                {PURCHASE_PAYMENT_MODE_OPTIONS.map((option) => {
                  const isActive = paymentMode === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      aria-pressed={isActive}
                      onClick={() => {
                        setPaymentMode(option.value);
                        if (option.value !== "IMMEDIATE_CASH_OUT") {
                          setCashOutLines([
                            buildCashOutLine(paymentMethods, accounts),
                          ]);
                        }
                      }}
                      className={`rounded-xl border px-3 py-2.5 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/40 ${
                        isActive
                          ? "border-sky-300 bg-sky-50/70 text-sky-950"
                          : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300"
                      }`}
                    >
                      <p className="text-sm font-semibold">{option.label}</p>
                      <p
                        className={`mt-1 text-[11px] ${
                          isActive ? "text-sky-700" : "text-zinc-500"
                        }`}
                      >
                        {option.description}
                      </p>
                    </button>
                  );
                })}
              </div>

              {registerCashOut ? (
                <div className="space-y-3">
                  <div className="space-y-2">
                    {cashOutLines.map((line, index) => {
                      const requiresAccount = paymentMethodRequiresAccount(
                        line.paymentMethodId,
                        paymentMethods,
                      );
                      return (
                        <div
                          key={`cash-out-line-${index}`}
                          className="grid gap-3 rounded-xl border border-zinc-200/70 bg-white/40 p-3 sm:grid-cols-[minmax(160px,1.4fr)_minmax(170px,1.4fr)_minmax(120px,1fr)_auto] sm:items-end"
                        >
                          <label className="field-stack">
                            <span className="input-label">Metodo de pago</span>
                            <select
                              className="input cursor-pointer"
                              value={line.paymentMethodId}
                              onChange={(event) =>
                                updateCashOutLine(index, {
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
                                <option key={method.id} value={method.id}>
                                  {method.name}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="field-stack">
                            <span className="input-label">Cuenta de egreso</span>
                            {requiresAccount ? (
                              <select
                                className="input cursor-pointer"
                                value={line.accountId}
                                onChange={(event) =>
                                  updateCashOutLine(index, {
                                    accountId: event.target.value,
                                  })
                                }
                              >
                                <option value="">Selecciona cuenta</option>
                                {accounts.map((account) => (
                                  <option key={account.id} value={account.id}>
                                    {account.name} ({account.currencyCode})
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <input
                                className="input"
                                value="No requiere cuenta"
                                readOnly
                                disabled
                              />
                            )}
                          </label>
                          <label className="field-stack">
                            <span className="input-label">Monto</span>
                            <MoneyInput
                              className="input w-full text-right tabular-nums"
                              value={line.amount}
                              onValueChange={(nextValue) =>
                                updateCashOutLine(index, { amount: nextValue })
                              }
                              placeholder="0,00"
                              maxDecimals={2}
                            />
                          </label>
                          <button
                            type="button"
                            className="btn btn-rose text-xs sm:self-end"
                            onClick={() => removeCashOutLine(index)}
                            disabled={cashOutLines.length <= 1}
                          >
                            <TrashIcon className="size-4" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <button
                      type="button"
                      className="btn text-xs"
                      onClick={addCashOutLine}
                    >
                      <PlusIcon className="size-4" />
                      Agregar linea
                    </button>
                    <div className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-600">
                      <p>
                        Total lineas:{" "}
                        <span className="font-semibold text-zinc-900">
                          {formatCurrencyARS(
                            cashOutLines.reduce(
                              (sum, line) => sum + Number(line.amount || 0),
                              0,
                            ),
                          )}
                        </span>
                      </p>
                      <p>
                        Total compra:{" "}
                        <span className="font-semibold text-zinc-900">
                          {formatCurrencyARS(effectiveTotalNumeric)}
                        </span>
                      </p>
                      <p>
                        Diferencia:{" "}
                        <span
                          className={`font-semibold ${
                            Math.abs(
                              roundMoney(
                                effectiveTotalNumeric -
                                  cashOutLines.reduce(
                                    (sum, line) => sum + Number(line.amount || 0),
                                    0,
                                  ),
                              ),
                            ) <= 0.01
                              ? "text-emerald-700"
                              : "text-rose-700"
                          }`}
                        >
                          {formatCurrencyARS(
                            roundMoney(
                              effectiveTotalNumeric -
                                cashOutLines.reduce(
                                  (sum, line) => sum + Number(line.amount || 0),
                                  0,
                                ),
                            ),
                          )}
                        </span>
                      </p>
                    </div>
                  </div>
                </div>
              ) : null}
              </div>
            </PurchaseSection>

            <button
              type="submit"
              className="btn btn-emerald order-7 w-full"
              disabled={isSubmitting || isArcaValidating}
            >
              <CheckIcon className="size-4" />
              {isArcaValidating
                ? "Validando ARCA..."
                : isSubmitting
                ? "Guardando..."
                : hasInvoice
                  ? editingPurchaseId
                    ? "Validar ARCA y revisar cambios"
                    : "Validar ARCA y revisar compra"
                  : editingPurchaseId
                    ? "Revisar cambios"
                    : "Revisar compra"}
            </button>
          </form>
        </div>
      ) : (
        <>
          <div className="card space-y-4 p-4 sm:p-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
                  Reporte mensual para contador
                </h2>
              </div>
              <div className="grid gap-2 sm:grid-cols-[auto_auto_auto_auto] sm:items-end">
                <label className="field-stack min-w-0">
                  <span className="input-label">Desde</span>
                  <input
                    type="date"
                    className="input w-full min-w-0 cursor-pointer text-xs"
                    value={reportFrom}
                    onChange={(event) => setReportFrom(event.target.value)}
                  />
                </label>
                <label className="field-stack min-w-0">
                  <span className="input-label">Hasta</span>
                  <input
                    type="date"
                    className="input w-full min-w-0 cursor-pointer text-xs"
                    value={reportTo}
                    onChange={(event) => setReportTo(event.target.value)}
                  />
                </label>
                <div className="grid grid-cols-2 gap-2 sm:contents">
                  <button
                    type="button"
                    className="btn w-full text-xs sm:w-auto"
                    onClick={() => handleDownloadPurchasesReport("csv")}
                  >
                    Descargar CSV
                  </button>
                  <button
                    type="button"
                    className="btn btn-sky w-full text-xs sm:w-auto"
                    onClick={() => handleDownloadPurchasesReport("pdf")}
                  >
                    Descargar PDF
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="card space-y-4 p-4 sm:p-6">
            <div className="grid gap-3 lg:grid-cols-[minmax(200px,auto)_minmax(0,1fr)] lg:items-center">
              <h2 className="min-w-0 text-sm font-semibold uppercase tracking-wide text-zinc-500">
                Compras registradas
              </h2>
              <div className="grid w-full gap-2 sm:grid-cols-2 lg:grid-cols-[220px_minmax(0,1fr)_180px]">
                <div className="relative inline-grid h-[38px] w-full shrink-0 grid-cols-2 rounded-full border border-zinc-200/70 bg-white/55 p-1">
                  <span
                    aria-hidden="true"
                    className={`pointer-events-none absolute inset-y-1 left-1 w-[calc(50%-0.25rem)] rounded-full border border-sky-200 bg-white shadow-[0_4px_10px_-8px_rgba(14,116,144,0.32)] transition-transform duration-200 ease-out ${
                      purchaseListMode === "finance" ? "translate-x-full" : ""
                    }`}
                  />
                  <button
                    type="button"
                    className={`relative z-10 inline-flex h-full items-center justify-center rounded-full px-2 text-xs font-semibold transition-colors ${
                      purchaseListMode === "general"
                        ? "text-sky-900"
                        : "text-zinc-600"
                    }`}
                    onClick={() => setPurchaseListMode("general")}
                    aria-pressed={purchaseListMode === "general"}
                  >
                    General
                  </button>
                  <button
                    type="button"
                    className={`relative z-10 inline-flex h-full items-center justify-center rounded-full px-2 text-xs font-semibold transition-colors ${
                      purchaseListMode === "finance"
                        ? "text-sky-900"
                        : "text-zinc-600"
                    }`}
                    onClick={() => setPurchaseListMode("finance")}
                    aria-pressed={purchaseListMode === "finance"}
                  >
                    Finanzas
                  </button>
                </div>

                <input
                  className="input w-full sm:col-span-1 lg:col-span-1"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Buscar proveedor o comprobante"
                />
                <select
                  className="input w-full cursor-pointer text-xs sm:col-span-2 lg:col-span-1"
                  value={sortOrder}
                  onChange={(event) =>
                    setSortOrder(event.target.value as "newest" | "oldest")
                  }
                >
                  <option value="newest">Mas recientes</option>
                  <option value="oldest">Mas antiguas</option>
                </select>
              </div>
            </div>
            <div className="space-y-2 md:hidden">
              {filteredPurchases.length ? (
                filteredPurchases.map((purchase) => {
                  const paymentStatus = getPurchasePaymentStatus(purchase);
                  const pendingBalance = Number(purchase.balance ?? 0);

                  return (
                    <div
                      key={purchase.id}
                      className="rounded-2xl border border-zinc-200/70 bg-white/70 p-3"
                    >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-zinc-900">
                          {purchase.supplierName}
                        </p>
                        <p className="mt-0.5 text-[11px] text-zinc-500">
                          {purchase.invoiceNumber ?? "Sin comprobante fiscal"} -{" "}
                          {formatPurchaseDateLabel(purchase)}
                        </p>
                      </div>
                      <p className="shrink-0 text-sm font-semibold tabular-nums text-zinc-900">
                        {formatCurrencyARS(purchase.total)}
                      </p>
                    </div>
                    {purchaseListMode === "finance" ? (
                      <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] text-zinc-500 sm:grid-cols-4">
                        <div>
                          <span className="block uppercase tracking-wide">
                            Productos
                          </span>
                          <span className="font-semibold text-zinc-700">
                            {purchase.itemsCount}
                          </span>
                        </div>
                        <div>
                          <span className="block uppercase tracking-wide">
                            IVA
                          </span>
                          <span className="font-semibold text-zinc-700">
                            {formatCurrencyARS(purchase.taxes ?? 0)}
                          </span>
                        </div>
                        <div>
                          <span className="block uppercase tracking-wide">
                            Perc./otros
                          </span>
                          <span className="font-semibold text-zinc-700">
                            {formatCurrencyARS(purchase.otherTaxesTotal ?? 0)}
                          </span>
                        </div>
                        <div>
                          <span className="block uppercase tracking-wide">
                            Pendiente
                          </span>
                          <span className="font-semibold text-zinc-700">
                            {formatCurrencyARS(pendingBalance)}
                          </span>
                        </div>
                      </div>
                    ) : null}
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`pill border px-2 py-1 text-[10px] font-semibold ${
                            paymentStatus.tone === "immediate"
                              ? "border-sky-200 bg-white text-sky-800"
                              : paymentStatus.tone === "current-account"
                                ? "border-emerald-200 bg-white text-emerald-800"
                                : "border-zinc-200 bg-white text-zinc-600"
                          }`}
                        >
                          {paymentStatus.label}
                        </span>
                        <span className="text-[11px] text-zinc-500">
                          {purchase.hasInvoice
                            ? `ARCA ${arcaStatusLabel(purchase.arcaValidationStatus)}`
                            : "Registro interno · No computable fiscalmente"}
                        </span>
                      </div>
                      <button
                        type="button"
                        className="btn btn-sky text-[11px]"
                        onClick={() => {
                          void openPurchaseDetail(purchase);
                        }}
                        disabled={deletingPurchaseId === purchase.id}
                        title="Ver detalle"
                        aria-label="Ver detalle"
                      >
                        <EyeIcon className="size-4" />
                        <span>Detalle</span>
                      </button>
                    </div>
                    </div>
                  );
                })
              ) : (
                <p className="text-sm text-zinc-500">Sin compras por ahora.</p>
              )}
            </div>
            <div className="hidden md:block">
              <div className="table-scroll">
              <table
                className={`w-full text-left text-xs ${
                  purchaseListMode === "finance"
                    ? "min-w-[1300px]"
                    : "min-w-[940px]"
                }`}
              >
                <thead className="text-[11px] uppercase tracking-wide text-zinc-500">
                  <tr>
                    <th className="py-2 pr-3">Comprobante</th>
                    <th className="py-2 pr-3">Proveedor</th>
                    <th className="py-2 pr-3">Fecha</th>
                    {purchaseListMode === "finance" ? (
                      <>
                        <th className="py-2 pr-3 text-right">Productos</th>
                        <th className="py-2 pr-3 text-right">IVA compra</th>
                        <th className="py-2 pr-3 text-right">Perc./otros</th>
                        <th className="py-2 pr-3 text-right">Pendiente</th>
                      </>
                    ) : null}
                    <th className="py-2 pr-3 text-right">Total</th>
                    <th className="py-2 pr-3">Pago</th>
                    <th className="py-2 pr-3">ARCA</th>
                    <th className="py-2 pr-3 text-right">Detalle</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPurchases.length ? (
                    filteredPurchases.map((purchase) => {
                      const paymentStatus = getPurchasePaymentStatus(purchase);
                      const pendingBalance = Number(purchase.balance ?? 0);

                      return (
                        <tr
                          key={purchase.id}
                          className="border-t border-zinc-200/60 transition-colors hover:bg-white/60"
                        >
                        <td className="py-3 pr-3 text-zinc-700">
                          {purchase.invoiceNumber ?? "Sin comprobante fiscal"}
                        </td>
                        <td className="py-3 pr-3 text-zinc-900">
                          {purchase.supplierName}
                        </td>
                        <td className="py-3 pr-3 text-zinc-600">
                          {formatPurchaseDateLabel(purchase)}
                        </td>
                        {purchaseListMode === "finance" ? (
                          <>
                            <td className="py-3 pr-3 text-right text-zinc-700">
                              {purchase.itemsCount}
                            </td>
                            <td className="py-3 pr-3 text-right text-zinc-700">
                              {formatCurrencyARS(purchase.taxes ?? 0)}
                            </td>
                            <td className="py-3 pr-3 text-right text-zinc-700">
                              {formatCurrencyARS(purchase.otherTaxesTotal ?? 0)}
                            </td>
                            <td className="py-3 pr-3 text-right text-zinc-700">
                              {formatCurrencyARS(pendingBalance)}
                            </td>
                          </>
                        ) : null}
                        <td className="py-3 pr-3 text-right text-zinc-900">
                          {formatCurrencyARS(purchase.total)}
                        </td>
                        <td className="py-3 pr-3">
                          <span
                            className={`pill border px-2 py-1 text-[10px] font-semibold ${
                              paymentStatus.tone === "immediate"
                                ? "border-sky-200 bg-white text-sky-800"
                                : paymentStatus.tone === "current-account"
                                  ? "border-emerald-200 bg-white text-emerald-800"
                                  : "border-zinc-200 bg-white text-zinc-600"
                            }`}
                          >
                            {paymentStatus.label}
                          </span>
                        </td>
                        <td className="py-3 pr-3 text-zinc-700">
                          {purchase.hasInvoice
                            ? arcaStatusLabel(purchase.arcaValidationStatus)
                            : "Registro interno"}
                        </td>
                        <td className="py-3 pr-3 text-right">
                          <button
                            type="button"
                            className="btn btn-sky text-[11px]"
                            onClick={() => {
                              void openPurchaseDetail(purchase);
                            }}
                            disabled={deletingPurchaseId === purchase.id}
                            title="Ver detalle"
                            aria-label="Ver detalle"
                          >
                            <EyeIcon className="size-4" />
                            <span>Detalle</span>
                          </button>
                        </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td
                        className="py-4 text-sm text-zinc-500"
                        colSpan={purchasesTableColSpan}
                      >
                        Sin compras por ahora.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
              </div>
            </div>
          </div>
        </>
      )}

      {pendingPurchase
        ? renderModalPortal(
            <PurchaseConfirmModal
              pendingPurchase={pendingPurchase}
              editingPurchaseId={editingPurchaseId}
              confirmationRows={confirmationRows}
              status={status}
              isSubmitting={isSubmitting}
              onCancel={() => setPendingPurchase(null)}
              onConfirm={handleConfirmPurchase}
            />,
          )
        : null}

      {editingPaymentPurchase
        ? renderModalPortal(
            <PurchasePaymentModeModal
              editingPaymentPurchase={editingPaymentPurchase}
              paymentModeOptions={PURCHASE_PAYMENT_MODE_OPTIONS}
              editingPaymentMode={editingPaymentMode}
              editingPaidAt={editingPaidAt}
              editingCashOutLines={editingCashOutLines}
              paymentMethods={paymentMethods}
              accounts={accounts}
              isUpdatingPaymentMode={isUpdatingPaymentMode}
              onSetEditingPaymentMode={setEditingPaymentMode}
              onResetCashOutTargets={() => {
                setEditingCashOutLines([
                  buildCashOutLine(paymentMethods, accounts),
                ]);
              }}
              onSetEditingPaidAt={setEditingPaidAt}
              onAddCashOutLine={addEditingCashOutLine}
              onRemoveCashOutLine={removeEditingCashOutLine}
              onUpdateCashOutLine={updateEditingCashOutLine}
              onOpenSupplierGroupedPayment={() =>
                openSupplierGroupedPayment(editingPaymentPurchase)
              }
              onClose={closePaymentModeEditor}
              onSave={handleUpdatePurchasePaymentMode}
            />,
          )
        : null}

      {supplierGroupedPaymentPurchase
        ? renderModalPortal(
            <SupplierGroupedPaymentModal
              purchase={supplierGroupedPaymentPurchase}
              purchases={purchases}
              paymentMethods={paymentMethods}
              accounts={accounts}
              onClose={closeSupplierGroupedPayment}
              onSuccess={handleSupplierGroupedPaymentCreated}
            />,
          )
        : null}

      {detailPurchase
        ? renderModalPortal(
            <PurchaseDetailModal
              purchase={detailPurchase}
              detail={detailData}
              isLoading={isLoadingDetailPurchase}
              loadError={detailPurchaseError}
              paymentStatus={detailPaymentStatus}
              arcaStatusLabel={detailArcaStatusLabel}
              isLoadingEdit={isLoadingPurchaseEdit}
              isRevalidating={revalidatingPurchaseId === detailPurchase.id}
              isDeleting={deletingPurchaseId === detailPurchase.id}
              onClose={closePurchaseDetail}
              onEdit={handleDetailEdit}
              onPayment={handleDetailPayment}
              onRevalidate={handleDetailRevalidate}
              onDelete={handleDetailDelete}
            />,
          )
        : null}

      {isQrScannerOpen
        ? renderModalPortal(
            <PurchaseQrScannerModal
              isOpen={isQrScannerOpen}
              isImportingQr={isImportingQr}
              isImportingQrFromImage={isImportingQrFromImage}
              isQrScannerActive={isQrScannerActive}
              qrScannerError={qrScannerError}
              qrVideoDevices={qrVideoDevices}
              qrSelectedDeviceId={qrSelectedDeviceId}
              qrVideoRef={qrVideoRef}
              qrImageInputRef={qrImageInputRef}
              onClose={closeQrScanner}
              onSetSelectedDeviceId={setQrSelectedDeviceId}
              onImportImage={handleImportQrFromImage}
              onImportQrFromPrompt={handleImportQrFromPrompt}
            />,
          )
        : null}

      {renderModalPortal(
        <AnimatePresence>
          {revalidationFeedback ? (
            <motion.div
              className="fixed inset-0 z-[125] flex items-center justify-center overflow-y-auto bg-zinc-950/35 p-3 backdrop-blur-sm sm:p-4"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <motion.div
                role="dialog"
                aria-modal="true"
                aria-labelledby="purchase-revalidation-title"
                className="flex max-h-[calc(100dvh-2rem)] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white p-5 shadow-[0_24px_80px_-40px_rgba(24,24,27,0.55)]"
                initial={{ opacity: 0, y: 12, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 12, scale: 0.98 }}
                transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2
                      id="purchase-revalidation-title"
                      className="text-lg font-semibold text-zinc-900"
                    >
                      Resultado de validacion en ARCA
                    </h2>
                    <p className="mt-1 truncate text-xs text-zinc-500">
                      {revalidationPurchase?.supplierName ?? "Compra"} ·{" "}
                      {revalidationPurchase?.invoiceNumber ?? "Sin comprobante fiscal"}
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-3 py-1.5 text-[11px] font-semibold uppercase ${
                      revalidationFeedback.status === "REJECTED"
                        ? "border border-rose-200 bg-white text-rose-700"
                        : revalidationFeedback.status === "OBSERVED"
                          ? "border border-amber-200 bg-white text-amber-700"
                          : "border border-zinc-200 bg-white text-zinc-700"
                    }`}
                  >
                    {arcaStatusLabel(revalidationFeedback.status)}
                  </span>
                </div>

                <div className="mt-3 flex-1 space-y-3 overflow-y-auto pr-1">
                  <p className="text-sm text-zinc-700">{revalidationFeedback.message}</p>

                  {hasRevalidationDateMismatch ? (
                    <InlineDataNotice
                      tone="amber"
                      title="Fecha distinta entre ARCA y tu carga"
                      message={`ARCA informa ${revalidationArcaVoucherDate} y se envio ${revalidationRequestVoucherDate}. Corrige la fecha del comprobante y revalida.`}
                    />
                  ) : null}

                  {revalidationFeedback.details.length ? (
                    <div className="space-y-2 rounded-xl border border-zinc-200/80 bg-zinc-50/70 p-3">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                        Lo que informo ARCA
                      </p>
                      <div className="space-y-1.5">
                        {revalidationFeedback.details.map((detail, index) => (
                          <div
                            key={`arca-detail-${index}`}
                            className="grid gap-1 text-xs text-zinc-700 sm:grid-cols-[180px_minmax(0,1fr)]"
                          >
                            <span className="font-semibold text-zinc-500">
                              {detail.label}
                            </span>
                            <span className="min-w-0 break-words text-zinc-800">
                              {detail.value}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {revalidationFeedback.hints.length ? (
                    <div className="space-y-2 rounded-xl border border-amber-200 bg-amber-50/60 p-3">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-800">
                        Como resolverlo
                      </p>
                      <ul className="space-y-1 text-xs text-amber-900">
                        {revalidationFeedback.hints.map((hint, index) => (
                          <li key={`arca-hint-${index}`}>• {hint}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  {revalidationFeedback.request ? (
                    <div className="rounded-xl border border-zinc-200/80 bg-white p-3">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                        Datos enviados para validar
                      </p>
                      <div className="mt-2 grid gap-2 text-xs text-zinc-700 sm:grid-cols-2">
                        <span>
                          Modo:{" "}
                          {formatArcaAuthorizationModeLabel(revalidationFeedback.request.mode)}
                        </span>
                        <span>
                          Tipo:{" "}
                          {formatArcaVoucherTypeLabel(
                            revalidationFeedback.request.voucherType,
                          )}
                        </span>
                        <span>
                          Punto: {String(revalidationFeedback.request.pointOfSale ?? "-")}
                        </span>
                        <span>
                          Numero: {String(revalidationFeedback.request.voucherNumber ?? "-")}
                        </span>
                        <span>
                          Fecha:{" "}
                          {formatArcaRequestDate(revalidationFeedback.request.voucherDate)}
                        </span>
                        <span>
                          Total:{" "}
                          {formatArcaRequestAmount(
                            revalidationFeedback.request.totalAmount,
                          )}
                        </span>
                        <span>
                          CUIT emisor:{" "}
                          {String(revalidationFeedback.request.issuerTaxId ?? "-")}
                        </span>
                        <span>
                          Tipo doc. receptor:{" "}
                          {formatArcaReceiverDocTypeLabel(
                            revalidationFeedback.request.receiverDocType,
                          )}
                        </span>
                        <span>
                          Documento receptor:{" "}
                          {String(revalidationFeedback.request.receiverDocNumber ?? "-")}
                        </span>
                        <span>
                          CAE/CAEA:{" "}
                          {String(revalidationFeedback.request.authorizationCode ?? "-")}
                        </span>
                      </div>
                    </div>
                  ) : null}

                  {revalidationFeedback.rawResponse ? (
                    <details className="rounded-xl border border-zinc-200/80 bg-zinc-50/40 p-3">
                      <summary className="cursor-pointer text-[11px] font-semibold uppercase tracking-wide text-zinc-600">
                        Detalle ARCA completo
                      </summary>
                      <pre className="mt-2 max-h-64 overflow-auto rounded-lg bg-zinc-900 p-2 text-[11px] leading-relaxed text-zinc-100">
                        {JSON.stringify(revalidationFeedback.rawResponse, null, 2)}
                      </pre>
                    </details>
                  ) : null}
                </div>

                <div className="mt-4 flex flex-wrap justify-end gap-2 border-t border-zinc-100 pt-3">
                  {revalidationPurchase ? (
                    <button
                      type="button"
                      className="btn"
                      onClick={() => {
                        setRevalidationFeedback(null);
                        void handleStartPurchaseEdit(revalidationPurchase.id);
                      }}
                    >
                      Editar compra
                    </button>
                  ) : null}
                  {revalidationPurchase ? (
                    <button
                      type="button"
                      className="btn"
                      onClick={() =>
                        openInvoiceEditor(revalidationPurchase, {
                          revalidateAfterSave: true,
                          closeRevalidation: true,
                        })
                      }
                    >
                      Editar y revalidar
                    </button>
                  ) : null}
                  <button type="button" className="btn" onClick={closeRevalidationFeedback}>
                    Cerrar
                  </button>
                </div>
              </motion.div>
            </motion.div>
          ) : null}
        </AnimatePresence>,
      )}

      {editingInvoicePurchase
        ? renderModalPortal(
            <PurchaseEditInvoiceModal
              editingInvoicePurchase={editingInvoicePurchase}
              editingVoucherKind={editingVoucherKind}
              editingInvoiceDate={editingInvoiceDate}
              editingInvoiceNumber={editingInvoiceNumber}
              editingAuthorizationCode={editingAuthorizationCode}
              isSavingInvoiceEdit={isSavingInvoiceEdit}
              revalidateAfterInvoiceEdit={revalidateAfterInvoiceEdit}
              onSetEditingVoucherKind={setEditingVoucherKind}
              onSetEditingInvoiceDate={setEditingInvoiceDate}
              onSetEditingInvoiceNumber={setEditingInvoiceNumber}
              onSetEditingAuthorizationCode={setEditingAuthorizationCode}
              onClose={closeInvoiceEditor}
              onSave={handleSaveInvoiceEdit}
            />,
          )
        : null}

      {status && !pendingPurchase ? (
        <p className="text-xs text-zinc-500">{status}</p>
      ) : null}
      <ToastContainer position="bottom-right" theme="light" />
    </div>
  );
}
