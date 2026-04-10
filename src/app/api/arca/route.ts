import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth/tenant";
import { hasValidSecretsKey } from "@/lib/crypto/secrets";
import { describeArcaJob } from "@/lib/arca/errors";
import { isAuthError } from "@/lib/auth/errors";

export const runtime = "nodejs";

const updateSchema = z.object({
  defaultPointOfSale: z.coerce.number().int().positive().nullable(),
});

export async function GET(req: NextRequest) {
  try {
    const { membership } = await requireRole(req, ["OWNER", "ADMIN"]);
    const organizationId = membership.organizationId;

    const config = await prisma.organizationFiscalConfig.findUnique({
      where: { organizationId },
      select: {
        id: true,
        organizationId: true,
        taxIdRepresentado: true,
        taxIdLogin: true,
        alias: true,
        defaultPointOfSale: true,
        authorizedServices: true,
        status: true,
        lastError: true,
        lastOkAt: true,
        logoUrl: true,
        logoFilename: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    const job = await prisma.arcaConnectionJob.findFirst({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({
      secretsKeyValid: hasValidSecretsKey(),
      config,
      job,
      jobInfo: job ? describeArcaJob(job) : null,
    });
  } catch {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { membership } = await requireRole(req, ["OWNER", "ADMIN"]);
    const body = updateSchema.parse(await req.json());

    const existing = await prisma.organizationFiscalConfig.findUnique({
      where: { organizationId: membership.organizationId },
      select: { id: true },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Configuracion ARCA inexistente" },
        { status: 400 }
      );
    }

    const config = await prisma.organizationFiscalConfig.update({
      where: { organizationId: membership.organizationId },
      data: { defaultPointOfSale: body.defaultPointOfSale },
      select: {
        id: true,
        organizationId: true,
        taxIdRepresentado: true,
        taxIdLogin: true,
        alias: true,
        defaultPointOfSale: true,
        authorizedServices: true,
        status: true,
        lastError: true,
        lastOkAt: true,
        logoUrl: true,
        logoFilename: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({
      config,
      message: body.defaultPointOfSale
        ? `Punto de venta por defecto actualizado: ${body.defaultPointOfSale}.`
        : "Punto de venta por defecto limpiado.",
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Datos invalidos" }, { status: 400 });
    }
    if (isAuthError(error)) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
    return NextResponse.json(
      { error: "No se pudo actualizar la configuracion ARCA." },
      { status: 400 }
    );
  }
}
