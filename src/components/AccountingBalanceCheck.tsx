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
            ? 'bg-th-surface text-th-text border-th-border-strong'
            : 'bg-amber-50 dark:bg-amber-950/60 text-amber-900 dark:text-amber-300 border-amber-300 dark:border-amber-800'
        }`}
      >
        {isBalanced ? (
          <>
            <CheckCircle2 className="w-5 h-5 text-emerald-700 dark:text-emerald-400 shrink-0" />
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
          ? 'bg-th-surface border-th-border-strong text-th-text'
          : 'bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-200'
      }`}
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-th-border">
        <div className="flex items-center gap-3">
          <Scale className="w-5 h-5 text-th-muted shrink-0" />
          <h4 className="text-base font-bold uppercase tracking-wider text-th-text">
            Accounting Balance Check (Assets = Liabilities + Equity)
          </h4>
        </div>
        <div className="flex items-center gap-2 text-sm sm:text-base font-bold">
          {isBalanced ? (
            <span className="inline-flex items-center gap-2 text-th-text bg-th-subtle px-3.5 py-1.5 rounded-xl border border-th-border-strong">
              <CheckCircle2 className="w-5 h-5 text-emerald-700 dark:text-emerald-400" /> Statement Balanced
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
          <div className="text-th-muted font-bold text-xs uppercase tracking-wider">Total Assets (A)</div>
          <div className="text-xl font-bold font-mono tabular-nums text-th-text mt-1">
            ₱ {formatAccounting(totalAssets)}
          </div>
        </div>

        <div>
          <div className="text-th-muted font-bold text-xs uppercase tracking-wider">Total Liabilities (L)</div>
          <div className="text-xl font-bold font-mono tabular-nums text-th-text mt-1">
            ₱ {formatAccounting(totalLiabilities)}
          </div>
        </div>

        <div>
          <div className="text-th-muted font-bold text-xs uppercase tracking-wider">Total Equity (E)</div>
          <div className="text-xl font-bold font-mono tabular-nums text-th-text mt-1">
            ₱ {formatAccounting(totalEquity)}
          </div>
        </div>

        <div>
          <div className="text-th-muted font-bold text-xs uppercase tracking-wider">Difference (A - (L+E))</div>
          <div
            className={`text-xl font-bold font-mono tabular-nums mt-1 ${
              isBalanced ? 'text-th-text' : 'text-amber-700 dark:text-amber-400'
            }`}
          >
            ₱ {formatAccounting(difference)}
          </div>
        </div>
      </div>
    </div>
  );
};
