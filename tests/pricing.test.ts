import test from "node:test";
import assert from "node:assert/strict";
import { resolveSuggestedProductPrice } from "../src/lib/pricing";

test("resolveSuggestedProductPrice prioritizes customer list", () => {
  const result = resolveSuggestedProductPrice({
    prices: [
      { priceListId: "general", price: "100.00" },
      { priceListId: "ri", price: "95.00" },
    ],
    productPrice: "110.00",
    customerPriceListId: "ri",
    defaultPriceListId: "general",
  });

  assert.equal(result, "95.00");
});

test("resolveSuggestedProductPrice prioritizes explicit selected list", () => {
  const result = resolveSuggestedProductPrice({
    prices: [
      { priceListId: "general", price: "100.00" },
      { priceListId: "special", price: "90.00" },
    ],
    productPrice: "110.00",
    preferredPriceListId: "special",
    customerPriceListId: "general",
    defaultPriceListId: "general",
  });

  assert.equal(result, "90.00");
});

test("resolveSuggestedProductPrice falls back to default list then product", () => {
  const fromDefault = resolveSuggestedProductPrice({
    prices: [{ priceListId: "general", price: "100.00" }],
    productPrice: "110.00",
    customerPriceListId: "missing",
    defaultPriceListId: "general",
  });
  assert.equal(fromDefault, "100.00");

  const fromProduct = resolveSuggestedProductPrice({
    prices: [{ priceListId: "general", price: null }],
    productPrice: "110.00",
    customerPriceListId: "missing",
    defaultPriceListId: "general",
  });
  assert.equal(fromProduct, "110.00");
});

test("resolveSuggestedProductPrice recalculates from USD cost with internal FX", () => {
  const result = resolveSuggestedProductPrice({
    prices: [
      { priceListId: "general", price: "130.00" },
      { priceListId: "special", price: "150.00" },
    ],
    productCost: "100.00",
    productCostUsd: "10.00",
    productPrice: "150.00",
    preferredPriceListId: "special",
    customerPriceListId: "general",
    defaultPriceListId: "general",
    usdRateArs: 12,
    priceListOrderIds: ["general", "special"],
  });

  assert.equal(result, "180.00");
});
