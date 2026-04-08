import test from "node:test";
import assert from "node:assert/strict";
import { reconcileAgingWithBalance } from "../src/lib/current-accounts/aging";

test("aging remains unchanged when it already matches balance", () => {
  const row = reconcileAgingWithBalance(
    { bucket0: 100, bucket30: 50, bucket60: 25, bucket90: 25 },
    200
  );
  assert.deepEqual(row, { bucket0: 100, bucket30: 50, bucket60: 25, bucket90: 25 });
});

test("aging absorbs delta into bucket0 to stay consistent with balance", () => {
  const row = reconcileAgingWithBalance(
    { bucket0: 100, bucket30: 50, bucket60: 0, bucket90: 0 },
    120
  );
  assert.deepEqual(row, { bucket0: 70, bucket30: 50, bucket60: 0, bucket90: 0 });
});
