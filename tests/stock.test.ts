import test from "node:test";
import assert from "node:assert/strict";
import {
  buildPurchaseInMovements,
  buildSaleOutMovements,
  buildSaleReactivationMovements,
  buildSaleReversalMovements,
} from "../src/lib/stock";

const baseDate = new Date("2026-02-17T10:00:00.000Z");
const items = [{ id: "item-1", productId: "prod-1", qty: 2.5 }];

test("purchase stock movements are IN and linked to purchase item", () => {
  const rows = buildPurchaseInMovements({
    organizationId: "org-1",
    occurredAt: baseDate,
    note: "ingreso",
    items,
  });
  assert.equal(rows[0].type, "IN");
  assert.equal(rows[0].qty, "2.500");
  assert.equal(rows[0].purchaseItemId, "item-1");
});

test("sale stock movements support regular, reversal and reactivation flows", () => {
  const out = buildSaleOutMovements({
    organizationId: "org-1",
    occurredAt: baseDate,
    note: "salida",
    items,
  });
  const reversal = buildSaleReversalMovements({
    organizationId: "org-1",
    occurredAt: baseDate,
    note: "reversa",
    items,
  });
  const reactivation = buildSaleReactivationMovements({
    organizationId: "org-1",
    occurredAt: baseDate,
    note: "reactivacion",
    items,
  });

  assert.equal(out[0].type, "OUT");
  assert.equal(out[0].saleItemId, "item-1");
  assert.equal(reversal[0].type, "IN");
  assert.equal("saleItemId" in reversal[0], false);
  assert.equal(reactivation[0].type, "OUT");
  assert.equal("saleItemId" in reactivation[0], false);
});
