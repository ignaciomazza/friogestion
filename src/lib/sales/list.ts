import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const SALES_PAGE_SIZE = 25;
const MAX_SALES_PAGE_SIZE = 100;
const PAYMENT_SETTLEMENT_TOLERANCE = 0.01;

export type SalesSort = "newest" | "oldest";

export const salesListInclude = Prisma.validator<Prisma.SaleInclude>()({
  customer: true,
  items: { include: { product: true } },
  fiscalInvoice: {
    select: { type: true, pointOfSale: true, number: true },
  },
  saleCharges: { select: { amount: true } },
  receipts: {
    where: { status: "CONFIRMED" },
    select: {
      lines: {
        select: {
          accountMovement: {
            select: { verifiedAt: true },
          },
        },
      },
    },
  },
});

type SalesListRecord = Prisma.SaleGetPayload<{
  include: typeof salesListInclude;
}>;

export type SalesStatsSummary = {
  totalSales: number;
  openBalanceSales: number;
  totalRevenue: number;
};

export const parseSalesLimit = (value: string | null) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return SALES_PAGE_SIZE;
  const normalized = Math.trunc(parsed);
  if (normalized < 1) return 1;
  if (normalized > MAX_SALES_PAGE_SIZE) return MAX_SALES_PAGE_SIZE;
  return normalized;
};

export const parseSalesOffset = (value: string | null) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  const normalized = Math.trunc(parsed);
  if (normalized < 0) return 0;
  return normalized;
};

export const parseSalesSort = (value: string | null): SalesSort =>
  value === "oldest" ? "oldest" : "newest";

const compactDigits = (value: string) => value.replace(/\D/g, "");

const parseFiscalVoucherQuery = (query: string) => {
  const separated = query.match(/^\s*(\d+)\D+(\d+)\s*$/);
  if (separated) {
    return {
      pointOfSale: String(Number(separated[1])),
      number: String(Number(separated[2])),
    };
  }

  const digits = compactDigits(query);
  if (digits.length > 8) {
    return {
      pointOfSale: String(Number(digits.slice(0, -8))),
      number: String(Number(digits.slice(-8))),
    };
  }

  if (digits) return { pointOfSale: null, number: String(Number(digits)) };
  return null;
};

export const salesOrderBy = (
  sort: SalesSort,
): Prisma.SaleOrderByWithRelationInput[] =>
  sort === "oldest"
    ? [
        { saleDate: { sort: "asc", nulls: "last" } },
        { createdAt: "asc" },
        { id: "asc" },
      ]
    : [
        { saleDate: { sort: "desc", nulls: "last" } },
        { createdAt: "desc" },
        { id: "asc" },
      ];

export const buildSalesWhere = ({
  organizationId,
  query,
  dateFrom,
  dateTo,
}: {
  organizationId: string;
  query?: string;
  dateFrom?: Date | null;
  dateTo?: Date | null;
}) => {
  const andClauses: Prisma.SaleWhereInput[] = [];

  if (dateFrom) {
    andClauses.push({
      OR: [
        { saleDate: { gte: dateFrom } },
        { saleDate: null, createdAt: { gte: dateFrom } },
      ],
    });
  }

  if (dateTo) {
    andClauses.push({
      OR: [
        { saleDate: { lte: dateTo } },
        { saleDate: null, createdAt: { lte: dateTo } },
      ],
    });
  }

  const trimmedQuery = query?.trim();
  if (trimmedQuery) {
    const voucherQuery = parseFiscalVoucherQuery(trimmedQuery);
    const searchClauses: Prisma.SaleWhereInput[] = [
      {
        customer: {
          displayName: { contains: trimmedQuery, mode: "insensitive" },
        },
      },
      { saleNumber: { contains: trimmedQuery, mode: "insensitive" } },
      {
        fiscalInvoice: {
          is: { number: { contains: trimmedQuery, mode: "insensitive" } },
        },
      },
    ];

    if (voucherQuery?.number) {
      searchClauses.push({
        fiscalInvoice: {
          is: { number: { contains: voucherQuery.number, mode: "insensitive" } },
        },
      });
    }

    if (voucherQuery?.pointOfSale && voucherQuery.number) {
      searchClauses.push({
        fiscalInvoice: {
          is: {
            pointOfSale: {
              contains: voucherQuery.pointOfSale,
              mode: "insensitive",
            },
            number: { contains: voucherQuery.number, mode: "insensitive" },
          },
        },
      });
    }

    andClauses.push({ OR: searchClauses });
  }

  return {
    organizationId,
    ...(andClauses.length ? { AND: andClauses } : {}),
  } satisfies Prisma.SaleWhereInput;
};

export const getSalesStatsSummary = async (
  organizationId: string,
): Promise<SalesStatsSummary> => {
  const baseWhere = { organizationId } satisfies Prisma.SaleWhereInput;
  const [totalSales, openBalanceSales, totals] = await prisma.$transaction([
    prisma.sale.count({ where: baseWhere }),
    prisma.sale.count({
      where: {
        organizationId,
        balance: { gt: PAYMENT_SETTLEMENT_TOLERANCE.toFixed(2) },
      },
    }),
    prisma.sale.aggregate({
      where: baseWhere,
      _sum: { total: true },
    }),
  ]);

  return {
    totalSales,
    openBalanceSales,
    totalRevenue: Number(totals._sum.total ?? 0),
  };
};

export const serializeSaleListItem = (sale: SalesListRecord) => ({
  hasPendingDoubleCheck: sale.receipts.some((receipt) =>
    receipt.lines.some((line) =>
      line.accountMovement ? !line.accountMovement.verifiedAt : false,
    ),
  ),
  id: sale.id,
  customerName: sale.customer.displayName,
  customerPhone: sale.customer.phone,
  customerTaxId: sale.customer.taxId,
  customerType: sale.customer.type,
  customerFiscalTaxProfile: sale.customer.fiscalTaxProfile,
  saleNumber: sale.saleNumber,
  fiscalInvoiceType: sale.fiscalInvoice?.type ?? null,
  fiscalInvoicePointOfSale: sale.fiscalInvoice?.pointOfSale ?? null,
  fiscalInvoiceNumber: sale.fiscalInvoice?.number ?? null,
  saleDate: sale.saleDate?.toISOString() ?? null,
  createdAt: sale.createdAt.toISOString(),
  subtotal: sale.subtotal?.toString() ?? null,
  taxes: sale.taxes?.toString() ?? null,
  extraType: sale.extraType ?? null,
  extraValue: sale.extraValue?.toString() ?? null,
  extraAmount: sale.extraAmount?.toString() ?? null,
  chargesTotal: sale.saleCharges
    .reduce((total, charge) => total + Number(charge.amount ?? 0), 0)
    .toFixed(2),
  total: sale.total?.toString() ?? null,
  paidTotal: sale.paidTotal?.toString() ?? "0",
  balance: sale.balance?.toString() ?? "0",
  paymentStatus: sale.paymentStatus,
  status: sale.status,
  billingStatus: sale.billingStatus,
  items: sale.items.map((item) => ({
    id: item.id,
    productName: item.product.name,
    qty: item.qty.toString(),
    unitPrice: item.unitPrice.toString(),
    total: item.total.toString(),
    taxRate: item.taxRate?.toString() ?? null,
    taxAmount: item.taxAmount?.toString() ?? null,
  })),
});
