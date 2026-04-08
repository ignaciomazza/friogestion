import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { getLastVoucher } from "@/lib/afip/electronic-billing";
import { requireRole } from "@/lib/auth/tenant";

export const runtime = "nodejs";

const querySchema = z.object({
  pointOfSale: z.coerce.number().int().positive(),
  voucherType: z.coerce.number().int().positive(),
});

export async function GET(req: NextRequest) {
  try {
    const { membership } = await requireRole(req, ["OWNER", "ADMIN"]);
    const params = Object.fromEntries(req.nextUrl.searchParams.entries());
    const { pointOfSale, voucherType } = querySchema.parse(params);

    const lastVoucher = await getLastVoucher(
      membership.organizationId,
      pointOfSale,
      voucherType
    );
    return NextResponse.json({ lastVoucher });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Datos invalidos" }, { status: 400 });
    }
    if (
      error instanceof Error &&
      (error.message.includes("AFIP_CUIT") ||
        error.message.includes("AFIP_CERT_KEY"))
    ) {
      return NextResponse.json(
        { error: "ARCA no configurado" },
        { status: 400 }
      );
    }
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
}
