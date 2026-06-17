import { type NextRequest } from "next/server";
import { checkRateLimit, rateLimitResponse } from "@/lib/server/rate-limit";
import { requireStorefrontAccess } from "@/lib/storefront/auth";
import { storefrontErrorResponse, storefrontJson } from "@/lib/storefront/http";
import { getStorefrontConfig } from "@/lib/storefront/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const rateLimit = checkRateLimit(request, {
    key: "storefront:config",
    limit: 120,
    windowMs: 60 * 1000,
  });
  if (rateLimit.limited) return rateLimitResponse(rateLimit.retryAfter);

  try {
    const access = await requireStorefrontAccess(request);
    const config = await getStorefrontConfig(access.channelId);
    return storefrontJson(config);
  } catch (error) {
    return storefrontErrorResponse(error);
  }
}
