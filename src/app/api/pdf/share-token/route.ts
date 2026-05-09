import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireOrg } from "@/lib/auth/tenant";
import {
  PDF_SHARE_TOKEN_EXPIRES_IN,
  signPdfShareToken,
  type PdfShareDocumentType,
} from "@/lib/pdf/share-token";

const bodySchema = z.object({
  documentType: z.enum(["quote", "sale", "fiscalInvoice", "creditNote"]),
  documentId: z.string().min(1),
});

const findDocument = async (
  documentType: PdfShareDocumentType,
  documentId: string,
  organizationId: string,
) => {
  if (documentType === "quote") {
    return prisma.quote.findFirst({
      where: { id: documentId, organizationId },
      select: { id: true },
    });
  }

  if (documentType === "sale") {
    return prisma.sale.findFirst({
      where: { id: documentId, organizationId },
      select: { id: true },
    });
  }

  if (documentType === "fiscalInvoice") {
    return prisma.fiscalInvoice.findFirst({
      where: { id: documentId, organizationId },
      select: { id: true },
    });
  }

  return prisma.fiscalCreditNote.findFirst({
    where: { id: documentId, organizationId },
    select: { id: true },
  });
};

const buildSharedPdfUrl = (
  req: NextRequest,
  documentType: PdfShareDocumentType,
  documentId: string,
  shareToken: string,
) => {
  if (documentType === "quote") {
    const url = new URL("/api/pdf/quote", req.nextUrl.origin);
    url.searchParams.set("id", documentId);
    url.searchParams.set("shareToken", shareToken);
    return url.toString();
  }

  if (documentType === "sale") {
    const url = new URL("/api/pdf/sale", req.nextUrl.origin);
    url.searchParams.set("id", documentId);
    url.searchParams.set("shareToken", shareToken);
    return url.toString();
  }

  const path =
    documentType === "fiscalInvoice"
      ? `/api/fiscal-invoices/${documentId}/pdf`
      : `/api/credit-notes/${documentId}/pdf`;
  const url = new URL(path, req.nextUrl.origin);
  url.searchParams.set("shareToken", shareToken);
  return url.toString();
};

export async function POST(req: NextRequest) {
  try {
    const organizationId = await requireOrg(req);
    const body = bodySchema.parse(await req.json());
    const document = await findDocument(
      body.documentType,
      body.documentId,
      organizationId,
    );

    if (!document) {
      return NextResponse.json({ error: "PDF no encontrado" }, { status: 404 });
    }

    const shareToken = await signPdfShareToken({
      documentType: body.documentType,
      documentId: body.documentId,
      organizationId,
    });

    return NextResponse.json({
      url: buildSharedPdfUrl(
        req,
        body.documentType,
        body.documentId,
        shareToken,
      ),
      expiresIn: PDF_SHARE_TOKEN_EXPIRES_IN,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Datos invalidos" }, { status: 400 });
    }
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
}
