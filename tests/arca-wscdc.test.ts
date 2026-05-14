import test from "node:test";
import assert from "node:assert/strict";
import { normalizeWscdcResponse } from "../src/lib/arca/wscdc";

test("normalizeWscdcResponse maps authorized responses", () => {
  const response = normalizeWscdcResponse({
    ComprobanteConstatarResult: {
      Resultado: "A",
      CmpResp: {
        CbteModo: "CAE",
        CuitEmisor: "30712345678",
        PtoVta: 2,
        CbteTipo: 6,
        CbteNro: 124,
        CbteFch: "20260510",
        ImpTotal: "1240.00",
        CodAutorizacion: "12345678901234",
      },
      Observaciones: { Obs: [{ Msg: "Comprobante autorizado" }] },
    },
  });

  assert.equal(response.status, "AUTHORIZED");
  assert.equal(response.message, "Comprobante autorizado");
  assert.deepEqual(response.comprobante, {
    mode: "CAE",
    issuerTaxId: "30712345678",
    pointOfSale: 2,
    voucherType: 6,
    voucherNumber: 124,
    voucherDate: "2026-05-10",
    totalAmount: 1240,
    authorizationCode: "12345678901234",
    receiverDocType: null,
    receiverDocNumber: null,
  });
});

test("normalizeWscdcResponse maps rejected responses", () => {
  const response = normalizeWscdcResponse({
    resultado: "Rechazado",
    Errors: { Err: [{ descripcion: "CAE invalido" }] },
  });

  assert.equal(response.status, "REJECTED");
  assert.equal(response.message, "CAE invalido");
});

test("normalizeWscdcResponse maps observed responses when only observations exist", () => {
  const response = normalizeWscdcResponse({
    comprobante: {
      observaciones: [{ msg: "Observado por diferencias de importe" }],
    },
  });

  assert.equal(response.status, "OBSERVED");
  assert.equal(response.message, "Observado por diferencias de importe");
});

test("normalizeWscdcResponse falls back to error for unrecognized payloads", () => {
  const response = normalizeWscdcResponse({});
  assert.equal(response.status, "ERROR");
  assert.equal(response.message, "Respuesta ARCA recibida");
  assert.equal(response.comprobante, null);
});
