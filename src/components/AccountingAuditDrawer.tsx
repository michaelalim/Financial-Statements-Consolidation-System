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
  Clock,
  Layers,
  PanelRightClose,
  PanelRightOpen,
} from 'lucide-react';

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
}) => {
  const [isBSExpanded, setIsBSExpanded] = useState(true);
  const [isFutureModulesExpanded, setIsFutureModulesExpanded] = useState(false);

  const liabilitiesPlusEquity = totalLiabilities + totalEquity;
  const variance = Math.abs(totalAssets - liabilitiesPlusEquity);
  const isBalanced = variance < 0.01;

  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={onToggle}
        className="fixed right-5 bottom-7 z-40 bg-th-primary text-th-primary-fg hover:opacity-95 px-4 py-3 rounded-full shadow-2xl flex items-center gap-2.5 text-sm font-bold transition-all hover:scale-105 no-print border-2 border-th-border-strong cursor-pointer"
        title="Open Accounting Checks & Verification Console"
      >
        <Scale className="w-5 h-5" />
        <span>Audit Checks</span>
        <span
          className={`w-2.5 h-2.5 rounded-full ${
            isBalanced ? 'bg-emerald-400' : 'bg-amber-400'
          }`}
        />
      </button>
    );
  }

  return (
    <aside
      className={`bg-th-surface border-l-2 border-th-border shadow-2xl transition-all flex flex-col z-40 no-print ${
        isPinned
          ? 'w-full lg:w-88 shrink-0 sticky top-[calc(4.75rem+2px)] h-[calc(100vh-4.75rem-2px)] border-th-border'
          : 'fixed top-[calc(4.75rem+2px)] right-0 w-88 h-[calc(100vh-4.75rem-2px)] border-l-2 border-th-border-strong'
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
              Live Balance Verification
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
          >
            {isPinned ? <PanelRightClose className="w-4 h-4" /> : <PanelRightOpen className="w-4 h-4" />}
          </button>
          <button
            type="button"
            onClick={onToggle}
            className="p-2 text-th-muted hover:text-th-text hover:bg-th-surface rounded-xl transition-colors cursor-pointer"
            title="Close Checks Drawer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Active Context */}
        <div className="px-3.5 py-2.5 bg-th-subtle border border-th-border-strong rounded-lg text-sm flex items-center justify-between gap-2">
          <div className="truncate mr-2">
            <span className="text-th-muted block text-xs font-semibold uppercase">Entity</span>
            <span className="font-bold text-th-text truncate block" title={divisionName}>
              {divisionName}
            </span>
          </div>
          <div className="text-right shrink-0">
            <span className="text-th-muted block text-xs font-semibold uppercase">FY</span>
            <span className="font-bold text-th-text">{selectedYear}</span>
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
                <div className="text-xs font-medium text-th-muted">
                  {isBalanced ? 'In perfect balance' : `Variance: ₱${formatAccounting(variance)}`}
                </div>
              </div>
            </div>
            {isBSExpanded ? (
              <ChevronDown className="w-4 h-4 text-th-muted" />
            ) : (
              <ChevronRight className="w-4 h-4 text-th-muted" />
            )}
          </button>

          {isBSExpanded && (
            <div className="px-3.5 pb-3.5 pt-2 space-y-2.5 text-sm border-t border-th-border bg-th-surface">
              <div className="flex justify-between items-center py-1 border-b border-th-border">
                <span className="text-th-muted font-semibold">Total Assets (A)</span>
                <span className="font-mono tabular-nums font-bold text-th-text">
                  ₱ {formatAccounting(totalAssets)}
                </span>
              </div>

              <div className="pl-2.5 space-y-1 text-xs text-th-muted border-l-2 border-th-border-strong">
                <div className="flex justify-between">
                  <span>Current Assets:</span>
                  <span className="font-mono tabular-nums font-semibold text-th-text">₱ {formatAccounting(totalCurrentAssets)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Non-Current Assets:</span>
                  <span className="font-mono tabular-nums font-semibold text-th-text">₱ {formatAccounting(totalNonCurrentAssets)}</span>
                </div>
              </div>

              <div className="flex justify-between items-center py-1 border-b border-th-border">
                <span className="text-th-muted font-semibold">Total Liabilities (L)</span>
                <span className="font-mono tabular-nums font-bold text-th-text">
                  ₱ {formatAccounting(totalLiabilities)}
                </span>
              </div>

              <div className="pl-2.5 space-y-1 text-xs text-th-muted border-l-2 border-th-border-strong">
                <div className="flex justify-between">
                  <span>Current Liabilities:</span>
                  <span className="font-mono tabular-nums font-semibold text-th-text">₱ {formatAccounting(totalCurrentLiabilities)}</span>
                </div>
                {totalNonCurrentLiabilities > 0 && (
                  <div className="flex justify-between">
                    <span>Non-Current Liabilities:</span>
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
                <span className="text-th-text">Liabilities + Equity (L + E)</span>
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
                <span>Difference (A - (L+E))</span>
                <span className="font-mono tabular-nums">₱ {formatAccounting(variance)}</span>
              </div>

              {!isBalanced && (
                <p className="text-xs text-amber-800 dark:text-amber-300 leading-relaxed pt-1 font-medium">
                  Tip: Government Equity (Accumulated Surplus/Deficit) must offset Net Assets for equality.
                </p>
              )}
            </div>
          )}
        </div>

        {/* Statement Checks Overview */}
        <div className="border border-th-border rounded-xl overflow-hidden bg-th-subtle">
          <button
            type="button"
            onClick={() => setIsFutureModulesExpanded(!isFutureModulesExpanded)}
            className="w-full p-3.5 flex items-center justify-between text-left hover:bg-th-subtle-hover transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-2.5">
              <Layers className="w-4 h-4 text-th-muted shrink-0" />
              <div>
                <div className="text-sm font-bold text-th-text">
                  Statement Checks
                </div>
                <div className="text-xs font-medium text-th-muted">
                  Income Statement, Cash Flows
                </div>
              </div>
            </div>
            {isFutureModulesExpanded ? (
              <ChevronDown className="w-4 h-4 text-th-muted" />
            ) : (
              <ChevronRight className="w-4 h-4 text-th-muted" />
            )}
          </button>

          {isFutureModulesExpanded && (
            <div className="p-3 border-t border-th-border space-y-2.5 text-sm">
              <div className="p-2.5 bg-th-surface border border-th-border rounded-lg">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 font-bold text-th-text">
                    <TrendingUp className="w-4 h-4 text-th-muted" />
                    <span>Income Statement</span>
                  </div>
                  <span className="text-xs bg-th-subtle text-th-text border border-th-border-strong px-2 py-0.5 rounded font-mono font-semibold">
                    Ready
                  </span>
                </div>
                <p className="text-xs text-th-muted mt-1 leading-relaxed">
                  Revenue - Expenses = Current Net Surplus/(Deficit).
                </p>
              </div>

              <div className="p-2.5 bg-th-surface border border-th-border rounded-lg">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 font-bold text-th-text">
                    <Banknote className="w-4 h-4 text-th-muted" />
                    <span>Statement of Cash Flows</span>
                  </div>
                  <span className="text-xs bg-th-subtle text-th-text border border-th-border-strong px-2 py-0.5 rounded font-mono font-semibold">
                    Ready
                  </span>
                </div>
                <p className="text-xs text-th-muted mt-1 leading-relaxed">
                  Operating + Investing + Financing = Net Cash change.
                </p>
              </div>

              <div className="p-2.5 bg-th-surface border border-th-border rounded-lg">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 font-bold text-th-text">
                    <Clock className="w-4 h-4 text-th-muted" />
                    <span>Inter-Agency Parity</span>
                  </div>
                  <span className="text-xs bg-th-subtle text-th-text border border-th-border-strong px-2 py-0.5 rounded font-mono font-semibold">
                    Ready
                  </span>
                </div>
                <p className="text-xs text-th-muted mt-1 leading-relaxed">
                  Reconciliation of Due from/to Operating Units.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
};
