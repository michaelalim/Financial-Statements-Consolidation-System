import React, { useMemo, useState } from 'react';
import { FinancialDataStore, LineItemDefinition, StatementType } from '../types/fs';
import { AGGREGATED_ACCUMULATED_DEPRECIATION_ID } from '../data/defaultLineItems';
import { YearImportColumnTarget, ExtractedPositionRow } from '../utils/excelImportPosition';
import { calculateReport, CalculatedReport } from '../utils/calculations';
import { calculateCashFlowsSummary, CashFlowsSummary } from '../utils/cashFlowCalculations';
import { calculateNetAssetsSummary, NetAssetsSummary } from '../utils/netAssetsCalculations';
import { formatAccounting, parseNumberInput } from '../utils/formatters';
import {
  Eye,
  EyeOff,
  FileText,
  Search,
  X,
  AlertTriangle,
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  Info,
  Check,
  Pencil,
} from 'lucide-react';

interface DraftStatementPreviewProps {
  statementType?: StatementType;
  divisionId?: string;
  dataStore?: FinancialDataStore;
  divisionName: string;
  selectedYear: string;
  encodableItems: LineItemDefinition[];
  rows: ExtractedPositionRow[];
  enabledTargets: YearImportColumnTarget[];
  unmatchedCount: number;
  duplicateCount: number;
  manualBegCash2024?: number | null;
  onUpdateBegCash2024?: (amount: number) => void;
  manualBegNetAssets2024?: number | null;
  onUpdateBegNetAssets2024?: (amount: number) => void;
  onBackToAccounts: (filterNeedsReview?: boolean) => void;
}

const CONDENSED_NOTES: Record<string, string> = {
  'Cash and Cash Equivalents': '6',
  'Receivables': '7',
  'Inventories': '8',
  'Other Current Assets': '9',
  'Property, Plant and Equipment': '10',
  'Biological Assets': '11',
  'Intangible Assets': '12',
  'Other Non-Current Assets': '13',
  'Financial Liabilities': '14',
  'Inter-Agency Payables': '15',
  'Intra-Agency Payables': '16',
  'Trust Liabilities': '17',
  'Other Payables': '19',
};

const DRAFT_STATEMENT_TITLES: Record<StatementType, { condensed: string; detailed: string }> = {
  position: {
    condensed: 'Statement of Financial Position (Draft Preview)',
    detailed: 'Detailed Statement of Financial Position (Draft Preview)',
  },
  performance: {
    condensed: 'Condensed Statement of Financial Performance (Draft Preview)',
    detailed: 'Detailed Statement of Financial Performance (Draft Preview)',
  },
  cash_flows: {
    condensed: 'Condensed Statement of Cash Flows (Draft Preview)',
    detailed: 'Detailed Statement of Cash Flows (Draft Preview)',
  },
  net_assets: {
    condensed: 'Statement of Changes in Net Assets/Equity (Draft Preview)',
    detailed: 'Statement of Changes in Net Assets/Equity (Draft Preview)',
  },
};

export const DraftStatementPreview: React.FC<DraftStatementPreviewProps> = ({
  statementType = 'position',
  divisionId = 'draft',
  dataStore,
  divisionName,
  selectedYear,
  encodableItems,
  rows,
  enabledTargets,
  unmatchedCount,
  duplicateCount,
  manualBegCash2024 = null,
  onUpdateBegCash2024,
  manualBegNetAssets2024 = null,
  onUpdateBegNetAssets2024,
  onBackToAccounts,
}) => {
  const [isCondensed, setIsCondensed] = useState(false);
  const [hideZeroRows, setHideZeroRows] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedDraftAggIds, setExpandedDraftAggIds] = useState<Record<string, boolean>>({});
  const [isEditingJan1_2024, setIsEditingJan1_2024] = useState(false);
  const [jan1_2024Input, setJan1_2024Input] = useState('');
  const [isEditingNaJan1_2024, setIsEditingNaJan1_2024] = useState(false);
  const [naJan1_2024Input, setNaJan1_2024Input] = useState('');

  const aggBreakdownRowByItemId = useMemo(() => {
    const map: Record<string, ExtractedPositionRow> = {};
    const rowsByItemId = new Map<string, ExtractedPositionRow[]>();
    rows.forEach((r) => {
      if (!r.included || !r.selectedLineItemId) return;
      if (r.aggregationBreakdown) {
        map[r.selectedLineItemId] = r;
      }
      const list = rowsByItemId.get(r.selectedLineItemId) || [];
      list.push(r);
      rowsByItemId.set(r.selectedLineItemId, list);
    });

    rowsByItemId.forEach((groupRows, itemId) => {
      if (map[itemId] || groupRows.length < 2) return;
      const itemDef = encodableItems.find((i) => i.id === itemId);
      const resolvedAmountsByTargetId: Record<string, number | null> = {};
      const wasAggregatedByTargetId: Record<string, boolean> = {};
      enabledTargets.forEach((t) => {
        let sum = 0;
        let hasAny = false;
        groupRows.forEach((r) => {
          const val = r.amountsByTargetId[t.id];
          if (val !== null && val !== undefined) {
            sum += itemDef?.isContra ? Math.abs(val) : val;
            hasAny = true;
          }
        });
        resolvedAmountsByTargetId[t.id] = hasAny ? Math.round(sum * 10000) / 10000 : null;
        wasAggregatedByTargetId[t.id] = hasAny && Math.abs(sum) >= 0.005;
      });
      map[itemId] = {
        ...groupRows[0],
        amountsByTargetId: resolvedAmountsByTargetId,
        aggregationBreakdown: {
          parentItemId: itemId,
          parentLabel: itemDef?.name || groupRows[0].rawName,
          parentRawName: itemDef?.name || groupRows[0].rawName,
          isParentless: true,
          parentOwnAmountsByTargetId: {},
          resolvedAmountsByTargetId,
          wasAggregatedByTargetId,
          children: groupRows.map((r) => ({
            rawName: r.rawName,
            cleanedName: r.cleanedName,
            excelRowNumber: r.excelRowNumber,
            amountsByTargetId: { ...r.amountsByTargetId },
          })),
        },
      };
    });

    return map;
  }, [rows, encodableItems, enabledTargets]);

  const itemById = useMemo(() => {
    const map = new Map<string, LineItemDefinition>();
    encodableItems.forEach((item) => map.set(item.id, item));
    return map;
  }, [encodableItems]);

  // Sort enabled columns descending by fiscal year (e.g., 2025 then 2024)
  const orderedColumns = useMemo(() => {
    const yearCounts = new Map<string, number>();
    enabledTargets.forEach((t) => {
      yearCounts.set(t.targetYear, (yearCounts.get(t.targetYear) || 0) + 1);
    });

    return [...enabledTargets]
      .sort((a, b) => Number(b.targetYear) - Number(a.targetYear))
      .map((target) => ({
        target,
        colKey: target.id,
        label:
          (yearCounts.get(target.targetYear) || 0) > 1
            ? `${target.targetYear} (Col ${target.colLetter})`
            : target.targetYear,
      }));
  }, [enabledTargets]);

  // Build temporary FinancialDataStore from included + matched rows and calculate reports
  const reportsByColKey = useMemo(() => {
    const draftStore: FinancialDataStore = {};

    orderedColumns.forEach(({ target, colKey }) => {
      const divEntries: { [lineItemId: string]: number } = {};

      rows.forEach((r) => {
        if (!r.included || !r.selectedLineItemId) return;
        const amt = r.amountsByTargetId[target.id];
        if (amt === null || amt === undefined || Math.abs(amt) < 0.005) return;

        const itemDef = itemById.get(r.selectedLineItemId);
        const normalizedAmt = itemDef?.isContra ? Math.abs(amt) : amt;
        divEntries[r.selectedLineItemId] =
          Math.round(((divEntries[r.selectedLineItemId] || 0) + normalizedAmt) * 10000) / 10000;
      });

      draftStore[colKey] = { draft: divEntries };
    });

    const result: Record<string, CalculatedReport> = {};
    orderedColumns.forEach(({ colKey }) => {
      result[colKey] = calculateReport(encodableItems, draftStore, colKey, 'draft');
    });
    return result;
  }, [orderedColumns, rows, itemById, encodableItems]);

  // Build merged FinancialDataStore keyed by fiscal year so Cash Flows & Net Assets chain Jan 1 accurately across uploaded columns + existing DB
  const { cashFlowsSummaryByColKey, netAssetsSummaryByColKey } = useMemo(() => {
    const mergedStore: FinancialDataStore = {};
    if (dataStore) {
      Object.entries(dataStore).forEach(([yr, divMap]) => {
        if (divMap[divisionId]) {
          mergedStore[yr] = { [divisionId]: { ...divMap[divisionId] } };
        }
      });
    }

    orderedColumns.forEach(({ target }) => {
      const existingForYear = mergedStore[target.targetYear]?.[divisionId] || {};
      const nextForYear: Record<string, number> = { ...existingForYear };

      // Preserve existing Jan 1 beginning balance if stored, but replace encodable statement items with uploaded amounts
      encodableItems.forEach((item) => {
        if (item.id === 'cf-sum-beg-cash' || item.id === 'na-beg-balance') return;
        delete nextForYear[item.id];
      });

      rows.forEach((r) => {
        if (!r.included || !r.selectedLineItemId) return;
        if (
          (statementType === 'cash_flows' &&
            r.selectedLineItemId === 'cf-sum-beg-cash' &&
            target.targetYear !== '2024') ||
          (statementType === 'net_assets' &&
            r.selectedLineItemId === 'na-beg-balance' &&
            target.targetYear !== '2024')
        ) {
          return;
        }
        const amt = r.amountsByTargetId[target.id];
        if (amt === null || amt === undefined || Math.abs(amt) < 0.005) return;
        const itemDef = itemById.get(r.selectedLineItemId);
        const normalizedAmt = itemDef?.isContra ? Math.abs(amt) : amt;
        nextForYear[r.selectedLineItemId] =
          Math.round(((nextForYear[r.selectedLineItemId] || 0) + normalizedAmt) * 10000) / 10000;
      });

      if (
        statementType === 'cash_flows' &&
        target.targetYear === '2024' &&
        manualBegCash2024 !== null &&
        manualBegCash2024 !== undefined
      ) {
        nextForYear['cf-sum-beg-cash'] = manualBegCash2024;
      }
      if (
        statementType === 'net_assets' &&
        target.targetYear === '2024' &&
        manualBegNetAssets2024 !== null &&
        manualBegNetAssets2024 !== undefined
      ) {
        nextForYear['na-beg-balance'] = manualBegNetAssets2024;
      }

      mergedStore[target.targetYear] = { [divisionId]: nextForYear };
    });

    const cfMap: Record<string, CashFlowsSummary> = {};
    const naMap: Record<string, NetAssetsSummary> = {};

    orderedColumns.forEach(({ target, colKey }) => {
      const colStore: FinancialDataStore = { ...mergedStore };
      // Ensure exact target column entries apply even if two columns map to same year
      const colEntries: Record<string, number> = { ...(mergedStore[target.targetYear]?.[divisionId] || {}) };
      encodableItems.forEach((item) => {
        if (item.id === 'cf-sum-beg-cash' || item.id === 'na-beg-balance') return;
        delete colEntries[item.id];
      });
      rows.forEach((r) => {
        if (!r.included || !r.selectedLineItemId) return;
        if (
          (statementType === 'cash_flows' &&
            r.selectedLineItemId === 'cf-sum-beg-cash' &&
            target.targetYear !== '2024') ||
          (statementType === 'net_assets' &&
            r.selectedLineItemId === 'na-beg-balance' &&
            target.targetYear !== '2024')
        ) {
          return;
        }
        const amt = r.amountsByTargetId[target.id];
        if (amt === null || amt === undefined || Math.abs(amt) < 0.005) return;
        const itemDef = itemById.get(r.selectedLineItemId);
        const normalizedAmt = itemDef?.isContra ? Math.abs(amt) : amt;
        colEntries[r.selectedLineItemId] =
          Math.round(((colEntries[r.selectedLineItemId] || 0) + normalizedAmt) * 10000) / 10000;
      });
      if (
        statementType === 'cash_flows' &&
        target.targetYear === '2024' &&
        manualBegCash2024 !== null &&
        manualBegCash2024 !== undefined
      ) {
        colEntries['cf-sum-beg-cash'] = manualBegCash2024;
      }
      if (
        statementType === 'net_assets' &&
        target.targetYear === '2024' &&
        manualBegNetAssets2024 !== null &&
        manualBegNetAssets2024 !== undefined
      ) {
        colEntries['na-beg-balance'] = manualBegNetAssets2024;
      }
      colStore[target.targetYear] = { [divisionId]: colEntries };

      if (statementType === 'cash_flows') {
        cfMap[colKey] = calculateCashFlowsSummary(encodableItems, colStore, target.targetYear, divisionId);
      } else if (statementType === 'net_assets') {
        naMap[colKey] = calculateNetAssetsSummary(colStore, target.targetYear, divisionId);
      }
    });

    return { cashFlowsSummaryByColKey: cfMap, netAssetsSummaryByColKey: naMap };
  }, [dataStore, divisionId, orderedColumns, encodableItems, rows, itemById, statementType, manualBegCash2024, manualBegNetAssets2024]);

  // Group encodable Statement of Financial Position items hierarchically
  const sectionsHierarchy = useMemo(() => {
    type Tree = {
      [subsection: string]: {
        [group: string]: {
          [subgroup: string]: LineItemDefinition[];
        };
      };
    };
    const tree: Tree = {};
    encodableItems.forEach((item) => {
      const sub = item.subsection;
      const grp = item.group;
      const subgrp = item.subgroup || 'General';
      if (!tree[sub]) tree[sub] = {};
      if (!tree[sub][grp]) tree[sub][grp] = {};
      if (!tree[sub][grp][subgrp]) tree[sub][grp][subgrp] = [];
      tree[sub][grp][subgrp].push(item);
    });
    return tree;
  }, [encodableItems]);

  const formatFSNumber = (val: number, isContra?: boolean): string => {
    if (!val || Math.abs(val) < 0.005) return '-';
    if (isContra && val > 0) return `(${formatAccounting(val)})`;
    return formatAccounting(val);
  };

  const hasAggregatedDep = useMemo(() => {
    return orderedColumns.some(
      ({ colKey }) =>
        Math.abs(reportsByColKey[colKey]?.values[AGGREGATED_ACCUMULATED_DEPRECIATION_ID] || 0) >=
        0.005
    );
  }, [orderedColumns, reportsByColKey]);

  const isItemVisible = (item: LineItemDefinition): boolean => {
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const matches =
        item.name.toLowerCase().includes(q) ||
        item.group.toLowerCase().includes(q) ||
        (item.subgroup && item.subgroup.toLowerCase().includes(q));
      if (!matches) return false;
    }
    const isNonZero = orderedColumns.some(({ colKey }) => {
      const v = reportsByColKey[colKey]?.values[item.id] || 0;
      return Math.abs(v) >= 0.005;
    });
    if (item.id === AGGREGATED_ACCUMULATED_DEPRECIATION_ID) {
      return isNonZero;
    }
    if (!hideZeroRows) return true;
    return isNonZero;
  };

  const isSubgroupVisible = (items: LineItemDefinition[]) => items.some(isItemVisible);

  const isGroupVisible = (subgroups: { [subgroup: string]: LineItemDefinition[] }) =>
    Object.values(subgroups).some(isSubgroupVisible);

  const sumItemsNet = (items: LineItemDefinition[], report: CalculatedReport): number =>
    items.reduce((sum, item) => {
      const v = report.values[item.id] || 0;
      return sum + (item.isContra ? -v : v);
    }, 0);

  const sumSubgroupsNet = (
    subgroups: { [subgroup: string]: LineItemDefinition[] },
    report: CalculatedReport
  ): number => Object.values(subgroups).reduce((sum, items) => sum + sumItemsNet(items, report), 0);

  const renderDraftAggNotice = (itemId: string) => {
    const sourceRow = aggBreakdownRowByItemId[itemId];
    const breakdown = sourceRow?.aggregationBreakdown;
    if (!sourceRow || !breakdown) return null;

    const activeCols = orderedColumns.filter(({ colKey }) => {
      const val = reportsByColKey[colKey]?.values[itemId] || 0;
      return Math.abs(val) >= 0.005 || breakdown.children.some((c) => Math.abs(c.amountsByTargetId[colKey] || 0) >= 0.005);
    });
    if (activeCols.length === 0) return null;

    const anyWasAggregated = activeCols.some(({ colKey }) => breakdown.wasAggregatedByTargetId[colKey]);
    const isExpanded = Boolean(expandedDraftAggIds[itemId]);

    return (
      <div className="no-print mt-1 mb-1 font-sans">
        <button
          type="button"
          onClick={() =>
            setExpandedDraftAggIds((prev) => ({
              ...prev,
              [itemId]: !prev[itemId],
            }))
          }
          className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-sky-50 hover:bg-sky-100 border border-sky-300 text-sky-900 text-[11px] font-bold transition-colors cursor-pointer"
        >
          <Info className="w-3 h-3 text-sky-700 shrink-0" />
          <span>
            {anyWasAggregated
              ? 'Notice: This account has been aggregated'
              : 'Notice: Parent matched sub-items'}
          </span>
          <span className="text-sky-700 font-semibold">
            ({breakdown.children.length} sub-item{breakdown.children.length === 1 ? '' : 's'})
          </span>
          {isExpanded ? <ChevronUp className="w-3 h-3 shrink-0" /> : <ChevronDown className="w-3 h-3 shrink-0" />}
        </button>

        {isExpanded && (
          <div className="mt-1.5 p-2.5 rounded-lg bg-sky-50/95 border border-sky-300 text-sky-950 text-[11px] max-w-xl space-y-2 shadow-2xs">
            {activeCols.map(({ colKey, label }) => {
              const parentOrig = breakdown.parentOwnAmountsByTargetId[colKey] || 0;
              const resolvedAmt = sourceRow.amountsByTargetId[colKey] || 0;
              const wasAgg = Boolean(breakdown.wasAggregatedByTargetId[colKey]);
              return (
                <div key={`draft-${itemId}-${colKey}`} className="space-y-0.5">
                  <div className="flex items-center justify-between gap-2 font-bold text-sky-900">
                    <span>
                      {label} — {wasAgg ? 'Aggregated Total' : 'Parent Verified'}
                    </span>
                    <span className="font-mono">₱ {formatAccounting(resolvedAmt)}</span>
                  </div>
                  {(!breakdown.isParentless || Math.abs(parentOrig) >= 0.005) && (
                    <div className="flex items-center justify-between gap-2 text-slate-700 pl-2">
                      <span>Original father account row</span>
                      <span className="font-mono font-semibold">₱ {formatAccounting(parentOrig)}</span>
                    </div>
                  )}
                  {breakdown.children.map((child, idx) => (
                    <div
                      key={`draft-${itemId}-${colKey}-${idx}`}
                      className="flex items-center justify-between gap-2 text-slate-700 pl-2"
                    >
                      <span className="truncate">
                        {child.cleanedName || child.rawName}
                        {child.excelRowNumber ? ` (Row ${child.excelRowNumber})` : ''}
                      </span>
                      <span className="font-mono font-semibold shrink-0">
                        ₱ {formatAccounting(child.amountsByTargetId[colKey] || 0)}
                      </span>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  const renderItemsWithNetValue = (
    items: LineItemDefinition[],
    indentClass: string,
    includeNetValue: boolean
  ) => {
    const isAggregateContraGroup = items.some(
      (i) => i.subgroup === 'Other Receivables' || i.id === 'allowance_impairment_other_receivables'
    );

    const visibleItems: LineItemDefinition[] = [];
    let baseVisible = false;

    items.forEach((item) => {
      if (searchQuery.trim()) {
        if (isItemVisible(item)) visibleItems.push(item);
        return;
      }

      const isNonZero = orderedColumns.some(({ colKey }) => {
        const v = reportsByColKey[colKey]?.values[item.id] || 0;
        return Math.abs(v) >= 0.005;
      });

      if (item.id === AGGREGATED_ACCUMULATED_DEPRECIATION_ID) {
        if (isNonZero) visibleItems.push(item);
        return;
      }

      if (!item.isContra) {
        const itemVisible = !hideZeroRows || isNonZero;
        baseVisible = isAggregateContraGroup ? (baseVisible || itemVisible) : itemVisible;
        if (itemVisible) visibleItems.push(item);
      } else if (!hideZeroRows || isNonZero || baseVisible) {
        visibleItems.push(item);
      }
    });

    const renderedRows: React.ReactNode[] = [];
    const runningByCol: Record<string, number> = {};
    let hasContraForCurrentBase = false;

    visibleItems.forEach((item, idx) => {
      if (item.id === AGGREGATED_ACCUMULATED_DEPRECIATION_ID) {
        renderedRows.push(
          <tr key={item.id} className="text-red-700 font-bold">
            <td className={`py-1 ${indentClass} text-red-700 font-bold`}>
              <div>{item.name}</div>
              <div className="text-[10pt] italic font-bold text-red-700">
                Notice: Temporary combined depreciation — breakdown per PPE pending (excluded from Consolidated FS)
              </div>
            </td>
            {orderedColumns.map(({ colKey }) => {
              const val = reportsByColKey[colKey]?.values[item.id] || 0;
              return (
                <td key={colKey} className="py-1 px-4 text-right tabular-nums text-red-700 font-bold align-top">
                  {formatFSNumber(val, item.isContra)}
                </td>
              );
            })}
          </tr>
        );
        return;
      }

      if (!item.isContra) {
        orderedColumns.forEach(({ colKey }) => {
          const val = reportsByColKey[colKey]?.values[item.id] || 0;
          runningByCol[colKey] = isAggregateContraGroup
            ? (runningByCol[colKey] || 0) + val
            : val;
        });
        hasContraForCurrentBase = false;
      } else {
        orderedColumns.forEach(({ colKey }) => {
          runningByCol[colKey] =
            (runningByCol[colKey] || 0) - (reportsByColKey[colKey]?.values[item.id] || 0);
        });
        hasContraForCurrentBase = true;
      }

      renderedRows.push(
        <tr key={item.id}>
          <td className={`py-0.5 ${indentClass}`}>{item.name}</td>
          {orderedColumns.map(({ colKey }) => {
            const val = reportsByColKey[colKey]?.values[item.id] || 0;
            return (
              <td key={colKey} className="py-0.5 px-4 text-right tabular-nums">
                {formatFSNumber(val, item.isContra)}
              </td>
            );
          })}
        </tr>
      );

      if (includeNetValue && hasContraForCurrentBase) {
        const nextItem = visibleItems[idx + 1];
        if (!nextItem || !nextItem.isContra) {
          renderedRows.push(
            <tr key={`${item.id}-net-value`}>
              <td className={`py-0.5 pb-2 ${indentClass}`}>Net Value</td>
              {orderedColumns.map(({ colKey }) => (
                <td key={colKey} className="py-0.5 pb-2 px-4 text-right tabular-nums">
                  {formatFSNumber(runningByCol[colKey] || 0)}
                </td>
              ))}
            </tr>
          );
          hasContraForCurrentBase = false;
          if (isAggregateContraGroup) {
            orderedColumns.forEach(({ colKey }) => {
              runningByCol[colKey] = 0;
            });
          }
        }
      }
    });

    return renderedRows;
  };

  if (orderedColumns.length === 0) {
    return (
      <div className="py-12 px-6 text-center text-base sm:text-lg text-th-muted font-medium border-2 border-dashed border-th-border-strong rounded-2xl">
        Please open &quot;Adjust Sheet / Columns&quot; above and enable at least one year column to preview the Draft Financial Statement.
      </div>
    );
  }

  const primaryDisplayYear = orderedColumns[0]?.target.targetYear || selectedYear;
  const detailedColSpan = 1 + orderedColumns.length;
  const condensedColSpan = 2 + orderedColumns.length;
  const supportsCondensedToggle =
    statementType === 'position' || statementType === 'performance' || statementType === 'cash_flows';
  const statementTitles = DRAFT_STATEMENT_TITLES[statementType];
  const statementDisplayName = isCondensed && supportsCondensedToggle
    ? statementTitles.condensed
    : statementTitles.detailed;

  return (
    <div className="space-y-4">
      {/* Draft Preview Controls Banner */}
      <div className="bg-th-subtle border-2 border-th-border-strong rounded-2xl p-4 space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex items-start sm:items-center gap-3">
            <div className="p-2.5 rounded-xl bg-th-primary text-th-primary-fg border border-th-border-strong shrink-0">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <div className="text-base font-bold text-th-text">
                {statementDisplayName} — Not Yet Saved
              </div>
              <p className="text-sm text-th-muted">
                Shows how your included &amp; matched rows will appear in the Financial Statements tab.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <div className="relative min-w-[200px] flex-1 sm:flex-initial">
              <Search className="w-4 h-4 text-th-muted absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Find account in draft..."
                className="w-full min-h-[40px] pl-9 pr-8 py-1.5 text-sm font-semibold text-th-text bg-th-input border-2 border-th-border-strong rounded-xl focus:outline-hidden focus:border-th-accent"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-th-muted hover:text-th-text cursor-pointer"
                  aria-label="Clear draft search"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {supportsCondensedToggle && (
              <button
                type="button"
                onClick={() => setIsCondensed((prev) => !prev)}
                className={`min-h-[40px] px-4 py-2 text-sm font-bold rounded-xl border-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  isCondensed
                    ? 'bg-th-primary text-th-primary-fg border-th-primary dark:border-th-border-strong shadow-xs'
                    : 'bg-th-surface text-th-text border-th-border-strong hover:bg-th-subtle-hover'
                }`}
              >
                {isCondensed ? 'Condensed FS' : 'Detailed FS'}
              </button>
            )}

            <button
              type="button"
              onClick={() => setHideZeroRows((prev) => !prev)}
              className={`min-h-[40px] px-4 py-2 text-sm font-bold rounded-xl border-2 transition-colors inline-flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer ${
                hideZeroRows
                  ? 'bg-th-surface text-th-text border-th-border-strong hover:bg-th-subtle-hover'
                  : 'bg-th-primary text-th-primary-fg border-th-primary dark:border-th-border-strong'
              }`}
            >
              {hideZeroRows ? (
                <EyeOff className="w-4 h-4 text-th-muted shrink-0" />
              ) : (
                <Eye className="w-4 h-4 shrink-0" />
              )}
              <span>{hideZeroRows ? 'Zero Balances Hidden' : 'Showing All Accounts'}</span>
            </button>
          </div>
        </div>

        <div className="pt-2.5 border-t border-th-border flex flex-wrap items-center justify-between gap-3 text-sm">
          <div className="flex flex-wrap items-center gap-3 font-bold text-th-text">
            <span className="text-th-muted">Jump:</span>
            {statementType === 'position' && (
              <>
                <a href="#draft-assets-section" className="hover:text-th-accent-text underline">
                  Assets
                </a>
                <span className="text-th-muted" aria-hidden="true">·</span>
                <a href="#draft-liabilities-section" className="hover:text-th-accent-text underline">
                  Liabilities
                </a>
                <span className="text-th-muted" aria-hidden="true">·</span>
                <a href="#draft-equity-section" className="hover:text-th-accent-text underline">
                  Equity
                </a>
              </>
            )}
            {statementType === 'performance' && (
              <>
                <a href="#draft-revenue-section" className="hover:text-th-accent-text underline">
                  Revenue
                </a>
                <span className="text-th-muted" aria-hidden="true">·</span>
                <a href="#draft-expenses-section" className="hover:text-th-accent-text underline">
                  Operating Expenses
                </a>
                <span className="text-th-muted" aria-hidden="true">·</span>
                <a href="#draft-surplus-section" className="hover:text-th-accent-text underline">
                  Surplus/(Deficit)
                </a>
              </>
            )}
            {statementType === 'cash_flows' && (
              <>
                <a href="#draft-cf-operating" className="hover:text-th-accent-text underline">
                  Operating
                </a>
                <span className="text-th-muted" aria-hidden="true">·</span>
                <a href="#draft-cf-investing" className="hover:text-th-accent-text underline">
                  Investing
                </a>
                <span className="text-th-muted" aria-hidden="true">·</span>
                <a href="#draft-cf-financing" className="hover:text-th-accent-text underline">
                  Financing
                </a>
                <span className="text-th-muted" aria-hidden="true">·</span>
                <a href="#draft-cf-reconciliation" className="hover:text-th-accent-text underline">
                  Cash Reconciliation
                </a>
              </>
            )}
            {statementType === 'net_assets' && (
              <>
                <a href="#draft-na-beginning" className="hover:text-th-accent-text underline">
                  Restated Balance
                </a>
                <span className="text-th-muted" aria-hidden="true">·</span>
                <a href="#draft-na-changes" className="hover:text-th-accent-text underline">
                  Calendar Year Changes
                </a>
                <span className="text-th-muted" aria-hidden="true">·</span>
                <a href="#draft-na-ending" className="hover:text-th-accent-text underline">
                  Ending Balance
                </a>
              </>
            )}
          </div>

          {(unmatchedCount > 0 || duplicateCount > 0) && (
            <div className="flex flex-wrap items-center gap-2.5 text-amber-900 dark:text-amber-200 font-bold">
              <AlertTriangle className="w-4 h-4 text-amber-700 dark:text-amber-300 shrink-0" />
              <span>
                {unmatchedCount > 0 && `${unmatchedCount} unmatched (excluded)`}
                {unmatchedCount > 0 && duplicateCount > 0 && ' · '}
                {duplicateCount > 0 &&
                  `${duplicateCount} combined duplicate${duplicateCount === 1 ? '' : 's'} (totaled automatically)`}
              </span>
              <button
                type="button"
                onClick={() => onBackToAccounts(unmatchedCount > 0)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-th-surface hover:bg-th-subtle-hover border border-amber-400 dark:border-amber-700 text-th-text text-xs sm:text-sm font-bold cursor-pointer whitespace-nowrap"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>{unmatchedCount > 0 ? 'Fix in Accounts List' : 'Review in Accounts List'}</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Official Financial Statement Draft Document Sheet */}
      <div className="bg-white text-black p-6 sm:p-12 rounded-2xl border-2 border-th-border-strong shadow-sm font-['Times_New_Roman',Times,serif] text-[12pt] leading-snug">
        {/* Document Header */}
        <div className="text-center mb-8">
          <div className="text-base font-bold">Department of Education</div>
          <div className="text-base font-bold">Regional Office No. VI</div>
          <div className="text-base font-bold">{divisionName}</div>
          <div className="text-base font-bold">{statementDisplayName}</div>
          <div className="text-base font-bold">All Funds</div>
          <div className="text-base font-bold">
            {statementType === 'position'
              ? `As at December 31, ${primaryDisplayYear}`
              : `For the Year Ended December 31, ${primaryDisplayYear}`}
          </div>
        </div>

        {/* Statement Body */}
        {statementType === 'performance' ? (
          (() => {
            const revItems = encodableItems.filter((i) => i.section === 'REVENUE');
            const expItems = encodableItems.filter((i) => i.section === 'EXPENSES');
            const trItems = encodableItems.filter((i) => i.section === 'TRANSFERS');
            const trFromItems = trItems.filter((i) => !i.group.startsWith('Less:'));
            const trToItems = trItems.filter((i) => i.group.startsWith('Less:'));
            const nonOpItems = encodableItems.filter((i) => i.section === 'NON_OPERATING');
            const lossItems = encodableItems.filter((i) => i.section === 'LOSSES');

            const groupByKey = (
              items: LineItemDefinition[],
              getKey: (it: LineItemDefinition) => string
            ) => {
              const map = new Map<string, LineItemDefinition[]>();
              items.forEach((it) => {
                const key = getKey(it);
                const list = map.get(key) || [];
                list.push(it);
                map.set(key, list);
              });
              return Array.from(map.entries());
            };

            const revGroups = groupByKey(revItems, (i) => i.group);
            const expGroups = groupByKey(expItems, (i) => i.group);
            const nonOpSubgroups = groupByKey(nonOpItems, (i) => i.subgroup || i.group);

            const sumSection = (items: LineItemDefinition[], colKey: string) =>
              sumItemsNet(items, reportsByColKey[colKey]);

            const sumLossAbs = (colKey: string) =>
              lossItems.reduce(
                (sum, item) => sum + Math.abs(reportsByColKey[colKey]?.values[item.id] || 0),
                0
              );

            const getNetTransfers = (colKey: string) =>
              sumSection(trFromItems, colKey) - sumSection(trToItems, colKey);

            const renderDetailedGroupWithSubgroups = (
              groupName: string,
              items: LineItemDefinition[],
              groupIndentClass: string,
              subgroupIndentClass: string,
              leafIndentClassNoSub: string,
              leafIndentClassWithSub: string,
              showGroupTotalRow: boolean
            ) => {
              const subgroups = groupByKey(items, (i) => i.subgroup || '__NONE__');
              const hasRealSubgroups = subgroups.some(([sg]) => sg !== '__NONE__');

              return (
                <React.Fragment key={groupName}>
                  <tr>
                    <td
                      className={`pt-2 pb-1 ${groupIndentClass} ${
                        isCondensed ? 'font-normal' : 'font-bold'
                      }`}
                    >
                      {groupName}
                    </td>
                    {orderedColumns.map(({ colKey }) => (
                      <td
                        key={colKey}
                        className={`pt-2 pb-1 px-4 text-right tabular-nums ${
                          isCondensed ? 'font-normal' : 'font-bold'
                        }`}
                      >
                        {isCondensed || !hasRealSubgroups
                          ? formatFSNumber(sumSection(items, colKey))
                          : ''}
                      </td>
                    ))}
                  </tr>

                  {!isCondensed &&
                    subgroups.map(([sgName, sgItems]) => {
                      const visSgItems = sgItems.filter(isItemVisible);
                      if (hideZeroRows && visSgItems.length === 0) return null;
                      const isSubheader = sgName !== '__NONE__';
                      return (
                        <React.Fragment key={`${groupName}__${sgName}`}>
                          {isSubheader && (
                            <tr>
                              <td className={`pt-1.5 pb-0.5 ${subgroupIndentClass} font-semibold`}>
                                {sgName}
                              </td>
                              {orderedColumns.map(({ colKey }) => (
                                <td
                                  key={colKey}
                                  className="pt-1.5 pb-0.5 px-4 text-right font-semibold tabular-nums"
                                >
                                  {formatFSNumber(sumSection(sgItems, colKey))}
                                </td>
                              ))}
                            </tr>
                          )}
                          {visSgItems.map((item) => (
                            <tr key={item.id}>
                              <td
                                className={`py-0.5 align-top ${
                                  isSubheader ? leafIndentClassWithSub : leafIndentClassNoSub
                                }`}
                              >
                                <div>{item.name}</div>
                                {renderDraftAggNotice(item.id)}
                              </td>
                              {orderedColumns.map(({ colKey }) => (
                                <td key={colKey} className="py-0.5 px-4 text-right tabular-nums align-top">
                                  {formatFSNumber(reportsByColKey[colKey]?.values[item.id] || 0)}
                                </td>
                              ))}
                            </tr>
                          ))}
                          {isSubheader && (
                            <tr>
                              <td className={`pt-1 pb-2 ${leafIndentClassWithSub} font-bold`}>
                                Total {sgName}
                              </td>
                              {orderedColumns.map(({ colKey }) => (
                                <td
                                  key={colKey}
                                  className="pt-1 pb-2 px-4 text-right font-bold tabular-nums border-t border-black"
                                >
                                  {formatFSNumber(sumSection(sgItems, colKey))}
                                </td>
                              ))}
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}

                  {!isCondensed && showGroupTotalRow && (
                    <tr>
                      <td className={`pt-1 pb-2.5 ${groupIndentClass} font-bold`}>
                        Total {groupName}
                      </td>
                      {orderedColumns.map(({ colKey }) => (
                        <td
                          key={colKey}
                          className="pt-1 pb-2.5 px-4 text-right font-bold tabular-nums border-t border-black"
                        >
                          {formatFSNumber(sumSection(items, colKey))}
                        </td>
                      ))}
                    </tr>
                  )}
                </React.Fragment>
              );
            };

            const hasAnyTransfers = trItems.some(isItemVisible);
            const hasAnyNonOp = nonOpItems.some(isItemVisible);
            const hasAnyLosses = lossItems.some(isItemVisible);

            return (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm border-collapse">
                  <thead>
                    <tr>
                      <th className="py-1.5 pr-4 text-left font-bold uppercase w-3/5 text-sm">
                        Account Title
                      </th>
                      {orderedColumns.map(({ colKey, label }) => (
                        <th
                          key={colKey}
                          className="py-1.5 px-4 text-center font-bold text-sm border-b border-black"
                        >
                          {label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {/* REVENUE */}
                    <tr id="draft-revenue-section">
                      <td colSpan={detailedColSpan} className="pt-4 pb-1 font-bold uppercase">
                        Revenue
                      </td>
                    </tr>
                    {revGroups.map(([groupName, items]) => {
                      const visibleGroupItems = items.filter(isItemVisible);
                      if (hideZeroRows && visibleGroupItems.length === 0) return null;
                      return renderDetailedGroupWithSubgroups(
                        groupName,
                        items,
                        'pl-6',
                        'pl-12',
                        'pl-12',
                        'pl-18',
                        groupName === 'Miscellaneous Income' || groupName === 'Gains'
                      );
                    })}
                    <tr>
                      <td className="pt-2 pb-3 pl-4 font-bold">Total Revenue</td>
                      {orderedColumns.map(({ colKey }) => (
                        <td
                          key={colKey}
                          className="pt-2 pb-3 px-4 text-right font-bold tabular-nums border-t border-black"
                        >
                          {formatFSNumber(sumSection(revItems, colKey))}
                        </td>
                      ))}
                    </tr>

                    {/* CURRENT OPERATING EXPENSES */}
                    <tr id="draft-expenses-section">
                      <td colSpan={detailedColSpan} className="pt-3 pb-1 font-bold uppercase">
                        Less: Current Operating Expenses
                      </td>
                    </tr>
                    {expGroups.map(([groupName, items]) => {
                      const visibleGroupItems = items.filter(isItemVisible);
                      if (hideZeroRows && visibleGroupItems.length === 0) return null;
                      return renderDetailedGroupWithSubgroups(
                        groupName,
                        items,
                        'pl-6',
                        'pl-12',
                        'pl-12',
                        'pl-18',
                        true
                      );
                    })}
                    <tr>
                      <td className="pt-2 pb-3 pl-4 font-bold">Current Operating Expenses</td>
                      {orderedColumns.map(({ colKey }) => (
                        <td
                          key={colKey}
                          className="pt-2 pb-3 px-4 text-right font-bold tabular-nums border-t border-black"
                        >
                          {formatFSNumber(sumSection(expItems, colKey))}
                        </td>
                      ))}
                    </tr>

                    {/* SURPLUS / (DEFICIT) FROM CURRENT OPERATIONS */}
                    <tr id="draft-surplus-section">
                      <td className="pt-2 pb-3 font-bold">Surplus/(Deficit) from Current Operations</td>
                      {orderedColumns.map(({ colKey }) => {
                        const opsSurplus =
                          sumSection(revItems, colKey) - sumSection(expItems, colKey);
                        return (
                          <td
                            key={colKey}
                            className="pt-2 pb-3 px-4 text-right font-bold tabular-nums border-t border-black"
                          >
                            {formatFSNumber(opsSurplus)}
                          </td>
                        );
                      })}
                    </tr>

                    {/* TRANSFERS, ASSISTANCE AND SUBSIDY */}
                    {hasAnyTransfers && (
                      <>
                        {trFromItems.some(isItemVisible) && (
                          <>
                            <tr>
                              <td className="pt-2 pb-1 pl-6 font-bold">
                                Financial Assistance/Subsidy from NGAs, LGUs, GOCCs
                              </td>
                              {orderedColumns.map(({ colKey }) => (
                                <td key={colKey} className="pt-2 pb-1 px-4 text-right font-bold tabular-nums">
                                  {formatFSNumber(sumSection(trFromItems, colKey))}
                                </td>
                              ))}
                            </tr>
                            {!isCondensed &&
                              trFromItems.filter(isItemVisible).map((item) => (
                                <tr key={item.id}>
                                  <td className="py-0.5 pl-12">{item.name}</td>
                                  {orderedColumns.map(({ colKey }) => (
                                    <td key={colKey} className="py-0.5 px-4 text-right tabular-nums">
                                      {formatFSNumber(reportsByColKey[colKey]?.values[item.id] || 0)}
                                    </td>
                                  ))}
                                </tr>
                              ))}
                            <tr>
                              <td className="pt-1 pb-2 pl-12 font-bold">
                                Total Financial Assistance/Subsidy from NGAs, LGUs, GOCCs
                              </td>
                              {orderedColumns.map(({ colKey }) => (
                                <td
                                  key={colKey}
                                  className="pt-1 pb-2 px-4 text-right font-bold tabular-nums border-t border-black"
                                >
                                  {formatFSNumber(sumSection(trFromItems, colKey))}
                                </td>
                              ))}
                            </tr>
                          </>
                        )}

                        {trToItems.some(isItemVisible) && (
                          <>
                            <tr>
                              <td className="pt-2 pb-1 pl-6 font-bold">
                                Less: Financial Assistance/Subsidy to NGAs, LGUs, GOCCs
                              </td>
                              {orderedColumns.map(({ colKey }) => (
                                <td key={colKey} className="pt-2 pb-1 px-4 text-right font-bold tabular-nums">
                                  {formatFSNumber(sumSection(trToItems, colKey))}
                                </td>
                              ))}
                            </tr>
                            {!isCondensed &&
                              trToItems.filter(isItemVisible).map((item) => (
                                <tr key={item.id}>
                                  <td className="py-0.5 pl-12">{item.name}</td>
                                  {orderedColumns.map(({ colKey }) => (
                                    <td key={colKey} className="py-0.5 px-4 text-right tabular-nums">
                                      {formatFSNumber(reportsByColKey[colKey]?.values[item.id] || 0)}
                                    </td>
                                  ))}
                                </tr>
                              ))}
                            <tr>
                              <td className="pt-1 pb-2 pl-12 font-bold">
                                Total Financial Assistance/Subsidy to NGAs, LGUs, GOCCs
                              </td>
                              {orderedColumns.map(({ colKey }) => (
                                <td
                                  key={colKey}
                                  className="pt-1 pb-2 px-4 text-right font-bold tabular-nums border-t border-black"
                                >
                                  {formatFSNumber(sumSection(trToItems, colKey))}
                                </td>
                              ))}
                            </tr>
                          </>
                        )}

                        <tr>
                          <td className="pt-1.5 pb-3 pl-6 font-bold">
                            Net Financial Assistance/Subsidy
                          </td>
                          {orderedColumns.map(({ colKey }) => (
                            <td
                              key={colKey}
                              className="pt-1.5 pb-3 px-4 text-right font-bold tabular-nums border-t border-black"
                            >
                              {formatFSNumber(getNetTransfers(colKey))}
                            </td>
                          ))}
                        </tr>
                      </>
                    )}

                    {/* OTHER NON-OPERATING INCOME */}
                    {hasAnyNonOp && (
                      <>
                        <tr>
                          <td className="pt-2 pb-1 pl-6 font-bold">Other Non-Operating Income</td>
                          {orderedColumns.map(({ colKey }) => (
                            <td key={colKey} className="pt-2 pb-1 px-4 text-right font-bold tabular-nums">
                              {isCondensed ? formatFSNumber(sumSection(nonOpItems, colKey)) : ''}
                            </td>
                          ))}
                        </tr>
                        {!isCondensed &&
                          nonOpSubgroups.map(([sgName, sgItems]) => {
                            const visSg = sgItems.filter(isItemVisible);
                            if (hideZeroRows && visSg.length === 0) return null;
                            return (
                              <React.Fragment key={`nonop-${sgName}`}>
                                <tr>
                                  <td className="pt-1 pb-0.5 pl-12 font-semibold">{sgName}</td>
                                  {orderedColumns.map(({ colKey }) => (
                                    <td
                                      key={colKey}
                                      className="pt-1 pb-0.5 px-4 text-right font-semibold tabular-nums"
                                    >
                                      {formatFSNumber(sumSection(sgItems, colKey))}
                                    </td>
                                  ))}
                                </tr>
                                {visSg.map((item) => (
                                  <tr key={item.id}>
                                    <td className="py-0.5 pl-18 align-top">
                                      <div>{item.name}</div>
                                      {renderDraftAggNotice(item.id)}
                                    </td>
                                    {orderedColumns.map(({ colKey }) => (
                                      <td key={colKey} className="py-0.5 px-4 text-right tabular-nums align-top">
                                        {formatFSNumber(reportsByColKey[colKey]?.values[item.id] || 0)}
                                      </td>
                                    ))}
                                  </tr>
                                ))}
                                <tr>
                                  <td className="pt-1 pb-2 pl-18 font-bold">Total {sgName}</td>
                                  {orderedColumns.map(({ colKey }) => (
                                    <td
                                      key={colKey}
                                      className="pt-1 pb-2 px-4 text-right font-bold tabular-nums border-t border-black"
                                    >
                                      {formatFSNumber(sumSection(sgItems, colKey))}
                                    </td>
                                  ))}
                                </tr>
                              </React.Fragment>
                            );
                          })}
                        <tr>
                          <td className="pt-1 pb-2.5 pl-6 font-bold">Total Non-Operating Income</td>
                          {orderedColumns.map(({ colKey }) => (
                            <td
                              key={colKey}
                              className="pt-1 pb-2.5 px-4 text-right font-bold tabular-nums border-t border-black"
                            >
                              {formatFSNumber(sumSection(nonOpItems, colKey))}
                            </td>
                          ))}
                        </tr>
                      </>
                    )}

                    {/* LOSSES */}
                    {hasAnyLosses && (
                      <>
                        {lossItems.filter(isItemVisible).map((item) => (
                          <tr key={item.id}>
                            <td className="pt-1.5 pb-0.5 pl-6 font-bold">{item.name}</td>
                            {orderedColumns.map(({ colKey }) => {
                              const v = reportsByColKey[colKey]?.values[item.id] || 0;
                              return (
                                <td key={colKey} className="pt-1.5 pb-0.5 px-4 text-right font-bold tabular-nums">
                                  {v ? formatFSNumber(-Math.abs(v)) : '-'}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                        <tr>
                          <td className="pt-0.5 pb-3 pl-12">Total Losses</td>
                          {orderedColumns.map(({ colKey }) => {
                            const lossAbs = sumLossAbs(colKey);
                            return (
                              <td key={colKey} className="pt-0.5 pb-3 px-4 text-right tabular-nums">
                                {lossAbs ? formatFSNumber(-lossAbs) : '-'}
                              </td>
                            );
                          })}
                        </tr>
                      </>
                    )}

                    {/* SURPLUS / (DEFICIT) FOR THE PERIOD */}
                    <tr>
                      <td className="pt-3 pb-3 font-bold uppercase">
                        Surplus/(Deficit) for the Period
                      </td>
                      {orderedColumns.map(({ colKey }) => {
                        const netSurplus =
                          sumSection(revItems, colKey) -
                          sumSection(expItems, colKey) +
                          getNetTransfers(colKey) +
                          sumSection(nonOpItems, colKey) -
                          sumLossAbs(colKey);
                        return (
                          <td
                            key={colKey}
                            className="pt-3 pb-3 px-4 text-right font-bold tabular-nums border-t border-black border-b-4 border-double"
                          >
                            {formatFSNumber(netSurplus)}
                          </td>
                        );
                      })}
                    </tr>
                  </tbody>
                </table>
              </div>
            );
          })()
        ) : statementType === 'cash_flows' ? (
          (() => {
            const renderCashFlowActivity = (
              anchorId: string,
              title: string,
              sectionKey: 'CASH_OPERATING' | 'CASH_INVESTING' | 'CASH_FINANCING',
              netLabel: string,
              getNet: (s: CashFlowsSummary) => number,
              getInflowTotal: (s: CashFlowsSummary) => number,
              getOutflowTotal: (s: CashFlowsSummary) => number
            ) => {
              const sectionItems = encodableItems.filter((i) => i.section === sectionKey);
              const inflowItems = sectionItems.filter((i) => i.subgroup !== 'Cash Outflows');
              const outflowItems = sectionItems.filter((i) => i.subgroup === 'Cash Outflows');

              const groupItems = (items: LineItemDefinition[]) => {
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

              return (
                <React.Fragment key={sectionKey}>
                  <tr id={anchorId}>
                    <td colSpan={detailedColSpan} className="pt-4 pb-1 font-bold">
                      {title}
                    </td>
                  </tr>

                  {/* Cash Inflows */}
                  <tr>
                    <td colSpan={detailedColSpan} className="pt-1 pb-0.5 pl-6 font-bold">
                      Cash Inflows
                    </td>
                  </tr>
                  {groupItems(inflowItems).map(([grp, grpItems]) => {
                    const vis = grpItems.filter(isItemVisible);
                    if (hideZeroRows && vis.length === 0) return null;
                    if (grp === 'Financing Cash Inflows') {
                      return (
                        <React.Fragment key={`${sectionKey}-in-${grp}`}>
                          {vis.map((item) => (
                            <tr key={item.id}>
                              <td className="py-0.5 pl-12">{item.name}</td>
                              {orderedColumns.map(({ colKey }) => (
                                <td key={colKey} className="py-0.5 px-4 text-right tabular-nums">
                                  {formatFSNumber(reportsByColKey[colKey]?.values[item.id] || 0)}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </React.Fragment>
                      );
                    }
                    if (isCondensed) {
                      return (
                        <tr key={`${sectionKey}-in-${grp}`}>
                          <td className="py-0.5 pl-12">{grp}</td>
                          {orderedColumns.map(({ colKey }) => (
                            <td key={colKey} className="py-0.5 px-4 text-right tabular-nums">
                              {formatFSNumber(sumItemsNet(grpItems, reportsByColKey[colKey]))}
                            </td>
                          ))}
                        </tr>
                      );
                    }
                    if (isDirectLeafGroup(grp, grpItems)) {
                      return (
                        <React.Fragment key={`${sectionKey}-in-${grp}`}>
                          {vis.map((item) => (
                            <tr key={item.id}>
                              <td className="py-0.5 pl-12">{item.name}</td>
                              {orderedColumns.map(({ colKey }) => (
                                <td key={colKey} className="py-0.5 px-4 text-right tabular-nums">
                                  {formatFSNumber(reportsByColKey[colKey]?.values[item.id] || 0)}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </React.Fragment>
                      );
                    }
                    return (
                      <React.Fragment key={`${sectionKey}-in-${grp}`}>
                        <tr>
                          <td className="pt-1.5 pb-0.5 pl-12 font-semibold">{grp}</td>
                          {orderedColumns.map(({ colKey }) => (
                            <td
                              key={colKey}
                              className="pt-1.5 pb-0.5 px-4 text-right font-semibold tabular-nums"
                            >
                              {formatFSNumber(sumItemsNet(grpItems, reportsByColKey[colKey]))}
                            </td>
                          ))}
                        </tr>
                        {vis.map((item) => (
                          <tr key={item.id}>
                            <td className="py-0.5 pl-20">{item.name}</td>
                            {orderedColumns.map(({ colKey }) => (
                              <td key={colKey} className="py-0.5 px-4 text-right tabular-nums">
                                {formatFSNumber(reportsByColKey[colKey]?.values[item.id] || 0)}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </React.Fragment>
                    );
                  })}
                  <tr>
                    <td className="pt-1.5 pb-2 pl-6 font-bold">Total Cash Inflows</td>
                    {orderedColumns.map(({ colKey }) => (
                      <td
                        key={colKey}
                        className="pt-1.5 pb-2 px-4 text-right font-bold tabular-nums border-t border-black"
                      >
                        {formatFSNumber(getInflowTotal(cashFlowsSummaryByColKey[colKey]))}
                      </td>
                    ))}
                  </tr>

                  {/* Cash Outflows */}
                  <tr>
                    <td colSpan={detailedColSpan} className="pt-1 pb-0.5 pl-6 font-bold">
                      Cash Outflows
                    </td>
                  </tr>
                  {groupItems(outflowItems).map(([grp, grpItems]) => {
                    const vis = grpItems.filter(isItemVisible);
                    if (hideZeroRows && vis.length === 0) return null;
                    if (grp === 'Financing Cash Outflows') {
                      return (
                        <React.Fragment key={`${sectionKey}-out-${grp}`}>
                          {vis.map((item) => (
                            <tr key={item.id}>
                              <td className="py-0.5 pl-12">{item.name}</td>
                              {orderedColumns.map(({ colKey }) => (
                                <td key={colKey} className="py-0.5 px-4 text-right tabular-nums">
                                  {formatFSNumber(reportsByColKey[colKey]?.values[item.id] || 0)}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </React.Fragment>
                      );
                    }
                    if (isCondensed) {
                      return (
                        <tr key={`${sectionKey}-out-${grp}`}>
                          <td className="py-0.5 pl-12">{grp}</td>
                          {orderedColumns.map(({ colKey }) => (
                            <td key={colKey} className="py-0.5 px-4 text-right tabular-nums">
                              {formatFSNumber(sumItemsNet(grpItems, reportsByColKey[colKey]))}
                            </td>
                          ))}
                        </tr>
                      );
                    }
                    if (isDirectLeafGroup(grp, grpItems)) {
                      return (
                        <React.Fragment key={`${sectionKey}-out-${grp}`}>
                          {vis.map((item) => (
                            <tr key={item.id}>
                              <td className="py-0.5 pl-12">{item.name}</td>
                              {orderedColumns.map(({ colKey }) => (
                                <td key={colKey} className="py-0.5 px-4 text-right tabular-nums">
                                  {formatFSNumber(reportsByColKey[colKey]?.values[item.id] || 0)}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </React.Fragment>
                      );
                    }
                    return (
                      <React.Fragment key={`${sectionKey}-out-${grp}`}>
                        <tr>
                          <td className="pt-1.5 pb-0.5 pl-12 font-semibold">{grp}</td>
                          {orderedColumns.map(({ colKey }) => (
                            <td
                              key={colKey}
                              className="pt-1.5 pb-0.5 px-4 text-right font-semibold tabular-nums"
                            >
                              {formatFSNumber(sumItemsNet(grpItems, reportsByColKey[colKey]))}
                            </td>
                          ))}
                        </tr>
                        {vis.map((item) => (
                          <tr key={item.id}>
                            <td className="py-0.5 pl-20">{item.name}</td>
                            {orderedColumns.map(({ colKey }) => (
                              <td key={colKey} className="py-0.5 px-4 text-right tabular-nums">
                                {formatFSNumber(reportsByColKey[colKey]?.values[item.id] || 0)}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </React.Fragment>
                    );
                  })}
                  <tr>
                    <td className="pt-1.5 pb-2 pl-6 font-bold">Total Cash Outflows</td>
                    {orderedColumns.map(({ colKey }) => (
                      <td
                        key={colKey}
                        className="pt-1.5 pb-2 px-4 text-right font-bold tabular-nums border-t border-black"
                      >
                        {formatFSNumber(getOutflowTotal(cashFlowsSummaryByColKey[colKey]))}
                      </td>
                    ))}
                  </tr>

                  {/* Net Activity */}
                  <tr>
                    <td className="pt-2 pb-3 pl-4 font-bold">{netLabel}</td>
                    {orderedColumns.map(({ colKey }) => (
                      <td
                        key={colKey}
                        className="pt-2 pb-3 px-4 text-right font-bold tabular-nums border-t border-black"
                      >
                        {formatFSNumber(getNet(cashFlowsSummaryByColKey[colKey]))}
                      </td>
                    ))}
                  </tr>
                </React.Fragment>
              );
            };

            const hasAnyFx = orderedColumns.some(
              ({ colKey }) => Math.abs(cashFlowsSummaryByColKey[colKey]?.fxEffects || 0) >= 0.005
            );

            return (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm border-collapse">
                  <thead>
                    <tr>
                      <th className="py-1.5 pr-4 text-left font-bold uppercase w-3/5 text-sm">
                        Cash Flow Activity
                      </th>
                      {orderedColumns.map(({ colKey, label }) => (
                        <th
                          key={colKey}
                          className="py-1.5 px-4 text-center font-bold text-sm border-b border-black"
                        >
                          {label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {renderCashFlowActivity(
                      'draft-cf-operating',
                      'Cash Flows from Operating Activities',
                      'CASH_OPERATING',
                      'Net Cash Provided by (Used in) Operating Activities',
                      (s) => s.netOperating,
                      (s) => s.operatingInflows,
                      (s) => s.operatingOutflows
                    )}
                    {renderCashFlowActivity(
                      'draft-cf-investing',
                      'Cash Flows from Investing Activities',
                      'CASH_INVESTING',
                      'Net Cash Provided by (Used in) Investing Activities',
                      (s) => s.netInvesting,
                      (s) => s.investingInflows,
                      (s) => s.investingOutflows
                    )}
                    {renderCashFlowActivity(
                      'draft-cf-financing',
                      'Cash Flows from Financing Activities',
                      'CASH_FINANCING',
                      'Net Cash Provided by (Used in) Financing Activities',
                      (s) => s.netFinancing,
                      (s) => s.financingInflows,
                      (s) => s.financingOutflows
                    )}

                    {/* Reconciliation */}
                    <tr id="draft-cf-reconciliation">
                      <td className="pt-4 pb-1 font-bold">
                        Increase/(Decrease) in Cash and Cash Equivalents
                      </td>
                      {orderedColumns.map(({ colKey }) => (
                        <td
                          key={colKey}
                          className="pt-4 pb-1 px-4 text-right font-bold tabular-nums border-t border-black"
                        >
                          {formatFSNumber(cashFlowsSummaryByColKey[colKey].netIncreaseDecrease)}
                        </td>
                      ))}
                    </tr>
                    {(hasAnyFx || !hideZeroRows) && (
                      <tr>
                        <td className="py-1 pl-6">
                          Effects of Exchange Rate Changes on Cash and Cash Equivalents
                        </td>
                        {orderedColumns.map(({ colKey }) => (
                          <td key={colKey} className="py-1 px-4 text-right tabular-nums">
                            {formatFSNumber(cashFlowsSummaryByColKey[colKey].fxEffects)}
                          </td>
                        ))}
                      </tr>
                    )}
                    <tr>
                      <td className="py-1 font-bold">Cash and Cash Equivalents, January 1</td>
                      {orderedColumns.map(({ target, colKey }) => {
                        const jan1Val = cashFlowsSummaryByColKey[colKey].january1Cash;
                        const canEncode2024 =
                          target.targetYear === '2024' && Boolean(onUpdateBegCash2024);

                        return (
                          <td key={colKey} className="py-1 px-4 text-right font-bold tabular-nums">
                            {canEncode2024 && isEditingJan1_2024 ? (
                              <div className="inline-flex items-center justify-end gap-1 no-print font-sans">
                                <input
                                  type="text"
                                  value={jan1_2024Input}
                                  onChange={(e) => setJan1_2024Input(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      e.preventDefault();
                                      onUpdateBegCash2024?.(parseNumberInput(jan1_2024Input));
                                      setIsEditingJan1_2024(false);
                                    } else if (e.key === 'Escape') {
                                      setIsEditingJan1_2024(false);
                                    }
                                  }}
                                  placeholder="0.00"
                                  autoFocus
                                  className="w-32 px-2 py-0.5 text-right text-sm font-mono font-bold bg-white text-black border border-sky-500 rounded focus:outline-none focus:ring-2 focus:ring-sky-400"
                                />
                                <button
                                  type="button"
                                  onClick={() => {
                                    onUpdateBegCash2024?.(parseNumberInput(jan1_2024Input));
                                    setIsEditingJan1_2024(false);
                                  }}
                                  title="Apply Jan 1, 2024 Beginning Cash"
                                  className="p-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer"
                                >
                                  <Check className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setIsEditingJan1_2024(false)}
                                  title="Cancel"
                                  className="p-1 rounded bg-slate-200 hover:bg-slate-300 text-slate-800 cursor-pointer"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ) : (
                              <div className="inline-flex items-center justify-end gap-1.5">
                                <span>{formatFSNumber(jan1Val)}</span>
                                {canEncode2024 && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setJan1_2024Input(jan1Val !== 0 ? String(jan1Val) : '');
                                      setIsEditingJan1_2024(true);
                                    }}
                                    title={
                                      jan1Val === 0
                                        ? 'Encode FY 2024 Beginning Cash (Jan 1)'
                                        : 'Edit FY 2024 Beginning Cash (Jan 1)'
                                    }
                                    className="no-print font-sans inline-flex items-center gap-1 px-1.5 py-0.5 text-[11px] font-bold rounded border border-sky-400/70 bg-sky-50 hover:bg-sky-100 text-sky-800 cursor-pointer transition-colors"
                                  >
                                    <Pencil className="w-2.5 h-2.5" />
                                    <span>{jan1Val === 0 ? 'Encode' : 'Edit'}</span>
                                  </button>
                                )}
                              </div>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                    <tr>
                      <td className="pt-1.5 pb-3 font-bold uppercase">
                        Cash and Cash Equivalents, December 31
                      </td>
                      {orderedColumns.map(({ colKey }) => (
                        <td
                          key={colKey}
                          className="pt-1.5 pb-3 px-4 text-right font-bold tabular-nums border-t border-black border-b-4 border-double"
                        >
                          {formatFSNumber(cashFlowsSummaryByColKey[colKey].december31Cash)}
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>
            );
          })()
        ) : statementType === 'net_assets' ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm border-collapse">
              <thead>
                <tr>
                  <th className="py-1.5 pr-4 text-left font-bold uppercase w-3/5 text-sm">
                    Particulars
                  </th>
                  {orderedColumns.map(({ colKey, label }) => (
                    <th
                      key={colKey}
                      className="py-1.5 px-4 text-center font-bold text-sm border-b border-black"
                    >
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr id="draft-na-beginning">
                  <td className="pt-4 pb-1 font-bold">Balance at January 1</td>
                  {orderedColumns.map(({ target, colKey }) => {
                    const jan1Val = netAssetsSummaryByColKey[colKey].january1Balance;
                    const canEncode2024 =
                      target.targetYear === '2024' && Boolean(onUpdateBegNetAssets2024);

                    return (
                      <td key={colKey} className="pt-4 pb-1 px-4 text-right font-bold tabular-nums">
                        {canEncode2024 && isEditingNaJan1_2024 ? (
                          <div className="inline-flex items-center justify-end gap-1 no-print font-sans">
                            <input
                              type="text"
                              value={naJan1_2024Input}
                              onChange={(e) => setNaJan1_2024Input(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  onUpdateBegNetAssets2024?.(parseNumberInput(naJan1_2024Input));
                                  setIsEditingNaJan1_2024(false);
                                } else if (e.key === 'Escape') {
                                  setIsEditingNaJan1_2024(false);
                                }
                              }}
                              placeholder="0.00"
                              autoFocus
                              className="w-32 px-2 py-0.5 text-right text-sm font-mono font-bold bg-white text-black border border-sky-500 rounded focus:outline-none focus:ring-2 focus:ring-sky-400"
                            />
                            <button
                              type="button"
                              onClick={() => {
                                onUpdateBegNetAssets2024?.(parseNumberInput(naJan1_2024Input));
                                setIsEditingNaJan1_2024(false);
                              }}
                              title="Apply Jan 1, 2024 Beginning Balance"
                              className="p-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer"
                            >
                              <Check className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setIsEditingNaJan1_2024(false)}
                              title="Cancel"
                              className="p-1 rounded bg-slate-200 hover:bg-slate-300 text-slate-800 cursor-pointer"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <div className="inline-flex items-center justify-end gap-1.5">
                            <span>{formatFSNumber(jan1Val)}</span>
                            {canEncode2024 && (
                              <button
                                type="button"
                                onClick={() => {
                                  setNaJan1_2024Input(jan1Val !== 0 ? String(jan1Val) : '');
                                  setIsEditingNaJan1_2024(true);
                                }}
                                title={
                                  jan1Val === 0
                                    ? 'Encode FY 2024 Beginning Balance (Jan 1)'
                                    : 'Edit FY 2024 Beginning Balance (Jan 1)'
                                }
                                className="no-print font-sans inline-flex items-center gap-1 px-1.5 py-0.5 text-[11px] font-bold rounded border border-sky-400/70 bg-sky-50 hover:bg-sky-100 text-sky-800 cursor-pointer transition-colors"
                              >
                                <Pencil className="w-2.5 h-2.5" />
                                <span>{jan1Val === 0 ? 'Encode' : 'Edit'}</span>
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
                <tr>
                  <td colSpan={detailedColSpan} className="pt-2 pb-1 pl-6 font-bold">
                    Add/(Deduct):
                  </td>
                </tr>
                <tr>
                  <td className="py-0.5 pl-12">Changes in Accounting Policy</td>
                  {orderedColumns.map(({ colKey }) => (
                    <td key={colKey} className="py-0.5 px-4 text-right tabular-nums">
                      {formatFSNumber(netAssetsSummaryByColKey[colKey].changesInAccountingPolicy)}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="py-0.5 pl-12">Prior period errors</td>
                  {orderedColumns.map(({ colKey }) => (
                    <td key={colKey} className="py-0.5 px-4 text-right tabular-nums">
                      {formatFSNumber(netAssetsSummaryByColKey[colKey].priorPeriodErrors)}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="py-0.5 pl-12">Other Adjustments</td>
                  {orderedColumns.map(({ colKey }) => (
                    <td key={colKey} className="py-0.5 px-4 text-right tabular-nums">
                      {formatFSNumber(netAssetsSummaryByColKey[colKey].otherAdjustments)}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="pt-2 pb-3 font-bold">Restated Balance</td>
                  {orderedColumns.map(({ colKey }) => (
                    <td
                      key={colKey}
                      className="pt-2 pb-3 px-4 text-right font-bold tabular-nums border-t border-black"
                    >
                      {formatFSNumber(netAssetsSummaryByColKey[colKey].restatedBalance)}
                    </td>
                  ))}
                </tr>

                <tr id="draft-na-changes">
                  <td colSpan={detailedColSpan} className="pt-2 pb-0.5 font-bold">
                    Add/(Deduct):
                  </td>
                </tr>
                <tr>
                  <td colSpan={detailedColSpan} className="pt-0.5 pb-1 font-bold">
                    Changes in Net Assets/Equity for the Calendar Year
                  </td>
                </tr>
                <tr>
                  <td className="py-0.5 pl-12">Surplus/(Deficit) for the Period</td>
                  {orderedColumns.map(({ colKey }) => (
                    <td key={colKey} className="py-0.5 px-4 text-right tabular-nums">
                      {formatFSNumber(netAssetsSummaryByColKey[colKey].surplusDeficitForPeriod)}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="py-0.5 pl-12">
                    Adjustment of net revenue recognized directly in net assets/equity
                  </td>
                  {orderedColumns.map(({ colKey }) => (
                    <td key={colKey} className="py-0.5 px-4 text-right tabular-nums">
                      {formatFSNumber(netAssetsSummaryByColKey[colKey].netRevenueAdjustment)}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="py-0.5 pl-12">Others</td>
                  {orderedColumns.map(({ colKey }) => (
                    <td key={colKey} className="py-0.5 px-4 text-right tabular-nums">
                      {formatFSNumber(netAssetsSummaryByColKey[colKey].others)}
                    </td>
                  ))}
                </tr>

                <tr id="draft-na-ending">
                  <td className="pt-3 pb-3 font-bold uppercase">Balance at December 31</td>
                  {orderedColumns.map(({ colKey }) => (
                    <td
                      key={colKey}
                      className="pt-3 pb-3 px-4 text-right font-bold tabular-nums border-t border-black border-b-4 border-double"
                    >
                      {formatFSNumber(netAssetsSummaryByColKey[colKey].december31Balance)}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        ) : isCondensed ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[12pt] border-collapse">
              <thead>
                <tr>
                  <th className="py-1.5 pr-4 w-1/2"></th>
                  <th className="py-1.5 px-3 text-center font-bold w-16">Note</th>
                  {orderedColumns.map(({ colKey, label }) => (
                    <th key={colKey} className="py-1.5 px-4 text-center font-bold border-b border-black">
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr id="draft-assets-section">
                  <td colSpan={condensedColSpan} className="pt-3 pb-1 font-bold uppercase">
                    ASSETS
                  </td>
                </tr>
                <tr>
                  <td colSpan={condensedColSpan} className="pb-1 font-bold">
                    Current Assets
                  </td>
                </tr>
                {sectionsHierarchy['Current Assets'] &&
                  Object.entries(sectionsHierarchy['Current Assets']).map(([groupName, subgroups]) => {
                    if (hideZeroRows && !isGroupVisible(subgroups)) return null;
                    return (
                      <tr key={groupName}>
                        <td className="py-0.5 pl-8">{groupName}</td>
                        <td className="py-0.5 px-1 text-center font-bold">
                          {CONDENSED_NOTES[groupName] ?? ''}
                        </td>
                        {orderedColumns.map(({ colKey }) => (
                          <td key={colKey} className="py-0.5 px-4 text-right tabular-nums">
                            {formatFSNumber(sumSubgroupsNet(subgroups, reportsByColKey[colKey]))}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                <tr>
                  <td className="pt-1 pb-3 pl-8 font-bold">Total Current Assets</td>
                  <td></td>
                  {orderedColumns.map(({ colKey }) => (
                    <td key={colKey} className="pt-1 pb-3 px-4 text-right font-bold tabular-nums border-t border-black">
                      {formatFSNumber(reportsByColKey[colKey].totalCurrentAssets)}
                    </td>
                  ))}
                </tr>

                <tr>
                  <td colSpan={condensedColSpan} className="pt-2 pb-1 font-bold">
                    Non-Current Assets
                  </td>
                </tr>
                {sectionsHierarchy['Non-Current Assets'] &&
                  Object.entries(sectionsHierarchy['Non-Current Assets']).map(([groupName, subgroups]) => {
                    if (hideZeroRows && !isGroupVisible(subgroups)) return null;
                    const showAggregatedNotice =
                      groupName === 'Property, Plant and Equipment' && hasAggregatedDep;
                    return (
                      <tr key={groupName}>
                        <td className="py-0.5 pl-8">
                          <div>{groupName}</div>
                          {showAggregatedNotice && (
                            <div className="text-[10pt] text-red-700 font-bold italic">
                              Notice: Includes Aggregated Accumulated Depreciation (excluded from Consolidated FS)
                            </div>
                          )}
                        </td>
                        <td className="py-0.5 px-1 text-center font-bold align-top">
                          {CONDENSED_NOTES[groupName] ?? ''}
                        </td>
                        {orderedColumns.map(({ colKey }) => (
                          <td key={colKey} className="py-0.5 px-4 text-right tabular-nums align-top">
                            {formatFSNumber(sumSubgroupsNet(subgroups, reportsByColKey[colKey]))}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                <tr>
                  <td className="pt-1 pb-1 pl-8 font-bold">Total Non-Current Assets</td>
                  <td></td>
                  {orderedColumns.map(({ colKey }) => (
                    <td key={colKey} className="pt-1 pb-1 px-4 text-right font-bold tabular-nums border-t border-black">
                      {formatFSNumber(reportsByColKey[colKey].totalNonCurrentAssets)}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="pt-1 pb-4 font-bold uppercase">TOTAL ASSETS</td>
                  <td></td>
                  {orderedColumns.map(({ colKey }) => (
                    <td
                      key={colKey}
                      className="pt-1 pb-4 px-4 text-right font-bold tabular-nums border-t border-black border-b-4 border-double"
                    >
                      {formatFSNumber(reportsByColKey[colKey].totalAssets)}
                    </td>
                  ))}
                </tr>

                <tr id="draft-liabilities-section">
                  <td colSpan={condensedColSpan} className="pt-2 pb-1 font-bold uppercase">
                    LIABILITIES
                  </td>
                </tr>
                <tr>
                  <td colSpan={condensedColSpan} className="pb-1 font-bold">
                    Current Liabilities
                  </td>
                </tr>
                {sectionsHierarchy['Current Liabilities'] &&
                  Object.entries(sectionsHierarchy['Current Liabilities']).map(([groupName, subgroups]) => {
                    if (hideZeroRows && !isGroupVisible(subgroups)) return null;
                    return (
                      <tr key={groupName}>
                        <td className="py-0.5 pl-8">{groupName}</td>
                        <td className="py-0.5 px-1 text-center font-bold">
                          {CONDENSED_NOTES[groupName] ?? ''}
                        </td>
                        {orderedColumns.map(({ colKey }) => (
                          <td key={colKey} className="py-0.5 px-4 text-right tabular-nums">
                            {formatFSNumber(sumSubgroupsNet(subgroups, reportsByColKey[colKey]))}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                <tr>
                  <td className="pt-1 pb-3 pl-8 font-bold">Total Current Liabilities</td>
                  <td></td>
                  {orderedColumns.map(({ colKey }) => (
                    <td key={colKey} className="pt-1 pb-3 px-4 text-right font-bold tabular-nums border-t border-black">
                      {formatFSNumber(reportsByColKey[colKey].totalCurrentLiabilities)}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="pt-1 pb-3 font-bold uppercase">TOTAL LIABILITIES</td>
                  <td></td>
                  {orderedColumns.map(({ colKey }) => (
                    <td
                      key={colKey}
                      className="pt-1 pb-3 px-4 text-right font-bold tabular-nums border-t border-black border-b border-black"
                    >
                      {formatFSNumber(reportsByColKey[colKey].totalLiabilities)}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="pt-1 pb-4 font-bold">Total Assets less Total Liabilities</td>
                  <td></td>
                  {orderedColumns.map(({ colKey }) => (
                    <td
                      key={colKey}
                      className="pt-1 pb-4 px-4 text-right font-bold tabular-nums border-b-4 border-double border-black"
                    >
                      {formatFSNumber(reportsByColKey[colKey].assetsLessLiabilities)}
                    </td>
                  ))}
                </tr>

                <tr id="draft-equity-section">
                  <td colSpan={condensedColSpan} className="pt-2 pb-1 font-bold uppercase">
                    NET ASSETS/EQUITY
                  </td>
                </tr>
                <tr>
                  <td className="py-0.5">Accumulated Surplus/(Deficit)</td>
                  <td></td>
                  {orderedColumns.map(({ colKey }) => (
                    <td key={colKey} className="py-0.5 px-4 text-right tabular-nums">
                      {formatFSNumber(reportsByColKey[colKey].netAssetsEquity)}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="pt-1 pb-2 font-bold">Total Net Assets/Equity</td>
                  <td></td>
                  {orderedColumns.map(({ colKey }) => (
                    <td
                      key={colKey}
                      className="pt-1 pb-2 px-4 text-right font-bold tabular-nums border-t border-black border-b-4 border-double"
                    >
                      {formatFSNumber(reportsByColKey[colKey].netAssetsEquity)}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm border-collapse">
              <thead>
                <tr>
                  <th className="py-1.5 pr-4 text-left font-normal uppercase w-3/5 text-sm">
                    ASSETS
                  </th>
                  {orderedColumns.map(({ colKey, label }) => (
                    <th key={colKey} className="py-1.5 px-4 text-center font-bold text-sm border-b border-black">
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {/* 1. CURRENT ASSETS */}
                <tr id="draft-assets-section">
                  <td colSpan={detailedColSpan} className="pt-4 pb-2 font-bold">
                    Current Assets
                  </td>
                </tr>
                {sectionsHierarchy['Current Assets'] &&
                  Object.entries(sectionsHierarchy['Current Assets']).map(([groupName, subgroups]) => {
                    if (hideZeroRows && !isGroupVisible(subgroups)) return null;
                    return (
                      <React.Fragment key={groupName}>
                        <tr>
                          <td className="pt-3 pb-1 pl-10 font-bold">{groupName}</td>
                          {orderedColumns.map(({ colKey }) => (
                            <td key={colKey} className="pt-3 pb-1 px-4 text-right font-bold tabular-nums">
                              {formatFSNumber(sumSubgroupsNet(subgroups, reportsByColKey[colKey]))}
                            </td>
                          ))}
                        </tr>
                        {Object.entries(subgroups).map(([subgroupName, items]) => {
                          if (hideZeroRows && !isSubgroupVisible(items)) return null;
                          const showSubgroupHeader = subgroupName !== 'General' && subgroupName !== groupName;
                          return (
                            <React.Fragment key={subgroupName}>
                              {showSubgroupHeader && (
                                <tr>
                                  <td className="pt-2 pb-0.5 pl-20 font-normal">{subgroupName}</td>
                                  {orderedColumns.map(({ colKey }) => (
                                    <td key={colKey} className="pt-2 pb-0.5 px-4 text-right font-bold tabular-nums">
                                      {formatFSNumber(sumItemsNet(items, reportsByColKey[colKey]))}
                                    </td>
                                  ))}
                                </tr>
                              )}
                              {renderItemsWithNetValue(items, showSubgroupHeader ? 'pl-32' : 'pl-20', true)}
                            </React.Fragment>
                          );
                        })}
                      </React.Fragment>
                    );
                  })}
                <tr>
                  <td className="pt-3 pb-2 pl-10 font-bold">Total Current Assets</td>
                  {orderedColumns.map(({ colKey }) => (
                    <td key={colKey} className="pt-3 pb-2 px-4 text-right font-bold tabular-nums">
                      {formatFSNumber(reportsByColKey[colKey].totalCurrentAssets)}
                    </td>
                  ))}
                </tr>

                {/* 2. NON-CURRENT ASSETS */}
                <tr>
                  <td colSpan={detailedColSpan} className="pt-4 pb-2 font-bold">
                    Non-Current Assets
                  </td>
                </tr>
                {sectionsHierarchy['Non-Current Assets'] &&
                  Object.entries(sectionsHierarchy['Non-Current Assets']).map(([groupName, subgroups]) => {
                    if (hideZeroRows && !isGroupVisible(subgroups)) return null;
                    return (
                      <React.Fragment key={groupName}>
                        <tr>
                          <td className="pt-3 pb-1 pl-10 font-bold">{groupName}</td>
                          {orderedColumns.map(({ colKey }) => (
                            <td key={colKey} className="pt-3 pb-1 px-4 text-right font-bold tabular-nums">
                              {formatFSNumber(sumSubgroupsNet(subgroups, reportsByColKey[colKey]))}
                            </td>
                          ))}
                        </tr>
                        {Object.entries(subgroups).map(([subgroupName, items]) => {
                          if (hideZeroRows && !isSubgroupVisible(items)) return null;
                          const showSubgroupHeader = subgroupName !== 'General' && subgroupName !== groupName;
                          return (
                            <React.Fragment key={subgroupName}>
                              {showSubgroupHeader && (
                                <tr>
                                  <td className="pt-2 pb-0.5 pl-20 font-normal">{subgroupName}</td>
                                  {orderedColumns.map(({ colKey }) => (
                                    <td key={colKey} className="pt-2 pb-0.5 px-4 text-right font-bold tabular-nums">
                                      {formatFSNumber(sumItemsNet(items, reportsByColKey[colKey]))}
                                    </td>
                                  ))}
                                </tr>
                              )}
                              {renderItemsWithNetValue(items, showSubgroupHeader ? 'pl-32' : 'pl-20', true)}
                            </React.Fragment>
                          );
                        })}
                        {groupName === 'Property, Plant and Equipment' && hasAggregatedDep && (
                          <tr>
                            <td className="pt-1 pb-2 pl-20 font-bold">
                              Property, Plant and Equipment (Net)
                            </td>
                            {orderedColumns.map(({ colKey }) => (
                              <td
                                key={colKey}
                                className="pt-1 pb-2 px-4 text-right font-bold tabular-nums border-t border-black"
                              >
                                {formatFSNumber(sumSubgroupsNet(subgroups, reportsByColKey[colKey]))}
                              </td>
                            ))}
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                <tr>
                  <td className="pt-3 pb-2 pl-10 font-bold">Total Non-Current Assets</td>
                  {orderedColumns.map(({ colKey }) => (
                    <td key={colKey} className="pt-3 pb-2 px-4 text-right font-bold tabular-nums">
                      {formatFSNumber(reportsByColKey[colKey].totalNonCurrentAssets)}
                    </td>
                  ))}
                </tr>

                {/* TOTAL ASSETS */}
                <tr>
                  <td className="pt-4 pb-3 font-bold uppercase">TOTAL ASSETS</td>
                  {orderedColumns.map(({ colKey }) => (
                    <td key={colKey} className="pt-4 pb-3 px-4 text-right font-bold tabular-nums">
                      {formatFSNumber(reportsByColKey[colKey].totalAssets)}
                    </td>
                  ))}
                </tr>

                {/* LIABILITIES */}
                <tr id="draft-liabilities-section">
                  <td colSpan={detailedColSpan} className="pt-5 pb-2 font-bold uppercase">
                    LIABILITIES
                  </td>
                </tr>
                <tr>
                  <td colSpan={detailedColSpan} className="pt-2 pb-2 font-bold">
                    Current Liabilities
                  </td>
                </tr>
                {sectionsHierarchy['Current Liabilities'] &&
                  Object.entries(sectionsHierarchy['Current Liabilities']).map(([groupName, subgroups]) => {
                    if (hideZeroRows && !isGroupVisible(subgroups)) return null;
                    return (
                      <React.Fragment key={groupName}>
                        <tr>
                          <td className="pt-3 pb-1 pl-10 font-bold">{groupName}</td>
                          {orderedColumns.map(({ colKey }) => (
                            <td key={colKey} className="pt-3 pb-1 px-4 text-right font-bold tabular-nums">
                              {formatFSNumber(sumSubgroupsNet(subgroups, reportsByColKey[colKey]))}
                            </td>
                          ))}
                        </tr>
                        {Object.entries(subgroups).map(([subgroupName, items]) => {
                          if (hideZeroRows && !isSubgroupVisible(items)) return null;
                          const showSubgroupHeader = subgroupName !== 'General' && subgroupName !== groupName;
                          return (
                            <React.Fragment key={subgroupName}>
                              {showSubgroupHeader && (
                                <tr>
                                  <td className="pt-2 pb-0.5 pl-20 font-normal">{subgroupName}</td>
                                  {orderedColumns.map(({ colKey }) => (
                                    <td key={colKey} className="pt-2 pb-0.5 px-4 text-right font-bold tabular-nums">
                                      {formatFSNumber(sumItemsNet(items, reportsByColKey[colKey]))}
                                    </td>
                                  ))}
                                </tr>
                              )}
                              {renderItemsWithNetValue(items, showSubgroupHeader ? 'pl-32' : 'pl-20', true)}
                            </React.Fragment>
                          );
                        })}
                      </React.Fragment>
                    );
                  })}
                <tr>
                  <td className="pt-3 pb-2 pl-10 font-bold">Total Current Liabilities</td>
                  {orderedColumns.map(({ colKey }) => (
                    <td key={colKey} className="pt-3 pb-2 px-4 text-right font-bold tabular-nums">
                      {formatFSNumber(reportsByColKey[colKey].totalCurrentLiabilities)}
                    </td>
                  ))}
                </tr>

                {sectionsHierarchy['Non-Current Liabilities'] &&
                  Object.values(sectionsHierarchy['Non-Current Liabilities']).some((subgroups) =>
                    isGroupVisible(subgroups)
                  ) && (
                    <>
                      <tr>
                        <td colSpan={detailedColSpan} className="pt-2 pb-2 font-bold">
                          Non-Current Liabilities
                        </td>
                      </tr>
                      {Object.entries(sectionsHierarchy['Non-Current Liabilities']).map(
                        ([groupName, subgroups]) => {
                          if (hideZeroRows && !isGroupVisible(subgroups)) return null;
                          return (
                            <React.Fragment key={groupName}>
                              <tr>
                                <td className="pt-3 pb-1 pl-10 font-bold">{groupName}</td>
                                {orderedColumns.map(({ colKey }) => (
                                  <td key={colKey} className="pt-3 pb-1 px-4 text-right font-bold tabular-nums">
                                    {formatFSNumber(sumSubgroupsNet(subgroups, reportsByColKey[colKey]))}
                                  </td>
                                ))}
                              </tr>
                              {Object.entries(subgroups).map(([subgroupName, items]) => {
                                if (hideZeroRows && !isSubgroupVisible(items)) return null;
                                const showSubgroupHeader = subgroupName !== 'General' && subgroupName !== groupName;
                                return (
                                  <React.Fragment key={subgroupName}>
                                    {showSubgroupHeader && (
                                      <tr>
                                        <td className="pt-2 pb-0.5 pl-20 font-normal">{subgroupName}</td>
                                        {orderedColumns.map(({ colKey }) => (
                                          <td key={colKey} className="pt-2 pb-0.5 px-4 text-right font-bold tabular-nums">
                                            {formatFSNumber(sumItemsNet(items, reportsByColKey[colKey]))}
                                          </td>
                                        ))}
                                      </tr>
                                    )}
                                    {renderItemsWithNetValue(items, showSubgroupHeader ? 'pl-32' : 'pl-20', true)}
                                  </React.Fragment>
                                );
                              })}
                            </React.Fragment>
                          );
                        }
                      )}
                    </>
                  )}

                <tr>
                  <td className="pt-1 pb-2 pl-10 font-bold">Total Non-Current Liabilities</td>
                  {orderedColumns.map(({ colKey }) => (
                    <td key={colKey} className="pt-1 pb-2 px-4 text-right font-bold tabular-nums">
                      {formatFSNumber(reportsByColKey[colKey].totalNonCurrentLiabilities)}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="pt-3 pb-2 pl-10 font-bold">Total Liabilities</td>
                  {orderedColumns.map(({ colKey }) => (
                    <td key={colKey} className="pt-3 pb-2 px-4 text-right font-bold tabular-nums">
                      {formatFSNumber(reportsByColKey[colKey].totalLiabilities)}
                    </td>
                  ))}
                </tr>

                <tr>
                  <td className="pt-4 pb-2 font-bold">Total Assets less Total Liabilities</td>
                  {orderedColumns.map(({ colKey }) => (
                    <td key={colKey} className="pt-4 pb-2 px-4 text-right font-bold tabular-nums">
                      {formatFSNumber(reportsByColKey[colKey].assetsLessLiabilities)}
                    </td>
                  ))}
                </tr>

                {/* NET ASSETS / EQUITY */}
                <tr id="draft-equity-section">
                  <td colSpan={detailedColSpan} className="pt-4 pb-2 font-bold">
                    Net Assets/Equity
                  </td>
                </tr>
                {sectionsHierarchy['Net Assets/Equity'] &&
                  Object.entries(sectionsHierarchy['Net Assets/Equity']).map(([groupName, subgroups]) => (
                    <React.Fragment key={groupName}>
                      <tr>
                        <td className="pt-2 pb-1 pl-10 font-bold">{groupName}</td>
                        {orderedColumns.map(({ colKey }) => (
                          <td key={colKey} className="pt-2 pb-1 px-4 text-right font-bold tabular-nums">
                            {formatFSNumber(sumSubgroupsNet(subgroups, reportsByColKey[colKey]))}
                          </td>
                        ))}
                      </tr>
                      {Object.values(subgroups)
                        .flat()
                        .map((item) => {
                          if (!isItemVisible(item)) return null;
                          return (
                            <tr key={item.id}>
                              <td className="py-0.5 pl-20">{item.name}</td>
                              {orderedColumns.map(({ colKey }) => (
                                <td key={colKey} className="py-0.5 px-4 text-right tabular-nums">
                                  {formatFSNumber(reportsByColKey[colKey].values[item.id] || 0)}
                                </td>
                              ))}
                            </tr>
                          );
                        })}
                    </React.Fragment>
                  ))}
                <tr>
                  <td className="pt-4 pb-3 font-bold">Total Net Assets/Equity</td>
                  {orderedColumns.map(({ colKey }) => (
                    <td key={colKey} className="pt-4 pb-3 px-4 text-right font-bold tabular-nums">
                      {formatFSNumber(reportsByColKey[colKey].netAssetsEquity)}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
