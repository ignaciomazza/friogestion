type MovementItem = {
  id: string;
  productId: string;
  qty: number | string;
};

const toQty = (value: number | string) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed.toFixed(3) : "0.000";
};

type BaseInput = {
  organizationId: string;
  occurredAt: Date;
  note: string;
  items: MovementItem[];
};

export function buildPurchaseInMovements({
  organizationId,
  occurredAt,
  note,
  items,
}: BaseInput) {
  return items.map((item) => ({
    organizationId,
    productId: item.productId,
    type: "IN" as const,
    qty: toQty(item.qty),
    occurredAt,
    note,
    purchaseItemId: item.id,
  }));
}

export function buildSaleOutMovements({
  organizationId,
  occurredAt,
  note,
  items,
}: BaseInput) {
  return items.map((item) => ({
    organizationId,
    productId: item.productId,
    type: "OUT" as const,
    qty: toQty(item.qty),
    occurredAt,
    note,
    saleItemId: item.id,
  }));
}

export function buildSaleReversalMovements({
  organizationId,
  occurredAt,
  note,
  items,
}: BaseInput) {
  return items.map((item) => ({
    organizationId,
    productId: item.productId,
    type: "IN" as const,
    qty: toQty(item.qty),
    occurredAt,
    note,
  }));
}

export function buildSaleReactivationMovements({
  organizationId,
  occurredAt,
  note,
  items,
}: BaseInput) {
  return items.map((item) => ({
    organizationId,
    productId: item.productId,
    type: "OUT" as const,
    qty: toQty(item.qty),
    occurredAt,
    note,
  }));
}
