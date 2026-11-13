import React, { useState, useMemo } from 'react';
import { Division, LineItemDefinition, FinancialDataStore } from '../types/fs';
import { calculateReport } from '../utils/calculations';
import { formatAccounting, parseNumberInput } from '../utils/formatters';
import { getComparativeYear, YEAR_RANGE } from '../utils/yearUtils';
import { AccountingBalanceCheck } from './AccountingBalanceCheck';
import { Search, Database, Download, Edit3, Check, Filter } from 'lucide-react';

interface DataBankViewProps {
  divisions: Division[];
  lineItems: LineItemDefinition[];
  selectedYear: string;
  onSelectYear: (year: string) => void;
  dataStore: FinancialDataStore;
  onSaveAmount: (year: string, divisionId: string, lineItemId: string, amount: number) => void;
}

export const DataBankView: React.FC<DataBankViewProps> = ({
  divisions,
  lineItems,
  selectedYear,
  onSelectYear,
  dataStore,
  onSaveAmount,
}) => {
  const [selectedDivisionFilter, setSelectedDivisionFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('Cash');
  const [selectedClassificationFilter, setSelectedClassificationFilter] = useState<string>('all');

  // Inline editing state in data bank
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editDivisionId, setEditDivisionId] = useState<string>('ro-vi');
  const [editAmountStr, setEditAmountStr] = useState<string>('');

  const priorYear = getComparativeYear(selectedYear);

  // Active division or undefined for consolidated
  const activeDivId = selectedDivisionFilter === 'all' ? undefined : selectedDivisionFilter;

  // Calculate reports for selected year and comparative prior year
  const reportCurrent = useMemo(() => {
    return calculateReport(lineItems, dataStore, selectedYear, activeDivId);
  }, [lineItems, dataStore, selectedYear, activeDivId]);

  const reportPrior = useMemo(() => {
    return calculateReport(lineItems, dataStore, priorYear, activeDivId);
  }, [lineItems, dataStore, priorYear, activeDivId]);

  // Find banked items matching search and filters
  const filteredBankedItems = useMemo(() => {
    return lineItems.filter((item) => {
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !q ||
        item.name.toLowerCase().includes(q) ||
        item.group.toLowerCase().includes(q) ||
        (item.subgroup && item.subgroup.toLowerCase().includes(q));

      const matchesClass =
        selectedClassificationFilter === 'all' || item.subsection === selectedClassificationFilter;

      return matchesSearch && matchesClass;
    });
  }, [lineItems, searchQuery, selectedClassificationFilter]);

  // Highlighted quick lookup item (e.g. Cash - Collecting Officer)
  const highlightedItem = useMemo(() => {
    if (filteredBankedItems.length > 0) return filteredBankedItems[0];
    return lineItems[0];
  }, [filteredBankedItems, lineItems]);

  const handleStartEdit = (item: LineItemDefinition) => {
    setEditingItemId(item.id);
    const targetDiv = selectedDivisionFilter === 'all' ? 'ro-vi' : selectedDivisionFilter;
    setEditDivisionId(targetDiv);
    const currentVal =
      (dataStore[selectedYear] && dataStore[selectedYear][targetDiv] && dataStore[selectedYear][targetDiv][item.id]) ||
      0;
    setEditAmountStr(currentVal.toString());
  };

  const handleSaveEdit = (itemId: string) => {
    const num = parseNumberInput(editAmountStr);
    onSaveAmount(selectedYear, editDivisionId, itemId, num);
    setEditingItemId(null);
  };

  const handleExportBankCSV = () => {
    const scopeLabel =
      selectedDivisionFilter === 'all'
        ? 'Consolidated Region VI'
        : divisions.find((d) => d.id === selectedDivisionFilter)?.name || '';

    const rows = [
      ['Department of Education - Regional Office No. VI'],
      [`Financial Data Bank Ledger - FY ${selectedYear} (Comparative ${priorYear})`],
      [`Reporting Scope: ${scopeLabel}`],
      [],
      [
        'Line Item ID',
        'Account Title',
        'Classification',
        'Group',
        'Subgroup',
        `Balance (${selectedYear})`,
        `Balance (${priorYear})`,
        'Variance',
      ],
    ];

    lineItems.forEach((item) => {
      const curr = reportCurrent.values[item.id] || 0;
      const prior = reportPrior.values[item.id] || 0;
      rows.push([
        item.id,
        `"${item.name}"`,
        `"${item.subsection}"`,
        `"${item.group}"`,
        `"${item.subgroup || ''}"`,
        curr.toString(),
        prior.toString(),
        (curr - prior).toString(),
      ]);
    });

    const csvContent = 'data:text/csv;charset=utf-8,' + rows.map((e) => e.join(',')).join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `DepEd_Data_Bank_${selectedYear}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="w-full max-w-[1780px] mx-auto px-2 sm:px-4 py-4 space-y-6">
      {/* Page Header */}
      <div className="bg-th-surface border border-th-border rounded-xl p-6 shadow-xs transition-colors">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-th-border">
          <div className="flex items-center gap-3.5">
            <div className="p-3 rounded-xl bg-th-primary text-th-primary-fg border border-th-border-strong shrink-0">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl sm:text-2xl font-bold text-th-text">
                Financial Statement Data Bank
              </h2>
              <p className="text-sm text-th-muted mt-1 leading-relaxed">
                Banked line items, balances, and benchmark accounting data for Department of Education Region VI.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Division Scope */}
            <div className="flex items-center gap-2 text-sm">
              <span className="font-bold text-th-text">Scope:</span>
              <select
                value={selectedDivisionFilter}
                onChange={(e) => setSelectedDivisionFilter(e.target.value)}
                className="px-3.5 py-2 text-sm font-semibold text-th-text bg-th-input border border-th-border-strong rounded-lg focus:outline-hidden focus:ring-2 focus:ring-th-accent"
              >
                <option value="all">Consolidated Region VI (All Divisions)</option>
                {divisions.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Year Selector (2024 - 2099) */}
            <div className="flex items-center gap-2 text-sm">
              <span className="font-bold text-th-text">Fiscal Year:</span>
              <select
                value={selectedYear}
                onChange={(e) => onSelectYear(e.target.value)}
                className="px-3.5 py-2 text-sm font-semibold text-th-text bg-th-input border border-th-border-strong rounded-lg focus:outline-hidden focus:ring-2 focus:ring-th-accent"
              >
                {YEAR_RANGE.map((yr) => (
                  <option key={yr} value={yr}>
                    FY {yr}
                  </option>
                ))}
              </select>
              <span className="text-th-muted font-mono text-xs sm:text-sm font-semibold">
                (Comp: {priorYear})
              </span>
            </div>

            <button
              onClick={handleExportBankCSV}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-bold text-th-accent-fg bg-th-accent hover:bg-th-accent-hover rounded-lg shadow-2xs transition-colors whitespace-nowrap cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span>Export Data Bank</span>
            </button>
          </div>
        </div>

        {/* Search & Filter Bar */}
        <div className="mt-4 flex flex-col sm:flex-row items-center gap-3">
          <div className="relative flex-1 w-full">
            <Search className="w-4 h-4 text-th-muted absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search line items by account name, code, or group..."
              className="w-full pl-10 pr-4 py-2.5 text-sm bg-th-input border border-th-border-strong text-th-text rounded-lg focus:outline-hidden focus:ring-2 focus:ring-th-accent"
            />
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Filter className="w-4 h-4 text-th-muted shrink-0" />
            <select
              value={selectedClassificationFilter}
              onChange={(e) => setSelectedClassificationFilter(e.target.value)}
              className="px-3.5 py-2.5 text-sm font-semibold bg-th-input border border-th-border-strong text-th-text rounded-lg focus:outline-hidden focus:ring-2 focus:ring-th-accent"
            >
              <option value="all">All Classifications ({lineItems.length})</option>
              <option value="Current Assets">Current Assets</option>
              <option value="Non-Current Assets">Non-Current Assets</option>
              <option value="Current Liabilities">Current Liabilities</option>
              <option value="Net Assets/Equity">Net Assets/Equity</option>
            </select>
          </div>
        </div>
      </div>

      {/* Accounting Balance Check */}
      <AccountingBalanceCheck
        totalAssets={reportCurrent.totalAssets}
        totalLiabilities={reportCurrent.totalLiabilities}
        totalEquity={reportCurrent.totalEquity}
      />

      {/* Highlighted Account Inquiry Card */}
      {highlightedItem && (
        <div className="bg-th-surface border-2 border-th-border rounded-xl p-6 shadow-xs transition-colors">
          <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 pb-4 border-b border-th-border">
            <div>
              <div className="text-xs uppercase tracking-wider text-th-muted font-bold mb-1">
                Account Inquiry &amp; Subgroup Bank Details
              </div>
              <h3 className="text-lg font-bold text-th-text flex items-center gap-2">
                {highlightedItem.name}
                {highlightedItem.isContra && (
                  <span className="text-xs text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/60 px-2 py-0.5 rounded font-semibold border border-amber-200 dark:border-amber-800">
                    Contra Account
                  </span>
                )}
              </h3>
              <p className="text-sm text-th-muted mt-1 leading-relaxed">
                Classification: <span className="font-semibold text-th-text">{highlightedItem.subsection}</span> · Group:{' '}
                <span className="font-semibold text-th-text">{highlightedItem.group}</span>{' '}
                {highlightedItem.subgroup ? `· Subgroup: ${highlightedItem.subgroup}` : ''}
              </p>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => handleStartEdit(highlightedItem)}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-bold text-th-text bg-th-subtle hover:bg-th-primary hover:text-th-primary-fg border border-th-border-strong rounded-lg transition-colors cursor-pointer"
              >
                <Edit3 className="w-4 h-4" />
                <span>Update Balance</span>
              </button>
            </div>
          </div>

          {/* Balance Cards: Specific Item Balance + Subgroup Subtotal */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-4">
            {/* 1. Specific Line Item Balance */}
            <div className="p-4 bg-th-subtle border border-th-border-strong rounded-lg">
              <div className="text-xs text-th-muted font-bold uppercase tracking-wider">
                {highlightedItem.name} ({selectedYear})
              </div>
              <div className="text-xl font-bold font-mono tabular-nums text-th-text mt-1">
                ₱ {formatAccounting(reportCurrent.values[highlightedItem.id])}
              </div>
              <div className="text-xs font-medium text-th-muted mt-1">
                Prior Year ({priorYear}): ₱ {formatAccounting(reportPrior.values[highlightedItem.id])}
              </div>
            </div>

            {/* 2. Subgroup Subtotal */}
            {highlightedItem.subgroup && (
              <div className="p-4 bg-th-subtle border-2 border-th-border-strong rounded-lg">
                <div className="text-xs text-th-text font-bold uppercase tracking-wider">
                  Subgroup: {highlightedItem.subgroup} ({selectedYear})
                </div>
                <div className="text-xl font-bold font-mono tabular-nums text-th-text mt-1">
                  ₱{' '}
                  {formatAccounting(
                    reportCurrent.subgroupTotals[
                      `${highlightedItem.subsection}__${highlightedItem.group}__${highlightedItem.subgroup}`
                    ]
                  )}
                </div>
                <div className="text-xs font-medium text-th-muted mt-1">
                  Prior ({priorYear}): ₱{' '}
                  {formatAccounting(
                    reportPrior.subgroupTotals[
                      `${highlightedItem.subsection}__${highlightedItem.group}__${highlightedItem.subgroup}`
                    ]
                  )}
                </div>
              </div>
            )}

            {/* 3. Group Subtotal */}
            <div className="p-4 bg-th-subtle border border-th-border-strong rounded-lg">
              <div className="text-xs text-th-muted font-bold uppercase tracking-wider">
                Group: {highlightedItem.group} ({selectedYear})
              </div>
              <div className="text-xl font-bold font-mono tabular-nums text-th-text mt-1">
                ₱{' '}
                {formatAccounting(
                  reportCurrent.groupTotals[`${highlightedItem.subsection}__${highlightedItem.group}`]
                )}
              </div>
              <div className="text-xs font-medium text-th-muted mt-1">
                Prior ({priorYear}): ₱{' '}
                {formatAccounting(
                  reportPrior.groupTotals[`${highlightedItem.subsection}__${highlightedItem.group}`]
                )}
              </div>
            </div>

            {/* 4. Variance / Net Change */}
            <div className="p-4 bg-th-subtle border border-th-border-strong rounded-lg">
              <div className="text-xs text-th-muted font-bold uppercase tracking-wider">
                Year-Over-Year Variance
              </div>
              {(() => {
                const curr = reportCurrent.values[highlightedItem.id] || 0;
                const prev = reportPrior.values[highlightedItem.id] || 0;
                const diff = curr - prev;
                return (
                  <>
                    <div
                      className={`text-xl font-bold font-mono tabular-nums mt-1 ${
                        diff >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-amber-700 dark:text-amber-400'
                      }`}
                    >
                      {diff >= 0 ? '+' : ''}₱ {formatAccounting(diff)}
                    </div>
                    <div className="text-xs font-medium text-th-muted mt-1">
                      {prev !== 0 ? `${((diff / Math.abs(prev)) * 100).toFixed(2)}% change` : 'New entry'}
                    </div>
                  </>
                );
              })()}
            </div>
          </div>

          {/* Division Breakdown for Highlighted Item */}
          <div className="mt-4 pt-4 border-t border-th-border">
            <h4 className="text-sm font-bold uppercase tracking-wider text-th-text mb-2.5">
              Breakdown Across Divisions for FY {selectedYear}
            </h4>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5 text-sm">
              {divisions.map((div) => {
                const divAmt =
                  (dataStore[selectedYear] &&
                    dataStore[selectedYear][div.id] &&
                    dataStore[selectedYear][div.id][highlightedItem.id]) ||
                  0;
                return (
                  <div
                    key={div.id}
                    className="p-3 bg-th-subtle border border-th-border-strong rounded-lg flex flex-col justify-between"
                  >
                    <span className="text-xs text-th-muted font-semibold truncate" title={div.name}>
                      {div.name}
                    </span>
                    <span className="font-mono tabular-nums font-bold text-th-text mt-1">
                      {formatAccounting(divAmt)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Banked Ledger Table */}
      <div className="bg-th-surface border border-th-border rounded-xl shadow-xs overflow-hidden transition-colors">
        <div className="px-6 py-4 border-b border-th-border bg-th-subtle flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <span className="text-base font-bold text-th-text">
              Banked Line Items Catalog
            </span>
            <span className="text-sm font-medium text-th-muted">
              ({filteredBankedItems.length} accounts found)
            </span>
          </div>
          <span className="text-sm text-th-muted font-medium">
            Click on any account to inspect details or edit balance
          </span>
        </div>

        <div className="overflow-x-auto max-h-[600px]">
          <table className="w-full text-left text-sm border-collapse">
            <thead className="bg-th-table-head text-th-table-head-fg font-bold sticky top-0 z-10 border-b border-th-border text-xs uppercase tracking-wider">
              <tr>
                <th className="py-3 px-4 min-w-[260px]">Account Title</th>
                <th className="py-3 px-4 min-w-[150px]">Classification / Group</th>
                <th className="py-3 px-4 text-right min-w-[140px]">FY {selectedYear} Balance</th>
                <th className="py-3 px-4 text-right min-w-[140px]">FY {priorYear} (Comp)</th>
                <th className="py-3 px-4 text-right min-w-[120px]">Change</th>
                <th className="py-3 px-4 text-center min-w-[80px]">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-th-border text-th-text">
              {filteredBankedItems.map((item) => {
                const curr = reportCurrent.values[item.id] || 0;
                const prev = reportPrior.values[item.id] || 0;
                const diff = curr - prev;
                const isSelected = highlightedItem?.id === item.id;

                return (
                  <tr
                    key={item.id}
                    onClick={() => {
                      setSearchQuery(item.name);
                    }}
                    className={`hover:bg-th-subtle cursor-pointer transition-colors ${
                      isSelected ? 'bg-th-subtle' : ''
                    }`}
                  >
                    <td className="py-3 px-4 font-medium text-th-text">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold">{item.name}</span>
                        {item.isContra && (
                          <span className="text-xs text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 px-2 py-0.5 rounded font-semibold">
                            Contra
                          </span>
                        )}
                      </div>
                      {item.subgroup && (
                        <div className="text-xs text-th-muted mt-0.5">
                          Subgroup: {item.subgroup}
                        </div>
                      )}
                    </td>

                    <td className="py-3 px-4 text-th-muted">
                      <div className="text-sm font-semibold text-th-text">{item.subsection}</div>
                      <div className="text-xs text-th-muted">{item.group}</div>
                    </td>

                    <td className="py-3 px-4 text-right font-mono tabular-nums font-bold text-th-text text-sm">
                      {item.isContra && curr > 0 ? `(${formatAccounting(curr)})` : formatAccounting(curr)}
                    </td>

                    <td className="py-3 px-4 text-right font-mono tabular-nums text-th-muted text-sm font-medium">
                      {item.isContra && prev > 0 ? `(${formatAccounting(prev)})` : formatAccounting(prev)}
                    </td>

                    <td
                      className={`py-3 px-4 text-right font-mono tabular-nums text-sm font-semibold ${
                        diff >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-amber-700 dark:text-amber-400'
                      }`}
                    >
                      {diff >= 0 ? '+' : ''}
                      {formatAccounting(diff)}
                    </td>

                    <td className="py-3 px-4 text-center" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        onClick={() => handleStartEdit(item)}
                        className="p-1.5 text-th-text hover:bg-th-subtle-hover rounded-md transition-colors cursor-pointer"
                        title="Edit balance"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit Amount Modal for Data Bank */}
      {editingItemId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="w-full max-w-md bg-th-surface rounded-xl shadow-2xl border-2 border-th-border-strong p-6 animate-in fade-in zoom-in-95">
            <h3 className="text-lg font-bold text-th-text mb-1">
              Update Banked Balance
            </h3>
            <p className="text-sm text-th-muted mb-4 leading-relaxed">
              {lineItems.find((i) => i.id === editingItemId)?.name} · FY {selectedYear}
            </p>

            <div className="space-y-3 mb-5">
              <div>
                <label className="block text-sm font-bold text-th-text mb-1.5">
                  Target Division
                </label>
                <select
                  value={editDivisionId}
                  onChange={(e) => {
                    const divId = e.target.value;
                    setEditDivisionId(divId);
                    const val =
                      (dataStore[selectedYear] &&
                        dataStore[selectedYear][divId] &&
                        dataStore[selectedYear][divId][editingItemId]) ||
                      0;
                    setEditAmountStr(val.toString());
                  }}
                  className="w-full px-3.5 py-2.5 text-sm font-semibold bg-th-input border border-th-border-strong text-th-text rounded-lg focus:ring-2 focus:ring-th-accent focus:outline-hidden"
                >
                  {divisions.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-bold text-th-text mb-1.5">
                  Amount (Hard Input)
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-th-muted font-mono text-sm">
                    ₱
                  </span>
                  <input
                    type="text"
                    value={editAmountStr}
                    onChange={(e) => setEditAmountStr(e.target.value)}
                    placeholder="0.00"
                    className="w-full pl-8 pr-4 py-2.5 text-base font-mono font-bold tabular-nums bg-th-input border border-th-border-strong text-th-text rounded-lg focus:ring-2 focus:ring-th-accent focus:outline-hidden"
                    autoFocus
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditingItemId(null)}
                className="px-4 py-2 text-sm font-bold text-th-text bg-th-subtle border border-th-border-strong rounded-lg hover:bg-th-subtle-hover cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleSaveEdit(editingItemId)}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-bold text-th-accent-fg bg-th-accent hover:bg-th-accent-hover rounded-lg shadow-xs cursor-pointer"
              >
                <Check className="w-3.5 h-3.5" />
                <span>Save to Data Bank</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
