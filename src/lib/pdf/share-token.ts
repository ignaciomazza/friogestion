import type { NextRequest } from "next/server";
import { SignJWT, jwtVerify } from "jose";

export const PDF_SHARE_TOKEN_EXPIRES_IN = "14d";

export type PdfShareDocumentType =
  | "quote"
  | "sale"
  | "fiscalInvoice"
  | "creditNote";

type PdfSharePayload = {
  documentType: PdfShareDocumentType;
  documentId: string;
  organizationId: string;
};

const PDF_SHARE_SCOPE = "pdf-share";
const PDF_SHARE_DOCUMENT_TYPES = new Set<string>([
  "quote",
  "sale",
  "fiscalInvoice",
  "creditNote",
]);

const getSecret = () => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET is not set");
  }
  return new TextEncoder().encode(secret);
};

export async function signPdfShareToken(
  payload: PdfSharePayload,
  expiresIn = PDF_SHARE_TOKEN_EXPIRES_IN,
) {
  return new SignJWT({ ...payload, scope: PDF_SHARE_SCOPE })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(getSecret());
}

export async function verifyPdfShareToken(
  token: string,
): Promise<PdfSharePayload> {
  const { payload } = await jwtVerify(token, getSecret());
  const documentType = payload.documentType;
  const documentId = payload.documentId;
  const organizationId = payload.organizationId;

  if (
    payload.scope !== PDF_SHARE_SCOPE ||
    typeof documentType !== "string" ||
    !PDF_SHARE_DOCUMENT_TYPES.has(documentType) ||
    typeof documentId !== "string" ||
    typeof organizationId !== "string"
  ) {
    throw new Error("INVALID_PDF_SHARE_TOKEN");
  }

  return {
    documentType: documentType as PdfShareDocumentType,
    documentId,
    organizationId,
  };
}

export async function resolvePdfShareOrganizationId(
  req: NextRequest,
  expectedDocumentType: PdfShareDocumentType,
  expectedDocumentId: string,
) {
  const shareToken = req.nextUrl.searchParams.get("shareToken");
  if (!shareToken) return null;

  const payload = await verifyPdfShareToken(shareToken);
  if (
    payload.documentType !== expectedDocumentType ||
    payload.documentId !== expectedDocumentId
  ) {
    throw new Error("INVALID_PDF_SHARE_TOKEN");
  }

  return payload.organizationId;
}
