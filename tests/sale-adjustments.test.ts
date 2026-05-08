import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateSaleAdjustment,
  getAdjustmentLabel,
} from "../src/lib/sale-adjustments";

test("card interest percentage is calculated over total with IVA", () => {
  const result = calculateSaleAdjustment({
    subtotal: 1000,
    taxes: 210,
    type: "CARD_INTEREST_PERCENT",
    value: 10,
  });

  assert.equal(result.base, 1210);
  assert.equal(result.amount, 121);
  assert.equal(result.label, "Interes tarjeta");
});

test("generic surcharge percentage keeps the subtotal base", () => {
  const result = calculateSaleAdjustment({
    subtotal: 1000,
    taxes: 210,
    type: "PERCENT",
    value: 10,
  });

  assert.equal(result.base, 1000);
  assert.equal(result.amount, 100);
  assert.equal(result.label, "Recargo");
});

test("fixed discount is negative and labelled as discount", () => {
  const result = calculateSaleAdjustment({
    subtotal: 1000,
    taxes: 210,
    type: "DISCOUNT_FIXED",
    value: 50,
  });

  assert.equal(result.amount, -50);
  assert.equal(getAdjustmentLabel(result.type, result.amount), "Descuento");
});
