import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth/tenant";
import { parseOptionalDate } from "@/lib/validation";

const adjustmentSchema = z.object({
  type: z.enum(["customer", "supplier"]),
  counterpartyId: z.string().min(1),
  direction: z.enum(["DEBIT", "CREDIT"]),
  amount: z.coerce.number().positive(),
  occurredAt: z.string().optional(),
  note: z.string().max(280).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const { membership } = await requireRole(req, ["OWNER", "ADMIN"]);
    const body = adjustmentSchema.parse(await req.json());

    const occurredAtResult = parseOptionalDate(body.occurredAt);
    if (occurredAtResult.error) {
      return NextResponse.json({ error: "Fecha invalida" }, { status: 400 });
    }
    const occurredAt = occurredAtResult.date ?? new Date();

    if (body.type === "customer") {
      const customer = await prisma.customer.findFirst({
        where: {
          id: body.counterpartyId,
          organizationId: membership.organizationId,
        },
        select: { id: true },
      });
      if (!customer) {
        return NextResponse.json(
          { error: "Cliente no encontrado" },
          { status: 404 }
        );
      }

      const entry = await prisma.currentAccountEntry.create({
        data: {
          organizationId: membership.organizationId,
          counterpartyType: "CUSTOMER",
          customerId: body.counterpartyId,
          direction: body.direction,
          sourceType: "ADJUSTMENT",
          amount: body.amount.toFixed(2),
          occurredAt,
          note: body.note?.trim() || null,
        },
      });

      return NextResponse.json({
        id: entry.id,
        occurredAt: entry.occurredAt.toISOString(),
      });
    }

    const supplier = await prisma.supplier.findFirst({
      where: {
        id: body.counterpartyId,
        organizationId: membership.organizationId,
      },
      select: { id: true },
    });
    if (!supplier) {
      return NextResponse.json(
        { error: "Proveedor no encontrado" },
        { status: 404 }
      );
    }

    const entry = await prisma.currentAccountEntry.create({
      data: {
        organizationId: membership.organizationId,
        counterpartyType: "SUPPLIER",
        supplierId: body.counterpartyId,
        direction: body.direction,
        sourceType: "ADJUSTMENT",
        amount: body.amount.toFixed(2),
        occurredAt,
        note: body.note?.trim() || null,
      },
    });

    return NextResponse.json({
      id: entry.id,
      occurredAt: entry.occurredAt.toISOString(),
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Datos invalidos" }, { status: 400 });
    }
    return NextResponse.json(
      { error: "No se pudo registrar" },
      { status: 400 }
    );
  }
}
