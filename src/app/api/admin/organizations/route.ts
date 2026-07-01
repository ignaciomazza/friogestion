import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth, requireRole } from "@/lib/auth/tenant";
import { authErrorStatus, isAuthError } from "@/lib/auth/errors";
import { createOrganizationWithDefaults } from "@/lib/organizations/bootstrap";
import { parseOptionalDate } from "@/lib/validation";

const orgSchema = z.object({
  name: z.string().min(2),
  legalName: z.string().min(2).optional(),
  taxId: z.string().min(6).optional(),
});

const orgSettingsSchema = z.object({
  adjustStockOnQuoteConfirm: z.boolean().optional(),
  singleCostInputInPrices: z.boolean().optional(),
  address: z.string().max(200).nullable().optional(),
  phone: z.string().max(80).nullable().optional(),
  email: z.string().max(160).nullable().optional(),
  activityStart: z.string().max(10).nullable().optional(),
  website: z.string().max(200).nullable().optional(),
  socialMedia: z.string().max(240).nullable().optional(),
}).refine((value) => Object.keys(value).length > 0, {
  message: "Sin cambios",
});

function normalizeNullableText(value: string | null | undefined) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const normalized = value.trim();
  return normalized.length ? normalized : null;
}

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
        address: membership.organization.address,
        phone: membership.organization.phone,
        email: membership.organization.email,
        activityStart: membership.organization.activityStart?.toISOString() ?? null,
        website: membership.organization.website,
        socialMedia: membership.organization.socialMedia,
        singleCostInputInPrices: membership.organization.singleCostInputInPrices,
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
      address: organization.address,
      phone: organization.phone,
      email: organization.email,
      activityStart: organization.activityStart?.toISOString() ?? null,
      website: organization.website,
      socialMedia: organization.socialMedia,
      singleCostInputInPrices: organization.singleCostInputInPrices,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Datos invalidos" }, { status: 400 });
    }
    return NextResponse.json({ error: "No se pudo crear" }, { status: 400 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { membership } = await requireRole(req, ["OWNER", "ADMIN"]);
    const body = orgSettingsSchema.parse(await req.json());
    const updateData: {
      adjustStockOnQuoteConfirm?: boolean;
      singleCostInputInPrices?: boolean;
      address?: string | null;
      phone?: string | null;
      email?: string | null;
      activityStart?: Date | null;
      website?: string | null;
      socialMedia?: string | null;
    } = {};

    if (typeof body.adjustStockOnQuoteConfirm === "boolean") {
      updateData.adjustStockOnQuoteConfirm = body.adjustStockOnQuoteConfirm;
    }
    if (typeof body.singleCostInputInPrices === "boolean") {
      updateData.singleCostInputInPrices = body.singleCostInputInPrices;
    }

    const address = normalizeNullableText(body.address);
    const phone = normalizeNullableText(body.phone);
    const email = normalizeNullableText(body.email);
    const activityStart = body.activityStart;
    const website = normalizeNullableText(body.website);
    const socialMedia = normalizeNullableText(body.socialMedia);

    if (address !== undefined) updateData.address = address;
    if (phone !== undefined) updateData.phone = phone;
    if (email !== undefined) updateData.email = email;
    if (activityStart !== undefined) {
      if (activityStart === null) {
        updateData.activityStart = null;
      } else {
        const parsedActivityStart = parseOptionalDate(activityStart);
        if (parsedActivityStart.error || !parsedActivityStart.date) {
          return NextResponse.json(
            { error: "Fecha de inicio de actividad invalida" },
            { status: 400 },
          );
        }
        updateData.activityStart = parsedActivityStart.date;
      }
    }
    if (website !== undefined) updateData.website = website;
    if (socialMedia !== undefined) updateData.socialMedia = socialMedia;

    if (!Object.keys(updateData).length) {
      return NextResponse.json({ error: "Sin cambios" }, { status: 400 });
    }

    const organization = await prisma.organization.update({
      where: { id: membership.organizationId },
      data: updateData,
      select: {
        id: true,
        adjustStockOnQuoteConfirm: true,
        singleCostInputInPrices: true,
        address: true,
        phone: true,
        email: true,
        activityStart: true,
        website: true,
        socialMedia: true,
      },
    });

    return NextResponse.json(organization);
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
    return NextResponse.json(
      { error: "No se pudo guardar configuracion" },
      { status: 400 }
    );
  }
}
