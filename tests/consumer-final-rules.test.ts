import test from "node:test";
import assert from "node:assert/strict";
import {
  CONSUMER_FINAL_IDENTIFICATION_THRESHOLD,
  evaluateConsumerFinalRule,
  resolveFiscalRecipientDocument,
} from "../src/lib/afip/consumer-final";

test("consumer final requires identification at threshold and with deduction flag", () => {
  const atThreshold = evaluateConsumerFinalRule({
    customerType: "CONSUMER_FINAL",
    totalAmount: CONSUMER_FINAL_IDENTIFICATION_THRESHOLD,
  });
  assert.equal(atThreshold.requireIdentification, true);
  assert.equal(atThreshold.exceedsThreshold, true);

  const byDeduction = evaluateConsumerFinalRule({
    customerType: "CONSUMER_FINAL",
    totalAmount: 5000,
    requiresIncomeTaxDeduction: true,
  });
  assert.equal(byDeduction.requireIdentification, true);
  assert.equal(byDeduction.requiresByDeduction, true);
});

test("non consumer final does not force identification by threshold", () => {
  const rule = evaluateConsumerFinalRule({
    customerType: "RESPONSABLE_INSCRIPTO",
    totalAmount: CONSUMER_FINAL_IDENTIFICATION_THRESHOLD + 1,
  });
  assert.equal(rule.isConsumerFinal, false);
  assert.equal(rule.requireIdentification, false);
});

test("resolveFiscalRecipientDocument prioritizes explicit valid document", () => {
  const resolved = resolveFiscalRecipientDocument({
    customerType: "CONSUMER_FINAL",
    totalAmount: 1500,
    explicitDocType: "96",
    explicitDocNumber: "12.345.678",
  });

  assert.equal(resolved.docType, 96);
  assert.equal(resolved.docNumber, 12345678);
  assert.equal(resolved.identificationProvided, true);
  assert.equal(resolved.warnings.length, 0);
});

test("resolveFiscalRecipientDocument falls back to customer CUIT and warns when required identification is missing", () => {
  const fromTaxId = resolveFiscalRecipientDocument({
    customerType: "CONSUMER_FINAL",
    totalAmount: 1000,
    customerTaxId: "20-12345678-3",
  });
  assert.equal(fromTaxId.docType, 80);
  assert.equal(fromTaxId.docNumber, 20123456783);
  assert.equal(fromTaxId.identificationProvided, true);

  const missingId = resolveFiscalRecipientDocument({
    customerType: "CONSUMER_FINAL",
    totalAmount: CONSUMER_FINAL_IDENTIFICATION_THRESHOLD + 10,
    requiresIncomeTaxDeduction: true,
  });
  assert.equal(missingId.docType, 99);
  assert.equal(missingId.docNumber, 0);
  assert.equal(missingId.requireIdentification, true);
  assert.equal(missingId.identificationProvided, false);
  assert.ok(
    missingId.warnings.some((warning) => warning.includes("10.000.000")),
    "should include threshold warning"
  );
  assert.ok(
    missingId.warnings.some((warning) => warning.includes("Ganancias")),
    "should include deduction warning"
  );
});
