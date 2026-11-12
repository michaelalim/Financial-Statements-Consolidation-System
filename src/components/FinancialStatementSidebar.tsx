import React from 'react';
import { FileSpreadsheet, Lock } from 'lucide-react';

export type FinancialStatementType = 'position' | 'performance' | 'cash_flows' | 'net_assets';

interface FinancialStatementSidebarProps {
  selectedStatement: FinancialStatementType;
  onSelectStatement: (stmt: FinancialStatementType) => void;
  onLockedClick?: (title: string, message: string) => void;
}

const STATEMENTS: {
  id: FinancialStatementType;
  title: string;
  isLocked: boolean;
  lockNotice: string;
}[] = [
  {
    id: 'position',
    title: 'Statement of Financial Position',
    isLocked: false,
    lockNotice: '',
  },
  {
    id: 'performance',
    title: 'Statement of Financial Performance',
    isLocked: false,
    lockNotice: '',
  },
  {
    id: 'cash_flows',
    title: 'Statement of Cash Flows',
    isLocked: false,
    lockNotice: '',
  },
  {
    id: 'net_assets',
    title: 'Statement of Changes in Net Assets/Equity',
    isLocked: true,
    lockNotice: 'Statement of Changes in Net Assets/Equity is locked for now pending upcoming instructions.',
  },
];

export const FinancialStatementSidebar: React.FC<FinancialStatementSidebarProps> = ({
  selectedStatement,
  onSelectStatement,
  onLockedClick,
}) => {
  return (
    <aside className="w-full lg:w-64 shrink-0 no-print">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 sticky top-20">
        <div className="px-2.5 py-2 text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 flex items-center gap-1.5">
          <FileSpreadsheet className="w-3.5 h-3.5 text-[#0072ce]" />
          <span>Financial Statements</span>
        </div>
        <nav className="space-y-1 mt-1">
          {STATEMENTS.map((stmt) => {
            const isActive = selectedStatement === stmt.id;
            return (
              <button
                key={stmt.id}
                type="button"
                onClick={() => {
                  if (stmt.isLocked) {
                    onLockedClick?.(stmt.title, stmt.lockNotice);
                  } else {
                    onSelectStatement(stmt.id);
                  }
                }}
                className={`w-full text-left px-3 py-2.5 rounded-lg text-xs sm:text-sm font-semibold transition-colors flex items-center justify-between gap-2 cursor-pointer ${
                  stmt.isLocked
                    ? 'text-slate-400 dark:text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                    : isActive
                    ? 'bg-[#0a3461] text-white'
                    : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <span className="leading-snug">{stmt.title}</span>
                {stmt.isLocked && <Lock className="w-3.5 h-3.5 shrink-0 opacity-60" />}
              </button>
            );
          })}
        </nav>
      </div>
    </aside>
  );
};
