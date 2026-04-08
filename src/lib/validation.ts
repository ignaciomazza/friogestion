type DateParseResult = {
  date: Date | null;
  error: string | null;
};

export function parseOptionalDate(value?: string | null): DateParseResult {
  if (!value) {
    return { date: null, error: null };
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return { date: null, error: "DATE_INVALID" };
  }
  return { date: parsed, error: null };
}
