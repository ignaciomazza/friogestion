type AgingBuckets = {
  bucket0: number;
  bucket30: number;
  bucket60: number;
  bucket90: number;
};

export function reconcileAgingWithBalance(
  aging: AgingBuckets,
  balance: number
): AgingBuckets {
  const agingTotal = aging.bucket0 + aging.bucket30 + aging.bucket60 + aging.bucket90;
  const delta = balance - agingTotal;
  if (Math.abs(delta) <= 0.005) {
    return aging;
  }

  return {
    ...aging,
    bucket0: aging.bucket0 + delta,
  };
}
