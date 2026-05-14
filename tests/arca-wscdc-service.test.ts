import test from "node:test";
import assert from "node:assert/strict";
import { validatePurchaseVoucherWithArca } from "../src/lib/arca/wscdc";

test("validatePurchaseVoucherWithArca builds WSCDC payload and maps response using mocked services", async () => {
  let ensuredArgs: { organizationId: string; service: string } | null = null;
  let executed: { method: string; payload: Record<string, unknown> } | null = null;

  const result = await validatePurchaseVoucherWithArca(
    {
      organizationId: "org-1",
      data: {
        mode: "CAE",
        issuerTaxId: "30-71234567-8",
        pointOfSale: 5,
        voucherType: 1,
        voucherNumber: 123,
        voucherDate: new Date("2026-04-01T12:00:00.000Z"),
        totalAmount: 150000.5,
        authorizationCode: " 12345678901234 ",
        receiverDocType: 96,
        receiverDocNumber: "12.345.678",
      },
    },
    {
      ensureServiceAuthorized: async (organizationId, service) => {
        ensuredArgs = { organizationId, service };
      },
      getClient: async () => ({
        CUIT: 30711222334,
        WebService: () => ({
          getTokenAuthorization: async () => ({
            token: "token-mock",
            sign: "sign-mock",
          }),
          executeRequest: async (method: string, payload: Record<string, unknown>) => {
            executed = { method, payload };
            return {
              Resultado: "A",
              CmpResp: {
                CbteModo: "CAE",
                CuitEmisor: 30712345678,
                PtoVta: 5,
                CbteTipo: 1,
                CbteNro: 123,
                CbteFch: 20260401,
                ImpTotal: 150000.5,
                CodAutorizacion: "12345678901234",
              },
              Observaciones: {
                Obs: [{ Msg: "Comprobante autorizado" }],
              },
            };
          },
        }),
      }),
    }
  );

  assert.deepEqual(ensuredArgs, { organizationId: "org-1", service: "wscdc" });
  assert.equal(executed?.method, "ComprobanteConstatar");

  const auth = executed?.payload.Auth as Record<string, unknown>;
  const cmpReq = executed?.payload.CmpReq as Record<string, unknown>;
  assert.deepEqual(auth, {
    Token: "token-mock",
    Sign: "sign-mock",
    Cuit: 30711222334,
  });
  assert.equal(cmpReq.CuitEmisor, 30712345678);
  assert.equal(cmpReq.PtoVta, 5);
  assert.equal(cmpReq.CbteTipo, 1);
  assert.equal(cmpReq.CbteNro, 123);
  assert.equal(cmpReq.CbteFch, 20260401);
  assert.equal(cmpReq.ImpTotal, 150000.5);
  assert.equal(cmpReq.CodAutorizacion, " 12345678901234 ");
  assert.equal(cmpReq.DocTipoReceptor, 96);
  assert.equal(cmpReq.DocNroReceptor, 12345678);

  assert.equal(result.status, "AUTHORIZED");
  assert.equal(result.message, "Comprobante autorizado");
  assert.deepEqual(result.comprobante, {
    mode: "CAE",
    issuerTaxId: "30712345678",
    pointOfSale: 5,
    voucherType: 1,
    voucherNumber: 123,
    voucherDate: "2026-04-01",
    totalAmount: 150000.5,
    authorizationCode: "12345678901234",
    receiverDocType: null,
    receiverDocNumber: null,
  });
});

test("validatePurchaseVoucherWithArca fails fast for invalid issuer CUIT", async () => {
  let getClientCalls = 0;

  await assert.rejects(
    () =>
      validatePurchaseVoucherWithArca(
        {
          organizationId: "org-1",
          data: {
            mode: "CAE",
            issuerTaxId: "123",
            pointOfSale: 1,
            voucherType: 1,
            voucherNumber: 1,
            voucherDate: new Date("2026-04-01T12:00:00.000Z"),
            totalAmount: 10,
            authorizationCode: "1",
          },
        },
        {
          ensureServiceAuthorized: async () => undefined,
          getClient: async () => {
            getClientCalls += 1;
            return {
              CUIT: 30711222334,
              WebService: () => ({
                getTokenAuthorization: async () => ({ token: "t", sign: "s" }),
                executeRequest: async () => ({}),
              }),
            };
          },
        }
      ),
    (error: unknown) =>
      error instanceof Error && error.message === "ARCA_ISSUER_CUIT_INVALID"
  );

  assert.equal(getClientCalls, 0);
});
