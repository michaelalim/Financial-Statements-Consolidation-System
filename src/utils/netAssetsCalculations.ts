import { FinancialDataStore } from '../types/fs';
import { getComparativeYear } from './yearUtils';
import { EARLIEST_YEAR } from './yearUtils';

export interface NetAssetsSummary {
  january1Balance: number;
  changesInAccountingPolicy: number;
  priorPeriodErrors: number;
  otherAdjustments: number;
  totalBeginningAdjustments: number;
  restatedBalance: number;
  surplusDeficitForPeriod: number;
  netRevenueAdjustment: number;
  others: number;
  totalCalendarYearChanges: number;
  december31Balance: number;
  isJan1FromPriorDec31: boolean;
}

/**
 * Computes the complete Statement of Changes in Net Assets/Equity summary
 * for a specific division and year, or consolidated across all divisions.
 *
 * Rules:
 * - Balance at January 1 equals Balance at December 31 of the previous year,
 *   EXCEPT for FY 2024 where it is user-adjustable (no 2023 data).
 * - Restated Balance = Balance at January 1 + Changes in Accounting Policy
 *   + Prior period errors + Other Adjustments (negative values deduct).
 * - Balance at December 31 = Restated Balance + Surplus/(Deficit) for the Period
 *   + Adjustment of net revenue recognized directly in net assets/equity + Others.
 */
export function calculateNetAssetsSummary(
  dataStore: FinancialDataStore,
  year: string,
  divisionId?: string
): NetAssetsSummary {
  const yearData = dataStore[year] || {};

  const getAmount = (itemId: string, yrData: Record<string, Record<string, number>>): number => {
    if (divisionId) {
      return (yrData[divisionId] && yrData[divisionId][itemId]) || 0;
    }
    let total = 0;
    Object.keys(yrData).forEach((dId) => {
      total += (yrData[dId] && yrData[dId][itemId]) || 0;
    });
    return total;
  };

  const hasExplicitEntry = (itemId: string, yr: string): boolean => {
    const yrData = dataStore[yr] || {};
    if (divisionId) {
      return yrData[divisionId]?.[itemId] !== undefined;
    }
    return Object.values(yrData).some((d) => d?.[itemId] !== undefined);
  };

  const numericYear = Number(year);
  let january1Balance = 0;
  let isJan1FromPriorDec31 = false;

  if (numericYear <= EARLIEST_YEAR) {
    // FY 2024 (earliest year): user-adjustable since no 2023 data exists
    january1Balance = hasExplicitEntry('na-beg-balance', year)
      ? getAmount('na-beg-balance', yearData)
      : 0;
  } else {
    // FY 2025+: always equals Balance at December 31 of the previous year
    const prevYear = getComparativeYear(year);
    const priorSummary = calculateNetAssetsSummary(dataStore, prevYear, divisionId);
    january1Balance = priorSummary.december31Balance;
    isJan1FromPriorDec31 = true;
  }

  const changesInAccountingPolicy = getAmount('na-adj-accounting-policy', yearData);
  const priorPeriodErrors = getAmount('na-adj-prior-period-errors', yearData);
  const otherAdjustments = getAmount('na-adj-other-adjustments', yearData);
  const totalBeginningAdjustments =
    changesInAccountingPolicy + priorPeriodErrors + otherAdjustments;

  const restatedBalance = january1Balance + totalBeginningAdjustments;

  const surplusDeficitForPeriod = getAmount('na-cy-surplus-deficit', yearData);
  const netRevenueAdjustment = getAmount('na-cy-net-revenue-adj', yearData);
  const others = getAmount('na-cy-others', yearData);
  const totalCalendarYearChanges =
    surplusDeficitForPeriod + netRevenueAdjustment + others;

  const december31Balance = restatedBalance + totalCalendarYearChanges;

  return {
    january1Balance,
    changesInAccountingPolicy,
    priorPeriodErrors,
    otherAdjustments,
    totalBeginningAdjustments,
    restatedBalance,
    surplusDeficitForPeriod,
    netRevenueAdjustment,
    others,
    totalCalendarYearChanges,
    december31Balance,
    isJan1FromPriorDec31,
  };
}
