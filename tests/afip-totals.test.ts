import test from "node:test";
import assert from "node:assert/strict";
import { buildTotalsFromRates } from "../src/lib/afip/totals";

test("buildTotalsFromRates supports AFIP IVA rates", () => {
  const result = buildTotalsFromRates([
    { base: 100, rate: 27 },
    { base: 100, rate: 21 },
    { base: 100, rate: 10.5 },
    { base: 100, rate: 5 },
    { base: 100, rate: 2.5 },
    { base: 100, rate: 0 },
  ]);

  assert.equal(result.net, 500);
  assert.equal(result.iva, 66);
  assert.equal(result.exempt, 100);
  assert.equal(result.total, 666);

  const ids = result.ivaItems.map((item) => item.Id).sort((a, b) => a - b);
  assert.deepEqual(ids, [3, 4, 5, 6, 8, 9]);
});

test("buildTotalsFromRates rejects unsupported IVA rates", () => {
  assert.throws(
    () => buildTotalsFromRates([{ base: 100, rate: 7 }]),
    /INVALID_TAX_RATE/
  );
});
