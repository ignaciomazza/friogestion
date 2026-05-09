import test from "node:test";
import assert from "node:assert/strict";
import {
  buildAdjustedTotalsFromRates,
  buildTotalsFromRates,
} from "../src/lib/afip/totals";

const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

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

test("buildAdjustedTotalsFromRates prorates a fixed surcharge across rates", () => {
  const result = buildAdjustedTotalsFromRates(
    [
      { base: 1000, rate: 21 },
      { base: 500, rate: 10.5 },
    ],
    173.45
  );

  assert.equal(result.total, 1935.95);
  assert.equal(result.ivaItems.length, 2);
  assert.equal(round2(result.net + result.iva + result.exempt), result.total);
  assert.ok(result.net > 1500);
  assert.ok(result.iva > 262.5);
});

test("buildAdjustedTotalsFromRates keeps discounts from creating negative bases", () => {
  const result = buildAdjustedTotalsFromRates([{ base: 1000, rate: 21 }], -121);

  assert.equal(result.total, 1089);
  assert.equal(result.net, 900);
  assert.equal(result.iva, 189);
  assert.throws(
    () => buildAdjustedTotalsFromRates([{ base: 1000, rate: 21 }], -1300),
    /NEGATIVE_TOTALS/
  );
});

test("buildAdjustedTotalsFromRates treats installment interest as gross adjustment", () => {
  const result = buildAdjustedTotalsFromRates([{ base: 1000, rate: 21 }], 121);

  assert.equal(result.total, 1331);
  assert.equal(result.net, 1100);
  assert.equal(result.iva, 231);
});

test("buildAdjustedTotalsFromRates keeps IVA calculated from its taxable base", () => {
  const result = buildAdjustedTotalsFromRates([{ base: 1000, rate: 21 }], 0.03);
  const [ivaItem] = result.ivaItems;

  assert.equal(ivaItem.Importe, round2(ivaItem.BaseImp * 0.21));
  assert.equal(result.iva, ivaItem.Importe);
  assert.equal(round2(result.net + result.iva + result.exempt), result.total);
  assert.ok(Math.abs(Math.round(result.total * 100) - 121003) <= 1);
});
