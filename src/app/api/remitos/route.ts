import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireOrg, requireRole } from "@/lib/auth/tenant";
import { WRITE_ROLES } from "@/lib/auth/rbac";
import { authErrorStatus, isAuthError } from "@/lib/auth/errors";
import { logServerError } from "@/lib/server/log";
import { createDeliveryNote } from "@/lib/remitos";
import { mapDeliveryNote } from "@/lib/remitos-response";

export const runtime = "nodejs";

const itemSchema = z.object({
  productId: z.string().min(1).optional(),
  description: z.string().min(1),
  qty: z.coerce.number().positive(),
  unit: z.string().min(1),
});

const createSchema = z.object({
  type: z.enum(["R", "X"]),
  customerId: z.string().min(1).optional(),
  supplierId: z.string().min(1).optional(),
  saleId: z.string().min(1).optional(),
  purchaseInvoiceId: z.string().min(1).optional(),
  observations: z.string().max(2000).optional(),
  digitalRepresentation: z.boolean().optional(),
  items: z.array(itemSchema).min(1),
});

export async function GET(req: NextRequest) {
  try {
    const organizationId = await requireOrg(req);
    const notes = await prisma.deliveryNote.findMany({
      where: { organizationId },
      include: {
        customer: true,
        supplier: true,
        sale: true,
        purchaseInvoice: true,
        items: {
          include: {
            product: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    return NextResponse.json(notes.map((note) => mapDeliveryNote(note)));
  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json(
        { error: "No autorizado" },
        { status: authErrorStatus(error) }
      );
    }
    logServerError("api.remitos.get", error);
    return NextResponse.json({ error: "No se pudo cargar" }, { status: 400 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { membership } = await requireRole(req, [...WRITE_ROLES]);
    const organizationId = membership.organizationId;
    const body = createSchema.parse(await req.json());
    const pointOfSale = 1;

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

    const note = await createDeliveryNote({
      organizationId,
      type: body.type,
      pointOfSale,
      customerId: body.customerId ?? null,
      supplierId: body.supplierId ?? null,
      saleId: body.saleId ?? null,
      purchaseInvoiceId: body.purchaseInvoiceId ?? null,
      observations: body.observations ?? null,
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
    logServerError("api.remitos.post", error);
    return NextResponse.json({ error: "No se pudo crear" }, { status: 400 });
  }
}
