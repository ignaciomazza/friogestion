import test from "node:test";
import assert from "node:assert/strict";
import { mapArcaValidationError } from "../src/lib/arca/validation-errors";

test("mapArcaValidationError translates ARCA_HTTP errors", () => {
  const mapped = mapArcaValidationError(new Error("ARCA_HTTP_401: Unauthorized"));
  assert.equal(mapped.code, "ARCA_VALIDATION_ERROR");
  assert.match(mapped.error, /autenticacion/i);
});

test("mapArcaValidationError maps saved request missing", () => {
  const mapped = mapArcaValidationError(
    new Error("PURCHASE_VALIDATION_REQUEST_MISSING"),
  );
  assert.equal(mapped.code, "PURCHASE_VALIDATION_REQUEST_MISSING");
  assert.match(mapped.error, /pedido de validacion/i);
});
