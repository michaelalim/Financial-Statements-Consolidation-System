import React, { useState, useMemo } from 'react';
import { Division, LineItemDefinition, FinancialDataStore } from '../types/fs';
import { buildDivisionalMatrix } from '../utils/calculations';
import { formatAccounting } from '../utils/formatters';
import { YEAR_RANGE } from '../utils/yearUtils';
import { Download, Search, SlidersHorizontal, Table , ChevronLeft, ChevronRight } from 'lucide-react';

interface ConsolidatedMatrixViewProps {
  divisions: Division[];
  lineItems: LineItemDefinition[];
  selectedYear: string;
  onSelectYear: (year: string) => void;
  dataStore: FinancialDataStore;
}

export const ConsolidatedMatrixView: React.FC<ConsolidatedMatrixViewProps> = ({
  divisions,
  lineItems,
  selectedYear,
  onSelectYear,
  dataStore,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSubsection, setSelectedSubsection] = useState('all');
  const [hideZeroRows, setHideZeroRows] = useState(true);

  const matrixRows = useMemo(() => {
    return buildDivisionalMatrix(lineItems, divisions, dataStore, selectedYear);
  }, [lineItems, divisions, dataStore, selectedYear]);

  const filteredRows = useMemo(() => {
    return matrixRows.filter((row) => {
      const matchesSearch =
        row.item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        row.item.group.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesSubsection =
        selectedSubsection === 'all' || row.item.subsection === selectedSubsection;
      const matchesZero = !hideZeroRows || row.totalAmount !== 0;

      return matchesSearch && matchesSubsection && matchesZero;
    });
  }, [matrixRows, searchQuery, selectedSubsection, hideZeroRows]);

  const handleExportMatrixCSV = () => {
    const headers = [
      'Line Item ID',
      'Account Title',
      'Classification',
      'Group',
      ...divisions.map((d) => `"${d.name}"`),
      'Consolidated Total',
    ];

    const rows = [
      ['Department of Education - Regional Office No. VI'],
      [`Divisional Financial Position Matrix Breakdown - FY ${selectedYear}`],
      [],
      headers,
    ];

    filteredRows.forEach((row) => {
      const divValues = divisions.map((d) => (row.divisionAmounts[d.id] || 0).toString());
      rows.push([
        row.item.id,
        `"${row.item.name}${row.item.isContra ? ' (Contra)' : ''}"`,
        `"${row.item.subsection}"`,
        `"${row.item.group}"`,
        ...divValues,
        row.totalAmount.toString(),
      ]);
    });

    const csvContent = 'data:text/csv;charset=utf-8,' + rows.map((e) => e.join(',')).join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `DepEd_Region_VI_Matrix_Breakdown_${selectedYear}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="w-full max-w-[1780px] mx-auto px-2 sm:px-4 py-4 space-y-6">
      {/* Matrix Header & Controls */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-xs transition-colors">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Table className="w-5 h-5 text-sky-800 dark:text-sky-400" />
              Consolidated Division Matrix (Breakdown by Office)
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              Side-by-side view showing amounts contributed by each Schools Division Office to the Regional Consolidated Balance Sheet for {selectedYear}.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">Fiscal Year:</span>
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
            </div>

            <button
              onClick={handleExportMatrixCSV}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-[#0072ce] hover:bg-[#005ea8] rounded-lg shadow-2xs transition-colors whitespace-nowrap cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span>Export Matrix CSV</span>
            </button>
          </div>
        </div>

        {/* Search and Filters */}
        <div className="mt-4 flex flex-col sm:flex-row items-center gap-3">
          <div className="relative flex-1 w-full">
            <Search className="w-4 h-4 text-slate-400 dark:text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search matrix by account title or group..."
              className="w-full pl-10 pr-4 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-sky-600"
            />
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto">
            <div className="flex items-center gap-1.5">
              <SlidersHorizontal className="w-4 h-4 text-slate-400 dark:text-slate-500" />
              <select
                value={selectedSubsection}
                onChange={(e) => setSelectedSubsection(e.target.value)}
                className="px-3 py-2 text-sm bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-hidden"
              >
                <option value="all">All Subsections</option>
                <option value="Current Assets">Current Assets</option>
                <option value="Non-Current Assets">Non-Current Assets</option>
                <option value="Current Liabilities">Current Liabilities</option>
                <option value="Net Assets/Equity">Net Assets/Equity</option>
              </select>
            </div>

            <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300 cursor-pointer whitespace-nowrap">
              <input
                type="checkbox"
                checked={hideZeroRows}
                onChange={(e) => setHideZeroRows(e.target.checked)}
                className="w-4 h-4 text-sky-700 rounded border-slate-300 dark:border-slate-700"
              />
              <span>Remove zero balance rows</span>
            </label>
          </div>
        </div>
      </div>

      {/* Cross-Division Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xs overflow-hidden transition-colors">
        <div className="overflow-x-auto max-h-[720px] relative">
          <table className="w-full text-left text-sm border-collapse">
            <thead className="bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-semibold sticky top-0 z-20 border-b border-slate-200 dark:border-slate-700 shadow-2xs">
              <tr>
                <th className="py-3.5 px-4 min-w-[300px] sticky left-0 z-30 bg-slate-100 dark:bg-slate-800 border-r border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 text-sm">
                  Account Line Item
                </th>
                {divisions.map((div) => (
                  <th
                    key={div.id}
                    className="py-3.5 px-3 min-w-[140px] text-right border-r border-slate-200 dark:border-slate-700 truncate text-slate-800 dark:text-slate-200 text-sm font-semibold"
                    title={div.name}
                  >
                    {div.name}
                  </th>
                ))}
                <th className="py-3.5 px-4 min-w-[160px] text-right bg-sky-950 dark:bg-sky-900 text-white font-bold sticky right-0 z-20 text-sm">
                  Consolidated Total
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-800 dark:text-slate-200">
              {filteredRows.map((row) => (
                <tr key={row.item.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/50 transition-colors">
                  <td className="py-2.5 px-4 sticky left-0 z-10 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 shadow-2xs">
                    <div className="font-semibold text-slate-900 dark:text-slate-100 truncate max-w-[300px] text-sm" title={row.item.name}>
                      {row.item.name}
                    </div>
                    <div className="text-xs text-slate-400 dark:text-slate-500 truncate mt-0.5">
                      {row.item.group} {row.item.isContra ? '· Contra Account' : ''}
                    </div>
                  </td>

                  {divisions.map((div) => {
                    const amt = row.divisionAmounts[div.id] || 0;
                    return (
                      <td
                        key={div.id}
                        className={`py-2.5 px-3 text-right font-mono tabular-nums border-r border-slate-100 dark:border-slate-800 text-sm ${
                          amt !== 0 ? 'font-medium text-slate-900 dark:text-slate-100' : 'text-slate-300 dark:text-slate-600'
                        }`}
                      >
                        {formatAccounting(amt)}
                      </td>
                    );
                  })}

                  <td className="py-2.5 px-4 text-right font-mono tabular-nums font-bold text-sky-950 dark:text-sky-300 bg-sky-50/50 dark:bg-sky-950/40 sticky right-0 z-10 border-l border-slate-200 dark:border-slate-800 text-sm">
                    {formatAccounting(row.totalAmount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
