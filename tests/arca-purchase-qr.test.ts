import test from "node:test";
import assert from "node:assert/strict";
import { parseArcaPurchaseQr } from "../src/lib/arca/purchase-qr";

const encodeQrPayload = (payload: Record<string, unknown>) =>
  Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");

test("parsea QR ARCA valido desde URL", () => {
  const payload = {
    ver: 1,
    fecha: "2026-05-01",
    cuit: 30712345678,
    ptoVta: 5,
    tipoCmp: 1,
    nroCmp: 1234,
    importe: 1240,
    moneda: "ARS",
    tipoDocRec: 80,
    nroDocRec: 20111222333,
    tipoCodAut: "E",
    codAut: 76123456789012,
  };
  const parsed = parseArcaPurchaseQr(
    `https://www.afip.gob.ar/fe/qr/?p=${encodeQrPayload(payload)}`,
  );

  assert.equal(parsed.issuerTaxId, "30712345678");
  assert.equal(parsed.voucherKind, "A");
  assert.equal(parsed.invoiceNumber, "0005-00001234");
  assert.equal(parsed.authorizationMode, "CAE");
  assert.equal(parsed.authorizationCode, "76123456789012");
  assert.equal(parsed.totalAmount, 1240);
});

test("rechaza QR ARCA invalido", () => {
  assert.throws(() => parseArcaPurchaseQr("no-es-un-qr"), /ARCA_QR_INVALID/);
});
