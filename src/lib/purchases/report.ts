import { prisma } from "@/lib/prisma";
import {
  PURCHASE_FISCAL_LINE_TYPE_LABELS,
  PURCHASE_FISCAL_LINE_TYPES,
  formatPurchaseInvoiceNumber,
} from "@/lib/purchases/fiscal";

type DecimalLike = { toString(): string } | number | string | null | undefined;

export type PurchaseReportLine = {
  id: string;
  date: string;
  supplierName: string;
  supplierTaxId: string | null;
  voucher: string | null;
  voucherKind: string | null;
  pointOfSale: number | null;
  voucherNumber: number | null;
  currencyCode: string;
  netTaxed: number;
  netNonTaxed: number;
  exemptAmount: number;
  vatTotal: number;
  otherTaxesTotal: number;
  total: number;
  fiscalLineTotals: Record<string, number>;
  arcaValidationStatus: string;
};

export type PurchaseRetentionReportLine = {
  id: string;
  paymentId: string;
  date: string;
  supplierName: string;
  supplierTaxId: string | null;
  type: string;
  baseAmount: number | null;
  rate: number | null;
  amount: number;
  note: string | null;
};

export type PurchasesMonthlyReport = {
  period: {
    from: string;
    to: string;
  };
  totals: {
    purchasesCount: number;
    netTaxed: number;
    netNonTaxed: number;
    exemptAmount: number;
    vatTotal: number;
    otherTaxesTotal: number;
    total: number;
    retentionsTotal: number;
    fiscalLineTotals: Record<string, number>;
    retentionTotals: Record<string, number>;
  };
  purchases: PurchaseReportLine[];
  retentions: PurchaseRetentionReportLine[];
};

const toNumber = (value: DecimalLike) => {
  if (value === null || value === undefined) return 0;
  const parsed = Number(value.toString());
  return Number.isFinite(parsed) ? parsed : 0;
};

const round2 = (value: number) =>
  Math.round((value + Number.EPSILON) * 100) / 100;

const isoDate = (date: Date) => date.toISOString().slice(0, 10);

const emptyFiscalLineTotals = () =>
  Object.fromEntries(PURCHASE_FISCAL_LINE_TYPES.map((type) => [type, 0]));

const addToBucket = (
  bucket: Record<string, number>,
  key: string,
  amount: number,
) => {
  bucket[key] = round2((bucket[key] ?? 0) + amount);
};

export async function buildPurchasesMonthlyReport(input: {
  organizationId: string;
  from: Date;
  to: Date;
}): Promise<PurchasesMonthlyReport> {
  const purchases = await prisma.purchaseInvoice.findMany({
    where: {
      organizationId: input.organizationId,
      OR: [
        { invoiceDate: { gte: input.from, lte: input.to } },
        {
          invoiceDate: null,
          createdAt: { gte: input.from, lte: input.to },
        },
      ],
    },
    include: {
      supplier: {
        select: { displayName: true, taxId: true },
      },
      fiscalLines: true,
    },
    orderBy: [{ invoiceDate: "asc" }, { createdAt: "asc" }],
  });

  const retentions = await prisma.supplierPaymentRetention.findMany({
    where: {
      supplierPayment: {
        organizationId: input.organizationId,
        status: "CONFIRMED",
        paidAt: { gte: input.from, lte: input.to },
      },
    },
    include: {
      supplierPayment: {
        include: {
          supplier: {
            select: { displayName: true, taxId: true },
          },
        },
      },
    },
    orderBy: {
      supplierPayment: {
        paidAt: "asc",
      },
    },
  });

  const purchasesReport: PurchaseReportLine[] = purchases.map((purchase) => {
    const fiscalLineTotals = emptyFiscalLineTotals();
    for (const line of purchase.fiscalLines) {
      addToBucket(fiscalLineTotals, line.type, toNumber(line.amount));
    }

    return {
      id: purchase.id,
      date: isoDate(purchase.invoiceDate ?? purchase.createdAt),
      supplierName: purchase.supplier.displayName,
      supplierTaxId: purchase.supplier.taxId,
      voucher:
        purchase.invoiceNumber ??
        formatPurchaseInvoiceNumber(
          purchase.fiscalPointOfSale,
          purchase.fiscalVoucherNumber,
        ),
      voucherKind: purchase.fiscalVoucherKind,
      pointOfSale: purchase.fiscalPointOfSale,
      voucherNumber: purchase.fiscalVoucherNumber,
      currencyCode: purchase.currencyCode,
      netTaxed: toNumber(purchase.netTaxed),
      netNonTaxed: toNumber(purchase.netNonTaxed),
      exemptAmount: toNumber(purchase.exemptAmount),
      vatTotal: toNumber(purchase.vatTotal),
      otherTaxesTotal: toNumber(purchase.otherTaxesTotal),
      total: toNumber(purchase.total),
      fiscalLineTotals,
      arcaValidationStatus: purchase.arcaValidationStatus,
    };
  });

  const retentionsReport: PurchaseRetentionReportLine[] = retentions.map(
    (retention) => ({
      id: retention.id,
      paymentId: retention.supplierPaymentId,
      date: isoDate(retention.supplierPayment.paidAt),
      supplierName: retention.supplierPayment.supplier.displayName,
      supplierTaxId: retention.supplierPayment.supplier.taxId,
      type: retention.type,
      baseAmount:
        retention.baseAmount === null ? null : toNumber(retention.baseAmount),
      rate: retention.rate === null ? null : toNumber(retention.rate),
      amount: toNumber(retention.amount),
      note: retention.note,
    }),
  );

  const totals = {
    purchasesCount: purchasesReport.length,
    netTaxed: 0,
    netNonTaxed: 0,
    exemptAmount: 0,
    vatTotal: 0,
    otherTaxesTotal: 0,
    total: 0,
    retentionsTotal: 0,
    fiscalLineTotals: emptyFiscalLineTotals(),
    retentionTotals: {} as Record<string, number>,
  };

  for (const purchase of purchasesReport) {
    totals.netTaxed = round2(totals.netTaxed + purchase.netTaxed);
    totals.netNonTaxed = round2(totals.netNonTaxed + purchase.netNonTaxed);
    totals.exemptAmount = round2(totals.exemptAmount + purchase.exemptAmount);
    totals.vatTotal = round2(totals.vatTotal + purchase.vatTotal);
    totals.otherTaxesTotal = round2(
      totals.otherTaxesTotal + purchase.otherTaxesTotal,
    );
    totals.total = round2(totals.total + purchase.total);
    for (const [type, amount] of Object.entries(purchase.fiscalLineTotals)) {
      addToBucket(totals.fiscalLineTotals, type, amount);
    }
  }

  for (const retention of retentionsReport) {
    totals.retentionsTotal = round2(
      totals.retentionsTotal + retention.amount,
    );
    addToBucket(totals.retentionTotals, retention.type, retention.amount);
  }

  return {
    period: {
      from: input.from.toISOString(),
      to: input.to.toISOString(),
    },
    totals,
    purchases: purchasesReport,
    retentions: retentionsReport,
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

export function buildPurchasesReportCsv(report: PurchasesMonthlyReport) {
  const purchaseHeaders = [
    "Fecha",
    "Proveedor",
    "CUIT proveedor",
    "Comprobante",
    "Tipo",
    "Punto de venta",
    "Numero",
    "Moneda",
    "Neto gravado",
    "No gravado",
    "Exento",
    "IVA",
    ...PURCHASE_FISCAL_LINE_TYPES.map(
      (type) => PURCHASE_FISCAL_LINE_TYPE_LABELS[type],
    ),
    "Otros/percepciones total",
    "Total",
    "Estado ARCA",
  ];

  const retentionHeaders = [
    "Fecha",
    "Proveedor",
    "CUIT proveedor",
    "Tipo",
    "Base",
    "Alicuota",
    "Importe",
    "Pago asociado",
    "Nota",
  ];

  const lines = [
    "Compras",
    csvRow(purchaseHeaders),
    ...report.purchases.map((purchase) =>
      csvRow([
        purchase.date,
        purchase.supplierName,
        purchase.supplierTaxId,
        purchase.voucher,
        purchase.voucherKind,
        purchase.pointOfSale,
        purchase.voucherNumber,
        purchase.currencyCode,
        purchase.netTaxed,
        purchase.netNonTaxed,
        purchase.exemptAmount,
        purchase.vatTotal,
        ...PURCHASE_FISCAL_LINE_TYPES.map(
          (type) => purchase.fiscalLineTotals[type] ?? 0,
        ),
        purchase.otherTaxesTotal,
        purchase.total,
        purchase.arcaValidationStatus,
      ]),
    ),
    "",
    "Retenciones",
    csvRow(retentionHeaders),
    ...report.retentions.map((retention) =>
      csvRow([
        retention.date,
        retention.supplierName,
        retention.supplierTaxId,
        retention.type,
        retention.baseAmount,
        retention.rate,
        retention.amount,
        retention.paymentId,
        retention.note,
      ]),
    ),
  ];

  return `${lines.join("\r\n")}\r\n`;
}
