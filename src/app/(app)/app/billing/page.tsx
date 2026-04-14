import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { AUTH_COOKIE_NAME, verifyToken } from "@/lib/auth/jwt";
import { getAfipClient } from "@/lib/afip/client";
import { getAfipStatus } from "@/lib/afip/status";
import BillingClient from "./billing-client";

export default async function BillingPage() {
  const token = (await cookies()).get(AUTH_COOKIE_NAME)?.value;
  if (!token) {
    redirect("/login");
  }

  let payload;
  try {
    payload = await verifyToken(token);
  } catch {
    redirect("/login");
  }

  if (!payload.activeOrgId) {
    redirect("/login");
  }

  const membership = await prisma.membership.findUnique({
    where: {
      organizationId_userId: {
        organizationId: payload.activeOrgId,
        userId: payload.userId,
      },
    },
  });

  if (!membership) {
    redirect("/app");
  }

  const sales = await prisma.sale.findMany({
    where: { organizationId: membership.organizationId },
    include: { customer: true, items: { include: { product: true } } },
    orderBy: { createdAt: "desc" },
    take: 80,
  });
  const fiscalInvoices = await prisma.fiscalInvoice.findMany({
    where: { organizationId: membership.organizationId },
    include: {
      sale: {
        include: {
          customer: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 120,
  });
  const creditNotes = await prisma.fiscalCreditNote.findMany({
    where: {
      organizationId: membership.organizationId,
      fiscalInvoiceId: { not: null },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  const afipStatus = await getAfipStatus(membership.organizationId);
  let clientReady = false;

  if (afipStatus.ok) {
    try {
      await getAfipClient(membership.organizationId);
      clientReady = true;
    } catch {
      clientReady = false;
    }
  }

  return (
    <BillingClient
      afipStatus={{ ...afipStatus, clientReady }}
      initialIssuedInvoices={fiscalInvoices.map((invoice) => ({
        id: invoice.id,
        saleId: invoice.saleId,
        saleNumber: invoice.sale.saleNumber,
        customerName: invoice.sale.customer.displayName,
        type: invoice.type,
        pointOfSale: invoice.pointOfSale,
        number: invoice.number,
        cae: invoice.cae,
        issuedAt: invoice.issuedAt?.toISOString() ?? null,
        createdAt: invoice.createdAt.toISOString(),
        subtotal: invoice.sale.subtotal?.toString() ?? null,
        iva: invoice.sale.taxes?.toString() ?? null,
        total: invoice.sale.total?.toString() ?? null,
      }))}
      initialCreditNotes={creditNotes
        .filter((note) => Boolean(note.fiscalInvoiceId))
        .map((note) => ({
          id: note.id,
          fiscalInvoiceId: note.fiscalInvoiceId ?? "",
          number: note.creditNumber ?? null,
          pointOfSale: note.pointOfSale ?? null,
          type: note.type ?? null,
          cae: note.cae ?? null,
          issuedAt: note.issuedAt?.toISOString() ?? null,
          createdAt: note.createdAt.toISOString(),
        }))}
      initialSales={sales.map((sale) => ({
        id: sale.id,
        customerName: sale.customer.displayName,
        customerTaxId: sale.customer.taxId,
        customerType: sale.customer.type,
        customerFiscalTaxProfile: sale.customer.fiscalTaxProfile,
        saleNumber: sale.saleNumber,
        saleDate: sale.saleDate?.toISOString() ?? null,
        createdAt: sale.createdAt.toISOString(),
        subtotal: sale.subtotal?.toString() ?? null,
        taxes: sale.taxes?.toString() ?? null,
        extraType: sale.extraType ?? null,
        extraValue: sale.extraValue?.toString() ?? null,
        extraAmount: sale.extraAmount?.toString() ?? null,
        total: sale.total?.toString() ?? null,
        status: sale.status,
        billingStatus: sale.billingStatus,
        items: sale.items.map((item) => ({
          id: item.id,
          productName: item.product.name,
          qty: item.qty.toString(),
          unitPrice: item.unitPrice.toString(),
          total: item.total.toString(),
          taxRate: item.taxRate?.toString() ?? "0",
          taxAmount: item.taxAmount?.toString() ?? null,
        })),
      }))}
    />
  );
}
