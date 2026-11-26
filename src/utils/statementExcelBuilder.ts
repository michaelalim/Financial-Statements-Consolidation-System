import { FinancialStatementType } from '../components/FinancialStatementSidebar';
import { AGGREGATED_ACCUMULATED_DEPRECIATION_ID } from '../data/defaultLineItems';
import { Division, FinancialDataStore, LineItemDefinition } from '../types/fs';
import { BudgetComparisonSummary } from './budgetComparisonCalculations';
import { calculateReport } from './calculations';
import { CashFlowsSummary } from './cashFlowCalculations';
import { NetAssetsSummary } from './netAssetsCalculations';
import {
  ExcelCellSpec,
  ExcelColumnSpec,
  ExcelMergeSpec,
  exportA4ExcelWorkbook,
} from './excelExport';

type FSReport = ReturnType<typeof calculateReport>;

export interface StatementExcelExportParams {
  mode: 'divisional' | 'consolidated';
  selectedStatement: FinancialStatementType;
  selectedYear: string;
  priorYear: string;
  showComparative: boolean;
  isCondensed: boolean;
  hideZeroRows: boolean;
  searchQuery: string;
  divisionName?: string;
  divisionsReportingCount?: number;
  lineItems: LineItemDefinition[];
  statementLineItems: LineItemDefinition[];
  reportCurrent: FSReport;
  reportPrior: FSReport;
  cashFlowsSummaryCurrent: CashFlowsSummary;
  cashFlowsSummaryPrior: CashFlowsSummary;
  netAssetsSummaryCurrent: NetAssetsSummary;
  netAssetsSummaryPrior: NetAssetsSummary;
  budgetComparisonSummary: BudgetComparisonSummary;
  budgetComparisonNotes: Record<string, string>;
  condensedNotes: Record<string, string>;
  hasAggregatedDep?: boolean;
  excludedDivisionsCurr?: Division[];
  sectionsHierarchy: {
    [subsection: string]: {
      [group: string]: {
        [subgroup: string]: LineItemDefinition[];
      };
    };
  };
}

const numCell = (
  val: number,
  opts: Partial<ExcelCellSpec> = {}
): ExcelCellSpec => ({
  value: Math.abs(val) < 0.005 ? 0 : Math.round(val * 100) / 100,
  isNumber: true,
  align: 'right',
  ...opts,
});

const textCell = (
  value: string,
  opts: Partial<ExcelCellSpec> = {}
): ExcelCellSpec => ({
  value,
  isNumber: false,
  align: 'left',
  wrapText: true,
  ...opts,
});

const sumItemsNet = (items: LineItemDefinition[], report: FSReport): number =>
  items.reduce((sum, item) => {
    const v = report.values[item.id] || 0;
    return sum + (item.isContra ? -v : v);
  }, 0);

const sumSubgroupsNet = (
  subgroups: { [subgroup: string]: LineItemDefinition[] },
  report: FSReport
): number =>
  Object.values(subgroups).reduce((sum, items) => sum + sumItemsNet(items, report), 0);

export const exportStatementToA4Excel = (params: StatementExcelExportParams): void => {
  const {
    mode,
    selectedStatement,
    selectedYear,
    priorYear,
    showComparative,
    isCondensed,
    hideZeroRows,
    searchQuery,
    divisionName = '',
    divisionsReportingCount = 0,
    reportCurrent,
    reportPrior,
    statementLineItems,
    cashFlowsSummaryCurrent,
    cashFlowsSummaryPrior,
    netAssetsSummaryCurrent,
    netAssetsSummaryPrior,
    budgetComparisonSummary,
    budgetComparisonNotes,
    condensedNotes,
    hasAggregatedDep = false,
    sectionsHierarchy,
  } = params;

  const q = searchQuery.toLowerCase().trim();
  const isItemVisible = (item: LineItemDefinition): boolean => {
    if (mode === 'consolidated' && item.id === AGGREGATED_ACCUMULATED_DEPRECIATION_ID) {
      return false;
    }
    if (q) {
      const matches =
        item.name.toLowerCase().includes(q) ||
        item.group.toLowerCase().includes(q) ||
        (item.subgroup && item.subgroup.toLowerCase().includes(q));
      if (!matches) return false;
    }
    const valCurr = reportCurrent.values[item.id] || 0;
    const valPrior = reportPrior.values[item.id] || 0;
    const isNonZero = valCurr !== 0 || (showComparative && valPrior !== 0);
    if (item.id === AGGREGATED_ACCUMULATED_DEPRECIATION_ID) {
      return isNonZero;
    }
    if (!hideZeroRows) return true;
    return isNonZero;
  };

  const isGroupVisible = (subgroups: { [subgroup: string]: LineItemDefinition[] }): boolean =>
    Object.values(subgroups).some((items) => items.some(isItemVisible));

  const isSubgroupVisible = (items: LineItemDefinition[]): boolean =>
    items.some(isItemVisible);

  const safePrefix =
    mode === 'consolidated'
      ? 'DepEd_Region_VI_Consolidated'
      : divisionName.replace(/\s+/g, '_') || 'Division';

  // 1. BUDGET COMPARISON EXPORT (6-Column A4 Layout)
  if (selectedStatement === 'budget_comparison') {
    const columns: ExcelColumnSpec[] = [
      { wch: 36 }, // Particulars
      { wch: 8 },  // Notes
      { wch: 16 }, // Original
      { wch: 16 }, // Final
      { wch: 16 }, // Actual
      { wch: 16 }, // Difference
    ];
    const rows: (ExcelCellSpec | string | number | null)[][] = [];
    const merges: ExcelMergeSpec[] = [];
    const rowHeights: (number | undefined)[] = [];

    const titlePrefix = mode === 'consolidated' ? 'Consolidated ' : '';
    const headerLines = [
      'Department of Education',
      'Regional Office No. VI',
      ...(mode === 'divisional' && divisionName ? [divisionName] : []),
      `${titlePrefix}Statement of Comparison of Budget and Actual Amounts`,
      'All Funds',
      `For the Year Ended December 31, ${selectedYear}`,
      ...(mode === 'consolidated' ? [`Consolidating ${divisionsReportingCount} Divisions`] : []),
    ];

    headerLines.forEach((line, idx) => {
      const rIdx = rows.length;
      rows.push([textCell(line, { bold: true, align: 'center', fontSize: idx <= 3 ? 12 : 11 })]);
      merges.push({ startRow: rIdx, startCol: 0, endRow: rIdx, endCol: 5 });
      rowHeights[rIdx] = 19;
    });

    rows.push([]);
    rowHeights[rows.length - 1] = 10;

    // 2-row table header
    const h1 = rows.length;
    rows.push([
      textCell('Particulars', { bold: true, align: 'center', allThinBorders: true, fillGray: true }),
      textCell('', { bold: true, align: 'center', allThinBorders: true, fillGray: true }),
      textCell('Budgeted Amount', { bold: true, align: 'center', allThinBorders: true, fillGray: true }),
      textCell('', { bold: true, align: 'center', allThinBorders: true, fillGray: true }),
      textCell('Actual Amounts on Comparable Basis', { bold: true, align: 'center', allThinBorders: true, fillGray: true }),
      textCell('Difference Final Budget and Actual', { bold: true, align: 'center', allThinBorders: true, fillGray: true }),
    ]);
    rowHeights[h1] = 22;

    const h2 = rows.length;
    rows.push([
      textCell('', { bold: true, align: 'center', allThinBorders: true, fillGray: true }),
      textCell('', { bold: true, align: 'center', allThinBorders: true, fillGray: true }),
      textCell('Original', { bold: true, align: 'center', allThinBorders: true, fillGray: true }),
      textCell('Final', { bold: true, align: 'center', allThinBorders: true, fillGray: true }),
      textCell('', { bold: true, align: 'center', allThinBorders: true, fillGray: true }),
      textCell('', { bold: true, align: 'center', allThinBorders: true, fillGray: true }),
    ]);
    rowHeights[h2] = 22;

    merges.push(
      { startRow: h1, startCol: 0, endRow: h2, endCol: 1 },
      { startRow: h1, startCol: 2, endRow: h1, endCol: 3 },
      { startRow: h1, startCol: 4, endRow: h2, endCol: 4 },
      { startRow: h1, startCol: 5, endRow: h2, endCol: 5 }
    );

    const receiptRows = q
      ? budgetComparisonSummary.receipts.filter((r) => r.name.toLowerCase().includes(q))
      : budgetComparisonSummary.receipts;
    const paymentRows = q
      ? budgetComparisonSummary.payments.filter((r) => r.name.toLowerCase().includes(q))
      : budgetComparisonSummary.payments;

    rows.push([
      textCell('RECEIPTS', { bold: true }),
      textCell('Notes', { bold: true, align: 'center' }),
    ]);
    receiptRows.forEach((r) => {
      rows.push([
        textCell(r.name, { indent: 1 }),
        textCell(budgetComparisonNotes[r.id] || '', { align: 'center' }),
        numCell(r.original),
        numCell(r.final),
        numCell(r.actual),
        numCell(r.difference),
      ]);
    });
    rows.push([
      textCell('Total Receipts', { bold: true, indent: 1 }),
      textCell(''),
      numCell(budgetComparisonSummary.totalReceipts.original, { bold: true, topBorder: 'thin', bottomBorder: 'thin' }),
      numCell(budgetComparisonSummary.totalReceipts.final, { bold: true, topBorder: 'thin', bottomBorder: 'thin' }),
      numCell(budgetComparisonSummary.totalReceipts.actual, { bold: true, topBorder: 'thin', bottomBorder: 'thin' }),
      numCell(budgetComparisonSummary.totalReceipts.difference, { bold: true, topBorder: 'thin', bottomBorder: 'thin' }),
    ]);

    rows.push([]);
    rowHeights[rows.length - 1] = 10;

    rows.push([textCell('PAYMENTS', { bold: true })]);
    paymentRows.forEach((r) => {
      rows.push([
        textCell(r.name, { indent: 1 }),
        textCell(budgetComparisonNotes[r.id] || '', { align: 'center' }),
        numCell(r.original),
        numCell(r.final),
        numCell(r.actual),
        numCell(r.difference),
      ]);
    });
    rows.push([
      textCell('Total Payments', { bold: true, indent: 1 }),
      textCell(''),
      numCell(budgetComparisonSummary.totalPayments.original, { bold: true, topBorder: 'thin', bottomBorder: 'thin' }),
      numCell(budgetComparisonSummary.totalPayments.final, { bold: true, topBorder: 'thin', bottomBorder: 'thin' }),
      numCell(budgetComparisonSummary.totalPayments.actual, { bold: true, topBorder: 'thin', bottomBorder: 'thin' }),
      numCell(budgetComparisonSummary.totalPayments.difference, { bold: true, topBorder: 'thin', bottomBorder: 'thin' }),
    ]);

    rows.push([]);
    rowHeights[rows.length - 1] = 10;

    rows.push([
      textCell('NET RECEIPTS/PAYMENT', { bold: true, topBorder: 'thin', bottomBorder: 'double' }),
      textCell('', { topBorder: 'thin', bottomBorder: 'double' }),
      numCell(budgetComparisonSummary.netReceiptsPayments.original, { bold: true, topBorder: 'thin', bottomBorder: 'double' }),
      numCell(budgetComparisonSummary.netReceiptsPayments.final, { bold: true, topBorder: 'thin', bottomBorder: 'double' }),
      numCell(budgetComparisonSummary.netReceiptsPayments.actual, { bold: true, topBorder: 'thin', bottomBorder: 'double' }),
      numCell(budgetComparisonSummary.netReceiptsPayments.difference, { bold: true, topBorder: 'thin', bottomBorder: 'double' }),
    ]);

    exportA4ExcelWorkbook({
      fileName: `${safePrefix}_BUDGET_COMPARISON_${selectedYear}.xlsx`,
      sheetName: 'Budget vs Actual',
      rows,
      columns,
      rowHeights,
      merges,
      orientation: 'portrait',
      fontFamily: 'Times New Roman',
    });
    return;
  }

  // Document Title & Header Lines for Position, Performance, Cash Flows, Net Assets
  const stmtTitleBase =
    selectedStatement === 'cash_flows'
      ? isCondensed
        ? 'Condensed Statement of Cash Flows'
        : 'Detailed Statement of Cash Flows'
      : selectedStatement === 'performance'
      ? isCondensed
        ? 'Condensed Statement of Financial Performance'
        : 'Statement of Financial Performance'
      : selectedStatement === 'net_assets'
      ? 'Statement of Changes in Net Assets/Equity'
      : isCondensed
      ? 'Statement of Financial Position'
      : 'Detailed Statement of Financial Position';

  const stmtTitle =
    mode === 'consolidated' ? `Consolidated ${stmtTitleBase}` : stmtTitleBase;

  const dateLabel =
    selectedStatement === 'position'
      ? `As at December 31, ${selectedYear}`
      : `For the Year Ended December 31, ${selectedYear}`;

  const isCondensedPosition = selectedStatement === 'position' && isCondensed;
  const totalCols = isCondensedPosition
    ? showComparative
      ? 4
      : 3
    : showComparative
    ? 3
    : 2;

  const columns: ExcelColumnSpec[] = isCondensedPosition
    ? showComparative
      ? [{ wch: 48 }, { wch: 8 }, { wch: 19 }, { wch: 19 }]
      : [{ wch: 64 }, { wch: 10 }, { wch: 22 }]
    : showComparative
    ? [{ wch: 56 }, { wch: 19 }, { wch: 19 }]
    : [{ wch: 70 }, { wch: 22 }];

  const rows: (ExcelCellSpec | string | number | null)[][] = [];
  const merges: ExcelMergeSpec[] = [];
  const rowHeights: (number | undefined)[] = [];

  const headerLines = [
    'Department of Education',
    'Regional Office No. VI',
    ...(mode === 'divisional' && divisionName ? [divisionName] : []),
    stmtTitle,
    'All Funds',
    dateLabel,
    ...(mode === 'consolidated' ? [`Consolidating ${divisionsReportingCount} Divisions`] : []),
  ];

  headerLines.forEach((line, idx) => {
    const rIdx = rows.length;
    rows.push([textCell(line, { bold: true, align: 'center', fontSize: idx <= 3 ? 12 : 11 })]);
    merges.push({ startRow: rIdx, startCol: 0, endRow: rIdx, endCol: totalCols - 1 });
    rowHeights[rIdx] = 19;
  });

  rows.push([]);
  rowHeights[rows.length - 1] = 10;

  const pushStdRow = (
    label: string,
    currVal: number | null,
    priorVal: number | null,
    opts: {
      indent?: number;
      bold?: boolean;
      italic?: boolean;
      topBorder?: 'thin';
      bottomBorder?: 'thin' | 'double';
      note?: string;
    } = {}
  ) => {
    const labelCell = textCell(label, {
      indent: opts.indent,
      bold: opts.bold,
      italic: opts.italic,
    });
    const currCell =
      currVal === null
        ? textCell('', { topBorder: opts.topBorder, bottomBorder: opts.bottomBorder })
        : numCell(currVal, {
            bold: opts.bold,
            topBorder: opts.topBorder,
            bottomBorder: opts.bottomBorder,
          });
    const priorCell =
      priorVal === null
        ? textCell('', { topBorder: opts.topBorder, bottomBorder: opts.bottomBorder })
        : numCell(priorVal, {
            bold: opts.bold,
            topBorder: opts.topBorder,
            bottomBorder: opts.bottomBorder,
          });

    if (isCondensedPosition) {
      const noteCell = textCell(opts.note ?? '', {
        align: 'center',
        bold: Boolean(opts.note),
      });
      rows.push(
        showComparative
          ? [labelCell, noteCell, currCell, priorCell]
          : [labelCell, noteCell, currCell]
      );
    } else {
      rows.push(showComparative ? [labelCell, currCell, priorCell] : [labelCell, currCell]);
    }
  };

  // Column Header Row
  const colHeadIdx = rows.length;
  if (isCondensedPosition) {
    rows.push(
      showComparative
        ? [
            textCell('', { bold: true }),
            textCell('Note', { bold: true, align: 'center' }),
            textCell(selectedYear, { bold: true, align: 'center', bottomBorder: 'thin' }),
            textCell(priorYear, { bold: true, align: 'center', bottomBorder: 'thin' }),
          ]
        : [
            textCell('', { bold: true }),
            textCell('Note', { bold: true, align: 'center' }),
            textCell(selectedYear, { bold: true, align: 'center', bottomBorder: 'thin' }),
          ]
    );
  } else {
    const firstHeader =
      selectedStatement === 'position'
        ? 'ASSETS'
        : selectedStatement === 'performance'
        ? 'ACCOUNT TITLE'
        : selectedStatement === 'cash_flows'
        ? 'CASH FLOW ACTIVITY'
        : 'PARTICULARS';
    rows.push(
      showComparative
        ? [
            textCell(firstHeader, { bold: selectedStatement !== 'position' }),
            textCell(selectedYear, { bold: true, align: 'center', bottomBorder: 'thin' }),
            textCell(priorYear, { bold: true, align: 'center', bottomBorder: 'thin' }),
          ]
        : [
            textCell(firstHeader, { bold: selectedStatement !== 'position' }),
            textCell(selectedYear, { bold: true, align: 'center', bottomBorder: 'thin' }),
          ]
    );
  }
  rowHeights[colHeadIdx] = 22;

  // 2. STATEMENT OF FINANCIAL POSITION
  if (selectedStatement === 'position') {
    if (isCondensed) {
      pushStdRow('ASSETS', null, null, { bold: true });
      pushStdRow('Current Assets', null, null, { bold: true });
      if (sectionsHierarchy['Current Assets']) {
        Object.entries(sectionsHierarchy['Current Assets']).forEach(([groupName, subgroups]) => {
          if (hideZeroRows && !isGroupVisible(subgroups)) return;
          pushStdRow(
            groupName,
            sumSubgroupsNet(subgroups, reportCurrent),
            sumSubgroupsNet(subgroups, reportPrior),
            { indent: 1, note: condensedNotes[groupName] ?? '' }
          );
        });
      }
      pushStdRow('Total Current Assets', reportCurrent.totalCurrentAssets, reportPrior.totalCurrentAssets, {
        indent: 1,
        bold: true,
        topBorder: 'thin',
      });

      pushStdRow('Non-Current Assets', null, null, { bold: true });
      if (sectionsHierarchy['Non-Current Assets']) {
        Object.entries(sectionsHierarchy['Non-Current Assets']).forEach(([groupName, subgroups]) => {
          if (hideZeroRows && !isGroupVisible(subgroups)) return;
          pushStdRow(
            groupName,
            sumSubgroupsNet(subgroups, reportCurrent),
            sumSubgroupsNet(subgroups, reportPrior),
            { indent: 1, note: condensedNotes[groupName] ?? '' }
          );
        });
      }
      pushStdRow(
        'Total Non-Current Assets',
        reportCurrent.totalNonCurrentAssets,
        reportPrior.totalNonCurrentAssets,
        { indent: 1, bold: true, topBorder: 'thin' }
      );
      pushStdRow('TOTAL ASSETS', reportCurrent.totalAssets, reportPrior.totalAssets, {
        bold: true,
        topBorder: 'thin',
        bottomBorder: 'double',
      });

      rows.push([]);
      pushStdRow('LIABILITIES', null, null, { bold: true });
      pushStdRow('Current Liabilities', null, null, { bold: true });
      if (sectionsHierarchy['Current Liabilities']) {
        Object.entries(sectionsHierarchy['Current Liabilities']).forEach(([groupName, subgroups]) => {
          if (hideZeroRows && !isGroupVisible(subgroups)) return;
          pushStdRow(
            groupName,
            sumSubgroupsNet(subgroups, reportCurrent),
            sumSubgroupsNet(subgroups, reportPrior),
            { indent: 1, note: condensedNotes[groupName] ?? '' }
          );
        });
      }
      pushStdRow(
        'Total Current Liabilities',
        reportCurrent.totalCurrentLiabilities,
        reportPrior.totalCurrentLiabilities,
        { indent: 1, bold: true, topBorder: 'thin' }
      );
      pushStdRow('TOTAL LIABILITIES', reportCurrent.totalLiabilities, reportPrior.totalLiabilities, {
        bold: true,
        topBorder: 'thin',
        bottomBorder: 'thin',
      });
      pushStdRow(
        'Total Assets less Total Liabilities',
        reportCurrent.netAssetsEquity,
        reportPrior.netAssetsEquity,
        { bold: true, bottomBorder: 'double' }
      );

      rows.push([]);
      pushStdRow('NET ASSETS/EQUITY', null, null, { bold: true });
      pushStdRow('Accumulated Surplus/(Deficit)', reportCurrent.netAssetsEquity, reportPrior.netAssetsEquity);
      pushStdRow('Total Net Assets/Equity', reportCurrent.netAssetsEquity, reportPrior.netAssetsEquity, {
        bold: true,
        topBorder: 'thin',
        bottomBorder: 'double',
      });
    } else {
      // Detailed Statement of Financial Position
      const pushPositionItems = (items: LineItemDefinition[], indentLevel: number) => {
        const isAggregateContraGroup = items.some(
          (i) => i.subgroup === 'Other Receivables' || i.id === 'allowance_impairment_other_receivables'
        );
        const visibleItems: LineItemDefinition[] = [];
        let baseVisible = false;
        items.forEach((item) => {
          if (mode === 'consolidated' && item.id === AGGREGATED_ACCUMULATED_DEPRECIATION_ID) return;
          const valCurr = reportCurrent.values[item.id] || 0;
          const valPrior = reportPrior.values[item.id] || 0;
          const isNonZero = valCurr !== 0 || (showComparative && valPrior !== 0);

          if (item.id === AGGREGATED_ACCUMULATED_DEPRECIATION_ID) {
            if (isNonZero) visibleItems.push(item);
            return;
          }
          if (!item.isContra) {
            const itemVisible = !hideZeroRows || isNonZero;
            baseVisible = isAggregateContraGroup ? baseVisible || itemVisible : itemVisible;
            if (itemVisible) visibleItems.push(item);
          } else if (!hideZeroRows || isNonZero || baseVisible) {
            visibleItems.push(item);
          }
        });

        let runningBaseCurr = 0;
        let runningBasePrior = 0;
        let hasContra = false;

        visibleItems.forEach((item, idx) => {
          const valCurr = reportCurrent.values[item.id] || 0;
          const valPrior = reportPrior.values[item.id] || 0;
          const displayCurr = item.isContra && valCurr > 0 ? -valCurr : valCurr;
          const displayPrior = item.isContra && valPrior > 0 ? -valPrior : valPrior;

          if (!item.isContra) {
            if (isAggregateContraGroup) {
              runningBaseCurr += valCurr;
              runningBasePrior += valPrior;
            } else {
              runningBaseCurr = valCurr;
              runningBasePrior = valPrior;
            }
            hasContra = false;
          } else {
            runningBaseCurr -= valCurr;
            runningBasePrior -= valPrior;
            hasContra = true;
          }

          pushStdRow(item.name, displayCurr, displayPrior, {
            indent: indentLevel,
            bold: item.id === AGGREGATED_ACCUMULATED_DEPRECIATION_ID,
          });

          if (hasContra) {
            const nextItem = visibleItems[idx + 1];
            if (!nextItem || !nextItem.isContra) {
              pushStdRow('Net Value', runningBaseCurr, runningBasePrior, {
                indent: indentLevel,
              });
              hasContra = false;
              if (isAggregateContraGroup) {
                runningBaseCurr = 0;
                runningBasePrior = 0;
              }
            }
          }
        });
      };

      const renderPosSubsection = (subsectionName: string) => {
        const groups = sectionsHierarchy[subsectionName];
        if (!groups) return;
        Object.entries(groups).forEach(([groupName, subgroups]) => {
          if (hideZeroRows && !isGroupVisible(subgroups)) return;
          pushStdRow(
            groupName,
            sumSubgroupsNet(subgroups, reportCurrent),
            sumSubgroupsNet(subgroups, reportPrior),
            { indent: 1, bold: true }
          );
          Object.entries(subgroups).forEach(([subgroupName, items]) => {
            if (hideZeroRows && !isSubgroupVisible(items)) return;
            const showSubHeader = subgroupName !== 'General' && subgroupName !== groupName;
            if (showSubHeader) {
              pushStdRow(subgroupName, sumItemsNet(items, reportCurrent), sumItemsNet(items, reportPrior), {
                indent: 2,
                bold: false,
              });
            }
            pushPositionItems(items, showSubHeader ? 3 : 2);
          });
          if (mode === 'divisional' && groupName === 'Property, Plant and Equipment' && hasAggregatedDep) {
            pushStdRow(
              'Property, Plant and Equipment (Net)',
              sumSubgroupsNet(subgroups, reportCurrent),
              sumSubgroupsNet(subgroups, reportPrior),
              { indent: 2, bold: true, topBorder: 'thin' }
            );
          }
        });
      };

      pushStdRow('Current Assets', null, null, { bold: true });
      renderPosSubsection('Current Assets');
      pushStdRow('Total Current Assets', reportCurrent.totalCurrentAssets, reportPrior.totalCurrentAssets, {
        indent: 1,
        bold: true,
      });

      pushStdRow('Non-Current Assets', null, null, { bold: true });
      renderPosSubsection('Non-Current Assets');
      pushStdRow(
        'Total Non-Current Assets',
        reportCurrent.totalNonCurrentAssets,
        reportPrior.totalNonCurrentAssets,
        { indent: 1, bold: true }
      );
      pushStdRow('TOTAL ASSETS', reportCurrent.totalAssets, reportPrior.totalAssets, {
        bold: true,
        topBorder: 'thin',
        bottomBorder: 'double',
      });

      rows.push([]);
      pushStdRow('LIABILITIES', null, null, { bold: true });
      pushStdRow('Current Liabilities', null, null, { bold: true });
      renderPosSubsection('Current Liabilities');
      pushStdRow(
        'Total Current Liabilities',
        reportCurrent.totalCurrentLiabilities,
        reportPrior.totalCurrentLiabilities,
        { indent: 1, bold: true }
      );
      pushStdRow(
        'Total Non-Current Liabilities',
        reportCurrent.totalNonCurrentLiabilities,
        reportPrior.totalNonCurrentLiabilities,
        { indent: 1, bold: true }
      );
      pushStdRow('Total Liabilities', reportCurrent.totalLiabilities, reportPrior.totalLiabilities, {
        indent: 1,
        bold: true,
      });
      pushStdRow(
        'Total Assets less Total Liabilities',
        reportCurrent.netAssetsEquity,
        reportPrior.netAssetsEquity,
        { bold: true }
      );

      rows.push([]);
      pushStdRow('Net Assets/Equity', null, null, { bold: true });
      if (sectionsHierarchy['Net Assets/Equity']) {
        Object.entries(sectionsHierarchy['Net Assets/Equity']).forEach(([groupName, subgroups]) => {
          pushStdRow(
            groupName,
            sumSubgroupsNet(subgroups, reportCurrent),
            sumSubgroupsNet(subgroups, reportPrior),
            { indent: 1, bold: true }
          );
          Object.values(subgroups)
            .flat()
            .forEach((item) => {
              const vc = reportCurrent.values[item.id] || 0;
              const vp = reportPrior.values[item.id] || 0;
              if (hideZeroRows && vc === 0 && (!showComparative || vp === 0)) return;
              pushStdRow(item.name, vc, vp, { indent: 2 });
            });
        });
      }
      pushStdRow('Total Net Assets/Equity', reportCurrent.netAssetsEquity, reportPrior.netAssetsEquity, {
        bold: true,
        topBorder: 'thin',
        bottomBorder: 'double',
      });
    }
  } else if (selectedStatement === 'performance') {
    const perfItems = statementLineItems;
    const revItems = perfItems.filter((i) => i.section === 'REVENUE');
    const expItems = perfItems.filter((i) => i.section === 'EXPENSES');
    const trItems = perfItems.filter((i) => i.section === 'TRANSFERS');
    const trFromItems = trItems.filter((i) => !i.group.startsWith('Less:'));
    const trToItems = trItems.filter((i) => i.group.startsWith('Less:'));
    const nonOpItems = perfItems.filter((i) => i.section === 'NON_OPERATING');
    const lossItems = perfItems.filter((i) => i.section === 'LOSSES');

    const groupByKey = (items: LineItemDefinition[], getKey: (it: LineItemDefinition) => string) => {
      const map = new Map<string, LineItemDefinition[]>();
      items.forEach((it) => {
        const k = getKey(it);
        const list = map.get(k) || [];
        list.push(it);
        map.set(k, list);
      });
      return Array.from(map.entries());
    };

    const sumLossAbs = (report: FSReport) =>
      lossItems.reduce((sum, item) => sum + Math.abs(report.values[item.id] || 0), 0);
    const getNetTransfers = (report: FSReport) =>
      sumItemsNet(trFromItems, report) - sumItemsNet(trToItems, report);

    const pushPerfGroup = (groupName: string, items: LineItemDefinition[], showGroupTotal: boolean) => {
      const subgroups = groupByKey(items, (i) => i.subgroup || '__NONE__');
      const hasRealSubgroups = subgroups.some(([sg]) => sg !== '__NONE__');
      pushStdRow(
        groupName,
        isCondensed || !hasRealSubgroups ? sumItemsNet(items, reportCurrent) : null,
        isCondensed || !hasRealSubgroups ? sumItemsNet(items, reportPrior) : null,
        { indent: 1, bold: !isCondensed }
      );
      if (!isCondensed) {
        subgroups.forEach(([sgName, sgItems]) => {
          const vis = sgItems.filter(isItemVisible);
          if (hideZeroRows && vis.length === 0) return;
          const isSub = sgName !== '__NONE__';
          if (isSub) {
            pushStdRow(sgName, null, null, { indent: 2, bold: true });
          }
          vis.forEach((item) => {
            pushStdRow(
              item.name,
              reportCurrent.values[item.id] || 0,
              reportPrior.values[item.id] || 0,
              { indent: isSub ? 3 : 2 }
            );
          });
          if (isSub) {
            pushStdRow(`Total ${sgName}`, sumItemsNet(sgItems, reportCurrent), sumItemsNet(sgItems, reportPrior), {
              indent: 3,
              bold: true,
              topBorder: 'thin',
            });
          }
        });
        if (showGroupTotal) {
          pushStdRow(`Total ${groupName}`, sumItemsNet(items, reportCurrent), sumItemsNet(items, reportPrior), {
            indent: 1,
            bold: true,
            topBorder: 'thin',
          });
        }
      }
    };

    pushStdRow('REVENUE', null, null, { bold: true });
    groupByKey(revItems, (i) => i.group).forEach(([groupName, items]) => {
      if (hideZeroRows && items.filter(isItemVisible).length === 0) return;
      pushPerfGroup(groupName, items, groupName === 'Miscellaneous Income' || groupName === 'Gains');
    });
    pushStdRow('Total Revenue', sumItemsNet(revItems, reportCurrent), sumItemsNet(revItems, reportPrior), {
      indent: 1,
      bold: true,
      topBorder: 'thin',
    });

    pushStdRow('LESS: CURRENT OPERATING EXPENSES', null, null, { bold: true });
    groupByKey(expItems, (i) => i.group).forEach(([groupName, items]) => {
      if (hideZeroRows && items.filter(isItemVisible).length === 0) return;
      pushPerfGroup(groupName, items, true);
    });
    pushStdRow(
      'Current Operating Expenses',
      sumItemsNet(expItems, reportCurrent),
      sumItemsNet(expItems, reportPrior),
      { indent: 1, bold: true, topBorder: 'thin' }
    );

    pushStdRow(
      'Surplus/(Deficit) from Current Operations',
      sumItemsNet(revItems, reportCurrent) - sumItemsNet(expItems, reportCurrent),
      sumItemsNet(revItems, reportPrior) - sumItemsNet(expItems, reportPrior),
      { bold: true, topBorder: 'thin' }
    );

    if (trItems.some(isItemVisible)) {
      if (trFromItems.some(isItemVisible)) {
        pushStdRow('Financial Assistance/Subsidy from NGAs, LGUs, GOCCs', null, null, {
          indent: 1,
          bold: true,
        });
        if (!isCondensed) {
          trFromItems.filter(isItemVisible).forEach((item) => {
            pushStdRow(
              item.name,
              reportCurrent.values[item.id] || 0,
              reportPrior.values[item.id] || 0,
              { indent: 2 }
            );
          });
        }
        pushStdRow(
          'Total Financial Assistance/Subsidy from NGAs, LGUs, GOCCs',
          sumItemsNet(trFromItems, reportCurrent),
          sumItemsNet(trFromItems, reportPrior),
          { indent: 2, bold: true, topBorder: 'thin' }
        );
      }

      if (trToItems.some(isItemVisible)) {
        pushStdRow('Less: Financial Assistance/Subsidy to NGAs, LGUs, GOCCs', null, null, {
          indent: 1,
          bold: true,
        });
        if (!isCondensed) {
          trToItems.filter(isItemVisible).forEach((item) => {
            pushStdRow(
              item.name,
              reportCurrent.values[item.id] || 0,
              reportPrior.values[item.id] || 0,
              { indent: 2 }
            );
          });
        }
        pushStdRow(
          'Total Financial Assistance/Subsidy to NGAs, LGUs, GOCCs',
          sumItemsNet(trToItems, reportCurrent),
          sumItemsNet(trToItems, reportPrior),
          { indent: 2, bold: true, topBorder: 'thin' }
        );
      }

      pushStdRow(
        'Net Financial Assistance/Subsidy',
        getNetTransfers(reportCurrent),
        getNetTransfers(reportPrior),
        { indent: 1, bold: true, topBorder: 'thin' }
      );
    }

    if (nonOpItems.some(isItemVisible)) {
      pushStdRow(
        'Other Non-Operating Income',
        isCondensed ? sumItemsNet(nonOpItems, reportCurrent) : null,
        isCondensed ? sumItemsNet(nonOpItems, reportPrior) : null,
        { indent: 1, bold: true }
      );
      if (!isCondensed) {
        groupByKey(nonOpItems, (i) => i.subgroup || i.group).forEach(([sgName, sgItems]) => {
          const vis = sgItems.filter(isItemVisible);
          if (hideZeroRows && vis.length === 0) return;
          pushStdRow(sgName, null, null, { indent: 2, bold: true });
          vis.forEach((item) => {
            pushStdRow(
              item.name,
              reportCurrent.values[item.id] || 0,
              reportPrior.values[item.id] || 0,
              { indent: 3 }
            );
          });
          pushStdRow(`Total ${sgName}`, sumItemsNet(sgItems, reportCurrent), sumItemsNet(sgItems, reportPrior), {
            indent: 3,
            bold: true,
            topBorder: 'thin',
          });
        });
      }
      pushStdRow(
        'Total Non-Operating Income',
        sumItemsNet(nonOpItems, reportCurrent),
        sumItemsNet(nonOpItems, reportPrior),
        { indent: 1, bold: true, topBorder: 'thin' }
      );
    }

    if (lossItems.some(isItemVisible)) {
      lossItems.filter(isItemVisible).forEach((item) => {
        const c = reportCurrent.values[item.id] || 0;
        const p = reportPrior.values[item.id] || 0;
        pushStdRow(item.name, c ? -Math.abs(c) : 0, p ? -Math.abs(p) : 0, {
          indent: 1,
          bold: true,
        });
      });
    }

    const finalSurplusCurr =
      sumItemsNet(revItems, reportCurrent) -
      sumItemsNet(expItems, reportCurrent) +
      getNetTransfers(reportCurrent) +
      sumItemsNet(nonOpItems, reportCurrent) -
      sumLossAbs(reportCurrent);
    const finalSurplusPrior =
      sumItemsNet(revItems, reportPrior) -
      sumItemsNet(expItems, reportPrior) +
      getNetTransfers(reportPrior) +
      sumItemsNet(nonOpItems, reportPrior) -
      sumLossAbs(reportPrior);

    pushStdRow('SURPLUS/(DEFICIT) FOR THE PERIOD', finalSurplusCurr, finalSurplusPrior, {
      bold: true,
      topBorder: 'thin',
      bottomBorder: 'double',
    });
  } else if (selectedStatement === 'cash_flows') {
    const cfActivities: Array<{
      title: string;
      sectionKey: 'CASH_OPERATING' | 'CASH_INVESTING' | 'CASH_FINANCING';
      netLabel: string;
      getInflow: (s: CashFlowsSummary) => number;
      getOutflow: (s: CashFlowsSummary) => number;
      getNet: (s: CashFlowsSummary) => number;
    }> = [
      {
        title: 'Cash Flows from Operating Activities',
        sectionKey: 'CASH_OPERATING',
        netLabel: 'Net Cash Provided by (Used in) Operating Activities',
        getInflow: (s) => s.operatingInflows,
        getOutflow: (s) => s.operatingOutflows,
        getNet: (s) => s.netOperating,
      },
      {
        title: 'Cash Flows from Investing Activities',
        sectionKey: 'CASH_INVESTING',
        netLabel: 'Net Cash Provided by (Used in) Investing Activities',
        getInflow: (s) => s.investingInflows,
        getOutflow: (s) => s.investingOutflows,
        getNet: (s) => s.netInvesting,
      },
      {
        title: 'Cash Flows from Financing Activities',
        sectionKey: 'CASH_FINANCING',
        netLabel: 'Net Cash Provided by (Used in) Financing Activities',
        getInflow: (s) => s.financingInflows,
        getOutflow: (s) => s.financingOutflows,
        getNet: (s) => s.netFinancing,
      },
    ];

    const groupByGrp = (items: LineItemDefinition[]) => {
      const map = new Map<string, LineItemDefinition[]>();
      items.forEach((it) => {
        const list = map.get(it.group) || [];
        list.push(it);
        map.set(it.group, list);
      });
      return Array.from(map.entries());
    };

    const isDirectLeafGroup = (grp: string, grpItems: LineItemDefinition[]) =>
      grp === 'Financing Cash Inflows' ||
      grp === 'Financing Cash Outflows' ||
      (grpItems.length === 1 &&
        grpItems[0].name === grp &&
        grp !== 'Replenishment of Negotiated MDS Checks (for BTr)');

    cfActivities.forEach((act) => {
      pushStdRow(act.title, null, null, { bold: true });
      const sectionItems = statementLineItems.filter((i) => i.section === act.sectionKey);
      const inflowItems = sectionItems.filter((i) => i.subgroup !== 'Cash Outflows');
      const outflowItems = sectionItems.filter((i) => i.subgroup === 'Cash Outflows');

      pushStdRow('Cash Inflows', null, null, { indent: 1, bold: true });
      groupByGrp(inflowItems).forEach(([grp, grpItems]) => {
        const vis = grpItems.filter(isItemVisible);
        if (hideZeroRows && vis.length === 0) return;
        if (grp === 'Financing Cash Inflows') {
          vis.forEach((item) =>
            pushStdRow(item.name, reportCurrent.values[item.id] || 0, reportPrior.values[item.id] || 0, {
              indent: 2,
            })
          );
          return;
        }
        if (isCondensed) {
          pushStdRow(grp, sumItemsNet(grpItems, reportCurrent), sumItemsNet(grpItems, reportPrior), {
            indent: 2,
          });
          return;
        }
        if (isDirectLeafGroup(grp, grpItems)) {
          vis.forEach((item) =>
            pushStdRow(item.name, reportCurrent.values[item.id] || 0, reportPrior.values[item.id] || 0, {
              indent: 2,
            })
          );
          return;
        }
        pushStdRow(grp, null, null, { indent: 2, bold: true });
        vis.forEach((item) =>
          pushStdRow(item.name, reportCurrent.values[item.id] || 0, reportPrior.values[item.id] || 0, {
            indent: 3,
          })
        );
      });
      pushStdRow(
        'Total Cash Inflows',
        act.getInflow(cashFlowsSummaryCurrent),
        act.getInflow(cashFlowsSummaryPrior),
        { indent: 1, bold: true, topBorder: 'thin' }
      );

      pushStdRow('Cash Outflows', null, null, { indent: 1, bold: true });
      groupByGrp(outflowItems).forEach(([grp, grpItems]) => {
        const vis = grpItems.filter(isItemVisible);
        if (hideZeroRows && vis.length === 0) return;
        if (grp === 'Financing Cash Outflows') {
          vis.forEach((item) =>
            pushStdRow(item.name, reportCurrent.values[item.id] || 0, reportPrior.values[item.id] || 0, {
              indent: 2,
            })
          );
          return;
        }
        if (isCondensed) {
          pushStdRow(grp, sumItemsNet(grpItems, reportCurrent), sumItemsNet(grpItems, reportPrior), {
            indent: 2,
          });
          return;
        }
        if (isDirectLeafGroup(grp, grpItems)) {
          vis.forEach((item) =>
            pushStdRow(item.name, reportCurrent.values[item.id] || 0, reportPrior.values[item.id] || 0, {
              indent: 2,
            })
          );
          return;
        }
        pushStdRow(grp, null, null, { indent: 2, bold: true });
        vis.forEach((item) =>
          pushStdRow(item.name, reportCurrent.values[item.id] || 0, reportPrior.values[item.id] || 0, {
            indent: 3,
          })
        );
      });
      pushStdRow(
        'Total Cash Outflows',
        act.getOutflow(cashFlowsSummaryCurrent),
        act.getOutflow(cashFlowsSummaryPrior),
        { indent: 1, bold: true, topBorder: 'thin' }
      );
      pushStdRow(act.netLabel, act.getNet(cashFlowsSummaryCurrent), act.getNet(cashFlowsSummaryPrior), {
        indent: 1,
        bold: true,
        topBorder: 'thin',
      });
    });

    pushStdRow(
      'Increase/(Decrease) in Cash and Cash Equivalents',
      cashFlowsSummaryCurrent.netIncreaseDecrease,
      cashFlowsSummaryPrior.netIncreaseDecrease,
      { bold: true, topBorder: 'thin' }
    );
    const hasAnyFx =
      Math.abs(cashFlowsSummaryCurrent.fxEffects) >= 0.005 ||
      (showComparative && Math.abs(cashFlowsSummaryPrior.fxEffects) >= 0.005);
    if (hasAnyFx || !hideZeroRows) {
      pushStdRow(
        'Effects of Exchange Rate Changes on Cash and Cash Equivalents',
        cashFlowsSummaryCurrent.fxEffects,
        cashFlowsSummaryPrior.fxEffects,
        { indent: 1 }
      );
    }
    pushStdRow(
      'Cash and Cash Equivalents, January 1',
      cashFlowsSummaryCurrent.january1Cash,
      cashFlowsSummaryPrior.january1Cash,
      { bold: true }
    );
    pushStdRow(
      'CASH AND CASH EQUIVALENTS, DECEMBER 31',
      cashFlowsSummaryCurrent.december31Cash,
      cashFlowsSummaryPrior.december31Cash,
      { bold: true, topBorder: 'thin', bottomBorder: 'double' }
    );
  } else if (selectedStatement === 'net_assets') {
    pushStdRow('Balance at January 1', netAssetsSummaryCurrent.january1Balance, netAssetsSummaryPrior.january1Balance, {
      bold: true,
    });
    pushStdRow('Add/(Deduct):', null, null, { indent: 1, bold: true });
    pushStdRow(
      'Changes in Accounting Policy',
      netAssetsSummaryCurrent.changesInAccountingPolicy,
      netAssetsSummaryPrior.changesInAccountingPolicy,
      { indent: 2 }
    );
    pushStdRow(
      'Prior period errors',
      netAssetsSummaryCurrent.priorPeriodErrors,
      netAssetsSummaryPrior.priorPeriodErrors,
      { indent: 2 }
    );
    pushStdRow(
      'Other Adjustments',
      netAssetsSummaryCurrent.otherAdjustments,
      netAssetsSummaryPrior.otherAdjustments,
      { indent: 2 }
    );
    pushStdRow('Restated Balance', netAssetsSummaryCurrent.restatedBalance, netAssetsSummaryPrior.restatedBalance, {
      bold: true,
      topBorder: 'thin',
    });
    pushStdRow('Add/(Deduct):', null, null, { bold: true });
    pushStdRow('Changes in Net Assets/Equity for the Calendar Year', null, null, { bold: true });
    pushStdRow(
      'Surplus/(Deficit) for the Period',
      netAssetsSummaryCurrent.surplusDeficitForPeriod,
      netAssetsSummaryPrior.surplusDeficitForPeriod,
      { indent: 2 }
    );
    pushStdRow(
      'Adjustment of net revenue recognized directly in net assets/equity',
      netAssetsSummaryCurrent.netRevenueAdjustment,
      netAssetsSummaryPrior.netRevenueAdjustment,
      { indent: 2 }
    );
    pushStdRow('Others', netAssetsSummaryCurrent.others, netAssetsSummaryPrior.others, { indent: 2 });
    pushStdRow(
      'BALANCE AT DECEMBER 31',
      netAssetsSummaryCurrent.december31Balance,
      netAssetsSummaryPrior.december31Balance,
      { bold: true, topBorder: 'thin', bottomBorder: 'double' }
    );
  }

  exportA4ExcelWorkbook({
    fileName: `${safePrefix}_${selectedStatement.toUpperCase()}_${selectedYear}.xlsx`,
    sheetName:
      selectedStatement === 'position'
        ? 'Financial Position'
        : selectedStatement === 'performance'
        ? 'Financial Performance'
        : selectedStatement === 'cash_flows'
        ? 'Cash Flows'
        : 'Net Assets Equity',
    rows,
    columns,
    rowHeights,
    merges,
    orientation: 'portrait',
    fontFamily: 'Times New Roman',
  });
};
