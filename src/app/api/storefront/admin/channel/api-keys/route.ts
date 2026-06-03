import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth/tenant";
import { WRITE_ROLES } from "@/lib/auth/rbac";
import { storefrontErrorResponse } from "@/lib/storefront/http";
import { createStorefrontAdminApiKey } from "@/lib/storefront/service";

export const runtime = "nodejs";

const bodySchema = z.object({
  label: z.string().min(2),
});

export async function POST(request: NextRequest) {
  try {
    const { membership } = await requireRole(request, [...WRITE_ROLES]);
    const body = bodySchema.parse(await request.json());
    const apiKey = await createStorefrontAdminApiKey(
      membership.organizationId,
      body.label,
    );
    return NextResponse.json(apiKey);
  } catch (error) {
    return storefrontErrorResponse(error);
  }
}
