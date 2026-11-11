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
  PanelRightOpen
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
        className="fixed right-5 bottom-7 z-40 bg-[#0a3461] text-white hover:bg-[#072648] px-4 py-3 rounded-full shadow-2xl flex items-center gap-2.5 text-sm font-bold transition-all hover:scale-105 no-print border-2 border-[#0072ce]/50 cursor-pointer"
        title="Open Accounting Checks & Verification Console"
      >
        <Scale className="w-5 h-5 text-[#38bdf8]" />
        <span>Audit Checks</span>
        <span
          className={`w-2.5 h-2.5 rounded-full ${
            isBalanced ? 'bg-[#38bdf8]' : 'bg-amber-400 animate-pulse'
          }`}
        />
      </button>
    );
  }

  return (
    <aside
      className={`bg-white dark:bg-slate-900 border-l-2 border-slate-200 dark:border-slate-800 shadow-2xl transition-all flex flex-col z-40 no-print ${
        isPinned
          ? 'w-full lg:w-88 shrink-0 sticky top-16 h-[calc(100vh-4rem)] border-slate-200 dark:border-slate-800'
          : 'fixed top-16 right-0 w-88 h-[calc(100vh-4rem)] border-l-2 border-slate-300 dark:border-slate-700'
      }`}
    >
      {/* Drawer Header */}
      <div className="p-4 border-b-2 border-slate-200 dark:border-slate-800 flex items-center justify-between bg-[#f0f5fa] dark:bg-[#0a274c]/30 shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-[#0a3461] dark:bg-[#0072ce] text-white rounded-xl shadow-xs">
            <Scale className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-900 dark:text-slate-100">
              Audit & Checks
            </h3>
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              Live Balance Verification
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onTogglePin}
            className={`p-2 rounded-xl text-xs font-bold transition-colors hidden lg:flex items-center gap-1 cursor-pointer ${
              isPinned
                ? 'bg-[#e1edf8] dark:bg-[#0a3461] text-[#0a3461] dark:text-[#38bdf8] border border-[#0072ce]'
                : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
            title={isPinned ? 'Unpin to slide-over drawer' : 'Pin to side of workspace'}
          >
            {isPinned ? <PanelRightClose className="w-4 h-4" /> : <PanelRightOpen className="w-4 h-4" />}
          </button>
          <button
            type="button"
            onClick={onToggle}
            className="p-2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
            title="Close Checks Drawer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Active Context */}
        <div className="px-3 py-2 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-lg text-xs flex items-center justify-between">
          <div className="truncate mr-2">
            <span className="text-slate-400 dark:text-slate-500 block text-[10px] uppercase">Entity</span>
            <span className="font-semibold text-slate-800 dark:text-slate-200 truncate block" title={divisionName}>
              {divisionName}
            </span>
          </div>
          <div className="text-right shrink-0">
            <span className="text-slate-400 dark:text-slate-500 block text-[10px] uppercase">FY</span>
            <span className="font-bold text-sky-900 dark:text-sky-300">{selectedYear}</span>
          </div>
        </div>

        {/* Primary Check: Assets = Liabilities + Equity */}
        <div
          className={`border rounded-xl overflow-hidden shadow-2xs ${
            isBalanced 
              ? 'border-emerald-200 dark:border-emerald-800 bg-emerald-50/30 dark:bg-emerald-950/20' 
              : 'border-amber-200 dark:border-amber-800 bg-amber-50/30 dark:bg-amber-950/20'
          }`}
        >
          <button
            type="button"
            onClick={() => setIsBSExpanded(!isBSExpanded)}
            className="w-full p-3 flex items-center justify-between text-left"
          >
            <div className="flex items-center gap-2">
              {isBalanced ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
              )}
              <div>
                <div className="text-xs font-bold text-slate-900 dark:text-slate-100">
                  Assets = Liabilities + Equity
                </div>
                <div className="text-[10px] text-slate-500 dark:text-slate-400">
                  {isBalanced ? 'In perfect balance' : `Variance: ₱${formatAccounting(variance)}`}
                </div>
              </div>
            </div>
            {isBSExpanded ? (
              <ChevronDown className="w-4 h-4 text-slate-400" />
            ) : (
              <ChevronRight className="w-4 h-4 text-slate-400" />
            )}
          </button>

          {isBSExpanded && (
            <div className="px-3.5 pb-3.5 pt-1 space-y-2 text-xs border-t border-slate-200/60 dark:border-slate-800 bg-white dark:bg-slate-900">
              <div className="flex justify-between items-center py-1 border-b border-slate-100 dark:border-slate-800">
                <span className="text-slate-600 dark:text-slate-300 font-medium">Total Assets (A)</span>
                <span className="font-mono tabular-nums font-bold text-slate-900 dark:text-slate-100">
                  ₱ {formatAccounting(totalAssets)}
                </span>
              </div>

              <div className="pl-2 space-y-0.5 text-[11px] text-slate-500 dark:text-slate-400 border-l border-slate-200 dark:border-slate-700">
                <div className="flex justify-between">
                  <span>Current Assets:</span>
                  <span className="font-mono tabular-nums">₱ {formatAccounting(totalCurrentAssets)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Non-Current Assets:</span>
                  <span className="font-mono tabular-nums">₱ {formatAccounting(totalNonCurrentAssets)}</span>
                </div>
              </div>

              <div className="flex justify-between items-center py-1 border-b border-slate-100 dark:border-slate-800">
                <span className="text-slate-600 dark:text-slate-300 font-medium">Total Liabilities (L)</span>
                <span className="font-mono tabular-nums font-bold text-slate-900 dark:text-slate-100">
                  ₱ {formatAccounting(totalLiabilities)}
                </span>
              </div>

              <div className="pl-2 space-y-0.5 text-[11px] text-slate-500 dark:text-slate-400 border-l border-slate-200 dark:border-slate-700">
                <div className="flex justify-between">
                  <span>Current Liabilities:</span>
                  <span className="font-mono tabular-nums">₱ {formatAccounting(totalCurrentLiabilities)}</span>
                </div>
                {totalNonCurrentLiabilities > 0 && (
                  <div className="flex justify-between">
                    <span>Non-Current Liabilities:</span>
                    <span className="font-mono tabular-nums">₱ {formatAccounting(totalNonCurrentLiabilities)}</span>
                  </div>
                )}
              </div>

              <div className="flex justify-between items-center py-1 border-b border-slate-100 dark:border-slate-800">
                <span className="text-slate-600 dark:text-slate-300 font-medium">Total Equity (E)</span>
                <span className="font-mono tabular-nums font-bold text-slate-900 dark:text-slate-100">
                  ₱ {formatAccounting(totalEquity)}
                </span>
              </div>

              <div className="flex justify-between items-center py-1.5 bg-slate-50 dark:bg-slate-800/80 px-2 rounded-lg font-semibold">
                <span className="text-slate-700 dark:text-slate-300">Liabilities + Equity (L + E)</span>
                <span className="font-mono tabular-nums text-slate-900 dark:text-slate-100">
                  ₱ {formatAccounting(liabilitiesPlusEquity)}
                </span>
              </div>

              <div
                className={`p-2 rounded-lg flex items-center justify-between text-xs font-bold ${
                  isBalanced 
                    ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800' 
                    : 'bg-amber-100/70 dark:bg-amber-950/60 text-amber-900 dark:text-amber-300 border border-amber-200 dark:border-amber-800'
                }`}
              >
                <span>Difference (A - (L+E))</span>
                <span className="font-mono tabular-nums">₱ {formatAccounting(variance)}</span>
              </div>

              {!isBalanced && (
                <p className="text-[10px] text-amber-800 dark:text-amber-300 leading-tight pt-1">
                  💡 Tip: Government Equity (Accumulated Surplus/Deficit) must offset Net Assets for equality.
                </p>
              )}
            </div>
          )}
        </div>

        {/* Future Checking Modules */}
        <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden bg-slate-50/50 dark:bg-slate-800/40">
          <button
            type="button"
            onClick={() => setIsFutureModulesExpanded(!isFutureModulesExpanded)}
            className="w-full p-3 flex items-center justify-between text-left hover:bg-slate-100/50 dark:hover:bg-slate-800/70 transition-colors"
          >
            <div className="flex items-center gap-2">
              <Layers className="w-3.5 h-3.5 text-sky-800 dark:text-sky-400 shrink-0" />
              <div>
                <div className="text-xs font-bold text-slate-800 dark:text-slate-200">
                  Future Statement Checks
                </div>
                <div className="text-[10px] text-slate-400 dark:text-slate-500">
                  Income Statement, Cash Flows
                </div>
              </div>
            </div>
            {isFutureModulesExpanded ? (
              <ChevronDown className="w-4 h-4 text-slate-400" />
            ) : (
              <ChevronRight className="w-4 h-4 text-slate-400" />
            )}
          </button>

          {isFutureModulesExpanded && (
            <div className="p-3 border-t border-slate-200 dark:border-slate-800 space-y-2 text-xs">
              <div className="p-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1 font-semibold text-slate-800 dark:text-slate-200">
                    <TrendingUp className="w-3 h-3 text-sky-700 dark:text-sky-400" />
                    <span>Income Statement</span>
                  </div>
                  <span className="text-[9px] bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 px-1.5 py-0.2 rounded font-mono">
                    Ready
                  </span>
                </div>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                  Revenue - Expenses = Current Net Surplus/(Deficit).
                </p>
              </div>

              <div className="p-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1 font-semibold text-slate-800 dark:text-slate-200">
                    <Banknote className="w-3 h-3 text-emerald-700 dark:text-emerald-400" />
                    <span>Statement of Cash Flows</span>
                  </div>
                  <span className="text-[9px] bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 px-1.5 py-0.2 rounded font-mono">
                    Ready
                  </span>
                </div>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                  Operating + Investing + Financing = Net Cash change.
                </p>
              </div>

              <div className="p-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1 font-semibold text-slate-800 dark:text-slate-200">
                    <Clock className="w-3 h-3 text-amber-700 dark:text-amber-400" />
                    <span>Inter-Agency Parity</span>
                  </div>
                  <span className="text-[9px] bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 px-1.5 py-0.2 rounded font-mono">
                    Ready
                  </span>
                </div>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
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
