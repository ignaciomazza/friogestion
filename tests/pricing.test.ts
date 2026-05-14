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
      { priceListId: "general", price: "130.00", percentage: "30.00" },
      { priceListId: "special", price: "150.00", percentage: "15.3846" },
    ],
    productCost: null,
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

test("resolveSuggestedProductPrice keeps ARS list price when both costs exist", () => {
  const result = resolveSuggestedProductPrice({
    prices: [
      { priceListId: "general", price: "130.00", percentage: "30.00" },
      { priceListId: "special", price: "150.00", percentage: "15.3846" },
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

  assert.equal(result, "150.00");
});

test("resolveSuggestedProductPrice uses stored percentages with USD-only cost", () => {
  const result = resolveSuggestedProductPrice({
    prices: [
      { priceListId: "general", price: "130.00", percentage: "30.00" },
      { priceListId: "special", price: "150.00", percentage: "15.3846" },
    ],
    productCost: null,
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

test("resolveSuggestedProductPrice uses percentage-only items with USD-only cost", () => {
  const result = resolveSuggestedProductPrice({
    prices: [
      { priceListId: "general", price: null, percentage: "30.00" },
      { priceListId: "special", price: null, percentage: "15.3846" },
    ],
    productCost: null,
    productCostUsd: "10.00",
    productPrice: null,
    preferredPriceListId: "special",
    customerPriceListId: "general",
    defaultPriceListId: "general",
    usdRateArs: 12,
    priceListOrderIds: ["general", "special"],
  });

  assert.equal(result, "180.00");
});

test("resolveSuggestedProductPrice uses percentage-only items with ARS cost", () => {
  const result = resolveSuggestedProductPrice({
    prices: [
      { priceListId: "general", price: null, percentage: "30.00" },
      { priceListId: "special", price: null, percentage: "15.3846" },
    ],
    productCost: "120.00",
    productCostUsd: null,
    productPrice: null,
    preferredPriceListId: "special",
    customerPriceListId: "general",
    defaultPriceListId: "general",
    priceListOrderIds: ["general", "special"],
  });

  assert.equal(result, "180.00");
});

test("resolveSuggestedProductPrice applies non-default percentages over default list", () => {
  const result = resolveSuggestedProductPrice({
    prices: [
      { priceListId: "base", price: "13988.99", percentage: "17.00" },
      { priceListId: "cash", price: "14688.44", percentage: "5.00" },
      { priceListId: "debit", price: "15248.00", percentage: "9.00" },
      { priceListId: "consumer", price: "16786.79", percentage: "20.00" },
    ],
    productCost: null,
    productCostUsd: "8.42",
    productPrice: "13988.99",
    preferredPriceListId: "debit",
    customerPriceListId: "base",
    defaultPriceListId: "base",
    usdRateArs: 1420,
    priceListOrderIds: ["base", "cash", "debit", "consumer"],
  });

  assert.equal(result, "15248.00");
});
