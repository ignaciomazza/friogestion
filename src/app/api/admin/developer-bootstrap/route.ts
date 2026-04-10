import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth/tenant";
import { hashPassword } from "@/lib/auth/password";
import {
  createOrganizationWithDefaults,
  ensureOrganizationDefaults,
} from "@/lib/organizations/bootstrap";

export const runtime = "nodejs";

const bootstrapSchema = z.object({
  email: z.string().email(),
  name: z.string().min(2).optional(),
  password: z.string().min(8).optional(),
  organizationName: z.string().min(2),
  organizationLegalName: z.string().min(2).optional(),
  organizationTaxId: z.string().min(6).optional(),
  grantCurrentUserAccess: z.boolean().optional(),
});

function generatePassword() {
  return randomBytes(12).toString("base64url");
}

export async function POST(req: NextRequest) {
  try {
    const { payload } = await requireRole(req, ["DEVELOPER"]);
    const body = bootstrapSchema.parse(await req.json());

    const normalizedEmail = body.email.trim().toLowerCase();
    const organizationName = body.organizationName.trim();
    const organizationLegalName = body.organizationLegalName?.trim() || undefined;
    const organizationTaxId = body.organizationTaxId?.trim() || undefined;
    const developerName = body.name?.trim() || undefined;
    const grantCurrentUserAccess = body.grantCurrentUserAccess ?? true;

    const existingUser = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true, email: true, name: true, isActive: true },
    });

    const shouldCreateUser = !existingUser;
    const generatedPassword =
      shouldCreateUser && !body.password ? generatePassword() : null;
    const passwordForCreate = body.password ?? generatedPassword;

    if (shouldCreateUser && !passwordForCreate) {
      return NextResponse.json(
        { error: "Contraseña requerida para usuario nuevo" },
        { status: 400 }
      );
    }

    const result = await prisma.$transaction(
      async (tx) => {
        let user = existingUser;
        if (!user) {
          user = await tx.user.create({
            data: {
              email: normalizedEmail,
              name: developerName,
              passwordHash: await hashPassword(passwordForCreate as string),
              isActive: true,
            },
            select: { id: true, email: true, name: true, isActive: true },
          });
        } else if (!user.isActive || (developerName && developerName !== user.name)) {
          user = await tx.user.update({
            where: { id: user.id },
            data: {
              ...(user.isActive ? {} : { isActive: true }),
              ...(developerName ? { name: developerName } : {}),
            },
            select: { id: true, email: true, name: true, isActive: true },
          });
        }

        let organization = await tx.organization.findFirst({
          where: { name: organizationName },
          select: {
            id: true,
            name: true,
            legalName: true,
            taxId: true,
          },
        });

        if (!organization) {
          const created = await createOrganizationWithDefaults(
            tx,
            {
              name: organizationName,
              legalName: organizationLegalName,
              taxId: organizationTaxId,
            },
            "developer-bootstrap"
          );
          organization = {
            id: created.id,
            name: created.name,
            legalName: created.legalName,
            taxId: created.taxId,
          };
        } else {
          await ensureOrganizationDefaults(tx, organization.id, "developer-bootstrap");
        }

        await tx.membership.upsert({
          where: {
            organizationId_userId: {
              organizationId: organization.id,
              userId: user.id,
            },
          },
          update: { role: "DEVELOPER" },
          create: {
            organizationId: organization.id,
            userId: user.id,
            role: "DEVELOPER",
          },
        });

        if (grantCurrentUserAccess && payload.userId !== user.id) {
          await tx.membership.upsert({
            where: {
              organizationId_userId: {
                organizationId: organization.id,
                userId: payload.userId,
              },
            },
            update: { role: "DEVELOPER" },
            create: {
              organizationId: organization.id,
              userId: payload.userId,
              role: "DEVELOPER",
            },
          });
        }

        return { user, organization };
      },
      { maxWait: 10_000, timeout: 60_000 }
    );

    return NextResponse.json({
      ok: true,
      user: {
        id: result.user.id,
        email: result.user.email,
        name: result.user.name,
        wasCreated: shouldCreateUser,
      },
      organization: result.organization,
      temporaryPassword: generatedPassword,
      message: shouldCreateUser
        ? "Developer creado con su empresa de testing"
        : "Usuario existente vinculado con empresa de testing",
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Datos invalidos" }, { status: 400 });
    }
    if (error instanceof Error) {
      if (error.message === "UNAUTHORIZED") {
        return NextResponse.json({ error: "No autorizado" }, { status: 401 });
      }
      if (error.message === "FORBIDDEN" || error.message === "NO_ACTIVE_ORG") {
        return NextResponse.json({ error: "Sin permisos" }, { status: 403 });
      }
    }
    return NextResponse.json(
      { error: "No se pudo bootstrapear el usuario developer" },
      { status: 400 }
    );
  }
}
