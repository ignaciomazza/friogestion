import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireOrg, requireRole } from "@/lib/auth/tenant";
import { WRITE_ROLES } from "@/lib/auth/rbac";
import { parseOptionalDate } from "@/lib/validation";
import { logServerError } from "@/lib/server/log";
import { authErrorStatus, isAuthError } from "@/lib/auth/errors";
import { STOCK_ENABLED } from "@/lib/features";
import {
  buildPurchaseValidationPayload,
  type PurchaseValidationPayload,
  purchaseValidationInputSchema,
} from "@/lib/arca/purchase-validation";
import { validatePurchaseVoucher } from "@/lib/arca/purchase-verification";
import { mapArcaValidationError } from "@/lib/arca/validation-errors";
import {
  PURCHASE_DISCOUNT_BASES,
  PURCHASE_DISCOUNT_TYPES,
  PURCHASE_DOCUMENT_TYPES,
  assertPurchaseVoucherVatRules,
  buildPurchaseFiscalTotals,
  formatPurchaseDocumentTypeLabel,
  getPurchaseFiscalRecordType,
  isPurchaseFiscalComputable,
  mapVoucherTypeToPurchaseKind,
  purchaseFiscalInputSchema,
} from "@/lib/purchases/fiscal";
import { buildPurchaseInMovements } from "@/lib/stock";

const stockAdjustmentSchema = z.object({
  productId: z.string().min(1),
  qty: z.coerce.number().refine((value) => value !== 0, {
    message: "Cantidad invalida",
  }),
});

const purchaseItemSchema = z.object({
  productId: z.string().min(1),
  qty: z.coerce.number().positive(),
  unitCost: z.coerce.number().min(0),
  lineSubtotal: z.coerce.number().min(0).optional(),
  taxRate: z.coerce.number().min(0).max(100).optional(),
  taxAmount: z.coerce.number().min(0).optional(),
  discountType: z.enum(PURCHASE_DISCOUNT_TYPES).optional(),
  discountBase: z.enum(PURCHASE_DISCOUNT_BASES).optional(),
  discountValue: z.coerce.number().min(0).optional(),
  discountAmount: z.coerce.number().min(0).optional(),
});

const purchaseDiscountSchema = z.object({
  type: z.enum(PURCHASE_DISCOUNT_TYPES),
  base: z.enum(PURCHASE_DISCOUNT_BASES),
  value: z.coerce.number().min(0),
  amount: z.coerce.number().min(0),
});

const cashOutLineSchema = z.object({
  paymentMethodId: z.string().min(1),
  accountId: z.string().optional(),
  amount: z.coerce.number().positive(),
});

const purchaseSchema = z.object({
  supplierId: z.string().min(1),
  documentType: z.enum(PURCHASE_DOCUMENT_TYPES).default("INVOICE"),
  linkedPurchaseInvoiceId: z.string().min(1).optional(),
  invoiceNumber: z.string().min(1).optional(),
  invoiceDate: z.string().min(1).optional(),
  totalAmount: z.coerce.number().positive(),
  purchaseVatAmount: z.coerce.number().min(0).optional(),
  globalDiscount: purchaseDiscountSchema.optional(),
  currencyCode: z.string().min(1).optional(),
  fiscalDetail: purchaseFiscalInputSchema.nullish(),
  impactCurrentAccount: z.boolean().optional(),
  hasInvoice: z.boolean().optional(),
  validateWithArca: z.boolean().optional(),
  arcaValidation: purchaseValidationInputSchema.optional(),
  items: z.array(purchaseItemSchema).optional(),
  adjustStock: z.boolean().optional(),
  stockAdjustments: z.array(stockAdjustmentSchema).optional(),
  registerCashOut: z.boolean().optional(),
  cashOutLines: z.array(cashOutLineSchema).min(1).optional(),
  cashOutPaymentMethodId: z.string().min(1).optional(),
  cashOutAccountId: z.string().min(1).optional(),
});

const INVOICE_NUMBER_PATTERN = /^(\d{1,5})-(\d{1,12})$/;

type ImmediateCashOutCandidate = {
  methodName: string;
  occurredAt: Date;
  amount: number;
};

type SupplierPaymentAllocationCandidate = {
  supplierPayment: {
    id: string;
    paidAt: Date;
    createdAt: Date;
    lines: Array<{
      paymentMethod: {
        name: string;
      };
    }>;
  };
};

const purchaseImmediateCashOutPrefix = (reference: string) =>
  `Compra ${reference} · `;

const parseImmediateCashOutNote = (note: string | null | undefined) => {
  if (!note) return null;
  const match = /^Compra\s+(.+?)\s+·\s+(.+)$/.exec(note.trim());
  if (!match) return null;
  const reference = match[1]?.trim();
  const methodName = match[2]?.trim();
  if (!reference || !methodName) return null;
  return { reference, methodName };
};

const toNumber = (value: unknown) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

const roundToTwo = (value: number) =>
  Math.round((value + Number.EPSILON) * 100) / 100;

const resolveImmediatePaymentMethodName = (input: {
  purchaseId: string;
  invoiceNumber: string | null;
  candidatesByPrefix: Map<string, ImmediateCashOutCandidate[]>;
}) => {
  const references = Array.from(
    new Set(
      [input.invoiceNumber?.trim(), input.purchaseId].filter(
        (reference): reference is string => Boolean(reference),
      ),
    ),
  );

  const matches: ImmediateCashOutCandidate[] = [];
  for (const reference of references) {
    const prefix = purchaseImmediateCashOutPrefix(reference);
    matches.push(...(input.candidatesByPrefix.get(prefix) ?? []));
  }

  if (!matches.length) return null;

  const latestOccurredAt = Math.max(
    ...matches.map((candidate) => candidate.occurredAt.getTime()),
  );
  const latestMethods = Array.from(
    new Set(
      matches
        .filter((candidate) => candidate.occurredAt.getTime() === latestOccurredAt)
        .map((candidate) => candidate.methodName.trim())
        .filter(Boolean),
    ),
  );

  if (!latestMethods.length) return null;
  if (latestMethods.length === 1) return latestMethods[0] ?? null;
  return `Pago mixto (${latestMethods.length})`;
};

const buildPaymentMethodLabel = (methodNames: string[]) => {
  const uniqueMethods = Array.from(
    new Set(methodNames.map((name) => name.trim()).filter(Boolean)),
  );
  if (!uniqueMethods.length) return null;
  if (uniqueMethods.length === 1) return uniqueMethods[0] ?? null;
  return `Pago mixto (${uniqueMethods.length})`;
};

const resolveSupplierAllocatedPaymentMethodName = (
  allocations: SupplierPaymentAllocationCandidate[],
) => {
  if (!allocations.length) return null;
  const latestByPayment = new Map<
    string,
    SupplierPaymentAllocationCandidate["supplierPayment"]
  >();

  for (const allocation of allocations) {
    const payment = allocation.supplierPayment;
    const current = latestByPayment.get(payment.id);
    if (!current) {
      latestByPayment.set(payment.id, payment);
      continue;
    }
    const currentTimestamp = Math.max(
      current.paidAt.getTime(),
      current.createdAt.getTime(),
    );
    const candidateTimestamp = Math.max(
      payment.paidAt.getTime(),
      payment.createdAt.getTime(),
    );
    if (candidateTimestamp >= currentTimestamp) {
      latestByPayment.set(payment.id, payment);
    }
  }

  const latestPayment = Array.from(latestByPayment.values()).sort((left, right) => {
    const leftTimestamp = Math.max(
      left.paidAt.getTime(),
      left.createdAt.getTime(),
    );
    const rightTimestamp = Math.max(
      right.paidAt.getTime(),
      right.createdAt.getTime(),
    );
    return rightTimestamp - leftTimestamp;
  })[0];

  if (!latestPayment) return null;
  return buildPaymentMethodLabel(
    latestPayment.lines.map((line) => line.paymentMethod.name),
  );
};

export async function GET(req: NextRequest) {
  try {
    const organizationId = await requireOrg(req);
    const purchases = await prisma.purchaseInvoice.findMany({
      where: { organizationId },
      include: {
        supplier: true,
        items: true,
        currentAccountEntries: {
          where: { sourceType: "PURCHASE" },
          select: { id: true },
          take: 1,
        },
        allocations: {
          where: {
            supplierPayment: {
              status: "CONFIRMED",
            },
          },
          include: {
            supplierPayment: {
              select: {
                id: true,
                paidAt: true,
                createdAt: true,
                lines: {
                  select: {
                    paymentMethod: {
                      select: {
                        name: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
        fiscalLines: true,
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    const immediateCashOutPrefixes = Array.from(
      new Set(
        purchases.flatMap((purchase) => {
          const references = [purchase.id];
          const trimmedInvoiceNumber = purchase.invoiceNumber?.trim();
          if (trimmedInvoiceNumber) {
            references.unshift(trimmedInvoiceNumber);
          }
          return references.map((reference) =>
            purchaseImmediateCashOutPrefix(reference),
          );
        }),
      ),
    );

    const immediateCashOutMovements = immediateCashOutPrefixes.length
      ? await prisma.accountMovement.findMany({
          where: {
            organizationId,
            direction: "OUT",
            OR: immediateCashOutPrefixes.map((prefix) => ({
              note: { startsWith: prefix },
            })),
          },
          select: {
            note: true,
            occurredAt: true,
            amount: true,
          },
          orderBy: { occurredAt: "desc" },
          take: 250,
        })
      : [];

    const immediateCashOutPrefixSet = new Set(immediateCashOutPrefixes);
    const immediateCashOutCandidatesByPrefix = new Map<
      string,
      ImmediateCashOutCandidate[]
    >();

    for (const movement of immediateCashOutMovements) {
      const parsed = parseImmediateCashOutNote(movement.note);
      if (!parsed) continue;
      const prefix = purchaseImmediateCashOutPrefix(parsed.reference);
      if (!immediateCashOutPrefixSet.has(prefix)) continue;

      const current = immediateCashOutCandidatesByPrefix.get(prefix) ?? [];
      current.push({
        methodName: parsed.methodName,
        occurredAt: movement.occurredAt,
        amount: toNumber(movement.amount),
      });
      immediateCashOutCandidatesByPrefix.set(prefix, current);
    }

    return NextResponse.json(
      purchases.map((purchase) => {
        const fiscalComputable = isPurchaseFiscalComputable({
          invoiceNumber: purchase.invoiceNumber,
          fiscalVoucherKind: purchase.fiscalVoucherKind,
          fiscalVoucherType: purchase.fiscalVoucherType,
          fiscalPointOfSale: purchase.fiscalPointOfSale,
          fiscalVoucherNumber: purchase.fiscalVoucherNumber,
        });
        const immediatePaymentMethodName = resolveImmediatePaymentMethodName({
          purchaseId: purchase.id,
          invoiceNumber: purchase.invoiceNumber ?? null,
          candidatesByPrefix: immediateCashOutCandidatesByPrefix,
        });
        const persistedImmediatePaymentLabel =
          purchase.immediatePaymentLabel?.trim() || null;
        const supplierAllocatedPaymentMethodName =
          resolveSupplierAllocatedPaymentMethodName(
            purchase.allocations as SupplierPaymentAllocationCandidate[],
          );
        const impactsAccount = purchase.currentAccountEntries.length > 0;
        const isCreditNote = purchase.documentType === "CREDIT_NOTE";
        const paymentMethodName = impactsAccount
          ? supplierAllocatedPaymentMethodName ?? immediatePaymentMethodName
          : immediatePaymentMethodName ?? persistedImmediatePaymentLabel;
        const totalAmount = toNumber(purchase.total);
        const storedPaidTotal = toNumber(purchase.paidTotal);
        const allocatedPaidTotal = (
          purchase.allocations as Array<{ amount: unknown }>
        ).reduce((sum, allocation) => sum + toNumber(allocation.amount), 0);
        const effectivePaidTotal = isCreditNote
          ? totalAmount
          : impactsAccount
            ? roundToTwo(allocatedPaidTotal)
            : roundToTwo(storedPaidTotal);
        const effectiveBalance = roundToTwo(
          Math.max(totalAmount - effectivePaidTotal, 0),
        );
        const effectivePaymentStatus =
          effectivePaidTotal <= 0
            ? "UNPAID"
            : effectiveBalance <= 0.005
              ? "PAID"
              : "PARTIAL";

        return {
          id: purchase.id,
          supplierId: purchase.supplierId,
          supplierName: purchase.supplier.displayName,
          documentType: purchase.documentType,
          linkedPurchaseInvoiceId: purchase.linkedPurchaseInvoiceId,
          invoiceNumber: purchase.invoiceNumber,
          invoiceDate: purchase.invoiceDate?.toISOString().slice(0, 10) ?? null,
          createdAt: purchase.createdAt.toISOString(),
          subtotal: purchase.subtotal?.toString() ?? null,
          taxes: purchase.taxes?.toString() ?? null,
          total: purchase.total?.toString() ?? null,
          fiscalVoucherKind: purchase.fiscalVoucherKind,
          fiscalVoucherType: purchase.fiscalVoucherType,
          fiscalPointOfSale: purchase.fiscalPointOfSale,
          fiscalVoucherNumber: purchase.fiscalVoucherNumber,
          authorizationMode: purchase.authorizationMode,
          authorizationCode: purchase.authorizationCode,
          currencyCode: purchase.currencyCode,
          netTaxed: purchase.netTaxed.toString(),
          netNonTaxed: purchase.netNonTaxed.toString(),
          exemptAmount: purchase.exemptAmount.toString(),
          vatTotal: purchase.vatTotal.toString(),
          otherTaxesTotal: purchase.otherTaxesTotal.toString(),
          discountType: purchase.discountType,
          discountBase: purchase.discountBase,
          discountValue: purchase.discountValue?.toString() ?? null,
          discountAmount: purchase.discountAmount.toString(),
          fiscalLines: purchase.fiscalLines.map((line) => ({
            id: line.id,
            type: line.type,
            jurisdiction: line.jurisdiction,
            baseAmount: line.baseAmount?.toString() ?? null,
            rate: line.rate?.toString() ?? null,
            amount: line.amount.toString(),
            note: line.note,
          })),
          paidTotal: effectivePaidTotal.toFixed(2),
          balance: effectiveBalance.toFixed(2),
          paymentStatus: effectivePaymentStatus,
          itemsCount: purchase.items.length,
          status: purchase.status,
          hasInvoice: fiscalComputable,
          fiscalComputable,
          fiscalRecordType: getPurchaseFiscalRecordType(fiscalComputable),
          impactsAccount,
          cashOutRegistered: Boolean(paymentMethodName),
          immediatePaymentMethodName: paymentMethodName,
          arcaValidationStatus: purchase.arcaValidationStatus,
          arcaValidationMessage: purchase.arcaValidationMessage ?? null,
          arcaValidationCheckedAt:
            purchase.arcaValidationCheckedAt?.toISOString() ?? null,
        };
      }),
    );
  } catch {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { membership } = await requireRole(req, [...WRITE_ROLES]);
    const organizationId = membership.organizationId;
    const body = purchaseSchema.parse(await req.json());

    const supplier = await prisma.supplier.findFirst({
      where: { id: body.supplierId, organizationId },
      select: { id: true, displayName: true, taxId: true },
    });

    if (!supplier) {
      return NextResponse.json(
        { error: "Proveedor no encontrado" },
        { status: 404 },
      );
    }

    const linkedPurchaseInvoiceId =
      body.documentType === "INVOICE"
        ? null
        : body.linkedPurchaseInvoiceId?.trim() || null;
    if (linkedPurchaseInvoiceId) {
      const linkedPurchase = await prisma.purchaseInvoice.findFirst({
        where: {
          id: linkedPurchaseInvoiceId,
          organizationId,
          supplierId: body.supplierId,
        },
        select: { id: true },
      });
      if (!linkedPurchase) {
        return NextResponse.json(
          { error: "La compra asociada no pertenece al proveedor seleccionado" },
          { status: 400 },
        );
      }
    }

    const hasInvoice =
      body.hasInvoice ??
      Boolean(body.invoiceNumber?.trim() || body.arcaValidation);
    const fiscalComputable = hasInvoice;
    const invoiceNumber = hasInvoice ? body.invoiceNumber?.trim() || undefined : undefined;
    const invoiceDateResult = parseOptionalDate(body.invoiceDate);
    if (invoiceDateResult.error) {
      return NextResponse.json(
        { error: "Fecha del comprobante invalida" },
        { status: 400 },
      );
    }
    const invoiceDate = invoiceDateResult.date ?? undefined;
    if (hasInvoice && !invoiceNumber) {
      return NextResponse.json(
        { error: "Ingresa numero de comprobante" },
        { status: 400 },
      );
    }
    if (hasInvoice && !INVOICE_NUMBER_PATTERN.test(invoiceNumber ?? "")) {
      return NextResponse.json(
        {
          error:
            "El numero de comprobante debe tener formato 0001-00001234 (con guion).",
        },
        { status: 400 },
      );
    }
    if (hasInvoice && !invoiceDate) {
      return NextResponse.json(
        { error: "Ingresa fecha del comprobante" },
        { status: 400 },
      );
    }

    const purchaseItems = (body.items ?? []).filter(
      (item) => Number(item.qty) > 0,
    );
    const purchaseItemsVatTotal = purchaseItems.reduce((sum, item) => {
      if (item.taxAmount !== undefined) {
        return sum + item.taxAmount;
      }
      const subtotal = item.lineSubtotal ?? item.qty * item.unitCost;
      return sum + subtotal * ((item.taxRate ?? 0) / 100);
    }, 0);

    const totalAmount = body.totalAmount;
    const purchaseVatAmount = body.purchaseVatAmount ?? purchaseItemsVatTotal;
    if (purchaseVatAmount > totalAmount) {
      return NextResponse.json(
        { error: "El IVA compra no puede superar el total" },
        { status: 400 },
      );
    }
    const fiscalTotals = buildPurchaseFiscalTotals({
      totalAmount,
      purchaseVatAmount,
      fiscalDetail: fiscalComputable ? (body.fiscalDetail ?? null) : null,
      discountAmount: body.globalDiscount?.amount ?? 0,
      currencyCode: body.currencyCode,
      fiscalComputable,
    });

    const impactCurrentAccount = body.impactCurrentAccount ?? false;
    const adjustStock = STOCK_ENABLED && (body.adjustStock ?? false);
    const registerCashOut =
      body.documentType === "CREDIT_NOTE" ? false : (body.registerCashOut ?? false);

    const stockAdjustments = (body.stockAdjustments ?? []).filter(
      (adjustment) => Number(adjustment.qty) !== 0,
    );

    if (adjustStock && purchaseItems.length === 0 && stockAdjustments.length === 0) {
      return NextResponse.json(
        { error: "Agrega productos para ingresar stock" },
        { status: 400 },
      );
    }

    const requestedCashOutLines = registerCashOut
      ? body.cashOutLines?.length
        ? body.cashOutLines
        : body.cashOutPaymentMethodId
          ? [
              {
                paymentMethodId: body.cashOutPaymentMethodId,
                accountId: body.cashOutAccountId,
                amount: totalAmount,
              },
            ]
          : []
      : [];

    const normalizedCashOutLines: Array<{
      paymentMethodId: string;
      paymentMethodName: string;
      accountId: string | null;
      currencyCode: string;
      amount: number;
    }> = [];

    if (registerCashOut) {
      if (!requestedCashOutLines.length) {
        return NextResponse.json(
          { error: "Agrega al menos una linea para registrar egreso" },
          { status: 400 },
        );
      }

      const paymentMethodIds = Array.from(
        new Set(requestedCashOutLines.map((line) => line.paymentMethodId)),
      );
      const methods = await prisma.paymentMethod.findMany({
        where: {
          organizationId,
          id: { in: paymentMethodIds },
          isActive: true,
        },
        select: {
          id: true,
          name: true,
          requiresAccount: true,
        },
      });
      if (methods.length !== paymentMethodIds.length) {
        return NextResponse.json(
          { error: "Metodo de pago invalido" },
          { status: 400 },
        );
      }
      const methodById = new Map(methods.map((method) => [method.id, method]));

      const accountIds = Array.from(
        new Set(
          requestedCashOutLines
            .map((line) => line.accountId)
            .filter((value): value is string => Boolean(value)),
        ),
      );
      const accounts = accountIds.length
        ? await prisma.financeAccount.findMany({
            where: {
              organizationId,
              id: { in: accountIds },
              isActive: true,
            },
            select: {
              id: true,
              currencyCode: true,
            },
          })
        : [];
      if (accounts.length !== accountIds.length) {
        return NextResponse.json({ error: "Cuenta invalida" }, { status: 400 });
      }
      const accountById = new Map(accounts.map((account) => [account.id, account]));

      let linesTotal = 0;
      for (const line of requestedCashOutLines) {
        const method = methodById.get(line.paymentMethodId);
        if (!method) {
          return NextResponse.json(
            { error: "Metodo de pago invalido" },
            { status: 400 },
          );
        }

        const accountId = line.accountId?.trim() || undefined;
        if (method.requiresAccount && !accountId) {
          return NextResponse.json(
            { error: "Selecciona cuenta para cada linea de pago" },
            { status: 400 },
          );
        }

        const account = accountId ? accountById.get(accountId) : null;
        if (accountId) {
          if (!account) {
            return NextResponse.json({ error: "Cuenta invalida" }, { status: 400 });
          }
          if (account.currencyCode !== "ARS") {
            return NextResponse.json(
              { error: "Por ahora el egreso inmediato solo admite cuentas en ARS" },
              { status: 400 },
            );
          }
        }

        const amount = Number(line.amount ?? 0);
        if (!Number.isFinite(amount) || amount <= 0) {
          return NextResponse.json(
            { error: "Importe invalido en lineas de pago" },
            { status: 400 },
          );
        }

        linesTotal += amount;
        normalizedCashOutLines.push({
          paymentMethodId: method.id,
          paymentMethodName: method.name,
          accountId: accountId ?? null,
          currencyCode: account?.currencyCode ?? "ARS",
          amount,
        });
      }

      if (Math.abs(linesTotal - totalAmount) > 0.01) {
        return NextResponse.json(
          { error: "La suma de lineas no coincide con el total de la compra" },
          { status: 400 },
        );
      }
    }

    const immediatePaymentLabel = registerCashOut
      ? buildPaymentMethodLabel(
          normalizedCashOutLines.map((line) => line.paymentMethodName),
        )
      : null;
    const isCreditNote = body.documentType === "CREDIT_NOTE";
    const purchaseEntryDirection = isCreditNote ? "DEBIT" : "CREDIT";
    const leavesPayableBalance = impactCurrentAccount && !isCreditNote;

    const productIds = Array.from(
      new Set([
        ...purchaseItems.map((item) => item.productId),
        ...(adjustStock
          ? stockAdjustments.map((adjustment) => adjustment.productId)
          : []),
      ]),
    );

    if (productIds.length) {
      const products = await prisma.product.findMany({
        where: { organizationId, id: { in: productIds } },
        select: { id: true },
      });
      if (products.length !== productIds.length) {
        return NextResponse.json(
          { error: "Hay productos invalidos en la compra" },
          { status: 400 },
        );
      }
    }

    let arcaValidationPayload: PurchaseValidationPayload | null = null;
    if (body.arcaValidation && hasInvoice) {

      const fiscalConfig = await prisma.organizationFiscalConfig.findUnique({
        where: { organizationId },
        select: {
          taxIdRepresentado: true,
          defaultPointOfSale: true,
        },
      });

      arcaValidationPayload = buildPurchaseValidationPayload(
        { ...body.arcaValidation, documentType: body.documentType },
        {
          issuerTaxId: supplier.taxId,
          pointOfSale: fiscalConfig?.defaultPointOfSale ?? null,
          receiverDocType: fiscalConfig?.taxIdRepresentado ? "80" : null,
          receiverDocNumber: fiscalConfig?.taxIdRepresentado ?? null,
        },
      );

      assertPurchaseVoucherVatRules({
        voucherKind: mapVoucherTypeToPurchaseKind(arcaValidationPayload.voucherType),
        vatTotal: fiscalTotals.vatTotal,
      });
    }

    const purchase = await prisma.$transaction(async (tx) => {
      const purchaseInvoice = await tx.purchaseInvoice.create({
        data: {
          organizationId,
          supplierId: body.supplierId,
          documentType: body.documentType,
          linkedPurchaseInvoiceId,
          status: "CONFIRMED",
          paymentStatus: leavesPayableBalance ? "UNPAID" : "PAID",
          invoiceNumber,
          invoiceDate,
          subtotal: fiscalTotals.subtotal.toFixed(2),
          taxes: fiscalTotals.taxes.toFixed(2),
          total: fiscalTotals.total.toFixed(2),
          fiscalVoucherKind: fiscalComputable
            ? arcaValidationPayload
              ? mapVoucherTypeToPurchaseKind(arcaValidationPayload.voucherType)
              : undefined
            : null,
          fiscalVoucherType: fiscalComputable
            ? arcaValidationPayload?.voucherType
            : null,
          fiscalPointOfSale: fiscalComputable
            ? arcaValidationPayload?.pointOfSale
            : null,
          fiscalVoucherNumber: fiscalComputable
            ? arcaValidationPayload?.voucherNumber
            : null,
          authorizationMode: fiscalComputable
            ? arcaValidationPayload?.mode
            : null,
          authorizationCode: fiscalComputable
            ? arcaValidationPayload?.authorizationCode
            : null,
          currencyCode: fiscalTotals.currencyCode,
          netTaxed: fiscalTotals.netTaxed.toFixed(2),
          netNonTaxed: fiscalTotals.netNonTaxed.toFixed(2),
          exemptAmount: fiscalTotals.exemptAmount.toFixed(2),
          vatTotal: fiscalTotals.vatTotal.toFixed(2),
          otherTaxesTotal: fiscalTotals.otherTaxesTotal.toFixed(2),
          discountType: body.globalDiscount?.type,
          discountBase: body.globalDiscount?.base,
          discountValue:
            body.globalDiscount && body.globalDiscount.amount > 0
              ? body.globalDiscount.value.toFixed(4)
              : undefined,
          discountAmount: fiscalTotals.discountAmount.toFixed(2),
          arcaValidationMessage: fiscalComputable
            ? null
            : "Registro interno no computable fiscalmente. Sin comprobante fiscal.",
          paidTotal: leavesPayableBalance ? "0.00" : totalAmount.toFixed(2),
          balance: leavesPayableBalance ? totalAmount.toFixed(2) : "0.00",
          immediatePaymentLabel: impactCurrentAccount ? null : immediatePaymentLabel,
          items: purchaseItems.length
            ? {
                create: purchaseItems.map((item) => {
                  const itemSubtotal = item.lineSubtotal ?? item.qty * item.unitCost;
                  const itemTaxRate = item.taxRate ?? 0;
                  const itemTaxAmount =
                    item.taxAmount ?? itemSubtotal * (itemTaxRate / 100);
                  return {
                    productId: item.productId,
                    qty: item.qty.toFixed(3),
                    unitCost: item.unitCost.toFixed(2),
                    total: itemSubtotal.toFixed(2),
                    taxRate: itemTaxRate.toFixed(2),
                    taxAmount: itemTaxAmount.toFixed(2),
                    discountType: item.discountType,
                    discountBase: item.discountBase,
                    discountValue:
                      item.discountValue !== undefined
                        ? item.discountValue.toFixed(4)
                        : undefined,
                    discountAmount: (item.discountAmount ?? 0).toFixed(2),
                  };
                }),
              }
            : undefined,
          fiscalLines: fiscalTotals.lines.length
            ? {
                create: fiscalTotals.lines.map((line) => ({
                  type: line.type,
                  jurisdiction: line.jurisdiction,
                  baseAmount:
                    line.baseAmount === null
                      ? undefined
                      : line.baseAmount.toFixed(2),
                  rate:
                    line.rate === null ? undefined : line.rate.toFixed(4),
                  amount: line.amount.toFixed(2),
                  note: line.note,
                })),
              }
            : undefined,
        },
        include: { supplier: true, items: true, fiscalLines: true },
      });

      if (purchaseItems.length) {
        const latestCostsByProductId = new Map<string, number>();
        for (const item of purchaseItems) {
          latestCostsByProductId.set(item.productId, item.unitCost);
        }

        await Promise.all(
          Array.from(latestCostsByProductId.entries()).map(
            ([productId, unitCost]) =>
              tx.product.updateMany({
                where: { id: productId, organizationId },
                data: { cost: unitCost.toFixed(2) },
              }),
          ),
        );
      }

      if (impactCurrentAccount) {
        await tx.currentAccountEntry.create({
          data: {
            organizationId,
            counterpartyType: "SUPPLIER",
            supplierId: body.supplierId,
            direction: purchaseEntryDirection,
            sourceType: "PURCHASE",
            purchaseInvoiceId: purchaseInvoice.id,
            amount: totalAmount.toFixed(2),
            occurredAt: invoiceDate ?? new Date(),
            note: `${formatPurchaseDocumentTypeLabel(body.documentType)} ${
              purchaseInvoice.invoiceNumber ?? purchaseInvoice.id
            }`,
          },
        });
      }

      if (adjustStock && purchaseInvoice.items.length) {
        const stockMovements = buildPurchaseInMovements({
          organizationId,
          occurredAt: invoiceDate ?? new Date(),
          note: `Ingreso por compra ${purchaseInvoice.invoiceNumber ?? purchaseInvoice.id}`,
          items: purchaseInvoice.items.map((item) => ({
            id: item.id,
            productId: item.productId,
            qty: Number(item.qty),
          })),
        });
        if (stockMovements.length) {
          await tx.stockMovement.createMany({ data: stockMovements });
        }
      } else if (adjustStock && stockAdjustments.length) {
        await tx.stockMovement.createMany({
          data: stockAdjustments.map((adjustment) => ({
            organizationId,
            productId: adjustment.productId,
            type: adjustment.qty > 0 ? "IN" : "OUT",
            qty: Math.abs(adjustment.qty).toFixed(3),
            occurredAt: invoiceDate ?? new Date(),
            note: `Ajuste por compra ${purchaseInvoice.invoiceNumber ?? purchaseInvoice.id}`,
          })),
        });
      }

      if (registerCashOut && normalizedCashOutLines.length) {
        for (const line of normalizedCashOutLines) {
          if (!line.accountId) continue;
          await tx.accountMovement.create({
            data: {
              organizationId,
              accountId: line.accountId,
              occurredAt: invoiceDate ?? new Date(),
              direction: "OUT",
              amount: line.amount.toFixed(2),
              currencyCode: line.currencyCode,
              note: `Compra ${purchaseInvoice.id} · ${line.paymentMethodName}`,
            },
          });
        }
      }

      return purchaseInvoice;
    });

    let arcaValidation = null;
    if (arcaValidationPayload) {
      arcaValidation = await validatePurchaseVoucher({
        organizationId,
        actorUserId: membership.userId,
        purchaseInvoiceId: purchase.id,
        payload: arcaValidationPayload,
      });
    } else if (hasInvoice && body.validateWithArca) {
      await prisma.purchaseInvoice.update({
        where: { id: purchase.id },
        data: {
          arcaValidationStatus: "PENDING",
          arcaValidationMessage:
            "Validacion ARCA pendiente: faltan datos del comprobante.",
        },
      });
    }

    return NextResponse.json({
      id: purchase.id,
      supplierId: purchase.supplierId,
      supplierName: purchase.supplier.displayName,
      documentType: purchase.documentType,
      linkedPurchaseInvoiceId: purchase.linkedPurchaseInvoiceId,
      invoiceNumber: purchase.invoiceNumber,
      invoiceDate: purchase.invoiceDate?.toISOString().slice(0, 10) ?? null,
      createdAt: purchase.createdAt.toISOString(),
      subtotal: purchase.subtotal?.toString() ?? null,
      taxes: purchase.taxes?.toString() ?? null,
      total: purchase.total?.toString() ?? null,
      fiscalVoucherKind: purchase.fiscalVoucherKind,
      fiscalVoucherType: purchase.fiscalVoucherType,
      fiscalPointOfSale: purchase.fiscalPointOfSale,
      fiscalVoucherNumber: purchase.fiscalVoucherNumber,
      authorizationMode: purchase.authorizationMode,
      authorizationCode: purchase.authorizationCode,
      currencyCode: purchase.currencyCode,
      netTaxed: purchase.netTaxed.toString(),
      netNonTaxed: purchase.netNonTaxed.toString(),
      exemptAmount: purchase.exemptAmount.toString(),
      vatTotal: purchase.vatTotal.toString(),
      otherTaxesTotal: purchase.otherTaxesTotal.toString(),
      discountType: purchase.discountType,
      discountBase: purchase.discountBase,
      discountValue: purchase.discountValue?.toString() ?? null,
      discountAmount: purchase.discountAmount.toString(),
      fiscalLines: purchase.fiscalLines.map((line) => ({
        id: line.id,
        type: line.type,
        jurisdiction: line.jurisdiction,
        baseAmount: line.baseAmount?.toString() ?? null,
        rate: line.rate?.toString() ?? null,
        amount: line.amount.toString(),
        note: line.note,
      })),
      paidTotal: purchase.paidTotal?.toString() ?? "0",
      balance: purchase.balance?.toString() ?? "0",
      paymentStatus: purchase.paymentStatus,
      itemsCount: purchase.items.length,
      status: purchase.status,
      hasInvoice: fiscalComputable,
      fiscalComputable,
      fiscalRecordType: getPurchaseFiscalRecordType(fiscalComputable),
      impactsAccount: impactCurrentAccount,
      adjustedStock: adjustStock,
      cashOutRegistered: Boolean(registerCashOut && normalizedCashOutLines.length),
      immediatePaymentMethodName: immediatePaymentLabel,
      arcaValidationStatus:
        arcaValidation?.status ?? purchase.arcaValidationStatus,
      arcaValidationMessage:
        arcaValidation?.message ?? purchase.arcaValidationMessage ?? null,
      arcaValidationCheckedAt:
        arcaValidation?.checkedAt ??
        purchase.arcaValidationCheckedAt?.toISOString() ??
        null,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Datos invalidos" }, { status: 400 });
    }
    if (isAuthError(error)) {
      return NextResponse.json(
        { error: "No autorizado" },
        { status: authErrorStatus(error) },
      );
    }
    if (
      error instanceof Error &&
      error.message.startsWith("PURCHASE_FISCAL_")
    ) {
      const fiscalErrors: Record<string, string> = {
        PURCHASE_FISCAL_VAT_EXCEEDS_TOTAL:
          "El IVA compra no puede superar el total",
        PURCHASE_FISCAL_TOTAL_MISMATCH:
          "El detalle fiscal no coincide con el total de la compra",
        PURCHASE_FISCAL_DISCOUNT_INVALID: "Descuento global invalido",
        PURCHASE_FISCAL_VAT_NOT_ALLOWED_FOR_VOUCHER_C:
          "Factura C: no genera credito fiscal de IVA",
      };
      return NextResponse.json(
        { error: fiscalErrors[error.message] ?? "Detalle fiscal invalido" },
        { status: 400 },
      );
    }
    const mapped = mapArcaValidationError(error);
    if (mapped.code !== "ARCA_VALIDATION_ERROR") {
      return NextResponse.json(mapped, { status: 400 });
    }
    logServerError("api.purchases.post", error);
    return NextResponse.json({ error: "No se pudo crear" }, { status: 400 });
  }
}
