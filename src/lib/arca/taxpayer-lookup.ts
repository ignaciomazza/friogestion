import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getAfipClient } from "@/lib/afip/client";
import { normalizeCuit } from "@/lib/arca/normalization";
import { ensureArcaServiceAuthorized } from "@/lib/arca/service-authorization";

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

type LookupSource = "cache" | "arca";
type TaxpayerLookupStatus = "FOUND" | "NO_ENCONTRADO";

export type TaxpayerLookupData = {
  status: TaxpayerLookupStatus;
  taxId: string;
  legalName: string | null;
  displayName: string;
  address: string | null;
  personaType: string | null;
  taxStatus: string | null;
  state: string | null;
  registeredAt: string | null;
  sourceLabel: string;
  raw: unknown;
};

export type TaxpayerLookupResult = {
  source: LookupSource;
  checkedAt: string;
  taxpayer: TaxpayerLookupData;
};

function toInputJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue;
}

function normalizeKey(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toLowerCase();
}

function extractValueByKeys(value: unknown, keys: string[], depth = 0): unknown {
  if (depth > 6 || value === null || value === undefined) return undefined;

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = extractValueByKeys(item, keys, depth + 1);
      if (found !== undefined) return found;
    }
    return undefined;
  }

  if (typeof value !== "object") return undefined;

  const record = value as Record<string, unknown>;
  const wanted = new Set(keys.map((item) => normalizeKey(item)));

  for (const [key, raw] of Object.entries(record)) {
    if (wanted.has(normalizeKey(key))) return raw;
  }

  for (const nested of Object.values(record)) {
    const found = extractValueByKeys(nested, keys, depth + 1);
    if (found !== undefined) return found;
  }

  return undefined;
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

function compactStrings(values: Array<string | null | undefined>) {
  return values
    .map((value) => value?.trim() ?? "")
    .filter((value) => value.length > 0);
}

function formatAddressValue(value: unknown): string | null {
  const direct = asString(value);
  if (direct) return direct;
  if (!value || typeof value !== "object") return null;

  const street =
    asString(
      extractValueByKeys(value, [
        "direccion",
        "calle",
        "nombreCalle",
        "nombreVia",
        "street",
      ])
    ) ?? null;
  const number =
    asString(
      extractValueByKeys(value, [
        "numero",
        "nro",
        "numeroPuerta",
        "nroPuerta",
        "altura",
      ])
    ) ?? null;
  const floor = asString(extractValueByKeys(value, ["piso"])) ?? null;
  const apartment =
    asString(
      extractValueByKeys(value, ["departamento", "depto", "unidad", "oficina"])
    ) ?? null;
  const locality =
    asString(
      extractValueByKeys(value, [
        "localidad",
        "descripcionLocalidad",
        "ciudad",
        "descripcionCiudad",
      ])
    ) ?? null;
  const province =
    asString(
      extractValueByKeys(value, [
        "provincia",
        "descripcionProvincia",
        "nombreProvincia",
      ])
    ) ?? null;
  const postalCode =
    asString(extractValueByKeys(value, ["codigoPostal", "codPostal", "cp"])) ??
    null;

  const streetLine = compactStrings([street, number]).join(" ");
  const unitLine = compactStrings([
    floor ? `Piso ${floor}` : null,
    apartment ? `Dto ${apartment}` : null,
  ]).join(" ");
  const fullAddress = compactStrings([
    streetLine || null,
    unitLine || null,
    locality,
    province,
    postalCode,
  ]).join(", ");

  return fullAddress || null;
}

function extractAddress(payload: unknown): string | null {
  const primaryAddress = formatAddressValue(
    extractValueByKeys(payload, [
      "domicilioFiscal",
      "domicilioFiscalAFIP",
      "domicilio",
      "domicilioLegal",
    ])
  );
  if (primaryAddress) return primaryAddress;

  const directAddress = formatAddressValue(
    extractValueByKeys(payload, ["direccion", "direccionFiscal"])
  );
  if (directAddress) return directAddress;

  const locality =
    asString(
      extractValueByKeys(payload, [
        "localidad",
        "descripcionLocalidad",
        "ciudad",
        "descripcionCiudad",
      ])
    ) ?? null;
  const province =
    asString(
      extractValueByKeys(payload, [
        "provincia",
        "descripcionProvincia",
        "nombreProvincia",
      ])
    ) ?? null;
  const postalCode =
    asString(extractValueByKeys(payload, ["codigoPostal", "codPostal", "cp"])) ??
    null;
  const fallbackAddress = compactStrings([locality, province, postalCode]).join(
    ", "
  );

  return fallbackAddress || null;
}

function toIsoDate(value: unknown) {
  const text = asString(value);
  if (!text) return null;
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

function buildDisplayName(
  legalName: string | null,
  firstName: string | null,
  lastName: string | null
) {
  if (legalName) return legalName;
  const merged = [firstName, lastName].filter(Boolean).join(" ").trim();
  return merged || "Sin nombre";
}

export function normalizeTaxpayerPayload(
  payload: unknown,
  fallbackTaxId: string
): TaxpayerLookupData {
  if (!payload) {
    return {
      status: "NO_ENCONTRADO",
      taxId: fallbackTaxId,
      legalName: null,
      displayName: "No encontrado",
      address: null,
      personaType: null,
      taxStatus: null,
      state: null,
      registeredAt: null,
      sourceLabel: "ARCA",
      raw: null,
    };
  }

  const taxId =
    normalizeCuit(
      asString(
        extractValueByKeys(payload, [
          "idPersona",
          "idpersona",
          "cuit",
          "taxId",
          "nroCuit",
        ])
      )
    ) ?? fallbackTaxId;
  const legalName =
    asString(
      extractValueByKeys(payload, [
        "razonSocial",
        "denominacion",
        "nombreCompleto",
        "nombrecompleto",
      ])
    ) ?? null;
  const firstName =
    asString(
      extractValueByKeys(payload, ["nombre", "firstName", "nombrePersona"])
    ) ?? null;
  const lastName =
    asString(
      extractValueByKeys(payload, ["apellido", "lastName", "apellidoPersona"])
    ) ?? null;
  const personaType =
    asString(
      extractValueByKeys(payload, [
        "tipoPersona",
        "descripcionTipoPersona",
        "tipopersona",
      ])
    ) ?? null;
  const taxStatus =
    asString(
      extractValueByKeys(payload, [
        "descripcionImpuesto",
        "impuesto",
        "condicionIva",
        "descripcionCondicionIva",
      ])
    ) ?? null;
  const state =
    asString(
      extractValueByKeys(payload, [
        "estadoClave",
        "estado",
        "descripcionEstadoClave",
        "descripcionestado",
      ])
    ) ?? null;
  const registeredAt =
    toIsoDate(
      extractValueByKeys(payload, [
        "fechaSolicitud",
        "fechasolicitud",
        "fechaInscripcion",
        "fechaActualizacion",
      ])
    ) ?? null;
  const address = extractAddress(payload);

  return {
    status: "FOUND",
    taxId,
    legalName,
    displayName: buildDisplayName(legalName, firstName, lastName),
    address,
    personaType,
    taxStatus,
    state,
    registeredAt,
    sourceLabel: "ARCA",
    raw: payload,
  };
}

export async function lookupTaxpayerByCuit(input: {
  organizationId: string;
  taxId: string;
  forceRefresh?: boolean;
}) {
  const normalizedTaxId = normalizeCuit(input.taxId);
  if (!normalizedTaxId) {
    throw new Error("CUIT_INVALID");
  }

  const forceRefresh = Boolean(input.forceRefresh);
  const now = new Date();

  if (!forceRefresh) {
    const cache = await prisma.arcaTaxpayerLookupCache.findUnique({
      where: {
        organizationId_taxId: {
          organizationId: input.organizationId,
          taxId: normalizedTaxId,
        },
      },
      select: {
        payload: true,
        checkedAt: true,
        expiresAt: true,
      },
    });

    if (cache && cache.expiresAt.getTime() > now.getTime()) {
      return {
        source: "cache" as LookupSource,
        checkedAt: cache.checkedAt.toISOString(),
        taxpayer: cache.payload as TaxpayerLookupData,
      };
    }
  }

  await ensureArcaServiceAuthorized(
    input.organizationId,
    "ws_sr_constancia_inscripcion"
  );

  const afip = await getAfipClient(input.organizationId);
  const taxpayerPayload = await afip.RegisterInscriptionProof.getTaxpayerDetails(
    Number(normalizedTaxId)
  );
  const taxpayer = normalizeTaxpayerPayload(taxpayerPayload, normalizedTaxId);
  const taxpayerJson = toInputJson(taxpayer);
  const expiresAt = new Date(now.getTime() + CACHE_TTL_MS);

  await prisma.arcaTaxpayerLookupCache.upsert({
    where: {
      organizationId_taxId: {
        organizationId: input.organizationId,
        taxId: normalizedTaxId,
      },
    },
    create: {
      organizationId: input.organizationId,
      taxId: normalizedTaxId,
      payload: taxpayerJson,
      checkedAt: now,
      expiresAt,
    },
    update: {
      payload: taxpayerJson,
      checkedAt: now,
      expiresAt,
    },
  });

  return {
    source: "arca" as LookupSource,
    checkedAt: now.toISOString(),
    taxpayer,
  };
}

export type { LookupSource, TaxpayerLookupStatus };
