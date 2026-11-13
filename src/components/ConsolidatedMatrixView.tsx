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
      <div className="bg-th-surface border border-th-border rounded-xl p-6 shadow-xs transition-colors">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-th-border">
          <div>
            <h2 className="text-xl sm:text-2xl font-bold text-th-text flex items-center gap-2.5">
              <Table className="w-5 h-5 text-th-muted" />
              Consolidated Division Matrix (Breakdown by Office)
            </h2>
            <p className="text-sm text-th-muted mt-1 leading-relaxed">
              Side-by-side view showing amounts contributed by each Schools Division Office to the Regional Consolidated Balance Sheet for {selectedYear}.
            </p>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-th-text">Fiscal Year:</span>
              <div className="inline-flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    const prevYr = String(Number(selectedYear) - 1);
                    if (YEAR_RANGE.includes(prevYr)) onSelectYear(prevYr);
                  }}
                  disabled={!YEAR_RANGE.includes(String(Number(selectedYear) - 1))}
                  className="p-2.5 rounded-xl bg-th-subtle hover:bg-th-subtle-hover disabled:opacity-40 disabled:cursor-not-allowed border-2 border-th-border-strong text-th-text transition-colors cursor-pointer"
                  title="Previous Fiscal Year"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <select
                  value={selectedYear}
                  onChange={(e) => onSelectYear(e.target.value)}
                  className="px-4 py-2.5 text-base font-bold text-th-text bg-th-input border-2 border-th-border-strong rounded-xl focus:outline-hidden focus:border-th-accent focus:ring-2 focus:ring-th-accent/20 cursor-pointer shadow-xs"
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
                  className="p-2.5 rounded-xl bg-th-subtle hover:bg-th-subtle-hover disabled:opacity-40 disabled:cursor-not-allowed border-2 border-th-border-strong text-th-text transition-colors cursor-pointer"
                  title="Next Fiscal Year"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            <button
              onClick={handleExportMatrixCSV}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold text-th-accent-fg bg-th-accent hover:bg-th-accent-hover rounded-lg shadow-2xs transition-colors whitespace-nowrap cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span>Export Matrix CSV</span>
            </button>
          </div>
        </div>

        {/* Search and Filters */}
        <div className="mt-4 flex flex-col sm:flex-row items-center gap-3">
          <div className="relative flex-1 w-full">
            <Search className="w-4 h-4 text-th-muted absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search matrix by account title or group..."
              className="w-full pl-10 pr-4 py-2 text-sm bg-th-input border border-th-border-strong rounded-lg text-th-text focus:outline-hidden focus:ring-2 focus:ring-th-accent"
            />
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto">
            <div className="flex items-center gap-1.5">
              <SlidersHorizontal className="w-4 h-4 text-th-muted" />
              <select
                value={selectedSubsection}
                onChange={(e) => setSelectedSubsection(e.target.value)}
                className="px-3 py-2 text-sm font-semibold bg-th-input border border-th-border-strong rounded-lg text-th-text focus:outline-hidden focus:ring-2 focus:ring-th-accent"
              >
                <option value="all">All Subsections</option>
                <option value="Current Assets">Current Assets</option>
                <option value="Non-Current Assets">Non-Current Assets</option>
                <option value="Current Liabilities">Current Liabilities</option>
                <option value="Net Assets/Equity">Net Assets/Equity</option>
              </select>
            </div>

            <label className="flex items-center gap-2 text-sm font-bold text-th-text cursor-pointer whitespace-nowrap">
              <input
                type="checkbox"
                checked={hideZeroRows}
                onChange={(e) => setHideZeroRows(e.target.checked)}
                className="w-4 h-4 text-th-accent accent-th-accent rounded border-th-border-strong"
              />
              <span>Remove zero balance rows</span>
            </label>
          </div>
        </div>
      </div>

      {/* Cross-Division Table */}
      <div className="bg-th-surface border border-th-border rounded-xl shadow-xs overflow-hidden transition-colors">
        <div className="overflow-x-auto max-h-[720px] relative">
          <table className="w-full text-left text-sm border-collapse">
            <thead className="bg-th-table-head text-th-table-head-fg font-semibold sticky top-0 z-20 border-b border-th-border shadow-2xs">
              <tr>
                <th className="py-3.5 px-4 min-w-[300px] sticky left-0 z-30 bg-th-table-head border-r border-th-border text-th-table-head-fg text-sm">
                  Account Line Item
                </th>
                {divisions.map((div) => (
                  <th
                    key={div.id}
                    className="py-3.5 px-3 min-w-[140px] text-right border-r border-th-border truncate text-sm font-bold"
                    title={div.name}
                  >
                    {div.name}
                  </th>
                ))}
                <th className="py-3.5 px-4 min-w-[160px] text-right bg-th-primary text-th-primary-fg border-l-2 border-th-border-strong font-bold sticky right-0 z-20 text-sm">
                  Consolidated Total
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-th-border text-th-text">
              {filteredRows.map((row) => (
                <tr key={row.item.id} className="hover:bg-th-subtle transition-colors">
                  <td className="py-2.5 px-4 sticky left-0 z-10 bg-th-surface border-r border-th-border shadow-2xs">
                    <div className="font-bold text-th-text truncate max-w-[300px] text-sm" title={row.item.name}>
                      {row.item.name}
                    </div>
                    <div className="text-xs text-th-muted font-medium truncate mt-0.5">
                      {row.item.group} {row.item.isContra ? '· Contra Account' : ''}
                    </div>
                  </td>

                  {divisions.map((div) => {
                    const amt = row.divisionAmounts[div.id] || 0;
                    return (
                      <td
                        key={div.id}
                        className={`py-2.5 px-3 text-right font-mono tabular-nums border-r border-th-border text-sm ${
                          amt !== 0 ? 'font-semibold text-th-text' : 'text-th-muted'
                        }`}
                      >
                        {formatAccounting(amt)}
                      </td>
                    );
                  })}

                  <td className="py-2.5 px-4 text-right font-mono tabular-nums font-bold text-th-text bg-th-subtle sticky right-0 z-10 border-l-2 border-th-border-strong text-sm">
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
