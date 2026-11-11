import React from 'react';
import { formatAccounting } from '../utils/formatters';
import { CheckCircle2, AlertTriangle, Scale } from 'lucide-react';

interface AccountingBalanceCheckProps {
  totalAssets: number;
  totalLiabilities: number;
  totalEquity: number;
  compact?: boolean;
}

export const AccountingBalanceCheck: React.FC<AccountingBalanceCheckProps> = ({
  totalAssets,
  totalLiabilities,
  totalEquity,
  compact = false,
}) => {
  const liabilitiesPlusEquity = totalLiabilities + totalEquity;
  const difference = Math.abs(totalAssets - liabilitiesPlusEquity);
  const isBalanced = difference < 0.01;

  if (compact) {
    return (
      <div
        className={`px-4 py-2.5 rounded-xl text-base font-bold flex items-center gap-2.5 border-2 transition-colors ${
          isBalanced
            ? 'bg-[#f0f7fd] dark:bg-[#0a274c]/80 text-[#0a3461] dark:text-[#93c5fd] border-[#b9d9f5] dark:border-[#1d4677]'
            : 'bg-amber-50 dark:bg-amber-950/60 text-amber-900 dark:text-amber-300 border-amber-300 dark:border-amber-800'
        }`}
      >
        {isBalanced ? (
          <>
            <CheckCircle2 className="w-5 h-5 text-[#0072ce] dark:text-[#38bdf8] shrink-0" />
            <span>
              <strong>Assets = Liabilities + Equity</strong> (Balanced · Diff: ₱0.00)
            </span>
          </>
        ) : (
          <>
            <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0" />
            <span>
              <strong>Out of Balance:</strong> Diff ₱{formatAccounting(difference)} (Assets ≠ Liabilities + Equity)
            </span>
          </>
        )}
      </div>
    );
  }

  return (
    <div
      className={`border-2 rounded-2xl p-6 transition-all shadow-sm ${
        isBalanced
          ? 'bg-[#f0f7fd] dark:bg-[#0a274c]/40 border-[#b9d9f5] dark:border-[#1d4677] text-[#0a3461] dark:text-[#bfdbfe]'
          : 'bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-200'
      }`}
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b-2 border-current/15">
        <div className="flex items-center gap-3">
          <Scale className="w-6 h-6 text-[#0072ce] dark:text-[#38bdf8] shrink-0" />
          <h4 className="text-base font-bold uppercase tracking-wider">
            Accounting Balance Check (Assets = Liabilities + Equity)
          </h4>
        </div>
        <div className="flex items-center gap-2 text-base font-bold">
          {isBalanced ? (
            <span className="inline-flex items-center gap-2 text-[#0a3461] dark:text-[#93c5fd] bg-white/90 dark:bg-[#0a274c] px-3.5 py-1.5 rounded-xl border border-[#b9d9f5] dark:border-[#1d4677]">
              <CheckCircle2 className="w-5 h-5 text-[#0072ce] dark:text-[#38bdf8]" /> Statement Balanced
            </span>
          ) : (
            <span className="inline-flex items-center gap-2 text-amber-800 dark:text-amber-300 bg-white/90 dark:bg-amber-950 px-3.5 py-1.5 rounded-xl border border-amber-300 dark:border-amber-800">
              <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400" /> Out of Balance (Diff: ₱{formatAccounting(difference)})
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-5 mt-5 text-base">
        <div>
          <div className="text-slate-600 dark:text-slate-400 font-bold text-xs uppercase tracking-wider">Total Assets (A)</div>
          <div className="text-lg font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100 mt-1">
            ₱ {formatAccounting(totalAssets)}
          </div>
        </div>

        <div>
          <div className="text-slate-600 dark:text-slate-400 font-bold text-xs uppercase tracking-wider">Total Liabilities (L)</div>
          <div className="text-lg font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100 mt-1">
            ₱ {formatAccounting(totalLiabilities)}
          </div>
        </div>

        <div>
          <div className="text-slate-600 dark:text-slate-400 font-bold text-xs uppercase tracking-wider">Total Equity (E)</div>
          <div className="text-lg font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100 mt-1">
            ₱ {formatAccounting(totalEquity)}
          </div>
        </div>

        <div>
          <div className="text-slate-600 dark:text-slate-400 font-bold text-xs uppercase tracking-wider">Difference (A - (L+E))</div>
          <div
            className={`text-lg font-bold font-mono tabular-nums mt-1 ${
              isBalanced ? 'text-[#0072ce] dark:text-[#38bdf8]' : 'text-amber-700 dark:text-amber-400'
            }`}
          >
            ₱ {formatAccounting(difference)}
          </div>
        </div>
      </div>
    </div>
  );
};
