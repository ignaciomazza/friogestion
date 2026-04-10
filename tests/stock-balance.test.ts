import test from "node:test";
import assert from "node:assert/strict";
import {
  aggregateStockByProduct,
  movementSignedQty,
} from "../src/lib/stock-balance";

test("movementSignedQty applies direction by movement type", () => {
  assert.equal(movementSignedQty("IN", "2.5"), 2.5);
  assert.equal(movementSignedQty("OUT", "2.5"), -2.5);
  assert.equal(movementSignedQty("ADJUST", "-1.25"), -1.25);
  assert.equal(movementSignedQty("UNKNOWN", "8"), 0);
});

test("aggregateStockByProduct sums signed movements", () => {
  const result = aggregateStockByProduct([
    { productId: "a", type: "IN", qty: "5.000" },
    { productId: "a", type: "OUT", qty: "2.000" },
    { productId: "a", type: "ADJUST", qty: "-1.000" },
    { productId: "b", type: "IN", qty: "3.500" },
  ]);

  assert.equal(result.get("a"), 2);
  assert.equal(result.get("b"), 3.5);
});

