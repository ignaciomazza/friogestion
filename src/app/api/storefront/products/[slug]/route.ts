import { NextResponse, type NextRequest } from "next/server";
import { checkRateLimit, rateLimitResponse } from "@/lib/server/rate-limit";
import { requireStorefrontAccess } from "@/lib/storefront/auth";
import { storefrontErrorResponse } from "@/lib/storefront/http";
import { getStorefrontProduct } from "@/lib/storefront/service";

export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ slug: string }> },
) {
  const rateLimit = checkRateLimit(request, {
    key: "storefront:product-detail",
    limit: 240,
    windowMs: 60 * 1000,
  });
  if (rateLimit.limited) return rateLimitResponse(rateLimit.retryAfter);

  try {
    const access = await requireStorefrontAccess(request);
    const { slug } = await context.params;
    const product = await getStorefrontProduct(access.channelId, slug);
    if (!product) {
      return NextResponse.json(
        { error: "Producto no encontrado" },
        { status: 404 },
      );
    }
    return NextResponse.json(product);
  } catch (error) {
    return storefrontErrorResponse(error);
  }
}
