import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { checkRateLimit, rateLimitResponse } from "@/lib/server/rate-limit";
import { requireStorefrontAccess } from "@/lib/storefront/auth";
import { storefrontErrorResponse } from "@/lib/storefront/http";
import {
  listStorefrontProducts,
  STOREFRONT_MAX_PRODUCT_LIMIT,
} from "@/lib/storefront/service";

export const runtime = "nodejs";

const filtersSchema = z.object({
  q: z.string().max(120).optional(),
  category: z.string().max(120).optional(),
  brand: z.string().max(120).optional(),
  shippingType: z
    .enum(["normal", "pickup", "own_delivery", "quote", "restricted"])
    .optional(),
  onlyAvailable: z.boolean().optional(),
  featured: z.boolean().optional(),
  limit: z.number().int().positive().max(STOREFRONT_MAX_PRODUCT_LIMIT).optional(),
});

const parseBoolean = (value: string | null) => {
  if (!value) return undefined;
  if (["1", "true", "yes", "si"].includes(value.toLowerCase())) return true;
  if (["0", "false", "no"].includes(value.toLowerCase())) return false;
  return undefined;
};

export async function GET(request: NextRequest) {
  const rateLimit = checkRateLimit(request, {
    key: "storefront:products",
    limit: 240,
    windowMs: 60 * 1000,
  });
  if (rateLimit.limited) return rateLimitResponse(rateLimit.retryAfter);

  try {
    const access = await requireStorefrontAccess(request);
    const searchParams = request.nextUrl.searchParams;
    const filters = filtersSchema.parse({
      q: searchParams.get("q")?.trim() || undefined,
      category: searchParams.get("category")?.trim() || undefined,
      brand: searchParams.get("brand")?.trim() || undefined,
      shippingType: searchParams.get("shippingType")?.trim() || undefined,
      onlyAvailable: parseBoolean(searchParams.get("onlyAvailable")),
      featured: parseBoolean(searchParams.get("featured")),
      limit: searchParams.get("limit")
        ? Number(searchParams.get("limit"))
        : undefined,
    });

    const response = await listStorefrontProducts(access.channelId, filters);
    return NextResponse.json(response);
  } catch (error) {
    return storefrontErrorResponse(error);
  }
}
