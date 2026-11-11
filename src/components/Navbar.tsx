import React from 'react';
import { Printer, Scale, Sun, Moon } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';

export type ActiveTab = 'entry' | 'divisional' | 'consolidated' | 'matrix' | 'options';

interface NavbarProps {
  activeTab: ActiveTab;
  onTabChange: (tab: ActiveTab) => void;
  onPrint: () => void;
  isAuditOpen: boolean;
  onToggleAudit: () => void;
  isBalanced: boolean;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  onTabChange,
  onPrint,
  isAuditOpen,
  onToggleAudit,
  isBalanced,
}) => {
  const { isDark, toggleDarkMode } = useTheme();

  const navItems: { id: ActiveTab; label: string }[] = [
    { id: 'entry', label: 'Data Entry' },
    { id: 'divisional', label: 'Financial Statements' },
    { id: 'consolidated', label: 'Consolidated FS' },
    { id: 'matrix', label: 'Division Matrix' },
    { id: 'options', label: 'Options' },
  ];

  return (
    <header className="sticky top-0 z-40 bg-white/95 dark:bg-slate-950/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 no-print transition-colors">
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between gap-4 h-14">
          {/* Minimalist Wordmark */}
          <div className="flex items-center gap-2.5 shrink-0">
            <div className="w-7 h-7 rounded-md bg-[#0a3461] text-white flex items-center justify-center font-bold text-[11px] tracking-wider">
              RO6
            </div>
            <a 
              href="#/" 
              onClick={(e) => { e.preventDefault(); onTabChange('entry'); }}
              className="text-sm sm:text-base font-bold tracking-tight text-[#0a3461] dark:text-white whitespace-nowrap shrink-0 hover:text-[#0072ce] transition-colors"
            >
              DepEd Region VI
            </a>
          </div>

          {/* Minimalist Underline Navigation */}
          <nav className="hidden lg:flex items-center gap-6 h-full">
            {navItems.map((item) => {
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => onTabChange(item.id)}
                  className={`relative h-full inline-flex items-center text-sm font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    isActive
                      ? 'text-[#0072ce] dark:text-[#38bdf8]'
                      : 'text-slate-500 dark:text-slate-400 hover:text-[#0a3461] dark:hover:text-slate-200'
                  }`}
                >
                  {item.label}
                  {isActive && (
                    <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#0072ce] dark:bg-[#38bdf8] rounded-full" />
                  )}
                </button>
              );
            })}
          </nav>

          {/* Minimalist Utility Controls */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={toggleDarkMode}
              className="p-2 rounded-lg text-slate-500 dark:text-slate-400 hover:text-[#0a3461] dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
              aria-label="Toggle light or dark theme"
            >
              {isDark ? (
                <Sun className="w-4 h-4 text-amber-400" />
              ) : (
                <Moon className="w-4 h-4" />
              )}
            </button>

            <button
              type="button"
              onClick={onToggleAudit}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                isAuditOpen
                  ? 'bg-[#0a3461] text-white'
                  : isBalanced
                  ? 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                  : 'bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300'
              }`}
              title="Click to view Accounting Balance Checks"
            >
              <Scale className="w-4 h-4 shrink-0 text-blue-200" />
              <span className="hidden sm:inline">
                {isBalanced ? 'Balanced' : 'Check Variance'}
              </span>
              <span
                className={`w-2 h-2 rounded-full ${
                  isBalanced ? 'bg-emerald-400' : 'bg-amber-400 animate-pulse'
                }`}
              />
            </button>

            {/* Print Official Statement Button */}
            <button
              onClick={onPrint}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs sm:text-sm font-bold text-white bg-[#0072ce] hover:bg-[#005ea8] rounded-lg shadow-xs transition-colors whitespace-nowrap shrink-0 border border-[#005ea8] cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              <span className="hidden sm:inline">Print</span>
            </button>
          </div>
        </div>

        {/* Mobile secondary tab strip */}
        <div className="lg:hidden flex items-center gap-1.5 overflow-x-auto py-2 border-t border-white/10 text-xs font-semibold scrollbar-none">
          {navItems.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onTabChange(item.id)}
                className={`px-3 py-1.5 rounded-md whitespace-nowrap shrink-0 transition-colors ${
                  isActive
                    ? 'bg-[#104b86] text-white font-bold border-b-2 border-[#38bdf8]'
                    : 'text-blue-100 hover:bg-white/10'
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
