import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth/tenant";
import { WRITE_ROLES } from "@/lib/auth/rbac";
import { authErrorStatus, isAuthError } from "@/lib/auth/errors";
import { logServerError } from "@/lib/server/log";
import { aggregateStockByProduct } from "@/lib/stock-balance";
import { STOCK_ENABLED } from "@/lib/features";

const adjustmentSchema = z.object({
  productId: z.string().min(1),
  qty: z.coerce.number().refine((value) => value !== 0, {
    message: "Cantidad invalida",
  }),
  note: z.string().max(280).optional(),
  occurredAt: z.string().optional(),
  clientRequestId: z.string().min(8).max(120).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const { membership } = await requireRole(req, [...WRITE_ROLES]);
    const organizationId = membership.organizationId;
    if (!STOCK_ENABLED) {
      return NextResponse.json(
        { error: "Stock deshabilitado temporalmente" },
        { status: 409 },
      );
    }
    const body = adjustmentSchema.parse(await req.json());

    const product = await prisma.product.findFirst({
      where: { id: body.productId, organizationId },
      select: { id: true, name: true },
    });

    if (!product) {
      return NextResponse.json(
        { error: "Producto no encontrado" },
        { status: 404 },
      );
    }

    const movements = await prisma.stockMovement.findMany({
      where: { organizationId, productId: body.productId },
      select: { productId: true, type: true, qty: true },
    });

    const stockByProduct = aggregateStockByProduct(movements);
    const currentStock = stockByProduct.get(body.productId) ?? 0;
    const idempotencyTag = body.clientRequestId
      ? `[stock-adjustment:${body.clientRequestId}]`
      : null;
    const existingMovement = idempotencyTag
      ? await prisma.stockMovement.findFirst({
          where: {
            organizationId,
            productId: body.productId,
            type: "ADJUST",
            note: { contains: idempotencyTag },
          },
          select: { id: true },
        })
      : null;

    if (existingMovement) {
      return NextResponse.json({
        id: existingMovement.id,
        currentStock: currentStock.toFixed(3),
        projectedStock: currentStock.toFixed(3),
        warning:
          currentStock < 0
            ? "Advertencia: el stock quedaria en negativo."
            : null,
        alreadyApplied: true,
      });
    }

    const projectedStock = currentStock + body.qty;
    const warning =
      projectedStock < 0
        ? "Advertencia: el stock quedaria en negativo."
        : null;

    const occurredAt =
      body.occurredAt && !Number.isNaN(new Date(body.occurredAt).getTime())
        ? new Date(body.occurredAt)
        : new Date();
    const note = body.note?.trim()
      ? `Ajuste manual: ${body.note.trim()}`
      : "Ajuste manual";
    const movementNote = idempotencyTag ? `${note} ${idempotencyTag}` : note;

    const movement = await prisma.stockMovement.create({
      data: {
        organizationId,
        productId: body.productId,
        type: "ADJUST",
        qty: body.qty.toFixed(3),
        occurredAt,
        note: movementNote,
      },
      select: { id: true },
    });

    return NextResponse.json({
      id: movement.id,
      currentStock: currentStock.toFixed(3),
      projectedStock: projectedStock.toFixed(3),
      warning,
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
    logServerError("api.stock.adjustments.post", error);
    return NextResponse.json(
      { error: "No se pudo registrar el ajuste" },
      { status: 400 },
    );
  }
}
