import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Division, LineItemDefinition, FinancialDataStore } from '../types/fs';
import { formatAccounting, parseNumberInput } from '../utils/formatters';
import { getComparativeYear } from '../utils/yearUtils';
import { SearchableLineItemSelect, normalizeAlphanumeric } from './SearchableLineItemSelect';
import * as XLSX from 'xlsx';
import { 
  Plus, 
  Trash2, 
  Calendar, 
  Check, 
  FileText, 
  ChevronRight, 
  Layers, 
  RotateCcw,
  CheckCircle2,
  Eye,
  EyeOff,
  Lock,
  FileSpreadsheet,
  Zap,
  ArrowDown,
  Keyboard,
  AlertCircle,
  PenTool,
  Calculator,
  Upload,
  X,
} from 'lucide-react';
import { ConfirmModal } from './ConfirmModal';
import { FinancialStatementSidebar } from './FinancialStatementSidebar';
import { ExcelPositionImportModal } from './ExcelPositionImportModal';
import { calculateCashFlowsSummary } from '../utils/cashFlowCalculations';
import { calculateNetAssetsSummary } from '../utils/netAssetsCalculations';

export type FinancialStatementType = 'position' | 'performance' | 'cash_flows' | 'net_assets';

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
];

interface StatementEncodingMeta {
  topPlaceholder: string;
  rowPlaceholder: string;
  batchExampleTyped: string;
  batchExampleMatched: string;
  frequentAccounts: { id: string; label: string }[];
}

const STATEMENT_ENCODING_META: Record<FinancialStatementType, StatementEncodingMeta> = {
  position: {
    topPlaceholder: 'Type or click to choose account (e.g. Cash, Office Equip)...',
    rowPlaceholder: 'Enter account (e.g. Cash, Office Equip)...',
    batchExampleTyped: 'cash collecting',
    batchExampleMatched: 'Cash - Collecting Officer',
    frequentAccounts: [
      { id: 'cash_collecting_officer', label: 'Cash - Collecting Officer' },
      { id: 'petty_cash_fund', label: 'Petty Cash' },
      { id: 'cash_bank_current_acct', label: 'Cash in Bank' },
      { id: 'school_buildings', label: 'School Buildings' },
      { id: 'office_equipment', label: 'Office Equipment' },
      { id: 'accounts_payable', label: 'Accounts Payable' },
      { id: 'due_to_bir', label: 'Due to BIR' },
      { id: 'accumulated_surplus_deficit', label: 'Govt Equity' },
    ],
  },
  performance: {
    topPlaceholder: 'Type or click to choose line item (e.g. Salaries, Office Supplies)...',
    rowPlaceholder: 'Enter line item (e.g. Salaries, Office Supplies)...',
    batchExampleTyped: 'salaries regular',
    batchExampleMatched: 'Salaries and Wages - Regular',
    frequentAccounts: [
      { id: 'perf-ps-salaries-reg', label: 'Salaries - Regular' },
      { id: 'perf-ps-pera', label: 'PERA' },
      { id: 'perf-mooe-office-sup', label: 'Office Supplies' },
      { id: 'perf-mooe-travel-local', label: 'Travel - Local' },
      { id: 'perf-mooe-electricity', label: 'Electricity Expenses' },
      { id: 'perf-mooe-repairs-bldg', label: 'Repairs - Buildings' },
      { id: 'perf-nc-depr-bldg', label: 'Depreciation - Buildings' },
      { id: 'perf-tr-sub-ng', label: 'Subsidy from NG' },
    ],
  },
  cash_flows: {
    topPlaceholder: 'Type or click to choose line item (e.g. Notice of Cash Allocation, Personnel Services)...',
    rowPlaceholder: 'Enter line item (e.g. Receipt of NCA, Personnel Services)...',
    batchExampleTyped: 'payment personnel',
    batchExampleMatched: 'Payment of personnel services',
    frequentAccounts: [
      { id: 'cf-op-in-nca-1', label: 'Receipt of NCA' },
      { id: 'cf-op-in-rev-2', label: 'Service & Business Income' },
      { id: 'cf-op-in-sub-1', label: 'Subsidy from NGAs' },
      { id: 'cf-op-out-exp-1', label: 'Payment of Personnel Services' },
      { id: 'cf-op-out-exp-2', label: 'Payment of MOOE' },
      { id: 'cf-op-out-ap-1', label: 'Payment of Accounts Payables' },
      { id: 'cf-op-out-ded-1', label: 'Remittance of Taxes (TRA)' },
      { id: 'cf-inv-out-ppe-4', label: 'Construction of Buildings' },
    ],
  },
  net_assets: {
    topPlaceholder: 'Type or click to choose line item (e.g. Surplus/(Deficit), Prior period errors)...',
    rowPlaceholder: 'Enter line item (e.g. Surplus/(Deficit), Accounting Policy)...',
    batchExampleTyped: 'surplus deficit',
    batchExampleMatched: 'Surplus/(Deficit) for the Period',
    frequentAccounts: [
      { id: 'na-adj-accounting-policy', label: 'Changes in Accounting Policy' },
      { id: 'na-adj-prior-period-errors', label: 'Prior period errors' },
      { id: 'na-adj-other-adjustments', label: 'Other Adjustments' },
      { id: 'na-cy-surplus-deficit', label: 'Surplus/(Deficit) for the Period' },
      { id: 'na-cy-net-revenue-adj', label: 'Net Revenue Recognized Directly' },
      { id: 'na-cy-others', label: 'Others' },
    ],
  },
};

interface StagedEntry {
  id: string;
  lineItemId: string;
  rawText?: string;
  amount: string;
}

interface DataEntryFormProps {
  divisions: Division[];
  lineItems: LineItemDefinition[];
  selectedDivisionId: string;
  selectedYear: string;
  dataStore: FinancialDataStore;
  onSaveBatchAmounts: (year: string, divisionId: string, entries: { lineItemId: string; amount: number }[]) => void;
  onDeleteAmount: (year: string, divisionId: string, lineItemId: string) => void;
  onDeleteAllDivisionAmounts: (year: string, divisionId: string) => void;
  onNavigateToViewFS: () => void;
  onAddLineItemPrompt: (name: string, group: string) => void;
  onDeleteLineItemPrompt: (item: LineItemDefinition) => void;
}

export const DataEntryForm: React.FC<DataEntryFormProps> = ({
  divisions,
  lineItems,
  selectedDivisionId,
  selectedYear,
  dataStore,
  onSaveBatchAmounts,
  onDeleteAmount,
  onDeleteAllDivisionAmounts,
  onNavigateToViewFS,
  onAddLineItemPrompt,
  onDeleteLineItemPrompt,
}) => {
  // Financial Statement selection (Financial Position active, others locked)
  const [selectedStatement, setSelectedStatement] = useState<FinancialStatementType>('position');
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
    setIsEditingJan1_2024(false);
    setPendingConfirmJan1_2024(null);
  }, [selectedYear, selectedDivisionId, selectedStatement]);

  // Top Quick Account Selector state (allows freely picking or typing on top)
  const [topSelectedItemId, setTopSelectedItemId] = useState<string>('');
  const [topRawText, setTopRawText] = useState<string>('');
  const [topAmountInput, setTopAmountInput] = useState<string>('');
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
    setTopSelectedItemId('');
    setTopRawText('');
    setTopAmountInput('');
    setTopFeedbackMsg(null);
  }, [selectedStatement]);

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
    validEntriesToSave: { lineItemId: string; amount: number; rowId: string }[];
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
    () => new Set(['cf-sum-beg-cash', 'cf-sum-end-cash', 'cf-sum-net-inc-dec']),
    []
  );

  const NON_ENCODABLE_NET_ASSETS_IDS = useMemo(
    () => new Set(['na-beg-balance', 'na-restated-balance', 'na-end-balance']),
    []
  );

  const NON_ENCODABLE_SUMMARY_IDS = useMemo(
    () => new Set([...NON_ENCODABLE_CASH_FLOW_IDS, ...NON_ENCODABLE_NET_ASSETS_IDS]),
    [NON_ENCODABLE_CASH_FLOW_IDS, NON_ENCODABLE_NET_ASSETS_IDS]
  );

  const encodableStatementLineItems = useMemo(() => {
    return activeStatementLineItems.filter((item) => !NON_ENCODABLE_SUMMARY_IDS.has(item.id));
  }, [activeStatementLineItems, NON_ENCODABLE_SUMMARY_IDS]);

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

    // If user wrote text or entered an amount, but no recognized lineItemId was matched:
    if (hasText || hasAmount) {
      if (hasText) {
        const nameMatch = encodableStatementLineItems.some(
          (item) => item.name.toLowerCase().trim() === row.rawText!.toLowerCase().trim()
        );
        if (nameMatch) return false;
      }
      return true; // Not in the database of line items for active statement!
    }

    // Completely blank row (not yet edited)
    return false;
  };

  // Top account invalid check
  const isTopInvalid = Boolean(
    (topRawText.trim() || (topAmountInput.trim() && parseNumberInput(topAmountInput) !== 0)) &&
    !encodableStatementLineItems.some((i) => i.id === topSelectedItemId || (topRawText.trim() && i.name.toLowerCase().trim() === topRawText.toLowerCase().trim()))
  );

  // Staged rows for batch multiple entries (starts blank with 0 items on startup as requested)
  const [stagedEntries, setStagedEntries] = useState<StagedEntry[]>([]);

  // Track which row dropdown is currently open to elevate its stacking context
  const [activeDropdownRowId, setActiveDropdownRowId] = useState<string | null>(null);

  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);

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

  // Confirmation for discarding staged entries
  const [isDiscardConfirmOpen, setIsDiscardConfirmOpen] = useState(false);

  // Confirmation for Delete All Records function (Reset all to zero)
  const [isDeleteAllConfirmOpen, setIsDeleteAllConfirmOpen] = useState(false);

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
      // in Cash and Cash Equivalents added to (subtracted to) Cash and Cash Equivalents, January 1
      const effectiveJan1 = merged['cf-sum-beg-cash'] !== undefined ? merged['cf-sum-beg-cash'] : cashFlowsSummary.january1Cash;
      const effectiveNet = merged['cf-sum-net-inc-dec'] !== undefined ? merged['cf-sum-net-inc-dec'] : cashFlowsSummary.netIncreaseDecrease;
      merged['cf-sum-end-cash'] = effectiveJan1 + effectiveNet;

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

      // Statement of Financial Position uses the smart Year-Header & Misspelling-Tolerant Import Modal
      if (selectedStatement === 'position') {
        setPositionImportModal({
          isOpen: true,
          workbook,
          fileName: file.name,
        });
        return;
      }

      const sheet = workbook.Sheets[firstSheetName];
      const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' });

      const IGNORED_CASH_FLOW_UPLOAD_NAMES = new Set([
        'cashandcashequivalentsdecember31',
        'cashandcashequivalentsjanuary1',
        'increasedecreaseincashandcashequivalents',
      ]);

      const IGNORED_NET_ASSETS_UPLOAD_NAMES = new Set([
        'balanceatjanuary1',
        'balanceofjanuary1',
        'restatedbalance',
        'balanceatdecember31',
        'balanceofdecember31',
      ]);

      const importedEntries: StagedEntry[] = [];
      let matchedCount = 0;
      let unmatchedCount = 0;
      let ignoredSummaryCount = 0;

      rows.forEach((row, idx) => {
        if (!Array.isArray(row)) return;
        const rawName = String(row[0] ?? '').trim();
        const rawAmountCell = row[1];
        const rawAmountStr = String(rawAmountCell ?? '').trim();

        // Skip completely empty rows
        if (!rawName && !rawAmountStr) return;

        // Skip common header rows (e.g., "Line Item | Amount")
        if (idx === 0) {
          const lowerName = rawName.toLowerCase();
          const lowerAmt = rawAmountStr.toLowerCase();
          const looksLikeHeaderText =
            ['line item', 'line item account', 'account', 'account title', 'particulars', 'description', 'item'].includes(lowerName) ||
            ['amount', 'balance', 'value', 'total'].includes(lowerAmt);
          const isAmtNumeric = rawAmountStr !== '' && !Number.isNaN(Number(rawAmountStr.replace(/[₱$,\s]/g, '')));
          if (looksLikeHeaderText && !isAmtNumeric) {
            return;
          }
        }

        if (!rawName) return;

        const alphaName = normalizeAlphanumeric(rawName);
        if (
          (selectedStatement === 'cash_flows' && IGNORED_CASH_FLOW_UPLOAD_NAMES.has(alphaName)) ||
          (selectedStatement === 'net_assets' && IGNORED_NET_ASSETS_UPLOAD_NAMES.has(alphaName))
        ) {
          ignoredSummaryCount++;
          return;
        }

        if (!rawAmountStr) return;

        // Parse amount and ignore rows where Column B is zero or has no numeric value
        let numericAmount = 0;
        if (typeof rawAmountCell === 'number') {
          numericAmount = rawAmountCell;
        } else {
          numericAmount = parseNumberInput(rawAmountStr);
        }
        if (numericAmount === 0) return;

        const amountStr = formatAccounting(numericAmount);

        // Match against encodable official lineItems database (exact or normalized alphanumeric)
        const lowerName = rawName.toLowerCase();
        const matchedItem = encodableStatementLineItems.find(
          (item) =>
            item.name.toLowerCase() === lowerName ||
            (alphaName && normalizeAlphanumeric(item.name) === alphaName)
        );

        if (matchedItem) {
          matchedCount++;
          importedEntries.push({
            id: `import-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
            lineItemId: matchedItem.id,
            rawText: matchedItem.name,
            amount: amountStr,
          });
        } else {
          unmatchedCount++;
          importedEntries.push({
            id: `import-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
            lineItemId: '',
            rawText: rawName,
            amount: amountStr,
          });
        }
      });

      if (importedEntries.length === 0) {
        setUploadFeedback({
          message:
            ignoredSummaryCount > 0
              ? `No encodable rows found (${ignoredSummaryCount} auto-computed summary row${ignoredSummaryCount === 1 ? '' : 's'} ignored).`
              : 'No valid rows found in columns A & B of the uploaded file.',
          isError: true,
        });
      } else {
        setStagedEntries((prev) => {
          const nonBlankPrev = prev.filter((r) => r.lineItemId || r.rawText?.trim() || r.amount?.trim());
          return [...nonBlankPrev, ...importedEntries];
        });
        const ignoredSuffix =
          ignoredSummaryCount > 0
            ? `; ${ignoredSummaryCount} auto-computed summary row${ignoredSummaryCount === 1 ? '' : 's'} ignored`
            : '';
        setUploadFeedback({
          message: `Imported ${importedEntries.length} row${importedEntries.length === 1 ? '' : 's'} from "${file.name}" (${matchedCount} matched, ${unmatchedCount} not in database${ignoredSuffix}).`,
          isError: false,
        });
      }
    } catch (err) {
      console.error('Failed to parse uploaded file:', err);
      setUploadFeedback({ message: 'Failed to read file. Please upload a valid .xlsx, .xls, or .csv file.', isError: true });
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      setTimeout(() => setUploadFeedback(null), 7000);
    }
  };

  // Top Quick Account Selector action: Add or update directly in the batch staging list
  const handleAddTopItemToBatch = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!topSelectedItemId && !topRawText.trim()) return;

    // Resolve if line item is in encodable active statement database
    const resolvedItem = encodableStatementLineItems.find(
      (i) =>
        i.id === topSelectedItemId ||
        (topRawText.trim() && i.name.toLowerCase().trim() === topRawText.toLowerCase().trim())
    );

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
    setTopSelectedItemId('');
    setTopRawText('');
    setTopAmountInput('');
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

    // Check which rows are invalid (not in database)
    const invalidRows = activeRows.filter(isRowLineItemInvalid);

    // Extract valid rows with amounts
    const validEntriesToSave: { lineItemId: string; amount: number; rowId: string }[] = [];
    activeRows.forEach((row) => {
      if (!isRowLineItemInvalid(row)) {
        let resolvedId = row.lineItemId;
        if (!resolvedId && row.rawText) {
          const match = encodableStatementLineItems.find(
            (i) => i.name.toLowerCase().trim() === row.rawText!.toLowerCase().trim()
          );
          if (match) resolvedId = match.id;
        }
        if (resolvedId && row.amount && row.amount.trim() !== '') {
          validEntriesToSave.push({
            lineItemId: resolvedId,
            amount: parseNumberInput(row.amount),
            rowId: row.id,
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

    // Direct save when all active rows are valid:
    onSaveBatchAmounts(
      selectedYear,
      selectedDivisionId,
      validEntriesToSave.map(({ lineItemId, amount }) => ({ lineItemId, amount }))
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
      onSaveBatchAmounts(
        selectedYear,
        selectedDivisionId,
        validEntriesToSave.map(({ lineItemId, amount }) => ({ lineItemId, amount }))
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
      {/* Batch Multiple Entries Form */}
      <div className="bg-th-surface border-2 border-th-border rounded-2xl p-6 shadow-xs transition-colors">
        {/* Header with Title and Presets */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-th-border gap-3 mb-5">
          <div>
            <h3 className="text-lg sm:text-xl font-bold text-th-text flex items-center gap-2.5">
              <Layers className="w-5 h-5 text-th-muted" />
              <span>Batch Data Entry</span>
              {validStagedCount > 0 && (
                <span className="text-xs font-bold text-th-text bg-th-subtle px-2.5 py-0.5 rounded-lg border border-th-border-strong">
                  {validStagedCount} ready to save
                </span>
              )}
            </h3>
            <p className="text-sm text-th-muted mt-1 leading-relaxed">
              Select or type any line item from the official list. Missing hyphens and spaces are automatically matched (for example, typing <strong className="text-th-text font-bold">&quot;{activeEncodingMeta.batchExampleTyped}&quot;</strong> suggests <strong className="text-th-text font-bold">&quot;{activeEncodingMeta.batchExampleMatched}&quot;</strong>).
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
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
              className="text-sm font-bold text-th-primary-fg bg-th-primary hover:opacity-90 px-3.5 py-2 rounded-lg border border-th-primary dark:border-th-border-strong transition-colors inline-flex items-center gap-1.5 cursor-pointer"
              title={
                selectedStatement === 'position'
                  ? 'Upload any Statement of Financial Position Excel (.xlsx, .xls) or CSV file with Year headers (e.g. 2025, 2024) and line items before amounts'
                  : 'Upload an Excel (.xlsx, .xls) or CSV file with Line Item Account in Column A and Amount in Column B'
              }
            >
              <Upload className="w-4 h-4" />
              <span>Upload Excel / CSV</span>
            </button>
            <button
              type="button"
              onClick={handleAddStagedRow}
              className="text-sm font-semibold text-th-text bg-th-subtle hover:bg-th-subtle-hover border border-th-border-strong px-3 py-2 rounded-lg transition-colors inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-4 h-4 text-th-muted" />
              Add 1 Row
            </button>
            <button
              type="button"
              onClick={handleAdd5StagedRows}
              className="text-sm font-semibold text-th-text bg-th-subtle hover:bg-th-subtle-hover border border-th-border-strong px-3 py-2 rounded-lg transition-colors inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-4 h-4 text-th-muted" />
              Add 5 Rows
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
        <div className="mb-7 p-6 sm:p-7 bg-th-subtle border-2 border-th-border-strong rounded-2xl shadow-sm transition-all">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 pb-3 border-b border-th-border">
            <div className="flex items-center gap-3 flex-wrap">
              <div className="px-3.5 py-1.5 rounded-lg bg-th-primary text-th-primary-fg border border-th-border-strong text-xs font-extrabold uppercase tracking-wider shadow-xs flex items-center gap-2">
                <PenTool className="w-4 h-4" />
                <span>DATA ENCODING STATION</span>
              </div>
              <h3 className="text-xl sm:text-2xl font-extrabold text-th-text">
                Enter Line Item &amp; Balance Here
              </h3>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-bold text-th-primary-fg bg-th-primary border border-th-border-strong px-3.5 py-1.5 rounded-xl shadow-xs flex items-center gap-1.5">
                <Calendar className="w-4 h-4" />
                <span>Operating Year: FY {selectedYear}</span>
              </span>
              <span className="text-sm font-semibold text-th-text bg-th-surface px-3.5 py-1.5 rounded-xl border border-th-border-strong shadow-xs">
                Primary Data Entry Area
              </span>
            </div>
          </div>

          <p className="text-sm sm:text-base text-th-muted font-medium mb-5 leading-relaxed">
            Select or type the official line item on the left, enter the monetary balance in the middle, then click <strong className="text-th-text font-bold">&quot;Add to Batch&quot;</strong> or press <strong className="text-th-text font-bold">Enter</strong>.
          </p>

          <form onSubmit={handleAddTopItemToBatch} className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
            {/* Step 1: Searchable Combobox */}
            <div className="md:col-span-7">
              <label className="block text-sm font-bold text-th-text mb-1.5 flex items-center gap-2">
                <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-th-primary text-th-primary-fg text-xs font-bold">1</span>
                <span>Select or Type Line Item Account</span>
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
              {topSelectedItemDetail && (
                <div className="mt-2 flex items-center gap-2 text-xs sm:text-sm font-semibold text-th-text bg-th-surface px-3 py-1.5 rounded-lg border border-th-border-strong shadow-2xs animate-in fade-in">
                  <span className="font-bold text-th-text">Selected:</span>
                  <span className="font-bold">{topSelectedItemDetail.name}</span>
                  <span>·</span>
                  <span className="text-th-muted">{topSelectedItemDetail.subsection} ({topSelectedItemDetail.group})</span>
                  {topSelectedItemDetail.isContra && (
                    <span className="px-1.5 py-0.5 rounded bg-th-subtle text-th-text text-xs font-bold border border-th-border-strong">Contra Account</span>
                  )}
                </div>
              )}
            </div>

            {/* Step 2: Amount Input */}
            <div className="md:col-span-3">
              <label className="block text-sm font-bold text-th-text mb-1.5 flex items-center gap-2">
                <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-th-primary text-th-primary-fg text-xs font-bold">2</span>
                <span>Enter Amount (₱ Balance)</span>
              </label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-th-muted font-mono text-lg font-bold">
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
                  className="w-full pl-9 pr-4 py-3.5 text-lg font-mono font-bold tabular-nums text-right bg-th-input border-2 border-th-border-strong rounded-xl text-th-text focus:outline-hidden focus:border-th-accent focus:ring-4 focus:ring-th-accent/20 shadow-xs"
                />
              </div>
              {topAmountInput.trim() !== '' && (
                <div className="mt-2 flex items-center justify-between text-xs px-1">
                  <span className="font-mono font-semibold text-th-muted">
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

            {/* Step 3: Add to Batch Button */}
            <div className="md:col-span-2">
              <button
                type="submit"
                disabled={!topSelectedItemId && !topRawText.trim()}
                className="w-full py-3.5 px-5 text-base font-bold text-th-accent-fg bg-th-accent hover:bg-th-accent-hover active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed rounded-xl shadow-md transition-all flex items-center justify-center gap-2 border-2 border-th-accent cursor-pointer"
              >
                <Plus className="w-5 h-5 stroke-[2.5]" />
                <span>Add to Batch</span>
              </button>
            </div>
          </form>

          {/* Quick preset chips underneath top bar */}
          <div className="mt-5 pt-3.5 border-t border-th-border flex items-center gap-2 flex-wrap">
            <span className="text-sm font-bold text-th-text mr-1">
              Frequent Accounts:
            </span>
            {activeEncodingMeta.frequentAccounts.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => {
                  const matched = encodableStatementLineItems.find((i) => i.id === preset.id);
                  setTopSelectedItemId(preset.id);
                  setTopRawText(matched ? matched.name : preset.label);
                  topAmountInputRef.current?.focus();
                }}
                className={`text-sm font-semibold px-3 py-1.5 rounded-xl transition-colors border cursor-pointer ${
                  topSelectedItemId === preset.id
                    ? 'bg-th-primary text-th-primary-fg border-th-primary dark:border-th-border-strong font-bold'
                    : 'bg-th-surface text-th-text border-th-border-strong hover:bg-th-subtle-hover'
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>

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
          {/* Clean, Senior-Friendly Keyboard Tips Callout */}
          <div className="mb-4 px-5 py-3.5 bg-th-subtle border border-th-border-strong rounded-xl flex flex-wrap items-center justify-between text-sm text-th-text gap-4 shadow-2xs">
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className="font-bold text-th-text flex items-center gap-2">
                <Keyboard className="w-5 h-5 text-th-muted" />
                <span>Tips for fast entry:</span>
              </span>
              <span className="text-th-muted font-medium">Use ↑ and ↓ arrow keys to highlight an option</span>
              <span className="text-th-muted font-bold">·</span>
              <span className="text-th-muted font-medium">Press Tab or Enter to select &amp; enter amount</span>
              <span className="text-th-muted font-bold">·</span>
              <span className="text-th-muted font-medium">Enter on amount advances to next line</span>
            </div>

            <div className="text-sm font-bold text-th-text bg-th-surface px-3.5 py-1.5 rounded-lg border border-th-border-strong">
              Shortcut: Shift + Enter to Save All
            </div>
          </div>

          {/* If there are invalid/unrecognized items highlighted in red, display clear notice */}
          {invalidStagedCount > 0 && (
            <div className="mb-4 px-5 py-3.5 bg-red-50 dark:bg-red-950/60 border-2 border-red-300 dark:border-red-800 rounded-xl flex items-center justify-between gap-3 text-base animate-in fade-in">
              <div className="flex items-center gap-3 text-red-950 dark:text-red-100">
                <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0" />
                <span>
                  <strong>{invalidStagedCount} line item{invalidStagedCount > 1 ? 's are' : ' is'} highlighted in red</strong> because {invalidStagedCount > 1 ? 'they do' : 'it does'} not exist in the official line items database.
                </span>
              </div>
              <span className="text-sm text-red-800 dark:text-red-300 font-bold whitespace-nowrap shrink-0">
                Saving will offer to save valid items only.
              </span>
            </div>
          )}

          {/* Live Batch Tape Summary & Running Total Bar */}
          <div className="mb-4 px-5 py-3.5 bg-th-subtle border border-th-border-strong rounded-xl flex flex-wrap items-center justify-between gap-4 text-base shadow-2xs">
            <div className="flex items-center gap-4 flex-wrap">
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
              <div className="flex items-center gap-2 text-sm">
                <span className="text-th-text font-bold">Total Batch Balance:</span>
                <span className="font-extrabold font-mono text-lg text-th-text bg-th-surface px-3.5 py-1 rounded-lg border-2 border-th-border-strong shadow-2xs">
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
            <div className="bg-th-table-head px-5 py-3.5 border-b-2 border-th-border rounded-t-xl grid grid-cols-12 gap-3 text-sm font-bold text-th-table-head-fg uppercase tracking-wider">
              <div className="col-span-1 text-center">#</div>
              <div className="col-span-7">Line Item (Type to Search)</div>
              <div className="col-span-3 text-right">Amount (₱ Balance)</div>
              <div className="col-span-1 text-center">Remove</div>
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

                return (
                  <div
                    key={row.id}
                    className={`px-4 py-3 grid grid-cols-12 gap-3.5 items-center hover:bg-th-subtle transition-colors ${
                      isThisRowDropdownOpen ? 'relative z-50 bg-th-subtle' : 'relative z-auto'
                    }`}
                  >
                    <div className="col-span-1 text-center font-mono text-base font-bold text-th-text">
                      {idx + 1}
                    </div>

                    {/* Searchable Combobox with Arrow Navigation, Tab/Enter Selection & Red Highlight when not in database */}
                    <div className="col-span-7">
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
                    </div>

                    {/* Amount Input with Auto-Advance to Next Line Item & Shift+Enter Save */}
                    <div className="col-span-3">
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
                    <div className="col-span-1 text-center">
                      <button
                        type="button"
                        onClick={() => handleRemoveStagedRow(row.id)}
                        className="p-2.5 text-th-muted hover:text-red-700 dark:hover:text-red-400 rounded-xl hover:bg-red-50 dark:hover:bg-red-950/50 transition-colors cursor-pointer"
                        title="Remove row"
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
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-3">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleAddStagedRow}
                className="px-5 py-3 text-base font-bold text-th-text bg-th-subtle border-2 border-th-border-strong hover:bg-th-subtle-hover rounded-xl transition-colors inline-flex items-center gap-2 shadow-2xs cursor-pointer"
              >
                <Plus className="w-5 h-5 text-th-muted" />
                <span>Add Row</span>
              </button>
              <button
                type="button"
                onClick={() => setIsDiscardConfirmOpen(true)}
                className="px-5 py-3 text-base font-semibold text-th-muted hover:text-red-700 dark:hover:text-red-400 rounded-xl hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors inline-flex items-center gap-2 cursor-pointer"
              >
                <RotateCcw className="w-5 h-5" />
                <span>Clear Form</span>
              </button>
            </div>

            <div className="flex flex-col sm:flex-row items-center gap-3.5 w-full sm:w-auto">
              {invalidStagedCount > 0 && (
                <span className="text-base text-red-800 dark:text-red-300 font-bold flex items-center gap-2 bg-red-50 dark:bg-red-950/60 px-4 py-2.5 rounded-xl border border-red-300 dark:border-red-800">
                  <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
                  <span>{invalidStagedCount} unrecognized line item{invalidStagedCount > 1 ? 's' : ''}</span>
                </span>
              )}

              <button
                type="submit"
                disabled={validStagedCount === 0 && invalidStagedCount === 0}
                className="w-full sm:w-auto px-8 py-3.5 text-base font-bold text-th-accent-fg bg-th-accent hover:bg-th-accent-hover disabled:opacity-50 disabled:cursor-not-allowed rounded-xl shadow-md transition-all flex items-center justify-center gap-2.5 border-2 border-th-accent cursor-pointer"
              >
                <Check className="w-5 h-5" />
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
        <div className="px-6 py-5 border-b-2 border-th-border bg-th-subtle flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h4 className="text-lg sm:text-xl font-bold text-th-text flex items-center gap-2.5">
              <FileText className="w-5 h-5 text-th-muted" />
              Recorded Balances: {currentDivision?.name} (FY {selectedYear})
            </h4>
            <p className="text-sm font-medium text-th-muted mt-1 leading-relaxed">
              {showZeroBalancesInLedger
                ? 'Showing all accounts including zero balances.'
                : 'Zero balance items removed. Items appear automatically as amounts are encoded.'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Toggle show zero balances */}
            <button
              type="button"
              onClick={() => setShowZeroBalancesInLedger(!showZeroBalancesInLedger)}
              className="px-4 py-2.5 text-sm font-bold text-th-text bg-th-surface border-2 border-th-border-strong rounded-xl hover:bg-th-subtle-hover transition-colors inline-flex items-center gap-2 shadow-xs cursor-pointer"
            >
              {showZeroBalancesInLedger ? <EyeOff className="w-4 h-4 text-th-muted" /> : <Eye className="w-4 h-4 text-th-muted" />}
              <span>{showZeroBalancesInLedger ? 'Remove Zero Balances (Default)' : 'Show All Accounts (Include Zeroes)'}</span>
            </button>

            {/* Delete All Function */}
            <button
              type="button"
              onClick={() => setIsDeleteAllConfirmOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-bold text-red-800 dark:text-red-300 bg-red-50 dark:bg-red-950/60 hover:bg-red-100 dark:hover:bg-red-900/60 border-2 border-red-200 dark:border-red-800 rounded-xl transition-colors cursor-pointer"
              title="Delete all records and reset all balances to zero for this division and year"
            >
              <Trash2 className="w-4 h-4 text-red-600 dark:text-red-400" />
              <span>Reset All to Zero</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setIsSelectMultipleMode((prev) => !prev);
                setSelectedRecordedIds([]);
              }}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2.5 text-sm font-bold rounded-xl border-2 transition-colors cursor-pointer ${
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
                className="inline-flex items-center gap-1.5 px-3.5 py-2.5 text-sm font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl transition-colors cursor-pointer shadow-xs"
              >
                <Trash2 className="w-4 h-4" />
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
              className="inline-flex items-center gap-1.5 px-3.5 py-2.5 text-sm font-bold rounded-xl border-2 border-th-border-strong bg-th-surface text-th-text hover:bg-th-subtle-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
              title={deletedHistory.length > 0 ? 'Undo last delete' : 'Nothing to undo'}
            >
              <RotateCcw className="w-4 h-4" />
              <span>Undo</span>
            </button>

            <button
              onClick={onNavigateToViewFS}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 text-sm font-bold text-th-primary-fg bg-th-primary hover:opacity-90 rounded-xl transition-colors border-2 border-th-primary dark:border-th-border-strong cursor-pointer shadow-xs"
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
              <ChevronRight className="w-4 h-4" />
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
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-sm">
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
                  <span className="text-xs text-emerald-700 dark:text-emerald-300 font-bold">Jan 1 + Net Change</span>
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
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 text-sm">
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
        <div className="px-6 py-4 bg-th-subtle border-b-2 border-th-border flex items-center gap-4">
          <input
            type="text"
            value={ledgerSearch}
            onChange={(e) => setLedgerSearch(e.target.value)}
            placeholder="Search within recorded accounts..."
            className="flex-1 px-4 py-3 text-base bg-th-input border-2 border-th-border-strong rounded-xl text-th-text font-medium placeholder:text-th-muted focus:outline-hidden focus:border-th-accent focus:ring-2 focus:ring-th-accent/20 shadow-xs"
          />
          <span className="text-sm font-bold text-th-text whitespace-nowrap bg-th-surface px-3.5 py-2.5 rounded-xl border border-th-border-strong">
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
                      .filter((i) => !NON_ENCODABLE_SUMMARY_IDS.has(i.id))
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
                          <span className="text-base font-bold text-th-text">{item.name}</span>
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
                              className="text-sm font-bold text-th-text hover:text-th-primary-fg hover:bg-th-primary px-3.5 py-2 rounded-xl bg-th-subtle border border-th-border-strong transition-colors cursor-pointer"
                            >
                              {hasValue ? 'Edit Amount' : 'Add Amount'}
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

      {/* Smart Statement of Financial Position Excel/CSV Preview & Mapping Modal */}
      <ExcelPositionImportModal
        isOpen={positionImportModal.isOpen}
        workbook={positionImportModal.workbook}
        fileName={positionImportModal.fileName}
        divisionName={currentDivision?.name || 'Selected Division'}
        selectedYear={selectedYear}
        encodableItems={encodableStatementLineItems}
        onClose={() =>
          setPositionImportModal({ isOpen: false, workbook: null, fileName: '' })
        }
        onStageToBatch={(targetYear, entries) => {
          const importedEntries: StagedEntry[] = entries.map((entry, idx) => ({
            id: `import-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
            lineItemId: entry.lineItemId,
            rawText: entry.rawText,
            amount: entry.amount,
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
          savesByYear.forEach(({ year, entries }) => {
            if (entries.length > 0) {
              onSaveBatchAmounts(year, selectedDivisionId, entries);
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
