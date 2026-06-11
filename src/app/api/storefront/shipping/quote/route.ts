import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { checkRateLimit, rateLimitResponse } from "@/lib/server/rate-limit";
import { requireStorefrontAccess } from "@/lib/storefront/auth";
import { storefrontErrorResponse } from "@/lib/storefront/http";
import {
  quoteStorefrontShipping,
  STOREFRONT_MAX_CART_LINES,
  STOREFRONT_MAX_ITEM_QUANTITY,
} from "@/lib/storefront/service";

export const runtime = "nodejs";

const bodySchema = z.object({
  items: z
    .array(
      z.object({
        productId: z.string().min(1),
        quantity: z.coerce.number().int().positive().max(STOREFRONT_MAX_ITEM_QUANTITY),
      }),
    )
    .min(1)
    .max(STOREFRONT_MAX_CART_LINES),
  deliveryMethod: z.enum(["normal", "pickup", "own_delivery", "quote"]),
  address: z
    .object({
      street: z.string().min(1).max(160),
      city: z.string().min(1).max(80),
      state: z.string().min(1).max(80),
      zipCode: z.string().min(1).max(20),
      notes: z.string().max(300).optional(),
    })
    .optional(),
});

export async function POST(request: NextRequest) {
  const rateLimit = checkRateLimit(request, {
    key: "storefront:shipping-quote",
    limit: 120,
    windowMs: 60 * 1000,
  });
  if (rateLimit.limited) return rateLimitResponse(rateLimit.retryAfter);

  try {
    const access = await requireStorefrontAccess(request);
    const body = bodySchema.parse(await request.json());
    const response = await quoteStorefrontShipping(access.channelId, body);
    return NextResponse.json(response);
  } catch (error) {
    return storefrontErrorResponse(error);
  }
}
