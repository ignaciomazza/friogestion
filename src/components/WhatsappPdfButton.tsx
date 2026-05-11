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

const toAbsoluteUrl = (path: string) =>
  new URL(path, window.location.origin).toString();

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

const reserveWhatsappTab = () => {
  // Reserve the tab during the click gesture so the async token request
  // does not trigger popup blockers before opening WhatsApp.
  const popup = window.open("about:blank", "_blank");

  if (!popup) {
    return {
      close: () => undefined,
      open: (url: string) => {
        window.location.assign(url);
      },
    };
  }

  popup.opener = null;

  return {
    close: () => {
      if (!popup.closed) {
        popup.close();
      }
    },
    open: (url: string) => {
      popup.location.href = url;
    },
  };
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
  const whatsappTab = reserveWhatsappTab();

  try {
    const pdfUrl = await requestShareUrl({ documentType, documentId });
    const message = buildWhatsappMessage({
      customerName,
      documentLabel,
      pdfUrl,
    });
    const whatsappUrl = `https://wa.me/${whatsappPhone}?text=${encodeURIComponent(
      message,
    )}`;
    whatsappTab.open(whatsappUrl);
  } catch (error) {
    whatsappTab.close();
    throw error;
  }
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
