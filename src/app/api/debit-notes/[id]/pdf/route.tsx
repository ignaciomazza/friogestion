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

function getDebitNoteDelegate() {
  return (
    prisma as unknown as {
      fiscalDebitNote?: {
        findFirst: (args: unknown) => Promise<Record<string, unknown> | null>;
      };
    }
  ).fiscalDebitNote;
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const params = await context.params;
    let organizationId: string | null = null;

    try {
      organizationId = await resolvePdfShareOrganizationId(
        req,
        "debitNote",
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

    const debitNoteDelegate = getDebitNoteDelegate();
    if (!debitNoteDelegate) {
      return NextResponse.json(
        { error: "Modelo FiscalDebitNote no disponible. Ejecuta migraciones y prisma generate." },
        { status: 503 },
      );
    }
    const debitNoteRaw = await debitNoteDelegate.findFirst({
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

    if (!debitNoteRaw) {
      return NextResponse.json(
        { error: "Nota de debito no encontrada" },
        { status: 404 },
      );
    }
    const debitNote = debitNoteRaw as {
      id: string;
      organizationId: string;
      pointOfSale: string | null;
      debitNumber: string | null;
      issuedAt: Date | null;
      cae: string | null;
      caeDueDate: Date | null;
      payloadAfip: Record<string, unknown> | null;
      type: string | null;
      sale?: {
        paymentStatus: string | null;
        customer: {
          displayName: string;
          legalName: string | null;
          taxId: string | null;
          address: string | null;
          email: string | null;
          phone: string | null;
          fiscalTaxProfile: string | null;
        };
        items: Array<{
          product: { name: string };
          qty: string | number;
          unitPrice: string | number;
          total: string | number;
          taxRate: string | number | null;
          taxAmount: string | number | null;
        }>;
        receipts: Array<{
          lines: Array<{
            paymentMethod: {
              name: string;
            };
          }>;
        }>;
      } | null;
      organization: {
        name: string;
        legalName: string | null;
        taxId: string | null;
        activityStart: Date | null;
        address: string | null;
        email: string | null;
        phone: string | null;
        website: string | null;
        socialMedia: string | null;
      };
    };

    const debitNoteOrganizationId = debitNote.organizationId;
    const config = await prisma.organizationFiscalConfig.findUnique({
      where: { organizationId: debitNoteOrganizationId },
    });

    const payload = debitNote.payloadAfip as Record<string, unknown> | null;
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
      debitNote.sale?.customer.fiscalTaxProfile,
    );
    const receiverFiscalCondition = receiverFiscalProfile
      ? CUSTOMER_FISCAL_TAX_PROFILE_LABELS[receiverFiscalProfile]
      : null;
    const hideTaxBreakdown =
      isConsumerFinalFiscalTaxProfile(receiverFiscalProfile);
    const iva = Number(voucherData.ImpIVA ?? 0);
    const otherTaxes = Number(voucherData.ImpTrib ?? 0);
    const issuerTaxId =
      debitNote.organization.taxId ?? config?.taxIdRepresentado ?? null;
    const manualIssuerActivityStart =
      debitNote.organization.activityStart?.toLocaleDateString("es-AR") ?? null;
    const issuerTaxpayer = await resolveIssuerTaxpayerSummary({
      organizationId: debitNoteOrganizationId,
      taxId: issuerTaxId,
    });
    const paymentMethod = resolveSalePaymentMethodLabel({
      paymentStatus: debitNote.sale?.paymentStatus,
      receipts: debitNote.sale?.receipts,
    });

    const items = debitNote.sale?.items.map((item) => ({
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
          title: `Nota de Debito ${debitNote.type ?? ""}`.trim(),
          issuer: {
            name: debitNote.organization.name,
            legalName: debitNote.organization.legalName ?? undefined,
            taxId: issuerTaxId ?? undefined,
            fiscalCondition: issuerTaxpayer.fiscalCondition ?? undefined,
            activityStart:
              manualIssuerActivityStart ??
              issuerTaxpayer.activityStart ??
              undefined,
            address: debitNote.organization.address ?? undefined,
            email: debitNote.organization.email ?? undefined,
            phone: debitNote.organization.phone ?? undefined,
            website: debitNote.organization.website ?? undefined,
            socialMedia: debitNote.organization.socialMedia ?? undefined,
          },
          receiver: {
            name: debitNote.sale?.customer.displayName ?? "-",
            legalName: debitNote.sale?.customer.legalName ?? undefined,
            taxId: debitNote.sale?.customer.taxId ?? undefined,
            address: debitNote.sale?.customer.address ?? undefined,
            email: debitNote.sale?.customer.email ?? undefined,
            phone: debitNote.sale?.customer.phone ?? undefined,
            fiscalCondition: receiverFiscalCondition ?? undefined,
          },
          voucher: {
            pointOfSale: debitNote.pointOfSale,
            number: debitNote.debitNumber,
            issuedAt: debitNote.issuedAt?.toLocaleDateString("es-AR") ?? null,
            cae: debitNote.cae,
            caeDueDate:
              debitNote.caeDueDate?.toLocaleDateString("es-AR") ?? null,
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
        "Content-Disposition": `inline; filename="nota-debito-${debitNote.id}.pdf"`,
      },
    });
  } catch {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
}
