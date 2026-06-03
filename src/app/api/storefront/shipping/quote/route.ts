import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireStorefrontAccess } from "@/lib/storefront/auth";
import { storefrontErrorResponse } from "@/lib/storefront/http";
import { quoteStorefrontShipping } from "@/lib/storefront/service";

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
  deliveryMethod: z.enum(["normal", "pickup", "own_delivery", "quote"]),
  address: z
    .object({
      street: z.string().min(1),
      city: z.string().min(1),
      state: z.string().min(1),
      zipCode: z.string().min(1),
      notes: z.string().optional(),
    })
    .optional(),
});

export async function POST(request: NextRequest) {
  try {
    const access = await requireStorefrontAccess(request);
    const body = bodySchema.parse(await request.json());
    const response = await quoteStorefrontShipping(access.channelId, body);
    return NextResponse.json(response);
  } catch (error) {
    return storefrontErrorResponse(error);
  }
}
