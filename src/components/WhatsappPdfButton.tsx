"use client";

import { useState, type MouseEvent } from "react";
import { toast } from "react-toastify";
import { LinkIcon } from "@/components/icons";
import type { PdfShareDocumentType } from "@/lib/pdf/share-token";

type WhatsappPdfButtonProps = {
  documentType: PdfShareDocumentType;
  documentId: string;
  documentLabel: string;
  customerName: string;
  customerPhone?: string | null;
  className?: string;
  stopPropagation?: boolean;
  pdfVariant?: "factura" | "comprobante";
};

type ShareTokenResponse = {
  url?: string;
  error?: string;
};

const copyToClipboard = async (value: string) => {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  document.body.removeChild(textarea);
};

export function WhatsappPdfButton({
  documentType,
  documentId,
  documentLabel,
  className = "btn text-xs",
  stopPropagation,
  pdfVariant,
}: WhatsappPdfButtonProps) {
  const [isCopying, setIsCopying] = useState(false);

  if (documentType !== "fiscalInvoice") return null;

  const handleClick = async (event: MouseEvent<HTMLButtonElement>) => {
    if (stopPropagation) {
      event.stopPropagation();
    }
    if (isCopying) return;
    setIsCopying(true);

    try {
      const res = await fetch("/api/pdf/share-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentType, documentId, pdfVariant }),
      });
      const data = (await res.json().catch(() => null)) as ShareTokenResponse | null;
      if (!res.ok || !data?.url) {
        throw new Error(data?.error ?? "No se pudo generar el enlace");
      }

      await copyToClipboard(data.url);
      toast.success(`Enlace copiado: ${documentLabel}`);
    } catch {
      toast.error("No se pudo copiar el enlace.");
    } finally {
      setIsCopying(false);
    }
  };

  return (
    <button
      type="button"
      className={className}
      onClick={handleClick}
      disabled={isCopying}
      aria-label={`Copiar enlace de ${documentLabel}`}
      title={`Copiar enlace de ${documentLabel}`}
    >
      <LinkIcon className="size-4" />
      {isCopying ? "Copiando..." : "Compartir"}
    </button>
  );
}
