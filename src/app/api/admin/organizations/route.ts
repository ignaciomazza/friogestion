import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth, requireRole } from "@/lib/auth/tenant";
import { createOrganizationWithDefaults } from "@/lib/organizations/bootstrap";

const orgSchema = z.object({
  name: z.string().min(2),
  legalName: z.string().min(2).optional(),
  taxId: z.string().min(6).optional(),
});

export async function GET(req: NextRequest) {
  try {
    const payload = await requireAuth(req);
    const memberships = await prisma.membership.findMany({
      where: { userId: payload.userId },
      include: { organization: true },
      orderBy: { createdAt: "asc" },
    });
    return NextResponse.json(
      memberships.map((membership) => ({
        id: membership.organization.id,
        name: membership.organization.name,
        legalName: membership.organization.legalName,
        taxId: membership.organization.taxId,
      }))
    );
  } catch {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { payload } = await requireRole(req, ["DEVELOPER"]);
    const body = orgSchema.parse(await req.json());

    const organization = await prisma.$transaction(
      async (tx) => {
        const created = await createOrganizationWithDefaults(
          tx,
          {
            name: body.name,
            legalName: body.legalName,
            taxId: body.taxId,
          },
          "admin"
        );

        await tx.membership.create({
          data: {
            organizationId: created.id,
            userId: payload.userId,
            role: "DEVELOPER",
          },
        });

        return created;
      },
      { maxWait: 10_000, timeout: 60_000 }
    );

    return NextResponse.json({
      id: organization.id,
      name: organization.name,
      legalName: organization.legalName,
      taxId: organization.taxId,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Datos invalidos" }, { status: 400 });
    }
    return NextResponse.json({ error: "No se pudo crear" }, { status: 400 });
  }
}
