import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireOrg, requireRole } from "@/lib/auth/tenant";
import { WRITE_ROLES } from "@/lib/auth/rbac";
import { parseOptionalDate } from "@/lib/validation";
import { buildPurchaseInMovements } from "@/lib/stock";
import { logServerError } from "@/lib/server/log";
import { authErrorStatus, isAuthError } from "@/lib/auth/errors";
import { purchaseValidationSchema } from "@/lib/arca/purchase-validation";
import { validatePurchaseVoucher } from "@/lib/arca/purchase-verification";
import { mapArcaValidationError } from "@/lib/arca/validation-errors";

const itemSchema = z.object({
  productId: z.string().min(1),
  qty: z.coerce.number().positive(),
  unitCost: z.coerce.number().positive(),
  unitPrice: z.coerce.number().positive().optional(),
});

const purchaseSchema = z.object({
  supplierId: z.string().min(1),
  invoiceNumber: z.string().min(1).optional(),
  invoiceDate: z.string().min(1).optional(),
  items: z.array(itemSchema).min(1),
  validateWithArca: z.boolean().optional(),
  arcaValidation: purchaseValidationSchema.optional(),
});

export async function GET(req: NextRequest) {
  try {
    const organizationId = await requireOrg(req);
    const purchases = await prisma.purchaseInvoice.findMany({
      where: { organizationId },
      include: { supplier: true, items: true },
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
        total: purchase.total?.toString() ?? null,
        paidTotal: purchase.paidTotal?.toString() ?? "0",
        balance: purchase.balance?.toString() ?? "0",
        paymentStatus: purchase.paymentStatus,
        itemsCount: purchase.items.length,
        status: purchase.status,
        arcaValidationStatus: purchase.arcaValidationStatus,
        arcaValidationMessage: purchase.arcaValidationMessage ?? null,
        arcaValidationCheckedAt:
          purchase.arcaValidationCheckedAt?.toISOString() ?? null,
      }))
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
      select: { id: true },
    });

    if (!supplier) {
      return NextResponse.json(
        { error: "Proveedor no encontrado" },
        { status: 404 }
      );
    }

    const productIds = Array.from(
      new Set(body.items.map((item) => item.productId))
    );

    const products = await prisma.product.findMany({
      where: { organizationId, id: { in: productIds } },
      select: { id: true },
    });

    if (products.length !== productIds.length) {
      return NextResponse.json(
        { error: "Producto invalido" },
        { status: 400 }
      );
    }

    const subtotal = body.items.reduce(
      (total, item) => total + item.qty * item.unitCost,
      0
    );

    const invoiceNumber = body.invoiceNumber?.trim() || undefined;
    const invoiceDateResult = parseOptionalDate(body.invoiceDate);
    if (invoiceDateResult.error) {
      return NextResponse.json(
        { error: "Fecha de factura invalida" },
        { status: 400 }
      );
    }
    const invoiceDate = invoiceDateResult.date ?? undefined;

    const purchase = await prisma.$transaction(async (tx) => {
      const purchaseInvoice = await tx.purchaseInvoice.create({
        data: {
          organizationId,
          supplierId: body.supplierId,
          status: "CONFIRMED",
          paymentStatus: "UNPAID",
          invoiceNumber,
          invoiceDate,
          subtotal: subtotal.toFixed(2),
          total: subtotal.toFixed(2),
          paidTotal: "0.00",
          balance: subtotal.toFixed(2),
          items: {
            create: body.items.map((item) => ({
              productId: item.productId,
              qty: item.qty.toFixed(3),
              unitCost: item.unitCost.toFixed(2),
              total: (item.qty * item.unitCost).toFixed(2),
            })),
          },
        },
        include: { supplier: true, items: true },
      });

      await tx.currentAccountEntry.create({
        data: {
          organizationId,
          counterpartyType: "SUPPLIER",
          supplierId: body.supplierId,
          direction: "CREDIT",
          sourceType: "PURCHASE",
          purchaseInvoiceId: purchaseInvoice.id,
          amount: subtotal.toFixed(2),
          occurredAt: invoiceDate ?? new Date(),
          note: `Compra ${purchaseInvoice.invoiceNumber ?? purchaseInvoice.id}`,
        },
      });

      await Promise.all(
        body.items.map((item) =>
          tx.product.update({
            where: { id: item.productId },
            data: {
              cost: item.unitCost.toFixed(2),
              ...(item.unitPrice
                ? { price: item.unitPrice.toFixed(2) }
                : {}),
            },
          })
        )
      );

      const stockNote = `Ingreso por compra ${
        purchaseInvoice.invoiceNumber ?? purchaseInvoice.id
      }`;
      const stockMovements = buildPurchaseInMovements({
        organizationId,
        occurredAt: invoiceDate ?? new Date(),
        note: stockNote,
        items: purchaseInvoice.items.map((item) => ({
          id: item.id,
          productId: item.productId,
          qty: Number(item.qty),
        })),
      });
      if (stockMovements.length) {
        await tx.stockMovement.createMany({ data: stockMovements });
      }

      return purchaseInvoice;
    });

    let arcaValidation = null;
    if (body.arcaValidation) {
      arcaValidation = await validatePurchaseVoucher({
        organizationId,
        actorUserId: membership.userId,
        purchaseInvoiceId: purchase.id,
        payload: body.arcaValidation,
      });
    } else if (body.validateWithArca) {
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
      total: purchase.total?.toString() ?? null,
      paidTotal: purchase.paidTotal?.toString() ?? "0",
      balance: purchase.balance?.toString() ?? "0",
      paymentStatus: purchase.paymentStatus,
      itemsCount: purchase.items.length,
      status: purchase.status,
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
        { status: authErrorStatus(error) }
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
