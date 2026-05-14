type SearchableProduct = {
  id: string;
  name: string;
  sku: string | null;
  purchaseCode: string | null;
  brand: string | null;
  model: string | null;
};

type RankedProduct<T extends SearchableProduct> = {
  product: T;
  score: number;
  index: number;
};

type SearchTarget = {
  value: string;
  compact: string;
  words: string[];
  weight: number;
};

const SPACES_REGEX = /\s+/g;
const DIACRITICS_REGEX = /[\u0300-\u036f]/g;
const NON_ALNUM_REGEX = /[^\p{L}\p{N}]+/gu;

export const normalizeSearchText = (value: string) =>
  value
    .normalize("NFD")
    .replace(DIACRITICS_REGEX, "")
    .toLowerCase()
    .replace(NON_ALNUM_REGEX, " ")
    .trim()
    .replace(SPACES_REGEX, " ");

const compactSearchText = (value: string) => value.replace(SPACES_REGEX, "");

const maxTokenDistance = (tokenLength: number) => {
  if (tokenLength <= 4) return 1;
  if (tokenLength <= 8) return 2;
  return 3;
};

const levenshteinWithin = (a: string, b: string, maxDistance: number) => {
  const aLength = a.length;
  const bLength = b.length;

  if (Math.abs(aLength - bLength) > maxDistance) {
    return null;
  }

  const previous = new Array<number>(bLength + 1);
  const current = new Array<number>(bLength + 1);

  for (let j = 0; j <= bLength; j += 1) {
    previous[j] = j;
  }

  for (let i = 1; i <= aLength; i += 1) {
    current[0] = i;
    let rowMin = current[0];

    for (let j = 1; j <= bLength; j += 1) {
      const substitutionCost = a[i - 1] === b[j - 1] ? 0 : 1;
      const deletion = previous[j] + 1;
      const insertion = current[j - 1] + 1;
      const substitution = previous[j - 1] + substitutionCost;
      const next = Math.min(deletion, insertion, substitution);
      current[j] = next;
      if (next < rowMin) rowMin = next;
    }

    if (rowMin > maxDistance) {
      return null;
    }

    for (let j = 0; j <= bLength; j += 1) {
      previous[j] = current[j];
    }
  }

  const distance = previous[bLength];
  return distance <= maxDistance ? distance : null;
};

const scoreTokenInTarget = (token: string, target: SearchTarget) => {
  if (!token || !target.value) return 0;

  if (target.value === token) return 150 * target.weight;
  if (target.words.includes(token)) return 138 * target.weight;
  if (target.value.startsWith(token)) return 124 * target.weight;
  if (target.value.includes(token)) return 110 * target.weight;

  const compactToken = compactSearchText(token);
  if (
    compactToken.length >= 4 &&
    target.compact.length >= compactToken.length &&
    target.compact.includes(compactToken)
  ) {
    return 102 * target.weight;
  }

  const allowedDistance = maxTokenDistance(token.length);
  let bestDistance: number | null = null;

  for (const word of target.words) {
    if (!word) continue;
    const distance = levenshteinWithin(token, word, allowedDistance);
    if (distance === null) continue;
    if (bestDistance === null || distance < bestDistance) {
      bestDistance = distance;
      if (bestDistance === 0) break;
    }
  }

  if (bestDistance === null) return 0;

  const lengthPenalty = Math.min(3, Math.abs(token.length - target.value.length)) * 3;
  const score = 92 - bestDistance * 24 - lengthPenalty;
  return Math.max(0, score) * target.weight;
};

export const scoreProductSearchMatch = (
  product: SearchableProduct,
  rawQuery: string,
) => {
  const normalizedQuery = normalizeSearchText(rawQuery);
  if (!normalizedQuery) return null;

  const tokens = normalizedQuery.split(" ").filter(Boolean);
  if (tokens.length === 0) return null;

  const normalizedName = normalizeSearchText(product.name ?? "");
  const normalizedSku = normalizeSearchText(product.sku ?? "");
  const normalizedPurchaseCode = normalizeSearchText(product.purchaseCode ?? "");
  const normalizedBrand = normalizeSearchText(product.brand ?? "");
  const normalizedModel = normalizeSearchText(product.model ?? "");

  const combined = [
    normalizedName,
    normalizedSku,
    normalizedPurchaseCode,
    normalizedBrand,
    normalizedModel,
  ]
    .filter(Boolean)
    .join(" ");
  if (!combined) return null;

  const combinedCompact = compactSearchText(combined);
  const queryCompact = compactSearchText(normalizedQuery);

  const targets: SearchTarget[] = [
    {
      value: normalizedName,
      compact: compactSearchText(normalizedName),
      words: normalizedName ? normalizedName.split(" ") : [],
      weight: 1.55,
    },
    {
      value: normalizedSku,
      compact: compactSearchText(normalizedSku),
      words: normalizedSku ? normalizedSku.split(" ") : [],
      weight: 1.2,
    },
    {
      value: normalizedPurchaseCode,
      compact: compactSearchText(normalizedPurchaseCode),
      words: normalizedPurchaseCode ? normalizedPurchaseCode.split(" ") : [],
      weight: 1.15,
    },
    {
      value: normalizedBrand,
      compact: compactSearchText(normalizedBrand),
      words: normalizedBrand ? normalizedBrand.split(" ") : [],
      weight: 1,
    },
    {
      value: normalizedModel,
      compact: compactSearchText(normalizedModel),
      words: normalizedModel ? normalizedModel.split(" ") : [],
      weight: 1,
    },
    {
      value: combined,
      compact: combinedCompact,
      words: combined.split(" "),
      weight: 1.1,
    },
  ];

  let score = 0;
  if (combined.includes(normalizedQuery)) {
    score += 1200;
  } else if (
    queryCompact.length >= 4 &&
    combinedCompact.length >= queryCompact.length &&
    combinedCompact.includes(queryCompact)
  ) {
    score += 1040;
  }

  if (normalizedName.startsWith(normalizedQuery)) {
    score += 420;
  } else if (normalizedName.includes(normalizedQuery)) {
    score += 280;
  }

  let matchedTokens = 0;
  for (const token of tokens) {
    let bestTokenScore = 0;
    for (const target of targets) {
      const tokenScore = scoreTokenInTarget(token, target);
      if (tokenScore > bestTokenScore) {
        bestTokenScore = tokenScore;
      }
    }

    if (bestTokenScore > 0) {
      matchedTokens += 1;
      score += bestTokenScore;
    }
  }

  if (matchedTokens === 0) return null;

  const coverage = matchedTokens / tokens.length;
  if (coverage < 0.5 && score < 1000) return null;

  score += coverage * 280;
  if (matchedTokens === tokens.length) {
    score += 160;
  }

  return Math.round(score);
};

export const rankProductsBySearchQuery = <T extends SearchableProduct>(
  products: T[],
  query: string,
) => {
  const ranked: RankedProduct<T>[] = [];

  products.forEach((product, index) => {
    const score = scoreProductSearchMatch(product, query);
    if (score === null) return;
    ranked.push({ product, score, index });
  });

  ranked.sort((a, b) => {
    if (a.score !== b.score) return b.score - a.score;
    return a.index - b.index;
  });

  return ranked.map((entry) => entry.product);
};

