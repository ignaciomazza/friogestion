import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireOrg, requireRole } from "@/lib/auth/tenant";

const deliveryNotesSchema = z.object({
  defaultPointOfSale: z.coerce.number().int().positive(),
});

export async function GET(req: NextRequest) {
  try {
    const organizationId = await requireOrg(req);
    const org = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { defaultDeliveryNotePointOfSale: true },
    });

    return NextResponse.json({
      defaultPointOfSale: org?.defaultDeliveryNotePointOfSale ?? 1,
    });
  } catch {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { membership } = await requireRole(req, ["OWNER", "ADMIN"]);
    const body = deliveryNotesSchema.parse(await req.json());

    const org = await prisma.organization.update({
      where: { id: membership.organizationId },
      data: { defaultDeliveryNotePointOfSale: body.defaultPointOfSale },
      select: { defaultDeliveryNotePointOfSale: true },
    });

    return NextResponse.json({
      defaultPointOfSale: org.defaultDeliveryNotePointOfSale,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Datos invalidos" }, { status: 400 });
    }
    return NextResponse.json(
      { error: "No se pudo actualizar" },
      { status: 400 }
    );
  }
}
