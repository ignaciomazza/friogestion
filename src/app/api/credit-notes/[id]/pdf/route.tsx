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

    const creditNote = await prisma.fiscalCreditNote.findFirst({
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

    if (!creditNote) {
      return NextResponse.json(
        { error: "Nota de credito no encontrada" },
        { status: 404 }
      );
    }

    const config = await prisma.organizationFiscalConfig.findUnique({
      where: { organizationId: membership.organizationId },
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
    const iva = Number(voucherData.ImpIVA ?? 0);
    const otherTaxes = Number(voucherData.ImpTrib ?? 0);

    const items = creditNote.sale?.items.map((item) => ({
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
          title: `Nota de Credito ${creditNote.type ?? ""}`.trim(),
          issuer: {
            name: creditNote.organization.name,
            legalName: creditNote.organization.legalName ?? undefined,
            taxId:
              creditNote.organization.taxId ??
              config?.taxIdRepresentado ??
              undefined,
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
        "Content-Disposition": `inline; filename="nota-credito-${creditNote.id}.pdf"`,
      },
    });
  } catch {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
}
