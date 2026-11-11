/**
 * Formats numbers into accounting currency format:
 * - 0 or empty -> "-"
 * - Positive -> "1,234.56"
 * - Negative / Contra -> "(1,234.56)"
 */
export function formatAccounting(val: number | null | undefined, showDashForZero = true): string {
  if (val === null || val === undefined || isNaN(val) || (showDashForZero && Math.abs(val) < 0.005)) {
    return '-';
  }
  const isNegative = val < 0;
  const absVal = Math.abs(val);
  const formatted = absVal.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  return isNegative ? `(${formatted})` : formatted;
}

export function formatPeso(val: number | null | undefined, showDashForZero = true): string {
  const formatted = formatAccounting(val, showDashForZero);
  if (formatted === '-') return '-';
  if (formatted.startsWith('(')) {
    return `(₱ ${formatted.slice(1)}`;
  }
  return `₱ ${formatted}`;
}

export function parseNumberInput(input: string): number {
  if (!input) return 0;
  // Clean commas, spaces, currency symbols, and handle parenthesized negatives
  let clean = input.trim().replace(/[₱\s,]/g, '');
  if (clean.startsWith('(') && clean.endsWith(')')) {
    clean = '-' + clean.slice(1, -1);
  }
  const parsed = parseFloat(clean);
  return isNaN(parsed) ? 0 : parsed;
}
