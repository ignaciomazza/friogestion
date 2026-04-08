import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth/tenant";
import { runArcaJob } from "@/lib/arca/jobs";
import { setJobPassword } from "@/lib/arca/password-cache";
import { DEFAULT_ARCA_SERVICE, dedupeServices } from "@/lib/arca/utils";
import { describeArcaJob, mapArcaError } from "@/lib/arca/errors";
import { isAuthError } from "@/lib/auth/errors";

export const runtime = "nodejs";

const bodySchema = z.object({
  password: z.string().min(1),
  services: z.array(z.string().min(1)).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const { membership } = await requireRole(req, ["OWNER", "ADMIN"]);
    const body = bodySchema.parse(await req.json());

    const config = await prisma.organizationFiscalConfig.findUnique({
      where: { organizationId: membership.organizationId },
    });

    if (!config) {
      return NextResponse.json(
        { error: "Configuracion ARCA inexistente" },
        { status: 400 }
      );
    }

    const services = dedupeServices(
      body.services ?? config.authorizedServices ?? [DEFAULT_ARCA_SERVICE]
    );

    const job = await prisma.arcaConnectionJob.create({
      data: {
        organizationId: membership.organizationId,
        action: "ROTATE",
        status: "PENDING",
        step: "CREATE_CERT",
        services,
        currentServiceIndex: 0,
        taxIdRepresentado: config.taxIdRepresentado,
        taxIdLogin: config.taxIdLogin,
        alias: config.alias,
      },
    });

    setJobPassword(job.id, body.password);

    const updatedJob = await runArcaJob(job.id);

    return NextResponse.json({
      job: updatedJob,
      jobInfo: describeArcaJob(updatedJob),
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Datos invalidos" }, { status: 400 });
    }
    if (isAuthError(error)) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
    const mapped = mapArcaError(error);
    return NextResponse.json(mapped, { status: 400 });
  }
}
