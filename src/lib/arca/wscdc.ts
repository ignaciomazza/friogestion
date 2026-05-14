import { getAfipClient } from "@/lib/afip/client";
import { ensureArcaServiceAuthorized } from "@/lib/arca/service-authorization";
import { normalizeCuit } from "@/lib/arca/normalization";

const WSC_DC_OPTIONS = {
  WSDL: "https://servicios1.afip.gov.ar/wscdc/service.asmx?WSDL",
  URL: "https://servicios1.afip.gov.ar/wscdc/service.asmx",
  WSDL_TEST: "https://wswhomo.afip.gov.ar/wscdc/service.asmx?WSDL",
  URL_TEST: "https://wswhomo.afip.gov.ar/wscdc/service.asmx",
  soapV1_2: true,
};

export type PurchaseValidationStatus =
  | "AUTHORIZED"
  | "REJECTED"
  | "OBSERVED"
  | "ERROR";

export type PurchaseValidationInput = {
  mode: string;
  issuerTaxId: string;
  pointOfSale: number;
  voucherType: number;
  voucherNumber: number;
  voucherDate: Date;
  totalAmount: number;
  authorizationCode: string;
  receiverDocType?: number | null;
  receiverDocNumber?: string | null;
};

export type PurchaseValidationResult = {
  status: PurchaseValidationStatus;
  message: string;
  raw: unknown;
  comprobante: PurchaseValidationVoucherSnapshot | null;
};

export type PurchaseValidationVoucherSnapshot = {
  mode: string | null;
  issuerTaxId: string | null;
  pointOfSale: number | null;
  voucherType: number | null;
  voucherNumber: number | null;
  voucherDate: string | null;
  totalAmount: number | null;
  authorizationCode: string | null;
  receiverDocType: string | null;
  receiverDocNumber: string | null;
};

function normalizeKey(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toLowerCase();
}

function asString(value: unknown) {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }
  if (typeof value === "number" || typeof value === "bigint") {
    return String(value);
  }
  return null;
}

function asNumber(value: unknown) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === "string") {
    const parsed = Number(value.replace(",", ".").trim());
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function normalizeArcaDate(value: unknown) {
  const text = asString(value);
  if (!text) return null;
  const digits = text.replace(/\D/g, "");
  if (digits.length !== 8) return null;
  const year = digits.slice(0, 4);
  const month = digits.slice(4, 6);
  const day = digits.slice(6, 8);
  return `${year}-${month}-${day}`;
}

function extractValueByKeys(value: unknown, keys: string[], depth = 0): unknown {
  if (depth > 7 || value === null || value === undefined) return undefined;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = extractValueByKeys(item, keys, depth + 1);
      if (found !== undefined) return found;
    }
    return undefined;
  }
  if (typeof value !== "object") return undefined;
  const wanted = new Set(keys.map((item) => normalizeKey(item)));
  const record = value as Record<string, unknown>;
  for (const [key, raw] of Object.entries(record)) {
    if (wanted.has(normalizeKey(key))) return raw;
  }
  for (const nested of Object.values(record)) {
    const found = extractValueByKeys(nested, keys, depth + 1);
    if (found !== undefined) return found;
  }
  return undefined;
}

function collectMessages(value: unknown, depth = 0): string[] {
  if (depth > 6 || value === null || value === undefined) return [];
  if (Array.isArray(value)) {
    return value.flatMap((item) => collectMessages(item, depth + 1));
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const messages: string[] = [];
    for (const [key, raw] of Object.entries(record)) {
      const normalized = normalizeKey(key);
      if (
        normalized.includes("msg") ||
        normalized.includes("observ") ||
        normalized.includes("error") ||
        normalized.includes("descripcion")
      ) {
        const text = asString(raw);
        if (text) messages.push(text);
      }
      messages.push(...collectMessages(raw, depth + 1));
    }
    return messages;
  }
  return [];
}

function toDateNumber(value: Date) {
  const local = new Date(value.getTime() - value.getTimezoneOffset() * 60000);
  return Number(local.toISOString().slice(0, 10).replace(/-/g, ""));
}

function normalizeResultWord(value: string | null) {
  if (!value) return "";
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .trim();
}

function normalizeVoucherSnapshot(
  payload: unknown,
): PurchaseValidationVoucherSnapshot | null {
  const cmpResp = extractValueByKeys(payload, ["CmpResp", "cmpResp"]);
  if (!cmpResp || typeof cmpResp !== "object") {
    return null;
  }

  const issuerTaxId = asString(
    extractValueByKeys(cmpResp, ["CuitEmisor", "cuitEmisor"]),
  )
    ?.replace(/\D/g, "")
    .trim();
  const receiverDocNumber = asString(
    extractValueByKeys(cmpResp, ["DocNroReceptor", "docNroReceptor"]),
  )
    ?.replace(/\D/g, "")
    .trim();

  return {
    mode: asString(extractValueByKeys(cmpResp, ["CbteModo", "cbteModo"])),
    issuerTaxId: issuerTaxId || null,
    pointOfSale: asNumber(extractValueByKeys(cmpResp, ["PtoVta", "ptoVta"])),
    voucherType: asNumber(extractValueByKeys(cmpResp, ["CbteTipo", "cbteTipo"])),
    voucherNumber: asNumber(extractValueByKeys(cmpResp, ["CbteNro", "cbteNro"])),
    voucherDate: normalizeArcaDate(
      extractValueByKeys(cmpResp, ["CbteFch", "cbteFch"]),
    ),
    totalAmount: asNumber(extractValueByKeys(cmpResp, ["ImpTotal", "impTotal"])),
    authorizationCode:
      asString(
        extractValueByKeys(cmpResp, ["CodAutorizacion", "codAutorizacion"]),
      ) ?? null,
    receiverDocType:
      asString(
        extractValueByKeys(cmpResp, ["DocTipoReceptor", "docTipoReceptor"]),
      ) ?? null,
    receiverDocNumber: receiverDocNumber || null,
  };
}

export function normalizeWscdcResponse(payload: unknown): PurchaseValidationResult {
  const comprobante = normalizeVoucherSnapshot(payload);
  const resultWord = normalizeResultWord(
    asString(
      extractValueByKeys(payload, [
        "Resultado",
        "resultado",
        "Result",
        "estado",
        "status",
      ])
    )
  );
  const messages = collectMessages(payload);
  const firstDetailedMessage = messages.find((item) => {
    const normalized = normalizeResultWord(item);
    if (!normalized) return false;
    if (normalized === resultWord) return false;
    if (
      normalized === "A" ||
      normalized === "R" ||
      normalized === "O" ||
      normalized === "APROBADO" ||
      normalized === "AUTORIZADO" ||
      normalized === "RECHAZADO" ||
      normalized === "OBSERVADO"
    ) {
      return false;
    }
    return true;
  });
  const message =
    firstDetailedMessage ??
    (resultWord ? `Resultado ARCA: ${resultWord}` : messages.find(Boolean)) ??
    "Respuesta ARCA recibida";

  if (
    resultWord === "A" ||
    resultWord.includes("APROB") ||
    resultWord.includes("AUTORIZ")
  ) {
    return { status: "AUTHORIZED", message, raw: payload, comprobante };
  }

  if (
    resultWord === "R" ||
    resultWord.includes("RECHAZ") ||
    resultWord.includes("INVALID")
  ) {
    return { status: "REJECTED", message, raw: payload, comprobante };
  }

  if (
    resultWord === "O" ||
    resultWord.includes("OBS") ||
    messages.some((item) => normalizeResultWord(item).includes("OBS"))
  ) {
    return { status: "OBSERVED", message, raw: payload, comprobante };
  }

  if (!resultWord && messages.length > 0) {
    return { status: "OBSERVED", message, raw: payload, comprobante };
  }

  return {
    status: "ERROR",
    message: message || "No se pudo interpretar la respuesta de ARCA.",
    raw: payload,
    comprobante,
  };
}

function parseDocNumber(value?: string | null) {
  if (!value) return null;
  const digits = value.replace(/\D/g, "");
  if (!digits) return null;
  return Number(digits);
}

export async function validatePurchaseVoucherWithArca(input: {
  organizationId: string;
  data: PurchaseValidationInput;
}, deps?: {
  ensureServiceAuthorized?: typeof ensureArcaServiceAuthorized;
  getClient?: typeof getAfipClient;
}) {
  const ensureServiceAuthorized =
    deps?.ensureServiceAuthorized ?? ensureArcaServiceAuthorized;
  const getClient = deps?.getClient ?? getAfipClient;

  await ensureServiceAuthorized(input.organizationId, "wscdc");

  const issuerTaxId = normalizeCuit(input.data.issuerTaxId);
  if (!issuerTaxId) {
    throw new Error("ARCA_ISSUER_CUIT_INVALID");
  }

  const afip = await getClient(input.organizationId);
  const wscdc = afip.WebService("wscdc", WSC_DC_OPTIONS);
  const { token, sign } = await wscdc.getTokenAuthorization();

  const payload: Record<string, unknown> = {
    Auth: {
      Token: token,
      Sign: sign,
      Cuit: Number(afip.CUIT),
    },
    CmpReq: {
      CbteModo: input.data.mode,
      CuitEmisor: Number(issuerTaxId),
      PtoVta: input.data.pointOfSale,
      CbteTipo: input.data.voucherType,
      CbteNro: input.data.voucherNumber,
      CbteFch: toDateNumber(input.data.voucherDate),
      ImpTotal: Number(input.data.totalAmount.toFixed(2)),
      CodAutorizacion: input.data.authorizationCode,
    },
  };

  if (input.data.receiverDocType !== null && input.data.receiverDocType !== undefined) {
    (payload.CmpReq as Record<string, unknown>).DocTipoReceptor =
      input.data.receiverDocType;
  }
  const receiverDocNumber = parseDocNumber(input.data.receiverDocNumber);
  if (receiverDocNumber !== null) {
    (payload.CmpReq as Record<string, unknown>).DocNroReceptor =
      receiverDocNumber;
  }

  const response = await wscdc.executeRequest("ComprobanteConstatar", payload);
  return normalizeWscdcResponse(response);
}
