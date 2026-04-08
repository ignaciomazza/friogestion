import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { prisma } from "@/lib/prisma";
import { requireAuth, requireOrg } from "@/lib/auth/tenant";
import { DeliveryNotePdfDocument } from "@/lib/pdf/delivery-note";
import { resolveLogoSource } from "@/lib/pdf/assets";

export const runtime = "nodejs";

function formatDate(value?: Date | null) {
  return value ? value.toLocaleDateString("es-AR") : "-";
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const organizationId = await requireOrg(req);
    await requireAuth(req);
    const params = await context.params;

    const note = await prisma.deliveryNote.findFirst({
      where: {
        id: params.id,
        organizationId,
      },
      include: {
        organization: true,
        customer: true,
        supplier: true,
        sale: {
          include: {
            customer: true,
          },
        },
        purchaseInvoice: {
          include: {
            supplier: true,
          },
        },
        items: {
          include: {
            product: true,
          },
        },
      },
    });

    if (!note) {
      return NextResponse.json({ error: "Remito no encontrado" }, { status: 404 });
    }

    const config = await prisma.organizationFiscalConfig.findUnique({
      where: { organizationId },
      select: {
        logoUrl: true,
        logoFilename: true,
      },
    });
    const logoSrc = await resolveLogoSource({
      logoUrl: config?.logoUrl ?? null,
      logoFilename: config?.logoFilename ?? null,
    });

    const receiver = note.customer
      ? {
          name: note.customer.displayName,
          taxId: note.customer.taxId,
          address: note.customer.address,
        }
      : note.supplier
        ? {
            name: note.supplier.displayName,
            taxId: note.supplier.taxId,
            address: note.supplier.address,
          }
        : note.sale?.customer
          ? {
              name: note.sale.customer.displayName,
              taxId: note.sale.customer.taxId,
              address: note.sale.customer.address,
            }
          : note.purchaseInvoice?.supplier
            ? {
                name: note.purchaseInvoice.supplier.displayName,
                taxId: note.purchaseInvoice.supplier.taxId,
                address: note.purchaseInvoice.supplier.address,
              }
            : {
                name: "Sin receptor",
                taxId: null,
                address: null,
              };

    const numberLabel =
      note.number !== null && note.number !== undefined ? String(note.number) : "Sin asignar";
    const title = `Remito ${note.type} ${note.pointOfSale
      .toString()
      .padStart(4, "0")}-${numberLabel.padStart(8, "0")}`;

    const doc = (
      <DeliveryNotePdfDocument
        data={{
          title,
          organization: {
            name: note.organization.name,
            legalName: note.organization.legalName,
            taxId: note.organization.taxId,
          },
          receiver,
          legend: "DOCUMENTO NO VALIDO COMO FACTURA",
          meta: [
            { label: "Tipo", value: note.type },
            { label: "Punto de venta", value: String(note.pointOfSale) },
            { label: "Numero", value: numberLabel },
            { label: "Estado", value: note.status },
            { label: "Emitido", value: formatDate(note.issuedAt) },
            { label: "Entregado", value: formatDate(note.deliveredAt) },
            {
              label: "Representacion",
              value: note.digitalRepresentation ? "Digital" : "Impresa",
            },
          ],
          items: note.items.map((item) => ({
            description: item.description || item.product?.name || "Item",
            qty: Number(item.qty),
            unit: item.unit,
          })),
          observations: note.observations,
          logoSrc,
        }}
      />
    );

    const buffer = await renderToBuffer(doc);
    const body = new Uint8Array(buffer);

    return new NextResponse(body, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="remito-${note.id}.pdf"`,
      },
    });
  } catch {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
}
