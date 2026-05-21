import test from "node:test";
import assert from "node:assert/strict";
import {
  assertPurchaseVoucherVatRules,
  buildPurchaseFiscalTotals,
  isPurchaseFiscalComputable,
} from "../src/lib/purchases/fiscal";

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

test("normaliza compras sin comprobante como registro interno no computable", () => {
  const result = buildPurchaseFiscalTotals({
    totalAmount: 1240,
    purchaseVatAmount: 210,
    fiscalDetail: {
      netTaxed: 1000,
      vatTotal: 210,
      lines: [{ type: "IIBB_PERCEPTION", amount: 30 }],
    },
    fiscalComputable: false,
  });

  assert.equal(result.netTaxed, 1030);
  assert.equal(result.netNonTaxed, 0);
  assert.equal(result.exemptAmount, 0);
  assert.equal(result.vatTotal, 210);
  assert.equal(result.otherTaxesTotal, 0);
  assert.equal(result.taxes, 210);
  assert.equal(result.subtotal, 1030);
  assert.deepEqual(result.lines, []);
});

test("rechaza IVA interno mayor al total", () => {
  assert.throws(
    () =>
      buildPurchaseFiscalTotals({
        totalAmount: 100,
        purchaseVatAmount: 150,
        fiscalComputable: false,
      }),
    /PURCHASE_FISCAL_VAT_EXCEEDS_TOTAL/,
  );
});

test("detecta compras fiscales vs registros internos", () => {
  assert.equal(
    isPurchaseFiscalComputable({
      invoiceNumber: null,
      fiscalVoucherKind: null,
      fiscalVoucherType: null,
      fiscalPointOfSale: null,
      fiscalVoucherNumber: null,
    }),
    false,
  );
  assert.equal(
    isPurchaseFiscalComputable({
      invoiceNumber: "0001-00001234",
      fiscalVoucherKind: null,
      fiscalVoucherType: null,
      fiscalPointOfSale: null,
      fiscalVoucherNumber: null,
    }),
    true,
  );
});

test("factura C no permite IVA credito", () => {
  assert.throws(
    () =>
      assertPurchaseVoucherVatRules({
        voucherKind: "C",
        vatTotal: 21,
      }),
    /PURCHASE_FISCAL_VAT_NOT_ALLOWED_FOR_VOUCHER_C/,
  );
});

test("factura A permite IVA credito", () => {
  assert.doesNotThrow(() =>
    assertPurchaseVoucherVatRules({
      voucherKind: "A",
      vatTotal: 21,
    }),
  );
});
