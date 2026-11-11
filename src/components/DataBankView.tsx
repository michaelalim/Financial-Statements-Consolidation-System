import React, { useState, useMemo } from 'react';
import { Division, LineItemDefinition, FinancialDataStore } from '../types/fs';
import { calculateReport } from '../utils/calculations';
import { formatAccounting, parseNumberInput } from '../utils/formatters';
import { getComparativeYear, YEAR_RANGE } from '../utils/yearUtils';
import { AccountingBalanceCheck } from './AccountingBalanceCheck';
import { Search, Database, Download, Edit3, Check, Filter, ArrowLeftRight } from 'lucide-react';

interface DataBankViewProps {
  divisions: Division[];
  lineItems: LineItemDefinition[];
  selectedYear: string;
  onSelectYear: (year: string) => void;
  dataStore: FinancialDataStore;
  onSaveAmount: (year: string, divisionId: string, lineItemId: string, amount: number) => void;
  onOpenTransferModal?: () => void;
}

export const DataBankView: React.FC<DataBankViewProps> = ({
  divisions,
  lineItems,
  selectedYear,
  onSelectYear,
  dataStore,
  onSaveAmount,
  onOpenTransferModal,
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
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-sky-900 text-white shrink-0">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-slate-100">
                Financial Statement Data Bank
              </h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                Banked line items, balances, and benchmark accounting data for Department of Education Region VI.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Division Scope */}
            <div className="flex items-center gap-2 text-sm">
              <span className="font-semibold text-slate-700 dark:text-slate-300">Scope:</span>
              <select
                value={selectedDivisionFilter}
                onChange={(e) => setSelectedDivisionFilter(e.target.value)}
                className="px-3.5 py-2 text-sm font-semibold text-slate-900 dark:text-slate-100 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-sky-600"
              >
                <option value="all">Consolidated Region VI (All Divisions)</option>
                {divisions.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Year Selector (2001 - 2099) */}
            <div className="flex items-center gap-2 text-sm">
              <span className="font-semibold text-slate-700 dark:text-slate-300">Fiscal Year:</span>
              <select
                value={selectedYear}
                onChange={(e) => onSelectYear(e.target.value)}
                className="px-3.5 py-2 text-sm font-semibold text-slate-900 dark:text-slate-100 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-sky-600"
              >
                {YEAR_RANGE.map((yr) => (
                  <option key={yr} value={yr}>
                    FY {yr}
                  </option>
                ))}
              </select>
              <span className="text-slate-400 font-mono text-xs">
                (Comp: {priorYear})
              </span>
            </div>

            {onOpenTransferModal && (
              <button
                type="button"
                onClick={onOpenTransferModal}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-bold text-[#0072ce] dark:text-[#38bdf8] bg-sky-50 dark:bg-sky-950/60 hover:bg-sky-100 dark:hover:bg-sky-900/60 rounded-lg border border-[#0072ce]/40 transition-colors whitespace-nowrap cursor-pointer shadow-2xs"
              >
                <ArrowLeftRight className="w-4 h-4" />
                <span>Transfer / Reassign Data</span>
              </button>
            )}

            <button
              onClick={handleExportBankCSV}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-sky-800 hover:bg-sky-900 rounded-lg shadow-2xs transition-colors whitespace-nowrap cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span>Export Data Bank</span>
            </button>
          </div>
        </div>

        {/* Search & Filter Bar */}
        <div className="mt-4 flex flex-col sm:flex-row items-center gap-3">
          <div className="relative flex-1 w-full">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search line items by account name, code, or group..."
              className="w-full pl-10 pr-4 py-2.5 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-sky-600"
            />
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Filter className="w-4 h-4 text-slate-400 shrink-0" />
            <select
              value={selectedClassificationFilter}
              onChange={(e) => setSelectedClassificationFilter(e.target.value)}
              className="px-3.5 py-2.5 text-sm bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-lg focus:outline-hidden"
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

      {/* Highlighted Account Inquiry Card (Directly solves User Requirement #2) */}
      {highlightedItem && (
        <div className="bg-white border-2 border-sky-100 rounded-xl p-6 shadow-xs">
          <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 pb-4 border-b border-slate-100">
            <div>
              <div className="text-xs uppercase tracking-wider text-sky-800 font-semibold mb-1">
                Account Inquiry & Subgroup Bank Details
              </div>
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                {highlightedItem.name}
                {highlightedItem.isContra && (
                  <span className="text-[10px] text-amber-700 bg-amber-50 px-2 py-0.5 rounded font-normal">
                    Contra Account
                  </span>
                )}
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Classification: <span className="font-medium text-slate-700">{highlightedItem.subsection}</span> · Group: <span className="font-medium text-slate-700">{highlightedItem.group}</span> {highlightedItem.subgroup ? `· Subgroup: ${highlightedItem.subgroup}` : ''}
              </p>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => handleStartEdit(highlightedItem)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-sky-800 bg-sky-50 hover:bg-sky-100 rounded-lg transition-colors"
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span>Update Balance</span>
              </button>
            </div>
          </div>

          {/* Balance Cards: Specific Item Balance + Subgroup Subtotal */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-4">
            {/* 1. Specific Line Item Balance */}
            <div className="p-4 bg-slate-50/70 border border-slate-200 rounded-lg">
              <div className="text-xs text-slate-500 font-semibold uppercase tracking-wider">
                {highlightedItem.name} ({selectedYear})
              </div>
              <div className="text-lg font-bold font-mono tabular-nums text-slate-900 mt-1">
                ₱ {formatAccounting(reportCurrent.values[highlightedItem.id])}
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5">
                Prior Year ({priorYear}): ₱ {formatAccounting(reportPrior.values[highlightedItem.id])}
              </div>
            </div>

            {/* 2. Subgroup Subtotal (e.g. Cash on Hand = 709,342.56) */}
            {highlightedItem.subgroup && (
              <div className="p-4 bg-sky-50/60 border border-sky-200 rounded-lg">
                <div className="text-xs text-sky-900 font-semibold uppercase tracking-wider">
                  Subgroup: {highlightedItem.subgroup} ({selectedYear})
                </div>
                <div className="text-lg font-bold font-mono tabular-nums text-sky-950 mt-1">
                  ₱{' '}
                  {formatAccounting(
                    reportCurrent.subgroupTotals[
                      `${highlightedItem.subsection}__${highlightedItem.group}__${highlightedItem.subgroup}`
                    ]
                  )}
                </div>
                <div className="text-[11px] text-sky-800/80 mt-0.5">
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
            <div className="p-4 bg-slate-50/70 border border-slate-200 rounded-lg">
              <div className="text-xs text-slate-500 font-semibold uppercase tracking-wider">
                Group: {highlightedItem.group} ({selectedYear})
              </div>
              <div className="text-lg font-bold font-mono tabular-nums text-slate-900 mt-1">
                ₱{' '}
                {formatAccounting(
                  reportCurrent.groupTotals[`${highlightedItem.subsection}__${highlightedItem.group}`]
                )}
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5">
                Prior ({priorYear}): ₱{' '}
                {formatAccounting(
                  reportPrior.groupTotals[`${highlightedItem.subsection}__${highlightedItem.group}`]
                )}
              </div>
            </div>

            {/* 4. Variance / Net Change */}
            <div className="p-4 bg-slate-50/70 border border-slate-200 rounded-lg">
              <div className="text-xs text-slate-500 font-semibold uppercase tracking-wider">
                Year-Over-Year Variance
              </div>
              {(() => {
                const curr = reportCurrent.values[highlightedItem.id] || 0;
                const prev = reportPrior.values[highlightedItem.id] || 0;
                const diff = curr - prev;
                return (
                  <>
                    <div
                      className={`text-lg font-bold font-mono tabular-nums mt-1 ${
                        diff >= 0 ? 'text-emerald-700' : 'text-amber-700'
                      }`}
                    >
                      {diff >= 0 ? '+' : ''}₱ {formatAccounting(diff)}
                    </div>
                    <div className="text-[11px] text-slate-400 mt-0.5">
                      {prev !== 0 ? `${((diff / Math.abs(prev)) * 100).toFixed(2)}% change` : 'New entry'}
                    </div>
                  </>
                );
              })()}
            </div>
          </div>

          {/* Division Breakdown for Highlighted Item */}
          <div className="mt-4 pt-4 border-t border-slate-100">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-600 mb-2">
              Breakdown Across Divisions for FY {selectedYear}
            </h4>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 text-xs">
              {divisions.map((div) => {
                const divAmt =
                  (dataStore[selectedYear] &&
                    dataStore[selectedYear][div.id] &&
                    dataStore[selectedYear][div.id][highlightedItem.id]) ||
                  0;
                return (
                  <div
                    key={div.id}
                    className="p-2 bg-slate-50 border border-slate-200 rounded-md flex flex-col justify-between"
                  >
                    <span className="text-slate-600 font-medium truncate" title={div.name}>
                      {div.name}
                    </span>
                    <span className="font-mono tabular-nums font-bold text-slate-900 mt-1">
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
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xs overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-slate-900 dark:text-slate-100">
              Banked Line Items Catalog
            </span>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              ({filteredBankedItems.length} accounts found)
            </span>
          </div>
          <span className="text-xs text-slate-500 dark:text-slate-400">
            Click on any account to inspect details or edit balance
          </span>
        </div>

        <div className="overflow-x-auto max-h-[600px]">
          <table className="w-full text-left text-sm border-collapse">
            <thead className="bg-slate-100 dark:bg-slate-800/80 text-slate-700 dark:text-slate-200 font-bold sticky top-0 z-10 border-b border-slate-200 dark:border-slate-700 text-xs uppercase tracking-wider">
              <tr>
                <th className="py-3 px-4 min-w-[260px]">Account Title</th>
                <th className="py-3 px-4 min-w-[150px]">Classification / Group</th>
                <th className="py-3 px-4 text-right min-w-[140px]">FY {selectedYear} Balance</th>
                <th className="py-3 px-4 text-right min-w-[140px]">FY {priorYear} (Comp)</th>
                <th className="py-3 px-4 text-right min-w-[120px]">Change</th>
                <th className="py-3 px-4 text-center min-w-[80px]">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-800 dark:text-slate-200">
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
                    className={`hover:bg-sky-50/50 dark:hover:bg-slate-800/60 cursor-pointer transition-colors ${
                      isSelected ? 'bg-sky-50/70 dark:bg-sky-950/40' : ''
                    }`}
                  >
                    <td className="py-3 px-4 font-medium text-slate-900 dark:text-slate-100">
                      <div className="flex items-center gap-2">
                        <span className="text-sm">{item.name}</span>
                        {item.isContra && (
                          <span className="text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 px-2 py-0.5 rounded font-normal">
                            Contra
                          </span>
                        )}
                      </div>
                      {item.subgroup && (
                        <div className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                          Subgroup: {item.subgroup}
                        </div>
                      )}
                    </td>

                    <td className="py-3 px-4 text-slate-600 dark:text-slate-300">
                      <div className="text-sm font-medium">{item.subsection}</div>
                      <div className="text-xs text-slate-400 dark:text-slate-500">{item.group}</div>
                    </td>

                    <td className="py-3 px-4 text-right font-mono tabular-nums font-bold text-slate-900 dark:text-slate-100 text-sm">
                      {item.isContra && curr > 0 ? `(${formatAccounting(curr)})` : formatAccounting(curr)}
                    </td>

                    <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-600 dark:text-slate-300 text-sm">
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
                        className="p-1.5 text-sky-800 dark:text-sky-400 hover:text-sky-950 dark:hover:text-white hover:bg-sky-100 dark:hover:bg-sky-900/50 rounded-md transition-colors"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
          <div className="w-full max-w-md bg-white rounded-xl shadow-2xl border border-slate-200 p-6 animate-in fade-in zoom-in-95">
            <h3 className="text-base font-bold text-slate-900 mb-1">
              Update Banked Balance
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              {lineItems.find((i) => i.id === editingItemId)?.name} · FY {selectedYear}
            </p>

            <div className="space-y-3 mb-5">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
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
                  className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-sky-600 focus:outline-hidden"
                >
                  {divisions.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Amount (Hard Input)
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-mono text-xs">
                    ₱
                  </span>
                  <input
                    type="text"
                    value={editAmountStr}
                    onChange={(e) => setEditAmountStr(e.target.value)}
                    placeholder="0.00"
                    className="w-full pl-8 pr-4 py-2 text-sm font-mono tabular-nums bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-sky-600 focus:outline-hidden"
                    autoFocus
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditingItemId(null)}
                className="px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleSaveEdit(editingItemId)}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-sky-800 hover:bg-sky-900 rounded-lg shadow-xs"
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
