import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOrg } from "@/lib/auth/tenant";

export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const organizationId = await requireOrg(req);
    const params = await context.params;
    const invoice = await prisma.fiscalInvoice.findFirst({
      where: { id: params.id, organizationId },
      include: {
        sale: { include: { customer: true } },
      },
    });

    if (!invoice) {
      return NextResponse.json(
        { error: "Factura no encontrada" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      id: invoice.id,
      saleId: invoice.saleId,
      type: invoice.type,
      pointOfSale: invoice.pointOfSale,
      number: invoice.number,
      cae: invoice.cae,
      caeDueDate: invoice.caeDueDate?.toISOString() ?? null,
      issuedAt: invoice.issuedAt?.toISOString() ?? null,
      currencyCode: invoice.currencyCode,
      payloadAfip: invoice.payloadAfip,
      customer: {
        id: invoice.sale.customer.id,
        displayName: invoice.sale.customer.displayName,
        taxId: invoice.sale.customer.taxId,
        email: invoice.sale.customer.email,
        address: invoice.sale.customer.address,
      },
    });
  } catch {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
}
