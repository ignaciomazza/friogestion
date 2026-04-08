import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { hashPassword } from "@/lib/auth/password";
import { requireRole } from "@/lib/auth/tenant";

export const runtime = "nodejs";

const userSchema = z.object({
  email: z.string().email(),
  name: z.string().min(2).optional(),
  role: z.enum(["OWNER", "ADMIN", "SALES", "CASHIER", "VIEWER"]),
  password: z.string().min(8).optional(),
});

const updateSchema = z.object({
  userId: z.string().min(1),
  role: z.enum(["OWNER", "ADMIN", "SALES", "CASHIER", "VIEWER"]).optional(),
  password: z.string().min(8).optional(),
  isActive: z.boolean().optional(),
});

export async function GET(req: NextRequest) {
  try {
    const { membership } = await requireRole(req, ["OWNER", "ADMIN"]);
    const memberships = await prisma.membership.findMany({
      where: { organizationId: membership.organizationId },
      include: { user: true },
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json(
      memberships.map((membership) => ({
        id: membership.user.id,
        email: membership.user.email,
        name: membership.user.name,
        role: membership.role,
      }))
    );
  } catch {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { membership: requester } = await requireRole(req, [
      "OWNER",
      "ADMIN",
    ]);
    const body = userSchema.parse(await req.json());
    if (body.role === "OWNER" && requester.role !== "OWNER") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const existingUser = await prisma.user.findUnique({
      where: { email: body.email },
    });

    if (!existingUser && !body.password) {
      return NextResponse.json(
        { error: "Contraseña requerida para usuarios nuevos" },
        { status: 400 }
      );
    }

    const user =
      existingUser ??
      (await prisma.user.create({
        data: {
          email: body.email,
          name: body.name,
          passwordHash: await hashPassword(body.password as string),
          isActive: true,
        },
      }));

    const existingMembership = await prisma.membership.findUnique({
      where: {
        organizationId_userId: {
          organizationId: requester.organizationId,
          userId: user.id,
        },
      },
    });

    if (existingMembership) {
      return NextResponse.json(
        { error: "El usuario ya pertenece a esta organizacion" },
        { status: 409 }
      );
    }

    const membership = await prisma.membership.create({
      data: {
        organizationId: requester.organizationId,
        userId: user.id,
        role: body.role,
      },
    });

    return NextResponse.json({
      id: user.id,
      email: user.email,
      name: user.name,
      role: membership.role,
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
    const { membership: requester } = await requireRole(req, [
      "OWNER",
      "ADMIN",
    ]);
    const body = updateSchema.parse(await req.json());

    const membership = await prisma.membership.findUnique({
      where: {
        organizationId_userId: {
          organizationId: requester.organizationId,
          userId: body.userId,
        },
      },
      include: { user: true },
    });

    if (!membership) {
      return NextResponse.json(
        { error: "Usuario no encontrado" },
        { status: 404 }
      );
    }

    if (body.role === "OWNER" && requester.role !== "OWNER") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const updates: Prisma.PrismaPromise<unknown>[] = [];

    if (body.role && body.role !== membership.role) {
      updates.push(
        prisma.membership.update({
          where: { id: membership.id },
          data: { role: body.role },
        })
      );
    }

    if (body.password || typeof body.isActive === "boolean") {
      updates.push(
        prisma.user.update({
          where: { id: membership.userId },
          data: {
            ...(body.password
              ? { passwordHash: await hashPassword(body.password) }
              : {}),
            ...(typeof body.isActive === "boolean"
              ? { isActive: body.isActive }
              : {}),
          },
        })
      );
    }

    if (updates.length) {
      await prisma.$transaction(updates);
    }

    const refreshed = await prisma.membership.findUnique({
      where: { id: membership.id },
      include: { user: true },
    });

    if (!refreshed) {
      return NextResponse.json(
        { error: "No se pudo actualizar" },
        { status: 400 }
      );
    }

    return NextResponse.json({
      id: refreshed.user.id,
      email: refreshed.user.email,
      name: refreshed.user.name,
      role: refreshed.role,
      isActive: refreshed.user.isActive,
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
