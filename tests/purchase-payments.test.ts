import test from "node:test";
import assert from "node:assert/strict";
import {
  getPurchaseOpenBalance,
  getSignedPurchaseAllocationAmount,
  isPurchaseCreditNote,
} from "../src/lib/purchases";

test("las notas de credito descuentan del neto imputado al pagar proveedor", () => {
  const netAllocated = [
    { documentType: "INVOICE", amount: 1000 },
    { documentType: "CREDIT_NOTE", amount: 228.5 },
    { documentType: "DEBIT_NOTE", amount: 50 },
  ].reduce(
    (sum, allocation) =>
      sum +
      getSignedPurchaseAllocationAmount(
        allocation.documentType,
        allocation.amount,
      ),
    0,
  );

  assert.equal(netAllocated, 821.5);
});

test("la nota de credito queda abierta hasta imputarse completa", () => {
  assert.equal(isPurchaseCreditNote("CREDIT_NOTE"), true);
  assert.equal(
    getPurchaseOpenBalance({
      total: 228.5,
      paidTotal: 0,
      balance: 0,
    }),
    228.5,
  );
  assert.equal(
    getPurchaseOpenBalance({
      total: 228.5,
      paidTotal: 228.5,
      balance: 0,
    }),
    0,
  );
});
