import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth/tenant";
import { hasValidSecretsKey } from "@/lib/crypto/secrets";
import { describeArcaJob } from "@/lib/arca/errors";

export const runtime = "nodejs";

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
