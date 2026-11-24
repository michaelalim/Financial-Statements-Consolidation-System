import React, { useState, useMemo, useEffect } from 'react';
import {
  Division,
  LineItemDefinition,
  FinancialDataStore,
  AggregationMetadataStore,
  DivisionAggregationRecord,
} from '../types/fs';
import { calculateReport } from '../utils/calculations';
import { calculateCashFlowsSummary, CashFlowsSummary } from '../utils/cashFlowCalculations';
import { calculateNetAssetsSummary } from '../utils/netAssetsCalculations';
import { formatAccounting, parseNumberInput } from '../utils/formatters';
import { YEAR_RANGE, getComparativeYear } from '../utils/yearUtils';
import { AGGREGATED_ACCUMULATED_DEPRECIATION_ID } from '../data/defaultLineItems';
import { AccountingBalanceCheck } from './AccountingBalanceCheck';
import { FinancialStatementSidebar, FinancialStatementType } from './FinancialStatementSidebar';
import {
  Printer,
  Download,
  Eye,
  EyeOff,
  Search,
  X,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Info,
  AlertTriangle,
  Check,
  Pencil,
} from 'lucide-react';

interface DivisionalFSViewProps {
  divisions: Division[];
  lineItems: LineItemDefinition[];
  selectedDivisionId: string;
  onSelectDivision: (id: string) => void;
  selectedYear: string;
  onSelectYear: (year: string) => void;
  dataStore: FinancialDataStore;
  aggregationStore?: AggregationMetadataStore;
  onSaveAmount?: (year: string, divisionId: string, lineItemId: string, amount: number) => void;
  selectedStatement?: FinancialStatementType;
  onSelectStatement?: (stmt: FinancialStatementType) => void;
}

export const DivisionalFSView: React.FC<DivisionalFSViewProps> = ({
  divisions,
  lineItems,
  selectedDivisionId,
  onSelectDivision,
  selectedYear,
  onSelectYear,
  dataStore,
  aggregationStore,
  onSaveAmount,
  selectedStatement: controlledStatement,
  onSelectStatement,
}) => {
  // Default: Remove zero balance items as requested
  const [hideZeroRows, setHideZeroRows] = useState(true);
  const [showComparative, setShowComparative] = useState(true);
  const [isCondensed, setIsCondensed] = useState(false);
  const [internalStatement, setInternalStatement] = useState<FinancialStatementType>('position');
  const selectedStatement = controlledStatement ?? internalStatement;
  const setSelectedStatement = onSelectStatement ?? setInternalStatement;
  const [isEditingJan1_2024, setIsEditingJan1_2024] = useState(false);
  const [jan1_2024Input, setJan1_2024Input] = useState('');

  useEffect(() => {
    setIsEditingJan1_2024(false);
  }, [selectedDivisionId, selectedYear, selectedStatement]);
  const [expandedAggRowIds, setExpandedAggRowIds] = useState<Record<string, boolean>>({});
  const [isAggNoticeExpanded, setIsAggNoticeExpanded] = useState(false);
  const [condensedNotes, setCondensedNotes] = useState<Record<string, string>>(() => {
    try {
      const saved = localStorage.getItem("deped_ro6_condensed_notes_v1");
      if (saved) return JSON.parse(saved);
    } catch {}
    return {
      "Cash and Cash Equivalents": "6",
      "Receivables": "7",
      "Inventories": "8",
      "Other Current Assets": "9",
      "Property, Plant and Equipment": "10",
      "Biological Assets": "11",
      "Intangible Assets": "12",
      "Other Non-Current Assets": "13",
      "Financial Liabilities": "14",
      "Inter-Agency Payables": "15",
      "Intra-Agency Payables": "16",
      "Trust Liabilities": "17",
      "Other Payables": "19",
    };
  });

  const handleNoteChange = (groupName: string, val: string) => {
    setCondensedNotes((prev) => {
      const next = { ...prev, [groupName]: val };
      try {
        localStorage.setItem("deped_ro6_condensed_notes_v1", JSON.stringify(next));
      } catch {}
      return next;
    });
  };
  const [searchQuery, setSearchQuery] = useState('');

  // Automatic comparative year: selecting 2026 automatically compares with 2025!
  const priorYear = getComparativeYear(selectedYear);

  const currentDivisionIndex = divisions.findIndex((d) => d.id === selectedDivisionId);
  const currentDivision = currentDivisionIndex >= 0 ? divisions[currentDivisionIndex] : divisions[0];
  const hasPrevDivision = currentDivisionIndex > 0;
  const hasNextDivision = currentDivisionIndex >= 0 && currentDivisionIndex < divisions.length - 1;

  // Report for current year
  const reportCurrent = useMemo(() => {
    return calculateReport(lineItems, dataStore, selectedYear, selectedDivisionId);
  }, [lineItems, dataStore, selectedYear, selectedDivisionId]);

  // Report for comparative prior year
  const reportPrior = useMemo(() => {
    return calculateReport(lineItems, dataStore, priorYear, selectedDivisionId);
  }, [lineItems, dataStore, priorYear, selectedDivisionId]);

  // Statement-scoped line items
  const statementLineItems = useMemo(() => {
    return lineItems.filter((item) => (item.statementType || 'position') === selectedStatement);
  }, [lineItems, selectedStatement]);

  const cashFlowsSummaryCurrent = useMemo(() => {
    return calculateCashFlowsSummary(lineItems, dataStore, selectedYear, selectedDivisionId);
  }, [lineItems, dataStore, selectedYear, selectedDivisionId]);

  const cashFlowsSummaryPrior = useMemo(() => {
    return calculateCashFlowsSummary(lineItems, dataStore, priorYear, selectedDivisionId);
  }, [lineItems, dataStore, priorYear, selectedDivisionId]);

  const netAssetsSummaryCurrent = useMemo(() => {
    return calculateNetAssetsSummary(dataStore, selectedYear, selectedDivisionId);
  }, [dataStore, selectedYear, selectedDivisionId]);

  const netAssetsSummaryPrior = useMemo(() => {
    return calculateNetAssetsSummary(dataStore, priorYear, selectedDivisionId);
  }, [dataStore, priorYear, selectedDivisionId]);

  const currAggMap = useMemo(() => {
    return aggregationStore?.[selectedYear]?.[selectedDivisionId] || {};
  }, [aggregationStore, selectedYear, selectedDivisionId]);

  const priorAggMap = useMemo(() => {
    return showComparative ? aggregationStore?.[priorYear]?.[selectedDivisionId] || {} : {};
  }, [aggregationStore, showComparative, priorYear, selectedDivisionId]);

  const savedAggItemsForStatement = useMemo(() => {
    return statementLineItems
      .map((item) => {
        const currVal = reportCurrent.values[item.id] || 0;
        const priorVal = showComparative ? reportPrior.values[item.id] || 0 : 0;
        const currRec = currVal !== 0 ? currAggMap[item.id] : undefined;
        const priorRec = priorVal !== 0 ? priorAggMap[item.id] : undefined;
        if (!currRec && !priorRec) return null;
        return { item, currRec, priorRec };
      })
      .filter(
        (
          entry
        ): entry is {
          item: LineItemDefinition;
          currRec: DivisionAggregationRecord | undefined;
          priorRec: DivisionAggregationRecord | undefined;
        } => entry !== null
      );
  }, [statementLineItems, reportCurrent.values, reportPrior.values, showComparative, currAggMap, priorAggMap]);

  const hasAggregatedDepCurr =
    Math.abs(reportCurrent.values[AGGREGATED_ACCUMULATED_DEPRECIATION_ID] || 0) >= 0.005;
  const hasAggregatedDepPrior =
    showComparative &&
    Math.abs(reportPrior.values[AGGREGATED_ACCUMULATED_DEPRECIATION_ID] || 0) >= 0.005;
  const hasAggregatedDep = hasAggregatedDepCurr || hasAggregatedDepPrior;

  // Visibility helpers to remove zero balances and filter by search query
  const isItemVisible = (item: LineItemDefinition) => {
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const matches = item.name.toLowerCase().includes(q) ||
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

  const isGroupVisible = (subgroups: { [subgroup: string]: LineItemDefinition[] }) => {
    return Object.values(subgroups).some((items) => items.some(isItemVisible));
  };

  const isSubgroupVisible = (items: LineItemDefinition[]) => {
    return items.some(isItemVisible);
  };

  // Group Statement of Financial Position line items hierarchically
  const sectionsHierarchy = useMemo(() => {
    type Tree = {
      [subsection: string]: {
        [group: string]: {
          [subgroup: string]: LineItemDefinition[];
        };
      };
    };

    const tree: Tree = {};

    lineItems
      .filter((item) => (item.statementType || 'position') === 'position')
      .forEach((item) => {
        const sub = item.subsection;
        const grp = item.group;
        const subgrp = item.subgroup || 'General';

        if (!tree[sub]) tree[sub] = {};
        if (!tree[sub][grp]) tree[sub][grp] = {};
        if (!tree[sub][grp][subgrp]) tree[sub][grp][subgrp] = [];

        tree[sub][grp][subgrp].push(item);
      });

    return tree;
  }, [lineItems]);

  const handlePrint = () => {
    window.print();
  };

  const formatFSNumber = (val: number, isContra?: boolean): string => {
    if (!val || Math.abs(val) < 0.005) return '-';
    if (isContra && val > 0) return `(${formatAccounting(val)})`;
    return formatAccounting(val);
  };

  const sumItemsNet = (items: LineItemDefinition[], report: ReturnType<typeof calculateReport>): number => {
    return items.reduce((sum, item) => {
      const v = report.values[item.id] || 0;
      return sum + (item.isContra ? -v : v);
    }, 0);
  };

  const sumSubgroupsNet = (
    subgroups: { [subgroup: string]: LineItemDefinition[] },
    report: ReturnType<typeof calculateReport>
  ): number => {
    return Object.values(subgroups).reduce((sum, items) => sum + sumItemsNet(items, report), 0);
  };


  const renderItemsWithNetValue = (items: LineItemDefinition[], indentClass: string, includeNetValue: boolean) => {
    const isAggregateContraGroup = items.some(
      (i) => i.subgroup === 'Other Receivables' || i.id === 'allowance_impairment_other_receivables'
    );

    // Include non-zero items, plus any contra items whose preceding base asset(s) are visible
    const visibleItems: LineItemDefinition[] = [];
    let baseVisible = false;
    items.forEach((item) => {
      const valCurr = reportCurrent.values[item.id] || 0;
      const valPrior = reportPrior.values[item.id] || 0;
      const isNonZero = valCurr !== 0 || (showComparative && valPrior !== 0);

      if (item.id === AGGREGATED_ACCUMULATED_DEPRECIATION_ID) {
        if (isNonZero) visibleItems.push(item);
        return;
      }

      if (!item.isContra) {
        const itemVisible = !hideZeroRows || isNonZero;
        baseVisible = isAggregateContraGroup ? (baseVisible || itemVisible) : itemVisible;
        if (itemVisible) visibleItems.push(item);
      } else {
        if (!hideZeroRows || isNonZero || baseVisible) {
          visibleItems.push(item);
        }
      }
    });

    const rows: React.ReactNode[] = [];
    let runningBaseCurr = 0;
    let runningBasePrior = 0;
    let hasContraForCurrentBase = false;

    visibleItems.forEach((item, idx) => {
      const valCurr = reportCurrent.values[item.id] || 0;
      const valPrior = reportPrior.values[item.id] || 0;

      if (item.id === AGGREGATED_ACCUMULATED_DEPRECIATION_ID) {
        rows.push(
          <tr key={item.id} className="text-red-700 font-bold">
            <td className={`py-1 ${indentClass} text-red-700 font-bold`}>
              <div>{item.name}</div>
              <div className="text-[10pt] italic font-bold text-red-700">
                Notice: Temporary combined depreciation — breakdown per PPE pending (excluded from Consolidated FS)
              </div>
            </td>
            <td className="py-1 px-4 text-right tabular-nums text-red-700 font-bold align-top">
              {formatFSNumber(valCurr, item.isContra)}
            </td>
            {showComparative && (
              <td className="py-1 px-4 text-right tabular-nums text-red-700 font-bold align-top">
                {formatFSNumber(valPrior, item.isContra)}
              </td>
            )}
          </tr>
        );
        return;
      }

      if (!item.isContra) {
        if (isAggregateContraGroup) {
          runningBaseCurr += valCurr;
          runningBasePrior += valPrior;
        } else {
          runningBaseCurr = valCurr;
          runningBasePrior = valPrior;
        }
        hasContraForCurrentBase = false;
      } else {
        runningBaseCurr -= valCurr;
        runningBasePrior -= valPrior;
        hasContraForCurrentBase = true;
      }

      rows.push(
        <tr key={item.id}>
          <td className={`py-0.5 ${indentClass}`}>
            {item.name}
          </td>
          <td className="py-0.5 px-4 text-right tabular-nums">
            {formatFSNumber(valCurr, item.isContra)}
          </td>
          {showComparative && (
            <td className="py-0.5 px-4 text-right tabular-nums">
              {formatFSNumber(valPrior, item.isContra)}
            </td>
          )}
        </tr>
      );

      if (includeNetValue && hasContraForCurrentBase) {
        const nextItem = visibleItems[idx + 1];
        if (!nextItem || !nextItem.isContra) {
          rows.push(
            <tr key={`${item.id}-net-value`}>
              <td className={`py-0.5 pb-2 ${indentClass}`}>
                Net Value
              </td>
              <td className="py-0.5 pb-2 px-4 text-right tabular-nums">
                {formatFSNumber(runningBaseCurr)}
              </td>
              {showComparative && (
                <td className="py-0.5 pb-2 px-4 text-right tabular-nums">
                  {formatFSNumber(runningBasePrior)}
                </td>
              )}
            </tr>
          );
          hasContraForCurrentBase = false;
          if (isAggregateContraGroup) {
            runningBaseCurr = 0;
            runningBasePrior = 0;
          }
        }
      }
    });

    return rows;
  };

  const renderNoPrintAggregationDetail = (itemId: string) => {
    const currVal = reportCurrent.values[itemId] || 0;
    const priorVal = showComparative ? reportPrior.values[itemId] || 0 : 0;
    const currRec = Math.abs(currVal) >= 0.005 ? currAggMap[itemId] : undefined;
    const priorRec = Math.abs(priorVal) >= 0.005 ? priorAggMap[itemId] : undefined;
    if (!currRec && !priorRec) return null;

    const isExpanded = Boolean(expandedAggRowIds[itemId]);
    const primaryRec = currRec || priorRec!;
    const anyWasAggregated = Boolean(currRec?.wasAggregated || priorRec?.wasAggregated);
    const maxComps = Math.max(currRec?.components.length || 0, priorRec?.components.length || 0);

    return (
      <div className="no-print mt-1 mb-1 font-sans">
        <button
          type="button"
          onClick={() =>
            setExpandedAggRowIds((prev) => ({
              ...prev,
              [itemId]: !prev[itemId],
            }))
          }
          className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-sky-50 hover:bg-sky-100 border border-sky-300 text-sky-900 text-[11px] font-bold transition-colors cursor-pointer"
          title="View original father account amount and aggregated sub-items (hidden when printing)"
        >
          <Info className="w-3 h-3 text-sky-700 shrink-0" />
          <span>
            {anyWasAggregated
              ? 'Notice: This account has been aggregated'
              : 'Notice: Parent matched sub-items'}
          </span>
          <span className="text-sky-700 font-semibold">
            ({maxComps} sub-item{maxComps === 1 ? '' : 's'})
          </span>
          {isExpanded ? <ChevronUp className="w-3 h-3 shrink-0" /> : <ChevronDown className="w-3 h-3 shrink-0" />}
        </button>

        {isExpanded && (
          <div className="mt-1.5 p-2.5 rounded-lg bg-sky-50/95 border border-sky-300 text-sky-950 text-[11px] max-w-xl space-y-2 shadow-2xs">
            <div className="flex items-center justify-between gap-2 font-bold border-b border-sky-200 pb-1">
              <span>Aggregated Component Breakdown (No-Print App Notice)</span>
              {primaryRec.sourceFileName && (
                <span className="font-normal text-sky-800 truncate max-w-[180px]">
                  {primaryRec.sourceFileName}
                </span>
              )}
            </div>
            {[
              ...(currRec ? [{ year: selectedYear, rec: currRec }] : []),
              ...(priorRec ? [{ year: priorYear, rec: priorRec }] : []),
            ].map(({ year, rec }) => (
              <div key={`${itemId}-agg-yr-${year}`} className="space-y-0.5">
                <div className="font-bold text-sky-900 flex items-center justify-between gap-2">
                  <span>
                    FY {year} — {rec.wasAggregated ? 'Aggregated Total' : 'Parent Verified'}
                  </span>
                  <span className="font-mono">₱ {formatAccounting(rec.totalAmount)}</span>
                </div>
                {rec.components.map((comp, idx) => (
                  <div
                    key={`${itemId}-${year}-comp-${idx}`}
                    className={`flex items-center justify-between gap-2 pl-2 ${
                      comp.isParentOriginal ? 'text-sky-950 font-semibold' : 'text-slate-700'
                    }`}
                  >
                    <span className="truncate">
                      {comp.label}
                      {comp.excelRowNumber ? ` (Row ${comp.excelRowNumber})` : ''}
                    </span>
                    <span className="font-mono font-semibold shrink-0">₱ {formatAccounting(comp.amount)}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  const handleExportCSV = () => {
    const stmtTitle =
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

    const dateLabel =
      selectedStatement === 'position'
        ? `As at December 31, ${selectedYear}${showComparative ? ` and ${priorYear}` : ''}`
        : `For the Year Ended December 31, ${selectedYear}${showComparative ? ` and ${priorYear}` : ''}`;

    const rows = [
      ['Department of Education'],
      ['Regional Office No. VI'],
      [currentDivision?.name || ''],
      [stmtTitle],
      ['All Funds'],
      [dateLabel],
      [],
      ['Account Title', `Amount (${selectedYear})`, ...(showComparative ? [`Amount (${priorYear})`] : [])],
    ];

    if (selectedStatement === 'cash_flows' && isCondensed) {
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

      const pushCfRow = (label: string, currVal: number, priorVal: number) => {
        rows.push([
          `"${label}"`,
          currVal.toString(),
          ...(showComparative ? [priorVal.toString()] : []),
        ]);
      };

      cfActivities.forEach((act) => {
        rows.push([`"${act.title}"`]);
        const sectionItems = statementLineItems.filter((i) => i.section === act.sectionKey);
        const inflowItems = sectionItems.filter((i) => i.subgroup !== 'Cash Outflows');
        const outflowItems = sectionItems.filter((i) => i.subgroup === 'Cash Outflows');

        rows.push(['"Cash Inflows"']);
        groupByGrp(inflowItems).forEach(([grp, grpItems]) => {
          if (grp === 'Financing Cash Inflows') {
            grpItems.forEach((item) => {
              const curr = reportCurrent.values[item.id] || 0;
              const prior = reportPrior.values[item.id] || 0;
              if (!hideZeroRows || curr !== 0 || (showComparative && prior !== 0)) {
                pushCfRow(item.name, curr, prior);
              }
            });
            return;
          }
          const hasNonZero = grpItems.some((item) => {
            const c = reportCurrent.values[item.id] || 0;
            const p = reportPrior.values[item.id] || 0;
            return c !== 0 || (showComparative && p !== 0);
          });
          if (!hideZeroRows || hasNonZero) {
            pushCfRow(grp, sumItemsNet(grpItems, reportCurrent), sumItemsNet(grpItems, reportPrior));
          }
        });
        pushCfRow('Total Cash Inflows', act.getInflow(cashFlowsSummaryCurrent), act.getInflow(cashFlowsSummaryPrior));

        rows.push(['"Cash Outflows"']);
        groupByGrp(outflowItems).forEach(([grp, grpItems]) => {
          if (grp === 'Financing Cash Outflows') {
            grpItems.forEach((item) => {
              const curr = reportCurrent.values[item.id] || 0;
              const prior = reportPrior.values[item.id] || 0;
              if (!hideZeroRows || curr !== 0 || (showComparative && prior !== 0)) {
                pushCfRow(item.name, curr, prior);
              }
            });
            return;
          }
          const hasNonZero = grpItems.some((item) => {
            const c = reportCurrent.values[item.id] || 0;
            const p = reportPrior.values[item.id] || 0;
            return c !== 0 || (showComparative && p !== 0);
          });
          if (!hideZeroRows || hasNonZero) {
            pushCfRow(grp, sumItemsNet(grpItems, reportCurrent), sumItemsNet(grpItems, reportPrior));
          }
        });
        pushCfRow('Total Cash Outflows', act.getOutflow(cashFlowsSummaryCurrent), act.getOutflow(cashFlowsSummaryPrior));
        pushCfRow(act.netLabel, act.getNet(cashFlowsSummaryCurrent), act.getNet(cashFlowsSummaryPrior));
      });

      pushCfRow(
        'Increase/(Decrease) in Cash and Cash Equivalents',
        cashFlowsSummaryCurrent.netIncreaseDecrease,
        cashFlowsSummaryPrior.netIncreaseDecrease
      );
      if (
        !hideZeroRows ||
        Math.abs(cashFlowsSummaryCurrent.fxEffects) >= 0.005 ||
        (showComparative && Math.abs(cashFlowsSummaryPrior.fxEffects) >= 0.005)
      ) {
        pushCfRow(
          'Effects of Exchange Rate Changes on Cash and Cash Equivalents',
          cashFlowsSummaryCurrent.fxEffects,
          cashFlowsSummaryPrior.fxEffects
        );
      }
      pushCfRow('Cash and Cash Equivalents, January 1', cashFlowsSummaryCurrent.january1Cash, cashFlowsSummaryPrior.january1Cash);
      pushCfRow('Cash and Cash Equivalents, December 31', cashFlowsSummaryCurrent.december31Cash, cashFlowsSummaryPrior.december31Cash);
    } else {
      statementLineItems.forEach((item) => {
        const curr = reportCurrent.values[item.id] || 0;
        const prior = reportPrior.values[item.id] || 0;
        if (item.id === AGGREGATED_ACCUMULATED_DEPRECIATION_ID && curr === 0 && prior === 0) {
          return;
        }
        if (!hideZeroRows || curr !== 0 || prior !== 0) {
          rows.push([
            `"${item.name}"`,
            curr.toString(),
            ...(showComparative ? [prior.toString()] : []),
          ]);
        }
      });
    }

    const csvContent = 'data:text/csv;charset=utf-8,' + rows.map((e) => e.join(',')).join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `${currentDivision?.name.replace(/\s+/g, '_')}_${selectedStatement.toUpperCase()}_${selectedYear}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="w-full max-w-[1780px] mx-auto px-2 sm:px-4 py-4">
      <div className="flex flex-col lg:flex-row gap-6 items-start">
        <FinancialStatementSidebar
          selectedStatement={selectedStatement}
          onSelectStatement={setSelectedStatement}
        />
        <div className="flex-1 min-w-0 w-full space-y-6">
      {/* Control Toolbar (No-Print) */}
      <div className="bg-th-surface border-2 border-th-border rounded-2xl p-5 shadow-sm space-y-4 no-print transition-colors">
        {/* Row 1: Office, Year & Primary Actions */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="inline-flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  if (hasPrevDivision) {
                    onSelectDivision(divisions[currentDivisionIndex - 1].id);
                  }
                }}
                disabled={!hasPrevDivision}
                className="min-w-[42px] min-h-[42px] flex items-center justify-center rounded-xl bg-th-subtle hover:bg-th-subtle-hover disabled:opacity-40 disabled:cursor-not-allowed border-2 border-th-border-strong text-th-text transition-colors cursor-pointer shrink-0"
                title="Previous Division"
                aria-label="Previous Division"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <select
                value={selectedDivisionId}
                onChange={(e) => onSelectDivision(e.target.value)}
                aria-label="Select Division Office"
                className="min-h-[42px] pl-4 pr-9 py-2 text-base font-bold text-th-text bg-th-input border-2 border-th-border-strong rounded-xl focus:outline-hidden focus:border-th-accent focus:ring-2 focus:ring-th-accent/20 cursor-pointer shadow-xs"
              >
                {divisions.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => {
                  if (hasNextDivision) {
                    onSelectDivision(divisions[currentDivisionIndex + 1].id);
                  }
                }}
                disabled={!hasNextDivision}
                className="min-w-[42px] min-h-[42px] flex items-center justify-center rounded-xl bg-th-subtle hover:bg-th-subtle-hover disabled:opacity-40 disabled:cursor-not-allowed border-2 border-th-border-strong text-th-text transition-colors cursor-pointer shrink-0"
                title="Next Division"
                aria-label="Next Division"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-th-muted whitespace-nowrap">Year:</span>
              <div className="inline-flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    const prevYr = String(Number(selectedYear) - 1);
                    if (YEAR_RANGE.includes(prevYr)) onSelectYear(prevYr);
                  }}
                  disabled={!YEAR_RANGE.includes(String(Number(selectedYear) - 1))}
                  className="min-w-[42px] min-h-[42px] flex items-center justify-center rounded-xl bg-th-subtle hover:bg-th-subtle-hover disabled:opacity-40 disabled:cursor-not-allowed border-2 border-th-border-strong text-th-text transition-colors cursor-pointer"
                  title="Previous Fiscal Year"
                  aria-label="Previous Fiscal Year"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <select
                  value={selectedYear}
                  onChange={(e) => onSelectYear(e.target.value)}
                  aria-label="Select Fiscal Year"
                  className="min-h-[42px] px-4 py-2 text-base font-bold text-th-text bg-th-input border-2 border-th-border-strong rounded-xl focus:outline-hidden focus:border-th-accent focus:ring-2 focus:ring-th-accent/20 cursor-pointer shadow-xs"
                >
                  {YEAR_RANGE.map((yr) => (
                    <option key={yr} value={yr}>
                      FY {yr}
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
                  className="min-w-[42px] min-h-[42px] flex items-center justify-center rounded-xl bg-th-subtle hover:bg-th-subtle-hover disabled:opacity-40 disabled:cursor-not-allowed border-2 border-th-border-strong text-th-text transition-colors cursor-pointer"
                  title="Next Fiscal Year"
                  aria-label="Next Fiscal Year"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
              <span className="text-sm text-th-muted font-mono font-semibold whitespace-nowrap">
                Prior: {priorYear}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={handleExportCSV}
              className="inline-flex items-center gap-2 min-h-[42px] px-4 py-2 text-sm font-bold text-th-text bg-th-subtle border-2 border-th-border-strong hover:bg-th-subtle-hover rounded-xl shadow-xs transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Download className="w-4 h-4 text-th-muted shrink-0" />
              <span>CSV Export</span>
            </button>
            <button
              type="button"
              onClick={handlePrint}
              className="inline-flex items-center gap-2 min-h-[42px] px-5 py-2 text-sm font-bold text-th-accent-fg bg-th-accent hover:bg-th-accent-hover rounded-xl shadow-sm transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Printer className="w-4 h-4 shrink-0" />
              <span>Print Official FS</span>
            </button>
          </div>
        </div>

        {/* Row 2: Search, View Options & Section Jumps */}
        <div className="pt-3.5 border-t border-th-border flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2.5 flex-1">
            <div className="relative min-w-[220px] flex-1 max-w-sm">
              <Search className="w-4 h-4 text-th-muted absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Find account in sheet..."
                className="w-full min-h-[40px] pl-9 pr-8 py-2 text-sm font-semibold text-th-text bg-th-input border-2 border-th-border-strong rounded-xl focus:outline-hidden focus:border-th-accent focus:ring-2 focus:ring-th-accent/20"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-th-muted hover:text-th-text cursor-pointer"
                  title="Clear search"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {(selectedStatement === 'position' ||
              selectedStatement === 'performance' ||
              selectedStatement === 'cash_flows') && (
              <button
                type="button"
                onClick={() => setIsCondensed(!isCondensed)}
                className={`min-h-[40px] px-4 py-2 text-sm font-bold rounded-xl border-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  isCondensed
                    ? 'bg-th-primary text-th-primary-fg border-th-primary dark:border-th-border-strong shadow-xs'
                    : 'bg-th-subtle text-th-text border-th-border-strong hover:bg-th-subtle-hover'
                }`}
                title="Toggle between Detailed and Condensed statement view"
              >
                {isCondensed ? 'Condensed FS' : 'Detailed FS'}
              </button>
            )}

            <button
              type="button"
              onClick={() => setHideZeroRows(!hideZeroRows)}
              className={`min-h-[40px] px-4 py-2 text-sm font-bold rounded-xl border-2 transition-colors inline-flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer shadow-xs ${
                hideZeroRows
                  ? 'bg-th-subtle text-th-text border-th-border-strong hover:bg-th-subtle-hover'
                  : 'bg-th-primary text-th-primary-fg border-th-primary dark:border-th-border-strong'
              }`}
            >
              {hideZeroRows ? <EyeOff className="w-4 h-4 text-th-muted shrink-0" /> : <Eye className="w-4 h-4 shrink-0" />}
              <span>{hideZeroRows ? 'Zero Balances Hidden' : 'Showing All Accounts'}</span>
            </button>
          </div>

          <div className="hidden sm:flex items-center gap-2 text-sm text-th-text font-bold shrink-0">
            <span className="text-th-muted">Jump:</span>
            {selectedStatement === 'position' && (
              <>
                <a href="#assets-section" className="hover:text-th-accent-text underline px-1 whitespace-nowrap">Assets</a>
                <span className="text-th-muted" aria-hidden="true">·</span>
                <a href="#liabilities-section" className="hover:text-th-accent-text underline px-1 whitespace-nowrap">Liabilities</a>
                <span className="text-th-muted" aria-hidden="true">·</span>
                <a href="#equity-section" className="hover:text-th-accent-text underline px-1 whitespace-nowrap">Equity</a>
              </>
            )}
            {selectedStatement === 'performance' && (
              <>
                <a href="#div-revenue-section" className="hover:text-th-accent-text underline px-1 whitespace-nowrap">Revenue</a>
                <span className="text-th-muted" aria-hidden="true">·</span>
                <a href="#div-expenses-section" className="hover:text-th-accent-text underline px-1 whitespace-nowrap">Operating Expenses</a>
                <span className="text-th-muted" aria-hidden="true">·</span>
                <a href="#div-surplus-section" className="hover:text-th-accent-text underline px-1 whitespace-nowrap">Surplus/(Deficit)</a>
              </>
            )}
            {selectedStatement === 'cash_flows' && (
              <>
                <a href="#div-cf-operating" className="hover:text-th-accent-text underline px-1 whitespace-nowrap">Operating</a>
                <span className="text-th-muted" aria-hidden="true">·</span>
                <a href="#div-cf-investing" className="hover:text-th-accent-text underline px-1 whitespace-nowrap">Investing</a>
                <span className="text-th-muted" aria-hidden="true">·</span>
                <a href="#div-cf-financing" className="hover:text-th-accent-text underline px-1 whitespace-nowrap">Financing</a>
                <span className="text-th-muted" aria-hidden="true">·</span>
                <a href="#div-cf-reconciliation" className="hover:text-th-accent-text underline px-1 whitespace-nowrap">Cash Reconciliation</a>
              </>
            )}
            {selectedStatement === 'net_assets' && (
              <>
                <a href="#div-na-beginning" className="hover:text-th-accent-text underline px-1 whitespace-nowrap">Restated Balance</a>
                <span className="text-th-muted" aria-hidden="true">·</span>
                <a href="#div-na-changes" className="hover:text-th-accent-text underline px-1 whitespace-nowrap">Calendar Year Changes</a>
                <span className="text-th-muted" aria-hidden="true">·</span>
                <a href="#div-na-ending" className="hover:text-th-accent-text underline px-1 whitespace-nowrap">Ending Balance</a>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Persistent App-Only Notice for Aggregated Accounts (No-Print) */}
      {savedAggItemsForStatement.length > 0 && (
        <div className="no-print p-4 rounded-2xl border-2 border-sky-300 dark:border-sky-800 bg-sky-50/90 dark:bg-sky-950/40 text-sky-950 dark:text-sky-100 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <Info className="w-5 h-5 text-sky-700 dark:text-sky-300 shrink-0 mt-0.5" />
              <div className="text-sm sm:text-base leading-relaxed">
                <strong className="font-bold">
                  Notice — Aggregated Accounts Saved ({savedAggItemsForStatement.length}):
                </strong>{' '}
                The highlighted accounts in {currentDivision?.name} were consolidated from sub-items. This notice is visible in the app only and will not appear on ready-to-print statements.
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIsAggNoticeExpanded((prev) => !prev)}
              className="self-start sm:self-center inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/90 dark:bg-slate-900/70 border border-sky-300 dark:border-sky-700 text-xs font-bold text-sky-900 dark:text-sky-200 hover:bg-white dark:hover:bg-slate-900 cursor-pointer whitespace-nowrap shrink-0"
            >
              {isAggNoticeExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              <span>{isAggNoticeExpanded ? 'Hide Breakdowns' : 'View Component Amounts'}</span>
            </button>
          </div>

          {isAggNoticeExpanded && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2 border-t border-sky-200 dark:border-sky-800/80">
              {savedAggItemsForStatement.map(({ item, currRec, priorRec }) => (
                <div
                  key={`fs-banner-${item.id}`}
                  className="p-3 rounded-xl bg-white/90 dark:bg-slate-900/60 border border-sky-200 dark:border-sky-800 text-xs space-y-2"
                >
                  <div className="flex items-center justify-between gap-2 font-bold text-sky-950 dark:text-sky-100">
                    <span>{item.name}</span>
                    <span className="px-2 py-0.5 rounded bg-sky-100 dark:bg-sky-900/60 text-sky-800 dark:text-sky-200 text-[11px]">
                      {(currRec?.wasAggregated || priorRec?.wasAggregated)
                        ? 'This account has been aggregated'
                        : 'Parent matched sub-items'}
                    </span>
                  </div>
                  {[
                    ...(currRec ? [{ year: selectedYear, rec: currRec }] : []),
                    ...(priorRec ? [{ year: priorYear, rec: priorRec }] : []),
                  ].map(({ year, rec }) => (
                    <div key={`fs-banner-${item.id}-${year}`} className="space-y-0.5 pt-1 border-t border-sky-100 dark:border-sky-900/60">
                      <div className="flex items-center justify-between gap-2 font-bold text-sky-900 dark:text-sky-200">
                        <span>FY {year} Total</span>
                        <span className="font-mono">₱ {formatAccounting(rec.totalAmount)}</span>
                      </div>
                      {rec.components.map((comp, idx) => (
                        <div
                          key={`fs-banner-${item.id}-${year}-${idx}`}
                          className={`flex items-center justify-between gap-2 pl-2 ${
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
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Temporary Aggregated Accumulated Depreciation Notice (No-Print) */}
      {selectedStatement === 'position' && hasAggregatedDep && (
        <div className="no-print p-4 rounded-2xl border-2 border-red-400 dark:border-red-700 bg-red-50 dark:bg-red-950/40 text-red-900 dark:text-red-100 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-red-700 dark:text-red-400 shrink-0 mt-0.5" />
          <div className="text-sm sm:text-base leading-relaxed">
            <strong className="font-bold">Notice — Aggregated Accumulated Depreciation Active:</strong>{' '}
            {currentDivision?.name} currently uses a temporary combined{' '}
            <strong>Aggregated Accumulated Depreciation</strong> balance. Until a per-PPE breakdown is provided, this division is automatically{' '}
            <strong>excluded from Consolidated Financial Statements</strong>.
          </div>
        </div>
      )}

      {/* Prominent Accounting Balance Check (No-Print) */}
      {selectedStatement === 'position' && (
        <div className="no-print">
          <AccountingBalanceCheck
            totalAssets={reportCurrent.totalAssets}
            totalLiabilities={reportCurrent.totalLiabilities}
            totalEquity={reportCurrent.totalEquity}
          />
        </div>
      )}

      {/* Official Financial Statement Document Container */}
      <div className="bg-white text-black p-8 sm:p-14 font-['Times_New_Roman',Times,serif] text-[12pt] leading-snug print:p-0">
        {/* Document Header */}
        <div className="text-center mb-8">
          <div className="text-base font-bold">Department of Education</div>
          <div className="text-base font-bold">Regional Office No. VI</div>
          <div className="text-base font-bold">{currentDivision?.name}</div>
          <div className="text-base font-bold">
            {selectedStatement === 'cash_flows'
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
              : 'Detailed Statement of Financial Position'}
          </div>
          <div className="text-base font-bold">All Funds</div>
          <div className="text-base font-bold">
            {selectedStatement === 'cash_flows' ||
            selectedStatement === 'performance' ||
            selectedStatement === 'net_assets'
              ? `For the Year Ended December 31, ${selectedYear}`
              : `As at December 31, ${selectedYear}`}
          </div>
        </div>

        {/* Statement Body Table */}
        {selectedStatement === 'performance' ? (
          (() => {
            const perfItems = statementLineItems;
            const revItems = perfItems.filter((i) => i.section === 'REVENUE');
            const expItems = perfItems.filter((i) => i.section === 'EXPENSES');
            const trItems = perfItems.filter((i) => i.section === 'TRANSFERS');
            const trFromItems = trItems.filter((i) => !i.group.startsWith('Less:'));
            const trToItems = trItems.filter((i) => i.group.startsWith('Less:'));
            const nonOpItems = perfItems.filter((i) => i.section === 'NON_OPERATING');
            const lossItems = perfItems.filter((i) => i.section === 'LOSSES');

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

            const sumLossAbs = (report: ReturnType<typeof calculateReport>) =>
              lossItems.reduce((sum, item) => sum + Math.abs(report.values[item.id] || 0), 0);

            const getNetTransfers = (report: ReturnType<typeof calculateReport>) =>
              sumItemsNet(trFromItems, report) - sumItemsNet(trToItems, report);

            const perfColSpan = showComparative ? 3 : 2;

            const renderPerfGroupWithSubgroups = (
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
                    <td
                      className={`pt-2 pb-1 px-4 text-right tabular-nums ${
                        isCondensed ? 'font-normal' : 'font-bold'
                      }`}
                    >
                      {isCondensed || !hasRealSubgroups
                        ? formatFSNumber(sumItemsNet(items, reportCurrent))
                        : ''}
                    </td>
                    {showComparative && (
                      <td
                        className={`pt-2 pb-1 px-4 text-right tabular-nums ${
                          isCondensed ? 'font-normal' : 'font-bold'
                        }`}
                      >
                        {isCondensed || !hasRealSubgroups
                          ? formatFSNumber(sumItemsNet(items, reportPrior))
                          : ''}
                      </td>
                    )}
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
                              <td
                                colSpan={perfColSpan}
                                className={`pt-1.5 pb-0.5 ${subgroupIndentClass} font-semibold`}
                              >
                                {sgName}
                              </td>
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
                                {renderNoPrintAggregationDetail(item.id)}
                              </td>
                              <td className="py-0.5 px-4 text-right tabular-nums align-top">
                                {formatFSNumber(reportCurrent.values[item.id] || 0)}
                              </td>
                              {showComparative && (
                                <td className="py-0.5 px-4 text-right tabular-nums align-top">
                                  {formatFSNumber(reportPrior.values[item.id] || 0)}
                                </td>
                              )}
                            </tr>
                          ))}
                          {isSubheader && (
                            <tr>
                              <td className={`pt-1 pb-2 ${leafIndentClassWithSub} font-bold`}>
                                Total {sgName}
                              </td>
                              <td className="pt-1 pb-2 px-4 text-right font-bold tabular-nums border-t border-black">
                                {formatFSNumber(sumItemsNet(sgItems, reportCurrent))}
                              </td>
                              {showComparative && (
                                <td className="pt-1 pb-2 px-4 text-right font-bold tabular-nums border-t border-black">
                                  {formatFSNumber(sumItemsNet(sgItems, reportPrior))}
                                </td>
                              )}
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
                      <td className="pt-1 pb-2.5 px-4 text-right font-bold tabular-nums border-t border-black">
                        {formatFSNumber(sumItemsNet(items, reportCurrent))}
                      </td>
                      {showComparative && (
                        <td className="pt-1 pb-2.5 px-4 text-right font-bold tabular-nums border-t border-black">
                          {formatFSNumber(sumItemsNet(items, reportPrior))}
                        </td>
                      )}
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
                      <th className="py-1.5 px-4 text-center font-bold w-1/5 text-sm border-b border-black">
                        {selectedYear}
                      </th>
                      {showComparative && (
                        <th className="py-1.5 px-4 text-center font-bold w-1/5 text-sm border-b border-black">
                          {priorYear}
                        </th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    <tr id="div-revenue-section">
                      <td colSpan={perfColSpan} className="pt-4 pb-1 font-bold uppercase">
                        Revenue
                      </td>
                    </tr>
                    {revGroups.map(([groupName, items]) => {
                      const visibleGroupItems = items.filter(isItemVisible);
                      if (hideZeroRows && visibleGroupItems.length === 0) return null;
                      return renderPerfGroupWithSubgroups(
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
                      <td className="pt-2 pb-3 px-4 text-right font-bold tabular-nums border-t border-black">
                        {formatFSNumber(sumItemsNet(revItems, reportCurrent))}
                      </td>
                      {showComparative && (
                        <td className="pt-2 pb-3 px-4 text-right font-bold tabular-nums border-t border-black">
                          {formatFSNumber(sumItemsNet(revItems, reportPrior))}
                        </td>
                      )}
                    </tr>

                    <tr id="div-expenses-section">
                      <td colSpan={perfColSpan} className="pt-3 pb-1 font-bold uppercase">
                        Less: Current Operating Expenses
                      </td>
                    </tr>
                    {expGroups.map(([groupName, items]) => {
                      const visibleGroupItems = items.filter(isItemVisible);
                      if (hideZeroRows && visibleGroupItems.length === 0) return null;
                      return renderPerfGroupWithSubgroups(
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
                      <td className="pt-2 pb-3 px-4 text-right font-bold tabular-nums border-t border-black">
                        {formatFSNumber(sumItemsNet(expItems, reportCurrent))}
                      </td>
                      {showComparative && (
                        <td className="pt-2 pb-3 px-4 text-right font-bold tabular-nums border-t border-black">
                          {formatFSNumber(sumItemsNet(expItems, reportPrior))}
                        </td>
                      )}
                    </tr>

                    <tr id="div-surplus-section">
                      <td className="pt-2 pb-3 font-bold">Surplus/(Deficit) from Current Operations</td>
                      <td className="pt-2 pb-3 px-4 text-right font-bold tabular-nums border-t border-black">
                        {formatFSNumber(
                          sumItemsNet(revItems, reportCurrent) - sumItemsNet(expItems, reportCurrent)
                        )}
                      </td>
                      {showComparative && (
                        <td className="pt-2 pb-3 px-4 text-right font-bold tabular-nums border-t border-black">
                          {formatFSNumber(
                            sumItemsNet(revItems, reportPrior) - sumItemsNet(expItems, reportPrior)
                          )}
                        </td>
                      )}
                    </tr>

                    {hasAnyTransfers && (
                      <>
                        {trFromItems.some(isItemVisible) && (
                          <>
                            <tr>
                              <td colSpan={perfColSpan} className="pt-2 pb-1 pl-6 font-bold">
                                Financial Assistance/Subsidy from NGAs, LGUs, GOCCs
                              </td>
                            </tr>
                            {!isCondensed &&
                              trFromItems.filter(isItemVisible).map((item) => (
                                <tr key={item.id}>
                                  <td className="py-0.5 pl-12 align-top">
                                    <div>{item.name}</div>
                                    {renderNoPrintAggregationDetail(item.id)}
                                  </td>
                                  <td className="py-0.5 px-4 text-right tabular-nums align-top">
                                    {formatFSNumber(reportCurrent.values[item.id] || 0)}
                                  </td>
                                  {showComparative && (
                                    <td className="py-0.5 px-4 text-right tabular-nums align-top">
                                      {formatFSNumber(reportPrior.values[item.id] || 0)}
                                    </td>
                                  )}
                                </tr>
                              ))}
                            <tr>
                              <td className="pt-1 pb-2 pl-12 font-bold">
                                Total Financial Assistance/Subsidy from NGAs, LGUs, GOCCs
                              </td>
                              <td className="pt-1 pb-2 px-4 text-right font-bold tabular-nums border-t border-black">
                                {formatFSNumber(sumItemsNet(trFromItems, reportCurrent))}
                              </td>
                              {showComparative && (
                                <td className="pt-1 pb-2 px-4 text-right font-bold tabular-nums border-t border-black">
                                  {formatFSNumber(sumItemsNet(trFromItems, reportPrior))}
                                </td>
                              )}
                            </tr>
                          </>
                        )}

                        {trToItems.some(isItemVisible) && (
                          <>
                            <tr>
                              <td colSpan={perfColSpan} className="pt-2 pb-1 pl-6 font-bold">
                                Less: Financial Assistance/Subsidy to NGAs, LGUs, GOCCs
                              </td>
                            </tr>
                            {!isCondensed &&
                              trToItems.filter(isItemVisible).map((item) => (
                                <tr key={item.id}>
                                  <td className="py-0.5 pl-12 align-top">
                                    <div>{item.name}</div>
                                    {renderNoPrintAggregationDetail(item.id)}
                                  </td>
                                  <td className="py-0.5 px-4 text-right tabular-nums align-top">
                                    {formatFSNumber(reportCurrent.values[item.id] || 0)}
                                  </td>
                                  {showComparative && (
                                    <td className="py-0.5 px-4 text-right tabular-nums align-top">
                                      {formatFSNumber(reportPrior.values[item.id] || 0)}
                                    </td>
                                  )}
                                </tr>
                              ))}
                            <tr>
                              <td className="pt-1 pb-2 pl-12 font-bold">
                                Total Financial Assistance/Subsidy to NGAs, LGUs, GOCCs
                              </td>
                              <td className="pt-1 pb-2 px-4 text-right font-bold tabular-nums border-t border-black">
                                {formatFSNumber(sumItemsNet(trToItems, reportCurrent))}
                              </td>
                              {showComparative && (
                                <td className="pt-1 pb-2 px-4 text-right font-bold tabular-nums border-t border-black">
                                  {formatFSNumber(sumItemsNet(trToItems, reportPrior))}
                                </td>
                              )}
                            </tr>
                          </>
                        )}

                        <tr>
                          <td className="pt-1.5 pb-3 pl-6 font-bold">
                            Net Financial Assistance/Subsidy
                          </td>
                          <td className="pt-1.5 pb-3 px-4 text-right font-bold tabular-nums border-t border-black">
                            {formatFSNumber(getNetTransfers(reportCurrent))}
                          </td>
                          {showComparative && (
                            <td className="pt-1.5 pb-3 px-4 text-right font-bold tabular-nums border-t border-black">
                              {formatFSNumber(getNetTransfers(reportPrior))}
                            </td>
                          )}
                        </tr>
                      </>
                    )}

                    {hasAnyNonOp && (
                      <>
                        <tr>
                          <td className="pt-2 pb-1 pl-6 font-bold">Other Non-Operating Income</td>
                          <td className="pt-2 pb-1 px-4 text-right font-bold tabular-nums">
                            {isCondensed ? formatFSNumber(sumItemsNet(nonOpItems, reportCurrent)) : ''}
                          </td>
                          {showComparative && (
                            <td className="pt-2 pb-1 px-4 text-right font-bold tabular-nums">
                              {isCondensed ? formatFSNumber(sumItemsNet(nonOpItems, reportPrior)) : ''}
                            </td>
                          )}
                        </tr>
                        {!isCondensed &&
                          nonOpSubgroups.map(([sgName, sgItems]) => {
                            const visSg = sgItems.filter(isItemVisible);
                            if (hideZeroRows && visSg.length === 0) return null;
                            return (
                              <React.Fragment key={`div-nonop-${sgName}`}>
                                <tr>
                                  <td colSpan={perfColSpan} className="pt-1 pb-0.5 pl-12 font-semibold">
                                    {sgName}
                                  </td>
                                </tr>
                                {visSg.map((item) => (
                                  <tr key={item.id}>
                                    <td className="py-0.5 pl-18 align-top">
                                      <div>{item.name}</div>
                                      {renderNoPrintAggregationDetail(item.id)}
                                    </td>
                                    <td className="py-0.5 px-4 text-right tabular-nums align-top">
                                      {formatFSNumber(reportCurrent.values[item.id] || 0)}
                                    </td>
                                    {showComparative && (
                                      <td className="py-0.5 px-4 text-right tabular-nums align-top">
                                        {formatFSNumber(reportPrior.values[item.id] || 0)}
                                      </td>
                                    )}
                                  </tr>
                                ))}
                                <tr>
                                  <td className="pt-1 pb-2 pl-18 font-bold">Total {sgName}</td>
                                  <td className="pt-1 pb-2 px-4 text-right font-bold tabular-nums border-t border-black">
                                    {formatFSNumber(sumItemsNet(sgItems, reportCurrent))}
                                  </td>
                                  {showComparative && (
                                    <td className="pt-1 pb-2 px-4 text-right font-bold tabular-nums border-t border-black">
                                      {formatFSNumber(sumItemsNet(sgItems, reportPrior))}
                                    </td>
                                  )}
                                </tr>
                              </React.Fragment>
                            );
                          })}
                        <tr>
                          <td className="pt-1 pb-2.5 pl-6 font-bold">Total Non-Operating Income</td>
                          <td className="pt-1 pb-2.5 px-4 text-right font-bold tabular-nums border-t border-black">
                            {formatFSNumber(sumItemsNet(nonOpItems, reportCurrent))}
                          </td>
                          {showComparative && (
                            <td className="pt-1 pb-2.5 px-4 text-right font-bold tabular-nums border-t border-black">
                              {formatFSNumber(sumItemsNet(nonOpItems, reportPrior))}
                            </td>
                          )}
                        </tr>
                      </>
                    )}

                    {hasAnyLosses && (
                      <>
                        {lossItems.filter(isItemVisible).map((item) => (
                          <tr key={item.id}>
                            <td className="pt-1.5 pb-0.5 pl-6 font-bold align-top">
                              <div>{item.name}</div>
                              {renderNoPrintAggregationDetail(item.id)}
                            </td>
                            <td className="pt-1.5 pb-0.5 px-4 text-right font-bold tabular-nums align-top">
                              {reportCurrent.values[item.id]
                                ? formatFSNumber(-Math.abs(reportCurrent.values[item.id]))
                                : '-'}
                            </td>
                            {showComparative && (
                              <td className="pt-1.5 pb-0.5 px-4 text-right font-bold tabular-nums align-top">
                                {reportPrior.values[item.id]
                                  ? formatFSNumber(-Math.abs(reportPrior.values[item.id]))
                                  : '-'}
                              </td>
                            )}
                          </tr>
                        ))}
                        <tr>
                          <td className="pt-1.5 pb-2 pl-6 font-bold">
                            Surplus/(Deficit) after Other Non-Operating Income &amp; Losses
                          </td>
                          <td className="pt-1.5 pb-2 px-4 text-right font-bold tabular-nums border-t border-black">
                            {formatFSNumber(
                              sumItemsNet(revItems, reportCurrent) -
                                sumItemsNet(expItems, reportCurrent) +
                                getNetTransfers(reportCurrent) +
                                sumItemsNet(nonOpItems, reportCurrent) -
                                sumLossAbs(reportCurrent)
                            )}
                          </td>
                          {showComparative && (
                            <td className="pt-1.5 pb-2 px-4 text-right font-bold tabular-nums border-t border-black">
                              {formatFSNumber(
                                sumItemsNet(revItems, reportPrior) -
                                  sumItemsNet(expItems, reportPrior) +
                                  getNetTransfers(reportPrior) +
                                  sumItemsNet(nonOpItems, reportPrior) -
                                  sumLossAbs(reportPrior)
                              )}
                            </td>
                          )}
                        </tr>
                      </>
                    )}

                    <tr>
                      <td className="pt-3 pb-3 font-bold uppercase">
                        Surplus/(Deficit) for the Period
                      </td>
                      <td className="pt-3 pb-3 px-4 text-right font-bold tabular-nums border-t border-black border-b-4 border-double">
                        {formatFSNumber(
                          sumItemsNet(revItems, reportCurrent) -
                            sumItemsNet(expItems, reportCurrent) +
                            getNetTransfers(reportCurrent) +
                            sumItemsNet(nonOpItems, reportCurrent) -
                            sumLossAbs(reportCurrent)
                        )}
                      </td>
                      {showComparative && (
                        <td className="pt-3 pb-3 px-4 text-right font-bold tabular-nums border-t border-black border-b-4 border-double">
                          {formatFSNumber(
                            sumItemsNet(revItems, reportPrior) -
                              sumItemsNet(expItems, reportPrior) +
                              getNetTransfers(reportPrior) +
                              sumItemsNet(nonOpItems, reportPrior) -
                              sumLossAbs(reportPrior)
                          )}
                        </td>
                      )}
                    </tr>
                  </tbody>
                </table>
              </div>
            );
          })()
        ) : selectedStatement === 'cash_flows' ? (
          (() => {
            const cfColSpan = showComparative ? 3 : 2;
            const renderCashFlowActivity = (
              anchorId: string,
              title: string,
              sectionKey: 'CASH_OPERATING' | 'CASH_INVESTING' | 'CASH_FINANCING',
              netLabel: string,
              getNet: (s: CashFlowsSummary) => number,
              getInflowTotal: (s: CashFlowsSummary) => number,
              getOutflowTotal: (s: CashFlowsSummary) => number
            ) => {
              const sectionItems = statementLineItems.filter((i) => i.section === sectionKey);
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
                    <td colSpan={cfColSpan} className="pt-4 pb-1 font-bold">
                      {title}
                    </td>
                  </tr>
                  <tr>
                    <td colSpan={cfColSpan} className="pt-1 pb-0.5 pl-6 font-bold">
                      Cash Inflows
                    </td>
                  </tr>
                  {groupItems(inflowItems).map(([grp, grpItems]) => {
                    const vis = grpItems.filter(isItemVisible);
                    if (hideZeroRows && vis.length === 0) return null;
                    if (grp === 'Financing Cash Inflows') {
                      return (
                        <React.Fragment key={`div-${sectionKey}-in-${grp}`}>
                          {vis.map((item) => (
                            <tr key={item.id}>
                              <td className="py-0.5 pl-12">{item.name}</td>
                              <td className="py-0.5 px-4 text-right tabular-nums">
                                {formatFSNumber(reportCurrent.values[item.id] || 0)}
                              </td>
                              {showComparative && (
                                <td className="py-0.5 px-4 text-right tabular-nums">
                                  {formatFSNumber(reportPrior.values[item.id] || 0)}
                                </td>
                              )}
                            </tr>
                          ))}
                        </React.Fragment>
                      );
                    }
                    if (isCondensed) {
                      return (
                        <tr key={`div-${sectionKey}-in-${grp}`}>
                          <td className="py-0.5 pl-12">{grp}</td>
                          <td className="py-0.5 px-4 text-right tabular-nums">
                            {formatFSNumber(sumItemsNet(grpItems, reportCurrent))}
                          </td>
                          {showComparative && (
                            <td className="py-0.5 px-4 text-right tabular-nums">
                              {formatFSNumber(sumItemsNet(grpItems, reportPrior))}
                            </td>
                          )}
                        </tr>
                      );
                    }
                    if (isDirectLeafGroup(grp, grpItems)) {
                      return (
                        <React.Fragment key={`div-${sectionKey}-in-${grp}`}>
                          {vis.map((item) => (
                            <tr key={item.id}>
                              <td className="py-0.5 pl-12">{item.name}</td>
                              <td className="py-0.5 px-4 text-right tabular-nums">
                                {formatFSNumber(reportCurrent.values[item.id] || 0)}
                              </td>
                              {showComparative && (
                                <td className="py-0.5 px-4 text-right tabular-nums">
                                  {formatFSNumber(reportPrior.values[item.id] || 0)}
                                </td>
                              )}
                            </tr>
                          ))}
                        </React.Fragment>
                      );
                    }
                    return (
                      <React.Fragment key={`div-${sectionKey}-in-${grp}`}>
                        <tr>
                          <td className="pt-1.5 pb-0.5 pl-12 font-semibold">{grp}</td>
                          <td className="pt-1.5 pb-0.5 px-4"></td>
                          {showComparative && <td className="pt-1.5 pb-0.5 px-4"></td>}
                        </tr>
                        {vis.map((item) => (
                          <tr key={item.id}>
                            <td className="py-0.5 pl-20">{item.name}</td>
                            <td className="py-0.5 px-4 text-right tabular-nums">
                              {formatFSNumber(reportCurrent.values[item.id] || 0)}
                            </td>
                            {showComparative && (
                              <td className="py-0.5 px-4 text-right tabular-nums">
                                {formatFSNumber(reportPrior.values[item.id] || 0)}
                              </td>
                            )}
                          </tr>
                        ))}
                      </React.Fragment>
                    );
                  })}
                  <tr>
                    <td className="pt-1.5 pb-2 pl-6 font-bold">Total Cash Inflows</td>
                    <td className="pt-1.5 pb-2 px-4 text-right font-bold tabular-nums border-t border-black">
                      {formatFSNumber(getInflowTotal(cashFlowsSummaryCurrent))}
                    </td>
                    {showComparative && (
                      <td className="pt-1.5 pb-2 px-4 text-right font-bold tabular-nums border-t border-black">
                        {formatFSNumber(getInflowTotal(cashFlowsSummaryPrior))}
                      </td>
                    )}
                  </tr>

                  <tr>
                    <td colSpan={cfColSpan} className="pt-1 pb-0.5 pl-6 font-bold">
                      Cash Outflows
                    </td>
                  </tr>
                  {groupItems(outflowItems).map(([grp, grpItems]) => {
                    const vis = grpItems.filter(isItemVisible);
                    if (hideZeroRows && vis.length === 0) return null;
                    if (grp === 'Financing Cash Outflows') {
                      return (
                        <React.Fragment key={`div-${sectionKey}-out-${grp}`}>
                          {vis.map((item) => (
                            <tr key={item.id}>
                              <td className="py-0.5 pl-12">{item.name}</td>
                              <td className="py-0.5 px-4 text-right tabular-nums">
                                {formatFSNumber(reportCurrent.values[item.id] || 0)}
                              </td>
                              {showComparative && (
                                <td className="py-0.5 px-4 text-right tabular-nums">
                                  {formatFSNumber(reportPrior.values[item.id] || 0)}
                                </td>
                              )}
                            </tr>
                          ))}
                        </React.Fragment>
                      );
                    }
                    if (isCondensed) {
                      return (
                        <tr key={`div-${sectionKey}-out-${grp}`}>
                          <td className="py-0.5 pl-12">{grp}</td>
                          <td className="py-0.5 px-4 text-right tabular-nums">
                            {formatFSNumber(sumItemsNet(grpItems, reportCurrent))}
                          </td>
                          {showComparative && (
                            <td className="py-0.5 px-4 text-right tabular-nums">
                              {formatFSNumber(sumItemsNet(grpItems, reportPrior))}
                            </td>
                          )}
                        </tr>
                      );
                    }
                    if (isDirectLeafGroup(grp, grpItems)) {
                      return (
                        <React.Fragment key={`div-${sectionKey}-out-${grp}`}>
                          {vis.map((item) => (
                            <tr key={item.id}>
                              <td className="py-0.5 pl-12">{item.name}</td>
                              <td className="py-0.5 px-4 text-right tabular-nums">
                                {formatFSNumber(reportCurrent.values[item.id] || 0)}
                              </td>
                              {showComparative && (
                                <td className="py-0.5 px-4 text-right tabular-nums">
                                  {formatFSNumber(reportPrior.values[item.id] || 0)}
                                </td>
                              )}
                            </tr>
                          ))}
                        </React.Fragment>
                      );
                    }
                    return (
                      <React.Fragment key={`div-${sectionKey}-out-${grp}`}>
                        <tr>
                          <td className="pt-1.5 pb-0.5 pl-12 font-semibold">{grp}</td>
                          <td className="pt-1.5 pb-0.5 px-4"></td>
                          {showComparative && <td className="pt-1.5 pb-0.5 px-4"></td>}
                        </tr>
                        {vis.map((item) => (
                          <tr key={item.id}>
                            <td className="py-0.5 pl-20">{item.name}</td>
                            <td className="py-0.5 px-4 text-right tabular-nums">
                              {formatFSNumber(reportCurrent.values[item.id] || 0)}
                            </td>
                            {showComparative && (
                              <td className="py-0.5 px-4 text-right tabular-nums">
                                {formatFSNumber(reportPrior.values[item.id] || 0)}
                              </td>
                            )}
                          </tr>
                        ))}
                      </React.Fragment>
                    );
                  })}
                  <tr>
                    <td className="pt-1.5 pb-2 pl-6 font-bold">Total Cash Outflows</td>
                    <td className="pt-1.5 pb-2 px-4 text-right font-bold tabular-nums border-t border-black">
                      {formatFSNumber(getOutflowTotal(cashFlowsSummaryCurrent))}
                    </td>
                    {showComparative && (
                      <td className="pt-1.5 pb-2 px-4 text-right font-bold tabular-nums border-t border-black">
                        {formatFSNumber(getOutflowTotal(cashFlowsSummaryPrior))}
                      </td>
                    )}
                  </tr>

                  <tr>
                    <td className="pt-2 pb-3 pl-4 font-bold">{netLabel}</td>
                    <td className="pt-2 pb-3 px-4 text-right font-bold tabular-nums border-t border-black">
                      {formatFSNumber(getNet(cashFlowsSummaryCurrent))}
                    </td>
                    {showComparative && (
                      <td className="pt-2 pb-3 px-4 text-right font-bold tabular-nums border-t border-black">
                        {formatFSNumber(getNet(cashFlowsSummaryPrior))}
                      </td>
                    )}
                  </tr>
                </React.Fragment>
              );
            };

            const hasAnyFx =
              Math.abs(cashFlowsSummaryCurrent.fxEffects) >= 0.005 ||
              (showComparative && Math.abs(cashFlowsSummaryPrior.fxEffects) >= 0.005);

            return (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm border-collapse">
                  <thead>
                    <tr>
                      <th className="py-1.5 pr-4 text-left font-bold uppercase w-3/5 text-sm">
                        Cash Flow Activity
                      </th>
                      <th className="py-1.5 px-4 text-center font-bold w-1/5 text-sm border-b border-black">
                        {selectedYear}
                      </th>
                      {showComparative && (
                        <th className="py-1.5 px-4 text-center font-bold w-1/5 text-sm border-b border-black">
                          {priorYear}
                        </th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {renderCashFlowActivity(
                      'div-cf-operating',
                      'Cash Flows from Operating Activities',
                      'CASH_OPERATING',
                      'Net Cash Provided by (Used in) Operating Activities',
                      (s) => s.netOperating,
                      (s) => s.operatingInflows,
                      (s) => s.operatingOutflows
                    )}
                    {renderCashFlowActivity(
                      'div-cf-investing',
                      'Cash Flows from Investing Activities',
                      'CASH_INVESTING',
                      'Net Cash Provided by (Used in) Investing Activities',
                      (s) => s.netInvesting,
                      (s) => s.investingInflows,
                      (s) => s.investingOutflows
                    )}
                    {renderCashFlowActivity(
                      'div-cf-financing',
                      'Cash Flows from Financing Activities',
                      'CASH_FINANCING',
                      'Net Cash Provided by (Used in) Financing Activities',
                      (s) => s.netFinancing,
                      (s) => s.financingInflows,
                      (s) => s.financingOutflows
                    )}

                    <tr id="div-cf-reconciliation">
                      <td className="pt-4 pb-1 font-bold">
                        Increase/(Decrease) in Cash and Cash Equivalents
                      </td>
                      <td className="pt-4 pb-1 px-4 text-right font-bold tabular-nums border-t border-black">
                        {formatFSNumber(cashFlowsSummaryCurrent.netIncreaseDecrease)}
                      </td>
                      {showComparative && (
                        <td className="pt-4 pb-1 px-4 text-right font-bold tabular-nums border-t border-black">
                          {formatFSNumber(cashFlowsSummaryPrior.netIncreaseDecrease)}
                        </td>
                      )}
                    </tr>
                    {(hasAnyFx || !hideZeroRows) && (
                      <tr>
                        <td className="py-1 pl-6">
                          Effects of Exchange Rate Changes on Cash and Cash Equivalents
                        </td>
                        <td className="py-1 px-4 text-right tabular-nums">
                          {formatFSNumber(cashFlowsSummaryCurrent.fxEffects)}
                        </td>
                        {showComparative && (
                          <td className="py-1 px-4 text-right tabular-nums">
                            {formatFSNumber(cashFlowsSummaryPrior.fxEffects)}
                          </td>
                        )}
                      </tr>
                    )}
                    <tr>
                      <td className="py-1 font-bold">Cash and Cash Equivalents, January 1</td>
                      {[
                        {
                          key: 'current',
                          value: cashFlowsSummaryCurrent.january1Cash,
                          isEditable2024: selectedYear === '2024' && Boolean(onSaveAmount),
                        },
                        ...(showComparative
                          ? [
                              {
                                key: 'prior',
                                value: cashFlowsSummaryPrior.january1Cash,
                                isEditable2024: priorYear === '2024' && Boolean(onSaveAmount),
                              },
                            ]
                          : []),
                      ].map((col) => (
                        <td key={col.key} className="py-1 px-4 text-right font-bold tabular-nums">
                          {col.isEditable2024 && isEditingJan1_2024 ? (
                            <>
                              <span className="hidden print:inline">
                                {formatFSNumber(col.value)}
                              </span>
                              <div className="inline-flex items-center justify-end gap-1 no-print font-sans">
                                <input
                                  type="text"
                                  value={jan1_2024Input}
                                  onChange={(e) => setJan1_2024Input(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      e.preventDefault();
                                      onSaveAmount?.(
                                        '2024',
                                        selectedDivisionId,
                                        'cf-sum-beg-cash',
                                        parseNumberInput(jan1_2024Input)
                                      );
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
                                    onSaveAmount?.(
                                      '2024',
                                      selectedDivisionId,
                                      'cf-sum-beg-cash',
                                      parseNumberInput(jan1_2024Input)
                                    );
                                    setIsEditingJan1_2024(false);
                                  }}
                                  title="Save FY 2024 Beginning Cash"
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
                            </>
                          ) : (
                            <div className="inline-flex items-center justify-end gap-1.5">
                              <span>{formatFSNumber(col.value)}</span>
                              {col.isEditable2024 && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setJan1_2024Input(col.value !== 0 ? String(col.value) : '');
                                    setIsEditingJan1_2024(true);
                                  }}
                                  title={
                                    col.value === 0
                                      ? 'Encode FY 2024 Beginning Cash (Jan 1)'
                                      : 'Edit FY 2024 Beginning Cash (Jan 1)'
                                  }
                                  className="no-print font-sans inline-flex items-center gap-1 px-1.5 py-0.5 text-[11px] font-bold rounded border border-sky-400/70 bg-sky-50 hover:bg-sky-100 text-sky-800 cursor-pointer transition-colors"
                                >
                                  <Pencil className="w-2.5 h-2.5" />
                                  <span>{col.value === 0 ? 'Encode' : 'Edit'}</span>
                                </button>
                              )}
                            </div>
                          )}
                        </td>
                      ))}
                    </tr>
                    <tr>
                      <td className="pt-1.5 pb-3 font-bold uppercase">
                        Cash and Cash Equivalents, December 31
                      </td>
                      <td className="pt-1.5 pb-3 px-4 text-right font-bold tabular-nums border-t border-black border-b-4 border-double">
                        {formatFSNumber(cashFlowsSummaryCurrent.december31Cash)}
                      </td>
                      {showComparative && (
                        <td className="pt-1.5 pb-3 px-4 text-right font-bold tabular-nums border-t border-black border-b-4 border-double">
                          {formatFSNumber(cashFlowsSummaryPrior.december31Cash)}
                        </td>
                      )}
                    </tr>
                  </tbody>
                </table>
              </div>
            );
          })()
        ) : selectedStatement === 'net_assets' ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm border-collapse">
              <thead>
                <tr>
                  <th className="py-1.5 pr-4 text-left font-bold uppercase w-3/5 text-sm">
                    Particulars
                  </th>
                  <th className="py-1.5 px-4 text-center font-bold w-1/5 text-sm border-b border-black">
                    {selectedYear}
                  </th>
                  {showComparative && (
                    <th className="py-1.5 px-4 text-center font-bold w-1/5 text-sm border-b border-black">
                      {priorYear}
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                <tr id="div-na-beginning">
                  <td className="pt-4 pb-1 font-bold">Balance at January 1</td>
                  <td className="pt-4 pb-1 px-4 text-right font-bold tabular-nums">
                    {formatFSNumber(netAssetsSummaryCurrent.january1Balance)}
                  </td>
                  {showComparative && (
                    <td className="pt-4 pb-1 px-4 text-right font-bold tabular-nums">
                      {formatFSNumber(netAssetsSummaryPrior.january1Balance)}
                    </td>
                  )}
                </tr>
                <tr>
                  <td colSpan={showComparative ? 3 : 2} className="pt-2 pb-1 pl-6 font-bold">
                    Add/(Deduct):
                  </td>
                </tr>
                <tr>
                  <td className="py-0.5 pl-12">Changes in Accounting Policy</td>
                  <td className="py-0.5 px-4 text-right tabular-nums">
                    {formatFSNumber(netAssetsSummaryCurrent.changesInAccountingPolicy)}
                  </td>
                  {showComparative && (
                    <td className="py-0.5 px-4 text-right tabular-nums">
                      {formatFSNumber(netAssetsSummaryPrior.changesInAccountingPolicy)}
                    </td>
                  )}
                </tr>
                <tr>
                  <td className="py-0.5 pl-12">Prior period errors</td>
                  <td className="py-0.5 px-4 text-right tabular-nums">
                    {formatFSNumber(netAssetsSummaryCurrent.priorPeriodErrors)}
                  </td>
                  {showComparative && (
                    <td className="py-0.5 px-4 text-right tabular-nums">
                      {formatFSNumber(netAssetsSummaryPrior.priorPeriodErrors)}
                    </td>
                  )}
                </tr>
                <tr>
                  <td className="py-0.5 pl-12">Other Adjustments</td>
                  <td className="py-0.5 px-4 text-right tabular-nums">
                    {formatFSNumber(netAssetsSummaryCurrent.otherAdjustments)}
                  </td>
                  {showComparative && (
                    <td className="py-0.5 px-4 text-right tabular-nums">
                      {formatFSNumber(netAssetsSummaryPrior.otherAdjustments)}
                    </td>
                  )}
                </tr>
                <tr>
                  <td className="pt-2 pb-3 font-bold">Restated Balance</td>
                  <td className="pt-2 pb-3 px-4 text-right font-bold tabular-nums border-t border-black">
                    {formatFSNumber(netAssetsSummaryCurrent.restatedBalance)}
                  </td>
                  {showComparative && (
                    <td className="pt-2 pb-3 px-4 text-right font-bold tabular-nums border-t border-black">
                      {formatFSNumber(netAssetsSummaryPrior.restatedBalance)}
                    </td>
                  )}
                </tr>

                <tr id="div-na-changes">
                  <td colSpan={showComparative ? 3 : 2} className="pt-2 pb-0.5 font-bold">
                    Add/(Deduct):
                  </td>
                </tr>
                <tr>
                  <td colSpan={showComparative ? 3 : 2} className="pt-0.5 pb-1 font-bold">
                    Changes in Net Assets/Equity for the Calendar Year
                  </td>
                </tr>
                <tr>
                  <td className="py-0.5 pl-12">Surplus/(Deficit) for the Period</td>
                  <td className="py-0.5 px-4 text-right tabular-nums">
                    {formatFSNumber(netAssetsSummaryCurrent.surplusDeficitForPeriod)}
                  </td>
                  {showComparative && (
                    <td className="py-0.5 px-4 text-right tabular-nums">
                      {formatFSNumber(netAssetsSummaryPrior.surplusDeficitForPeriod)}
                    </td>
                  )}
                </tr>
                <tr>
                  <td className="py-0.5 pl-12">
                    Adjustment of net revenue recognized directly in net assets/equity
                  </td>
                  <td className="py-0.5 px-4 text-right tabular-nums">
                    {formatFSNumber(netAssetsSummaryCurrent.netRevenueAdjustment)}
                  </td>
                  {showComparative && (
                    <td className="py-0.5 px-4 text-right tabular-nums">
                      {formatFSNumber(netAssetsSummaryPrior.netRevenueAdjustment)}
                    </td>
                  )}
                </tr>
                <tr>
                  <td className="py-0.5 pl-12">Others</td>
                  <td className="py-0.5 px-4 text-right tabular-nums">
                    {formatFSNumber(netAssetsSummaryCurrent.others)}
                  </td>
                  {showComparative && (
                    <td className="py-0.5 px-4 text-right tabular-nums">
                      {formatFSNumber(netAssetsSummaryPrior.others)}
                    </td>
                  )}
                </tr>

                <tr id="div-na-ending">
                  <td className="pt-3 pb-3 font-bold uppercase">Balance at December 31</td>
                  <td className="pt-3 pb-3 px-4 text-right font-bold tabular-nums border-t border-black border-b-4 border-double">
                    {formatFSNumber(netAssetsSummaryCurrent.december31Balance)}
                  </td>
                  {showComparative && (
                    <td className="pt-3 pb-3 px-4 text-right font-bold tabular-nums border-t border-black border-b-4 border-double">
                      {formatFSNumber(netAssetsSummaryPrior.december31Balance)}
                    </td>
                  )}
                </tr>
              </tbody>
            </table>
          </div>
        ) : isCondensed ? (
          <div className="overflow-x-auto">
            {(() => {
              const CONDENSED_NOTES: Record<string, string> = {
  "Cash and Cash Equivalents": "6",
  "Receivables": "7",
  "Inventories": "8",
  "Other Current Assets": "9",
  "Property, Plant and Equipment": "10",
  "Biological Assets": "11",
  "Intangible Assets": "12",
  "Other Non-Current Assets": "13",
  "Financial Liabilities": "14",
  "Inter-Agency Payables": "15",
  "Intra-Agency Payables": "16",
  "Trust Liabilities": "17",
  "Other Payables": "19"
};
              return (
                <table className="w-full text-left text-[12pt] border-collapse">
                  <thead>
                    <tr>
                      <th className="py-1.5 pr-4 w-1/2"></th>
                      <th className="py-1.5 px-3 text-center font-bold w-16">Note</th>
                      <th className="py-1.5 px-4 text-center font-bold border-b border-black">
                        {selectedYear}
                      </th>
                      {showComparative && (
                        <th className="py-1.5 px-4 text-center font-bold border-b border-black">
                          {priorYear}
                        </th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td colSpan={showComparative ? 4 : 3} className="pt-3 pb-1 font-bold uppercase">
                        ASSETS
                      </td>
                    </tr>
                    <tr>
                      <td colSpan={showComparative ? 4 : 3} className="pb-1 font-bold">
                        Current Assets
                      </td>
                    </tr>
                    {sectionsHierarchy["Current Assets"] &&
                      Object.entries(sectionsHierarchy["Current Assets"]).map(([groupName, subgroups]) => {
                        if (hideZeroRows && !isGroupVisible(subgroups)) return null;
                        const grpCurr = sumSubgroupsNet(subgroups, reportCurrent);
                        const grpPrior = sumSubgroupsNet(subgroups, reportPrior);
                        return (
                          <tr key={groupName}>
                            <td className="py-0.5 pl-8">{groupName}</td>
                            <td className="py-0.5 px-1 text-center font-bold">
                              <input
                                type="text"
                                value={condensedNotes[groupName] ?? ""}
                                onChange={(e) => handleNoteChange(groupName, e.target.value)}
                                className="w-12 text-center font-bold bg-transparent border border-transparent hover:border-slate-300 focus:border-black focus:outline-hidden rounded-xs print:border-none"
                                aria-label={`Note for ${groupName}`}
                              />
                            </td>
                            <td className="py-0.5 px-4 text-right tabular-nums">{formatFSNumber(grpCurr)}</td>
                            {showComparative && (
                              <td className="py-0.5 px-4 text-right tabular-nums">{formatFSNumber(grpPrior)}</td>
                            )}
                          </tr>
                        );
                      })}
                    <tr>
                      <td className="pt-1 pb-3 pl-8 font-bold">Total Current Assets</td>
                      <td></td>
                      <td className="pt-1 pb-3 px-4 text-right font-bold tabular-nums border-t border-black">
                        {formatFSNumber(reportCurrent.totalCurrentAssets)}
                      </td>
                      {showComparative && (
                        <td className="pt-1 pb-3 px-4 text-right font-bold tabular-nums border-t border-black">
                          {formatFSNumber(reportPrior.totalCurrentAssets)}
                        </td>
                      )}
                    </tr>

                    <tr>
                      <td colSpan={showComparative ? 4 : 3} className="pt-2 pb-1 font-bold">
                        Non-Current Assets
                      </td>
                    </tr>
                    {sectionsHierarchy["Non-Current Assets"] &&
                      Object.entries(sectionsHierarchy["Non-Current Assets"]).map(([groupName, subgroups]) => {
                        if (hideZeroRows && !isGroupVisible(subgroups)) return null;
                        const grpCurr = sumSubgroupsNet(subgroups, reportCurrent);
                        const grpPrior = sumSubgroupsNet(subgroups, reportPrior);
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
                              <input
                                type="text"
                                value={condensedNotes[groupName] ?? ""}
                                onChange={(e) => handleNoteChange(groupName, e.target.value)}
                                className="w-12 text-center font-bold bg-transparent border border-transparent hover:border-slate-300 focus:border-black focus:outline-hidden rounded-xs print:border-none"
                                aria-label={`Note for ${groupName}`}
                              />
                            </td>
                            <td className="py-0.5 px-4 text-right tabular-nums align-top">{formatFSNumber(grpCurr)}</td>
                            {showComparative && (
                              <td className="py-0.5 px-4 text-right tabular-nums align-top">{formatFSNumber(grpPrior)}</td>
                            )}
                          </tr>
                        );
                      })}
                    <tr>
                      <td className="pt-1 pb-1 pl-8 font-bold">Total Non-Current Assets</td>
                      <td></td>
                      <td className="pt-1 pb-1 px-4 text-right font-bold tabular-nums border-t border-black">
                        {formatFSNumber(reportCurrent.totalNonCurrentAssets)}
                      </td>
                      {showComparative && (
                        <td className="pt-1 pb-1 px-4 text-right font-bold tabular-nums border-t border-black">
                          {formatFSNumber(reportPrior.totalNonCurrentAssets)}
                        </td>
                      )}
                    </tr>
                    <tr>
                      <td className="pt-1 pb-4 font-bold uppercase">TOTAL ASSETS</td>
                      <td></td>
                      <td className="pt-1 pb-4 px-4 text-right font-bold tabular-nums border-t border-black border-b-4 border-double">
                        {formatFSNumber(reportCurrent.totalAssets)}
                      </td>
                      {showComparative && (
                        <td className="pt-1 pb-4 px-4 text-right font-bold tabular-nums border-t border-black border-b-4 border-double">
                          {formatFSNumber(reportPrior.totalAssets)}
                        </td>
                      )}
                    </tr>

                    <tr>
                      <td colSpan={showComparative ? 4 : 3} className="pt-2 pb-1 font-bold uppercase">
                        LIABILITIES
                      </td>
                    </tr>
                    <tr>
                      <td colSpan={showComparative ? 4 : 3} className="pb-1 font-bold">
                        Current Liabilities
                      </td>
                    </tr>
                    {sectionsHierarchy["Current Liabilities"] &&
                      Object.entries(sectionsHierarchy["Current Liabilities"]).map(([groupName, subgroups]) => {
                        if (hideZeroRows && !isGroupVisible(subgroups)) return null;
                        const grpCurr = sumSubgroupsNet(subgroups, reportCurrent);
                        const grpPrior = sumSubgroupsNet(subgroups, reportPrior);
                        return (
                          <tr key={groupName}>
                            <td className="py-0.5 pl-8">{groupName}</td>
                            <td className="py-0.5 px-1 text-center font-bold">
                              <input
                                type="text"
                                value={condensedNotes[groupName] ?? ""}
                                onChange={(e) => handleNoteChange(groupName, e.target.value)}
                                className="w-12 text-center font-bold bg-transparent border border-transparent hover:border-slate-300 focus:border-black focus:outline-hidden rounded-xs print:border-none"
                                aria-label={`Note for ${groupName}`}
                              />
                            </td>
                            <td className="py-0.5 px-4 text-right tabular-nums">{formatFSNumber(grpCurr)}</td>
                            {showComparative && (
                              <td className="py-0.5 px-4 text-right tabular-nums">{formatFSNumber(grpPrior)}</td>
                            )}
                          </tr>
                        );
                      })}
                    <tr>
                      <td className="pt-1 pb-3 pl-8 font-bold">Total Current Liabilities</td>
                      <td></td>
                      <td className="pt-1 pb-3 px-4 text-right font-bold tabular-nums border-t border-black">
                        {formatFSNumber(reportCurrent.totalCurrentLiabilities)}
                      </td>
                      {showComparative && (
                        <td className="pt-1 pb-3 px-4 text-right font-bold tabular-nums border-t border-black">
                          {formatFSNumber(reportPrior.totalCurrentLiabilities)}
                        </td>
                      )}
                    </tr>
                    <tr>
                      <td className="pt-1 pb-3 font-bold uppercase">TOTAL LIABILITIES</td>
                      <td></td>
                      <td className="pt-1 pb-3 px-4 text-right font-bold tabular-nums border-t border-black border-b border-black">
                        {formatFSNumber(reportCurrent.totalLiabilities)}
                      </td>
                      {showComparative && (
                        <td className="pt-1 pb-3 px-4 text-right font-bold tabular-nums border-t border-black border-b border-black">
                          {formatFSNumber(reportPrior.totalLiabilities)}
                        </td>
                      )}
                    </tr>
                    <tr>
                      <td className="pt-1 pb-4 font-bold">Total Assets less Total Liabilities</td>
                      <td></td>
                      <td className="pt-1 pb-4 px-4 text-right font-bold tabular-nums border-b-4 border-double border-black">
                        {formatFSNumber(reportCurrent.netAssetsEquity)}
                      </td>
                      {showComparative && (
                        <td className="pt-1 pb-4 px-4 text-right font-bold tabular-nums border-b-4 border-double border-black">
                          {formatFSNumber(reportPrior.netAssetsEquity)}
                        </td>
                      )}
                    </tr>

                    <tr>
                      <td colSpan={showComparative ? 4 : 3} className="pt-2 pb-1 font-bold uppercase">
                        NET ASSETS/EQUITY
                      </td>
                    </tr>
                    <tr>
                      <td className="py-0.5">Accumulated Surplus/(Deficit)</td>
                      <td></td>
                      <td className="py-0.5 px-4 text-right tabular-nums">
                        {formatFSNumber(reportCurrent.netAssetsEquity)}
                      </td>
                      {showComparative && (
                        <td className="py-0.5 px-4 text-right tabular-nums">
                          {formatFSNumber(reportPrior.netAssetsEquity)}
                        </td>
                      )}
                    </tr>
                    <tr>
                      <td className="pt-1 pb-2 font-bold">Total Net Assets/Equity</td>
                      <td></td>
                      <td className="pt-1 pb-2 px-4 text-right font-bold tabular-nums border-t border-black border-b-4 border-double">
                        {formatFSNumber(reportCurrent.netAssetsEquity)}
                      </td>
                      {showComparative && (
                        <td className="pt-1 pb-2 px-4 text-right font-bold tabular-nums border-t border-black border-b-4 border-double">
                          {formatFSNumber(reportPrior.netAssetsEquity)}
                        </td>
                      )}
                    </tr>
                  </tbody>
                </table>
              );
            })()}
          </div>
        ) : (

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm border-collapse">
            <thead>
              <tr>
                <th className="py-1.5 pr-4 text-left font-normal uppercase w-3/5 text-sm">
                  ASSETS
                </th>
                <th className="py-1.5 px-4 text-center font-bold w-1/5 text-sm border-b border-black dark:border-slate-400">
                  {selectedYear}
                </th>
                {showComparative && (
                  <th className="py-1.5 px-4 text-center font-bold w-1/5 text-sm border-b border-black dark:border-slate-400">
                    {priorYear}
                  </th>
                )}
              </tr>
            </thead>

            <tbody>
              {/* 1. CURRENT ASSETS */}
              <tr id="assets-section">
                <td colSpan={showComparative ? 3 : 2} className="pt-4 pb-2 font-bold">
                  Current Assets
                </td>
              </tr>

              {sectionsHierarchy['Current Assets'] &&
                Object.entries(sectionsHierarchy['Current Assets']).map(([groupName, subgroups]) => {
                  if (hideZeroRows && !isGroupVisible(subgroups)) return null;
                  const grpCurr = sumSubgroupsNet(subgroups, reportCurrent);
                  const grpPrior = sumSubgroupsNet(subgroups, reportPrior);
                  return (
                    <React.Fragment key={groupName}>
                      <tr>
                        <td className="pt-3 pb-1 pl-10 font-bold">
                          {groupName}
                        </td>
                        <td className="pt-3 pb-1 px-4 text-right font-bold tabular-nums">
                          {formatFSNumber(grpCurr)}
                        </td>
                        {showComparative && (
                          <td className="pt-3 pb-1 px-4 text-right font-bold tabular-nums">
                            {formatFSNumber(grpPrior)}
                          </td>
                        )}
                      </tr>

                      {Object.entries(subgroups).map(([subgroupName, items]) => {
                        if (hideZeroRows && !isSubgroupVisible(items)) return null;
                        const showSubgroupHeader = subgroupName !== 'General' && subgroupName !== groupName;
                        const subCurr = sumItemsNet(items, reportCurrent);
                        const subPrior = sumItemsNet(items, reportPrior);
                        return (
                          <React.Fragment key={subgroupName}>
                            {showSubgroupHeader && (
                              <tr>
                                <td className="pt-2 pb-0.5 pl-20 font-normal">
                                  {subgroupName}
                                </td>
                                <td className="pt-2 pb-0.5 px-4 text-right font-bold tabular-nums">
                                  {formatFSNumber(subCurr)}
                                </td>
                                {showComparative && (
                                  <td className="pt-2 pb-0.5 px-4 text-right font-bold tabular-nums">
                                    {formatFSNumber(subPrior)}
                                  </td>
                                )}
                              </tr>
                            )}

                            {renderItemsWithNetValue(items, showSubgroupHeader ? 'pl-32' : 'pl-20', true)}
                          </React.Fragment>
                        );
                      })}
                    </React.Fragment>
                  );
                })}

              {/* Total Current Assets */}
              <tr>
                <td className="pt-3 pb-2 pl-10 font-bold">
                  Total Current Assets
                </td>
                <td className="pt-3 pb-2 px-4 text-right font-bold tabular-nums">
                  {formatFSNumber(reportCurrent.totalCurrentAssets)}
                </td>
                {showComparative && (
                  <td className="pt-3 pb-2 px-4 text-right font-bold tabular-nums">
                    {formatFSNumber(reportPrior.totalCurrentAssets)}
                  </td>
                )}
              </tr>

              {/* 2. NON-CURRENT ASSETS */}
              <tr>
                <td colSpan={showComparative ? 3 : 2} className="pt-4 pb-2 font-bold">
                  Non-Current Assets
                </td>
              </tr>

              {sectionsHierarchy['Non-Current Assets'] &&
                Object.entries(sectionsHierarchy['Non-Current Assets']).map(([groupName, subgroups]) => {
                  if (hideZeroRows && !isGroupVisible(subgroups)) return null;
                  const grpCurr = sumSubgroupsNet(subgroups, reportCurrent);
                  const grpPrior = sumSubgroupsNet(subgroups, reportPrior);
                  return (
                    <React.Fragment key={groupName}>
                      <tr>
                        <td className="pt-3 pb-1 pl-10 font-bold">
                          {groupName}
                        </td>
                        <td className="pt-3 pb-1 px-4 text-right font-bold tabular-nums">
                          {formatFSNumber(grpCurr)}
                        </td>
                        {showComparative && (
                          <td className="pt-3 pb-1 px-4 text-right font-bold tabular-nums">
                            {formatFSNumber(grpPrior)}
                          </td>
                        )}
                      </tr>

                      {Object.entries(subgroups).map(([subgroupName, items]) => {
                        if (hideZeroRows && !isSubgroupVisible(items)) return null;
                        const showSubgroupHeader = subgroupName !== 'General' && subgroupName !== groupName;
                        const subCurr = sumItemsNet(items, reportCurrent);
                        const subPrior = sumItemsNet(items, reportPrior);
                        return (
                          <React.Fragment key={subgroupName}>
                            {showSubgroupHeader && (
                              <tr>
                                <td className="pt-2 pb-0.5 pl-20 font-normal">
                                  {subgroupName}
                                </td>
                                <td className="pt-2 pb-0.5 px-4 text-right font-bold tabular-nums">
                                  {formatFSNumber(subCurr)}
                                </td>
                                {showComparative && (
                                  <td className="pt-2 pb-0.5 px-4 text-right font-bold tabular-nums">
                                    {formatFSNumber(subPrior)}
                                  </td>
                                )}
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
                          <td className="pt-1 pb-2 px-4 text-right font-bold tabular-nums border-t border-black">
                            {formatFSNumber(grpCurr)}
                          </td>
                          {showComparative && (
                            <td className="pt-1 pb-2 px-4 text-right font-bold tabular-nums border-t border-black">
                              {formatFSNumber(grpPrior)}
                            </td>
                          )}
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}

              {/* Total Non-Current Assets */}
              <tr>
                <td className="pt-3 pb-2 pl-10 font-bold">
                  Total Non-Current Assets
                </td>
                <td className="pt-3 pb-2 px-4 text-right font-bold tabular-nums">
                  {formatFSNumber(reportCurrent.totalNonCurrentAssets)}
                </td>
                {showComparative && (
                  <td className="pt-3 pb-2 px-4 text-right font-bold tabular-nums">
                    {formatFSNumber(reportPrior.totalNonCurrentAssets)}
                  </td>
                )}
              </tr>

              {/* TOTAL ASSETS */}
              <tr>
                <td className="pt-4 pb-3 font-bold uppercase">
                  TOTAL ASSETS
                </td>
                <td className="pt-4 pb-3 px-4 text-right font-bold tabular-nums">
                  {formatFSNumber(reportCurrent.totalAssets)}
                </td>
                {showComparative && (
                  <td className="pt-4 pb-3 px-4 text-right font-bold tabular-nums">
                    {formatFSNumber(reportPrior.totalAssets)}
                  </td>
                )}
              </tr>

              {/* LIABILITIES SECTION */}
              <tr id="liabilities-section">
                <td colSpan={showComparative ? 3 : 2} className="pt-5 pb-2 font-bold uppercase">
                  LIABILITIES
                </td>
              </tr>

              {/* 1. CURRENT LIABILITIES */}
              <tr>
                <td colSpan={showComparative ? 3 : 2} className="pt-2 pb-2 font-bold">
                  Current Liabilities
                </td>
              </tr>

              {sectionsHierarchy['Current Liabilities'] &&
                Object.entries(sectionsHierarchy['Current Liabilities']).map(([groupName, subgroups]) => {
                  if (hideZeroRows && !isGroupVisible(subgroups)) return null;
                  const grpCurr = sumSubgroupsNet(subgroups, reportCurrent);
                  const grpPrior = sumSubgroupsNet(subgroups, reportPrior);
                  return (
                    <React.Fragment key={groupName}>
                      <tr>
                        <td className="pt-3 pb-1 pl-10 font-bold">
                          {groupName}
                        </td>
                        <td className="pt-3 pb-1 px-4 text-right font-bold tabular-nums">
                          {formatFSNumber(grpCurr)}
                        </td>
                        {showComparative && (
                          <td className="pt-3 pb-1 px-4 text-right font-bold tabular-nums">
                            {formatFSNumber(grpPrior)}
                          </td>
                        )}
                      </tr>

                      {Object.entries(subgroups).map(([subgroupName, items]) => {
                        if (hideZeroRows && !isSubgroupVisible(items)) return null;
                        const showSubgroupHeader = subgroupName !== 'General' && subgroupName !== groupName;
                        const subCurr = sumItemsNet(items, reportCurrent);
                        const subPrior = sumItemsNet(items, reportPrior);
                        return (
                          <React.Fragment key={subgroupName}>
                            {showSubgroupHeader && (
                              <tr>
                                <td className="pt-2 pb-0.5 pl-20 font-normal">
                                  {subgroupName}
                                </td>
                                <td className="pt-2 pb-0.5 px-4 text-right font-bold tabular-nums">
                                  {formatFSNumber(subCurr)}
                                </td>
                                {showComparative && (
                                  <td className="pt-2 pb-0.5 px-4 text-right font-bold tabular-nums">
                                    {formatFSNumber(subPrior)}
                                  </td>
                                )}
                              </tr>
                            )}

                            {renderItemsWithNetValue(items, showSubgroupHeader ? 'pl-32' : 'pl-20', true)}
                          </React.Fragment>
                        );
                      })}
                    </React.Fragment>
                  );
                })}

              {/* Total Current Liabilities */}
              <tr>
                <td className="pt-3 pb-2 pl-10 font-bold">
                  Total Current Liabilities
                </td>
                <td className="pt-3 pb-2 px-4 text-right font-bold tabular-nums">
                  {formatFSNumber(reportCurrent.totalCurrentLiabilities)}
                </td>
                {showComparative && (
                  <td className="pt-3 pb-2 px-4 text-right font-bold tabular-nums">
                    {formatFSNumber(reportPrior.totalCurrentLiabilities)}
                  </td>
                )}
              </tr>

              {/* Total Non-Current Liabilities */}
              <tr>
                <td className="pt-1 pb-2 pl-10 font-bold">
                  Total Non-Current Liabilities
                </td>
                <td className="pt-1 pb-2 px-4 text-right font-bold tabular-nums">
                  {formatFSNumber(reportCurrent.totalNonCurrentLiabilities)}
                </td>
                {showComparative && (
                  <td className="pt-1 pb-2 px-4 text-right font-bold tabular-nums">
                    {formatFSNumber(reportPrior.totalNonCurrentLiabilities)}
                  </td>
                )}
              </tr>

              {/* Total Liabilities */}
              <tr>
                <td className="pt-3 pb-2 pl-10 font-bold">
                  Total Liabilities
                </td>
                <td className="pt-3 pb-2 px-4 text-right font-bold tabular-nums">
                  {formatFSNumber(reportCurrent.totalLiabilities)}
                </td>
                {showComparative && (
                  <td className="pt-3 pb-2 px-4 text-right font-bold tabular-nums">
                    {formatFSNumber(reportPrior.totalLiabilities)}
                  </td>
                )}
              </tr>

              {/* Total Assets less Total Liabilities */}
              <tr>
                <td className="pt-4 pb-2 font-bold">
                  Total Assets less Total Liabilities
                </td>
                <td className="pt-4 pb-2 px-4 text-right font-bold tabular-nums">
                  {formatFSNumber(reportCurrent.netAssetsEquity)}
                </td>
                {showComparative && (
                  <td className="pt-4 pb-2 px-4 text-right font-bold tabular-nums">
                    {formatFSNumber(reportPrior.netAssetsEquity)}
                  </td>
                )}
              </tr>

              {/* NET ASSETS / EQUITY */}
              <tr id="equity-section">
                <td colSpan={showComparative ? 3 : 2} className="pt-4 pb-2 font-bold">
                  Net Assets/Equity
                </td>
              </tr>

              {sectionsHierarchy['Net Assets/Equity'] &&
                Object.entries(sectionsHierarchy['Net Assets/Equity']).map(([groupName, subgroups]) => {
                  const grpCurr = sumSubgroupsNet(subgroups, reportCurrent);
                  const grpPrior = sumSubgroupsNet(subgroups, reportPrior);
                  return (
                    <React.Fragment key={groupName}>
                      <tr>
                        <td className="pt-2 pb-1 pl-10 font-bold">
                          {groupName}
                        </td>
                        <td className="pt-2 pb-1 px-4 text-right font-bold tabular-nums">
                          {formatFSNumber(grpCurr)}
                        </td>
                        {showComparative && (
                          <td className="pt-2 pb-1 px-4 text-right font-bold tabular-nums">
                            {formatFSNumber(grpPrior)}
                          </td>
                        )}
                      </tr>

                      {Object.values(subgroups)
                        .flat()
                        .map((item) => {
                          const valCurr = reportCurrent.values[item.id] || 0;
                          const valPrior = reportPrior.values[item.id] || 0;
                          if (hideZeroRows && valCurr === 0 && (!showComparative || valPrior === 0)) {
                            return null;
                          }
                          return (
                            <tr key={item.id}>
                              <td className="py-0.5 pl-20">
                                {item.name}
                              </td>
                              <td className="py-0.5 px-4 text-right tabular-nums">
                                {formatFSNumber(valCurr)}
                              </td>
                              {showComparative && (
                                <td className="py-0.5 px-4 text-right tabular-nums">
                                  {formatFSNumber(valPrior)}
                                </td>
                              )}
                            </tr>
                          );
                        })}
                    </React.Fragment>
                  );
                })}

              {/* Total Net Assets/Equity */}
              <tr>
                <td className="pt-4 pb-3 font-bold">
                  Total Net Assets/Equity
                </td>
                <td className="pt-4 pb-3 px-4 text-right font-bold tabular-nums">
                  {formatFSNumber(reportCurrent.netAssetsEquity)}
                </td>
                {showComparative && (
                  <td className="pt-4 pb-3 px-4 text-right font-bold tabular-nums">
                    {formatFSNumber(reportPrior.netAssetsEquity)}
                  </td>
                )}
              </tr>
            </tbody>
          </table>
        </div>
        )}
      </div>
        </div>
      </div>
    </div>
  );
};
