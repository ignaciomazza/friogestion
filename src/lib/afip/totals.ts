const ALLOWED_RATES = [0, 10.5, 21] as const;

export type IvaItem = {
  Id: number;
  BaseImp: number;
  Importe: number;
};

export type ManualTotals = {
  net: number;
  iva: number;
  total: number;
  exempt?: number;
  ivaBreakdown?: Array<{
    id: number;
    base: number;
    amount: number;
  }>;
};

function round2(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function mapRateToId(rate: number) {
  if (rate === 21) return 5;
  if (rate === 10.5) return 4;
  return 3;
}

function normalizeRate(rate: number) {
  const normalized = Number(rate);
  if (!Number.isFinite(normalized)) return null;
  if (!ALLOWED_RATES.includes(normalized as (typeof ALLOWED_RATES)[number])) {
    return null;
  }
  return normalized;
}

export function buildTotalsFromRates(
  items: Array<{ base: number; rate: number }>
) {
  const buckets = new Map<number, number>();
  for (const item of items) {
    const rate = normalizeRate(item.rate);
    if (rate === null) {
      throw new Error("INVALID_TAX_RATE");
    }
    const base = round2(item.base);
    const prev = buckets.get(rate) ?? 0;
    buckets.set(rate, round2(prev + base));
  }

  let net = 0;
  let exempt = 0;
  let iva = 0;
  const ivaItems: IvaItem[] = [];

  for (const [rate, base] of buckets.entries()) {
    if (rate === 0) {
      exempt = round2(exempt + base);
      ivaItems.push({ Id: mapRateToId(rate), BaseImp: base, Importe: 0 });
      continue;
    }

    const amount = round2((base * rate) / 100);
    net = round2(net + base);
    iva = round2(iva + amount);
    ivaItems.push({ Id: mapRateToId(rate), BaseImp: base, Importe: amount });
  }

  const total = round2(net + iva + exempt);

  return { net, iva, total, exempt, ivaItems };
}

export function buildTotalsFromManual(manual: ManualTotals) {
  const net = round2(manual.net);
  const iva = round2(manual.iva);
  const exempt = round2(manual.exempt ?? 0);
  const total = round2(manual.total);
  const expectedTotal = round2(net + iva + exempt);

  if (expectedTotal !== total) {
    throw new Error("MANUAL_TOTALS_MISMATCH");
  }

  const ivaItems: IvaItem[] = [];
  if (manual.ivaBreakdown?.length) {
    let breakdownTotal = 0;
    for (const item of manual.ivaBreakdown) {
      const base = round2(item.base);
      const amount = round2(item.amount);
      if (base < 0 || amount < 0) {
        throw new Error("NEGATIVE_TOTALS");
      }
      breakdownTotal = round2(breakdownTotal + amount);
      ivaItems.push({
        Id: item.id,
        BaseImp: base,
        Importe: amount,
      });
    }
    if (round2(breakdownTotal) !== iva) {
      throw new Error("MANUAL_IVA_BREAKDOWN_MISMATCH");
    }
  } else if (iva > 0) {
    throw new Error("MANUAL_IVA_BREAKDOWN_REQUIRED");
  }

  return { net, iva, total, exempt, ivaItems };
}

export function ensurePositiveTotals(values: number[]) {
  if (values.some((value) => value < 0)) {
    throw new Error("NEGATIVE_TOTALS");
  }
}
