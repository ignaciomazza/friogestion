import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth/tenant";
import { WRITE_ROLES } from "@/lib/auth/rbac";
import { isAuthError, authErrorStatus } from "@/lib/auth/errors";
import { logServerError } from "@/lib/server/log";
import { lookupTaxpayerByCuit } from "@/lib/arca/taxpayer-lookup";
import { mapArcaValidationError } from "@/lib/arca/validation-errors";

export const runtime = "nodejs";

const bodySchema = z.object({
  taxId: z.string().min(1),
  forceRefresh: z.boolean().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const { membership } = await requireRole(req, [...WRITE_ROLES]);
    const body = bodySchema.parse(await req.json());

    const result = await lookupTaxpayerByCuit({
      organizationId: membership.organizationId,
      taxId: body.taxId,
      forceRefresh: body.forceRefresh ?? false,
    });

    return NextResponse.json({
      source: result.source,
      checkedAt: result.checkedAt,
      taxpayer: result.taxpayer,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Datos invalidos" }, { status: 400 });
    }
    if (isAuthError(error)) {
      return NextResponse.json(
        { error: "No autorizado" },
        { status: authErrorStatus(error) }
      );
    }
    const mapped = mapArcaValidationError(error);
    logServerError("api.arca.taxpayer-lookup.post", error);
    return NextResponse.json(mapped, { status: 400 });
  }
}
