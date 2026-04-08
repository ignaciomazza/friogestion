import QRCode from "qrcode";

type QrPayload = {
  ver: number;
  fecha: string;
  cuit: number;
  ptoVta: number;
  tipoCmp: number;
  nroCmp: number;
  importe: number;
  moneda: string;
  ctz: number;
  tipoDocRec: number;
  nroDocRec: number;
  tipoCodAut: string;
  codAut: string;
};

export function buildAfipQrUrl(payload: QrPayload) {
  const base = "https://www.afip.gob.ar/fe/qr/?p=";
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64");
  return `${base}${encoded}`;
}

export async function buildQrDataUrl(payload: QrPayload) {
  const url = buildAfipQrUrl(payload);
  return QRCode.toDataURL(url, { margin: 1, width: 220 });
}

export type { QrPayload };
