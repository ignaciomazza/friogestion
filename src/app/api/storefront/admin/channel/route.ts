import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth/tenant";
import { WRITE_ROLES } from "@/lib/auth/rbac";
import { storefrontErrorResponse } from "@/lib/storefront/http";
import {
  getStorefrontAdminChannel,
  updateStorefrontAdminChannel,
} from "@/lib/storefront/service";

export const runtime = "nodejs";

const bodySchema = z.object({
  name: z.string().min(2),
  storeName: z.string().min(2),
  supportEmail: z.string().email().optional().nullable(),
  supportPhone: z.string().optional().nullable(),
  pickupAddress: z.string().optional().nullable(),
  currencyCode: z.string().default("ARS"),
  defaultPriceListId: z.string().optional().nullable(),
  allowsCustomerAccounts: z.boolean(),
  customerAccountsMode: z.enum(["prepared", "enabled"]),
  defaultPaymentMethod: z.string().min(1),
  globalPriceAdjustmentPercent: z.coerce.number(),
  normalShippingAmount: z.coerce.number().nonnegative(),
  reserveTtlMinutes: z.coerce.number().int().positive(),
  manualBillingByDefault: z.boolean(),
  productCategories: z.array(z.string().trim().min(1).max(80)).max(24),
  mercadoPagoFeeRegion: z.string().trim().min(1).max(80).optional().nullable(),
  mercadoPagoFeeRules: z.array(
    z.object({
      days: z.coerce.number().int().min(0).max(90),
      netPercent: z.coerce.number().min(0).max(100),
    }),
  ).max(12),
  mercadoPagoDefaultFeeDays: z.coerce.number().int().min(0).max(90).optional().nullable(),
  paymentAdjustments: z.array(
    z.object({
      paymentMethod: z.string().min(1),
      percent: z.coerce.number(),
    }),
  ),
});

export async function GET(request: NextRequest) {
  try {
    const { membership } = await requireRole(request, [...WRITE_ROLES]);
    const [channel, priceLists, apiKeys] = await Promise.all([
      getStorefrontAdminChannel(membership.organizationId),
      prisma.priceList.findMany({
        where: {
          organizationId: membership.organizationId,
          isActive: true,
        },
        orderBy: [{ isConsumerFinal: "desc" }, { sortOrder: "asc" }, { name: "asc" }],
        select: {
          id: true,
          name: true,
          isConsumerFinal: true,
          isDefault: true,
        },
      }),
      prisma.storefrontApiKey.findMany({
        where: { organizationId: membership.organizationId },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          label: true,
          keyPrefix: true,
          isActive: true,
          lastUsedAt: true,
          createdAt: true,
        },
      }),
    ]);

    return NextResponse.json({
      channel,
      priceLists,
      apiKeys,
    });
  } catch (error) {
    return storefrontErrorResponse(error);
  }
}

export async function PUT(request: NextRequest) {
  try {
    const { membership } = await requireRole(request, [...WRITE_ROLES]);
    const body = bodySchema.parse(await request.json());
    const updated = await updateStorefrontAdminChannel(
      membership.organizationId,
      body,
    );
    return NextResponse.json(updated);
  } catch (error) {
    return storefrontErrorResponse(error);
  }
}
