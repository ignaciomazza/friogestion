import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateStorefrontPricePreview,
  evaluateStorefrontAvailability,
} from "../src/lib/storefront/service";

test("storefront pricing AUTO sums global, payment and publication adjustments", () => {
  const result = calculateStorefrontPricePreview({
    basePrice: 100000,
    pricingMode: "AUTO",
    globalAdjustmentPercent: 5,
    paymentAdjustmentPercent: 10,
    publicationAdjustmentPercent: 3,
  });

  assert.equal(result.adjustmentPercentTotal, 18);
  assert.equal(result.priceFinal, 118000);
});

test("storefront pricing AUTO supports negative publication discount", () => {
  const result = calculateStorefrontPricePreview({
    basePrice: 100000,
    pricingMode: "AUTO",
    globalAdjustmentPercent: 5,
    paymentAdjustmentPercent: 10,
    publicationAdjustmentPercent: -8,
  });

  assert.equal(result.adjustmentPercentTotal, 7);
  assert.equal(result.priceFinal, 107000);
});

test("storefront pricing FIXED overrides automatic formula", () => {
  const result = calculateStorefrontPricePreview({
    basePrice: 100000,
    pricingMode: "FIXED",
    fixedFinalPrice: 132500,
    globalAdjustmentPercent: 5,
    paymentAdjustmentPercent: 10,
    publicationAdjustmentPercent: 20,
  });

  assert.equal(result.adjustmentPercentTotal, 0);
  assert.equal(result.priceFinal, 132500);
});

test("STRICT blocks checkout when requested qty exceeds available cupo", () => {
  const result = evaluateStorefrontAvailability({
    publicationStatus: "PUBLISHED",
    stockMode: "STRICT",
    webStockAvailable: 5,
    webStockReserved: 2,
    requestedQuantity: 4,
    priceFinal: 25000,
  });

  assert.equal(result.canBuy, false);
  assert.equal(result.available, true);
  assert.equal(result.acceptedQuantity, 3);
  assert.match(result.warnings[0] ?? "", /supera el cupo/i);
});

test("CONSULT always blocks direct checkout", () => {
  const result = evaluateStorefrontAvailability({
    publicationStatus: "PUBLISHED",
    stockMode: "CONSULT",
    webStockAvailable: 20,
    requestedQuantity: 1,
    priceFinal: 15000,
  });

  assert.equal(result.canBuy, false);
  assert.equal(result.available, false);
  assert.equal(result.acceptedQuantity, 0);
  assert.match(result.warnings[0] ?? "", /consulta previa/i);
});

test("BACKORDER allows checkout even with no immediate stock", () => {
  const result = evaluateStorefrontAvailability({
    publicationStatus: "PUBLISHED",
    stockMode: "BACKORDER",
    webStockAvailable: 0,
    requestedQuantity: 2,
    priceFinal: 9900,
  });

  assert.equal(result.canBuy, true);
  assert.equal(result.available, true);
  assert.equal(result.acceptedQuantity, 2);
  assert.match(result.warnings[0] ?? "", /encargo|diferida/i);
});

test("OUT_OF_STOCK remains visible but cannot be purchased", () => {
  const result = evaluateStorefrontAvailability({
    publicationStatus: "PUBLISHED",
    stockMode: "OUT_OF_STOCK",
    webStockAvailable: 10,
    requestedQuantity: 1,
    priceFinal: 18000,
  });

  assert.equal(result.canBuy, false);
  assert.equal(result.available, false);
  assert.equal(result.acceptedQuantity, 0);
  assert.match(result.warnings[0] ?? "", /sin compra disponible/i);
});
