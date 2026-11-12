/**
 * Fiscal Year Range (2024 to 2099)
 * Earliest allowable fiscal year is 2024
 */
export const EARLIEST_YEAR = 2024;
export const LATEST_YEAR = 2099;

export const YEAR_RANGE: string[] = Array.from(
  { length: LATEST_YEAR - EARLIEST_YEAR + 1 },
  (_, i) => (EARLIEST_YEAR + i).toString()
);

/**
 * Automatically computes comparative prior year (Year - 1)
 */
export function getComparativeYear(year: string): string {
  const num = parseInt(year, 10);
  if (isNaN(num) || num <= EARLIEST_YEAR) return '2023';
  return (num - 1).toString();
}
