import React, { useState, useEffect, useMemo } from 'react';
import * as XLSX from 'xlsx';
import {
  LineItemDefinition,
  FinancialDataStore,
  StatementType,
  DivisionAggregationRecord,
} from '../types/fs';
import { AGGREGATED_ACCUMULATED_DEPRECIATION_ID } from '../data/defaultLineItems';
import { YEAR_RANGE, getComparativeYear } from '../utils/yearUtils';
import { formatAccounting } from '../utils/formatters';
import { SearchableLineItemSelect } from './SearchableLineItemSelect';
import { DraftStatementPreview } from './DraftStatementPreview';
import {
  SheetInspectionResult,
  YearImportColumnTarget,
  ExtractedPositionRow,
  DatabaseTargetComparison,
  inspectPositionWorksheet,
  extractPositionRowsFromSheet,
  pickBestPositionSheetName,
  resolveTargetFiscalYear,
  loadSavedPositionAliases,
  savePositionAlias,
  normalizeAliasKey,
  matchLineItemWithRecommendation,
  compareTargetAgainstDatabase,
  buildDivisionAggregationRecordForTarget,
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
  Scale,
  Search,
  ChevronDown,
  ChevronUp,
  SlidersHorizontal,
  FileText,
  ListChecks,
  Database,
} from 'lucide-react';

const STATEMENT_TITLE_MAP: Record<StatementType, string> = {
  position: 'Statement of Financial Position',
  performance: 'Statement of Financial Performance',
  cash_flows: 'Statement of Cash Flows',
  net_assets: 'Statement of Changes in Net Assets/Equity',
};

interface ExcelPositionImportModalProps {
  isOpen: boolean;
  statementType?: StatementType;
  workbook: XLSX.WorkBook | null;
  fileName: string;
  divisionId: string;
  divisionName: string;
  selectedYear: string;
  dataStore: FinancialDataStore;
  encodableItems: LineItemDefinition[];
  onClose: () => void;
  onStageToBatch: (
    targetYear: string,
    entries: {
      lineItemId: string;
      rawText: string;
      amount: string;
      aggregationRecord?: DivisionAggregationRecord;
    }[]
  ) => void;
  onSaveYearsDirectly: (
    savesByYear: {
      year: string;
      entries: { lineItemId: string; amount: number }[];
      aggregationRecords?: DivisionAggregationRecord[];
    }[],
    unmatchedToStage?: { lineItemId: string; rawText: string; amount: string }[]
  ) => void;
}

export const ExcelPositionImportModal: React.FC<ExcelPositionImportModalProps> = ({
  isOpen,
  statementType = 'position',
  workbook,
  fileName,
  divisionId,
  divisionName,
  selectedYear,
  dataStore,
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
    loadSavedPositionAliases(statementType)
  );
  const [rows, setRows] = useState<ExtractedPositionRow[]>([]);
  const [rememberAliasMap, setRememberAliasMap] = useState<Record<string, boolean>>({});
  const [filterMode, setFilterMode] = useState<'all' | 'attention' | 'duplicates' | 'matched' | 'skipped'>('all');
  const [rowSearchQuery, setRowSearchQuery] = useState<string>('');
  const [isColumnSettingsOpen, setIsColumnSettingsOpen] = useState<boolean>(false);
  const [activeDropdownRowId, setActiveDropdownRowId] = useState<string | null>(null);
  const [pendingDupPeersByRowId, setPendingDupPeersByRowId] = useState<Record<string, string[]>>({});
  const [highlightedRowId, setHighlightedRowId] = useState<string | null>(null);
  const [isLumpedDepPromptOpen, setIsLumpedDepPromptOpen] = useState<boolean>(false);
  const [dismissedLumpedKey, setDismissedLumpedKey] = useState<string>('');
  const [step3ViewMode, setStep3ViewMode] = useState<'accounts' | 'draft'>('accounts');
  const [verifyOnlyOverrides, setVerifyOnlyOverrides] = useState<Record<string, boolean>>({});
  const [collapsedDiffTargets, setCollapsedDiffTargets] = useState<Record<string, boolean>>({});
  const [expandedAggRowIds, setExpandedAggRowIds] = useState<Record<string, boolean>>({});

  const comparativeYear = getComparativeYear(selectedYear);

  // Initialize sheet selection when a new workbook or statement type is opened
  useEffect(() => {
    if (!isOpen || !workbook) return;
    setSavedAliases(loadSavedPositionAliases(statementType));
    const bestSheet = pickBestPositionSheetName(workbook, statementType);
    setSelectedSheetName(bestSheet);
    setFilterMode('all');
    setRowSearchQuery('');
    setIsColumnSettingsOpen(false);
    setRememberAliasMap({});
    setPendingDupPeersByRowId({});
    setHighlightedRowId(null);
    setDismissedLumpedKey('');
    setIsLumpedDepPromptOpen(false);
    setStep3ViewMode('accounts');
    setVerifyOnlyOverrides({});
    setCollapsedDiffTargets({});
  }, [isOpen, workbook, statementType]);

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
      setIsColumnSettingsOpen(false);
    } else {
      // Fallback: no year header found -> pick first numeric column (or Col B) and open settings so user can verify
      const fallbackNumCol =
        result.candidateColumns.find((c) => c.colIndex >= 1 && c.hasNumbers) ||
        result.candidateColumns[1] ||
        result.candidateColumns[0];

      setStartRow1Based(1);
      setIsColumnSettingsOpen(true);
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
      savedAliases,
      statementType
    );
    setRows(extracted);

    if (statementType === 'position') {
      const detectedLumped = extracted.filter((r) => r.isLumpedDepreciation);
      const lumpedKey = `${fileName}::${selectedSheetName}::${detectedLumped.map((r) => r.excelRowNumber).join(',')}`;
      if (detectedLumped.length > 0 && dismissedLumpedKey !== lumpedKey) {
        setIsLumpedDepPromptOpen(true);
      }
    }
  }, [
    isOpen,
    statementType,
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
    () => (statementType === 'position' ? rows.filter((r) => r.isLumpedDepreciation) : []),
    [rows, statementType]
  );

  const enabledTargets = useMemo(() => yearTargets.filter((t) => t.enabled), [yearTargets]);

  const itemById = useMemo(() => {
    const map = new Map<string, LineItemDefinition>();
    encodableItems.forEach((item) => map.set(item.id, item));
    return map;
  }, [encodableItems]);

  const sameNameVariantsByNormName = useMemo(() => {
    const byName = new Map<string, LineItemDefinition[]>();
    encodableItems.forEach((item) => {
      const key = normalizeAliasKey(item.name);
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
  }, [encodableItems]);

  const formatItemPlacementPath = (item: LineItemDefinition): string => {
    const parts = [item.subsection, item.group, item.subgroup]
      .filter((part): part is string => Boolean(part))
      .filter((part, idx, arr) => idx === 0 || part.toLowerCase() !== arr[idx - 1]?.toLowerCase());
    return parts.join(' → ');
  };

  // Detect duplicate target lineItemIds among included rows and group peer rows for clear highlighting
  const {
    duplicateLineItemIds,
    duplicateGroups,
    duplicateInfoByRowId,
    duplicateRowCount,
  } = useMemo(() => {
    const byTarget = new Map<string, ExtractedPositionRow[]>();
    rows.forEach((r) => {
      if (r.included && r.selectedLineItemId) {
        const list = byTarget.get(r.selectedLineItemId) || [];
        list.push(r);
        byTarget.set(r.selectedLineItemId, list);
      }
    });

    const dups = new Set<string>();
    const groups: {
      lineItemId: string;
      officialName: string;
      groupNumber: number;
      rows: ExtractedPositionRow[];
    }[] = [];
    const infoByRowId: Record<
      string,
      { groupNumber: number; peers: ExtractedPositionRow[] }
    > = {};
    let totalDupRows = 0;

    byTarget.forEach((groupRows, lineItemId) => {
      if (groupRows.length > 1) {
        dups.add(lineItemId);
        const groupNumber = groups.length + 1;
        const officialName = itemById.get(lineItemId)?.name || groupRows[0].rawName;
        groups.push({ lineItemId, officialName, groupNumber, rows: groupRows });
        totalDupRows += groupRows.length;
        groupRows.forEach((row) => {
          infoByRowId[row.rowId] = {
            groupNumber,
            peers: groupRows.filter((other) => other.rowId !== row.rowId),
          };
        });
      }
    });

    return {
      duplicateLineItemIds: dups,
      duplicateGroups: groups,
      duplicateInfoByRowId: infoByRowId,
      duplicateRowCount: totalDupRows,
    };
  }, [rows, itemById]);

  const jumpToAccountRow = (targetRowId: string) => {
    if (filterMode === 'matched' || filterMode === 'skipped') {
      setFilterMode('all');
    }
    if (rowSearchQuery) {
      setRowSearchQuery('');
    }
    setHighlightedRowId(targetRowId);
    window.setTimeout(() => {
      const el = document.getElementById(`import-row-${targetRowId}`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 60);
    window.setTimeout(() => {
      setHighlightedRowId((prev) => (prev === targetRowId ? null : prev));
    }, 2400);
  };

  const stats = useMemo(() => {
    let exactOrAlias = 0;
    let suggested = 0;
    let unmatched = 0;
    let includedCount = 0;
    let skippedSummaryCount = 0;

    rows.forEach((r) => {
      if (r.isSummaryRow && !r.included) {
        skippedSummaryCount++;
        return;
      }
      if (!r.included) return;
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
      total: rows.filter((r) => !r.isSummaryRow || r.included).length,
      includedCount,
      exactOrAlias,
      suggested,
      unmatched,
      attentionCount: suggested + unmatched,
      skippedSummaryCount,
    };
  }, [rows]);

  // Loose Accounting Equation Check (Assets = Liabilities + Equity) + Culprit Diagnostics per enabled year
  const accountingVerificationByTarget = useMemo(() => {
    const excelTotalAssetsRow = rows.find((r) => r.summaryKind === 'total_assets');
    const excelTotalLiabRow = rows.find((r) => r.summaryKind === 'total_liabilities');
    const excelTotalEquityRow = rows.find((r) => r.summaryKind === 'total_equity');
    const excelTotalLiabEquityRow = rows.find((r) => r.summaryKind === 'total_liabilities_equity');

    const excludedLumpedDepRows = rows.filter((r) => r.isLumpedDepreciation && !r.included);

    return enabledTargets.map((target) => {
      let computedAssetsSum = 0;
      let computedLiabilitiesSum = 0;
      let computedEquitySum = 0;

      const unmatchedIncludedRows: { rowNumber: number; rawName: string; amount: number }[] = [];
      const uncheckedLeafRows: { rowNumber: number; rawName: string; amount: number }[] = [];

      rows.forEach((r) => {
        const rawAmt = r.amountsByTargetId[target.id];
        if (rawAmt === null || rawAmt === undefined || Math.abs(rawAmt) < 0.005) return;

        if (!r.included) {
          if (!r.isSummaryRow) {
            uncheckedLeafRows.push({
              rowNumber: r.excelRowNumber,
              rawName: r.rawName,
              amount: rawAmt,
            });
          }
          return;
        }

        if (!r.selectedLineItemId) {
          unmatchedIncludedRows.push({
            rowNumber: r.excelRowNumber,
            rawName: r.rawName,
            amount: rawAmt,
          });
          return;
        }

        const def = itemById.get(r.selectedLineItemId);
        if (!def) return;
        const effective = def.isContra ? -Math.abs(rawAmt) : rawAmt;
        if (def.section === 'ASSETS') {
          computedAssetsSum += effective;
        } else if (def.section === 'LIABILITIES') {
          computedLiabilitiesSum += effective;
        } else if (def.section === 'EQUITY' || def.subsection === 'Net Assets/Equity') {
          computedEquitySum += effective;
        }
      });

      const computedLiabEquitySum = computedLiabilitiesSum + computedEquitySum;
      const signedEquationDiff = computedAssetsSum - computedLiabEquitySum;
      const absEquationDiff = Math.abs(signedEquationDiff);
      const isExactBalanced = absEquationDiff < 0.01;
      const isLooseBalanced = absEquationDiff <= 1.0;

      const excelAssetsVal = excelTotalAssetsRow
        ? excelTotalAssetsRow.amountsByTargetId[target.id] ?? null
        : null;
      const excelLiabVal = excelTotalLiabRow
        ? excelTotalLiabRow.amountsByTargetId[target.id] ?? null
        : null;
      const excelEquityVal = excelTotalEquityRow
        ? excelTotalEquityRow.amountsByTargetId[target.id] ?? null
        : null;
      const excelLiabEquityVal = excelTotalLiabEquityRow
        ? excelTotalLiabEquityRow.amountsByTargetId[target.id] ?? null
        : null;

      const assetsDiff =
        excelAssetsVal !== null ? Math.abs(excelAssetsVal - computedAssetsSum) : null;

      // Identify most likely culprit(s) when a variance exists
      const culprits: string[] = [];

      const lumpedDepBreakdown = excludedLumpedDepRows
        .map((r) => ({
          rowNumber: r.excelRowNumber,
          rawName: r.rawName,
          mag: Math.abs(r.amountsByTargetId[target.id] ?? 0),
        }))
        .filter((x) => x.mag >= 0.01);

      const totalExcludedDepMag = lumpedDepBreakdown.reduce((acc, x) => acc + x.mag, 0);

      if (!isLooseBalanced) {
        // 1. Check if excluded lumped Accumulated Depreciation explains the exact (or partial) variance
        if (totalExcludedDepMag > 0) {
          const desc = lumpedDepBreakdown
            .map((x) => `Row ${x.rowNumber} ("${x.rawName}": ₱${formatAccounting(x.mag)})`)
            .join(', ');

          if (signedEquationDiff > 0 && Math.abs(signedEquationDiff - totalExcludedDepMag) <= 1.0) {
            culprits.push(
              `Most likely culprit: Excluded lumped Accumulated Depreciation (${desc}) — Assets are higher by ₱${formatAccounting(
                totalExcludedDepMag
              )} because the combined depreciation could not be assigned to individual PPE classes.`
            );
          } else if (Math.abs(absEquationDiff - totalExcludedDepMag) <= 1.0) {
            culprits.push(
              `Most likely culprit: Excluded lumped Accumulated Depreciation (${desc}) matches the ₱${formatAccounting(
                absEquationDiff
              )} variance.`
            );
          } else {
            culprits.push(
              `Likely contributor: Excluded lumped Accumulated Depreciation (${desc}) is omitted from Assets (remaining variance after depreciation: ₱${formatAccounting(
                Math.abs(signedEquationDiff - totalExcludedDepMag)
              )}).`
            );
          }
        }

        // 2. Check unmatched included rows (not yet assigned to Assets / Liabilities / Equity)
        if (unmatchedIncludedRows.length > 0) {
          const unmatchedSum = unmatchedIncludedRows.reduce((acc, u) => acc + u.amount, 0);
          const singleMatch = unmatchedIncludedRows.find(
            (u) => Math.abs(Math.abs(u.amount) - absEquationDiff) <= 1.0
          );
          if (singleMatch) {
            culprits.push(
              `Likely culprit: Unmatched Row ${singleMatch.rowNumber} ("${singleMatch.rawName}": ₱${formatAccounting(
                singleMatch.amount
              )}) has not been mapped to an official Assets, Liabilities, or Equity account yet.`
            );
          } else if (Math.abs(Math.abs(unmatchedSum) - absEquationDiff) <= 1.0) {
            culprits.push(
              `Likely culprit: ${unmatchedIncludedRows.length} unmatched row(s) totaling ₱${formatAccounting(
                unmatchedSum
              )} are not yet counted in Assets, Liabilities, or Equity.`
            );
          } else {
            culprits.push(
              `${unmatchedIncludedRows.length} included row(s) totaling ₱${formatAccounting(
                unmatchedSum
              )} still need a matched line item ("Needs Match") and are excluded from totals.`
            );
          }
        }

        // 3. Check manually unchecked leaf rows
        if (uncheckedLeafRows.length > 0) {
          const singleUnchecked = uncheckedLeafRows.find(
            (u) => Math.abs(Math.abs(u.amount) - absEquationDiff) <= 1.0
          );
          if (singleUnchecked) {
            culprits.push(
              `Likely culprit: Unchecked Row ${singleUnchecked.rowNumber} ("${singleUnchecked.rawName}": ₱${formatAccounting(
                singleUnchecked.amount
              )}) matches the ₱${formatAccounting(absEquationDiff)} variance.`
            );
          }
        }

        // 4. Pinpoint which section differs from the Excel sheet's own Total rows (if present)
        if (
          excelAssetsVal !== null &&
          Math.abs(computedAssetsSum - excelAssetsVal) > 1.0 &&
          Math.abs(Math.abs(computedAssetsSum - excelAssetsVal) - totalExcludedDepMag) > 1.0
        ) {
          culprits.push(
            `Assets section differs from sheet "Total Assets" (₱${formatAccounting(
              excelAssetsVal
            )}) by ₱${formatAccounting(Math.abs(computedAssetsSum - excelAssetsVal))}.`
          );
        }
        if (excelLiabVal !== null && Math.abs(computedLiabilitiesSum - excelLiabVal) > 1.0) {
          culprits.push(
            `Liabilities section differs from sheet "Total Liabilities" (₱${formatAccounting(
              excelLiabVal
            )}) by ₱${formatAccounting(Math.abs(computedLiabilitiesSum - excelLiabVal))}.`
          );
        }
        if (excelEquityVal !== null && Math.abs(computedEquitySum - excelEquityVal) > 1.0) {
          culprits.push(
            `Equity section differs from sheet Equity total (₱${formatAccounting(
              excelEquityVal
            )}) by ₱${formatAccounting(Math.abs(computedEquitySum - excelEquityVal))}.`
          );
        }
        if (
          excelLiabEquityVal !== null &&
          Math.abs(computedLiabEquitySum - excelLiabEquityVal) > 1.0
        ) {
          culprits.push(
            `Liabilities + Equity differs from sheet "Total Liabilities & Equity" (₱${formatAccounting(
              excelLiabEquityVal
            )}) by ₱${formatAccounting(Math.abs(computedLiabEquitySum - excelLiabEquityVal))}.`
          );
        }

        // 5. Note duplicate target assignments if any
        if (duplicateLineItemIds.size > 0) {
          culprits.push(
            `${duplicateLineItemIds.size} duplicate target line item mapping(s) detected — review duplicate rows so balances are not overwritten.`
          );
        }
      }

      return {
        target,
        computedAssetsSum,
        computedLiabilitiesSum,
        computedEquitySum,
        computedLiabEquitySum,
        signedEquationDiff,
        absEquationDiff,
        isExactBalanced,
        isLooseBalanced,
        excelAssetsVal,
        assetsDiff,
        culprits,
        unmatchedCount: unmatchedIncludedRows.length,
      };
    });
  }, [rows, enabledTargets, itemById, duplicateLineItemIds]);

  // Other statements (Performance, Cash Flows, Net Assets) verification summaries per enabled target
  const otherStatementVerificationByTarget = useMemo(() => {
    if (statementType === 'position') return [];

    const excelTotalRevenueRow = rows.find((r) => r.summaryKind === 'total_revenue');
    const excelTotalExpensesRow = rows.find((r) => r.summaryKind === 'total_expenses');
    const excelSurplusRows = rows.filter((r) => r.summaryKind === 'surplus_deficit');
    const excelPeriodSurplusRow = excelSurplusRows[excelSurplusRows.length - 1];
    const excelCashIncDecRow = rows.find((r) => r.summaryKind === 'cash_increase_decrease');

    return enabledTargets.map((target) => {
      let revenueSum = 0;
      let psSum = 0;
      let mooeSum = 0;
      let finSum = 0;
      let nonCashSum = 0;
      let expensesSum = 0;
      let transfersFromSum = 0;
      let transfersToSum = 0;
      let nonOpSum = 0;
      let lossesSum = 0;

      let opIn = 0;
      let opOut = 0;
      let invIn = 0;
      let invOut = 0;
      let finIn = 0;
      let finOut = 0;

      let begAdjSum = 0;
      let cyChangesSum = 0;

      const unmatchedIncludedRows: { rowNumber: number; rawName: string; amount: number }[] = [];

      rows.forEach((r) => {
        const rawAmt = r.amountsByTargetId[target.id];
        if (rawAmt === null || rawAmt === undefined || Math.abs(rawAmt) < 0.005) return;
        if (!r.included) return;

        if (!r.selectedLineItemId) {
          unmatchedIncludedRows.push({
            rowNumber: r.excelRowNumber,
            rawName: r.rawName,
            amount: rawAmt,
          });
          return;
        }

        const def = itemById.get(r.selectedLineItemId);
        if (!def) return;
        const effective = def.isContra ? -Math.abs(rawAmt) : rawAmt;

        if (statementType === 'performance') {
          if (def.section === 'REVENUE') revenueSum += effective;
          else if (def.section === 'EXPENSES') {
            expensesSum += effective;
            if (def.group === 'Personnel Services') psSum += effective;
            else if (def.group === 'Maintenance and Other Operating Expenses') mooeSum += effective;
            else if (def.group === 'Financial Expenses') finSum += effective;
            else nonCashSum += effective;
          } else if (def.section === 'TRANSFERS') {
            if (def.group.startsWith('Less:')) {
              transfersToSum += effective;
            } else {
              transfersFromSum += effective;
            }
          } else if (def.section === 'NON_OPERATING') {
            nonOpSum += effective;
          } else if (def.section === 'LOSSES') {
            lossesSum += Math.abs(effective);
          }
        } else if (statementType === 'cash_flows') {
          const isOut = def.subgroup === 'Cash Outflows';
          if (def.section === 'CASH_OPERATING') {
            if (isOut) opOut += effective;
            else opIn += effective;
          } else if (def.section === 'CASH_INVESTING') {
            if (isOut) invOut += effective;
            else invIn += effective;
          } else if (def.section === 'CASH_FINANCING') {
            if (isOut) finOut += effective;
            else finIn += effective;
          }
        } else if (statementType === 'net_assets') {
          if (def.group === 'Adjustments to Beginning Balance') begAdjSum += effective;
          else if (def.group === 'Changes in Net Assets/Equity for the Calendar Year') {
            cyChangesSum += effective;
          }
        }
      });

      const transfersSum = transfersFromSum - transfersToSum;
      const nonOpNetSum = nonOpSum - lossesSum;
      const opsSurplus = revenueSum - expensesSum;
      const periodSurplus = opsSurplus + transfersSum + nonOpNetSum;
      const netOp = opIn - opOut;
      const netInv = invIn - invOut;
      const netFin = finIn - finOut;
      const netCashChange = netOp + netInv + netFin;
      const netAssetsChange = begAdjSum + cyChangesSum;

      const warnings: string[] = [];
      if (unmatchedIncludedRows.length > 0) {
        const unmatchedSum = unmatchedIncludedRows.reduce((s, u) => s + u.amount, 0);
        warnings.push(
          `${unmatchedIncludedRows.length} included row(s) totaling ₱${formatAccounting(
            unmatchedSum
          )} still need an official account match.`
        );
      }

      if (statementType === 'performance') {
        const sheetRev = excelTotalRevenueRow?.amountsByTargetId[target.id] ?? null;
        if (sheetRev !== null && Math.abs(sheetRev - revenueSum) > 1.0) {
          warnings.push(
            `Computed Revenue (₱${formatAccounting(revenueSum)}) differs from sheet Total Revenue (₱${formatAccounting(
              sheetRev
            )}) by ₱${formatAccounting(Math.abs(sheetRev - revenueSum))}.`
          );
        }
        const sheetExp = excelTotalExpensesRow?.amountsByTargetId[target.id] ?? null;
        if (sheetExp !== null && Math.abs(sheetExp - expensesSum) > 1.0) {
          warnings.push(
            `Computed Operating Expenses (₱${formatAccounting(expensesSum)}) differs from sheet Total Expenses (₱${formatAccounting(
              sheetExp
            )}) by ₱${formatAccounting(Math.abs(sheetExp - expensesSum))}.`
          );
        }
        const sheetSurplus = excelPeriodSurplusRow?.amountsByTargetId[target.id] ?? null;
        if (
          sheetSurplus !== null &&
          Math.abs(sheetSurplus - periodSurplus) > 1.0 &&
          Math.abs(sheetSurplus - opsSurplus) > 1.0
        ) {
          warnings.push(
            `Computed Surplus/(Deficit) (₱${formatAccounting(periodSurplus)}) differs from sheet Surplus/(Deficit) (₱${formatAccounting(
              sheetSurplus
            )}) by ₱${formatAccounting(Math.abs(sheetSurplus - periodSurplus))}.`
          );
        }
      } else if (statementType === 'cash_flows') {
        const sheetNetCash = excelCashIncDecRow?.amountsByTargetId[target.id] ?? null;
        if (sheetNetCash !== null && Math.abs(sheetNetCash - netCashChange) > 1.0) {
          warnings.push(
            `Computed Net Cash Change (₱${formatAccounting(netCashChange)}) differs from sheet Increase/(Decrease) in Cash (₱${formatAccounting(
              sheetNetCash
            )}) by ₱${formatAccounting(Math.abs(sheetNetCash - netCashChange))}.`
          );
        }
      }

      return {
        target,
        isHealthy: warnings.length === 0,
        warnings,
        unmatchedCount: unmatchedIncludedRows.length,
        revenueSum,
        psSum,
        mooeSum,
        finSum,
        nonCashSum,
        expensesSum,
        transfersFromSum,
        transfersToSum,
        transfersSum,
        nonOpSum,
        lossesSum,
        nonOpNetSum,
        opsSurplus,
        periodSurplus,
        opIn,
        opOut,
        netOp,
        invIn,
        invOut,
        netInv,
        finIn,
        finOut,
        netFin,
        netCashChange,
        begAdjSum,
        cyChangesSum,
        netAssetsChange,
      };
    });
  }, [statementType, rows, enabledTargets, itemById]);

  // Previous / Existing Database Verification per enabled year column
  const dbComparisonEntries = useMemo(() => {
    const newestEnabledYear = enabledTargets.reduce(
      (maxYr, t) => (Number(t.targetYear) > Number(maxYr) ? t.targetYear : maxYr),
      enabledTargets[0]?.targetYear || ''
    );

    return enabledTargets.map((target) => {
      const comparison: DatabaseTargetComparison = compareTargetAgainstDatabase(
        target,
        rows,
        encodableItems,
        dataStore[target.targetYear]?.[divisionId],
        statementType
      );
      const isPriorComparativeYear =
        enabledTargets.length > 1 && Number(target.targetYear) < Number(newestEnabledYear);
      const defaultVerifyOnly = isPriorComparativeYear && comparison.hasExistingData;
      const overrideKey = `${target.id}::${target.targetYear}`;
      const isVerifyOnly = verifyOnlyOverrides[overrideKey] ?? defaultVerifyOnly;

      return {
        target,
        comparison,
        isPriorComparativeYear,
        isVerifyOnly,
        overrideKey,
      };
    });
  }, [enabledTargets, rows, encodableItems, dataStore, divisionId, verifyOnlyOverrides, statementType]);

  const existingDbComparisons = useMemo(
    () => dbComparisonEntries.filter((entry) => entry.comparison.hasExistingData),
    [dbComparisonEntries]
  );

  const dbComparisonByTargetId = useMemo(() => {
    const map: Record<string, (typeof dbComparisonEntries)[number]> = {};
    dbComparisonEntries.forEach((entry) => {
      map[entry.target.id] = entry;
    });
    return map;
  }, [dbComparisonEntries]);

  const targetsToSave = useMemo(
    () => dbComparisonEntries.filter((e) => !e.isVerifyOnly).map((e) => e.target),
    [dbComparisonEntries]
  );

  const verifyOnlyTargets = useMemo(
    () => dbComparisonEntries.filter((e) => e.isVerifyOnly).map((e) => e.target),
    [dbComparisonEntries]
  );

  // Clean up duplicate-reclassification tracking once a row is skipped or assigned with dropdown closed
  useEffect(() => {
    if (filterMode !== 'duplicates') {
      setPendingDupPeersByRowId((prev) => (Object.keys(prev).length > 0 ? {} : prev));
      return;
    }
    setPendingDupPeersByRowId((prev) => {
      const entries = Object.entries(prev);
      if (entries.length === 0) return prev;
      let changed = false;
      const next: Record<string, string[]> = {};
      for (const [rowId, peers] of entries) {
        const r = rows.find((item) => item.rowId === rowId);
        const stillReclassifying = Boolean(
          r && r.included && (!r.selectedLineItemId || activeDropdownRowId === rowId)
        );
        if (stillReclassifying) {
          next[rowId] = peers;
        } else {
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [filterMode, rows, activeDropdownRowId]);

  const activePendingDupRowIds = useMemo(() => {
    const activeIds = new Set<string>();
    if (filterMode !== 'duplicates') return activeIds;
    Object.entries(pendingDupPeersByRowId).forEach(([rowId, peers]) => {
      const r = rows.find((item) => item.rowId === rowId);
      if (r && r.included && (!r.selectedLineItemId || activeDropdownRowId === rowId)) {
        activeIds.add(rowId);
        peers.forEach((pId) => activeIds.add(pId));
      }
    });
    return activeIds;
  }, [filterMode, pendingDupPeersByRowId, rows, activeDropdownRowId]);

  const visibleRows = useMemo(() => {
    const q = rowSearchQuery.trim().toLowerCase();
    return rows.filter((r) => {
      if (filterMode === 'skipped') {
        if (!(r.isSummaryRow && !r.included)) return false;
      } else if (r.isSummaryRow && !r.included) {
        return false;
      }

      if (q) {
        const selectedDef = r.selectedLineItemId ? itemById.get(r.selectedLineItemId) : undefined;
        const matchesQuery =
          r.rawName.toLowerCase().includes(q) ||
          (selectedDef && selectedDef.name.toLowerCase().includes(q)) ||
          String(r.excelRowNumber).includes(q);
        if (!matchesQuery) return false;
      }

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

      if (filterMode === 'duplicates') {
        return Boolean(
          r.included &&
            ((r.selectedLineItemId && duplicateLineItemIds.has(r.selectedLineItemId)) ||
              activePendingDupRowIds.has(r.rowId))
        );
      }

      if (filterMode === 'matched') {
        return Boolean(r.included && r.selectedLineItemId);
      }

      return true;
    });
  }, [rows, filterMode, rowSearchQuery, duplicateLineItemIds, activePendingDupRowIds, itemById]);

  const handleToggleRowInclude = (rowId: string) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.rowId !== rowId) return r;
        const nextIncluded = !r.included;
        if (nextIncluded && r.isSummaryRow && !r.recommendation.bestItem) {
          const rec = matchLineItemWithRecommendation(r.rawName, encodableItems, savedAliases);
          const autoId = rec.bestItem && rec.confidence >= 66 ? rec.bestItem.id : '';
          return {
            ...r,
            included: true,
            recommendation: rec,
            selectedLineItemId: r.selectedLineItemId || autoId,
          };
        }
        return { ...r, included: nextIncluded };
      })
    );
  };

  const handleRowDropdownOpenChange = (rowId: string, open: boolean) => {
    setActiveDropdownRowId((prev) => (open ? rowId : prev === rowId ? null : prev));
    if (open && filterMode === 'duplicates') {
      const dupInfo = duplicateInfoByRowId[rowId];
      if (dupInfo) {
        setPendingDupPeersByRowId((prev) => ({
          ...prev,
          [rowId]: dupInfo.peers.map((p) => p.rowId),
        }));
      }
    }
  };

  const handleSelectRowLineItem = (rowId: string, lineItemId: string) => {
    if (!lineItemId && filterMode === 'duplicates') {
      const dupInfo = duplicateInfoByRowId[rowId];
      if (dupInfo) {
        setPendingDupPeersByRowId((prev) => ({
          ...prev,
          [rowId]: dupInfo.peers.map((p) => p.rowId),
        }));
      }
    }
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
        updatedAliases = savePositionAlias(r.rawName, r.selectedLineItemId, statementType);
      }
    });
    setSavedAliases(updatedAliases);
  };

  const handleStageTargetToBatch = (target: YearImportColumnTarget) => {
    commitRememberedAliases();
    const stagedPayload: {
      lineItemId: string;
      rawText: string;
      amount: string;
      aggregationRecord?: DivisionAggregationRecord;
    }[] = [];

    rows.forEach((r) => {
      if (!r.included) return;
      const amt = r.amountsByTargetId[target.id];
      if (amt === null || amt === undefined || Math.abs(amt) < 0.005) return;
      const itemDef = r.selectedLineItemId ? itemById.get(r.selectedLineItemId) : undefined;
      const normalizedAmt = itemDef?.isContra ? Math.abs(amt) : amt;
      const aggRec =
        itemDef && r.aggregationBreakdown
          ? buildDivisionAggregationRecordForTarget(r, target.id, itemDef, fileName) || undefined
          : undefined;
      stagedPayload.push({
        lineItemId: itemDef ? itemDef.id : '',
        rawText: itemDef ? itemDef.name : r.rawName,
        amount: formatAccounting(normalizedAmt),
        aggregationRecord: aggRec,
      });
    });

    onStageToBatch(target.targetYear, stagedPayload);
    onClose();
  };

  const handleSaveAllEnabledYears = () => {
    commitRememberedAliases();

    // Only save targets not marked as "Verify Only" (e.g., skip saving previously uploaded comparative years)
    const savesMap = new Map<string, Map<string, number>>();
    const aggRecordsMap = new Map<string, Map<string, DivisionAggregationRecord>>();
    const unmatchedForActiveYear: { lineItemId: string; rawText: string; amount: string }[] = [];

    targetsToSave.forEach((target) => {
      if (!savesMap.has(target.targetYear)) {
        savesMap.set(target.targetYear, new Map<string, number>());
      }
      if (!aggRecordsMap.has(target.targetYear)) {
        aggRecordsMap.set(target.targetYear, new Map<string, DivisionAggregationRecord>());
      }
      const yearMap = savesMap.get(target.targetYear)!;
      const yearAggMap = aggRecordsMap.get(target.targetYear)!;

      rows.forEach((r) => {
        if (!r.included) return;
        const amt = r.amountsByTargetId[target.id];
        if (amt === null || amt === undefined || Math.abs(amt) < 0.005) return;

        if (r.selectedLineItemId) {
          const itemDef = itemById.get(r.selectedLineItemId);
          const normalizedAmt = itemDef?.isContra ? Math.abs(amt) : amt;
          yearMap.set(r.selectedLineItemId, normalizedAmt);
          if (itemDef && r.aggregationBreakdown) {
            const aggRec = buildDivisionAggregationRecordForTarget(
              r,
              target.id,
              itemDef,
              fileName
            );
            if (aggRec) {
              yearAggMap.set(r.selectedLineItemId, aggRec);
            }
          }
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
        aggregationRecords: Array.from(aggRecordsMap.get(year)?.values() || []),
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
    targetsToSave.length === 1 &&
    verifyOnlyTargets.length === 0 &&
    targetsToSave[0].targetYear === selectedYear;
  const activeYearTarget =
    targetsToSave.find((t) => t.targetYear === selectedYear) ||
    targetsToSave[0] ||
    enabledTargets.find((t) => t.targetYear === selectedYear) ||
    enabledTargets[0];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/70 backdrop-blur-xs">
      <div
        className="w-full max-w-[92rem] max-h-[94vh] bg-th-surface border-2 border-th-border-strong rounded-2xl shadow-2xl flex flex-col overflow-hidden"
        role="dialog"
        aria-modal="true"
        aria-labelledby="excel-import-modal-title"
      >
        {/* Pinned Header */}
        <div className="px-6 py-4 bg-th-subtle border-b border-th-border flex items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="p-3 bg-th-primary text-th-primary-fg rounded-xl border border-th-border-strong shrink-0">
              <FileSpreadsheet className="w-6 h-6" />
            </div>
            <div className="min-w-0">
              <h3 id="excel-import-modal-title" className="text-xl sm:text-2xl font-bold text-th-text leading-snug">
                Review Uploaded Excel / CSV File
              </h3>
              <p className="text-sm sm:text-base text-th-muted mt-0.5 truncate">
                <strong className="text-th-text">{fileName}</strong>
                <span aria-hidden="true" className="mx-2">·</span>
                <span>{divisionName}</span>
                <span aria-hidden="true" className="mx-2">·</span>
                <span>{STATEMENT_TITLE_MAP[statementType]}</span>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-2 px-4 py-2.5 min-h-[44px] rounded-xl text-base font-bold text-th-text bg-th-surface hover:bg-th-subtle-hover border-2 border-th-border-strong transition-colors cursor-pointer shrink-0"
            aria-label="Close import review"
          >
            <X className="w-5 h-5" />
            <span className="hidden sm:inline">Close</span>
          </button>
        </div>

        {/* Single Unified Scrollable Workspace (keeps the whole form spacious & readable at any font scale) */}
        <div className="flex-1 min-h-0 overflow-y-auto px-5 sm:px-7 py-5 space-y-6">
          {/* Step 1: Sheet & Year Columns (Calm Summary + Expandable Settings) */}
          <section className="bg-th-subtle border border-th-border-strong rounded-2xl p-4 sm:p-5 space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2.5 flex-wrap">
                  <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-th-primary text-th-primary-fg text-sm font-bold shrink-0">
                    1
                  </span>
                  <h4 className="text-base sm:text-lg font-bold text-th-text">
                    Spreadsheet Sheet &amp; Year Columns
                  </h4>
                  {inspection && inspection.headerRowIndex >= 0 ? (
                    <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-800 dark:text-emerald-300">
                      <CheckCircle2 className="w-4 h-4 shrink-0" />
                      Year headers found on Row {inspection.headerRowIndex + 1}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-sm font-bold text-amber-800 dark:text-amber-300">
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                      Please confirm which columns hold your amounts
                    </span>
                  )}
                </div>
                <p className="text-sm sm:text-base text-th-muted pl-9">
                  Sheet: <strong className="text-th-text">{selectedSheetName || 'Default'}</strong>
                  <span aria-hidden="true" className="mx-2">·</span>
                  Importing:{' '}
                  <strong className="text-th-text">
                    {enabledTargets.length > 0
                      ? enabledTargets.map((t) => `FY ${t.targetYear} (Col ${t.colLetter})`).join(', ')
                      : 'No year column selected yet'}
                  </strong>
                  <span aria-hidden="true" className="mx-2">·</span>
                  Starts at Row <strong className="text-th-text">{startRow1Based}</strong>
                </p>
              </div>

              <button
                type="button"
                onClick={() => setIsColumnSettingsOpen((prev) => !prev)}
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 min-h-[44px] rounded-xl text-sm sm:text-base font-bold text-th-text bg-th-surface hover:bg-th-subtle-hover border-2 border-th-border-strong transition-colors cursor-pointer shrink-0 self-start md:self-auto"
              >
                <SlidersHorizontal className="w-4 h-4 text-th-muted" />
                <span>{isColumnSettingsOpen ? 'Hide Column Settings' : 'Adjust Sheet / Columns'}</span>
                {isColumnSettingsOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
            </div>

            {isColumnSettingsOpen && (
              <div className="pt-4 border-t border-th-border space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {workbook.SheetNames.length > 1 && (
                    <label className="block space-y-1.5">
                      <span className="block text-sm font-bold text-th-text">Excel Sheet Tab</span>
                      <select
                        value={selectedSheetName}
                        onChange={(e) => setSelectedSheetName(e.target.value)}
                        className="w-full min-h-[44px] px-3.5 py-2 rounded-xl bg-th-input border-2 border-th-border-strong text-base font-bold text-th-text cursor-pointer"
                      >
                        {workbook.SheetNames.map((name) => (
                          <option key={name} value={name}>
                            {name}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}

                  <label className="block space-y-1.5">
                    <span className="block text-sm font-bold text-th-text">Account Name Column</span>
                    <select
                      value={lineItemColOverride === 'auto' ? 'auto' : String(lineItemColOverride)}
                      onChange={(e) =>
                        setLineItemColOverride(
                          e.target.value === 'auto' ? 'auto' : Number(e.target.value)
                        )
                      }
                      className="w-full min-h-[44px] px-3.5 py-2 rounded-xl bg-th-input border-2 border-th-border-strong text-base font-semibold text-th-text cursor-pointer"
                    >
                      <option value="auto">Auto-detect (before amount columns)</option>
                      {inspection?.candidateColumns.map((col) => (
                        <option key={col.colIndex} value={col.colIndex}>
                          Column {col.colLetter}
                          {col.headerSample ? ` (${col.headerSample})` : ''}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="block space-y-1.5">
                    <span className="block text-sm font-bold text-th-text">First Data Row Number</span>
                    <input
                      type="number"
                      min={1}
                      max={Math.max(1, inspection?.totalRows || 100)}
                      value={startRow1Based}
                      onChange={(e) => setStartRow1Based(Math.max(1, Number(e.target.value) || 1))}
                      className="w-full min-h-[44px] px-3.5 py-2 rounded-xl bg-th-input border-2 border-th-border-strong text-base font-mono font-bold text-th-text"
                    />
                  </label>
                </div>

                {/* Detected Year Columns Mapping */}
                <div className="space-y-2">
                  <div className="text-sm font-bold text-th-text">
                    Which spreadsheet columns should be imported?
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    {yearTargets.map((target) => (
                      <div
                        key={target.id}
                        className={`inline-flex items-center gap-2.5 px-3.5 py-2 min-h-[46px] rounded-xl border-2 text-base transition-colors ${
                          target.enabled
                            ? 'bg-th-surface border-th-border-strong text-th-text'
                            : 'bg-th-surface/60 border-th-border text-th-muted opacity-75'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={target.enabled}
                          onChange={() => handleToggleTargetEnabled(target.id)}
                          className="w-5 h-5 accent-th-accent cursor-pointer"
                          aria-label={`Include column ${target.colLetter}`}
                        />
                        <select
                          value={target.colIndex}
                          onChange={(e) => handleChangeTargetCol(target.id, Number(e.target.value))}
                          className="bg-th-input border border-th-border-strong rounded-lg px-2.5 py-1.5 text-sm sm:text-base font-bold text-th-text cursor-pointer"
                          title={`Header: ${target.headerText}`}
                        >
                          {inspection?.candidateColumns.map((col) => (
                            <option key={col.colIndex} value={col.colIndex}>
                              Col {col.colLetter}
                              {col.headerSample ? ` (${col.headerSample})` : ''}
                            </option>
                          ))}
                        </select>
                        <span className="text-sm font-bold text-th-muted">goes to</span>
                        <select
                          value={target.targetYear}
                          onChange={(e) => handleChangeTargetYear(target.id, e.target.value)}
                          className="bg-th-input border border-th-border-strong rounded-lg px-2.5 py-1.5 text-sm sm:text-base font-bold text-th-text cursor-pointer"
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
                        className="inline-flex items-center gap-2 px-4 py-2.5 min-h-[46px] rounded-xl text-sm sm:text-base font-bold bg-th-surface hover:bg-th-subtle-hover border-2 border-th-border-strong text-th-text cursor-pointer"
                      >
                        <Plus className="w-4 h-4" />
                        <span>Add Another Year Column</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </section>

          {/* Lumped Accumulated Depreciation Alert */}
          {lumpedDepRows.length > 0 && (
            <section className="p-4 sm:p-5 bg-red-50 dark:bg-red-950/50 border-2 border-red-300 dark:border-red-800 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-base">
              <div className="flex items-start gap-3 text-red-950 dark:text-red-100">
                <AlertTriangle className="w-6 h-6 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <div className="font-bold text-base sm:text-lg text-red-800 dark:text-red-200">
                    Temporary Classification: Aggregated Accumulated Depreciation
                  </div>
                  <p className="text-sm sm:text-base leading-relaxed">
                    {lumpedDepRows
                      .map((r) => `Row ${r.excelRowNumber} ("${r.rawName}")`)
                      .join(', ')}{' '}
                    was temporarily mapped to <strong className="text-red-700 dark:text-red-300">Aggregated Accumulated Depreciation</strong> (displayed in <strong>red, bold</strong> after all PPE items and above <em>Property, Plant, and Equipment (Net)</em>).{' '}
                    <strong>This division will be excluded from Consolidated Financial Statements until a per-PPE breakdown is provided.</strong>
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsLumpedDepPromptOpen(true)}
                className="px-4 py-2.5 min-h-[44px] rounded-xl bg-red-100 dark:bg-red-900/70 hover:bg-red-200 dark:hover:bg-red-900 text-red-950 dark:text-red-100 font-bold text-sm sm:text-base border-2 border-red-400 dark:border-red-700 cursor-pointer shrink-0 self-start sm:self-center"
              >
                Read Notice
              </button>
            </section>
          )}

          {/* Step 2: Statement Verification & Summary Check */}
          {statementType === 'position' && accountingVerificationByTarget.length > 0 && (
            <section className="space-y-3.5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-th-primary text-th-primary-fg text-sm font-bold shrink-0">
                    2
                  </span>
                  <h4 className="text-base sm:text-lg font-bold text-th-text flex items-center gap-2">
                    <Scale className="w-5 h-5 text-th-accent-text shrink-0" />
                    <span>Balance Check (Assets = Liabilities + Equity)</span>
                  </h4>
                </div>
                <span className="text-sm sm:text-base font-medium text-th-muted pl-9 sm:pl-0">
                  Please check all Assets, Liabilities, and Equity balances before saving.
                </span>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {accountingVerificationByTarget.map(
                  ({
                    target,
                    computedAssetsSum,
                    computedLiabilitiesSum,
                    computedEquitySum,
                    computedLiabEquitySum,
                    absEquationDiff,
                    isExactBalanced,
                    isLooseBalanced,
                    excelAssetsVal,
                    assetsDiff,
                    culprits,
                    unmatchedCount,
                  }) => (
                    <div
                      key={target.id}
                      className={`rounded-2xl border-2 p-4 sm:p-5 space-y-3.5 ${
                        isLooseBalanced
                          ? 'bg-emerald-50/70 dark:bg-emerald-950/30 border-emerald-300 dark:border-emerald-800'
                          : 'bg-amber-50/80 dark:bg-amber-950/40 border-amber-400 dark:border-amber-800'
                      }`}
                    >
                      {/* Clear Year + Verdict Header */}
                      <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-black/10 dark:border-white/10">
                        <div className="text-lg font-bold text-th-text">
                          FY {target.targetYear} <span className="text-sm font-semibold text-th-muted">(Column {target.colLetter})</span>
                        </div>
                        <div
                          className={`inline-flex items-center gap-2 text-base font-bold ${
                            isLooseBalanced
                              ? 'text-emerald-800 dark:text-emerald-200'
                              : 'text-amber-950 dark:text-amber-100'
                          }`}
                        >
                          {isLooseBalanced ? (
                            <CheckCircle2 className="w-5 h-5 text-emerald-700 dark:text-emerald-300 shrink-0" />
                          ) : (
                            <AlertTriangle className="w-5 h-5 text-amber-700 dark:text-amber-300 shrink-0" />
                          )}
                          <span>
                            {isExactBalanced
                              ? 'Balanced'
                              : isLooseBalanced
                              ? `Balanced (₱${formatAccounting(absEquationDiff)} rounding)`
                              : `Difference: ₱${formatAccounting(absEquationDiff)}`}
                          </span>
                        </div>
                      </div>

                      {/* Clear Structured Equation Rows */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm sm:text-base">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-th-muted">Total Assets:</span>
                          <span className="font-mono font-bold text-th-text tabular-nums">
                            ₱{formatAccounting(computedAssetsSum)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-th-muted">Liabilities + Equity:</span>
                          <span className="font-mono font-bold text-th-text tabular-nums">
                            ₱{formatAccounting(computedLiabEquitySum)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-th-muted">Total Liabilities:</span>
                          <span className="font-mono font-semibold text-th-text tabular-nums">
                            ₱{formatAccounting(computedLiabilitiesSum)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-th-muted">Total Equity:</span>
                          <span className="font-mono font-semibold text-th-text tabular-nums">
                            ₱{formatAccounting(computedEquitySum)}
                          </span>
                        </div>
                      </div>

                      {excelAssetsVal !== null && (
                        <div className="pt-2 border-t border-black/10 dark:border-white/10 flex flex-wrap items-center justify-between gap-2 text-sm">
                          <span className="font-semibold text-th-muted">
                            Sheet &quot;Total Assets&quot;: <strong className="font-mono text-th-text tabular-nums">₱{formatAccounting(excelAssetsVal)}</strong>
                          </span>
                          <span className="font-semibold text-th-muted font-mono tabular-nums">
                            {assetsDiff !== null && assetsDiff >= 0.01
                              ? `Diff vs included: ₱${formatAccounting(assetsDiff)}`
                              : 'Matches included Assets'}
                          </span>
                        </div>
                      )}

                      {!isLooseBalanced && (
                        <div className="pt-3 border-t border-amber-300/80 dark:border-amber-800/80 space-y-2.5 text-sm sm:text-base text-amber-950 dark:text-amber-100">
                          <div className="font-bold">Likely Cause(s):</div>
                          {culprits.length > 0 ? (
                            <ul className="space-y-1.5 list-disc pl-5">
                              {culprits.map((msg, idx) => (
                                <li key={idx} className="leading-relaxed font-medium">
                                  {msg}
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p className="leading-relaxed font-medium">
                              No single omitted row matched the ₱{formatAccounting(absEquationDiff)} difference automatically.
                            </p>
                          )}

                          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                            <span className="text-sm font-bold text-amber-900 dark:text-amber-200">
                              Recommendation: Check all Assets, Liabilities, and Equity balances.
                            </span>
                            {unmatchedCount > 0 && (
                              <button
                                type="button"
                                onClick={() => {
                                  setStep3ViewMode('accounts');
                                  setFilterMode('attention');
                                }}
                                className="px-3.5 py-2 min-h-[40px] rounded-xl bg-th-surface hover:bg-th-subtle-hover border-2 border-amber-400 dark:border-amber-700 text-sm font-bold text-th-text cursor-pointer"
                              >
                                Show {unmatchedCount} Unmatched Row{unmatchedCount > 1 ? 's' : ''}
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                )}
              </div>
            </section>
          )}

          {statementType !== 'position' && otherStatementVerificationByTarget.length > 0 && (
            <section className="space-y-3.5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-th-primary text-th-primary-fg text-sm font-bold shrink-0">
                    2
                  </span>
                  <h4 className="text-base sm:text-lg font-bold text-th-text flex items-center gap-2">
                    <Scale className="w-5 h-5 text-th-accent-text shrink-0" />
                    <span>
                      {statementType === 'performance'
                        ? 'Performance Summary (Revenue, Expenses & Surplus)'
                        : statementType === 'cash_flows'
                        ? 'Cash Flow Activity Summary'
                        : 'Net Assets / Equity Changes Summary'}
                    </span>
                  </h4>
                </div>
                <span className="text-sm sm:text-base font-medium text-th-muted pl-9 sm:pl-0">
                  Review computed section totals before saving.
                </span>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {otherStatementVerificationByTarget.map((summary) => (
                  <div
                    key={summary.target.id}
                    className={`rounded-2xl border-2 p-4 sm:p-5 space-y-3.5 ${
                      summary.isHealthy
                        ? 'bg-emerald-50/70 dark:bg-emerald-950/30 border-emerald-300 dark:border-emerald-800'
                        : 'bg-amber-50/80 dark:bg-amber-950/40 border-amber-400 dark:border-amber-800'
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-black/10 dark:border-white/10">
                      <div className="text-lg font-bold text-th-text">
                        FY {summary.target.targetYear}{' '}
                        <span className="text-sm font-semibold text-th-muted">
                          (Column {summary.target.colLetter})
                        </span>
                      </div>
                      <div
                        className={`inline-flex items-center gap-2 text-base font-bold ${
                          summary.isHealthy
                            ? 'text-emerald-800 dark:text-emerald-200'
                            : 'text-amber-950 dark:text-amber-100'
                        }`}
                      >
                        {summary.isHealthy ? (
                          <>
                            <CheckCircle2 className="w-5 h-5 text-emerald-700 dark:text-emerald-300 shrink-0" />
                            <span>Totals Verified</span>
                          </>
                        ) : (
                          <>
                            <AlertTriangle className="w-5 h-5 text-amber-700 dark:text-amber-300 shrink-0" />
                            <span>{summary.warnings.length} Item(s) to Check</span>
                          </>
                        )}
                      </div>
                    </div>

                    {statementType === 'performance' && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm sm:text-base">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-th-muted">Total Revenue:</span>
                          <span className="font-mono font-bold text-th-text tabular-nums">
                            ₱{formatAccounting(summary.revenueSum)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-th-muted">Operating Expenses:</span>
                          <span className="font-mono font-bold text-th-text tabular-nums">
                            ₱{formatAccounting(summary.expensesSum)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-th-muted">Net Subsidy &amp; Transfers:</span>
                          <span className="font-mono font-semibold text-th-text tabular-nums">
                            ₱{formatAccounting(summary.transfersSum)}
                          </span>
                        </div>
                        {(Math.abs(summary.nonOpSum) > 0.005 || Math.abs(summary.lossesSum) > 0.005) && (
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-semibold text-th-muted">Non-Op Income / (Losses):</span>
                            <span className="font-mono font-semibold text-th-text tabular-nums">
                              ₱{formatAccounting(summary.nonOpNetSum)}
                            </span>
                          </div>
                        )}
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-bold text-th-text">Surplus/(Deficit):</span>
                          <span className="font-mono font-bold text-th-text tabular-nums">
                            ₱{formatAccounting(summary.periodSurplus)}
                          </span>
                        </div>
                      </div>
                    )}

                    {statementType === 'cash_flows' && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm sm:text-base">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-th-muted">Net Operating Cash:</span>
                          <span className="font-mono font-bold text-th-text tabular-nums">
                            ₱{formatAccounting(summary.netOp)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-th-muted">Net Investing Cash:</span>
                          <span className="font-mono font-bold text-th-text tabular-nums">
                            ₱{formatAccounting(summary.netInv)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-th-muted">Net Financing Cash:</span>
                          <span className="font-mono font-semibold text-th-text tabular-nums">
                            ₱{formatAccounting(summary.netFin)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-bold text-th-text">Net Change in Cash:</span>
                          <span className="font-mono font-bold text-th-text tabular-nums">
                            ₱{formatAccounting(summary.netCashChange)}
                          </span>
                        </div>
                      </div>
                    )}

                    {statementType === 'net_assets' && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm sm:text-base">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-th-muted">Beginning Adjustments:</span>
                          <span className="font-mono font-bold text-th-text tabular-nums">
                            ₱{formatAccounting(summary.begAdjSum)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-th-muted">Calendar Year Changes:</span>
                          <span className="font-mono font-bold text-th-text tabular-nums">
                            ₱{formatAccounting(summary.cyChangesSum)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-2 sm:col-span-2 pt-1 border-t border-black/10 dark:border-white/10">
                          <span className="font-bold text-th-text">Net Change in Net Assets/Equity:</span>
                          <span className="font-mono font-bold text-th-text tabular-nums">
                            ₱{formatAccounting(summary.netAssetsChange)}
                          </span>
                        </div>
                      </div>
                    )}

                    {!summary.isHealthy && (
                      <div className="pt-3 border-t border-amber-300/80 dark:border-amber-800/80 space-y-2 text-sm sm:text-base text-amber-950 dark:text-amber-100">
                        <ul className="space-y-1.5 list-disc pl-5">
                          {summary.warnings.map((msg, idx) => (
                            <li key={idx} className="leading-relaxed font-medium">
                              {msg}
                            </li>
                          ))}
                        </ul>
                        {summary.unmatchedCount > 0 && (
                          <button
                            type="button"
                            onClick={() => {
                              setStep3ViewMode('accounts');
                              setFilterMode('attention');
                            }}
                            className="px-3.5 py-2 min-h-[40px] rounded-xl bg-th-surface hover:bg-th-subtle-hover border-2 border-amber-400 dark:border-amber-700 text-sm font-bold text-th-text cursor-pointer"
                          >
                            Show {summary.unmatchedCount} Unmatched Row
                            {summary.unmatchedCount > 1 ? 's' : ''}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Previous / Existing Year Database Match Check */}
          {existingDbComparisons.length > 0 && (
            <section className="space-y-3.5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-th-primary text-th-primary-fg text-sm font-bold shrink-0">
                    <Database className="w-4 h-4" />
                  </span>
                  <h4 className="text-base sm:text-lg font-bold text-th-text">
                    Database Match Check (Already Recorded Year{existingDbComparisons.length > 1 ? 's' : ''})
                  </h4>
                </div>
                <span className="text-sm sm:text-base font-medium text-th-muted">
                  Verifying uploaded comparative column(s) against saved figures for {divisionName}.
                </span>
              </div>

              <div className="space-y-4">
                {existingDbComparisons.map(
                  ({ target, comparison, isPriorComparativeYear, isVerifyOnly, overrideKey }) => {
                    const isDiffsCollapsed = Boolean(collapsedDiffTargets[target.id]);
                    const hasDiffs = comparison.differences.length > 0;

                    return (
                      <div
                        key={target.id}
                        className={`rounded-2xl border-2 p-4 sm:p-5 space-y-4 ${
                          comparison.isFullMatch
                            ? 'bg-emerald-50/70 dark:bg-emerald-950/30 border-emerald-300 dark:border-emerald-800'
                            : 'bg-amber-50/80 dark:bg-amber-950/40 border-amber-400 dark:border-amber-800'
                        }`}
                      >
                        {/* Header & Match Verdict */}
                        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-black/10 dark:border-white/10">
                          <div className="flex flex-wrap items-center gap-2.5">
                            <span className="text-lg font-bold text-th-text">
                              FY {target.targetYear}
                            </span>
                            <span className="text-sm font-semibold text-th-muted">
                              (Column {target.colLetter} ·{' '}
                              {isPriorComparativeYear ? 'Comparative / Previous Year' : 'Already Saved in Database'})
                            </span>
                          </div>

                          <div
                            className={`inline-flex items-center gap-2 text-base font-bold ${
                              comparison.isFullMatch
                                ? 'text-emerald-800 dark:text-emerald-200'
                                : 'text-amber-950 dark:text-amber-100'
                            }`}
                          >
                            {comparison.isFullMatch ? (
                              <>
                                <CheckCircle2 className="w-5 h-5 text-emerald-700 dark:text-emerald-300 shrink-0" />
                                <span>
                                  Matches Saved Database ({comparison.exactMatchCount}/{comparison.databaseItemCount} accounts)
                                </span>
                              </>
                            ) : !hasDiffs && comparison.unmatchedNonZeroCount > 0 ? (
                              <>
                                <AlertTriangle className="w-5 h-5 text-amber-700 dark:text-amber-300 shrink-0" />
                                <span>
                                  {comparison.exactMatchCount} Match · {comparison.unmatchedNonZeroCount} Unmatched Row{comparison.unmatchedNonZeroCount > 1 ? 's' : ''} Pending
                                </span>
                              </>
                            ) : (
                              <>
                                <AlertTriangle className="w-5 h-5 text-amber-700 dark:text-amber-300 shrink-0" />
                                <span>
                                  {comparison.differences.length} Difference{comparison.differences.length > 1 ? 's' : ''} vs Saved Database
                                </span>
                              </>
                            )}
                          </div>
                        </div>

                        {/* Plain-Language Summary + Totals Comparison */}
                        <div className="space-y-3">
                          <p className="text-sm sm:text-base font-medium text-th-text leading-relaxed">
                            {comparison.isFullMatch ? (
                              <>
                                All <strong>{comparison.exactMatchCount}</strong> recorded account balances in{' '}
                                <strong>FY {target.targetYear}</strong> match the data already saved in the database for{' '}
                                <strong>{divisionName}</strong>.
                              </>
                            ) : (
                              <>
                                <strong>{comparison.exactMatchCount}</strong> account{comparison.exactMatchCount === 1 ? '' : 's'} match your saved{' '}
                                <strong>FY {target.targetYear}</strong> database
                                {hasDiffs && (
                                  <>
                                    , and <strong>{comparison.differences.length}</strong> account{comparison.differences.length === 1 ? ' differs' : 's differ'}
                                  </>
                                )}
                                {comparison.unmatchedNonZeroCount > 0 && (
                                  <>
                                    {' '}
                                    ({comparison.unmatchedNonZeroCount} uploaded row{comparison.unmatchedNonZeroCount === 1 ? ' is' : 's are'} still unmatched below)
                                  </>
                                )}
                                .
                              </>
                            )}
                          </p>

                          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                            {comparison.sectionSummaries.map((sec) => {
                              const secMatch = Math.abs(sec.variance) < 0.01;
                              return (
                                <div
                                  key={sec.key}
                                  className="p-3 rounded-xl bg-th-surface/90 border border-th-border space-y-1"
                                >
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="font-bold text-th-text">{sec.label}</span>
                                    <span
                                      className={`text-xs font-bold ${
                                        secMatch
                                          ? 'text-emerald-700 dark:text-emerald-300'
                                          : 'text-amber-800 dark:text-amber-300'
                                      }`}
                                    >
                                      {secMatch
                                        ? 'Matches DB'
                                        : `Diff ${sec.variance >= 0 ? '+' : '-'}₱${formatAccounting(Math.abs(sec.variance))}`}
                                    </span>
                                  </div>
                                  <div className="flex items-center justify-between text-xs sm:text-sm text-th-muted">
                                    <span>Uploaded:</span>
                                    <span className="font-mono font-bold text-th-text tabular-nums">
                                      ₱{formatAccounting(sec.uploaded)}
                                    </span>
                                  </div>
                                  <div className="flex items-center justify-between text-xs sm:text-sm text-th-muted">
                                    <span>Saved in DB:</span>
                                    <span className="font-mono font-semibold text-th-text tabular-nums">
                                      ₱{formatAccounting(sec.db)}
                                    </span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        {/* Line-by-Line Discrepancy Table when Differences Exist */}
                        {hasDiffs && (
                          <div className="space-y-2">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-sm font-bold text-amber-950 dark:text-amber-100">
                                Differing Accounts ({comparison.differences.length})
                              </span>
                              <button
                                type="button"
                                onClick={() =>
                                  setCollapsedDiffTargets((prev) => ({
                                    ...prev,
                                    [target.id]: !prev[target.id],
                                  }))
                                }
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-th-surface hover:bg-th-subtle-hover border border-th-border-strong text-xs sm:text-sm font-bold text-th-text cursor-pointer"
                              >
                                <span>{isDiffsCollapsed ? 'Show Details' : 'Hide Details'}</span>
                                {isDiffsCollapsed ? (
                                  <ChevronDown className="w-4 h-4" />
                                ) : (
                                  <ChevronUp className="w-4 h-4" />
                                )}
                              </button>
                            </div>

                            {!isDiffsCollapsed && (
                              <div className="rounded-xl border border-th-border-strong bg-th-surface overflow-x-auto max-h-[280px] overflow-y-auto">
                                <table className="w-full text-left border-collapse text-sm">
                                  <thead className="sticky top-0 bg-th-table-head text-th-table-head-fg text-xs font-bold">
                                    <tr>
                                      <th className="px-3.5 py-2.5">Official Account</th>
                                      <th className="px-3.5 py-2.5 text-right whitespace-nowrap">
                                        Uploaded (FY {target.targetYear})
                                      </th>
                                      <th className="px-3.5 py-2.5 text-right whitespace-nowrap">
                                        Saved in Database
                                      </th>
                                      <th className="px-3.5 py-2.5 text-right whitespace-nowrap">
                                        Difference
                                      </th>
                                      <th className="px-3.5 py-2.5 whitespace-nowrap">Status</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-th-border">
                                    {comparison.differences.map((d) => (
                                      <tr key={d.lineItemId} className="hover:bg-th-subtle/60">
                                        <td className="px-3.5 py-2.5">
                                          <div className="font-bold text-th-text">{d.itemName}</div>
                                          <div className="text-xs text-th-muted">
                                            {d.subsection} › {d.group}
                                          </div>
                                        </td>
                                        <td className="px-3.5 py-2.5 text-right font-mono font-bold text-th-text tabular-nums whitespace-nowrap">
                                          {Math.abs(d.uploadedAmount) >= 0.005
                                            ? `₱${formatAccounting(d.uploadedAmount)}`
                                            : '—'}
                                        </td>
                                        <td className="px-3.5 py-2.5 text-right font-mono font-semibold text-th-text tabular-nums whitespace-nowrap">
                                          {Math.abs(d.databaseAmount) >= 0.005
                                            ? `₱${formatAccounting(d.databaseAmount)}`
                                            : '—'}
                                        </td>
                                        <td className="px-3.5 py-2.5 text-right font-mono font-bold text-amber-800 dark:text-amber-300 tabular-nums whitespace-nowrap">
                                          {d.difference >= 0 ? '+' : '-'}₱{formatAccounting(Math.abs(d.difference))}
                                        </td>
                                        <td className="px-3.5 py-2.5 font-semibold text-xs sm:text-sm whitespace-nowrap">
                                          {d.status === 'missing_in_upload' ? (
                                            <span className="text-rose-700 dark:text-rose-300">
                                              Missing / ₱0 in Upload
                                            </span>
                                          ) : d.status === 'new_in_upload' ? (
                                            <span className="text-amber-800 dark:text-amber-300">
                                              Not in Saved DB
                                            </span>
                                          ) : (
                                            <span className="text-amber-800 dark:text-amber-300">
                                              Amount Differs
                                            </span>
                                          )}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Verify-Only Protection vs Overwrite Toggle */}
                        <div className="pt-2 border-t border-black/10 dark:border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          <label className="inline-flex items-center gap-2.5 text-sm sm:text-base font-bold text-th-text cursor-pointer select-none">
                            <input
                              type="checkbox"
                              checked={isVerifyOnly}
                              onChange={(e) =>
                                setVerifyOnlyOverrides((prev) => ({
                                  ...prev,
                                  [overrideKey]: e.target.checked,
                                }))
                              }
                              className="w-5 h-5 accent-th-accent cursor-pointer shrink-0"
                            />
                            <span>
                              Verify only — keep existing saved FY {target.targetYear} database unchanged
                            </span>
                          </label>
                          <span className="text-xs sm:text-sm font-medium text-th-muted pl-7 sm:pl-0">
                            {isVerifyOnly
                              ? `FY ${target.targetYear} will only be checked and will NOT be overwritten when saving.`
                              : `Saving will update FY ${target.targetYear} in the database with these uploaded amounts.`}
                          </span>
                        </div>
                      </div>
                    );
                  }
                )}
              </div>
            </section>
          )}

          {/* Step 3: Review & Confirm Extracted Rows OR Preview Draft Financial Statement */}
          <section className="space-y-4">
            <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 flex-wrap">
                <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-th-primary text-th-primary-fg text-sm font-bold shrink-0">
                  3
                </span>
                <h4 className="text-base sm:text-lg font-bold text-th-text">
                  Review Extracted Accounts
                </h4>
                <span className="text-sm sm:text-base text-th-muted font-medium">
                  <span aria-hidden="true" className="mx-1">·</span>
                  <strong className="text-emerald-700 dark:text-emerald-300">{stats.exactOrAlias}</strong> Matched
                  <span aria-hidden="true" className="mx-2">·</span>
                  <strong className="text-amber-700 dark:text-amber-300">{stats.suggested}</strong> Best Guess
                  <span aria-hidden="true" className="mx-2">·</span>
                  <strong className={stats.unmatched > 0 ? 'text-rose-700 dark:text-rose-300' : 'text-th-text'}>
                    {stats.unmatched}
                  </strong>{' '}
                  Need Match
                  {duplicateLineItemIds.size > 0 && (
                    <>
                      <span aria-hidden="true" className="mx-2">·</span>
                      <button
                        type="button"
                        onClick={() => {
                          setStep3ViewMode('accounts');
                          setFilterMode((prev) => (prev === 'duplicates' ? 'all' : 'duplicates'));
                        }}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 text-amber-800 dark:text-amber-200 font-bold transition-colors cursor-pointer"
                        title="Click to filter and review duplicate accounts side-by-side"
                      >
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
                        <span>
                          {duplicateLineItemIds.size} Duplicate{duplicateLineItemIds.size > 1 ? 's' : ''} ({duplicateRowCount} rows)
                        </span>
                      </button>
                    </>
                  )}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                {/* Primary Workspace View Mode Switcher: Extracted Accounts vs Draft Statement of Financial Position */}
                <div className="inline-flex items-center gap-1.5 p-1 bg-th-subtle border-2 border-th-border-strong rounded-xl">
                  <button
                    type="button"
                    onClick={() => setStep3ViewMode('accounts')}
                    className={`px-3.5 py-2 min-h-[40px] rounded-lg text-sm font-bold transition-colors cursor-pointer inline-flex items-center gap-2 whitespace-nowrap shrink-0 ${
                      step3ViewMode === 'accounts'
                        ? 'bg-th-primary text-th-primary-fg shadow-xs'
                        : 'text-th-text hover:bg-th-surface'
                    }`}
                  >
                    <ListChecks className="w-4 h-4 shrink-0" />
                    <span>Extracted Accounts</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setStep3ViewMode('draft')}
                    className={`px-3.5 py-2 min-h-[40px] rounded-lg text-sm font-bold transition-colors cursor-pointer inline-flex items-center gap-2 whitespace-nowrap shrink-0 ${
                      step3ViewMode === 'draft'
                        ? 'bg-th-accent text-th-accent-fg shadow-xs'
                        : 'text-th-text hover:bg-th-surface'
                    }`}
                  >
                    <FileText className="w-4 h-4 shrink-0" />
                    <span>Draft Financial Statement</span>
                  </button>
                </div>

                {step3ViewMode === 'accounts' && (
                  <>
                    <div className="relative flex-1 sm:flex-initial min-w-[210px]">
                      <Search className="w-4 h-4 text-th-muted absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={rowSearchQuery}
                        onChange={(e) => setRowSearchQuery(e.target.value)}
                        placeholder="Find an account in this file..."
                        className="w-full min-h-[44px] pl-10 pr-8 py-2 rounded-xl bg-th-input border-2 border-th-border-strong text-sm sm:text-base font-medium text-th-text placeholder:text-th-muted"
                      />
                      {rowSearchQuery && (
                        <button
                          type="button"
                          onClick={() => setRowSearchQuery('')}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-th-muted hover:text-th-text cursor-pointer"
                          aria-label="Clear row search"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5 p-1 bg-th-subtle border border-th-border-strong rounded-xl">
                      <button
                        type="button"
                        onClick={() => setFilterMode('all')}
                        className={`px-3.5 py-2 min-h-[40px] rounded-lg text-sm font-bold transition-colors cursor-pointer whitespace-nowrap ${
                          filterMode === 'all'
                            ? 'bg-th-primary text-th-primary-fg shadow-xs'
                            : 'text-th-text hover:bg-th-surface'
                        }`}
                      >
                        All ({stats.total})
                      </button>
                      <button
                        type="button"
                        onClick={() => setFilterMode('attention')}
                        className={`px-3.5 py-2 min-h-[40px] rounded-lg text-sm font-bold transition-colors cursor-pointer inline-flex items-center gap-1.5 whitespace-nowrap ${
                          filterMode === 'attention'
                            ? 'bg-th-primary text-th-primary-fg shadow-xs'
                            : 'text-th-text hover:bg-th-surface'
                        }`}
                      >
                        <Filter className="w-4 h-4" />
                        <span>Needs Review ({stats.attentionCount})</span>
                      </button>
                      {(duplicateRowCount > 0 || filterMode === 'duplicates') && (
                        <button
                          type="button"
                          onClick={() => setFilterMode('duplicates')}
                          className={`px-3.5 py-2 min-h-[40px] rounded-lg text-sm font-bold transition-colors cursor-pointer inline-flex items-center gap-1.5 whitespace-nowrap ${
                            filterMode === 'duplicates'
                              ? 'bg-amber-500 text-slate-950 shadow-xs'
                              : 'bg-amber-500/15 text-amber-800 dark:text-amber-200 border border-amber-500/40 hover:bg-amber-500/25'
                          }`}
                        >
                          <AlertTriangle className="w-4 h-4 shrink-0" />
                          <span>Duplicates ({duplicateRowCount})</span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setFilterMode('matched')}
                        className={`px-3.5 py-2 min-h-[40px] rounded-lg text-sm font-bold transition-colors cursor-pointer whitespace-nowrap ${
                          filterMode === 'matched'
                            ? 'bg-th-primary text-th-primary-fg shadow-xs'
                            : 'text-th-text hover:bg-th-surface'
                        }`}
                      >
                        Matched ({stats.exactOrAlias + stats.suggested})
                      </button>
                      {stats.skippedSummaryCount > 0 && (
                        <button
                          type="button"
                          onClick={() => setFilterMode('skipped')}
                          className={`px-3.5 py-2 min-h-[40px] rounded-lg text-sm font-bold transition-colors cursor-pointer whitespace-nowrap ${
                            filterMode === 'skipped'
                              ? 'bg-th-primary text-th-primary-fg shadow-xs'
                              : 'text-th-text hover:bg-th-surface'
                          }`}
                        >
                          Skipped Totals ({stats.skippedSummaryCount})
                        </button>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>

            {step3ViewMode === 'accounts' &&
              (duplicateGroups.length > 0 ||
                (filterMode === 'duplicates' && activePendingDupRowIds.size > 0)) && (
              <div className="rounded-xl bg-amber-500/10 dark:bg-amber-500/12 border-2 border-amber-500/50 px-4 py-3 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                <div className="flex items-start gap-2.5 min-w-0">
                  <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                  <div className="text-sm leading-relaxed min-w-0">
                    {duplicateGroups.length > 0 ? (
                      <>
                        <span className="font-bold text-amber-900 dark:text-amber-200">
                          {duplicateGroups.length === 1
                            ? 'Duplicate official account detected:'
                            : `${duplicateGroups.length} duplicate official accounts detected:`}
                        </span>{' '}
                        <span className="text-th-text font-medium">
                          Only one balance per official account is saved. Skip the group/duplicate row or assign one to another account:
                        </span>
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-1.5">
                          {duplicateGroups.map((grp) => (
                            <div key={grp.lineItemId} className="inline-flex flex-wrap items-center gap-1.5 text-sm">
                              {duplicateGroups.length > 1 && (
                                <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-900 dark:text-amber-200 text-xs font-extrabold">
                                  #{grp.groupNumber}
                                </span>
                              )}
                              <span className="font-bold text-th-text">{grp.officialName}:</span>
                              {grp.rows.map((r, idx) => (
                                <React.Fragment key={r.rowId}>
                                  {idx > 0 && <span className="text-th-muted">&amp;</span>}
                                  <button
                                    type="button"
                                    onClick={() => jumpToAccountRow(r.rowId)}
                                    className="px-2 py-0.5 rounded-md bg-amber-500/20 hover:bg-amber-500/35 border border-amber-500/40 text-amber-900 dark:text-amber-200 font-bold text-xs cursor-pointer transition-colors"
                                  >
                                    Row {r.excelRowNumber}
                                    {r.sourceColLetter && r.sourceColLetter !== '?' ? ` (${r.sourceColLetter})` : ''}
                                  </button>
                                </React.Fragment>
                              ))}
                            </div>
                          ))}
                        </div>
                      </>
                    ) : (
                      <>
                        <span className="font-bold text-amber-900 dark:text-amber-200">
                          Reclassifying duplicate row:
                        </span>{' '}
                        <span className="text-th-text font-medium">
                          Select the proper official account below (or Skip). Once assigned to a unique account, it will be cleared from Duplicates automatically.
                        </span>
                      </>
                    )}
                  </div>
                </div>
                <div className="shrink-0 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setFilterMode((prev) => (prev === 'duplicates' ? 'all' : 'duplicates'))
                    }
                    className={`px-3.5 py-2 min-h-[40px] rounded-xl text-sm font-bold transition-colors cursor-pointer whitespace-nowrap ${
                      filterMode === 'duplicates'
                        ? 'bg-th-surface hover:bg-th-subtle border-2 border-th-border-strong text-th-text'
                        : 'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-xs'
                    }`}
                  >
                    {filterMode === 'duplicates'
                      ? `Show All ${stats.total} Rows`
                      : `Compare ${duplicateRowCount} Duplicates Side-by-Side`}
                  </button>
                </div>
              </div>
            )}

            {step3ViewMode === 'draft' ? (
              <DraftStatementPreview
                statementType={statementType}
                divisionId={divisionId}
                dataStore={dataStore}
                divisionName={divisionName}
                selectedYear={selectedYear}
                encodableItems={encodableItems}
                rows={rows}
                enabledTargets={enabledTargets}
                unmatchedCount={stats.unmatched}
                duplicateCount={duplicateLineItemIds.size}
                onBackToAccounts={(filterNeedsReview) => {
                  setStep3ViewMode('accounts');
                  if (filterNeedsReview) {
                    setFilterMode('attention');
                  }
                }}
              />
            ) : enabledTargets.length === 0 ? (
              <div className="py-12 px-6 text-center text-base sm:text-lg text-th-muted font-medium border-2 border-dashed border-th-border-strong rounded-2xl">
                Please open &quot;Adjust Sheet / Columns&quot; above and select at least one year column to import.
              </div>
            ) : visibleRows.length === 0 ? (
              <div className="py-12 px-6 text-center text-base sm:text-lg text-th-muted font-medium border-2 border-th-border rounded-2xl space-y-3">
                <div>
                  {stats.total === 0
                    ? 'No account rows with balances were found under the selected year columns. Try opening "Adjust Sheet / Columns" above to check the First Data Row or Year Columns.'
                    : filterMode === 'duplicates' && duplicateRowCount === 0
                    ? 'All duplicate account conflicts are now resolved!'
                    : 'No rows match your current filter or search.'}
                </div>
                {(filterMode !== 'all' || rowSearchQuery) && stats.total > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setFilterMode('all');
                      setRowSearchQuery('');
                    }}
                    className="px-4 py-2.5 min-h-[44px] rounded-xl bg-th-subtle hover:bg-th-subtle-hover border-2 border-th-border-strong text-base font-bold text-th-text cursor-pointer"
                  >
                    Show All {stats.total} Rows
                  </button>
                )}
              </div>
            ) : (
              (() => {
                const gridCols = `104px minmax(200px, 1.15fr) minmax(250px, 1.35fr) ${enabledTargets
                  .map(() => 'minmax(128px, 0.72fr)')
                  .join(' ')}`;
                const minTableWidthPx = 640 + enabledTargets.length * 136;

                return (
                  <div className="border-2 border-th-border-strong rounded-2xl overflow-hidden bg-th-surface shadow-xs">
                    <div className="overflow-x-auto">
                      <div className="w-full" style={{ minWidth: `${minTableWidthPx}px` }}>
                        <div
                          className="bg-th-table-head text-th-table-head-fg px-4 py-3.5 grid gap-4 text-sm font-bold items-center border-b border-th-border"
                          style={{ gridTemplateColumns: gridCols }}
                        >
                          <div className="text-center">Include?</div>
                          <div className="min-w-0">Name in Your File</div>
                          <div className="min-w-0">Official Account Match</div>
                          {enabledTargets.map((target) => {
                            const entry = dbComparisonByTargetId[target.id];
                            return (
                              <div key={target.id} className="text-right min-w-0">
                                <div className="whitespace-nowrap">
                                  FY {target.targetYear} (Col {target.colLetter})
                                </div>
                                {entry?.isVerifyOnly && (
                                  <div className="text-xs font-semibold opacity-80 whitespace-nowrap">
                                    Verify vs DB
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>

                        <div className="divide-y divide-th-border">
                          {visibleRows.map((row) => {
                            const isDup = Boolean(
                              row.included && row.selectedLineItemId && duplicateLineItemIds.has(row.selectedLineItemId)
                            );
                            const dupInfo = isDup ? duplicateInfoByRowId[row.rowId] : undefined;
                            const isPulsed = highlightedRowId === row.rowId;
                            const isDropdownOpen = activeDropdownRowId === row.rowId;
                            const matchType = row.userModified ? 'exact' : row.recommendation.matchType;
                            const selectedDef = row.selectedLineItemId
                              ? itemById.get(row.selectedLineItemId)
                              : undefined;
                            const labelDiffersFromOfficial =
                              Boolean(selectedDef) &&
                              normalizeAliasKey(row.rawName) !== normalizeAliasKey(selectedDef!.name);
                            const variantLookupKey = normalizeAliasKey(
                              selectedDef?.name || row.recommendation.bestItem?.name || row.rawName
                            );
                            const sameNameVariants =
                              sameNameVariantsByNormName.get(variantLookupKey) || [];

                            return (
                              <div
                                key={row.rowId}
                                id={`import-row-${row.rowId}`}
                                className={`px-4 py-3.5 grid gap-4 items-start transition-colors scroll-mt-24 ${
                                  !row.included
                                    ? 'opacity-60 bg-th-subtle/50'
                                    : isDup
                                    ? 'bg-amber-500/12 dark:bg-amber-500/15 border-l-4 border-l-amber-500 hover:bg-amber-500/18 dark:hover:bg-amber-500/20'
                                    : 'hover:bg-th-subtle/40'
                                } ${isPulsed ? 'ring-2 ring-inset ring-amber-400 bg-amber-500/25' : ''} ${
                                  isDropdownOpen ? 'relative z-40' : 'relative z-auto'
                                }`}
                                style={{ gridTemplateColumns: gridCols }}
                              >
                                {/* Large Senior-Friendly Include / Skip Toggle Button */}
                                <div className="flex justify-center pt-0.5">
                                  <label
                                    className={`inline-flex items-center justify-center gap-2 px-3 py-2 min-h-[42px] w-full rounded-xl border-2 text-sm font-bold cursor-pointer select-none transition-colors ${
                                      !row.included
                                        ? 'bg-th-surface border-th-border text-th-muted hover:border-th-border-strong'
                                        : isDup
                                        ? 'bg-amber-500/15 border-amber-500/60 text-amber-900 dark:text-amber-100 hover:bg-amber-500/25'
                                        : 'bg-th-subtle border-th-border-strong text-th-text hover:bg-th-subtle-hover'
                                    }`}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={row.included}
                                      onChange={() => handleToggleRowInclude(row.rowId)}
                                      className="w-4 h-4 cursor-pointer accent-th-accent shrink-0"
                                      aria-label={`Include row ${row.excelRowNumber}`}
                                    />
                                    <span>{row.included ? 'Include' : 'Skip'}</span>
                                  </label>
                                </div>

                                {/* Raw Excel text & clean metadata */}
                                <div className="min-w-0 pt-0.5 space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              className={`text-base sm:text-lg font-bold break-words leading-snug ${
                                row.included &&
                                (row.isLumpedDepreciation ||
                                  row.selectedLineItemId === AGGREGATED_ACCUMULATED_DEPRECIATION_ID)
                                  ? 'text-red-700 dark:text-red-400'
                                  : isDup
                                  ? 'text-amber-950 dark:text-amber-100'
                                  : 'text-th-text'
                              }`}
                            >
                              {row.rawName}
                            </span>
                            {isDup && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500 text-slate-950 text-[11px] font-extrabold uppercase tracking-wider shrink-0">
                                <AlertTriangle className="w-3 h-3 shrink-0" />
                                <span>
                                  Duplicate{duplicateGroups.length > 1 && dupInfo ? ` #${dupInfo.groupNumber}` : ''}
                                </span>
                              </span>
                            )}
                          </div>
                          <div className="text-sm text-th-muted font-medium flex flex-wrap items-center gap-x-2 gap-y-1">
                            <span>Excel Row {row.excelRowNumber}</span>
                            {row.sourceColLetter && row.sourceColLetter !== '?' && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span>Col {row.sourceColLetter}</span>
                              </>
                            )}
                            {row.accountCode && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span className="font-mono font-semibold text-th-text">
                                  Code {row.accountCode}
                                </span>
                              </>
                            )}
                          </div>

                          {!row.included && row.isSummaryRow && row.summaryReason && (
                            <div className="text-sm font-semibold text-th-muted">
                              Skipped automatically: {row.summaryReason}
                            </div>
                          )}

                          {/* Clear plain-language match status (no pill sandwiches) */}
                          {row.included && !row.selectedLineItemId && (
                            <div className="inline-flex items-center gap-1.5 text-sm font-bold text-rose-700 dark:text-rose-300">
                              <AlertCircle className="w-4 h-4 shrink-0" />
                              <span>Needs an official account — choose on the right</span>
                            </div>
                          )}
                          {row.included &&
                            (row.isLumpedDepreciation ||
                              row.selectedLineItemId === AGGREGATED_ACCUMULATED_DEPRECIATION_ID) && (
                              <div className="inline-flex items-center gap-1.5 text-sm font-bold text-red-700 dark:text-red-400">
                                <AlertTriangle className="w-4 h-4 shrink-0" />
                                <span>
                                  Temporary Aggregated Notice (red/bold in FS after PPE) — excludes division from Consolidated FS
                                </span>
                              </div>
                            )}
                          {row.included &&
                            !(
                              row.isLumpedDepreciation ||
                              row.selectedLineItemId === AGGREGATED_ACCUMULATED_DEPRECIATION_ID
                            ) &&
                            row.selectedLineItemId &&
                            matchType === 'suggested' && (
                            <div className="inline-flex items-center gap-1.5 text-sm font-bold text-amber-800 dark:text-amber-300">
                              <Sparkles className="w-4 h-4 shrink-0" />
                              <span>Best guess ({row.recommendation.confidence}%) — please verify</span>
                            </div>
                          )}
                          {row.included &&
                            !(
                              row.isLumpedDepreciation ||
                              row.selectedLineItemId === AGGREGATED_ACCUMULATED_DEPRECIATION_ID
                            ) &&
                            row.selectedLineItemId &&
                            matchType === 'alias' && (
                            <div className="inline-flex items-center gap-1.5 text-sm font-bold text-emerald-700 dark:text-emerald-300">
                              <BookmarkCheck className="w-4 h-4 shrink-0" />
                              <span>Matched using your saved wording</span>
                            </div>
                          )}
                          {row.included &&
                            !(
                              row.isLumpedDepreciation ||
                              row.selectedLineItemId === AGGREGATED_ACCUMULATED_DEPRECIATION_ID
                            ) &&
                            row.selectedLineItemId &&
                            (matchType === 'exact' || matchType === 'normalized') && (
                              <div className="inline-flex items-center gap-1.5 text-sm font-bold text-emerald-700 dark:text-emerald-300">
                                <Check className="w-4 h-4 shrink-0" />
                                <span>Matched automatically</span>
                              </div>
                            )}
                          {row.included && row.aggregationNote && (
                            <div className="rounded-lg bg-sky-500/10 border border-sky-500/30 px-2.5 py-1.5 text-xs sm:text-sm font-semibold text-sky-900 dark:text-sky-200 space-y-1.5">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <span>{row.aggregationNote}</span>
                                {row.aggregationBreakdown && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setExpandedAggRowIds((prev) => ({
                                        ...prev,
                                        [row.rowId]: !prev[row.rowId],
                                      }))
                                    }
                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-sky-500/20 hover:bg-sky-500/30 text-sky-950 dark:text-sky-100 text-xs font-bold cursor-pointer shrink-0 transition-colors"
                                  >
                                    {expandedAggRowIds[row.rowId] ? (
                                      <>
                                        <ChevronUp className="w-3.5 h-3.5" />
                                        <span>Hide Breakdown</span>
                                      </>
                                    ) : (
                                      <>
                                        <ChevronDown className="w-3.5 h-3.5" />
                                        <span>
                                          View Breakdown ({row.aggregationBreakdown.children.length} sub-items)
                                        </span>
                                      </>
                                    )}
                                  </button>
                                )}
                              </div>
                              {expandedAggRowIds[row.rowId] && row.aggregationBreakdown && (
                                <div className="mt-1.5 pt-1.5 border-t border-sky-500/25 space-y-1 text-xs font-medium">
                                  {!row.aggregationBreakdown.isParentless && (
                                    <div className="flex items-center justify-between gap-2 text-sky-950 dark:text-sky-100">
                                      <span className="truncate">
                                        {row.aggregationBreakdown.parentRawName} (Original parent)
                                      </span>
                                      <span className="font-mono font-bold tabular-nums shrink-0">
                                        {enabledTargets
                                          .map((t) => {
                                            const v =
                                              row.aggregationBreakdown!.parentOwnAmountsByTargetId[
                                                t.id
                                              ];
                                            return `FY ${t.targetYear}: ₱${formatAccounting(v ?? 0)}`;
                                          })
                                          .join(' · ')}
                                      </span>
                                    </div>
                                  )}
                                  {row.aggregationBreakdown.children.map((ch, cIdx) => (
                                    <div
                                      key={`${row.rowId}-ch-${cIdx}`}
                                      className="flex items-center justify-between gap-2 text-sky-900/90 dark:text-sky-200/90 pl-2"
                                    >
                                      <span className="truncate">
                                        {ch.excelRowNumber ? `Row ${ch.excelRowNumber}: ` : ''}
                                        {ch.cleanedName || ch.rawName}
                                      </span>
                                      <span className="font-mono tabular-nums shrink-0">
                                        {enabledTargets
                                          .map((t) => {
                                            const v = ch.amountsByTargetId[t.id];
                                            return `FY ${t.targetYear}: ₱${formatAccounting(v ?? 0)}`;
                                          })
                                          .join(' · ')}
                                      </span>
                                    </div>
                                  ))}
                                  <div className="flex items-center justify-between gap-2 pt-1 border-t border-sky-500/25 font-bold text-sky-950 dark:text-sky-100">
                                    <span>Resolved Total</span>
                                    <span className="font-mono tabular-nums shrink-0">
                                      {enabledTargets
                                        .map((t) => {
                                          const v = row.amountsByTargetId[t.id];
                                          return `FY ${t.targetYear}: ₱${formatAccounting(v ?? 0)}`;
                                        })
                                        .join(' · ')}
                                    </span>
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                          {isDup && dupInfo && (
                            <div className="rounded-lg bg-amber-500/15 border border-amber-500/40 px-2.5 py-1.5 text-sm font-bold text-amber-900 dark:text-amber-200 flex flex-wrap items-center gap-x-2 gap-y-1">
                              <span className="inline-flex items-center gap-1.5">
                                <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                                <span>
                                  Duplicate with{' '}
                                  {dupInfo.peers.map((peer, idx) => (
                                    <React.Fragment key={peer.rowId}>
                                      {idx > 0 && ', '}
                                      <button
                                        type="button"
                                        onClick={() => jumpToAccountRow(peer.rowId)}
                                        className="underline decoration-amber-500/70 underline-offset-2 hover:text-amber-700 dark:hover:text-amber-100 cursor-pointer font-extrabold"
                                      >
                                        Excel Row {peer.excelRowNumber}
                                        {peer.sourceColLetter && peer.sourceColLetter !== '?'
                                          ? ` (${peer.sourceColLetter})`
                                          : ''}
                                      </button>
                                    </React.Fragment>
                                  ))}
                                </span>
                              </span>
                              {filterMode !== 'duplicates' && (
                                <button
                                  type="button"
                                  onClick={() => setFilterMode('duplicates')}
                                  className="text-xs px-2 py-0.5 rounded bg-amber-500/25 hover:bg-amber-500/40 text-amber-950 dark:text-amber-100 font-bold cursor-pointer transition-colors"
                                >
                                  Compare Side-by-Side
                                </button>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Official Line Item Selector + Alternative Recommendation Chips */}
                        <div className="min-w-0 space-y-2 pt-0.5">
                          <SearchableLineItemSelect
                            lineItems={encodableItems}
                            selectedItemId={row.selectedLineItemId}
                            rawText={selectedDef ? selectedDef.name : ''}
                            isInvalid={row.included && !row.isSummaryRow && !row.selectedLineItemId}
                            isDuplicate={isDup}
                            onSelectItem={(itemId) => handleSelectRowLineItem(row.rowId, itemId)}
                            onOpenStateChange={(open) => handleRowDropdownOpenChange(row.rowId, open)}
                            placement="auto"
                            usePortal
                            compact
                            placeholder="Click or type to choose official account..."
                          />

                          {/* Explicit placement option when multiple official line items share the same name (e.g. Miscellaneous Income) */}
                          {row.included && !row.isSummaryRow && sameNameVariants.length > 1 && (
                            <div className="rounded-xl bg-th-subtle/80 border border-th-border-strong p-2.5 space-y-1.5">
                              <div className="text-xs font-bold text-th-text flex items-center justify-between gap-2">
                                <span>
                                  Choose which &quot;{selectedDef?.name || sameNameVariants[0].name}&quot; line item to add to:
                                </span>
                                <span className="text-[11px] font-semibold text-th-muted shrink-0">
                                  {sameNameVariants.length} placements
                                </span>
                              </div>
                              <div className="flex flex-col gap-1.5">
                                {sameNameVariants.map((variant, vIdx) => {
                                  const isChosen = row.selectedLineItemId === variant.id;
                                  const placementPath = formatItemPlacementPath(variant);
                                  return (
                                    <button
                                      key={variant.id}
                                      type="button"
                                      onClick={() => handleSelectRowLineItem(row.rowId, variant.id)}
                                      className={`w-full text-left px-2.5 py-2 rounded-lg border text-xs sm:text-sm font-semibold flex items-center justify-between gap-2 transition-colors cursor-pointer ${
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
                                        <span>{placementPath}</span>
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

                          {/* Quick recommendation buttons for unmatched rows */}
                          {row.included &&
                            !row.isSummaryRow &&
                            !row.selectedLineItemId &&
                            row.recommendation.alternatives.length > 0 && (
                              <div className="flex flex-wrap items-center gap-2 text-sm">
                                <span className="text-th-muted font-bold">Quick Suggestions:</span>
                                {row.recommendation.alternatives.map((alt) => (
                                  <button
                                    key={alt.item.id}
                                    type="button"
                                    title={`${alt.item.name} (${alt.item.subsection} › ${alt.item.group}${
                                      alt.item.subgroup ? ` › ${alt.item.subgroup}` : ''
                                    })`}
                                    onClick={() => handleSelectRowLineItem(row.rowId, alt.item.id)}
                                    className="px-3 py-1.5 min-h-[38px] rounded-xl bg-th-subtle hover:bg-th-subtle-hover border-2 border-th-border-strong text-th-text font-bold cursor-pointer text-left"
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
                              <label className="inline-flex items-center gap-2.5 py-1 text-sm font-semibold text-th-muted hover:text-th-text cursor-pointer select-none">
                                <input
                                  type="checkbox"
                                  checked={Boolean(rememberAliasMap[row.rowId])}
                                  onChange={(e) =>
                                    setRememberAliasMap((m) => ({
                                      ...m,
                                      [row.rowId]: e.target.checked,
                                    }))
                                  }
                                  className="w-4 h-4 accent-th-accent cursor-pointer shrink-0"
                                />
                                <span>Remember &quot;{row.rawName}&quot; for future uploads</span>
                              </label>
                            )}
                        </div>

                        {/* Year Amounts */}
                        {enabledTargets.map((target) => {
                          const val = row.amountsByTargetId[target.id];
                          const dbEntry = dbComparisonByTargetId[target.id];
                          const rowDbDiff =
                            row.included && row.selectedLineItemId && dbEntry?.comparison.hasExistingData
                              ? dbEntry.comparison.diffByLineItemId[row.selectedLineItemId]
                              : undefined;
                          const isZeroVal = val !== null && val !== undefined && Math.abs(val) < 0.005;
                          return (
                            <div
                              key={target.id}
                              className="min-w-0 text-right pt-2 space-y-0.5"
                            >
                              <div
                                className={`font-mono text-base font-bold tabular-nums whitespace-nowrap ${
                                  val === null || val === undefined || isZeroVal
                                    ? 'text-th-muted'
                                    : 'text-th-text'
                                }`}
                              >
                                {val !== null && val !== undefined ? formatAccounting(val) : '—'}
                              </div>
                              {rowDbDiff && (
                                <div className="text-xs font-mono font-semibold text-amber-800 dark:text-amber-300 tabular-nums whitespace-nowrap">
                                  DB: ₱{formatAccounting(rowDbDiff.databaseAmount)}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()
            )}
          </section>
        </div>

        {/* Pinned Footer Actions */}
        <div className="px-6 py-4 bg-th-subtle border-t border-th-border flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
          <div className="text-sm sm:text-base text-th-text font-semibold">
            {enabledTargets.length === 0
              ? 'Select at least one year column above to continue.'
              : targetsToSave.length === 0
              ? `All selected columns (${verifyOnlyTargets.map((t) => `FY ${t.targetYear}`).join(' & ')}) are set to Verify Only — uncheck "Verify only" above if you want to save updates.`
              : verifyOnlyTargets.length > 0
              ? `Ready to save ${stats.exactOrAlias + stats.suggested} matched accounts for ${targetsToSave
                  .map((t) => `FY ${t.targetYear}`)
                  .join(' & ')} (${verifyOnlyTargets.map((t) => `FY ${t.targetYear}`).join(' & ')} checked against database).`
              : targetsToSave.length > 1
              ? `Ready to save ${stats.exactOrAlias + stats.suggested} matched accounts for ${targetsToSave
                  .map((t) => `FY ${t.targetYear}`)
                  .join(' & ')}.`
              : `Target: FY ${targetsToSave[0].targetYear} (${stats.includedCount} included rows).`}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-3 min-h-[48px] text-base font-bold text-th-text bg-th-surface hover:bg-th-subtle-hover border-2 border-th-border-strong rounded-xl cursor-pointer transition-colors"
            >
              Cancel
            </button>

            {singleTargetMatchesSelected && activeYearTarget ? (
              <>
                <button
                  type="button"
                  disabled={stats.exactOrAlias + stats.suggested === 0}
                  onClick={handleSaveAllEnabledYears}
                  className="px-5 py-3 min-h-[48px] text-base font-bold text-th-text bg-th-surface hover:bg-th-subtle-hover disabled:opacity-50 border-2 border-th-border-strong rounded-xl cursor-pointer transition-colors"
                >
                  Save Directly (FY {selectedYear})
                </button>
                <button
                  type="button"
                  disabled={stats.includedCount === 0}
                  onClick={() => handleStageTargetToBatch(activeYearTarget)}
                  className="px-6 py-3 min-h-[48px] text-base font-bold text-th-accent-fg bg-th-accent hover:bg-th-accent-hover disabled:opacity-50 rounded-xl shadow-sm cursor-pointer transition-colors"
                >
                  Load {stats.includedCount} Rows into Form Table
                </button>
              </>
            ) : (
              <>
                {activeYearTarget && targetsToSave.length > 0 && (
                  <button
                    type="button"
                    disabled={stats.includedCount === 0}
                    onClick={() => handleStageTargetToBatch(activeYearTarget)}
                    className="px-5 py-3 min-h-[48px] text-base font-bold text-th-text bg-th-surface hover:bg-th-subtle-hover disabled:opacity-50 border-2 border-th-border-strong rounded-xl cursor-pointer transition-colors"
                  >
                    Load FY {activeYearTarget.targetYear} into Form Table
                  </button>
                )}
                <button
                  type="button"
                  disabled={targetsToSave.length === 0 || stats.exactOrAlias + stats.suggested === 0}
                  onClick={handleSaveAllEnabledYears}
                  className="px-6 py-3 min-h-[48px] text-base font-bold text-th-accent-fg bg-th-accent hover:bg-th-accent-hover disabled:opacity-50 rounded-xl shadow-sm cursor-pointer transition-colors"
                >
                  {targetsToSave.length > 0
                    ? `Save Matched Rows (${targetsToSave.map((t) => `FY ${t.targetYear}`).join(' & ')})`
                    : 'Verify Only Mode'}
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Prompt Dialog for Lumped Accumulated Depreciation */}
      {isLumpedDepPromptOpen && lumpedDepRows.length > 0 && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/65 backdrop-blur-xs">
          <div className="w-full max-w-xl bg-th-surface border-2 border-red-400 dark:border-red-700 rounded-2xl shadow-2xl p-6 space-y-4">
            <div className="flex items-start gap-3.5">
              <div className="p-3 rounded-xl bg-red-100 dark:bg-red-950/80 text-red-700 dark:text-red-300 border border-red-300 dark:border-red-800 shrink-0">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h4 className="text-xl font-bold text-red-700 dark:text-red-300">
                  Temporary Notice: Aggregated Accumulated Depreciation
                </h4>
                <p className="text-base text-th-muted mt-1 leading-relaxed">
                  This spreadsheet reports combined Accumulated Depreciation instead of listing depreciation for each individual PPE account:
                </p>
              </div>
            </div>

            <div className="bg-th-subtle border-2 border-th-border-strong rounded-xl p-4 space-y-2.5">
              {lumpedDepRows.map((r) => (
                <div key={r.rowId} className="flex flex-wrap items-center justify-between gap-2 text-base">
                  <div className="min-w-0">
                    <span className="font-bold text-red-700 dark:text-red-400">
                      Row {r.excelRowNumber}: &quot;{r.rawName}&quot;
                    </span>
                    <span className="ml-2 text-sm font-bold text-red-700 dark:text-red-300">
                      (Temporarily mapped to Aggregated Accumulated Depreciation)
                    </span>
                  </div>
                  <span className="font-mono font-bold text-th-text tabular-nums">
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

            <div className="p-4 rounded-xl bg-red-50 dark:bg-red-950/40 border-2 border-red-200 dark:border-red-800 text-base text-red-950 dark:text-red-100 leading-relaxed space-y-2">
              <p>
                <strong>How this is handled:</strong> {lumpedDepRows.length > 1 ? 'These rows were' : 'This row was'} temporarily mapped to <strong className="text-red-700 dark:text-red-300">Aggregated Accumulated Depreciation</strong> and will appear in <strong>red, bold</strong> as a notice after all PPE items and above <em>Property, Plant, and Equipment (Net)</em> in the divisional Statement of Financial Position.
              </p>
              <p className="text-sm text-red-800 dark:text-red-300 font-bold">
                Consolidation Exclusion: Any division carrying Aggregated Accumulated Depreciation is automatically excluded from Consolidated Financial Statements and the Consolidated Division Matrix until a per-PPE breakdown is provided.
              </p>
            </div>

            <div className="flex justify-end pt-1">
              <button
                type="button"
                onClick={() => {
                  const lumpedKey = `${fileName}::${selectedSheetName}::${lumpedDepRows
                    .map((r) => r.excelRowNumber)
                    .join(',')}`;
                  setDismissedLumpedKey(lumpedKey);
                  setIsLumpedDepPromptOpen(false);
                }}
                className="px-6 py-3 min-h-[48px] text-base font-bold text-th-accent-fg bg-th-accent hover:bg-th-accent-hover rounded-xl shadow-sm cursor-pointer transition-colors"
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
