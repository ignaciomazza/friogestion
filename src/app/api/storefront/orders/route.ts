import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireStorefrontAccess } from "@/lib/storefront/auth";
import { storefrontErrorResponse } from "@/lib/storefront/http";
import { createStorefrontOrder } from "@/lib/storefront/service";

export const runtime = "nodejs";

const bodySchema = z.object({
  items: z
    .array(
      z.object({
        productId: z.string().min(1),
        quantity: z.coerce.number().int().positive(),
      }),
    )
    .min(1),
  customer: z.object({
    displayName: z.string().min(2),
    email: z.string().email(),
    phone: z.string().min(6),
    taxId: z.string().optional(),
    fiscalCondition: z.enum([
      "CONSUMIDOR_FINAL",
      "MONOTRIBUTISTA",
      "RESPONSABLE_INSCRIPTO",
    ]),
  }),
  deliveryMethod: z.enum(["normal", "pickup", "own_delivery", "quote"]),
  deliveryAddress: z
    .object({
      street: z.string().min(1),
      city: z.string().min(1),
      state: z.string().min(1),
      zipCode: z.string().min(1),
      notes: z.string().optional(),
    })
    .optional(),
  paymentMethod: z.string().min(1),
});

export async function POST(request: NextRequest) {
  try {
    const access = await requireStorefrontAccess(request);
    const body = bodySchema.parse(await request.json());
    const response = await createStorefrontOrder(access.channelId, body);
    return NextResponse.json(response);
  } catch (error) {
    return storefrontErrorResponse(error);
  }
}
