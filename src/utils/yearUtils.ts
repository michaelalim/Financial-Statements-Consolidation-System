/**
 * Comprehensive Year Range (2001 to 2099)
 * Used across DepEd Region VI Financial Statement System
 */
export const YEAR_RANGE: string[] = Array.from({ length: 99 }, (_, i) => (2099 - i).toString());

/**
 * Automatically computes comparative prior year (Year - 1)
 */
export function getComparativeYear(year: string): string {
  const num = parseInt(year, 10);
  if (isNaN(num)) return '2024';
  return (num - 1).toString();
}
