"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowDownTrayIcon,
  CurrencyDollarIcon,
  ChevronDownIcon,
  DocumentTextIcon,
} from "@/components/icons";
import { getAfipMissingItems, summarizeAfipMissing } from "@/lib/afip/messages";
import { formatCurrencyARS } from "@/lib/format";
import type { SaleRow } from "../sales/types";
import {
  CUSTOMER_FISCAL_TAX_PROFILE_LABELS,
  inferFiscalTaxProfileFromArcaTaxStatus,
  normalizeCustomerFiscalTaxProfile,
  resolveInvoiceTypeFromFiscalTaxProfile,
  type CustomerFiscalTaxProfile,
} from "@/lib/customers/fiscal-profile";
import {
  buildAdjustedTotalsFromRates,
  buildTotalsFromRates,
} from "@/lib/afip/totals";
import { getAdjustmentLabel } from "@/lib/sale-adjustments";

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
  fiscalInvoiceId: string;
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

export default function BillingClient({
  initialSales,
  initialIssuedInvoices,
  initialCreditNotes,
  afipStatus,
}: BillingClientProps) {
  const [sales, setSales] = useState<SaleRow[]>(initialSales);
  const [issuedInvoices, setIssuedInvoices] =
    useState<IssuedInvoiceRow[]>(initialIssuedInvoices);
  const [issuedCreditNotes, setIssuedCreditNotes] =
    useState<IssuedCreditNoteRow[]>(initialCreditNotes);
  const [sortOrder, setSortOrder] = useState("newest");
  const [billingQuery, setBillingQuery] = useState("");
  const [issuedQuery, setIssuedQuery] = useState("");
  const [onlyCurrentMonth, setOnlyCurrentMonth] = useState(false);
  const [isAfipHelpOpen, setIsAfipHelpOpen] = useState(false);
  const [isToBillOpen, setIsToBillOpen] = useState(true);
  const [isIssuedOpen, setIsIssuedOpen] = useState(false);
  const [saleToInvoice, setSaleToInvoice] = useState<SaleRow | null>(null);
  const [invoiceStep, setInvoiceStep] = useState<"FORM" | "CONFIRM">("FORM");
  const [isIssuing, setIsIssuing] = useState(false);
  const [invoiceStatus, setInvoiceStatus] = useState<string | null>(null);
  const [invoiceWarnings, setInvoiceWarnings] = useState<string[]>([]);
  const [invoiceForm, setInvoiceForm] = useState({
    requiresIncomeTaxDeduction: false,
  });
  const [invoiceToCancel, setInvoiceToCancel] = useState<IssuedInvoiceRow | null>(null);
  const [creditPreview, setCreditPreview] = useState<CreditNotePreview | null>(null);
  const [creditPreviewStatus, setCreditPreviewStatus] = useState<string | null>(null);
  const [isIssuingCreditNote, setIsIssuingCreditNote] = useState(false);
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
    setSaleToInvoice(sale);
    setInvoiceStep("FORM");
    setInvoiceWarnings([]);
    setInvoiceStatus(null);
    setInvoiceForm({
      requiresIncomeTaxDeduction: false,
    });
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
    if (isIssuing) return;
    setInvoiceStep("FORM");
    setSaleToInvoice(null);
  };

  const openCreditNoteModal = (invoice: IssuedInvoiceRow) => {
    setInvoiceToCancel(invoice);
    setCreditPreview(null);
    setCreditPreviewStatus("Cargando datos de la factura...");
    setInvoiceStatus(null);
  };

  const closeCreditNoteModal = () => {
    if (isIssuingCreditNote) return;
    setInvoiceToCancel(null);
    setCreditPreview(null);
    setCreditPreviewStatus(null);
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

  const invoiceTotal = Number(saleToInvoice?.total ?? 0);
  const customerFiscalTaxProfile = normalizeCustomerFiscalTaxProfile(
    saleToInvoice?.customerFiscalTaxProfile ?? null
  );
  const resolvedInvoiceType = resolveInvoiceTypeFromFiscalTaxProfile(
    customerFiscalTaxProfile
  );
  const isConsumerFinal =
    customerFiscalTaxProfile === "CONSUMIDOR_FINAL" ||
    (!customerFiscalTaxProfile &&
      (saleToInvoice?.customerType ?? "CONSUMER_FINAL") === "CONSUMER_FINAL");
  const requiresIdentification =
    isConsumerFinal &&
    (invoiceTotal >= CONSUMER_FINAL_THRESHOLD ||
      invoiceForm.requiresIncomeTaxDeduction);
  const hasRecipientDoc = normalizeTaxId(saleToInvoice?.customerTaxId).length === 11;
  const customerFiscalTaxProfileLabel = customerFiscalTaxProfile
    ? CUSTOMER_FISCAL_TAX_PROFILE_LABELS[customerFiscalTaxProfile]
    : "Sin definir";
  const shouldShowDeductionToggle = !(isConsumerFinal && !hasRecipientDoc);
  const previewItems = (saleToInvoice?.items ?? []).map((item) => {
    const qty = Number(item.qty ?? 0);
    const unitPrice = Number(item.unitPrice ?? 0);
    const base = Number(item.total ?? qty * unitPrice);
    const taxRate = Number(item.taxRate ?? 0);
    const iva = round2(base * (taxRate / 100));
    const lineTotal = round2(base + iva);
    return {
      id: item.id ?? `${item.productName}-${item.qty}-${item.unitPrice}`,
      productName: item.productName,
      qty,
      unitPrice,
      taxRate,
      base,
      iva,
      lineTotal,
    };
  });
  const previewSubtotal = round2(Number(saleToInvoice?.subtotal ?? 0));
  const previewIva = round2(Number(saleToInvoice?.taxes ?? 0));
  const previewTotal = round2(Number(saleToInvoice?.total ?? previewSubtotal + previewIva));
  const linkedCreditNoteForSelectedInvoice = invoiceToCancel
    ? creditNoteByInvoiceId.get(invoiceToCancel.id) ?? null
    : null;

  const buildInvoiceDraft = (): InvoiceDraftResult => {
    if (!saleToInvoice) {
      return { ok: false, error: "No hay venta seleccionada para facturar." };
    }
    const total = Number(saleToInvoice.total ?? 0);
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
    if (requiresIdentification && !hasRecipientDoc) {
      return {
        ok: false,
        error:
          "Por monto o deduccion corresponde identificar al receptor. Carga CUIT del cliente para facturar.",
      };
    }

    let hasInvalidTaxRate = false;
    const fiscalEntries: Array<{ base: number; rate: number }> = [];
    const itemsTaxRates = (saleToInvoice.items ?? [])
      .map((item) => {
        if (!item.id) return null;
        const rate = Number(item.taxRate ?? 0);
        if (!Number.isFinite(rate) || !ALLOWED_IVA_RATES.has(rate)) {
          hasInvalidTaxRate = true;
          return null;
        }
        const base = Number(item.total ?? 0);
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

  const goToConfirmStep = () => {
    const draft = buildInvoiceDraft();
    if (!draft.ok) {
      setInvoiceStatus(draft.error);
      return;
    }
    setInvoiceStatus(null);
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
    window.open(
      `/api/fiscal-invoices/${invoice.id}/pdf`,
      "_blank",
      "noopener,noreferrer"
    );
  };

  const waitForQueuedInvoice = async (jobId: string, saleSnapshot: SaleRow) => {
    for (let attempt = 0; attempt < QUEUE_POLL_ATTEMPTS; attempt += 1) {
      const pollResponse = await fetch(`/api/fiscal-invoices/jobs/${jobId}`, {
        cache: "no-store",
      });
      const pollData = await pollResponse.json();
      if (!pollResponse.ok) {
        setInvoiceStatus(pollData?.error ?? "No se pudo consultar la cola de facturacion");
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
        setInvoiceStatus(pollData?.error ?? "No se pudo emitir factura");
        return false;
      }

      setInvoiceStatus(
        pollData?.status === "RUNNING"
          ? "Factura en procesamiento..."
          : "Factura en cola, esperando turno..."
      );
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
      setArcaValidation({
        status: "warning",
        message:
          "El cliente no tiene CUIT cargado. No se puede validar contra ARCA.",
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
            status: "warning",
            message:
              "ARCA no devolvio condicion fiscal clara. Revisa el perfil fiscal del cliente.",
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
            message: `ARCA sugiere ${CUSTOMER_FISCAL_TAX_PROFILE_LABELS[suggestedFiscalTaxProfile]} y el cliente esta guardado como ${CUSTOMER_FISCAL_TAX_PROFILE_LABELS[currentProfile]}.`,
            source,
            checkedAt,
            suggestedFiscalTaxProfile,
            arcaTaxStatus,
          });
          return;
        }

        setArcaValidation({
          status: "ok",
          message: "CUIT validado con ARCA.",
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
  }, [saleToInvoice]);

  const refreshArcaValidation = async () => {
    if (!saleToInvoice) return;
    const customerTaxId = normalizeTaxId(saleToInvoice.customerTaxId);
    if (!customerTaxId) {
      setArcaValidation({
        status: "warning",
        message:
          "El cliente no tiene CUIT cargado. No se puede revalidar en ARCA.",
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
      const suggestedFiscalTaxProfile =
        inferFiscalTaxProfileFromArcaTaxStatus(arcaTaxStatus);
      const currentProfile = normalizeCustomerFiscalTaxProfile(
        saleToInvoice.customerFiscalTaxProfile ?? null
      );
      const checkedAt = typeof data?.checkedAt === "string" ? data.checkedAt : null;
      const source = typeof data?.source === "string" ? data.source : null;

      if (!suggestedFiscalTaxProfile) {
        setArcaValidation({
          status: "warning",
          message:
            "ARCA no devolvio condicion fiscal clara. Revisa el perfil fiscal del cliente.",
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
          message: `ARCA sugiere ${CUSTOMER_FISCAL_TAX_PROFILE_LABELS[suggestedFiscalTaxProfile]} y el cliente esta guardado como ${CUSTOMER_FISCAL_TAX_PROFILE_LABELS[currentProfile]}.`,
          source,
          checkedAt,
          suggestedFiscalTaxProfile,
          arcaTaxStatus,
        });
        return;
      }

      setArcaValidation({
        status: "ok",
        message: "CUIT validado con ARCA.",
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

  const submitInvoice = async () => {
    if (!saleToInvoice) return;
    setInvoiceStatus(null);
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

      const res = await fetch("/api/fiscal-invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setInvoiceStatus(data?.error ?? "No se pudo emitir factura");
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
        setSaleToInvoice(null);
        return;
      }

      if (typeof data?.jobId === "string") {
        const completed = await waitForQueuedInvoice(data.jobId, saleToInvoice);
        if (completed) {
          setSaleToInvoice(null);
        }
        return;
      }

      setInvoiceStatus("No se pudo emitir factura");
    } catch {
      setInvoiceStatus("No se pudo emitir factura");
    } finally {
      setIsIssuing(false);
    }
  };

  const submitCreditNote = async () => {
    if (!invoiceToCancel) return;
    if (creditNoteByInvoiceId.has(invoiceToCancel.id)) {
      setCreditPreviewStatus("La factura ya tiene una nota de credito emitida.");
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
            : invoiceToCancel.id,
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
      setInvoiceStatus(
        `Factura ${formatVoucherLabel(invoiceToCancel.pointOfSale, invoiceToCancel.number)} anulada con nota de credito.`
      );
      setInvoiceWarnings([]);
      window.open(
        `/api/credit-notes/${noteEntry.id}/pdf`,
        "_blank",
        "noopener,noreferrer"
      );
      setInvoiceToCancel(null);
      setCreditPreview(null);
      setCreditPreviewStatus(null);
    } catch {
      setCreditPreviewStatus("No se pudo emitir nota de credito");
    } finally {
      setIsIssuingCreditNote(false);
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

      {invoiceStatus || invoiceWarnings.length ? (
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
                                <a
                                  className="btn text-xs"
                                  href={`/api/pdf/sale?id=${sale.id}`}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  <ArrowDownTrayIcon className="size-4" />
                                  PDF venta
                                </a>
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
                          const linkedCreditNote = creditNoteByInvoiceId.get(invoice.id);
                          const creditNoteLabel = linkedCreditNote
                            ? formatVoucherLabel(
                                linkedCreditNote.pointOfSale,
                                linkedCreditNote.number
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
                                {invoice.iva ? formatCurrencyARS(invoice.iva) : "-"}
                              </td>
                              <td className="py-2 pr-3 text-right text-zinc-900">
                                {invoice.total ? formatCurrencyARS(invoice.total) : "-"}
                              </td>
                              <td className="py-2 pr-3 text-right">
                                <div className="flex flex-wrap items-center justify-end gap-2">
                                  <a
                                    className="btn text-xs"
                                    href={`/api/fiscal-invoices/${invoice.id}/pdf`}
                                    target="_blank"
                                    rel="noreferrer"
                                  >
                                    <ArrowDownTrayIcon className="size-4" />
                                    PDF factura
                                  </a>
                                  {linkedCreditNote ? (
                                    <>
                                      <a
                                        className="btn btn-sky text-xs"
                                        href={`/api/credit-notes/${linkedCreditNote.id}/pdf`}
                                        target="_blank"
                                        rel="noreferrer"
                                      >
                                        <ArrowDownTrayIcon className="size-4" />
                                        PDF NC
                                      </a>
                                      <span className="rounded-full border border-rose-200 bg-white px-2 py-1 text-[11px] font-medium text-rose-800">
                                        Anulada {creditNoteLabel ? `· NC ${creditNoteLabel}` : ""}
                                      </span>
                                    </>
                                  ) : (
                                    <button
                                      type="button"
                                      className="btn btn-rose text-xs"
                                      onClick={() => openCreditNoteModal(invoice)}
                                    >
                                      Anular factura
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
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/35 p-4 sm:items-center">
          <div className="card w-full max-w-xl space-y-4 p-5">
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
            </div>
          </div>
        </div>
      ) : null}

      {saleToInvoice ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/35 p-4 sm:items-center">
          <div className="card w-full max-w-xl space-y-4 p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-zinc-900">
                  Emitir factura
                </h3>
                <p className="text-xs text-zinc-500">
                  Venta {saleToInvoice.saleNumber ?? saleToInvoice.id} ·{" "}
                  {saleToInvoice.customerName}
                </p>
              </div>
              <button
                type="button"
                className="btn text-xs"
                onClick={closeInvoiceModal}
                disabled={isIssuing}
              >
                Cerrar
              </button>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
                {invoiceStep === "FORM" ? "Paso 1 de 2 · Emitir factura" : "Paso 2 de 2 · Confirmar factura"}
              </span>
              {invoiceStep === "CONFIRM" ? (
                <button
                  type="button"
                  className="btn text-xs"
                  onClick={() => setInvoiceStep("FORM")}
                  disabled={isIssuing}
                >
                  Volver
                </button>
              ) : null}
            </div>

            {invoiceStep === "FORM" ? (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border border-zinc-200/70 bg-white px-3 py-2 text-xs text-zinc-600">
                    <span className="font-medium text-zinc-900">Tipo de factura:</span>{" "}
                    Factura {resolvedInvoiceType}
                  </div>
                  <div className="rounded-xl border border-zinc-200/70 bg-white px-3 py-2 text-xs text-zinc-600">
                    <span className="font-medium text-zinc-900">Condicion fiscal:</span>{" "}
                    {customerFiscalTaxProfileLabel}
                  </div>
                  <div className="rounded-xl border border-zinc-200/70 bg-white px-3 py-2 text-xs text-zinc-600 sm:col-span-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p>
                          <span className="font-medium text-zinc-900">CUIT cliente:</span>{" "}
                          {saleToInvoice.customerTaxId ? saleToInvoice.customerTaxId : "Sin CUIT"}
                        </p>
                        {arcaValidation.checkedAt ? (
                          <p className="text-[11px] text-zinc-500">
                            Verificado:{" "}
                            {new Date(arcaValidation.checkedAt).toLocaleString("es-AR")}
                            {arcaValidation.source ? ` (${arcaValidation.source})` : ""}
                          </p>
                        ) : null}
                      </div>
                      {hasRecipientDoc ? (
                        <button
                          type="button"
                          className="btn text-xs"
                          onClick={() => {
                            void refreshArcaValidation();
                          }}
                          disabled={arcaValidation.status === "loading"}
                        >
                          {arcaValidation.status === "loading"
                            ? "Validando..."
                            : "Revalidar en ARCA"}
                        </button>
                      ) : null}
                    </div>
                    {arcaValidation.message ? (
                      <p
                        className={`mt-2 text-xs ${
                          arcaValidation.status === "ok"
                            ? "text-emerald-700"
                            : arcaValidation.status === "warning"
                              ? "text-amber-700"
                              : arcaValidation.status === "error"
                                ? "text-rose-700"
                                : "text-zinc-600"
                        }`}
                      >
                        {arcaValidation.message}
                      </p>
                    ) : null}
                    {arcaValidation.arcaTaxStatus ? (
                      <p className="mt-1 text-[11px] text-zinc-500">
                        Condicion ARCA: {arcaValidation.arcaTaxStatus}
                      </p>
                    ) : null}
                  </div>
                </div>
                {shouldShowDeductionToggle ? (
                  <label className="flex items-center gap-2 text-xs text-zinc-600">
                    <input
                      type="checkbox"
                      checked={invoiceForm.requiresIncomeTaxDeduction}
                      onChange={(event) =>
                        setInvoiceForm((prev) => ({
                          ...prev,
                          requiresIncomeTaxDeduction: event.target.checked,
                        }))
                      }
                    />
                    El receptor solicita deduccion en Ganancias
                  </label>
                ) : null}
                {requiresIdentification && !hasRecipientDoc ? (
                  <p className="rounded-xl border border-amber-200 bg-white px-3 py-2 text-xs text-amber-800">
                    Por monto o deduccion corresponde identificar al receptor.
                    Para continuar, carga CUIT valido en el cliente.
                  </p>
                ) : null}
                {resolvedInvoiceType === "A" && !hasRecipientDoc ? (
                  <p className="rounded-xl border border-amber-200 bg-white px-3 py-2 text-xs text-amber-800">
                    Factura A requiere CUIT valido del cliente.
                  </p>
                ) : null}
                {fiscalPreview ? (
                  <div className="rounded-xl border border-zinc-200/70 bg-white p-3">
                    <p className="section-title">Totales fiscales</p>
                    <div className="mt-2 grid gap-2 text-xs text-zinc-700 sm:grid-cols-4">
                      <p>
                        Neto:{" "}
                        <span className="font-semibold text-zinc-900">
                          {formatCurrencyARS(fiscalPreview.net.toFixed(2))}
                        </span>
                      </p>
                      <p>
                        IVA:{" "}
                        <span className="font-semibold text-zinc-900">
                          {formatCurrencyARS(fiscalPreview.iva.toFixed(2))}
                        </span>
                      </p>
                      <p>
                        {fiscalAdjustmentLabel}:{" "}
                        <span className="font-semibold text-zinc-900">
                          {formatCurrencyARS(fiscalAdjustmentTotal.toFixed(2))}
                        </span>
                      </p>
                      <p>
                        Total:{" "}
                        <span className="font-semibold text-zinc-900">
                          {formatCurrencyARS(fiscalPreview.total.toFixed(2))}
                        </span>
                      </p>
                    </div>
                  </div>
                ) : null}
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm text-zinc-600">
                    Total:{" "}
                    <span className="font-semibold text-zinc-900">
                      {formatCurrencyARS(saleToInvoice.total ?? "0")}
                    </span>
                  </p>
                  <button
                    type="button"
                    className="btn btn-emerald text-xs"
                    onClick={goToConfirmStep}
                    disabled={isIssuing}
                  >
                    Continuar a confirmar
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="rounded-xl border border-zinc-200/70 bg-white p-3">
                  <h4 className="text-sm font-semibold text-zinc-900">Confirmar factura</h4>
                  <div className="mt-2 grid gap-2 text-xs text-zinc-600 sm:grid-cols-2">
                    <p>
                      <span className="font-medium text-zinc-900">Cliente:</span>{" "}
                      {saleToInvoice.customerName}
                    </p>
                    <p>
                      <span className="font-medium text-zinc-900">Venta:</span>{" "}
                      {saleToInvoice.saleNumber ?? saleToInvoice.id}
                    </p>
                    <p>
                      <span className="font-medium text-zinc-900">Fecha:</span>{" "}
                      {saleToInvoice.saleDate
                        ? new Date(saleToInvoice.saleDate).toLocaleDateString("es-AR")
                        : new Date(saleToInvoice.createdAt).toLocaleDateString("es-AR")}
                    </p>
                    <p>
                      <span className="font-medium text-zinc-900">Comprobante:</span>{" "}
                      Factura {resolvedInvoiceType}
                    </p>
                  </div>
                  {previewItems.length ? (
                    <div className="mt-3 table-scroll">
                      <table className="w-full text-left text-xs">
                        <thead className="text-[11px] uppercase tracking-wide text-zinc-500">
                          <tr>
                            <th className="py-1 pr-2">Producto</th>
                            <th className="py-1 pr-2 text-right">Cant.</th>
                            <th className="py-1 pr-2 text-right">Unitario</th>
                            <th className="py-1 pr-2 text-right">IVA</th>
                            <th className="py-1 pr-0 text-right">Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {previewItems.map((item) => (
                            <tr key={item.id} className="border-t border-zinc-200/60">
                              <td className="py-1 pr-2 text-zinc-700">{item.productName}</td>
                              <td className="py-1 pr-2 text-right text-zinc-600">
                                {item.qty.toLocaleString("es-AR")}
                              </td>
                              <td className="py-1 pr-2 text-right text-zinc-600">
                                {formatCurrencyARS(item.unitPrice.toFixed(2))}
                              </td>
                              <td className="py-1 pr-2 text-right text-zinc-600">
                                {formatCurrencyARS(item.iva.toFixed(2))}
                              </td>
                              <td className="py-1 pr-0 text-right text-zinc-900">
                                {formatCurrencyARS(item.lineTotal.toFixed(2))}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : null}
                  <div className="mt-3 grid gap-1 rounded-lg border border-zinc-200/70 bg-zinc-50 p-2 text-xs text-zinc-700 sm:grid-cols-4">
                    <p>
                      Neto:{" "}
                      <span className="font-semibold text-zinc-900">
                        {formatCurrencyARS(
                          (fiscalPreview?.net ?? previewSubtotal).toFixed(2),
                        )}
                      </span>
                    </p>
                    <p>
                      IVA:{" "}
                      <span className="font-semibold text-zinc-900">
                        {formatCurrencyARS(
                          (fiscalPreview?.iva ?? previewIva).toFixed(2),
                        )}
                      </span>
                    </p>
                    <p>
                      {fiscalAdjustmentLabel}:{" "}
                      <span className="font-semibold text-zinc-900">
                        {formatCurrencyARS(fiscalAdjustmentTotal.toFixed(2))}
                      </span>
                    </p>
                    <p>
                      Total:{" "}
                      <span className="font-semibold text-zinc-900">
                        {formatCurrencyARS(
                          (fiscalPreview?.total ?? previewTotal).toFixed(2),
                        )}
                      </span>
                    </p>
                  </div>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm text-zinc-600">
                    Total:{" "}
                    <span className="font-semibold text-zinc-900">
                      {formatCurrencyARS(saleToInvoice.total ?? "0")}
                    </span>
                  </p>
                  <button
                    type="button"
                    className="btn btn-emerald text-xs"
                    onClick={submitInvoice}
                    disabled={isIssuing}
                  >
                    {isIssuing ? "Confirmando..." : "Confirmar factura"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
