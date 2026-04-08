import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireOrg, requireRole } from "@/lib/auth/tenant";
import { ADMIN_ROLES } from "@/lib/auth/rbac";
import { logServerError } from "@/lib/server/log";
import { authErrorStatus, isAuthError } from "@/lib/auth/errors";

const rateSchema = z.object({
  baseCode: z.string().min(1),
  quoteCode: z.string().min(1),
  rate: z.coerce.number().positive(),
});

export async function GET(req: NextRequest) {
  try {
    const organizationId = await requireOrg(req);

    const rates = await prisma.exchangeRate.findMany({
      where: { organizationId },
      orderBy: { asOf: "desc" },
      take: 20,
    });

    return NextResponse.json(rates);
  } catch {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { membership } = await requireRole(req, [...ADMIN_ROLES]);
    const organizationId = membership.organizationId;
    const body = rateSchema.parse(await req.json());

    const created = await prisma.exchangeRate.create({
      data: {
        organizationId,
        baseCode: body.baseCode,
        quoteCode: body.quoteCode,
        rate: body.rate.toFixed(6),
        source: "manual",
      },
    });

    return NextResponse.json(created, { status: 201 });
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
    logServerError("api.config.exchange-rate.post", error);
    return NextResponse.json({ error: "No se pudo guardar" }, { status: 400 });
  }
}
