"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ToastContainer } from "react-toastify";
import {
  ArrowDownTrayIcon,
  ArrowPathIcon,
  CurrencyDollarIcon,
  ChevronDownIcon,
  DocumentTextIcon,
  TrashIcon,
} from "@/components/icons";
import { WhatsappPdfButton } from "@/components/WhatsappPdfButton";
import { getAfipMissingItems, summarizeAfipMissing } from "@/lib/afip/messages";
import { formatCurrencyARS } from "@/lib/format";
import type { SaleRow } from "../sales/types";
import {
  CUSTOMER_FISCAL_TAX_PROFILE_LABELS,
  inferFiscalTaxProfileFromArcaTaxStatus,
  normalizeCustomerFiscalTaxProfile,
  requiresRecipientTaxIdForFiscalTaxProfile,
  resolveInvoiceTypeFromFiscalTaxProfile,
  type CustomerFiscalTaxProfile,
} from "@/lib/customers/fiscal-profile";
import {
  hasTaxpayerLookupError,
  readTaxpayerLookupWarnings,
  summarizeTaxpayerLookupWarnings,
} from "@/lib/arca/taxpayer-lookup-feedback";
import {
  buildAdjustedTotalsFromRates,
  buildTotalsFromRates,
} from "@/lib/afip/totals";
import { getAdjustmentLabel } from "@/lib/sale-adjustments";
import { MoneyInput } from "@/components/inputs/MoneyInput";
import { cn } from "@/lib/cn";
import "react-toastify/dist/ReactToastify.css";

type AfipStatus = {
  ok: boolean;
  env: string;
  missing: string[];
  missingOptional: string[];
  clientReady?: boolean;
  helpLinks?: Array<{ label: string; url: string }>;
};

type BillingClientProps = {
  initialSales: SaleRow[];
  initialIssuedInvoices: IssuedInvoiceRow[];
  initialCreditNotes: IssuedCreditNoteRow[];
  initialDebitNotes: IssuedDebitNoteRow[];
  afipStatus: AfipStatus;
};

type ArcaValidationState = {
  status: "idle" | "loading" | "ok" | "warning" | "error";
  message: string | null;
  source: string | null;
  checkedAt: string | null;
  suggestedFiscalTaxProfile: CustomerFiscalTaxProfile | null;
  arcaTaxStatus: string | null;
};

type IssuedInvoiceRow = {
  id: string;
  saleId: string;
  saleNumber: string | null;
  customerName: string;
  customerPhone?: string | null;
  customerType?: string | null;
  customerFiscalTaxProfile?: string | null;
  type: string | null;
  pointOfSale: string | null;
  number: string | null;
  cae: string | null;
  issuedAt: string | null;
  createdAt: string;
  subtotal: string | null;
  iva: string | null;
  total: string | null;
};

type IssuedInvoicePayload = {
  id: string;
  type: string | null;
  pointOfSale: string | null;
  number: string | null;
  cae: string | null;
  issuedAt: string | null;
  createdAt: string | null;
};

type IssuedCreditNoteRow = {
  id: string;
  fiscalInvoiceId: string | null;
  saleId: string | null;
  number: string | null;
  pointOfSale: string | null;
  type: string | null;
  cae: string | null;
  issuedAt: string | null;
  createdAt: string;
};

type IssuedDebitNoteRow = {
  id: string;
  fiscalCreditNoteId: string;
  fiscalInvoiceId: string | null;
  number: string | null;
  pointOfSale: string | null;
  type: string | null;
  cae: string | null;
  issuedAt: string | null;
  createdAt: string;
};

type CreditNotePreview = {
  invoiceId: string;
  customerName: string;
  customerTaxId: string | null;
  invoiceType: string | null;
  pointOfSale: string | null;
  number: string | null;
  issuedAt: string | null;
  currencyCode: string;
  concept: number | null;
  docType: number | null;
  docNumber: number | null;
  net: number;
  iva: number;
  exempt: number;
  total: number;
};

type InvoiceDraftResult =
  | {
      ok: false;
      error: string;
    }
  | {
      ok: true;
      itemsTaxRates: Array<{ saleItemId: string; rate: number }>;
      fiscalTotals: ReturnType<typeof buildAdjustedTotalsFromRates>;
      adjustmentTotal: number;
    };

type InvoiceResolution =
  | {
      type: "USE_ISSUE_DATE";
      issueDate: string;
      title: string;
      description: string;
      primaryActionLabel: string;
    }
  | {
      type: "RECALCULATE_FISCAL_TOTALS";
      title: string;
      description: string;
      primaryActionLabel: string;
    };

type InvoiceApiErrorPayload = {
  code?: string;
  error?: string;
  resolution?: unknown;
};

type EditableInvoiceItem = {
  id: string;
  productName: string;
  qty: string;
  unitPrice: string;
  taxRate: string;
};

const CONSUMER_FINAL_THRESHOLD = 10_000_000;
const QUEUE_POLL_ATTEMPTS = 90;
const QUEUE_POLL_INTERVAL_MS = 1000;

const ALLOWED_IVA_RATES = new Set<number>([0, 2.5, 5, 10.5, 21, 27]);
const DOC_TYPE_LABELS: Record<number, string> = {
  80: "CUIT",
  86: "CUIL",
  87: "CDI",
  89: "LE",
  90: "LC",
  91: "CI extranjera",
  92: "En tramite",
  93: "Acta nacimiento",
  94: "Pasaporte",
  95: "CI BS AS RNP",
  96: "DNI",
  99: "Consumidor final",
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeTaxId(value?: string | null) {
  return (value ?? "").replace(/\D/g, "");
}

function round2(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function parseFiniteNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatVoucherLabel(pointOfSale?: string | null, number?: string | null) {
  if (pointOfSale && number) return `${pointOfSale}-${number}`;
  return number ?? "-";
}

function formatDateInput(value: string) {
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("es-AR");
}

function toDateInputValue(value: Date) {
  const year = value.getFullYear();
  const month = `${value.getMonth() + 1}`.padStart(2, "0");
  const day = `${value.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function buildFiscalInvoicePdfHref(
  invoiceId: string,
  variant: "factura" | "comprobante",
) {
  const params = variant === "comprobante" ? "?variant=comprobante" : "";
  return `/api/fiscal-invoices/${invoiceId}/pdf${params}`;
}

function openPdfInNewTab(href: string) {
  window.open(href, "_blank", "noopener,noreferrer");
}

function isInvoiceResolution(value: unknown): value is InvoiceResolution {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  const hasBaseShape =
    typeof record.title === "string" &&
    typeof record.description === "string" &&
    typeof record.primaryActionLabel === "string";
  if (!hasBaseShape) return false;
  if (record.type === "RECALCULATE_FISCAL_TOTALS") return true;
  return record.type === "USE_ISSUE_DATE" && typeof record.issueDate === "string";
}

function cleanInvoiceErrorMessage(value: unknown) {
  const message =
    typeof value === "string" && value.trim()
      ? value.trim()
      : "No se pudo emitir la factura.";
  const lower = message.toLowerCase();
  if (
    lower.includes("feparam") ||
    lower.includes("fep") ||
    lower.includes("soap") ||
    lower.includes("wsfe") ||
    lower.includes("exception")
  ) {
    return "ARCA rechazo la solicitud. Revisa los datos de la factura e intenta nuevamente.";
  }
  return message.replace(/AFIP/g, "ARCA");
}

function FiscalAmountItem({ label, value }: { label: string; value: number }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
        {label}
      </p>
      <p className="mt-1 break-words text-sm font-semibold text-zinc-900">
        {formatCurrencyARS(value.toFixed(2))}
      </p>
    </div>
  );
}

export default function BillingClient({
  initialSales,
  initialIssuedInvoices,
  initialCreditNotes,
  initialDebitNotes,
  afipStatus,
}: BillingClientProps) {
  const [sales, setSales] = useState<SaleRow[]>(initialSales);
  const [issuedInvoices, setIssuedInvoices] =
    useState<IssuedInvoiceRow[]>(initialIssuedInvoices);
  const [issuedCreditNotes, setIssuedCreditNotes] =
    useState<IssuedCreditNoteRow[]>(initialCreditNotes);
  const [issuedDebitNotes, setIssuedDebitNotes] =
    useState<IssuedDebitNoteRow[]>(initialDebitNotes);
  const [sortOrder, setSortOrder] = useState("newest");
  const [billingQuery, setBillingQuery] = useState("");
  const [issuedQuery, setIssuedQuery] = useState("");
  const [onlyCurrentMonth, setOnlyCurrentMonth] = useState(false);
  const [isAfipHelpOpen, setIsAfipHelpOpen] = useState(false);
  const [isToBillOpen, setIsToBillOpen] = useState(true);
  const [isIssuedOpen, setIsIssuedOpen] = useState(false);
  const now = new Date();
  const [reportFrom, setReportFrom] = useState(() =>
    toDateInputValue(new Date(now.getFullYear(), now.getMonth(), 1)),
  );
  const [reportTo, setReportTo] = useState(() =>
    toDateInputValue(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
  );
  const [saleToInvoice, setSaleToInvoice] = useState<SaleRow | null>(null);
  const [invoiceStep, setInvoiceStep] = useState<"FORM" | "CONFIRM">("FORM");
  const [isIssuing, setIsIssuing] = useState(false);
  const [invoiceStatus, setInvoiceStatus] = useState<string | null>(null);
  const [invoiceWarnings, setInvoiceWarnings] = useState<string[]>([]);
  const [invoiceResolution, setInvoiceResolution] =
    useState<InvoiceResolution | null>(null);
  const [invoiceIssueDateOverride, setInvoiceIssueDateOverride] =
    useState<string | null>(null);
  const [selectedInvoiceType, setSelectedInvoiceType] = useState<"A" | "B">("B");
  const [invoiceForm, setInvoiceForm] = useState({
    requiresIncomeTaxDeduction: false,
  });
  const [editableInvoiceItems, setEditableInvoiceItems] = useState<
    EditableInvoiceItem[]
  >([]);
  const [isSavingInvoiceSale, setIsSavingInvoiceSale] = useState(false);
  const [markingInternalSaleId, setMarkingInternalSaleId] = useState<string | null>(null);
  const [invoiceToCancel, setInvoiceToCancel] = useState<IssuedInvoiceRow | null>(null);
  const [creditNoteStep, setCreditNoteStep] = useState<"FORM" | "CONFIRM">("FORM");
  const [creditPreview, setCreditPreview] = useState<CreditNotePreview | null>(null);
  const [creditPreviewStatus, setCreditPreviewStatus] = useState<string | null>(null);
  const [isIssuingCreditNote, setIsIssuingCreditNote] = useState(false);
  const [creditNoteToRevert, setCreditNoteToRevert] = useState<{
    invoice: IssuedInvoiceRow;
    creditNote: IssuedCreditNoteRow;
  } | null>(null);
  const [debitNoteStep, setDebitNoteStep] = useState<"FORM" | "CONFIRM">("FORM");
  const [debitPreviewStatus, setDebitPreviewStatus] = useState<string | null>(null);
  const [isIssuingDebitNote, setIsIssuingDebitNote] = useState(false);
  const [arcaValidation, setArcaValidation] = useState<ArcaValidationState>({
    status: "idle",
    message: null,
    source: null,
    checkedAt: null,
    suggestedFiscalTaxProfile: null,
    arcaTaxStatus: null,
  });

  const toBillSales = useMemo(
    () => sales.filter((sale) => sale.billingStatus === "TO_BILL"),
    [sales],
  );

  const filteredToBill = useMemo(() => {
    const query = billingQuery.trim().toLowerCase();
    const now = new Date();
    const list = toBillSales.filter((sale) => {
      if (query) {
        const haystack =
          `${sale.customerName} ${sale.saleNumber ?? ""}`.toLowerCase();
        if (!haystack.includes(query)) return false;
      }

      if (onlyCurrentMonth) {
        const saleDate = new Date(sale.saleDate ?? sale.createdAt);
        const sameMonth =
          saleDate.getMonth() === now.getMonth() &&
          saleDate.getFullYear() === now.getFullYear();
        if (!sameMonth) return false;
      }

      return true;
    });

    list.sort((a, b) => {
      const aDate = new Date(a.saleDate ?? a.createdAt).getTime();
      const bDate = new Date(b.saleDate ?? b.createdAt).getTime();
      return sortOrder === "oldest" ? aDate - bDate : bDate - aDate;
    });

    return list;
  }, [billingQuery, onlyCurrentMonth, sortOrder, toBillSales]);

  const activeFilterCount = useMemo(
    () =>
      [Boolean(billingQuery.trim()), onlyCurrentMonth, sortOrder !== "newest"]
        .filter(Boolean).length,
    [billingQuery, onlyCurrentMonth, sortOrder],
  );

  const filteredIssuedInvoices = useMemo(() => {
    const query = issuedQuery.trim().toLowerCase();
    const list = issuedInvoices.filter((invoice) => {
      if (!query) return true;
      const haystack = `${invoice.customerName} ${invoice.saleNumber ?? ""} ${
        invoice.number ?? ""
      } ${invoice.cae ?? ""}`.toLowerCase();
      return haystack.includes(query);
    });
    list.sort((a, b) => {
      const aDate = new Date(a.issuedAt ?? a.createdAt).getTime();
      const bDate = new Date(b.issuedAt ?? b.createdAt).getTime();
      return bDate - aDate;
    });
    return list;
  }, [issuedInvoices, issuedQuery]);

  const creditNoteByInvoiceId = useMemo(() => {
    const map = new Map<string, IssuedCreditNoteRow>();
    for (const note of issuedCreditNotes) {
      if (!note.fiscalInvoiceId || map.has(note.fiscalInvoiceId)) continue;
      map.set(note.fiscalInvoiceId, note);
    }
    return map;
  }, [issuedCreditNotes]);

  const creditNoteBySaleId = useMemo(() => {
    const map = new Map<string, IssuedCreditNoteRow>();
    for (const note of issuedCreditNotes) {
      if (!note.saleId || map.has(note.saleId)) continue;
      map.set(note.saleId, note);
    }
    return map;
  }, [issuedCreditNotes]);

  const debitNoteByCreditNoteId = useMemo(() => {
    const map = new Map<string, IssuedDebitNoteRow>();
    for (const note of issuedDebitNotes) {
      if (!note.fiscalCreditNoteId || map.has(note.fiscalCreditNoteId)) continue;
      map.set(note.fiscalCreditNoteId, note);
    }
    return map;
  }, [issuedDebitNotes]);

  const billed = useMemo(
    () => sales.filter((sale) => sale.billingStatus === "BILLED"),
    [sales]
  );

  const totalToBill = toBillSales.reduce((total, sale) => {
    if (!sale.total) return total;
    const value = Number(sale.total);
    return Number.isFinite(value) ? total + value : total;
  }, 0);

  const afipReady = Boolean(afipStatus.ok && afipStatus.clientReady);
  const afipMissingItems = getAfipMissingItems(afipStatus.missing);
  const afipOptionalItems = getAfipMissingItems(afipStatus.missingOptional);
  const afipRequiredSummary = summarizeAfipMissing(afipStatus.missing);
  const afipOptionalSummary = summarizeAfipMissing(afipStatus.missingOptional);
  const afipHint = afipReady
    ? "Conexion ARCA activa"
    : afipStatus.ok
      ? afipOptionalSummary || "Cliente ARCA no disponible"
      : afipRequiredSummary ||
        afipOptionalSummary ||
        "Configuracion pendiente";
  const afipStatusClass = afipReady
    ? "bg-white text-emerald-800 border border-emerald-200"
    : "bg-white text-rose-800 border border-rose-200";
  const helpLinkClass = (label: string) => {
    const normalized = label.toLowerCase();
    if (normalized.includes("token")) return "btn-sky";
    if (normalized.includes("certificado")) return "btn-amber";
    if (normalized.includes("autorizar")) return "btn-indigo";
    if (normalized.includes("punto de venta")) return "btn-emerald";
    return "";
  };

  const openInvoiceModal = (sale: SaleRow) => {
    const customerFiscalProfile = normalizeCustomerFiscalTaxProfile(
      sale.customerFiscalTaxProfile ?? null
    );
    setSaleToInvoice(sale);
    setSelectedInvoiceType(
      resolveInvoiceTypeFromFiscalTaxProfile(customerFiscalProfile)
    );
    setInvoiceStep("FORM");
    setInvoiceWarnings([]);
    setInvoiceStatus(null);
    setInvoiceResolution(null);
    setInvoiceIssueDateOverride(null);
    setInvoiceForm({
      requiresIncomeTaxDeduction: false,
    });
    setEditableInvoiceItems(
      (sale.items ?? [])
        .filter((item): item is NonNullable<SaleRow["items"]>[number] & { id: string } =>
          Boolean(item.id)
        )
        .map((item) => ({
          id: item.id,
          productName: item.productName,
          qty: item.qty,
          unitPrice: Number(item.unitPrice ?? 0).toFixed(2),
          taxRate: Number(item.taxRate ?? 0).toFixed(2),
        }))
    );
    setArcaValidation({
      status: "idle",
      message: null,
      source: null,
      checkedAt: null,
      suggestedFiscalTaxProfile: null,
      arcaTaxStatus: null,
    });
  };

  const closeInvoiceModal = () => {
    if (isIssuing || isSavingInvoiceSale) return;
    setInvoiceStep("FORM");
    setSaleToInvoice(null);
    setInvoiceResolution(null);
    setInvoiceIssueDateOverride(null);
    setEditableInvoiceItems([]);
  };

  const openCreditNoteModal = (invoice: IssuedInvoiceRow) => {
    setInvoiceToCancel(invoice);
    setCreditNoteStep("FORM");
    setCreditPreview(null);
    setCreditPreviewStatus("Cargando datos de la factura...");
    setInvoiceStatus(null);
    setInvoiceResolution(null);
  };

  const closeCreditNoteModal = () => {
    if (isIssuingCreditNote) return;
    setCreditNoteStep("FORM");
    setInvoiceToCancel(null);
    setCreditPreview(null);
    setCreditPreviewStatus(null);
  };

  const openDebitNoteModal = (
    invoice: IssuedInvoiceRow,
    creditNote: IssuedCreditNoteRow,
  ) => {
    setCreditNoteToRevert({ invoice, creditNote });
    setDebitNoteStep("FORM");
    setDebitPreviewStatus(null);
  };

  const closeDebitNoteModal = () => {
    if (isIssuingDebitNote) return;
    setCreditNoteToRevert(null);
    setDebitNoteStep("FORM");
    setDebitPreviewStatus(null);
  };

  useEffect(() => {
    if (!invoiceToCancel) return;

    let cancelled = false;
    const loadCreditPreview = async () => {
      try {
        const res = await fetch(`/api/fiscal-invoices/${invoiceToCancel.id}`, {
          cache: "no-store",
        });
        const data = await res.json();
        if (!res.ok) {
          if (cancelled) return;
          setCreditPreviewStatus(
            data?.error ?? "No se pudo cargar la factura para anular."
          );
          return;
        }

        const payloadAfip =
          typeof data?.payloadAfip === "object" && data.payloadAfip
            ? (data.payloadAfip as Record<string, unknown>)
            : null;
        const voucherData =
          payloadAfip &&
          typeof payloadAfip.voucherData === "object" &&
          payloadAfip.voucherData
            ? (payloadAfip.voucherData as Record<string, unknown>)
            : null;

        const pointOfSaleRaw =
          parseFiniteNumber(voucherData?.PtoVta) ??
          parseFiniteNumber(data?.pointOfSale);
        const numberRaw =
          parseFiniteNumber(voucherData?.CbteDesde) ??
          parseFiniteNumber(voucherData?.CbteHasta) ??
          parseFiniteNumber(data?.number);
        const issuedAt =
          typeof data?.issuedAt === "string" ? data.issuedAt : invoiceToCancel.issuedAt;
        const currencyCodeRaw =
          typeof voucherData?.MonId === "string"
            ? voucherData.MonId
            : typeof data?.currencyCode === "string"
              ? data.currencyCode
              : "ARS";
        const currencyCode =
          currencyCodeRaw === "PES"
            ? "ARS"
            : currencyCodeRaw === "DOL"
              ? "USD"
              : currencyCodeRaw;
        const customerName =
          typeof data?.customer?.displayName === "string"
            ? data.customer.displayName
            : invoiceToCancel.customerName;
        const customerTaxId =
          typeof data?.customer?.taxId === "string" ? data.customer.taxId : null;
        const invoiceType =
          typeof data?.type === "string" ? data.type : invoiceToCancel.type;
        const net =
          round2(
            parseFiniteNumber(voucherData?.ImpNeto) ??
              parseFiniteNumber(invoiceToCancel.subtotal) ??
              0
          );
        const iva =
          round2(
            parseFiniteNumber(voucherData?.ImpIVA) ??
              parseFiniteNumber(invoiceToCancel.iva) ??
              0
          );
        const exempt = round2(parseFiniteNumber(voucherData?.ImpOpEx) ?? 0);
        const total =
          round2(
            parseFiniteNumber(voucherData?.ImpTotal) ??
              parseFiniteNumber(invoiceToCancel.total) ??
              net + iva + exempt
          );
        const concept = parseFiniteNumber(voucherData?.Concepto);
        const docType = parseFiniteNumber(voucherData?.DocTipo);
        const docNumber = parseFiniteNumber(voucherData?.DocNro);

        if (cancelled) return;
        setCreditPreview({
          invoiceId: invoiceToCancel.id,
          customerName,
          customerTaxId,
          invoiceType,
          pointOfSale:
            pointOfSaleRaw !== null ? pointOfSaleRaw.toString().padStart(4, "0") : null,
          number: numberRaw !== null ? numberRaw.toString().padStart(8, "0") : null,
          issuedAt,
          currencyCode,
          concept,
          docType,
          docNumber,
          net,
          iva,
          exempt,
          total,
        });
        setCreditPreviewStatus(null);
      } catch {
        if (cancelled) return;
        setCreditPreviewStatus("No se pudo cargar la factura para anular.");
      }
    };

    void loadCreditPreview();
    return () => {
      cancelled = true;
    };
  }, [invoiceToCancel]);

  const invoicePreviewItems = editableInvoiceItems.map((item) => {
    const qty = Number(item.qty ?? 0);
    const unitPrice = Number(item.unitPrice ?? 0);
    const base = round2(qty * unitPrice);
    const taxRate = Number(item.taxRate ?? 0);
    const iva = round2(base * (taxRate / 100));
    const lineTotal = round2(base + iva);
    return {
      id: item.id,
      productName: item.productName,
      qty,
      unitPrice,
      taxRate,
      base,
      iva,
      lineTotal,
    };
  });
  const previewSubtotal = round2(
    invoicePreviewItems.reduce((total, item) => total + item.base, 0)
  );
  const previewIva = round2(
    invoicePreviewItems.reduce((total, item) => total + item.iva, 0)
  );
  const previewExtraAmount = round2(Number(saleToInvoice?.extraAmount ?? 0));
  const previewChargesTotal = round2(Number(saleToInvoice?.chargesTotal ?? 0));
  const previewTotal = round2(
    previewSubtotal + previewIva + previewExtraAmount + previewChargesTotal
  );
  const invoiceTotal = previewTotal;
  const customerFiscalTaxProfile = normalizeCustomerFiscalTaxProfile(
    saleToInvoice?.customerFiscalTaxProfile ?? null
  );
  const recommendedInvoiceType = resolveInvoiceTypeFromFiscalTaxProfile(
    customerFiscalTaxProfile
  );
  const resolvedInvoiceType = selectedInvoiceType;
  const isConsumerFinal =
    customerFiscalTaxProfile === "CONSUMIDOR_FINAL" ||
    (!customerFiscalTaxProfile &&
      (saleToInvoice?.customerType ?? "CONSUMER_FINAL") === "CONSUMER_FINAL");
  const requiresIdentification =
    isConsumerFinal &&
    (invoiceTotal >= CONSUMER_FINAL_THRESHOLD ||
      invoiceForm.requiresIncomeTaxDeduction);
  const requiresProfileTaxId =
    requiresRecipientTaxIdForFiscalTaxProfile(customerFiscalTaxProfile);
  const hasRecipientDoc = normalizeTaxId(saleToInvoice?.customerTaxId).length === 11;
  const recipientDocumentLabel = hasRecipientDoc
    ? `CUIT ${saleToInvoice?.customerTaxId}`
    : isConsumerFinal
      ? "Consumidor final sin CUIT"
      : "Sin CUIT cargado";
  const customerFiscalTaxProfileLabel = customerFiscalTaxProfile
    ? CUSTOMER_FISCAL_TAX_PROFILE_LABELS[customerFiscalTaxProfile]
    : "Sin definir";
  const shouldShowDeductionToggle = !(isConsumerFinal && !hasRecipientDoc);
  const previewItems = invoicePreviewItems;
  const invoiceIssueDateLabel = invoiceIssueDateOverride
    ? formatDateInput(invoiceIssueDateOverride)
    : saleToInvoice?.saleDate
      ? new Date(saleToInvoice.saleDate).toLocaleDateString("es-AR")
      : saleToInvoice?.createdAt
        ? new Date(saleToInvoice.createdAt).toLocaleDateString("es-AR")
        : "-";
  const linkedCreditNoteForSelectedInvoice = invoiceToCancel
    ? creditNoteByInvoiceId.get(invoiceToCancel.id) ?? null
    : null;
  const linkedDebitNoteForSelectedCreditNote = creditNoteToRevert
    ? debitNoteByCreditNoteId.get(creditNoteToRevert.creditNote.id) ?? null
    : null;

  const goToCreditNoteConfirmStep = () => {
    if (!invoiceToCancel) return;
    if (creditNoteByInvoiceId.has(invoiceToCancel.id)) {
      setCreditPreviewStatus("La factura ya tiene una nota de credito emitida.");
      return;
    }
    if (!creditPreview) {
      setCreditPreviewStatus("Esperando datos de la factura para anular.");
      return;
    }
    setCreditPreviewStatus(null);
    setCreditNoteStep("CONFIRM");
  };

  const goToDebitNoteConfirmStep = () => {
    if (!creditNoteToRevert) return;
    if (debitNoteByCreditNoteId.has(creditNoteToRevert.creditNote.id)) {
      setDebitPreviewStatus("La nota de credito ya tiene una nota de debito emitida.");
      return;
    }
    setDebitPreviewStatus(null);
    setDebitNoteStep("CONFIRM");
  };

  const hasEditableInvoiceChanges = useMemo(() => {
    if (!saleToInvoice) return false;
    const originalItems = (saleToInvoice.items ?? []).filter(
      (item): item is NonNullable<SaleRow["items"]>[number] & { id: string } =>
        Boolean(item.id)
    );
    if (originalItems.length !== editableInvoiceItems.length) return false;
    return editableInvoiceItems.some((item) => {
      const original = originalItems.find((candidate) => candidate.id === item.id);
      if (!original) return false;
      return round2(Number(original.unitPrice ?? 0)) !== round2(Number(item.unitPrice ?? 0));
    });
  }, [editableInvoiceItems, saleToInvoice]);

  const buildInvoiceDraft = (): InvoiceDraftResult => {
    if (!saleToInvoice) {
      return { ok: false, error: "No hay venta seleccionada para facturar." };
    }
    const total = previewTotal;
    if (!Number.isFinite(total) || total <= 0) {
      return { ok: false, error: "No se pudo calcular totales de la venta." };
    }
    if (resolvedInvoiceType === "A" && !hasRecipientDoc) {
      return {
        ok: false,
        error:
          "Factura A requiere CUIT valido del cliente. Actualizalo en Clientes antes de emitir.",
      };
    }
    if (requiresProfileTaxId && !hasRecipientDoc) {
      return {
        ok: false,
        error:
          "Esta condicion fiscal requiere CUIT valido del cliente. Actualizalo antes de emitir.",
      };
    }
    if (requiresIdentification && !hasRecipientDoc) {
      return {
        ok: false,
        error:
          "Por monto o deduccion corresponde identificar al receptor. Carga CUIT del cliente para facturar.",
      };
    }

    let hasInvalidTaxRate = false;
    const fiscalEntries: Array<{ base: number; rate: number }> = [];
    const itemsTaxRates = previewItems
      .map((item) => {
        const rate = Number(item.taxRate ?? 0);
        if (!Number.isFinite(rate) || !ALLOWED_IVA_RATES.has(rate)) {
          hasInvalidTaxRate = true;
          return null;
        }
        const base = Number(item.base ?? 0);
        if (!Number.isFinite(base) || base < 0) {
          hasInvalidTaxRate = true;
          return null;
        }
        fiscalEntries.push({ base, rate });
        return { saleItemId: item.id, rate };
      })
      .filter(
        (item): item is { saleItemId: string; rate: number } => item !== null
      );
    if (hasInvalidTaxRate) {
      return {
        ok: false,
        error:
          "La venta tiene alicuotas de IVA invalidas. Corrigela antes de facturar.",
      };
    }
    if (!itemsTaxRates.length) {
      return {
        ok: false,
        error:
          "La venta no tiene alicuotas de IVA por item. Revisala antes de facturar.",
      };
    }
    try {
      const baseTotals = buildTotalsFromRates(fiscalEntries);
      const adjustmentTotal = round2(total - baseTotals.total);
      const fiscalTotals = buildAdjustedTotalsFromRates(
        fiscalEntries,
        adjustmentTotal,
      );
      return { ok: true, itemsTaxRates, fiscalTotals, adjustmentTotal };
    } catch {
      return {
        ok: false,
        error:
          "No se pudieron calcular totales fiscales validos para esta venta.",
      };
    }
  };

  const invoiceDraftPreview = saleToInvoice ? buildInvoiceDraft() : null;
  const fiscalPreview =
    invoiceDraftPreview?.ok === true ? invoiceDraftPreview.fiscalTotals : null;
  const fiscalAdjustmentTotal =
    invoiceDraftPreview?.ok === true ? invoiceDraftPreview.adjustmentTotal : 0;
  const fiscalAdjustmentLabel = getAdjustmentLabel(
    saleToInvoice?.extraType,
    fiscalAdjustmentTotal,
  );
  const hasRegularSurchargeAdjustment =
    Boolean(saleToInvoice) &&
    fiscalAdjustmentTotal > 0 &&
    (saleToInvoice?.extraType === "PERCENT" || saleToInvoice?.extraType === "FIXED");
  const invoiceRecipientRequirementMessage = !hasRecipientDoc
    ? resolvedInvoiceType === "A"
      ? "Factura A requiere CUIT valido del cliente."
      : requiresIdentification
        ? "Por monto o deduccion, este comprobante necesita CUIT del receptor."
        : requiresProfileTaxId
          ? "Esta condicion fiscal requiere CUIT valido para informar correctamente el receptor en ARCA."
          : null
    : null;
  const invoiceRecipientMessageClass = invoiceRecipientRequirementMessage
    ? "text-amber-800"
    : arcaValidation.status === "ok"
      ? "text-emerald-700"
      : arcaValidation.status === "warning"
        ? "text-amber-700"
        : arcaValidation.status === "error"
          ? "text-rose-700"
          : "text-zinc-600";
  const invoiceRecipientCheckedLabel = arcaValidation.checkedAt
    ? `Validado ${new Date(arcaValidation.checkedAt).toLocaleString("es-AR")}${
        arcaValidation.source ? ` · ${arcaValidation.source}` : ""
      }`
    : null;
  const invoiceRecipientMessageNormalized = invoiceRecipientRequirementMessage
    ? invoiceRecipientRequirementMessage
    : arcaValidation.message?.startsWith("CUIT validado con ARCA.")
      ? arcaValidation.message.replace("CUIT validado con ARCA.", "").trim() || null
      : arcaValidation.message;
  const shouldShowArcaCondition =
    Boolean(arcaValidation.arcaTaxStatus) &&
    (!customerFiscalTaxProfile ||
      arcaValidation.suggestedFiscalTaxProfile !== customerFiscalTaxProfile);
  const showInvoiceFooterNote = invoiceStep === "FORM" && hasEditableInvoiceChanges;
  const invoiceStepLabel =
    invoiceStep === "FORM" ? "Paso 1 de 2" : "Paso 2 de 2";
  const invoiceStepHeading =
    invoiceStep === "FORM" ? "Emitir factura" : "Confirmar factura";
  const invoiceStepSubtitle =
    invoiceStep === "FORM"
      ? `Venta ${saleToInvoice?.saleNumber ?? saleToInvoice?.id} · ${saleToInvoice?.customerName ?? ""}`
      : `${saleToInvoice?.customerName ?? ""} · Venta ${saleToInvoice?.saleNumber ?? saleToInvoice?.id ?? ""}`;
  const invoicePrimaryActionLabel =
    invoiceStep === "FORM"
      ? isSavingInvoiceSale
        ? "Guardando cambios..."
        : "Continuar a confirmar"
      : isIssuing
        ? "Confirmando..."
        : "Confirmar factura";

  const handleInvoiceIssueError = (data: InvoiceApiErrorPayload | null) => {
    setInvoiceStatus(cleanInvoiceErrorMessage(data?.error));
    setInvoiceResolution(
      isInvoiceResolution(data?.resolution) ? data.resolution : null,
    );
  };

  const saveInvoiceSaleEdits = async () => {
    if (!saleToInvoice || !hasEditableInvoiceChanges) {
      return saleToInvoice;
    }

    setIsSavingInvoiceSale(true);
    try {
      const payload = {
        id: saleToInvoice.id,
        note: "Importes ajustados antes de emitir factura",
        items: editableInvoiceItems.map((item) => ({
          id: item.id,
          unitPrice: Number(item.unitPrice ?? 0),
        })),
      };
      const res = await fetch("/api/sales", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setInvoiceStatus(data?.error ?? "No se pudieron guardar los cambios de la venta.");
        return null;
      }

      const updatedSale = data as SaleRow;
      setSales((prev) =>
        prev.map((sale) => (sale.id === updatedSale.id ? updatedSale : sale))
      );
      setSaleToInvoice(updatedSale);
      setInvoiceStatus("Importes actualizados. Revisa y confirma la factura.");
      return updatedSale;
    } catch {
      setInvoiceStatus("No se pudieron guardar los cambios de la venta.");
      return null;
    } finally {
      setIsSavingInvoiceSale(false);
    }
  };

  const goToConfirmStep = async () => {
    if (hasEditableInvoiceChanges) {
      const savedSale = await saveInvoiceSaleEdits();
      if (!savedSale) {
        setInvoiceResolution(null);
        return;
      }
    }
    const draft = buildInvoiceDraft();
    if (!draft.ok) {
      setInvoiceStatus(draft.error);
      setInvoiceResolution(null);
      return;
    }
    setInvoiceStatus(null);
    setInvoiceResolution(null);
    setInvoiceStep("CONFIRM");
  };

  const applyIssuedInvoice = (
    saleSnapshot: SaleRow,
    invoice: IssuedInvoicePayload,
    warnings: string[]
  ) => {
    setInvoiceWarnings(warnings);
    setInvoiceStatus("Factura emitida correctamente.");
    setSales((prev) =>
      prev.map((sale) =>
        sale.id === saleSnapshot.id ? { ...sale, billingStatus: "BILLED" } : sale
      )
    );
    setIssuedInvoices((prev) => {
      const entry: IssuedInvoiceRow = {
        id: invoice.id,
        saleId: saleSnapshot.id,
        saleNumber: saleSnapshot.saleNumber,
        customerName: saleSnapshot.customerName,
        customerPhone: saleSnapshot.customerPhone,
        customerType: saleSnapshot.customerType,
        customerFiscalTaxProfile: saleSnapshot.customerFiscalTaxProfile,
        type: invoice.type,
        pointOfSale: invoice.pointOfSale,
        number: invoice.number,
        cae: invoice.cae,
        issuedAt: invoice.issuedAt,
        createdAt: invoice.createdAt ?? new Date().toISOString(),
        subtotal: saleSnapshot.subtotal ?? null,
        iva: saleSnapshot.taxes ?? null,
        total: saleSnapshot.total ?? null,
      };
      const deduped = prev.filter(
        (item) => item.id !== entry.id && item.saleId !== entry.saleId
      );
      return [entry, ...deduped];
    });
    setIssuedCreditNotes((prev) =>
      prev.map((note) =>
        note.fiscalInvoiceId === invoice.id && !debitNoteByCreditNoteId.has(note.id)
          ? { ...note, fiscalInvoiceId: null }
          : note
      )
    );
    openPdfInNewTab(buildFiscalInvoicePdfHref(invoice.id, "factura"));
  };

  const waitForQueuedInvoice = async (jobId: string, saleSnapshot: SaleRow) => {
    for (let attempt = 0; attempt < QUEUE_POLL_ATTEMPTS; attempt += 1) {
      const pollResponse = await fetch(`/api/fiscal-invoices/jobs/${jobId}`, {
        cache: "no-store",
      });
      const pollData = await pollResponse.json();
      if (!pollResponse.ok) {
        handleInvoiceIssueError(
          pollData && typeof pollData === "object"
            ? (pollData as InvoiceApiErrorPayload)
            : null,
        );
        return false;
      }

      if (
        pollData?.status === "COMPLETED" &&
        pollData?.invoice &&
        typeof pollData.invoice.id === "string"
      ) {
        const warnings = Array.isArray(pollData?.warnings)
          ? pollData.warnings.filter(
              (item: unknown): item is string => typeof item === "string"
            )
          : [];
        applyIssuedInvoice(
          saleSnapshot,
          {
            id: pollData.invoice.id,
            type:
              typeof pollData.invoice.type === "string"
                ? pollData.invoice.type
                : null,
            pointOfSale:
              typeof pollData.invoice.pointOfSale === "string"
                ? pollData.invoice.pointOfSale
                : null,
            number:
              typeof pollData.invoice.number === "string"
                ? pollData.invoice.number
                : null,
            cae:
              typeof pollData.invoice.cae === "string"
                ? pollData.invoice.cae
                : null,
            issuedAt:
              typeof pollData.invoice.issuedAt === "string"
                ? pollData.invoice.issuedAt
                : null,
            createdAt:
              typeof pollData.invoice.createdAt === "string"
                ? pollData.invoice.createdAt
                : null,
          },
          warnings
        );
        return true;
      }

      if (pollData?.status === "ERROR") {
        handleInvoiceIssueError(
          pollData && typeof pollData === "object"
            ? (pollData as InvoiceApiErrorPayload)
            : null,
        );
        return false;
      }

      setInvoiceStatus(
        pollData?.status === "RUNNING"
          ? "Factura en procesamiento..."
          : "Factura en cola, esperando turno..."
      );
      setInvoiceResolution(null);
      await sleep(QUEUE_POLL_INTERVAL_MS);
    }

    setInvoiceStatus(
      "La factura sigue en cola. Revisa en unos segundos desde el listado."
    );
    return false;
  };

  useEffect(() => {
    if (!saleToInvoice) return;
    const customerTaxId = normalizeTaxId(saleToInvoice.customerTaxId);
    if (!customerTaxId) {
      const canIssueAsConsumerFinal =
        resolvedInvoiceType === "B" && isConsumerFinal && !requiresIdentification;
      setArcaValidation({
        status: canIssueAsConsumerFinal ? "ok" : "warning",
        message: canIssueAsConsumerFinal
          ? "No hace falta validar CUIT para este comprobante. Se emitira como consumidor final."
          : resolvedInvoiceType === "A"
            ? "Factura A requiere CUIT valido del cliente."
          : requiresIdentification
            ? "Por el importe o la deduccion solicitada, este comprobante necesita CUIT del receptor."
            : "Para validar el receptor con ARCA, carga un CUIT en el cliente.",
        source: null,
        checkedAt: null,
        suggestedFiscalTaxProfile: null,
        arcaTaxStatus: null,
      });
      return;
    }

    let cancelled = false;
    const validate = async () => {
      setArcaValidation((prev) => ({
        ...prev,
        status: "loading",
        message: "Validando CUIT en ARCA...",
      }));
      try {
        const res = await fetch("/api/arca/taxpayer-lookup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ taxId: customerTaxId }),
        });
        const data = await res.json();
        if (!res.ok) {
          if (cancelled) return;
          setArcaValidation({
            status: "error",
            message: data?.error ?? "No se pudo validar CUIT en ARCA.",
            source: null,
            checkedAt: null,
            suggestedFiscalTaxProfile: null,
            arcaTaxStatus: null,
          });
          return;
        }

        const arcaTaxStatus =
          typeof data?.taxpayer?.taxStatus === "string"
            ? data.taxpayer.taxStatus
            : null;
        const lookupWarnings = readTaxpayerLookupWarnings(data?.taxpayer);
        const lookupWarningText = summarizeTaxpayerLookupWarnings(lookupWarnings);
        const hasLookupError = hasTaxpayerLookupError(lookupWarnings);
        const suggestedFiscalTaxProfile =
          inferFiscalTaxProfileFromArcaTaxStatus(arcaTaxStatus);
        const currentProfile = normalizeCustomerFiscalTaxProfile(
          saleToInvoice.customerFiscalTaxProfile ?? null
        );
        const checkedAt =
          typeof data?.checkedAt === "string" ? data.checkedAt : null;
        const source = typeof data?.source === "string" ? data.source : null;

        if (cancelled) return;
        if (!suggestedFiscalTaxProfile) {
          setArcaValidation({
            status: hasLookupError ? "error" : "warning",
            message:
              lookupWarningText ||
              "No pudimos identificar automaticamente la condicion frente al IVA. Revisala en la ficha del cliente.",
            source,
            checkedAt,
            suggestedFiscalTaxProfile: null,
            arcaTaxStatus,
          });
          return;
        }

        if (currentProfile && suggestedFiscalTaxProfile !== currentProfile) {
          setArcaValidation({
            status: "warning",
            message: `ARCA sugiere ${CUSTOMER_FISCAL_TAX_PROFILE_LABELS[suggestedFiscalTaxProfile]} y el cliente esta guardado como ${CUSTOMER_FISCAL_TAX_PROFILE_LABELS[currentProfile]}.${
              lookupWarningText ? ` ${lookupWarningText}` : ""
            }`,
            source,
            checkedAt,
            suggestedFiscalTaxProfile,
            arcaTaxStatus,
          });
          return;
        }

        setArcaValidation({
          status: hasLookupError
            ? "error"
            : lookupWarnings.length
              ? "warning"
              : "ok",
          message: lookupWarnings.length
            ? `CUIT validado con ARCA. ${lookupWarningText}`
            : "CUIT validado con ARCA.",
          source,
          checkedAt,
          suggestedFiscalTaxProfile,
          arcaTaxStatus,
        });
      } catch {
        if (cancelled) return;
        setArcaValidation({
          status: "error",
          message: "No se pudo validar CUIT en ARCA.",
          source: null,
          checkedAt: null,
          suggestedFiscalTaxProfile: null,
          arcaTaxStatus: null,
        });
      }
    };

    void validate();
    return () => {
      cancelled = true;
    };
  }, [isConsumerFinal, requiresIdentification, resolvedInvoiceType, saleToInvoice]);

  const refreshArcaValidation = async () => {
    if (!saleToInvoice) return;
    const customerTaxId = normalizeTaxId(saleToInvoice.customerTaxId);
    if (!customerTaxId) {
      const canIssueAsConsumerFinal =
        resolvedInvoiceType === "B" && isConsumerFinal && !requiresIdentification;
      setArcaValidation({
        status: canIssueAsConsumerFinal ? "ok" : "warning",
        message: canIssueAsConsumerFinal
          ? "No hace falta validar CUIT para este comprobante. Se emitira como consumidor final."
          : resolvedInvoiceType === "A"
            ? "Factura A requiere CUIT valido del cliente."
          : "Para revalidar con ARCA, primero carga un CUIT en el cliente.",
        source: null,
        checkedAt: null,
        suggestedFiscalTaxProfile: null,
        arcaTaxStatus: null,
      });
      return;
    }

    setArcaValidation((prev) => ({
      ...prev,
      status: "loading",
      message: "Revalidando CUIT en ARCA...",
    }));
    try {
      const res = await fetch("/api/arca/taxpayer-lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taxId: customerTaxId, forceRefresh: true }),
      });
      const data = await res.json();
      if (!res.ok) {
        setArcaValidation({
          status: "error",
          message: data?.error ?? "No se pudo revalidar CUIT en ARCA.",
          source: null,
          checkedAt: null,
          suggestedFiscalTaxProfile: null,
          arcaTaxStatus: null,
        });
        return;
      }

      const arcaTaxStatus =
        typeof data?.taxpayer?.taxStatus === "string" ? data.taxpayer.taxStatus : null;
      const lookupWarnings = readTaxpayerLookupWarnings(data?.taxpayer);
      const lookupWarningText = summarizeTaxpayerLookupWarnings(lookupWarnings);
      const hasLookupError = hasTaxpayerLookupError(lookupWarnings);
      const suggestedFiscalTaxProfile =
        inferFiscalTaxProfileFromArcaTaxStatus(arcaTaxStatus);
      const currentProfile = normalizeCustomerFiscalTaxProfile(
        saleToInvoice.customerFiscalTaxProfile ?? null
      );
      const checkedAt = typeof data?.checkedAt === "string" ? data.checkedAt : null;
      const source = typeof data?.source === "string" ? data.source : null;

      if (!suggestedFiscalTaxProfile) {
        setArcaValidation({
          status: hasLookupError ? "error" : "warning",
          message:
            lookupWarningText ||
            "No pudimos identificar automaticamente la condicion frente al IVA. Revisala en la ficha del cliente.",
          source,
          checkedAt,
          suggestedFiscalTaxProfile: null,
          arcaTaxStatus,
        });
        return;
      }
      if (currentProfile && suggestedFiscalTaxProfile !== currentProfile) {
        setArcaValidation({
          status: "warning",
          message: `ARCA sugiere ${CUSTOMER_FISCAL_TAX_PROFILE_LABELS[suggestedFiscalTaxProfile]} y el cliente esta guardado como ${CUSTOMER_FISCAL_TAX_PROFILE_LABELS[currentProfile]}.${
            lookupWarningText ? ` ${lookupWarningText}` : ""
          }`,
          source,
          checkedAt,
          suggestedFiscalTaxProfile,
          arcaTaxStatus,
        });
        return;
      }

      setArcaValidation({
        status: hasLookupError
          ? "error"
          : lookupWarnings.length
            ? "warning"
            : "ok",
        message: lookupWarnings.length
          ? `CUIT validado con ARCA. ${lookupWarningText}`
          : "CUIT validado con ARCA.",
        source,
        checkedAt,
        suggestedFiscalTaxProfile,
        arcaTaxStatus,
      });
    } catch {
      setArcaValidation({
        status: "error",
        message: "No se pudo revalidar CUIT en ARCA.",
        source: null,
        checkedAt: null,
        suggestedFiscalTaxProfile: null,
        arcaTaxStatus: null,
      });
    }
  };

  const submitInvoice = async (options?: { issueDateOverride?: string }) => {
    if (!saleToInvoice) return;
    const issueDateOverride =
      options?.issueDateOverride ?? invoiceIssueDateOverride;
    setInvoiceStatus(null);
    setInvoiceResolution(null);
    setInvoiceWarnings([]);
    setIsIssuing(true);
    try {
      const draft = buildInvoiceDraft();
      if (!draft.ok) {
        setInvoiceStatus(draft.error);
        setInvoiceStep("FORM");
        return;
      }
      const payload: Record<string, unknown> = {
        saleId: saleToInvoice.id,
        type: resolvedInvoiceType,
        itemsTaxRates: draft.itemsTaxRates,
        requiresIncomeTaxDeduction: invoiceForm.requiresIncomeTaxDeduction,
      };
      if (issueDateOverride) {
        payload.issueDate = issueDateOverride;
      }

      const res = await fetch("/api/fiscal-invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        handleInvoiceIssueError(
          data && typeof data === "object"
            ? (data as InvoiceApiErrorPayload)
            : null,
        );
        return;
      }

      if (typeof data?.id === "string") {
        const warnings = Array.isArray(data?.warnings)
          ? data.warnings.filter(
              (item: unknown): item is string => typeof item === "string"
            )
          : [];
        applyIssuedInvoice(
          saleToInvoice,
          {
            id: data.id,
            type: typeof data?.type === "string" ? data.type : null,
            pointOfSale:
              typeof data?.pointOfSale === "string" ? data.pointOfSale : null,
            number: typeof data?.number === "string" ? data.number : null,
            cae: typeof data?.cae === "string" ? data.cae : null,
            issuedAt: typeof data?.issuedAt === "string" ? data.issuedAt : null,
            createdAt: null,
          },
          warnings
        );
        setInvoiceIssueDateOverride(null);
        setSaleToInvoice(null);
        return;
      }

      if (typeof data?.jobId === "string") {
        const completed = await waitForQueuedInvoice(data.jobId, saleToInvoice);
        if (completed) {
          setInvoiceIssueDateOverride(null);
          setSaleToInvoice(null);
        }
        return;
      }

      setInvoiceStatus("No se pudo emitir factura");
      setInvoiceResolution(null);
    } catch {
      setInvoiceStatus("No se pudo emitir factura");
      setInvoiceResolution(null);
    } finally {
      setIsIssuing(false);
    }
  };

  const applyInvoiceResolution = async () => {
    if (!invoiceResolution) {
      return;
    }
    if (invoiceResolution.type === "RECALCULATE_FISCAL_TOTALS") {
      await submitInvoice();
      return;
    }
    setInvoiceIssueDateOverride(invoiceResolution.issueDate);
    await submitInvoice({ issueDateOverride: invoiceResolution.issueDate });
  };

  const submitCreditNote = async () => {
    if (!invoiceToCancel) return;
    if (creditNoteByInvoiceId.has(invoiceToCancel.id)) {
      setCreditPreviewStatus("La factura ya tiene una nota de credito emitida.");
      return;
    }
    if (creditNoteStep !== "CONFIRM") {
      setCreditPreviewStatus("Revisa la anulacion y confirma en el paso final.");
      return;
    }

    setIsIssuingCreditNote(true);
    setCreditPreviewStatus(null);
    setInvoiceStatus(null);
    try {
      const res = await fetch("/api/credit-notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fiscalInvoiceId: invoiceToCancel.id }),
      });
      const data = await res.json();
      if (!res.ok) {
        setCreditPreviewStatus(data?.error ?? "No se pudo emitir nota de credito");
        return;
      }

      if (typeof data?.id !== "string") {
        setCreditPreviewStatus("No se pudo emitir nota de credito");
        return;
      }

      const noteEntry: IssuedCreditNoteRow = {
        id: data.id,
        fiscalInvoiceId:
          typeof data?.fiscalInvoiceId === "string"
            ? data.fiscalInvoiceId
            : null,
        saleId:
          typeof data?.saleId === "string"
            ? data.saleId
            : invoiceToCancel.saleId,
        number: typeof data?.number === "string" ? data.number : null,
        pointOfSale:
          typeof data?.pointOfSale === "string" ? data.pointOfSale : null,
        type: typeof data?.type === "string" ? data.type : null,
        cae: typeof data?.cae === "string" ? data.cae : null,
        issuedAt: typeof data?.issuedAt === "string" ? data.issuedAt : null,
        createdAt:
          typeof data?.createdAt === "string" ? data.createdAt : new Date().toISOString(),
      };
      setIssuedCreditNotes((prev) => [
        noteEntry,
        ...prev.filter((item) => item.id !== noteEntry.id),
      ]);
      setSales((prev) =>
        prev.map((sale) =>
          sale.id === invoiceToCancel.saleId
            ? { ...sale, billingStatus: "TO_BILL" }
            : sale
        )
      );
      setInvoiceStatus(
        `Factura ${formatVoucherLabel(invoiceToCancel.pointOfSale, invoiceToCancel.number)} anulada con nota de credito.`
      );
      setInvoiceWarnings([]);
      openPdfInNewTab(`/api/credit-notes/${noteEntry.id}/pdf`);
      setCreditNoteStep("FORM");
      setInvoiceToCancel(null);
      setCreditPreview(null);
      setCreditPreviewStatus(null);
    } catch {
      setCreditPreviewStatus("No se pudo emitir nota de credito");
    } finally {
      setIsIssuingCreditNote(false);
    }
  };

  const submitDebitNote = async () => {
    if (!creditNoteToRevert) return;
    if (debitNoteByCreditNoteId.has(creditNoteToRevert.creditNote.id)) {
      setDebitPreviewStatus("La nota de credito ya tiene una nota de debito emitida.");
      return;
    }
    if (debitNoteStep !== "CONFIRM") {
      setDebitPreviewStatus("Revisa la reversion y confirma en el paso final.");
      return;
    }

    setIsIssuingDebitNote(true);
    setDebitPreviewStatus(null);
    setInvoiceStatus(null);
    try {
      const res = await fetch("/api/debit-notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fiscalCreditNoteId: creditNoteToRevert.creditNote.id }),
      });
      const data = await res.json();
      if (!res.ok) {
        setDebitPreviewStatus(data?.error ?? "No se pudo emitir nota de debito");
        return;
      }

      if (typeof data?.id !== "string") {
        setDebitPreviewStatus("No se pudo emitir nota de debito");
        return;
      }

      const noteEntry: IssuedDebitNoteRow = {
        id: data.id,
        fiscalCreditNoteId:
          typeof data?.fiscalCreditNoteId === "string"
            ? data.fiscalCreditNoteId
            : creditNoteToRevert.creditNote.id,
        fiscalInvoiceId:
          typeof data?.fiscalInvoiceId === "string" ? data.fiscalInvoiceId : null,
        number: typeof data?.number === "string" ? data.number : null,
        pointOfSale:
          typeof data?.pointOfSale === "string" ? data.pointOfSale : null,
        type: typeof data?.type === "string" ? data.type : null,
        cae: typeof data?.cae === "string" ? data.cae : null,
        issuedAt: typeof data?.issuedAt === "string" ? data.issuedAt : null,
        createdAt:
          typeof data?.createdAt === "string" ? data.createdAt : new Date().toISOString(),
      };
      setIssuedDebitNotes((prev) => [
        noteEntry,
        ...prev.filter((item) => item.id !== noteEntry.id),
      ]);
      setSales((prev) =>
        prev.map((sale) =>
          sale.id === creditNoteToRevert.invoice.saleId
            ? { ...sale, billingStatus: "BILLED" }
            : sale
        )
      );
      setInvoiceStatus(
        `NC ${formatVoucherLabel(
          creditNoteToRevert.creditNote.pointOfSale,
          creditNoteToRevert.creditNote.number,
        )} revertida con nota de debito.`,
      );
      setInvoiceWarnings([]);
      openPdfInNewTab(`/api/debit-notes/${noteEntry.id}/pdf`);
      setCreditNoteToRevert(null);
      setDebitNoteStep("FORM");
      setDebitPreviewStatus(null);
    } catch {
      setDebitPreviewStatus("No se pudo emitir nota de debito");
    } finally {
      setIsIssuingDebitNote(false);
    }
  };

  const handleDownloadBillingReport = (format: "csv" | "pdf") => {
    const params = new URLSearchParams();
    params.set("format", format);
    if (reportFrom) params.set("from", reportFrom);
    if (reportTo) params.set("to", reportTo);
    window.location.href = `/api/billing/report?${params.toString()}`;
  };

  const markSaleAsInternal = async (sale: SaleRow) => {
    if (
      !window.confirm(
        "Marcar esta venta como registro interno? Dejaria de figurar como pendiente de facturacion.",
      )
    ) {
      return;
    }

    setMarkingInternalSaleId(sale.id);
    setInvoiceStatus(null);
    try {
      const res = await fetch("/api/sales", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: sale.id,
          billingStatus: "NOT_BILLED",
          note: "Marcada como registro interno desde Facturacion",
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setInvoiceStatus(
          typeof data?.error === "string"
            ? data.error
            : "No se pudo marcar como registro interno",
        );
        return;
      }

      const updatedSale = data as SaleRow;
      setSales((prev) =>
        prev.map((item) => (item.id === updatedSale.id ? updatedSale : item)),
      );
      setInvoiceStatus("Venta marcada como registro interno.");
      setInvoiceWarnings([]);
    } catch {
      setInvoiceStatus("No se pudo marcar como registro interno");
    } finally {
      setMarkingInternalSaleId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900">
          Facturacion
        </h1>
        <p className="mt-2 text-sm text-zinc-600">
          Cola de ventas por facturar y documentos asociados.
        </p>
      </div>

      <div className="table-scroll pb-1">
        <div className="grid min-w-[760px] grid-cols-3 gap-2">
          <div className="card border !border-amber-200 p-3 !bg-white">
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2 text-xs font-medium text-amber-700">
                <DocumentTextIcon className="size-3.5" />
                Por facturar
              </span>
              <p className="text-base font-semibold text-zinc-900">
                {toBillSales.length}
              </p>
            </div>
          </div>
          <div className="card border !border-dashed !border-emerald-200 p-3 !bg-white">
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2 text-xs font-medium text-emerald-700">
                <CurrencyDollarIcon className="size-3.5" />
                Facturadas
              </span>
              <p className="text-base font-semibold text-zinc-900">
                {billed.length}
              </p>
            </div>
          </div>
          <div className="card border !border-dashed !border-indigo-200 p-3 !bg-white">
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2 text-xs font-medium text-indigo-700">
                <CurrencyDollarIcon className="size-3.5" />
                Total pendiente
              </span>
              <p className="text-base font-semibold text-zinc-900">
                {formatCurrencyARS(totalToBill)}
              </p>
            </div>
          </div>
        </div>
      </div>

      {afipMissingItems.length ||
      afipOptionalItems.length ||
      afipStatus.helpLinks?.length ? (
        <div className="card p-0 border-dashed border-sky-200">
          <button
            type="button"
            className="flex w-full cursor-pointer items-center justify-between gap-3 px-4 py-3 text-left [&::-webkit-details-marker]:hidden"
            onClick={() => setIsAfipHelpOpen((prev) => !prev)}
            aria-expanded={isAfipHelpOpen}
          >
            <div className="flex items-center gap-2">
              <DocumentTextIcon className="size-4 text-zinc-400" />
              <div>
                <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
                  Estado ARCA y ayuda
                </h3>
                <p className="text-xs text-zinc-500">{afipHint}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span
                className={`pill text-[9px] px-1.5 py-0.5 font-semibold ${afipStatusClass}`}
              >
                {afipReady ? "Listo" : "Pendiente"}
              </span>
              <span className="text-[10px] text-zinc-500">
                {isAfipHelpOpen ? "Ocultar" : "Mostrar"}
              </span>
              <ChevronDownIcon
                className={`size-4 text-zinc-500 transition-transform ${
                  isAfipHelpOpen ? "rotate-180" : ""
                }`}
              />
            </div>
          </button>
          <AnimatePresence initial={false}>
            {isAfipHelpOpen ? (
              <motion.div
                key="billing-afip-help"
                initial={{ height: 0, opacity: 0, y: -8 }}
                animate={{ height: "auto", opacity: 1, y: 0 }}
                exit={{ height: 0, opacity: 0, y: -8 }}
                transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
                className="reveal-motion"
              >
                <div className="border-t border-zinc-200/70 px-4 pb-5 pt-4">
                  <div className="space-y-4">
                    {afipMissingItems.length ? (
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                            Pendientes
                          </p>
                          <span className="pill text-[9px] px-1.5 py-0.5 font-semibold bg-white text-rose-800 border border-rose-200">
                            {afipMissingItems.length}
                          </span>
                        </div>
                        <ul className="mt-2 space-y-1 text-xs text-zinc-600">
                          {afipMissingItems.map((item) => (
                            <li key={item.key}>
                              <span className="font-medium text-zinc-900">
                                {item.title}
                              </span>
                              {item.description ? (
                                <span className="text-zinc-500">
                                  {" "}
                                  · {item.description}
                                </span>
                              ) : null}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                    {afipOptionalItems.length ? (
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                            Opcional
                          </p>
                          <span className="pill text-[9px] px-1.5 py-0.5 font-semibold bg-white text-amber-800 border border-amber-200">
                            {afipOptionalItems.length}
                          </span>
                        </div>
                        <ul className="mt-2 space-y-1 text-xs text-zinc-600">
                          {afipOptionalItems.map((item) => (
                            <li key={item.key}>
                              <span className="font-medium text-zinc-900">
                                {item.title}
                              </span>
                              {item.description ? (
                                <span className="text-zinc-500">
                                  {" "}
                                  · {item.description}
                                </span>
                              ) : null}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                    {afipStatus.helpLinks?.length ? (
                      <div className="flex flex-wrap gap-3">
                        {afipStatus.helpLinks.map((link) => (
                          <a
                            key={link.url}
                            className={`btn text-xs ${helpLinkClass(link.label)}`}
                            href={link.url}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {link.label}
                          </a>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      ) : null}

      {!saleToInvoice && (invoiceStatus || invoiceWarnings.length) ? (
        <div className="card space-y-2 p-4">
          {invoiceStatus ? (
            <p className="text-sm font-medium text-zinc-800">{invoiceStatus}</p>
          ) : null}
          {invoiceWarnings.length ? (
            <ul className="space-y-1 text-xs text-amber-700">
              {invoiceWarnings.map((warning) => (
                <li key={warning}>• {warning}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

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
                onClick={() => handleDownloadBillingReport("csv")}
              >
                Descargar CSV
              </button>
              <button
                type="button"
                className="btn btn-sky w-full text-xs sm:w-auto"
                onClick={() => handleDownloadBillingReport("pdf")}
              >
                Descargar PDF
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="card p-0 border-dashed border-sky-200">
        <button
          type="button"
          className="flex w-full cursor-pointer items-center justify-between gap-3 px-4 py-3 text-left"
          onClick={() => setIsToBillOpen((prev) => !prev)}
          aria-expanded={isToBillOpen}
        >
          <div className="flex items-center gap-2">
            <CurrencyDollarIcon className="size-4 text-zinc-400" />
            <div>
              <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
                Ventas pendientes de facturar
              </h3>
              <p className="text-xs text-zinc-500">
                {filteredToBill.length} de {toBillSales.length} resultados
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-zinc-500">
              {isToBillOpen ? "Ocultar" : "Mostrar"}
            </span>
            <ChevronDownIcon
              className={`size-4 text-zinc-500 transition-transform ${
                isToBillOpen ? "rotate-180" : ""
              }`}
            />
          </div>
        </button>
        <AnimatePresence initial={false}>
          {isToBillOpen ? (
            <motion.div
              key="billing-to-bill-panel"
              initial={{ height: 0, opacity: 0, y: -8 }}
              animate={{ height: "auto", opacity: 1, y: 0 }}
              exit={{ height: 0, opacity: 0, y: -8 }}
              transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
              className="reveal-motion"
            >
              <div className="border-t border-zinc-200/70 px-4 pb-4 pt-3">
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="pill border border-zinc-200/70 bg-zinc-100/50 px-2.5 py-1 text-[11px] font-semibold text-zinc-600">
                      {activeFilterCount} activos
                    </span>
                    <button
                      type="button"
                      className={`toggle-pill ${
                        onlyCurrentMonth ? "toggle-pill-active" : ""
                      }`}
                      onClick={() => setOnlyCurrentMonth((prev) => !prev)}
                      aria-pressed={onlyCurrentMonth}
                    >
                      Solo mes actual
                    </button>
                    <button
                      type="button"
                      className="btn btn-sky text-xs"
                      onClick={() => {
                        setBillingQuery("");
                        setOnlyCurrentMonth(false);
                        setSortOrder("newest");
                      }}
                    >
                      Limpiar
                    </button>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
                    <label className="field-stack">
                      <span className="input-label">Buscar</span>
                      <input
                        className="input w-full"
                        value={billingQuery}
                        onChange={(event) => setBillingQuery(event.target.value)}
                        placeholder="Cliente o numero de venta"
                      />
                    </label>
                    <label className="field-stack">
                      <span className="input-label">Orden</span>
                      <select
                        className="input cursor-pointer text-xs"
                        value={sortOrder}
                        onChange={(event) => setSortOrder(event.target.value)}
                        aria-label="Ordenar ventas por facturar"
                      >
                        <option value="newest">Mas recientes</option>
                        <option value="oldest">Mas antiguas</option>
                      </select>
                    </label>
                  </div>
                </div>
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="text-[11px] uppercase tracking-wide text-zinc-500">
                      <tr>
                        <th className="py-2 pr-4">Venta</th>
                        <th className="py-2 pr-4">Cliente</th>
                        <th className="py-2 pr-4">Fecha</th>
                        <th className="py-2 pr-4 text-right">Precio</th>
                        <th className="py-2 pr-4 text-right">IVA</th>
                        <th className="py-2 pr-4 text-right">Ajuste</th>
                        <th className="py-2 pr-4 text-right">Total</th>
                        <th className="py-2 pr-4 text-right">Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredToBill.length ? (
                        filteredToBill.map((sale) => {
                          const adjustmentAmount = round2(
                            Number(sale.total ?? 0) -
                              Number(sale.subtotal ?? 0) -
                              Number(sale.taxes ?? 0),
                          );
                          const adjustmentLabel = getAdjustmentLabel(
                            sale.extraType,
                            adjustmentAmount,
                          );
                          return (
                            <tr
                              key={sale.id}
                              className="border-t border-zinc-200/60 transition-colors hover:bg-white/60"
                            >
                            <td className="py-2 pr-4 text-zinc-600">
                              {sale.saleNumber ?? "-"}
                            </td>
                            <td className="py-2 pr-4 text-zinc-900">
                              {sale.customerName}
                            </td>
                            <td className="py-2 pr-4 text-zinc-600">
                              {sale.saleDate
                                ? new Date(sale.saleDate).toLocaleDateString(
                                    "es-AR",
                                  )
                                : new Date(sale.createdAt).toLocaleDateString(
                                    "es-AR",
                                  )}
                            </td>
                            <td className="py-2 pr-4 text-right text-zinc-700">
                              {sale.subtotal ? formatCurrencyARS(sale.subtotal.toString()) : "-"}
                            </td>
                            <td className="py-2 pr-4 text-right text-zinc-700">
                              {sale.taxes ? formatCurrencyARS(sale.taxes.toString()) : "-"}
                            </td>
                            <td className="py-2 pr-4 text-right text-zinc-700">
                              {Math.abs(adjustmentAmount) > 0.005 ? (
                                <span title={adjustmentLabel}>
                                  {formatCurrencyARS(adjustmentAmount.toFixed(2))}
                                </span>
                              ) : (
                                "-"
                              )}
                            </td>
                            <td className="py-2 pr-4 text-right text-zinc-900">
                              {sale.total ? formatCurrencyARS(sale.total.toString()) : "-"}
                            </td>
                            <td className="py-2 pr-4 text-right">
                              <div className="flex flex-wrap items-center justify-end gap-2">
                                <WhatsappPdfButton
                                  documentType="sale"
                                  documentId={sale.id}
                                  documentLabel={
                                    sale.saleNumber
                                      ? `Venta ${sale.saleNumber}`
                                      : "Venta"
                                  }
                                  customerName={sale.customerName}
                                  customerPhone={sale.customerPhone}
                                  className="btn btn-emerald text-xs"
                                />
                                <button
                                  type="button"
                                  className="btn btn-rose text-xs"
                                  onClick={() => void markSaleAsInternal(sale)}
                                  disabled={markingInternalSaleId === sale.id}
                                >
                                  {markingInternalSaleId === sale.id
                                    ? "Guardando..."
                                    : "No facturar"}
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-emerald text-xs"
                                  onClick={() => openInvoiceModal(sale)}
                                  disabled={!afipReady}
                                >
                                  Facturar
                                </button>
                              </div>
                            </td>
                            </tr>
                          );
                        })
                      ) : (
                        <tr>
                          <td className="py-3 text-sm text-zinc-500" colSpan={8}>
                            {toBillSales.length
                              ? "No hay resultados para los filtros aplicados."
                              : "Sin ventas pendientes."}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>

      <div className="card p-0 border-dashed border-emerald-200">
        <button
          type="button"
          className="flex w-full cursor-pointer items-center justify-between gap-3 px-4 py-3 text-left"
          onClick={() => setIsIssuedOpen((prev) => !prev)}
          aria-expanded={isIssuedOpen}
        >
          <div className="flex items-center gap-2">
            <DocumentTextIcon className="size-4 text-zinc-400" />
            <div>
              <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
                Facturas emitidas
              </h3>
              <p className="text-xs text-zinc-500">
                {filteredIssuedInvoices.length} de {issuedInvoices.length} resultados
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-zinc-500">
              {isIssuedOpen ? "Ocultar" : "Mostrar"}
            </span>
            <ChevronDownIcon
              className={`size-4 text-zinc-500 transition-transform ${
                isIssuedOpen ? "rotate-180" : ""
              }`}
            />
          </div>
        </button>
        <AnimatePresence initial={false}>
          {isIssuedOpen ? (
            <motion.div
              key="billing-issued-panel"
              initial={{ height: 0, opacity: 0, y: -8 }}
              animate={{ height: "auto", opacity: 1, y: 0 }}
              exit={{ height: 0, opacity: 0, y: -8 }}
              transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
              className="reveal-motion"
            >
              <div className="border-t border-zinc-200/70 px-4 pb-4 pt-3">
                <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
                  <label className="field-stack">
                    <span className="input-label">Buscar facturas</span>
                    <input
                      className="input w-full"
                      value={issuedQuery}
                      onChange={(event) => setIssuedQuery(event.target.value)}
                      placeholder="Cliente, numero de factura, CAE o venta"
                    />
                  </label>
                  <div className="flex items-end">
                    <button
                      type="button"
                      className="btn btn-sky text-xs"
                      onClick={() => setIssuedQuery("")}
                    >
                      Limpiar
                    </button>
                  </div>
                </div>
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="text-[11px] uppercase tracking-wide text-zinc-500">
                      <tr>
                        <th className="py-2 pr-3">Fecha</th>
                        <th className="py-2 pr-3">Factura</th>
                        <th className="py-2 pr-3">Venta</th>
                        <th className="py-2 pr-3">Cliente</th>
                        <th className="py-2 pr-3 text-right">Neto</th>
                        <th className="py-2 pr-3 text-right">IVA</th>
                        <th className="py-2 pr-3 text-right">Total</th>
                        <th className="py-2 pr-3 text-right">Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredIssuedInvoices.length ? (
                        filteredIssuedInvoices.map((invoice) => {
                          const invoiceFiscalTaxProfile = normalizeCustomerFiscalTaxProfile(
                            invoice.customerFiscalTaxProfile ?? null
                          );
                          const isConsumerFinalInvoice =
                            invoiceFiscalTaxProfile === "CONSUMIDOR_FINAL" ||
                            (!invoiceFiscalTaxProfile &&
                              (invoice.customerType ?? "CONSUMER_FINAL") === "CONSUMER_FINAL");
                          const linkedCreditNote =
                            creditNoteByInvoiceId.get(invoice.id) ??
                            creditNoteBySaleId.get(invoice.saleId) ??
                            null;
                          const creditNoteLabel = linkedCreditNote
                            ? formatVoucherLabel(
                                linkedCreditNote.pointOfSale,
                                linkedCreditNote.number
                              )
                            : null;
                          const linkedDebitNote = linkedCreditNote
                            ? debitNoteByCreditNoteId.get(linkedCreditNote.id) ?? null
                            : null;
                          const debitNoteLabel = linkedDebitNote
                            ? formatVoucherLabel(
                                linkedDebitNote.pointOfSale,
                                linkedDebitNote.number
                              )
                            : null;

                          return (
                            <tr
                              key={invoice.id}
                              className="border-t border-zinc-200/60 transition-colors hover:bg-white/60"
                            >
                              <td className="py-2 pr-3 text-zinc-600">
                                {invoice.issuedAt
                                  ? new Date(invoice.issuedAt).toLocaleDateString("es-AR")
                                  : new Date(invoice.createdAt).toLocaleDateString("es-AR")}
                              </td>
                              <td className="py-2 pr-3 text-zinc-900">
                                {formatVoucherLabel(invoice.pointOfSale, invoice.number)}
                                {invoice.type ? ` · ${invoice.type}` : ""}
                              </td>
                              <td className="py-2 pr-3 text-zinc-600">
                                {invoice.saleNumber ?? "-"}
                              </td>
                              <td className="py-2 pr-3 text-zinc-900">
                                {invoice.customerName}
                              </td>
                              <td className="py-2 pr-3 text-right text-zinc-700">
                                {invoice.subtotal ? formatCurrencyARS(invoice.subtotal) : "-"}
                              </td>
                              <td className="py-2 pr-3 text-right text-zinc-700">
                                {isConsumerFinalInvoice
                                  ? "-"
                                  : invoice.iva
                                    ? formatCurrencyARS(invoice.iva)
                                    : "-"}
                              </td>
                              <td className="py-2 pr-3 text-right text-zinc-900">
                                {invoice.total ? formatCurrencyARS(invoice.total) : "-"}
                              </td>
                              <td className="py-2 pr-3 text-right">
                                <div className="flex flex-wrap items-center justify-end gap-2">
                                  <button
                                    type="button"
                                    className="btn text-xs"
                                    onClick={() =>
                                      openPdfInNewTab(
                                        buildFiscalInvoicePdfHref(invoice.id, "factura"),
                                      )
                                    }
                                  >
                                    <DocumentTextIcon className="size-4" />
                                    Factura
                                  </button>
                                  <button
                                    type="button"
                                    className="btn text-xs"
                                    onClick={() =>
                                      openPdfInNewTab(
                                        buildFiscalInvoicePdfHref(
                                          invoice.id,
                                          "comprobante",
                                        ),
                                      )
                                    }
                                  >
                                    <ArrowDownTrayIcon className="size-4" />
                                    Comprobante
                                  </button>
                                  <WhatsappPdfButton
                                    documentType="fiscalInvoice"
                                    documentId={invoice.id}
                                    documentLabel={`Comprobante ${formatVoucherLabel(
                                      invoice.pointOfSale,
                                      invoice.number,
                                    )}`}
                                    customerName={invoice.customerName}
                                    customerPhone={invoice.customerPhone}
                                    className="btn btn-emerald text-xs"
                                    pdfVariant="comprobante"
                                  />
                                  {linkedCreditNote ? (
                                    <>
                                      <button
                                        type="button"
                                        className="btn btn-sky text-xs"
                                        onClick={() =>
                                          openPdfInNewTab(
                                            `/api/credit-notes/${linkedCreditNote.id}/pdf`,
                                          )
                                        }
                                      >
                                        <ArrowDownTrayIcon className="size-4" />
                                        PDF NC
                                      </button>
                                      <button
                                        type="button"
                                        className="btn text-xs"
                                        onClick={() =>
                                          openPdfInNewTab(
                                            `/api/credit-notes/${linkedCreditNote.id}/source-invoice-pdf`,
                                          )
                                        }
                                      >
                                        <ArrowDownTrayIcon className="size-4" />
                                        PDF factura origen
                                      </button>
                                      <WhatsappPdfButton
                                        documentType="creditNote"
                                        documentId={linkedCreditNote.id}
                                        documentLabel={`Nota de credito ${
                                          creditNoteLabel ?? ""
                                        }`.trim()}
                                        customerName={invoice.customerName}
                                        customerPhone={invoice.customerPhone}
                                        className="btn btn-emerald text-xs"
                                      />
                                      {linkedDebitNote ? (
                                        <>
                                          <span className="rounded-full border border-rose-200 bg-white px-2 py-1 text-[11px] font-medium text-rose-800">
                                            Anulada {creditNoteLabel ? `· NC ${creditNoteLabel}` : ""}
                                          </span>
                                          <button
                                            type="button"
                                            className="btn btn-amber text-xs"
                                            onClick={() =>
                                              openPdfInNewTab(
                                                `/api/debit-notes/${linkedDebitNote.id}/pdf`,
                                              )
                                            }
                                          >
                                            <ArrowDownTrayIcon className="size-4" />
                                            PDF ND
                                          </button>
                                          <WhatsappPdfButton
                                            documentType="debitNote"
                                            documentId={linkedDebitNote.id}
                                            documentLabel={`Nota de debito ${
                                              debitNoteLabel ?? ""
                                            }`.trim()}
                                            customerName={invoice.customerName}
                                            customerPhone={invoice.customerPhone}
                                            className="btn btn-emerald text-xs"
                                          />
                                          <span className="rounded-full border border-emerald-200 bg-white px-2 py-1 text-[11px] font-medium text-emerald-800">
                                            Revertida {debitNoteLabel ? `· ND ${debitNoteLabel}` : ""}
                                          </span>
                                        </>
                                      ) : (
                                        <button
                                          type="button"
                                          className="btn btn-amber text-xs"
                                          onClick={() =>
                                            openDebitNoteModal(invoice, linkedCreditNote)
                                          }
                                        >
                                          <ArrowPathIcon className="size-4" />
                                          Anulada {creditNoteLabel ? `· NC ${creditNoteLabel}` : ""} · Revertir NC
                                        </button>
                                      )}
                                    </>
                                  ) : (
                                    <button
                                      type="button"
                                      className="btn btn-rose text-xs"
                                      onClick={() => openCreditNoteModal(invoice)}
                                    >
                                      <TrashIcon className="size-4" />
                                      Anular
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })
                      ) : (
                        <tr>
                          <td className="py-3 text-sm text-zinc-500" colSpan={8}>
                            {issuedInvoices.length
                              ? "No hay resultados para el filtro."
                              : "Todavia no hay facturas emitidas."}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>

      {invoiceToCancel ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto bg-black/35 p-3 sm:items-center sm:p-4">
          <div className="card max-h-[calc(100dvh-1.5rem)] w-full max-w-xl space-y-4 overflow-y-auto p-5 sm:max-h-[calc(100dvh-2rem)]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-zinc-900">
                  Anular factura con nota de credito
                </h3>
                <p className="text-xs text-zinc-500">
                  Factura {formatVoucherLabel(invoiceToCancel.pointOfSale, invoiceToCancel.number)}
                  {invoiceToCancel.type ? ` · ${invoiceToCancel.type}` : ""}
                </p>
              </div>
              <button
                type="button"
                className="btn text-xs"
                onClick={closeCreditNoteModal}
                disabled={isIssuingCreditNote}
              >
                Cerrar
              </button>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
                {creditNoteStep === "FORM"
                  ? "Paso 1 de 2 · Revisar anulacion"
                  : "Paso 2 de 2 · Confirmar nota de credito"}
              </span>
              {creditNoteStep === "CONFIRM" ? (
                <button
                  type="button"
                  className="btn text-xs"
                  onClick={() => setCreditNoteStep("FORM")}
                  disabled={isIssuingCreditNote}
                >
                  Volver
                </button>
              ) : null}
            </div>

            {linkedCreditNoteForSelectedInvoice ? (
              <div className="rounded-xl border border-amber-200 bg-white px-3 py-2 text-xs text-amber-800">
                Esta factura ya fue anulada con la NC{" "}
                {formatVoucherLabel(
                  linkedCreditNoteForSelectedInvoice.pointOfSale,
                  linkedCreditNoteForSelectedInvoice.number
                )}
                .
              </div>
            ) : null}

            {creditPreview ? (
              <div className="rounded-xl border border-zinc-200/70 bg-white p-3">
                <p className="mt-1 text-xs text-zinc-600">
                  Se emitira una nota de credito{" "}
                  {creditPreview.invoiceType ? `tipo ${creditPreview.invoiceType}` : ""}
                  {" "}asociada a la factura original, reutilizando sus datos fiscales.
                </p>
                <div className="mt-3 grid gap-2 text-xs text-zinc-600 sm:grid-cols-2">
                  <p>
                    <span className="font-medium text-zinc-900">Factura origen:</span>{" "}
                    {formatVoucherLabel(creditPreview.pointOfSale, creditPreview.number)}
                  </p>
                  <p>
                    <span className="font-medium text-zinc-900">Fecha factura:</span>{" "}
                    {creditPreview.issuedAt
                      ? new Date(creditPreview.issuedAt).toLocaleDateString("es-AR")
                      : "-"}
                  </p>
                  <p>
                    <span className="font-medium text-zinc-900">Cliente:</span>{" "}
                    {creditPreview.customerName}
                  </p>
                  <p>
                    <span className="font-medium text-zinc-900">CUIT/DOC:</span>{" "}
                    {creditPreview.customerTaxId ??
                      (creditPreview.docNumber !== null
                        ? `${creditPreview.docType ? `${DOC_TYPE_LABELS[creditPreview.docType] ?? `Tipo ${creditPreview.docType}`}: ` : ""}${creditPreview.docNumber.toLocaleString("es-AR")}`
                        : "-")}
                  </p>
                </div>
                <div className="mt-3 grid gap-1 rounded-lg border border-zinc-200/70 bg-zinc-50 p-2 text-xs text-zinc-700 sm:grid-cols-4">
                  <p>
                    Neto:{" "}
                    <span className="font-semibold text-zinc-900">
                      {formatCurrencyARS(creditPreview.net.toFixed(2))}
                    </span>
                  </p>
                  <p>
                    IVA:{" "}
                    <span className="font-semibold text-zinc-900">
                      {formatCurrencyARS(creditPreview.iva.toFixed(2))}
                    </span>
                  </p>
                  <p>
                    Exento:{" "}
                    <span className="font-semibold text-zinc-900">
                      {formatCurrencyARS(creditPreview.exempt.toFixed(2))}
                    </span>
                  </p>
                  <p>
                    Total:{" "}
                    <span className="font-semibold text-zinc-900">
                      {formatCurrencyARS(creditPreview.total.toFixed(2))}
                    </span>
                  </p>
                </div>
              </div>
            ) : null}

            {creditPreviewStatus ? (
              <p className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-700">
                {creditPreviewStatus}
              </p>
            ) : null}
            {creditNoteStep === "CONFIRM" ? (
              <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
                Esta accion emitira la nota de credito y dejara la factura anulada.
              </p>
            ) : null}

            <div className="flex items-center justify-between gap-2">
              <p className="text-sm text-zinc-600">
                Total a anular:{" "}
                <span className="font-semibold text-zinc-900">
                  {creditPreview
                    ? formatCurrencyARS(creditPreview.total.toFixed(2))
                    : invoiceToCancel.total
                      ? formatCurrencyARS(invoiceToCancel.total)
                      : "-"}
                </span>
              </p>
              {creditNoteStep === "FORM" ? (
                <button
                  type="button"
                  className="btn btn-sky text-xs"
                  onClick={goToCreditNoteConfirmStep}
                  disabled={
                    isIssuingCreditNote ||
                    !creditPreview ||
                    Boolean(linkedCreditNoteForSelectedInvoice)
                  }
                >
                  Revisar anulacion
                </button>
              ) : (
                <button
                  type="button"
                  className="btn btn-rose text-xs"
                  onClick={submitCreditNote}
                  disabled={
                    isIssuingCreditNote ||
                    !creditPreview ||
                    Boolean(linkedCreditNoteForSelectedInvoice)
                  }
                >
                  {isIssuingCreditNote
                    ? "Confirmando..."
                    : "Confirmar nota de credito"}
                </button>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {creditNoteToRevert ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto bg-black/35 p-3 sm:items-center sm:p-4">
          <div className="card max-h-[calc(100dvh-1.5rem)] w-full max-w-xl space-y-4 overflow-y-auto p-5 sm:max-h-[calc(100dvh-2rem)]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-zinc-900">
                  Revertir nota de credito con nota de debito
                </h3>
                <p className="text-xs text-zinc-500">
                  NC{" "}
                  {formatVoucherLabel(
                    creditNoteToRevert.creditNote.pointOfSale,
                    creditNoteToRevert.creditNote.number,
                  )}
                  {creditNoteToRevert.creditNote.type
                    ? ` · ${creditNoteToRevert.creditNote.type}`
                    : ""}
                </p>
              </div>
              <button
                type="button"
                className="btn text-xs"
                onClick={closeDebitNoteModal}
                disabled={isIssuingDebitNote}
              >
                Cerrar
              </button>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
                {debitNoteStep === "FORM"
                  ? "Paso 1 de 2 · Revisar reversion"
                  : "Paso 2 de 2 · Confirmar nota de debito"}
              </span>
              {debitNoteStep === "CONFIRM" ? (
                <button
                  type="button"
                  className="btn text-xs"
                  onClick={() => setDebitNoteStep("FORM")}
                  disabled={isIssuingDebitNote}
                >
                  Volver
                </button>
              ) : null}
            </div>

            {linkedDebitNoteForSelectedCreditNote ? (
              <div className="rounded-xl border border-amber-200 bg-white px-3 py-2 text-xs text-amber-800">
                Esta nota de credito ya fue revertida con la ND{" "}
                {formatVoucherLabel(
                  linkedDebitNoteForSelectedCreditNote.pointOfSale,
                  linkedDebitNoteForSelectedCreditNote.number,
                )}
                .
              </div>
            ) : null}

            <div className="rounded-xl border border-zinc-200/70 bg-white p-3">
              <p className="mt-1 text-xs text-zinc-600">
                Se emitira una nota de debito asociada a la nota de credito para
                revertir la anulacion de la factura original.
              </p>
              <div className="mt-3 grid gap-2 text-xs text-zinc-600 sm:grid-cols-2">
                <p>
                  <span className="font-medium text-zinc-900">Factura origen:</span>{" "}
                  {formatVoucherLabel(
                    creditNoteToRevert.invoice.pointOfSale,
                    creditNoteToRevert.invoice.number,
                  )}
                </p>
                <p>
                  <span className="font-medium text-zinc-900">NC a revertir:</span>{" "}
                  {formatVoucherLabel(
                    creditNoteToRevert.creditNote.pointOfSale,
                    creditNoteToRevert.creditNote.number,
                  )}
                </p>
                <p>
                  <span className="font-medium text-zinc-900">Cliente:</span>{" "}
                  {creditNoteToRevert.invoice.customerName}
                </p>
                <p>
                  <span className="font-medium text-zinc-900">Fecha NC:</span>{" "}
                  {creditNoteToRevert.creditNote.issuedAt
                    ? new Date(creditNoteToRevert.creditNote.issuedAt).toLocaleDateString("es-AR")
                    : "-"}
                </p>
              </div>
            </div>

            {debitPreviewStatus ? (
              <p className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-700">
                {debitPreviewStatus}
              </p>
            ) : null}
            {debitNoteStep === "CONFIRM" ? (
              <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                Esta accion emitira la nota de debito y revertira el efecto de la nota de credito.
              </p>
            ) : null}

            <div className="flex items-center justify-between gap-2">
              <p className="text-sm text-zinc-600">
                Total a revertir:{" "}
                <span className="font-semibold text-zinc-900">
                  {creditNoteToRevert.invoice.total
                    ? formatCurrencyARS(creditNoteToRevert.invoice.total)
                    : "-"}
                </span>
              </p>
              {debitNoteStep === "FORM" ? (
                <button
                  type="button"
                  className="btn btn-sky text-xs"
                  onClick={goToDebitNoteConfirmStep}
                  disabled={
                    isIssuingDebitNote ||
                    Boolean(linkedDebitNoteForSelectedCreditNote)
                  }
                >
                  Revisar reversion
                </button>
              ) : (
                <button
                  type="button"
                  className="btn btn-amber text-xs"
                  onClick={submitDebitNote}
                  disabled={
                    isIssuingDebitNote ||
                    Boolean(linkedDebitNoteForSelectedCreditNote)
                  }
                >
                  {isIssuingDebitNote
                    ? "Confirmando..."
                    : "Confirmar nota de debito"}
                </button>
              )}
            </div>
          </div>
        </div>
      ) : null}

      <ToastContainer position="bottom-right" theme="light" />

      {saleToInvoice ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto bg-zinc-950/35 p-3 backdrop-blur-sm sm:items-center sm:p-6">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="invoice-modal-title"
            className="flex max-h-[calc(100dvh-1.5rem)] w-full max-w-[54rem] flex-col overflow-hidden rounded-[26px] border border-zinc-200 bg-white shadow-[0_24px_80px_-40px_rgba(24,24,27,0.45)] sm:max-h-[calc(100dvh-3rem)]"
          >
            <div className="border-b border-zinc-200/70 px-5 py-4 sm:px-6 sm:py-5">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <span className="inline-flex rounded-full border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
                    {invoiceStepLabel}
                  </span>
                  <h3
                    id="invoice-modal-title"
                    className="mt-2.5 text-lg font-semibold tracking-[-0.02em] text-zinc-950 sm:text-[1.35rem]"
                  >
                    {invoiceStepHeading}
                  </h3>
                  <p className="mt-1 truncate text-xs text-zinc-500 sm:text-sm">
                    {invoiceStepSubtitle}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {invoiceStep === "CONFIRM" ? (
                    <button
                      type="button"
                      className="btn h-9 px-3.5 text-sm"
                      onClick={() => setInvoiceStep("FORM")}
                      disabled={isIssuing || isSavingInvoiceSale}
                    >
                      Volver
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="btn h-9 px-3.5 text-sm"
                    onClick={closeInvoiceModal}
                    disabled={isIssuing || isSavingInvoiceSale}
                  >
                    Cerrar
                  </button>
                </div>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6 sm:py-5">
              <div className="space-y-5">
                {invoiceStatus || invoiceWarnings.length ? (
                  <div className="space-y-2">
                    {invoiceStatus ? (
                      <p
                        className={cn(
                          "text-sm font-medium",
                          invoiceStatus === "Factura emitida correctamente."
                            ? "text-emerald-700"
                            : "text-zinc-800"
                        )}
                      >
                        {invoiceStatus}
                      </p>
                    ) : null}
                    {invoiceWarnings.length ? (
                      <ul className="mt-2 space-y-1 text-xs text-amber-700">
                        {invoiceWarnings.map((warning) => (
                          <li key={warning}>• {warning}</li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                ) : null}

                {invoiceResolution ? (
                  <div className="space-y-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-700">
                      Solucion sugerida
                    </p>
                    <p className="mt-1.5 text-sm font-semibold text-zinc-900 sm:text-base">
                      {invoiceResolution.title}
                    </p>
                    <p className="mt-2 max-w-3xl text-xs leading-5 text-zinc-600 sm:text-sm">
                      {invoiceResolution.description}
                    </p>
                    <div className="mt-4 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        className="btn btn-emerald h-9 px-3.5 text-sm"
                        onClick={() => {
                          void applyInvoiceResolution();
                        }}
                        disabled={isIssuing}
                      >
                        {isIssuing
                          ? "Emitiendo..."
                          : invoiceResolution.primaryActionLabel}
                      </button>
                      <button
                        type="button"
                        className="btn h-9 px-3.5 text-sm"
                        onClick={() => {
                          setInvoiceResolution(null);
                          setInvoiceStatus(null);
                          setInvoiceStep("FORM");
                        }}
                        disabled={isIssuing}
                      >
                        Revisar factura
                      </button>
                    </div>
                  </div>
                ) : null}

                {invoiceStep === "FORM" ? (
                  <>
                    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
                      <section>
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="section-title">Comprobante</p>
                            <p className="mt-1.5 text-sm font-semibold text-zinc-900">
                              Tipo de factura
                            </p>
                          </div>
                          {resolvedInvoiceType !== recommendedInvoiceType ? (
                            <span className="rounded-full border border-amber-200 bg-white px-3 py-1 text-[11px] font-medium text-amber-800">
                              Sugerida: Factura {recommendedInvoiceType}
                            </span>
                          ) : null}
                        </div>
                        <div className="mt-3 inline-flex rounded-2xl border border-zinc-200 bg-white p-1 shadow-[0_2px_12px_-10px_rgba(24,24,27,0.22)]">
                          {(["A", "B"] as const).map((invoiceType) => (
                            <button
                              key={invoiceType}
                              type="button"
                              className={cn(
                                "min-w-[112px] rounded-[14px] px-3.5 py-1.5 text-sm font-semibold transition",
                                resolvedInvoiceType === invoiceType
                                  ? "bg-zinc-900 text-white shadow-sm"
                                  : "text-zinc-600 hover:bg-zinc-50"
                              )}
                              onClick={() => setSelectedInvoiceType(invoiceType)}
                              disabled={isIssuing || isSavingInvoiceSale}
                            >
                              Factura {invoiceType}
                            </button>
                          ))}
                        </div>
                      </section>

                      <section className="self-start">
                        <p className="section-title">Condicion fiscal</p>
                        <p className="mt-2.5 text-base font-semibold text-zinc-900">
                          {customerFiscalTaxProfileLabel}
                        </p>
                        {shouldShowArcaCondition ? (
                          <p className="mt-1 text-xs text-zinc-500 sm:text-sm">
                            ARCA informa: {arcaValidation.arcaTaxStatus}
                          </p>
                        ) : null}
                      </section>
                    </div>

                    <section className="space-y-4">
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div className="min-w-0">
                          <p className="section-title">Receptor</p>
                          <p className="mt-1.5 text-base font-semibold text-zinc-950">
                            {recipientDocumentLabel}
                          </p>
                          {invoiceRecipientCheckedLabel ? (
                            <p className="mt-1 text-xs text-zinc-500">
                              {invoiceRecipientCheckedLabel}
                            </p>
                          ) : null}
                        </div>
                        {hasRecipientDoc ? (
                          <button
                            type="button"
                            className="btn h-9 px-3.5 text-sm"
                            onClick={() => {
                              void refreshArcaValidation();
                            }}
                            disabled={
                              arcaValidation.status === "loading" || isSavingInvoiceSale
                            }
                          >
                            {arcaValidation.status === "loading"
                              ? "Validando..."
                              : "Revalidar en ARCA"}
                          </button>
                        ) : null}
                      </div>

                      {invoiceRecipientMessageNormalized ? (
                        <p
                          className={cn(
                            "text-sm leading-5",
                            invoiceRecipientMessageClass
                          )}
                        >
                          {invoiceRecipientMessageNormalized}
                        </p>
                      ) : null}

                      {shouldShowDeductionToggle ? (
                        <label className="flex items-start gap-3 border-t border-zinc-200/70 pt-4 text-sm text-zinc-600">
                          <input
                            type="checkbox"
                            className="mt-0.5 h-4 w-4 rounded border-zinc-300 accent-zinc-900"
                            checked={invoiceForm.requiresIncomeTaxDeduction}
                            onChange={(event) =>
                              setInvoiceForm((prev) => ({
                                ...prev,
                                requiresIncomeTaxDeduction: event.target.checked,
                              }))
                            }
                            disabled={isSavingInvoiceSale}
                          />
                          <span>El receptor solicita deduccion en Ganancias</span>
                        </label>
                      ) : null}
                    </section>

                    {hasRegularSurchargeAdjustment ? (
                      <section>
                        <p className="section-title text-amber-700">
                          Revisar recargo e IVA
                        </p>
                        <p className="mt-2 text-xs leading-5 text-zinc-700 sm:text-sm">
                          Esta venta tiene un recargo de{" "}
                          <span className="font-semibold text-zinc-900">
                            {formatCurrencyARS(fiscalAdjustmentTotal.toFixed(2))}
                          </span>
                          . Para emitir, se integra al neto y al IVA fiscal para que
                          la alicuota cierre contra la base imponible. Si en realidad
                          era interes de tarjeta, conviene corregir el tipo de ajuste
                          de la venta antes de emitir.
                        </p>
                      </section>
                    ) : null}

                    {previewItems.length ? (
                      <section>
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="section-title">Importes</p>
                            <p className="mt-1.5 text-sm font-semibold text-zinc-900 sm:text-base">
                              Revisar antes de emitir
                            </p>
                          </div>
                          <span
                            className={cn(
                              "rounded-full px-3 py-1 text-[11px] font-medium",
                              hasEditableInvoiceChanges
                                ? "border border-amber-200 bg-amber-50 text-amber-800"
                                : "border border-emerald-200 bg-emerald-50 text-emerald-800"
                            )}
                          >
                            {hasEditableInvoiceChanges
                              ? "Cambios pendientes"
                              : "Sin cambios"}
                          </span>
                        </div>

                        <div className="mt-4 space-y-3.5">
                          {editableInvoiceItems.map((item, index) => {
                            const previewItem = previewItems[index] ?? {
                              lineTotal: 0,
                            };
                            return (
                              <div
                                key={item.id}
                                className="grid gap-3.5 rounded-[20px] border border-zinc-200/80 bg-zinc-50/60 p-3.5 xl:grid-cols-[minmax(0,1.8fr)_112px_176px_160px] xl:items-end"
                              >
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-semibold text-zinc-900">
                                    {item.productName}
                                  </p>
                                  <p className="mt-1 text-xs text-zinc-500">
                                    IVA{" "}
                                    {Number(item.taxRate).toLocaleString("es-AR")}%
                                  </p>
                                </div>
                                <div>
                                  <p className="input-label">Cantidad</p>
                                  <div className="rounded-2xl border border-zinc-200 bg-white px-3.5 py-2.5 text-sm text-zinc-600">
                                    {Number(item.qty).toLocaleString("es-AR")}
                                  </div>
                                </div>
                                <label className="field-stack">
                                  <span className="input-label">Precio unitario</span>
                                  <MoneyInput
                                    className="input w-full"
                                    value={item.unitPrice}
                                    onValueChange={(value) =>
                                      setEditableInvoiceItems((prev) =>
                                        prev.map((candidate) =>
                                          candidate.id === item.id
                                            ? {
                                                ...candidate,
                                                unitPrice: value || "0",
                                              }
                                            : candidate
                                        )
                                      )
                                    }
                                    disabled={isIssuing || isSavingInvoiceSale}
                                    placeholder="0,00"
                                  />
                                </label>
                                <div>
                                  <p className="input-label">Total</p>
                                  <div className="rounded-2xl border border-zinc-200 bg-white px-3.5 py-2.5 text-sm font-semibold text-zinc-900 sm:text-base">
                                    {formatCurrencyARS(previewItem.lineTotal.toFixed(2))}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>

                      </section>
                    ) : null}

                    {fiscalPreview ? (
                      <section className="rounded-[22px] border border-zinc-200/80 bg-zinc-50/50 p-4">
                        <p className="section-title">Resumen fiscal</p>
                        <div className="mt-3.5 grid gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
                          <FiscalAmountItem label="Neto" value={fiscalPreview.net} />
                          <FiscalAmountItem label="IVA" value={fiscalPreview.iva} />
                          <FiscalAmountItem
                            label={fiscalAdjustmentLabel}
                            value={fiscalAdjustmentTotal}
                          />
                          <FiscalAmountItem label="Total" value={fiscalPreview.total} />
                        </div>
                      </section>
                    ) : null}
                  </>
                ) : (
                  <section>
                    <div className="grid gap-3.5 sm:grid-cols-2">
                      <div>
                        <p className="section-title">Fecha</p>
                        <p className="mt-1.5 text-sm font-semibold text-zinc-900">
                          {invoiceIssueDateLabel}
                        </p>
                      </div>
                      <div>
                        <p className="section-title">Comprobante</p>
                        <p className="mt-1.5 text-sm font-semibold text-zinc-900">
                          Factura {resolvedInvoiceType}
                        </p>
                      </div>
                    </div>

                    {previewItems.length ? (
                      <div className="mt-5 table-scroll">
                        <table className="w-full min-w-[680px] text-left text-xs sm:text-sm">
                          <thead className="text-[11px] uppercase tracking-[0.16em] text-zinc-500">
                            <tr>
                              <th className="pb-2.5 pr-4">Producto</th>
                              <th className="pb-2.5 pr-4 text-right">Cant.</th>
                              <th className="pb-2.5 pr-4 text-right">Unitario</th>
                              <th className="pb-2.5 pr-4 text-right">IVA</th>
                              <th className="pb-2.5 text-right">Total</th>
                            </tr>
                          </thead>
                          <tbody>
                            {previewItems.map((item) => (
                              <tr
                                key={item.id}
                                className="border-t border-zinc-200/70 align-top"
                              >
                                <td className="py-2.5 pr-4 text-zinc-700">
                                  {item.productName}
                                </td>
                                <td className="py-2.5 pr-4 text-right text-zinc-600">
                                  {item.qty.toLocaleString("es-AR")}
                                </td>
                                <td className="py-2.5 pr-4 text-right text-zinc-600">
                                  {formatCurrencyARS(item.unitPrice.toFixed(2))}
                                </td>
                                <td className="py-2.5 pr-4 text-right text-zinc-600">
                                  {formatCurrencyARS(item.iva.toFixed(2))}
                                </td>
                                <td className="py-2.5 text-right font-medium text-zinc-900">
                                  {formatCurrencyARS(item.lineTotal.toFixed(2))}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : null}

                    <div className="mt-5 grid gap-3.5 rounded-[20px] border border-zinc-200/80 bg-zinc-50/50 p-3.5 sm:grid-cols-2 xl:grid-cols-4">
                      <FiscalAmountItem
                        label="Neto"
                        value={fiscalPreview?.net ?? previewSubtotal}
                      />
                      <FiscalAmountItem
                        label="IVA"
                        value={fiscalPreview?.iva ?? previewIva}
                      />
                      <FiscalAmountItem
                        label={fiscalAdjustmentLabel}
                        value={fiscalAdjustmentTotal}
                      />
                      <FiscalAmountItem
                        label="Total"
                        value={fiscalPreview?.total ?? previewTotal}
                      />
                    </div>
                  </section>
                )}
              </div>
            </div>

            <div className="border-t border-zinc-200/70 bg-white px-5 py-4 sm:px-6">
              <div
                className={cn(
                  "flex flex-col gap-4 sm:flex-row sm:items-center",
                  showInvoiceFooterNote ? "sm:justify-between" : "sm:justify-end"
                )}
              >
                {showInvoiceFooterNote ? (
                  <div className="min-w-0">
                    <p className="mt-1 text-xs text-amber-700">
                      Se guardaran los cambios antes de pasar al paso final.
                    </p>
                  </div>
                ) : null}
                <button
                  type="button"
                  className="btn btn-emerald h-10 min-w-[200px] px-4 text-sm"
                  onClick={() => {
                    if (invoiceStep === "FORM") {
                      void goToConfirmStep();
                      return;
                    }
                    void submitInvoice();
                  }}
                  disabled={isIssuing || isSavingInvoiceSale}
                >
                  {invoicePrimaryActionLabel}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
