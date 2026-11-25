import { LineItemDefinition } from '../types/fs';

export type BudgetComparisonColumnKey = 'orig' | 'final' | 'actual';

export interface BudgetComparisonRowDefinition {
  id: string;
  name: string;
  group: 'RECEIPTS' | 'PAYMENTS';
  order: number;
}

export const BUDGET_COMPARISON_ROWS: BudgetComparisonRowDefinition[] = [
  // RECEIPTS
  { id: 'scbaa-rec-tax-revenue', name: 'Tax Revenue', group: 'RECEIPTS', order: 4001 },
  { id: 'scbaa-rec-service-business', name: 'Service and Business Income', group: 'RECEIPTS', order: 4002 },
  { id: 'scbaa-rec-assistance-subsidy', name: 'Assistance and Subsidy', group: 'RECEIPTS', order: 4003 },
  { id: 'scbaa-rec-shares-grants', name: 'Shares, Grants and Donations', group: 'RECEIPTS', order: 4004 },
  { id: 'scbaa-rec-gains', name: 'Gains', group: 'RECEIPTS', order: 4005 },
  { id: 'scbaa-rec-others', name: 'Others', group: 'RECEIPTS', order: 4006 },

  // PAYMENTS
  { id: 'scbaa-pay-personnel', name: 'Personnel Services', group: 'PAYMENTS', order: 4011 },
  { id: 'scbaa-pay-mooe', name: 'Maintenance and Other Operating Expenses', group: 'PAYMENTS', order: 4012 },
  { id: 'scbaa-pay-capital-outlays', name: 'Capital Outlays', group: 'PAYMENTS', order: 4013 },
  { id: 'scbaa-pay-financial', name: 'Financial Expenses', group: 'PAYMENTS', order: 4014 },
  { id: 'scbaa-pay-others', name: 'Others', group: 'PAYMENTS', order: 4015 },
];

export function getBudgetComparisonStorageKey(
  rowId: string,
  col: BudgetComparisonColumnKey
): string {
  return `${rowId}__${col}`;
}

export const BUDGET_COMPARISON_ALL_STORAGE_KEYS: string[] = BUDGET_COMPARISON_ROWS.flatMap(
  (row) => [
    getBudgetComparisonStorageKey(row.id, 'orig'),
    getBudgetComparisonStorageKey(row.id, 'final'),
    getBudgetComparisonStorageKey(row.id, 'actual'),
  ]
);

export const DEFAULT_BUDGET_COMPARISON_LINE_ITEMS: LineItemDefinition[] =
  BUDGET_COMPARISON_ROWS.map((row) => ({
    id: row.id,
    name: row.name,
    statementType: 'budget_comparison',
    section: row.group === 'RECEIPTS' ? 'BUDGET_RECEIPTS' : 'BUDGET_PAYMENTS',
    subsection: row.group === 'RECEIPTS' ? 'Receipts' : 'Payments',
    group: row.group === 'RECEIPTS' ? 'RECEIPTS' : 'PAYMENTS',
    order: row.order,
  }));
