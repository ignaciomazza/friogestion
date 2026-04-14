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

type InvoiceDraftResult =
  | {
      ok: false;
      error: string;
    }
  | {
      ok: true;
      itemsTaxRates: Array<{ saleItemId: string; rate: number }>;
      manualTotals: ReturnType<typeof buildManualTotals>;
    };

const CONSUMER_FINAL_THRESHOLD = 10_000_000;
const QUEUE_POLL_ATTEMPTS = 90;
const QUEUE_POLL_INTERVAL_MS = 1000;

const IVA_RATE_TO_ID: Record<number, number> = {
  27: 6,
  21: 5,
  10.5: 4,
  5: 8,
  2.5: 9,
  0: 3,
};
const ALLOWED_IVA_RATES = new Set<number>([0, 2.5, 5, 10.5, 21, 27]);

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeTaxId(value?: string | null) {
  return (value ?? "").replace(/\D/g, "");
}

function round2(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function buildManualTotals(
  sale: SaleRow,
  itemsTaxRates: Array<{ saleItemId: string; rate: number }>
) {
  const fallbackSubtotal = (sale.items ?? []).reduce((acc, item) => {
    const lineTotal = Number(item.total ?? 0);
    if (Number.isFinite(lineTotal)) return acc + lineTotal;
    const qty = Number(item.qty ?? 0);
    const unitPrice = Number(item.unitPrice ?? 0);
    if (!Number.isFinite(qty) || !Number.isFinite(unitPrice)) return acc;
    return acc + qty * unitPrice;
  }, 0);

  const subtotal = round2(Number(sale.subtotal ?? fallbackSubtotal));
  const iva = round2(Number(sale.taxes ?? 0));
  const total = round2(Number(sale.total ?? subtotal + iva));

  const rateByItemId = new Map(itemsTaxRates.map((entry) => [entry.saleItemId, entry.rate]));
  const baseByRate = new Map<number, number>();
  for (const item of sale.items ?? []) {
    if (!item.id) continue;
    const rate = rateByItemId.get(item.id);
    if (rate === undefined) continue;
    const lineBase = round2(Number(item.total ?? 0));
    if (!Number.isFinite(lineBase)) continue;
    const current = baseByRate.get(rate) ?? 0;
    baseByRate.set(rate, round2(current + lineBase));
  }

  const taxableBreakdown: Array<{ id: number; base: number; amount: number }> = [];
  let exempt = 0;
  let breakdownIva = 0;

  for (const [rate, base] of baseByRate.entries()) {
    if (round2(rate) === 0) {
      exempt = round2(exempt + base);
      continue;
    }
    const id = IVA_RATE_TO_ID[round2(rate)] ?? 3;
    const amount = round2((base * rate) / 100);
    taxableBreakdown.push({ id, base, amount });
    breakdownIva = round2(breakdownIva + amount);
  }

  const diff = round2(iva - breakdownIva);
  if (taxableBreakdown.length && Math.abs(diff) > 0) {
    const last = taxableBreakdown[taxableBreakdown.length - 1];
    last.amount = round2(last.amount + diff);
  }

  const net = round2(subtotal - exempt);
  return {
    net,
    iva,
    total,
    exempt,
    ivaBreakdown: taxableBreakdown.length ? taxableBreakdown : undefined,
  };
}

export default function BillingClient({
  initialSales,
  initialIssuedInvoices,
  afipStatus,
}: BillingClientProps) {
  const [sales, setSales] = useState<SaleRow[]>(initialSales);
  const [issuedInvoices, setIssuedInvoices] =
    useState<IssuedInvoiceRow[]>(initialIssuedInvoices);
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

  const buildInvoiceDraft = (): InvoiceDraftResult => {
    if (!saleToInvoice) {
      return { ok: false, error: "No hay venta seleccionada para facturar." };
    }
    const subtotal = Number(saleToInvoice.subtotal ?? saleToInvoice.total ?? 0);
    const iva = Number(saleToInvoice.taxes ?? 0);
    const extraAmount = Number(saleToInvoice.extraAmount ?? 0);
    const total = Number(saleToInvoice.total ?? subtotal + iva);
    if (!Number.isFinite(total) || total <= 0) {
      return { ok: false, error: "No se pudo calcular totales de la venta." };
    }
    if (Number.isFinite(extraAmount) && Math.abs(extraAmount) > 0.005) {
      return {
        ok: false,
        error:
          "La venta tiene recargos o descuentos. Ajusta los totales antes de facturar.",
      };
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
    const itemsTaxRates = (saleToInvoice.items ?? [])
      .map((item) => {
        if (!item.id) return null;
        const rate = Number(item.taxRate ?? 0);
        if (!Number.isFinite(rate) || !ALLOWED_IVA_RATES.has(rate)) {
          hasInvalidTaxRate = true;
          return null;
        }
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
    const manualTotals = buildManualTotals(saleToInvoice, itemsTaxRates);
    return { ok: true, itemsTaxRates, manualTotals };
  };

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
        manualTotals: draft.manualTotals,
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
                        <th className="py-2 pr-4 text-right">Total</th>
                        <th className="py-2 pr-4">Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredToBill.length ? (
                        filteredToBill.map((sale) => (
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
                            <td className="py-2 pr-4 text-right text-zinc-900">
                              {sale.total ? formatCurrencyARS(sale.total.toString()) : "-"}
                            </td>
                            <td className="py-2 pr-4">
                              <div className="flex flex-wrap items-center gap-2">
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
                        ))
                      ) : (
                        <tr>
                          <td className="py-3 text-sm text-zinc-500" colSpan={7}>
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
                        <th className="py-2 pr-3">Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredIssuedInvoices.length ? (
                        filteredIssuedInvoices.map((invoice) => (
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
                              {invoice.pointOfSale && invoice.number
                                ? `${invoice.pointOfSale}-${invoice.number}`
                                : invoice.number ?? "-"}
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
                            <td className="py-2 pr-3">
                              <a
                                className="btn text-xs"
                                href={`/api/fiscal-invoices/${invoice.id}/pdf`}
                                target="_blank"
                                rel="noreferrer"
                              >
                                <ArrowDownTrayIcon className="size-4" />
                                PDF
                              </a>
                            </td>
                          </tr>
                        ))
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
                  <div className="mt-3 grid gap-1 rounded-lg border border-zinc-200/70 bg-zinc-50 p-2 text-xs text-zinc-700 sm:grid-cols-3">
                    <p>
                      Neto:{" "}
                      <span className="font-semibold text-zinc-900">
                        {formatCurrencyARS(previewSubtotal.toFixed(2))}
                      </span>
                    </p>
                    <p>
                      IVA:{" "}
                      <span className="font-semibold text-zinc-900">
                        {formatCurrencyARS(previewIva.toFixed(2))}
                      </span>
                    </p>
                    <p>
                      Total:{" "}
                      <span className="font-semibold text-zinc-900">
                        {formatCurrencyARS(previewTotal.toFixed(2))}
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
