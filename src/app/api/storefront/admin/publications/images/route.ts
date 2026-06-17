import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth/tenant";
import { WRITE_ROLES } from "@/lib/auth/rbac";
import { prisma } from "@/lib/prisma";
import {
  deleteStorefrontPublicationImage,
  uploadStorefrontPublicationImage,
} from "@/lib/spaces";
import { storefrontErrorResponse } from "@/lib/storefront/http";
import { StorefrontDomainError } from "@/lib/storefront/service";

export const runtime = "nodejs";

const deleteImageSchema = z.object({
  productId: z.string().min(1),
  key: z.string().min(1).max(512),
});

export async function POST(request: NextRequest) {
  try {
    const { membership } = await requireRole(request, [...WRITE_ROLES]);
    const formData = await request.formData();
    const productId = String(formData.get("productId") ?? "").trim();
    const file = formData.get("file");

    if (!productId) {
      throw new StorefrontDomainError("Producto requerido.", 400);
    }
    if (!(file instanceof File)) {
      throw new StorefrontDomainError("Imagen requerida.", 400);
    }

    const product = await prisma.product.findFirst({
      where: {
        id: productId,
        organizationId: membership.organizationId,
      },
      select: {
        id: true,
        name: true,
      },
    });

    if (!product) {
      throw new StorefrontDomainError("Producto no encontrado.", 404);
    }

    const image = await uploadStorefrontPublicationImage({
      organizationId: membership.organizationId,
      productId: product.id,
      file,
      alt: product.name,
    });

    return NextResponse.json({ image });
  } catch (error) {
    return storefrontErrorResponse(error);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { membership } = await requireRole(request, [...WRITE_ROLES]);
    const body = deleteImageSchema.parse(await request.json());

    const product = await prisma.product.findFirst({
      where: {
        id: body.productId,
        organizationId: membership.organizationId,
      },
      select: {
        id: true,
      },
    });

    if (!product) {
      throw new StorefrontDomainError("Producto no encontrado.", 404);
    }

    await deleteStorefrontPublicationImage({
      organizationId: membership.organizationId,
      productId: product.id,
      key: body.key,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return storefrontErrorResponse(error);
  }
}
