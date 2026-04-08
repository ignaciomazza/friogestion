import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth/password";
import { AUTH_COOKIE_NAME, signToken } from "@/lib/auth/jwt";
import { logServerError } from "@/lib/server/log";

export const runtime = "nodejs";

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(2).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const body = registerSchema.parse(await req.json());

    const usersCount = await prisma.user.count();
    if (usersCount > 0) {
      return NextResponse.json(
        { error: "Registro deshabilitado. Solicita alta a un administrador." },
        { status: 403 }
      );
    }

    const existing = await prisma.user.findUnique({
      where: { email: body.email },
      select: { id: true },
    });
    if (existing) {
      return NextResponse.json(
        { error: "Correo ya registrado" },
        { status: 409 }
      );
    }

    const org = await prisma.organization.findFirst({
      orderBy: { createdAt: "asc" },
    });

    if (!org) {
      return NextResponse.json(
        { error: "No hay organizaciones disponibles" },
        { status: 400 }
      );
    }

    const passwordHash = await hashPassword(body.password);
    const user = await prisma.user.create({
      data: {
        email: body.email,
        name: body.name,
        passwordHash,
      },
      select: { id: true, email: true, name: true },
    });

    const membership = await prisma.membership.create({
      data: {
        organizationId: org.id,
        userId: user.id,
        role: "OWNER",
      },
    });

    const token = await signToken({
      userId: user.id,
      activeOrgId: org.id,
      role: membership.role,
    });

    const response = NextResponse.json({
      user,
      activeOrg: { id: org.id, name: org.name },
      role: membership.role,
    });
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
    logServerError("api.auth.register.post", error);
    return NextResponse.json({ error: "Error al registrar" }, { status: 500 });
  }
}
