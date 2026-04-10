import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireOrg, requireRole } from "@/lib/auth/tenant";

const accountSchema = z.object({
  name: z.string().min(2),
  type: z.enum(["CASH", "BANK", "VIRTUAL"]),
  currencyCode: z.string().min(1),
  isActive: z.boolean().optional(),
});

const accountUpdateSchema = accountSchema.extend({
  id: z.string().min(1),
});

export async function GET(req: NextRequest) {
  try {
    const organizationId = await requireOrg(req);
    await prisma.financeAccount.updateMany({
      where: {
        organizationId,
        OR: [
          { bankName: { not: null } },
          { accountNumber: { not: null } },
          { cbu: { not: null } },
          { alias: { not: null } },
        ],
      },
      data: {
        bankName: null,
        accountNumber: null,
        cbu: null,
        alias: null,
      },
    });
    const accounts = await prisma.financeAccount.findMany({
      where: { organizationId },
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json(
      accounts.map((account) => ({
        id: account.id,
        name: account.name,
        type: account.type,
        currencyCode: account.currencyCode,
        bankName: account.bankName,
        accountNumber: account.accountNumber,
        cbu: account.cbu,
        alias: account.alias,
        isActive: account.isActive,
      }))
    );
  } catch {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { membership } = await requireRole(req, ["OWNER", "ADMIN"]);
    const body = accountSchema.parse(await req.json());

    const account = await prisma.financeAccount.create({
      data: {
        organizationId: membership.organizationId,
        name: body.name.trim(),
        type: body.type,
        currencyCode: body.currencyCode.trim().toUpperCase(),
        bankName: null,
        accountNumber: null,
        cbu: null,
        alias: null,
        isActive: body.isActive ?? true,
      },
    });

    return NextResponse.json({
      id: account.id,
      name: account.name,
      type: account.type,
      currencyCode: account.currencyCode,
      bankName: account.bankName,
      accountNumber: account.accountNumber,
      cbu: account.cbu,
      alias: account.alias,
      isActive: account.isActive,
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
    const body = accountUpdateSchema.parse(await req.json());

    const existing = await prisma.financeAccount.findFirst({
      where: { id: body.id, organizationId: membership.organizationId },
      select: { id: true },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Cuenta no encontrada" },
        { status: 404 }
      );
    }

    const account = await prisma.financeAccount.update({
      where: { id: body.id },
      data: {
        name: body.name.trim(),
        type: body.type,
        currencyCode: body.currencyCode.trim().toUpperCase(),
        bankName: null,
        accountNumber: null,
        cbu: null,
        alias: null,
        isActive: body.isActive ?? true,
      },
    });

    return NextResponse.json({
      id: account.id,
      name: account.name,
      type: account.type,
      currencyCode: account.currencyCode,
      bankName: account.bankName,
      accountNumber: account.accountNumber,
      cbu: account.cbu,
      alias: account.alias,
      isActive: account.isActive,
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

export async function DELETE(req: NextRequest) {
  try {
    const { membership } = await requireRole(req, ["OWNER", "ADMIN"]);
    const id = req.nextUrl.searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "Falta id" }, { status: 400 });
    }

    const existing = await prisma.financeAccount.findFirst({
      where: { id, organizationId: membership.organizationId },
      select: { id: true },
    });

    if (!existing) {
      return NextResponse.json({ error: "Cuenta no encontrada" }, { status: 404 });
    }

    await prisma.financeAccount.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2003"
    ) {
      return NextResponse.json(
        { error: "Cuenta con movimientos asociados" },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: "No se pudo eliminar" }, { status: 400 });
  }
}
