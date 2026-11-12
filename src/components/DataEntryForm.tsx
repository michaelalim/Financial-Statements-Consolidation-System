import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Division, LineItemDefinition, FinancialDataStore } from '../types/fs';
import { formatAccounting, parseNumberInput } from '../utils/formatters';
import { YEAR_RANGE, getComparativeYear } from '../utils/yearUtils';
import { SearchableLineItemSelect, normalizeAlphanumeric } from './SearchableLineItemSelect';
import * as XLSX from 'xlsx';
import { 
  Plus, 
  Trash2, 
  Calendar, 
  Check, 
  FileText, 
  ChevronLeft,
  ChevronRight, 
  Layers, 
  RotateCcw,
  Sparkles,
  Building,
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
  ArrowLeftRight,
  Upload,
} from 'lucide-react';
import { ConfirmModal } from './ConfirmModal';
import { FinancialStatementSidebar } from './FinancialStatementSidebar';
import { calculateCashFlowsSummary } from '../utils/cashFlowCalculations';

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
    isLocked: true,
    lockNotice: 'Statement of Changes in Net Assets/Equity is locked for now pending upcoming instructions.',
  },
];

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
  onSelectDivision: (id: string) => void;
  selectedYear: string;
  onSelectYear: (year: string) => void;
  dataStore: FinancialDataStore;
  onSaveBatchAmounts: (year: string, divisionId: string, entries: { lineItemId: string; amount: number }[]) => void;
  onDeleteAmount: (year: string, divisionId: string, lineItemId: string) => void;
  onDeleteAllDivisionAmounts: (year: string, divisionId: string) => void;
  onNavigateToViewFS: () => void;
  onAddDivisionPrompt: (name: string) => void;
  onAddLineItemPrompt: (name: string, group: string) => void;
  onDeleteLineItemPrompt: (item: LineItemDefinition) => void;
  onOpenTransferModal?: () => void;
}

export const DataEntryForm: React.FC<DataEntryFormProps> = ({
  divisions,
  lineItems,
  selectedDivisionId,
  onSelectDivision,
  selectedYear,
  onSelectYear,
  dataStore,
  onSaveBatchAmounts,
  onDeleteAmount,
  onDeleteAllDivisionAmounts,
  onNavigateToViewFS,
  onAddDivisionPrompt,
  onAddLineItemPrompt,
  onDeleteLineItemPrompt,
  onOpenTransferModal,
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

  useEffect(() => {
    setSelectedRecordedIds([]);
    setIsSelectMultipleMode(false);
  }, [selectedYear, selectedDivisionId]);

  // Top Quick Account Selector state (allows freely picking or typing on top)
  const [topSelectedItemId, setTopSelectedItemId] = useState<string>('');
  const [topRawText, setTopRawText] = useState<string>('');
  const [topAmountInput, setTopAmountInput] = useState<string>('');
  const [topFeedbackMsg, setTopFeedbackMsg] = useState<string | null>(null);
  const topLineItemInputRef = useRef<HTMLInputElement>(null);
  const topAmountInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadFeedback, setUploadFeedback] = useState<{ message: string; isError?: boolean } | null>(null);

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

  // Determines whether a staged entry's line item is invalid / not in the official line items database for the active statement
  const isRowLineItemInvalid = (row: StagedEntry): boolean => {
    const hasText = Boolean(row.rawText && row.rawText.trim());
    const hasItem = Boolean(row.lineItemId);
    const hasAmount = Boolean(row.amount && row.amount.trim() && parseNumberInput(row.amount) !== 0);

    // If row has an explicit lineItemId, verify it really exists in activeStatementLineItems
    if (hasItem) {
      const exists = activeStatementLineItems.some((item) => item.id === row.lineItemId);
      return !exists;
    }

    // If user wrote text or entered an amount, but no recognized lineItemId was matched:
    if (hasText || hasAmount) {
      if (hasText) {
        const nameMatch = activeStatementLineItems.some(
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
    !activeStatementLineItems.some((i) => i.id === topSelectedItemId || (topRawText.trim() && i.name.toLowerCase().trim() === topRawText.toLowerCase().trim()))
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

  // Quick Add Division Prompt Modal
  const [isQuickAddDivOpen, setIsQuickAddDivOpen] = useState(false);
  const [newDivName, setNewDivName] = useState('');

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

  // Stored records in database for this division & year with Cash Flows reconciliation rules applied
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
    return raw;
  }, [dataStore, selectedYear, selectedDivisionId, selectedStatement, cashFlowsSummary]);

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
      // Default: remove zero balance items, only show active amounts
      const matchesZeroFilter = showZeroBalancesInLedger ? true : hasAmount;

      return matchesSearch && matchesZeroFilter;
    });
  }, [activeStatementLineItems, currentDbEntries, ledgerSearch, showZeroBalancesInLedger]);

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

      const sheet = workbook.Sheets[firstSheetName];
      const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' });

      const importedEntries: StagedEntry[] = [];
      let matchedCount = 0;
      let unmatchedCount = 0;

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

        if (!rawName || !rawAmountStr) return;

        // Parse amount and ignore rows where Column B is zero or has no numeric value
        let numericAmount = 0;
        if (typeof rawAmountCell === 'number') {
          numericAmount = rawAmountCell;
        } else {
          numericAmount = parseNumberInput(rawAmountStr);
        }
        if (numericAmount === 0) return;

        const amountStr = formatAccounting(numericAmount);

        // Match against official lineItems database (exact or normalized alphanumeric)
        const lowerName = rawName.toLowerCase();
        const alphaName = normalizeAlphanumeric(rawName);
        const matchedItem = activeStatementLineItems.find(
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
        setUploadFeedback({ message: 'No valid rows found in columns A & B of the uploaded file.', isError: true });
      } else {
        setStagedEntries((prev) => {
          const nonBlankPrev = prev.filter((r) => r.lineItemId || r.rawText?.trim() || r.amount?.trim());
          return [...nonBlankPrev, ...importedEntries];
        });
        setUploadFeedback({
          message: `Imported ${importedEntries.length} row${importedEntries.length === 1 ? '' : 's'} from "${file.name}" (${matchedCount} matched, ${unmatchedCount} not in database).`,
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

    // Resolve if line item is in active statement database
    const resolvedItem = activeStatementLineItems.find(
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

  // Pre-load primary key accounts (Cash, Receivables, PPE, Liabilities)
  const handlePreloadCommonAccounts = () => {
    const commonAccountIds =
      selectedStatement === 'performance'
        ? activeStatementLineItems.slice(0, 10).map((l) => l.id)
        : selectedStatement === 'cash_flows'
        ? activeStatementLineItems.slice(0, 10).map((l) => l.id)
        : [
            'cash_collecting_officer',
            'petty_cash_fund',
            'cash_bank_current_acct',
            'due_from_ngas',
            'due_from_local_gov',
            'school_buildings',
            'accum_dep_school_buildings',
            'office_equipment',
            'accum_dep_office_equip',
            'accounts_payable',
            'due_to_bir',
            'accumulated_surplus_deficit',
          ];
    const prefilledRows: StagedEntry[] = commonAccountIds.map((accId) => {
      const itm = lineItems.find((l) => l.id === accId);
      return {
        id: `stage-common-${accId}-${Date.now()}`,
        lineItemId: accId,
        rawText: itm ? itm.name : '',
        amount:
          currentDbEntries[accId] !== undefined && currentDbEntries[accId] !== 0
            ? currentDbEntries[accId].toString()
            : '',
      };
    });

    setStagedEntries(prefilledRows);
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
          const match = activeStatementLineItems.find(
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
  }, [stagedEntries, activeStatementLineItems]);

  const invalidStagedCount = useMemo(() => {
    return stagedEntries.filter((r) => isRowLineItemInvalid(r)).length;
  }, [stagedEntries, activeStatementLineItems]);

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
    return activeStatementLineItems.find((i) => i.id === topSelectedItemId);
  }, [activeStatementLineItems, topSelectedItemId]);

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
      {/* 1. Entity & Year Control Strip */}
      <div className="bg-white dark:bg-slate-900 border-2 border-slate-300 dark:border-slate-700 rounded-xl p-6 shadow-xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-6 transition-colors">
        {/* Division Picker */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-2">
            <label className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Building className="w-5 h-5 text-[#0072ce] dark:text-[#38bdf8]" />
              <span>Reporting Office / Schools Division</span>
            </label>
            <div className="flex items-center gap-2.5">
              {onOpenTransferModal && (
                <button
                  type="button"
                  onClick={onOpenTransferModal}
                  className="text-xs font-bold text-[#0072ce] dark:text-[#38bdf8] hover:text-[#0a3461] dark:hover:text-white inline-flex items-center gap-1.5 bg-[#f0f5fa] dark:bg-[#0a274c] hover:bg-[#e1edf8] px-2.5 py-1 rounded-md border border-[#b9d9f5] dark:border-[#1d4677] cursor-pointer shadow-2xs transition-colors"
                  title="Transfer or copy accounts and balances between divisions or years"
                >
                  <ArrowLeftRight className="w-3.5 h-3.5" />
                  <span>Transfer / Copy Data</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setIsQuickAddDivOpen(true)}
                className="text-sm text-[#0072ce] dark:text-[#38bdf8] hover:text-[#005ea8] dark:hover:text-white inline-flex items-center gap-1 font-bold underline cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                Add Division
              </button>
            </div>
          </div>
          <select
            value={selectedDivisionId}
            onChange={(e) => onSelectDivision(e.target.value)}
            className="w-full px-4 py-3 text-base font-bold text-slate-900 dark:text-slate-100 bg-[#f4f8fc] dark:bg-slate-800 border-2 border-slate-300 dark:border-slate-600 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-[#0072ce] focus:border-[#0072ce] cursor-pointer shadow-2xs"
          >
            {divisions.map((div) => (
              <option key={div.id} value={div.id}>
                {div.name}
              </option>
            ))}
          </select>
        </div>

        {/* Year Range (2024-2099) */}
        <div className="w-full md:w-96">
          <div className="flex items-center justify-between mb-2">
            <label className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Calendar className="w-5 h-5 text-[#0072ce] dark:text-[#38bdf8]" />
              <span>Fiscal Year</span>
              <span className="px-2.5 py-0.5 rounded-md bg-[#0a3461] dark:bg-[#0072ce] text-white text-xs font-black tracking-wide">
                FY {selectedYear}
              </span>
            </label>
            <span className="text-sm font-mono font-semibold text-slate-600 dark:text-slate-400">
              (Comparative: {comparativeYear})
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                const prevYr = String(Number(selectedYear) - 1);
                if (YEAR_RANGE.includes(prevYr)) onSelectYear(prevYr);
              }}
              disabled={!YEAR_RANGE.includes(String(Number(selectedYear) - 1))}
              className="px-3 py-3 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed border-2 border-slate-300 dark:border-slate-600 text-slate-800 dark:text-slate-200 font-bold text-xs flex items-center gap-1 transition-colors shrink-0"
              title="Previous Fiscal Year"
            >
              <ChevronLeft className="w-4 h-4" />
              <span className="hidden sm:inline">Prev</span>
            </button>
            <select
              value={selectedYear}
              onChange={(e) => onSelectYear(e.target.value)}
              className="w-full px-4 py-3 text-base font-extrabold text-[#0a3461] dark:text-white bg-[#e8f2fc] dark:bg-slate-800 border-2 border-[#0072ce] dark:border-[#38bdf8] rounded-xl focus:outline-hidden focus:ring-2 focus:ring-[#0072ce] cursor-pointer shadow-2xs"
            >
              {YEAR_RANGE.map((yr) => (
                <option key={yr} value={yr}>
                  Fiscal Year {yr}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => {
                const nextYr = String(Number(selectedYear) + 1);
                if (YEAR_RANGE.includes(nextYr)) onSelectYear(nextYr);
              }}
              disabled={!YEAR_RANGE.includes(String(Number(selectedYear) + 1))}
              className="px-3 py-3 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed border-2 border-slate-300 dark:border-slate-600 text-slate-800 dark:text-slate-200 font-bold text-xs flex items-center gap-1 transition-colors shrink-0"
              title="Next Fiscal Year"
            >
              <span className="hidden sm:inline">Next</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* 3. Batch Multiple Entries Form */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-xs transition-colors">
        {/* Header with Title and Presets */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800 gap-3 mb-5">
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Layers className="w-5 h-5 text-sky-800 dark:text-sky-400" />
              <span>Batch Data Entry</span>
              {validStagedCount > 0 && (
                <span className="text-xs font-semibold text-sky-800 dark:text-sky-300 bg-sky-50 dark:bg-sky-950/60 px-2.5 py-0.5 rounded-full border border-sky-200 dark:border-sky-800">
                  {validStagedCount} ready to save
                </span>
              )}
            </h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              Select or type any line item from the official list. Missing hyphens and spaces are automatically matched (for example, typing <strong className="text-sky-900 dark:text-sky-300 font-semibold">"cash collecting"</strong> suggests <strong className="text-sky-900 dark:text-sky-300 font-semibold">"Cash - Collecting Officer"</strong>).
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
              className="text-xs sm:text-sm font-semibold text-emerald-900 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/60 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 px-3 py-2 rounded-lg border border-emerald-200 dark:border-emerald-800 transition-colors inline-flex items-center gap-1.5"
              title="Upload an Excel (.xlsx, .xls) or CSV file with Line Item Account in Column A and Amount in Column B"
            >
              <Upload className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
              <span>Upload Excel / CSV</span>
            </button>
            <button
              type="button"
              onClick={handlePreloadCommonAccounts}
              className="text-xs sm:text-sm font-medium text-sky-900 dark:text-sky-300 bg-sky-50 dark:bg-sky-950/60 hover:bg-sky-100 dark:hover:bg-sky-900/60 px-3 py-2 rounded-lg border border-sky-200 dark:border-sky-800 transition-colors inline-flex items-center gap-1.5"
              title="Pre-fills rows for primary key accounts"
            >
              <Sparkles className="w-4 h-4 text-sky-700 dark:text-sky-400" />
              <span>Preload Common Accounts</span>
            </button>
            <button
              type="button"
              onClick={handleAddStagedRow}
              className="text-xs sm:text-sm font-medium text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 px-3 py-2 rounded-lg transition-colors inline-flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              Add 1 Row
            </button>
            <button
              type="button"
              onClick={handleAdd5StagedRows}
              className="text-xs sm:text-sm font-medium text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 px-3 py-2 rounded-lg transition-colors inline-flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              Add 5 Rows
            </button>
          </div>
        </div>

        {uploadFeedback && (
          <div
            className={`mb-4 px-4 py-2.5 rounded-lg text-xs sm:text-sm font-medium flex items-center gap-2 border ${
              uploadFeedback.isError
                ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-200 border-rose-200 dark:border-rose-800'
                : 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200 border-emerald-200 dark:border-emerald-800'
            }`}
          >
            {uploadFeedback.isError ? (
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 dark:text-rose-400" />
            ) : (
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
            )}
            <span>{uploadFeedback.message}</span>
          </div>
        )}

        {/* PRIMARY HIGHLIGHTED DATA ENTRY & ENCODING STATION */}
        <div className="mb-7 p-6 sm:p-7 bg-gradient-to-r from-[#f0f5fa] via-[#ffffff] to-[#f0f5fa] dark:from-[#0a1b30] dark:via-[#0e2440] dark:to-[#0a1b30] border-2 border-[#0072ce] dark:border-[#38bdf8] rounded-2xl shadow-lg ring-4 ring-[#0072ce]/15 dark:ring-[#38bdf8]/20 transition-all">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 pb-3 border-b-2 border-[#0072ce]/20 dark:border-[#38bdf8]/30">
            <div className="flex items-center gap-3">
              <div className="px-3.5 py-1.5 rounded-lg bg-[#0a3461] text-white text-xs font-black uppercase tracking-wider shadow-xs flex items-center gap-2">
                <PenTool className="w-4 h-4 text-[#38bdf8]" />
                <span>DATA ENCODING STATION</span>
              </div>
              <h3 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white">
                Enter Line Item & Balance Here
              </h3>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-black text-white bg-[#0a3461] dark:bg-[#0072ce] px-3.5 py-1.5 rounded-xl shadow-xs flex items-center gap-1.5">
                <Calendar className="w-4 h-4 text-[#38bdf8] dark:text-white" />
                <span>Operating Year: FY {selectedYear}</span>
              </span>
              <span className="text-sm font-bold text-[#0a3461] dark:text-[#93c5fd] bg-white/90 dark:bg-slate-800/90 px-3.5 py-1.5 rounded-xl border border-[#b9d9f5] dark:border-[#1d4677] shadow-xs">
                ⚡ Primary Data Entry Area
              </span>
            </div>
          </div>

          <p className="text-base text-slate-700 dark:text-slate-300 font-medium mb-5 leading-relaxed">
            Select or type the official line item on the left, enter the monetary balance in the middle, then click <strong className="text-[#0072ce] dark:text-[#38bdf8] font-bold">"Add to Batch"</strong> or press <strong className="text-[#0072ce] dark:text-[#38bdf8] font-bold">Enter</strong>.
          </p>

          <form onSubmit={handleAddTopItemToBatch} className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
            {/* Step 1: Searchable Combobox */}
            <div className="md:col-span-7">
              <label className="block text-sm font-bold uppercase tracking-wider text-[#0a3461] dark:text-[#93c5fd] mb-1.5 flex items-center gap-2">
                <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-[#0a3461] text-white text-xs font-bold">1</span>
                <span>Select or Type Line Item Account:</span>
              </label>
              <SearchableLineItemSelect
                inputRef={topLineItemInputRef}
                lineItems={activeStatementLineItems}
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
                placeholder="Type or click to choose account (e.g. Cash, Office Equip)..."
              />
              {topSelectedItemDetail && (
                <div className="mt-2 flex items-center gap-2 text-xs font-semibold text-[#0a3461] dark:text-[#93c5fd] bg-white/90 dark:bg-slate-800/90 px-3 py-1.5 rounded-lg border border-[#b9d9f5] dark:border-[#1d4677] shadow-2xs animate-in fade-in">
                  <span className="font-bold text-[#0072ce] dark:text-[#38bdf8]">✓ Selected:</span>
                  <span className="font-bold">{topSelectedItemDetail.name}</span>
                  <span>·</span>
                  <span className="text-slate-600 dark:text-slate-400">{topSelectedItemDetail.subsection} ({topSelectedItemDetail.group})</span>
                  {topSelectedItemDetail.isContra && (
                    <span className="px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200 text-[11px] font-bold">Contra Account</span>
                  )}
                </div>
              )}
            </div>

            {/* Step 2: Amount Input */}
            <div className="md:col-span-3">
              <label className="block text-sm font-bold uppercase tracking-wider text-[#0a3461] dark:text-[#93c5fd] mb-1.5 flex items-center gap-2">
                <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-[#0a3461] text-white text-xs font-bold">2</span>
                <span>Enter Amount (₱ Balance):</span>
              </label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 dark:text-slate-400 font-mono text-lg font-bold">
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
                  className="w-full pl-9 pr-4 py-3.5 text-lg font-mono font-bold tabular-nums text-right bg-white dark:bg-slate-900 border-2 border-slate-300 dark:border-slate-600 rounded-xl text-slate-900 dark:text-slate-100 focus:outline-hidden focus:border-[#0072ce] focus:ring-4 focus:ring-[#0072ce]/20 shadow-xs"
                />
              </div>
              {topAmountInput.trim() !== '' && (
                <div className="mt-2 flex items-center justify-between text-xs px-1">
                  <span className="font-mono font-semibold text-slate-600 dark:text-slate-400">
                    ₱ {formatAccounting(parseNumberInput(topAmountInput))}
                  </span>
                  <button
                    type="button"
                    onClick={() => setTopAmountInput('')}
                    className="text-xs text-slate-500 hover:text-red-600 font-semibold cursor-pointer underline"
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
                className="w-full py-3.5 px-5 text-base font-bold text-white bg-[#0072ce] hover:bg-[#005ea8] active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed rounded-xl shadow-md transition-all flex items-center justify-center gap-2 border-2 border-[#005ea8] cursor-pointer"
              >
                <Plus className="w-5 h-5 stroke-[2.5]" />
                <span>Add to Batch</span>
              </button>
            </div>
          </form>

          {/* Quick preset chips underneath top bar */}
          <div className="mt-5 pt-3.5 border-t border-[#0072ce]/20 dark:border-[#38bdf8]/30 flex items-center gap-2 flex-wrap">
            <span className="text-sm font-bold text-slate-700 dark:text-slate-300 mr-1">
              Frequent Accounts:
            </span>
            {[
              { id: 'cash_collecting_officer', label: 'Cash - Collecting Officer' },
              { id: 'petty_cash_fund', label: 'Petty Cash' },
              { id: 'cash_bank_current_acct', label: 'Cash in Bank' },
              { id: 'school_buildings', label: 'School Buildings' },
              { id: 'office_equipment', label: 'Office Equipment' },
              { id: 'accounts_payable', label: 'Accounts Payable' },
              { id: 'due_to_bir', label: 'Due to BIR' },
              { id: 'accumulated_surplus_deficit', label: 'Govt Equity' },
            ].map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => {
                  setTopSelectedItemId(preset.id);
                  topAmountInputRef.current?.focus();
                }}
                className={`text-sm font-bold px-3 py-1.5 rounded-xl transition-colors border-2 cursor-pointer ${
                  topSelectedItemId === preset.id
                    ? 'bg-[#0a3461] text-white border-[#0a3461]'
                    : 'bg-white/90 dark:bg-slate-800/90 text-[#0072ce] dark:text-[#38bdf8] border-slate-300 dark:border-slate-700 hover:bg-[#f0f5fa]'
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>

          {topFeedbackMsg && (
            <div className="mt-3.5 p-3 bg-[#f0f7fd] dark:bg-[#0a274c] text-base text-[#0a3461] dark:text-[#93c5fd] font-bold rounded-xl border-2 border-[#b9d9f5] flex items-center gap-2.5 animate-in fade-in shadow-xs">
              <Check className="w-5 h-5 text-[#0072ce] dark:text-[#38bdf8]" />
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
          {/* Simple, Minimalist Keyboard Navigation Guide */}
          {/* Clean, Senior-Friendly Keyboard Tips Callout */}
          <div className="mb-4 px-5 py-3.5 bg-[#f0f5fa] dark:bg-[#0a274c]/50 border-2 border-[#b9d9f5] dark:border-[#1d4677] rounded-xl flex flex-wrap items-center justify-between text-base text-slate-800 dark:text-slate-200 gap-4 shadow-2xs">
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className="font-bold text-[#0a3461] dark:text-[#93c5fd] flex items-center gap-2">
                <Keyboard className="w-5 h-5 text-[#0072ce] dark:text-[#38bdf8]" />
                <span>Tips for fast entry:</span>
              </span>
              <span>Use ↑ and ↓ arrow keys to highlight an option</span>
              <span className="text-[#0072ce] font-bold">·</span>
              <span>Press Tab or Enter to select & enter amount</span>
              <span className="text-[#0072ce] font-bold">·</span>
              <span>Enter on amount advances to next line</span>
            </div>

            <div className="text-base font-bold text-[#0a3461] dark:text-[#38bdf8] bg-white/90 dark:bg-slate-800 px-3.5 py-1.5 rounded-lg border border-[#b9d9f5] dark:border-[#1d4677]">
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
          <div className="mb-4 px-5 py-3.5 bg-[#f0f5fa] dark:bg-[#0a274c]/40 border-2 border-[#b9d9f5] dark:border-[#1d4677] rounded-xl flex flex-wrap items-center justify-between gap-4 text-base shadow-2xs">
            <div className="flex items-center gap-4 flex-wrap">
              <div className="flex items-center gap-2 font-bold text-[#0a3461] dark:text-[#93c5fd]">
                <Calculator className="w-5 h-5 text-[#0072ce] dark:text-[#38bdf8]" />
                <span>Batch Tape Summary:</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <span className="text-slate-600 dark:text-slate-400 font-medium">Rows:</span>
                <span className="font-bold font-mono text-slate-900 dark:text-white bg-white dark:bg-slate-800 px-2 py-0.5 rounded-md border border-slate-300 dark:border-slate-700">
                  {stagedEntries.length}
                </span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <span className="text-slate-600 dark:text-slate-400 font-medium">Ready to Save:</span>
                <span className="font-bold font-mono text-[#0072ce] dark:text-[#38bdf8] bg-white dark:bg-slate-800 px-2.5 py-0.5 rounded-md border border-slate-300 dark:border-slate-700">
                  {validStagedCount}
                </span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <span className="text-slate-700 dark:text-slate-300 font-bold">Total Batch Balance:</span>
                <span className="font-bold font-mono text-base text-[#0a3461] dark:text-[#93c5fd] bg-white dark:bg-slate-800 px-3 py-1 rounded-md border border-[#b9d9f5] dark:border-[#1d4677] shadow-2xs">
                  ₱ {formatAccounting(stagedBatchTotal)}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {stagedEntries.some((r) => !r.lineItemId && !r.rawText?.trim() && !r.amount?.trim()) && (
                <button
                  type="button"
                  onClick={handleClearEmptyStagedRows}
                  className="text-xs font-bold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white underline cursor-pointer"
                  title="Removes unused blank rows from the batch table"
                >
                  Clear Blank Rows
                </button>
              )}
            </div>
          </div>

          <div className="border-2 border-slate-300 dark:border-slate-700 rounded-xl mb-5 shadow-xs overflow-visible bg-white dark:bg-slate-900">
            <div className="bg-[#f0f5fa] dark:bg-[#0a274c] px-5 py-3.5 border-b-2 border-slate-300 dark:border-slate-700 rounded-t-xl grid grid-cols-12 gap-3 text-sm font-bold text-[#0a3461] dark:text-[#93c5fd] uppercase tracking-wider">
              <div className="col-span-1 text-center">#</div>
              <div className="col-span-7">Line Item (Type to Search)</div>
              <div className="col-span-3 text-right">Amount (₱ Balance)</div>
              <div className="col-span-1 text-center">Remove</div>
            </div>

            <div className="divide-y-2 divide-slate-200/80 dark:divide-slate-800 overflow-visible rounded-b-xl">
              {stagedEntries.length === 0 ? (
                <div className="py-14 px-6 text-center bg-[#fdfdfd] dark:bg-slate-900 rounded-b-xl">
                  <div className="w-16 h-16 rounded-2xl bg-[#f0f5fa] dark:bg-[#0a274c] border-2 border-[#b9d9f5] dark:border-[#1d4677] flex items-center justify-center mx-auto mb-3.5 text-[#0072ce] dark:text-[#38bdf8]">
                    <Layers className="w-8 h-8" />
                  </div>
                  <h4 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                    No Line Items in Batch Table (0 Items)
                  </h4>
                  <p className="text-base text-slate-600 dark:text-slate-400 max-w-lg mx-auto mt-2 mb-6 leading-relaxed font-medium">
                    Use the highlighted <strong className="text-[#0072ce] dark:text-[#38bdf8]">Data Encoding Station</strong> above to quickly enter an account and amount, or click below to add a blank row directly to this table.
                  </p>
                  <div className="flex flex-wrap items-center justify-center gap-3.5">
                    <button
                      type="button"
                      onClick={handleAddStagedRow}
                      className="px-5 py-3 text-base font-bold text-white bg-[#0072ce] hover:bg-[#005ea8] rounded-xl shadow-xs transition-colors inline-flex items-center gap-2 cursor-pointer"
                    >
                      <Plus className="w-5 h-5" />
                      <span>Add 1 Blank Row to Table</span>
                    </button>
                    <button
                      type="button"
                      onClick={handlePreloadCommonAccounts}
                      className="px-4 py-3 text-base font-bold text-[#0a3461] dark:text-[#93c5fd] bg-[#f0f5fa] dark:bg-[#0a274c]/50 hover:bg-[#e1edf8] border-2 border-[#b9d9f5] dark:border-[#1d4677] rounded-xl transition-colors inline-flex items-center gap-2 cursor-pointer"
                    >
                      <Sparkles className="w-5 h-5 text-[#0072ce] dark:text-[#38bdf8]" />
                      <span>Preload Common Accounts</span>
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
                    className={`px-4 py-3 grid grid-cols-12 gap-3.5 items-center hover:bg-[#f4f8fc] dark:hover:bg-slate-800/60 transition-colors ${
                      isThisRowDropdownOpen ? 'relative z-50 bg-[#eef4fb] dark:bg-[#0a274c]/40' : 'relative z-auto'
                    }`}
                  >
                    <div className="col-span-1 text-center font-mono text-base font-bold text-[#0072ce] dark:text-[#38bdf8]">
                      {idx + 1}
                    </div>

                    {/* Searchable Combobox with Arrow Navigation, Tab/Enter Selection & Red Highlight when not in database */}
                    <div className="col-span-7">
                      <SearchableLineItemSelect
                        inputRef={(el) => {
                          lineItemInputRefs.current[row.id] = el;
                        }}
                        lineItems={activeStatementLineItems}
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
                        placeholder="Enter line item..."
                      />
                    </div>

                    {/* Amount Input with Auto-Advance to Next Line Item & Shift+Enter Save */}
                    <div className="col-span-3">
                      <div className="relative">
                        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 dark:text-slate-400 font-mono text-base font-bold">
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
                          className="w-full pl-8 pr-4 py-3 text-base font-mono font-bold tabular-nums text-right bg-white dark:bg-slate-900 border-2 border-slate-300 dark:border-slate-600 text-slate-900 dark:text-slate-100 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-[#0072ce] focus:border-[#0072ce] shadow-2xs"
                        />
                      </div>
                    </div>

                    {/* Delete row */}
                    <div className="col-span-1 text-center">
                      <button
                        type="button"
                        onClick={() => handleRemoveStagedRow(row.id)}
                        className="p-2.5 text-slate-400 hover:text-red-700 dark:hover:text-red-400 rounded-xl hover:bg-red-50 dark:hover:bg-red-950/50 transition-colors cursor-pointer"
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
                className="px-5 py-3 text-base font-bold text-slate-800 dark:text-slate-200 bg-[#f4f8fc] dark:bg-slate-800 border-2 border-slate-300 dark:border-slate-700 hover:bg-[#e1edf8] dark:hover:bg-slate-700 rounded-xl transition-colors inline-flex items-center gap-2 shadow-2xs cursor-pointer"
              >
                <Plus className="w-5 h-5" />
                <span>Add Row</span>
              </button>
              <button
                type="button"
                onClick={() => setIsDiscardConfirmOpen(true)}
                className="px-5 py-3 text-base font-semibold text-slate-600 dark:text-slate-400 hover:text-red-700 dark:hover:text-red-400 rounded-xl hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors inline-flex items-center gap-2 cursor-pointer"
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
                className="w-full sm:w-auto px-8 py-3.5 text-base font-bold text-white bg-[#0072ce] hover:bg-[#005ea8] disabled:opacity-50 disabled:cursor-not-allowed rounded-xl shadow-md transition-all flex items-center justify-center gap-2.5 border-2 border-[#005ea8] cursor-pointer"
              >
                <Check className="w-5 h-5" />
                <span>
                  Save All {validStagedCount > 0 ? `(${validStagedCount})` : ''} Entries to Database
                </span>
              </button>
            </div>
          </div>

          {saveSuccessMsg && (
            <div className="mt-4 p-4 bg-[#f0f7fd] dark:bg-[#0a274c] text-[#0a3461] dark:text-[#93c5fd] border-2 border-[#b9d9f5] dark:border-[#1d4677] rounded-xl text-base font-bold flex items-center gap-2.5 animate-in fade-in shadow-xs">
              <CheckCircle2 className="w-5 h-5 text-[#0072ce] dark:text-[#38bdf8] shrink-0" />
              <span>{saveSuccessMsg}</span>
            </div>
          )}
        </form>
      </div>

      {/* 4. Encoded Items for this Division & Fiscal Year (Zero balances removed by default) */}
      <div className="bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden transition-colors">
        <div className="px-6 py-5 border-b-2 border-slate-200 dark:border-slate-800 bg-[#f0f5fa] dark:bg-[#0a274c]/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h4 className="text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2.5">
              <FileText className="w-5 h-5 text-[#0072ce] dark:text-[#38bdf8]" />
              Recorded Balances: {currentDivision?.name} (FY {selectedYear})
            </h4>
            <p className="text-sm font-medium text-slate-600 dark:text-slate-400 mt-1">
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
              className="px-4 py-2.5 text-sm font-bold text-slate-800 dark:text-slate-200 bg-white dark:bg-slate-800 border-2 border-slate-300 dark:border-slate-700 rounded-xl hover:bg-[#f0f5fa] dark:hover:bg-[#0a274c]/50 transition-colors inline-flex items-center gap-2 shadow-xs cursor-pointer"
            >
              {showZeroBalancesInLedger ? <EyeOff className="w-4 h-4 text-slate-500" /> : <Eye className="w-4 h-4 text-[#0072ce] dark:text-[#38bdf8]" />}
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
              className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs sm:text-sm font-bold rounded-xl border-2 transition-colors cursor-pointer ${
                isSelectMultipleMode
                  ? 'bg-[#0a3461] text-white border-[#0a3461]'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border-slate-300 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              <span>{isSelectMultipleMode ? 'Cancel Select' : 'Select Multiples'}</span>
            </button>

            {selectedRecordedIds.length > 0 && (
              <button
                type="button"
                onClick={() => setPendingDeleteSelectedRecorded(true)}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs sm:text-sm font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl transition-colors cursor-pointer shadow-xs"
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
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs sm:text-sm font-bold rounded-xl border-2 border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
              title={deletedHistory.length > 0 ? 'Undo last delete' : 'Nothing to undo'}
            >
              <RotateCcw className="w-4 h-4" />
              <span>Undo</span>
            </button>

            <button
              onClick={onNavigateToViewFS}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 text-sm font-bold text-white bg-[#0a3461] hover:bg-[#072648] rounded-xl transition-colors border-2 border-[#0072ce]/40 cursor-pointer shadow-xs"
            >
              <span>
                {selectedStatement === 'performance'
                  ? 'View Statement of Financial Performance'
                  : selectedStatement === 'cash_flows'
                  ? 'View Statement of Cash Flows'
                  : 'View Statement of Financial Position'}
              </span>
              <ChevronRight className="w-4 h-4 text-[#38bdf8]" />
            </button>
          </div>
        </div>

        {/* Informative transferred dataset banner for Iloilo City Division 2024 */}
        {selectedDivisionId === 'iloilo-city-div' && selectedYear === '2024' && (
          <div className="mx-6 mt-4 p-3.5 bg-[#e1edf8] dark:bg-[#0a274c]/70 border-2 border-[#0072ce]/40 rounded-xl flex items-center justify-between gap-3 text-sm text-[#0a3461] dark:text-[#93c5fd]">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-[#0072ce] dark:text-[#38bdf8] shrink-0" />
              <span>
                <strong>Transferred Dataset:</strong> FY 2024 details from <strong>Iloilo Division</strong> were transferred to <strong>Iloilo City Division</strong>.
              </span>
            </div>
            {onOpenTransferModal && (
              <button
                type="button"
                onClick={onOpenTransferModal}
                className="text-xs font-bold px-2.5 py-1 bg-white dark:bg-slate-800 rounded-md border border-[#b9d9f5] dark:border-[#1d4677] text-[#0072ce] dark:text-[#38bdf8] hover:underline shrink-0 cursor-pointer"
              >
                Transfer / Reassign
              </button>
            )}
          </div>
        )}

        {/* Cash Reconciliation Summary for Statement of Cash Flows */}
        {selectedStatement === 'cash_flows' && (
          <div className="mx-6 mt-5 p-4 rounded-xl border-2 border-sky-200 dark:border-sky-800/60 bg-sky-50/70 dark:bg-sky-950/40">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-sky-900 dark:text-sky-300 flex items-center gap-1.5">
                <Calculator className="w-4 h-4 text-sky-600 dark:text-sky-400" />
                Cash Flows Reconciliation (FY {selectedYear})
              </span>
              <span className="text-xs text-sky-700 dark:text-sky-400 font-medium">
                Comparative Prior: FY {comparativeYear}
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-sm">
              <div className="p-3 bg-white dark:bg-slate-900 rounded-lg border border-sky-100 dark:border-slate-800">
                <div className="text-xs text-slate-500 font-medium">Net Operating Activities</div>
                <div className={`text-base font-bold font-mono mt-0.5 ${cashFlowsSummary.netOperating < 0 ? 'text-red-600 dark:text-red-400' : 'text-slate-900 dark:text-slate-100'}`}>
                  {formatAccounting(cashFlowsSummary.netOperating)}
                </div>
              </div>
              <div className="p-3 bg-white dark:bg-slate-900 rounded-lg border border-sky-100 dark:border-slate-800">
                <div className="text-xs text-slate-500 font-medium">Net Investing Activities</div>
                <div className={`text-base font-bold font-mono mt-0.5 ${cashFlowsSummary.netInvesting < 0 ? 'text-red-600 dark:text-red-400' : 'text-slate-900 dark:text-slate-100'}`}>
                  {formatAccounting(cashFlowsSummary.netInvesting)}
                </div>
              </div>
              <div className="p-3 bg-white dark:bg-slate-900 rounded-lg border border-sky-100 dark:border-slate-800">
                <div className="text-xs text-slate-500 font-medium">Net Financing Activities</div>
                <div className={`text-base font-bold font-mono mt-0.5 ${cashFlowsSummary.netFinancing < 0 ? 'text-red-600 dark:text-red-400' : 'text-slate-900 dark:text-slate-100'}`}>
                  {formatAccounting(cashFlowsSummary.netFinancing)}
                </div>
              </div>
              <div className="p-3 bg-white dark:bg-slate-900 rounded-lg border border-sky-200 dark:border-slate-700">
                <div className="text-xs text-slate-600 dark:text-slate-400 font-bold">Increase(Decrease) in Cash</div>
                <div className={`text-base font-extrabold font-mono mt-0.5 ${cashFlowsSummary.netIncreaseDecrease < 0 ? 'text-red-600 dark:text-red-400' : 'text-sky-700 dark:text-sky-300'}`}>
                  {formatAccounting(cashFlowsSummary.netIncreaseDecrease)}
                </div>
              </div>
              <div className="p-3 bg-white dark:bg-slate-900 rounded-lg border border-sky-200 dark:border-slate-700">
                <div className="text-xs text-slate-600 dark:text-slate-400 font-bold flex items-center justify-between">
                  <span>Cash & Eq., January 1</span>
                  <span className="text-[10px] text-sky-600 dark:text-sky-400 font-medium">(Prior Dec 31)</span>
                </div>
                <div className="text-base font-extrabold font-mono mt-0.5 text-slate-900 dark:text-slate-100">
                  {formatAccounting(currentDbEntries['cf-sum-beg-cash'] !== undefined ? currentDbEntries['cf-sum-beg-cash'] : cashFlowsSummary.january1Cash)}
                </div>
              </div>
              <div className="p-3 bg-emerald-50/80 dark:bg-emerald-950/40 rounded-lg border-2 border-emerald-300 dark:border-emerald-700">
                <div className="text-xs text-emerald-800 dark:text-emerald-300 font-bold flex items-center justify-between">
                  <span>Cash & Eq., December 31</span>
                  <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold">Jan 1 + Net Change</span>
                </div>
                <div className="text-base font-extrabold font-mono mt-0.5 text-emerald-900 dark:text-emerald-200">
                  {formatAccounting(currentDbEntries['cf-sum-end-cash'] !== undefined ? currentDbEntries['cf-sum-end-cash'] : cashFlowsSummary.december31Cash)}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Ledger Search Filter */}
        <div className="px-6 py-4 bg-[#f4f8fc] dark:bg-slate-900/60 border-b-2 border-slate-200 dark:border-slate-800 flex items-center gap-4">
          <input
            type="text"
            value={ledgerSearch}
            onChange={(e) => setLedgerSearch(e.target.value)}
            placeholder="Search within recorded accounts..."
            className="flex-1 px-4 py-3 text-base bg-white dark:bg-slate-800 border-2 border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-slate-100 font-medium placeholder:text-slate-400 focus:outline-hidden focus:border-[#0072ce] focus:ring-2 focus:ring-[#0072ce]/20 shadow-xs"
          />
          <span className="text-sm font-bold text-slate-700 dark:text-slate-300 whitespace-nowrap bg-slate-100 dark:bg-slate-800 px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700">
            {ledgerAccountsList.length} {showZeroBalancesInLedger ? 'accounts listed' : 'recorded items'}
          </span>
        </div>

        {/* Ledger Table or Empty State */}
        {ledgerAccountsList.length === 0 ? (
          <div className="py-16 px-6 text-center">
            <div className="w-16 h-16 rounded-2xl bg-[#f0f5fa] dark:bg-[#0a274c]/50 border-2 border-[#b9d9f5] dark:border-[#1d4677] flex items-center justify-center mx-auto mb-4 text-[#0072ce] dark:text-[#38bdf8]">
              <FileText className="w-8 h-8" />
            </div>
            <h5 className="text-lg font-bold text-slate-900 dark:text-slate-100">
              No balances recorded yet for {currentDivision?.name} (FY {selectedYear})
            </h5>
            <p className="text-base text-slate-600 dark:text-slate-400 max-w-xl mx-auto mt-2 leading-relaxed font-medium">
              Zero balance items are removed by default. Enter line items and amounts in the batch entry form above and click &quot;Save All Entries to Database&quot;—they will automatically appear here as amounts are added.
            </p>
            <button
              type="button"
              onClick={() => setShowZeroBalancesInLedger(true)}
              className="mt-6 inline-flex items-center gap-2 px-5 py-3 text-sm font-bold text-[#0a3461] dark:text-[#93c5fd] bg-[#f0f5fa] dark:bg-[#0a274c]/60 hover:bg-[#e1edf8] dark:hover:bg-[#0a274c] border-2 border-[#0072ce]/40 rounded-xl transition-colors cursor-pointer shadow-xs"
            >
              <Eye className="w-5 h-5" />
              <span>Show All Accounts (Include Zeroes)</span>
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto max-h-[580px]">
            <table className="w-full text-left text-base border-collapse">
              <thead className="bg-[#f0f5fa] dark:bg-[#0a274c] text-sm font-bold text-[#0a3461] dark:text-[#93c5fd] uppercase tracking-wider border-b-2 border-slate-200 dark:border-slate-700 sticky top-0 z-10">
                <tr>
                  {isSelectMultipleMode && (
                    <th
                      onClick={() => {
                        if (ledgerAccountsList.length > 0 && selectedRecordedIds.length === ledgerAccountsList.length) {
                          setSelectedRecordedIds([]);
                        } else {
                          setSelectedRecordedIds(ledgerAccountsList.map((i) => i.id));
                        }
                      }}
                      className="py-3.5 px-4 w-14 text-center cursor-pointer select-none"
                    >
                      <input
                        type="checkbox"
                        checked={ledgerAccountsList.length > 0 && selectedRecordedIds.length === ledgerAccountsList.length}
                        onChange={() => {}}
                        className="w-5 h-5 rounded border-slate-300 text-[#0072ce] accent-[#0072ce] focus:ring-[#0072ce] cursor-pointer pointer-events-none"
                        aria-label="Select all recorded balances"
                      />
                    </th>
                  )}
                  <th className="py-3.5 px-6">Official Account Title</th>
                  <th className="py-3.5 px-6">Classification & Group</th>
                  <th className="py-3.5 px-6 text-right">Balance (₱)</th>
                  <th className="py-3.5 px-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {ledgerAccountsList.map((item) => {
                  const amt = currentDbEntries[item.id] || 0;
                  const hasValue = currentDbEntries[item.id] !== undefined && currentDbEntries[item.id] !== 0;

                  return (
                    <tr
                      key={item.id}
                      onClick={() => {
                        if (!isSelectMultipleMode) return;
                        setSelectedRecordedIds((prev) =>
                          prev.includes(item.id)
                            ? prev.filter((id) => id !== item.id)
                            : [...prev, item.id]
                        );
                      }}
                      className={`hover:bg-[#f4f8fc] dark:hover:bg-slate-800/60 transition-colors ${
                        isSelectMultipleMode ? 'cursor-pointer select-none' : ''
                      } ${
                        hasValue ? 'bg-[#f8fbfd] dark:bg-[#0a274c]/15' : ''
                      }`}
                    >
                      {isSelectMultipleMode && (
                        <td className="py-3.5 px-4 text-center">
                          <input
                            type="checkbox"
                            checked={selectedRecordedIds.includes(item.id)}
                            onChange={() => {}}
                            className="w-5 h-5 rounded border-slate-300 text-[#0072ce] accent-[#0072ce] focus:ring-[#0072ce] cursor-pointer pointer-events-none"
                            aria-label={`Select ${item.name}`}
                          />
                        </td>
                      )}
                      <td className="py-3.5 px-6 font-medium text-slate-900 dark:text-slate-100">
                        <div className="flex items-center gap-2.5">
                          <span className="text-base font-bold text-slate-900 dark:text-slate-100">{item.name}</span>
                          {item.id === 'cf-sum-beg-cash' && (
                            <span className="text-xs text-sky-700 dark:text-sky-300 bg-sky-50 dark:bg-sky-950/70 px-2 py-0.5 rounded-md font-bold border border-sky-300 dark:border-sky-700">
                              Default: Prior Dec 31
                            </span>
                          )}
                          {item.id === 'cf-sum-end-cash' && (
                            <span className="text-xs text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/70 px-2 py-0.5 rounded-md font-bold border border-emerald-300 dark:border-emerald-700">
                              Auto: Jan 1 + Net Change
                            </span>
                          )}
                          {item.id === 'cf-sum-net-inc-dec' && (
                            <span className="text-xs text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/70 px-2 py-0.5 rounded-md font-bold border border-indigo-300 dark:border-indigo-700">
                              Auto: Net Inflows - Outflows
                            </span>
                          )}
                          {item.isContra && (
                            <span className="text-xs text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 px-2.5 py-0.5 rounded-md font-bold border border-slate-300 dark:border-slate-700">
                              Contra
                            </span>
                          )}
                          {!hasValue && (
                            <span className="text-xs text-slate-400 dark:text-slate-500 font-mono font-medium">
                              (Zero)
                            </span>
                          )}
                        </div>
                        {item.subgroup && (
                          <div className="text-sm text-slate-500 dark:text-slate-400 font-medium mt-0.5">
                            Subgroup: {item.subgroup}
                          </div>
                        )}
                      </td>

                      <td className="py-3.5 px-6 text-sm text-slate-600 dark:text-slate-400">
                        <div className="font-bold text-slate-800 dark:text-slate-200">{item.subsection}</div>
                        <div className="text-sm text-slate-500 dark:text-slate-400">{item.group}</div>
                      </td>

                      <td
                        className={`py-3.5 px-6 text-right font-mono tabular-nums text-base ${
                          hasValue ? 'font-bold text-slate-950 dark:text-white' : 'text-slate-400 dark:text-slate-500'
                        }`}
                      >
                        {item.isContra && amt > 0
                          ? `(${formatAccounting(amt)})`
                          : formatAccounting(amt)}
                      </td>

                      <td className="py-3.5 px-6 text-right">
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
                            className="text-sm font-bold text-[#0072ce] dark:text-[#38bdf8] hover:text-[#005ea8] dark:hover:text-white px-3.5 py-2 rounded-xl bg-[#f0f5fa] dark:bg-[#0a274c]/50 hover:bg-[#e1edf8] border border-[#b9d9f5] dark:border-[#1d4677] transition-colors cursor-pointer"
                          >
                            {hasValue ? 'Edit Amount' : 'Add Amount'}
                          </button>
                          {hasValue && (
                            <button
                              type="button"
                              onClick={() => setPendingDeleteRecordedItem(item)}
                              className="text-slate-400 hover:text-red-700 dark:hover:text-red-400 p-2 rounded-xl hover:bg-red-50 dark:hover:bg-red-950/50 transition-colors cursor-pointer"
                              title="Reset to zero"
                            >
                              <Trash2 className="w-5 h-5" />
                            </button>
                          )}
                        </div>
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

      {/* Confirmation Modal: Quick Add Division */}
      <ConfirmModal
        isOpen={isQuickAddDivOpen}
        title="Add Division Confirmation"
        message={`Are you sure you want to add the division "${newDivName.trim()}"? It will become available immediately for data input and financial reporting.`}
        confirmLabel="Yes, Add Division"
        cancelLabel="Cancel"
        variant="primary"
        onConfirm={() => {
          if (newDivName.trim()) {
            onAddDivisionPrompt(newDivName.trim());
            setNewDivName('');
          }
          setIsQuickAddDivOpen(false);
        }}
        onCancel={() => setIsQuickAddDivOpen(false)}
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

      {/* Quick Add Division Text Input Prompt Dialog */}
      {isQuickAddDivOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border-2 border-slate-300 dark:border-slate-700 p-6">
            <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 mb-1">Add New Division</h3>
            <p className="text-sm font-medium text-slate-600 dark:text-slate-400 mb-4">
              Enter the division office name. You will be prompted for confirmation before it is created.
            </p>
            <input
              type="text"
              placeholder="Enter division office name"
              value={newDivName}
              onChange={(e) => setNewDivName(e.target.value)}
              className="w-full px-4 py-3 text-base bg-white dark:bg-slate-800 border-2 border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-slate-100 font-bold focus:outline-hidden focus:border-[#0072ce] focus:ring-2 focus:ring-[#0072ce]/20 mb-4"
              autoFocus
            />
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setIsQuickAddDivOpen(false)}
                className="px-4 py-2.5 text-sm font-bold text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 border-2 border-slate-300 dark:border-slate-700 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!newDivName.trim()}
                onClick={() => {
                  if (newDivName.trim()) {
                    onAddDivisionPrompt(newDivName.trim());
                    setNewDivName('');
                    setIsQuickAddDivOpen(false);
                  }
                }}
                className="px-5 py-2.5 text-sm font-bold text-white bg-[#0072ce] hover:bg-[#005ea8] disabled:opacity-50 rounded-xl shadow-sm cursor-pointer"
              >
                Confirm & Add Division
              </button>
            </div>
          </div>
        </div>
      )}

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
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white dark:bg-slate-900 border-2 border-slate-300 dark:border-slate-700 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3.5">
              <div className="p-3 bg-red-100 dark:bg-red-950/80 text-red-600 dark:text-red-400 rounded-xl shrink-0">
                <AlertCircle className="w-7 h-7" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                  Unrecognized Line Items ({erroneousModalState.invalidCount})
                </h3>
                <p className="text-sm font-medium text-slate-600 dark:text-slate-400">
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
            <div className="max-h-48 overflow-y-auto space-y-2 border-2 border-slate-200 dark:border-slate-800 rounded-xl p-3 bg-slate-50 dark:bg-slate-800/50">
              <div className="text-xs uppercase font-bold text-slate-500 dark:text-slate-400 px-1">
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
            <div className="flex items-center justify-between text-sm px-1 text-slate-700 dark:text-slate-300 font-semibold">
              <span>Valid items to be saved: <strong className="text-[#0072ce] dark:text-[#38bdf8] text-base">{erroneousModalState.validCount}</strong></span>
              <span>Erroneous items to exclude: <strong className="text-red-700 dark:text-red-400 text-base">{erroneousModalState.invalidCount}</strong></span>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row justify-end gap-3 pt-3 border-t-2 border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={handleCancelErroneousModal}
                className="px-4 py-2.5 text-sm font-bold text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 border-2 border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl transition-colors cursor-pointer"
              >
                Cancel & Fix Entries
              </button>

              <button
                type="button"
                disabled={erroneousModalState.validCount === 0}
                onClick={handleSaveValidExceptErroneous}
                className="px-5 py-2.5 text-sm font-bold text-white bg-[#0072ce] hover:bg-[#005ea8] disabled:opacity-50 disabled:cursor-not-allowed rounded-xl shadow-sm transition-colors flex items-center justify-center gap-2 cursor-pointer"
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
        </div>
      </div>
    </div>
  );
};
