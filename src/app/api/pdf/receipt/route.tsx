import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { prisma } from "@/lib/prisma";
import { requireAuth, requireOrg } from "@/lib/auth/tenant";
import { CommercialPdfDocument } from "@/lib/pdf/commercial";
import { resolveLogoSource } from "@/lib/pdf/assets";

export const runtime = "nodejs";

const RECEIPT_STATUS_LABELS: Record<string, string> = {
  PENDING: "Pendiente",
  CONFIRMED: "Confirmado",
  REJECTED: "Rechazado",
};

export async function GET(req: NextRequest) {
  try {
    const organizationId = await requireOrg(req);
    await requireAuth(req);
    const id = req.nextUrl.searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "Falta id" }, { status: 400 });
    }

    const receipt = await prisma.receipt.findFirst({
      where: { id, organizationId },
      include: {
        organization: true,
        customer: true,
        sale: true,
        lines: {
          include: {
            paymentMethod: true,
            account: true,
            accountMovement: true,
          },
        },
      },
    });

    if (!receipt) {
      return NextResponse.json(
        { error: "Cobro no encontrado" },
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

    const title = receipt.receiptNumber
      ? `Recibo ${receipt.receiptNumber}`
      : "Recibo";

    const verificationLines =
      receipt.status === "CONFIRMED"
        ? receipt.lines.filter((line) => Boolean(line.accountId))
        : [];

    const doubleCheckStatus = verificationLines.length
      ? verificationLines.some((line) => !line.accountMovement?.verifiedAt)
        ? "Pendiente"
        : "OK"
      : "Sin doble control";

    const meta = [
      {
        label: "Estado",
        value: RECEIPT_STATUS_LABELS[receipt.status] ?? receipt.status,
      },
      {
        label: "Fecha",
        value: receipt.receivedAt.toLocaleDateString("es-AR"),
      },
      ...(receipt.confirmedAt
        ? [
            {
              label: "Confirmado",
              value: receipt.confirmedAt.toLocaleDateString("es-AR"),
            },
          ]
        : []),
      ...(receipt.sale
        ? [
            {
              label: "Venta",
              value: receipt.sale.saleNumber ?? receipt.sale.id,
            },
          ]
        : []),
      { label: "Doble control", value: doubleCheckStatus },
    ];

    const items = receipt.lines.map((line) => {
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

    const doc = (
      <CommercialPdfDocument
        data={{
          title,
          organization: {
            name: receipt.organization.name,
            legalName: receipt.organization.legalName,
            taxId: receipt.organization.taxId,
          },
          customer: {
            name: receipt.customer.displayName,
            taxId: receipt.customer.taxId,
            email: receipt.customer.email,
            address: receipt.customer.address,
          },
          issuedAt: receipt.receivedAt.toLocaleDateString("es-AR"),
          meta,
          items,
          totals: [{ label: "Total", value: Number(receipt.total ?? 0) }],
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
        "Content-Disposition": `inline; filename="recibo-${receipt.id}.pdf"`,
      },
    });
  } catch {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
}
