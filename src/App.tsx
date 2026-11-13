/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { Division, LineItemDefinition, FinancialDataStore } from './types/fs';
import { INITIAL_DIVISIONS } from './data/defaultDivisions';
import {
  DEFAULT_LINE_ITEMS,
  DEFAULT_PERFORMANCE_LINE_ITEMS,
  DEFAULT_CASH_FLOWS_LINE_ITEMS,
  DEFAULT_NET_ASSETS_LINE_ITEMS,
} from './data/defaultLineItems';
import { BENCHMARK_FINANCIAL_DATA } from './data/benchmarkData';
import { calculateReport } from './utils/calculations';
import { Navbar, ActiveTab } from './components/Navbar';
import { AccountingAuditDrawer } from './components/AccountingAuditDrawer';
import { DataEntryForm } from './components/DataEntryForm';
import { DivisionalFSView } from './components/DivisionalFSView';
import { ConsolidatedFSView } from './components/ConsolidatedFSView';
import { ConsolidatedMatrixView } from './components/ConsolidatedMatrixView';
import { OptionsView, OptionsSubTab } from './components/OptionsView';
import { ConfirmModal } from './components/ConfirmModal';
import { X } from 'lucide-react';

const LOCAL_STORAGE_KEY_DATA = 'deped_ro6_fs_data_v1';
const LOCAL_STORAGE_KEY_DIVISIONS = 'deped_ro6_divisions_v1';
const LOCAL_STORAGE_KEY_LINE_ITEMS = 'deped_ro6_line_items_v1';
const LOCAL_STORAGE_KEY_ILOILO_MIGRATED = 'deped_ro6_transferred_iloilo_2024_v1';

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('entry');
  const [isAuditOpen, setIsAuditOpen] = useState(false);
  const [isAuditPinned, setIsAuditPinned] = useState(false);
  const [optionsSubTab, setOptionsSubTab] = useState<OptionsSubTab>('databank');

  const handleNavigateToOptions = (subTab: OptionsSubTab = 'lineItems') => {
    setOptionsSubTab(subTab);
    setActiveTab('options');
  };

  // Divisions State
  const [divisions, setDivisions] = useState<Division[]>(() => {
    try {
      const saved = localStorage.getItem(LOCAL_STORAGE_KEY_DIVISIONS);
      if (saved) {
        const parsed: Division[] = JSON.parse(saved);
        const validIds = new Set(INITIAL_DIVISIONS.map((d) => d.id));
        const cleaned = parsed.filter((d) => validIds.has(d.id));
        return cleaned.length > 0 ? cleaned : INITIAL_DIVISIONS;
      }
    } catch {
      // fallback
    }
    return INITIAL_DIVISIONS;
  });

  // Selected Division: Default to Iloilo City Division as requested
  const [selectedDivisionId, setSelectedDivisionId] = useState<string>(() => {
    const hasIloiloCity = INITIAL_DIVISIONS.some((d) => d.id === 'iloilo-city-div');
    return hasIloiloCity ? 'iloilo-city-div' : (divisions[0]?.id || 'ro-vi');
  });

  // Selected Fiscal Year: Default to 2024 to immediately display transferred data
  const [selectedYear, setSelectedYear] = useState<string>('2024');

  // Line Items State
  const [lineItems, setLineItems] = useState<LineItemDefinition[]>(() => {
    try {
      const saved = localStorage.getItem(LOCAL_STORAGE_KEY_LINE_ITEMS);
      if (saved) {
        const parsed: LineItemDefinition[] = JSON.parse(saved);
        const existingIds = new Set(parsed.map((i) => i.id));
        const missingPerf = DEFAULT_PERFORMANCE_LINE_ITEMS.filter((i) => !existingIds.has(i.id));
        const missingCashFlows = DEFAULT_CASH_FLOWS_LINE_ITEMS.filter((i) => !existingIds.has(i.id));
        const missingNetAssets = DEFAULT_NET_ASSETS_LINE_ITEMS.filter((i) => !existingIds.has(i.id));
        const missing = [...missingPerf, ...missingCashFlows, ...missingNetAssets];
        return missing.length > 0 ? [...parsed, ...missing] : parsed;
      }
    } catch {
      // fallback
    }
    return [
      ...DEFAULT_LINE_ITEMS,
      ...DEFAULT_PERFORMANCE_LINE_ITEMS,
      ...DEFAULT_CASH_FLOWS_LINE_ITEMS,
      ...DEFAULT_NET_ASSETS_LINE_ITEMS,
    ];
  });

  // Financial Data Store with automatic migration of Iloilo Division 2024 -> Iloilo City Division 2024
  const [dataStore, setDataStore] = useState<FinancialDataStore>(() => {
    let currentStore: FinancialDataStore = BENCHMARK_FINANCIAL_DATA;
    try {
      const saved = localStorage.getItem(LOCAL_STORAGE_KEY_DATA);
      if (saved) {
        currentStore = JSON.parse(saved);
      }
    } catch {
      // fallback
    }

    // Auto-transfer 2024 details from Iloilo Division ('iloilo-div') to Iloilo City Division ('iloilo-city-div')
    const iloilo2024Data = currentStore['2024']?.['iloilo-div'];
    if (iloilo2024Data && Object.keys(iloilo2024Data).length > 0) {
      const year2024 = { ...(currentStore['2024'] || {}) };
      const currentCity2024 = { ...(year2024['iloilo-city-div'] || {}) };
      // Transfer / merge accounts into Iloilo City Division 2024
      year2024['iloilo-city-div'] = {
        ...currentCity2024,
        ...iloilo2024Data,
      };
      // Clear source iloilo-div to complete the transfer
      delete year2024['iloilo-div'];
      currentStore = {
        ...currentStore,
        '2024': year2024,
      };
      try {
        localStorage.setItem(LOCAL_STORAGE_KEY_DATA, JSON.stringify(currentStore));
        localStorage.setItem(LOCAL_STORAGE_KEY_ILOILO_MIGRATED, 'true');
      } catch (e) {
        console.error(e);
      }
    }

    return currentStore;
  });

  // Transfer notification toast state
  const [transferToastMessage, setTransferToastMessage] = useState<string | null>(
    'FY 2024 financial details from Iloilo Division have been transferred to Iloilo City Division.'
  );

  // Global Confirmation Modals for Cross-Component Prompting
  const [isResetBenchmarkModalOpen, setIsResetBenchmarkModalOpen] = useState(false);
  const [pendingAddDivName, setPendingAddDivName] = useState<string | null>(null);
  const [pendingAddLineItem, setPendingAddLineItem] = useState<{ name: string; group: string } | null>(null);
  const [pendingDeleteLineItem, setPendingDeleteLineItem] = useState<LineItemDefinition | null>(null);

  // Persistence Sync
  useEffect(() => {
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY_DIVISIONS, JSON.stringify(divisions));
    } catch (e) {
      console.error(e);
    }
  }, [divisions]);

  useEffect(() => {
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY_LINE_ITEMS, JSON.stringify(lineItems));
    } catch (e) {
      console.error(e);
    }
  }, [lineItems]);

  useEffect(() => {
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY_DATA, JSON.stringify(dataStore));
    } catch (e) {
      console.error(e);
    }
  }, [dataStore]);

  // Handlers for Data Entry
  const handleSaveAmount = (year: string, divisionId: string, lineItemId: string, amount: number) => {
    setDataStore((prev) => {
      const yearCopy = { ...(prev[year] || {}) };
      const divCopy = { ...(yearCopy[divisionId] || {}) };
      divCopy[lineItemId] = amount;
      yearCopy[divisionId] = divCopy;
      return {
        ...prev,
        [year]: yearCopy,
      };
    });
  };

  const handleSaveBatchAmounts = (
    year: string,
    divisionId: string,
    entries: { lineItemId: string; amount: number }[]
  ) => {
    setDataStore((prev) => {
      const yearCopy = { ...(prev[year] || {}) };
      const divCopy = { ...(yearCopy[divisionId] || {}) };
      entries.forEach(({ lineItemId, amount }) => {
        divCopy[lineItemId] = amount;
      });
      yearCopy[divisionId] = divCopy;
      return {
        ...prev,
        [year]: yearCopy,
      };
    });
  };

  const handleDeleteAmount = (year: string, divisionId: string, lineItemId: string) => {
    setDataStore((prev) => {
      if (!prev[year] || !prev[year][divisionId]) return prev;
      const yearCopy = { ...prev[year] };
      const divCopy = { ...yearCopy[divisionId] };
      delete divCopy[lineItemId];
      yearCopy[divisionId] = divCopy;
      return {
        ...prev,
        [year]: yearCopy,
      };
    });
  };

  const handleDeleteAllDivisionAmounts = (year: string, divisionId: string) => {
    setDataStore((prev) => {
      if (!prev[year] || !prev[year][divisionId]) return prev;
      const yearCopy = { ...prev[year] };
      delete yearCopy[divisionId];
      return {
        ...prev,
        [year]: yearCopy,
      };
    });
  };

  // Handlers for Divisions
  const handleAddDivision = (name: string) => {
    const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const newDiv: Division = {
      id: `${id}-${Date.now().toString().slice(-4)}`,
      name,
    };
    setDivisions((prev) => [...prev, newDiv]);
    setSelectedDivisionId(newDiv.id);
  };

  const handleDeleteDivision = (id: string) => {
    setDivisions((prev) => prev.filter((d) => d.id !== id));
    if (selectedDivisionId === id) {
      const remaining = divisions.filter((d) => d.id !== id);
      if (remaining.length > 0) {
        setSelectedDivisionId(remaining[0].id);
      }
    }
  };

  const handleResetDivisionsToDefault = () => {
    setDivisions(INITIAL_DIVISIONS);
    setSelectedDivisionId(INITIAL_DIVISIONS[0].id);
  };

  // Handlers for Line Items
  const handleAddLineItem = (itemData: Omit<LineItemDefinition, 'id' | 'order'>) => {
    const id = itemData.name.toLowerCase().replace(/[^a-z0-9]+/g, '_');
    const newItem: LineItemDefinition = {
      ...itemData,
      id: `${id}_${Date.now().toString().slice(-4)}`,
      order: lineItems.length * 10 + 10,
    };
    setLineItems((prev) => [...prev, newItem]);
  };

  const handleDeleteLineItem = (id: string) => {
    setLineItems((prev) => prev.filter((item) => item.id !== id));
  };

  const handleResetLineItemsToDefault = () => {
    setLineItems([
      ...DEFAULT_LINE_ITEMS,
      ...DEFAULT_PERFORMANCE_LINE_ITEMS,
      ...DEFAULT_CASH_FLOWS_LINE_ITEMS,
      ...DEFAULT_NET_ASSETS_LINE_ITEMS,
    ]);
  };

  // Transfer division data handler
  const handleTransferDivisionData = (
    fromYear: string,
    fromDivId: string,
    toYear: string,
    toDivId: string,
    mode: 'move' | 'copy'
  ) => {
    setDataStore((prev) => {
      const fromEntries = (prev[fromYear] && prev[fromYear][fromDivId]) || {};
      const toYearCopy = { ...(prev[toYear] || {}) };
      const toDivCopy = { ...(toYearCopy[toDivId] || {}) };

      toYearCopy[toDivId] = {
        ...toDivCopy,
        ...fromEntries,
      };

      let nextStore: FinancialDataStore = {
        ...prev,
        [toYear]: toYearCopy,
      };

      if (mode === 'move') {
        const fromYearCopy = { ...(nextStore[fromYear] || {}) };
        delete fromYearCopy[fromDivId];
        nextStore = {
          ...nextStore,
          [fromYear]: fromYearCopy,
        };
      }

      return nextStore;
    });

    setSelectedDivisionId(toDivId);
    setSelectedYear(toYear);

    const fromName = divisions.find((d) => d.id === fromDivId)?.name || fromDivId;
    const toName = divisions.find((d) => d.id === toDivId)?.name || toDivId;
    setTransferToastMessage(
      `Transferred financial details from ${fromName} (${fromYear}) to ${toName} (${toYear}) [${mode === 'move' ? 'Moved' : 'Copied'}].`
    );
  };

  // Reset benchmark data
  const handleResetBenchmark = () => {
    setDataStore(BENCHMARK_FINANCIAL_DATA);
    setIsResetBenchmarkModalOpen(false);
  };

  // Live accounting report calculation for the side checks panel
  const activeDivForChecks = activeTab === 'consolidated' ? undefined : selectedDivisionId;
  const currentEntityName = activeTab === 'consolidated'
    ? 'Consolidated Region VI (All Funds)'
    : divisions.find((d) => d.id === selectedDivisionId)?.name || 'Regional Office VI';

  const liveChecksReport = useMemo(() => {
    return calculateReport(lineItems, dataStore, selectedYear, activeDivForChecks);
  }, [lineItems, dataStore, selectedYear, activeDivForChecks]);

  const liabilitiesPlusEquity = liveChecksReport.totalLiabilities + liveChecksReport.totalEquity;
  const isBalanced = Math.abs(liveChecksReport.totalAssets - liabilitiesPlusEquity) < 0.01;

  return (
    <div className="min-h-screen bg-th-canvas text-th-text flex flex-col antialiased transition-colors">
      {/* Top Navbar */}
      <Navbar
        activeTab={activeTab}
        onTabChange={(tab) => setActiveTab(tab)}
        onPrint={() => window.print()}
        isAuditOpen={isAuditOpen}
        onToggleAudit={() => setIsAuditOpen((prev) => !prev)}
        isBalanced={isBalanced}
      />

      {/* Contextual Institutional Ribbon */}
      <div className="bg-th-surface border-b border-th-border text-sm text-th-muted py-2.5 px-4 sm:px-6 lg:px-8 no-print transition-colors">
        <div className="max-w-[1780px] mx-auto flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 flex-wrap">
            <span className="font-bold text-th-muted">Entity:</span>
            <span className="font-bold text-th-text bg-th-subtle px-3 py-1 rounded-lg border border-th-border">
              {currentEntityName}
            </span>
            <span className="text-th-muted">·</span>
            <span className="font-bold text-th-muted">Fiscal Year:</span>
            <span className="font-bold text-th-text bg-th-subtle px-3 py-1 rounded-lg border border-th-border">
              FY {selectedYear}
            </span>
            <span className="text-th-muted">·</span>
            <span className="text-th-muted font-medium">COA Government Accounting Manual (GAM) for NGAs</span>
          </div>

          <div className="flex items-center gap-2.5">
            <span className="font-bold text-th-muted">Live Equation:</span>
            <span className={`inline-flex items-center gap-1.5 font-bold px-3 py-1 rounded-lg text-sm border ${
              isBalanced
                ? 'bg-th-subtle text-th-text border-th-border-strong'
                : 'bg-amber-100 dark:bg-amber-950/80 text-amber-900 dark:text-amber-200 border-amber-300 dark:border-amber-800'
            }`}>
              {isBalanced ? 'A = L + E (Balanced)' : 'Variance Detected'}
            </span>
          </div>
        </div>
      </div>

      {/* Transfer Notification Banner */}
      {transferToastMessage && (
        <div className="bg-th-subtle border-b border-th-border-strong px-4 sm:px-6 lg:px-8 py-3 transition-colors no-print">
          <div className="max-w-[1780px] mx-auto flex items-center justify-between gap-3 text-sm font-bold text-th-text">
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-th-primary text-th-primary-fg text-xs font-bold">
                ✓
              </span>
              <span>{transferToastMessage}</span>
            </div>
            <button
              type="button"
              onClick={() => setTransferToastMessage(null)}
              className="text-th-muted hover:text-th-text p-1 rounded-md cursor-pointer"
              title="Dismiss"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Main Container: Expanded Widescreen Layout utilizing horizontal space cleanly */}
      <div className="flex-1 max-w-[1780px] w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex gap-6 items-start">
          {/* Main Active Workspace */}
          <main className="flex-1 min-w-0 w-full space-y-6">
            {activeTab === 'entry' && (
              <DataEntryForm
                divisions={divisions}
                lineItems={lineItems}
                selectedDivisionId={selectedDivisionId}
                onSelectDivision={setSelectedDivisionId}
                selectedYear={selectedYear}
                onSelectYear={setSelectedYear}
                dataStore={dataStore}
                onSaveBatchAmounts={handleSaveBatchAmounts}
                onDeleteAmount={handleDeleteAmount}
                onDeleteAllDivisionAmounts={handleDeleteAllDivisionAmounts}
                onNavigateToViewFS={() => setActiveTab('divisional')}
                onAddDivisionPrompt={(name) => setPendingAddDivName(name)}
                onAddLineItemPrompt={(name, group) => setPendingAddLineItem({ name, group })}
                onDeleteLineItemPrompt={(item) => setPendingDeleteLineItem(item)}
              />
            )}

            {activeTab === 'divisional' && (
              <DivisionalFSView
                divisions={divisions}
                lineItems={lineItems}
                selectedDivisionId={selectedDivisionId}
                onSelectDivision={setSelectedDivisionId}
                selectedYear={selectedYear}
                onSelectYear={setSelectedYear}
                dataStore={dataStore}
              />
            )}

            {activeTab === 'consolidated' && (
              <ConsolidatedFSView
                divisions={divisions}
                lineItems={lineItems}
                selectedYear={selectedYear}
                onSelectYear={setSelectedYear}
                dataStore={dataStore}
              />
            )}

            {activeTab === 'matrix' && (
              <ConsolidatedMatrixView
                divisions={divisions}
                lineItems={lineItems}
                selectedYear={selectedYear}
                onSelectYear={setSelectedYear}
                dataStore={dataStore}
              />
            )}

            {activeTab === 'options' && (
              <OptionsView
                initialSubTab={optionsSubTab}
                divisions={divisions}
                onAddDivision={handleAddDivision}
                onDeleteDivision={handleDeleteDivision}
                onResetDivisions={handleResetDivisionsToDefault}
                lineItems={lineItems}
                onAddLineItem={handleAddLineItem}
                onDeleteLineItem={handleDeleteLineItem}
                onResetLineItems={handleResetLineItemsToDefault}
                selectedYear={selectedYear}
                onSelectYear={setSelectedYear}
                dataStore={dataStore}
                onSaveAmount={handleSaveAmount}
                onResetBenchmark={handleResetBenchmark}
                onTransferDivisionData={handleTransferDivisionData}
              />
            )}
          </main>

          {/* Dedicated Accounting Checks & Audit Console (Slide-over or Dockable Side-by-Side) */}
          <AccountingAuditDrawer
            isOpen={isAuditOpen}
            onToggle={() => setIsAuditOpen((prev) => !prev)}
            isPinned={isAuditPinned}
            onTogglePin={() => setIsAuditPinned((prev) => !prev)}
            totalAssets={liveChecksReport.totalAssets}
            totalCurrentAssets={liveChecksReport.totalCurrentAssets}
            totalNonCurrentAssets={liveChecksReport.totalNonCurrentAssets}
            totalLiabilities={liveChecksReport.totalLiabilities}
            totalCurrentLiabilities={liveChecksReport.totalCurrentLiabilities}
            totalNonCurrentLiabilities={liveChecksReport.totalNonCurrentLiabilities}
            totalEquity={liveChecksReport.totalEquity}
            selectedYear={selectedYear}
            divisionName={currentEntityName}
          />
        </div>
      </div>

      {/* Footer (No-Print) */}
      <footer className="bg-th-surface border-t border-th-border py-6 text-sm text-th-muted no-print mt-auto transition-colors">
        <div className="max-w-[1780px] mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="font-medium">
            Department of Education · Region VI Western Visayas · Financial Statement Management
          </div>
          <div className="flex items-center gap-4 font-medium">
            <span>All Funds Statement of Financial Position</span>
            <span>·</span>
            <span>COA GAM Framework</span>
          </div>
        </div>
      </footer>

      {/* Global Confirmation Prompt for Reloading Benchmark */}
      <ConfirmModal
        isOpen={isResetBenchmarkModalOpen}
        title="Reload Benchmark Data?"
        message="Are you sure you want to restore the official benchmark figures from the attached Final Statement of Financial Position PDF? This will reset the baseline figures for 2025 and 2024."
        confirmLabel="Yes, Reload Benchmark"
        cancelLabel="Cancel"
        variant="warning"
        onConfirm={handleResetBenchmark}
        onCancel={() => setIsResetBenchmarkModalOpen(false)}
      />

      {/* Prompt for Adding Division */}
      <ConfirmModal
        isOpen={pendingAddDivName !== null}
        title="Add Division Confirmation"
        message={`Are you sure you want to add "${pendingAddDivName}" to the division list?`}
        confirmLabel="Yes, Add Division"
        cancelLabel="Cancel"
        variant="primary"
        onConfirm={() => {
          if (pendingAddDivName) {
            handleAddDivision(pendingAddDivName);
            setPendingAddDivName(null);
          }
        }}
        onCancel={() => setPendingAddDivName(null)}
      />

      {/* Prompt for Adding Line Item */}
      <ConfirmModal
        isOpen={pendingAddLineItem !== null}
        title="Add Line Item Confirmation"
        message={`Are you sure you want to add the line item "${pendingAddLineItem?.name}" under "${pendingAddLineItem?.group}"?`}
        confirmLabel="Yes, Add Line Item"
        cancelLabel="Cancel"
        variant="primary"
        onConfirm={() => {
          if (pendingAddLineItem) {
            handleAddLineItem({
              name: pendingAddLineItem.name,
              section: 'ASSETS',
              subsection: 'Current Assets',
              group: pendingAddLineItem.group,
              isCustom: true,
            });
            setPendingAddLineItem(null);
          }
        }}
        onCancel={() => setPendingAddLineItem(null)}
      />

      {/* Prompt for Deleting Line Item Choice */}
      <ConfirmModal
        isOpen={pendingDeleteLineItem !== null}
        title="Remove Line Item Confirmation"
        message={`Are you sure you want to remove "${pendingDeleteLineItem?.name}" from the line items choices?`}
        confirmLabel="Yes, Remove Line Item"
        cancelLabel="Cancel"
        variant="danger"
        onConfirm={() => {
          if (pendingDeleteLineItem) {
            handleDeleteLineItem(pendingDeleteLineItem.id);
            setPendingDeleteLineItem(null);
          }
        }}
        onCancel={() => setPendingDeleteLineItem(null)}
      />
    </div>
  );
}
