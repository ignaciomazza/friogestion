import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOrg, requireRole } from "@/lib/auth/tenant";
import {
  resolveReceiptDoubleCheckRoles,
} from "@/lib/auth/receipt-controls";

export async function GET(req: NextRequest) {
  try {
    const organizationId = await requireOrg(req);
    const org = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { receiptDoubleCheckRoles: true },
    });
    const allowedRoles = resolveReceiptDoubleCheckRoles(
      org?.receiptDoubleCheckRoles
    );
    await requireRole(req, allowedRoles);

    const movements = await prisma.accountMovement.findMany({
      where: {
        organizationId,
        direction: "IN",
        receiptLineId: { not: null },
        verifiedAt: null,
      },
      include: {
        account: true,
        receiptLine: {
          include: {
            paymentMethod: true,
            receipt: {
              include: {
                sale: { include: { customer: true } },
                customer: true,
              },
            },
          },
        },
      },
      orderBy: { occurredAt: "desc" },
      take: 200,
    });

    return NextResponse.json(
      movements.map((movement) => {
        const receipt = movement.receiptLine?.receipt;
        const sale = receipt?.sale;
        const customer = sale?.customer ?? receipt?.customer ?? null;
        return {
          id: movement.id,
          occurredAt: movement.occurredAt.toISOString(),
          amount: movement.amount.toString(),
          currencyCode: movement.currencyCode,
          accountName: movement.account.name,
          paymentMethodName:
            movement.receiptLine?.paymentMethod.name ?? "Desconocido",
          saleId: sale?.id ?? null,
          saleNumber: sale?.saleNumber ?? null,
          customerName: customer?.displayName ?? null,
          receiptId: receipt?.id ?? null,
          receiptNumber: receipt?.receiptNumber ?? null,
          note: movement.note ?? null,
        };
      })
    );
  } catch {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
}
