import { NextResponse, type NextRequest } from "next/server";
import { checkRateLimit, rateLimitResponse } from "@/lib/server/rate-limit";
import { requireStorefrontAccess } from "@/lib/storefront/auth";
import { storefrontErrorResponse } from "@/lib/storefront/http";
import { markStorefrontOrderPaymentRejected } from "@/lib/storefront/service";

export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const rateLimit = checkRateLimit(request, {
    key: "storefront:payment-rejected",
    limit: 120,
    windowMs: 60 * 1000,
  });
  if (rateLimit.limited) return rateLimitResponse(rateLimit.retryAfter);

  try {
    const access = await requireStorefrontAccess(request);
    const { id } = await context.params;
    const body = await request.json().catch(() => null);
    const response = await markStorefrontOrderPaymentRejected(
      access.channelId,
      id,
      body,
    );
    return NextResponse.json(response);
  } catch (error) {
    return storefrontErrorResponse(error);
  }
}
