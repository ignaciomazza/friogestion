import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateAutoTotalsFromProducts,
  calculateFiscalLineAmount,
  compareArcaVoucherAgainstForm,
  normalizeJurisdiction,
  summarizeArcaMismatches,
} from "../src/lib/purchases/new-purchase";
import { applyPurchaseItemDiscount } from "../src/lib/purchases/discounts";

test("calculateAutoTotalsFromProducts incluye percepciones en total", () => {
  const totals = calculateAutoTotalsFromProducts({
    subtotal: 1000,
    vat: 210,
    fiscalOtherTotal: 30,
  });

  assert.deepEqual(totals, {
    netTaxed: 1000,
    vat: 210,
    total: 1240,
  });
});

test("calculateFiscalLineAmount devuelve importe automatico", () => {
  assert.equal(calculateFiscalLineAmount(1000, 3), 30);
  assert.equal(calculateFiscalLineAmount(1000, null), null);
});

test("applyPurchaseItemDiscount permite IVA fijo por item", () => {
  const line = applyPurchaseItemDiscount({
    grossSubtotal: 100,
    taxRate: 21,
    taxAmountOverride: 19.8,
    discount: {
      type: "PERCENT",
      base: "SUBTOTAL",
      value: 0,
    },
  });

  assert.equal(line.subtotal, 100);
  assert.equal(line.vat, 19.8);
  assert.equal(line.total, 119.8);
});

test("applyPurchaseItemDiscount aplica descuentos encadenados", () => {
  const line = applyPurchaseItemDiscount({
    grossSubtotal: 1396943.75,
    taxRate: 21,
    discounts: [
      { type: "PERCENT", base: "SUBTOTAL", value: 8 },
      { type: "PERCENT", base: "SUBTOTAL", value: 12 },
    ],
  });

  assert.equal(line.discountAmount, 265978.09);
  assert.equal(line.subtotal, 1130965.66);
  assert.equal(line.vat, 237502.79);
  assert.equal(line.total, 1368468.45);
});

test("compareArcaVoucherAgainstForm detecta mismatch por tipo y total", () => {
  const mismatches = compareArcaVoucherAgainstForm({
    form: {
      documentType: "INVOICE",
      voucherKind: "B",
      pointOfSale: "2",
      invoiceNumber: "0002-00000124",
      invoiceDate: "2026-05-10",
      totalAmount: 1250,
      authorizationCode: "12345678901234",
    },
    arca: {
      voucherType: 1,
      pointOfSale: 2,
      voucherNumber: 124,
      voucherDate: "2026-05-10",
      totalAmount: 1240,
      authorizationCode: "12345678901234",
    },
  });

  assert.equal(mismatches.length, 2);
  assert.equal(mismatches[0].field, "invoice.voucherKind");
  assert.equal(mismatches[1].field, "totals.totalAmount");
  assert.match(
    summarizeArcaMismatches(mismatches),
    /tipo de comprobante/,
  );
});

test("normalizeJurisdiction estandariza alias y formato libre", () => {
  assert.equal(normalizeJurisdiction("ciudad autonoma de buenos aires"), "CABA");
  assert.equal(normalizeJurisdiction("  buenos   aires "), "Buenos Aires");
  assert.equal(normalizeJurisdiction(""), "");
});
