import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { prisma } from "@/lib/prisma";
import { requireAuth, requireOrg } from "@/lib/auth/tenant";
import { CommercialPdfDocument } from "@/lib/pdf/commercial";
import { resolveLogoSource } from "@/lib/pdf/assets";
import { getAdjustmentLabel } from "@/lib/sale-adjustments";
import { resolvePdfShareOrganizationId } from "@/lib/pdf/share-token";
import { isConsumerFinalFiscalTaxProfile } from "@/lib/customers/fiscal-profile";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "Falta id" }, { status: 400 });
    }

    let organizationId: string | null = null;
    try {
      organizationId = await resolvePdfShareOrganizationId(req, "sale", id);
    } catch {
      organizationId = null;
    }

    if (!organizationId) {
      try {
        organizationId = await requireOrg(req);
        await requireAuth(req);
      } catch {
        organizationId = null;
      }
    }

    const sale = await prisma.sale.findFirst({
      where: organizationId ? { id, organizationId } : { id },
      include: {
        organization: true,
        customer: true,
        items: { include: { product: true } },
        saleCharges: true,
        installmentPlan: true,
      },
    });

    if (!sale) {
      return NextResponse.json(
        { error: "Venta no encontrada" },
        { status: 404 }
      );
    }

    const saleOrganizationId = sale.organizationId;
    const config = await prisma.organizationFiscalConfig.findUnique({
      where: { organizationId: saleOrganizationId },
    });

    const logoSrc = await resolveLogoSource({
      logoUrl: config?.logoUrl ?? null,
      logoFilename: config?.logoFilename ?? null,
    });

    const items = sale.items.map((item) => ({
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
    const hideTaxBreakdown = isConsumerFinalFiscalTaxProfile(
      sale.customer.fiscalTaxProfile
    );
    const extraAmount = Number(sale.extraAmount ?? 0);
    const adjustmentTotals =
      extraAmount !== 0
        ? [
            {
              label: getAdjustmentLabel(sale.extraType, extraAmount),
              value: extraAmount,
            },
          ]
        : [];

    const saleTitle = sale.saleNumber ? `Venta ${sale.saleNumber}` : "Venta";

    const interestTotal = sale.saleCharges.reduce(
      (total, charge) => total + Number(charge.amount ?? 0),
      0
    );

    const plan = sale.installmentPlan;
    const meta = [];
    if (plan) {
      const planLabel = plan.type === "CARD" ? "Tarjeta" : "Credito";
      meta.push({
        label: "Financiacion",
        value: `${planLabel} · ${plan.installmentsCount} cuotas`,
      });
      meta.push({
        label: "Interes",
        value: `${plan.interestRate?.toString() ?? "0"}%`,
      });
      meta.push({
        label: "Inicio",
        value: plan.startDate.toLocaleDateString("es-AR"),
      });
    }

    const doc = (
      <CommercialPdfDocument
        data={{
          title: saleTitle,
          organization: {
            name: sale.organization.name,
            legalName: sale.organization.legalName,
            taxId: sale.organization.taxId,
            address: sale.organization.address,
            email: sale.organization.email,
            phone: sale.organization.phone,
            website: sale.organization.website,
            socialMedia: sale.organization.socialMedia,
          },
          customer: {
            name: sale.customer.displayName,
            taxId: sale.customer.taxId,
            email: sale.customer.email,
            address: sale.customer.address,
          },
          issuedAt: sale.saleDate
            ? new Date(sale.saleDate).toLocaleDateString("es-AR")
            : new Date(sale.createdAt).toLocaleDateString("es-AR"),
          meta,
          items,
          totals: hideTaxBreakdown
            ? [
                ...adjustmentTotals,
                ...(interestTotal > 0
                  ? [{ label: "Interes", value: interestTotal }]
                  : []),
                { label: "Total", value: Number(sale.total ?? 0) },
              ]
            : [
                { label: "Subtotal", value: Number(sale.subtotal ?? 0) },
                { label: "Impuestos", value: Number(sale.taxes ?? 0) },
                ...adjustmentTotals,
                ...(interestTotal > 0
                  ? [{ label: "Interes", value: interestTotal }]
                  : []),
                { label: "Total", value: Number(sale.total ?? 0) },
              ],
          currency: "ARS",
          logoSrc,
          taxColumnLabel: "IVA",
          totalColumnLabel: "Neto",
          hideTaxBreakdown,
        }}
      />
    );

    const buffer = await renderToBuffer(doc);
    const body = new Uint8Array(buffer);

    return new NextResponse(body, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="venta-${sale.id}.pdf"`,
      },
    });
  } catch {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
}
