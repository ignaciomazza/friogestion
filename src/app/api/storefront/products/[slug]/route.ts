import { NextResponse, type NextRequest } from "next/server";
import { requireStorefrontAccess } from "@/lib/storefront/auth";
import { storefrontErrorResponse } from "@/lib/storefront/http";
import { getStorefrontProduct } from "@/lib/storefront/service";

export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ slug: string }> },
) {
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
