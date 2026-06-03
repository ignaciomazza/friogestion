import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth/tenant";
import { WRITE_ROLES } from "@/lib/auth/rbac";
import { storefrontErrorResponse } from "@/lib/storefront/http";
import { listStorefrontAdminOrders } from "@/lib/storefront/service";

export const runtime = "nodejs";

const searchSchema = z.object({
  status: z
    .enum(["PENDING_PAYMENT", "CONFIRMED", "REJECTED", "CANCELLED", "EXPIRED"])
    .optional(),
});

export async function GET(request: NextRequest) {
  try {
    const { membership } = await requireRole(request, [...WRITE_ROLES]);
    const filters = searchSchema.parse({
      status: request.nextUrl.searchParams.get("status") || undefined,
    });
    const orders = await listStorefrontAdminOrders(
      membership.organizationId,
      filters.status,
    );
    return NextResponse.json(orders);
  } catch (error) {
    return storefrontErrorResponse(error);
  }
}
