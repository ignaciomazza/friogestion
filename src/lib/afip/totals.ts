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

function toCents(value: number) {
  return Math.round(round2(value) * 100);
}

function fromCents(value: number) {
  return round2(value / 100);
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

function buildTaxableBucketFromGross(rate: number, targetGross: number) {
  const targetGrossCents = toCents(targetGross);
  const estimatedBaseCents = Math.max(
    0,
    Math.round(targetGrossCents / (1 + rate / 100))
  );
  let best:
    | {
        baseCents: number;
        ivaCents: number;
        grossCents: number;
        grossDiff: number;
        baseDiff: number;
      }
    | null = null;

  for (let delta = -100; delta <= 100; delta += 1) {
    const baseCents = estimatedBaseCents + delta;
    if (baseCents < 0) continue;
    const ivaCents = Math.round((baseCents * rate) / 100);
    const grossCents = baseCents + ivaCents;
    const grossDiff = Math.abs(grossCents - targetGrossCents);
    const baseDiff = Math.abs(baseCents - estimatedBaseCents);

    if (
      !best ||
      grossDiff < best.grossDiff ||
      (grossDiff === best.grossDiff && baseDiff < best.baseDiff)
    ) {
      best = { baseCents, ivaCents, grossCents, grossDiff, baseDiff };
    }
  }

  if (!best) {
    throw new Error("NEGATIVE_TOTALS");
  }

  return {
    base: fromCents(best.baseCents),
    iva: fromCents(best.ivaCents),
    gross: fromCents(best.grossCents),
  };
}

function findLastIndex<T>(items: T[], predicate: (item: T) => boolean) {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    if (predicate(items[index])) return index;
  }
  return -1;
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

  const adjustedEntries = entries.map((entry, index) => {
    const adjustedGross = round2(entry.gross + allocations[index]);
    if (adjustedGross < 0) {
      throw new Error("NEGATIVE_TOTALS");
    }

    if (entry.rate === 0) {
      return {
        rate: entry.rate,
        base: adjustedGross,
        iva: 0,
        gross: adjustedGross,
      };
    }

    return {
      rate: entry.rate,
      ...buildTaxableBucketFromGross(entry.rate, adjustedGross),
    };
  });

  let total = round2(
    adjustedEntries.reduce((acc, entry) => acc + entry.gross, 0)
  );
  let diff = round2(targetTotal - total);
  if (diff !== 0) {
    const lastTaxableIndex = findLastIndex(
      adjustedEntries,
      (entry) => entry.rate !== 0
    );
    if (lastTaxableIndex >= 0) {
      const entry = adjustedEntries[lastTaxableIndex];
      const replacement = {
        rate: entry.rate,
        ...buildTaxableBucketFromGross(entry.rate, round2(entry.gross + diff)),
      };
      const nextTotal = round2(total - entry.gross + replacement.gross);
      if (Math.abs(round2(targetTotal - nextTotal)) < Math.abs(diff)) {
        adjustedEntries[lastTaxableIndex] = replacement;
        total = nextTotal;
        diff = round2(targetTotal - total);
      }
    }

    const lastExemptIndex = findLastIndex(
      adjustedEntries,
      (entry) => entry.rate === 0
    );
    if (diff !== 0 && lastExemptIndex >= 0) {
      const entry = adjustedEntries[lastExemptIndex];
      entry.base = round2(entry.base + diff);
      entry.gross = entry.base;
      total = round2(targetTotal);
    }
  }

  let net = 0;
  let exempt = 0;
  let iva = 0;
  const ivaItems: IvaItem[] = [];

  adjustedEntries.forEach((entry) => {
    if (entry.rate === 0) {
      exempt = round2(exempt + entry.base);
    } else {
      net = round2(net + entry.base);
      iva = round2(iva + entry.iva);
    }
    ivaItems.push({
      Id: mapRateToId(entry.rate),
      BaseImp: entry.base,
      Importe: entry.iva,
    });
  });
  total = round2(net + iva + exempt);

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
