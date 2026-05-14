"use client";

import type { PdfShareDocumentType } from "@/lib/pdf/share-token";

type WhatsappPdfButtonProps = {
  documentType: PdfShareDocumentType;
  documentId: string;
  documentLabel: string;
  customerName: string;
  customerPhone?: string | null;
  className?: string;
  stopPropagation?: boolean;
};

export function WhatsappPdfButton(_props: WhatsappPdfButtonProps) {
  void _props;
  return null;
}
