import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getAfipClient } from "@/lib/afip/client";
import { getSalesPoints } from "@/lib/afip/electronic-billing";
import { buildQrDataUrl, type QrPayload } from "@/lib/afip/qr";
import {
  buildAdjustedTotalsFromRates,
  buildTotalsFromRates,
  ensurePositiveTotals,
  toManualTotals,
  type ManualTotals,
} from "@/lib/afip/totals";
import { resolveFiscalRecipientDocument } from "@/lib/afip/consumer-final";
import {
  resolveCondicionIvaReceptor,
  resolveInvoiceTypeFromFiscalTaxProfile,
} from "@/lib/customers/fiscal-profile";
import { logServerError, logServerInfo, logServerWarn } from "@/lib/server/log";

type ServiceDates = {
  from: Date;
  to: Date;
  due?: Date | null;
};

type IssueInvoiceInput = {
  organizationId: string;
  saleId: string;
  type?: "A" | "B" | null;
  pointOfSale?: number | null;
  docType?: string | number | null;
  docNumber?: string | null;
  serviceDates?: ServiceDates | null;
  currencyCode?: string | null;
  itemsTaxRates?: Array<{ saleItemId: string; rate: number }>;
  manualTotals?: ManualTotals | null;
  issueDate?: Date | null;
  requiresIncomeTaxDeduction?: boolean | null;
};

type IssueCreditNoteInput = {
  organizationId: string;
  fiscalInvoiceId: string;
  pointOfSale?: number | null;
  issueDate?: Date | null;
  serviceDates?: ServiceDates | null;
};

type Totals = {
  net: number;
  iva: number;
  total: number;
  exempt: number;
  ivaItems: Array<{ Id: number; BaseImp: number; Importe: number }>;
};

const CURRENCY_MAP: Record<string, string> = {
  ARS: "PES",
  USD: "DOL",
};

function formatAfipDate(date: Date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return Number(local.toISOString().slice(0, 10).replace(/-/g, ""));
}

function formatLocalDateKey(date: Date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function parseAfipDateKey(value: unknown) {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (digits.length !== 8) return null;
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
}

function buildIssueDateSequenceError({
  suggestedIssueDate,
  lastVoucherDate,
  lastVoucherNumber,
}: {
  suggestedIssueDate: string;
  lastVoucherDate: string;
  lastVoucherNumber: number;
}) {
  return Object.assign(new Error("ISSUE_DATE_BEFORE_LAST_AUTHORIZED"), {
    suggestedIssueDate,
    lastVoucherDate,
    lastVoucherNumber,
  });
}

async function resolveCurrency(organizationId: string, input?: string | null) {
  if (input) return input.toUpperCase();
  const currency = await prisma.financeCurrency.findFirst({
    where: { organizationId, isDefault: true },
    select: { code: true },
  });
  return currency?.code ?? "ARS";
}

async function resolvePointOfSale(
  organizationId: string,
  afip: Awaited<ReturnType<typeof getAfipClient>>,
  explicit?: number | null
) {
  if (explicit) {
    if (!Number.isFinite(explicit) || explicit <= 0) {
      throw new Error("SALES_POINT_INVALID");
    }
    return explicit;
  }

  const [config, salesPoints] = await Promise.all([
    prisma.organizationFiscalConfig.findUnique({
      where: { organizationId },
      select: { defaultPointOfSale: true },
    }),
    getSalesPoints(organizationId),
  ]);

  if (config?.defaultPointOfSale && salesPoints.includes(config.defaultPointOfSale)) {
    return config.defaultPointOfSale;
  }

  if (salesPoints.length > 0) {
    return salesPoints[0];
  }

  throw new Error("SALES_POINT_MISSING");
}

async function resolveCurrencyQuote(
  afip: Awaited<ReturnType<typeof getAfipClient>>,
  currencyCode: string
) {
  const monId = CURRENCY_MAP[currencyCode] ?? currencyCode;
  if (monId === "PES") {
    return { monId, monCotiz: 1 };
  }
  const billing = afip.ElectronicBilling as unknown as {
    executeRequest: (
      method: string,
      params: Record<string, unknown>
    ) => Promise<Record<string, unknown>>;
  };
  const result = await billing.executeRequest("FEParamGetCotizacion", {
    MonId: monId,
  });

  const resultGet =
    typeof result.ResultGet === "object" && result.ResultGet
      ? (result.ResultGet as Record<string, unknown>)
      : null;
  const quoteValue =
    (resultGet?.MonCotiz as number | string | undefined) ??
    (result.MonCotiz as number | string | undefined);
  const quote = Number(quoteValue);
  if (!Number.isFinite(quote) || quote <= 0) {
    throw new Error("CURRENCY_QUOTE_NOT_FOUND");
  }

  return { monId, monCotiz: quote };
}

function resolveTotals(
  items: Array<{ id: string; base: number; rate: number }>,
  adjustmentTotal: number
): Totals {
  if (!items.length) throw new Error("TAX_RATES_REQUIRED");
  const totals = buildAdjustedTotalsFromRates(items, adjustmentTotal);
  ensurePositiveTotals([
    totals.net,
    totals.iva,
    totals.total,
    totals.exempt,
  ]);
  return totals;
}

function ensureNotFuture(date: Date) {
  const now = Date.now();
  if (date.getTime() > now + 5 * 60 * 1000) {
    throw new Error("ISSUE_DATE_IN_FUTURE");
  }
}

async function ensureIssueDateKeepsVoucherSequence({
  afip,
  pointOfSale,
  voucherType,
  issueDate,
}: {
  afip: Awaited<ReturnType<typeof getAfipClient>>;
  pointOfSale: number;
  voucherType: number;
  issueDate: Date;
}) {
  const billing = afip.ElectronicBilling as unknown as {
    getLastVoucher: (salesPoint: number, type: number) => Promise<unknown>;
    getVoucherInfo: (
      number: number,
      salesPoint: number,
      type: number
    ) => Promise<Record<string, unknown> | null>;
  };
  const lastVoucherNumber = Number(
    await billing.getLastVoucher(pointOfSale, voucherType)
  );
  if (!Number.isFinite(lastVoucherNumber) || lastVoucherNumber <= 0) {
    return;
  }

  const lastVoucher = await billing.getVoucherInfo(
    lastVoucherNumber,
    pointOfSale,
    voucherType
  );
  const lastVoucherDate = parseAfipDateKey(lastVoucher?.CbteFch);
  if (!lastVoucherDate) return;

  const issueDateKey = formatLocalDateKey(issueDate);
  if (issueDateKey < lastVoucherDate) {
    throw buildIssueDateSequenceError({
      suggestedIssueDate: lastVoucherDate,
      lastVoucherDate,
      lastVoucherNumber,
    });
  }
}

function round2(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function differsByMoreThanOneCent(a: number, b: number) {
  return Math.abs(round2(a) - round2(b)) > 0.01;
}

function differsByMoreThanFiveCents(a: number, b: number) {
  return Math.abs(round2(a) - round2(b)) > 0.05;
}

function buildQrPayload(data: {
  issueDate: Date;
  cuit: number;
  pointOfSale: number;
  voucherType: number;
  voucherNumber: number;
  total: number;
  monId: string;
  monCotiz: number;
  docType: number;
  docNumber: number;
  cae: string;
}): QrPayload {
  const localDate = new Date(
    data.issueDate.getTime() - data.issueDate.getTimezoneOffset() * 60000
  )
    .toISOString()
    .slice(0, 10);

  return {
    ver: 1,
    fecha: localDate,
    cuit: data.cuit,
    ptoVta: data.pointOfSale,
    tipoCmp: data.voucherType,
    nroCmp: data.voucherNumber,
    importe: data.total,
    moneda: data.monId,
    ctz: data.monCotiz,
    tipoDocRec: data.docType,
    nroDocRec: data.docNumber,
    tipoCodAut: "E",
    codAut: data.cae,
  };
}

export async function issueFiscalInvoice(input: IssueInvoiceInput) {
  logServerInfo("fiscal.issue.start", "Starting fiscal invoice issue", {
    organizationId: input.organizationId,
    saleId: input.saleId,
    requestedType: input.type ?? null,
    pointOfSale: input.pointOfSale ?? null,
    hasManualTotals: Boolean(input.manualTotals),
    hasItemRates: Boolean(input.itemsTaxRates?.length),
  });
  const sale = await prisma.sale.findFirst({
    where: { id: input.saleId, organizationId: input.organizationId },
    include: {
      customer: true,
      items: true,
      organization: true,
      saleCharges: true,
    },
  });

  if (!sale) {
    throw new Error("SALE_NOT_FOUND");
  }

  if (sale.billingStatus === "BILLED") {
    throw new Error("SALE_ALREADY_BILLED");
  }

  if (sale.status === "CANCELLED") {
    throw new Error("SALE_CANCELLED");
  }

  if (sale.status !== "CONFIRMED") {
    throw new Error("SALE_STATUS_INVALID");
  }

  if (input.serviceDates) {
    throw new Error("SERVICE_DATES_NOT_SUPPORTED");
  }

  const resolvedType = resolveInvoiceTypeFromFiscalTaxProfile(
    sale.customer.fiscalTaxProfile
  );
  if (input.type && input.type !== resolvedType) {
    logServerWarn(
      "fiscal.issue.type-overridden",
      "Requested invoice type differs from customer fiscal profile; using resolved type",
      {
        saleId: sale.id,
        requestedType: input.type,
        resolvedType,
        fiscalTaxProfile: sale.customer.fiscalTaxProfile,
      }
    );
  }

  const afip = await getAfipClient(input.organizationId);
  const voucherType = resolvedType === "A" ? 1 : 6;
  const concept = 1;
  const condicionIva = resolveCondicionIvaReceptor(
    sale.customer.fiscalTaxProfile,
    resolvedType
  );
  const issueDate = input.issueDate ?? sale.saleDate ?? new Date();
  ensureNotFuture(issueDate);
  const pointOfSale = await resolvePointOfSale(
    input.organizationId,
    afip,
    input.pointOfSale
  );
  await ensureIssueDateKeepsVoucherSequence({
    afip,
    pointOfSale,
    voucherType,
    issueDate,
  });

  const items = sale.items.map((item) => {
    const rate =
      item.taxRate === null || item.taxRate === undefined
        ? Number.NaN
        : Number(item.taxRate);
    const base = Number.isFinite(Number(item.total))
      ? Number(item.total)
      : Number(item.qty) * Number(item.unitPrice);
    return {
      id: item.id,
      base,
      rate,
    };
  });
  if (items.some((item) => !Number.isFinite(item.rate))) {
    throw new Error("TAX_RATES_REQUIRED");
  }

  const baseTotals = buildTotalsFromRates(items);
  const saleSubtotal = Number(sale.subtotal ?? baseTotals.net + baseTotals.exempt);
  const saleTaxes = Number(sale.taxes ?? baseTotals.iva);
  const saleChargesTotal = sale.saleCharges.reduce(
    (total, charge) => total + Number(charge.amount ?? 0),
    0
  );
  const fallbackSaleTotal =
    saleSubtotal + saleTaxes + Number(sale.extraAmount ?? 0) + saleChargesTotal;
  const saleTotal = Number(sale.total ?? fallbackSaleTotal);
  const adjustmentTotal = round2(saleTotal - baseTotals.total);
  const totals = resolveTotals(items, adjustmentTotal);

  const fiscalSubtotal = baseTotals.net + baseTotals.exempt;
  const subtotalMismatch = differsByMoreThanOneCent(fiscalSubtotal, saleSubtotal);
  const ivaMismatch = differsByMoreThanOneCent(baseTotals.iva, saleTaxes);
  const totalMismatch = differsByMoreThanOneCent(totals.total, saleTotal);
  if (subtotalMismatch || ivaMismatch || totalMismatch) {
    const isWithinTolerance =
      !differsByMoreThanFiveCents(fiscalSubtotal, saleSubtotal) &&
      !differsByMoreThanFiveCents(baseTotals.iva, saleTaxes) &&
      !differsByMoreThanFiveCents(totals.total, saleTotal);
    if (!isWithinTolerance) {
      logServerWarn(
        "fiscal.issue.totals-mismatch",
        "Fiscal totals mismatch exceeds tolerance",
        {
          saleId: sale.id,
          fiscalSubtotal,
          saleSubtotal,
          fiscalIva: baseTotals.iva,
          saleIva: saleTaxes,
          fiscalTotal: totals.total,
          saleTotal,
          fiscalAdjustment: adjustmentTotal,
        }
      );
      throw new Error("SALE_TOTALS_MISMATCH");
    }
    logServerWarn(
      "fiscal.issue.totals-mismatch-tolerated",
      "Fiscal totals mismatch tolerated due rounding tolerance",
      {
        saleId: sale.id,
        fiscalSubtotal,
        saleSubtotal,
        fiscalIva: baseTotals.iva,
        saleIva: saleTaxes,
        fiscalTotal: totals.total,
        saleTotal,
        fiscalAdjustment: adjustmentTotal,
      }
    );
  }

  const doc = resolveFiscalRecipientDocument({
    customerType: sale.customer.type,
    customerTaxId: sale.customer.taxId ?? null,
    explicitDocType: input.docType,
    explicitDocNumber: input.docNumber ?? null,
    totalAmount: totals.total,
    requiresIncomeTaxDeduction: input.requiresIncomeTaxDeduction ?? false,
  });
  if (doc.requireIdentification && !doc.identificationProvided) {
    throw new Error("DOC_TYPE_REQUIRED");
  }
  if (resolvedType === "A" && doc.docType !== 80) {
    throw new Error("FACTURA_A_REQUIRES_CUIT");
  }

  const currencyCode = await resolveCurrency(
    input.organizationId,
    input.currencyCode
  );
  const { monId, monCotiz } = await resolveCurrencyQuote(afip, currencyCode);

  const voucherData: Record<string, unknown> = {
    CantReg: 1,
    PtoVta: pointOfSale,
    CbteTipo: voucherType,
    Concepto: concept,
    DocTipo: doc.docType,
    DocNro: doc.docNumber,
    CondicionIVAReceptorId: condicionIva,
    CbteFch: formatAfipDate(issueDate),
    ImpTotal: totals.total,
    ImpTotConc: 0,
    ImpNeto: totals.net,
    ImpOpEx: totals.exempt,
    ImpIVA: totals.iva,
    ImpTrib: 0,
    MonId: monId,
    MonCotiz: monCotiz,
  };

  if (totals.ivaItems.length) {
    voucherData.Iva = totals.ivaItems;
  }
  let reservedInvoiceId: string | null = null;
  let voucherAuthorized = false;
  try {
    const reserved = await prisma.fiscalInvoice.create({
      data: {
        organizationId: sale.organizationId,
        saleId: sale.id,
        type: resolvedType,
        issuedAt: issueDate,
        currencyCode,
      },
      select: { id: true },
    });
    reservedInvoiceId = reserved.id;
    const reservedId = reserved.id;

    const invoice = await prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`
          SELECT 1 FROM "Organization"
          WHERE id = ${sale.organizationId}
          FOR UPDATE
        `;

        const result = await afip.ElectronicBilling.createNextVoucher(voucherData);
        const cae = result?.CAE;
        const caeDue = result?.CAEFchVto;
        const voucherNumber = Number(
          result?.voucherNumber ?? result?.voucher_number
        );

        if (!cae) {
          throw new Error("AFIP_CAE_MISSING");
        }

        if (!Number.isFinite(voucherNumber)) {
          throw new Error("AFIP_VOUCHER_NUMBER_MISSING");
        }
        voucherAuthorized = true;

        voucherData.CbteDesde = voucherNumber;
        voucherData.CbteHasta = voucherNumber;

        const qrPayload = buildQrPayload({
          issueDate,
          cuit: Number(afip.CUIT),
          pointOfSale,
          voucherType,
          voucherNumber,
          total: totals.total,
          monId,
          monCotiz,
          docType: doc.docType,
          docNumber: doc.docNumber,
          cae,
        });

        const qrBase64 = await buildQrDataUrl(qrPayload);

        const payloadAfip = {
          voucherData,
          qrBase64,
          serviceDates: null,
          manualTotals: toManualTotals(totals),
          fiscalAdjustment: adjustmentTotal,
          complianceWarnings: doc.warnings,
          requiresIncomeTaxDeduction: Boolean(input.requiresIncomeTaxDeduction),
        };

        const updated = await tx.fiscalInvoice.update({
          where: { id: reservedId },
          data: {
            type: resolvedType,
            pointOfSale: pointOfSale.toString(),
            number: voucherNumber.toString(),
            cae,
            caeDueDate: caeDue ? new Date(caeDue) : null,
            issuedAt: issueDate,
            currencyCode,
            payloadAfip: payloadAfip as Prisma.JsonObject,
          },
        });

        await tx.sale.update({
          where: { id: sale.id },
          data: { billingStatus: "BILLED" },
        });

        return updated;
      },
      { maxWait: 10_000, timeout: 120_000 }
    );

    logServerInfo("fiscal.issue.success", "Fiscal invoice issued", {
      saleId: sale.id,
      fiscalInvoiceId: invoice.id,
      type: resolvedType,
      voucherType,
      pointOfSale,
      voucherNumber: invoice.number,
      cae: invoice.cae,
      warnings: doc.warnings.length,
    });
    return { invoice, warnings: doc.warnings };
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw new Error("SALE_ALREADY_BILLED");
    }
    if (reservedInvoiceId && !voucherAuthorized) {
      await prisma.fiscalInvoice.deleteMany({
        where: {
          id: reservedInvoiceId,
          saleId: sale.id,
          cae: null,
          number: null,
        },
      });
    }
    logServerError("fiscal.issue.failed", error, {
      saleId: sale.id,
      organizationId: sale.organizationId,
      resolvedType,
      pointOfSale,
      voucherAuthorized,
      reservedInvoiceId,
    });
    throw error;
  }
}

export async function issueCreditNote(input: IssueCreditNoteInput) {
  const invoice = await prisma.fiscalInvoice.findFirst({
    where: {
      id: input.fiscalInvoiceId,
      organizationId: input.organizationId,
    },
    include: {
      sale: { include: { customer: true } },
      organization: true,
    },
  });

  if (!invoice) {
    throw new Error("FISCAL_INVOICE_NOT_FOUND");
  }

  const existingCreditNote = await prisma.fiscalCreditNote.findFirst({
    where: {
      organizationId: input.organizationId,
      fiscalInvoiceId: invoice.id,
    },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  if (existingCreditNote) {
    throw new Error("FISCAL_INVOICE_ALREADY_ANNULLED");
  }

  if (invoice.type !== "A" && invoice.type !== "B") {
    throw new Error("INVOICE_TYPE_INVALID");
  }

  const afip = await getAfipClient(input.organizationId);
  const voucherType = invoice.type === "A" ? 3 : 8;
  const pointOfSale =
    input.pointOfSale ?? (invoice.pointOfSale ? Number(invoice.pointOfSale) : null);
  if (!pointOfSale || !Number.isFinite(pointOfSale) || pointOfSale <= 0) {
    throw new Error("SALES_POINT_INVALID");
  }

  const issueDate = input.issueDate ?? new Date();
  ensureNotFuture(issueDate);

  const payload = invoice.payloadAfip as Record<string, unknown> | null;
  const voucherData =
    payload && typeof payload === "object"
      ? (payload.voucherData as Record<string, unknown> | null)
      : null;

  if (!voucherData) {
    throw new Error("INVOICE_VOUCHER_DATA_MISSING");
  }

  if (Number(voucherData.Concepto ?? 1) !== 1) {
    throw new Error("CONCEPTO_NOT_SUPPORTED");
  }

  if (input.serviceDates) {
    throw new Error("SERVICE_DATES_NOT_SUPPORTED");
  }

  const docType = Number(voucherData.DocTipo);
  const docNumber = Number(voucherData.DocNro);

  const manualTotals =
    payload && typeof payload === "object" && "manualTotals" in payload
      ? (payload.manualTotals as Record<string, unknown> | null)
      : null;
  const manualBreakdown =
    manualTotals && typeof manualTotals === "object" && "ivaBreakdown" in manualTotals
      ? (manualTotals.ivaBreakdown as unknown)
      : null;
  const ivaItemsFromManual = Array.isArray(manualBreakdown)
    ? manualBreakdown.map((item) => ({
        Id: Number((item as Record<string, unknown>).id),
        BaseImp: Number((item as Record<string, unknown>).base),
        Importe: Number((item as Record<string, unknown>).amount),
      }))
    : [];

  const totals = {
    total: Number(voucherData.ImpTotal),
    net: Number(voucherData.ImpNeto),
    iva: Number(voucherData.ImpIVA),
    exempt: Number(voucherData.ImpOpEx ?? 0),
    ivaItems: Array.isArray(voucherData.Iva)
      ? voucherData.Iva
      : ivaItemsFromManual,
  };

  const monId = typeof voucherData.MonId === "string" ? voucherData.MonId : "PES";
  const monCotiz =
    typeof voucherData.MonCotiz === "number"
      ? voucherData.MonCotiz
      : Number(voucherData.MonCotiz ?? 1);

  const condicionIva =
    typeof voucherData.CondicionIVAReceptorId === "number"
      ? voucherData.CondicionIVAReceptorId
      : invoice.type === "A"
        ? 1
        : 5;

  const originalVoucherType = Number(
    voucherData.CbteTipo ?? (invoice.type === "A" ? 1 : 6)
  );
  if (!Number.isFinite(originalVoucherType)) {
    throw new Error("INVOICE_TYPE_INVALID");
  }

  const originalPointOfSale = Number(
    voucherData.PtoVta ?? invoice.pointOfSale ?? pointOfSale
  );
  if (!Number.isFinite(originalPointOfSale) || originalPointOfSale <= 0) {
    throw new Error("SALES_POINT_INVALID");
  }

  const originalNumber = Number(
    invoice.number ?? voucherData.CbteDesde ?? voucherData.CbteHasta
  );
  if (!Number.isFinite(originalNumber)) {
    throw new Error("INVOICE_NUMBER_MISSING");
  }

  const voucherBase: Record<string, unknown> = {
    CantReg: 1,
    PtoVta: pointOfSale,
    CbteTipo: voucherType,
    Concepto: voucherData.Concepto ?? 1,
    DocTipo: docType,
    DocNro: docNumber,
    CondicionIVAReceptorId: condicionIva,
    CbteFch: formatAfipDate(issueDate),
    ImpTotal: totals.total,
    ImpTotConc: 0,
    ImpNeto: totals.net,
    ImpOpEx: totals.exempt,
    ImpIVA: totals.iva,
    ImpTrib: 0,
    MonId: monId,
    MonCotiz: monCotiz,
    CbtesAsoc: [
      {
        Tipo: originalVoucherType,
        PtoVta: originalPointOfSale,
        Nro: originalNumber,
        Cuit: Number(afip.CUIT),
      },
    ],
  };

  if (totals.ivaItems.length) {
    voucherBase.Iva = totals.ivaItems;
  }

  const result = await afip.ElectronicBilling.createNextVoucher(voucherBase);
  const cae = result?.CAE;
  const caeDue = result?.CAEFchVto;
  const voucherNumber = Number(
    result?.voucherNumber ?? result?.voucher_number
  );

  if (!cae) {
    throw new Error("AFIP_CAE_MISSING");
  }

  if (!Number.isFinite(voucherNumber)) {
    throw new Error("AFIP_VOUCHER_NUMBER_MISSING");
  }

  voucherBase.CbteDesde = voucherNumber;
  voucherBase.CbteHasta = voucherNumber;

  const qrPayload = buildQrPayload({
    issueDate,
    cuit: Number(afip.CUIT),
    pointOfSale,
    voucherType,
    voucherNumber,
    total: totals.total,
    monId,
    monCotiz,
    docType,
    docNumber,
    cae,
  });

  const qrBase64 = await buildQrDataUrl(qrPayload);

  const payloadAfip = {
    voucherData: voucherBase,
    qrBase64,
    serviceDates: null,
  };

  return prisma.fiscalCreditNote.create({
    data: {
      organizationId: invoice.organizationId,
      saleId: invoice.saleId,
      fiscalInvoiceId: invoice.id,
      creditNumber: voucherNumber.toString(),
      pointOfSale: pointOfSale.toString(),
      type: invoice.type,
      cae,
      caeDueDate: caeDue ? new Date(caeDue) : null,
      issuedAt: issueDate,
      payloadAfip: payloadAfip as Prisma.JsonObject,
    },
  });
}
