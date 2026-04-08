import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireOrg, requireRole } from "@/lib/auth/tenant";
import { WRITE_ROLES } from "@/lib/auth/rbac";
import { authErrorStatus, isAuthError } from "@/lib/auth/errors";
import { logServerError } from "@/lib/server/log";
import { mapDeliveryNote } from "@/lib/remitos-response";
import { updateDeliveryNote } from "@/lib/remitos";

export const runtime = "nodejs";

const itemSchema = z.object({
  productId: z.string().min(1).optional(),
  description: z.string().min(1),
  qty: z.coerce.number().positive(),
  unit: z.string().min(1),
});

const patchSchema = z.object({
  type: z.enum(["R", "X"]).optional(),
  customerId: z.string().min(1).nullable().optional(),
  supplierId: z.string().min(1).nullable().optional(),
  saleId: z.string().min(1).nullable().optional(),
  purchaseInvoiceId: z.string().min(1).nullable().optional(),
  observations: z.string().max(2000).nullable().optional(),
  digitalRepresentation: z.boolean().optional(),
  items: z.array(itemSchema).min(1).optional(),
});

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const organizationId = await requireOrg(req);
    const params = await context.params;
    const note = await prisma.deliveryNote.findFirst({
      where: { id: params.id, organizationId },
      include: {
        customer: true,
        supplier: true,
        sale: true,
        purchaseInvoice: true,
        items: { include: { product: true } },
      },
    });

    if (!note) {
      return NextResponse.json({ error: "Remito no encontrado" }, { status: 404 });
    }

    return NextResponse.json(mapDeliveryNote(note));
  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json(
        { error: "No autorizado" },
        { status: authErrorStatus(error) }
      );
    }
    logServerError("api.remitos.id.get", error);
    return NextResponse.json({ error: "No se pudo cargar" }, { status: 400 });
  }
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { membership } = await requireRole(req, [...WRITE_ROLES]);
    const organizationId = membership.organizationId;
    const params = await context.params;
    const body = patchSchema.parse(await req.json());

    if (body.customerId) {
      const customer = await prisma.customer.findFirst({
        where: { id: body.customerId, organizationId },
        select: { id: true },
      });
      if (!customer) {
        return NextResponse.json(
          { error: "Cliente no encontrado" },
          { status: 404 }
        );
      }
    }
    if (body.supplierId) {
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
    }
    if (body.saleId) {
      const sale = await prisma.sale.findFirst({
        where: { id: body.saleId, organizationId },
        select: { id: true },
      });
      if (!sale) {
        return NextResponse.json({ error: "Venta no encontrada" }, { status: 404 });
      }
    }
    if (body.purchaseInvoiceId) {
      const purchase = await prisma.purchaseInvoice.findFirst({
        where: { id: body.purchaseInvoiceId, organizationId },
        select: { id: true },
      });
      if (!purchase) {
        return NextResponse.json(
          { error: "Compra no encontrada" },
          { status: 404 }
        );
      }
    }
    if (body.items) {
      const productIds = Array.from(
        new Set(
          body.items
            .map((item) => item.productId)
            .filter((value): value is string => Boolean(value))
        )
      );
      if (productIds.length) {
        const products = await prisma.product.findMany({
          where: { organizationId, id: { in: productIds } },
          select: { id: true },
        });
        if (products.length !== productIds.length) {
          return NextResponse.json(
            { error: "Producto invalido en items" },
            { status: 400 }
          );
        }
      }
    }

    const note = await updateDeliveryNote({
      id: params.id,
      organizationId,
      type: body.type,
      customerId: body.customerId,
      supplierId: body.supplierId,
      saleId: body.saleId,
      purchaseInvoiceId: body.purchaseInvoiceId,
      observations: body.observations,
      digitalRepresentation: body.digitalRepresentation,
      items: body.items,
    });

    return NextResponse.json(mapDeliveryNote(note));
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
    if (error instanceof Error) {
      if (error.message === "DELIVERY_NOTE_NOT_FOUND") {
        return NextResponse.json(
          { error: "Remito no encontrado" },
          { status: 404 }
        );
      }
      if (error.message === "DELIVERY_NOTE_UPDATE_NOT_ALLOWED") {
        return NextResponse.json(
          { error: "Solo se puede editar remitos en borrador" },
          { status: 409 }
        );
      }
    }
    logServerError("api.remitos.id.patch", error);
    return NextResponse.json(
      { error: "No se pudo actualizar" },
      { status: 400 }
    );
  }
}
