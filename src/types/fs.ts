export type StatementType = 'position' | 'performance' | 'cash_flows' | (string & {});

export type SectionType = 
  | 'ASSETS' 
  | 'LIABILITIES' 
  | 'EQUITY' 
  | 'REVENUE' 
  | 'EXPENSES' 
  | 'TRANSFERS' 
  | 'CASH_OPERATING' 
  | 'CASH_INVESTING' 
  | 'CASH_FINANCING' 
  | 'CASH_FLOWS' 
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
  | 'Cash Flows from Operating Activities'
  | 'Cash Flows from Investing Activities'
  | 'Cash Flows from Financing Activities'
  | (string & {});

export interface LineItemDefinition {
  id: string;
  name: string;
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
