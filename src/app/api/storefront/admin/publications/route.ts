import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth/tenant";
import { WRITE_ROLES } from "@/lib/auth/rbac";
import { storefrontErrorResponse } from "@/lib/storefront/http";
import {
  listStorefrontAdminPublications,
  upsertStorefrontAdminPublication,
} from "@/lib/storefront/service";

export const runtime = "nodejs";

const imageSchema = z.object({
  url: z.string().min(1).max(2048),
  alt: z.string().max(180).default(""),
  key: z.string().max(512).optional(),
});

const bodySchema = z.object({
  productId: z.string().min(1),
  slug: z.string().optional().nullable(),
  publicationStatus: z.enum(["PUBLISHED", "PAUSED"]),
  publicName: z.string().min(2),
  shortDescription: z.string().default(""),
  longDescription: z.string().default(""),
  category: z.string().min(1),
  featured: z.boolean(),
  shippingType: z.enum([
    "NORMAL",
    "PICKUP",
    "OWN_DELIVERY",
    "QUOTE",
    "RESTRICTED",
  ]),
  normalShippingOverrideAmount: z.coerce.number().nonnegative().optional().nullable(),
  stockMode: z.enum(["STRICT", "CONSULT", "BACKORDER", "OUT_OF_STOCK"]),
  webStockAvailable: z.coerce.number().int().nonnegative(),
  pricingMode: z.enum(["AUTO", "FIXED"]),
  fixedFinalPrice: z.coerce.number().nonnegative().optional().nullable(),
  priceAdjustmentPercent: z.coerce.number(),
  mercadoPagoFeeDays: z.coerce.number().int().min(0).max(90).optional().nullable(),
  billingMode: z.enum(["DEFAULT", "MANUAL", "AUTO"]),
  images: z.array(imageSchema).max(12).optional(),
  flags: z
    .object({
      hasGas: z.boolean().optional(),
      hasPressure: z.boolean().optional(),
      isFlammable: z.boolean().optional(),
      hasSpecialLogistics: z.boolean().optional(),
    })
    .optional(),
});

export async function GET(request: NextRequest) {
  try {
    const { membership } = await requireRole(request, [...WRITE_ROLES]);
    const query = request.nextUrl.searchParams.get("q")?.trim() || undefined;
    const rows = await listStorefrontAdminPublications(
      membership.organizationId,
      query,
    );
    return NextResponse.json(rows);
  } catch (error) {
    return storefrontErrorResponse(error);
  }
}

export async function PUT(request: NextRequest) {
  try {
    const { membership } = await requireRole(request, [...WRITE_ROLES]);
    const body = bodySchema.parse(await request.json());
    const publication = await upsertStorefrontAdminPublication(
      membership.organizationId,
      body,
    );
    return NextResponse.json(publication);
  } catch (error) {
    return storefrontErrorResponse(error);
  }
}
