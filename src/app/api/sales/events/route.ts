import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth, requireOrg, requireRole } from "@/lib/auth/tenant";

const saleEventSchema = z.object({
  saleId: z.string().min(1),
  action: z.string().min(2),
  note: z.string().max(280).optional(),
});

export async function GET(req: NextRequest) {
  try {
    const { membership } = await requireRole(req, ["OWNER", "ADMIN"]);
    const events = await prisma.saleEvent.findMany({
      where: { organizationId: membership.organizationId },
      include: {
        sale: { include: { customer: true } },
        actor: { select: { name: true, email: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 60,
    });

    return NextResponse.json(
      events.map((event) => ({
        id: event.id,
        saleId: event.saleId,
        saleNumber: event.sale.saleNumber,
        customerName: event.sale.customer.displayName,
        action: event.action,
        note: event.note ?? null,
        actorName: event.actor?.name ?? null,
        actorEmail: event.actor?.email ?? null,
        createdAt: event.createdAt.toISOString(),
      }))
    );
  } catch {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const organizationId = await requireOrg(req);
    const payload = await requireAuth(req);
    const body = saleEventSchema.parse(await req.json());

    const sale = await prisma.sale.findFirst({
      where: { id: body.saleId, organizationId },
      select: { id: true },
    });

    if (!sale) {
      return NextResponse.json(
        { error: "Venta no encontrada" },
        { status: 404 }
      );
    }

    const event = await prisma.saleEvent.create({
      data: {
        organizationId,
        saleId: body.saleId,
        actorUserId: payload.userId,
        action: body.action,
        note: body.note || undefined,
      },
    });

    return NextResponse.json({ id: event.id });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Datos invalidos" }, { status: 400 });
    }
    return NextResponse.json({ error: "No se pudo guardar" }, { status: 400 });
  }
}
