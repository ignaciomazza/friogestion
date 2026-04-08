import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth/tenant";
import { runArcaJob } from "@/lib/arca/jobs";
import { setJobPassword } from "@/lib/arca/password-cache";
import { describeArcaJob, mapArcaError } from "@/lib/arca/errors";
import { isAuthError } from "@/lib/auth/errors";

export const runtime = "nodejs";

const bodySchema = z.object({
  password: z.string().min(1).optional(),
});

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ jobId: string }> }
) {
  try {
    const { membership } = await requireRole(req, ["OWNER", "ADMIN"]);
    const params = await context.params;
    const job = await prisma.arcaConnectionJob.findFirst({
      where: {
        id: params.jobId,
        organizationId: membership.organizationId,
      },
    });

    if (!job) {
      return NextResponse.json(
        { error: "Proceso no encontrado" },
        { status: 404 }
      );
    }

    return NextResponse.json({ job, jobInfo: describeArcaJob(job) });
  } catch {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ jobId: string }> }
) {
  try {
    const { membership } = await requireRole(req, ["OWNER", "ADMIN"]);
    const params = await context.params;
    const body = bodySchema.parse(await req.json());

    const job = await prisma.arcaConnectionJob.findFirst({
      where: {
        id: params.jobId,
        organizationId: membership.organizationId,
      },
    });

    if (!job) {
      return NextResponse.json(
        { error: "Proceso no encontrado" },
        { status: 404 }
      );
    }

    if (body.password) {
      setJobPassword(job.id, body.password);
    }

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
