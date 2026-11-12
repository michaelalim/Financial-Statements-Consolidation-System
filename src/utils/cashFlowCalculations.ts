import { LineItemDefinition, FinancialDataStore } from '../types/fs';
import { getComparativeYear } from './yearUtils';

export interface CashFlowsSummary {
  operatingInflows: number;
  operatingOutflows: number;
  netOperating: number;

  investingInflows: number;
  investingOutflows: number;
  netInvesting: number;

  financingInflows: number;
  financingOutflows: number;
  netFinancing: number;

  netIncreaseDecrease: number;
  january1Cash: number;
  december31Cash: number;
  isJan1FromPriorDec31: boolean;
  isDec31Calculated: boolean;
}

/**
 * Computes the complete Statement of Cash Flows summary and reconciliation balances
 * for a specific division and year, or consolidated across all divisions.
 */
export function calculateCashFlowsSummary(
  lineItems: LineItemDefinition[],
  dataStore: FinancialDataStore,
  year: string,
  divisionId?: string
): CashFlowsSummary {
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

  let operatingInflows = 0;
  let operatingOutflows = 0;
  let investingInflows = 0;
  let investingOutflows = 0;
  let financingInflows = 0;
  let financingOutflows = 0;

  lineItems.forEach((item) => {
    if ((item.statementType || 'position') !== 'cash_flows') return;
    if (item.id === 'cf-sum-beg-cash' || item.id === 'cf-sum-end-cash' || item.id === 'cf-sum-net-inc-dec') {
      return;
    }

    const amt = getAmount(item.id, yearData);
    if (!amt) return;

    if (item.subsection === 'Cash Flows from Operating Activities') {
      if (item.subgroup === 'Cash Outflows') {
        operatingOutflows += amt;
      } else {
        operatingInflows += amt;
      }
    } else if (item.subsection === 'Cash Flows from Investing Activities') {
      if (item.subgroup === 'Cash Outflows') {
        investingOutflows += amt;
      } else {
        investingInflows += amt;
      }
    } else if (item.subsection === 'Cash Flows from Financing Activities') {
      if (item.subgroup === 'Cash Outflows') {
        financingOutflows += amt;
      } else {
        financingInflows += amt;
      }
    }
  });

  const netOperating = operatingInflows - operatingOutflows;
  const netInvesting = investingInflows - investingOutflows;
  const netFinancing = financingInflows - financingOutflows;

  // Explicit net increase/decrease if user encoded it, otherwise sum of 3 activities
  const explicitNet = getAmount('cf-sum-net-inc-dec', yearData);
  const netIncreaseDecrease = hasExplicitEntry('cf-sum-net-inc-dec', year)
    ? explicitNet
    : netOperating + netInvesting + netFinancing;

  // 1. Cash and Cash Equivalents, January 1:
  // Should equal the balance of Cash and Cash Equivalents, December 31 of previous period by default
  const prevYear = getComparativeYear(year);
  const hasExplicitJan1 = hasExplicitEntry('cf-sum-beg-cash', year);
  let january1Cash = 0;
  let isJan1FromPriorDec31 = false;

  if (hasExplicitJan1) {
    january1Cash = getAmount('cf-sum-beg-cash', yearData);
  } else {
    // Default to December 31 balance of previous period
    const prevYearData = dataStore[prevYear] || {};
    const priorExplicitDec31 = getAmount('cf-sum-end-cash', prevYearData);
    if (hasExplicitEntry('cf-sum-end-cash', prevYear) && priorExplicitDec31 !== 0) {
      january1Cash = priorExplicitDec31;
      isJan1FromPriorDec31 = true;
    } else if (dataStore[prevYear]) {
      // If prior year exists, calculate its ending cash flow balance recursively
      const priorSummary = calculateCashFlowsSummary(lineItems, dataStore, prevYear, divisionId);
      january1Cash = priorSummary.december31Cash;
      if (january1Cash !== 0) {
        isJan1FromPriorDec31 = true;
      }
    }
  }

  // 2. Cash and Cash Equivalents, December 31:
  // Should equal Increase(Decrease) in Cash and Cash Equivalents added to(subtracted to) January 1
  const december31Cash = january1Cash + netIncreaseDecrease;
  const isDec31Calculated = true;

  return {
    operatingInflows,
    operatingOutflows,
    netOperating,
    investingInflows,
    investingOutflows,
    netInvesting,
    financingInflows,
    financingOutflows,
    netFinancing,
    netIncreaseDecrease,
    january1Cash,
    december31Cash,
    isJan1FromPriorDec31,
    isDec31Calculated,
  };
}
