import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth/tenant";
import { FiscalPdfDocument } from "@/lib/pdf/fiscal";
import { resolveLogoSource } from "@/lib/pdf/assets";
import { resolveIssuerTaxpayerSummary } from "@/lib/pdf/issuer-taxpayer";
import { resolveSalePaymentMethodLabel } from "@/lib/sales/payment-method";
import {
  CUSTOMER_FISCAL_TAX_PROFILE_LABELS,
  isConsumerFinalFiscalTaxProfile,
  normalizeCustomerFiscalTaxProfile,
} from "@/lib/customers/fiscal-profile";
import { resolvePdfShareOrganizationId } from "@/lib/pdf/share-token";

export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const params = await context.params;
    let organizationId: string | null = null;

    try {
      organizationId = await resolvePdfShareOrganizationId(
        req,
        "fiscalInvoice",
        params.id,
      );
    } catch {
      organizationId = null;
    }

    if (!organizationId) {
      try {
        organizationId = (
          await requireRole(req, [
            "OWNER",
            "ADMIN",
            "SALES",
            "CASHIER",
          ])
        ).membership.organizationId;
      } catch {
        organizationId = null;
      }
    }

    const invoice = await prisma.fiscalInvoice.findFirst({
      where: organizationId
        ? { id: params.id, organizationId }
        : { id: params.id },
      include: {
        sale: {
          include: {
            customer: true,
            items: { include: { product: true } },
            receipts: {
              where: { status: "CONFIRMED" },
              select: {
                lines: {
                  select: {
                    paymentMethod: {
                      select: { name: true },
                    },
                  },
                },
              },
            },
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

    const invoiceOrganizationId = invoice.organizationId;
    const config = await prisma.organizationFiscalConfig.findUnique({
      where: { organizationId: invoiceOrganizationId },
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
    const hideTaxBreakdown =
      isConsumerFinalFiscalTaxProfile(receiverFiscalProfile);
    const iva = Number(voucherData.ImpIVA ?? 0);
    const otherTaxes = Number(voucherData.ImpTrib ?? 0);
    const issuerTaxId =
      invoice.organization.taxId ?? config?.taxIdRepresentado ?? null;
    const manualIssuerActivityStart =
      invoice.organization.activityStart?.toLocaleDateString("es-AR") ?? null;
    const issuerTaxpayer = await resolveIssuerTaxpayerSummary({
      organizationId: invoiceOrganizationId,
      taxId: issuerTaxId,
    });
    const paymentMethod = resolveSalePaymentMethodLabel({
      paymentStatus: invoice.sale.paymentStatus,
      receipts: invoice.sale.receipts,
    });

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
            taxId: issuerTaxId ?? undefined,
            fiscalCondition: issuerTaxpayer.fiscalCondition ?? undefined,
            activityStart:
              manualIssuerActivityStart ??
              issuerTaxpayer.activityStart ??
              undefined,
            address: invoice.organization.address ?? undefined,
            email: invoice.organization.email ?? undefined,
            phone: invoice.organization.phone ?? undefined,
            website: invoice.organization.website ?? undefined,
            socialMedia: invoice.organization.socialMedia ?? undefined,
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
          transparency: null,
          logoSrc,
          qrBase64:
            payload && typeof payload === "object"
              ? (payload.qrBase64 as string | null)
              : null,
          paymentMethod,
          hideTaxBreakdown,
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
