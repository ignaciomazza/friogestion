import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth, requireRole } from "@/lib/auth/tenant";

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
    const { payload } = await requireRole(req, ["OWNER"]);
    const body = orgSchema.parse(await req.json());

    const organization = await prisma.organization.create({
      data: {
        name: body.name,
        legalName: body.legalName,
        taxId: body.taxId,
        receiptApprovalRoles: ["OWNER"],
      },
    });

    await prisma.$transaction([
      prisma.membership.create({
        data: {
          organizationId: organization.id,
          userId: payload.userId,
          role: "OWNER",
        },
      }),
      prisma.financeCurrency.createMany({
        data: [
          {
            organizationId: organization.id,
            code: "ARS",
            name: "Peso Argentino",
            symbol: "$",
            isDefault: true,
            isActive: true,
          },
          {
            organizationId: organization.id,
            code: "USD",
            name: "Dolar USA",
            symbol: "US$",
            isDefault: false,
            isActive: true,
          },
        ],
      }),
      prisma.exchangeRate.create({
        data: {
          organizationId: organization.id,
          baseCode: "USD",
          quoteCode: "ARS",
          rate: "1200.00",
          source: "admin",
        },
      }),
      prisma.financeAccount.createMany({
        data: [
          {
            organizationId: organization.id,
            name: "Caja ARS",
            type: "CASH",
            currencyCode: "ARS",
            isActive: true,
          },
          {
            organizationId: organization.id,
            name: "Banco ARS",
            type: "BANK",
            currencyCode: "ARS",
            isActive: true,
          },
        ],
      }),
      prisma.paymentMethod.createMany({
        data: [
          {
            organizationId: organization.id,
            name: "Efectivo",
            type: "CASH",
            requiresAccount: false,
            requiresApproval: false,
            isActive: true,
          },
          {
            organizationId: organization.id,
            name: "Transferencia",
            type: "TRANSFER",
            requiresAccount: true,
            requiresApproval: false,
            isActive: true,
          },
        ],
      }),
      prisma.priceList.create({
        data: {
          organizationId: organization.id,
          name: "Lista General",
          currencyCode: "ARS",
          isDefault: true,
          isActive: true,
        },
      }),
    ]);

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
