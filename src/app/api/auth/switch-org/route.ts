import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth/tenant";
import { AUTH_COOKIE_NAME, signToken } from "@/lib/auth/jwt";

const switchSchema = z.object({
  organizationId: z.string().min(1),
});

export async function POST(req: NextRequest) {
  try {
    const payload = await requireAuth(req);
    const body = switchSchema.parse(await req.json());

    const membership = await prisma.membership.findUnique({
      where: {
        organizationId_userId: {
          organizationId: body.organizationId,
          userId: payload.userId,
        },
      },
    });

    if (!membership) {
      return NextResponse.json(
        { error: "Sin acceso a la organizacion" },
        { status: 403 }
      );
    }

    const token = await signToken({
      userId: payload.userId,
      activeOrgId: body.organizationId,
      role: membership.role,
    });

    const response = NextResponse.json({ ok: true });
    response.cookies.set({
      name: AUTH_COOKIE_NAME,
      value: token,
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 60 * 24 * 7,
    });

    return response;
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Datos invalidos" }, { status: 400 });
    }
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
}
