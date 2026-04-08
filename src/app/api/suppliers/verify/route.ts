import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth/tenant";
import { WRITE_ROLES } from "@/lib/auth/rbac";
import { authErrorStatus, isAuthError } from "@/lib/auth/errors";
import { logServerError } from "@/lib/server/log";
import { verifySupplierWithArca } from "@/lib/arca/supplier-verification";
import { mapArcaValidationError } from "@/lib/arca/validation-errors";

export const runtime = "nodejs";

const bodySchema = z
  .object({
    supplierId: z.string().min(1).optional(),
    taxId: z.string().min(1).optional(),
    legalName: z.string().min(1).optional(),
    displayName: z.string().min(1).optional(),
  })
  .refine((value) => Boolean(value.supplierId || value.taxId), {
    message: "supplierId o taxId requerido",
  });

export async function POST(req: NextRequest) {
  try {
    const { membership } = await requireRole(req, [...WRITE_ROLES]);
    const body = bodySchema.parse(await req.json());

    const verification = await verifySupplierWithArca({
      organizationId: membership.organizationId,
      actorUserId: membership.userId,
      supplierId: body.supplierId ?? null,
      taxId: body.taxId ?? null,
      legalName: body.legalName ?? null,
      displayName: body.displayName ?? null,
    });

    return NextResponse.json(verification);
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
    logServerError("api.suppliers.verify.post", error);
    return NextResponse.json(mapped, { status: 400 });
  }
}
