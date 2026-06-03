import { NextResponse, type NextRequest } from "next/server";
import { requireStorefrontAccess } from "@/lib/storefront/auth";
import { storefrontErrorResponse } from "@/lib/storefront/http";
import { markStorefrontOrderPaymentRejected } from "@/lib/storefront/service";

export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
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
