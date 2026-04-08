import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth/tenant";
import { CommercialPdfDocument } from "@/lib/pdf/commercial";
import { resolveLogoSource } from "@/lib/pdf/assets";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const payload = await requireAuth(req);
    const [org, user] = await Promise.all([
      prisma.organization.findUnique({
        where: { id: payload.activeOrgId },
      }),
      prisma.user.findUnique({
        where: { id: payload.userId },
        select: { email: true },
      }),
    ]);

    const logoSrc = await resolveLogoSource({});
    const items = [
      {
        description: "Producto demo A",
        sku: "SKU-0001",
        brand: "Frio Gestion",
        model: "X1",
        qty: 2,
        unitPrice: 1200,
        total: 2400,
        taxRate: 21,
        taxAmount: 504,
      },
      {
        description: "Servicio demo",
        sku: "SERV-002",
        brand: "Frio Gestion",
        model: "Service",
        qty: 1,
        unitPrice: 850,
        total: 850,
        taxRate: 21,
        taxAmount: 178.5,
      },
    ];
    const subtotal = items.reduce((sum, item) => sum + item.total, 0);
    const taxes = items.reduce((sum, item) => sum + (item.taxAmount ?? 0), 0);
    const total = subtotal + taxes;

    const doc = (
      <CommercialPdfDocument
        data={{
          title: "Venta 001",
          organization: {
            name: org?.name ?? "Frio Gestion",
            legalName: org?.legalName ?? null,
            taxId: org?.taxId ?? null,
          },
          customer: {
            name: user?.email ?? "cliente@friogestion.com",
            taxId: null,
            email: user?.email ?? null,
            address: null,
          },
          issuedAt: new Date().toLocaleDateString("es-AR"),
          meta: [
          ],
          items,
          totals: [
            { label: "Subtotal", value: subtotal },
            { label: "Impuestos", value: taxes },
            { label: "Total", value: total },
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
        "Content-Disposition": "inline; filename=\"friogestion-prueba.pdf\"",
      },
    });
  } catch {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
}
