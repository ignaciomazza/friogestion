import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireRole } from "@/lib/auth/tenant";
import { getAfipClient } from "@/lib/afip/client";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const { membership } = await requireRole(req, ["OWNER", "ADMIN"]);
    const afip = await getAfipClient(membership.organizationId);
    const [status, salesPoints] = await Promise.all([
      afip.ElectronicBilling.getServerStatus(),
      afip.ElectronicBilling.getSalesPoints(),
    ]);

    return NextResponse.json({ status, salesPoints });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "No se pudo consultar ARCA";
    const normalized = message.replace(/AFIP/gi, "ARCA");
    return NextResponse.json({ error: normalized }, { status: 400 });
  }
}
