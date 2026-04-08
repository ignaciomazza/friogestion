import type { Prisma } from "@prisma/client";

type DeliveryNoteWithRelations = Prisma.DeliveryNoteGetPayload<{
  include: {
    customer: true;
    supplier: true;
    sale: true;
    purchaseInvoice: true;
    items: {
      include: {
        product: true;
      };
    };
  };
}>;

export function mapDeliveryNote(note: DeliveryNoteWithRelations) {
  return {
    id: note.id,
    type: note.type,
    pointOfSale: note.pointOfSale,
    number: note.number,
    status: note.status,
    issuedAt: note.issuedAt?.toISOString() ?? null,
    deliveredAt: note.deliveredAt?.toISOString() ?? null,
    customerId: note.customerId,
    supplierId: note.supplierId,
    saleId: note.saleId,
    purchaseInvoiceId: note.purchaseInvoiceId,
    observations: note.observations ?? null,
    digitalRepresentation: note.digitalRepresentation,
    createdAt: note.createdAt.toISOString(),
    updatedAt: note.updatedAt.toISOString(),
    customerName: note.customer?.displayName ?? null,
    supplierName: note.supplier?.displayName ?? null,
    saleNumber: note.sale?.saleNumber ?? null,
    purchaseInvoiceNumber: note.purchaseInvoice?.invoiceNumber ?? null,
    items: note.items.map((item) => ({
      id: item.id,
      productId: item.productId ?? null,
      productName: item.product?.name ?? null,
      description: item.description,
      qty: item.qty.toString(),
      unit: item.unit,
    })),
  };
}

export type { DeliveryNoteWithRelations };
