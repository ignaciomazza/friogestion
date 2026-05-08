import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { prisma } from "@/lib/prisma";
import { requireAuth, requireOrg } from "@/lib/auth/tenant";
import { CommercialPdfDocument } from "@/lib/pdf/commercial";
import { resolveLogoSource } from "@/lib/pdf/assets";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const organizationId = await requireOrg(req);
    await requireAuth(req);
    const id = req.nextUrl.searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "Falta id" }, { status: 400 });
    }

    const quote = await prisma.quote.findFirst({
      where: { id, organizationId },
      include: {
        organization: true,
        customer: true,
        items: { include: { product: true } },
      },
    });

    if (!quote) {
      return NextResponse.json(
        { error: "Presupuesto no encontrado" },
        { status: 404 }
      );
    }

    const config = await prisma.organizationFiscalConfig.findUnique({
      where: { organizationId },
    });

    const logoSrc = await resolveLogoSource({
      logoUrl: config?.logoUrl ?? null,
      logoFilename: config?.logoFilename ?? null,
    });

    const items = quote.items.map((item) => ({
      description: item.product.name,
      sku: item.product.sku ?? null,
      brand: item.product.brand ?? null,
      model: item.product.model ?? null,
      qty: Number(item.qty),
      unitPrice: Number(item.unitPrice),
      total: Number(item.total),
      taxRate: item.taxRate ? Number(item.taxRate) : null,
      taxAmount: item.taxAmount ? Number(item.taxAmount) : null,
    }));

    const quoteTitle = quote.quoteNumber
      ? `Presupuesto ${quote.quoteNumber}`
      : "Presupuesto";

    const doc = (
      <CommercialPdfDocument
        data={{
          title: quoteTitle,
          organization: {
            name: quote.organization.name,
            legalName: quote.organization.legalName,
            taxId: quote.organization.taxId,
          },
          customer: {
            name: quote.customer.displayName,
            taxId: quote.customer.taxId,
            email: quote.customer.email,
            address: quote.customer.address,
          },
          issuedAt: quote.createdAt.toLocaleDateString("es-AR"),
          headerMeta: [
            {
              label: "Vigencia",
              value: quote.validUntil
                ? new Date(quote.validUntil).toLocaleDateString("es-AR")
                : "Sin vencimiento",
            },
          ],
          meta: [],
          items,
          totals: [
            { label: "Subtotal", value: Number(quote.subtotal ?? 0) },
            { label: "Impuestos", value: Number(quote.taxes ?? 0) },
            ...(Number(quote.extraAmount ?? 0) !== 0
              ? [{
                  label:
                    Number(quote.extraAmount ?? 0) > 0
                      ? "Recargos"
                      : "Descuentos",
                  value: Number(quote.extraAmount ?? 0),
                }]
              : []),
            { label: "Total", value: Number(quote.total ?? 0) },
          ],
          currency: "ARS",
          logoSrc,
          taxColumnLabel: "IVA",
          totalColumnLabel: "Neto",
        }}
      />
    );

    const buffer = await renderToBuffer(doc);
    const body = new Uint8Array(buffer);

    return new NextResponse(body, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="presupuesto-${quote.id}.pdf"`,
      },
    });
  } catch {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
}
