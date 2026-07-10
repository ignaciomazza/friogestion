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
        "creditNote",
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

    const creditNote = await prisma.fiscalCreditNote.findFirst({
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

    if (!creditNote) {
      return NextResponse.json(
        { error: "Nota de credito no encontrada" },
        { status: 404 }
      );
    }

    const creditNoteOrganizationId = creditNote.organizationId;
    const config = await prisma.organizationFiscalConfig.findUnique({
      where: { organizationId: creditNoteOrganizationId },
    });

    const payload = creditNote.payloadAfip as Record<string, unknown> | null;
    const voucherData =
      payload && typeof payload === "object"
        ? (payload.voucherData as Record<string, unknown>)
        : {};
    const rawMonId =
      typeof voucherData.MonId === "string" ? voucherData.MonId : "ARS";
    const currencyCode =
      rawMonId === "DOL" ? "USD" : rawMonId === "PES" ? "ARS" : rawMonId;

    const logoSrc = await resolveLogoSource({
      logoUrl: config?.logoUrl ?? null,
      logoFilename: config?.logoFilename ?? null,
    });
    const receiverFiscalProfile = normalizeCustomerFiscalTaxProfile(
      creditNote.sale?.customer.fiscalTaxProfile
    );
    const receiverFiscalCondition = receiverFiscalProfile
      ? CUSTOMER_FISCAL_TAX_PROFILE_LABELS[receiverFiscalProfile]
      : null;
    const hideTaxBreakdown =
      isConsumerFinalFiscalTaxProfile(receiverFiscalProfile);
    const iva = Number(voucherData.ImpIVA ?? 0);
    const otherTaxes = Number(voucherData.ImpTrib ?? 0);
    const issuerTaxId =
      creditNote.organization.taxId ?? config?.taxIdRepresentado ?? null;
    const manualIssuerActivityStart =
      creditNote.organization.activityStart?.toLocaleDateString("es-AR") ?? null;
    const issuerTaxpayer = await resolveIssuerTaxpayerSummary({
      organizationId: creditNoteOrganizationId,
      taxId: issuerTaxId,
    });
    const paymentMethod = resolveSalePaymentMethodLabel({
      paymentStatus: creditNote.sale?.paymentStatus,
      receipts: creditNote.sale?.receipts,
    });

    const items = creditNote.sale?.items.map((item) => ({
      description: item.product?.name ?? item.description ?? "Item manual",
      qty: Number(item.qty),
      unitPrice: Number(item.unitPrice),
      total: Number(item.total),
      taxRate: item.taxRate ? Number(item.taxRate) : null,
      taxAmount: item.taxAmount ? Number(item.taxAmount) : null,
    }));

    const doc = (
      <FiscalPdfDocument
        data={{
          title: `Nota de Credito ${creditNote.type ?? ""}`.trim(),
          issuer: {
            name: creditNote.organization.name,
            legalName: creditNote.organization.legalName ?? undefined,
            taxId: issuerTaxId ?? undefined,
            fiscalCondition: issuerTaxpayer.fiscalCondition ?? undefined,
            activityStart:
              manualIssuerActivityStart ??
              issuerTaxpayer.activityStart ??
              undefined,
            address: creditNote.organization.address ?? undefined,
            email: creditNote.organization.email ?? undefined,
            phone: creditNote.organization.phone ?? undefined,
            website: creditNote.organization.website ?? undefined,
            socialMedia: creditNote.organization.socialMedia ?? undefined,
          },
          receiver: {
            name: creditNote.sale?.customer.displayName ?? "-",
            legalName: creditNote.sale?.customer.legalName ?? undefined,
            taxId: creditNote.sale?.customer.taxId ?? undefined,
            address: creditNote.sale?.customer.address ?? undefined,
            email: creditNote.sale?.customer.email ?? undefined,
            phone: creditNote.sale?.customer.phone ?? undefined,
            fiscalCondition: receiverFiscalCondition ?? undefined,
          },
          voucher: {
            pointOfSale: creditNote.pointOfSale,
            number: creditNote.creditNumber,
            issuedAt: creditNote.issuedAt?.toLocaleDateString("es-AR") ?? null,
            cae: creditNote.cae,
            caeDueDate:
              creditNote.caeDueDate?.toLocaleDateString("es-AR") ?? null,
            currencyCode,
            total: Number(voucherData.ImpTotal ?? 0),
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
          items: items ?? [],
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
        "Content-Disposition": `inline; filename="nota-credito-${creditNote.id}.pdf"`,
      },
    });
  } catch {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
}
