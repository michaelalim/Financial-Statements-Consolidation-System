import React, { useState, useMemo } from 'react';
import { Division, LineItemDefinition, FinancialDataStore } from '../types/fs';
import { buildDivisionalMatrix, getExcludedAggregatedDepDivisionIds } from '../utils/calculations';
import { formatAccounting } from '../utils/formatters';
import { YEAR_RANGE } from '../utils/yearUtils';
import { AGGREGATED_ACCUMULATED_DEPRECIATION_ID } from '../data/defaultLineItems';
import { Download, Search, SlidersHorizontal, Table, ChevronLeft, ChevronRight, AlertTriangle } from 'lucide-react';

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

  const excludedDivisionIds = useMemo(() => {
    return new Set(getExcludedAggregatedDepDivisionIds(dataStore, selectedYear));
  }, [dataStore, selectedYear]);

  const includedDivisions = useMemo(() => {
    return divisions.filter((d) => !excludedDivisionIds.has(d.id));
  }, [divisions, excludedDivisionIds]);

  const excludedDivisions = useMemo(() => {
    return divisions.filter((d) => excludedDivisionIds.has(d.id));
  }, [divisions, excludedDivisionIds]);

  const matrixRows = useMemo(() => {
    return buildDivisionalMatrix(lineItems, includedDivisions, dataStore, selectedYear);
  }, [lineItems, includedDivisions, dataStore, selectedYear]);

  const filteredRows = useMemo(() => {
    return matrixRows.filter((row) => {
      if (row.item.id === AGGREGATED_ACCUMULATED_DEPRECIATION_ID) return false;
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
      ...includedDivisions.map((d) => `"${d.name}"`),
      'Consolidated Total',
    ];

    const rows = [
      ['Department of Education - Regional Office No. VI'],
      [`Divisional Financial Position Matrix Breakdown - FY ${selectedYear}`],
      [],
      headers,
    ];

    filteredRows.forEach((row) => {
      const divValues = includedDivisions.map((d) => (row.divisionAmounts[d.id] || 0).toString());
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
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 pb-4 border-b border-th-border">
          <div className="min-w-0">
            <h2 className="text-xl sm:text-2xl font-bold text-th-text flex items-center gap-2.5">
              <Table className="w-5 h-5 text-th-muted shrink-0" />
              <span>Consolidated Division Matrix (Breakdown by Office)</span>
            </h2>
            <p className="text-sm text-th-muted mt-1 leading-relaxed">
              Side-by-side view showing amounts contributed by each Schools Division Office to the Regional Consolidated Balance Sheet for {selectedYear}.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 shrink-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-th-muted whitespace-nowrap">Fiscal Year:</span>
              <div className="inline-flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    const prevYr = String(Number(selectedYear) - 1);
                    if (YEAR_RANGE.includes(prevYr)) onSelectYear(prevYr);
                  }}
                  disabled={!YEAR_RANGE.includes(String(Number(selectedYear) - 1))}
                  className="min-w-[42px] min-h-[42px] flex items-center justify-center rounded-xl bg-th-subtle hover:bg-th-subtle-hover disabled:opacity-40 disabled:cursor-not-allowed border-2 border-th-border-strong text-th-text transition-colors cursor-pointer"
                  title="Previous Fiscal Year"
                  aria-label="Previous Fiscal Year"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <select
                  value={selectedYear}
                  onChange={(e) => onSelectYear(e.target.value)}
                  aria-label="Fiscal Year"
                  className="min-h-[42px] px-4 py-2 text-base font-bold text-th-text bg-th-input border-2 border-th-border-strong rounded-xl focus:outline-hidden focus:border-th-accent focus:ring-2 focus:ring-th-accent/20 cursor-pointer shadow-xs"
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
                  className="min-w-[42px] min-h-[42px] flex items-center justify-center rounded-xl bg-th-subtle hover:bg-th-subtle-hover disabled:opacity-40 disabled:cursor-not-allowed border-2 border-th-border-strong text-th-text transition-colors cursor-pointer"
                  title="Next Fiscal Year"
                  aria-label="Next Fiscal Year"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            <button
              type="button"
              onClick={handleExportMatrixCSV}
              className="inline-flex items-center gap-2 min-h-[42px] px-4 py-2 text-sm font-bold text-th-accent-fg bg-th-accent hover:bg-th-accent-hover rounded-xl shadow-xs transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Download className="w-4 h-4 shrink-0" />
              <span>Export Matrix CSV</span>
            </button>
          </div>
        </div>

        {/* Search and Filters */}
        <div className="mt-4 flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="relative flex-1 w-full">
            <Search className="w-4 h-4 text-th-muted absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search matrix by account title or group..."
              className="w-full min-h-[42px] pl-10 pr-4 py-2 text-sm bg-th-input border-2 border-th-border-strong rounded-xl text-th-text focus:outline-hidden focus:ring-2 focus:ring-th-accent"
            />
          </div>

          <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto shrink-0">
            <div className="flex items-center gap-2">
              <SlidersHorizontal className="w-4 h-4 text-th-muted shrink-0" />
              <select
                value={selectedSubsection}
                onChange={(e) => setSelectedSubsection(e.target.value)}
                aria-label="Filter by subsection"
                className="min-h-[42px] px-3.5 py-2 text-sm font-semibold bg-th-input border-2 border-th-border-strong rounded-xl text-th-text focus:outline-hidden focus:ring-2 focus:ring-th-accent cursor-pointer"
              >
                <option value="all">All Subsections</option>
                <option value="Current Assets">Current Assets</option>
                <option value="Non-Current Assets">Non-Current Assets</option>
                <option value="Current Liabilities">Current Liabilities</option>
                <option value="Net Assets/Equity">Net Assets/Equity</option>
              </select>
            </div>

            <label className="flex items-center gap-2 min-h-[42px] px-3.5 py-2 rounded-xl bg-th-subtle border border-th-border-strong text-sm font-bold text-th-text cursor-pointer whitespace-nowrap">
              <input
                type="checkbox"
                checked={hideZeroRows}
                onChange={(e) => setHideZeroRows(e.target.checked)}
                className="w-4 h-4 text-th-accent accent-th-accent rounded border-th-border-strong"
              />
              <span>Hide zero rows</span>
            </label>
          </div>
        </div>
      </div>

      {/* Exclusion Notice Banner */}
      {excludedDivisions.length > 0 && (
        <div className="p-4 bg-red-50 dark:bg-red-950/50 border-2 border-red-300 dark:border-red-800 rounded-xl flex items-start gap-3 text-red-900 dark:text-red-100">
          <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
          <div className="text-sm leading-relaxed">
            <span className="font-bold">
              Excluded from Consolidated Matrix (FY {selectedYear}):
            </span>{' '}
            {excludedDivisions.map((d) => d.name).join(', ')}{' '}
            {excludedDivisions.length === 1 ? 'uses' : 'use'} a temporary{' '}
            <strong className="text-red-700 dark:text-red-300">Aggregated Accumulated Depreciation</strong>{' '}
            line item and {excludedDivisions.length === 1 ? 'is' : 'are'} omitted from consolidated figures until a per-PPE breakdown is provided.
          </div>
        </div>
      )}

      {/* Cross-Division Table */}
      <div className="bg-th-surface border border-th-border rounded-xl shadow-xs overflow-hidden transition-colors">
        <div className="overflow-x-auto max-h-[720px] relative">
          <table className="w-full text-left text-sm border-collapse">
            <thead className="bg-th-table-head text-th-table-head-fg font-semibold sticky top-0 z-20 border-b border-th-border shadow-2xs">
              <tr>
                <th className="py-3.5 px-4 min-w-[300px] sticky left-0 z-30 bg-th-table-head border-r border-th-border text-th-table-head-fg text-sm">
                  Account Line Item
                </th>
                {includedDivisions.map((div) => (
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

                  {includedDivisions.map((div) => {
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
