"use client";

import { useMemo, useState, type MouseEvent } from "react";
import { PhoneIcon } from "@/components/icons";
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

type ShareTokenResponse = {
  url?: string;
  error?: string;
};

type NavigatorWithFileShare = Navigator & {
  canShare?: (data: ShareData) => boolean;
};

type NativeShareResult = "shared" | "cancelled" | "unsupported";

const buildPdfUrl = (
  documentType: PdfShareDocumentType,
  documentId: string,
) => {
  if (documentType === "quote") {
    return `/api/pdf/quote?id=${encodeURIComponent(documentId)}`;
  }

  if (documentType === "sale") {
    return `/api/pdf/sale?id=${encodeURIComponent(documentId)}`;
  }

  if (documentType === "fiscalInvoice") {
    return `/api/fiscal-invoices/${encodeURIComponent(documentId)}/pdf`;
  }

  return `/api/credit-notes/${encodeURIComponent(documentId)}/pdf`;
};

const toAbsoluteUrl = (path: string) =>
  new URL(path, window.location.origin).toString();

const buildPdfFilename = (documentLabel: string) => {
  const slug = documentLabel
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${slug || "documento"}.pdf`;
};

const normalizeWhatsappPhone = (phone?: string | null) => {
  if (!phone) return null;
  const trimmedPhone = phone.trim();
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 8) return null;

  if (trimmedPhone.startsWith("+")) {
    return digits;
  }

  if (digits.startsWith("00")) {
    return digits.slice(2);
  }

  if (digits.startsWith("54")) {
    return digits;
  }

  if (digits.length > 11) {
    return digits;
  }

  const nationalNumber = digits.replace(/^0+/, "");
  if (nationalNumber.length < 8) return null;
  return `54${nationalNumber}`;
};

const buildWhatsappMessage = ({
  customerName,
  documentLabel,
  pdfUrl,
}: {
  customerName: string;
  documentLabel: string;
  pdfUrl: string;
}) => {
  const greeting = customerName.trim() ? `Hola ${customerName.trim()},` : "Hola,";
  return [
    `${greeting} te enviamos ${documentLabel}.`,
    "",
    `Ver ${documentLabel}:`,
    pdfUrl,
  ].join("\n");
};

const buildShareText = ({
  customerName,
  documentLabel,
}: {
  customerName: string;
  documentLabel: string;
}) => {
  const greeting = customerName.trim() ? `Hola ${customerName.trim()},` : "Hola,";
  return `${greeting} te enviamos ${documentLabel}.`;
};

const isFetchError = (error: unknown) =>
  error instanceof TypeError && error.message.toLowerCase().includes("fetch");

const canSharePdfFiles = () => {
  const shareNavigator = navigator as NavigatorWithFileShare;
  if (!shareNavigator.share || !shareNavigator.canShare) {
    return false;
  }

  const testFile = new File([""], "documento.pdf", {
    type: "application/pdf",
  });
  return shareNavigator.canShare({ files: [testFile] });
};

const fetchPdfFile = async ({
  documentType,
  documentId,
  documentLabel,
}: {
  documentType: PdfShareDocumentType;
  documentId: string;
  documentLabel: string;
}) => {
  const response = await fetch(
    toAbsoluteUrl(buildPdfUrl(documentType, documentId)),
    {
      cache: "no-store",
      credentials: "same-origin",
    },
  );

  if (!response.ok) {
    throw new Error("No se pudo preparar el PDF");
  }

  const contentType = response.headers.get("Content-Type") ?? "";
  if (!contentType.toLowerCase().includes("application/pdf")) {
    throw new Error("La respuesta no es un PDF valido");
  }

  const blob = await response.blob();
  return new File([blob], buildPdfFilename(documentLabel), {
    type: "application/pdf",
  });
};

const requestShareUrl = async ({
  documentType,
  documentId,
}: {
  documentType: PdfShareDocumentType;
  documentId: string;
}) => {
  const response = await fetch(toAbsoluteUrl("/api/pdf/share-token"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    credentials: "same-origin",
    body: JSON.stringify({ documentType, documentId }),
  });
  const data = (await response.json().catch(() => null)) as
    | ShareTokenResponse
    | null;

  if (!response.ok || !data?.url) {
    throw new Error(data?.error ?? "No se pudo preparar el PDF");
  }

  return data.url;
};

const trySharePdfFile = async ({
  documentType,
  documentId,
  documentLabel,
  customerName,
}: {
  documentType: PdfShareDocumentType;
  documentId: string;
  documentLabel: string;
  customerName: string;
}): Promise<NativeShareResult> => {
  if (!canSharePdfFiles()) {
    return "unsupported";
  }

  try {
    const shareNavigator = navigator as NavigatorWithFileShare;
    const pdfFile = await fetchPdfFile({
      documentType,
      documentId,
      documentLabel,
    });
    const shareData: ShareData = {
      files: [pdfFile],
      title: documentLabel,
      text: buildShareText({ customerName, documentLabel }),
    };

    if (!shareNavigator.canShare(shareData)) {
      return "unsupported";
    }

    await shareNavigator.share(shareData);
    return "shared";
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return "cancelled";
    }
    if (isFetchError(error)) {
      throw new Error("No se pudo conectar con la app para preparar el PDF.");
    }
    return "unsupported";
  }
};

const openWhatsappLink = async ({
  documentType,
  documentId,
  documentLabel,
  customerName,
  whatsappPhone,
}: {
  documentType: PdfShareDocumentType;
  documentId: string;
  documentLabel: string;
  customerName: string;
  whatsappPhone: string;
}) => {
  const pdfUrl = await requestShareUrl({ documentType, documentId });
  const message = buildWhatsappMessage({
    customerName,
    documentLabel,
    pdfUrl,
  });
  const whatsappUrl = `https://wa.me/${whatsappPhone}?text=${encodeURIComponent(
    message,
  )}`;
  window.open(whatsappUrl, "_blank", "noopener,noreferrer");
};

export function WhatsappPdfButton({
  documentType,
  documentId,
  documentLabel,
  customerName,
  customerPhone,
  className = "btn btn-emerald text-xs transition-transform hover:-translate-y-0.5",
  stopPropagation = false,
}: WhatsappPdfButtonProps) {
  const [isOpening, setIsOpening] = useState(false);
  const whatsappPhone = useMemo(
    () => normalizeWhatsappPhone(customerPhone),
    [customerPhone],
  );

  if (!whatsappPhone) return null;

  const handleClick = async (event: MouseEvent<HTMLButtonElement>) => {
    if (stopPropagation) {
      event.stopPropagation();
    }

    setIsOpening(true);
    try {
      const nativeShareResult = await trySharePdfFile({
        documentType,
        documentId,
        documentLabel,
        customerName,
      });
      if (nativeShareResult !== "unsupported") {
        return;
      }

      await openWhatsappLink({
        documentType,
        documentId,
        documentLabel,
        customerName,
        whatsappPhone,
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "No se pudo preparar el envio por WhatsApp";
      window.alert(message);
    } finally {
      setIsOpening(false);
    }
  };

  return (
    <button
      type="button"
      className={className}
      onClick={handleClick}
      disabled={isOpening}
      title={`Compartir ${documentLabel} por WhatsApp`}
      aria-label={`Compartir ${documentLabel} por WhatsApp`}
    >
      <PhoneIcon className="size-4" />
      {isOpening ? "Preparando..." : "WhatsApp"}
    </button>
  );
}
