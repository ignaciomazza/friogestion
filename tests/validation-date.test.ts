import test from "node:test";
import assert from "node:assert/strict";
import { parseOptionalDate } from "../src/lib/validation";

test("parseOptionalDate keeps YYYY-MM-DD calendar date", () => {
  const result = parseOptionalDate("2026-04-13");

  assert.equal(result.error, null);
  assert.ok(result.date);
  assert.equal(result.date?.getFullYear(), 2026);
  assert.equal(result.date?.getMonth(), 3);
  assert.equal(result.date?.getDate(), 13);
});

test("parseOptionalDate rejects impossible dates", () => {
  const result = parseOptionalDate("2026-02-31");
  assert.equal(result.date, null);
  assert.equal(result.error, "DATE_INVALID");
});
