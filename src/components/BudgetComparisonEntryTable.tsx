import React, { useState, useEffect, useMemo, useRef } from 'react';
import { FinancialDataStore } from '../types/fs';
import {
  BUDGET_COMPARISON_ROWS,
  BUDGET_COMPARISON_ALL_STORAGE_KEYS,
  BudgetComparisonColumnKey,
  getBudgetComparisonStorageKey,
} from '../data/budgetComparisonLineItems';
import {
  formatBudgetComparisonNumber,
  loadBudgetComparisonNotes,
  saveBudgetComparisonNotes,
} from '../utils/budgetComparisonCalculations';
import { parseNumberInput } from '../utils/formatters';
import {
  Check,
  RotateCcw,
  Trash2,
  ChevronRight,
  Calculator,
  Calendar,
  Table2,
  CheckCircle2,
  Lock,
} from 'lucide-react';
import { ConfirmModal } from './ConfirmModal';

interface BudgetComparisonEntryTableProps {
  divisionId: string;
  divisionName: string;
  selectedYear: string;
  dataStore: FinancialDataStore;
  onSaveBatchAmounts: (
    year: string,
    divisionId: string,
    entries: { lineItemId: string; amount: number }[]
  ) => void;
  onDeleteAmount: (year: string, divisionId: string, lineItemId: string) => void;
  onNavigateToViewFS: () => void;
}

type CellDraft = {
  orig: string;
  final: string;
  actual: string;
};

type DraftGridState = Record<string, CellDraft>;

const formatEditableNumeric = (val: number | undefined): string => {
  if (!val || Math.abs(val) < 0.005) return '';
  return val.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

const buildDraftGridFromStore = (
  dataStore: FinancialDataStore,
  year: string,
  divisionId: string
): DraftGridState => {
  const divData = dataStore[year]?.[divisionId] || {};
  const next: DraftGridState = {};
  BUDGET_COMPARISON_ROWS.forEach((row) => {
    next[row.id] = {
      orig: formatEditableNumeric(divData[getBudgetComparisonStorageKey(row.id, 'orig')]),
      final: formatEditableNumeric(divData[getBudgetComparisonStorageKey(row.id, 'final')]),
      actual: formatEditableNumeric(divData[getBudgetComparisonStorageKey(row.id, 'actual')]),
    };
  });
  return next;
};

export const BudgetComparisonEntryTable: React.FC<BudgetComparisonEntryTableProps> = ({
  divisionId,
  divisionName,
  selectedYear,
  dataStore,
  onSaveBatchAmounts,
  onDeleteAmount,
  onNavigateToViewFS,
}) => {
  const [draftGrid, setDraftGrid] = useState<DraftGridState>(() =>
    buildDraftGridFromStore(dataStore, selectedYear, divisionId)
  );
  const [draftNotes, setDraftNotes] = useState<Record<string, string>>(() =>
    loadBudgetComparisonNotes(selectedYear, divisionId)
  );
  const [isDirty, setIsDirty] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [isResetConfirmOpen, setIsResetConfirmOpen] = useState(false);

  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  useEffect(() => {
    setDraftGrid(buildDraftGridFromStore(dataStore, selectedYear, divisionId));
    setDraftNotes(loadBudgetComparisonNotes(selectedYear, divisionId));
    setIsDirty(false);
    setSaveMessage(null);
  }, [selectedYear, divisionId]);

  // Also sync external updates (e.g., benchmark reload or data transfer) if user has no unsaved edits
  useEffect(() => {
    if (!isDirty) {
      setDraftGrid(buildDraftGridFromStore(dataStore, selectedYear, divisionId));
      setDraftNotes(loadBudgetComparisonNotes(selectedYear, divisionId));
    }
  }, [dataStore, selectedYear, divisionId, isDirty]);

  const liveSummary = useMemo(() => {
    const computeRows = (group: 'RECEIPTS' | 'PAYMENTS') =>
      BUDGET_COMPARISON_ROWS.filter((r) => r.group === group).map((row) => {
        const cell = draftGrid[row.id] || { orig: '', final: '', actual: '' };
        const original = parseNumberInput(cell.orig);
        const final = parseNumberInput(cell.final);
        const actual = parseNumberInput(cell.actual);
        const difference = Math.round((final - actual) * 100) / 100;
        return {
          ...row,
          original,
          final,
          actual,
          difference,
        };
      });

    const receipts = computeRows('RECEIPTS');
    const payments = computeRows('PAYMENTS');

    const sumGroup = (rows: ReturnType<typeof computeRows>) => {
      const original = Math.round(rows.reduce((s, r) => s + r.original, 0) * 100) / 100;
      const final = Math.round(rows.reduce((s, r) => s + r.final, 0) * 100) / 100;
      const actual = Math.round(rows.reduce((s, r) => s + r.actual, 0) * 100) / 100;
      const difference = Math.round((final - actual) * 100) / 100;
      return { original, final, actual, difference };
    };

    const totalReceipts = sumGroup(receipts);
    const totalPayments = sumGroup(payments);
    const netReceiptsPayments = {
      original: Math.round((totalReceipts.original - totalPayments.original) * 100) / 100,
      final: Math.round((totalReceipts.final - totalPayments.final) * 100) / 100,
      actual: Math.round((totalReceipts.actual - totalPayments.actual) * 100) / 100,
      difference: Math.round((totalReceipts.difference - totalPayments.difference) * 100) / 100,
    };

    return {
      receipts,
      payments,
      totalReceipts,
      totalPayments,
      netReceiptsPayments,
    };
  }, [draftGrid]);

  const handleCellChange = (
    rowId: string,
    col: BudgetComparisonColumnKey,
    value: string
  ) => {
    setDraftGrid((prev) => ({
      ...prev,
      [rowId]: {
        ...(prev[rowId] || { orig: '', final: '', actual: '' }),
        [col]: value,
      },
    }));
    setIsDirty(true);
    setSaveMessage(null);
  };

  const handleCellBlur = (rowId: string, col: BudgetComparisonColumnKey) => {
    setDraftGrid((prev) => {
      const currentRaw = prev[rowId]?.[col] ?? '';
      const trimmed = currentRaw.trim();
      if (!trimmed) {
        return {
          ...prev,
          [rowId]: {
            ...(prev[rowId] || { orig: '', final: '', actual: '' }),
            [col]: '',
          },
        };
      }
      const num = parseNumberInput(trimmed);
      return {
        ...prev,
        [rowId]: {
          ...(prev[rowId] || { orig: '', final: '', actual: '' }),
          [col]: formatEditableNumeric(num),
        },
      };
    });
  };

  const handleNoteChange = (rowId: string, value: string) => {
    setDraftNotes((prev) => ({
      ...prev,
      [rowId]: value,
    }));
    setIsDirty(true);
    setSaveMessage(null);
  };

  const handleSaveTable = (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    const entries: { lineItemId: string; amount: number }[] = [];
    BUDGET_COMPARISON_ROWS.forEach((row) => {
      const cell = draftGrid[row.id] || { orig: '', final: '', actual: '' };
      (['orig', 'final', 'actual'] as const).forEach((col) => {
        const key = getBudgetComparisonStorageKey(row.id, col);
        const val = parseNumberInput(cell[col]);
        entries.push({ lineItemId: key, amount: Math.abs(val) < 0.005 ? 0 : val });
      });
    });

    onSaveBatchAmounts(selectedYear, divisionId, entries);
    saveBudgetComparisonNotes(selectedYear, divisionId, draftNotes);
    setDraftGrid(
      BUDGET_COMPARISON_ROWS.reduce<DraftGridState>((acc, row) => {
        const cell = draftGrid[row.id] || { orig: '', final: '', actual: '' };
        acc[row.id] = {
          orig: formatEditableNumeric(parseNumberInput(cell.orig)),
          final: formatEditableNumeric(parseNumberInput(cell.final)),
          actual: formatEditableNumeric(parseNumberInput(cell.actual)),
        };
        return acc;
      }, {})
    );
    setIsDirty(false);
    setSaveMessage(
      `Saved Statement of Comparison of Budget and Actual Amounts for ${divisionName} (FY ${selectedYear}).`
    );
    setTimeout(() => setSaveMessage(null), 5000);
  };

  const handleDiscardEdits = () => {
    setDraftGrid(buildDraftGridFromStore(dataStore, selectedYear, divisionId));
    setDraftNotes(loadBudgetComparisonNotes(selectedYear, divisionId));
    setIsDirty(false);
    setSaveMessage(null);
  };

  const handleConfirmResetAll = () => {
    BUDGET_COMPARISON_ALL_STORAGE_KEYS.forEach((key) => {
      onDeleteAmount(selectedYear, divisionId, key);
    });
    saveBudgetComparisonNotes(selectedYear, divisionId, {});
    const clearedGrid: DraftGridState = {};
    BUDGET_COMPARISON_ROWS.forEach((row) => {
      clearedGrid[row.id] = { orig: '', final: '', actual: '' };
    });
    setDraftGrid(clearedGrid);
    setDraftNotes({});
    setIsDirty(false);
    setIsResetConfirmOpen(false);
    setSaveMessage(
      `Reset all Budget & Actual amounts to zero for ${divisionName} (FY ${selectedYear}).`
    );
    setTimeout(() => setSaveMessage(null), 4000);
  };

  const focusCell = (rowIndex: number, col: BudgetComparisonColumnKey) => {
    const targetRow = BUDGET_COMPARISON_ROWS[rowIndex];
    if (!targetRow) return;
    const el = inputRefs.current[`${targetRow.id}__${col}`];
    if (el) {
      el.focus();
      el.select();
    }
  };

  const handleNumericKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
    rowId: string,
    col: BudgetComparisonColumnKey
  ) => {
    if (e.key === 'Enter' && e.shiftKey) {
      e.preventDefault();
      handleSaveTable();
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      const rowIdx = BUDGET_COMPARISON_ROWS.findIndex((r) => r.id === rowId);
      if (rowIdx < 0) return;
      if (col === 'orig') {
        focusCell(rowIdx, 'final');
      } else if (col === 'final') {
        focusCell(rowIdx, 'actual');
      } else if (rowIdx + 1 < BUDGET_COMPARISON_ROWS.length) {
        focusCell(rowIdx + 1, 'orig');
      }
    }
  };

  const renderEditableSection = (
    sectionLabel: 'RECEIPTS' | 'PAYMENTS',
    rows: typeof liveSummary.receipts,
    totals: typeof liveSummary.totalReceipts,
    totalLabel: string,
    showNotesHeader: boolean
  ) => (
    <>
      <tr className="bg-th-subtle/80 border-y border-th-border">
        <td className="py-2.5 px-4 font-bold text-sm tracking-wide text-th-text uppercase">
          {sectionLabel}
        </td>
        <td className="py-2.5 px-2 text-center font-bold text-xs text-th-muted uppercase">
          {showNotesHeader ? 'Notes' : ''}
        </td>
        <td colSpan={4} className="py-2.5 px-4 text-right text-xs text-th-muted font-medium">
          {showNotesHeader
            ? 'Encode Original, Final, and Actual amounts. Difference & totals update automatically.'
            : ''}
        </td>
      </tr>

      {rows.map((row) => {
        const cell = draftGrid[row.id] || { orig: '', final: '', actual: '' };
        const diffIsNeg = row.difference < -0.004;

        return (
          <tr
            key={row.id}
            className="border-b border-th-border/80 hover:bg-th-subtle/40 transition-colors"
          >
            <td className="py-2 pl-7 pr-4 text-sm font-medium text-th-text">
              {row.name}
            </td>

            {/* Notes Reference */}
            <td className="py-1.5 px-2 w-24">
              <input
                type="text"
                value={draftNotes[row.id] || ''}
                onChange={(e) => handleNoteChange(row.id, e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && e.shiftKey) {
                    e.preventDefault();
                    handleSaveTable();
                  }
                }}
                placeholder="—"
                aria-label={`Notes for ${row.name}`}
                className="w-full min-h-[38px] px-2 py-1.5 text-center text-sm font-mono bg-th-input border border-th-border-strong rounded-lg text-th-text focus:outline-hidden focus:border-th-accent focus:ring-2 focus:ring-th-accent/20"
              />
            </td>

            {/* Editable Columns: Original, Final, Actual */}
            {(['orig', 'final', 'actual'] as const).map((col) => {
              const colLabel =
                col === 'orig'
                  ? 'Budgeted Amount Original'
                  : col === 'final'
                  ? 'Budgeted Amount Final'
                  : 'Actual Amounts on Comparable Basis';
              return (
                <td key={col} className="py-1.5 px-2">
                  <input
                    ref={(el) => {
                      inputRefs.current[`${row.id}__${col}`] = el;
                    }}
                    type="text"
                    inputMode="decimal"
                    value={cell[col]}
                    onChange={(e) => handleCellChange(row.id, col, e.target.value)}
                    onFocus={(e) => e.target.select()}
                    onBlur={() => handleCellBlur(row.id, col)}
                    onKeyDown={(e) => handleNumericKeyDown(e, row.id, col)}
                    placeholder="0.00"
                    aria-label={`${row.name} — ${colLabel}`}
                    className="w-full min-h-[38px] px-3 py-1.5 text-right text-sm font-mono font-semibold tabular-nums bg-th-input border border-th-border-strong rounded-lg text-th-text focus:outline-hidden focus:border-th-accent focus:ring-2 focus:ring-th-accent/20"
                  />
                </td>
              );
            })}

            {/* Auto-Computed Column: Difference Final Budget and Actual */}
            <td
              className={`py-2 px-4 text-right text-sm font-mono font-semibold tabular-nums bg-th-subtle/50 select-all ${
                diffIsNeg ? 'text-red-700 dark:text-red-400' : 'text-th-text'
              }`}
              title="Auto-computed: Final Budget minus Actual Amounts on Comparable Basis"
            >
              {formatBudgetComparisonNumber(row.difference)}
            </td>
          </tr>
        );
      })}

      {/* Auto-Computed Total Row */}
      <tr className="bg-th-subtle/90 border-t-2 border-b-2 border-th-border-strong font-bold text-sm text-th-text">
        <td className="py-3 pl-7 pr-4">{totalLabel}</td>
        <td className="py-3 px-2 text-center text-xs text-th-muted">Auto</td>
        <td className="py-3 px-3 text-right font-mono tabular-nums">
          {formatBudgetComparisonNumber(totals.original)}
        </td>
        <td className="py-3 px-3 text-right font-mono tabular-nums">
          {formatBudgetComparisonNumber(totals.final)}
        </td>
        <td className="py-3 px-3 text-right font-mono tabular-nums">
          {formatBudgetComparisonNumber(totals.actual)}
        </td>
        <td
          className={`py-3 px-4 text-right font-mono tabular-nums ${
            totals.difference < -0.004 ? 'text-red-700 dark:text-red-400' : 'text-th-text'
          }`}
        >
          {formatBudgetComparisonNumber(totals.difference)}
        </td>
      </tr>
    </>
  );

  return (
    <div className="space-y-6">
      <form
        onSubmit={handleSaveTable}
        className="bg-th-surface border-2 border-th-border rounded-2xl p-6 shadow-xs transition-colors space-y-5"
      >
        {/* Header & Primary Controls */}
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 pb-4 border-b border-th-border">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2.5 flex-wrap">
              <Table2 className="w-5 h-5 text-th-muted shrink-0" />
              <h3 className="text-lg sm:text-xl font-bold text-th-text">
                Statement of Comparison of Budget and Actual Amounts
              </h3>
              {isDirty && (
                <span className="text-xs font-bold text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/50 border border-amber-300 dark:border-amber-800 px-2.5 py-0.5 rounded-lg whitespace-nowrap">
                  Unsaved changes
                </span>
              )}
            </div>
            <p className="text-sm text-th-muted mt-1 leading-relaxed">
              Table-form entry for <strong className="text-th-text">{divisionName}</strong>{' '}
              <span aria-hidden="true">·</span>{' '}
              <span className="inline-flex items-center gap-1 font-semibold text-th-text">
                <Calendar className="w-3.5 h-3.5 text-th-muted" />
                FY {selectedYear}
              </span>
              . Enter Original, Final, and Actual amounts directly in the grid. Difference, Total Receipts, Total Payments, and Net Receipts/Payment calculate automatically.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            {isDirty && (
              <button
                type="button"
                onClick={handleDiscardEdits}
                className="min-h-[42px] px-4 py-2 text-sm font-bold text-th-text bg-th-subtle hover:bg-th-subtle-hover border-2 border-th-border-strong rounded-xl transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <RotateCcw className="w-4 h-4 text-th-muted shrink-0" />
                <span>Discard Edits</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setIsResetConfirmOpen(true)}
              className="min-h-[42px] px-4 py-2 text-sm font-bold text-red-800 dark:text-red-300 bg-red-50 dark:bg-red-950/60 hover:bg-red-100 dark:hover:bg-red-900/60 border-2 border-red-200 dark:border-red-800 rounded-xl transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Trash2 className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0" />
              <span>Reset All to Zero</span>
            </button>

            <button
              type="button"
              onClick={onNavigateToViewFS}
              className="min-h-[42px] px-4 py-2 text-sm font-bold text-th-primary-fg bg-th-primary hover:opacity-90 rounded-xl transition-colors border-2 border-th-primary dark:border-th-border-strong inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer shadow-xs"
            >
              <span>View Statement</span>
              <ChevronRight className="w-4 h-4 shrink-0" />
            </button>

            <button
              type="submit"
              className="min-h-[42px] px-5 py-2 text-sm font-bold text-th-accent-fg bg-th-accent hover:bg-th-accent-hover rounded-xl shadow-sm transition-colors inline-flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Check className="w-4 h-4 stroke-[2.5] shrink-0" />
              <span>Save Table</span>
            </button>
          </div>
        </div>

        {saveMessage && (
          <div className="px-4 py-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200 text-sm font-bold flex items-center gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-700 dark:text-emerald-400 shrink-0" />
            <span>{saveMessage}</span>
          </div>
        )}

        {/* Quick Summary Strip */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 text-sm">
          <div className="p-3.5 bg-th-subtle/70 rounded-xl border border-th-border">
            <div className="text-xs font-semibold text-th-muted">Total Receipts (Final / Actual)</div>
            <div className="mt-1 flex items-baseline justify-between gap-2 font-mono font-bold tabular-nums text-th-text">
              <span>{formatBudgetComparisonNumber(liveSummary.totalReceipts.final)}</span>
              <span className="text-xs text-th-muted">/</span>
              <span>{formatBudgetComparisonNumber(liveSummary.totalReceipts.actual)}</span>
            </div>
          </div>

          <div className="p-3.5 bg-th-subtle/70 rounded-xl border border-th-border">
            <div className="text-xs font-semibold text-th-muted">Total Payments (Final / Actual)</div>
            <div className="mt-1 flex items-baseline justify-between gap-2 font-mono font-bold tabular-nums text-th-text">
              <span>{formatBudgetComparisonNumber(liveSummary.totalPayments.final)}</span>
              <span className="text-xs text-th-muted">/</span>
              <span>{formatBudgetComparisonNumber(liveSummary.totalPayments.actual)}</span>
            </div>
          </div>

          <div className="p-3.5 bg-th-subtle/70 rounded-xl border border-th-border-strong">
            <div className="text-xs font-bold text-th-text flex items-center gap-1.5">
              <Calculator className="w-3.5 h-3.5 text-th-muted shrink-0" />
              <span>Net Receipts/Payment (Actual)</span>
            </div>
            <div
              className={`mt-1 text-base font-extrabold font-mono tabular-nums ${
                liveSummary.netReceiptsPayments.actual < -0.004
                  ? 'text-red-700 dark:text-red-400'
                  : 'text-th-text'
              }`}
            >
              {formatBudgetComparisonNumber(liveSummary.netReceiptsPayments.actual)}
            </div>
          </div>

          <div className="p-3.5 bg-th-subtle/70 rounded-xl border border-th-border-strong">
            <div className="text-xs font-bold text-th-text flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5 text-th-muted shrink-0" />
              <span>Net Difference (Final − Actual)</span>
            </div>
            <div
              className={`mt-1 text-base font-extrabold font-mono tabular-nums ${
                liveSummary.netReceiptsPayments.difference < -0.004
                  ? 'text-red-700 dark:text-red-400'
                  : 'text-th-text'
              }`}
            >
              {formatBudgetComparisonNumber(liveSummary.netReceiptsPayments.difference)}
            </div>
          </div>
        </div>

        {/* Interactive Table Form */}
        <div className="overflow-x-auto border-2 border-th-border rounded-xl">
          <table className="w-full min-w-[920px] border-collapse text-left">
            <thead>
              <tr className="bg-th-table-head text-th-table-head-fg text-xs sm:text-sm font-bold border-b border-th-border">
                <th
                  rowSpan={2}
                  colSpan={2}
                  className="py-3 px-4 text-center border-r border-th-border w-[32%]"
                >
                  Particulars
                </th>
                <th
                  colSpan={2}
                  className="py-2 px-4 text-center border-b border-r border-th-border w-[34%]"
                >
                  Budgeted Amount
                </th>
                <th
                  rowSpan={2}
                  className="py-3 px-3 text-center border-r border-th-border w-[17%]"
                >
                  Actual Amounts on Comparable Basis
                </th>
                <th
                  rowSpan={2}
                  className="py-3 px-3 text-center w-[17%]"
                >
                  <div>Difference Final Budget and Actual</div>
                  <div className="text-[11px] font-medium opacity-80 mt-0.5">
                    Auto (Final − Actual)
                  </div>
                </th>
              </tr>
              <tr className="bg-th-table-head text-th-table-head-fg text-xs sm:text-sm font-bold border-b-2 border-th-border">
                <th className="py-2 px-3 text-center border-r border-th-border w-[17%]">
                  Original
                </th>
                <th className="py-2 px-3 text-center border-r border-th-border w-[17%]">
                  Final
                </th>
              </tr>
            </thead>

            <tbody>
              {renderEditableSection(
                'RECEIPTS',
                liveSummary.receipts,
                liveSummary.totalReceipts,
                'Total Receipts',
                true
              )}

              <tr>
                <td colSpan={6} className="h-3 bg-th-surface" />
              </tr>

              {renderEditableSection(
                'PAYMENTS',
                liveSummary.payments,
                liveSummary.totalPayments,
                'Total Payments',
                false
              )}

              <tr>
                <td colSpan={6} className="h-3 bg-th-surface" />
              </tr>

              {/* Auto-Computed NET RECEIPTS/PAYMENT Row */}
              <tr className="bg-th-subtle border-t-2 border-b-4 border-double border-th-border-strong font-extrabold text-sm sm:text-base text-th-text">
                <td className="py-3.5 px-4 uppercase tracking-wide">
                  NET RECEIPTS/PAYMENT
                </td>
                <td className="py-3.5 px-2 text-center text-xs font-semibold text-th-muted">
                  Auto
                </td>
                <td
                  className={`py-3.5 px-3 text-right font-mono tabular-nums ${
                    liveSummary.netReceiptsPayments.original < -0.004
                      ? 'text-red-700 dark:text-red-400'
                      : 'text-th-text'
                  }`}
                >
                  {formatBudgetComparisonNumber(liveSummary.netReceiptsPayments.original)}
                </td>
                <td
                  className={`py-3.5 px-3 text-right font-mono tabular-nums ${
                    liveSummary.netReceiptsPayments.final < -0.004
                      ? 'text-red-700 dark:text-red-400'
                      : 'text-th-text'
                  }`}
                >
                  {formatBudgetComparisonNumber(liveSummary.netReceiptsPayments.final)}
                </td>
                <td
                  className={`py-3.5 px-3 text-right font-mono tabular-nums ${
                    liveSummary.netReceiptsPayments.actual < -0.004
                      ? 'text-red-700 dark:text-red-400'
                      : 'text-th-text'
                  }`}
                >
                  {formatBudgetComparisonNumber(liveSummary.netReceiptsPayments.actual)}
                </td>
                <td
                  className={`py-3.5 px-4 text-right font-mono tabular-nums ${
                    liveSummary.netReceiptsPayments.difference < -0.004
                      ? 'text-red-700 dark:text-red-400'
                      : 'text-th-text'
                  }`}
                >
                  {formatBudgetComparisonNumber(liveSummary.netReceiptsPayments.difference)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Footer Save Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
          <div className="text-xs sm:text-sm text-th-muted font-medium">
            Press <strong className="text-th-text">Enter</strong> to advance across Original → Final → Actual, or{' '}
            <strong className="text-th-text">Shift + Enter</strong> to save the table.
          </div>

          <button
            type="submit"
            className="self-end sm:self-auto min-h-[44px] px-6 py-2.5 text-sm sm:text-base font-bold text-th-accent-fg bg-th-accent hover:bg-th-accent-hover rounded-xl shadow-sm transition-colors inline-flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Check className="w-5 h-5 stroke-[2.5] shrink-0" />
            <span>Save Budget Comparison Table</span>
          </button>
        </div>
      </form>

      <ConfirmModal
        isOpen={isResetConfirmOpen}
        title="Reset Budget Comparison to Zero?"
        message={`Are you sure you want to clear all Original, Final, Actual, and Notes entries for the Statement of Comparison of Budget and Actual Amounts in ${divisionName} (FY ${selectedYear})?`}
        confirmLabel="Yes, Reset to Zero"
        cancelLabel="Cancel"
        variant="danger"
        onConfirm={handleConfirmResetAll}
        onCancel={() => setIsResetConfirmOpen(false)}
      />
    </div>
  );
};
