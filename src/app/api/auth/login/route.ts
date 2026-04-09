import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/auth/password";
import { AUTH_COOKIE_NAME, signToken } from "@/lib/auth/jwt";
import { logServerError } from "@/lib/server/log";

export const runtime = "nodejs";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export async function POST(req: NextRequest) {
  try {
    const body = loginSchema.parse(await req.json());
    const user = await prisma.user.findUnique({
      where: { email: body.email },
      select: {
        id: true,
        email: true,
        name: true,
        passwordHash: true,
        isActive: true,
      },
    });

    if (
      !user ||
      !user.isActive ||
      !(await verifyPassword(body.password, user.passwordHash))
    ) {
      return NextResponse.json(
        { error: "Credenciales invalidas" },
        { status: 401 }
      );
    }

    const memberships = await prisma.membership.findMany({
      where: { userId: user.id },
      include: { organization: true },
      orderBy: { createdAt: "asc" },
    });

    if (!memberships.length) {
      return NextResponse.json(
        { error: "Sin organizaciones asignadas" },
        { status: 403 }
      );
    }

    const active = memberships[0];

    const token = await signToken({
      userId: user.id,
      activeOrgId: active.organizationId,
      role: active.role,
    });

    const response = NextResponse.json({
      user: { id: user.id, email: user.email, name: user.name },
      activeOrg: {
        id: active.organization.id,
        name: active.organization.name,
      },
      role: active.role,
      organizations: memberships.map((membership) => ({
        id: membership.organization.id,
        name: membership.organization.name,
        legalName: membership.organization.legalName,
      })),
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
    logServerError("api.auth.login.post", error);
    return NextResponse.json({ error: "Error al iniciar sesion" }, { status: 500 });
  }
}
