import { FinancialDataStore } from '../types/fs';
import {
  BUDGET_COMPARISON_ROWS,
  getBudgetComparisonStorageKey,
} from '../data/budgetComparisonLineItems';
import { formatAccounting } from './formatters';

export interface BudgetComparisonTotals {
  original: number;
  final: number;
  actual: number;
  difference: number;
}

export interface BudgetComparisonRowSummary extends BudgetComparisonTotals {
  id: string;
  name: string;
  group: 'RECEIPTS' | 'PAYMENTS';
}

export interface BudgetComparisonSummary {
  receipts: BudgetComparisonRowSummary[];
  payments: BudgetComparisonRowSummary[];
  totalReceipts: BudgetComparisonTotals;
  totalPayments: BudgetComparisonTotals;
  netReceiptsPayments: BudgetComparisonTotals;
  hasAnyData: boolean;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

export function formatBudgetComparisonNumber(val: number): string {
  const clean = Math.abs(val) < 0.005 ? 0 : val;
  return formatAccounting(clean, false);
}

/**
 * Computes the complete Statement of Comparison of Budget and Actual Amounts
 * for a single division (when divisionId is provided) or consolidated across all divisions.
 *
 * Rulings:
 * - Difference Final Budget and Actual = Final - Actual Amounts on Comparable Basis
 * - Total Receipts = sum of Receipts line items (across Original, Final, Actual, Difference)
 * - Total Payments = sum of Payments line items (across Original, Final, Actual, Difference)
 * - NET RECEIPTS/PAYMENT = Total Receipts - Total Payments (across all 4 columns)
 */
export function calculateBudgetComparisonSummary(
  dataStore: FinancialDataStore,
  year: string,
  divisionId?: string
): BudgetComparisonSummary {
  const yearData = dataStore[year] || {};

  const getCellAmount = (storageKey: string): number => {
    if (divisionId) {
      return (yearData[divisionId] && yearData[divisionId][storageKey]) || 0;
    }
    let total = 0;
    Object.keys(yearData).forEach((dId) => {
      total += (yearData[dId] && yearData[dId][storageKey]) || 0;
    });
    return total;
  };

  let hasAnyData = false;

  const buildRow = (
    row: (typeof BUDGET_COMPARISON_ROWS)[number]
  ): BudgetComparisonRowSummary => {
    const original = getCellAmount(getBudgetComparisonStorageKey(row.id, 'orig'));
    const final = getCellAmount(getBudgetComparisonStorageKey(row.id, 'final'));
    const actual = getCellAmount(getBudgetComparisonStorageKey(row.id, 'actual'));
    const difference = round2(final - actual);

    if (
      Math.abs(original) >= 0.005 ||
      Math.abs(final) >= 0.005 ||
      Math.abs(actual) >= 0.005
    ) {
      hasAnyData = true;
    }

    return {
      id: row.id,
      name: row.name,
      group: row.group,
      original,
      final,
      actual,
      difference,
    };
  };

  const receipts = BUDGET_COMPARISON_ROWS.filter((r) => r.group === 'RECEIPTS').map(buildRow);
  const payments = BUDGET_COMPARISON_ROWS.filter((r) => r.group === 'PAYMENTS').map(buildRow);

  const sumTotals = (rows: BudgetComparisonRowSummary[]): BudgetComparisonTotals => {
    const original = round2(rows.reduce((acc, r) => acc + r.original, 0));
    const final = round2(rows.reduce((acc, r) => acc + r.final, 0));
    const actual = round2(rows.reduce((acc, r) => acc + r.actual, 0));
    const difference = round2(final - actual);
    return { original, final, actual, difference };
  };

  const totalReceipts = sumTotals(receipts);
  const totalPayments = sumTotals(payments);
  const netReceiptsPayments: BudgetComparisonTotals = {
    original: round2(totalReceipts.original - totalPayments.original),
    final: round2(totalReceipts.final - totalPayments.final),
    actual: round2(totalReceipts.actual - totalPayments.actual),
    difference: round2(totalReceipts.difference - totalPayments.difference),
  };

  return {
    receipts,
    payments,
    totalReceipts,
    totalPayments,
    netReceiptsPayments,
    hasAnyData,
  };
}

const SCBAA_NOTES_STORAGE_KEY = 'deped_ro6_scbaa_notes_v1';

type ScbaaNotesStore = Record<string, Record<string, Record<string, string>>>;

function readAllNotesStore(): ScbaaNotesStore {
  try {
    const raw = localStorage.getItem(SCBAA_NOTES_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

export function loadBudgetComparisonNotes(
  year: string,
  divisionId: string
): Record<string, string> {
  const store = readAllNotesStore();
  return { ...(store[year]?.[divisionId] || {}) };
}

export function saveBudgetComparisonNotes(
  year: string,
  divisionId: string,
  notes: Record<string, string>
): void {
  try {
    const store = readAllNotesStore();
    const cleaned: Record<string, string> = {};
    Object.entries(notes).forEach(([k, v]) => {
      const trimmed = v.trim();
      if (trimmed) cleaned[k] = trimmed;
    });
    const yearCopy = { ...(store[year] || {}) };
    yearCopy[divisionId] = cleaned;
    const next = { ...store, [year]: yearCopy };
    localStorage.setItem(SCBAA_NOTES_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore storage write error
  }
}

export function loadConsolidatedBudgetComparisonNotes(year: string): Record<string, string> {
  const store = readAllNotesStore();
  const yr = store[year] || {};
  const result: Record<string, string> = {};
  BUDGET_COMPARISON_ROWS.forEach((row) => {
    const uniqueNotes = new Set<string>();
    Object.values(yr).forEach((divNotes) => {
      const val = divNotes?.[row.id]?.trim();
      if (val) uniqueNotes.add(val);
    });
    if (uniqueNotes.size > 0) {
      result[row.id] = Array.from(uniqueNotes).join(', ');
    }
  });
  return result;
}
