type DateParseResult = {
  date: Date | null;
  error: string | null;
};

export function parseOptionalDate(value?: string | null): DateParseResult {
  if (!value) {
    return { date: null, error: null };
  }
  const trimmed = value.trim();
  const dateOnlyMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (dateOnlyMatch) {
    const year = Number(dateOnlyMatch[1]);
    const month = Number(dateOnlyMatch[2]);
    const day = Number(dateOnlyMatch[3]);
    const parsedDateOnly = new Date(year, month - 1, day);
    if (
      parsedDateOnly.getFullYear() !== year ||
      parsedDateOnly.getMonth() !== month - 1 ||
      parsedDateOnly.getDate() !== day
    ) {
      return { date: null, error: "DATE_INVALID" };
    }
    return { date: parsedDateOnly, error: null };
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    return { date: null, error: "DATE_INVALID" };
  }
  return { date: parsed, error: null };
}
