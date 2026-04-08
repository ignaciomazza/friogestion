import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth/tenant";
import { hasValidSecretsKey } from "@/lib/crypto/secrets";
import { runArcaJob } from "@/lib/arca/jobs";
import { setJobPassword } from "@/lib/arca/password-cache";
import {
  DEFAULT_ARCA_SERVICE,
  dedupeServices,
  normalizeCuit,
  sanitizeAlias,
} from "@/lib/arca/utils";
import { describeArcaJob, mapArcaError } from "@/lib/arca/errors";
import { isAuthError } from "@/lib/auth/errors";

export const runtime = "nodejs";

const bodySchema = z.object({
  taxIdRepresentado: z.string().min(1),
  taxIdLogin: z.string().min(1),
  alias: z.string().min(1),
  password: z.string().min(1),
  services: z.array(z.string().min(1)).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const { membership } = await requireRole(req, ["OWNER", "ADMIN"]);
    const body = bodySchema.parse(await req.json());

    if (!hasValidSecretsKey()) {
      return NextResponse.json(
        { error: "ARCA_SECRETS_KEY invalida" },
        { status: 400 }
      );
    }

    const taxIdRepresentado = normalizeCuit(body.taxIdRepresentado);
    const taxIdLogin = normalizeCuit(body.taxIdLogin);
    const alias = sanitizeAlias(body.alias);

    if (!taxIdRepresentado || !taxIdLogin) {
      return NextResponse.json({ error: "CUIT invalido" }, { status: 400 });
    }

    if (!alias) {
      return NextResponse.json({ error: "Alias invalido" }, { status: 400 });
    }

    const services = dedupeServices(body.services ?? [DEFAULT_ARCA_SERVICE]);
    const job = await prisma.arcaConnectionJob.create({
      data: {
        organizationId: membership.organizationId,
        action: "CONNECT",
        status: "PENDING",
        step: "CREATE_CERT",
        services,
        currentServiceIndex: 0,
        taxIdRepresentado,
        taxIdLogin,
        alias,
      },
    });

    await prisma.organizationFiscalConfig.upsert({
      where: { organizationId: membership.organizationId },
      create: {
        organizationId: membership.organizationId,
        taxIdRepresentado,
        taxIdLogin,
        alias,
        authorizedServices: [],
        status: "PENDING",
      },
      update: {
        taxIdRepresentado,
        taxIdLogin,
        alias,
        status: "PENDING",
        lastError: null,
      },
    });

    setJobPassword(job.id, body.password);

    const updatedJob = await runArcaJob(job.id);
    const jobInfo = describeArcaJob(updatedJob);

    return NextResponse.json({ job: updatedJob, jobInfo });
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
