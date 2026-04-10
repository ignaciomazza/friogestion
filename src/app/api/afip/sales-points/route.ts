import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getSalesPoints } from "@/lib/afip/electronic-billing";
import { requireRole } from "@/lib/auth/tenant";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const { membership } = await requireRole(req, ["OWNER", "ADMIN"]);
    const salesPoints = await getSalesPoints(membership.organizationId);
    return NextResponse.json({
      salesPoints,
      defaultPointOfSale: salesPoints[0] ?? null,
    });
  } catch (error) {
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
