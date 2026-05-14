import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateAutoTotalsFromProducts,
  calculateFiscalLineAmount,
  compareArcaVoucherAgainstForm,
  normalizeJurisdiction,
  summarizeArcaMismatches,
} from "../src/lib/purchases/new-purchase";

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

test("compareArcaVoucherAgainstForm detecta mismatch por tipo y total", () => {
  const mismatches = compareArcaVoucherAgainstForm({
    form: {
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
