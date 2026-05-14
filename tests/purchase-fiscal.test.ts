import test from "node:test";
import assert from "node:assert/strict";
import { buildPurchaseFiscalTotals } from "../src/lib/purchases/fiscal";

test("calcula compra fiscal simple con IVA solamente", () => {
  const result = buildPurchaseFiscalTotals({
    totalAmount: 1210,
    purchaseVatAmount: 210,
  });

  assert.equal(result.netTaxed, 1000);
  assert.equal(result.vatTotal, 210);
  assert.equal(result.otherTaxesTotal, 0);
  assert.equal(result.subtotal, 1000);
  assert.equal(result.total, 1210);
});

test("calcula compra con IVA y percepcion IIBB", () => {
  const result = buildPurchaseFiscalTotals({
    totalAmount: 1240,
    purchaseVatAmount: 210,
    fiscalDetail: {
      netTaxed: 1000,
      vatTotal: 210,
      lines: [
        {
          type: "IIBB_PERCEPTION",
          jurisdiction: "Buenos Aires",
          baseAmount: 1000,
          rate: 3,
          amount: 30,
        },
      ],
    },
  });

  assert.equal(result.netTaxed, 1000);
  assert.equal(result.vatTotal, 210);
  assert.equal(result.otherTaxesTotal, 30);
  assert.equal(result.lines[0].type, "IIBB_PERCEPTION");
  assert.equal(result.lines[0].jurisdiction, "Buenos Aires");
});

test("rechaza detalle fiscal inconsistente con el total", () => {
  assert.throws(
    () =>
      buildPurchaseFiscalTotals({
        totalAmount: 1240,
        purchaseVatAmount: 210,
        fiscalDetail: {
          netTaxed: 1000,
          vatTotal: 210,
          lines: [
            {
              type: "IIBB_PERCEPTION",
              amount: 20,
            },
          ],
        },
      }),
    /PURCHASE_FISCAL_TOTAL_MISMATCH/,
  );
});
