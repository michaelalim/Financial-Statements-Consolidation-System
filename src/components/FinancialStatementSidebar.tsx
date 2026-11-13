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
    isLocked: false,
    lockNotice: '',
  },
];

export const FinancialStatementSidebar: React.FC<FinancialStatementSidebarProps> = ({
  selectedStatement,
  onSelectStatement,
  onLockedClick,
}) => {
  return (
    <aside className="w-full lg:w-72 shrink-0 lg:sticky lg:top-28 lg:self-start no-print">
      <div className="bg-th-surface border-2 border-th-border rounded-2xl p-4 shadow-xs max-h-[calc(100vh-8.5rem)] overflow-y-auto transition-colors">
        <div className="px-2.5 pb-3 mb-2 border-b border-th-border text-sm font-bold uppercase tracking-wider text-th-text flex items-center gap-2">
          <FileSpreadsheet className="w-4 h-4 text-th-text shrink-0" />
          <span>Financial Statements</span>
        </div>
        <nav className="space-y-1.5">
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
                className={`w-full text-left px-3.5 py-3 rounded-xl text-sm font-bold transition-colors flex items-center justify-between gap-2.5 cursor-pointer border ${
                  stmt.isLocked
                    ? 'text-th-muted border-transparent hover:bg-th-subtle'
                    : isActive
                    ? 'bg-th-primary text-th-primary-fg border-th-primary dark:border-th-border-strong shadow-xs'
                    : 'text-th-text border-transparent hover:bg-th-subtle hover:border-th-border'
                }`}
              >
                <span className="leading-snug">{stmt.title}</span>
                {stmt.isLocked && <Lock className="w-4 h-4 shrink-0 text-th-muted" />}
              </button>
            );
          })}
        </nav>
      </div>
    </aside>
  );
};
