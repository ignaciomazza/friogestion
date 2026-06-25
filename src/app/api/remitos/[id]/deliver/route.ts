import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth/tenant";
import { WRITE_ROLES } from "@/lib/auth/rbac";
import { authErrorStatus, isAuthError } from "@/lib/auth/errors";
import { logServerError } from "@/lib/server/log";
import { transitionDeliveryNote } from "@/lib/remitos";
import { mapDeliveryNote } from "@/lib/remitos-response";
import { recordOperationEvent } from "@/lib/operation-events";

export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { membership, payload } = await requireRole(req, [...WRITE_ROLES]);
    const params = await context.params;
    const note = await transitionDeliveryNote({
      organizationId: membership.organizationId,
      id: params.id,
      target: "DELIVERED",
    });
    await recordOperationEvent(prisma, {
      organizationId: membership.organizationId,
      actorUserId: payload.userId,
      entityType: "DELIVERY_NOTE",
      entityId: note.id,
      action: "DELIVERY_NOTE_DELIVERED",
      summary: `Remito ${note.type} ${note.number ?? note.id} entregado`,
      after: {
        status: note.status,
        number: note.number,
        deliveredAt: note.deliveredAt,
      },
    });
    return NextResponse.json(mapDeliveryNote(note));
  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json(
        { error: "No autorizado" },
        { status: authErrorStatus(error) }
      );
    }
    if (error instanceof Error) {
      if (error.message === "DELIVERY_NOTE_NOT_FOUND") {
        return NextResponse.json(
          { error: "Remito no encontrado" },
          { status: 404 }
        );
      }
      if (error.message === "DELIVERY_NOTE_INVALID_TRANSITION") {
        return NextResponse.json(
          { error: "Transicion de estado invalida" },
          { status: 409 }
        );
      }
    }
    logServerError("api.remitos.id.deliver.post", error);
    return NextResponse.json({ error: "No se pudo entregar" }, { status: 400 });
  }
}
