import React from 'react';
import { Division } from '../types/fs';
import { YEAR_RANGE, getComparativeYear } from '../utils/yearUtils';
import { ActiveTab } from './Navbar';
import { 
  FileText, 
  Building2, 
  Table, 
  Layers, 
  Printer, 
  Calendar, 
  Building,
  CheckCircle2,
  ChevronRight
} from 'lucide-react';

interface ReportsSidebarProps {
  activeTab: ActiveTab;
  onTabChange: (tab: ActiveTab) => void;
  divisions: Division[];
  selectedDivisionId: string;
  onSelectDivision: (id: string) => void;
  selectedYear: string;
  onSelectYear: (year: string) => void;
  onPrint: () => void;
}

export const ReportsSidebar: React.FC<ReportsSidebarProps> = ({
  activeTab,
  onTabChange,
  divisions,
  selectedDivisionId,
  onSelectDivision,
  selectedYear,
  onSelectYear,
  onPrint,
}) => {
  const comparativeYear = getComparativeYear(selectedYear);

  const reportNavItems: { id: ActiveTab; label: string; icon: React.ReactNode; desc: string }[] = [
    {
      id: 'divisional',
      label: 'Divisional FS',
      icon: <FileText className="w-4 h-4" />,
      desc: 'Detailed Statement of Financial Position per office',
    },
    {
      id: 'consolidated',
      label: 'Consolidated FS',
      icon: <Building2 className="w-4 h-4" />,
      desc: 'Regional Office VI Consolidated All Funds Statement',
    },
    {
      id: 'matrix',
      label: 'Division Matrix',
      icon: <Table className="w-4 h-4" />,
      desc: 'Cross-divisional comparison spreadsheet matrix',
    },
    {
      id: 'entry',
      label: 'Batch Data Entry',
      icon: <Layers className="w-4 h-4" />,
      desc: 'Key in multiple line items & save to database',
    },
  ];

  return (
    <aside className="w-full lg:w-72 shrink-0 bg-white border border-slate-200 rounded-xl p-4 shadow-xs self-start space-y-5 no-print sticky top-20">
      {/* Title */}
      <div className="pb-3 border-b border-slate-100">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900">
          Financial Statements
        </h3>
        <p className="text-[11px] text-slate-500 mt-0.5">
          Reports & Divisional Views
        </p>
      </div>

      {/* Reports Navigation Links */}
      <nav className="space-y-1">
        {reportNavItems.map((item) => {
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onTabChange(item.id)}
              className={`w-full text-left p-2.5 rounded-lg text-xs font-medium transition-all flex items-start gap-2.5 ${
                isActive
                  ? 'bg-sky-900 text-white shadow-2xs font-semibold'
                  : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <div className={`mt-0.5 shrink-0 ${isActive ? 'text-white' : 'text-sky-800'}`}>
                {item.icon}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span className="truncate">{item.label}</span>
                  {isActive && <ChevronRight className="w-3.5 h-3.5 shrink-0 ml-1 text-sky-200" />}
                </div>
                <div
                  className={`text-[10px] truncate mt-0.5 ${
                    isActive ? 'text-sky-200' : 'text-slate-400'
                  }`}
                >
                  {item.desc}
                </div>
              </div>
            </button>
          );
        })}
      </nav>

      {/* Quick Selectors Section */}
      <div className="pt-3 border-t border-slate-100 space-y-3">
        <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
          Entity & Scope Controls
        </div>

        {/* Division Picker */}
        <div>
          <label className="block text-[11px] font-semibold text-slate-700 mb-1 flex items-center gap-1">
            <Building className="w-3 h-3 text-sky-700" />
            Active Division
          </label>
          <select
            value={selectedDivisionId}
            onChange={(e) => onSelectDivision(e.target.value)}
            className="w-full px-2.5 py-1.5 text-xs font-semibold text-slate-900 bg-slate-50 border border-slate-300 rounded-lg focus:ring-2 focus:ring-sky-600 focus:outline-hidden cursor-pointer truncate"
          >
            {divisions.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </div>

        {/* Year Picker (2001-2099) */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-[11px] font-semibold text-slate-700 flex items-center gap-1">
              <Calendar className="w-3 h-3 text-sky-700" />
              Fiscal Year
            </label>
            <span className="text-[10px] font-mono text-slate-500">
              Comp: {comparativeYear}
            </span>
          </div>
          <select
            value={selectedYear}
            onChange={(e) => onSelectYear(e.target.value)}
            className="w-full px-2.5 py-1.5 text-xs font-semibold text-slate-900 bg-slate-50 border border-slate-300 rounded-lg focus:ring-2 focus:ring-sky-600 focus:outline-hidden cursor-pointer"
          >
            {YEAR_RANGE.map((yr) => (
              <option key={yr} value={yr}>
                FY {yr}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Print / Export Action */}
      <div className="pt-3 border-t border-slate-100">
        <button
          type="button"
          onClick={onPrint}
          className="w-full py-2 px-3 text-xs font-semibold text-white bg-sky-800 hover:bg-sky-900 rounded-lg shadow-2xs transition-colors flex items-center justify-center gap-1.5"
        >
          <Printer className="w-3.5 h-3.5" />
          <span>Print / Export Report</span>
        </button>
      </div>
    </aside>
  );
};
