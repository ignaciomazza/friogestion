import test from "node:test";
import assert from "node:assert/strict";
import {
  compareNamesForMatch,
  normalizeCuit,
  normalizeNameForMatch,
} from "../src/lib/arca/normalization";

test("normalizeCuit strips separators and validates length", () => {
  assert.equal(normalizeCuit("20-12345678-3"), "20123456783");
  assert.equal(normalizeCuit(" 30 71234567 8 "), "30712345678");
  assert.equal(normalizeCuit("123"), null);
});

test("normalizeNameForMatch removes diacritics and legal suffixes", () => {
  const value = normalizeNameForMatch("Refrigeración del Sur S.A.");
  assert.equal(value, "REFRIGERACION DEL SUR");
});

test("compareNamesForMatch returns MATCH, PARTIAL and MISMATCH levels", () => {
  const match = compareNamesForMatch("Metalurgica Norte SA", "Metalurgica Norte SA");
  assert.equal(match.level, "MATCH");
  assert.equal(match.score, 1);

  const partial = compareNamesForMatch(
    "Refrigeracion Del Sur SRL",
    "Refrigeracion Sur"
  );
  assert.equal(partial.level, "PARTIAL");
  assert.ok(partial.score > 0.58);

  const mismatch = compareNamesForMatch(
    "Servicios Logisticos del Oeste",
    "Panaderia Centro"
  );
  assert.equal(mismatch.level, "MISMATCH");
  assert.ok(mismatch.score < 0.58);
});
