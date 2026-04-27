import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth/tenant";
import { FiscalPdfDocument } from "@/lib/pdf/fiscal";
import { resolveLogoSource } from "@/lib/pdf/assets";
import {
  CUSTOMER_FISCAL_TAX_PROFILE_LABELS,
  normalizeCustomerFiscalTaxProfile,
} from "@/lib/customers/fiscal-profile";

export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { membership } = await requireRole(req, [
      "OWNER",
      "ADMIN",
      "SALES",
      "CASHIER",
    ]);
    const params = await context.params;

    const invoice = await prisma.fiscalInvoice.findFirst({
      where: { id: params.id, organizationId: membership.organizationId },
      include: {
        sale: {
          include: {
            customer: true,
            items: { include: { product: true } },
          },
        },
        organization: true,
      },
    });

    if (!invoice) {
      return NextResponse.json(
        { error: "Factura no encontrada" },
        { status: 404 }
      );
    }

    const config = await prisma.organizationFiscalConfig.findUnique({
      where: { organizationId: membership.organizationId },
    });

    const payload = invoice.payloadAfip as Record<string, unknown> | null;
    const voucherData =
      payload && typeof payload === "object"
        ? (payload.voucherData as Record<string, unknown>)
        : {};

    const logoSrc = await resolveLogoSource({
      logoUrl: config?.logoUrl ?? null,
      logoFilename: config?.logoFilename ?? null,
    });
    const receiverFiscalProfile = normalizeCustomerFiscalTaxProfile(
      invoice.sale.customer.fiscalTaxProfile
    );
    const receiverFiscalCondition = receiverFiscalProfile
      ? CUSTOMER_FISCAL_TAX_PROFILE_LABELS[receiverFiscalProfile]
      : null;
    const iva = Number(voucherData.ImpIVA ?? 0);
    const otherTaxes = Number(voucherData.ImpTrib ?? 0);

    const items = invoice.sale.items.map((item) => ({
      description: item.product.name,
      qty: Number(item.qty),
      unitPrice: Number(item.unitPrice),
      total: Number(item.total),
      taxRate: item.taxRate ? Number(item.taxRate) : null,
      taxAmount: item.taxAmount ? Number(item.taxAmount) : null,
    }));

    const doc = (
      <FiscalPdfDocument
        data={{
          title: `Factura ${invoice.type ?? ""}`.trim(),
          issuer: {
            name: invoice.organization.name,
            legalName: invoice.organization.legalName ?? undefined,
            taxId:
              invoice.organization.taxId ??
              config?.taxIdRepresentado ??
              undefined,
          },
          receiver: {
            name: invoice.sale.customer.displayName,
            legalName: invoice.sale.customer.legalName ?? undefined,
            taxId: invoice.sale.customer.taxId ?? undefined,
            address: invoice.sale.customer.address ?? undefined,
            email: invoice.sale.customer.email ?? undefined,
            phone: invoice.sale.customer.phone ?? undefined,
            fiscalCondition: receiverFiscalCondition ?? undefined,
          },
          voucher: {
            pointOfSale: invoice.pointOfSale,
            number: invoice.number,
            issuedAt: invoice.issuedAt?.toLocaleDateString("es-AR") ?? null,
            cae: invoice.cae,
            caeDueDate: invoice.caeDueDate?.toLocaleDateString("es-AR") ?? null,
            currencyCode: invoice.currencyCode ?? "ARS",
            total: Number(voucherData.ImpTotal ?? invoice.sale.total ?? 0),
            net: Number(voucherData.ImpNeto ?? 0),
            iva,
            exempt: Number(voucherData.ImpOpEx ?? 0),
            otherTaxes,
            serviceDates:
              payload && typeof payload === "object"
                ? (payload.serviceDates as {
                    from: string;
                    to: string;
                    due?: string | null;
                  } | null)
                : null,
          },
          items,
          transparency: {
            enabled: receiverFiscalProfile === "CONSUMIDOR_FINAL",
            ivaContained: iva,
            otherNationalIndirectTaxes: otherTaxes,
          },
          logoSrc,
          qrBase64:
            payload && typeof payload === "object"
              ? (payload.qrBase64 as string | null)
              : null,
        }}
      />
    );

    const buffer = await renderToBuffer(doc);
    const body = new Uint8Array(buffer);

    return new NextResponse(body, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="factura-${invoice.id}.pdf"`,
      },
    });
  } catch {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
}
