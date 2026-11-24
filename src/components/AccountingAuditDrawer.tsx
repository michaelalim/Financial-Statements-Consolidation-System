import React, { useState } from 'react';
import { formatAccounting } from '../utils/formatters';
import {
  Scale,
  CheckCircle2,
  AlertTriangle,
  TrendingUp,
  Banknote,
  ChevronDown,
  ChevronRight,
  X,
  Layers,
  PanelRightClose,
  PanelRightOpen,
  Landmark,
} from 'lucide-react';

export interface CrossStatementAuditSummary {
  sfpCashAndCashEquivalents: number;
  perfTotalRevenue: number;
  perfTotalExpenses: number;
  perfNetSurplusDeficit: number;
  cfNetOperating: number;
  cfNetInvesting: number;
  cfNetFinancing: number;
  cfNetIncreaseDecrease: number;
  cfBeginningCash: number;
  cfEndingCash: number;
  cfHasData: boolean;
  naBeginningBalance: number;
  naRestatedBalance: number;
  naSurplusForPeriod: number;
  naEndingBalance: number;
  naHasData: boolean;
}

interface AccountingAuditDrawerProps {
  isOpen: boolean;
  onToggle: () => void;
  isPinned: boolean;
  onTogglePin: () => void;
  totalAssets: number;
  totalCurrentAssets: number;
  totalNonCurrentAssets: number;
  totalLiabilities: number;
  totalCurrentLiabilities: number;
  totalNonCurrentLiabilities: number;
  totalEquity: number;
  selectedYear: string;
  divisionName: string;
  crossStatementAudit: CrossStatementAuditSummary;
}

export const AccountingAuditDrawer: React.FC<AccountingAuditDrawerProps> = ({
  isOpen,
  onToggle,
  isPinned,
  onTogglePin,
  totalAssets,
  totalCurrentAssets,
  totalNonCurrentAssets,
  totalLiabilities,
  totalCurrentLiabilities,
  totalNonCurrentLiabilities,
  totalEquity,
  selectedYear,
  divisionName,
  crossStatementAudit,
}) => {
  const [isBSExpanded, setIsBSExpanded] = useState(true);
  const [isCrossChecksExpanded, setIsCrossChecksExpanded] = useState(true);

  const liabilitiesPlusEquity = totalLiabilities + totalEquity;
  const variance = Math.abs(totalAssets - liabilitiesPlusEquity);
  const isBalanced = variance < 0.01;

  const cashVsSfpDiff = Math.abs(
    crossStatementAudit.cfEndingCash - crossStatementAudit.sfpCashAndCashEquivalents
  );
  const hasSfpCashOrCf =
    crossStatementAudit.cfHasData || Math.abs(crossStatementAudit.sfpCashAndCashEquivalents) >= 0.005;
  const isCashAligned = cashVsSfpDiff < 0.01;

  const surplusDiff = Math.abs(
    crossStatementAudit.naSurplusForPeriod - crossStatementAudit.perfNetSurplusDeficit
  );
  const hasSurplusInBoth =
    Math.abs(crossStatementAudit.naSurplusForPeriod) >= 0.005 &&
    Math.abs(crossStatementAudit.perfNetSurplusDeficit) >= 0.005;
  const isSurplusAligned = surplusDiff < 0.01;

  const equityVsSfpDiff = Math.abs(crossStatementAudit.naEndingBalance - totalEquity);
  const hasEquityInBoth =
    crossStatementAudit.naHasData && Math.abs(totalEquity) >= 0.005;
  const isEquityAligned = equityVsSfpDiff < 0.01;

  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={onToggle}
        className="fixed right-5 bottom-7 z-40 bg-th-primary text-th-primary-fg hover:opacity-95 px-4 py-3 min-h-[46px] rounded-xl shadow-2xl flex items-center gap-2.5 text-sm sm:text-base font-bold transition-transform hover:-translate-y-0.5 no-print border-2 border-th-border-strong cursor-pointer"
        title="Open Accounting Checks & Cross-Statement Reconciliation"
      >
        <Scale className="w-5 h-5 shrink-0" />
        <span>Balance Check</span>
        {isBalanced ? (
          <CheckCircle2 className="w-5 h-5 text-emerald-300 shrink-0" />
        ) : (
          <AlertTriangle className="w-5 h-5 text-amber-300 shrink-0" />
        )}
      </button>
    );
  }

  return (
    <aside
      className={`bg-th-surface border-l-2 border-th-border shadow-2xl transition-colors flex flex-col z-40 no-print ${
        isPinned
          ? 'w-full lg:w-92 shrink-0 sticky top-[calc(4.75rem+2px)] h-[calc(100vh-4.75rem-2px)] border-th-border'
          : 'fixed top-[calc(4.75rem+2px)] right-0 w-92 max-w-[95vw] h-[calc(100vh-4.75rem-2px)] border-l-2 border-th-border-strong'
      }`}
    >
      {/* Drawer Header */}
      <div className="p-4 border-b border-th-border flex items-center justify-between bg-th-subtle shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-th-primary text-th-primary-fg border border-th-border-strong rounded-xl shadow-xs">
            <Scale className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-th-text">
              Audit &amp; Checks
            </h3>
            <p className="text-xs font-semibold text-th-muted">
              Balance Sheet &amp; Cross-Statement Checks
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
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
            {isPinned ? <PanelRightClose className="w-4 h-4" /> : <PanelRightOpen className="w-4 h-4" />}
          </button>
          <button
            type="button"
            onClick={onToggle}
            className="p-2 text-th-muted hover:text-th-text hover:bg-th-surface rounded-xl transition-colors cursor-pointer"
            title="Close Checks Drawer"
            aria-label="Close Checks Drawer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Active Context */}
        <div className="px-3.5 py-2.5 bg-th-subtle border border-th-border-strong rounded-xl text-sm flex items-center justify-between gap-2">
          <div className="truncate mr-2">
            <span className="text-th-muted block text-xs font-semibold">Entity</span>
            <span className="font-bold text-th-text truncate block" title={divisionName}>
              {divisionName}
            </span>
          </div>
          <div className="text-right shrink-0">
            <span className="text-th-muted block text-xs font-semibold">Fiscal Year</span>
            <span className="font-bold font-mono tabular-nums text-th-text">FY {selectedYear}</span>
          </div>
        </div>

        {/* Primary Check: Assets = Liabilities + Equity */}
        <div
          className={`border rounded-xl overflow-hidden shadow-2xs ${
            isBalanced
              ? 'border-th-border-strong bg-th-subtle'
              : 'border-amber-300 dark:border-amber-800 bg-amber-50/40 dark:bg-amber-950/20'
          }`}
        >
          <button
            type="button"
            onClick={() => setIsBSExpanded(!isBSExpanded)}
            className="w-full p-3.5 flex items-center justify-between text-left cursor-pointer"
          >
            <div className="flex items-center gap-2.5">
              {isBalanced ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-700 dark:text-emerald-400 shrink-0" />
              ) : (
                <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0" />
              )}
              <div>
                <div className="text-sm font-bold text-th-text">
                  Assets = Liabilities + Equity
                </div>
                <div className="text-xs font-medium font-mono tabular-nums text-th-muted">
                  {isBalanced ? 'In balance (Diff: ₱0.00)' : `Variance: ₱${formatAccounting(variance)}`}
                </div>
              </div>
            </div>
            {isBSExpanded ? (
              <ChevronDown className="w-4 h-4 text-th-muted shrink-0" />
            ) : (
              <ChevronRight className="w-4 h-4 text-th-muted shrink-0" />
            )}
          </button>

          {isBSExpanded && (
            <div className="px-3.5 pb-3.5 pt-2.5 space-y-2.5 text-sm border-t border-th-border bg-th-surface">
              <div className="flex justify-between items-center py-1 border-b border-th-border">
                <span className="text-th-muted font-semibold">Total Assets (A)</span>
                <span className="font-mono tabular-nums font-bold text-th-text">
                  ₱ {formatAccounting(totalAssets)}
                </span>
              </div>

              <div className="pl-3 space-y-1.5 text-xs sm:text-sm text-th-muted">
                <div className="flex justify-between">
                  <span>Current Assets</span>
                  <span className="font-mono tabular-nums font-semibold text-th-text">₱ {formatAccounting(totalCurrentAssets)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Non-Current Assets</span>
                  <span className="font-mono tabular-nums font-semibold text-th-text">₱ {formatAccounting(totalNonCurrentAssets)}</span>
                </div>
              </div>

              <div className="flex justify-between items-center py-1 border-b border-th-border">
                <span className="text-th-muted font-semibold">Total Liabilities (L)</span>
                <span className="font-mono tabular-nums font-bold text-th-text">
                  ₱ {formatAccounting(totalLiabilities)}
                </span>
              </div>

              <div className="pl-3 space-y-1.5 text-xs sm:text-sm text-th-muted">
                <div className="flex justify-between">
                  <span>Current Liabilities</span>
                  <span className="font-mono tabular-nums font-semibold text-th-text">₱ {formatAccounting(totalCurrentLiabilities)}</span>
                </div>
                {totalNonCurrentLiabilities > 0 && (
                  <div className="flex justify-between">
                    <span>Non-Current Liabilities</span>
                    <span className="font-mono tabular-nums font-semibold text-th-text">₱ {formatAccounting(totalNonCurrentLiabilities)}</span>
                  </div>
                )}
              </div>

              <div className="flex justify-between items-center py-1 border-b border-th-border">
                <span className="text-th-muted font-semibold">Total Equity (E)</span>
                <span className="font-mono tabular-nums font-bold text-th-text">
                  ₱ {formatAccounting(totalEquity)}
                </span>
              </div>

              <div className="flex justify-between items-center py-2 bg-th-subtle px-2.5 rounded-lg font-bold text-xs sm:text-sm">
                <span className="text-th-text">Liabilities + Equity</span>
                <span className="font-mono tabular-nums text-th-text">
                  ₱ {formatAccounting(liabilitiesPlusEquity)}
                </span>
              </div>

              <div
                className={`p-2.5 rounded-lg flex items-center justify-between text-xs sm:text-sm font-bold ${
                  isBalanced
                    ? 'bg-th-subtle text-th-text border border-th-border-strong'
                    : 'bg-amber-100/70 dark:bg-amber-950/60 text-amber-900 dark:text-amber-300 border border-amber-200 dark:border-amber-800'
                }`}
              >
                <span>Difference</span>
                <span className="font-mono tabular-nums">₱ {formatAccounting(variance)}</span>
              </div>

              {!isBalanced && (
                <p className="text-xs text-amber-800 dark:text-amber-300 leading-relaxed pt-1 font-medium">
                  Tip: Accumulated Surplus/(Deficit) in Net Assets/Equity must equal Assets minus Liabilities.
                </p>
              )}
            </div>
          )}
        </div>

        {/* Cross-Statement Live Checks */}
        <div className="border border-th-border rounded-xl overflow-hidden bg-th-subtle">
          <button
            type="button"
            onClick={() => setIsCrossChecksExpanded(!isCrossChecksExpanded)}
            className="w-full p-3.5 flex items-center justify-between text-left hover:bg-th-subtle-hover transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-2.5">
              <Layers className="w-4 h-4 text-th-muted shrink-0" />
              <div>
                <div className="text-sm font-bold text-th-text">
                  Cross-Statement Checks
                </div>
                <div className="text-xs font-medium text-th-muted">
                  Performance, Cash Flows &amp; Net Assets
                </div>
              </div>
            </div>
            {isCrossChecksExpanded ? (
              <ChevronDown className="w-4 h-4 text-th-muted shrink-0" />
            ) : (
              <ChevronRight className="w-4 h-4 text-th-muted shrink-0" />
            )}
          </button>

          {isCrossChecksExpanded && (
            <div className="p-3 border-t border-th-border space-y-3 text-xs sm:text-sm bg-th-surface">
              {/* Financial Performance Summary */}
              <div className="p-3 bg-th-subtle/60 border border-th-border rounded-lg space-y-1.5">
                <div className="flex items-center justify-between gap-2 font-bold text-th-text">
                  <div className="flex items-center gap-1.5">
                    <TrendingUp className="w-4 h-4 text-th-muted shrink-0" />
                    <span>Financial Performance</span>
                  </div>
                </div>
                <div className="flex justify-between text-th-muted">
                  <span>Total Revenue</span>
                  <span className="font-mono tabular-nums font-semibold text-th-text">
                    ₱ {formatAccounting(crossStatementAudit.perfTotalRevenue)}
                  </span>
                </div>
                <div className="flex justify-between text-th-muted">
                  <span>Operating Expenses</span>
                  <span className="font-mono tabular-nums font-semibold text-th-text">
                    ₱ {formatAccounting(crossStatementAudit.perfTotalExpenses)}
                  </span>
                </div>
                <div className="flex justify-between pt-1 border-t border-th-border font-bold text-th-text">
                  <span>Net Surplus/(Deficit)</span>
                  <span className="font-mono tabular-nums">
                    ₱ {formatAccounting(crossStatementAudit.perfNetSurplusDeficit)}
                  </span>
                </div>
              </div>

              {/* Cash Flows vs Balance Sheet Cash Check */}
              <div className="p-3 bg-th-subtle/60 border border-th-border rounded-lg space-y-1.5">
                <div className="flex items-center justify-between gap-2 font-bold text-th-text">
                  <div className="flex items-center gap-1.5">
                    <Banknote className="w-4 h-4 text-th-muted shrink-0" />
                    <span>Cash Flows Reconciliation</span>
                  </div>
                  {hasSfpCashOrCf && (
                    isCashAligned ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-700 dark:text-emerald-400 shrink-0" />
                    ) : (
                      <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                    )
                  )}
                </div>
                <div className="flex justify-between text-th-muted">
                  <span>Net Cash Change</span>
                  <span className="font-mono tabular-nums font-semibold text-th-text">
                    ₱ {formatAccounting(crossStatementAudit.cfNetIncreaseDecrease)}
                  </span>
                </div>
                <div className="flex justify-between text-th-muted">
                  <span>Cash, Dec 31 (SCF)</span>
                  <span className="font-mono tabular-nums font-semibold text-th-text">
                    ₱ {formatAccounting(crossStatementAudit.cfEndingCash)}
                  </span>
                </div>
                <div className="flex justify-between text-th-muted">
                  <span>Cash &amp; Equiv. (SFP)</span>
                  <span className="font-mono tabular-nums font-semibold text-th-text">
                    ₱ {formatAccounting(crossStatementAudit.sfpCashAndCashEquivalents)}
                  </span>
                </div>
                {hasSfpCashOrCf && (
                  <div
                    className={`flex justify-between pt-1 border-t border-th-border font-bold ${
                      isCashAligned
                        ? 'text-emerald-800 dark:text-emerald-300'
                        : 'text-amber-700 dark:text-amber-300'
                    }`}
                  >
                    <span>{isCashAligned ? 'Matches SFP Cash' : 'Cash Diff'}</span>
                    <span className="font-mono tabular-nums">
                      ₱ {formatAccounting(cashVsSfpDiff)}
                    </span>
                  </div>
                )}
              </div>

              {/* Net Assets/Equity vs SFP & Performance Check */}
              <div className="p-3 bg-th-subtle/60 border border-th-border rounded-lg space-y-1.5">
                <div className="flex items-center justify-between gap-2 font-bold text-th-text">
                  <div className="flex items-center gap-1.5">
                    <Landmark className="w-4 h-4 text-th-muted shrink-0" />
                    <span>Net Assets/Equity Check</span>
                  </div>
                  {(hasEquityInBoth || hasSurplusInBoth) && (
                    isEquityAligned && (!hasSurplusInBoth || isSurplusAligned) ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-700 dark:text-emerald-400 shrink-0" />
                    ) : (
                      <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                    )
                  )}
                </div>
                <div className="flex justify-between text-th-muted">
                  <span>Restated Balance</span>
                  <span className="font-mono tabular-nums font-semibold text-th-text">
                    ₱ {formatAccounting(crossStatementAudit.naRestatedBalance)}
                  </span>
                </div>
                <div className="flex justify-between text-th-muted">
                  <span>Balance, Dec 31 (SCNAE)</span>
                  <span className="font-mono tabular-nums font-semibold text-th-text">
                    ₱ {formatAccounting(crossStatementAudit.naEndingBalance)}
                  </span>
                </div>
                {hasSurplusInBoth && (
                  <div
                    className={`flex justify-between pt-1 border-t border-th-border font-semibold ${
                      isSurplusAligned
                        ? 'text-emerald-800 dark:text-emerald-300'
                        : 'text-amber-700 dark:text-amber-300'
                    }`}
                  >
                    <span>{isSurplusAligned ? 'Surplus Matches SFPerf' : 'Surplus Diff'}</span>
                    <span className="font-mono tabular-nums">₱ {formatAccounting(surplusDiff)}</span>
                  </div>
                )}
                {hasEquityInBoth && (
                  <div
                    className={`flex justify-between pt-1 border-t border-th-border font-bold ${
                      isEquityAligned
                        ? 'text-emerald-800 dark:text-emerald-300'
                        : 'text-amber-700 dark:text-amber-300'
                    }`}
                  >
                    <span>{isEquityAligned ? 'Matches SFP Equity' : 'Equity Diff'}</span>
                    <span className="font-mono tabular-nums">
                      ₱ {formatAccounting(equityVsSfpDiff)}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
};
