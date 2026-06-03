import { NextResponse, type NextRequest } from "next/server";
import { requireStorefrontAccess } from "@/lib/storefront/auth";
import { storefrontErrorResponse } from "@/lib/storefront/http";
import { getStorefrontConfig } from "@/lib/storefront/service";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const access = await requireStorefrontAccess(request);
    const config = await getStorefrontConfig(access.channelId);
    return NextResponse.json(config);
  } catch (error) {
    return storefrontErrorResponse(error);
  }
}
