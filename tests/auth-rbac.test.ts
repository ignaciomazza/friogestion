import test from "node:test";
import assert from "node:assert/strict";
import {
  canAccessCashReconciliation,
  canCancelSupplierPayments,
  canManageAdjustments,
  canWrite,
} from "../src/lib/auth/rbac";

test("canWrite allows operational roles and blocks VIEWER", () => {
  assert.equal(canWrite("OWNER"), true);
  assert.equal(canWrite("ADMIN"), true);
  assert.equal(canWrite("SALES"), true);
  assert.equal(canWrite("CASHIER"), true);
  assert.equal(canWrite("VIEWER"), false);
  assert.equal(canWrite(null), false);
});

test("admin-only permissions stay restricted", () => {
  assert.equal(canManageAdjustments("OWNER"), true);
  assert.equal(canManageAdjustments("ADMIN"), true);
  assert.equal(canManageAdjustments("SALES"), false);
  assert.equal(canCancelSupplierPayments("CASHIER"), false);
  assert.equal(canAccessCashReconciliation("VIEWER"), false);
});
