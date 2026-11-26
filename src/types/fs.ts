export type StatementType =
  | 'position'
  | 'performance'
  | 'cash_flows'
  | 'net_assets'
  | 'budget_comparison'
  | (string & {});

export type SectionType = 
  | 'ASSETS' 
  | 'LIABILITIES' 
  | 'EQUITY' 
  | 'REVENUE' 
  | 'EXPENSES' 
  | 'TRANSFERS' 
  | 'NON_OPERATING' 
  | 'LOSSES' 
  | 'CASH_OPERATING' 
  | 'CASH_INVESTING' 
  | 'CASH_FINANCING' 
  | 'CASH_FLOWS' 
  | 'CHANGES_IN_NET_ASSETS'
  | 'BUDGET_RECEIPTS'
  | 'BUDGET_PAYMENTS'
  | 'BUDGET_COMPARISON'
  | (string & {});

export type SubsectionType = 
  | 'Current Assets' 
  | 'Non-Current Assets' 
  | 'Current Liabilities' 
  | 'Non-Current Liabilities' 
  | 'Net Assets/Equity'
  | 'Revenue'
  | 'Current Operating Expenses'
  | 'Transfers, Assistance and Subsidy'
  | 'Other Non-Operating Income'
  | 'Losses'
  | 'Cash Flows from Operating Activities'
  | 'Cash Flows from Investing Activities'
  | 'Cash Flows from Financing Activities'
  | 'Changes in Net Assets/Equity'
  | 'Receipts'
  | 'Payments'
  | (string & {});

export interface LineItemDefinition {
  id: string;
  name: string;
  uacs?: string; // Unified Account Code Structure (optional)
  statementType?: StatementType; // defaults to 'position'
  section: SectionType;
  subsection: SubsectionType;
  group: string; // e.g. "Cash and Cash Equivalents", "Personnel Services"
  subgroup?: string; // e.g. "Cash on Hand", "Machinery and Equipment"
  isContra?: boolean; // if true, subtracted (e.g., Accumulated Depreciation, Allowance for Impairment)
  parentItemId?: string; // links contra item to gross asset item
  order: number;
  isCustom?: boolean;
}

export interface Division {
  id: string;
  name: string;
  isDefault?: boolean;
}

// Map: Year -> DivisionId -> LineItemId -> Amount
export type FinancialDataStore = {
  [year: string]: {
    [divisionId: string]: {
      [lineItemId: string]: number;
    };
  };
};

export interface GroupSubtotal {
  gross: number;
  contra: number;
  net: number;
}

export interface AggregatedComponentItem {
  label: string;
  amount: number;
  isParentOriginal?: boolean;
  excelRowNumber?: number;
}

export interface DivisionAggregationRecord {
  lineItemId: string;
  lineItemName: string;
  wasAggregated: boolean; // true when parent + sub-items were summed; false if parent already matched children total
  aggregationReason?: 'hierarchy_rollup' | 'duplicate_entries';
  aggregationNote?: string;
  totalAmount: number;
  parentOriginalAmount: number;
  components: AggregatedComponentItem[];
  sourceFileName?: string;
  updatedAt: string;
}

// Map: Year -> DivisionId -> LineItemId -> DivisionAggregationRecord
export type AggregationMetadataStore = {
  [year: string]: {
    [divisionId: string]: {
      [lineItemId: string]: DivisionAggregationRecord;
    };
  };
};

export interface StagedEntry {
  id: string;
  lineItemId: string;
  rawText?: string;
  amount: string;
  aggregationRecord?: DivisionAggregationRecord;
}

export interface TopEntryDraft {
  selectedItemId: string;
  rawText: string;
  amountInput: string;
}

export interface BudgetComparisonDraft {
  draftGrid: Record<string, { orig: string; final: string; actual: string }>;
  draftNotes: Record<string, string>;
  isDirty: boolean;
}

