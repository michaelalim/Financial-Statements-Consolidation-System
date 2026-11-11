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
  Info,
  Clock,
  Layers
} from 'lucide-react';

interface AccountingChecksSidebarProps {
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

export const AccountingChecksSidebar: React.FC<AccountingChecksSidebarProps> = ({
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
  const [isFutureModulesExpanded, setIsFutureModulesExpanded] = useState(true);

  const liabilitiesPlusEquity = totalLiabilities + totalEquity;
  const variance = Math.abs(totalAssets - liabilitiesPlusEquity);
  const isBalanced = variance < 0.01;

  return (
    <aside className="w-full lg:w-80 shrink-0 bg-white border border-slate-200 rounded-xl p-4 shadow-xs self-start space-y-4 no-print sticky top-20">
      {/* Sidebar Header */}
      <div className="pb-3 border-b border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-sky-900 text-white rounded-lg">
            <Scale className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900">
              Accounting Checks
            </h3>
            <p className="text-[11px] text-slate-500">
              Audit & Verification Console
            </p>
          </div>
        </div>

        <span
          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
            isBalanced ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
          }`}
        >
          {isBalanced ? 'BALANCED' : 'OUT OF BALANCE'}
        </span>
      </div>

      {/* Target Scope Badge */}
      <div className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs flex items-center justify-between">
        <div className="truncate mr-2">
          <span className="text-slate-400 block text-[10px] uppercase">Active Entity</span>
          <span className="font-semibold text-slate-800 truncate block" title={divisionName}>
            {divisionName}
          </span>
        </div>
        <div className="text-right shrink-0">
          <span className="text-slate-400 block text-[10px] uppercase">Fiscal Year</span>
          <span className="font-bold text-sky-900">{selectedYear}</span>
        </div>
      </div>

      {/* 1. PRIMARY CHECK: Balance Sheet Check (Assets = Liabilities + Equity) */}
      <div
        className={`border rounded-xl overflow-hidden transition-all shadow-2xs ${
          isBalanced ? 'border-emerald-200 bg-emerald-50/40' : 'border-amber-200 bg-amber-50/40'
        }`}
      >
        <button
          type="button"
          onClick={() => setIsBSExpanded(!isBSExpanded)}
          className="w-full p-3.5 flex items-center justify-between text-left transition-colors"
        >
          <div className="flex items-center gap-2">
            {isBalanced ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
            )}
            <div>
              <div className="text-xs font-bold text-slate-900">
                Assets = Liabilities + Equity
              </div>
              <div className="text-[11px] text-slate-500">
                Balance Sheet Equality Check
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
          <div className="px-3.5 pb-3.5 pt-1 space-y-2.5 text-xs border-t border-slate-200/60 bg-white">
            {/* Summary Formula Rows */}
            <div className="flex justify-between items-center py-1 border-b border-slate-100">
              <span className="text-slate-600 font-medium">Total Assets (A)</span>
              <span className="font-mono tabular-nums font-bold text-slate-900">
                ₱ {formatAccounting(totalAssets)}
              </span>
            </div>

            <div className="pl-2 space-y-1 text-[11px] text-slate-500 border-l border-slate-200">
              <div className="flex justify-between">
                <span>· Current Assets:</span>
                <span className="font-mono tabular-nums">₱ {formatAccounting(totalCurrentAssets)}</span>
              </div>
              <div className="flex justify-between">
                <span>· Non-Current Assets:</span>
                <span className="font-mono tabular-nums">₱ {formatAccounting(totalNonCurrentAssets)}</span>
              </div>
            </div>

            <div className="flex justify-between items-center py-1 border-b border-slate-100">
              <span className="text-slate-600 font-medium">Total Liabilities (L)</span>
              <span className="font-mono tabular-nums font-bold text-slate-900">
                ₱ {formatAccounting(totalLiabilities)}
              </span>
            </div>

            <div className="pl-2 space-y-1 text-[11px] text-slate-500 border-l border-slate-200">
              <div className="flex justify-between">
                <span>· Current Liabilities:</span>
                <span className="font-mono tabular-nums">₱ {formatAccounting(totalCurrentLiabilities)}</span>
              </div>
              {totalNonCurrentLiabilities > 0 && (
                <div className="flex justify-between">
                  <span>· Non-Current Liabilities:</span>
                  <span className="font-mono tabular-nums">₱ {formatAccounting(totalNonCurrentLiabilities)}</span>
                </div>
              )}
            </div>

            <div className="flex justify-between items-center py-1 border-b border-slate-100">
              <span className="text-slate-600 font-medium">Total Equity (E)</span>
              <span className="font-mono tabular-nums font-bold text-slate-900">
                ₱ {formatAccounting(totalEquity)}
              </span>
            </div>

            <div className="flex justify-between items-center py-1.5 bg-slate-50 px-2 rounded-lg font-semibold">
              <span className="text-slate-700">Liabilities + Equity (L + E)</span>
              <span className="font-mono tabular-nums text-slate-900">
                ₱ {formatAccounting(liabilitiesPlusEquity)}
              </span>
            </div>

            {/* Variance row */}
            <div
              className={`p-2 rounded-lg flex items-center justify-between text-xs font-bold ${
                isBalanced
                  ? 'bg-emerald-50 text-emerald-800'
                  : 'bg-amber-100/70 text-amber-900'
              }`}
            >
              <span>Difference (A - (L+E))</span>
              <span className="font-mono tabular-nums">₱ {formatAccounting(variance)}</span>
            </div>

            {!isBalanced && (
              <p className="text-[11px] text-amber-800 leading-tight">
                Tip: Enter or adjust Government Equity (Accumulated Surplus/Deficit) to match Net Assets.
              </p>
            )}
          </div>
        )}
      </div>

      {/* 2. FUTURE AUDIT MODULES (Extensible framework as requested: Income Statement, Cash Flows, etc.) */}
      <div className="border border-slate-200 rounded-xl overflow-hidden bg-slate-50/50">
        <button
          type="button"
          onClick={() => setIsFutureModulesExpanded(!isFutureModulesExpanded)}
          className="w-full p-3 flex items-center justify-between text-left hover:bg-slate-100/50 transition-colors"
        >
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-sky-800 shrink-0" />
            <div>
              <div className="text-xs font-bold text-slate-800">
                Upcoming Statement Checks
              </div>
              <div className="text-[10px] text-slate-400">
                Income Statement & Cash Flows
              </div>
            </div>
          </div>
          {isFutureModulesExpanded ? (
            <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
          )}
        </button>

        {isFutureModulesExpanded && (
          <div className="p-3 border-t border-slate-200 space-y-2 text-xs">
            {/* Future Check 1: Income Statement */}
            <div className="p-2.5 bg-white border border-slate-200 rounded-lg">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 font-semibold text-slate-800">
                  <TrendingUp className="w-3.5 h-3.5 text-sky-700" />
                  <span>Income Statement (FS Perf.)</span>
                </div>
                <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-mono">
                  Future Module
                </span>
              </div>
              <p className="text-[11px] text-slate-500 mt-1">
                Will verify: Revenue - Expenses = Current Year Net Surplus/(Deficit).
              </p>
            </div>

            {/* Future Check 2: Cash Flows */}
            <div className="p-2.5 bg-white border border-slate-200 rounded-lg">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 font-semibold text-slate-800">
                  <Banknote className="w-3.5 h-3.5 text-emerald-700" />
                  <span>Statement of Cash Flows</span>
                </div>
                <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-mono">
                  Future Module
                </span>
              </div>
              <p className="text-[11px] text-slate-500 mt-1">
                Will verify: Net Cash Flow equals change in Cash & Cash Equivalents.
              </p>
            </div>

            {/* Future Check 3: Inter-Agency Parity */}
            <div className="p-2.5 bg-white border border-slate-200 rounded-lg">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 font-semibold text-slate-800">
                  <Clock className="w-3.5 h-3.5 text-amber-700" />
                  <span>Due to/from Reconciliation</span>
                </div>
                <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-mono">
                  Future Module
                </span>
              </div>
              <p className="text-[11px] text-slate-500 mt-1">
                Will reconcile Due from Operating Units with Due to Regional Office.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Quick Footnote */}
      <div className="text-[11px] text-slate-400 p-2 bg-slate-50 rounded-lg border border-slate-100 flex items-start gap-1.5">
        <Info className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
        <span>This side checks panel updates in real time as you key in amounts across divisions and fiscal years.</span>
      </div>
    </aside>
  );
};
