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

    const sale = await prisma.sale.findFirst({
      where: { id, organizationId },
      include: {
        organization: true,
        customer: true,
        items: { include: { product: true } },
        saleCharges: true,
        installmentPlan: true,
        receipts: {
          include: {
            lines: {
              include: {
                accountMovement: true,
                paymentMethod: true,
              },
            },
          },
        },
      },
    });

    if (!sale) {
      return NextResponse.json(
        { error: "Venta no encontrada" },
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

    const receiptsCount = sale.receipts.length;
    meta.push({
      label: "Cobros",
      value: receiptsCount
        ? `${receiptsCount} registrados`
        : "Sin cobros registrados",
    });

    const verificationLines = sale.receipts
      .filter((receipt) => receipt.status === "CONFIRMED")
      .flatMap((receipt) =>
        receipt.lines.filter((line) => Boolean(line.accountId))
      );
    if (verificationLines.length) {
      const doubleCheckStatus = verificationLines.some(
        (line) => !line.accountMovement?.verifiedAt
      )
        ? "Pendiente"
        : "OK";
      meta.push({
        label: "Doble control",
        value: doubleCheckStatus,
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
          totals: [
            { label: "Subtotal", value: Number(sale.subtotal ?? 0) },
            { label: "Impuestos", value: Number(sale.taxes ?? 0) },
            ...(Number(sale.extraAmount ?? 0) > 0
              ? [{ label: "Recargos", value: Number(sale.extraAmount ?? 0) }]
              : []),
            ...(interestTotal > 0
              ? [{ label: "Interes", value: interestTotal }]
              : []),
            { label: "Total", value: Number(sale.total ?? 0) },
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
        "Content-Disposition": `inline; filename="venta-${sale.id}.pdf"`,
      },
    });
  } catch {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
}
