import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FinancialDataStore, LineItemDefinition } from '../types/fs';
import { FinancialStatementType } from '../components/FinancialStatementSidebar';
import { calculateReport, CalculatedReport } from '../utils/calculations';
import { calculateCashFlowsSummary, CashFlowsSummary } from '../utils/cashFlowCalculations';
import { calculateNetAssetsSummary } from '../utils/netAssetsCalculations';
import { formatAccounting } from '../utils/formatters';
import { getComparativeYear } from '../utils/yearUtils';
import { AGGREGATED_ACCUMULATED_DEPRECIATION_ID } from '../data/defaultLineItems';
import { TipsButton } from '../components/TipsButton';
import {
  Eye,
  EyeOff,
  PanelRightClose,
  PanelRight,
  CheckCircle2,
  AlertTriangle,
  FileSpreadsheet,
  AppWindow,
  GripVertical,
  GripHorizontal,
  Minus,
  Maximize2,
  Minimize2,
  ZoomIn,
  ZoomOut,
  X,
} from 'lucide-react';

export type LiveEditWindowMode = 'docked' | 'floating';

export interface LiveEditStatementContentProps {
  divisionId: string;
  divisionName: string;
  selectedYear: string;
  selectedStatement: FinancialStatementType;
  lineItems: LineItemDefinition[];
  liveDataStore: FinancialDataStore;
  modifiedItemIds: Set<string>;
  hideZeroRows: boolean;
  isCondensed: boolean;
  fontSizePx?: number;
}

interface LiveEditStatementPanelProps {
  divisionId: string;
  divisionName: string;
  selectedYear: string;
  selectedStatement: FinancialStatementType;
  lineItems: LineItemDefinition[];
  liveDataStore: FinancialDataStore;
  modifiedItemIds: Set<string>;
  pendingCount: number;
  windowMode: LiveEditWindowMode;
  onWindowModeChange: (mode: LiveEditWindowMode) => void;
  onClose: () => void;
}

const STORAGE_KEY_SIDE_WIDTH = 'deped_ro6_live_edit_side_width_v1';
const STORAGE_KEY_STACKED_HEIGHT = 'deped_ro6_live_edit_stacked_height_v1';
const STORAGE_KEY_FLOATING_RECT = 'deped_ro6_live_edit_floating_rect_v1';
const STORAGE_KEY_FONT_SIZE = 'deped_ro6_live_edit_font_size_v1';

const DEFAULT_SIDE_WIDTH = 460;
const MIN_SIDE_WIDTH = 300;
const MAX_SIDE_WIDTH = 920;

const DEFAULT_STACKED_HEIGHT = 460;
const MIN_STACKED_HEIGHT = 240;
const MAX_STACKED_HEIGHT = 900;

interface FloatingRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const MIN_FLOAT_WIDTH = 320;
const MIN_FLOAT_HEIGHT = 280;

const formatFSNum = (val: number): string => {
  if (Math.abs(val) < 0.005) return '-';
  if (val < 0) return `(${formatAccounting(Math.abs(val), false)})`;
  return formatAccounting(val, false);
};

const clamp = (val: number, min: number, max: number) => Math.max(min, Math.min(max, val));

function getDefaultFloatingRect(): FloatingRect {
  if (typeof window === 'undefined') {
    return { x: 80, y: 96, width: 520, height: 600 };
  }
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const width = clamp(Math.round(vw * 0.42), MIN_FLOAT_WIDTH, Math.min(680, vw - 32));
  const height = clamp(Math.round(vh * 0.72), MIN_FLOAT_HEIGHT, vh - 48);
  return {
    x: Math.max(16, vw - width - 24),
    y: Math.max(24, Math.round((vh - height) / 2)),
    width,
    height,
  };
}

function clampFloatingRect(rect: FloatingRect): FloatingRect {
  if (typeof window === 'undefined') return rect;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const maxW = Math.max(MIN_FLOAT_WIDTH, vw - 24);
  const maxH = Math.max(MIN_FLOAT_HEIGHT, vh - 24);
  const width = clamp(rect.width, MIN_FLOAT_WIDTH, maxW);
  const height = clamp(rect.height, MIN_FLOAT_HEIGHT, maxH);
  const x = clamp(rect.x, 8, Math.max(8, vw - width - 8));
  const y = clamp(rect.y, 8, Math.max(8, vh - 52));
  return { x, y, width, height };
}

export const LiveEditStatementBody: React.FC<LiveEditStatementContentProps> = ({
  divisionId,
  divisionName,
  selectedYear,
  selectedStatement,
  lineItems,
  liveDataStore,
  modifiedItemIds,
  hideZeroRows,
  isCondensed,
  fontSizePx = 11,
}) => {
  const priorYear = getComparativeYear(selectedYear);

  const reportCurrent = useMemo(
    () => calculateReport(lineItems, liveDataStore, selectedYear, divisionId),
    [lineItems, liveDataStore, selectedYear, divisionId]
  );

  const reportPrior = useMemo(
    () => calculateReport(lineItems, liveDataStore, priorYear, divisionId),
    [lineItems, liveDataStore, priorYear, divisionId]
  );

  const cashFlowsCurr = useMemo(
    () => calculateCashFlowsSummary(lineItems, liveDataStore, selectedYear, divisionId),
    [lineItems, liveDataStore, selectedYear, divisionId]
  );

  const cashFlowsPrior = useMemo(
    () => calculateCashFlowsSummary(lineItems, liveDataStore, priorYear, divisionId),
    [lineItems, liveDataStore, priorYear, divisionId]
  );

  const netAssetsCurr = useMemo(
    () => calculateNetAssetsSummary(liveDataStore, selectedYear, divisionId),
    [liveDataStore, selectedYear, divisionId]
  );

  const netAssetsPrior = useMemo(
    () => calculateNetAssetsSummary(liveDataStore, priorYear, divisionId),
    [liveDataStore, priorYear, divisionId]
  );

  const statementLineItems = useMemo(
    () => lineItems.filter((item) => (item.statementType || 'position') === selectedStatement),
    [lineItems, selectedStatement]
  );

  const isItemVisible = (item: LineItemDefinition) => {
    if (item.id === AGGREGATED_ACCUMULATED_DEPRECIATION_ID) return false;
    if (modifiedItemIds.has(item.id)) return true;
    const currVal = reportCurrent.values[item.id] || 0;
    const priorVal = reportPrior.values[item.id] || 0;
    if (hideZeroRows && Math.abs(currVal) < 0.005 && Math.abs(priorVal) < 0.005) {
      return false;
    }
    return true;
  };

  const sumItemsNet = (items: LineItemDefinition[], report: CalculatedReport) =>
    items.reduce((sum, item) => {
      const val = report.values[item.id] || 0;
      const effective = item.isContra ? -Math.abs(val) : val;
      return sum + effective;
    }, 0);

  const groupByKey = (
    items: LineItemDefinition[],
    getKey: (item: LineItemDefinition) => string
  ) => {
    const map = new Map<string, LineItemDefinition[]>();
    items.forEach((it) => {
      const key = getKey(it);
      const list = map.get(key) || [];
      list.push(it);
      map.set(key, list);
    });
    return Array.from(map.entries());
  };

  const statementTitle =
    selectedStatement === 'cash_flows'
      ? isCondensed
        ? 'Condensed Statement of Cash Flows'
        : 'Detailed Statement of Cash Flows'
      : selectedStatement === 'performance'
      ? isCondensed
        ? 'Condensed Statement of Financial Performance'
        : 'Statement of Financial Performance'
      : selectedStatement === 'net_assets'
      ? 'Statement of Changes in Net Assets/Equity'
      : isCondensed
      ? 'Statement of Financial Position'
      : 'Detailed Statement of Financial Position';

  const dateLine =
    selectedStatement === 'position'
      ? `As at December 31, ${selectedYear}`
      : `For the Year Ended December 31, ${selectedYear}`;

  const renderPositionTable = () => {
    const posItems = statementLineItems;
    const subsections: Array<{
      key: string;
      header: string;
      totalLabel: string;
    }> = [
      { key: 'Current Assets', header: 'Current Assets', totalLabel: 'Total Current Assets' },
      { key: 'Non-Current Assets', header: 'Non-Current Assets', totalLabel: 'Total Non-Current Assets' },
      { key: 'Current Liabilities', header: 'Current Liabilities', totalLabel: 'Total Current Liabilities' },
      { key: 'Non-Current Liabilities', header: 'Non-Current Liabilities', totalLabel: 'Total Non-Current Liabilities' },
      { key: 'Net Assets/Equity', header: 'Net Assets/Equity', totalLabel: 'Total Net Assets/Equity' },
    ];

    const renderSubsectionRows = (subKey: string) => {
      const subItems = posItems.filter((i) => i.subsection === subKey);
      const groups = groupByKey(subItems, (i) => i.group);

      return groups.map(([groupName, grpItems]) => {
        const visItems = grpItems.filter(isItemVisible);
        const hasModifiedInGroup = grpItems.some((i) => modifiedItemIds.has(i.id));
        if (hideZeroRows && visItems.length === 0 && !hasModifiedInGroup) return null;

        if (isCondensed && subKey !== 'Net Assets/Equity') {
          return (
            <tr
              key={`${subKey}-${groupName}`}
              className={hasModifiedInGroup ? 'bg-amber-100/90 font-semibold' : ''}
            >
              <td className="py-0.5 pl-4 pr-2">
                {groupName}
                {hasModifiedInGroup && (
                  <span className="ml-1.5 font-sans text-[9px] font-bold uppercase text-amber-800">
                    Live
                  </span>
                )}
              </td>
              <td className="py-0.5 px-2 text-right tabular-nums">
                {formatFSNum(sumItemsNet(grpItems, reportCurrent))}
              </td>
              <td className="py-0.5 px-2 text-right tabular-nums">
                {formatFSNum(sumItemsNet(grpItems, reportPrior))}
              </td>
            </tr>
          );
        }

        const subgroups = groupByKey(visItems, (i) => i.subgroup || '__NONE__');

        return (
          <React.Fragment key={`${subKey}-${groupName}`}>
            {subKey !== 'Net Assets/Equity' && (
              <tr>
                <td colSpan={3} className="pt-1.5 pb-0.5 pl-3 font-bold">
                  {groupName}
                </td>
              </tr>
            )}
            {subgroups.map(([sgName, sgItems]) => (
              <React.Fragment key={`${subKey}-${groupName}-${sgName}`}>
                {sgName !== '__NONE__' && sgName !== groupName && subKey !== 'Net Assets/Equity' && (
                  <tr>
                    <td colSpan={3} className="pt-1 pb-0.5 pl-5 font-semibold text-slate-700">
                      {sgName}
                    </td>
                  </tr>
                )}
                {sgItems.map((item) => {
                  const isMod = modifiedItemIds.has(item.id);
                  const rawCurr = reportCurrent.values[item.id] || 0;
                  const rawPrior = reportPrior.values[item.id] || 0;
                  const dispCurr = item.isContra && rawCurr > 0 ? -rawCurr : rawCurr;
                  const dispPrior = item.isContra && rawPrior > 0 ? -rawPrior : rawPrior;
                  return (
                    <tr key={item.id} className={isMod ? 'bg-amber-100/90 font-semibold' : ''}>
                      <td className="py-0.5 pl-7 pr-2">
                        {item.name}
                        {isMod && (
                          <span className="ml-1.5 font-sans text-[9px] font-bold uppercase text-amber-800">
                            Live
                          </span>
                        )}
                      </td>
                      <td className="py-0.5 px-2 text-right tabular-nums">{formatFSNum(dispCurr)}</td>
                      <td className="py-0.5 px-2 text-right tabular-nums">{formatFSNum(dispPrior)}</td>
                    </tr>
                  );
                })}
              </React.Fragment>
            ))}
            {!isCondensed && subKey !== 'Net Assets/Equity' && visItems.length > 0 && (
              <tr>
                <td className="pt-0.5 pb-1 pl-3 font-bold">Total {groupName}</td>
                <td className="pt-0.5 pb-1 px-2 text-right font-bold tabular-nums border-t border-black">
                  {formatFSNum(sumItemsNet(grpItems, reportCurrent))}
                </td>
                <td className="pt-0.5 pb-1 px-2 text-right font-bold tabular-nums border-t border-black">
                  {formatFSNum(sumItemsNet(grpItems, reportPrior))}
                </td>
              </tr>
            )}
          </React.Fragment>
        );
      });
    };

    const renderSectionTotal = (
      label: string,
      currVal: number,
      priorVal: number,
      doubleBottom = false
    ) => (
      <tr>
        <td className={`pt-1 pb-2 pl-2 font-bold ${doubleBottom ? 'uppercase' : ''}`}>{label}</td>
        <td
          className={`pt-1 pb-2 px-2 text-right font-bold tabular-nums border-t border-black ${
            doubleBottom ? 'border-b-4 border-double' : ''
          }`}
        >
          {formatFSNum(currVal)}
        </td>
        <td
          className={`pt-1 pb-2 px-2 text-right font-bold tabular-nums border-t border-black ${
            doubleBottom ? 'border-b-4 border-double' : ''
          }`}
        >
          {formatFSNum(priorVal)}
        </td>
      </tr>
    );

    return (
      <table className="w-full text-left border-collapse">
        <thead>
          <tr>
            <th className="py-1 pr-2 font-bold uppercase w-[56%]">Account Title</th>
            <th className="py-1 px-2 text-right font-bold border-b border-black w-[22%]">
              {selectedYear}
            </th>
            <th className="py-1 px-2 text-right font-bold border-b border-black w-[22%]">
              {priorYear}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td colSpan={3} className="pt-2 pb-0.5 font-bold uppercase">
              ASSETS
            </td>
          </tr>
          <tr>
            <td colSpan={3} className="pt-1 pb-0.5 pl-1 font-bold">
              {subsections[0].header}
            </td>
          </tr>
          {renderSubsectionRows('Current Assets')}
          {renderSectionTotal(
            subsections[0].totalLabel,
            reportCurrent.totalCurrentAssets,
            reportPrior.totalCurrentAssets
          )}

          <tr>
            <td colSpan={3} className="pt-1 pb-0.5 pl-1 font-bold">
              {subsections[1].header}
            </td>
          </tr>
          {renderSubsectionRows('Non-Current Assets')}
          {renderSectionTotal(
            subsections[1].totalLabel,
            reportCurrent.totalNonCurrentAssets,
            reportPrior.totalNonCurrentAssets
          )}
          {renderSectionTotal('TOTAL ASSETS', reportCurrent.totalAssets, reportPrior.totalAssets, true)}

          <tr>
            <td colSpan={3} className="pt-2 pb-0.5 font-bold uppercase">
              LIABILITIES
            </td>
          </tr>
          <tr>
            <td colSpan={3} className="pt-1 pb-0.5 pl-1 font-bold">
              {subsections[2].header}
            </td>
          </tr>
          {renderSubsectionRows('Current Liabilities')}
          {renderSectionTotal(
            subsections[2].totalLabel,
            reportCurrent.totalCurrentLiabilities,
            reportPrior.totalCurrentLiabilities
          )}
          {(reportCurrent.totalNonCurrentLiabilities !== 0 ||
            reportPrior.totalNonCurrentLiabilities !== 0 ||
            !hideZeroRows) && (
            <>
              <tr>
                <td colSpan={3} className="pt-1 pb-0.5 pl-1 font-bold">
                  {subsections[3].header}
                </td>
              </tr>
              {renderSubsectionRows('Non-Current Liabilities')}
              {renderSectionTotal(
                subsections[3].totalLabel,
                reportCurrent.totalNonCurrentLiabilities,
                reportPrior.totalNonCurrentLiabilities
              )}
            </>
          )}
          {renderSectionTotal(
            'TOTAL LIABILITIES',
            reportCurrent.totalLiabilities,
            reportPrior.totalLiabilities
          )}

          <tr>
            <td colSpan={3} className="pt-2 pb-0.5 font-bold uppercase">
              NET ASSETS/EQUITY
            </td>
          </tr>
          {renderSubsectionRows('Net Assets/Equity')}
          {renderSectionTotal(
            'TOTAL NET ASSETS/EQUITY',
            reportCurrent.totalEquity,
            reportPrior.totalEquity
          )}
          {renderSectionTotal(
            'TOTAL LIABILITIES AND NET ASSETS/EQUITY',
            reportCurrent.totalLiabilities + reportCurrent.totalEquity,
            reportPrior.totalLiabilities + reportPrior.totalEquity,
            true
          )}
        </tbody>
      </table>
    );
  };

  const renderPerformanceTable = () => {
    const perfItems = statementLineItems;
    const revItems = perfItems.filter((i) => i.section === 'REVENUE');
    const expItems = perfItems.filter((i) => i.section === 'EXPENSES');
    const trItems = perfItems.filter((i) => i.section === 'TRANSFERS');
    const trFromItems = trItems.filter((i) => !i.group.startsWith('Less:'));
    const trToItems = trItems.filter((i) => i.group.startsWith('Less:'));
    const nonOpItems = perfItems.filter((i) => i.section === 'NON_OPERATING');
    const lossItems = perfItems.filter((i) => i.section === 'LOSSES');

    const getNetSurplus = (r: CalculatedReport) =>
      sumItemsNet(revItems, r) -
      sumItemsNet(expItems, r) +
      (sumItemsNet(trFromItems, r) - sumItemsNet(trToItems, r)) +
      sumItemsNet(nonOpItems, r) -
      lossItems.reduce((s, item) => s + Math.abs(r.values[item.id] || 0), 0);

    const renderGroupList = (items: LineItemDefinition[]) => {
      const groups = groupByKey(items, (i) => i.group);
      return groups.map(([grpName, grpItems]) => {
        const visItems = grpItems.filter(isItemVisible);
        const hasMod = grpItems.some((i) => modifiedItemIds.has(i.id));
        if (hideZeroRows && visItems.length === 0 && !hasMod) return null;

        if (isCondensed) {
          return (
            <tr key={grpName} className={hasMod ? 'bg-amber-100/90 font-semibold' : ''}>
              <td className="py-0.5 pl-4 pr-2">
                {grpName}
                {hasMod && (
                  <span className="ml-1.5 font-sans text-[9px] font-bold uppercase text-amber-800">
                    Live
                  </span>
                )}
              </td>
              <td className="py-0.5 px-2 text-right tabular-nums">
                {formatFSNum(sumItemsNet(grpItems, reportCurrent))}
              </td>
              <td className="py-0.5 px-2 text-right tabular-nums">
                {formatFSNum(sumItemsNet(grpItems, reportPrior))}
              </td>
            </tr>
          );
        }

        return (
          <React.Fragment key={grpName}>
            <tr>
              <td colSpan={3} className="pt-1.5 pb-0.5 pl-3 font-bold">
                {grpName}
              </td>
            </tr>
            {visItems.map((item) => {
              const isMod = modifiedItemIds.has(item.id);
              return (
                <tr key={item.id} className={isMod ? 'bg-amber-100/90 font-semibold' : ''}>
                  <td className="py-0.5 pl-6 pr-2">
                    {item.name}
                    {isMod && (
                      <span className="ml-1.5 font-sans text-[9px] font-bold uppercase text-amber-800">
                        Live
                      </span>
                    )}
                  </td>
                  <td className="py-0.5 px-2 text-right tabular-nums">
                    {formatFSNum(reportCurrent.values[item.id] || 0)}
                  </td>
                  <td className="py-0.5 px-2 text-right tabular-nums">
                    {formatFSNum(reportPrior.values[item.id] || 0)}
                  </td>
                </tr>
              );
            })}
            <tr>
              <td className="pt-0.5 pb-1 pl-3 font-bold">Total {grpName}</td>
              <td className="pt-0.5 pb-1 px-2 text-right font-bold tabular-nums border-t border-black">
                {formatFSNum(sumItemsNet(grpItems, reportCurrent))}
              </td>
              <td className="pt-0.5 pb-1 px-2 text-right font-bold tabular-nums border-t border-black">
                {formatFSNum(sumItemsNet(grpItems, reportPrior))}
              </td>
            </tr>
          </React.Fragment>
        );
      });
    };

    const hasTransfersOrOther =
      trItems.some(isItemVisible) ||
      nonOpItems.some(isItemVisible) ||
      lossItems.some(isItemVisible);

    return (
      <table className="w-full text-left border-collapse">
        <thead>
          <tr>
            <th className="py-1 pr-2 font-bold uppercase w-[56%]">Account Title</th>
            <th className="py-1 px-2 text-right font-bold border-b border-black w-[22%]">
              {selectedYear}
            </th>
            <th className="py-1 px-2 text-right font-bold border-b border-black w-[22%]">
              {priorYear}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td colSpan={3} className="pt-2 pb-0.5 font-bold uppercase">
              Revenue
            </td>
          </tr>
          {renderGroupList(revItems)}
          <tr>
            <td className="pt-1 pb-2 pl-2 font-bold">Total Revenue</td>
            <td className="pt-1 pb-2 px-2 text-right font-bold tabular-nums border-t border-black">
              {formatFSNum(sumItemsNet(revItems, reportCurrent))}
            </td>
            <td className="pt-1 pb-2 px-2 text-right font-bold tabular-nums border-t border-black">
              {formatFSNum(sumItemsNet(revItems, reportPrior))}
            </td>
          </tr>

          <tr>
            <td colSpan={3} className="pt-1.5 pb-0.5 font-bold uppercase">
              Less: Current Operating Expenses
            </td>
          </tr>
          {renderGroupList(expItems)}
          <tr>
            <td className="pt-1 pb-2 pl-2 font-bold">Current Operating Expenses</td>
            <td className="pt-1 pb-2 px-2 text-right font-bold tabular-nums border-t border-black">
              {formatFSNum(sumItemsNet(expItems, reportCurrent))}
            </td>
            <td className="pt-1 pb-2 px-2 text-right font-bold tabular-nums border-t border-black">
              {formatFSNum(sumItemsNet(expItems, reportPrior))}
            </td>
          </tr>

          <tr>
            <td className="pt-1 pb-2 font-bold">Surplus/(Deficit) from Current Operations</td>
            <td className="pt-1 pb-2 px-2 text-right font-bold tabular-nums border-t border-black">
              {formatFSNum(
                sumItemsNet(revItems, reportCurrent) - sumItemsNet(expItems, reportCurrent)
              )}
            </td>
            <td className="pt-1 pb-2 px-2 text-right font-bold tabular-nums border-t border-black">
              {formatFSNum(
                sumItemsNet(revItems, reportPrior) - sumItemsNet(expItems, reportPrior)
              )}
            </td>
          </tr>

          {hasTransfersOrOther && (
            <>
              {trItems.some(isItemVisible) && renderGroupList(trItems)}
              {nonOpItems.some(isItemVisible) && renderGroupList(nonOpItems)}
              {lossItems.filter(isItemVisible).map((item) => {
                const isMod = modifiedItemIds.has(item.id);
                return (
                  <tr key={item.id} className={isMod ? 'bg-amber-100/90 font-semibold' : ''}>
                    <td className="py-0.5 pl-4 pr-2 font-bold">
                      {item.name}
                      {isMod && (
                        <span className="ml-1.5 font-sans text-[9px] font-bold uppercase text-amber-800">
                          Live
                        </span>
                      )}
                    </td>
                    <td className="py-0.5 px-2 text-right font-bold tabular-nums">
                      {reportCurrent.values[item.id]
                        ? formatFSNum(-Math.abs(reportCurrent.values[item.id]))
                        : '-'}
                    </td>
                    <td className="py-0.5 px-2 text-right font-bold tabular-nums">
                      {reportPrior.values[item.id]
                        ? formatFSNum(-Math.abs(reportPrior.values[item.id]))
                        : '-'}
                    </td>
                  </tr>
                );
              })}
            </>
          )}

          <tr>
            <td className="pt-2 pb-2 font-bold uppercase">Surplus/(Deficit) for the Period</td>
            <td className="pt-2 pb-2 px-2 text-right font-bold tabular-nums border-t border-black border-b-4 border-double">
              {formatFSNum(getNetSurplus(reportCurrent))}
            </td>
            <td className="pt-2 pb-2 px-2 text-right font-bold tabular-nums border-t border-black border-b-4 border-double">
              {formatFSNum(getNetSurplus(reportPrior))}
            </td>
          </tr>
        </tbody>
      </table>
    );
  };

  const renderCashFlowsTable = () => {
    const activities: Array<{
      title: string;
      sectionKey: 'CASH_OPERATING' | 'CASH_INVESTING' | 'CASH_FINANCING';
      netLabel: string;
      getInflow: (s: CashFlowsSummary) => number;
      getOutflow: (s: CashFlowsSummary) => number;
      getNet: (s: CashFlowsSummary) => number;
    }> = [
      {
        title: 'Cash Flows from Operating Activities',
        sectionKey: 'CASH_OPERATING',
        netLabel: 'Net Cash Provided by (Used in) Operating Activities',
        getInflow: (s) => s.operatingInflows,
        getOutflow: (s) => s.operatingOutflows,
        getNet: (s) => s.netOperating,
      },
      {
        title: 'Cash Flows from Investing Activities',
        sectionKey: 'CASH_INVESTING',
        netLabel: 'Net Cash Provided by (Used in) Investing Activities',
        getInflow: (s) => s.investingInflows,
        getOutflow: (s) => s.investingOutflows,
        getNet: (s) => s.netInvesting,
      },
      {
        title: 'Cash Flows from Financing Activities',
        sectionKey: 'CASH_FINANCING',
        netLabel: 'Net Cash Provided by (Used in) Financing Activities',
        getInflow: (s) => s.financingInflows,
        getOutflow: (s) => s.financingOutflows,
        getNet: (s) => s.netFinancing,
      },
    ];

    return (
      <table className="w-full text-left border-collapse">
        <thead>
          <tr>
            <th className="py-1 pr-2 font-bold uppercase w-[56%]">Cash Flow Activity</th>
            <th className="py-1 px-2 text-right font-bold border-b border-black w-[22%]">
              {selectedYear}
            </th>
            <th className="py-1 px-2 text-right font-bold border-b border-black w-[22%]">
              {priorYear}
            </th>
          </tr>
        </thead>
        <tbody>
          {activities.map((act) => {
            const secItems = statementLineItems.filter((i) => i.section === act.sectionKey);
            const inflows = secItems.filter((i) => i.subgroup !== 'Cash Outflows');
            const outflows = secItems.filter((i) => i.subgroup === 'Cash Outflows');

            const renderFlowGroups = (items: LineItemDefinition[]) =>
              groupByKey(items, (i) => i.group).map(([grp, grpItems]) => {
                const vis = grpItems.filter(isItemVisible);
                const hasMod = grpItems.some((i) => modifiedItemIds.has(i.id));
                if (hideZeroRows && vis.length === 0 && !hasMod) return null;

                if (isCondensed) {
                  return (
                    <tr key={grp} className={hasMod ? 'bg-amber-100/90 font-semibold' : ''}>
                      <td className="py-0.5 pl-6 pr-2">
                        {grp}
                        {hasMod && (
                          <span className="ml-1.5 font-sans text-[9px] font-bold uppercase text-amber-800">
                            Live
                          </span>
                        )}
                      </td>
                      <td className="py-0.5 px-2 text-right tabular-nums">
                        {formatFSNum(sumItemsNet(grpItems, reportCurrent))}
                      </td>
                      <td className="py-0.5 px-2 text-right tabular-nums">
                        {formatFSNum(sumItemsNet(grpItems, reportPrior))}
                      </td>
                    </tr>
                  );
                }

                return (
                  <React.Fragment key={grp}>
                    {vis.map((item) => {
                      const isMod = modifiedItemIds.has(item.id);
                      return (
                        <tr key={item.id} className={isMod ? 'bg-amber-100/90 font-semibold' : ''}>
                          <td className="py-0.5 pl-6 pr-2">
                            {item.name}
                            {isMod && (
                              <span className="ml-1.5 font-sans text-[9px] font-bold uppercase text-amber-800">
                                Live
                              </span>
                            )}
                          </td>
                          <td className="py-0.5 px-2 text-right tabular-nums">
                            {formatFSNum(reportCurrent.values[item.id] || 0)}
                          </td>
                          <td className="py-0.5 px-2 text-right tabular-nums">
                            {formatFSNum(reportPrior.values[item.id] || 0)}
                          </td>
                        </tr>
                      );
                    })}
                  </React.Fragment>
                );
              });

            return (
              <React.Fragment key={act.sectionKey}>
                <tr>
                  <td colSpan={3} className="pt-2 pb-0.5 font-bold">
                    {act.title}
                  </td>
                </tr>
                <tr>
                  <td colSpan={3} className="py-0.5 pl-3 font-bold">
                    Cash Inflows
                  </td>
                </tr>
                {renderFlowGroups(inflows)}
                <tr>
                  <td className="pt-0.5 pb-1 pl-3 font-bold">Total Cash Inflows</td>
                  <td className="pt-0.5 pb-1 px-2 text-right font-bold tabular-nums border-t border-black">
                    {formatFSNum(act.getInflow(cashFlowsCurr))}
                  </td>
                  <td className="pt-0.5 pb-1 px-2 text-right font-bold tabular-nums border-t border-black">
                    {formatFSNum(act.getInflow(cashFlowsPrior))}
                  </td>
                </tr>

                <tr>
                  <td colSpan={3} className="py-0.5 pl-3 font-bold">
                    Cash Outflows
                  </td>
                </tr>
                {renderFlowGroups(outflows)}
                <tr>
                  <td className="pt-0.5 pb-1 pl-3 font-bold">Total Cash Outflows</td>
                  <td className="pt-0.5 pb-1 px-2 text-right font-bold tabular-nums border-t border-black">
                    {formatFSNum(act.getOutflow(cashFlowsCurr))}
                  </td>
                  <td className="pt-0.5 pb-1 px-2 text-right font-bold tabular-nums border-t border-black">
                    {formatFSNum(act.getOutflow(cashFlowsPrior))}
                  </td>
                </tr>

                <tr>
                  <td className="pt-1 pb-2 pl-2 font-bold">{act.netLabel}</td>
                  <td className="pt-1 pb-2 px-2 text-right font-bold tabular-nums border-t border-black">
                    {formatFSNum(act.getNet(cashFlowsCurr))}
                  </td>
                  <td className="pt-1 pb-2 px-2 text-right font-bold tabular-nums border-t border-black">
                    {formatFSNum(act.getNet(cashFlowsPrior))}
                  </td>
                </tr>
              </React.Fragment>
            );
          })}

          <tr>
            <td className="pt-2 pb-0.5 font-bold">Increase/(Decrease) in Cash and Cash Equivalents</td>
            <td className="pt-2 pb-0.5 px-2 text-right font-bold tabular-nums border-t border-black">
              {formatFSNum(cashFlowsCurr.netIncreaseDecrease)}
            </td>
            <td className="pt-2 pb-0.5 px-2 text-right font-bold tabular-nums border-t border-black">
              {formatFSNum(cashFlowsPrior.netIncreaseDecrease)}
            </td>
          </tr>
          {(cashFlowsCurr.fxEffects !== 0 || cashFlowsPrior.fxEffects !== 0 || !hideZeroRows) && (
            <tr
              className={modifiedItemIds.has('cf-sum-fx-effects') ? 'bg-amber-100/90 font-semibold' : ''}
            >
              <td className="py-0.5 pl-3">Effects of Exchange Rate Changes</td>
              <td className="py-0.5 px-2 text-right tabular-nums">
                {formatFSNum(cashFlowsCurr.fxEffects)}
              </td>
              <td className="py-0.5 px-2 text-right tabular-nums">
                {formatFSNum(cashFlowsPrior.fxEffects)}
              </td>
            </tr>
          )}
          <tr className={modifiedItemIds.has('cf-sum-beg-cash') ? 'bg-amber-100/90 font-semibold' : ''}>
            <td className="py-0.5 font-bold">Cash and Cash Equivalents, January 1</td>
            <td className="py-0.5 px-2 text-right font-bold tabular-nums">
              {formatFSNum(cashFlowsCurr.january1Cash)}
            </td>
            <td className="py-0.5 px-2 text-right font-bold tabular-nums">
              {formatFSNum(cashFlowsPrior.january1Cash)}
            </td>
          </tr>
          <tr>
            <td className="pt-1 pb-2 font-bold uppercase">Cash and Cash Equivalents, December 31</td>
            <td className="pt-1 pb-2 px-2 text-right font-bold tabular-nums border-t border-black border-b-4 border-double">
              {formatFSNum(cashFlowsCurr.december31Cash)}
            </td>
            <td className="pt-1 pb-2 px-2 text-right font-bold tabular-nums border-t border-black border-b-4 border-double">
              {formatFSNum(cashFlowsPrior.december31Cash)}
            </td>
          </tr>
        </tbody>
      </table>
    );
  };

  const renderNetAssetsTable = () => {
    const rows = [
      { id: 'na-beg-balance', label: 'Balance at January 1', curr: netAssetsCurr.january1Balance, prior: netAssetsPrior.january1Balance, bold: true },
      { id: 'na-adj-accounting-policy', label: 'Changes in Accounting Policy', curr: netAssetsCurr.changesInAccountingPolicy, prior: netAssetsPrior.changesInAccountingPolicy, indent: true },
      { id: 'na-adj-prior-period-errors', label: 'Prior period errors', curr: netAssetsCurr.priorPeriodErrors, prior: netAssetsPrior.priorPeriodErrors, indent: true },
      { id: 'na-adj-other-adjustments', label: 'Other Adjustments', curr: netAssetsCurr.otherAdjustments, prior: netAssetsPrior.otherAdjustments, indent: true },
      { id: 'na-restated-balance', label: 'Restated Balance', curr: netAssetsCurr.restatedBalance, prior: netAssetsPrior.restatedBalance, bold: true, topBorder: true },
      { id: 'na-cy-surplus-deficit', label: 'Surplus/(Deficit) for the Period', curr: netAssetsCurr.surplusDeficitForPeriod, prior: netAssetsPrior.surplusDeficitForPeriod, indent: true },
      { id: 'na-cy-net-revenue-adj', label: 'Adjustment of net revenue recognized directly in net assets/equity', curr: netAssetsCurr.netRevenueAdjustment, prior: netAssetsPrior.netRevenueAdjustment, indent: true },
      { id: 'na-cy-others', label: 'Others', curr: netAssetsCurr.others, prior: netAssetsPrior.others, indent: true },
      { id: 'na-end-balance', label: 'Balance at December 31', curr: netAssetsCurr.december31Balance, prior: netAssetsPrior.december31Balance, bold: true, topBorder: true, doubleBottom: true },
    ];

    return (
      <table className="w-full text-left border-collapse">
        <thead>
          <tr>
            <th className="py-1 pr-2 font-bold uppercase w-[56%]">Particulars</th>
            <th className="py-1 px-2 text-right font-bold border-b border-black w-[22%]">
              {selectedYear}
            </th>
            <th className="py-1 px-2 text-right font-bold border-b border-black w-[22%]">
              {priorYear}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const isMod = modifiedItemIds.has(r.id);
            return (
              <tr key={r.id} className={isMod ? 'bg-amber-100/90 font-semibold' : ''}>
                <td className={`py-0.5 pr-2 ${r.indent ? 'pl-5' : ''} ${r.bold ? 'font-bold' : ''}`}>
                  {r.label}
                  {isMod && (
                    <span className="ml-1.5 font-sans text-[9px] font-bold uppercase text-amber-800">
                      Live
                    </span>
                  )}
                </td>
                <td
                  className={`py-0.5 px-2 text-right tabular-nums ${r.bold ? 'font-bold' : ''} ${
                    r.topBorder ? 'border-t border-black' : ''
                  } ${r.doubleBottom ? 'border-b-4 border-double border-black' : ''}`}
                >
                  {formatFSNum(r.curr)}
                </td>
                <td
                  className={`py-0.5 px-2 text-right tabular-nums ${r.bold ? 'font-bold' : ''} ${
                    r.topBorder ? 'border-t border-black' : ''
                  } ${r.doubleBottom ? 'border-b-4 border-double border-black' : ''}`}
                >
                  {formatFSNum(r.prior)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    );
  };

  return (
    <>
      {selectedStatement === 'position' && (
        <div
          className={`px-3.5 py-2 border-b text-xs font-bold flex items-center justify-between gap-2 shrink-0 ${
            reportCurrent.isBalanced
              ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200'
              : 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200'
          }`}
        >
          <span className="inline-flex items-center gap-1.5">
            {reportCurrent.isBalanced ? (
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700 dark:text-emerald-400 shrink-0" />
            ) : (
              <AlertTriangle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
            )}
            <span>{reportCurrent.isBalanced ? 'Assets = Liabilities + Equity' : 'Balance Variance'}</span>
          </span>
          <span className="font-mono tabular-nums">
            Diff: ₱ {formatAccounting(reportCurrent.variance)}
          </span>
        </div>
      )}

      <div className="p-3 bg-th-canvas/50 overflow-y-auto flex-1">
        <div
          className="bg-white text-black p-4 sm:p-5 rounded-xl border border-slate-300 shadow-2xs font-['Times_New_Roman',Times,serif] leading-snug"
          style={{ fontSize: `${fontSizePx}px` }}
        >
          <div className="text-center mb-4 font-bold">
            <div>Department of Education</div>
            <div>Regional Office No. VI</div>
            <div>{divisionName}</div>
            <div>{statementTitle}</div>
            <div>All Funds</div>
            <div>{dateLine}</div>
          </div>

          <div className="overflow-x-auto">
            {selectedStatement === 'position' && renderPositionTable()}
            {selectedStatement === 'performance' && renderPerformanceTable()}
            {selectedStatement === 'cash_flows' && renderCashFlowsTable()}
            {selectedStatement === 'net_assets' && renderNetAssetsTable()}
          </div>
        </div>
      </div>
    </>
  );
};

export const LiveEditStatementPanel: React.FC<LiveEditStatementPanelProps> = ({
  divisionId,
  divisionName,
  selectedYear,
  selectedStatement,
  lineItems,
  liveDataStore,
  modifiedItemIds,
  pendingCount,
  windowMode,
  onWindowModeChange,
  onClose,
}) => {
  const [hideZeroRows, setHideZeroRows] = useState(true);
  const [isCondensed, setIsCondensed] = useState(false);
  const [isFloatingMinimized, setIsFloatingMinimized] = useState(false);
  const [isFloatingMaximized, setIsFloatingMaximized] = useState(false);
  const [fontSizePx, setFontSizePx] = useState<number>(() => {
    try {
      const saved = Number(localStorage.getItem(STORAGE_KEY_FONT_SIZE));
      if (Number.isFinite(saved)) return clamp(saved, 9, 15);
    } catch {
      // ignore
    }
    return 11;
  });

  const [isDesktopXl, setIsDesktopXl] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.innerWidth >= 1280 : true
  );

  const [sideWidth, setSideWidth] = useState<number>(() => {
    try {
      const saved = Number(localStorage.getItem(STORAGE_KEY_SIDE_WIDTH));
      if (Number.isFinite(saved)) return clamp(saved, MIN_SIDE_WIDTH, MAX_SIDE_WIDTH);
    } catch {
      // ignore
    }
    return DEFAULT_SIDE_WIDTH;
  });

  const [stackedHeight, setStackedHeight] = useState<number>(() => {
    try {
      const saved = Number(localStorage.getItem(STORAGE_KEY_STACKED_HEIGHT));
      if (Number.isFinite(saved)) return clamp(saved, MIN_STACKED_HEIGHT, MAX_STACKED_HEIGHT);
    } catch {
      // ignore
    }
    return DEFAULT_STACKED_HEIGHT;
  });

  const [floatingRect, setFloatingRect] = useState<FloatingRect>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_FLOATING_RECT);
      if (raw) {
        const parsed = JSON.parse(raw) as FloatingRect;
        if (
          parsed &&
          Number.isFinite(parsed.x) &&
          Number.isFinite(parsed.y) &&
          Number.isFinite(parsed.width) &&
          Number.isFinite(parsed.height)
        ) {
          return clampFloatingRect(parsed);
        }
      }
    } catch {
      // ignore
    }
    return getDefaultFloatingRect();
  });

  const [activeInteractionLabel, setActiveInteractionLabel] = useState<string | null>(null);
  const preMaximizeRectRef = useRef<FloatingRect | null>(null);

  useEffect(() => {
    const handleResize = () => {
      setIsDesktopXl(window.innerWidth >= 1280);
      setFloatingRect((prev) => clampFloatingRect(prev));
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_SIDE_WIDTH, String(sideWidth));
    } catch {
      // ignore
    }
  }, [sideWidth]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_STACKED_HEIGHT, String(stackedHeight));
    } catch {
      // ignore
    }
  }, [stackedHeight]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_FLOATING_RECT, JSON.stringify(floatingRect));
    } catch {
      // ignore
    }
  }, [floatingRect]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_FONT_SIZE, String(fontSizePx));
    } catch {
      // ignore
    }
  }, [fontSizePx]);

  const supportsCondensed =
    selectedStatement === 'position' ||
    selectedStatement === 'performance' ||
    selectedStatement === 'cash_flows';

  // Docked horizontal drag resize (desktop xl+)
  const startSideWidthResize = (e: React.PointerEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = sideWidth;
    const maxAllowed = Math.max(MIN_SIDE_WIDTH, Math.min(MAX_SIDE_WIDTH, window.innerWidth - 360));
    setActiveInteractionLabel(`${startWidth}px`);

    const onMove = (moveEvt: PointerEvent) => {
      const delta = startX - moveEvt.clientX;
      const next = clamp(Math.round(startWidth + delta), MIN_SIDE_WIDTH, maxAllowed);
      setSideWidth(next);
      setActiveInteractionLabel(`${next}px`);
    };

    const onUp = () => {
      setActiveInteractionLabel(null);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };

  // Docked vertical drag resize (stacked mobile/tablet)
  const startStackedHeightResize = (e: React.PointerEvent) => {
    e.preventDefault();
    const startY = e.clientY;
    const startHeight = stackedHeight;
    setActiveInteractionLabel(`${startHeight}px`);

    const onMove = (moveEvt: PointerEvent) => {
      const delta = moveEvt.clientY - startY;
      const next = clamp(Math.round(startHeight + delta), MIN_STACKED_HEIGHT, MAX_STACKED_HEIGHT);
      setStackedHeight(next);
      setActiveInteractionLabel(`${next}px`);
    };

    const onUp = () => {
      setActiveInteractionLabel(null);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };

  // Floating window drag move
  const startFloatingMove = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('button, a')) return;
    e.preventDefault();
    if (isFloatingMaximized) return;
    const startX = e.clientX;
    const startY = e.clientY;
    const startRect = { ...floatingRect };

    const onMove = (moveEvt: PointerEvent) => {
      const dx = moveEvt.clientX - startX;
      const dy = moveEvt.clientY - startY;
      setFloatingRect(
        clampFloatingRect({
          ...startRect,
          x: startRect.x + dx,
          y: startRect.y + dy,
        })
      );
    };

    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };

  // Floating window edge/corner resize
  type ResizeEdge = 'right' | 'left' | 'bottom' | 'bottom-right' | 'bottom-left';
  const startFloatingResize = (edge: ResizeEdge) => (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (isFloatingMaximized) setIsFloatingMaximized(false);
    if (isFloatingMinimized) setIsFloatingMinimized(false);

    const startX = e.clientX;
    const startY = e.clientY;
    const startRect = { ...floatingRect };
    setActiveInteractionLabel(`${startRect.width} × ${startRect.height}`);

    const onMove = (moveEvt: PointerEvent) => {
      const dx = moveEvt.clientX - startX;
      const dy = moveEvt.clientY - startY;
      const vw = window.innerWidth;
      const vh = window.innerHeight;

      let nextX = startRect.x;
      let nextW = startRect.width;
      let nextH = startRect.height;

      if (edge === 'right' || edge === 'bottom-right') {
        nextW = clamp(Math.round(startRect.width + dx), MIN_FLOAT_WIDTH, vw - startRect.x - 12);
      }
      if (edge === 'left' || edge === 'bottom-left') {
        const rightEdge = startRect.x + startRect.width;
        const proposedX = clamp(Math.round(startRect.x + dx), 12, rightEdge - MIN_FLOAT_WIDTH);
        nextX = proposedX;
        nextW = rightEdge - proposedX;
      }
      if (edge === 'bottom' || edge === 'bottom-right' || edge === 'bottom-left') {
        nextH = clamp(Math.round(startRect.height + dy), MIN_FLOAT_HEIGHT, vh - startRect.y - 12);
      }

      setFloatingRect({ x: nextX, y: startRect.y, width: nextW, height: nextH });
      setActiveInteractionLabel(`${nextW} × ${nextH}`);
    };

    const onUp = () => {
      setActiveInteractionLabel(null);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };

  const toggleMaximizeFloating = () => {
    if (isFloatingMaximized) {
      if (preMaximizeRectRef.current) {
        setFloatingRect(clampFloatingRect(preMaximizeRectRef.current));
      }
      setIsFloatingMaximized(false);
    } else {
      preMaximizeRectRef.current = floatingRect;
      setIsFloatingMinimized(false);
      setIsFloatingMaximized(true);
    }
  };

  const renderToolbarControls = () => (
    <div className="px-3.5 py-2 bg-th-surface border-b border-th-border flex flex-wrap items-center justify-between gap-2 shrink-0">
      <div className="flex flex-wrap items-center gap-1.5">
        {supportsCondensed && (
          <button
            type="button"
            onClick={() => setIsCondensed((prev) => !prev)}
            className="px-2.5 py-1 text-xs font-bold rounded-lg border border-th-border-strong bg-th-subtle text-th-text hover:bg-th-subtle-hover transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            {isCondensed ? 'Condensed' : 'Detailed'}
          </button>
        )}
        <button
          type="button"
          onClick={() => setHideZeroRows((prev) => !prev)}
          className="px-2.5 py-1 text-xs font-bold rounded-lg border border-th-border-strong bg-th-subtle text-th-text hover:bg-th-subtle-hover transition-colors inline-flex items-center gap-1 cursor-pointer whitespace-nowrap shrink-0"
          title={hideZeroRows ? 'Show zero-balance rows' : 'Hide zero-balance rows'}
        >
          {hideZeroRows ? (
            <EyeOff className="w-3.5 h-3.5 text-th-muted shrink-0" />
          ) : (
            <Eye className="w-3.5 h-3.5 text-th-muted shrink-0" />
          )}
          <span>{hideZeroRows ? 'Hide 0' : 'All'}</span>
        </button>

        <div className="inline-flex items-center border border-th-border-strong rounded-lg bg-th-subtle overflow-hidden">
          <button
            type="button"
            onClick={() => setFontSizePx((s) => clamp(s - 1, 9, 15))}
            disabled={fontSizePx <= 9}
            className="px-2 py-1 text-xs font-bold text-th-text hover:bg-th-subtle-hover disabled:opacity-40 cursor-pointer"
            title="Decrease statement text size"
            aria-label="Decrease statement text size"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <span className="px-1.5 text-[11px] font-mono font-bold text-th-muted tabular-nums select-none">
            {fontSizePx}px
          </span>
          <button
            type="button"
            onClick={() => setFontSizePx((s) => clamp(s + 1, 9, 15))}
            disabled={fontSizePx >= 15}
            className="px-2 py-1 text-xs font-bold text-th-text hover:bg-th-subtle-hover disabled:opacity-40 cursor-pointer"
            title="Increase statement text size"
            aria-label="Increase statement text size"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {activeInteractionLabel && (
        <span className="px-2 py-0.5 rounded bg-th-primary text-th-primary-fg text-[11px] font-mono font-bold tabular-nums">
          {activeInteractionLabel}
        </span>
      )}
    </div>
  );

  // Floating Window Mode (movable & edge/corner resizable overlay)
  if (windowMode === 'floating') {
    const posStyle: React.CSSProperties = isFloatingMaximized
      ? {
          top: '12px',
          left: '12px',
          width: 'calc(100vw - 24px)',
          height: isFloatingMinimized ? 'auto' : 'calc(100vh - 24px)',
        }
      : {
          top: `${floatingRect.y}px`,
          left: `${floatingRect.x}px`,
          width: `${floatingRect.width}px`,
          height: isFloatingMinimized ? 'auto' : `${floatingRect.height}px`,
        };

    return (
      <section
        aria-label="Floating Live Financial Statement Window"
        style={posStyle}
        className="fixed z-[75] bg-th-surface border-2 border-th-border-strong rounded-2xl shadow-2xl overflow-hidden flex flex-col no-print"
      >
        {/* Draggable Window Title Bar */}
        <div
          onPointerDown={startFloatingMove}
          className={`p-3 bg-th-subtle border-b border-th-border flex flex-wrap items-center justify-between gap-2 shrink-0 select-none ${
            isFloatingMaximized ? 'cursor-default' : 'cursor-move'
          }`}
          title={isFloatingMaximized ? undefined : 'Drag title bar to move window'}
        >
          <div className="min-w-0 flex-1 flex items-center gap-2 flex-wrap">
            <FileSpreadsheet className="w-4 h-4 text-th-accent-text shrink-0" />
            <h4 className="text-sm font-extrabold text-th-text whitespace-nowrap">
              Live FS Window
            </h4>
            <span className="text-xs text-th-muted font-semibold truncate">
              {divisionName} · FY {selectedYear}
            </span>
            {pendingCount > 0 && (
              <span className="text-xs font-bold text-amber-800 dark:text-amber-300 tabular-nums whitespace-nowrap">
                · {pendingCount} unsaved edit{pendingCount === 1 ? '' : 's'}
              </span>
            )}
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => onWindowModeChange('docked')}
              className="px-2.5 py-1 text-xs font-bold rounded-lg border border-th-border-strong bg-th-surface text-th-text hover:bg-th-subtle-hover transition-colors inline-flex items-center gap-1 cursor-pointer whitespace-nowrap"
              title="Dock back to side panel"
            >
              <PanelRight className="w-3.5 h-3.5 text-th-muted shrink-0" />
              <span>Dock</span>
            </button>

            <button
              type="button"
              onClick={() => setIsFloatingMinimized((prev) => !prev)}
              className="p-1.5 rounded-lg text-th-muted hover:text-th-text hover:bg-th-surface transition-colors cursor-pointer"
              title={isFloatingMinimized ? 'Expand window' : 'Minimize window'}
              aria-label={isFloatingMinimized ? 'Expand window' : 'Minimize window'}
            >
              <Minus className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              onClick={toggleMaximizeFloating}
              className="p-1.5 rounded-lg text-th-muted hover:text-th-text hover:bg-th-surface transition-colors cursor-pointer"
              title={isFloatingMaximized ? 'Restore window size' : 'Maximize window'}
              aria-label={isFloatingMaximized ? 'Restore window size' : 'Maximize window'}
            >
              {isFloatingMaximized ? (
                <Minimize2 className="w-3.5 h-3.5" />
              ) : (
                <Maximize2 className="w-3.5 h-3.5" />
              )}
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-th-muted hover:text-th-text hover:bg-th-surface transition-colors cursor-pointer"
              title="Close Live FS Window"
              aria-label="Close Live FS Window"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {!isFloatingMinimized && (
          <>
            {renderToolbarControls()}
            <LiveEditStatementBody
              divisionId={divisionId}
              divisionName={divisionName}
              selectedYear={selectedYear}
              selectedStatement={selectedStatement}
              lineItems={lineItems}
              liveDataStore={liveDataStore}
              modifiedItemIds={modifiedItemIds}
              hideZeroRows={hideZeroRows}
              isCondensed={isCondensed}
              fontSizePx={fontSizePx}
            />
          </>
        )}

        {/* Resize Handles (Edges & Corners) */}
        {!isFloatingMinimized && !isFloatingMaximized && (
          <>
            <div
              onPointerDown={startFloatingResize('right')}
              className="absolute top-12 bottom-3 right-0 w-2 cursor-ew-resize hover:bg-th-accent/30 transition-colors"
              title="Drag right edge to resize"
            />
            <div
              onPointerDown={startFloatingResize('left')}
              className="absolute top-12 bottom-3 left-0 w-2 cursor-ew-resize hover:bg-th-accent/30 transition-colors"
              title="Drag left edge to resize"
            />
            <div
              onPointerDown={startFloatingResize('bottom')}
              className="absolute left-3 right-3 bottom-0 h-2 cursor-ns-resize hover:bg-th-accent/30 transition-colors"
              title="Drag bottom edge to resize"
            />
            <div
              onPointerDown={startFloatingResize('bottom-right')}
              className="absolute bottom-0 right-0 w-4 h-4 cursor-nwse-resize flex items-end justify-end p-0.5 text-th-muted hover:text-th-accent"
              title="Drag corner to resize"
            >
              <span className="w-2.5 h-2.5 border-r-2 border-b-2 border-current rounded-br-xs" />
            </div>
            <div
              onPointerDown={startFloatingResize('bottom-left')}
              className="absolute bottom-0 left-0 w-4 h-4 cursor-nesw-resize flex items-end justify-start p-0.5 text-th-muted hover:text-th-accent"
              title="Drag corner to resize"
            >
              <span className="w-2.5 h-2.5 border-l-2 border-b-2 border-current rounded-bl-xs" />
            </div>
          </>
        )}
      </section>
    );
  }

  // Docked Side Panel Mode (resizable left edge on xl+, resizable height below xl)
  const dockedStyle: React.CSSProperties = isDesktopXl
    ? { width: `${sideWidth}px` }
    : { height: `${stackedHeight}px` };

  return (
    <aside
      style={dockedStyle}
      className="relative w-full xl:shrink-0 bg-th-surface border-2 border-th-border-strong rounded-2xl shadow-xs overflow-hidden flex flex-col xl:sticky xl:top-[calc(4.75rem+4.75rem)] xl:max-h-[calc(100vh-10.5rem)]"
    >
      {/* Left-Edge Horizontal Resize Handle (Desktop xl+) */}
      {isDesktopXl && (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Drag to resize Live FS panel width. Double-click to reset."
          onPointerDown={startSideWidthResize}
          onDoubleClick={() => setSideWidth(DEFAULT_SIDE_WIDTH)}
          title="Drag left edge to resize width (double-click to reset)"
          className="group absolute top-0 bottom-0 left-0 w-3 -ml-0.5 z-20 cursor-col-resize flex items-center justify-center hover:bg-th-accent/15 transition-colors"
        >
          <span className="w-1 h-12 rounded-full bg-th-border-strong group-hover:bg-th-accent transition-colors flex items-center justify-center">
            <GripVertical className="w-3 h-3 text-th-muted opacity-0 group-hover:opacity-100" />
          </span>
        </div>
      )}

      {/* Header Controls */}
      <div className="p-3.5 pl-4 bg-th-subtle border-b border-th-border flex flex-wrap items-center justify-between gap-2 shrink-0">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <FileSpreadsheet className="w-4 h-4 text-th-accent-text shrink-0" />
            <h4 className="text-sm font-extrabold text-th-text whitespace-nowrap">
              Live Statement Preview
            </h4>
            <TipsButton>
              <p>
                Drag the {isDesktopXl ? 'left border' : 'bottom bar'} to resize this panel (double-click the handle to reset), or click <strong className="text-th-text">Float</strong> to move and resize it freely.
              </p>
            </TipsButton>
            {pendingCount > 0 && (
              <span className="text-xs font-bold text-amber-800 dark:text-amber-300 tabular-nums whitespace-nowrap">
                · {pendingCount} unsaved edit{pendingCount === 1 ? '' : 's'}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => onWindowModeChange('floating')}
            className="px-2.5 py-1 text-xs font-bold rounded-lg border border-th-border-strong bg-th-surface text-th-text hover:bg-th-subtle-hover transition-colors inline-flex items-center gap-1 cursor-pointer whitespace-nowrap"
            title="Pop out as a movable, resizable floating window"
          >
            <AppWindow className="w-3.5 h-3.5 text-th-muted shrink-0" />
            <span>Float</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-th-muted hover:text-th-text hover:bg-th-surface transition-colors cursor-pointer"
            title="Hide Live Statement Preview"
            aria-label="Hide Live Statement Preview"
          >
            <PanelRightClose className="w-4 h-4" />
          </button>
        </div>
      </div>

      {renderToolbarControls()}

      <LiveEditStatementBody
        divisionId={divisionId}
        divisionName={divisionName}
        selectedYear={selectedYear}
        selectedStatement={selectedStatement}
        lineItems={lineItems}
        liveDataStore={liveDataStore}
        modifiedItemIds={modifiedItemIds}
        hideZeroRows={hideZeroRows}
        isCondensed={isCondensed}
        fontSizePx={fontSizePx}
      />

      {/* Bottom Height Resize Handle (Stacked mode < xl) */}
      {!isDesktopXl && (
        <div
          role="separator"
          aria-orientation="horizontal"
          aria-label="Drag to resize Live FS panel height. Double-click to reset."
          onPointerDown={startStackedHeightResize}
          onDoubleClick={() => setStackedHeight(DEFAULT_STACKED_HEIGHT)}
          title="Drag bottom handle to resize height (double-click to reset)"
          className="h-3.5 bg-th-subtle border-t border-th-border cursor-row-resize flex items-center justify-center hover:bg-th-accent/15 transition-colors shrink-0"
        >
          <GripHorizontal className="w-4 h-4 text-th-muted" />
        </div>
      )}
    </aside>
  );
};
