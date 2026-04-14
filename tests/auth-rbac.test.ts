import test from "node:test";
import assert from "node:assert/strict";
import {
  canAccessCashReconciliation,
  canAccessDashboard,
  canCancelSupplierPayments,
  canManageAdjustments,
  canWrite,
} from "../src/lib/auth/rbac";

test("canWrite allows operational roles and blocks deprecated roles", () => {
  assert.equal(canWrite("OWNER"), true);
  assert.equal(canWrite("ADMIN"), true);
  assert.equal(canWrite("SALES"), true);
  assert.equal(canWrite("CASHIER"), false);
  assert.equal(canWrite("DEVELOPER"), false);
  assert.equal(canWrite("VIEWER"), false);
  assert.equal(canWrite(null), false);
});

test("admin-only permissions stay restricted", () => {
  assert.equal(canManageAdjustments("OWNER"), true);
  assert.equal(canManageAdjustments("ADMIN"), true);
  assert.equal(canManageAdjustments("SALES"), false);
  assert.equal(canCancelSupplierPayments("CASHIER"), false);
  assert.equal(canAccessCashReconciliation("VIEWER"), false);
  assert.equal(canAccessDashboard("OWNER"), true);
  assert.equal(canAccessDashboard("ADMIN"), true);
  assert.equal(canAccessDashboard("SALES"), false);
  assert.equal(canAccessDashboard("DEVELOPER"), false);
});
