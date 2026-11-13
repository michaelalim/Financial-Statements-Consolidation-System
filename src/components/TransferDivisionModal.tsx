import React, { useState } from 'react';
import { Division, FinancialDataStore } from '../types/fs';
import { YEAR_RANGE } from '../utils/yearUtils';
import { formatAccounting } from '../utils/formatters';
import { ArrowRight, ArrowLeftRight, Check, AlertCircle, Copy, MoveRight, CheckCircle2 } from 'lucide-react';

interface TransferDivisionPanelProps {
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

export const TransferDivisionPanel: React.FC<TransferDivisionPanelProps> = ({
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
  const [feedback, setFeedback] = useState<string | null>(null);

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

  const fromDivName = divisions.find((d) => d.id === fromDivId)?.name || fromDivId;
  const toDivName = divisions.find((d) => d.id === toDivId)?.name || toDivId;

  const handleApplyPresetIloilo = () => {
    setFromDivId('iloilo-div');
    setToDivId('iloilo-city-div');
    setFromYear('2024');
    setToYear('2024');
    setTransferMode('move');
  };

  const handleConfirm = () => {
    onTransfer(fromYear, fromDivId, toYear, toDivId, transferMode);
    setFeedback(
      `Successfully ${transferMode === 'move' ? 'moved' : 'copied'} ${sourceNonZeroAccounts.length} account(s) from ${fromDivName} (FY ${fromYear}) to ${toDivName} (FY ${toYear}).`
    );
    setTimeout(() => setFeedback(null), 5000);
  };

  const isSameTarget = fromDivId === toDivId && fromYear === toYear;

  return (
    <div className="bg-th-surface border border-th-border rounded-xl shadow-xs overflow-hidden transition-colors">
      {/* Header */}
      <div className="p-6 bg-th-table-head text-th-table-head-fg border-b border-th-border flex items-center gap-3.5">
        <div className="p-2.5 bg-white/10 rounded-xl text-th-table-head-fg border border-white/20 shadow-xs shrink-0">
          <ArrowLeftRight className="w-5 h-5" />
        </div>
        <div>
          <h3 className="text-lg sm:text-xl font-bold">Transfer &amp; Reassign Financial Details</h3>
          <p className="text-sm text-th-table-head-fg mt-0.5 leading-relaxed">
            Move or copy line items and recorded balances between division offices and fiscal years.
          </p>
        </div>
      </div>

      <div className="p-6 space-y-5">
        {feedback && (
          <div className="p-3.5 bg-th-subtle border border-th-border-strong rounded-xl flex items-center gap-2.5 text-sm font-bold text-th-text">
            <CheckCircle2 className="w-5 h-5 text-th-accent-text shrink-0" />
            <span>{feedback}</span>
          </div>
        )}

        {/* Quick Preset Action: Iloilo to Iloilo City 2024 */}
        <div className="p-4 bg-th-subtle border border-th-border rounded-xl flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm font-bold text-th-text">
            Quick Preset:
          </div>
          <button
            type="button"
            onClick={handleApplyPresetIloilo}
            className="px-4 py-2 text-sm font-bold text-th-primary-fg bg-th-primary hover:opacity-90 rounded-lg border border-th-primary dark:border-th-border-strong shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <span>Transfer Iloilo Division 2024 → Iloilo City Division 2024</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>

        {/* Source & Target Configuration */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* SOURCE CARD */}
          <div className="p-4 bg-th-subtle border border-th-border rounded-xl space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-th-border">
              <span className="text-sm font-bold uppercase tracking-wider text-th-text">
                1. Source (Origin)
              </span>
              <span className="text-sm font-mono font-bold text-th-text">
                {sourceNonZeroAccounts.length} accounts found
              </span>
            </div>

            <div>
              <label className="block text-sm font-bold text-th-text mb-1.5">
                Source Division Office
              </label>
              <select
                value={fromDivId}
                onChange={(e) => setFromDivId(e.target.value)}
                className="w-full px-3.5 py-2.5 text-sm font-bold bg-th-input border border-th-border-strong rounded-lg text-th-text focus:outline-hidden focus:border-th-accent"
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
                Source Fiscal Year
              </label>
              <select
                value={fromYear}
                onChange={(e) => setFromYear(e.target.value)}
                className="w-full px-3.5 py-2.5 text-sm font-bold bg-th-input border border-th-border-strong rounded-lg text-th-text focus:outline-hidden focus:border-th-accent"
              >
                {YEAR_RANGE.map((yr) => (
                  <option key={yr} value={yr}>
                    FY {yr}
                  </option>
                ))}
              </select>
            </div>

            <div className="text-sm text-th-muted pt-1 font-medium">
              Total Balance:{' '}
              <strong className="font-mono text-th-text">
                ₱ {formatAccounting(sourceTotalAmount)}
              </strong>
            </div>
          </div>

          {/* TARGET CARD */}
          <div className="p-4 bg-th-subtle border border-th-border rounded-xl space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-th-border">
              <span className="text-sm font-bold uppercase tracking-wider text-th-text">
                2. Destination (Target)
              </span>
              <span className="text-sm font-mono font-bold text-th-muted">
                {targetExistingCount > 0 ? `${targetExistingCount} existing` : 'Currently empty'}
              </span>
            </div>

            <div>
              <label className="block text-sm font-bold text-th-text mb-1.5">
                Destination Division Office
              </label>
              <select
                value={toDivId}
                onChange={(e) => setToDivId(e.target.value)}
                className="w-full px-3.5 py-2.5 text-sm font-bold bg-th-input border border-th-border-strong rounded-lg text-th-text focus:outline-hidden focus:border-th-accent"
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
                Destination Fiscal Year
              </label>
              <select
                value={toYear}
                onChange={(e) => setToYear(e.target.value)}
                className="w-full px-3.5 py-2.5 text-sm font-bold bg-th-input border border-th-border-strong rounded-lg text-th-text focus:outline-hidden focus:border-th-accent"
              >
                {YEAR_RANGE.map((yr) => (
                  <option key={yr} value={yr}>
                    FY {yr}
                  </option>
                ))}
              </select>
            </div>

            <div className="text-sm text-th-muted pt-1 font-medium">
              Will receive{' '}
              <strong className="font-mono text-th-text">
                {sourceNonZeroAccounts.length}
              </strong>{' '}
              accounts and amounts
            </div>
          </div>
        </div>

        {/* Mode Selector */}
        <div className="p-4 bg-th-subtle border border-th-border rounded-xl space-y-3">
          <label className="block text-sm font-bold uppercase tracking-wider text-th-text">
            Transfer Mode
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label
              className={`p-4 rounded-lg border-2 flex items-start gap-3 cursor-pointer transition-colors ${
                transferMode === 'move'
                  ? 'bg-th-surface border-th-primary dark:border-th-border-strong ring-2 ring-th-border-strong'
                  : 'bg-th-surface border-th-border hover:border-th-border-strong'
              }`}
            >
              <input
                type="radio"
                name="transferMode"
                value="move"
                checked={transferMode === 'move'}
                onChange={() => setTransferMode('move')}
                className="mt-1 accent-th-accent"
              />
              <div>
                <div className="text-base font-bold text-th-text flex items-center gap-1.5">
                  <MoveRight className="w-4 h-4 text-th-muted" />
                  <span>Move &amp; Clear Source (Recommended)</span>
                </div>
                <div className="text-sm text-th-muted mt-1 leading-relaxed">
                  Transfers all accounts to destination and clears the source division for {fromYear}.
                </div>
              </div>
            </label>

            <label
              className={`p-4 rounded-lg border-2 flex items-start gap-3 cursor-pointer transition-colors ${
                transferMode === 'copy'
                  ? 'bg-th-surface border-th-primary dark:border-th-border-strong ring-2 ring-th-border-strong'
                  : 'bg-th-surface border-th-border hover:border-th-border-strong'
              }`}
            >
              <input
                type="radio"
                name="transferMode"
                value="copy"
                checked={transferMode === 'copy'}
                onChange={() => setTransferMode('copy')}
                className="mt-1 accent-th-accent"
              />
              <div>
                <div className="text-base font-bold text-th-text flex items-center gap-1.5">
                  <Copy className="w-4 h-4 text-th-muted" />
                  <span>Copy &amp; Retain Source</span>
                </div>
                <div className="text-sm text-th-muted mt-1 leading-relaxed">
                  Duplicates accounts to destination while keeping the source copy intact.
                </div>
              </div>
            </label>
          </div>
        </div>

        {/* Validation Notice */}
        {isSameTarget && (
          <div className="p-3.5 bg-amber-50 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-800 rounded-xl flex items-center gap-2.5 text-sm text-amber-800 dark:text-amber-300 font-bold">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>Source and destination must be different divisions or different fiscal years.</span>
          </div>
        )}
      </div>

      {/* Action Footer */}
      <div className="px-6 py-4 bg-th-subtle border-t border-th-border flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm font-semibold text-th-text">
          {fromDivName} ({fromYear}) → {toDivName} ({toYear})
        </div>

        <button
          type="button"
          disabled={isSameTarget}
          onClick={handleConfirm}
          className="px-5 py-2.5 text-sm font-bold text-th-accent-fg bg-th-accent hover:bg-th-accent-hover disabled:opacity-50 disabled:cursor-not-allowed rounded-xl shadow-xs transition-colors flex items-center gap-2 cursor-pointer"
        >
          <Check className="w-4 h-4" />
          <span>Execute Transfer</span>
        </button>
      </div>
    </div>
  );
};
