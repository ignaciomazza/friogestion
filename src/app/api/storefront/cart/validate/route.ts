import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireStorefrontAccess } from "@/lib/storefront/auth";
import { storefrontErrorResponse } from "@/lib/storefront/http";
import { validateStorefrontCart } from "@/lib/storefront/service";

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
  customerId: z.string().optional(),
  paymentMethod: z.string().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const access = await requireStorefrontAccess(request);
    const body = bodySchema.parse(await request.json());
    const response = await validateStorefrontCart(
      access.channelId,
      body.items,
      body.paymentMethod,
    );
    return NextResponse.json(response);
  } catch (error) {
    return storefrontErrorResponse(error);
  }
}
