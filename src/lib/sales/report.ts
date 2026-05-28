import { prisma } from "@/lib/prisma";

type DecimalLike = { toString(): string } | number | string | null | undefined;

type FiscalAmounts = {
  netTaxed: number;
  vatTotal: number;
  exemptAmount: number;
  nonTaxedAmount: number;
  total: number;
};

export type FiscalInvoiceReportLine = {
  id: string;
  date: string;
  customerName: string;
  customerTaxId: string | null;
  voucher: string;
  type: string | null;
  currencyCode: string;
  netTaxed: number;
  vatTotal: number;
  exemptAmount: number;
  nonTaxedAmount: number;
  total: number;
  source: "AFIP" | "VENTA";
};

export type FiscalCreditNoteReportLine = {
  id: string;
  date: string;
  customerName: string;
  customerTaxId: string | null;
  voucher: string;
  type: string | null;
  relatedInvoiceVoucher: string | null;
  netTaxed: number;
  vatTotal: number;
  exemptAmount: number;
  nonTaxedAmount: number;
  total: number;
  source: "AFIP" | "VENTA";
};

export type FiscalDebitNoteReportLine = {
  id: string;
  date: string;
  customerName: string;
  customerTaxId: string | null;
  voucher: string;
  type: string | null;
  relatedCreditNoteVoucher: string | null;
  netTaxed: number;
  vatTotal: number;
  exemptAmount: number;
  nonTaxedAmount: number;
  total: number;
  source: "AFIP" | "VENTA";
};

export type BillingMonthlyReport = {
  period: {
    from: string;
    to: string;
  };
  totals: {
    invoicesCount: number;
    creditNotesCount: number;
    debitNotesCount: number;
    netTaxed: number;
    vatTotal: number;
    exemptAmount: number;
    nonTaxedAmount: number;
    invoicesTotal: number;
    creditNotesTotal: number;
    debitNotesTotal: number;
    netTotal: number;
  };
  invoices: FiscalInvoiceReportLine[];
  creditNotes: FiscalCreditNoteReportLine[];
  debitNotes: FiscalDebitNoteReportLine[];
};

const toNumber = (value: DecimalLike) => {
  if (value === null || value === undefined) return 0;
  const parsed = Number(value.toString());
  return Number.isFinite(parsed) ? parsed : 0;
};

const parseRecordNumber = (record: Record<string, unknown>, key: string) => {
  const value = record[key];
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const round2 = (value: number) =>
  Math.round((value + Number.EPSILON) * 100) / 100;

const isoDate = (date: Date) => date.toISOString().slice(0, 10);

const toPointOfSale = (value: unknown) => {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed.toString().padStart(4, "0");
  }
  const text = String(value).trim();
  return text.length ? text : null;
};

const toVoucherNumber = (value: unknown) => {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed.toString().padStart(8, "0");
  }
  const text = String(value).trim();
  return text.length ? text : null;
};

const buildVoucherLabel = (pointOfSale: unknown, number: unknown) => {
  const pos = toPointOfSale(pointOfSale);
  const voucherNumber = toVoucherNumber(number);
  if (pos && voucherNumber) return `${pos}-${voucherNumber}`;
  return voucherNumber ?? "-";
};

const readPayloadAmounts = (payload: unknown): FiscalAmounts | null => {
  if (!payload || typeof payload !== "object") return null;
  const root = payload as Record<string, unknown>;
  const voucherData =
    root.voucherData && typeof root.voucherData === "object"
      ? (root.voucherData as Record<string, unknown>)
      : root;

  const netTaxed = parseRecordNumber(voucherData, "ImpNeto");
  const vatTotal = parseRecordNumber(voucherData, "ImpIVA");
  const exemptAmount = parseRecordNumber(voucherData, "ImpOpEx");
  const nonTaxedAmount = parseRecordNumber(voucherData, "ImpTotConc");
  const total = parseRecordNumber(voucherData, "ImpTotal");

  if (
    netTaxed === null &&
    vatTotal === null &&
    exemptAmount === null &&
    nonTaxedAmount === null &&
    total === null
  ) {
    return null;
  }

  const computedTotal =
    total ??
    (netTaxed ?? 0) + (vatTotal ?? 0) + (exemptAmount ?? 0) + (nonTaxedAmount ?? 0);

  return {
    netTaxed: round2(netTaxed ?? 0),
    vatTotal: round2(vatTotal ?? 0),
    exemptAmount: round2(exemptAmount ?? 0),
    nonTaxedAmount: round2(nonTaxedAmount ?? 0),
    total: round2(computedTotal),
  };
};

const fallbackSaleAmounts = (sale: {
  subtotal: DecimalLike;
  taxes: DecimalLike;
  total: DecimalLike;
}): FiscalAmounts => {
  const netTaxed = round2(toNumber(sale.subtotal));
  const vatTotal = round2(toNumber(sale.taxes));
  const total = round2(toNumber(sale.total));
  return {
    netTaxed,
    vatTotal,
    exemptAmount: 0,
    nonTaxedAmount: 0,
    total,
  };
};

const extractAmounts = (
  payload: unknown,
  sale: {
    subtotal: DecimalLike;
    taxes: DecimalLike;
    total: DecimalLike;
  },
) => {
  const afip = readPayloadAmounts(payload);
  if (afip) return { amounts: afip, source: "AFIP" as const };
  return { amounts: fallbackSaleAmounts(sale), source: "VENTA" as const };
};

export async function buildBillingMonthlyReport(input: {
  organizationId: string;
  from: Date;
  to: Date;
}): Promise<BillingMonthlyReport> {
  const dateRangeWhere = {
    OR: [
      { issuedAt: { gte: input.from, lte: input.to } },
      {
        issuedAt: null,
        createdAt: { gte: input.from, lte: input.to },
      },
    ],
  };

  const invoicesRaw = await prisma.fiscalInvoice.findMany({
    where: {
      organizationId: input.organizationId,
      AND: [
        dateRangeWhere,
        {
          OR: [{ number: { not: null } }, { cae: { not: null } }],
        },
      ],
    },
    include: {
      sale: {
        include: {
          customer: {
            select: { displayName: true, taxId: true },
          },
        },
      },
    },
    orderBy: [{ issuedAt: "asc" }, { createdAt: "asc" }],
  });

  const creditNotesRaw = await prisma.fiscalCreditNote.findMany({
    where: {
      organizationId: input.organizationId,
      fiscalInvoiceId: { not: null },
      AND: [
        dateRangeWhere,
        {
          OR: [{ creditNumber: { not: null } }, { cae: { not: null } }],
        },
      ],
    },
    include: {
      sale: {
        include: {
          customer: {
            select: { displayName: true, taxId: true },
          },
        },
      },
      fiscalInvoice: {
        include: {
          sale: {
            include: {
              customer: {
                select: { displayName: true, taxId: true },
              },
            },
          },
        },
      },
    },
    orderBy: [{ issuedAt: "asc" }, { createdAt: "asc" }],
  });

  const debitNotesRaw = await prisma.fiscalDebitNote.findMany({
    where: {
      organizationId: input.organizationId,
      fiscalCreditNoteId: { not: null },
      AND: [
        dateRangeWhere,
        {
          OR: [{ debitNumber: { not: null } }, { cae: { not: null } }],
        },
      ],
    },
    include: {
      sale: {
        include: {
          customer: {
            select: { displayName: true, taxId: true },
          },
        },
      },
      fiscalCreditNote: {
        include: {
          fiscalInvoice: true,
        },
      },
      fiscalInvoice: true,
    },
    orderBy: [{ issuedAt: "asc" }, { createdAt: "asc" }],
  });

  const invoices: FiscalInvoiceReportLine[] = invoicesRaw.map((invoice) => {
    const { amounts, source } = extractAmounts(invoice.payloadAfip, invoice.sale);
    return {
      id: invoice.id,
      date: isoDate(invoice.issuedAt ?? invoice.createdAt),
      customerName: invoice.sale.customer.displayName,
      customerTaxId: invoice.sale.customer.taxId,
      voucher: buildVoucherLabel(invoice.pointOfSale, invoice.number),
      type: invoice.type,
      currencyCode: invoice.currencyCode ?? "ARS",
      netTaxed: amounts.netTaxed,
      vatTotal: amounts.vatTotal,
      exemptAmount: amounts.exemptAmount,
      nonTaxedAmount: amounts.nonTaxedAmount,
      total: amounts.total,
      source,
    };
  });

  const creditNotes: FiscalCreditNoteReportLine[] = creditNotesRaw.map((note) => {
    const linkedSale = note.sale ?? note.fiscalInvoice?.sale;
    const linkedCustomer = linkedSale?.customer;
    const saleForAmounts = linkedSale ?? { subtotal: 0, taxes: 0, total: 0 };
    const { amounts, source } = extractAmounts(note.payloadAfip, saleForAmounts);
    return {
      id: note.id,
      date: isoDate(note.issuedAt ?? note.createdAt),
      customerName: linkedCustomer?.displayName ?? "Cliente sin nombre",
      customerTaxId: linkedCustomer?.taxId ?? null,
      voucher: buildVoucherLabel(note.pointOfSale, note.creditNumber),
      type: note.type,
      relatedInvoiceVoucher: note.fiscalInvoice
        ? buildVoucherLabel(
            note.fiscalInvoice.pointOfSale,
            note.fiscalInvoice.number,
          )
        : null,
      netTaxed: amounts.netTaxed,
      vatTotal: amounts.vatTotal,
      exemptAmount: amounts.exemptAmount,
      nonTaxedAmount: amounts.nonTaxedAmount,
      total: amounts.total,
      source,
    };
  });

  const debitNotes: FiscalDebitNoteReportLine[] = debitNotesRaw.map((note) => {
    const saleForAmounts = note.sale ?? { subtotal: 0, taxes: 0, total: 0 };
    const { amounts, source } = extractAmounts(note.payloadAfip, saleForAmounts);
    return {
      id: note.id,
      date: isoDate(note.issuedAt ?? note.createdAt),
      customerName: note.sale?.customer.displayName ?? "Cliente sin nombre",
      customerTaxId: note.sale?.customer.taxId ?? null,
      voucher: buildVoucherLabel(note.pointOfSale, note.debitNumber),
      type: note.type,
      relatedCreditNoteVoucher: note.fiscalCreditNote
        ? buildVoucherLabel(
            note.fiscalCreditNote.pointOfSale,
            note.fiscalCreditNote.creditNumber,
          )
        : null,
      netTaxed: amounts.netTaxed,
      vatTotal: amounts.vatTotal,
      exemptAmount: amounts.exemptAmount,
      nonTaxedAmount: amounts.nonTaxedAmount,
      total: amounts.total,
      source,
    };
  });

  const invoicesTotal = invoices.reduce((sum, item) => round2(sum + item.total), 0);
  const creditNotesTotal = creditNotes.reduce(
    (sum, item) => round2(sum + item.total),
    0,
  );
  const debitNotesTotal = debitNotes.reduce(
    (sum, item) => round2(sum + item.total),
    0,
  );
  const netTaxed = round2(
    invoices.reduce((sum, item) => sum + item.netTaxed, 0) -
      creditNotes.reduce((sum, item) => sum + item.netTaxed, 0) +
      debitNotes.reduce((sum, item) => sum + item.netTaxed, 0),
  );
  const vatTotal = round2(
    invoices.reduce((sum, item) => sum + item.vatTotal, 0) -
      creditNotes.reduce((sum, item) => sum + item.vatTotal, 0) +
      debitNotes.reduce((sum, item) => sum + item.vatTotal, 0),
  );
  const exemptAmount = round2(
    invoices.reduce((sum, item) => sum + item.exemptAmount, 0) -
      creditNotes.reduce((sum, item) => sum + item.exemptAmount, 0) +
      debitNotes.reduce((sum, item) => sum + item.exemptAmount, 0),
  );
  const nonTaxedAmount = round2(
    invoices.reduce((sum, item) => sum + item.nonTaxedAmount, 0) -
      creditNotes.reduce((sum, item) => sum + item.nonTaxedAmount, 0) +
      debitNotes.reduce((sum, item) => sum + item.nonTaxedAmount, 0),
  );

  return {
    period: {
      from: input.from.toISOString(),
      to: input.to.toISOString(),
    },
    totals: {
      invoicesCount: invoices.length,
      creditNotesCount: creditNotes.length,
      debitNotesCount: debitNotes.length,
      netTaxed,
      vatTotal,
      exemptAmount,
      nonTaxedAmount,
      invoicesTotal,
      creditNotesTotal,
      debitNotesTotal,
      netTotal: round2(invoicesTotal - creditNotesTotal + debitNotesTotal),
    },
    invoices,
    creditNotes,
    debitNotes,
  };
}

export function csvEscape(value: unknown) {
  if (value === null || value === undefined) return "";
  const stringValue =
    typeof value === "number" ? value.toFixed(2) : String(value);
  if (/[",\n\r]/.test(stringValue)) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  return stringValue;
}

const csvRow = (values: unknown[]) => values.map(csvEscape).join(",");

export function buildBillingReportCsv(report: BillingMonthlyReport) {
  const invoiceHeaders = [
    "Fecha",
    "Cliente",
    "CUIT cliente",
    "Comprobante",
    "Tipo",
    "Moneda",
    "Neto gravado",
    "IVA",
    "Exento",
    "No gravado",
    "Total",
    "Origen montos",
  ];
  const creditNoteHeaders = [
    "Fecha",
    "Cliente",
    "CUIT cliente",
    "Nota de credito",
    "Tipo",
    "Factura asociada",
    "Neto gravado",
    "IVA",
    "Exento",
    "No gravado",
    "Total",
    "Origen montos",
  ];
  const debitNoteHeaders = [
    "Fecha",
    "Cliente",
    "CUIT cliente",
    "Nota de debito",
    "Tipo",
    "Nota de credito asociada",
    "Neto gravado",
    "IVA",
    "Exento",
    "No gravado",
    "Total",
    "Origen montos",
  ];

  const lines = [
    "Facturas emitidas",
    csvRow(invoiceHeaders),
    ...report.invoices.map((invoice) =>
      csvRow([
        invoice.date,
        invoice.customerName,
        invoice.customerTaxId,
        invoice.voucher,
        invoice.type,
        invoice.currencyCode,
        invoice.netTaxed,
        invoice.vatTotal,
        invoice.exemptAmount,
        invoice.nonTaxedAmount,
        invoice.total,
        invoice.source,
      ]),
    ),
    "",
    "Notas de credito",
    csvRow(creditNoteHeaders),
    ...report.creditNotes.map((note) =>
      csvRow([
        note.date,
        note.customerName,
        note.customerTaxId,
        note.voucher,
        note.type,
        note.relatedInvoiceVoucher,
        note.netTaxed,
        note.vatTotal,
        note.exemptAmount,
        note.nonTaxedAmount,
        note.total,
        note.source,
      ]),
    ),
    "",
    "Notas de debito",
    csvRow(debitNoteHeaders),
    ...report.debitNotes.map((note) =>
      csvRow([
        note.date,
        note.customerName,
        note.customerTaxId,
        note.voucher,
        note.type,
        note.relatedCreditNoteVoucher,
        note.netTaxed,
        note.vatTotal,
        note.exemptAmount,
        note.nonTaxedAmount,
        note.total,
        note.source,
      ]),
    ),
  ];

  return `${lines.join("\r\n")}\r\n`;
}
