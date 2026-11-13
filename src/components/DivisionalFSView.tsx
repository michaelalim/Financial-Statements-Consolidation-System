import React, { useState, useMemo } from 'react';
import { Division, LineItemDefinition, FinancialDataStore } from '../types/fs';
import { calculateReport } from '../utils/calculations';
import { formatAccounting } from '../utils/formatters';
import { YEAR_RANGE, getComparativeYear } from '../utils/yearUtils';
import { AccountingBalanceCheck } from './AccountingBalanceCheck';
import { FinancialStatementSidebar, FinancialStatementType } from './FinancialStatementSidebar';
import { Printer, Download, Building2, Eye, EyeOff, Search, X, ChevronLeft, ChevronRight } from 'lucide-react';

interface DivisionalFSViewProps {
  divisions: Division[];
  lineItems: LineItemDefinition[];
  selectedDivisionId: string;
  onSelectDivision: (id: string) => void;
  selectedYear: string;
  onSelectYear: (year: string) => void;
  dataStore: FinancialDataStore;
}

export const DivisionalFSView: React.FC<DivisionalFSViewProps> = ({
  divisions,
  lineItems,
  selectedDivisionId,
  onSelectDivision,
  selectedYear,
  onSelectYear,
  dataStore,
}) => {
  // Default: Remove zero balance items as requested
  const [hideZeroRows, setHideZeroRows] = useState(true);
  const [showComparative, setShowComparative] = useState(true);
  const [isCondensed, setIsCondensed] = useState(false);
  const [selectedStatement, setSelectedStatement] = useState<FinancialStatementType>('position');
  const [condensedNotes, setCondensedNotes] = useState<Record<string, string>>(() => {
    try {
      const saved = localStorage.getItem("deped_ro6_condensed_notes_v1");
      if (saved) return JSON.parse(saved);
    } catch {}
    return {
      "Cash and Cash Equivalents": "6",
      "Receivables": "7",
      "Inventories": "8",
      "Other Current Assets": "9",
      "Property, Plant and Equipment": "10",
      "Biological Assets": "11",
      "Intangible Assets": "12",
      "Other Non-Current Assets": "13",
      "Financial Liabilities": "14",
      "Inter-Agency Payables": "15",
      "Intra-Agency Payables": "16",
      "Trust Liabilities": "17",
      "Other Payables": "19",
    };
  });

  const handleNoteChange = (groupName: string, val: string) => {
    setCondensedNotes((prev) => {
      const next = { ...prev, [groupName]: val };
      try {
        localStorage.setItem("deped_ro6_condensed_notes_v1", JSON.stringify(next));
      } catch {}
      return next;
    });
  };
  const [searchQuery, setSearchQuery] = useState('');

  // Automatic comparative year: selecting 2026 automatically compares with 2025!
  const priorYear = getComparativeYear(selectedYear);

  const currentDivision = divisions.find((d) => d.id === selectedDivisionId) || divisions[0];

  // Report for current year
  const reportCurrent = useMemo(() => {
    return calculateReport(lineItems, dataStore, selectedYear, selectedDivisionId);
  }, [lineItems, dataStore, selectedYear, selectedDivisionId]);

  // Report for comparative prior year
  const reportPrior = useMemo(() => {
    return calculateReport(lineItems, dataStore, priorYear, selectedDivisionId);
  }, [lineItems, dataStore, priorYear, selectedDivisionId]);

  // Visibility helpers to remove zero balances and filter by search query
  const isItemVisible = (item: LineItemDefinition) => {
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const matches = item.name.toLowerCase().includes(q) ||
        item.group.toLowerCase().includes(q) ||
        (item.subgroup && item.subgroup.toLowerCase().includes(q));
      if (!matches) return false;
    }
    if (!hideZeroRows) return true;
    const valCurr = reportCurrent.values[item.id] || 0;
    const valPrior = reportPrior.values[item.id] || 0;
    return valCurr !== 0 || (showComparative && valPrior !== 0);
  };

  const isGroupVisible = (subgroups: { [subgroup: string]: LineItemDefinition[] }) => {
    return Object.values(subgroups).some((items) => items.some(isItemVisible));
  };

  const isSubgroupVisible = (items: LineItemDefinition[]) => {
    return items.some(isItemVisible);
  };

  // Group line items hierarchically
  const sectionsHierarchy = useMemo(() => {
    type Tree = {
      [subsection: string]: {
        [group: string]: {
          [subgroup: string]: LineItemDefinition[];
        };
      };
    };

    const tree: Tree = {};

    lineItems.forEach((item) => {
      const sub = item.subsection;
      const grp = item.group;
      const subgrp = item.subgroup || 'General';

      if (!tree[sub]) tree[sub] = {};
      if (!tree[sub][grp]) tree[sub][grp] = {};
      if (!tree[sub][grp][subgrp]) tree[sub][grp][subgrp] = [];

      tree[sub][grp][subgrp].push(item);
    });

    return tree;
  }, [lineItems]);

  const handlePrint = () => {
    window.print();
  };

  const formatFSNumber = (val: number, isContra?: boolean): string => {
    if (!val || Math.abs(val) < 0.005) return '-';
    if (isContra && val > 0) return `(${formatAccounting(val)})`;
    return formatAccounting(val);
  };

  const sumItemsNet = (items: LineItemDefinition[], report: ReturnType<typeof calculateReport>): number => {
    return items.reduce((sum, item) => {
      const v = report.values[item.id] || 0;
      return sum + (item.isContra ? -v : v);
    }, 0);
  };

  const sumSubgroupsNet = (
    subgroups: { [subgroup: string]: LineItemDefinition[] },
    report: ReturnType<typeof calculateReport>
  ): number => {
    return Object.values(subgroups).reduce((sum, items) => sum + sumItemsNet(items, report), 0);
  };


  const renderItemsWithNetValue = (items: LineItemDefinition[], indentClass: string, includeNetValue: boolean) => {
    // Include non-zero items, plus any contra items whose preceding base asset is visible
    const visibleItems: LineItemDefinition[] = [];
    let baseVisible = false;
    items.forEach((item) => {
      const valCurr = reportCurrent.values[item.id] || 0;
      const valPrior = reportPrior.values[item.id] || 0;
      const isNonZero = valCurr !== 0 || (showComparative && valPrior !== 0);

      if (!item.isContra) {
        baseVisible = !hideZeroRows || isNonZero;
        if (baseVisible) visibleItems.push(item);
      } else {
        if (!hideZeroRows || isNonZero || baseVisible) {
          visibleItems.push(item);
        }
      }
    });

    const rows: React.ReactNode[] = [];
    let runningBaseCurr = 0;
    let runningBasePrior = 0;
    let hasContraForCurrentBase = false;

    visibleItems.forEach((item, idx) => {
      const valCurr = reportCurrent.values[item.id] || 0;
      const valPrior = reportPrior.values[item.id] || 0;

      if (!item.isContra) {
        runningBaseCurr = valCurr;
        runningBasePrior = valPrior;
        hasContraForCurrentBase = false;
      } else {
        runningBaseCurr -= valCurr;
        runningBasePrior -= valPrior;
        hasContraForCurrentBase = true;
      }

      rows.push(
        <tr key={item.id}>
          <td className={`py-0.5 ${indentClass}`}>
            {item.name}
          </td>
          <td className="py-0.5 px-4 text-right tabular-nums">
            {formatFSNumber(valCurr, item.isContra)}
          </td>
          {showComparative && (
            <td className="py-0.5 px-4 text-right tabular-nums">
              {formatFSNumber(valPrior, item.isContra)}
            </td>
          )}
        </tr>
      );

      if (includeNetValue && hasContraForCurrentBase) {
        const nextItem = visibleItems[idx + 1];
        if (!nextItem || !nextItem.isContra) {
          rows.push(
            <tr key={`${item.id}-net-value`}>
              <td className={`py-0.5 pb-2 ${indentClass}`}>
                Net Value
              </td>
              <td className="py-0.5 pb-2 px-4 text-right tabular-nums">
                {formatFSNumber(runningBaseCurr)}
              </td>
              {showComparative && (
                <td className="py-0.5 pb-2 px-4 text-right tabular-nums">
                  {formatFSNumber(runningBasePrior)}
                </td>
              )}
            </tr>
          );
          hasContraForCurrentBase = false;
        }
      }
    });

    return rows;
  };

  const handleExportCSV = () => {
    const rows = [
      ['Department of Education'],
      ['Regional Office No. VI'],
      [currentDivision?.name || ''],
      ['Detailed Statement of Financial Position'],
      ['All Funds'],
      [`As at December 31, ${selectedYear}${showComparative ? ` and ${priorYear}` : ''}`],
      [],
      ['Account Title', `Amount (${selectedYear})`, ...(showComparative ? [`Amount (${priorYear})`] : [])],
    ];

    lineItems.forEach((item) => {
      const curr = reportCurrent.values[item.id] || 0;
      const prior = reportPrior.values[item.id] || 0;
      if (!hideZeroRows || curr !== 0 || prior !== 0) {
        rows.push([
          `"${item.name}"`,
          curr.toString(),
          ...(showComparative ? [prior.toString()] : []),
        ]);
      }
    });

    const csvContent = 'data:text/csv;charset=utf-8,' + rows.map((e) => e.join(',')).join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `${currentDivision?.name.replace(/\s+/g, '_')}_FS_${selectedYear}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="w-full max-w-[1780px] mx-auto px-2 sm:px-4 py-4">
      <div className="flex flex-col lg:flex-row gap-6 items-start">
        <FinancialStatementSidebar
          selectedStatement={selectedStatement}
          onSelectStatement={setSelectedStatement}
        />
        <div className="flex-1 min-w-0 w-full space-y-6">
      {/* Control Toolbar (No-Print) */}
      <div className="bg-white dark:bg-stone-900 border-2 border-stone-200 dark:border-stone-800 rounded-2xl p-5 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4 no-print transition-colors">
        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          {/* Division Select */}
          <div className="relative">
            <select
              value={selectedDivisionId}
              onChange={(e) => onSelectDivision(e.target.value)}
              className="pl-4 pr-9 py-2.5 text-base font-bold text-slate-900 dark:text-slate-100 bg-[#f4f8fc] dark:bg-slate-800 border-2 border-slate-300 dark:border-slate-700 rounded-xl focus:outline-hidden focus:border-[#0072ce] focus:ring-2 focus:ring-[#0072ce]/20 cursor-pointer shadow-xs"
            >
              {divisions.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>

          {/* Year Range (2024 - 2099) */}
          <div className="flex items-center gap-2">
            <span className="text-base font-bold text-slate-800 dark:text-slate-200">Year:</span>
            <div className="inline-flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => {
                const prevYr = String(Number(selectedYear) - 1);
                if (YEAR_RANGE.includes(prevYr)) onSelectYear(prevYr);
              }}
              disabled={!YEAR_RANGE.includes(String(Number(selectedYear) - 1))}
              className="p-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed border-2 border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 transition-colors cursor-pointer"
              title="Previous Fiscal Year"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <select
              value={selectedYear}
              onChange={(e) => onSelectYear(e.target.value)}
              className="px-4 py-2.5 text-base font-bold text-slate-900 dark:text-slate-100 bg-[#f4f8fc] dark:bg-slate-800 border-2 border-slate-300 dark:border-slate-700 rounded-xl focus:outline-hidden focus:border-[#0072ce] focus:ring-2 focus:ring-[#0072ce]/20 cursor-pointer shadow-xs"
            >
              {YEAR_RANGE.map((yr) => (
                <option key={yr} value={yr}>
                  FY {yr}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => {
                const nextYr = String(Number(selectedYear) + 1);
                if (YEAR_RANGE.includes(nextYr)) onSelectYear(nextYr);
              }}
              disabled={!YEAR_RANGE.includes(String(Number(selectedYear) + 1))}
              className="p-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed border-2 border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 transition-colors cursor-pointer"
              title="Next Fiscal Year"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
            <span className="text-xs text-slate-700 dark:text-slate-300 font-mono font-bold bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded-md border border-slate-300 dark:border-slate-750">
              Comp: {priorYear}
            </span>
          </div>

          {/* Toggle Detailed / Condensed FS */}
          <button
            type="button"
            onClick={() => setIsCondensed(!isCondensed)}
            className={`px-4 py-2.5 text-sm font-bold rounded-xl border-2 transition-colors cursor-pointer ${
              isCondensed
                ? "bg-[#0a3461] text-white border-[#0a3461] shadow-xs"
                : "bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700"
            }`}
            title="Toggle between Detailed and Condensed Statement of Financial Position"
          >
            {isCondensed ? "Condensed FS" : "Detailed FS"}
          </button>

          {/* Zero Balances Toggle */}
          <button
            type="button"
            onClick={() => setHideZeroRows(!hideZeroRows)}
            className={`px-4 py-2.5 text-sm font-bold rounded-xl border-2 transition-colors inline-flex items-center gap-2 cursor-pointer shadow-xs ${
              hideZeroRows
                ? 'bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700'
                : 'bg-[#e1edf8] dark:bg-[#0a3461]/60 text-[#0a3461] dark:text-[#38bdf8] border-[#0072ce]/50 dark:border-[#0072ce] hover:bg-[#d0e4f5]'
            }`}
          >
            {hideZeroRows ? <EyeOff className="w-4 h-4 text-slate-500 dark:text-slate-400" /> : <Eye className="w-4 h-4 text-[#0072ce] dark:text-[#38bdf8]" />}
            <span>{hideZeroRows ? 'Zero Balances Removed (Default)' : 'Showing All Accounts (Include Zeroes)'}</span>
          </button>

          {/* Quick In-Sheet Account Search */}
          <div className="relative min-w-[220px]">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Find account in sheet..."
              className="w-full pl-9 pr-8 py-2 text-sm font-semibold text-slate-900 dark:text-slate-100 bg-[#f4f8fc] dark:bg-slate-800 border-2 border-slate-300 dark:border-slate-700 rounded-xl focus:outline-hidden focus:border-[#0072ce] focus:ring-2 focus:ring-[#0072ce]/20"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                title="Clear search"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3 self-end md:self-auto">
          {/* Quick Section Jumps */}
          <div className="hidden sm:flex items-center gap-2 text-sm text-slate-600 mr-2 font-bold">
            <span className="text-slate-400">Jump:</span>
            <a href="#assets-section" className="hover:text-[#0072ce] underline px-1">Assets</a>
            <span>·</span>
            <a href="#liabilities-section" className="hover:text-[#0072ce] underline px-1">Liabilities</a>
            <span>·</span>
            <a href="#equity-section" className="hover:text-[#0072ce] underline px-1">Equity</a>
          </div>
          <button
            onClick={handleExportCSV}
            className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-bold text-slate-800 dark:text-slate-200 bg-white dark:bg-slate-800 border-2 border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl shadow-xs transition-colors cursor-pointer"
          >
            <Download className="w-4 h-4" />
            <span>CSV Export</span>
          </button>
          <button
            onClick={handlePrint}
            className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-bold text-white bg-[#0072ce] hover:bg-[#005ea8] rounded-xl shadow-sm transition-colors cursor-pointer"
          >
            <Printer className="w-4 h-4" />
            <span>Print Official FS</span>
          </button>
        </div>
      </div>

      {/* Prominent Accounting Balance Check (No-Print) */}
      <div className="no-print">
        <AccountingBalanceCheck
          totalAssets={reportCurrent.totalAssets}
          totalLiabilities={reportCurrent.totalLiabilities}
          totalEquity={reportCurrent.totalEquity}
        />
      </div>

      {/* Official Financial Statement Document Container */}
      <div className="bg-white text-black p-8 sm:p-14 font-['Times_New_Roman',Times,serif] text-[12pt] leading-snug print:p-0">
        {/* Document Header */}
        <div className="text-center mb-8">
          <div className="text-base font-bold">Department of Education</div>
          <div className="text-base font-bold">Regional Office No. VI</div>
          <div className="text-base font-bold">{currentDivision?.name}</div>
          <div className="text-base font-bold">
            {selectedStatement === 'cash_flows'
              ? 'Statement of Cash Flows'
              : selectedStatement === 'performance'
              ? 'Statement of Financial Performance'
              : selectedStatement === 'net_assets'
              ? 'Statement of Changes in Net Assets/Equity'
              : isCondensed
              ? 'Statement of Financial Position'
              : 'Detailed Statement of Financial Position'}
          </div>
          <div className="text-base font-bold">All Funds</div>
          <div className="text-base font-bold">
            {selectedStatement === 'cash_flows' ||
            selectedStatement === 'performance' ||
            selectedStatement === 'net_assets'
              ? `For the Year Ended December 31, ${selectedYear}`
              : `As at December 31, ${selectedYear}`}
          </div>
        </div>

        {/* Statement Body Table */}
        {isCondensed ? (
          <div className="overflow-x-auto">
            {(() => {
              const CONDENSED_NOTES: Record<string, string> = {
  "Cash and Cash Equivalents": "6",
  "Receivables": "7",
  "Inventories": "8",
  "Other Current Assets": "9",
  "Property, Plant and Equipment": "10",
  "Biological Assets": "11",
  "Intangible Assets": "12",
  "Other Non-Current Assets": "13",
  "Financial Liabilities": "14",
  "Inter-Agency Payables": "15",
  "Intra-Agency Payables": "16",
  "Trust Liabilities": "17",
  "Other Payables": "19"
};
              return (
                <table className="w-full text-left text-[12pt] border-collapse">
                  <thead>
                    <tr>
                      <th className="py-1.5 pr-4 w-1/2"></th>
                      <th className="py-1.5 px-3 text-center font-bold w-16">Note</th>
                      <th className="py-1.5 px-4 text-center font-bold border-b border-black">
                        {selectedYear}
                      </th>
                      {showComparative && (
                        <th className="py-1.5 px-4 text-center font-bold border-b border-black">
                          {priorYear}
                        </th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td colSpan={showComparative ? 4 : 3} className="pt-3 pb-1 font-bold uppercase">
                        ASSETS
                      </td>
                    </tr>
                    <tr>
                      <td colSpan={showComparative ? 4 : 3} className="pb-1 font-bold">
                        Current Assets
                      </td>
                    </tr>
                    {sectionsHierarchy["Current Assets"] &&
                      Object.entries(sectionsHierarchy["Current Assets"]).map(([groupName, subgroups]) => {
                        if (hideZeroRows && !isGroupVisible(subgroups)) return null;
                        const grpCurr = sumSubgroupsNet(subgroups, reportCurrent);
                        const grpPrior = sumSubgroupsNet(subgroups, reportPrior);
                        return (
                          <tr key={groupName}>
                            <td className="py-0.5 pl-8">{groupName}</td>
                            <td className="py-0.5 px-1 text-center font-bold">
                              <input
                                type="text"
                                value={condensedNotes[groupName] ?? ""}
                                onChange={(e) => handleNoteChange(groupName, e.target.value)}
                                className="w-12 text-center font-bold bg-transparent border border-transparent hover:border-slate-300 focus:border-black focus:outline-hidden rounded-xs print:border-none"
                                aria-label={`Note for ${groupName}`}
                              />
                            </td>
                            <td className="py-0.5 px-4 text-right tabular-nums">{formatFSNumber(grpCurr)}</td>
                            {showComparative && (
                              <td className="py-0.5 px-4 text-right tabular-nums">{formatFSNumber(grpPrior)}</td>
                            )}
                          </tr>
                        );
                      })}
                    <tr>
                      <td className="pt-1 pb-3 pl-8 font-bold">Total Current Assets</td>
                      <td></td>
                      <td className="pt-1 pb-3 px-4 text-right font-bold tabular-nums border-t border-black">
                        {formatFSNumber(reportCurrent.totalCurrentAssets)}
                      </td>
                      {showComparative && (
                        <td className="pt-1 pb-3 px-4 text-right font-bold tabular-nums border-t border-black">
                          {formatFSNumber(reportPrior.totalCurrentAssets)}
                        </td>
                      )}
                    </tr>

                    <tr>
                      <td colSpan={showComparative ? 4 : 3} className="pt-2 pb-1 font-bold">
                        Non-Current Assets
                      </td>
                    </tr>
                    {sectionsHierarchy["Non-Current Assets"] &&
                      Object.entries(sectionsHierarchy["Non-Current Assets"]).map(([groupName, subgroups]) => {
                        if (hideZeroRows && !isGroupVisible(subgroups)) return null;
                        const grpCurr = sumSubgroupsNet(subgroups, reportCurrent);
                        const grpPrior = sumSubgroupsNet(subgroups, reportPrior);
                        return (
                          <tr key={groupName}>
                            <td className="py-0.5 pl-8">{groupName}</td>
                            <td className="py-0.5 px-1 text-center font-bold">
                              <input
                                type="text"
                                value={condensedNotes[groupName] ?? ""}
                                onChange={(e) => handleNoteChange(groupName, e.target.value)}
                                className="w-12 text-center font-bold bg-transparent border border-transparent hover:border-slate-300 focus:border-black focus:outline-hidden rounded-xs print:border-none"
                                aria-label={`Note for ${groupName}`}
                              />
                            </td>
                            <td className="py-0.5 px-4 text-right tabular-nums">{formatFSNumber(grpCurr)}</td>
                            {showComparative && (
                              <td className="py-0.5 px-4 text-right tabular-nums">{formatFSNumber(grpPrior)}</td>
                            )}
                          </tr>
                        );
                      })}
                    <tr>
                      <td className="pt-1 pb-1 pl-8 font-bold">Total Non-Current Assets</td>
                      <td></td>
                      <td className="pt-1 pb-1 px-4 text-right font-bold tabular-nums border-t border-black">
                        {formatFSNumber(reportCurrent.totalNonCurrentAssets)}
                      </td>
                      {showComparative && (
                        <td className="pt-1 pb-1 px-4 text-right font-bold tabular-nums border-t border-black">
                          {formatFSNumber(reportPrior.totalNonCurrentAssets)}
                        </td>
                      )}
                    </tr>
                    <tr>
                      <td className="pt-1 pb-4 font-bold uppercase">TOTAL ASSETS</td>
                      <td></td>
                      <td className="pt-1 pb-4 px-4 text-right font-bold tabular-nums border-t border-black border-b-4 border-double">
                        {formatFSNumber(reportCurrent.totalAssets)}
                      </td>
                      {showComparative && (
                        <td className="pt-1 pb-4 px-4 text-right font-bold tabular-nums border-t border-black border-b-4 border-double">
                          {formatFSNumber(reportPrior.totalAssets)}
                        </td>
                      )}
                    </tr>

                    <tr>
                      <td colSpan={showComparative ? 4 : 3} className="pt-2 pb-1 font-bold uppercase">
                        LIABILITIES
                      </td>
                    </tr>
                    <tr>
                      <td colSpan={showComparative ? 4 : 3} className="pb-1 font-bold">
                        Current Liabilities
                      </td>
                    </tr>
                    {sectionsHierarchy["Current Liabilities"] &&
                      Object.entries(sectionsHierarchy["Current Liabilities"]).map(([groupName, subgroups]) => {
                        if (hideZeroRows && !isGroupVisible(subgroups)) return null;
                        const grpCurr = sumSubgroupsNet(subgroups, reportCurrent);
                        const grpPrior = sumSubgroupsNet(subgroups, reportPrior);
                        return (
                          <tr key={groupName}>
                            <td className="py-0.5 pl-8">{groupName}</td>
                            <td className="py-0.5 px-1 text-center font-bold">
                              <input
                                type="text"
                                value={condensedNotes[groupName] ?? ""}
                                onChange={(e) => handleNoteChange(groupName, e.target.value)}
                                className="w-12 text-center font-bold bg-transparent border border-transparent hover:border-slate-300 focus:border-black focus:outline-hidden rounded-xs print:border-none"
                                aria-label={`Note for ${groupName}`}
                              />
                            </td>
                            <td className="py-0.5 px-4 text-right tabular-nums">{formatFSNumber(grpCurr)}</td>
                            {showComparative && (
                              <td className="py-0.5 px-4 text-right tabular-nums">{formatFSNumber(grpPrior)}</td>
                            )}
                          </tr>
                        );
                      })}
                    <tr>
                      <td className="pt-1 pb-3 pl-8 font-bold">Total Current Liabilities</td>
                      <td></td>
                      <td className="pt-1 pb-3 px-4 text-right font-bold tabular-nums border-t border-black">
                        {formatFSNumber(reportCurrent.totalCurrentLiabilities)}
                      </td>
                      {showComparative && (
                        <td className="pt-1 pb-3 px-4 text-right font-bold tabular-nums border-t border-black">
                          {formatFSNumber(reportPrior.totalCurrentLiabilities)}
                        </td>
                      )}
                    </tr>
                    <tr>
                      <td className="pt-1 pb-3 font-bold uppercase">TOTAL LIABILITIES</td>
                      <td></td>
                      <td className="pt-1 pb-3 px-4 text-right font-bold tabular-nums border-t border-black border-b border-black">
                        {formatFSNumber(reportCurrent.totalLiabilities)}
                      </td>
                      {showComparative && (
                        <td className="pt-1 pb-3 px-4 text-right font-bold tabular-nums border-t border-black border-b border-black">
                          {formatFSNumber(reportPrior.totalLiabilities)}
                        </td>
                      )}
                    </tr>
                    <tr>
                      <td className="pt-1 pb-4 font-bold">Total Assets less Total Liabilities</td>
                      <td></td>
                      <td className="pt-1 pb-4 px-4 text-right font-bold tabular-nums border-b-4 border-double border-black">
                        {formatFSNumber(reportCurrent.netAssetsEquity)}
                      </td>
                      {showComparative && (
                        <td className="pt-1 pb-4 px-4 text-right font-bold tabular-nums border-b-4 border-double border-black">
                          {formatFSNumber(reportPrior.netAssetsEquity)}
                        </td>
                      )}
                    </tr>

                    <tr>
                      <td colSpan={showComparative ? 4 : 3} className="pt-2 pb-1 font-bold uppercase">
                        NET ASSETS/EQUITY
                      </td>
                    </tr>
                    <tr>
                      <td className="py-0.5">Accumulated Surplus/(Deficit)</td>
                      <td></td>
                      <td className="py-0.5 px-4 text-right tabular-nums">
                        {formatFSNumber(reportCurrent.netAssetsEquity)}
                      </td>
                      {showComparative && (
                        <td className="py-0.5 px-4 text-right tabular-nums">
                          {formatFSNumber(reportPrior.netAssetsEquity)}
                        </td>
                      )}
                    </tr>
                    <tr>
                      <td className="pt-1 pb-2 font-bold">Total Net Assets/Equity</td>
                      <td></td>
                      <td className="pt-1 pb-2 px-4 text-right font-bold tabular-nums border-t border-black border-b-4 border-double">
                        {formatFSNumber(reportCurrent.netAssetsEquity)}
                      </td>
                      {showComparative && (
                        <td className="pt-1 pb-2 px-4 text-right font-bold tabular-nums border-t border-black border-b-4 border-double">
                          {formatFSNumber(reportPrior.netAssetsEquity)}
                        </td>
                      )}
                    </tr>
                  </tbody>
                </table>
              );
            })()}
          </div>
        ) : (

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm border-collapse">
            <thead>
              <tr>
                <th className="py-1.5 pr-4 text-left font-normal uppercase w-3/5 text-sm">
                  ASSETS
                </th>
                <th className="py-1.5 px-4 text-center font-bold w-1/5 text-sm border-b border-black dark:border-slate-400">
                  {selectedYear}
                </th>
                {showComparative && (
                  <th className="py-1.5 px-4 text-center font-bold w-1/5 text-sm border-b border-black dark:border-slate-400">
                    {priorYear}
                  </th>
                )}
              </tr>
            </thead>

            <tbody>
              {/* 1. CURRENT ASSETS */}
              <tr id="assets-section">
                <td colSpan={showComparative ? 3 : 2} className="pt-4 pb-2 font-bold">
                  Current Assets
                </td>
              </tr>

              {sectionsHierarchy['Current Assets'] &&
                Object.entries(sectionsHierarchy['Current Assets']).map(([groupName, subgroups]) => {
                  if (hideZeroRows && !isGroupVisible(subgroups)) return null;
                  const grpCurr = sumSubgroupsNet(subgroups, reportCurrent);
                  const grpPrior = sumSubgroupsNet(subgroups, reportPrior);
                  return (
                    <React.Fragment key={groupName}>
                      <tr>
                        <td className="pt-3 pb-1 pl-10 font-bold">
                          {groupName}
                        </td>
                        <td className="pt-3 pb-1 px-4 text-right font-bold tabular-nums">
                          {formatFSNumber(grpCurr)}
                        </td>
                        {showComparative && (
                          <td className="pt-3 pb-1 px-4 text-right font-bold tabular-nums">
                            {formatFSNumber(grpPrior)}
                          </td>
                        )}
                      </tr>

                      {Object.entries(subgroups).map(([subgroupName, items]) => {
                        if (hideZeroRows && !isSubgroupVisible(items)) return null;
                        const showSubgroupHeader = subgroupName !== 'General' && subgroupName !== groupName;
                        const subCurr = sumItemsNet(items, reportCurrent);
                        const subPrior = sumItemsNet(items, reportPrior);
                        return (
                          <React.Fragment key={subgroupName}>
                            {showSubgroupHeader && (
                              <tr>
                                <td className="pt-2 pb-0.5 pl-20 font-normal">
                                  {subgroupName}
                                </td>
                                <td className="pt-2 pb-0.5 px-4 text-right font-bold tabular-nums">
                                  {formatFSNumber(subCurr)}
                                </td>
                                {showComparative && (
                                  <td className="pt-2 pb-0.5 px-4 text-right font-bold tabular-nums">
                                    {formatFSNumber(subPrior)}
                                  </td>
                                )}
                              </tr>
                            )}

                            {renderItemsWithNetValue(items, showSubgroupHeader ? 'pl-32' : 'pl-20', true)}
                          </React.Fragment>
                        );
                      })}
                    </React.Fragment>
                  );
                })}

              {/* Total Current Assets */}
              <tr>
                <td className="pt-3 pb-2 pl-10 font-bold">
                  Total Current Assets
                </td>
                <td className="pt-3 pb-2 px-4 text-right font-bold tabular-nums">
                  {formatFSNumber(reportCurrent.totalCurrentAssets)}
                </td>
                {showComparative && (
                  <td className="pt-3 pb-2 px-4 text-right font-bold tabular-nums">
                    {formatFSNumber(reportPrior.totalCurrentAssets)}
                  </td>
                )}
              </tr>

              {/* 2. NON-CURRENT ASSETS */}
              <tr>
                <td colSpan={showComparative ? 3 : 2} className="pt-4 pb-2 font-bold">
                  Non-Current Assets
                </td>
              </tr>

              {sectionsHierarchy['Non-Current Assets'] &&
                Object.entries(sectionsHierarchy['Non-Current Assets']).map(([groupName, subgroups]) => {
                  if (hideZeroRows && !isGroupVisible(subgroups)) return null;
                  const grpCurr = sumSubgroupsNet(subgroups, reportCurrent);
                  const grpPrior = sumSubgroupsNet(subgroups, reportPrior);
                  return (
                    <React.Fragment key={groupName}>
                      <tr>
                        <td className="pt-3 pb-1 pl-10 font-bold">
                          {groupName}
                        </td>
                        <td className="pt-3 pb-1 px-4 text-right font-bold tabular-nums">
                          {formatFSNumber(grpCurr)}
                        </td>
                        {showComparative && (
                          <td className="pt-3 pb-1 px-4 text-right font-bold tabular-nums">
                            {formatFSNumber(grpPrior)}
                          </td>
                        )}
                      </tr>

                      {Object.entries(subgroups).map(([subgroupName, items]) => {
                        if (hideZeroRows && !isSubgroupVisible(items)) return null;
                        const showSubgroupHeader = subgroupName !== 'General' && subgroupName !== groupName;
                        const subCurr = sumItemsNet(items, reportCurrent);
                        const subPrior = sumItemsNet(items, reportPrior);
                        return (
                          <React.Fragment key={subgroupName}>
                            {showSubgroupHeader && (
                              <tr>
                                <td className="pt-2 pb-0.5 pl-20 font-normal">
                                  {subgroupName}
                                </td>
                                <td className="pt-2 pb-0.5 px-4 text-right font-bold tabular-nums">
                                  {formatFSNumber(subCurr)}
                                </td>
                                {showComparative && (
                                  <td className="pt-2 pb-0.5 px-4 text-right font-bold tabular-nums">
                                    {formatFSNumber(subPrior)}
                                  </td>
                                )}
                              </tr>
                            )}

                            {renderItemsWithNetValue(items, showSubgroupHeader ? 'pl-32' : 'pl-20', true)}
                          </React.Fragment>
                        );
                      })}
                    </React.Fragment>
                  );
                })}

              {/* Total Non-Current Assets */}
              <tr>
                <td className="pt-3 pb-2 pl-10 font-bold">
                  Total Non-Current Assets
                </td>
                <td className="pt-3 pb-2 px-4 text-right font-bold tabular-nums">
                  {formatFSNumber(reportCurrent.totalNonCurrentAssets)}
                </td>
                {showComparative && (
                  <td className="pt-3 pb-2 px-4 text-right font-bold tabular-nums">
                    {formatFSNumber(reportPrior.totalNonCurrentAssets)}
                  </td>
                )}
              </tr>

              {/* TOTAL ASSETS */}
              <tr>
                <td className="pt-4 pb-3 font-bold uppercase">
                  TOTAL ASSETS
                </td>
                <td className="pt-4 pb-3 px-4 text-right font-bold tabular-nums">
                  {formatFSNumber(reportCurrent.totalAssets)}
                </td>
                {showComparative && (
                  <td className="pt-4 pb-3 px-4 text-right font-bold tabular-nums">
                    {formatFSNumber(reportPrior.totalAssets)}
                  </td>
                )}
              </tr>

              {/* LIABILITIES SECTION */}
              <tr>
                <td colSpan={showComparative ? 3 : 2} className="pt-5 pb-2 font-bold uppercase">
                  LIABILITIES
                </td>
              </tr>

              {/* 1. CURRENT LIABILITIES */}
              <tr>
                <td colSpan={showComparative ? 3 : 2} className="pt-2 pb-2 font-bold">
                  Current Liabilities
                </td>
              </tr>

              {sectionsHierarchy['Current Liabilities'] &&
                Object.entries(sectionsHierarchy['Current Liabilities']).map(([groupName, subgroups]) => {
                  if (hideZeroRows && !isGroupVisible(subgroups)) return null;
                  const grpCurr = sumSubgroupsNet(subgroups, reportCurrent);
                  const grpPrior = sumSubgroupsNet(subgroups, reportPrior);
                  return (
                    <React.Fragment key={groupName}>
                      <tr>
                        <td className="pt-3 pb-1 pl-10 font-bold">
                          {groupName}
                        </td>
                        <td className="pt-3 pb-1 px-4 text-right font-bold tabular-nums">
                          {formatFSNumber(grpCurr)}
                        </td>
                        {showComparative && (
                          <td className="pt-3 pb-1 px-4 text-right font-bold tabular-nums">
                            {formatFSNumber(grpPrior)}
                          </td>
                        )}
                      </tr>

                      {Object.entries(subgroups).map(([subgroupName, items]) => {
                        if (hideZeroRows && !isSubgroupVisible(items)) return null;
                        const showSubgroupHeader = subgroupName !== 'General' && subgroupName !== groupName;
                        const subCurr = sumItemsNet(items, reportCurrent);
                        const subPrior = sumItemsNet(items, reportPrior);
                        return (
                          <React.Fragment key={subgroupName}>
                            {showSubgroupHeader && (
                              <tr>
                                <td className="pt-2 pb-0.5 pl-20 font-normal">
                                  {subgroupName}
                                </td>
                                <td className="pt-2 pb-0.5 px-4 text-right font-bold tabular-nums">
                                  {formatFSNumber(subCurr)}
                                </td>
                                {showComparative && (
                                  <td className="pt-2 pb-0.5 px-4 text-right font-bold tabular-nums">
                                    {formatFSNumber(subPrior)}
                                  </td>
                                )}
                              </tr>
                            )}

                            {renderItemsWithNetValue(items, showSubgroupHeader ? 'pl-32' : 'pl-20', true)}
                          </React.Fragment>
                        );
                      })}
                    </React.Fragment>
                  );
                })}

              {/* Total Current Liabilities */}
              <tr>
                <td className="pt-3 pb-2 pl-10 font-bold">
                  Total Current Liabilities
                </td>
                <td className="pt-3 pb-2 px-4 text-right font-bold tabular-nums">
                  {formatFSNumber(reportCurrent.totalCurrentLiabilities)}
                </td>
                {showComparative && (
                  <td className="pt-3 pb-2 px-4 text-right font-bold tabular-nums">
                    {formatFSNumber(reportPrior.totalCurrentLiabilities)}
                  </td>
                )}
              </tr>

              {/* Total Non-Current Liabilities */}
              <tr>
                <td className="pt-1 pb-2 pl-10 font-bold">
                  Total Non-Current Liabilities
                </td>
                <td className="pt-1 pb-2 px-4 text-right font-bold tabular-nums">
                  {formatFSNumber(reportCurrent.totalNonCurrentLiabilities)}
                </td>
                {showComparative && (
                  <td className="pt-1 pb-2 px-4 text-right font-bold tabular-nums">
                    {formatFSNumber(reportPrior.totalNonCurrentLiabilities)}
                  </td>
                )}
              </tr>

              {/* Total Liabilities */}
              <tr>
                <td className="pt-3 pb-2 pl-10 font-bold">
                  Total Liabilities
                </td>
                <td className="pt-3 pb-2 px-4 text-right font-bold tabular-nums">
                  {formatFSNumber(reportCurrent.totalLiabilities)}
                </td>
                {showComparative && (
                  <td className="pt-3 pb-2 px-4 text-right font-bold tabular-nums">
                    {formatFSNumber(reportPrior.totalLiabilities)}
                  </td>
                )}
              </tr>

              {/* Total Assets less Total Liabilities */}
              <tr>
                <td className="pt-4 pb-2 font-bold">
                  Total Assets less Total Liabilities
                </td>
                <td className="pt-4 pb-2 px-4 text-right font-bold tabular-nums">
                  {formatFSNumber(reportCurrent.netAssetsEquity)}
                </td>
                {showComparative && (
                  <td className="pt-4 pb-2 px-4 text-right font-bold tabular-nums">
                    {formatFSNumber(reportPrior.netAssetsEquity)}
                  </td>
                )}
              </tr>

              {/* NET ASSETS / EQUITY */}
              <tr>
                <td colSpan={showComparative ? 3 : 2} className="pt-4 pb-2 font-bold">
                  Net Assets/Equity
                </td>
              </tr>

              {sectionsHierarchy['Net Assets/Equity'] &&
                Object.entries(sectionsHierarchy['Net Assets/Equity']).map(([groupName, subgroups]) => {
                  const grpCurr = sumSubgroupsNet(subgroups, reportCurrent);
                  const grpPrior = sumSubgroupsNet(subgroups, reportPrior);
                  return (
                    <React.Fragment key={groupName}>
                      <tr>
                        <td className="pt-2 pb-1 pl-10 font-bold">
                          {groupName}
                        </td>
                        <td className="pt-2 pb-1 px-4 text-right font-bold tabular-nums">
                          {formatFSNumber(grpCurr)}
                        </td>
                        {showComparative && (
                          <td className="pt-2 pb-1 px-4 text-right font-bold tabular-nums">
                            {formatFSNumber(grpPrior)}
                          </td>
                        )}
                      </tr>

                      {Object.values(subgroups)
                        .flat()
                        .map((item) => {
                          const valCurr = reportCurrent.values[item.id] || 0;
                          const valPrior = reportPrior.values[item.id] || 0;
                          if (hideZeroRows && valCurr === 0 && (!showComparative || valPrior === 0)) {
                            return null;
                          }
                          return (
                            <tr key={item.id}>
                              <td className="py-0.5 pl-20">
                                {item.name}
                              </td>
                              <td className="py-0.5 px-4 text-right tabular-nums">
                                {formatFSNumber(valCurr)}
                              </td>
                              {showComparative && (
                                <td className="py-0.5 px-4 text-right tabular-nums">
                                  {formatFSNumber(valPrior)}
                                </td>
                              )}
                            </tr>
                          );
                        })}
                    </React.Fragment>
                  );
                })}

              {/* Total Net Assets/Equity */}
              <tr>
                <td className="pt-4 pb-3 font-bold">
                  Total Net Assets/Equity
                </td>
                <td className="pt-4 pb-3 px-4 text-right font-bold tabular-nums">
                  {formatFSNumber(reportCurrent.netAssetsEquity)}
                </td>
                {showComparative && (
                  <td className="pt-4 pb-3 px-4 text-right font-bold tabular-nums">
                    {formatFSNumber(reportPrior.netAssetsEquity)}
                  </td>
                )}
              </tr>
            </tbody>
          </table>
        </div>
        )}
      </div>
        </div>
      </div>
    </div>
  );
};
