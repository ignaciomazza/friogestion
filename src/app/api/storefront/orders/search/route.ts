import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { checkRateLimit, rateLimitResponse } from "@/lib/server/rate-limit";
import { requireStorefrontAccess } from "@/lib/storefront/auth";
import { storefrontErrorResponse } from "@/lib/storefront/http";
import { searchStorefrontOrders } from "@/lib/storefront/service";

export const runtime = "nodejs";

const bodySchema = z.object({
  reference: z.string().max(120).optional().nullable(),
  contact: z.string().max(160).optional().nullable(),
  email: z.string().max(160).optional().nullable(),
  phone: z.string().max(40).optional().nullable(),
  taxId: z.string().max(32).optional().nullable(),
  name: z.string().max(120).optional().nullable(),
  date: z.string().max(20).optional().nullable(),
});

export async function POST(request: NextRequest) {
  const rateLimit = checkRateLimit(request, {
    key: "storefront:orders-search",
    limit: 30,
    windowMs: 10 * 60 * 1000,
  });
  if (rateLimit.limited) return rateLimitResponse(rateLimit.retryAfter);

  try {
    const access = await requireStorefrontAccess(request);
    const body = bodySchema.parse(await request.json());
    const orders = await searchStorefrontOrders(access.channelId, body);
    return NextResponse.json({ orders });
  } catch (error) {
    return storefrontErrorResponse(error);
  }
}
