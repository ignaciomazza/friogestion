import {
  compareNamesForMatch,
  normalizeCuit,
  normalizeNameForMatch,
} from "@/lib/arca/normalization";

const DEFAULT_ARCA_SERVICE = "wsfe";
const ARCA_SERVICE_OPTIONS = [
  "wsfe",
  "wscdc",
  "ws_sr_constancia_inscripcion",
] as const;
const ARCA_SERVICE_SET = new Set<string>(ARCA_SERVICE_OPTIONS);

export function sanitizeAlias(value: string) {
  const sanitized = value.replace(/[^a-zA-Z0-9]/g, "");
  if (!sanitized) return null;
  return sanitized;
}

export function dedupeServices(services: string[]) {
  const deduped = Array.from(
    new Set(
      services
        .map((service) => service.trim().toLowerCase())
        .filter(Boolean)
    )
  ).filter((service) => ARCA_SERVICE_SET.has(service));

  return deduped.length ? deduped : [DEFAULT_ARCA_SERVICE];
}

export { ARCA_SERVICE_OPTIONS, DEFAULT_ARCA_SERVICE };
export { normalizeCuit, normalizeNameForMatch, compareNamesForMatch };
