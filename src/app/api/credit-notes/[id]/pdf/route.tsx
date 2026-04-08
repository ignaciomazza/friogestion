import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth/tenant";
import { FiscalPdfDocument } from "@/lib/pdf/fiscal";
import { resolveLogoSource } from "@/lib/pdf/assets";

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

    const items = creditNote.sale?.items.map((item) => ({
      description: item.product.name,
      qty: Number(item.qty),
      unitPrice: Number(item.unitPrice),
      total: Number(item.total),
    }));

    const doc = (
      <FiscalPdfDocument
        data={{
          title: `Nota de Credito ${creditNote.type ?? ""}`.trim(),
          issuer: {
            name: creditNote.organization.name,
            legalName: creditNote.organization.legalName ?? undefined,
            taxId: creditNote.organization.taxId ?? undefined,
          },
          receiver: {
            name: creditNote.sale?.customer.displayName ?? "-",
            taxId: creditNote.sale?.customer.taxId ?? undefined,
            address: creditNote.sale?.customer.address ?? undefined,
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
            iva: Number(voucherData.ImpIVA ?? 0),
            exempt: Number(voucherData.ImpOpEx ?? 0),
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
