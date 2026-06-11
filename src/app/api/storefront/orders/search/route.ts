import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireStorefrontAccess } from "@/lib/storefront/auth";
import { storefrontErrorResponse } from "@/lib/storefront/http";
import { searchStorefrontOrders } from "@/lib/storefront/service";

export const runtime = "nodejs";

const bodySchema = z.object({
  reference: z.string().optional().nullable(),
  contact: z.string().optional().nullable(),
  email: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  taxId: z.string().optional().nullable(),
  name: z.string().optional().nullable(),
  date: z.string().optional().nullable(),
});

export async function POST(request: NextRequest) {
  try {
    const access = await requireStorefrontAccess(request);
    const body = bodySchema.parse(await request.json());
    const orders = await searchStorefrontOrders(access.channelId, body);
    return NextResponse.json({ orders });
  } catch (error) {
    return storefrontErrorResponse(error);
  }
}
