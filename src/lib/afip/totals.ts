const ALLOWED_RATES = [0, 2.5, 5, 10.5, 21, 27] as const;

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

type RateEntry = {
  base: number;
  rate: number;
};

function round2(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function mapRateToId(rate: number) {
  if (rate === 27) return 6;
  if (rate === 21) return 5;
  if (rate === 10.5) return 4;
  if (rate === 5) return 8;
  if (rate === 2.5) return 9;
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
  items: RateEntry[]
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

function allocateAdjustment(total: number, weights: number[]) {
  const roundedTotal = round2(total);
  const weightTotal = weights.reduce((acc, weight) => acc + weight, 0);
  if (roundedTotal === 0 || weightTotal <= 0) {
    return weights.map(() => 0);
  }

  let remaining = roundedTotal;
  return weights.map((weight, index) => {
    if (index === weights.length - 1) return round2(remaining);
    const amount = round2(roundedTotal * (weight / weightTotal));
    remaining = round2(remaining - amount);
    return amount;
  });
}

export function buildAdjustedTotalsFromRates(
  items: RateEntry[],
  finalAdjustment = 0
) {
  const adjustment = round2(finalAdjustment);
  if (adjustment === 0) {
    return buildTotalsFromRates(items);
  }

  const buckets = new Map<number, number>();
  for (const item of items) {
    const rate = normalizeRate(item.rate);
    if (rate === null) {
      throw new Error("INVALID_TAX_RATE");
    }
    const base = round2(item.base);
    if (base < 0) {
      throw new Error("NEGATIVE_TOTALS");
    }
    const prev = buckets.get(rate) ?? 0;
    buckets.set(rate, round2(prev + base));
  }

  const entries = Array.from(buckets.entries()).map(([rate, base]) => {
    const iva = rate === 0 ? 0 : round2((base * rate) / 100);
    return {
      rate,
      base,
      gross: round2(base + iva),
    };
  });
  const grossBeforeAdjustment = round2(
    entries.reduce((acc, entry) => acc + entry.gross, 0)
  );
  const targetTotal = round2(grossBeforeAdjustment + adjustment);
  if (grossBeforeAdjustment <= 0 || targetTotal < 0) {
    throw new Error("NEGATIVE_TOTALS");
  }

  const allocations = allocateAdjustment(
    adjustment,
    entries.map((entry) => entry.gross)
  );

  let net = 0;
  let exempt = 0;
  let iva = 0;
  const ivaItems: IvaItem[] = [];
  let lastTaxableIndex = -1;
  let lastExemptIndex = -1;

  entries.forEach((entry, index) => {
    const adjustedGross = round2(entry.gross + allocations[index]);
    if (adjustedGross < 0) {
      throw new Error("NEGATIVE_TOTALS");
    }

    if (entry.rate === 0) {
      exempt = round2(exempt + adjustedGross);
      ivaItems.push({
        Id: mapRateToId(entry.rate),
        BaseImp: adjustedGross,
        Importe: 0,
      });
      lastExemptIndex = ivaItems.length - 1;
      return;
    }

    const adjustedBase = round2(adjustedGross / (1 + entry.rate / 100));
    const adjustedIva = round2((adjustedBase * entry.rate) / 100);
    net = round2(net + adjustedBase);
    iva = round2(iva + adjustedIva);
    ivaItems.push({
      Id: mapRateToId(entry.rate),
      BaseImp: adjustedBase,
      Importe: adjustedIva,
    });
    lastTaxableIndex = ivaItems.length - 1;
  });

  let total = round2(net + iva + exempt);
  const diff = round2(targetTotal - total);
  if (diff !== 0) {
    if (lastTaxableIndex >= 0) {
      const item = ivaItems[lastTaxableIndex];
      item.Importe = round2(item.Importe + diff);
      iva = round2(iva + diff);
    } else if (lastExemptIndex >= 0) {
      const item = ivaItems[lastExemptIndex];
      item.BaseImp = round2(item.BaseImp + diff);
      exempt = round2(exempt + diff);
    }
    total = round2(net + iva + exempt);
  }

  ensurePositiveTotals([
    net,
    iva,
    total,
    exempt,
    ...ivaItems.flatMap((item) => [item.BaseImp, item.Importe]),
  ]);

  return { net, iva, total, exempt, ivaItems };
}

export function toManualTotals(totals: {
  net: number;
  iva: number;
  total: number;
  exempt: number;
  ivaItems: IvaItem[];
}): ManualTotals {
  return {
    net: totals.net,
    iva: totals.iva,
    total: totals.total,
    exempt: totals.exempt,
    ivaBreakdown: totals.ivaItems.length
      ? totals.ivaItems.map((item) => ({
          id: item.Id,
          base: item.BaseImp,
          amount: item.Importe,
        }))
      : undefined,
  };
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
