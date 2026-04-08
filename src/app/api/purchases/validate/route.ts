import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth/tenant";
import { WRITE_ROLES } from "@/lib/auth/rbac";
import { authErrorStatus, isAuthError } from "@/lib/auth/errors";
import { logServerError } from "@/lib/server/log";
import { purchaseValidationSchema } from "@/lib/arca/purchase-validation";
import { validatePurchaseVoucher } from "@/lib/arca/purchase-verification";
import { mapArcaValidationError } from "@/lib/arca/validation-errors";

export const runtime = "nodejs";

const bodySchema = purchaseValidationSchema.extend({
  purchaseInvoiceId: z.string().min(1).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const { membership } = await requireRole(req, [...WRITE_ROLES]);
    const body = bodySchema.parse(await req.json());

    const result = await validatePurchaseVoucher({
      organizationId: membership.organizationId,
      actorUserId: membership.userId,
      purchaseInvoiceId: body.purchaseInvoiceId ?? null,
      payload: body,
    });

    return NextResponse.json(result);
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
    logServerError("api.purchases.validate.post", error);
    return NextResponse.json(mapped, { status: 400 });
  }
}
