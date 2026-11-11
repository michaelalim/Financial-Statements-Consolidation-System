import React, { useState, useEffect } from 'react';
import { Division, LineItemDefinition, FinancialDataStore } from '../types/fs';
import { DataBankView } from './DataBankView';
import { DivisionManager } from './DivisionManager';
import { LineItemManager } from './LineItemManager';
import { Database, Building2, Sliders, RotateCcw, Settings, Sun, Moon, Check, Sparkles, ArrowLeftRight } from 'lucide-react';
import { ConfirmModal } from './ConfirmModal';
import { useTheme } from '../context/ThemeContext';

export type OptionsSubTab = 'databank' | 'divisions' | 'lineItems' | 'theme';

interface OptionsViewProps {
  initialSubTab?: OptionsSubTab;
  divisions: Division[];
  onAddDivision: (name: string) => void;
  onDeleteDivision: (id: string) => void;
  onResetDivisions: () => void;
  lineItems: LineItemDefinition[];
  onAddLineItem: (item: Omit<LineItemDefinition, 'id' | 'order'>) => void;
  onDeleteLineItem: (id: string) => void;
  onResetLineItems: () => void;
  selectedYear: string;
  onSelectYear: (year: string) => void;
  dataStore: FinancialDataStore;
  onSaveAmount: (year: string, divisionId: string, lineItemId: string, amount: number) => void;
  onResetBenchmark: () => void;
  onOpenTransferModal?: () => void;
}

export const OptionsView: React.FC<OptionsViewProps> = ({
  initialSubTab = 'databank',
  divisions,
  onAddDivision,
  onDeleteDivision,
  onResetDivisions,
  lineItems,
  onAddLineItem,
  onDeleteLineItem,
  onResetLineItems,
  selectedYear,
  onSelectYear,
  dataStore,
  onSaveAmount,
  onResetBenchmark,
  onOpenTransferModal,
}) => {
  const [subTab, setSubTab] = useState<OptionsSubTab>(initialSubTab);

  // Sync subTab whenever requested from outer navigation
  useEffect(() => {
    if (initialSubTab) {
      setSubTab(initialSubTab);
    }
  }, [initialSubTab]);

  const [isResetBenchmarkModalOpen, setIsResetBenchmarkModalOpen] = useState(false);
  const { mode, setMode } = useTheme();

  return (
    <div className="w-full max-w-[1780px] mx-auto px-2 sm:px-4 py-4 space-y-6">
      {/* Options Header & Sub-Tab Bar */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-xs transition-colors">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-[#0a3461] text-white rounded-xl shrink-0">
              <Settings className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-slate-100">
                System Options & Administrative Tools
              </h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                Manage the financial data bank, schools division offices, chart of accounts, and display settings.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 self-start sm:self-auto flex-wrap">
            {onOpenTransferModal && (
              <button
                type="button"
                onClick={onOpenTransferModal}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-bold text-white bg-[#0072ce] hover:bg-[#005ea8] rounded-lg transition-colors whitespace-nowrap border border-[#005ea8] shadow-xs cursor-pointer"
              >
                <ArrowLeftRight className="w-4 h-4" />
                <span>Transfer / Reassign Division Data</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => setIsResetBenchmarkModalOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors whitespace-nowrap border border-slate-200 dark:border-slate-700 cursor-pointer"
            >
              <RotateCcw className="w-4 h-4 text-slate-600 dark:text-slate-400" />
              <span>Reload PDF Benchmark Data</span>
            </button>
          </div>
        </div>

        {/* Options Sub-Tabs */}
        <div className="mt-5 flex items-center gap-2.5 overflow-x-auto scrollbar-none">
          <button
            type="button"
            onClick={() => setSubTab('databank')}
            className={`px-4 py-2.5 rounded-lg text-sm font-bold flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer shadow-xs ${
              subTab === 'databank'
                ? 'bg-[#0a3461] text-white'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700'
            }`}
          >
            <Database className="w-4 h-4" />
            <span>1. Data Bank</span>
          </button>

          <button
            type="button"
            onClick={() => setSubTab('divisions')}
            className={`px-4 py-2.5 rounded-lg text-sm font-bold flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer shadow-xs ${
              subTab === 'divisions'
                ? 'bg-[#0a3461] text-white'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700'
            }`}
          >
            <Building2 className="w-4 h-4" />
            <span>2. Divisions ({divisions.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setSubTab('lineItems')}
            className={`px-4 py-2.5 rounded-lg text-sm font-bold flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer shadow-xs ${
              subTab === 'lineItems'
                ? 'bg-[#0a3461] text-white'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700'
            }`}
          >
            <Sliders className="w-4 h-4" />
            <span>3. Line Items ({lineItems.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setSubTab('theme')}
            className={`px-4 py-2.5 rounded-lg text-sm font-bold flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer shadow-xs ${
              subTab === 'theme'
                ? 'bg-[#0a3461] text-white'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700'
            }`}
          >
            <Sun className="w-4 h-4" />
            <span>4. Display Mode</span>
          </button>
        </div>
      </div>

      {/* Options Body */}
      <div>
        {subTab === 'databank' && (
          <DataBankView
            divisions={divisions}
            lineItems={lineItems}
            selectedYear={selectedYear}
            onSelectYear={onSelectYear}
            dataStore={dataStore}
            onSaveAmount={onSaveAmount}
            onOpenTransferModal={onOpenTransferModal}
          />
        )}

        {subTab === 'divisions' && (
          <DivisionManager
            divisions={divisions}
            onAddDivision={onAddDivision}
            onDeleteDivision={onDeleteDivision}
            onResetDefaults={onResetDivisions}
          />
        )}

        {subTab === 'lineItems' && (
          <LineItemManager
            lineItems={lineItems}
            onAddLineItem={onAddLineItem}
            onDeleteLineItem={onDeleteLineItem}
            onResetDefaultItems={onResetLineItems}
          />
        )}

        {subTab === 'theme' && (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 sm:p-8 shadow-xs space-y-6">
            <div>
              <h3 className="text-base font-bold uppercase tracking-wider text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Sun className="w-5 h-5 text-[#0072ce]" />
                Display Mode (Dark / Light)
              </h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                Choose your preferred interface display mode for viewing financial statements and encoding records.
              </p>
            </div>

            {/* Mode selection */}
            <div className="p-6 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl space-y-4">
              <h4 className="text-sm font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                Select Mode
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <button
                  type="button"
                  onClick={() => setMode('light')}
                  className={`p-4 rounded-xl border-2 text-sm font-bold flex items-center justify-between transition-all cursor-pointer ${
                    mode === 'light'
                      ? 'bg-white text-slate-900 border-[#0072ce] ring-2 ring-[#0072ce]/20 shadow-xs'
                      : 'bg-white/60 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-white'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Sun className="w-5 h-5 text-amber-500" />
                    <span>Light Mode</span>
                  </div>
                  {mode === 'light' && <Check className="w-5 h-5 text-[#0072ce]" />}
                </button>

                <button
                  type="button"
                  onClick={() => setMode('dark')}
                  className={`p-4 rounded-xl border-2 text-sm font-bold flex items-center justify-between transition-all cursor-pointer ${
                    mode === 'dark'
                      ? 'bg-slate-950 text-white border-[#0072ce] ring-2 ring-[#0072ce]/20 shadow-xs'
                      : 'bg-white/60 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-950 hover:text-white'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Moon className="w-5 h-5 text-blue-400" />
                    <span>Dark Mode</span>
                  </div>
                  {mode === 'dark' && <Check className="w-5 h-5 text-[#0072ce]" />}
                </button>

                <button
                  type="button"
                  onClick={() => setMode('system')}
                  className={`p-4 rounded-xl border-2 text-sm font-bold flex items-center justify-between transition-all cursor-pointer ${
                    mode === 'system'
                      ? 'bg-blue-50/50 dark:bg-blue-950/40 text-blue-900 dark:text-blue-200 border-[#0072ce] ring-2 ring-[#0072ce]/20 shadow-xs'
                      : 'bg-white/60 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-blue-50/30'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Sparkles className="w-5 h-5 text-blue-500" />
                    <span>System Default</span>
                  </div>
                  {mode === 'system' && <Check className="w-5 h-5 text-[#0072ce]" />}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Confirmation Modal for Benchmark Reset */}
      <ConfirmModal
        isOpen={isResetBenchmarkModalOpen}
        title="Reload PDF Benchmark Baseline?"
        message="Are you sure you want to restore the official benchmark balances from the attached Department of Education Regional Office VI Balance Sheet PDF? This will reset the baseline figures for 2025 and 2024."
        confirmLabel="Yes, Reload Benchmark"
        cancelLabel="Cancel"
        variant="warning"
        onConfirm={() => {
          onResetBenchmark();
          setIsResetBenchmarkModalOpen(false);
        }}
        onCancel={() => setIsResetBenchmarkModalOpen(false)}
      />
    </div>
  );
};
