import React, { useState, useMemo } from 'react';
import { Division, FinancialDataStore } from '../types/fs';
import { YEAR_RANGE } from '../utils/yearUtils';
import { formatAccounting } from '../utils/formatters';
import { ArrowRight, ArrowLeftRight, Check, X, AlertCircle, Copy, MoveRight } from 'lucide-react';

interface TransferDivisionModalProps {
  isOpen: boolean;
  onClose: () => void;
  divisions: Division[];
  dataStore: FinancialDataStore;
  onTransfer: (
    fromYear: string,
    fromDivId: string,
    toYear: string,
    toDivId: string,
    mode: 'move' | 'copy'
  ) => void;
  initialFromDivId?: string;
  initialToDivId?: string;
  initialYear?: string;
}

export const TransferDivisionModal: React.FC<TransferDivisionModalProps> = ({
  isOpen,
  onClose,
  divisions,
  dataStore,
  onTransfer,
  initialFromDivId = 'iloilo-div',
  initialToDivId = 'iloilo-city-div',
  initialYear = '2024',
}) => {
  const [fromDivId, setFromDivId] = useState<string>(initialFromDivId);
  const [toDivId, setToDivId] = useState<string>(initialToDivId);
  const [fromYear, setFromYear] = useState<string>(initialYear);
  const [toYear, setToYear] = useState<string>(initialYear);
  const [transferMode, setTransferMode] = useState<'move' | 'copy'>('move');

  if (!isOpen) return null;

  // Inspect source data
  const sourceEntries = (dataStore[fromYear] && dataStore[fromYear][fromDivId]) || {};
  const sourceNonZeroAccounts = Object.entries(sourceEntries).filter(
    ([_, val]) => val !== undefined && val !== 0
  );
  const sourceTotalAmount = sourceNonZeroAccounts.reduce((sum, [_, val]) => sum + (val || 0), 0);

  // Inspect target data
  const targetEntries = (dataStore[toYear] && dataStore[toYear][toDivId]) || {};
  const targetExistingCount = Object.entries(targetEntries).filter(
    ([_, val]) => val !== undefined && val !== 0
  ).length;

  const handleApplyPresetIloilo = () => {
    setFromDivId('iloilo-div');
    setToDivId('iloilo-city-div');
    setFromYear('2024');
    setToYear('2024');
    setTransferMode('move');
  };

  const handleConfirm = () => {
    onTransfer(fromYear, fromDivId, toYear, toDivId, transferMode);
    onClose();
  };

  const fromDivName = divisions.find((d) => d.id === fromDivId)?.name || fromDivId;
  const toDivName = divisions.find((d) => d.id === toDivId)?.name || toDivId;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="w-full max-w-2xl bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border-2 border-slate-300 dark:border-slate-700 overflow-hidden">
        {/* Header */}
        <div className="p-6 bg-[#0a3461] text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-[#0072ce] rounded-xl text-white shadow-xs">
              <ArrowLeftRight className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-lg font-bold">Transfer & Reassign Financial Details</h3>
              <p className="text-xs text-sky-200 mt-0.5">
                Move or copy line items and recorded balances between division offices and fiscal years.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-sky-200 hover:text-white p-1.5 rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Quick Preset Action: Iloilo to Iloilo City 2024 */}
          <div className="p-3.5 bg-[#f0f5fa] dark:bg-[#0a274c]/50 border-2 border-[#b9d9f5] dark:border-[#1d4677] rounded-xl flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm font-bold text-[#0a3461] dark:text-[#93c5fd]">
              ⚡ Quick Preset:
            </div>
            <button
              type="button"
              onClick={handleApplyPresetIloilo}
              className="px-3.5 py-1.5 text-xs font-bold text-white bg-[#0072ce] hover:bg-[#005ea8] rounded-lg shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <span>Transfer Iloilo Division 2024 → Iloilo City Division 2024</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Source & Target Configuration */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* SOURCE CARD */}
            <div className="p-4 bg-slate-50 dark:bg-slate-800/60 border-2 border-slate-200 dark:border-slate-700 rounded-xl space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-700">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  1. Source (Origin)
                </span>
                <span className="text-xs font-mono font-bold text-[#0072ce] dark:text-[#38bdf8]">
                  {sourceNonZeroAccounts.length} accounts found
                </span>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Source Division Office:
                </label>
                <select
                  value={fromDivId}
                  onChange={(e) => setFromDivId(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-bold bg-white dark:bg-slate-800 border-2 border-slate-300 dark:border-slate-600 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-hidden focus:border-[#0072ce]"
                >
                  {divisions.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Source Fiscal Year:
                </label>
                <select
                  value={fromYear}
                  onChange={(e) => setFromYear(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-bold bg-white dark:bg-slate-800 border-2 border-slate-300 dark:border-slate-600 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-hidden focus:border-[#0072ce]"
                >
                  {YEAR_RANGE.map((yr) => (
                    <option key={yr} value={yr}>
                      FY {yr}
                    </option>
                  ))}
                </select>
              </div>

              <div className="text-xs text-slate-600 dark:text-slate-400 pt-1">
                Total Balance: <strong className="font-mono text-slate-900 dark:text-slate-100">₱ {formatAccounting(sourceTotalAmount)}</strong>
              </div>
            </div>

            {/* TARGET CARD */}
            <div className="p-4 bg-slate-50 dark:bg-slate-800/60 border-2 border-slate-200 dark:border-slate-700 rounded-xl space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-700">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  2. Destination (Target)
                </span>
                <span className="text-xs font-mono font-bold text-slate-500">
                  {targetExistingCount > 0 ? `${targetExistingCount} existing` : 'Currently empty'}
                </span>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Destination Division Office:
                </label>
                <select
                  value={toDivId}
                  onChange={(e) => setToDivId(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-bold bg-white dark:bg-slate-800 border-2 border-slate-300 dark:border-slate-600 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-hidden focus:border-[#0072ce]"
                >
                  {divisions.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Destination Fiscal Year:
                </label>
                <select
                  value={toYear}
                  onChange={(e) => setToYear(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-bold bg-white dark:bg-slate-800 border-2 border-slate-300 dark:border-slate-600 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-hidden focus:border-[#0072ce]"
                >
                  {YEAR_RANGE.map((yr) => (
                    <option key={yr} value={yr}>
                      FY {yr}
                    </option>
                  ))}
                </select>
              </div>

              <div className="text-xs text-slate-600 dark:text-slate-400 pt-1">
                Will receive <strong className="font-mono text-[#0072ce] dark:text-[#38bdf8]">{sourceNonZeroAccounts.length}</strong> accounts and amounts
              </div>
            </div>
          </div>

          {/* Mode Selector */}
          <div className="p-4 bg-slate-100 dark:bg-slate-800 rounded-xl space-y-2">
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
              Transfer Mode:
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label
                className={`p-3 rounded-lg border-2 flex items-start gap-3 cursor-pointer transition-colors ${
                  transferMode === 'move'
                    ? 'bg-white dark:bg-slate-900 border-[#0072ce] ring-2 ring-[#0072ce]/20'
                    : 'bg-white/60 dark:bg-slate-900/60 border-slate-300 dark:border-slate-700 hover:border-slate-400'
                }`}
              >
                <input
                  type="radio"
                  name="transferMode"
                  value="move"
                  checked={transferMode === 'move'}
                  onChange={() => setTransferMode('move')}
                  className="mt-1 text-[#0072ce] focus:ring-[#0072ce]"
                />
                <div>
                  <div className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                    <MoveRight className="w-4 h-4 text-[#0072ce]" />
                    <span>Move & Clear Source (Recommended)</span>
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Transfers all accounts to destination and clears the source division for {fromYear}.
                  </div>
                </div>
              </label>

              <label
                className={`p-3 rounded-lg border-2 flex items-start gap-3 cursor-pointer transition-colors ${
                  transferMode === 'copy'
                    ? 'bg-white dark:bg-slate-900 border-[#0072ce] ring-2 ring-[#0072ce]/20'
                    : 'bg-white/60 dark:bg-slate-900/60 border-slate-300 dark:border-slate-700 hover:border-slate-400'
                }`}
              >
                <input
                  type="radio"
                  name="transferMode"
                  value="copy"
                  checked={transferMode === 'copy'}
                  onChange={() => setTransferMode('copy')}
                  className="mt-1 text-[#0072ce] focus:ring-[#0072ce]"
                />
                <div>
                  <div className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                    <Copy className="w-4 h-4 text-[#0072ce]" />
                    <span>Copy & Retain Source</span>
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Duplicates accounts to destination while keeping the source copy intact.
                  </div>
                </div>
              </label>
            </div>
          </div>

          {/* Validation Notice */}
          {fromDivId === toDivId && fromYear === toYear && (
            <div className="p-3 bg-amber-50 dark:bg-amber-950/60 border-2 border-amber-300 dark:border-amber-800 rounded-xl flex items-center gap-2.5 text-xs text-amber-800 dark:text-amber-300 font-bold">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>Source and destination must be different divisions or different fiscal years.</span>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="px-6 py-4 bg-slate-50 dark:bg-slate-800/60 border-t-2 border-slate-200 dark:border-slate-700 flex items-center justify-between">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            {fromDivName} ({fromYear}) → {toDivName} ({toYear})
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-bold text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 border-2 border-slate-300 dark:border-slate-700 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={fromDivId === toDivId && fromYear === toYear}
              onClick={handleConfirm}
              className="px-5 py-2 text-sm font-bold text-white bg-[#0072ce] hover:bg-[#005ea8] disabled:opacity-50 disabled:cursor-not-allowed rounded-xl shadow-xs transition-colors flex items-center gap-2 cursor-pointer"
            >
              <Check className="w-4 h-4" />
              <span>Execute Transfer</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
