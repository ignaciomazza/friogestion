import test from "node:test";
import assert from "node:assert/strict";
import { normalizeTaxpayerPayload } from "../src/lib/arca/taxpayer-lookup";

test("normalizeTaxpayerPayload is tolerant to changed getPersona_v2 tags", () => {
  const normalized = normalizeTaxpayerPayload(
    {
      personaReturn: {
        persona: {
          idPersona: "20-11222333-4",
          razonSocial: "Refrigeracion Patagonia S.A.",
          estadoClave: "ACTIVO",
          fechaSolicitud: "2026-02-11",
        },
      },
    },
    "20112223334"
  );

  assert.equal(normalized.status, "FOUND");
  assert.equal(normalized.taxId, "20112223334");
  assert.equal(normalized.legalName, "Refrigeracion Patagonia S.A.");
  assert.equal(normalized.displayName, "Refrigeracion Patagonia S.A.");
  assert.equal(normalized.state, "ACTIVO");
  assert.ok(normalized.registeredAt?.startsWith("2026-02-11"));
});

test("normalizeTaxpayerPayload returns NO_ENCONTRADO snapshot when payload is empty", () => {
  const normalized = normalizeTaxpayerPayload(null, "30712345678");
  assert.equal(normalized.status, "NO_ENCONTRADO");
  assert.equal(normalized.taxId, "30712345678");
  assert.equal(normalized.displayName, "No encontrado");
  assert.equal(normalized.raw, null);
});
