import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getAfipStatus } from "@/lib/afip/status";
import { getAfipClient } from "@/lib/afip/client";
import { requireOrg } from "@/lib/auth/tenant";

export async function GET(req: NextRequest) {
  try {
    const organizationId = await requireOrg(req);
    const status = await getAfipStatus(organizationId);
    let clientReady = false;

    if (status.ok) {
      try {
        await getAfipClient(organizationId);
        clientReady = true;
      } catch {
        clientReady = false;
      }
    }

    return NextResponse.json({ ...status, clientReady });
  } catch {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
}
