/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Division,
  LineItemDefinition,
  FinancialDataStore,
  DivisionAggregationRecord,
  AggregationMetadataStore,
} from './types/fs';
import { INITIAL_DIVISIONS } from './data/defaultDivisions';
import {
  DEFAULT_LINE_ITEMS,
  DEFAULT_PERFORMANCE_LINE_ITEMS,
  DEFAULT_CASH_FLOWS_LINE_ITEMS,
  DEFAULT_NET_ASSETS_LINE_ITEMS,
  AGGREGATED_ACCUMULATED_DEPRECIATION_ITEM,
} from './data/defaultLineItems';
import { BENCHMARK_FINANCIAL_DATA } from './data/benchmarkData';
import { calculateReport } from './utils/calculations';
import { calculateCashFlowsSummary } from './utils/cashFlowCalculations';
import { calculateNetAssetsSummary } from './utils/netAssetsCalculations';
import { YEAR_RANGE, getComparativeYear, getDefaultFiscalYear } from './utils/yearUtils';
import { Navbar, ActiveTab } from './components/Navbar';
import { AccountingAuditDrawer, CrossStatementAuditSummary } from './components/AccountingAuditDrawer';
import { FinancialStatementType } from './components/FinancialStatementSidebar';
import { DataEntryForm } from './components/DataEntryForm';
import { DivisionalFSView } from './components/DivisionalFSView';
import { ConsolidatedFSView } from './components/ConsolidatedFSView';
import { ConsolidatedMatrixView } from './components/ConsolidatedMatrixView';
import { OptionsView, OptionsSubTab } from './components/OptionsView';
import { ConfirmModal } from './components/ConfirmModal';
import {
  useTheme,
  SECOND_NAV_MIN_HEIGHT,
  SECOND_NAV_MAX_HEIGHT,
} from './context/ThemeContext';
import { X, ChevronLeft, ChevronRight, CheckCircle2 } from 'lucide-react';

const LOCAL_STORAGE_KEY_DATA = 'deped_ro6_fs_data_v1';
const LOCAL_STORAGE_KEY_DIVISIONS = 'deped_ro6_divisions_v1';
const LOCAL_STORAGE_KEY_LINE_ITEMS = 'deped_ro6_line_items_v1';
const LOCAL_STORAGE_KEY_ILOILO_MIGRATED = 'deped_ro6_transferred_iloilo_2024_v1';
const LOCAL_STORAGE_KEY_SEMI_EXP_MIGRATED = 'deped_ro6_semi_exp_inventory_consumption_v1';
const LOCAL_STORAGE_KEY_PERF_LINE_ITEMS_V2 = 'deped_ro6_perf_line_items_hierarchy_v2';
const LOCAL_STORAGE_KEY_CASH_FLOWS_LINE_ITEMS_V2 = 'deped_ro6_cash_flows_line_items_v2';
const LOCAL_STORAGE_KEY_SELECTED_DIVISION = 'deped_ro6_selected_division_v1';
const LOCAL_STORAGE_KEY_SELECTED_YEAR = 'deped_ro6_selected_year_v1';
const LOCAL_STORAGE_KEY_AGGREGATION_METADATA = 'deped_ro6_aggregation_metadata_v1';
const SESSION_STORAGE_KEY_YEAR = 'deped_ro6_selected_year_session_v1';
const SESSION_STORAGE_KEY_STATEMENT = 'deped_ro6_selected_statement_session_v1';

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('entry');
  const [selectedStatement, setSelectedStatement] = useState<FinancialStatementType>(() => {
    try {
      const saved = sessionStorage.getItem(SESSION_STORAGE_KEY_STATEMENT);
      if (
        saved === 'position' ||
        saved === 'performance' ||
        saved === 'cash_flows' ||
        saved === 'net_assets'
      ) {
        return saved;
      }
    } catch {
      // fallback
    }
    return 'position';
  });
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
        const cleaned = parsed.filter((d) => validIds.has(d.id) || !d.isDefault);
        return cleaned.length > 0 ? cleaned : INITIAL_DIVISIONS;
      }
    } catch {
      // fallback
    }
    return INITIAL_DIVISIONS;
  });

  // Selected Division: Restore last cached Office across refreshes and browser restarts
  const [selectedDivisionId, setSelectedDivisionId] = useState<string>(() => {
    try {
      const saved = localStorage.getItem(LOCAL_STORAGE_KEY_SELECTED_DIVISION);
      if (saved && divisions.some((d) => d.id === saved)) {
        return saved;
      }
    } catch {
      // fallback
    }
    const hasIloiloCity = divisions.some((d) => d.id === 'iloilo-city-div');
    return hasIloiloCity ? 'iloilo-city-div' : (divisions[0]?.id || 'ro-vi');
  });

  // Selected Fiscal Year: Restore last cached Fiscal Year across refreshes and browser restarts
  const [selectedYear, setSelectedYear] = useState<string>(() => {
    try {
      const savedLocal = localStorage.getItem(LOCAL_STORAGE_KEY_SELECTED_YEAR);
      if (savedLocal && YEAR_RANGE.includes(savedLocal)) {
        return savedLocal;
      }
      const savedSession = sessionStorage.getItem(SESSION_STORAGE_KEY_YEAR);
      if (savedSession && YEAR_RANGE.includes(savedSession)) {
        return savedSession;
      }
    } catch {
      // fallback
    }
    return getDefaultFiscalYear();
  });

  // Line Items State
  const [lineItems, setLineItems] = useState<LineItemDefinition[]>(() => {
    try {
      const saved = localStorage.getItem(LOCAL_STORAGE_KEY_LINE_ITEMS);
      if (saved) {
        let parsed: LineItemDefinition[] = JSON.parse(saved);

        // One-time migration: Move all Current Assets -> Inventories Semi-Expendable items
        // under "Inventory Held for Consumption" and add "Semi-Expendable Machinery and Equipment"
        if (localStorage.getItem(LOCAL_STORAGE_KEY_SEMI_EXP_MIGRATED) !== 'true') {
          parsed = parsed.map((item) => {
            const isSemiExpInventory =
              (item.statementType || 'position') === 'position' &&
              item.subsection === 'Current Assets' &&
              item.group === 'Inventories' &&
              (item.id.startsWith('semi_exp_') ||
                item.name.toLowerCase().startsWith('semi-expendable') ||
                item.subgroup === 'Semi-Expendable Machinery and Equipment' ||
                item.subgroup === 'Semi-Expendable Furniture, Fixtures & Books');
            return isSemiExpInventory
              ? { ...item, subgroup: 'Inventory Held for Consumption' }
              : item;
          });

          const newSemiExpItem = DEFAULT_LINE_ITEMS.find((i) => i.id === 'semi_exp_machinery_equip');
          if (newSemiExpItem && !parsed.some((i) => i.id === newSemiExpItem.id)) {
            const insertIdx = parsed.findIndex(
              (i) => i.id === 'semi_exp_office_equip' || i.subgroup === 'Inventory Held for Consumption' && i.id.startsWith('semi_exp_')
            );
            if (insertIdx >= 0) {
              parsed = [
                ...parsed.slice(0, insertIdx),
                newSemiExpItem,
                ...parsed.slice(insertIdx),
              ];
            } else {
              const afterSuppliesIdx = parsed.findIndex((i) => i.id === 'other_supplies_materials_inv');
              if (afterSuppliesIdx >= 0) {
                parsed = [
                  ...parsed.slice(0, afterSuppliesIdx + 1),
                  newSemiExpItem,
                  ...parsed.slice(afterSuppliesIdx + 1),
                ];
              } else {
                parsed = [...parsed, newSemiExpItem];
              }
            }
          }

          try {
            localStorage.setItem(LOCAL_STORAGE_KEY_SEMI_EXP_MIGRATED, 'true');
          } catch {
            // ignore storage write error
          }
        }

        if (!parsed.some((i) => i.id === AGGREGATED_ACCUMULATED_DEPRECIATION_ITEM.id)) {
          let lastPpeIdx = -1;
          parsed.forEach((item, idx) => {
            if (
              (item.statementType || 'position') === 'position' &&
              item.group === 'Property, Plant and Equipment'
            ) {
              lastPpeIdx = idx;
            }
          });
          if (lastPpeIdx >= 0) {
            parsed = [
              ...parsed.slice(0, lastPpeIdx + 1),
              AGGREGATED_ACCUMULATED_DEPRECIATION_ITEM,
              ...parsed.slice(lastPpeIdx + 1),
            ];
          } else {
            parsed = [...parsed, AGGREGATED_ACCUMULATED_DEPRECIATION_ITEM];
          }
        }

        if (localStorage.getItem(LOCAL_STORAGE_KEY_PERF_LINE_ITEMS_V2) !== 'true') {
          const nonPerfOrCustomPerf = parsed.filter(
            (i) => i.statementType !== 'performance' || i.isCustom === true
          );
          parsed = [...nonPerfOrCustomPerf, ...DEFAULT_PERFORMANCE_LINE_ITEMS];
          try {
            localStorage.setItem(LOCAL_STORAGE_KEY_PERF_LINE_ITEMS_V2, 'true');
          } catch {
            // ignore storage write error
          }
        }

        if (localStorage.getItem(LOCAL_STORAGE_KEY_CASH_FLOWS_LINE_ITEMS_V2) !== 'true') {
          const nonCashFlowsOrCustom = parsed.filter(
            (i) => i.statementType !== 'cash_flows' || i.isCustom === true
          );
          parsed = [...nonCashFlowsOrCustom, ...DEFAULT_CASH_FLOWS_LINE_ITEMS];
          try {
            localStorage.setItem(LOCAL_STORAGE_KEY_CASH_FLOWS_LINE_ITEMS_V2, 'true');
          } catch {
            // ignore storage write error
          }
        }

        const existingIds = new Set(parsed.map((i) => i.id));
        const missingPerf = DEFAULT_PERFORMANCE_LINE_ITEMS.filter((i) => !existingIds.has(i.id));
        const missingCashFlows = DEFAULT_CASH_FLOWS_LINE_ITEMS.filter((i) => !existingIds.has(i.id));
        const missingNetAssets = DEFAULT_NET_ASSETS_LINE_ITEMS.filter((i) => !existingIds.has(i.id));

        if (missingCashFlows.length > 0) {
          const next = [...parsed];
          missingCashFlows.forEach((item) => {
            const insertAt = next.findIndex(
              (existing) => existing.statementType === 'cash_flows' && existing.order > item.order
            );
            if (insertAt >= 0) {
              next.splice(insertAt, 0, item);
            } else {
              next.push(item);
            }
          });
          parsed = next;
        }

        const missing = [...missingPerf, ...missingNetAssets];
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

  // Persisted Aggregation Metadata Store (for aggregated umbrella accounts per division & fiscal year)
  const [aggregationStore, setAggregationStore] = useState<AggregationMetadataStore>(() => {
    try {
      const saved = localStorage.getItem(LOCAL_STORAGE_KEY_AGGREGATION_METADATA);
      if (saved) {
        const parsed = JSON.parse(saved);
        return typeof parsed === 'object' && parsed !== null ? parsed : {};
      }
    } catch {
      // fallback
    }
    return {};
  });

  // Transfer notification toast state
  const [transferToastMessage, setTransferToastMessage] = useState<string | null>(null);

  // Global Confirmation Modals for Cross-Component Prompting
  const [isResetBenchmarkModalOpen, setIsResetBenchmarkModalOpen] = useState(false);
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

  useEffect(() => {
    try {
      localStorage.setItem(
        LOCAL_STORAGE_KEY_AGGREGATION_METADATA,
        JSON.stringify(aggregationStore)
      );
    } catch (e) {
      console.error(e);
    }
  }, [aggregationStore]);

  useEffect(() => {
    if (divisions.length > 0 && !divisions.some((d) => d.id === selectedDivisionId)) {
      setSelectedDivisionId(divisions[0].id);
      return;
    }
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY_SELECTED_DIVISION, selectedDivisionId);
    } catch (e) {
      console.error(e);
    }
  }, [selectedDivisionId, divisions]);

  useEffect(() => {
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY_SELECTED_YEAR, selectedYear);
      sessionStorage.setItem(SESSION_STORAGE_KEY_YEAR, selectedYear);
    } catch (e) {
      console.error(e);
    }
  }, [selectedYear]);

  useEffect(() => {
    try {
      sessionStorage.setItem(SESSION_STORAGE_KEY_STATEMENT, selectedStatement);
    } catch {
      // ignore storage write error
    }
  }, [selectedStatement]);

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
    entries: { lineItemId: string; amount: number }[],
    aggregationRecords?: DivisionAggregationRecord[]
  ) => {
    const batchTotals = new Map<string, number>();
    entries.forEach(({ lineItemId, amount }) => {
      batchTotals.set(
        lineItemId,
        Math.round(((batchTotals.get(lineItemId) ?? 0) + amount) * 10000) / 10000
      );
    });

    setDataStore((prev) => {
      const yearCopy = { ...(prev[year] || {}) };
      const divCopy = { ...(yearCopy[divisionId] || {}) };
      batchTotals.forEach((totalAmount, lineItemId) => {
        divCopy[lineItemId] = totalAmount;
      });
      yearCopy[divisionId] = divCopy;
      return {
        ...prev,
        [year]: yearCopy,
      };
    });

    setAggregationStore((prev) => {
      const yearCopy = { ...(prev[year] || {}) };
      const divCopy = { ...(yearCopy[divisionId] || {}) };
      let changed = false;

      const recordsById = new Map<string, DivisionAggregationRecord>();
      (aggregationRecords || []).forEach((rec) => {
        recordsById.set(rec.lineItemId, rec);
      });

      recordsById.forEach((rec, id) => {
        divCopy[id] = rec;
        changed = true;
      });

      batchTotals.forEach((totalAmount, lineItemId) => {
        if (recordsById.has(lineItemId)) return;
        const existingRec = divCopy[lineItemId];
        if (existingRec && (Math.abs(totalAmount) < 0.005 || Math.abs(existingRec.totalAmount - totalAmount) >= 0.01)) {
          delete divCopy[lineItemId];
          changed = true;
        }
      });

      if (!changed) return prev;
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

    setAggregationStore((prev) => {
      if (!prev[year]?.[divisionId]?.[lineItemId]) return prev;
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

    setAggregationStore((prev) => {
      if (!prev[year]?.[divisionId]) return prev;
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
      isDefault: false,
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

  const handleUpdateLineItem = (
    id: string,
    updates: Omit<LineItemDefinition, 'id' | 'order'>
  ) => {
    setLineItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...updates } : item))
    );
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

    setAggregationStore((prev) => {
      const fromEntries = prev[fromYear]?.[fromDivId];
      if (!fromEntries && mode !== 'move') return prev;
      const toYearCopy = { ...(prev[toYear] || {}) };
      const toDivCopy = { ...(toYearCopy[toDivId] || {}) };
      if (fromEntries) {
        toYearCopy[toDivId] = {
          ...toDivCopy,
          ...fromEntries,
        };
      }
      let nextStore: AggregationMetadataStore = {
        ...prev,
        [toYear]: toYearCopy,
      };
      if (mode === 'move' && prev[fromYear]?.[fromDivId]) {
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

  const crossStatementAudit: CrossStatementAuditSummary = useMemo(() => {
    const perfItems = lineItems.filter((i) => (i.statementType || 'position') === 'performance');
    const sumPerfNet = (items: LineItemDefinition[]) =>
      items.reduce((sum, item) => {
        const v = liveChecksReport.values[item.id] || 0;
        return sum + (item.isContra ? -v : v);
      }, 0);
    const revItems = perfItems.filter((i) => i.section === 'REVENUE');
    const expItems = perfItems.filter((i) => i.section === 'EXPENSES');
    const trItems = perfItems.filter((i) => i.section === 'TRANSFERS');
    const trFromItems = trItems.filter((i) => !i.group.startsWith('Less:'));
    const trToItems = trItems.filter((i) => i.group.startsWith('Less:'));
    const nonOpItems = perfItems.filter((i) => i.section === 'NON_OPERATING');
    const lossItems = perfItems.filter((i) => i.section === 'LOSSES');

    const perfTotalRevenue = sumPerfNet(revItems);
    const perfTotalExpenses = sumPerfNet(expItems);
    const netTransfers = sumPerfNet(trFromItems) - sumPerfNet(trToItems);
    const netNonOp = sumPerfNet(nonOpItems);
    const totalLosses = lossItems.reduce(
      (sum, item) => sum + Math.abs(liveChecksReport.values[item.id] || 0),
      0
    );
    const perfNetSurplusDeficit =
      perfTotalRevenue - perfTotalExpenses + netTransfers + netNonOp - totalLosses;

    const cfSummary = calculateCashFlowsSummary(lineItems, dataStore, selectedYear, activeDivForChecks);
    const naSummary = calculateNetAssetsSummary(dataStore, selectedYear, activeDivForChecks);
    const sfpCashAndCashEquivalents =
      liveChecksReport.groupTotals['Current Assets__Cash and Cash Equivalents'] || 0;

    return {
      sfpCashAndCashEquivalents,
      perfTotalRevenue,
      perfTotalExpenses,
      perfNetSurplusDeficit,
      cfNetOperating: cfSummary.netOperating,
      cfNetInvesting: cfSummary.netInvesting,
      cfNetFinancing: cfSummary.netFinancing,
      cfNetIncreaseDecrease: cfSummary.netIncreaseDecrease,
      cfBeginningCash: cfSummary.january1Cash,
      cfEndingCash: cfSummary.december31Cash,
      cfHasData:
        Math.abs(cfSummary.netOperating) >= 0.005 ||
        Math.abs(cfSummary.netInvesting) >= 0.005 ||
        Math.abs(cfSummary.netFinancing) >= 0.005 ||
        Math.abs(cfSummary.netIncreaseDecrease) >= 0.005 ||
        Math.abs(cfSummary.january1Cash) >= 0.005 ||
        Math.abs(cfSummary.december31Cash) >= 0.005,
      naBeginningBalance: naSummary.january1Balance,
      naRestatedBalance: naSummary.restatedBalance,
      naSurplusForPeriod: naSummary.surplusDeficitForPeriod,
      naEndingBalance: naSummary.december31Balance,
      naHasData:
        Math.abs(naSummary.january1Balance) >= 0.005 ||
        Math.abs(naSummary.restatedBalance) >= 0.005 ||
        Math.abs(naSummary.surplusDeficitForPeriod) >= 0.005 ||
        Math.abs(naSummary.totalCalendarYearChanges) >= 0.005 ||
        Math.abs(naSummary.december31Balance) >= 0.005,
    };
  }, [lineItems, dataStore, selectedYear, activeDivForChecks, liveChecksReport]);

  const liabilitiesPlusEquity = liveChecksReport.totalLiabilities + liveChecksReport.totalEquity;
  const isBalanced = Math.abs(liveChecksReport.totalAssets - liabilitiesPlusEquity) < 0.01;

  const currentDivisionIndex = divisions.findIndex((d) => d.id === selectedDivisionId);
  const hasPrevDivision = currentDivisionIndex > 0;
  const hasNextDivision = currentDivisionIndex >= 0 && currentDivisionIndex < divisions.length - 1;

  const { secondNavHeight, setSecondNavHeight, resetSecondNavHeight } = useTheme();
  const [isResizingSecondNav, setIsResizingSecondNav] = useState(false);
  const secondNavRef = useRef<HTMLDivElement>(null);

  const handleStartResizeSecondNav = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const startY = e.clientY;
    const startHeight =
      secondNavRef.current?.getBoundingClientRect().height || secondNavHeight;
    setIsResizingSecondNav(true);

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const deltaY = moveEvent.clientY - startY;
      setSecondNavHeight(startHeight + deltaY);
    };

    const handlePointerUp = () => {
      setIsResizingSecondNav(false);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  };

  const isSecondNavCompact = secondNavHeight <= 54;
  const navControlHeightClass = isSecondNavCompact ? 'min-h-[34px] py-1' : 'min-h-[42px] py-2';
  const navIconButtonClass = isSecondNavCompact ? 'min-w-[34px] min-h-[34px]' : 'min-w-[42px] min-h-[42px]';

  return (
    <div className="min-h-screen bg-th-canvas text-th-text flex flex-col antialiased transition-colors">
      {/* Unified Sticky Dual Navigation Bars (Main Navbar + Contextual Institutional Ribbon) */}
      <div className="sticky top-0 z-40 no-print shadow-md">
        <Navbar
          activeTab={activeTab}
          onTabChange={(tab) => setActiveTab(tab)}
          onPrint={() => window.print()}
          isAuditOpen={isAuditOpen}
          onToggleAudit={() => setIsAuditOpen((prev) => !prev)}
          isBalanced={isBalanced}
        />

        {/* Contextual Institutional Ribbon (Frozen + Vertically Adjustable Height) */}
        <div
          ref={secondNavRef}
          style={{ minHeight: `${secondNavHeight}px` }}
          className={`relative group bg-th-surface border-b border-th-border text-sm sm:text-base text-th-muted px-4 sm:px-6 lg:px-8 flex items-center transition-colors ${
            isSecondNavCompact ? 'py-1.5' : 'py-2.5'
          }`}
        >
          <div className="max-w-[1780px] w-full mx-auto flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="font-bold text-th-muted">Office:</span>
              {activeTab === 'consolidated' || activeTab === 'matrix' ? (
                <span
                  className={`font-bold text-th-text bg-th-subtle px-3.5 rounded-xl border border-th-border flex items-center ${navControlHeightClass}`}
                >
                  {currentEntityName}
                </span>
              ) : (
                <div className="inline-flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      if (hasPrevDivision) {
                        setSelectedDivisionId(divisions[currentDivisionIndex - 1].id);
                      }
                    }}
                    disabled={!hasPrevDivision}
                    className={`${navIconButtonClass} flex items-center justify-center rounded-xl bg-th-subtle hover:bg-th-subtle-hover disabled:opacity-40 disabled:cursor-not-allowed border-2 border-th-border-strong text-th-text transition-colors cursor-pointer shrink-0`}
                    title="Previous Division"
                    aria-label="Previous Division"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <select
                    value={selectedDivisionId}
                    onChange={(e) => setSelectedDivisionId(e.target.value)}
                    aria-label="Reporting Office / Schools Division"
                    className={`${navControlHeightClass} font-bold text-th-text bg-th-subtle hover:bg-th-subtle-hover px-3.5 rounded-xl border-2 border-th-border-strong focus:outline-hidden focus:ring-2 focus:ring-th-accent focus:border-th-accent cursor-pointer transition-colors`}
                  >
                    {divisions.map((div) => (
                      <option key={div.id} value={div.id}>
                        {div.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => {
                      if (hasNextDivision) {
                        setSelectedDivisionId(divisions[currentDivisionIndex + 1].id);
                      }
                    }}
                    disabled={!hasNextDivision}
                    className={`${navIconButtonClass} flex items-center justify-center rounded-xl bg-th-subtle hover:bg-th-subtle-hover disabled:opacity-40 disabled:cursor-not-allowed border-2 border-th-border-strong text-th-text transition-colors cursor-pointer shrink-0`}
                    title="Next Division"
                    aria-label="Next Division"
                  >
                    <ChevronRight className="w-5 h-5" />
                  </button>
                </div>
              )}

              <span className="text-th-muted" aria-hidden="true">·</span>

              <span className="font-bold text-th-muted">Fiscal Year:</span>
              <div className="inline-flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    const prevYr = String(Number(selectedYear) - 1);
                    if (YEAR_RANGE.includes(prevYr)) setSelectedYear(prevYr);
                  }}
                  disabled={!YEAR_RANGE.includes(String(Number(selectedYear) - 1))}
                  className={`${navIconButtonClass} flex items-center justify-center rounded-xl bg-th-subtle hover:bg-th-subtle-hover disabled:opacity-40 disabled:cursor-not-allowed border-2 border-th-border-strong text-th-text transition-colors cursor-pointer`}
                  title="Previous Fiscal Year"
                  aria-label="Previous Fiscal Year"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <select
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(e.target.value)}
                  aria-label="Fiscal Year"
                  className={`${navControlHeightClass} font-bold text-th-text bg-th-subtle hover:bg-th-subtle-hover px-3.5 rounded-xl border-2 border-th-border-strong focus:outline-hidden focus:ring-2 focus:ring-th-accent focus:border-th-accent cursor-pointer transition-colors`}
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
                    if (YEAR_RANGE.includes(nextYr)) setSelectedYear(nextYr);
                  }}
                  disabled={!YEAR_RANGE.includes(String(Number(selectedYear) + 1))}
                  className={`${navIconButtonClass} flex items-center justify-center rounded-xl bg-th-subtle hover:bg-th-subtle-hover disabled:opacity-40 disabled:cursor-not-allowed border-2 border-th-border-strong text-th-text transition-colors cursor-pointer`}
                  title="Next Fiscal Year"
                  aria-label="Next Fiscal Year"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>
              <span className="text-sm font-mono font-semibold text-th-muted">
                Prior: FY {getComparativeYear(selectedYear)}
              </span>
            </div>

            <div className="flex items-center gap-3 flex-wrap">
              <button
                type="button"
                onClick={() => setIsAuditOpen((prev) => !prev)}
                className={`inline-flex items-center gap-1.5 font-bold px-3.5 rounded-xl text-sm border-2 whitespace-nowrap shrink-0 cursor-pointer transition-colors ${navControlHeightClass} ${
                  isBalanced
                    ? 'bg-th-subtle hover:bg-th-subtle-hover text-th-text border-th-border-strong'
                    : 'bg-amber-100 hover:bg-amber-200 dark:bg-amber-950/80 dark:hover:bg-amber-900/80 text-amber-900 dark:text-amber-200 border-amber-400 dark:border-amber-800'
                }`}
                title="Click to inspect Balance Sheet & Cross-Statement Checks"
              >
                {isBalanced ? 'Balanced (A = L + E)' : 'Balance Variance'}
              </button>
            </div>
          </div>

          {/* Bottom-edge Drag Handle to Adjust Second Nav Height */}
          <div
            role="separator"
            aria-orientation="horizontal"
            aria-label="Drag to adjust second navigation bar height"
            aria-valuemin={SECOND_NAV_MIN_HEIGHT}
            aria-valuemax={SECOND_NAV_MAX_HEIGHT}
            aria-valuenow={secondNavHeight}
            tabIndex={0}
            onPointerDown={handleStartResizeSecondNav}
            onDoubleClick={resetSecondNavHeight}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setSecondNavHeight(secondNavHeight + 4);
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setSecondNavHeight(secondNavHeight - 4);
              } else if (e.key === 'Home') {
                e.preventDefault();
                resetSecondNavHeight();
              }
            }}
            title="Drag up/down to adjust bar height (double-click to reset)"
            className="absolute bottom-0 inset-x-0 h-2.5 cursor-ns-resize flex items-center justify-center touch-none select-none focus:outline-hidden group/resize"
          >
            <span
              className={`h-1 w-12 rounded-full transition-all ${
                isResizingSecondNav
                  ? 'bg-th-accent w-16 opacity-100'
                  : 'bg-th-border-strong/70 opacity-0 group-hover:opacity-100 group-hover/resize:bg-th-accent group-focus-visible/resize:opacity-100 group-focus-visible/resize:bg-th-accent'
              }`}
            />
            {isResizingSecondNav && (
              <span className="ml-2 px-1.5 py-0.5 rounded bg-th-primary text-th-primary-fg text-[10px] font-mono font-bold shadow-xs">
                {secondNavHeight}px
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Transfer Notification Banner */}
      {transferToastMessage && (
        <div className="bg-th-subtle border-b border-th-border-strong px-4 sm:px-6 lg:px-8 py-3 transition-colors no-print">
          <div className="max-w-[1780px] mx-auto flex items-center justify-between gap-3 text-sm font-bold text-th-text">
            <div className="flex items-center gap-2.5 flex-wrap">
              <CheckCircle2 className="w-5 h-5 text-emerald-700 dark:text-emerald-400 shrink-0" />
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
                selectedYear={selectedYear}
                dataStore={dataStore}
                aggregationStore={aggregationStore}
                onSaveBatchAmounts={handleSaveBatchAmounts}
                onDeleteAmount={handleDeleteAmount}
                onDeleteAllDivisionAmounts={handleDeleteAllDivisionAmounts}
                onNavigateToViewFS={() => setActiveTab('divisional')}
                onAddLineItemPrompt={(name, group) => setPendingAddLineItem({ name, group })}
                onDeleteLineItemPrompt={(item) => setPendingDeleteLineItem(item)}
                selectedStatement={selectedStatement}
                onSelectStatement={setSelectedStatement}
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
                aggregationStore={aggregationStore}
                onSaveAmount={handleSaveAmount}
                selectedStatement={selectedStatement}
                onSelectStatement={setSelectedStatement}
              />
            )}

            {activeTab === 'consolidated' && (
              <ConsolidatedFSView
                divisions={divisions}
                lineItems={lineItems}
                selectedYear={selectedYear}
                onSelectYear={setSelectedYear}
                dataStore={dataStore}
                selectedStatement={selectedStatement}
                onSelectStatement={setSelectedStatement}
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
                onUpdateLineItem={handleUpdateLineItem}
                onDeleteLineItem={handleDeleteLineItem}
                onResetLineItems={handleResetLineItemsToDefault}
                selectedYear={selectedYear}
                onSelectYear={setSelectedYear}
                dataStore={dataStore}
                onSaveAmount={handleSaveAmount}
                onResetBenchmark={handleResetBenchmark}
                onTransferDivisionData={handleTransferDivisionData}
                selectedStatement={selectedStatement}
                onSelectStatement={setSelectedStatement}
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
            crossStatementAudit={crossStatementAudit}
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
