import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOrg } from "@/lib/auth/tenant";

export async function GET(req: NextRequest) {
  try {
    const organizationId = await requireOrg(req);
    const currencies = await prisma.financeCurrency.findMany({
      where: { organizationId, isActive: true },
      orderBy: [{ isDefault: "desc" }, { code: "asc" }],
    });

    return NextResponse.json(
      currencies.map((currency) => ({
        id: currency.id,
        code: currency.code,
        name: currency.name,
        symbol: currency.symbol,
        isDefault: currency.isDefault,
      }))
    );
  } catch {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
}
