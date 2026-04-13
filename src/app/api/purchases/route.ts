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

const stockAdjustmentSchema = z.object({
  productId: z.string().min(1),
  qty: z.coerce.number().refine((value) => value !== 0, {
    message: "Cantidad invalida",
  }),
});

const purchaseSchema = z.object({
  supplierId: z.string().min(1),
  invoiceNumber: z.string().min(1).optional(),
  invoiceDate: z.string().min(1).optional(),
  totalAmount: z.coerce.number().positive(),
  purchaseVatAmount: z.coerce.number().min(0).optional(),
  impactCurrentAccount: z.boolean().optional(),
  hasInvoice: z.boolean().optional(),
  validateWithArca: z.boolean().optional(),
  arcaValidation: purchaseValidationInputSchema.optional(),
  adjustStock: z.boolean().optional(),
  stockAdjustments: z.array(stockAdjustmentSchema).optional(),
  registerCashOut: z.boolean().optional(),
  cashOutAccountId: z.string().min(1).optional(),
});

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
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    return NextResponse.json(
      purchases.map((purchase) => ({
        id: purchase.id,
        supplierId: purchase.supplierId,
        supplierName: purchase.supplier.displayName,
        invoiceNumber: purchase.invoiceNumber,
        invoiceDate: purchase.invoiceDate?.toISOString() ?? null,
        createdAt: purchase.createdAt.toISOString(),
        subtotal: purchase.subtotal?.toString() ?? null,
        taxes: purchase.taxes?.toString() ?? null,
        total: purchase.total?.toString() ?? null,
        paidTotal: purchase.paidTotal?.toString() ?? "0",
        balance: purchase.balance?.toString() ?? "0",
        paymentStatus: purchase.paymentStatus,
        itemsCount: purchase.items.length,
        status: purchase.status,
        hasInvoice: Boolean(purchase.invoiceNumber),
        impactsAccount: purchase.currentAccountEntries.length > 0,
        arcaValidationStatus: purchase.arcaValidationStatus,
        arcaValidationMessage: purchase.arcaValidationMessage ?? null,
        arcaValidationCheckedAt:
          purchase.arcaValidationCheckedAt?.toISOString() ?? null,
      })),
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

    const hasInvoice =
      body.hasInvoice ??
      Boolean(body.invoiceNumber?.trim() || body.arcaValidation);
    const invoiceNumber = hasInvoice ? body.invoiceNumber?.trim() || undefined : undefined;
    const invoiceDateResult = parseOptionalDate(body.invoiceDate);
    if (invoiceDateResult.error) {
      return NextResponse.json(
        { error: "Fecha de factura invalida" },
        { status: 400 },
      );
    }
    const invoiceDate = invoiceDateResult.date ?? undefined;

    const totalAmount = body.totalAmount;
    const purchaseVatAmount = body.purchaseVatAmount ?? 0;
    if (purchaseVatAmount > totalAmount) {
      return NextResponse.json(
        { error: "El IVA compra no puede superar el total" },
        { status: 400 },
      );
    }
    const subtotalAmount = totalAmount - purchaseVatAmount;

    const impactCurrentAccount = body.impactCurrentAccount ?? false;
    const adjustStock = STOCK_ENABLED && (body.adjustStock ?? false);
    const registerCashOut = body.registerCashOut ?? false;

    const stockAdjustments = (body.stockAdjustments ?? []).filter(
      (adjustment) => Number(adjustment.qty) !== 0,
    );

    if (adjustStock && stockAdjustments.length === 0) {
      return NextResponse.json(
        { error: "Agrega items para ajustar stock" },
        { status: 400 },
      );
    }

    if (body.validateWithArca && !hasInvoice) {
      return NextResponse.json(
        { error: "No se puede validar ARCA sin comprobante" },
        { status: 400 },
      );
    }

    let cashOutAccount:
      | {
          id: string;
          name: string;
          currencyCode: string;
        }
      | null = null;

    if (registerCashOut) {
      if (!body.cashOutAccountId) {
        return NextResponse.json(
          { error: "Selecciona una cuenta para registrar egreso" },
          { status: 400 },
        );
      }

      cashOutAccount = await prisma.financeAccount.findFirst({
        where: {
          id: body.cashOutAccountId,
          organizationId,
          isActive: true,
        },
        select: {
          id: true,
          name: true,
          currencyCode: true,
        },
      });

      if (!cashOutAccount) {
        return NextResponse.json(
          { error: "Cuenta invalida" },
          { status: 400 },
        );
      }

      if (cashOutAccount.currencyCode !== "ARS") {
        return NextResponse.json(
          { error: "Por ahora el egreso inmediato solo admite cuentas en ARS" },
          { status: 400 },
        );
      }
    }

    if (adjustStock) {
      const productIds = Array.from(
        new Set(stockAdjustments.map((adjustment) => adjustment.productId)),
      );
      const products = await prisma.product.findMany({
        where: { organizationId, id: { in: productIds } },
        select: { id: true },
      });
      if (products.length !== productIds.length) {
        return NextResponse.json(
          { error: "Hay productos invalidos en el ajuste de stock" },
          { status: 400 },
        );
      }
    }

    let arcaValidationPayload: PurchaseValidationPayload | null = null;
    if (body.arcaValidation) {
      if (!hasInvoice) {
        return NextResponse.json(
          { error: "Activa 'Tiene factura' para validar ARCA" },
          { status: 400 },
        );
      }

      const fiscalConfig = await prisma.organizationFiscalConfig.findUnique({
        where: { organizationId },
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
    }

    const purchase = await prisma.$transaction(async (tx) => {
      const purchaseInvoice = await tx.purchaseInvoice.create({
        data: {
          organizationId,
          supplierId: body.supplierId,
          status: "CONFIRMED",
          paymentStatus: impactCurrentAccount ? "UNPAID" : "PAID",
          invoiceNumber,
          invoiceDate,
          subtotal: subtotalAmount.toFixed(2),
          taxes: purchaseVatAmount ? purchaseVatAmount.toFixed(2) : undefined,
          total: totalAmount.toFixed(2),
          paidTotal: impactCurrentAccount ? "0.00" : totalAmount.toFixed(2),
          balance: impactCurrentAccount ? totalAmount.toFixed(2) : "0.00",
        },
        include: { supplier: true, items: true },
      });

      if (impactCurrentAccount) {
        await tx.currentAccountEntry.create({
          data: {
            organizationId,
            counterpartyType: "SUPPLIER",
            supplierId: body.supplierId,
            direction: "CREDIT",
            sourceType: "PURCHASE",
            purchaseInvoiceId: purchaseInvoice.id,
            amount: totalAmount.toFixed(2),
            occurredAt: invoiceDate ?? new Date(),
            note: `Compra ${purchaseInvoice.invoiceNumber ?? purchaseInvoice.id}`,
          },
        });
      }

      if (adjustStock && stockAdjustments.length) {
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

      if (registerCashOut && cashOutAccount) {
        await tx.accountMovement.create({
          data: {
            organizationId,
            accountId: cashOutAccount.id,
            occurredAt: invoiceDate ?? new Date(),
            direction: "OUT",
            amount: totalAmount.toFixed(2),
            currencyCode: cashOutAccount.currencyCode,
            note: `Compra ${purchaseInvoice.invoiceNumber ?? purchaseInvoice.id}`,
          },
        });
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
    } else if (body.validateWithArca && hasInvoice) {
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
      invoiceNumber: purchase.invoiceNumber,
      invoiceDate: purchase.invoiceDate?.toISOString() ?? null,
      createdAt: purchase.createdAt.toISOString(),
      subtotal: purchase.subtotal?.toString() ?? null,
      taxes: purchase.taxes?.toString() ?? null,
      total: purchase.total?.toString() ?? null,
      paidTotal: purchase.paidTotal?.toString() ?? "0",
      balance: purchase.balance?.toString() ?? "0",
      paymentStatus: purchase.paymentStatus,
      itemsCount: purchase.items.length,
      status: purchase.status,
      hasInvoice,
      impactsAccount: impactCurrentAccount,
      adjustedStock: false,
      cashOutRegistered: Boolean(registerCashOut && cashOutAccount),
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
    const mapped = mapArcaValidationError(error);
    if (mapped.code !== "ARCA_VALIDATION_ERROR") {
      return NextResponse.json(mapped, { status: 400 });
    }
    logServerError("api.purchases.post", error);
    return NextResponse.json({ error: "No se pudo crear" }, { status: 400 });
  }
}
