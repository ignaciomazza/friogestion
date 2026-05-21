import test from "node:test";
import assert from "node:assert/strict";
import { assertManualBillingStatusAllowed } from "../src/lib/sales/fiscal";

test("permite estados operativos no facturados", () => {
  assert.doesNotThrow(() => assertManualBillingStatusAllowed("NOT_BILLED"));
  assert.doesNotThrow(() => assertManualBillingStatusAllowed("TO_BILL"));
});

test("bloquea marcado manual como facturado", () => {
  assert.throws(
    () => assertManualBillingStatusAllowed("BILLED"),
    /SALE_BILLING_STATUS_MANUAL_BILLED_NOT_ALLOWED/,
  );
});
