import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { prisma } from "@/lib/prisma";
import { getAfipClient } from "@/lib/afip/client";
import { buildQrDataUrl, type QrPayload } from "@/lib/afip/qr";
import { requireRole } from "@/lib/auth/tenant";
import { FiscalPdfDocument } from "@/lib/pdf/fiscal";
import { resolveLogoSource } from "@/lib/pdf/assets";
import { resolveIssuerTaxpayerSummary } from "@/lib/pdf/issuer-taxpayer";
import { resolveSalePaymentMethodLabel } from "@/lib/sales/payment-method";
import {
  CUSTOMER_FISCAL_TAX_PROFILE_LABELS,
  normalizeCustomerFiscalTaxProfile,
} from "@/lib/customers/fiscal-profile";
import { resolvePdfShareOrganizationId } from "@/lib/pdf/share-token";

export const runtime = "nodejs";

type JsonRecord = Record<string, unknown>;

const toRecord = (value: unknown): JsonRecord | null =>
  value && typeof value === "object" ? (value as JsonRecord) : null;

const parseFiniteNumber = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const parseAfipDate = (value: unknown) => {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (digits.length !== 8) return null;
  const year = Number(digits.slice(0, 4));
  const month = Number(digits.slice(4, 6));
  const day = Number(digits.slice(6, 8));
  if (!year || !month || !day) return null;
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const toQrDate = (date: Date) => {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
};

const resolveInvoiceTypeLabel = (
  voucherType: number | null,
  fallbackType: string | null
) => {
  if (fallbackType === "A" || fallbackType === "B" || fallbackType === "C") {
    return fallbackType;
  }
  if (voucherType === 1) return "A";
  if (voucherType === 6) return "B";
  if (voucherType === 11) return "C";
  return "";
};

const resolveCurrencyCode = (monId: string) => {
  if (monId === "DOL") return "USD";
  if (monId === "PES") return "ARS";
  return monId;
};

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

    const payload = toRecord(creditNote.payloadAfip);
    const creditVoucherData = toRecord(payload?.voucherData);
    const associatedVouchers = Array.isArray(creditVoucherData?.CbtesAsoc)
      ? creditVoucherData.CbtesAsoc
      : [];
    const associatedVoucher = toRecord(associatedVouchers[0]);

    const associatedVoucherType = parseFiniteNumber(associatedVoucher?.Tipo);
    const associatedPointOfSale = parseFiniteNumber(associatedVoucher?.PtoVta);
    const associatedNumber = parseFiniteNumber(associatedVoucher?.Nro);

    if (!associatedVoucherType || !associatedPointOfSale || !associatedNumber) {
      return NextResponse.json(
        { error: "No se pudo resolver la factura origen de esta nota de credito." },
        { status: 409 },
      );
    }

    const sourceSnapshot = toRecord(payload?.sourceInvoiceSnapshot);
    const sourceSnapshotPayload = toRecord(sourceSnapshot?.payloadAfip);
    const sourceSnapshotVoucherData = toRecord(sourceSnapshotPayload?.voucherData);

    let sourceVoucherData: JsonRecord | null = null;
    try {
      const afip = await getAfipClient(creditNoteOrganizationId);
      const billing = afip.ElectronicBilling as unknown as {
        getVoucherInfo: (
          number: number,
          salesPoint: number,
          type: number
        ) => Promise<JsonRecord | null>;
      };
      sourceVoucherData = await billing.getVoucherInfo(
        associatedNumber,
        associatedPointOfSale,
        associatedVoucherType,
      );
    } catch {
      sourceVoucherData = null;
    }

    const sourceVoucher = sourceVoucherData ?? sourceSnapshotVoucherData;
    const voucherType = parseFiniteNumber(sourceVoucher?.CbteTipo) ?? associatedVoucherType;
    const invoiceTypeLabel = resolveInvoiceTypeLabel(
      voucherType,
      typeof sourceSnapshot?.type === "string" ? sourceSnapshot.type : null
    );

    const pointOfSale =
      parseFiniteNumber(sourceVoucher?.PtoVta) ??
      parseFiniteNumber(sourceSnapshot?.pointOfSale) ??
      associatedPointOfSale;
    const voucherNumber =
      parseFiniteNumber(sourceVoucher?.CbteDesde) ??
      parseFiniteNumber(sourceVoucher?.CbteHasta) ??
      parseFiniteNumber(sourceSnapshot?.number) ??
      associatedNumber;

    const issuedAtDate =
      parseAfipDate(sourceVoucher?.CbteFch) ??
      (typeof sourceSnapshot?.issuedAt === "string"
        ? new Date(sourceSnapshot.issuedAt)
        : null);
    const issuedAt = issuedAtDate?.toLocaleDateString("es-AR") ?? null;

    const cae =
      (typeof sourceVoucher?.CAE === "string" ? sourceVoucher.CAE : null) ??
      (typeof sourceVoucher?.CodAutorizacion === "string"
        ? sourceVoucher.CodAutorizacion
        : null) ??
      (typeof sourceSnapshot?.cae === "string" ? sourceSnapshot.cae : null);
    const caeDueDate =
      parseAfipDate(sourceVoucher?.CAEFchVto) ??
      parseAfipDate(sourceVoucher?.FchVto) ??
      (typeof sourceSnapshot?.caeDueDate === "string"
        ? new Date(sourceSnapshot.caeDueDate)
        : null);

    const monId =
      (typeof sourceVoucher?.MonId === "string" ? sourceVoucher.MonId : null) ??
      (typeof sourceSnapshotVoucherData?.MonId === "string"
        ? sourceSnapshotVoucherData.MonId
        : null) ??
      "PES";
    const monCotiz =
      parseFiniteNumber(sourceVoucher?.MonCotiz) ??
      parseFiniteNumber(sourceSnapshotVoucherData?.MonCotiz) ??
      1;
    const currencyCode = resolveCurrencyCode(monId);

    const net =
      parseFiniteNumber(sourceVoucher?.ImpNeto) ??
      parseFiniteNumber(creditNote.sale?.subtotal) ??
      0;
    const iva =
      parseFiniteNumber(sourceVoucher?.ImpIVA) ??
      parseFiniteNumber(creditNote.sale?.taxes) ??
      0;
    const exempt = parseFiniteNumber(sourceVoucher?.ImpOpEx) ?? 0;
    const otherTaxes = parseFiniteNumber(sourceVoucher?.ImpTrib) ?? 0;
    const total =
      parseFiniteNumber(sourceVoucher?.ImpTotal) ??
      parseFiniteNumber(creditNote.sale?.total) ??
      net + iva + exempt + otherTaxes;

    const docType =
      parseFiniteNumber(sourceVoucher?.DocTipo) ??
      parseFiniteNumber(sourceSnapshotVoucherData?.DocTipo) ??
      parseFiniteNumber(creditVoucherData?.DocTipo) ??
      99;
    const docNumber =
      parseFiniteNumber(sourceVoucher?.DocNro) ??
      parseFiniteNumber(sourceSnapshotVoucherData?.DocNro) ??
      parseFiniteNumber(creditVoucherData?.DocNro) ??
      0;

    const issuerTaxId =
      creditNote.organization.taxId ?? config?.taxIdRepresentado ?? null;
    const issuerCuit = parseFiniteNumber(issuerTaxId);

    let qrBase64: string | null = null;
    if (
      issuedAtDate &&
      voucherType &&
      pointOfSale &&
      voucherNumber &&
      cae &&
      issuerCuit
    ) {
      const qrPayload: QrPayload = {
        ver: 1,
        fecha: toQrDate(issuedAtDate),
        cuit: issuerCuit,
        ptoVta: pointOfSale,
        tipoCmp: voucherType,
        nroCmp: voucherNumber,
        importe: total,
        moneda: monId,
        ctz: monCotiz,
        tipoDocRec: docType,
        nroDocRec: docNumber,
        tipoCodAut: "E",
        codAut: cae,
      };
      qrBase64 = await buildQrDataUrl(qrPayload);
    }

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
    const hideTaxBreakdown = false;
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

    const items =
      creditNote.sale?.items.map((item) => ({
        description: item.product?.name ?? item.description ?? "Item manual",
        qty: Number(item.qty),
        unitPrice: Number(item.unitPrice),
        total: Number(item.total),
        taxRate: item.taxRate ? Number(item.taxRate) : null,
        taxAmount: item.taxAmount ? Number(item.taxAmount) : null,
      })) ?? [];

    const doc = (
      <FiscalPdfDocument
        data={{
          title: `Factura ${invoiceTypeLabel}`.trim(),
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
            pointOfSale: String(pointOfSale),
            number: String(voucherNumber),
            issuedAt,
            cae: cae ?? undefined,
            caeDueDate: caeDueDate?.toLocaleDateString("es-AR") ?? undefined,
            currencyCode,
            total,
            net,
            iva,
            exempt,
            otherTaxes,
            serviceDates: null,
          },
          items,
          logoSrc,
          qrBase64,
          paymentMethod,
          hideTaxBreakdown,
          transparencyLegend: {
            enabled: true,
            ivaContained: iva,
            otherNationalIndirectTaxes: otherTaxes,
          },
        }}
      />
    );

    const buffer = await renderToBuffer(doc);
    const body = new Uint8Array(buffer);

    return new NextResponse(body, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="factura-origen-${creditNote.id}.pdf"`,
      },
    });
  } catch {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
}
