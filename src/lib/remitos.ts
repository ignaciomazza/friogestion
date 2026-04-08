import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

type DeliveryNoteType = "R" | "X";
type DeliveryNoteStatus = "DRAFT" | "ISSUED" | "DELIVERED" | "CANCELLED";

type DeliveryNoteItemInput = {
  productId?: string | null;
  description: string;
  qty: number;
  unit: string;
};

type DeliveryNoteCreateInput = {
  organizationId: string;
  type: DeliveryNoteType;
  pointOfSale: number;
  customerId?: string | null;
  supplierId?: string | null;
  saleId?: string | null;
  purchaseInvoiceId?: string | null;
  observations?: string | null;
  digitalRepresentation?: boolean;
  items: DeliveryNoteItemInput[];
};

type DeliveryNoteUpdateInput = {
  id: string;
  organizationId: string;
  type?: DeliveryNoteType;
  pointOfSale?: number;
  customerId?: string | null;
  supplierId?: string | null;
  saleId?: string | null;
  purchaseInvoiceId?: string | null;
  observations?: string | null;
  digitalRepresentation?: boolean;
  items?: DeliveryNoteItemInput[];
};

function toCounterKey(type: DeliveryNoteType, pointOfSale: number) {
  return `delivery-note-${type.toLowerCase()}-${pointOfSale}`;
}

async function reserveDeliveryNoteNumber(
  tx: Prisma.TransactionClient,
  organizationId: string,
  type: DeliveryNoteType,
  pointOfSale: number
) {
  const key = toCounterKey(type, pointOfSale);
  const counter = await tx.organizationCounter.findUnique({
    where: {
      organizationId_key: {
        organizationId,
        key,
      },
    },
  });

  if (!counter) {
    const last = await tx.deliveryNote.findFirst({
      where: {
        organizationId,
        type,
        pointOfSale,
        number: { not: null },
      },
      orderBy: { number: "desc" },
      select: { number: true },
    });
    const next = (last?.number ?? 0) + 1;
    await tx.organizationCounter.create({
      data: {
        organizationId,
        key,
        nextValue: next + 1,
      },
    });
    return next;
  }

  const updated = await tx.organizationCounter.update({
    where: {
      organizationId_key: {
        organizationId,
        key,
      },
    },
    data: { nextValue: { increment: 1 } },
    select: { nextValue: true },
  });

  return updated.nextValue - 1;
}

function assertTransitionAllowed(
  from: DeliveryNoteStatus,
  target: DeliveryNoteStatus
) {
  if (target === "ISSUED" && from !== "DRAFT") {
    throw new Error("DELIVERY_NOTE_INVALID_TRANSITION");
  }
  if (target === "DELIVERED" && from !== "ISSUED") {
    throw new Error("DELIVERY_NOTE_INVALID_TRANSITION");
  }
  if (target === "CANCELLED" && !["DRAFT", "ISSUED"].includes(from)) {
    throw new Error("DELIVERY_NOTE_INVALID_TRANSITION");
  }
}

export async function createDeliveryNote(input: DeliveryNoteCreateInput) {
  return prisma.deliveryNote.create({
    data: {
      organizationId: input.organizationId,
      type: input.type,
      pointOfSale: input.pointOfSale,
      status: "DRAFT",
      customerId: input.customerId ?? null,
      supplierId: input.supplierId ?? null,
      saleId: input.saleId ?? null,
      purchaseInvoiceId: input.purchaseInvoiceId ?? null,
      observations: input.observations ?? null,
      digitalRepresentation: input.digitalRepresentation ?? true,
      items: {
        create: input.items.map((item) => ({
          productId: item.productId ?? null,
          description: item.description.trim(),
          qty: item.qty.toFixed(3),
          unit: item.unit.trim(),
        })),
      },
    },
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
  });
}

export async function updateDeliveryNote(input: DeliveryNoteUpdateInput) {
  const existing = await prisma.deliveryNote.findFirst({
    where: {
      id: input.id,
      organizationId: input.organizationId,
    },
    select: { id: true, status: true },
  });
  if (!existing) {
    throw new Error("DELIVERY_NOTE_NOT_FOUND");
  }
  if (existing.status !== "DRAFT") {
    throw new Error("DELIVERY_NOTE_UPDATE_NOT_ALLOWED");
  }

  return prisma.$transaction(async (tx) => {
    if (input.items) {
      await tx.deliveryNoteItem.deleteMany({
        where: { deliveryNoteId: input.id },
      });
    }

    return tx.deliveryNote.update({
      where: { id: input.id },
      data: {
        type: input.type,
        pointOfSale: input.pointOfSale,
        customerId: input.customerId === undefined ? undefined : input.customerId,
        supplierId: input.supplierId === undefined ? undefined : input.supplierId,
        saleId: input.saleId === undefined ? undefined : input.saleId,
        purchaseInvoiceId:
          input.purchaseInvoiceId === undefined
            ? undefined
            : input.purchaseInvoiceId,
        observations: input.observations,
        digitalRepresentation: input.digitalRepresentation,
        items: input.items
          ? {
              create: input.items.map((item) => ({
                productId: item.productId ?? null,
                description: item.description.trim(),
                qty: item.qty.toFixed(3),
                unit: item.unit.trim(),
              })),
            }
          : undefined,
      },
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
    });
  });
}

export async function transitionDeliveryNote(input: {
  organizationId: string;
  id: string;
  target: DeliveryNoteStatus;
}) {
  const existing = await prisma.deliveryNote.findFirst({
    where: {
      id: input.id,
      organizationId: input.organizationId,
    },
  });

  if (!existing) {
    throw new Error("DELIVERY_NOTE_NOT_FOUND");
  }

  assertTransitionAllowed(existing.status as DeliveryNoteStatus, input.target);

  return prisma.$transaction(async (tx) => {
    if (input.target === "ISSUED") {
      const number = await reserveDeliveryNoteNumber(
        tx,
        input.organizationId,
        existing.type as DeliveryNoteType,
        existing.pointOfSale
      );
      return tx.deliveryNote.update({
        where: { id: existing.id },
        data: {
          status: "ISSUED",
          number,
          issuedAt: existing.issuedAt ?? new Date(),
        },
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
      });
    }

    if (input.target === "DELIVERED") {
      return tx.deliveryNote.update({
        where: { id: existing.id },
        data: {
          status: "DELIVERED",
          deliveredAt: new Date(),
        },
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
      });
    }

    return tx.deliveryNote.update({
      where: { id: existing.id },
      data: {
        status: "CANCELLED",
      },
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
    });
  });
}
