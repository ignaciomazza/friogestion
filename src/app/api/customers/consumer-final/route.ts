import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth/tenant";
import { WRITE_ROLES } from "@/lib/auth/rbac";
import { authErrorStatus, isAuthError } from "@/lib/auth/errors";
import { logServerError } from "@/lib/server/log";
import {
  CONSUMER_FINAL_DEFAULT_NAME,
  CUSTOMER_SYSTEM_KEYS,
} from "@/lib/customers/system-keys";

export async function POST(req: NextRequest) {
  try {
    const { membership } = await requireRole(req, [...WRITE_ROLES]);
    const organizationId = membership.organizationId;

    const customer = await prisma.customer.upsert({
      where: {
        organizationId_systemKey: {
          organizationId,
          systemKey: CUSTOMER_SYSTEM_KEYS.CONSUMER_FINAL_ANON,
        },
      },
      create: {
        organizationId,
        systemKey: CUSTOMER_SYSTEM_KEYS.CONSUMER_FINAL_ANON,
        displayName: CONSUMER_FINAL_DEFAULT_NAME,
        type: "CONSUMER_FINAL",
      },
      update: {
        type: "CONSUMER_FINAL",
      },
    });

    return NextResponse.json({
      id: customer.id,
      displayName: customer.displayName,
      legalName: customer.legalName,
      taxId: customer.taxId,
      email: customer.email,
      phone: customer.phone,
      address: customer.address,
      type: customer.type,
      systemKey: customer.systemKey,
      defaultPriceListId: customer.defaultPriceListId,
    });
  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json(
        { error: "No autorizado" },
        { status: authErrorStatus(error) }
      );
    }
    logServerError("api.customers.consumer-final.post", error);
    return NextResponse.json(
      { error: "No se pudo resolver consumidor final" },
      { status: 400 }
    );
  }
}
