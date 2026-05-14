import test from "node:test";
import assert from "node:assert/strict";
import {
  buildPurchasesReportCsv,
  csvEscape,
  type PurchasesMonthlyReport,
} from "../src/lib/purchases/report";

test("escapa CSV con comas, acentos, comillas y saltos de linea", () => {
  assert.equal(csvEscape('Frio, "Victoria"\nCABA'), '"Frio, ""Victoria""\nCABA"');
  assert.equal(csvEscape("Percepcion IIBB"), "Percepcion IIBB");
  assert.equal(csvEscape(12.3), "12.30");
});

test("arma reporte CSV mensual con compras y retenciones", () => {
  const report: PurchasesMonthlyReport = {
    period: {
      from: "2026-05-01T00:00:00.000Z",
      to: "2026-05-31T23:59:59.999Z",
    },
    totals: {
      purchasesCount: 1,
      netTaxed: 1000,
      netNonTaxed: 0,
      exemptAmount: 0,
      vatTotal: 210,
      otherTaxesTotal: 30,
      total: 1240,
      retentionsTotal: 15,
      fiscalLineTotals: {
        IIBB_PERCEPTION: 30,
        VAT_PERCEPTION: 0,
        INCOME_TAX_PERCEPTION: 0,
        MUNICIPAL_PERCEPTION: 0,
        INTERNAL_TAX: 0,
        OTHER: 0,
      },
      retentionTotals: { IIBB: 15 },
    },
    purchases: [
      {
        id: "purchase-1",
        date: "2026-05-02",
        supplierName: "Refrigeracion, Victoria",
        supplierTaxId: "20111222333",
        voucher: "0005-00001234",
        voucherKind: "A",
        pointOfSale: 5,
        voucherNumber: 1234,
        currencyCode: "ARS",
        netTaxed: 1000,
        netNonTaxed: 0,
        exemptAmount: 0,
        vatTotal: 210,
        otherTaxesTotal: 30,
        total: 1240,
        fiscalLineTotals: {
          IIBB_PERCEPTION: 30,
          VAT_PERCEPTION: 0,
          INCOME_TAX_PERCEPTION: 0,
          MUNICIPAL_PERCEPTION: 0,
          INTERNAL_TAX: 0,
          OTHER: 0,
        },
        arcaValidationStatus: "AUTHORIZED",
      },
    ],
    retentions: [
      {
        id: "retention-1",
        paymentId: "payment-1",
        date: "2026-05-15",
        supplierName: "Refrigeracion Victoria",
        supplierTaxId: "20111222333",
        type: "IIBB",
        baseAmount: 1000,
        rate: 1.5,
        amount: 15,
        note: "Pago mayo",
      },
    ],
  };

  const csv = buildPurchasesReportCsv(report);
  assert.match(csv, /Compras/);
  assert.match(csv, /"Refrigeracion, Victoria"/);
  assert.match(csv, /Retenciones/);
  assert.match(csv, /payment-1/);
  assert.match(csv, /15\.00/);
});
