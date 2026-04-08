import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireOrg, requireRole } from "@/lib/auth/tenant";
import { ROLE_OPTIONS } from "@/lib/labels";

const approvalSchema = z.object({
  roles: z.array(z.enum(ROLE_OPTIONS)).min(1),
});

export async function GET(req: NextRequest) {
  try {
    const organizationId = await requireOrg(req);
    const org = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { receiptApprovalRoles: true },
    });

    return NextResponse.json({
      roles: org?.receiptApprovalRoles ?? [],
    });
  } catch {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { membership } = await requireRole(req, ["OWNER", "ADMIN"]);
    const body = approvalSchema.parse(await req.json());

    const org = await prisma.organization.update({
      where: { id: membership.organizationId },
      data: { receiptApprovalRoles: body.roles },
      select: { receiptApprovalRoles: true },
    });

    return NextResponse.json({ roles: org.receiptApprovalRoles });
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
