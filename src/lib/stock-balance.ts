type MovementType = "IN" | "OUT" | "ADJUST" | string;

type MovementLike = {
  productId: string;
  type: MovementType;
  qty: unknown;
};

const toNumber = (value: unknown) => {
  if (value === null || value === undefined) return 0;
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  if (typeof value === "object" && "toString" in value) {
    const parsed = Number(value.toString());
    return Number.isFinite(parsed) ? parsed : 0;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const movementSignedQty = (
  type: MovementType,
  qty: unknown,
) => {
  const parsed = toNumber(qty);
  if (type === "IN") return Math.abs(parsed);
  if (type === "OUT") return -Math.abs(parsed);
  if (type === "ADJUST") return parsed;
  return 0;
};

export const aggregateStockByProduct = (movements: MovementLike[]) => {
  const stockByProduct = new Map<string, number>();

  for (const movement of movements) {
    const current = stockByProduct.get(movement.productId) ?? 0;
    stockByProduct.set(
      movement.productId,
      current + movementSignedQty(movement.type, movement.qty),
    );
  }

  return stockByProduct;
};
