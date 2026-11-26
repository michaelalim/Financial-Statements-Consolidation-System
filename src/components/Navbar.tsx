import React from 'react';
import { Printer, Scale, Sun, Moon, Settings } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';

export type ActiveTab = 'entry' | 'divisional' | 'consolidated' | 'matrix' | 'options';

interface NavbarProps {
  activeTab: ActiveTab;
  onTabChange: (tab: ActiveTab) => void;
  onPrint: () => void;
  isAuditOpen: boolean;
  onToggleAudit: () => void;
  isBalanced: boolean;
  failedChecksCount?: number;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  onTabChange,
  onPrint,
  isAuditOpen,
  onToggleAudit,
  isBalanced,
  failedChecksCount = 0,
}) => {
  const { isDark, toggleDarkMode } = useTheme();

  const navItems: { id: ActiveTab; label: string }[] = [
    { id: 'entry', label: 'Data Entry' },
    { id: 'divisional', label: 'Financial Statements' },
    { id: 'consolidated', label: 'Consolidated FS' },
    { id: 'matrix', label: 'Division Matrix' },
  ];

  return (
    <header className="bg-th-primary text-th-primary-fg border-b-2 border-th-border-strong shadow-sm transition-colors">
      <div className="max-w-[1780px] mx-auto px-3 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between gap-3 xl:gap-5 h-[4.5rem] sm:h-[4.75rem]">
          {/* Prominent Brand Mark & Title */}
          <div className="flex items-center gap-2.5 sm:gap-3.5 min-w-0 shrink-0">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-white/15 text-th-primary-fg border border-white/25 flex items-center justify-center font-extrabold text-xs sm:text-sm tracking-wider shadow-xs shrink-0">
              RO6
            </div>
            <a
              href="#/"
              onClick={(e) => {
                e.preventDefault();
                onTabChange('entry');
              }}
              className="text-base sm:text-xl font-extrabold tracking-tight text-th-primary-fg whitespace-nowrap shrink-0 hover:opacity-90 transition-opacity"
            >
              DepEd Region VI
            </a>
          </div>

          {/* Four Top Navigation Tabs (Desktop XL+ where full row fits comfortably) */}
          <nav className="hidden xl:flex items-center gap-1.5 2xl:gap-2 h-full py-3 min-w-0">
            {navItems.map((item) => {
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => onTabChange(item.id)}
                  className={`px-3 2xl:px-4 py-2 rounded-xl text-sm 2xl:text-base font-bold transition-all whitespace-nowrap shrink-0 cursor-pointer flex items-center ${
                    isActive
                      ? 'bg-th-surface text-th-text shadow-sm'
                      : 'text-th-primary-fg hover:bg-white/15'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </nav>

          {/* Right Utility Controls: Theme toggle, Audit check, Print, and Cogwheel Options */}
          <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
            <button
              type="button"
              onClick={toggleDarkMode}
              className="p-2 sm:p-2.5 rounded-xl text-th-primary-fg bg-white/10 hover:bg-white/20 border border-white/15 transition-colors cursor-pointer"
              title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
              aria-label="Toggle light or dark mode"
            >
              {isDark ? (
                <Sun className="w-5 h-5" />
              ) : (
                <Moon className="w-5 h-5" />
              )}
            </button>

            <button
              type="button"
              onClick={onToggleAudit}
              className={`inline-flex items-center gap-2 px-2.5 sm:px-3.5 py-2 sm:py-2.5 rounded-xl text-sm font-bold border transition-colors cursor-pointer ${
                isAuditOpen
                  ? 'bg-th-surface text-th-text border-th-border-strong shadow-xs'
                  : isBalanced
                  ? 'bg-white/10 text-th-primary-fg border-white/15 hover:bg-white/20'
                  : 'bg-amber-400 text-slate-950 border-amber-300 hover:bg-amber-300'
              }`}
              title="Click to inspect the 6 Cross-Statement Audit Checks (both years)"
            >
              <Scale className="w-4 h-4 shrink-0" />
              <span className="hidden md:inline whitespace-nowrap">
                {isBalanced
                  ? 'Checks Passed'
                  : failedChecksCount > 0
                  ? `${failedChecksCount} Audit Issue${failedChecksCount === 1 ? '' : 's'}`
                  : 'Check Variance'}
              </span>
            </button>

            {/* Print Official Statement Button */}
            <button
              type="button"
              onClick={onPrint}
              className="inline-flex items-center gap-2 px-3 sm:px-4 py-2 sm:py-2.5 text-sm font-bold text-th-accent-fg bg-th-accent hover:bg-th-accent-hover rounded-xl shadow-sm transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              <span className="hidden sm:inline">Print</span>
            </button>

            {/* Options Cogwheel Button beside Print */}
            <button
              type="button"
              onClick={() => onTabChange('options')}
              className={`p-2 sm:p-2.5 rounded-xl border transition-colors cursor-pointer shrink-0 ${
                activeTab === 'options'
                  ? 'bg-th-surface text-th-text border-th-surface shadow-sm'
                  : 'bg-white/10 text-th-primary-fg border-white/15 hover:bg-white/20'
              }`}
              title="Options & Settings"
              aria-label="Options & Settings"
            >
              <Settings className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Compact secondary tab strip for narrow/tablet/small-laptop viewports */}
        <div className="xl:hidden flex items-center gap-1.5 sm:gap-2 overflow-x-auto py-2 border-t border-white/15 text-sm font-bold scrollbar-none">
          {navItems.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onTabChange(item.id)}
                className={`px-3 py-1.5 rounded-lg whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                  isActive
                    ? 'bg-th-surface text-th-text shadow-xs'
                    : 'text-th-primary-fg hover:bg-white/15'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      </div>
    </header>
  );
};
