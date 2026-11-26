import React, { useState, useEffect, useMemo, useRef } from 'react';
import { BudgetComparisonDraft, FinancialDataStore } from '../types/fs';
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
  FileText,
  ArrowLeft,
  Printer,
  Download,
} from 'lucide-react';
import { ConfirmModal } from './ConfirmModal';
import { TipsButton } from './TipsButton';

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
  savedDraft?: BudgetComparisonDraft;
  onDraftStateChange?: (draftKey: string, draft: BudgetComparisonDraft | null) => void;
}

type CellDraft = {
  orig: string;
  final: string;
  actual: string;
};

type DraftGridState = Record<string, CellDraft>;

const NUMERIC_COLS: BudgetComparisonColumnKey[] = ['orig', 'final', 'actual'];

const parseClipboardTsvGrid = (rawText: string): string[][] => {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = '';
  let inQuotes = false;

  for (let i = 0; i < rawText.length; i++) {
    const ch = rawText[i];
    const next = rawText[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        currentCell += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        currentCell += ch;
      }
    } else if (ch === '"' && currentCell === '') {
      inQuotes = true;
    } else if (ch === '\t') {
      currentRow.push(currentCell.trim());
      currentCell = '';
    } else if (ch === '\r' && next === '\n') {
      currentRow.push(currentCell.trim());
      rows.push(currentRow);
      currentRow = [];
      currentCell = '';
      i++;
    } else if (ch === '\n' || ch === '\r') {
      currentRow.push(currentCell.trim());
      rows.push(currentRow);
      currentRow = [];
      currentCell = '';
    } else {
      currentCell += ch;
    }
  }

  if (currentCell !== '' || currentRow.length > 0) {
    currentRow.push(currentCell.trim());
    rows.push(currentRow);
  }

  while (
    rows.length > 0 &&
    rows[rows.length - 1].every((cell) => cell === '')
  ) {
    rows.pop();
  }

  return rows;
};

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
  savedDraft,
  onDraftStateChange,
}) => {
  const draftKey = `${selectedYear}::${divisionId}`;
  const savedDraftRef = useRef(savedDraft);
  savedDraftRef.current = savedDraft;
  const onDraftStateChangeRef = useRef(onDraftStateChange);
  onDraftStateChangeRef.current = onDraftStateChange;

  const [draftGrid, setDraftGrid] = useState<DraftGridState>(() =>
    savedDraft?.isDirty
      ? savedDraft.draftGrid
      : buildDraftGridFromStore(dataStore, selectedYear, divisionId)
  );
  const [draftNotes, setDraftNotes] = useState<Record<string, string>>(() =>
    savedDraft?.isDirty
      ? savedDraft.draftNotes
      : loadBudgetComparisonNotes(selectedYear, divisionId)
  );
  const [isDirty, setIsDirty] = useState<boolean>(() => Boolean(savedDraft?.isDirty));
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [isResetConfirmOpen, setIsResetConfirmOpen] = useState(false);
  const [isDraftPreviewOpen, setIsDraftPreviewOpen] = useState(false);

  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  useEffect(() => {
    const restored = savedDraftRef.current;
    if (restored?.isDirty) {
      setDraftGrid(restored.draftGrid);
      setDraftNotes(restored.draftNotes);
      setIsDirty(true);
    } else {
      setDraftGrid(buildDraftGridFromStore(dataStore, selectedYear, divisionId));
      setDraftNotes(loadBudgetComparisonNotes(selectedYear, divisionId));
      setIsDirty(false);
    }
    setSaveMessage(null);
    setIsDraftPreviewOpen(false);
  }, [selectedYear, divisionId]);

  useEffect(() => {
    if (!isDirty) return;
    onDraftStateChangeRef.current?.(draftKey, {
      draftGrid,
      draftNotes,
      isDirty: true,
    });
  }, [draftKey, draftGrid, draftNotes, isDirty]);

  useEffect(() => {
    if (!isDraftPreviewOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsDraftPreviewOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isDraftPreviewOpen]);

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
    onDraftStateChange?.(draftKey, null);
    setSaveMessage(
      `Saved Statement of Comparison of Budget and Actual Amounts for ${divisionName} (FY ${selectedYear}).`
    );
    setTimeout(() => setSaveMessage(null), 5000);
  };

  const handleDiscardEdits = () => {
    setDraftGrid(buildDraftGridFromStore(dataStore, selectedYear, divisionId));
    setDraftNotes(loadBudgetComparisonNotes(selectedYear, divisionId));
    setIsDirty(false);
    onDraftStateChange?.(draftKey, null);
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
    onDraftStateChange?.(draftKey, null);
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

  const handleGridPaste = (
    e: React.ClipboardEvent<HTMLInputElement>,
    startRowId: string,
    startCol: 'notes' | BudgetComparisonColumnKey
  ) => {
    const raw = e.clipboardData?.getData('text/plain');
    if (!raw) return;

    const pastedRows = parseClipboardTsvGrid(raw);
    const isMultiCell =
      pastedRows.length > 1 || (pastedRows[0] && pastedRows[0].length > 1);
    if (!isMultiCell) return;

    const startRow = BUDGET_COMPARISON_ROWS.find((r) => r.id === startRowId);
    if (!startRow) return;

    const sectionRows = BUDGET_COMPARISON_ROWS.filter(
      (r) => r.group === startRow.group
    );
    const sectionStartIdx = sectionRows.findIndex((r) => r.id === startRowId);
    if (sectionStartIdx < 0) return;

    e.preventDefault();

    const colOrder: ('notes' | BudgetComparisonColumnKey)[] =
      startCol === 'notes'
        ? ['notes', ...NUMERIC_COLS]
        : NUMERIC_COLS;
    const startColIdx = colOrder.indexOf(startCol);
    if (startColIdx < 0) return;

    let cellsUpdated = 0;
    const nextGrid: DraftGridState = { ...draftGrid };
    const nextNotes: Record<string, string> = { ...draftNotes };

    for (let rOffset = 0; rOffset < pastedRows.length; rOffset++) {
      const targetRow = sectionRows[sectionStartIdx + rOffset];
      if (!targetRow) break;

      const sourceCols = pastedRows[rOffset];
      const existingCell = nextGrid[targetRow.id] || {
        orig: '',
        final: '',
        actual: '',
      };
      const updatedCell: CellDraft = { ...existingCell };

      for (let cOffset = 0; cOffset < sourceCols.length; cOffset++) {
        const targetCol = colOrder[startColIdx + cOffset];
        if (!targetCol) break;

        const rawCell = sourceCols[cOffset];
        if (targetCol === 'notes') {
          nextNotes[targetRow.id] = rawCell;
          cellsUpdated++;
        } else {
          const parsedNum = parseNumberInput(rawCell);
          updatedCell[targetCol] = formatEditableNumeric(parsedNum);
          cellsUpdated++;
        }
      }

      nextGrid[targetRow.id] = updatedCell;
    }

    if (cellsUpdated > 0) {
      setDraftGrid(nextGrid);
      setDraftNotes(nextNotes);
      setIsDirty(true);
      setSaveMessage(
        `Pasted ${cellsUpdated} cell${cellsUpdated === 1 ? '' : 's'} into ${startRow.group}. Click "Save Table" to commit changes.`
      );
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

  const handleExportDraftCSV = () => {
    const bcRows: string[][] = [
      ['Department of Education'],
      ['Regional Office No. VI'],
      [divisionName],
      ['Statement of Comparison of Budget and Actual Amounts (Draft)'],
      ['All Funds'],
      [`For the Year Ended December 31, ${selectedYear}`],
      [],
      [
        'Particulars',
        'Notes',
        'Budgeted Amount - Original',
        'Budgeted Amount - Final',
        'Actual Amounts on Comparable Basis',
        'Difference Final Budget and Actual',
      ],
      ['"RECEIPTS"'],
    ];

    liveSummary.receipts.forEach((row) => {
      bcRows.push([
        `"${row.name}"`,
        `"${draftNotes[row.id] || ''}"`,
        row.original.toString(),
        row.final.toString(),
        row.actual.toString(),
        row.difference.toString(),
      ]);
    });
    bcRows.push([
      '"Total Receipts"',
      '""',
      liveSummary.totalReceipts.original.toString(),
      liveSummary.totalReceipts.final.toString(),
      liveSummary.totalReceipts.actual.toString(),
      liveSummary.totalReceipts.difference.toString(),
    ]);
    bcRows.push([]);
    bcRows.push(['"PAYMENTS"']);
    liveSummary.payments.forEach((row) => {
      bcRows.push([
        `"${row.name}"`,
        `"${draftNotes[row.id] || ''}"`,
        row.original.toString(),
        row.final.toString(),
        row.actual.toString(),
        row.difference.toString(),
      ]);
    });
    bcRows.push([
      '"Total Payments"',
      '""',
      liveSummary.totalPayments.original.toString(),
      liveSummary.totalPayments.final.toString(),
      liveSummary.totalPayments.actual.toString(),
      liveSummary.totalPayments.difference.toString(),
    ]);
    bcRows.push([]);
    bcRows.push([
      '"NET RECEIPTS/PAYMENT"',
      '""',
      liveSummary.netReceiptsPayments.original.toString(),
      liveSummary.netReceiptsPayments.final.toString(),
      liveSummary.netReceiptsPayments.actual.toString(),
      liveSummary.netReceiptsPayments.difference.toString(),
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + bcRows.map((r) => r.join(',')).join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute(
      'download',
      `${divisionName.replace(/\s+/g, '_')}_BUDGET_COMPARISON_DRAFT_${selectedYear}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
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
                onPaste={(e) => handleGridPaste(e, row.id, 'notes')}
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
                    onPaste={(e) => handleGridPaste(e, row.id, col)}
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
    <div className="@container space-y-6">
      {!isDraftPreviewOpen && (
      <form
        onSubmit={handleSaveTable}
        className="bg-th-surface border-2 border-th-border rounded-2xl p-4 sm:p-6 shadow-xs transition-colors space-y-5"
      >
        {/* Header & Primary Controls */}
        <div className="flex flex-col @3xl:flex-row @3xl:items-center justify-between gap-4 pb-4 border-b border-th-border">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2.5 flex-wrap">
              <Table2 className="w-5 h-5 text-th-muted shrink-0" />
              <h3 className="text-lg sm:text-xl font-bold text-th-text">
                Statement of Comparison of Budget and Actual Amounts
              </h3>
              <TipsButton>
                <p>
                  Enter amounts directly or copy cells from Excel and paste (<strong className="text-th-text">Ctrl+V</strong>) into any starting cell of Receipts or Payments. Differences and totals calculate automatically.
                </p>
                <p className="pt-2 border-t border-th-border">
                  Press <strong className="text-th-text">Enter</strong> to advance to the next cell, or <strong className="text-th-text">Shift + Enter</strong> to save the table.
                </p>
              </TipsButton>
              {isDirty && (
                <span className="text-xs font-bold text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/50 border border-amber-300 dark:border-amber-800 px-2.5 py-0.5 rounded-lg whitespace-nowrap">
                  Unsaved changes
                </span>
              )}
            </div>
            <p className="text-sm text-th-muted mt-1 leading-relaxed flex items-center gap-1.5 flex-wrap">
              <strong className="text-th-text">{divisionName}</strong>
              <span aria-hidden="true">·</span>
              <span className="inline-flex items-center gap-1 font-semibold text-th-text">
                <Calendar className="w-3.5 h-3.5 text-th-muted" />
                FY {selectedYear}
              </span>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
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
              onClick={() => setIsDraftPreviewOpen(true)}
              className="min-h-[42px] px-4 py-2 text-sm font-bold text-th-text bg-th-subtle hover:bg-th-subtle-hover rounded-xl transition-colors border-2 border-th-border-strong inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
              title="Preview formatted statement using your current table figures without saving yet"
            >
              <FileText className="w-4 h-4 text-th-muted shrink-0" />
              <span>View Statement Draft</span>
            </button>

            <button
              type="button"
              onClick={onNavigateToViewFS}
              className="min-h-[42px] px-4 py-2 text-sm font-bold text-th-primary-fg bg-th-primary hover:opacity-90 rounded-xl transition-colors border-2 border-th-primary dark:border-th-border-strong inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer shadow-xs"
              title="Open saved Statement of Comparison of Budget and Actual Amounts in Financial Statements"
            >
              <span>View Saved FS</span>
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
        <div className="flex flex-wrap items-center justify-end gap-2.5 pt-1">
            <button
              type="button"
              onClick={() => setIsDraftPreviewOpen(true)}
              className="min-h-[44px] px-4 py-2.5 text-sm font-bold text-th-text bg-th-subtle hover:bg-th-subtle-hover border-2 border-th-border-strong rounded-xl transition-colors inline-flex items-center gap-2 whitespace-nowrap cursor-pointer"
            >
              <FileText className="w-4 h-4 text-th-muted shrink-0" />
              <span>View Statement Draft</span>
            </button>

            <button
              type="submit"
              className="min-h-[44px] px-5 sm:px-6 py-2.5 text-sm sm:text-base font-bold text-th-accent-fg bg-th-accent hover:bg-th-accent-hover rounded-xl shadow-sm transition-colors inline-flex items-center justify-center gap-2 text-center cursor-pointer"
            >
              <Check className="w-5 h-5 stroke-[2.5] shrink-0" />
              <span>Save Budget Comparison Table</span>
            </button>
        </div>
      </form>
      )}

      {isDraftPreviewOpen && (
        <div className="space-y-4">
          {/* Draft Preview Controls Banner (No-Print) */}
          <div className="no-print bg-th-surface border-2 border-th-border-strong rounded-2xl p-4 sm:p-5 shadow-xs space-y-3">
            <div className="flex flex-col @3xl:flex-row @3xl:items-center justify-between gap-4">
              <div className="flex items-start sm:items-center gap-3 min-w-0 flex-1">
                <div className="p-2.5 rounded-xl bg-th-primary text-th-primary-fg border border-th-border-strong shrink-0">
                  <FileText className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-base sm:text-lg font-bold text-th-text">
                      Statement of Comparison of Budget and Actual Amounts — Draft Preview
                    </h3>
                    {isDirty && (
                      <span className="text-xs font-bold text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/50 border border-amber-300 dark:border-amber-800 px-2.5 py-0.5 rounded-lg whitespace-nowrap">
                        Not Yet Saved
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-th-muted mt-0.5">
                    {isDirty
                      ? 'Showing your live encoded/pasted figures. Returning to the table keeps your unsaved edits intact.'
                      : 'Previewing your current encoded amounts as an official statement.'}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsDraftPreviewOpen(false)}
                  className="min-h-[42px] px-4 py-2 text-sm font-bold text-th-text bg-th-subtle hover:bg-th-subtle-hover border-2 border-th-border-strong rounded-xl transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <ArrowLeft className="w-4 h-4 text-th-muted shrink-0" />
                  <span>Back to Edit Table</span>
                </button>

                <button
                  type="button"
                  onClick={handleExportDraftCSV}
                  className="min-h-[42px] px-4 py-2 text-sm font-bold text-th-text bg-th-surface hover:bg-th-subtle-hover border-2 border-th-border-strong rounded-xl transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Download className="w-4 h-4 text-th-muted shrink-0" />
                  <span>Export Draft CSV</span>
                </button>

                <button
                  type="button"
                  onClick={() => window.print()}
                  className="min-h-[42px] px-4 py-2 text-sm font-bold text-th-text bg-th-surface hover:bg-th-subtle-hover border-2 border-th-border-strong rounded-xl transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Printer className="w-4 h-4 text-th-muted shrink-0" />
                  <span>Print Draft</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleSaveTable()}
                  className="min-h-[42px] px-5 py-2 text-sm font-bold text-th-accent-fg bg-th-accent hover:bg-th-accent-hover rounded-xl shadow-sm transition-colors inline-flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Check className="w-4 h-4 stroke-[2.5] shrink-0" />
                  <span>{isDirty ? 'Save Table Changes' : 'Save Table'}</span>
                </button>
              </div>
            </div>

            {saveMessage && (
              <div className="px-4 py-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200 text-sm font-bold flex items-center gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-700 dark:text-emerald-400 shrink-0" />
                <span>{saveMessage}</span>
              </div>
            )}
          </div>

          {/* Official Financial Statement Draft Paper Sheet */}
          <div className="bg-white text-black p-4 sm:p-8 lg:p-12 font-['Times_New_Roman',Times,serif] text-[12pt] leading-snug rounded-2xl border-2 border-th-border shadow-xs print:border-0 print:shadow-none print:rounded-none print:p-0">
            <div className="text-center mb-8">
              <div className="text-base font-bold">Department of Education</div>
              <div className="text-base font-bold">Regional Office No. VI</div>
              <div className="text-base font-bold">{divisionName}</div>
              <div className="text-base font-bold">
                Statement of Comparison of Budget and Actual Amounts
              </div>
              <div className="text-base font-bold">All Funds</div>
              <div className="text-base font-bold">
                For the Year Ended December 31, {selectedYear}
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-[11pt] border-collapse">
                <thead>
                  <tr>
                    <th
                      rowSpan={2}
                      colSpan={2}
                      className="py-2 px-3 text-center font-bold border border-black w-[36%]"
                    >
                      Particulars
                    </th>
                    <th
                      colSpan={2}
                      className="py-1.5 px-3 text-center font-bold border-t border-r border-b border-black w-[30%]"
                    >
                      Budgeted Amount
                    </th>
                    <th
                      rowSpan={2}
                      className="py-2 px-3 text-center font-bold border-t border-r border-b border-black w-[17%]"
                    >
                      Actual Amounts on Comparable Basis
                    </th>
                    <th
                      rowSpan={2}
                      className="py-2 px-3 text-center font-bold border-t border-r border-b border-black w-[17%]"
                    >
                      Difference Final Budget and Actual
                    </th>
                  </tr>
                  <tr>
                    <th className="py-2 px-3 text-center font-bold border-b border-r border-black w-[15%]">
                      Original
                    </th>
                    <th className="py-2 px-3 text-center font-bold border-b border-r border-black w-[15%]">
                      Final
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="pt-2 pb-0.5 pr-2 font-bold uppercase">RECEIPTS</td>
                    <td className="pt-2 pb-0.5 px-2 text-center font-bold w-14">Notes</td>
                    <td colSpan={4} />
                  </tr>
                  {liveSummary.receipts.map((row) => (
                    <tr key={row.id}>
                      <td className="py-0.5 pl-6 pr-2">{row.name}</td>
                      <td className="py-0.5 px-2 text-center">
                        {draftNotes[row.id] || ''}
                      </td>
                      <td className="py-0.5 px-3 text-right tabular-nums">
                        {formatBudgetComparisonNumber(row.original)}
                      </td>
                      <td className="py-0.5 px-3 text-right tabular-nums">
                        {formatBudgetComparisonNumber(row.final)}
                      </td>
                      <td className="py-0.5 px-3 text-right tabular-nums">
                        {formatBudgetComparisonNumber(row.actual)}
                      </td>
                      <td className="py-0.5 px-3 text-right tabular-nums">
                        {formatBudgetComparisonNumber(row.difference)}
                      </td>
                    </tr>
                  ))}
                  <tr>
                    <td className="py-1 pl-6 pr-2 font-bold">Total Receipts</td>
                    <td className="py-1 px-2" />
                    <td className="py-1 px-3 text-right font-bold tabular-nums border-t border-b border-black">
                      {formatBudgetComparisonNumber(liveSummary.totalReceipts.original)}
                    </td>
                    <td className="py-1 px-3 text-right font-bold tabular-nums border-t border-b border-black">
                      {formatBudgetComparisonNumber(liveSummary.totalReceipts.final)}
                    </td>
                    <td className="py-1 px-3 text-right font-bold tabular-nums border-t border-b border-black">
                      {formatBudgetComparisonNumber(liveSummary.totalReceipts.actual)}
                    </td>
                    <td className="py-1 px-3 text-right font-bold tabular-nums border-t border-b border-black">
                      {formatBudgetComparisonNumber(liveSummary.totalReceipts.difference)}
                    </td>
                  </tr>

                  <tr>
                    <td colSpan={6} className="h-4" />
                  </tr>

                  <tr>
                    <td className="pt-2 pb-0.5 pr-2 font-bold uppercase">PAYMENTS</td>
                    <td colSpan={5} />
                  </tr>
                  {liveSummary.payments.map((row) => (
                    <tr key={row.id}>
                      <td className="py-0.5 pl-6 pr-2">{row.name}</td>
                      <td className="py-0.5 px-2 text-center">
                        {draftNotes[row.id] || ''}
                      </td>
                      <td className="py-0.5 px-3 text-right tabular-nums">
                        {formatBudgetComparisonNumber(row.original)}
                      </td>
                      <td className="py-0.5 px-3 text-right tabular-nums">
                        {formatBudgetComparisonNumber(row.final)}
                      </td>
                      <td className="py-0.5 px-3 text-right tabular-nums">
                        {formatBudgetComparisonNumber(row.actual)}
                      </td>
                      <td className="py-0.5 px-3 text-right tabular-nums">
                        {formatBudgetComparisonNumber(row.difference)}
                      </td>
                    </tr>
                  ))}
                  <tr>
                    <td className="py-1 pl-6 pr-2 font-bold">Total Payments</td>
                    <td className="py-1 px-2" />
                    <td className="py-1 px-3 text-right font-bold tabular-nums border-t border-b border-black">
                      {formatBudgetComparisonNumber(liveSummary.totalPayments.original)}
                    </td>
                    <td className="py-1 px-3 text-right font-bold tabular-nums border-t border-b border-black">
                      {formatBudgetComparisonNumber(liveSummary.totalPayments.final)}
                    </td>
                    <td className="py-1 px-3 text-right font-bold tabular-nums border-t border-b border-black">
                      {formatBudgetComparisonNumber(liveSummary.totalPayments.actual)}
                    </td>
                    <td className="py-1 px-3 text-right font-bold tabular-nums border-t border-b border-black">
                      {formatBudgetComparisonNumber(liveSummary.totalPayments.difference)}
                    </td>
                  </tr>

                  <tr>
                    <td colSpan={6} className="h-4" />
                  </tr>

                  <tr>
                    <td className="py-1.5 pr-2 font-bold uppercase border-t border-black border-b-4 border-double">
                      NET RECEIPTS/PAYMENT
                    </td>
                    <td className="py-1.5 px-2 border-t border-black border-b-4 border-double" />
                    <td className="py-1.5 px-3 text-right font-bold tabular-nums border-t border-black border-b-4 border-double">
                      {formatBudgetComparisonNumber(liveSummary.netReceiptsPayments.original)}
                    </td>
                    <td className="py-1.5 px-3 text-right font-bold tabular-nums border-t border-black border-b-4 border-double">
                      {formatBudgetComparisonNumber(liveSummary.netReceiptsPayments.final)}
                    </td>
                    <td className="py-1.5 px-3 text-right font-bold tabular-nums border-t border-black border-b-4 border-double">
                      {formatBudgetComparisonNumber(liveSummary.netReceiptsPayments.actual)}
                    </td>
                    <td className="py-1.5 px-3 text-right font-bold tabular-nums border-t border-black border-b-4 border-double">
                      {formatBudgetComparisonNumber(liveSummary.netReceiptsPayments.difference)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

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
