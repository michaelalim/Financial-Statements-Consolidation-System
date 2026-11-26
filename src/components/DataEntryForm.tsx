import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  BudgetComparisonDraft,
  Division,
  LineItemDefinition,
  FinancialDataStore,
  DivisionAggregationRecord,
  AggregationMetadataStore,
  StagedEntry,
  TopEntryDraft,
} from '../types/fs';
import { formatAccounting, parseNumberInput } from '../utils/formatters';
import { getComparativeYear } from '../utils/yearUtils';
import { AGGREGATED_ACCUMULATED_DEPRECIATION_ID } from '../data/defaultLineItems';
import { SearchableLineItemSelect, normalizeAlphanumeric } from './SearchableLineItemSelect';
import * as XLSX from 'xlsx';
import { 
  Plus, 
  Trash2, 
  Calendar, 
  Check, 
  FileText, 
  ChevronRight, 
  ChevronDown,
  ChevronUp,
  Layers, 
  RotateCcw,
  CheckCircle2,
  Eye,
  EyeOff,
  Lock,
  FileSpreadsheet,
  Zap,
  ArrowDown,
  AlertCircle,
  PenTool,
  Calculator,
  Upload,
  Info,
  X,
  PanelRight, // [live_edit]
} from 'lucide-react';
import { ConfirmModal } from './ConfirmModal';
import { FinancialStatementSidebar, FinancialStatementType } from './FinancialStatementSidebar';
import { BudgetComparisonEntryTable } from './BudgetComparisonEntryTable';
import { ExcelPositionImportModal } from './ExcelPositionImportModal';
import { TipsButton } from './TipsButton';
import { calculateCashFlowsSummary } from '../utils/cashFlowCalculations';
import { calculateNetAssetsSummary } from '../utils/netAssetsCalculations';
import {
  buildLiveEditOverlay,
  LiveEditStatementPanel,
  LiveEditWindowMode,
} from '../live_edit'; // [live_edit]

export type { FinancialStatementType };

interface FinancialStatementOption {
  id: FinancialStatementType;
  title: string;
  subtitle: string;
  isLocked: boolean;
  lockNotice: string;
}

const FINANCIAL_STATEMENTS: FinancialStatementOption[] = [
  {
    id: 'position',
    title: 'Statement of Financial Position',
    subtitle: 'All Funds Balance Sheet (DepEd RO VI Benchmark)',
    isLocked: false,
    lockNotice: '',
  },
  {
    id: 'performance',
    title: 'Statement of Financial Performance',
    subtitle: 'Income Statement / Revenue & Expenses',
    isLocked: false,
    lockNotice: 'Statement of Financial Performance is locked for now pending upcoming instructions.',
  },
  {
    id: 'cash_flows',
    title: 'Statement of Cash Flows',
    subtitle: 'Operating, Investing & Financing Activities',
    isLocked: false,
    lockNotice: '',
  },
  {
    id: 'net_assets',
    title: 'Statement of Changes in Net Assets/Equity',
    subtitle: 'Accumulated Surplus/Deficit & Equity Reserves',
    isLocked: false,
    lockNotice: '',
  },
  {
    id: 'budget_comparison',
    title: 'Statement of Comparison of Budget and Actual Amounts',
    subtitle: 'Receipts & Payments: Original, Final, Actual & Difference',
    isLocked: false,
    lockNotice: '',
  },
];

interface StatementEncodingMeta {
  topPlaceholder: string;
  rowPlaceholder: string;
  batchExampleTyped: string;
  batchExampleMatched: string;
}

const STATEMENT_ENCODING_META: Record<FinancialStatementType, StatementEncodingMeta> = {
  position: {
    topPlaceholder: 'Type or click to choose account (e.g. Cash, Office Equip)...',
    rowPlaceholder: 'Enter account (e.g. Cash, Office Equip)...',
    batchExampleTyped: 'cash collecting',
    batchExampleMatched: 'Cash - Collecting Officer',
  },
  performance: {
    topPlaceholder: 'Type or click to choose line item (e.g. Salaries, Office Supplies)...',
    rowPlaceholder: 'Enter line item (e.g. Salaries, Office Supplies)...',
    batchExampleTyped: 'salaries regular',
    batchExampleMatched: 'Salaries and Wages - Regular',
  },
  cash_flows: {
    topPlaceholder: 'Type or click to choose line item (e.g. Notice of Cash Allocation, Personnel Services)...',
    rowPlaceholder: 'Enter line item (e.g. Receipt of NCA, Personnel Services)...',
    batchExampleTyped: 'payment personnel',
    batchExampleMatched: 'Payment of personnel services',
  },
  net_assets: {
    topPlaceholder: 'Type or click to choose line item (e.g. Surplus/(Deficit), Prior period errors)...',
    rowPlaceholder: 'Enter line item (e.g. Surplus/(Deficit), Accounting Policy)...',
    batchExampleTyped: 'surplus deficit',
    batchExampleMatched: 'Surplus/(Deficit) for the Period',
  },
  budget_comparison: {
    topPlaceholder: 'Use the table form below to encode budget & actual amounts...',
    rowPlaceholder: 'Use the table form...',
    batchExampleTyped: 'tax revenue',
    batchExampleMatched: 'Tax Revenue',
  },
};

interface DataEntryFormProps {
  divisions: Division[];
  lineItems: LineItemDefinition[];
  selectedDivisionId: string;
  selectedYear: string;
  dataStore: FinancialDataStore;
  aggregationStore?: AggregationMetadataStore;
  onSaveBatchAmounts: (
    year: string,
    divisionId: string,
    entries: { lineItemId: string; amount: number }[],
    aggregationRecords?: DivisionAggregationRecord[]
  ) => void;
  onDeleteAmount: (year: string, divisionId: string, lineItemId: string) => void;
  onDeleteAllDivisionAmounts: (year: string, divisionId: string) => void;
  onNavigateToViewFS: () => void;
  onAddLineItemPrompt: (name: string, group: string) => void;
  onDeleteLineItemPrompt: (item: LineItemDefinition) => void;
  selectedStatement?: FinancialStatementType;
  onSelectStatement?: (stmt: FinancialStatementType) => void;
  stagedBatchesByKey?: Record<string, StagedEntry[]>;
  onStagedBatchesChange?: React.Dispatch<React.SetStateAction<Record<string, StagedEntry[]>>>;
  topDraftsByKey?: Record<string, TopEntryDraft>;
  onTopDraftsChange?: React.Dispatch<React.SetStateAction<Record<string, TopEntryDraft>>>;
  budgetDraftsByKey?: Record<string, BudgetComparisonDraft>;
  onBudgetDraftChange?: (draftKey: string, draft: BudgetComparisonDraft | null) => void;
}

const EMPTY_TOP_DRAFT: TopEntryDraft = {
  selectedItemId: '',
  rawText: '',
  amountInput: '',
};

export const DataEntryForm: React.FC<DataEntryFormProps> = ({
  divisions,
  lineItems,
  selectedDivisionId,
  selectedYear,
  dataStore,
  aggregationStore,
  onSaveBatchAmounts,
  onDeleteAmount,
  onDeleteAllDivisionAmounts,
  onNavigateToViewFS,
  onAddLineItemPrompt,
  onDeleteLineItemPrompt,
  selectedStatement: controlledStatement,
  onSelectStatement,
  stagedBatchesByKey: controlledStagedBatchesByKey,
  onStagedBatchesChange,
  topDraftsByKey: controlledTopDraftsByKey,
  onTopDraftsChange,
  budgetDraftsByKey,
  onBudgetDraftChange,
}) => {
  // Financial Statement selection (synced across views when controlled)
  const [internalStatement, setInternalStatement] = useState<FinancialStatementType>('position');
  const selectedStatement = controlledStatement ?? internalStatement;
  const setSelectedStatement = onSelectStatement ?? setInternalStatement;
  const batchKey = `${selectedYear}::${selectedDivisionId}::${selectedStatement}`;
  const [lockedStatementModal, setLockedStatementModal] = useState<{ title: string; message: string } | null>(null);
  
  // Default: Remove balances that are zero balance as requested!
  const [showZeroBalancesInLedger, setShowZeroBalancesInLedger] = useState(false);
  const [ledgerSearch, setLedgerSearch] = useState('');
  const [isSelectMultipleMode, setIsSelectMultipleMode] = useState(false);
  const [selectedRecordedIds, setSelectedRecordedIds] = useState<string[]>([]);
  const [deletedHistory, setDeletedHistory] = useState<
    { year: string; divisionId: string; entries: { lineItemId: string; amount: number }[] }[]
  >([]);
  const [pendingDeleteRecordedItem, setPendingDeleteRecordedItem] = useState<LineItemDefinition | null>(null);
  const [pendingDeleteSelectedRecorded, setPendingDeleteSelectedRecorded] = useState(false);
  const [expandedLedgerAggIds, setExpandedLedgerAggIds] = useState<Record<string, boolean>>({});
  const [isLedgerAggBannerExpanded, setIsLedgerAggBannerExpanded] = useState(false);
  const [isEditingJan1_2024, setIsEditingJan1_2024] = useState(false);
  const [jan1_2024Input, setJan1_2024Input] = useState('');
  const [pendingConfirmJan1_2024, setPendingConfirmJan1_2024] = useState<{
    lineItemId: 'cf-sum-beg-cash' | 'na-beg-balance';
    accountName: string;
    previousAmount: number;
    newAmount: number;
  } | null>(null);

  useEffect(() => {
    setSelectedRecordedIds([]);
    setIsSelectMultipleMode(false);
    setExpandedLedgerAggIds({});
    setIsLedgerAggBannerExpanded(false);
    setIsEditingJan1_2024(false);
    setPendingConfirmJan1_2024(null);
  }, [selectedYear, selectedDivisionId, selectedStatement]);

  // Top Quick Account Selector state (isolated per financial statement / division / year in memory)
  const [internalTopDraftsByKey, setInternalTopDraftsByKey] = useState<Record<string, TopEntryDraft>>({});
  const activeTopDraftsByKey = controlledTopDraftsByKey ?? internalTopDraftsByKey;
  const setTopDraftsMap = onTopDraftsChange ?? setInternalTopDraftsByKey;
  const currentTopDraft = activeTopDraftsByKey[batchKey] ?? EMPTY_TOP_DRAFT;
  const topSelectedItemId = currentTopDraft.selectedItemId;
  const topRawText = currentTopDraft.rawText;
  const topAmountInput = currentTopDraft.amountInput;

  const updateCurrentTopDraft = (
    updater: (prev: TopEntryDraft) => TopEntryDraft
  ) => {
    setTopDraftsMap((prevMap) => {
      const curr = prevMap[batchKey] ?? EMPTY_TOP_DRAFT;
      const next = updater(curr);
      if (!next.selectedItemId && !next.rawText && !next.amountInput) {
        if (!(batchKey in prevMap)) return prevMap;
        const copy = { ...prevMap };
        delete copy[batchKey];
        return copy;
      }
      return {
        ...prevMap,
        [batchKey]: next,
      };
    });
  };

  const setTopSelectedItemId = (value: string) =>
    updateCurrentTopDraft((prev) => ({ ...prev, selectedItemId: value }));
  const setTopRawText = (value: string) =>
    updateCurrentTopDraft((prev) => ({ ...prev, rawText: value }));
  const setTopAmountInput = (value: string) =>
    updateCurrentTopDraft((prev) => ({ ...prev, amountInput: value }));

  const [topFeedbackMsg, setTopFeedbackMsg] = useState<string | null>(null);
  const topLineItemInputRef = useRef<HTMLInputElement>(null);
  const topAmountInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadFeedback, setUploadFeedback] = useState<{ message: string; isError?: boolean } | null>(null);
  const [positionImportModal, setPositionImportModal] = useState<{
    isOpen: boolean;
    workbook: XLSX.WorkBook | null;
    fileName: string;
  }>({
    isOpen: false,
    workbook: null,
    fileName: '',
  });

  useEffect(() => {
    setTopFeedbackMsg(null);
  }, [batchKey]);

  const activeEncodingMeta = STATEMENT_ENCODING_META[selectedStatement];

  // Keyboard navigation refs for batch table rows
  const lineItemInputRefs = useRef<{ [rowId: string]: HTMLInputElement | null }>({});
  const amountInputRefs = useRef<{ [rowId: string]: HTMLInputElement | null }>({});
  const [rowToFocusAfterRender, setRowToFocusAfterRender] = useState<string | null>(null);

  // Erroneous Line Items Modal state (opened when user tries to Save All while red items exist)
  const [erroneousModalState, setErroneousModalState] = useState<{
    isOpen: boolean;
    invalidCount: number;
    validCount: number;
    invalidRows: StagedEntry[];
    validEntriesToSave: {
      lineItemId: string;
      amount: number;
      rowId: string;
      aggregationRecord?: DivisionAggregationRecord;
    }[];
  }>({
    isOpen: false,
    invalidCount: 0,
    validCount: 0,
    invalidRows: [],
    validEntriesToSave: [],
  });

  const activeStatementLineItems = useMemo(() => {
    return lineItems.filter((item) => (item.statementType || 'position') === selectedStatement);
  }, [lineItems, selectedStatement]);

  const NON_ENCODABLE_CASH_FLOW_IDS = useMemo(
    () =>
      selectedYear === '2024'
        ? new Set(['cf-sum-end-cash', 'cf-sum-net-inc-dec'])
        : new Set(['cf-sum-beg-cash', 'cf-sum-end-cash', 'cf-sum-net-inc-dec']),
    [selectedYear]
  );

  const NON_ENCODABLE_NET_ASSETS_IDS = useMemo(
    () =>
      selectedYear === '2024'
        ? new Set(['na-restated-balance', 'na-end-balance'])
        : new Set(['na-beg-balance', 'na-restated-balance', 'na-end-balance']),
    [selectedYear]
  );

  const NON_ENCODABLE_SUMMARY_IDS = useMemo(
    () => new Set([...NON_ENCODABLE_CASH_FLOW_IDS, ...NON_ENCODABLE_NET_ASSETS_IDS]),
    [NON_ENCODABLE_CASH_FLOW_IDS, NON_ENCODABLE_NET_ASSETS_IDS]
  );

  const encodableStatementLineItems = useMemo(() => {
    return activeStatementLineItems.filter((item) => !NON_ENCODABLE_SUMMARY_IDS.has(item.id));
  }, [activeStatementLineItems, NON_ENCODABLE_SUMMARY_IDS]);

  // Excel upload may inspect comparative FY 2024 columns even while active workspace year is FY 2025+,
  // so keep cf-sum-beg-cash and na-beg-balance available for Excel mapping & matching.
  const excelImportEncodableItems = useMemo(() => {
    if (selectedStatement === 'cash_flows') {
      return activeStatementLineItems.filter(
        (item) => item.id !== 'cf-sum-end-cash' && item.id !== 'cf-sum-net-inc-dec'
      );
    }
    if (selectedStatement === 'net_assets') {
      return activeStatementLineItems.filter(
        (item) => item.id !== 'na-restated-balance' && item.id !== 'na-end-balance'
      );
    }
    return encodableStatementLineItems;
  }, [selectedStatement, activeStatementLineItems, encodableStatementLineItems]);

  const sameNameVariantsByNormName = useMemo(() => {
    const byName = new Map<string, LineItemDefinition[]>();
    encodableStatementLineItems.forEach((item) => {
      const key = normalizeAlphanumeric(item.name);
      if (!key) return;
      const list = byName.get(key) || [];
      list.push(item);
      byName.set(key, list);
    });
    const multi = new Map<string, LineItemDefinition[]>();
    byName.forEach((list, key) => {
      if (list.length > 1) {
        const sorted = [...list].sort((a, b) => {
          const aNonOp = a.section === 'NON_OPERATING' ? 0 : 1;
          const bNonOp = b.section === 'NON_OPERATING' ? 0 : 1;
          if (aNonOp !== bNonOp) return aNonOp - bNonOp;
          return a.order - b.order;
        });
        multi.set(key, sorted);
      }
    });
    return multi;
  }, [encodableStatementLineItems]);

  const formatItemPlacementPath = (item: LineItemDefinition): string => {
    const parts = [item.subsection, item.group, item.subgroup]
      .filter((part): part is string => Boolean(part))
      .filter((part, idx, arr) => idx === 0 || part.toLowerCase() !== arr[idx - 1]?.toLowerCase());
    return parts.join(' → ');
  };

  const getRowSameNameVariants = (row: StagedEntry): LineItemDefinition[] => {
    const rowDef = row.lineItemId
      ? encodableStatementLineItems.find((i) => i.id === row.lineItemId)
      : undefined;
    const key = normalizeAlphanumeric(rowDef?.name || row.rawText || '');
    return key ? sameNameVariantsByNormName.get(key) || [] : [];
  };

  const isRowAmbiguous = (row: StagedEntry): boolean => {
    if (row.lineItemId && encodableStatementLineItems.some((i) => i.id === row.lineItemId)) {
      return false;
    }
    return getRowSameNameVariants(row).length > 1;
  };

  // Determines whether a staged entry's line item is invalid / not in the official line items database for the active statement
  const isRowLineItemInvalid = (row: StagedEntry): boolean => {
    const hasText = Boolean(row.rawText && row.rawText.trim());
    const hasItem = Boolean(row.lineItemId);
    const hasAmount = Boolean(row.amount && row.amount.trim() && parseNumberInput(row.amount) !== 0);

    // If row has an explicit lineItemId, verify it really exists in encodableStatementLineItems
    if (hasItem) {
      const exists = encodableStatementLineItems.some((item) => item.id === row.lineItemId);
      return !exists;
    }

    // If user wrote text matching multiple official placements (e.g. Miscellaneous Income), it is valid in DB but needs placement selection
    if (hasText && isRowAmbiguous(row)) {
      return false;
    }

    // If user wrote text or entered an amount, but no recognized lineItemId was matched:
    if (hasText || hasAmount) {
      if (hasText) {
        const matches = encodableStatementLineItems.filter(
          (item) => item.name.toLowerCase().trim() === row.rawText!.toLowerCase().trim()
        );
        if (matches.length === 1) return false;
      }
      return true; // Not in the database of line items for active statement!
    }

    // Completely blank row (not yet edited)
    return false;
  };

  const topSameNameVariants = useMemo(() => {
    const selectedDef = topSelectedItemId
      ? encodableStatementLineItems.find((i) => i.id === topSelectedItemId)
      : undefined;
    const key = normalizeAlphanumeric(selectedDef?.name || topRawText || '');
    return key ? sameNameVariantsByNormName.get(key) || [] : [];
  }, [encodableStatementLineItems, topSelectedItemId, topRawText, sameNameVariantsByNormName]);

  const isTopAmbiguous = Boolean(
    topSameNameVariants.length > 1 &&
      (!topSelectedItemId || !encodableStatementLineItems.some((i) => i.id === topSelectedItemId))
  );

  // Top account invalid check
  const isTopInvalid = Boolean(
    (topRawText.trim() || (topAmountInput.trim() && parseNumberInput(topAmountInput) !== 0)) &&
      !isTopAmbiguous &&
      !encodableStatementLineItems.some(
        (i) =>
          i.id === topSelectedItemId ||
          (topRawText.trim() &&
            i.name.toLowerCase().trim() === topRawText.toLowerCase().trim() &&
            encodableStatementLineItems.filter(
              (m) => m.name.toLowerCase().trim() === topRawText.toLowerCase().trim()
            ).length === 1)
      )
  );

  // Staged rows for batch multiple entries (isolated per statement/division/year in memory)
  const [internalStagedBatchesByKey, setInternalStagedBatchesByKey] = useState<
    Record<string, StagedEntry[]>
  >({});
  const activeStagedBatchesByKey = controlledStagedBatchesByKey ?? internalStagedBatchesByKey;
  const setStagedBatchesMap = onStagedBatchesChange ?? setInternalStagedBatchesByKey;
  const stagedEntries = activeStagedBatchesByKey[batchKey] ?? [];
  const setStagedEntries = (updater: React.SetStateAction<StagedEntry[]>) => {
    setStagedBatchesMap((prevMap) => {
      const currRows = prevMap[batchKey] ?? [];
      const nextRows = typeof updater === 'function' ? updater(currRows) : updater;
      if (nextRows.length === 0) {
        if (!(batchKey in prevMap)) return prevMap;
        const copy = { ...prevMap };
        delete copy[batchKey];
        return copy;
      }
      return {
        ...prevMap,
        [batchKey]: nextRows,
      };
    });
  };

  // Track which row dropdown is currently open to elevate its stacking context
  const [activeDropdownRowId, setActiveDropdownRowId] = useState<string | null>(null);

  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);

  // Confirmation for discarding staged entries
  const [isDiscardConfirmOpen, setIsDiscardConfirmOpen] = useState(false);

  // Confirmation for Delete All Records function (Reset all to zero)
  const [isDeleteAllConfirmOpen, setIsDeleteAllConfirmOpen] = useState(false);

  useEffect(() => {
    setActiveDropdownRowId(null);
    setSaveSuccessMsg(null);
    setIsDiscardConfirmOpen(false);
  }, [batchKey]);

  // Automatically focus newly added row after render
  useEffect(() => {
    if (rowToFocusAfterRender) {
      const el = lineItemInputRefs.current[rowToFocusAfterRender];
      if (el) {
        el.focus();
        el.select();
      }
      setRowToFocusAfterRender(null);
    }
  }, [rowToFocusAfterRender, stagedEntries]);

  const currentDivision = divisions.find((d) => d.id === selectedDivisionId) || divisions[0];
  const comparativeYear = getComparativeYear(selectedYear);

  // Compute live Statement of Cash Flows summary and reconciliation balances
  const cashFlowsSummary = useMemo(() => {
    return calculateCashFlowsSummary(lineItems, dataStore, selectedYear, selectedDivisionId);
  }, [lineItems, dataStore, selectedYear, selectedDivisionId]);

  // Compute live Statement of Changes in Net Assets/Equity summary and reconciliation balances
  const netAssetsSummary = useMemo(() => {
    return calculateNetAssetsSummary(dataStore, selectedYear, selectedDivisionId);
  }, [dataStore, selectedYear, selectedDivisionId]);

  // Stored records in database for this division & year with Cash Flows & Net Assets reconciliation rules applied
  const currentDbEntries = useMemo(() => {
    const raw = (dataStore[selectedYear] && dataStore[selectedYear][selectedDivisionId]) || {};
    if (selectedStatement === 'cash_flows') {
      const merged = { ...raw };

      // Rule 1: Cash and Cash Equivalents, January 1 should equal the balance of Cash and Cash Equivalents,
      // December 31 of the previous period by default
      if (merged['cf-sum-beg-cash'] === undefined && cashFlowsSummary.january1Cash !== 0) {
        merged['cf-sum-beg-cash'] = cashFlowsSummary.january1Cash;
      }

      // Net Increase (Decrease) in Cash and Cash Equivalents
      if (merged['cf-sum-net-inc-dec'] === undefined && cashFlowsSummary.netIncreaseDecrease !== 0) {
        merged['cf-sum-net-inc-dec'] = cashFlowsSummary.netIncreaseDecrease;
      }

      // Rule 2: Cash and Cash Equivalents, December 31 of the current year should equal Increase(Decrease)
      // in Cash and Cash Equivalents + FX Effects added to (subtracted from) Cash and Cash Equivalents, January 1
      const effectiveJan1 = merged['cf-sum-beg-cash'] !== undefined ? merged['cf-sum-beg-cash'] : cashFlowsSummary.january1Cash;
      const effectiveNet = merged['cf-sum-net-inc-dec'] !== undefined ? merged['cf-sum-net-inc-dec'] : cashFlowsSummary.netIncreaseDecrease;
      const effectiveFx = merged['cf-sum-fx-effects'] || 0;
      merged['cf-sum-end-cash'] = effectiveJan1 + effectiveNet + effectiveFx;

      return merged;
    }
    if (selectedStatement === 'net_assets') {
      const merged = { ...raw };
      if (selectedYear !== '2024' || merged['na-beg-balance'] === undefined) {
        merged['na-beg-balance'] = netAssetsSummary.january1Balance;
      }
      merged['na-restated-balance'] = netAssetsSummary.restatedBalance;
      merged['na-end-balance'] = netAssetsSummary.december31Balance;
      return merged;
    }
    return raw;
  }, [dataStore, selectedYear, selectedDivisionId, selectedStatement, cashFlowsSummary, netAssetsSummary]);

  const divisionAggMap = useMemo(() => {
    return aggregationStore?.[selectedYear]?.[selectedDivisionId] || {};
  }, [aggregationStore, selectedYear, selectedDivisionId]);

  const ledgerAggRecords = useMemo(() => {
    return activeStatementLineItems
      .map((item) => {
        const rec = divisionAggMap[item.id];
        const savedAmt = currentDbEntries[item.id] || 0;
        if (!rec || Math.abs(savedAmt) < 0.005) return null;
        return { item, rec };
      })
      .filter((entry): entry is { item: LineItemDefinition; rec: DivisionAggregationRecord } => entry !== null);
  }, [activeStatementLineItems, divisionAggMap, currentDbEntries]);

  const handleStartEditJan1_2024 = () => {
    const targetItemId = selectedStatement === 'net_assets' ? 'na-beg-balance' : 'cf-sum-beg-cash';
    const fallbackVal =
      selectedStatement === 'net_assets'
        ? netAssetsSummary.january1Balance
        : cashFlowsSummary.january1Cash;
    const currentVal =
      currentDbEntries[targetItemId] !== undefined
        ? currentDbEntries[targetItemId]
        : fallbackVal;
    setJan1_2024Input(currentVal ? formatAccounting(currentVal) : '');
    setIsEditingJan1_2024(true);
  };

  const handleSaveJan1_2024 = () => {
    const parsedVal = parseNumberInput(jan1_2024Input);
    const targetItemId: 'cf-sum-beg-cash' | 'na-beg-balance' =
      selectedStatement === 'net_assets' ? 'na-beg-balance' : 'cf-sum-beg-cash';
    const accountName =
      selectedStatement === 'net_assets'
        ? 'Balance at January 1 (Statement of Changes in Net Assets/Equity)'
        : 'Cash and Cash Equivalents, January 1 (Statement of Cash Flows)';
    const fallbackVal =
      selectedStatement === 'net_assets'
        ? netAssetsSummary.january1Balance
        : cashFlowsSummary.january1Cash;
    const previousAmount =
      currentDbEntries[targetItemId] !== undefined ? currentDbEntries[targetItemId] : fallbackVal;

    setPendingConfirmJan1_2024({
      lineItemId: targetItemId,
      accountName,
      previousAmount,
      newAmount: parsedVal,
    });
  };

  // Master accounts list in database: Zero balance items removed by default, automatically added as amounts are encoded
  const ledgerAccountsList = useMemo(() => {
    return activeStatementLineItems.filter((item) => {
      const q = ledgerSearch.toLowerCase().trim();
      const matchesSearch =
        !q ||
        item.name.toLowerCase().includes(q) ||
        item.group.toLowerCase().includes(q) ||
        (item.subgroup && item.subgroup.toLowerCase().includes(q));

      const hasAmount = currentDbEntries[item.id] !== undefined && currentDbEntries[item.id] !== 0;
      if (item.id === AGGREGATED_ACCUMULATED_DEPRECIATION_ID && !hasAmount) {
        return false;
      }
      const isEditable2024Jan1 =
        selectedYear === '2024' &&
        ((selectedStatement === 'cash_flows' && item.id === 'cf-sum-beg-cash') ||
          (selectedStatement === 'net_assets' && item.id === 'na-beg-balance'));
      // Default: remove zero balance items, only show active amounts (keep 2024 Jan 1 visible for adjustment)
      const matchesZeroFilter = showZeroBalancesInLedger ? true : hasAmount || isEditable2024Jan1;

      return matchesSearch && matchesZeroFilter;
    });
  }, [activeStatementLineItems, currentDbEntries, ledgerSearch, showZeroBalancesInLedger, selectedStatement, selectedYear]);

  // Row update handlers
  const handleUpdateStagedRow = (
    id: string,
    field: 'lineItemId' | 'rawText' | 'amount',
    value: string
  ) => {
    setStagedEntries((prev) =>
      prev.map((row) => {
        if (row.id !== id) return row;
        return { ...row, [field]: value };
      })
    );
  };

  const handleAddStagedRow = () => {
    setStagedEntries((prev) => [
      ...prev,
      { id: `stage-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`, lineItemId: '', rawText: '', amount: '' },
    ]);
  };

  const handleAdd5StagedRows = () => {
    const newRows: StagedEntry[] = Array.from({ length: 5 }, (_, i) => ({
      id: `stage-${Date.now()}-${i}-${Math.random().toString(36).substr(2, 4)}`,
      lineItemId: '',
      rawText: '',
      amount: '',
    }));
    setStagedEntries((prev) => [...prev, ...newRows]);
  };

  const handleRemoveStagedRow = (id: string) => {
    setStagedEntries((prev) => prev.filter((row) => row.id !== id));
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      const firstSheetName = workbook.SheetNames[0];
      if (!firstSheetName) {
        setUploadFeedback({ message: 'The uploaded file has no sheets.', isError: true });
        return;
      }

      // Open the smart Year-Header & Misspelling-Tolerant Review Importer for all financial statements
      setPositionImportModal({
        isOpen: true,
        workbook,
        fileName: file.name,
      });
    } catch (err) {
      console.error('Failed to parse uploaded file:', err);
      setUploadFeedback({ message: 'Failed to read file. Please upload a valid .xlsx, .xls, or .csv file.', isError: true });
      setTimeout(() => setUploadFeedback(null), 7000);
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // Top Quick Account Selector action: Add or update directly in the batch staging list
  const handleAddTopItemToBatch = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!topSelectedItemId && !topRawText.trim()) return;

    // Resolve by explicit ID first so duplicate-named accounts (e.g. Miscellaneous Income) keep their chosen section
    const resolvedById = topSelectedItemId
      ? encodableStatementLineItems.find((i) => i.id === topSelectedItemId)
      : undefined;
    const exactNameMatches =
      !resolvedById && topRawText.trim()
        ? encodableStatementLineItems.filter(
            (i) => i.name.toLowerCase().trim() === topRawText.toLowerCase().trim()
          )
        : [];
    if (!resolvedById && topSameNameVariants.length > 1) {
      setTopFeedbackMsg(
        `Multiple official placements exist for "${topSameNameVariants[0].name}" — please select Option 1 or Option 2 below before adding.`
      );
      return;
    }
    const resolvedItem =
      resolvedById || (exactNameMatches.length === 1 ? exactNameMatches[0] : undefined);

    const targetItemId = resolvedItem ? resolvedItem.id : '';
    const targetItemName = resolvedItem ? resolvedItem.name : topRawText.trim();

    // Check if account already exists in staged rows
    const existingIndex = targetItemId
      ? stagedEntries.findIndex((r) => r.lineItemId === targetItemId)
      : -1;

    if (existingIndex >= 0) {
      setStagedEntries((prev) =>
        prev.map((r, idx) =>
          idx === existingIndex
            ? { ...r, amount: topAmountInput.trim() || r.amount, rawText: targetItemName }
            : r
        )
      );
      setTopFeedbackMsg(`Updated "${targetItemName}" in batch rows.`);
    } else {
      const firstBlankIndex = stagedEntries.findIndex(
        (r) => !r.lineItemId && !r.rawText && !r.amount
      );
      if (firstBlankIndex >= 0) {
        setStagedEntries((prev) =>
          prev.map((r, idx) =>
            idx === firstBlankIndex
              ? {
                  ...r,
                  lineItemId: targetItemId,
                  rawText: targetItemName,
                  amount: topAmountInput.trim(),
                }
              : r
          )
        );
      } else {
        setStagedEntries((prev) => [
          ...prev,
          {
            id: `stage-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
            lineItemId: targetItemId,
            rawText: targetItemName,
            amount: topAmountInput.trim(),
          },
        ]);
      }
      setTopFeedbackMsg(`Added "${targetItemName}" to batch rows below.`);
    }

    setTimeout(() => setTopFeedbackMsg(null), 3000);
    updateCurrentTopDraft(() => EMPTY_TOP_DRAFT);
    setTimeout(() => {
      topLineItemInputRef.current?.focus();
    }, 40);
  };

  // Save all valid staged rows to database
  // If there are invalid/unrecognized line items, disallow direct saving and prompt user with option to save all except invalid items!
  const handleSaveAllStagedToDatabase = (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    const activeRows = stagedEntries.filter((r) => {
      const hasText = Boolean(r.rawText && r.rawText.trim());
      const hasItem = Boolean(r.lineItemId);
      const hasAmount = Boolean(r.amount && r.amount.trim());
      return hasText || hasItem || hasAmount;
    });

    if (activeRows.length === 0) return;

    // Check which rows are invalid (not in database) or ambiguous (needs section placement choice)
    const invalidRows = activeRows.filter((r) => isRowLineItemInvalid(r) || isRowAmbiguous(r));

    // Extract valid rows with amounts
    const validEntriesToSave: {
      lineItemId: string;
      amount: number;
      rowId: string;
      aggregationRecord?: DivisionAggregationRecord;
    }[] = [];
    activeRows.forEach((row) => {
      if (!isRowLineItemInvalid(row) && !isRowAmbiguous(row)) {
        let resolvedId = row.lineItemId;
        if (!resolvedId && row.rawText) {
          const matches = encodableStatementLineItems.filter(
            (i) => i.name.toLowerCase().trim() === row.rawText!.toLowerCase().trim()
          );
          if (matches.length === 1) resolvedId = matches[0].id;
        }
        if (resolvedId && row.amount && row.amount.trim() !== '') {
          const parsedAmt = parseNumberInput(row.amount);
          const resolvedDef = encodableStatementLineItems.find((i) => i.id === resolvedId);
          const validAggRecord =
            row.aggregationRecord && Math.abs(parsedAmt - row.aggregationRecord.totalAmount) < 0.01
              ? {
                  ...row.aggregationRecord,
                  lineItemId: resolvedId,
                  lineItemName: resolvedDef?.name || row.aggregationRecord.lineItemName,
                }
              : undefined;
          validEntriesToSave.push({
            lineItemId: resolvedId,
            amount: parsedAmt,
            rowId: row.id,
            aggregationRecord: validAggRecord,
          });
        }
      }
    });

    // If there is ANY line item that is not in the database, do not allow direct saving!
    // Prompt the user with the option to save all except the erroneous line items:
    if (invalidRows.length > 0) {
      setErroneousModalState({
        isOpen: true,
        invalidCount: invalidRows.length,
        validCount: validEntriesToSave.length,
        invalidRows,
        validEntriesToSave,
      });
      return;
    }

    if (validEntriesToSave.length === 0) {
      setTopFeedbackMsg('Please enter an amount for at least one valid line item before saving.');
      return;
    }

    const aggRecordsToSave = validEntriesToSave
      .map((e) => e.aggregationRecord)
      .filter((rec): rec is DivisionAggregationRecord => Boolean(rec));

    // Direct save when all active rows are valid:
    onSaveBatchAmounts(
      selectedYear,
      selectedDivisionId,
      validEntriesToSave.map(({ lineItemId, amount }) => ({ lineItemId, amount })),
      aggRecordsToSave.length > 0 ? aggRecordsToSave : undefined
    );

    setSaveSuccessMsg(`Saved ${validEntriesToSave.length} entries for ${currentDivision?.name} (FY ${selectedYear}).`);
    setTimeout(() => setSaveSuccessMsg(null), 4000);

    // Reset staged rows after saving
    setStagedEntries([]);
  };

  // Option Handler: Save all except the line items that are highlighted red / erroneous
  const handleSaveValidExceptErroneous = () => {
    const { validEntriesToSave, invalidRows } = erroneousModalState;

    if (validEntriesToSave.length > 0) {
      const aggRecordsToSave = validEntriesToSave
        .map((e) => e.aggregationRecord)
        .filter((rec): rec is DivisionAggregationRecord => Boolean(rec));

      onSaveBatchAmounts(
        selectedYear,
        selectedDivisionId,
        validEntriesToSave.map(({ lineItemId, amount }) => ({ lineItemId, amount })),
        aggRecordsToSave.length > 0 ? aggRecordsToSave : undefined
      );
      setSaveSuccessMsg(
        `Saved ${validEntriesToSave.length} valid entries to database! ${invalidRows.length} unrecognized item(s) retained in table for correction.`
      );
      setTimeout(() => setSaveSuccessMsg(null), 5000);
    }

    // Retain only the invalid rows in the staged table so the user can see them and fix them
    const retained = invalidRows.map((r) => ({ ...r }));
    setStagedEntries(retained);

    setErroneousModalState({
      isOpen: false,
      invalidCount: 0,
      validCount: 0,
      invalidRows: [],
      validEntriesToSave: [],
    });
  };

  const handleCancelErroneousModal = () => {
    setErroneousModalState({
      isOpen: false,
      invalidCount: 0,
      validCount: 0,
      invalidRows: [],
      validEntriesToSave: [],
    });
  };

  const validStagedCount = useMemo(() => {
    return stagedEntries.filter((r) => !isRowLineItemInvalid(r) && r.lineItemId && r.amount.trim() !== '').length;
  }, [stagedEntries, encodableStatementLineItems]);

  const invalidStagedCount = useMemo(() => {
    return stagedEntries.filter((r) => isRowLineItemInvalid(r)).length;
  }, [stagedEntries, encodableStatementLineItems]);

  const stagedBatchTotal = useMemo(() => {
    return stagedEntries.reduce((sum, row) => {
      if (row.amount && row.amount.trim()) {
        const num = parseNumberInput(row.amount);
        if (!isNaN(num)) return sum + num;
      }
      return sum;
    }, 0);
  }, [stagedEntries]);

  const topSelectedItemDetail = useMemo(() => {
    return encodableStatementLineItems.find((i) => i.id === topSelectedItemId);
  }, [encodableStatementLineItems, topSelectedItemId]);

  // [live_edit] Side-by-side / floating Live FS preview state & virtual store overlay
  const [isLiveEditOpen, setIsLiveEditOpen] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('deped_ro6_live_edit_enabled_v1');
      return saved === null ? true : saved === 'true';
    } catch {
      return true;
    }
  });

  const [liveEditWindowMode, setLiveEditWindowMode] = useState<LiveEditWindowMode>(() => {
    try {
      const saved = localStorage.getItem('deped_ro6_live_edit_window_mode_v1');
      return saved === 'floating' ? 'floating' : 'docked';
    } catch {
      return 'docked';
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('deped_ro6_live_edit_enabled_v1', String(isLiveEditOpen));
    } catch {
      // ignore storage errors
    }
  }, [isLiveEditOpen]);

  useEffect(() => {
    try {
      localStorage.setItem('deped_ro6_live_edit_window_mode_v1', liveEditWindowMode);
    } catch {
      // ignore storage errors
    }
  }, [liveEditWindowMode]);

  const liveEditOverlay = useMemo(
    () =>
      buildLiveEditOverlay(
        dataStore,
        selectedYear,
        selectedDivisionId,
        encodableStatementLineItems,
        stagedEntries,
        {
          itemId: topSelectedItemId,
          rawText: topRawText,
          amount: topAmountInput,
        }
      ),
    [
      dataStore,
      selectedYear,
      selectedDivisionId,
      encodableStatementLineItems,
      stagedEntries,
      topSelectedItemId,
      topRawText,
      topAmountInput,
    ]
  );

  const handleClearEmptyStagedRows = () => {
    setStagedEntries((prev) => prev.filter((r) => (r.lineItemId || r.rawText?.trim()) && r.amount?.trim()));
  };

  return (
    <div className="w-full max-w-[1780px] mx-auto px-2 sm:px-4 py-2">
      <div className="flex flex-col lg:flex-row gap-6 items-start">
        <FinancialStatementSidebar
          selectedStatement={selectedStatement}
          onSelectStatement={setSelectedStatement}
          onLockedClick={(title, message) => setLockedStatementModal({ title, message })}
        />
        <div className="flex-1 min-w-0 w-full space-y-6">
      {selectedStatement === 'budget_comparison' ? (
        <BudgetComparisonEntryTable
          key={`${selectedYear}::${selectedDivisionId}`}
          divisionId={selectedDivisionId}
          divisionName={currentDivision?.name || ''}
          selectedYear={selectedYear}
          dataStore={dataStore}
          onSaveBatchAmounts={(yr, divId, entries) => onSaveBatchAmounts(yr, divId, entries)}
          onDeleteAmount={onDeleteAmount}
          onNavigateToViewFS={onNavigateToViewFS}
          savedDraft={budgetDraftsByKey?.[`${selectedYear}::${selectedDivisionId}`]}
          onDraftStateChange={onBudgetDraftChange}
        />
      ) : (
      /* [live_edit] Side-by-side wrapper around Data Entry column + LiveEditStatementPanel */
      <div className="flex flex-col xl:flex-row gap-5 items-start">
      <div className="@container flex-1 min-w-0 w-full space-y-6">
      {/* Batch Multiple Entries Form */}
      <div className="bg-th-surface border-2 border-th-border rounded-2xl p-4 sm:p-6 shadow-xs transition-colors">
        {/* Header with Title and Presets */}
        <div className="flex flex-col @3xl:flex-row @3xl:items-center justify-between pb-4 border-b border-th-border gap-4 mb-5">
          <div className="min-w-0 flex-1">
            <h3 className="text-lg sm:text-xl font-bold text-th-text flex items-center gap-2.5 flex-wrap">
              <Layers className="w-5 h-5 text-th-muted shrink-0" />
              <span>Batch Data Entry</span>
              {validStagedCount > 0 && (
                <span className="text-xs font-bold text-th-text bg-th-subtle px-2.5 py-0.5 rounded-lg border border-th-border-strong whitespace-nowrap">
                  {validStagedCount} ready to save
                </span>
              )}
              <TipsButton>
                <p>
                  Select or type any line item from the official list. Missing hyphens and spaces are automatically matched (for example, typing{' '}
                  <strong className="text-th-text font-bold">
                    &quot;{activeEncodingMeta.batchExampleTyped}&quot;
                  </strong>{' '}
                  suggests{' '}
                  <strong className="text-th-text font-bold">
                    &quot;{activeEncodingMeta.batchExampleMatched}&quot;
                  </strong>
                  ).
                </p>
                <p className="pt-2 border-t border-th-border">
                  Select or type the official line item, enter the monetary balance, then click{' '}
                  <strong className="text-th-text font-bold">&quot;Add to Batch&quot;</strong>{' '}
                  or press <strong className="text-th-text font-bold">Enter</strong>.
                </p>
                <div className="pt-2 border-t border-th-border space-y-1">
                  <div className="font-bold text-th-text">Fast Entry Keyboard Shortcuts:</div>
                  <ul className="list-disc pl-4 space-y-0.5">
                    <li>Use ↑ and ↓ arrow keys to highlight an option</li>
                    <li>Press Tab or Enter to select &amp; enter amount</li>
                    <li>Enter on amount advances to next line</li>
                    <li>
                      <strong className="text-th-text font-bold">Shift + Enter</strong> to Save All
                    </li>
                  </ul>
                </div>
              </TipsButton>
            </h3>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleFileUpload}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="min-h-[40px] text-sm font-bold text-th-excel-fg bg-th-excel hover:bg-th-excel-hover px-3.5 py-2 rounded-xl border-2 border-th-excel-border transition-colors inline-flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer shadow-xs"
              title="Upload any financial statement Excel (.xlsx, .xls) file with Year headers (e.g. 2025, 2024) and line items before amounts"
            >
              <Upload className="w-4 h-4 shrink-0" />
              <span>Upload Excel</span>
            </button>
            <button
              type="button"
              onClick={handleAddStagedRow}
              className="min-h-[40px] text-sm font-bold text-th-text bg-th-subtle hover:bg-th-subtle-hover border-2 border-th-border-strong px-3.5 py-2 rounded-xl transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Plus className="w-4 h-4 text-th-muted shrink-0" />
              <span>Add 1 Row</span>
            </button>
            <button
              type="button"
              onClick={handleAdd5StagedRows}
              className="min-h-[40px] text-sm font-bold text-th-text bg-th-subtle hover:bg-th-subtle-hover border-2 border-th-border-strong px-3.5 py-2 rounded-xl transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Plus className="w-4 h-4 text-th-muted shrink-0" />
              <span>Add 5 Rows</span>
            </button>
            {/* [live_edit] Toggle button for Live Financial Statement side preview */}
            <button
              type="button"
              onClick={() => setIsLiveEditOpen((prev) => !prev)}
              className={`min-h-[40px] text-sm font-bold px-3.5 py-2 rounded-xl border-2 transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer ${
                isLiveEditOpen
                  ? 'bg-th-accent text-th-accent-fg border-th-accent'
                  : 'bg-th-subtle text-th-text border-th-border-strong hover:bg-th-subtle-hover'
              }`}
              title="Toggle Live Financial Statement side preview"
            >
              <PanelRight className="w-4 h-4 shrink-0" />
              <span>Live FS</span>
            </button>
          </div>
        </div>

        {uploadFeedback && (
          <div
            className={`mb-4 px-4 py-2.5 rounded-lg text-sm font-medium flex items-center gap-2 border ${
              uploadFeedback.isError
                ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-200 border-rose-200 dark:border-rose-800'
                : 'bg-th-subtle text-th-text border-th-border-strong'
            }`}
          >
            {uploadFeedback.isError ? (
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 dark:text-rose-400" />
            ) : (
              <CheckCircle2 className="w-4 h-4 shrink-0 text-th-text" />
            )}
            <span>{uploadFeedback.message}</span>
          </div>
        )}

        {/* PRIMARY DATA ENTRY & ENCODING STATION */}
        <div className="mb-7 p-4 sm:p-6 bg-th-subtle border-2 border-th-border-strong rounded-2xl shadow-sm transition-all">
          <div className="flex flex-col @lg:flex-row @lg:items-center justify-between gap-2.5 mb-4 pb-3 border-b border-th-border">
            <div className="flex items-center gap-2.5 min-w-0">
              <PenTool className="w-5 h-5 text-th-muted shrink-0" />
              <h3 className="text-lg sm:text-xl font-extrabold text-th-text">
                Enter Line Item &amp; Balance Here
              </h3>
            </div>
            <div className="flex items-center gap-2 text-sm font-bold text-th-text shrink-0">
              <Calendar className="w-4 h-4 text-th-muted shrink-0" />
              <span className="whitespace-nowrap">Operating Year: FY {selectedYear}</span>
            </div>
          </div>

          <form onSubmit={handleAddTopItemToBatch} className="space-y-3">
            <div className="flex flex-col @xl:flex-row @xl:items-end gap-3">
              {/* Step 1: Searchable Combobox */}
              <div className="flex-1 min-w-0">
                <label className="block text-sm font-bold text-th-text mb-1.5 flex items-center gap-2 whitespace-nowrap">
                  <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-th-primary text-th-primary-fg text-xs font-bold shrink-0">1</span>
                  <span>Line Item Account</span>
                </label>
                <SearchableLineItemSelect
                  inputRef={topLineItemInputRef}
                  lineItems={encodableStatementLineItems}
                  selectedItemId={topSelectedItemId}
                  rawText={topRawText}
                  onChangeRawText={setTopRawText}
                  isInvalid={isTopInvalid}
                  onSelectItem={(itemId, itemName) => {
                    setTopSelectedItemId(itemId);
                    if (itemName) setTopRawText(itemName);
                  }}
                  onSelectAndNext={() => {
                    topAmountInputRef.current?.focus();
                    topAmountInputRef.current?.select();
                  }}
                  placement="bottom"
                  placeholder={activeEncodingMeta.topPlaceholder}
                />
              </div>

              {/* Step 2: Amount Input */}
              <div className="w-full @xl:w-44 @2xl:w-52 shrink-0">
                <label className="block text-sm font-bold text-th-text mb-1.5 flex items-center gap-2 whitespace-nowrap">
                  <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-th-primary text-th-primary-fg text-xs font-bold shrink-0">2</span>
                  <span>Amount (₱)</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-th-muted font-mono text-base sm:text-lg font-bold">
                    ₱
                  </span>
                  <input
                    ref={topAmountInputRef}
                    type="text"
                    value={topAmountInput}
                    onChange={(e) => setTopAmountInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && e.shiftKey) {
                        e.preventDefault();
                        handleSaveAllStagedToDatabase(e);
                        return;
                      }
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddTopItemToBatch();
                      }
                    }}
                    placeholder="0.00"
                    className="w-full h-[52px] pl-9 pr-4 py-2.5 text-base sm:text-lg font-mono font-bold tabular-nums text-right bg-th-input border-2 border-th-border-strong rounded-xl text-th-text focus:outline-hidden focus:border-th-accent focus:ring-4 focus:ring-th-accent/20 shadow-xs"
                  />
                </div>
              </div>

              {/* Step 3: Add to Batch Button */}
              <div className="w-full @xl:w-auto shrink-0">
                <button
                  type="submit"
                  disabled={!topSelectedItemId && !topRawText.trim()}
                  className="w-full @xl:w-auto h-[52px] py-2.5 px-5 text-sm sm:text-base font-bold text-th-accent-fg bg-th-accent hover:bg-th-accent-hover active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed rounded-xl shadow-md transition-all flex items-center justify-center gap-2 border-2 border-th-accent whitespace-nowrap cursor-pointer"
                >
                  <Plus className="w-5 h-5 stroke-[2.5] shrink-0" />
                  <span>Add to Batch</span>
                </button>
              </div>
            </div>

            {topSameNameVariants.length > 1 ? (
              <div className="p-3 rounded-xl bg-th-surface border-2 border-th-border-strong space-y-2 animate-in fade-in shadow-2xs">
                <div className="text-xs sm:text-sm font-bold text-th-text flex items-center justify-between gap-2">
                  <span>
                    Choose which &quot;{topSameNameVariants[0].name}&quot; line item to add to:
                  </span>
                  {!topSelectedItemDetail && (
                    <span className="text-xs font-bold text-amber-700 dark:text-amber-300">
                      Select 1 option
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-1 gap-1.5">
                  {topSameNameVariants.map((variant, vIdx) => {
                    const isChosen = topSelectedItemId === variant.id;
                    return (
                      <button
                        key={variant.id}
                        type="button"
                        onClick={() => {
                          setTopSelectedItemId(variant.id);
                          setTopRawText(variant.name);
                          setTopFeedbackMsg(null);
                          topAmountInputRef.current?.focus();
                        }}
                        className={`w-full text-left px-3 py-2 rounded-lg border text-xs sm:text-sm font-semibold flex items-center justify-between gap-2 transition-colors cursor-pointer ${
                          isChosen
                            ? 'bg-th-accent/15 border-th-accent text-th-text font-bold ring-1 ring-th-accent/30'
                            : 'bg-th-subtle/60 border-th-border hover:border-th-border-strong text-th-muted hover:text-th-text'
                        }`}
                      >
                        <span className="min-w-0 truncate">
                          <span className="font-bold text-th-text mr-1.5">
                            Option {vIdx + 1}
                            {variant.section === 'NON_OPERATING' ? ' (Default)' : ''}:
                          </span>
                          <span>{formatItemPlacementPath(variant)}</span>
                          <span className="text-th-muted"> → {variant.name}</span>
                        </span>
                        {isChosen ? (
                          <span className="inline-flex items-center gap-1 text-xs font-bold text-th-accent-text shrink-0">
                            <Check className="w-3.5 h-3.5" />
                            Selected
                          </span>
                        ) : (
                          <span className="text-xs font-bold text-th-muted shrink-0">
                            Choose
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              (topSelectedItemDetail || topAmountInput.trim() !== '') && (
                <div className="px-3.5 py-2 rounded-xl bg-th-surface border border-th-border-strong shadow-2xs animate-in fade-in flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 text-xs sm:text-sm">
                  <div className="min-w-0 flex items-center gap-2 flex-wrap">
                    {topSelectedItemDetail && (
                      <>
                        <span className="font-bold text-th-text">Selected:</span>
                        <span className="font-bold text-th-text">{topSelectedItemDetail.name}</span>
                        <span className="text-th-muted" aria-hidden="true">·</span>
                        <span className="text-th-muted font-medium">{formatItemPlacementPath(topSelectedItemDetail)}</span>
                        {topSelectedItemDetail.isContra && (
                          <span className="px-1.5 py-0.5 rounded bg-th-subtle text-th-text text-xs font-bold border border-th-border-strong">
                            Contra Account
                          </span>
                        )}
                      </>
                    )}
                  </div>
                  {topAmountInput.trim() !== '' && (
                    <div className="flex items-center gap-2.5 shrink-0 ml-auto">
                      <span className="font-mono font-semibold text-th-muted tabular-nums">
                        ₱ {formatAccounting(parseNumberInput(topAmountInput))}
                      </span>
                      <button
                        type="button"
                        onClick={() => setTopAmountInput('')}
                        className="text-xs text-th-muted hover:text-red-600 dark:hover:text-red-400 font-semibold cursor-pointer underline"
                      >
                        Clear
                      </button>
                    </div>
                  )}
                </div>
              )
            )}
          </form>

          {topFeedbackMsg && (
            <div className="mt-3.5 p-3 bg-th-surface text-base text-th-text font-bold rounded-xl border-2 border-th-border-strong flex items-center gap-2.5 animate-in fade-in shadow-xs">
              <Check className="w-5 h-5 text-th-accent-text" />
              <span>{topFeedbackMsg}</span>
            </div>
          )}
        </div>

        {/* Staging Rows Table */}
        <form
          onSubmit={handleSaveAllStagedToDatabase}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && e.shiftKey) {
              e.preventDefault();
              handleSaveAllStagedToDatabase(e);
            }
          }}
        >
          {/* If there are invalid/unrecognized items highlighted in red, display clear notice */}
          {invalidStagedCount > 0 && (
            <div className="mb-4 px-4 sm:px-5 py-3.5 bg-red-50 dark:bg-red-950/60 border-2 border-red-300 dark:border-red-800 rounded-xl flex flex-wrap items-center justify-between gap-3 text-sm sm:text-base animate-in fade-in">
              <div className="flex items-center gap-3 text-red-950 dark:text-red-100 min-w-0">
                <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0" />
                <span>
                  <strong>{invalidStagedCount} line item{invalidStagedCount > 1 ? 's are' : ' is'} highlighted in red</strong> because {invalidStagedCount > 1 ? 'they do' : 'it does'} not exist in the official line items database.
                </span>
              </div>
              <span className="text-sm text-red-800 dark:text-red-300 font-bold">
                Saving will offer to save valid items only.
              </span>
            </div>
          )}

          {/* Live Batch Tape Summary & Running Total Bar */}
          <div className="mb-4 px-4 sm:px-5 py-3.5 bg-th-subtle border border-th-border-strong rounded-xl flex flex-wrap items-center justify-between gap-3 text-base shadow-2xs">
            <div className="flex items-center gap-3 sm:gap-4 flex-wrap">
              <div className="flex items-center gap-2 font-bold text-th-text">
                <Calculator className="w-5 h-5 text-th-muted" />
                <span>Batch Tape Summary:</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <span className="text-th-muted font-semibold">Rows:</span>
                <span className="font-bold font-mono text-th-text bg-th-surface px-2.5 py-0.5 rounded-md border border-th-border-strong">
                  {stagedEntries.length}
                </span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <span className="text-th-muted font-semibold">Ready to Save:</span>
                <span className="font-bold font-mono text-th-text bg-th-surface px-2.5 py-0.5 rounded-md border border-th-border-strong">
                  {validStagedCount}
                </span>
              </div>
              <div className="flex items-center gap-2 text-sm flex-wrap">
                <span className="text-th-text font-bold">Total Batch Balance:</span>
                <span className="font-extrabold font-mono text-base sm:text-lg text-th-text bg-th-surface px-3 py-1 rounded-lg border-2 border-th-border-strong shadow-2xs">
                  ₱ {formatAccounting(stagedBatchTotal)}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {stagedEntries.some((r) => !r.lineItemId && !r.rawText?.trim() && !r.amount?.trim()) && (
                <button
                  type="button"
                  onClick={handleClearEmptyStagedRows}
                  className="text-sm font-bold text-th-muted hover:text-th-text underline cursor-pointer"
                  title="Removes unused blank rows from the batch table"
                >
                  Clear Blank Rows
                </button>
              )}
            </div>
          </div>

          <div className="border-2 border-th-border rounded-xl mb-5 shadow-xs overflow-visible bg-th-surface">
            <div className="bg-th-table-head px-4 py-2.5 border-b-2 border-th-border rounded-t-xl flex @lg:hidden items-center justify-between text-xs font-bold text-th-table-head-fg uppercase tracking-wider">
              <span>Staged Entries</span>
              <span>Line Item &amp; Balance</span>
            </div>
            <div className="bg-th-table-head px-5 py-3.5 border-b-2 border-th-border rounded-t-xl hidden @lg:grid @lg:grid-cols-12 gap-3 text-xs sm:text-sm font-bold text-th-table-head-fg uppercase tracking-wider">
              <div className="col-span-1 text-center">#</div>
              <div className="col-span-6 @2xl:col-span-7">Line Item (Type to Search)</div>
              <div className="col-span-4 @2xl:col-span-3 text-right">Amount (₱ Balance)</div>
              <div className="col-span-1" aria-hidden="true" />
            </div>

            <div className="divide-y-2 divide-th-border overflow-visible rounded-b-xl">
              {stagedEntries.length === 0 ? (
                <div className="py-12 px-6 text-center bg-th-surface rounded-b-xl">
                  <div className="w-14 h-14 rounded-2xl bg-th-subtle border-2 border-th-border-strong flex items-center justify-center mx-auto mb-3.5 text-th-text">
                    <Layers className="w-7 h-7" />
                  </div>
                  <h4 className="text-lg font-bold text-th-text">
                    No Line Items in Batch Table (0 Items)
                  </h4>
                  <p className="text-sm sm:text-base text-th-muted max-w-lg mx-auto mt-2 mb-6 leading-relaxed">
                    Use the <strong className="text-th-text font-bold">Data Encoding Station</strong> above to quickly enter an account and amount, or click below to add a blank row directly to this table.
                  </p>
                  <div className="flex flex-wrap items-center justify-center gap-3.5">
                    <button
                      type="button"
                      onClick={handleAddStagedRow}
                      className="px-5 py-3 text-base font-bold text-th-primary-fg bg-th-primary hover:opacity-90 rounded-xl shadow-xs transition-colors inline-flex items-center gap-2 cursor-pointer"
                    >
                      <Plus className="w-5 h-5" />
                      <span>Add 1 Blank Row to Table</span>
                    </button>
                  </div>
                </div>
              ) : (
                stagedEntries.map((row, idx) => {
                  const isThisRowDropdownOpen = activeDropdownRowId === row.id;
                  // Line items dropdown opens on top so it is never cut off and choices are easy to see
                  const preferredPlacement = 'top';
                  const isInvalid = isRowLineItemInvalid(row);
                  const rowVariants = getRowSameNameVariants(row);

                return (
                  <div
                    key={row.id}
                    className={`px-3.5 sm:px-4 py-3 grid grid-cols-12 gap-2.5 @lg:gap-3.5 items-start hover:bg-th-subtle transition-colors ${
                      isThisRowDropdownOpen ? 'relative z-50 bg-th-subtle' : 'relative z-auto'
                    }`}
                  >
                    <div className="col-span-6 @lg:col-span-1 @lg:order-1 flex items-center @lg:justify-center font-mono text-sm @lg:text-base font-bold text-th-text pt-1 @lg:pt-2.5">
                      <span className="@lg:hidden mr-1.5 text-xs uppercase font-sans text-th-muted">Row</span>
                      {idx + 1}
                    </div>

                    {/* Searchable Combobox with Arrow Navigation, Tab/Enter Selection & Red Highlight when not in database */}
                    <div className="col-span-12 @lg:col-span-6 @2xl:col-span-7 @lg:order-2 space-y-2">
                      <SearchableLineItemSelect
                        inputRef={(el) => {
                          lineItemInputRefs.current[row.id] = el;
                        }}
                        lineItems={encodableStatementLineItems}
                        selectedItemId={row.lineItemId}
                        rawText={row.rawText}
                        onChangeRawText={(text) => handleUpdateStagedRow(row.id, 'rawText', text)}
                        isInvalid={isInvalid}
                        onSelectItem={(itemId, itemName) => {
                          setStagedEntries((prev) =>
                            prev.map((r) =>
                              r.id === row.id
                                ? { ...r, lineItemId: itemId, rawText: itemName !== undefined ? itemName : r.rawText }
                                : r
                            )
                          );
                        }}
                        onSelectAndNext={() => {
                          const amtInput = amountInputRefs.current[row.id];
                          if (amtInput) {
                            amtInput.focus();
                            amtInput.select();
                          }
                        }}
                        placement={preferredPlacement}
                        onOpenStateChange={(isOpen) => setActiveDropdownRowId(isOpen ? row.id : null)}
                        placeholder={activeEncodingMeta.rowPlaceholder}
                      />

                      {rowVariants.length > 1 && (
                        <div className="rounded-xl bg-th-subtle/80 border border-th-border-strong p-2.5 space-y-1.5">
                          <div className="text-xs font-bold text-th-text flex items-center justify-between gap-2">
                            <span>
                              Choose which &quot;{rowVariants[0].name}&quot; line item to add to:
                            </span>
                            {!row.lineItemId && (
                              <span className="text-[11px] font-bold text-amber-700 dark:text-amber-300">
                                Select 1 option
                              </span>
                            )}
                          </div>
                          <div className="flex flex-col gap-1.5">
                            {rowVariants.map((variant, vIdx) => {
                              const isChosen = row.lineItemId === variant.id;
                              return (
                                <button
                                  key={variant.id}
                                  type="button"
                                  onClick={() => {
                                    setStagedEntries((prev) =>
                                      prev.map((r) =>
                                        r.id === row.id
                                          ? { ...r, lineItemId: variant.id, rawText: variant.name }
                                          : r
                                      )
                                    );
                                  }}
                                  className={`w-full text-left px-2.5 py-1.5 rounded-lg border text-xs sm:text-sm font-semibold flex items-center justify-between gap-2 transition-colors cursor-pointer ${
                                    isChosen
                                      ? 'bg-th-accent/15 border-th-accent text-th-text font-bold ring-1 ring-th-accent/30'
                                      : 'bg-th-surface border-th-border hover:border-th-border-strong text-th-muted hover:text-th-text'
                                  }`}
                                >
                                  <span className="min-w-0 truncate">
                                    <span className="font-bold text-th-text mr-1.5">
                                      Option {vIdx + 1}
                                      {variant.section === 'NON_OPERATING' ? ' (Default)' : ''}:
                                    </span>
                                    <span>{formatItemPlacementPath(variant)}</span>
                                    <span className="text-th-muted"> → {variant.name}</span>
                                  </span>
                                  {isChosen ? (
                                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-th-accent-text shrink-0">
                                      <Check className="w-3.5 h-3.5" />
                                      Selected
                                    </span>
                                  ) : (
                                    <span className="text-[11px] font-bold text-th-muted shrink-0">
                                      Choose
                                    </span>
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {row.aggregationRecord && (
                        <div className="rounded-lg bg-sky-50 dark:bg-sky-950/40 border border-sky-300 dark:border-sky-800 px-3 py-1.5 text-xs text-sky-900 dark:text-sky-200 flex items-center gap-2 flex-wrap">
                          <Info className="w-3.5 h-3.5 text-sky-700 dark:text-sky-300 shrink-0" />
                          <span className="font-bold">
                            {row.aggregationRecord.aggregationReason === 'duplicate_entries'
                              ? 'Aggregated from duplicate entries'
                              : row.aggregationRecord.wasAggregated
                              ? 'This account has been aggregated'
                              : 'Parent matched sub-items'}
                          </span>
                          <span>
                            ({row.aggregationRecord.components.length} {row.aggregationRecord.aggregationReason === 'duplicate_entries' ? 'entries' : `sub-item${row.aggregationRecord.components.length === 1 ? '' : 's'}`} · Total ₱{formatAccounting(row.aggregationRecord.totalAmount)})
                          </span>
                          {row.aggregationRecord.aggregationNote && (
                            <span className="w-full text-[11px] text-sky-800 dark:text-sky-300 font-medium">
                              Note: {row.aggregationRecord.aggregationNote}
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Amount Input with Auto-Advance to Next Line Item & Shift+Enter Save */}
                    <div className="col-span-12 @lg:col-span-4 @2xl:col-span-3 @lg:order-3">
                      <div className="relative">
                        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-th-muted font-mono text-base font-bold">
                          ₱
                        </span>
                        <input
                          ref={(el) => {
                            amountInputRefs.current[row.id] = el;
                          }}
                          type="text"
                          value={row.amount}
                          onChange={(e) => handleUpdateStagedRow(row.id, 'amount', e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && e.shiftKey) {
                              e.preventDefault();
                              handleSaveAllStagedToDatabase(e);
                              return;
                            }

                            if (e.key === 'Enter' || e.key === 'Tab') {
                              if (!e.shiftKey) {
                                e.preventDefault();
                                if (idx < stagedEntries.length - 1) {
                                  const nextRow = stagedEntries[idx + 1];
                                  const nextInput = lineItemInputRefs.current[nextRow.id];
                                  if (nextInput) {
                                    nextInput.focus();
                                    nextInput.select();
                                  }
                                } else {
                                  // At the last row: automatically append a new row and focus it!
                                  const newRowId = `stage-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;
                                  setStagedEntries((prev) => [
                                    ...prev,
                                    { id: newRowId, lineItemId: '', amount: '' },
                                  ]);
                                  setRowToFocusAfterRender(newRowId);
                                }
                              }
                            }
                          }}
                          placeholder="0.00"
                          className="w-full pl-8 pr-4 py-3 text-base font-mono font-bold tabular-nums text-right bg-th-input border-2 border-th-border-strong text-th-text rounded-xl focus:outline-hidden focus:ring-2 focus:ring-th-accent focus:border-th-accent shadow-2xs"
                        />
                      </div>
                    </div>

                    {/* Delete row */}
                    <div className="col-span-6 col-start-7 row-start-1 @lg:col-span-1 @lg:col-start-auto @lg:row-start-auto @lg:order-4 flex justify-end @lg:justify-center">
                      <button
                        type="button"
                        onClick={() => handleRemoveStagedRow(row.id)}
                        className="min-w-[40px] min-h-[40px] @lg:min-w-[44px] @lg:min-h-[44px] flex items-center justify-center text-th-muted hover:text-red-700 dark:hover:text-red-400 rounded-xl hover:bg-red-50 dark:hover:bg-red-950/50 border border-transparent hover:border-red-200 dark:hover:border-red-800 transition-colors cursor-pointer"
                        title="Remove row"
                        aria-label={`Remove row ${idx + 1}`}
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                );
              }))}
            </div>
          </div>

          {/* Form Actions */}
          <div className="flex flex-col @2xl:flex-row @2xl:items-center justify-between gap-4 pt-3">
            <div className="flex items-center gap-3 flex-wrap">
              <button
                type="button"
                onClick={handleAddStagedRow}
                className="px-4 sm:px-5 py-2.5 min-h-[44px] text-sm sm:text-base font-bold text-th-text bg-th-subtle border-2 border-th-border-strong hover:bg-th-subtle-hover rounded-xl transition-colors inline-flex items-center gap-2 shadow-2xs whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Plus className="w-5 h-5 text-th-muted shrink-0" />
                <span>Add Row</span>
              </button>
              <button
                type="button"
                onClick={() => setIsDiscardConfirmOpen(true)}
                className="px-4 sm:px-5 py-2.5 min-h-[44px] text-sm sm:text-base font-semibold text-th-muted hover:text-red-700 dark:hover:text-red-400 rounded-xl hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors inline-flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <RotateCcw className="w-5 h-5 shrink-0" />
                <span>Clear Form</span>
              </button>
            </div>

            <div className="flex flex-col @sm:flex-row items-stretch @sm:items-center gap-3 w-full @2xl:w-auto">
              {invalidStagedCount > 0 && (
                <span className="text-sm sm:text-base text-red-800 dark:text-red-300 font-bold flex items-center gap-2 bg-red-50 dark:bg-red-950/60 px-4 py-2.5 rounded-xl border border-red-300 dark:border-red-800">
                  <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
                  <span>{invalidStagedCount} unrecognized line item{invalidStagedCount > 1 ? 's' : ''}</span>
                </span>
              )}

              <button
                type="submit"
                disabled={validStagedCount === 0 && invalidStagedCount === 0}
                className="w-full @sm:w-auto px-5 sm:px-7 py-3 min-h-[48px] text-sm sm:text-base font-bold text-th-accent-fg bg-th-accent hover:bg-th-accent-hover disabled:opacity-50 disabled:cursor-not-allowed rounded-xl shadow-md transition-all flex items-center justify-center gap-2.5 border-2 border-th-accent text-center cursor-pointer"
              >
                <Check className="w-5 h-5 shrink-0" />
                <span>
                  Save All {validStagedCount > 0 ? `(${validStagedCount})` : ''} Entries to Database
                </span>
              </button>
            </div>
          </div>

          {saveSuccessMsg && (
            <div className="mt-4 p-4 bg-th-subtle text-th-text border-2 border-th-border-strong rounded-xl text-base font-bold flex items-center gap-2.5 animate-in fade-in shadow-xs">
              <CheckCircle2 className="w-5 h-5 text-th-accent-text shrink-0" />
              <span>{saveSuccessMsg}</span>
            </div>
          )}
        </form>
      </div>

      {/* 4. Encoded Items for this Division & Fiscal Year (Zero balances removed by default) */}
      <div className="bg-th-surface border-2 border-th-border rounded-2xl shadow-sm overflow-hidden transition-colors">
        <div className="px-4 sm:px-6 py-5 border-b-2 border-th-border bg-th-subtle space-y-4">
          {/* Row 1: Title on Left, Primary Report Navigation CTA on Right */}
          <div className="flex flex-col @2xl:flex-row @2xl:items-center justify-between gap-3">
            <div className="min-w-0">
              <h4 className="text-lg sm:text-xl font-bold text-th-text flex items-center gap-2.5 flex-wrap">
                <FileText className="w-5 h-5 text-th-muted shrink-0" />
                <span>Recorded Balances: {currentDivision?.name} (FY {selectedYear})</span>
                <TipsButton>
                  <p>
                    {showZeroBalancesInLedger
                      ? 'Currently showing all accounts including zero balances. Click "Hide Zero Balances" to hide empty lines.'
                      : 'Zero-balance items are hidden by default. Line items appear automatically here as amounts are saved.'}
                  </p>
                </TipsButton>
              </h4>
            </div>

            <button
              type="button"
              onClick={onNavigateToViewFS}
              className="self-start @2xl:self-auto inline-flex items-center gap-2 px-4 py-2.5 min-h-[42px] text-sm font-bold text-th-primary-fg bg-th-primary hover:opacity-90 rounded-xl transition-colors border-2 border-th-primary dark:border-th-border-strong text-left cursor-pointer shadow-xs"
            >
              <span>
                {selectedStatement === 'performance'
                  ? 'View Statement of Financial Performance'
                  : selectedStatement === 'cash_flows'
                  ? 'View Statement of Cash Flows'
                  : selectedStatement === 'net_assets'
                  ? 'View Statement of Changes in Net Assets/Equity'
                  : 'View Statement of Financial Position'}
              </span>
              <ChevronRight className="w-4 h-4 shrink-0" />
            </button>
          </div>

          {/* Row 2: Tidy Action Toolbar — View/Select Controls Left, Destructive Reset Right */}
          <div className="pt-3.5 border-t border-th-border flex flex-wrap items-center justify-between gap-2.5">
            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={() => setShowZeroBalancesInLedger(!showZeroBalancesInLedger)}
                className="px-4 py-2 min-h-[40px] text-sm font-bold text-th-text bg-th-surface border-2 border-th-border-strong rounded-xl hover:bg-th-subtle-hover transition-colors inline-flex items-center gap-2 whitespace-nowrap shrink-0 shadow-xs cursor-pointer"
              >
                {showZeroBalancesInLedger ? (
                  <EyeOff className="w-4 h-4 text-th-muted shrink-0" />
                ) : (
                  <Eye className="w-4 h-4 text-th-muted shrink-0" />
                )}
                <span>{showZeroBalancesInLedger ? 'Hide Zero Balances' : 'Show All Accounts'}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setIsSelectMultipleMode((prev) => !prev);
                  setSelectedRecordedIds([]);
                }}
                className={`inline-flex items-center gap-1.5 px-4 py-2 min-h-[40px] text-sm font-bold rounded-xl border-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  isSelectMultipleMode
                    ? 'bg-th-primary text-th-primary-fg border-th-primary dark:border-th-border-strong'
                    : 'bg-th-surface text-th-text border-th-border-strong hover:bg-th-subtle-hover'
                }`}
              >
                <span>{isSelectMultipleMode ? 'Cancel Select' : 'Select Multiples'}</span>
              </button>

              {selectedRecordedIds.length > 0 && (
                <button
                  type="button"
                  onClick={() => setPendingDeleteSelectedRecorded(true)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 min-h-[40px] text-sm font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer shadow-xs"
                >
                  <Trash2 className="w-4 h-4 shrink-0" />
                  <span>Delete Selected ({selectedRecordedIds.length})</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => {
                  if (deletedHistory.length === 0) return;
                  const last = deletedHistory[deletedHistory.length - 1];
                  onSaveBatchAmounts(last.year, last.divisionId, last.entries);
                  setDeletedHistory((prev) => prev.slice(0, -1));
                }}
                disabled={deletedHistory.length === 0}
                className="inline-flex items-center gap-1.5 px-4 py-2 min-h-[40px] text-sm font-bold rounded-xl border-2 border-th-border-strong bg-th-surface text-th-text hover:bg-th-subtle-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                title={deletedHistory.length > 0 ? 'Undo last delete' : 'Nothing to undo'}
              >
                <RotateCcw className="w-4 h-4 shrink-0" />
                <span>Undo</span>
              </button>
            </div>

            <button
              type="button"
              onClick={() => setIsDeleteAllConfirmOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2 min-h-[40px] text-sm font-bold text-red-800 dark:text-red-300 bg-red-50 dark:bg-red-950/60 hover:bg-red-100 dark:hover:bg-red-900/60 border-2 border-red-200 dark:border-red-800 rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              title="Delete all records and reset all balances to zero for this division and year"
            >
              <Trash2 className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0" />
              <span>Reset All to Zero</span>
            </button>
          </div>
        </div>

        {/* Informative transferred dataset banner for Iloilo City Division 2024 */}
        {selectedDivisionId === 'iloilo-city-div' && selectedYear === '2024' && (
          <div className="mx-6 mt-4 p-3.5 bg-th-subtle border-2 border-th-border-strong rounded-xl flex items-center justify-between gap-3 text-sm text-th-text">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-th-text shrink-0" />
              <span>
                <strong>Transferred Dataset:</strong> FY 2024 details from <strong>Iloilo Division</strong> were transferred to <strong>Iloilo City Division</strong>.
              </span>
            </div>
          </div>
        )}

        {/* Aggregated Accounts Notice Banner for Saved Division Data */}
        {ledgerAggRecords.length > 0 && (
          <div className="mx-6 mt-5 p-4 rounded-xl border-2 border-sky-300 dark:border-sky-800 bg-sky-50/90 dark:bg-sky-950/40 text-sky-950 dark:text-sky-100 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              <div className="flex items-start gap-2.5">
                <Info className="w-5 h-5 text-sky-700 dark:text-sky-300 shrink-0 mt-0.5" />
                <div>
                  <div className="text-sm sm:text-base font-bold">
                    Notice — Aggregated Accounts Recorded ({ledgerAggRecords.length})
                  </div>
                  <p className="text-xs sm:text-sm text-sky-900/90 dark:text-sky-200/90 mt-0.5">
                    The accounts below include consolidated sub-items saved for {currentDivision?.name} (FY {selectedYear}). Click &quot;View breakdown&quot; on any account or expand below to inspect the exact amounts.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsLedgerAggBannerExpanded((prev) => !prev)}
                className="self-start sm:self-center inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/90 dark:bg-slate-900/70 border border-sky-300 dark:border-sky-700 text-xs font-bold text-sky-900 dark:text-sky-200 hover:bg-white dark:hover:bg-slate-900 cursor-pointer whitespace-nowrap shrink-0"
              >
                {isLedgerAggBannerExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                <span>{isLedgerAggBannerExpanded ? 'Hide Details' : 'View All Aggregated Details'}</span>
              </button>
            </div>

            {isLedgerAggBannerExpanded && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2 border-t border-sky-200 dark:border-sky-800/80">
                {ledgerAggRecords.map(({ item, rec }) => (
                  <div
                    key={item.id}
                    className="p-3 rounded-lg bg-white/90 dark:bg-slate-900/60 border border-sky-200 dark:border-sky-800/80 text-xs space-y-1.5"
                  >
                    <div className="flex items-center justify-between gap-2 font-bold text-sky-950 dark:text-sky-100">
                      <span className="truncate">{item.name}</span>
                      <span className="font-mono shrink-0">₱ {formatAccounting(rec.totalAmount)}</span>
                    </div>
                    <div className="text-[11px] font-bold text-sky-700 dark:text-sky-300">
                      {rec.aggregationReason === 'duplicate_entries'
                        ? 'Aggregated from duplicate entries'
                        : rec.wasAggregated
                        ? 'This account has been aggregated'
                        : 'Parent amount already equaled sub-items'}
                    </div>
                    {rec.aggregationNote && (
                      <div className="text-[11px] text-sky-900 dark:text-sky-200 font-medium">
                        Note: {rec.aggregationNote}
                      </div>
                    )}
                    <div className="space-y-1 pt-1 border-t border-sky-100 dark:border-sky-900/60">
                      {rec.components.map((comp, idx) => (
                        <div
                          key={`${item.id}-banner-comp-${idx}`}
                          className={`flex items-center justify-between gap-2 ${
                            comp.isParentOriginal ? 'text-sky-900 dark:text-sky-200 font-semibold' : 'text-th-muted'
                          }`}
                        >
                          <span className="truncate">
                            {comp.label}
                            {comp.excelRowNumber ? ` (Row ${comp.excelRowNumber})` : ''}
                          </span>
                          <span className="font-mono font-semibold text-th-text shrink-0">₱ {formatAccounting(comp.amount)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Cash Reconciliation Summary for Statement of Cash Flows */}
        {selectedStatement === 'cash_flows' && (
          <div className="mx-6 mt-5 p-4 rounded-xl border-2 border-th-border bg-th-subtle">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <span className="text-sm font-bold uppercase tracking-wider text-th-text flex items-center gap-1.5">
                <Calculator className="w-4 h-4 text-th-muted" />
                Cash Flows Reconciliation (FY {selectedYear})
              </span>
              <span className="text-sm text-th-muted font-semibold">
                Comparative Prior: FY {comparativeYear}
              </span>
            </div>
            <div className="grid grid-cols-1 @md:grid-cols-2 @2xl:grid-cols-3 gap-3 text-sm">
              <div className="p-3.5 bg-th-surface rounded-lg border border-th-border">
                <div className="text-sm text-th-muted font-semibold">Net Operating Activities</div>
                <div className={`text-lg font-bold font-mono mt-1 ${cashFlowsSummary.netOperating < 0 ? 'text-red-600 dark:text-red-400' : 'text-th-text'}`}>
                  {formatAccounting(cashFlowsSummary.netOperating)}
                </div>
              </div>
              <div className="p-3.5 bg-th-surface rounded-lg border border-th-border">
                <div className="text-sm text-th-muted font-semibold">Net Investing Activities</div>
                <div className={`text-lg font-bold font-mono mt-1 ${cashFlowsSummary.netInvesting < 0 ? 'text-red-600 dark:text-red-400' : 'text-th-text'}`}>
                  {formatAccounting(cashFlowsSummary.netInvesting)}
                </div>
              </div>
              <div className="p-3.5 bg-th-surface rounded-lg border border-th-border">
                <div className="text-sm text-th-muted font-semibold">Net Financing Activities</div>
                <div className={`text-lg font-bold font-mono mt-1 ${cashFlowsSummary.netFinancing < 0 ? 'text-red-600 dark:text-red-400' : 'text-th-text'}`}>
                  {formatAccounting(cashFlowsSummary.netFinancing)}
                </div>
              </div>
              <div className="p-3.5 bg-th-surface rounded-lg border border-th-border-strong">
                <div className="text-sm text-th-text font-bold">Increase(Decrease) in Cash</div>
                <div className={`text-lg font-extrabold font-mono mt-1 ${cashFlowsSummary.netIncreaseDecrease < 0 ? 'text-red-600 dark:text-red-400' : 'text-th-text'}`}>
                  {formatAccounting(cashFlowsSummary.netIncreaseDecrease)}
                </div>
              </div>
              <div className="p-3.5 bg-th-surface rounded-lg border border-th-border-strong">
                <div className="text-sm text-th-text font-bold flex items-center justify-between gap-2">
                  <span>Cash &amp; Eq., January 1</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-th-muted font-semibold">
                      {selectedYear === '2024' ? '(No 2023 Data)' : '(Prior Dec 31)'}
                    </span>
                    {selectedYear === '2024' && !isEditingJan1_2024 && (
                      <button
                        type="button"
                        onClick={handleStartEditJan1_2024}
                        className="text-xs font-bold text-th-accent-text hover:underline cursor-pointer"
                      >
                        Adjust
                      </button>
                    )}
                  </div>
                </div>
                {selectedYear === '2024' && isEditingJan1_2024 ? (
                  <div className="mt-1.5 flex items-center gap-1.5">
                    <input
                      type="text"
                      value={jan1_2024Input}
                      onChange={(e) => setJan1_2024Input(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleSaveJan1_2024();
                        } else if (e.key === 'Escape') {
                          setIsEditingJan1_2024(false);
                        }
                      }}
                      placeholder="0.00"
                      autoFocus
                      className="w-full px-2.5 py-1 text-sm font-mono font-bold bg-th-input border border-th-accent rounded-md text-th-text focus:outline-hidden"
                    />
                    <button
                      type="button"
                      onClick={handleSaveJan1_2024}
                      className="p-1.5 rounded-md bg-th-accent hover:bg-th-accent-hover text-th-accent-fg cursor-pointer"
                      title="Save January 1, 2024 balance"
                    >
                      <Check className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsEditingJan1_2024(false)}
                      className="p-1.5 rounded-md bg-th-subtle hover:bg-th-subtle-hover text-th-text cursor-pointer"
                      title="Cancel"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <div className="text-lg font-extrabold font-mono mt-1 text-th-text">
                    {formatAccounting(
                      currentDbEntries['cf-sum-beg-cash'] !== undefined
                        ? currentDbEntries['cf-sum-beg-cash']
                        : cashFlowsSummary.january1Cash
                    )}
                  </div>
                )}
              </div>
              <div className="p-3.5 bg-emerald-50/80 dark:bg-emerald-950/40 rounded-lg border-2 border-emerald-300 dark:border-emerald-700">
                <div className="text-sm text-emerald-800 dark:text-emerald-300 font-bold flex items-center justify-between gap-2">
                  <span>Cash &amp; Eq., December 31</span>
                  <span className="text-xs text-emerald-700 dark:text-emerald-300 font-bold">
                    {Math.abs(cashFlowsSummary.fxEffects) >= 0.005 ? 'Jan 1 + Net Change + FX' : 'Jan 1 + Net Change'}
                  </span>
                </div>
                <div className="text-lg font-extrabold font-mono mt-1 text-emerald-900 dark:text-emerald-200">
                  {formatAccounting(currentDbEntries['cf-sum-end-cash'] !== undefined ? currentDbEntries['cf-sum-end-cash'] : cashFlowsSummary.december31Cash)}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Reconciliation Summary for Statement of Changes in Net Assets/Equity */}
        {selectedStatement === 'net_assets' && (
          <div className="mx-6 mt-5 p-4 rounded-xl border-2 border-th-border bg-th-subtle">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <span className="text-sm font-bold uppercase tracking-wider text-th-text flex items-center gap-1.5">
                <Calculator className="w-4 h-4 text-th-muted" />
                Net Assets / Equity Reconciliation (FY {selectedYear})
              </span>
              <span className="text-sm text-th-muted font-semibold">
                Comparative Prior: FY {comparativeYear}
              </span>
            </div>
            <div className="grid grid-cols-1 @md:grid-cols-2 @2xl:grid-cols-5 gap-3 text-sm">
              <div className="p-3.5 bg-th-surface rounded-lg border border-th-border-strong">
                <div className="text-sm text-th-text font-bold flex items-center justify-between gap-2">
                  <span>Balance at Jan 1</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-th-muted font-semibold">
                      {selectedYear === '2024' ? '(No 2023 Data)' : '(Prior Dec 31)'}
                    </span>
                    {selectedYear === '2024' && !isEditingJan1_2024 && (
                      <button
                        type="button"
                        onClick={handleStartEditJan1_2024}
                        className="text-xs font-bold text-th-accent-text hover:underline cursor-pointer"
                      >
                        Adjust
                      </button>
                    )}
                  </div>
                </div>
                {selectedYear === '2024' && isEditingJan1_2024 ? (
                  <div className="mt-1.5 flex items-center gap-1.5">
                    <input
                      type="text"
                      value={jan1_2024Input}
                      onChange={(e) => setJan1_2024Input(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleSaveJan1_2024();
                        } else if (e.key === 'Escape') {
                          setIsEditingJan1_2024(false);
                        }
                      }}
                      placeholder="0.00"
                      autoFocus
                      className="w-full px-2.5 py-1 text-sm font-mono font-bold bg-th-input border border-th-accent rounded-md text-th-text focus:outline-hidden"
                    />
                    <button
                      type="button"
                      onClick={handleSaveJan1_2024}
                      className="p-1.5 rounded-md bg-th-accent hover:bg-th-accent-hover text-th-accent-fg cursor-pointer"
                      title="Save January 1, 2024 balance"
                    >
                      <Check className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsEditingJan1_2024(false)}
                      className="p-1.5 rounded-md bg-th-subtle hover:bg-th-subtle-hover text-th-text cursor-pointer"
                      title="Cancel"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <div className="text-lg font-extrabold font-mono mt-1 text-th-text">
                    {formatAccounting(
                      currentDbEntries['na-beg-balance'] !== undefined
                        ? currentDbEntries['na-beg-balance']
                        : netAssetsSummary.january1Balance
                    )}
                  </div>
                )}
              </div>

              <div className="p-3.5 bg-th-surface rounded-lg border border-th-border">
                <div className="text-sm text-th-muted font-semibold">Beg. Adjustments</div>
                <div className={`text-lg font-bold font-mono mt-1 ${netAssetsSummary.totalBeginningAdjustments < 0 ? 'text-red-600 dark:text-red-400' : 'text-th-text'}`}>
                  {formatAccounting(netAssetsSummary.totalBeginningAdjustments)}
                </div>
              </div>

              <div className="p-3.5 bg-th-surface rounded-lg border border-th-border-strong">
                <div className="text-sm text-th-text font-bold flex items-center justify-between">
                  <span>Restated Balance</span>
                  <span className="text-xs text-th-muted font-bold">Auto</span>
                </div>
                <div className={`text-lg font-extrabold font-mono mt-1 ${netAssetsSummary.restatedBalance < 0 ? 'text-red-600 dark:text-red-400' : 'text-th-text'}`}>
                  {formatAccounting(netAssetsSummary.restatedBalance)}
                </div>
              </div>

              <div className="p-3.5 bg-th-surface rounded-lg border border-th-border">
                <div className="text-sm text-th-muted font-semibold">Calendar Year Changes</div>
                <div className={`text-lg font-bold font-mono mt-1 ${netAssetsSummary.totalCalendarYearChanges < 0 ? 'text-red-600 dark:text-red-400' : 'text-th-text'}`}>
                  {formatAccounting(netAssetsSummary.totalCalendarYearChanges)}
                </div>
              </div>

              <div className="p-3.5 bg-emerald-50/80 dark:bg-emerald-950/40 rounded-lg border-2 border-emerald-300 dark:border-emerald-700">
                <div className="text-sm text-emerald-800 dark:text-emerald-300 font-bold flex items-center justify-between gap-2">
                  <span>Balance at Dec 31</span>
                  <span className="text-xs text-emerald-700 dark:text-emerald-300 font-bold">Restated + CY</span>
                </div>
                <div className={`text-lg font-extrabold font-mono mt-1 ${netAssetsSummary.december31Balance < 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-900 dark:text-emerald-200'}`}>
                  {formatAccounting(netAssetsSummary.december31Balance)}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Ledger Search Filter */}
        <div className="px-4 sm:px-6 py-4 bg-th-subtle border-b-2 border-th-border flex flex-col @lg:flex-row items-stretch @lg:items-center gap-3">
          <input
            type="text"
            value={ledgerSearch}
            onChange={(e) => setLedgerSearch(e.target.value)}
            placeholder="Search within recorded accounts..."
            className="flex-1 min-w-0 px-4 py-3 text-base bg-th-input border-2 border-th-border-strong rounded-xl text-th-text font-medium placeholder:text-th-muted focus:outline-hidden focus:border-th-accent focus:ring-2 focus:ring-th-accent/20 shadow-xs"
          />
          <span className="self-start @lg:self-auto text-sm font-bold text-th-text whitespace-nowrap bg-th-surface px-3.5 py-2.5 rounded-xl border border-th-border-strong">
            {ledgerAccountsList.length} {showZeroBalancesInLedger ? 'accounts listed' : 'recorded items'}
          </span>
        </div>

        {/* Ledger Table or Empty State */}
        {ledgerAccountsList.length === 0 ? (
          <div className="py-16 px-6 text-center">
            <div className="w-16 h-16 rounded-2xl bg-th-subtle border-2 border-th-border-strong flex items-center justify-center mx-auto mb-4 text-th-text">
              <FileText className="w-8 h-8" />
            </div>
            <h5 className="text-lg font-bold text-th-text">
              No balances recorded yet for {currentDivision?.name} (FY {selectedYear})
            </h5>
            <p className="text-sm sm:text-base text-th-muted max-w-xl mx-auto mt-2 leading-relaxed font-medium">
              Zero balance items are removed by default. Enter line items and amounts in the batch entry form above and click &quot;Save All Entries to Database&quot;—they will automatically appear here as amounts are added.
            </p>
            <button
              type="button"
              onClick={() => setShowZeroBalancesInLedger(true)}
              className="mt-6 inline-flex items-center gap-2 px-5 py-3 text-sm font-bold text-th-text bg-th-subtle hover:bg-th-subtle-hover border-2 border-th-border-strong rounded-xl transition-colors cursor-pointer shadow-xs"
            >
              <Eye className="w-5 h-5" />
              <span>Show All Accounts (Include Zeroes)</span>
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto max-h-[580px]">
            <table className="w-full text-left text-base border-collapse">
              <thead className="bg-th-table-head text-sm font-bold text-th-table-head-fg uppercase tracking-wider border-b-2 border-th-border sticky top-0 z-10">
                <tr>
                  {isSelectMultipleMode && (() => {
                    const selectableLedgerIds = ledgerAccountsList
                      .filter((i) => {
                        const isEditable2024 =
                          selectedYear === '2024' &&
                          ((selectedStatement === 'cash_flows' && i.id === 'cf-sum-beg-cash') ||
                            (selectedStatement === 'net_assets' && i.id === 'na-beg-balance'));
                        return !NON_ENCODABLE_SUMMARY_IDS.has(i.id) || isEditable2024;
                      })
                      .map((i) => i.id);
                    const allSelectableSelected =
                      selectableLedgerIds.length > 0 &&
                      selectableLedgerIds.every((id) => selectedRecordedIds.includes(id));

                    return (
                      <th
                        onClick={() => {
                          if (allSelectableSelected) {
                            setSelectedRecordedIds([]);
                          } else {
                            setSelectedRecordedIds(selectableLedgerIds);
                          }
                        }}
                        className="py-3.5 px-4 w-14 text-center cursor-pointer select-none"
                      >
                        <input
                          type="checkbox"
                          checked={allSelectableSelected}
                          onChange={() => {}}
                          className="w-5 h-5 rounded border-white/40 text-th-accent accent-th-accent focus:ring-th-accent cursor-pointer pointer-events-none"
                          aria-label="Select all recorded balances"
                        />
                      </th>
                    );
                  })()}
                  <th className="py-3.5 px-6">Official Account Title</th>
                  <th className="py-3.5 px-6">Classification & Group</th>
                  <th className="py-3.5 px-6 text-right">Balance (₱)</th>
                  <th className="py-3.5 px-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-th-border">
                {ledgerAccountsList.map((item) => {
                  const amt = currentDbEntries[item.id] || 0;
                  const hasValue = currentDbEntries[item.id] !== undefined && currentDbEntries[item.id] !== 0;
                  const isEditable2024Jan1 =
                    selectedYear === '2024' &&
                    ((selectedStatement === 'cash_flows' && item.id === 'cf-sum-beg-cash') ||
                      (selectedStatement === 'net_assets' && item.id === 'na-beg-balance'));
                  const isAutoComputedCashFlow = NON_ENCODABLE_SUMMARY_IDS.has(item.id) && !isEditable2024Jan1;
                  const aggRec = divisionAggMap[item.id];
                  const showAggBadge = Boolean(aggRec && hasValue);
                  const isAggExpanded = Boolean(expandedLedgerAggIds[item.id]);

                  return (
                    <tr
                      key={item.id}
                      onClick={() => {
                        if (!isSelectMultipleMode || isAutoComputedCashFlow) return;
                        setSelectedRecordedIds((prev) =>
                          prev.includes(item.id)
                            ? prev.filter((id) => id !== item.id)
                            : [...prev, item.id]
                        );
                      }}
                      className={`hover:bg-th-subtle transition-colors ${
                        isSelectMultipleMode && !isAutoComputedCashFlow ? 'cursor-pointer select-none' : ''
                      } ${
                        hasValue ? 'bg-th-subtle/40' : ''
                      }`}
                    >
                      {isSelectMultipleMode && (
                        <td className="py-3.5 px-4 text-center">
                          {!isAutoComputedCashFlow && (
                            <input
                              type="checkbox"
                              checked={selectedRecordedIds.includes(item.id)}
                              onChange={() => {}}
                              className="w-5 h-5 rounded border-th-border-strong text-th-accent accent-th-accent focus:ring-th-accent cursor-pointer pointer-events-none"
                              aria-label={`Select ${item.name}`}
                            />
                          )}
                        </td>
                      )}
                      <td className="py-3.5 px-6 font-medium text-th-text">
                        <div className="flex items-center gap-2.5 flex-wrap">
                          <span
                            className={`text-base font-bold ${
                              item.id === AGGREGATED_ACCUMULATED_DEPRECIATION_ID
                                ? 'text-red-700 dark:text-red-400'
                                : 'text-th-text'
                            }`}
                          >
                            {item.name}
                          </span>
                          {item.id === AGGREGATED_ACCUMULATED_DEPRECIATION_ID && (
                            <span className="text-xs text-red-800 dark:text-red-200 bg-red-50 dark:bg-red-950/60 px-2.5 py-0.5 rounded-md font-bold border border-red-300 dark:border-red-700">
                              Temporary Notice · Excluded from Consolidated FS
                            </span>
                          )}
                          {showAggBadge && aggRec && (
                            <>
                              <span className="inline-flex items-center gap-1 text-xs text-sky-900 dark:text-sky-200 bg-sky-50 dark:bg-sky-950/60 px-2.5 py-0.5 rounded-md font-bold border border-sky-300 dark:border-sky-700">
                                <Info className="w-3.5 h-3.5 shrink-0" />
                                <span>
                                  {aggRec.aggregationReason === 'duplicate_entries'
                                    ? 'Aggregated from duplicate entries'
                                    : aggRec.wasAggregated
                                    ? 'This account has been aggregated'
                                    : 'Parent matched sub-items'}
                                </span>
                              </span>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setExpandedLedgerAggIds((prev) => ({
                                    ...prev,
                                    [item.id]: !prev[item.id],
                                  }));
                                }}
                                className="inline-flex items-center gap-1 text-xs font-bold text-sky-800 dark:text-sky-300 hover:underline px-2 py-0.5 rounded-md bg-sky-100/70 dark:bg-sky-900/40 border border-sky-200 dark:border-sky-800 cursor-pointer"
                              >
                                {isAggExpanded ? (
                                  <ChevronUp className="w-3.5 h-3.5" />
                                ) : (
                                  <ChevronDown className="w-3.5 h-3.5" />
                                )}
                                <span>
                                  {isAggExpanded ? 'Hide' : 'View'} breakdown ({aggRec.components.length})
                                </span>
                              </button>
                            </>
                          )}
                          {item.id === 'cf-sum-beg-cash' && (
                            <span className="text-xs text-th-text bg-th-subtle px-2.5 py-0.5 rounded-md font-bold border border-th-border-strong">
                              {selectedYear === '2024' ? 'Adjustable (No 2023 Data)' : 'Default: Prior Dec 31'}
                            </span>
                          )}
                          {item.id === 'cf-sum-end-cash' && (
                            <span className="text-xs text-emerald-800 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/70 px-2.5 py-0.5 rounded-md font-bold border border-emerald-300 dark:border-emerald-700">
                              Auto: Jan 1 + Net Change
                            </span>
                          )}
                          {item.id === 'cf-sum-net-inc-dec' && (
                            <span className="text-xs text-th-text bg-th-subtle px-2.5 py-0.5 rounded-md font-bold border border-th-border-strong">
                              Auto: Net Inflows - Outflows
                            </span>
                          )}
                          {item.id === 'na-beg-balance' && (
                            <span className="text-xs text-th-text bg-th-subtle px-2.5 py-0.5 rounded-md font-bold border border-th-border-strong">
                              {selectedYear === '2024' ? 'Adjustable (No 2023 Data)' : 'Auto: Prior Dec 31'}
                            </span>
                          )}
                          {item.id === 'na-restated-balance' && (
                            <span className="text-xs text-th-text bg-th-subtle px-2.5 py-0.5 rounded-md font-bold border border-th-border-strong">
                              Auto: Jan 1 + Adjustments
                            </span>
                          )}
                          {item.id === 'na-end-balance' && (
                            <span className="text-xs text-emerald-800 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/70 px-2.5 py-0.5 rounded-md font-bold border border-emerald-300 dark:border-emerald-700">
                              Auto: Restated + CY Changes
                            </span>
                          )}
                          {item.isContra && (
                            <span className="text-xs text-th-muted bg-th-subtle px-2.5 py-0.5 rounded-md font-bold border border-th-border">
                              Contra
                            </span>
                          )}
                          {!hasValue && (
                            <span className="text-xs text-th-muted font-mono font-semibold">
                              (Zero)
                            </span>
                          )}
                        </div>
                        {item.subgroup && (
                          <div className="text-sm text-th-muted font-medium mt-0.5">
                            Subgroup: {item.subgroup}
                          </div>
                        )}
                        {showAggBadge && aggRec && isAggExpanded && (
                          <div
                            onClick={(e) => e.stopPropagation()}
                            className="mt-2.5 p-3 rounded-lg bg-sky-50/90 dark:bg-sky-950/40 border border-sky-300 dark:border-sky-800 text-xs space-y-1.5"
                          >
                            <div className="flex items-center justify-between gap-2 font-bold text-sky-950 dark:text-sky-100">
                              <span>Aggregated Line Items &amp; Amounts</span>
                              {aggRec.sourceFileName && (
                                <span className="font-normal text-sky-800 dark:text-sky-300 truncate max-w-[220px]">
                                  Source: {aggRec.sourceFileName}
                                </span>
                              )}
                            </div>
                            {aggRec.aggregationNote && (
                              <div className="text-[11px] font-semibold text-sky-900 dark:text-sky-200">
                                Note: {aggRec.aggregationNote}
                              </div>
                            )}
                            {aggRec.components.map((comp, cIdx) => (
                              <div
                                key={`${item.id}-comp-${cIdx}`}
                                className={`flex items-center justify-between gap-3 ${
                                  comp.isParentOriginal ? 'text-sky-900 dark:text-sky-200 font-semibold' : 'text-th-muted'
                                }`}
                              >
                                <span>
                                  {comp.label}
                                  {comp.excelRowNumber ? ` (Excel Row ${comp.excelRowNumber})` : ''}
                                </span>
                                <span className="font-mono font-semibold text-th-text shrink-0">
                                  ₱ {formatAccounting(comp.amount)}
                                </span>
                              </div>
                            ))}
                            <div className="pt-1.5 border-t border-sky-200 dark:border-sky-800 flex items-center justify-between gap-3 font-bold text-sky-950 dark:text-sky-100">
                              <span>
                                {aggRec.wasAggregated ? 'Total Recorded (Aggregated)' : 'Recorded Parent Balance'}
                              </span>
                              <span className="font-mono">₱ {formatAccounting(aggRec.totalAmount)}</span>
                            </div>
                          </div>
                        )}
                      </td>

                      <td className="py-3.5 px-6 text-sm text-th-muted">
                        <div className="font-bold text-th-text">{item.subsection}</div>
                        <div className="text-sm text-th-muted">{item.group}</div>
                      </td>

                      <td
                        className={`py-3.5 px-6 text-right font-mono tabular-nums text-base ${
                          hasValue ? 'font-bold text-th-text' : 'text-th-muted font-medium'
                        }`}
                      >
                        {isEditable2024Jan1 && isEditingJan1_2024 ? (
                          <input
                            type="text"
                            value={jan1_2024Input}
                            onChange={(e) => setJan1_2024Input(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                handleSaveJan1_2024();
                              } else if (e.key === 'Escape') {
                                setIsEditingJan1_2024(false);
                              }
                            }}
                            placeholder="0.00"
                            className="w-44 ml-auto px-3 py-1.5 text-right font-mono font-bold bg-th-input border-2 border-th-accent rounded-lg text-th-text focus:outline-hidden"
                          />
                        ) : item.isContra && amt > 0 ? (
                          `(${formatAccounting(amt)})`
                        ) : (
                          formatAccounting(amt)
                        )}
                      </td>

                      <td className="py-3.5 px-6 text-right">
                        {isAutoComputedCashFlow ? (
                          <span className="inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-bold bg-th-subtle text-th-muted border border-th-border-strong">
                            Auto-Computed
                          </span>
                        ) : isEditable2024Jan1 ? (
                          isEditingJan1_2024 ? (
                            <div className="flex items-center justify-end gap-2">
                              <button
                                type="button"
                                onClick={handleSaveJan1_2024}
                                className="inline-flex items-center gap-1 text-sm font-bold text-th-accent-fg bg-th-accent hover:bg-th-accent-hover px-3.5 py-2 rounded-xl transition-colors cursor-pointer"
                              >
                                <Check className="w-4 h-4" />
                                <span>Save</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => setIsEditingJan1_2024(false)}
                                className="inline-flex items-center gap-1 text-sm font-bold text-th-text bg-th-subtle hover:bg-th-subtle-hover px-3 py-2 rounded-xl border border-th-border-strong transition-colors cursor-pointer"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center justify-end gap-2.5">
                              <button
                                type="button"
                                onClick={handleStartEditJan1_2024}
                                className="text-sm font-bold text-th-text hover:text-th-primary-fg hover:bg-th-primary px-3.5 py-2 rounded-xl bg-th-subtle border border-th-border-strong transition-colors cursor-pointer"
                              >
                                {hasValue ? 'Adjust Amount' : 'Set Jan 1 Balance'}
                              </button>
                              {hasValue && (
                                <button
                                  type="button"
                                  onClick={() => setPendingDeleteRecordedItem(item)}
                                  className="text-th-muted hover:text-red-700 dark:hover:text-red-400 p-2 rounded-xl hover:bg-red-50 dark:hover:bg-red-950/50 transition-colors cursor-pointer"
                                  title="Reset to zero"
                                >
                                  <Trash2 className="w-5 h-5" />
                                </button>
                              )}
                            </div>
                          )
                        ) : (
                          <div className="flex items-center justify-end gap-2.5">
                            <button
                              type="button"
                              onClick={() => {
                                setStagedEntries((prev) => [
                                  { id: `stage-edit-${item.id}`, lineItemId: item.id, amount: amt !== 0 ? amt.toString() : '' },
                                  ...prev,
                                ]);
                                window.scrollTo({ top: 220, behavior: 'smooth' });
                              }}
                              className="min-h-[42px] text-sm sm:text-base font-bold text-th-text hover:text-th-primary-fg hover:bg-th-primary px-4 py-2 rounded-xl bg-th-subtle border-2 border-th-border-strong transition-colors cursor-pointer"
                            >
                              {hasValue ? 'Edit Amount' : 'Add Amount'}
                            </button>
                            {hasValue && (
                              <button
                                type="button"
                                onClick={() => setPendingDeleteRecordedItem(item)}
                                className="min-w-[42px] min-h-[42px] flex items-center justify-center text-th-muted hover:text-red-700 dark:hover:text-red-400 rounded-xl hover:bg-red-50 dark:hover:bg-red-950/50 border border-transparent hover:border-red-200 dark:hover:border-red-800 transition-colors cursor-pointer"
                                title="Reset to zero"
                                aria-label={`Reset ${item.name} to zero`}
                              >
                                <Trash2 className="w-5 h-5" />
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      </div>
      {isLiveEditOpen && (
        /* [live_edit] Resizeable docked side panel or movable floating Live FS window */
        <LiveEditStatementPanel
          divisionId={selectedDivisionId}
          divisionName={currentDivision?.name || ''}
          selectedYear={selectedYear}
          selectedStatement={selectedStatement}
          lineItems={lineItems}
          liveDataStore={liveEditOverlay.liveDataStore}
          modifiedItemIds={liveEditOverlay.modifiedItemIds}
          pendingCount={liveEditOverlay.pendingCount}
          windowMode={liveEditWindowMode}
          onWindowModeChange={setLiveEditWindowMode}
          onClose={() => setIsLiveEditOpen(false)}
        />
      )}
      </div>
      )}

      {/* Confirmation Modal: Delete All / Reset to Zero */}
      <ConfirmModal
        isOpen={isDeleteAllConfirmOpen}
        title="Reset All Balances to Zero?"
        message={`Are you sure you want to reset all accounts for ${currentDivision?.name} in fiscal year ${selectedYear} back to zero? All line items will be retained with zero balances so you can manually enter new amounts.`}
        confirmLabel="Yes, Reset to Zero"
        cancelLabel="Cancel"
        variant="danger"
        onConfirm={() => {
          const allEntries = Object.entries((dataStore[selectedYear]?.[selectedDivisionId] || {}))
            .filter(([, amt]) => amt !== 0)
            .map(([lineItemId, amount]) => ({ lineItemId, amount }));
          if (allEntries.length > 0) {
            setDeletedHistory((prev) => [
              ...prev,
              { year: selectedYear, divisionId: selectedDivisionId, entries: allEntries },
            ]);
          }
          onDeleteAllDivisionAmounts(selectedYear, selectedDivisionId);
          setIsDeleteAllConfirmOpen(false);
          setSaveSuccessMsg(`Reset all balances to zero for ${currentDivision?.name} (FY ${selectedYear}).`);
          setTimeout(() => setSaveSuccessMsg(null), 4000);
        }}
        onCancel={() => setIsDeleteAllConfirmOpen(false)}
      />

      {/* Confirmation Modal: Discard Staging */}
      <ConfirmModal
        isOpen={isDiscardConfirmOpen}
        title="Clear Entry Form?"
        message="Are you sure you want to clear currently staged rows in the form? Unsaved values will be cleared."
        confirmLabel="Yes, Clear Form"
        cancelLabel="Cancel"
        variant="warning"
        onConfirm={() => {
          setStagedEntries([]);
          setIsDiscardConfirmOpen(false);
        }}
        onCancel={() => setIsDiscardConfirmOpen(false)}
      />

      {/* Notice Modal for Locked Statements */}
      <ConfirmModal
        isOpen={lockedStatementModal !== null}
        title={lockedStatementModal?.title || 'Financial Statement Locked'}
        message={lockedStatementModal?.message || ''}
        confirmLabel="Understood"
        cancelLabel="Close"
        variant="primary"
        onConfirm={() => setLockedStatementModal(null)}
        onCancel={() => setLockedStatementModal(null)}
      />

      {/* Prompt Modal: Option to save all except the line items that are highlighted red / erroneous */}
      {erroneousModalState.isOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-th-surface border-2 border-th-border-strong rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3.5">
              <div className="p-3 bg-red-100 dark:bg-red-950/80 text-red-600 dark:text-red-400 rounded-xl shrink-0">
                <AlertCircle className="w-7 h-7" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-th-text">
                  Unrecognized Line Items ({erroneousModalState.invalidCount})
                </h3>
                <p className="text-sm font-medium text-th-muted">
                  {erroneousModalState.invalidCount} line item(s) highlighted in red do not exist in the official line items database.
                </p>
              </div>
            </div>

            <div className="p-4 bg-amber-50 dark:bg-amber-950/40 border-2 border-amber-300 dark:border-amber-800 rounded-xl text-sm text-amber-900 dark:text-amber-200 space-y-1.5 font-medium">
              <p className="font-bold text-base">
                Direct saving is disabled because unrecognized line items cannot be recorded to the Financial Statement.
              </p>
              <p className="text-sm leading-relaxed text-amber-800 dark:text-amber-300">
                You can save all the valid line items right now. The red erroneous items will remain in the table for you to adjust or remove.
              </p>
            </div>

            {/* List of erroneous rows */}
            <div className="max-h-48 overflow-y-auto space-y-2 border-2 border-th-border-strong rounded-xl p-3 bg-th-subtle">
              <div className="text-xs uppercase font-bold text-th-muted px-1">
                Erroneous Items (Not in Database):
              </div>
              {erroneousModalState.invalidRows.map((row, idx) => (
                <div
                  key={row.id}
                  className="flex items-center justify-between text-sm px-3 py-2 bg-red-50 dark:bg-red-950/50 border border-red-300 dark:border-red-900/80 rounded-lg text-red-900 dark:text-red-200 font-medium"
                >
                  <span className="font-bold truncate mr-2">
                    {row.rawText?.trim() || `(Empty Line Item, Row #${idx + 1})`}
                  </span>
                  <span className="font-mono text-red-800 dark:text-red-300 font-bold shrink-0">
                    {row.amount ? `₱ ${row.amount}` : '₱ 0.00'}
                  </span>
                </div>
              ))}
            </div>

            {/* Summary Counters */}
            <div className="flex items-center justify-between text-sm px-1 text-th-text font-semibold">
              <span>Valid items to be saved: <strong className="text-th-text text-base font-bold">{erroneousModalState.validCount}</strong></span>
              <span>Erroneous items to exclude: <strong className="text-red-700 dark:text-red-400 text-base">{erroneousModalState.invalidCount}</strong></span>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row justify-end gap-3 pt-3 border-t-2 border-th-border">
              <button
                type="button"
                onClick={handleCancelErroneousModal}
                className="px-4 py-2.5 text-sm font-bold text-th-text bg-th-subtle border-2 border-th-border-strong hover:bg-th-subtle-hover rounded-xl transition-colors cursor-pointer"
              >
                Cancel & Fix Entries
              </button>

              <button
                type="button"
                disabled={erroneousModalState.validCount === 0}
                onClick={handleSaveValidExceptErroneous}
                className="px-5 py-2.5 text-sm font-bold text-th-accent-fg bg-th-accent hover:bg-th-accent-hover disabled:opacity-50 disabled:cursor-not-allowed rounded-xl shadow-sm transition-colors flex items-center justify-center gap-2 cursor-pointer"
              >
                <Check className="w-5 h-5" />
                <span>Save All Except Erroneous ({erroneousModalState.validCount})</span>
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={Boolean(pendingDeleteRecordedItem)}
        title="Delete Recorded Balance"
        message={`Are you sure you want to delete "${pendingDeleteRecordedItem?.name}" for ${currentDivision?.name} (FY ${selectedYear})?`}
        confirmLabel="Delete Balance"
        variant="danger"
        onConfirm={() => {
          if (pendingDeleteRecordedItem) {
            const amt = (dataStore[selectedYear]?.[selectedDivisionId] || {})[pendingDeleteRecordedItem.id] || 0;
            if (amt !== 0) {
              setDeletedHistory((prev) => [
                ...prev,
                { year: selectedYear, divisionId: selectedDivisionId, entries: [{ lineItemId: pendingDeleteRecordedItem.id, amount: amt }] },
              ]);
            }
            onDeleteAmount(selectedYear, selectedDivisionId, pendingDeleteRecordedItem.id);
            setSelectedRecordedIds((prev) => prev.filter((id) => id !== pendingDeleteRecordedItem.id));
            setPendingDeleteRecordedItem(null);
          }
        }}
        onCancel={() => setPendingDeleteRecordedItem(null)}
      />

      <ConfirmModal
        isOpen={pendingDeleteSelectedRecorded}
        title="Delete Selected Balances"
        message={`Are you sure you want to delete ${selectedRecordedIds.length} selected line item${selectedRecordedIds.length === 1 ? '' : 's'} for ${currentDivision?.name} (FY ${selectedYear})?`}
        confirmLabel={`Delete ${selectedRecordedIds.length} Selected`}
        variant="danger"
        onConfirm={() => {
          const entriesToRestore = selectedRecordedIds
            .map((id) => ({ lineItemId: id, amount: (dataStore[selectedYear]?.[selectedDivisionId] || {})[id] || 0 }))
            .filter((e) => e.amount !== 0);
          if (entriesToRestore.length > 0) {
            setDeletedHistory((prev) => [
              ...prev,
              { year: selectedYear, divisionId: selectedDivisionId, entries: entriesToRestore },
            ]);
          }
          selectedRecordedIds.forEach((id) => {
            onDeleteAmount(selectedYear, selectedDivisionId, id);
          });
          setIsSelectMultipleMode(false);
          setSelectedRecordedIds([]);
          setPendingDeleteSelectedRecorded(false);
        }}
        onCancel={() => setPendingDeleteSelectedRecorded(false)}
      />

      {/* Confirmation Alarm: Adjusting FY 2024 Beginning Balance (Cash Flows & Net Assets/Equity) */}
      <ConfirmModal
        isOpen={pendingConfirmJan1_2024 !== null}
        title="Confirm FY 2024 Beginning Balance Change"
        message={
          pendingConfirmJan1_2024
            ? `Are you sure you want to change "${pendingConfirmJan1_2024.accountName}" for ${currentDivision?.name} (FY 2024) from ₱${formatAccounting(pendingConfirmJan1_2024.previousAmount, false)} to ₱${formatAccounting(pendingConfirmJan1_2024.newAmount, false)}? This opening balance directly affects FY 2024 ending balances and carries forward to subsequent years.`
            : ''
        }
        confirmLabel="Yes, Save Change"
        cancelLabel="Cancel"
        variant="warning"
        onConfirm={() => {
          if (pendingConfirmJan1_2024) {
            onSaveBatchAmounts('2024', selectedDivisionId, [
              { lineItemId: pendingConfirmJan1_2024.lineItemId, amount: pendingConfirmJan1_2024.newAmount },
            ]);
            setSaveSuccessMsg(
              `Updated ${pendingConfirmJan1_2024.accountName} for ${currentDivision?.name} (FY 2024) to ₱${formatAccounting(pendingConfirmJan1_2024.newAmount, false)}.`
            );
            setTimeout(() => setSaveSuccessMsg(null), 4000);
            setPendingConfirmJan1_2024(null);
            setIsEditingJan1_2024(false);
          }
        }}
        onCancel={() => setPendingConfirmJan1_2024(null)}
      />

      {/* Smart Financial Statement Excel/CSV Preview & Mapping Modal */}
      <ExcelPositionImportModal
        isOpen={positionImportModal.isOpen}
        statementType={selectedStatement}
        workbook={positionImportModal.workbook}
        fileName={positionImportModal.fileName}
        divisionId={selectedDivisionId}
        divisionName={currentDivision?.name || 'Selected Division'}
        selectedYear={selectedYear}
        dataStore={dataStore}
        encodableItems={excelImportEncodableItems}
        onClose={() =>
          setPositionImportModal({ isOpen: false, workbook: null, fileName: '' })
        }
        onStageToBatch={(targetYear, entries) => {
          const importedEntries: StagedEntry[] = entries.map((entry, idx) => ({
            id: `import-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
            lineItemId: entry.lineItemId,
            rawText: entry.rawText,
            amount: entry.amount,
            aggregationRecord: entry.aggregationRecord,
          }));
          setStagedEntries((prev) => {
            const nonBlankPrev = prev.filter((r) => r.lineItemId || r.rawText?.trim() || r.amount?.trim());
            return [...nonBlankPrev, ...importedEntries];
          });
          const matchedCount = importedEntries.filter((e) => Boolean(e.lineItemId)).length;
          const unmatchedCount = importedEntries.length - matchedCount;
          const yearNote =
            targetYear !== selectedYear
              ? ` (Note: extracted from FY ${targetYear} column — active workspace is FY ${selectedYear})`
              : '';
          setUploadFeedback({
            message: `Loaded ${importedEntries.length} row${importedEntries.length === 1 ? '' : 's'} into Batch Table (${matchedCount} matched, ${unmatchedCount} need review)${yearNote}.`,
            isError: false,
          });
          setTimeout(() => setUploadFeedback(null), 8000);
        }}
        onSaveYearsDirectly={(savesByYear, unmatchedToStage) => {
          let totalSaved = 0;
          const yearSummaries: string[] = [];
          savesByYear.forEach(({ year, entries, aggregationRecords }) => {
            if (entries.length > 0) {
              onSaveBatchAmounts(year, selectedDivisionId, entries, aggregationRecords);
              totalSaved += entries.length;
              yearSummaries.push(`FY ${year} (${entries.length})`);
            }
          });

          if (unmatchedToStage && unmatchedToStage.length > 0) {
            const stagedUnmatched: StagedEntry[] = unmatchedToStage.map((entry, idx) => ({
              id: `import-unmatched-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
              lineItemId: '',
              rawText: entry.rawText,
              amount: entry.amount,
            }));
            setStagedEntries((prev) => {
              const nonBlankPrev = prev.filter((r) => r.lineItemId || r.rawText?.trim() || r.amount?.trim());
              return [...nonBlankPrev, ...stagedUnmatched];
            });
          }

          if (totalSaved > 0) {
            const extraUnmatched =
              unmatchedToStage && unmatchedToStage.length > 0
                ? ` ${unmatchedToStage.length} unmatched item(s) loaded into Batch Table for manual selection.`
                : '';
            setSaveSuccessMsg(
              `Imported & saved for ${currentDivision?.name}: ${yearSummaries.join(', ')}.${extraUnmatched}`
            );
            setTimeout(() => setSaveSuccessMsg(null), 6000);
          }
        }}
      />
        </div>
      </div>
    </div>
  );
};
