import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { prisma } from "@/lib/prisma";
import { requireAuth, requireOrg } from "@/lib/auth/tenant";
import { CommercialPdfDocument } from "@/lib/pdf/commercial";
import { resolveLogoSource } from "@/lib/pdf/assets";

export const runtime = "nodejs";

const STATUS_LABELS: Record<string, string> = {
  CONFIRMED: "Confirmado",
  CANCELLED: "Anulado",
};

export async function GET(req: NextRequest) {
  try {
    const organizationId = await requireOrg(req);
    await requireAuth(req);
    const id = req.nextUrl.searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "Falta id" }, { status: 400 });
    }

    const payment = await prisma.supplierPayment.findFirst({
      where: { id, organizationId },
      include: {
        organization: true,
        supplier: true,
        lines: { include: { paymentMethod: true, account: true } },
        retentions: true,
      },
    });

    if (!payment) {
      return NextResponse.json(
        { error: "Pago no encontrado" },
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

    const items = payment.lines.map((line) => {
      const amount = Number(line.amount ?? 0);
      const amountBase = Number(line.amountBase ?? 0);
      const fxRate = line.fxRateUsed ? Number(line.fxRateUsed) : null;
      const descriptionParts = [line.paymentMethod.name];
      if (line.account) {
        descriptionParts.push(`Cuenta ${line.account.name}`);
      }
      descriptionParts.push(`Importe ${line.currencyCode} ${amount.toFixed(2)}`);
      if (fxRate && line.currencyCode !== "ARS") {
        descriptionParts.push(`TC ${fxRate.toFixed(6)}`);
      }
      return {
        description: descriptionParts.join(" · "),
        qty: 1,
        unitPrice: amountBase,
        total: amountBase,
        taxRate: null,
        taxAmount: null,
      };
    });

    const withheldTotal = payment.retentions.reduce(
      (sum, retention) => sum + Number(retention.amount ?? 0),
      0
    );

    const meta = [
      { label: "Estado", value: STATUS_LABELS[payment.status] ?? payment.status },
      {
        label: "Fecha",
        value: payment.paidAt.toLocaleDateString("es-AR"),
      },
      { label: "Proveedor", value: payment.supplier.displayName },
    ];

    if (payment.retentions.length) {
      meta.push({
        label: "Retenciones",
        value: payment.retentions
          .map((retention) => `${retention.type} ${retention.amount.toString()}`)
          .join(" · "),
      });
    }

    const doc = (
      <CommercialPdfDocument
        data={{
          title: "Pago a proveedor",
          organization: {
            name: payment.organization.name,
            legalName: payment.organization.legalName,
            taxId: payment.organization.taxId,
          },
          customer: {
            name: payment.supplier.displayName,
            taxId: payment.supplier.taxId,
            email: payment.supplier.email,
            address: payment.supplier.address,
          },
          issuedAt: payment.paidAt.toLocaleDateString("es-AR"),
          meta,
          items,
          totals: [
            { label: "Total pago", value: Number(payment.total ?? 0) },
            ...(withheldTotal > 0
              ? [{ label: "Retenciones", value: withheldTotal }]
              : []),
            {
              label: "Total impacto",
              value: Number(payment.total ?? 0) + withheldTotal,
            },
          ],
          currency: "ARS",
          logoSrc,
        }}
      />
    );

    const buffer = await renderToBuffer(doc);
    const body = new Uint8Array(buffer);

    return new NextResponse(body, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="pago-proveedor-${payment.id}.pdf"`,
      },
    });
  } catch {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
}
