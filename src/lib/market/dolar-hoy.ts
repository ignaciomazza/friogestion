type DolarRate = {
  buy: number;
  sell: number;
  updatedAt: string | null;
  source: string;
};

type DolarBlueRate = DolarRate;
type DolarOfficialRate = DolarRate;

type SourceSpec = {
  name: string;
  url: string;
  parse: (payload: unknown, text?: string) => DolarRate | null;
};

const parseNumber = (value: unknown) => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const raw = value.trim();
  if (!raw) return null;
  const cleaned = raw.replace(/[^0-9.,-]/g, "");
  if (!cleaned) return null;
  const normalized =
    cleaned.includes(",") && cleaned.includes(".")
      ? cleaned.replace(/\./g, "").replace(",", ".")
      : cleaned.replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
};

const parseDate = (value: unknown) => {
  if (typeof value !== "string") return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
};

const parseDolarApi = (payload: unknown): DolarRate | null => {
  if (!payload || typeof payload !== "object") return null;
  const data = payload as Record<string, unknown>;
  const buy =
    parseNumber(data.compra) ?? parseNumber(data.buy) ?? parseNumber(data.bid);
  const sell =
    parseNumber(data.venta) ?? parseNumber(data.sell) ?? parseNumber(data.ask);
  if (buy === null || sell === null) return null;
  const updatedAt =
    parseDate(data.fechaActualizacion) ??
    parseDate(data.fecha) ??
    parseDate(data.updatedAt);
  return { buy, sell, updatedAt, source: "DolarApi" };
};

const parseBlueLyticsByKey = (
  payload: unknown,
  key: "blue" | "oficial"
): DolarRate | null => {
  if (!payload || typeof payload !== "object") return null;
  const data = payload as Record<string, unknown>;
  const item = data[key] as Record<string, unknown> | undefined;
  if (!item || typeof item !== "object") return null;
  const buy =
    parseNumber(item.value_buy) ??
    parseNumber(item.compra) ??
    parseNumber(item.buy);
  const sell =
    parseNumber(item.value_sell) ??
    parseNumber(item.venta) ??
    parseNumber(item.sell);
  if (buy === null || sell === null) return null;
  const updatedAt =
    parseDate(item.last_update) ??
    parseDate(item.fecha) ??
    parseDate(item.updatedAt);
  return { buy, sell, updatedAt, source: "BlueLytics" };
};

const parseBlueLyticsBlue = (payload: unknown): DolarRate | null => {
  return parseBlueLyticsByKey(payload, "blue");
};

const parseBlueLyticsOfficial = (payload: unknown): DolarRate | null => {
  return parseBlueLyticsByKey(payload, "oficial");
};

const parseDolarHoy = (
  payload: unknown,
  text = ""
): DolarRate | null => {
  if (payload && typeof payload === "object") {
    const data = payload as Record<string, unknown>;
    const buy =
      parseNumber(data.compra) ?? parseNumber(data.buy) ?? parseNumber(data.bid);
    const sell =
      parseNumber(data.venta) ??
      parseNumber(data.sell) ??
      parseNumber(data.ask);
    if (buy === null || sell === null) return null;
    const updatedAt =
      parseDate(data.fechaActualizacion) ??
      parseDate(data.fecha) ??
      parseDate(data.updatedAt);
    return { buy, sell, updatedAt, source: "DolarHoy" };
  }

  const match = text.match(
    /compra[^0-9]*([\d.,]+)[\s\S]*?venta[^0-9]*([\d.,]+)/i
  );
  if (!match) return null;
  const buy = parseNumber(match[1]);
  const sell = parseNumber(match[2]);
  if (buy === null || sell === null) return null;
  return { buy, sell, updatedAt: null, source: "DolarHoy" };
};

const parseDolarsiByName = (
  payload: unknown,
  matcher: (name: string) => boolean
): DolarRate | null => {
  if (!Array.isArray(payload)) return null;
  const entry = payload.find((item) => {
    if (!item || typeof item !== "object") return false;
    const casa = (item as Record<string, unknown>).casa as
      | Record<string, unknown>
      | undefined;
    const nombre = casa?.nombre?.toString().toLowerCase() ?? "";
    return matcher(nombre);
  }) as Record<string, unknown> | undefined;
  if (!entry) return null;
  const casa = entry.casa as Record<string, unknown> | undefined;
  if (!casa) return null;
  const buy =
    parseNumber(casa.compra) ?? parseNumber(casa.buy) ?? parseNumber(casa.bid);
  const sell =
    parseNumber(casa.venta) ?? parseNumber(casa.sell) ?? parseNumber(casa.ask);
  if (buy === null || sell === null) return null;
  return { buy, sell, updatedAt: null, source: "DolarSi" };
};

const parseDolarsiBlue = (payload: unknown): DolarRate | null => {
  return parseDolarsiByName(payload, (name) => name.includes("blue"));
};

const parseDolarsiOfficial = (payload: unknown): DolarRate | null => {
  return parseDolarsiByName(payload, (name) => name.includes("oficial"));
};

const BLUE_SOURCES: SourceSpec[] = [
  {
    name: "DolarApi",
    url: "https://dolarapi.com/v1/dolares/blue",
    parse: parseDolarApi,
  },
  {
    name: "BlueLytics",
    url: "https://api.bluelytics.com.ar/v2/latest",
    parse: parseBlueLyticsBlue,
  },
  {
    name: "DolarSi",
    url: "https://www.dolarsi.com/api/api.php?type=valoresprincipales",
    parse: parseDolarsiBlue,
  },
  {
    name: "DolarHoy",
    url: "https://dolarhoy.com/api/dolarblue",
    parse: parseDolarHoy,
  },
];

const OFFICIAL_SOURCES: SourceSpec[] = [
  {
    name: "DolarApi",
    url: "https://dolarapi.com/v1/dolares/oficial",
    parse: parseDolarApi,
  },
  {
    name: "BlueLytics",
    url: "https://api.bluelytics.com.ar/v2/latest",
    parse: parseBlueLyticsOfficial,
  },
  {
    name: "DolarSi",
    url: "https://www.dolarsi.com/api/api.php?type=valoresprincipales",
    parse: parseDolarsiOfficial,
  },
  {
    name: "DolarHoy",
    url: "https://dolarhoy.com/api/dolaroficial",
    parse: parseDolarHoy,
  },
];

const parseJson = (text: string) => {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
};

async function fetchDolarFromSources(
  sources: SourceSpec[]
): Promise<DolarRate | null> {
  for (const source of sources) {
    try {
      const res = await fetch(source.url, {
        headers: {
          Accept: "application/json,text/html;q=0.9",
          "User-Agent": "FrioGestion/1.0",
        },
        next: { revalidate: 300 },
      });
      if (!res.ok) continue;
      const text = await res.text();
      const payload = parseJson(text);
      const parsed = source.parse(payload ?? text, text);
      if (parsed) {
        return parsed;
      }
    } catch {
      // try next source
    }
  }

  return null;
}

export async function fetchDolarBlue(): Promise<DolarBlueRate | null> {
  return fetchDolarFromSources(BLUE_SOURCES);
}

export async function fetchDolarOfficial(): Promise<DolarOfficialRate | null> {
  return fetchDolarFromSources(OFFICIAL_SOURCES);
}

export async function fetchDolarMarketRates(): Promise<{
  blue: DolarBlueRate | null;
  official: DolarOfficialRate | null;
}> {
  const [blue, official] = await Promise.all([
    fetchDolarBlue(),
    fetchDolarOfficial(),
  ]);

  return { blue, official };
}

export type { DolarRate, DolarBlueRate, DolarOfficialRate };
