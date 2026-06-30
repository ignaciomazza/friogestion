import test from "node:test";
import assert from "node:assert/strict";
import { toWscdcValidationInput } from "../src/lib/arca/purchase-validation";

test("toWscdcValidationInput preserves voucherDate calendar day", () => {
  const input = toWscdcValidationInput({
    mode: "CAE",
    issuerTaxId: "30712345678",
    pointOfSale: 10,
    voucherType: 1,
    voucherNumber: 37243,
    voucherDate: "2026-05-15",
    totalAmount: 18650.2,
    authorizationCode: "86205205502746",
    receiverDocType: "80",
    receiverDocNumber: "20238382360",
  });

  assert.equal(input.voucherDate.getFullYear(), 2026);
  assert.equal(input.voucherDate.getMonth(), 4);
  assert.equal(input.voucherDate.getDate(), 15);
});

test("toWscdcValidationInput preserves CAI authorization mode", () => {
  const input = toWscdcValidationInput({
    mode: "CAI",
    issuerTaxId: "30516712593",
    pointOfSale: 2,
    voucherType: 3,
    voucherNumber: 757494,
    voucherDate: "2026-06-12",
    totalAmount: 228709.58,
    authorizationCode: "51523216374912",
  });

  assert.equal(input.mode, "CAI");
  assert.equal(input.authorizationCode, "51523216374912");
});

test("toWscdcValidationInput rejects impossible voucherDate", () => {
  assert.throws(
    () =>
      toWscdcValidationInput({
        mode: "CAE",
        issuerTaxId: "30712345678",
        pointOfSale: 10,
        voucherType: 1,
        voucherNumber: 37243,
        voucherDate: "2026-02-31",
        totalAmount: 18650.2,
        authorizationCode: "86205205502746",
      }),
    /PURCHASE_VALIDATION_DATE_INVALID/,
  );
});
