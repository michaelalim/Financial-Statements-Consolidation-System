import { LineItemDefinition, FinancialDataStore, Division } from '../types/fs';

export interface CalculatedReport {
  // Individual line item values (gross / contra / net)
  values: { [lineItemId: string]: number };
  
  // Subgroup net amounts
  subgroupTotals: { [subgroupKey: string]: number };
  
  // Group net amounts
  groupTotals: { [groupKey: string]: number };
  
  // Section subtotals
  totalCurrentAssets: number;
  totalNonCurrentAssets: number;
  totalAssets: number;
  
  totalCurrentLiabilities: number;
  totalNonCurrentLiabilities: number;
  totalLiabilities: number;
  
  assetsLessLiabilities: number;
  
  totalEquity: number;
  netAssetsEquity: number;
  
  isBalanced: boolean;
  variance: number;
}

/**
 * Calculates a complete financial report for a specific division and year,
 * or for consolidated data.
 */
export function calculateReport(
  lineItems: LineItemDefinition[],
  dataStore: FinancialDataStore,
  year: string,
  divisionId?: string // if undefined, calculates CONSOLIDATED across all divisions
): CalculatedReport {
  const values: { [lineItemId: string]: number } = {};
  const yearData = dataStore[year] || {};

  // 1. Gather all line item values
  lineItems.forEach((item) => {
    if (divisionId) {
      values[item.id] = (yearData[divisionId] && yearData[divisionId][item.id]) || 0;
    } else {
      // Consolidated across all divisions in this year
      let sum = 0;
      Object.keys(yearData).forEach((divKey) => {
        sum += (yearData[divKey] && yearData[divKey][item.id]) || 0;
      });
      values[item.id] = sum;
    }
  });

  const subgroupTotals: { [key: string]: number } = {};
  const groupTotals: { [key: string]: number } = {};

  let totalCurrentAssets = 0;
  let totalNonCurrentAssets = 0;
  let totalCurrentLiabilities = 0;
  let totalNonCurrentLiabilities = 0;
  let totalEquity = 0;

  // Process all items
  lineItems.forEach((item) => {
    const rawVal = values[item.id] || 0;
    // For calculating net asset / liability impact:
    // If it's a contra item, its positive input actually subtracts from the asset value
    const effectiveVal = item.isContra ? -Math.abs(rawVal) : rawVal;

    const groupKey = `${item.subsection}__${item.group}`;
    const subgroupKey = item.subgroup ? `${groupKey}__${item.subgroup}` : groupKey;

    subgroupTotals[subgroupKey] = (subgroupTotals[subgroupKey] || 0) + effectiveVal;
    groupTotals[groupKey] = (groupTotals[groupKey] || 0) + effectiveVal;

    if (item.subsection === 'Current Assets') {
      totalCurrentAssets += effectiveVal;
    } else if (item.subsection === 'Non-Current Assets') {
      totalNonCurrentAssets += effectiveVal;
    } else if (item.subsection === 'Current Liabilities') {
      totalCurrentLiabilities += effectiveVal;
    } else if (item.subsection === 'Non-Current Liabilities') {
      totalNonCurrentLiabilities += effectiveVal;
    } else if (item.section === 'EQUITY' || item.subsection === 'Net Assets/Equity') {
      totalEquity += effectiveVal;
    }
  });

  const totalAssets = totalCurrentAssets + totalNonCurrentAssets;
  const totalLiabilities = totalCurrentLiabilities + totalNonCurrentLiabilities;
  const assetsLessLiabilities = totalAssets - totalLiabilities;
  const netAssetsEquity = totalEquity;

  const variance = Math.abs(assetsLessLiabilities - netAssetsEquity);
  const isBalanced = variance < 0.01;

  return {
    values,
    subgroupTotals,
    groupTotals,
    totalCurrentAssets,
    totalNonCurrentAssets,
    totalAssets,
    totalCurrentLiabilities,
    totalNonCurrentLiabilities,
    totalLiabilities,
    assetsLessLiabilities,
    totalEquity,
    netAssetsEquity,
    isBalanced,
    variance,
  };
}

export interface DivisionalMatrixRow {
  item: LineItemDefinition;
  divisionAmounts: { [divisionId: string]: number };
  totalAmount: number;
}

/**
 * Builds a cross-division breakdown matrix for a given year.
 */
export function buildDivisionalMatrix(
  lineItems: LineItemDefinition[],
  divisions: Division[],
  dataStore: FinancialDataStore,
  year: string
): DivisionalMatrixRow[] {
  const yearData = dataStore[year] || {};

  return lineItems.map((item) => {
    const divisionAmounts: { [divisionId: string]: number } = {};
    let total = 0;

    divisions.forEach((div) => {
      const val = (yearData[div.id] && yearData[div.id][item.id]) || 0;
      divisionAmounts[div.id] = val;
      total += val;
    });

    return {
      item,
      divisionAmounts,
      totalAmount: total,
    };
  });
}
