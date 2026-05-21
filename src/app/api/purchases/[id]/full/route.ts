import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth/tenant";
import { WRITE_ROLES } from "@/lib/auth/rbac";
import { parseOptionalDate } from "@/lib/validation";
import { recalcPurchaseTotals } from "@/lib/purchases";
import { authErrorStatus, isAuthError } from "@/lib/auth/errors";
import { logServerError } from "@/lib/server/log";
import {
  buildPurchaseValidationPayload,
  type PurchaseValidationPayload,
  purchaseValidationInputSchema,
} from "@/lib/arca/purchase-validation";
import { mapArcaValidationError } from "@/lib/arca/validation-errors";
import {
  assertPurchaseVoucherVatRules,
  buildPurchaseFiscalTotals,
  mapVoucherTypeToPurchaseKind,
  purchaseFiscalInputSchema,
} from "@/lib/purchases/fiscal";

export const runtime = "nodejs";

const purchaseItemSchema = z.object({
  productId: z.string().min(1),
  qty: z.coerce.number().positive(),
  unitCost: z.coerce.number().min(0),
  taxRate: z.coerce.number().min(0).max(100).optional(),
});

const updatePurchaseSchema = z.object({
  supplierId: z.string().min(1),
  hasInvoice: z.boolean().optional(),
  invoiceNumber: z.string().min(1).optional(),
  invoiceDate: z.string().min(1).optional(),
  totalAmount: z.coerce.number().positive(),
  purchaseVatAmount: z.coerce.number().min(0).optional(),
  currencyCode: z.string().min(1).optional(),
  fiscalDetail: purchaseFiscalInputSchema.nullish(),
  items: z.array(purchaseItemSchema).optional(),
  arcaValidation: purchaseValidationInputSchema.optional(),
});

const INVOICE_NUMBER_PATTERN = /^(\d{1,5})-(\d{1,12})$/;

const toAmount = (value: unknown) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

const toNullableJsonInput = (
  value: unknown,
): Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput => {
  if (value == null) {
    return Prisma.DbNull;
  }
  return value as Prisma.InputJsonValue;
};

const normalizeItemSnapshot = (input: {
  productId: string;
  qty: number;
  unitCost: number;
  taxRate: number;
}) =>
  `${input.productId}:${input.qty.toFixed(3)}:${input.unitCost.toFixed(2)}:${input.taxRate.toFixed(2)}`;

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { membership } = await requireRole(req, [...WRITE_ROLES]);
    const params = await context.params;
    const body = updatePurchaseSchema.parse(await req.json());

    const purchase = await prisma.purchaseInvoice.findFirst({
      where: {
        id: params.id,
        organizationId: membership.organizationId,
      },
      select: {
        id: true,
        status: true,
        supplierId: true,
        invoiceNumber: true,
        invoiceDate: true,
        total: true,
        paymentStatus: true,
        currentAccountEntries: {
          where: {
            sourceType: "PURCHASE",
          },
          select: {
            id: true,
          },
          take: 1,
        },
        items: {
          select: {
            productId: true,
            qty: true,
            unitCost: true,
            taxRate: true,
            stockMovement: {
              select: {
                id: true,
              },
            },
          },
        },
        allocations: {
          where: {
            supplierPayment: {
              status: "CONFIRMED",
            },
          },
          select: {
            amount: true,
          },
        },
      },
    });

    if (!purchase) {
      return NextResponse.json({ error: "Compra no encontrada" }, { status: 404 });
    }

    if (purchase.status === "CANCELLED") {
      return NextResponse.json(
        { error: "No se puede editar una compra cancelada" },
        { status: 409 },
      );
    }

    const supplier = await prisma.supplier.findFirst({
      where: {
        id: body.supplierId,
        organizationId: membership.organizationId,
      },
      select: {
        id: true,
        taxId: true,
      },
    });
    if (!supplier) {
      return NextResponse.json(
        { error: "Proveedor no encontrado" },
        { status: 404 },
      );
    }

    const hasInvoice =
      body.hasInvoice ?? Boolean(body.invoiceNumber?.trim() || body.arcaValidation);
    const fiscalComputable = hasInvoice;
    const invoiceNumber = hasInvoice ? body.invoiceNumber?.trim() || null : null;
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

    const invoiceDateResult = parseOptionalDate(body.invoiceDate);
    if (invoiceDateResult.error) {
      return NextResponse.json(
        { error: "Fecha del comprobante invalida" },
        { status: 400 },
      );
    }
    const invoiceDate = hasInvoice ? (invoiceDateResult.date ?? null) : null;
    if (hasInvoice && !invoiceDate) {
      return NextResponse.json(
        { error: "Ingresa fecha del comprobante" },
        { status: 400 },
      );
    }

    const purchaseItems = (body.items ?? []).filter((item) => Number(item.qty) > 0);
    if (purchaseItems.length) {
      const productIds = Array.from(new Set(purchaseItems.map((item) => item.productId)));
      const products = await prisma.product.findMany({
        where: {
          organizationId: membership.organizationId,
          id: { in: productIds },
        },
        select: { id: true },
      });
      if (products.length !== productIds.length) {
        return NextResponse.json(
          { error: "Hay productos invalidos en la compra" },
          { status: 400 },
        );
      }
    }
    const purchaseItemsVatTotal = purchaseItems.reduce((sum, item) => {
      const subtotal = item.qty * item.unitCost;
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
      currencyCode: body.currencyCode,
      fiscalComputable,
    });

    const allocatedTotal = purchase.allocations.reduce(
      (sum, allocation) => sum + toAmount(allocation.amount),
      0,
    );
    if (allocatedTotal - totalAmount > 0.005) {
      return NextResponse.json(
        {
          error:
            "El total nuevo es menor que los pagos ya aplicados a esta compra.",
        },
        { status: 409 },
      );
    }

    if (purchase.supplierId !== body.supplierId && allocatedTotal > 0.005) {
      return NextResponse.json(
        {
          error:
            "No se puede cambiar el proveedor porque la compra ya tiene pagos aplicados.",
        },
        { status: 409 },
      );
    }

    const hasStockMovements = purchase.items.some((item) =>
      Boolean(item.stockMovement),
    );
    if (hasStockMovements) {
      const currentSnapshot = purchase.items
        .map((item) =>
          normalizeItemSnapshot({
            productId: item.productId,
            qty: toAmount(item.qty),
            unitCost: toAmount(item.unitCost),
            taxRate: toAmount(item.taxRate),
          }),
        )
        .sort();
      const nextSnapshot = purchaseItems
        .map((item) =>
          normalizeItemSnapshot({
            productId: item.productId,
            qty: item.qty,
            unitCost: item.unitCost,
            taxRate: item.taxRate ?? 0,
          }),
        )
        .sort();
      if (currentSnapshot.join("|") !== nextSnapshot.join("|")) {
        return NextResponse.json(
          {
            error:
              "Esta compra ya impacto stock. Para cambiar productos/cantidades, ajusta stock primero.",
          },
          { status: 409 },
        );
      }
    }

    let arcaValidationPayload: PurchaseValidationPayload | null = null;
    if (body.arcaValidation && hasInvoice) {

      const fiscalConfig = await prisma.organizationFiscalConfig.findUnique({
        where: { organizationId: membership.organizationId },
        select: {
          taxIdRepresentado: true,
          defaultPointOfSale: true,
        },
      });

      arcaValidationPayload = buildPurchaseValidationPayload(body.arcaValidation, {
        issuerTaxId: supplier.taxId,
        pointOfSale: fiscalConfig?.defaultPointOfSale ?? null,
        receiverDocType: fiscalConfig?.taxIdRepresentado ? "80" : null,
        receiverDocNumber: fiscalConfig?.taxIdRepresentado ?? null,
      });

      assertPurchaseVoucherVatRules({
        voucherKind: mapVoucherTypeToPurchaseKind(arcaValidationPayload.voucherType),
        vatTotal: fiscalTotals.vatTotal,
      });
    }

    const hasCurrentAccountImpact = purchase.currentAccountEntries.length > 0;

    await prisma.$transaction(async (tx) => {
      await tx.purchaseInvoice.update({
        where: { id: purchase.id },
        data: {
          supplierId: body.supplierId,
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
            ? arcaValidationPayload?.authorizationCode ?? null
            : null,
          currencyCode: fiscalTotals.currencyCode,
          netTaxed: fiscalTotals.netTaxed.toFixed(2),
          netNonTaxed: fiscalTotals.netNonTaxed.toFixed(2),
          exemptAmount: fiscalTotals.exemptAmount.toFixed(2),
          vatTotal: fiscalTotals.vatTotal.toFixed(2),
          otherTaxesTotal: fiscalTotals.otherTaxesTotal.toFixed(2),
          arcaValidationStatus: "PENDING",
          arcaValidationCheckedAt: null,
          arcaValidationMessage: fiscalComputable
            ? arcaValidationPayload
              ? "Compra editada. Revalida para confirmar en ARCA."
              : "Compra editada. Completa validacion ARCA."
            : "Registro interno no computable fiscalmente. Sin comprobante fiscal.",
          arcaValidationRequest: fiscalComputable
            ? toNullableJsonInput(arcaValidationPayload)
            : Prisma.DbNull,
          arcaValidationResponse: Prisma.DbNull,
        },
      });

      await tx.purchaseFiscalLine.deleteMany({
        where: {
          purchaseInvoiceId: purchase.id,
        },
      });

      if (fiscalTotals.lines.length) {
        await tx.purchaseFiscalLine.createMany({
          data: fiscalTotals.lines.map((line) => ({
            purchaseInvoiceId: purchase.id,
            type: line.type,
            jurisdiction: line.jurisdiction,
            baseAmount:
              line.baseAmount === null ? null : line.baseAmount.toFixed(2),
            rate: line.rate === null ? null : line.rate.toFixed(4),
            amount: line.amount.toFixed(2),
            note: line.note,
          })),
        });
      }

      await tx.purchaseItem.deleteMany({
        where: {
          purchaseInvoiceId: purchase.id,
        },
      });

      if (purchaseItems.length) {
        await tx.purchaseItem.createMany({
          data: purchaseItems.map((item) => {
            const itemSubtotal = item.qty * item.unitCost;
            const itemTaxRate = item.taxRate ?? 0;
            return {
              purchaseInvoiceId: purchase.id,
              productId: item.productId,
              qty: item.qty.toFixed(3),
              unitCost: item.unitCost.toFixed(2),
              total: itemSubtotal.toFixed(2),
              taxRate: itemTaxRate.toFixed(2),
              taxAmount: (itemSubtotal * (itemTaxRate / 100)).toFixed(2),
            };
          }),
        });

        const latestCostsByProductId = new Map<string, number>();
        for (const item of purchaseItems) {
          latestCostsByProductId.set(item.productId, item.unitCost);
        }
        await Promise.all(
          Array.from(latestCostsByProductId.entries()).map(
            ([productId, unitCost]) =>
              tx.product.updateMany({
                where: {
                  id: productId,
                  organizationId: membership.organizationId,
                },
                data: {
                  cost: unitCost.toFixed(2),
                },
              }),
          ),
        );
      }

      if (hasCurrentAccountImpact) {
        await tx.currentAccountEntry.updateMany({
          where: {
            organizationId: membership.organizationId,
            purchaseInvoiceId: purchase.id,
            sourceType: "PURCHASE",
          },
          data: {
            supplierId: body.supplierId,
            amount: totalAmount.toFixed(2),
            occurredAt: invoiceDate ?? new Date(),
            note: `Compra ${invoiceNumber ?? purchase.id}`,
          },
        });
        if (allocatedTotal > 0.005) {
          await recalcPurchaseTotals(tx, purchase.id);
        } else {
          await tx.purchaseInvoice.update({
            where: { id: purchase.id },
            data: {
              paidTotal: "0.00",
              balance: totalAmount.toFixed(2),
              paymentStatus: "UNPAID",
            },
          });
        }
      } else if (allocatedTotal > 0.005) {
        await recalcPurchaseTotals(tx, purchase.id);
      } else {
        await tx.purchaseInvoice.update({
          where: { id: purchase.id },
          data: {
            paidTotal: totalAmount.toFixed(2),
            balance: "0.00",
            paymentStatus: "PAID",
          },
        });
      }
    });

    return NextResponse.json({
      message: "Compra actualizada",
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
    if (error instanceof Error && error.message.startsWith("PURCHASE_FISCAL_")) {
      const fiscalErrors: Record<string, string> = {
        PURCHASE_FISCAL_VAT_EXCEEDS_TOTAL:
          "El IVA compra no puede superar el total",
        PURCHASE_FISCAL_TOTAL_MISMATCH:
          "El detalle fiscal no coincide con el total de la compra",
        PURCHASE_FISCAL_VAT_NOT_ALLOWED_FOR_VOUCHER_C:
          "Factura C: no genera credito fiscal de IVA",
      };
      return NextResponse.json(
        { error: fiscalErrors[error.message] ?? "Detalle fiscal invalido" },
        { status: 400 },
      );
    }
    const mapped = mapArcaValidationError(error);
    logServerError("api.purchases.id.full.patch", error);
    return NextResponse.json(
      { error: mapped.error ?? "No se pudo actualizar la compra" },
      { status: 400 },
    );
  }
}
