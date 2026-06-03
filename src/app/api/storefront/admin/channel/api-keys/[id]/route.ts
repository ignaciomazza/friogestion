import { NextResponse, type NextRequest } from "next/server";
import { requireRole } from "@/lib/auth/tenant";
import { WRITE_ROLES } from "@/lib/auth/rbac";
import { storefrontErrorResponse } from "@/lib/storefront/http";
import { deactivateStorefrontAdminApiKey } from "@/lib/storefront/service";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { membership } = await requireRole(request, [...WRITE_ROLES]);
    const { id } = await context.params;
    const apiKey = await deactivateStorefrontAdminApiKey(
      membership.organizationId,
      id,
    );
    return NextResponse.json(apiKey);
  } catch (error) {
    return storefrontErrorResponse(error);
  }
}
