import type { ChangeEvent, RefObject } from "react";

type VideoDevice = {
  id: string;
  label: string;
};

type PurchaseQrScannerModalProps = {
  isOpen: boolean;
  isImportingQr: boolean;
  isImportingQrFromImage: boolean;
  isQrScannerActive: boolean;
  qrScannerError: string | null;
  qrVideoDevices: VideoDevice[];
  qrSelectedDeviceId: string;
  qrVideoRef: RefObject<HTMLVideoElement | null>;
  qrImageInputRef: RefObject<HTMLInputElement | null>;
  onClose: () => void;
  onSetSelectedDeviceId: (value: string) => void;
  onImportImage: (event: ChangeEvent<HTMLInputElement>) => void;
  onImportQrFromPrompt: () => Promise<void>;
};

export default function PurchaseQrScannerModal({
  isOpen,
  isImportingQr,
  isImportingQrFromImage,
  isQrScannerActive,
  qrScannerError,
  qrVideoDevices,
  qrSelectedDeviceId,
  qrVideoRef,
  qrImageInputRef,
  onClose,
  onSetSelectedDeviceId,
  onImportImage,
  onImportQrFromPrompt,
}: PurchaseQrScannerModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[125] flex items-center justify-center bg-zinc-950/35">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="purchase-qr-scanner-title"
        className="mx-3 my-6 w-full max-w-xl rounded-2xl border border-zinc-200 bg-white p-4 shadow-[0_24px_80px_-40px_rgba(24,24,27,0.55)]"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="purchase-qr-scanner-title" className="text-base font-semibold text-zinc-900">
              Escanear QR ARCA
            </h2>
            <p className="mt-1 text-xs text-zinc-500">Apunta la camara al QR del comprobante.</p>
          </div>
          <button type="button" className="btn text-xs" onClick={onClose}>
            Cerrar
          </button>
        </div>

        {qrVideoDevices.length > 1 ? (
          <label className="field-stack mt-3">
            <span className="input-label">Camara</span>
            <select
              className="input cursor-pointer"
              value={qrSelectedDeviceId}
              onChange={(event) => onSetSelectedDeviceId(event.target.value)}
            >
              {qrVideoDevices.map((device) => (
                <option key={`qr-device-${device.id}`} value={device.id}>
                  {device.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <div className="mt-3 overflow-hidden rounded-xl border border-zinc-200 bg-zinc-900/95">
          <video ref={qrVideoRef} className="h-[320px] w-full object-cover sm:h-[360px]" muted playsInline />
        </div>

        {qrScannerError ? (
          <p className="mt-3 text-xs text-rose-600">{qrScannerError}</p>
        ) : (
          <p className="mt-3 text-xs text-zinc-500">
            {isQrScannerActive
              ? "Scanner activo. Se completa la compra al detectar un QR."
              : "Preparando camara..."}
          </p>
        )}

        {isImportingQrFromImage ? (
          <p className="mt-2 text-xs text-zinc-500">Procesando imagen para detectar QR...</p>
        ) : null}

        <input
          ref={qrImageInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={onImportImage}
        />

        <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            className="btn w-full text-xs sm:w-auto"
            onClick={() => qrImageInputRef.current?.click()}
            disabled={isImportingQr || isImportingQrFromImage}
          >
            Foto QR
          </button>
          <button
            type="button"
            className="btn w-full text-xs sm:w-auto"
            onClick={async () => {
              onClose();
              await onImportQrFromPrompt();
            }}
            disabled={isImportingQr || isImportingQrFromImage}
          >
            Pegar texto QR
          </button>
        </div>
      </div>
    </div>
  );
}
