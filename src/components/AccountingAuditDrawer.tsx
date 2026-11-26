import React, { useState } from 'react';
import { formatAccounting } from '../utils/formatters';
import {
  AuditCheckItem,
  AuditYearEvaluation,
  FullCrossStatementAuditReport,
  YearStatementSnippetContext,
} from '../utils/auditChecks';
import {
  Scale,
  CheckCircle2,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  X,
  PanelRightClose,
  PanelRightOpen,
  ClipboardCheck,
} from 'lucide-react';

interface AccountingAuditDrawerProps {
  isOpen: boolean;
  onToggle: () => void;
  isPinned: boolean;
  onTogglePin: () => void;
  selectedYear: string;
  divisionName: string;
  auditReport: FullCrossStatementAuditReport;
}

const CHECK_STATEMENTS: Record<AuditCheckItem['id'], string> = {
  sfp_accum_surplus_vs_na_ending:
    'SFP Accum. Surplus/(Deficit) = SCNAE Balance, Dec 31',
  sfp_cash_vs_cf_ending:
    'SFP Cash & Cash Equiv. = SCF Cash, Dec 31',
  equity_vs_assets_less_liab:
    'Total Net Assets/Equity = Total Assets − Total Liabilities',
  perf_surplus_vs_na_surplus:
    'SFPerf Surplus/(Deficit) = SCNAE Surplus/(Deficit)',
  na_beg_vs_prev_ending:
    'SCNAE Jan 1 Balance = Prior Year Dec 31 Balance',
  cf_beg_vs_prev_ending:
    'SCF Jan 1 Cash = Prior Year Dec 31 Cash',
};

type CellHighlight = 'pass' | 'fail' | 'context' | undefined;

interface SnippetRow {
  label: string;
  col1: number | null;
  col2: number | null;
  highlightCol1?: CellHighlight;
  highlightCol2?: CellHighlight;
  bold?: boolean;
  indent?: boolean;
  topBorder?: boolean;
  doubleBottom?: boolean;
}

const highlightCellClass = (hl: CellHighlight): string => {
  if (hl === 'fail') {
    return 'bg-amber-200 text-amber-950 font-bold ring-1 ring-amber-600 rounded-xs';
  }
  if (hl === 'pass') {
    return 'bg-emerald-100/90 text-emerald-950 font-bold ring-1 ring-emerald-500/70 rounded-xs';
  }
  if (hl === 'context') {
    return 'bg-slate-100 text-slate-900 font-bold rounded-xs';
  }
  return '';
};

const formatSnippetNum = (val: number | null): string => {
  if (val === null) return '';
  if (Math.abs(val) < 0.005) return '-';
  if (val < 0) return `(${formatAccounting(Math.abs(val), false)})`;
  return formatAccounting(val, false);
};

interface MiniStatementSnippetProps {
  statementTitle: string;
  col1Year: string;
  col2Year: string;
  rows: SnippetRow[];
}

const MiniStatementSnippet: React.FC<MiniStatementSnippetProps> = ({
  statementTitle,
  col1Year,
  col2Year,
  rows,
}) => (
  <div className="bg-white text-black border border-slate-300 rounded-lg px-3 py-2.5 shadow-2xs font-['Times_New_Roman',Times,serif] text-[11px] leading-snug">
    <div className="font-sans text-[10px] font-bold uppercase tracking-wider text-slate-600 pb-1.5 mb-1.5 border-b border-slate-200 flex items-center justify-between gap-2">
      <span className="truncate">{statementTitle}</span>
      <span className="text-slate-400 font-semibold shrink-0">Excerpt</span>
    </div>
    <table className="w-full border-collapse">
      <thead>
        <tr>
          <th className="text-left font-bold pb-1 pr-2 w-[48%]">Particulars</th>
          <th className="text-right font-bold pb-1 px-1.5 border-b border-black w-[26%] tabular-nums">
            {col1Year}
          </th>
          <th className="text-right font-bold pb-1 pl-1.5 border-b border-black w-[26%] tabular-nums">
            {col2Year}
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, idx) => (
          <tr key={`${r.label}-${idx}`}>
            <td
              className={`py-0.5 pr-2 ${r.indent ? 'pl-3' : ''} ${
                r.bold ? 'font-bold' : ''
              }`}
            >
              {r.label}
            </td>
            <td
              className={`py-0.5 px-1 text-right tabular-nums ${
                r.bold ? 'font-bold' : ''
              } ${r.topBorder ? 'border-t border-black' : ''} ${
                r.doubleBottom ? 'border-b-2 border-double border-black' : ''
              }`}
            >
              <span
                className={`inline-block px-1 py-0.5 ${highlightCellClass(
                  r.highlightCol1
                )}`}
              >
                {formatSnippetNum(r.col1)}
              </span>
            </td>
            <td
              className={`py-0.5 pl-1 text-right tabular-nums ${
                r.bold ? 'font-bold' : ''
              } ${r.topBorder ? 'border-t border-black' : ''} ${
                r.doubleBottom ? 'border-b-2 border-double border-black' : ''
              }`}
            >
              <span
                className={`inline-block px-1 py-0.5 ${highlightCellClass(
                  r.highlightCol2
                )}`}
              >
                {formatSnippetNum(r.col2)}
              </span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

export const AccountingAuditDrawer: React.FC<AccountingAuditDrawerProps> = ({
  isOpen,
  onToggle,
  isPinned,
  onTogglePin,
  divisionName,
  auditReport,
}) => {
  // Collapsed by default so the user sees clean symbolic statements first
  const [expandedChecks, setExpandedChecks] = useState<Record<string, boolean>>({});
  const [rollForwardFocus, setRollForwardFocus] = useState<Record<string, 'curr' | 'prior'>>({});

  const toggleCheck = (id: string) => {
    setExpandedChecks((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const renderYearStatus = (ev: AuditYearEvaluation) => {
    if (ev.status === 'na') {
      return (
        <span className="text-[11px] font-medium text-th-muted whitespace-nowrap">
          {ev.year}: Baseline
        </span>
      );
    }
    if (ev.status === 'pass') {
      return (
        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-800 dark:text-emerald-300 whitespace-nowrap">
          <CheckCircle2 className="w-3 h-3 shrink-0" />
          <span>{ev.year}</span>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-800 dark:text-amber-300 whitespace-nowrap">
        <AlertTriangle className="w-3 h-3 shrink-0" />
        <span>{ev.year}</span>
      </span>
    );
  };

  const getStatusHighlight = (ev: AuditYearEvaluation): CellHighlight => {
    if (ev.status === 'fail') return 'fail';
    if (ev.status === 'pass') return 'pass';
    return undefined;
  };

  const renderVarianceFootnote = (check: AuditCheckItem) => {
    const failures = [check.currentYear, check.priorYear].filter(
      (ev) => ev.status === 'fail'
    );
    if (failures.length === 0) return null;

    return (
      <div className="px-2.5 py-1.5 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 text-[11px] font-semibold text-amber-900 dark:text-amber-200 space-y-0.5">
        {failures.map((ev) => (
          <div key={ev.year} className="flex items-center justify-between gap-2">
            <span>FY {ev.year} variance</span>
            <span className="font-mono tabular-nums font-bold">
              ₱ {formatAccounting(ev.difference)}
            </span>
          </div>
        ))}
      </div>
    );
  };

  const renderStatementSnippets = (check: AuditCheckItem) => {
    const currYr = auditReport.currentYear;
    const priorYr = auditReport.priorYear;
    const currCtx: YearStatementSnippetContext | undefined = auditReport.contexts[currYr];
    const priorCtx: YearStatementSnippetContext | undefined = auditReport.contexts[priorYr];
    if (!currCtx || !priorCtx) return null;

    const hlCurr = getStatusHighlight(check.currentYear);
    const hlPrior = getStatusHighlight(check.priorYear);

    if (check.id === 'sfp_accum_surplus_vs_na_ending') {
      return (
        <div className="space-y-2">
          <MiniStatementSnippet
            statementTitle="Statement of Financial Position"
            col1Year={currYr}
            col2Year={priorYr}
            rows={[
              {
                label: 'Total Assets',
                col1: currCtx.sfpTotalAssets,
                col2: priorCtx.sfpTotalAssets,
              },
              {
                label: 'Total Liabilities',
                col1: currCtx.sfpTotalLiabilities,
                col2: priorCtx.sfpTotalLiabilities,
              },
              {
                label: 'Accumulated Surplus/(Deficit)',
                col1: currCtx.sfpAccumulatedSurplus,
                col2: priorCtx.sfpAccumulatedSurplus,
                highlightCol1: hlCurr,
                highlightCol2: hlPrior,
                indent: true,
              },
              {
                label: 'Total Net Assets/Equity',
                col1: currCtx.sfpTotalEquity,
                col2: priorCtx.sfpTotalEquity,
                bold: true,
                topBorder: true,
              },
            ]}
          />

          <MiniStatementSnippet
            statementTitle="Statement of Changes in Net Assets/Equity"
            col1Year={currYr}
            col2Year={priorYr}
            rows={[
              {
                label: 'Restated Balance',
                col1: currCtx.naRestatedBalance,
                col2: priorCtx.naRestatedBalance,
                bold: true,
              },
              {
                label: 'Surplus/(Deficit) for the Period',
                col1: currCtx.naSurplus,
                col2: priorCtx.naSurplus,
                indent: true,
              },
              {
                label: 'Balance at December 31',
                col1: currCtx.naDec31Balance,
                col2: priorCtx.naDec31Balance,
                highlightCol1: hlCurr,
                highlightCol2: hlPrior,
                bold: true,
                topBorder: true,
                doubleBottom: true,
              },
            ]}
          />
          {renderVarianceFootnote(check)}
        </div>
      );
    }

    if (check.id === 'sfp_cash_vs_cf_ending') {
      return (
        <div className="space-y-2">
          <MiniStatementSnippet
            statementTitle="Statement of Financial Position"
            col1Year={currYr}
            col2Year={priorYr}
            rows={[
              {
                label: 'Cash and Cash Equivalents',
                col1: currCtx.sfpCash,
                col2: priorCtx.sfpCash,
                highlightCol1: hlCurr,
                highlightCol2: hlPrior,
                indent: true,
              },
              {
                label: 'Total Current Assets',
                col1: currCtx.sfpCurrentAssets,
                col2: priorCtx.sfpCurrentAssets,
                bold: true,
                topBorder: true,
              },
            ]}
          />

          <MiniStatementSnippet
            statementTitle="Statement of Cash Flows"
            col1Year={currYr}
            col2Year={priorYr}
            rows={[
              {
                label: 'Increase/(Decrease) in Cash',
                col1: currCtx.cfNetChange,
                col2: priorCtx.cfNetChange,
              },
              {
                label: 'Cash and Cash Equivalents, Jan 1',
                col1: currCtx.cfJan1Cash,
                col2: priorCtx.cfJan1Cash,
              },
              {
                label: 'Cash and Cash Equivalents, Dec 31',
                col1: currCtx.cfDec31Cash,
                col2: priorCtx.cfDec31Cash,
                highlightCol1: hlCurr,
                highlightCol2: hlPrior,
                bold: true,
                topBorder: true,
                doubleBottom: true,
              },
            ]}
          />
          {renderVarianceFootnote(check)}
        </div>
      );
    }

    if (check.id === 'equity_vs_assets_less_liab') {
      return (
        <div className="space-y-2">
          <MiniStatementSnippet
            statementTitle="Statement of Financial Position"
            col1Year={currYr}
            col2Year={priorYr}
            rows={[
              {
                label: 'Total Assets',
                col1: currCtx.sfpTotalAssets,
                col2: priorCtx.sfpTotalAssets,
                highlightCol1: 'context',
                highlightCol2: 'context',
                bold: true,
              },
              {
                label: 'Less: Total Liabilities',
                col1: currCtx.sfpTotalLiabilities,
                col2: priorCtx.sfpTotalLiabilities,
                highlightCol1: 'context',
                highlightCol2: 'context',
                bold: true,
              },
              {
                label: 'Total Assets less Liabilities',
                col1: currCtx.sfpAssetsLessLiabilities,
                col2: priorCtx.sfpAssetsLessLiabilities,
                highlightCol1: hlCurr,
                highlightCol2: hlPrior,
                bold: true,
                topBorder: true,
              },
              {
                label: 'Total Net Assets/Equity',
                col1: currCtx.sfpTotalEquity,
                col2: priorCtx.sfpTotalEquity,
                highlightCol1: hlCurr,
                highlightCol2: hlPrior,
                bold: true,
                doubleBottom: true,
              },
            ]}
          />
          {renderVarianceFootnote(check)}
        </div>
      );
    }

    if (check.id === 'perf_surplus_vs_na_surplus') {
      return (
        <div className="space-y-2">
          <MiniStatementSnippet
            statementTitle="Statement of Financial Performance"
            col1Year={currYr}
            col2Year={priorYr}
            rows={[
              {
                label: 'Total Revenue',
                col1: currCtx.perfRevenue,
                col2: priorCtx.perfRevenue,
              },
              {
                label: 'Current Operating Expenses',
                col1: currCtx.perfExpenses,
                col2: priorCtx.perfExpenses,
              },
              {
                label: 'Surplus/(Deficit) for the Period',
                col1: currCtx.perfSurplus,
                col2: priorCtx.perfSurplus,
                highlightCol1: hlCurr,
                highlightCol2: hlPrior,
                bold: true,
                topBorder: true,
                doubleBottom: true,
              },
            ]}
          />

          <MiniStatementSnippet
            statementTitle="Statement of Changes in Net Assets/Equity"
            col1Year={currYr}
            col2Year={priorYr}
            rows={[
              {
                label: 'Restated Balance',
                col1: currCtx.naRestatedBalance,
                col2: priorCtx.naRestatedBalance,
                bold: true,
              },
              {
                label: 'Surplus/(Deficit) for the Period',
                col1: currCtx.naSurplus,
                col2: priorCtx.naSurplus,
                highlightCol1: hlCurr,
                highlightCol2: hlPrior,
                indent: true,
              },
              {
                label: 'Balance at December 31',
                col1: currCtx.naDec31Balance,
                col2: priorCtx.naDec31Balance,
                bold: true,
                topBorder: true,
              },
            ]}
          />
          {renderVarianceFootnote(check)}
        </div>
      );
    }

    // Checks 5 & 6: Roll-forward comparisons (Jan 1 of target year vs Dec 31 of previous year)
    const canCompareCurr = check.currentYear.status !== 'na';
    const canComparePrior = check.priorYear.status !== 'na';
    const defaultPair: 'curr' | 'prior' =
      check.priorYear.status === 'fail' && check.currentYear.status !== 'fail'
        ? 'prior'
        : canCompareCurr
        ? 'curr'
        : 'prior';
    const activePair = rollForwardFocus[check.id] ?? defaultPair;

    const targetYr = activePair === 'curr' ? currYr : priorYr;
    const prevYr = activePair === 'curr' ? priorYr : auditReport.priorPriorYear;
    const targetCtx = auditReport.contexts[targetYr];
    const prevCtx = auditReport.contexts[prevYr];
    const activeEval = activePair === 'curr' ? check.currentYear : check.priorYear;
    const pairHl = getStatusHighlight(activeEval);

    if (!canCompareCurr && !canComparePrior) {
      return (
        <div className="p-2.5 rounded-lg bg-th-subtle/60 border border-th-border text-xs text-th-muted">
          FY {currYr} is the earliest baseline year in the system (no FY {priorYr} statement to compare against).
        </div>
      );
    }

    return (
      <div className="space-y-2">
        {canCompareCurr && canComparePrior && (
          <div className="flex items-center gap-1.5">
            {[
              {
                key: 'curr' as const,
                label: `${currYr} vs ${priorYr}`,
                ev: check.currentYear,
              },
              {
                key: 'prior' as const,
                label: `${priorYr} vs ${auditReport.priorPriorYear}`,
                ev: check.priorYear,
              },
            ].map((opt) => (
              <button
                key={opt.key}
                type="button"
                onClick={() =>
                  setRollForwardFocus((prev) => ({ ...prev, [check.id]: opt.key }))
                }
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-colors cursor-pointer ${
                  activePair === opt.key
                    ? 'bg-th-primary text-th-primary-fg border-th-primary dark:border-th-border-strong'
                    : 'bg-th-subtle text-th-muted border-th-border hover:text-th-text'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        )}

        {targetCtx && prevCtx && check.id === 'na_beg_vs_prev_ending' && (
          <MiniStatementSnippet
            statementTitle="Statement of Changes in Net Assets/Equity"
            col1Year={targetYr}
            col2Year={prevYr}
            rows={[
              {
                label: 'Balance at January 1',
                col1: targetCtx.naJan1Balance,
                col2: prevCtx.naJan1Balance,
                highlightCol1: pairHl,
                bold: true,
              },
              {
                label: 'Restated Balance',
                col1: targetCtx.naRestatedBalance,
                col2: prevCtx.naRestatedBalance,
              },
              {
                label: 'Surplus/(Deficit) for the Period',
                col1: targetCtx.naSurplus,
                col2: prevCtx.naSurplus,
                indent: true,
              },
              {
                label: 'Balance at December 31',
                col1: targetCtx.naDec31Balance,
                col2: prevCtx.naDec31Balance,
                highlightCol2: pairHl,
                bold: true,
                topBorder: true,
                doubleBottom: true,
              },
            ]}
          />
        )}

        {targetCtx && prevCtx && check.id === 'cf_beg_vs_prev_ending' && (
          <MiniStatementSnippet
            statementTitle="Statement of Cash Flows"
            col1Year={targetYr}
            col2Year={prevYr}
            rows={[
              {
                label: 'Increase/(Decrease) in Cash',
                col1: targetCtx.cfNetChange,
                col2: prevCtx.cfNetChange,
              },
              {
                label: 'Cash and Cash Equivalents, Jan 1',
                col1: targetCtx.cfJan1Cash,
                col2: prevCtx.cfJan1Cash,
                highlightCol1: pairHl,
                bold: true,
              },
              {
                label: 'Cash and Cash Equivalents, Dec 31',
                col1: targetCtx.cfDec31Cash,
                col2: prevCtx.cfDec31Cash,
                highlightCol2: pairHl,
                bold: true,
                topBorder: true,
                doubleBottom: true,
              },
            ]}
          />
        )}

        {renderVarianceFootnote(check)}
      </div>
    );
  };

  const renderCheckRow = (check: AuditCheckItem) => {
    const isExpanded = Boolean(expandedChecks[check.id]);
    const isPass = check.overallStatus === 'pass';

    return (
      <div
        key={check.id}
        className={`border rounded-xl overflow-hidden transition-colors ${
          isPass
            ? 'border-th-border bg-th-surface'
            : 'border-amber-300 dark:border-amber-800 bg-amber-50/35 dark:bg-amber-950/20'
        }`}
      >
        <button
          type="button"
          onClick={() => toggleCheck(check.id)}
          className="w-full p-3 flex items-start justify-between gap-2.5 text-left cursor-pointer hover:bg-th-subtle/60 transition-colors"
          title="Click to inspect highlighted financial statement excerpts"
        >
          <div className="flex items-start gap-2.5 min-w-0 flex-1">
            {isPass ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-700 dark:text-emerald-400 shrink-0 mt-0.5" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            )}
            <div className="min-w-0 flex-1 space-y-1.5">
              <div className="text-xs sm:text-[13px] font-semibold text-th-text leading-snug">
                {check.number}. {CHECK_STATEMENTS[check.id]}
              </div>
              <div className="flex items-center gap-3">
                {renderYearStatus(check.currentYear)}
                <span className="text-th-border-strong" aria-hidden="true">·</span>
                {renderYearStatus(check.priorYear)}
              </div>
            </div>
          </div>
          {isExpanded ? (
            <ChevronDown className="w-4 h-4 text-th-muted shrink-0 mt-0.5" />
          ) : (
            <ChevronRight className="w-4 h-4 text-th-muted shrink-0 mt-0.5" />
          )}
        </button>

        {isExpanded && (
          <div className="px-3 pb-3 pt-2.5 border-t border-th-border bg-th-subtle/30">
            {renderStatementSnippets(check)}
          </div>
        )}
      </div>
    );
  };

  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={onToggle}
        className="fixed right-5 bottom-7 z-40 bg-th-primary text-th-primary-fg hover:opacity-95 px-4 py-3 min-h-[46px] rounded-xl shadow-2xl flex items-center gap-2.5 text-sm sm:text-base font-bold transition-transform hover:-translate-y-0.5 no-print border-2 border-th-border-strong cursor-pointer"
        title="Open Audit Checks"
      >
        <Scale className="w-5 h-5 shrink-0" />
        <span>Audit Checks</span>
        {auditReport.allPassed ? (
          <CheckCircle2 className="w-5 h-5 text-emerald-300 shrink-0" />
        ) : (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-400 text-slate-950 text-xs font-extrabold">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            <span>{auditReport.failedChecksCount}</span>
          </span>
        )}
      </button>
    );
  }

  return (
    <aside
      className={`bg-th-surface border-l-2 border-th-border shadow-2xl transition-colors flex flex-col z-40 no-print ${
        isPinned
          ? 'w-full lg:w-[26.5rem] shrink-0 sticky top-[calc(4.75rem+2px)] h-[calc(100vh-4.75rem-2px)] border-th-border'
          : 'fixed top-[calc(4.75rem+2px)] right-0 w-[26.5rem] max-w-[95vw] h-[calc(100vh-4.75rem-2px)] border-l-2 border-th-border-strong'
      }`}
    >
      {/* Drawer Header */}
      <div className="p-4 border-b border-th-border flex items-center justify-between bg-th-subtle shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="p-2 bg-th-primary text-th-primary-fg border border-th-border-strong rounded-xl shadow-xs shrink-0">
            <ClipboardCheck className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h3 className="text-base font-bold text-th-text truncate">
              Audit Checks
            </h3>
            <p className="text-xs font-medium text-th-muted truncate" title={divisionName}>
              {divisionName} · {auditReport.currentYear} &amp; {auditReport.priorYear}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={onTogglePin}
            className={`p-2 rounded-xl text-xs font-bold transition-colors hidden lg:flex items-center gap-1 cursor-pointer border ${
              isPinned
                ? 'bg-th-primary text-th-primary-fg border-th-primary dark:border-th-border-strong'
                : 'text-th-muted border-transparent hover:text-th-text hover:bg-th-surface'
            }`}
            title={isPinned ? 'Unpin to slide-over drawer' : 'Pin to side of workspace'}
            aria-label={isPinned ? 'Unpin drawer' : 'Pin drawer'}
          >
            {isPinned ? (
              <PanelRightClose className="w-4 h-4" />
            ) : (
              <PanelRightOpen className="w-4 h-4" />
            )}
          </button>
          <button
            type="button"
            onClick={onToggle}
            className="p-2 text-th-muted hover:text-th-text hover:bg-th-surface rounded-xl transition-colors cursor-pointer"
            title="Close Audit Checks Drawer"
            aria-label="Close Audit Checks Drawer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Scrollable Checklist */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        <div
          className={`px-3 py-2.5 rounded-xl flex items-center justify-between gap-2 text-xs font-bold border ${
            auditReport.allPassed
              ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-900 dark:text-emerald-200 border-emerald-300 dark:border-emerald-800'
              : 'bg-amber-50 dark:bg-amber-950/60 text-amber-900 dark:text-amber-200 border-amber-300 dark:border-amber-800'
          }`}
        >
          <span className="inline-flex items-center gap-1.5">
            {auditReport.allPassed ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-700 dark:text-emerald-400 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
            )}
            <span>
              {auditReport.allPassed
                ? 'All statements tally across both years'
                : `${auditReport.failedChecksCount} check${
                    auditReport.failedChecksCount === 1 ? '' : 's'
                  } need attention`}
            </span>
          </span>
          <span className="text-[11px] font-medium opacity-80 shrink-0">
            Click to preview FS
          </span>
        </div>

        <div className="space-y-2.5">
          {auditReport.checks.map(renderCheckRow)}
        </div>
      </div>
    </aside>
  );
};
