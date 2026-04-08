export type NameMatchLevel = "MATCH" | "PARTIAL" | "MISMATCH";

const LEGAL_TOKENS = new Set([
  "S",
  "A",
  "SA",
  "SAS",
  "SRL",
  "SCS",
  "SCA",
  "SH",
  "SAU",
  "SIMPLE",
  "SOCIEDAD",
  "ANONIMA",
  "RESPONSABILIDAD",
  "LIMITADA",
  "COOP",
  "COOPERATIVA",
]);

function stripDiacritics(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export function normalizeCuit(value: string | null | undefined) {
  if (!value) return null;
  const digits = value.replace(/\D/g, "");
  if (digits.length !== 11) return null;
  return digits;
}

export function normalizeNameForMatch(value: string | null | undefined) {
  if (!value) return "";
  const normalized = stripDiacritics(value)
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) return "";

  const tokens = normalized
    .split(" ")
    .filter((token) => token && !LEGAL_TOKENS.has(token));

  return tokens.join(" ").trim();
}

function toTokenSet(value: string) {
  return new Set(value.split(" ").filter(Boolean));
}

function getJaccardScore(a: string, b: string) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const aTokens = toTokenSet(a);
  const bTokens = toTokenSet(b);
  if (!aTokens.size || !bTokens.size) return 0;
  let intersection = 0;
  for (const token of aTokens) {
    if (bTokens.has(token)) intersection += 1;
  }
  const union = aTokens.size + bTokens.size - intersection;
  return union > 0 ? intersection / union : 0;
}

function getBigramScore(a: string, b: string) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const cleanA = a.replace(/\s+/g, "");
  const cleanB = b.replace(/\s+/g, "");
  if (cleanA.length < 2 || cleanB.length < 2) return 0;
  const pairsA = new Map<string, number>();
  for (let i = 0; i < cleanA.length - 1; i += 1) {
    const pair = cleanA.slice(i, i + 2);
    pairsA.set(pair, (pairsA.get(pair) ?? 0) + 1);
  }
  let intersection = 0;
  for (let i = 0; i < cleanB.length - 1; i += 1) {
    const pair = cleanB.slice(i, i + 2);
    const count = pairsA.get(pair) ?? 0;
    if (count > 0) {
      intersection += 1;
      pairsA.set(pair, count - 1);
    }
  }
  const totalPairs = cleanA.length - 1 + (cleanB.length - 1);
  return totalPairs > 0 ? (2 * intersection) / totalPairs : 0;
}

export function compareNamesForMatch(
  inputName: string | null | undefined,
  arcaName: string | null | undefined
) {
  const normalizedInput = normalizeNameForMatch(inputName);
  const normalizedArca = normalizeNameForMatch(arcaName);
  if (!normalizedInput || !normalizedArca) {
    return {
      level: "MISMATCH" as NameMatchLevel,
      score: 0,
      normalizedInput,
      normalizedArca,
    };
  }

  if (normalizedInput === normalizedArca) {
    return {
      level: "MATCH" as NameMatchLevel,
      score: 1,
      normalizedInput,
      normalizedArca,
    };
  }

  const tokenScore = getJaccardScore(normalizedInput, normalizedArca);
  const charScore = getBigramScore(normalizedInput, normalizedArca);
  const score = Number(((tokenScore * 0.6) + (charScore * 0.4)).toFixed(4));

  if (score >= 0.58) {
    return {
      level: "PARTIAL" as NameMatchLevel,
      score,
      normalizedInput,
      normalizedArca,
    };
  }

  return {
    level: "MISMATCH" as NameMatchLevel,
    score,
    normalizedInput,
    normalizedArca,
  };
}
