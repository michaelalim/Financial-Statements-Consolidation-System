import React, { useState, useEffect, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { LineItemDefinition } from '../types/fs';
import { YEAR_RANGE, getComparativeYear } from '../utils/yearUtils';
import { formatAccounting } from '../utils/formatters';
import { SearchableLineItemSelect } from './SearchableLineItemSelect';
import {
  SheetInspectionResult,
  YearImportColumnTarget,
  ExtractedPositionRow,
  inspectPositionWorksheet,
  extractPositionRowsFromSheet,
  pickBestPositionSheetName,
  resolveTargetFiscalYear,
  loadSavedPositionAliases,
  savePositionAlias,
  normalizeAliasKey,
} from '../utils/excelImportPosition';
import {
  FileSpreadsheet,
  X,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Sparkles,
  Check,
  BookmarkCheck,
  Plus,
  Filter,
} from 'lucide-react';

interface ExcelPositionImportModalProps {
  isOpen: boolean;
  workbook: XLSX.WorkBook | null;
  fileName: string;
  divisionName: string;
  selectedYear: string;
  encodableItems: LineItemDefinition[];
  onClose: () => void;
  onStageToBatch: (
    targetYear: string,
    entries: { lineItemId: string; rawText: string; amount: string }[]
  ) => void;
  onSaveYearsDirectly: (
    savesByYear: { year: string; entries: { lineItemId: string; amount: number }[] }[],
    unmatchedToStage?: { lineItemId: string; rawText: string; amount: string }[]
  ) => void;
}

export const ExcelPositionImportModal: React.FC<ExcelPositionImportModalProps> = ({
  isOpen,
  workbook,
  fileName,
  divisionName,
  selectedYear,
  encodableItems,
  onClose,
  onStageToBatch,
  onSaveYearsDirectly,
}) => {
  const [selectedSheetName, setSelectedSheetName] = useState<string>('');
  const [inspection, setInspection] = useState<SheetInspectionResult | null>(null);
  const [yearTargets, setYearTargets] = useState<YearImportColumnTarget[]>([]);
  const [startRow1Based, setStartRow1Based] = useState<number>(2);
  const [lineItemColOverride, setLineItemColOverride] = useState<number | 'auto'>('auto');
  const [savedAliases, setSavedAliases] = useState<Record<string, string>>(() =>
    loadSavedPositionAliases()
  );
  const [rows, setRows] = useState<ExtractedPositionRow[]>([]);
  const [rememberAliasMap, setRememberAliasMap] = useState<Record<string, boolean>>({});
  const [filterMode, setFilterMode] = useState<'all' | 'attention'>('all');
  const [activeDropdownRowId, setActiveDropdownRowId] = useState<string | null>(null);
  const [isLumpedDepPromptOpen, setIsLumpedDepPromptOpen] = useState<boolean>(false);
  const [dismissedLumpedKey, setDismissedLumpedKey] = useState<string>('');

  const comparativeYear = getComparativeYear(selectedYear);

  // Initialize sheet selection when a new workbook is opened
  useEffect(() => {
    if (!isOpen || !workbook) return;
    setSavedAliases(loadSavedPositionAliases());
    const bestSheet = pickBestPositionSheetName(workbook);
    setSelectedSheetName(bestSheet);
    setFilterMode('all');
    setRememberAliasMap({});
    setDismissedLumpedKey('');
    setIsLumpedDepPromptOpen(false);
  }, [isOpen, workbook]);

  // Inspect selected sheet whenever sheet or workbook changes
  useEffect(() => {
    if (!isOpen || !workbook || !selectedSheetName) return;
    const sheet = workbook.Sheets[selectedSheetName];
    if (!sheet) return;

    const result = inspectPositionWorksheet(sheet, selectedSheetName, selectedYear, comparativeYear);
    setInspection(result);
    setLineItemColOverride('auto');

    if (result.detectedYearColumns.length > 0) {
      setStartRow1Based(result.headerRowIndex + 2); // 1-based row immediately after header row
      const seenYears = new Set<string>();
      const targets: YearImportColumnTarget[] = result.detectedYearColumns.map((yc, idx) => {
        const targetYear = resolveTargetFiscalYear(yc.year, selectedYear);
        // If the sheet has multiple divisions' year columns, auto-enable only the first set per distinct year
        const isFirstForYear = !seenYears.has(targetYear);
        seenYears.add(targetYear);
        return {
          id: `col-${yc.colIndex}-${idx}`,
          colIndex: yc.colIndex,
          colLetter: yc.colLetter,
          targetYear,
          headerText: yc.groupLabel ? `${yc.groupLabel} · ${yc.headerText}` : yc.headerText,
          enabled: isFirstForYear,
        };
      });
      setYearTargets(targets);
    } else {
      // Fallback: no year header found -> pick first numeric column (or Col B)
      const fallbackNumCol =
        result.candidateColumns.find((c) => c.colIndex >= 1 && c.hasNumbers) ||
        result.candidateColumns[1] ||
        result.candidateColumns[0];

      setStartRow1Based(1);
      if (fallbackNumCol) {
        setYearTargets([
          {
            id: `col-${fallbackNumCol.colIndex}-0`,
            colIndex: fallbackNumCol.colIndex,
            colLetter: fallbackNumCol.colLetter,
            targetYear: selectedYear,
            headerText: fallbackNumCol.headerSample || `Column ${fallbackNumCol.colLetter}`,
            enabled: true,
          },
        ]);
      } else {
        setYearTargets([]);
      }
    }
  }, [isOpen, workbook, selectedSheetName, selectedYear, comparativeYear]);

  // Re-extract rows whenever sheet, year column targets, start row, or line item column override changes
  useEffect(() => {
    if (!isOpen || !workbook || !selectedSheetName) return;
    const sheet = workbook.Sheets[selectedSheetName];
    if (!sheet) return;

    const extracted = extractPositionRowsFromSheet(
      sheet,
      yearTargets,
      Math.max(0, startRow1Based - 1),
      lineItemColOverride,
      encodableItems,
      savedAliases
    );
    setRows(extracted);

    const detectedLumped = extracted.filter((r) => r.isLumpedDepreciation);
    const lumpedKey = `${fileName}::${selectedSheetName}::${detectedLumped.map((r) => r.excelRowNumber).join(',')}`;
    if (detectedLumped.length > 0 && dismissedLumpedKey !== lumpedKey) {
      setIsLumpedDepPromptOpen(true);
    }
  }, [
    isOpen,
    workbook,
    fileName,
    selectedSheetName,
    yearTargets,
    startRow1Based,
    lineItemColOverride,
    encodableItems,
    savedAliases,
    dismissedLumpedKey,
  ]);

  const lumpedDepRows = useMemo(
    () => rows.filter((r) => r.isLumpedDepreciation),
    [rows]
  );

  const enabledTargets = useMemo(() => yearTargets.filter((t) => t.enabled), [yearTargets]);

  const itemById = useMemo(() => {
    const map = new Map<string, LineItemDefinition>();
    encodableItems.forEach((item) => map.set(item.id, item));
    return map;
  }, [encodableItems]);

  // Detect duplicate target lineItemIds among included rows
  const duplicateLineItemIds = useMemo(() => {
    const counts = new Map<string, number>();
    rows.forEach((r) => {
      if (r.included && r.selectedLineItemId) {
        counts.set(r.selectedLineItemId, (counts.get(r.selectedLineItemId) || 0) + 1);
      }
    });
    const dups = new Set<string>();
    counts.forEach((count, id) => {
      if (count > 1) dups.add(id);
    });
    return dups;
  }, [rows]);

  const stats = useMemo(() => {
    let exactOrAlias = 0;
    let suggested = 0;
    let unmatched = 0;
    let includedCount = 0;

    rows.forEach((r) => {
      if (r.isSummaryRow || !r.included) return;
      includedCount++;
      if (!r.selectedLineItemId) {
        unmatched++;
      } else if (
        r.userModified ||
        r.recommendation.matchType === 'exact' ||
        r.recommendation.matchType === 'alias' ||
        r.recommendation.matchType === 'normalized'
      ) {
        exactOrAlias++;
      } else {
        suggested++;
      }
    });

    return {
      total: rows.filter((r) => !r.isSummaryRow).length,
      includedCount,
      exactOrAlias,
      suggested,
      unmatched,
      attentionCount: suggested + unmatched,
    };
  }, [rows]);

  // Cross-check Excel "Total Assets" row vs sum of mapped Asset rows per enabled year
  const assetsVerificationByTarget = useMemo(() => {
    const excelTotalAssetsRow = rows.find((r) => r.summaryKind === 'total_assets');
    return enabledTargets.map((target) => {
      let computedAssetsSum = 0;
      let computedLiabEquitySum = 0;

      rows.forEach((r) => {
        if (!r.included || !r.selectedLineItemId) return;
        const rawAmt = r.amountsByTargetId[target.id];
        if (rawAmt === null || rawAmt === undefined) return;
        const def = itemById.get(r.selectedLineItemId);
        if (!def) return;
        const effective = def.isContra ? -Math.abs(rawAmt) : rawAmt;
        if (def.section === 'ASSETS') {
          computedAssetsSum += effective;
        } else {
          computedLiabEquitySum += effective;
        }
      });

      const excelAssetsVal = excelTotalAssetsRow
        ? excelTotalAssetsRow.amountsByTargetId[target.id] ?? null
        : null;
      const assetsDiff =
        excelAssetsVal !== null ? Math.abs(excelAssetsVal - computedAssetsSum) : null;

      return {
        target,
        computedAssetsSum,
        computedLiabEquitySum,
        excelAssetsVal,
        assetsDiff,
      };
    });
  }, [rows, enabledTargets, itemById]);

  const visibleRows = useMemo(() => {
    return rows.filter((r) => {
      if (r.isSummaryRow) return false;
      if (filterMode === 'attention') {
        if (!r.included) return false;
        const isNeedsAttention =
          !r.selectedLineItemId ||
          (!r.userModified &&
            r.recommendation.matchType !== 'exact' &&
            r.recommendation.matchType !== 'alias' &&
            r.recommendation.matchType !== 'normalized');
        return isNeedsAttention || duplicateLineItemIds.has(r.selectedLineItemId);
      }
      return true;
    });
  }, [rows, filterMode, duplicateLineItemIds]);

  const handleToggleRowInclude = (rowId: string) => {
    setRows((prev) => prev.map((r) => (r.rowId === rowId ? { ...r, included: !r.included } : r)));
  };

  const handleSelectRowLineItem = (rowId: string, lineItemId: string) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.rowId !== rowId) return r;
        const nextModified = true;
        // Automatically default "Remember alias" to checked if user picked an item for a differently worded label
        if (lineItemId && normalizeAliasKey(r.rawName) !== normalizeAliasKey(itemById.get(lineItemId)?.name || '')) {
          setRememberAliasMap((m) => ({ ...m, [rowId]: m[rowId] ?? true }));
        }
        return {
          ...r,
          selectedLineItemId: lineItemId,
          included: lineItemId ? true : r.included,
          userModified: nextModified,
        };
      })
    );
  };

  const handleToggleTargetEnabled = (targetId: string) => {
    setYearTargets((prev) =>
      prev.map((t) => (t.id === targetId ? { ...t, enabled: !t.enabled } : t))
    );
  };

  const handleChangeTargetYear = (targetId: string, year: string) => {
    setYearTargets((prev) =>
      prev.map((t) => (t.id === targetId ? { ...t, targetYear: year } : t))
    );
  };

  const handleChangeTargetCol = (targetId: string, colIndex: number) => {
    const colMeta = inspection?.candidateColumns.find((c) => c.colIndex === colIndex);
    setYearTargets((prev) =>
      prev.map((t) =>
        t.id === targetId
          ? {
              ...t,
              colIndex,
              colLetter: colMeta?.colLetter || t.colLetter,
              headerText: colMeta?.headerSample || `Column ${colMeta?.colLetter || ''}`,
            }
          : t
      )
    );
  };

  const handleAddExtraColumnTarget = () => {
    if (!inspection) return;
    const usedCols = new Set(yearTargets.map((t) => t.colIndex));
    const nextCol = inspection.candidateColumns.find((c) => c.colIndex >= 1 && !usedCols.has(c.colIndex) && c.hasNumbers)
      || inspection.candidateColumns.find((c) => !usedCols.has(c.colIndex));
    if (!nextCol) return;

    const usedYears = new Set(yearTargets.map((t) => t.targetYear));
    const suggestedYr = !usedYears.has(selectedYear)
      ? selectedYear
      : !usedYears.has(comparativeYear)
      ? comparativeYear
      : selectedYear;

    setYearTargets((prev) => [
      ...prev,
      {
        id: `col-${nextCol.colIndex}-${Date.now()}`,
        colIndex: nextCol.colIndex,
        colLetter: nextCol.colLetter,
        targetYear: suggestedYr,
        headerText: nextCol.headerSample || `Column ${nextCol.colLetter}`,
        enabled: true,
      },
    ]);
  };

  const commitRememberedAliases = () => {
    let updatedAliases = savedAliases;
    rows.forEach((r) => {
      if (r.included && r.selectedLineItemId && rememberAliasMap[r.rowId]) {
        updatedAliases = savePositionAlias(r.rawName, r.selectedLineItemId);
      }
    });
    setSavedAliases(updatedAliases);
  };

  const handleStageTargetToBatch = (target: YearImportColumnTarget) => {
    commitRememberedAliases();
    const stagedPayload: { lineItemId: string; rawText: string; amount: string }[] = [];

    rows.forEach((r) => {
      if (!r.included) return;
      const amt = r.amountsByTargetId[target.id];
      if (amt === null || amt === undefined || Math.abs(amt) < 0.005) return;
      const itemDef = r.selectedLineItemId ? itemById.get(r.selectedLineItemId) : undefined;
      const normalizedAmt = itemDef?.isContra ? Math.abs(amt) : amt;
      stagedPayload.push({
        lineItemId: itemDef ? itemDef.id : '',
        rawText: itemDef ? itemDef.name : r.rawName,
        amount: formatAccounting(normalizedAmt),
      });
    });

    onStageToBatch(target.targetYear, stagedPayload);
    onClose();
  };

  const handleSaveAllEnabledYears = () => {
    commitRememberedAliases();

    // Group targets by targetYear so even if two enabled targets map cleanly, we collect per year
    const savesMap = new Map<string, Map<string, number>>();
    const unmatchedForActiveYear: { lineItemId: string; rawText: string; amount: string }[] = [];

    enabledTargets.forEach((target) => {
      if (!savesMap.has(target.targetYear)) {
        savesMap.set(target.targetYear, new Map<string, number>());
      }
      const yearMap = savesMap.get(target.targetYear)!;

      rows.forEach((r) => {
        if (!r.included) return;
        const amt = r.amountsByTargetId[target.id];
        if (amt === null || amt === undefined || Math.abs(amt) < 0.005) return;

        if (r.selectedLineItemId) {
          const itemDef = itemById.get(r.selectedLineItemId);
          const normalizedAmt = itemDef?.isContra ? Math.abs(amt) : amt;
          yearMap.set(r.selectedLineItemId, normalizedAmt);
        } else if (target.targetYear === selectedYear) {
          unmatchedForActiveYear.push({
            lineItemId: '',
            rawText: r.rawName,
            amount: formatAccounting(amt),
          });
        }
      });
    });

    const savesByYear = Array.from(savesMap.entries())
      .map(([year, map]) => ({
        year,
        entries: Array.from(map.entries()).map(([lineItemId, amount]) => ({
          lineItemId,
          amount,
        })),
      }))
      .filter((s) => s.entries.length > 0);

    onSaveYearsDirectly(
      savesByYear,
      unmatchedForActiveYear.length > 0 ? unmatchedForActiveYear : undefined
    );
    onClose();
  };

  if (!isOpen || !workbook) return null;

  const singleTargetMatchesSelected =
    enabledTargets.length === 1 && enabledTargets[0].targetYear === selectedYear;
  const activeYearTarget = enabledTargets.find((t) => t.targetYear === selectedYear) || enabledTargets[0];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/70 backdrop-blur-xs">
      <div className="w-full max-w-6xl max-h-[92vh] bg-th-surface border-2 border-th-border-strong rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        {/* Modal Header */}
        <div className="px-6 py-4 bg-th-subtle border-b border-th-border flex items-start sm:items-center justify-between gap-4 shrink-0">
          <div className="flex items-start sm:items-center gap-3.5 min-w-0">
            <div className="p-2.5 bg-th-primary text-th-primary-fg rounded-xl border border-th-border-strong shrink-0">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="text-lg sm:text-xl font-bold text-th-text truncate">
                Smart Excel / CSV Import · Statement of Financial Position
              </h3>
              <p className="text-sm text-th-muted mt-0.5 truncate">
                File: <strong className="text-th-text">{fileName}</strong> · Entity:{' '}
                <strong className="text-th-text">{divisionName}</strong>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-th-muted hover:text-th-text hover:bg-th-surface border border-transparent hover:border-th-border-strong transition-colors cursor-pointer shrink-0"
            aria-label="Close import preview"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Column & Sheet Detection Controls */}
        <div className="px-6 py-4 bg-th-surface border-b border-th-border space-y-3.5 shrink-0">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              {workbook.SheetNames.length > 1 && (
                <label className="flex items-center gap-2 text-sm font-bold text-th-text">
                  <span>Sheet:</span>
                  <select
                    value={selectedSheetName}
                    onChange={(e) => setSelectedSheetName(e.target.value)}
                    className="px-3 py-1.5 rounded-lg bg-th-input border border-th-border-strong text-sm font-bold text-th-text cursor-pointer"
                  >
                    {workbook.SheetNames.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              <label className="flex items-center gap-2 text-sm font-bold text-th-text">
                <span>Line Item Column:</span>
                <select
                  value={lineItemColOverride === 'auto' ? 'auto' : String(lineItemColOverride)}
                  onChange={(e) =>
                    setLineItemColOverride(
                      e.target.value === 'auto' ? 'auto' : Number(e.target.value)
                    )
                  }
                  className="px-3 py-1.5 rounded-lg bg-th-input border border-th-border-strong text-sm font-semibold text-th-text cursor-pointer"
                >
                  <option value="auto">Auto-detect (before amount columns)</option>
                  {inspection?.candidateColumns.map((col) => (
                    <option key={col.colIndex} value={col.colIndex}>
                      Col {col.colLetter}
                      {col.headerSample ? ` (${col.headerSample})` : ''}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex items-center gap-2 text-sm font-bold text-th-text">
                <span>Data Starts Row:</span>
                <input
                  type="number"
                  min={1}
                  max={Math.max(1, inspection?.totalRows || 100)}
                  value={startRow1Based}
                  onChange={(e) => setStartRow1Based(Math.max(1, Number(e.target.value) || 1))}
                  className="w-20 px-2.5 py-1.5 rounded-lg bg-th-input border border-th-border-strong text-sm font-mono font-bold text-th-text text-center"
                />
              </label>
            </div>

            <div className="text-xs sm:text-sm font-semibold text-th-muted">
              {inspection && inspection.headerRowIndex >= 0 ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-th-subtle border border-th-border-strong text-th-text">
                  <Sparkles className="w-4 h-4 text-th-accent-text" />
                  Detected Year Headers on Row {inspection.headerRowIndex + 1}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-amber-50 dark:bg-amber-950/50 border border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-200">
                  <AlertTriangle className="w-4 h-4" />
                  No year row found — using fallback column mapping
                </span>
              )}
            </div>
          </div>

          {/* Detected Year Columns Mapping */}
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="text-xs font-bold uppercase tracking-wider text-th-muted mr-1">
              Year Columns:
            </span>
            {yearTargets.map((target) => (
              <div
                key={target.id}
                className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border text-sm transition-colors ${
                  target.enabled
                    ? 'bg-th-subtle border-th-border-strong text-th-text'
                    : 'bg-th-surface border-th-border text-th-muted opacity-70'
                }`}
              >
                <input
                  type="checkbox"
                  checked={target.enabled}
                  onChange={() => handleToggleTargetEnabled(target.id)}
                  className="w-4 h-4 accent-th-accent cursor-pointer"
                  aria-label={`Include column ${target.colLetter}`}
                />
                <select
                  value={target.colIndex}
                  onChange={(e) => handleChangeTargetCol(target.id, Number(e.target.value))}
                  className="bg-th-input border border-th-border-strong rounded-md px-2 py-0.5 text-xs font-bold text-th-text cursor-pointer"
                  title={`Header: ${target.headerText}`}
                >
                  {inspection?.candidateColumns.map((col) => (
                    <option key={col.colIndex} value={col.colIndex}>
                      Col {col.colLetter}
                      {col.headerSample ? ` (${col.headerSample})` : ''}
                    </option>
                  ))}
                </select>
                <span className="text-xs font-bold text-th-muted">→</span>
                <select
                  value={target.targetYear}
                  onChange={(e) => handleChangeTargetYear(target.id, e.target.value)}
                  className="bg-th-input border border-th-border-strong rounded-md px-2 py-0.5 text-xs font-bold text-th-text cursor-pointer"
                >
                  {!YEAR_RANGE.includes(target.targetYear) && (
                    <option value={target.targetYear}>FY {target.targetYear}</option>
                  )}
                  {YEAR_RANGE.map((yr) => (
                    <option key={yr} value={yr}>
                      FY {yr}
                    </option>
                  ))}
                </select>
              </div>
            ))}

            {inspection && yearTargets.length < inspection.candidateColumns.length && (
              <button
                type="button"
                onClick={handleAddExtraColumnTarget}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold bg-th-subtle hover:bg-th-subtle-hover border border-th-border-strong text-th-text cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Year Column</span>
              </button>
            )}
          </div>
        </div>

        {/* Verification & Filter Summary Strip */}
        <div className="px-6 py-3 bg-th-subtle border-b border-th-border flex flex-wrap items-center justify-between gap-3 shrink-0 text-sm">
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => setFilterMode('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors cursor-pointer ${
                filterMode === 'all'
                  ? 'bg-th-primary text-th-primary-fg border-th-primary'
                  : 'bg-th-surface text-th-text border-th-border-strong hover:bg-th-subtle-hover'
              }`}
            >
              All Rows ({stats.includedCount} included)
            </button>
            <button
              type="button"
              onClick={() => setFilterMode('attention')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors cursor-pointer inline-flex items-center gap-1.5 ${
                filterMode === 'attention'
                  ? 'bg-th-primary text-th-primary-fg border-th-primary'
                  : 'bg-th-surface text-th-text border-th-border-strong hover:bg-th-subtle-hover'
              }`}
            >
              <Filter className="w-3.5 h-3.5" />
              <span>Needs Review / Misspelled ({stats.attentionCount})</span>
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-xs font-bold">
            <span className="text-emerald-700 dark:text-emerald-300">
              Exact/Alias: {stats.exactOrAlias}
            </span>
            <span className="text-amber-700 dark:text-amber-300">
              Suggested: {stats.suggested}
            </span>
            <span className={stats.unmatched > 0 ? 'text-rose-700 dark:text-rose-300' : 'text-th-muted'}>
              Unmatched: {stats.unmatched}
            </span>
            {duplicateLineItemIds.size > 0 && (
              <span className="px-2 py-0.5 rounded bg-amber-100 dark:bg-amber-950/70 text-amber-900 dark:text-amber-200 border border-amber-300 dark:border-amber-800">
                {duplicateLineItemIds.size} duplicate target{duplicateLineItemIds.size > 1 ? 's' : ''}
              </span>
            )}
          </div>
        </div>

        {/* Lumped Accumulated Depreciation Warning Banner */}
        {lumpedDepRows.length > 0 && (
          <div className="px-6 py-3 bg-amber-50 dark:bg-amber-950/60 border-b border-amber-300 dark:border-amber-800 flex flex-wrap items-center justify-between gap-3 text-xs sm:text-sm shrink-0">
            <div className="flex items-start sm:items-center gap-2.5 text-amber-950 dark:text-amber-100">
              <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5 sm:mt-0" />
              <div>
                <span className="font-bold">Lumped Accumulated Depreciation detected</span>{' '}
                (
                {lumpedDepRows
                  .map((r) => `Row ${r.excelRowNumber}: "${r.rawName}"`)
                  .join(', ')}
                ) — auto-skipped because it combines all PPE.{' '}
                <span className="font-semibold">
                  Please request a breakdown of Accumulated Depreciation per PPE account.
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIsLumpedDepPromptOpen(true)}
              className="px-3 py-1 rounded-lg bg-amber-100 dark:bg-amber-900/60 hover:bg-amber-200 dark:hover:bg-amber-900 text-amber-950 dark:text-amber-100 font-bold text-xs border border-amber-300 dark:border-amber-700 cursor-pointer shrink-0"
            >
              View Details
            </button>
          </div>
        )}

        {/* Excel Total Assets Cross-Check (when Excel file includes a Total Assets row) */}
        {assetsVerificationByTarget.some((v) => v.excelAssetsVal !== null) && (
          <div className="px-6 py-2.5 bg-th-surface border-b border-th-border flex flex-wrap items-center gap-4 text-xs shrink-0">
            <span className="font-bold text-th-text uppercase tracking-wider">
              Excel Total Assets Check:
            </span>
            {assetsVerificationByTarget.map(({ target, computedAssetsSum, excelAssetsVal, assetsDiff }) => {
              if (excelAssetsVal === null) return null;
              const matches = assetsDiff !== null && assetsDiff < 0.01;
              return (
                <span
                  key={target.id}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md font-mono font-bold border ${
                    matches
                      ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200 border-emerald-200 dark:border-emerald-800'
                      : 'bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200 border-amber-300 dark:border-amber-800'
                  }`}
                >
                  {matches ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertTriangle className="w-3.5 h-3.5" />}
                  <span>
                    FY {target.targetYear}: Included Assets ₱{formatAccounting(computedAssetsSum)} vs Sheet Total ₱
                    {formatAccounting(excelAssetsVal)}
                    {!matches && assetsDiff !== null ? ` (Diff: ₱${formatAccounting(assetsDiff)})` : ''}
                  </span>
                </span>
              );
            })}
          </div>
        )}

        {/* Scrollable Extracted Rows Table */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {enabledTargets.length === 0 ? (
            <div className="py-12 text-center text-th-muted font-medium">
              Select at least one year column above to extract line items and balances.
            </div>
          ) : visibleRows.length === 0 ? (
            <div className="py-12 text-center text-th-muted font-medium">
              {stats.total === 0
                ? 'No leaf-level data rows with balances were found under the selected year columns. Try adjusting the Start Row or Year Columns above.'
                : 'No rows match the current filter.'}
            </div>
          ) : (
            <div className="border border-th-border-strong rounded-xl overflow-visible bg-th-surface">
              <div
                className="bg-th-table-head text-th-table-head-fg px-4 py-3 rounded-t-xl grid gap-3 text-xs font-bold uppercase tracking-wider items-center"
                style={{
                  gridTemplateColumns: `44px minmax(200px, 1.1fr) minmax(280px, 1.5fr) ${enabledTargets
                    .map(() => 'minmax(125px, 0.7fr)')
                    .join(' ')}`,
                }}
              >
                <div className="text-center">Use</div>
                <div>Excel Line Item</div>
                <div>Official Account Match / Recommendation</div>
                {enabledTargets.map((target) => (
                  <div key={target.id} className="text-right">
                    FY {target.targetYear} (Col {target.colLetter})
                  </div>
                ))}
              </div>

              <div className="divide-y divide-th-border">
                {visibleRows.map((row) => {
                  const isDup =
                    row.included && row.selectedLineItemId && duplicateLineItemIds.has(row.selectedLineItemId);
                  const isDropdownOpen = activeDropdownRowId === row.rowId;
                  const matchType = row.userModified ? 'exact' : row.recommendation.matchType;
                  const selectedDef = row.selectedLineItemId
                    ? itemById.get(row.selectedLineItemId)
                    : undefined;
                  const labelDiffersFromOfficial =
                    Boolean(selectedDef) &&
                    normalizeAliasKey(row.rawName) !== normalizeAliasKey(selectedDef!.name);

                  return (
                    <div
                      key={row.rowId}
                      className={`px-4 py-3 grid gap-3 items-start transition-colors ${
                        !row.included ? 'opacity-55 bg-th-subtle/40' : 'hover:bg-th-subtle/50'
                      } ${isDropdownOpen ? 'relative z-40' : 'relative z-auto'}`}
                      style={{
                        gridTemplateColumns: `44px minmax(200px, 1.1fr) minmax(280px, 1.5fr) ${enabledTargets
                          .map(() => 'minmax(125px, 0.7fr)')
                          .join(' ')}`,
                      }}
                    >
                      {/* Include checkbox */}
                      <div className="flex justify-center pt-2.5">
                        <input
                          type="checkbox"
                          checked={row.included}
                          onChange={() => handleToggleRowInclude(row.rowId)}
                          className="w-4 h-4 cursor-pointer accent-th-accent"
                          aria-label={`Include row ${row.excelRowNumber}`}
                        />
                      </div>

                      {/* Raw Excel text & metadata */}
                      <div className="min-w-0 pt-1">
                        <div className="text-sm font-bold text-th-text break-words">
                          {row.rawName}
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-th-muted">
                          <span className="font-mono font-semibold">
                            Row {row.excelRowNumber} · Col {row.sourceColLetter}
                          </span>
                          {row.accountCode && (
                            <span className="font-mono font-semibold px-1.5 py-0.5 rounded bg-th-subtle border border-th-border text-th-text">
                              {row.accountCode}
                            </span>
                          )}
                          {row.isSummaryRow && (
                            <span className="px-2 py-0.5 rounded bg-th-subtle border border-th-border-strong text-th-text font-bold">
                              {row.summaryReason || 'Higher-level / Total row (skipped)'}
                            </span>
                          )}
                          {!row.isSummaryRow && row.included && !row.selectedLineItemId && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-rose-100 dark:bg-rose-950/60 text-rose-800 dark:text-rose-200 font-bold border border-rose-200 dark:border-rose-800">
                              <AlertCircle className="w-3 h-3" />
                              Needs Match
                            </span>
                          )}
                          {!row.isSummaryRow && row.included && row.selectedLineItemId && matchType === 'suggested' && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-100 dark:bg-amber-950/60 text-amber-900 dark:text-amber-200 font-bold border border-amber-300 dark:border-amber-800">
                              <Sparkles className="w-3 h-3" />
                              Best Guess ({row.recommendation.confidence}%)
                            </span>
                          )}
                          {!row.isSummaryRow && row.included && row.selectedLineItemId && matchType === 'alias' && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950/60 text-emerald-900 dark:text-emerald-200 font-bold border border-emerald-200 dark:border-emerald-800">
                              <BookmarkCheck className="w-3 h-3" />
                              Saved Alias
                            </span>
                          )}
                          {!row.isSummaryRow &&
                            row.included &&
                            row.selectedLineItemId &&
                            (matchType === 'exact' || matchType === 'normalized') && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950/60 text-emerald-900 dark:text-emerald-200 font-bold border border-emerald-200 dark:border-emerald-800">
                                <Check className="w-3 h-3" />
                                Matched
                              </span>
                            )}
                          {isDup && (
                            <span className="px-2 py-0.5 rounded bg-amber-100 dark:bg-amber-950/70 text-amber-900 dark:text-amber-200 font-bold border border-amber-300 dark:border-amber-800">
                              Duplicate Target
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Official Line Item Selector + Alternative Recommendation Chips */}
                      <div className="min-w-0 space-y-1.5">
                        <SearchableLineItemSelect
                          lineItems={encodableItems}
                          selectedItemId={row.selectedLineItemId}
                          rawText={selectedDef ? selectedDef.name : ''}
                          isInvalid={row.included && !row.isSummaryRow && !row.selectedLineItemId}
                          onSelectItem={(itemId) => handleSelectRowLineItem(row.rowId, itemId)}
                          onOpenStateChange={(open) => setActiveDropdownRowId(open ? row.rowId : null)}
                          placement="auto"
                          placeholder="Search & pick official line item..."
                        />

                        {/* Quick recommendation chips for low-confidence/unmatched rows */}
                        {row.included &&
                          !row.isSummaryRow &&
                          !row.selectedLineItemId &&
                          row.recommendation.alternatives.length > 0 && (
                            <div className="flex flex-wrap items-center gap-1.5 text-xs">
                              <span className="text-th-muted font-semibold">Suggested:</span>
                              {row.recommendation.alternatives.map((alt) => (
                                <button
                                  key={alt.item.id}
                                  type="button"
                                  onClick={() => handleSelectRowLineItem(row.rowId, alt.item.id)}
                                  className="px-2 py-0.5 rounded-md bg-th-subtle hover:bg-th-subtle-hover border border-th-border-strong text-th-text font-semibold cursor-pointer"
                                >
                                  {alt.item.name} ({alt.confidence}%)
                                </button>
                              ))}
                            </div>
                          )}

                        {/* Option to remember spelling/alias for future uploads */}
                        {row.included &&
                          !row.isSummaryRow &&
                          row.selectedLineItemId &&
                          labelDiffersFromOfficial &&
                          matchType !== 'alias' && (
                            <label className="inline-flex items-center gap-1.5 text-xs font-medium text-th-muted cursor-pointer">
                              <input
                                type="checkbox"
                                checked={Boolean(rememberAliasMap[row.rowId])}
                                onChange={(e) =>
                                  setRememberAliasMap((m) => ({
                                    ...m,
                                    [row.rowId]: e.target.checked,
                                  }))
                                }
                                className="w-3.5 h-3.5 cursor-pointer"
                              />
                              <span>Remember &quot;{row.rawName}&quot; for future uploads</span>
                            </label>
                          )}
                      </div>

                      {/* Year Amounts */}
                      {enabledTargets.map((target) => {
                        const val = row.amountsByTargetId[target.id];
                        return (
                          <div
                            key={target.id}
                            className="text-right font-mono text-sm font-bold text-th-text tabular-nums pt-2.5"
                          >
                            {val !== null && val !== undefined ? formatAccounting(val) : '-'}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 bg-th-subtle border-t border-th-border flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="text-xs sm:text-sm text-th-muted font-medium">
            {enabledTargets.length > 1
              ? `Ready to import ${enabledTargets.map((t) => `FY ${t.targetYear}`).join(' & ')} (${stats.exactOrAlias + stats.suggested} matched rows).`
              : activeYearTarget
              ? `Target: FY ${activeYearTarget.targetYear} (${stats.includedCount} included rows).`
              : 'Select at least one year column.'}
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 text-sm font-bold text-th-text bg-th-surface hover:bg-th-subtle-hover border border-th-border-strong rounded-xl cursor-pointer transition-colors"
            >
              Cancel
            </button>

            {singleTargetMatchesSelected && activeYearTarget ? (
              <>
                <button
                  type="button"
                  disabled={stats.exactOrAlias + stats.suggested === 0}
                  onClick={handleSaveAllEnabledYears}
                  className="px-4 py-2.5 text-sm font-bold text-th-text bg-th-surface hover:bg-th-subtle-hover disabled:opacity-50 border-2 border-th-border-strong rounded-xl cursor-pointer transition-colors"
                >
                  Save Matched Directly (FY {selectedYear})
                </button>
                <button
                  type="button"
                  disabled={stats.includedCount === 0}
                  onClick={() => handleStageTargetToBatch(activeYearTarget)}
                  className="px-5 py-2.5 text-sm font-bold text-th-accent-fg bg-th-accent hover:bg-th-accent-hover disabled:opacity-50 rounded-xl shadow-sm cursor-pointer transition-colors"
                >
                  Load {stats.includedCount} Rows into Batch Table
                </button>
              </>
            ) : (
              <>
                {activeYearTarget && (
                  <button
                    type="button"
                    disabled={stats.includedCount === 0}
                    onClick={() => handleStageTargetToBatch(activeYearTarget)}
                    className="px-4 py-2.5 text-sm font-bold text-th-text bg-th-surface hover:bg-th-subtle-hover disabled:opacity-50 border-2 border-th-border-strong rounded-xl cursor-pointer transition-colors"
                  >
                    Load FY {activeYearTarget.targetYear} to Batch Table
                  </button>
                )}
                <button
                  type="button"
                  disabled={enabledTargets.length === 0 || stats.exactOrAlias + stats.suggested === 0}
                  onClick={handleSaveAllEnabledYears}
                  className="px-5 py-2.5 text-sm font-bold text-th-accent-fg bg-th-accent hover:bg-th-accent-hover disabled:opacity-50 rounded-xl shadow-sm cursor-pointer transition-colors"
                >
                  Save Matched Rows ({enabledTargets.map((t) => `FY ${t.targetYear}`).join(' & ')})
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Prompt Dialog for Lumped Accumulated Depreciation */}
      {isLumpedDepPromptOpen && lumpedDepRows.length > 0 && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/65 backdrop-blur-xs">
          <div className="w-full max-w-lg bg-th-surface border-2 border-amber-400 dark:border-amber-700 rounded-2xl shadow-2xl p-6 space-y-4">
            <div className="flex items-start gap-3.5">
              <div className="p-2.5 rounded-xl bg-amber-100 dark:bg-amber-950/80 text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-800 shrink-0">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h4 className="text-lg font-bold text-th-text">
                  Breakdown Recommended: Accumulated Depreciation
                </h4>
                <p className="text-sm text-th-muted mt-1 leading-relaxed">
                  This spreadsheet reports Accumulated Depreciation as a combined line item across all PPE instead of separating it by specific asset class:
                </p>
              </div>
            </div>

            <div className="bg-th-subtle border border-th-border-strong rounded-xl p-3.5 space-y-2">
              {lumpedDepRows.map((r) => (
                <div key={r.rowId} className="flex items-center justify-between gap-3 text-sm">
                  <span className="font-bold text-th-text">
                    Row {r.excelRowNumber}: &quot;{r.rawName}&quot;
                  </span>
                  <span className="font-mono font-bold text-th-muted">
                    {enabledTargets
                      .map((t) => {
                        const v = r.amountsByTargetId[t.id];
                        return v !== null && v !== undefined
                          ? `FY ${t.targetYear}: ₱${formatAccounting(v)}`
                          : null;
                      })
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </div>
              ))}
            </div>

            <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-sm text-amber-950 dark:text-amber-100 leading-relaxed">
              <strong>Suggestion:</strong> Please request a <strong>breakdown of Accumulated Depreciation per PPE line item</strong> (e.g., School Buildings, Office Equipment, ICT Equipment, Motor Vehicles) from the division so each PPE category&apos;s carrying value and the consolidated Statement of Financial Position remain accurate.
              <div className="mt-1.5 text-xs text-amber-800 dark:text-amber-300">
                For safety, this lumped row has been automatically excluded so it is not assigned to the wrong PPE account.
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => {
                  const lumpedKey = `${fileName}::${selectedSheetName}::${lumpedDepRows
                    .map((r) => r.excelRowNumber)
                    .join(',')}`;
                  setDismissedLumpedKey(lumpedKey);
                  setIsLumpedDepPromptOpen(false);
                }}
                className="px-5 py-2 text-sm font-bold text-th-accent-fg bg-th-accent hover:bg-th-accent-hover rounded-xl shadow-sm cursor-pointer transition-colors"
              >
                Understood, Continue Review
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
