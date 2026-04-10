import test from "node:test";
import assert from "node:assert/strict";
import {
  parseIncludeUnverified,
  verificationWhereClause,
} from "../src/lib/cash-reconciliation/report";

test("parseIncludeUnverified understands common truthy values", () => {
  assert.equal(parseIncludeUnverified("true"), true);
  assert.equal(parseIncludeUnverified("1"), true);
  assert.equal(parseIncludeUnverified("yes"), true);
  assert.equal(parseIncludeUnverified("false"), false);
  assert.equal(parseIncludeUnverified(null), false);
});

test("verificationWhereClause excludes pending verifications by default", () => {
  assert.deepEqual(verificationWhereClause(false), {
    OR: [{ receiptLineId: null }, { verifiedAt: { not: null } }],
  });
  assert.deepEqual(verificationWhereClause(true), {});
});
