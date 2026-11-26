import { FinancialDataStore, LineItemDefinition } from '../types/fs';
import { CalculatedReport, calculateReport } from './calculations';
import { calculateCashFlowsSummary } from './cashFlowCalculations';
import { calculateNetAssetsSummary } from './netAssetsCalculations';
import { EARLIEST_YEAR, getComparativeYear } from './yearUtils';

export type AuditCheckStatus = 'pass' | 'fail' | 'na';

export interface AuditYearEvaluation {
  year: string;
  leftLabel: string;
  leftAmount: number;
  rightLabel: string;
  rightAmount: number;
  difference: number;
  absDifference: number;
  status: AuditCheckStatus;
  note?: string;
}

export interface YearStatementSnippetContext {
  year: string;
  sfpCash: number;
  sfpCurrentAssets: number;
  sfpTotalAssets: number;
  sfpTotalLiabilities: number;
  sfpAssetsLessLiabilities: number;
  sfpAccumulatedSurplus: number;
  sfpTotalEquity: number;
  perfRevenue: number;
  perfExpenses: number;
  perfSurplus: number;
  cfNetChange: number;
  cfFxEffects: number;
  cfJan1Cash: number;
  cfDec31Cash: number;
  naJan1Balance: number;
  naRestatedBalance: number;
  naSurplus: number;
  naOtherCalendarChanges: number;
  naDec31Balance: number;
}

export interface AuditCheckItem {
  id:
    | 'sfp_accum_surplus_vs_na_ending'
    | 'sfp_cash_vs_cf_ending'
    | 'equity_vs_assets_less_liab'
    | 'perf_surplus_vs_na_surplus'
    | 'na_beg_vs_prev_ending'
    | 'cf_beg_vs_prev_ending';
  number: number;
  title: string;
  ruleDescription: string;
  currentYear: AuditYearEvaluation;
  priorYear: AuditYearEvaluation;
  overallStatus: 'pass' | 'fail';
}

export interface FullCrossStatementAuditReport {
  currentYear: string;
  priorYear: string;
  priorPriorYear: string;
  checks: AuditCheckItem[];
  totalApplicableEvaluations: number;
  passedEvaluations: number;
  failedEvaluations: number;
  failedChecksCount: number;
  allPassed: boolean;
  currentSfp: CalculatedReport;
  priorSfp: CalculatedReport;
  contexts: Record<string, YearStatementSnippetContext>;
}

const round2 = (val: number): number => {
  const rounded = Math.round(val * 100) / 100;
  return Math.abs(rounded) < 0.005 ? 0 : rounded;
};

function computePerformanceMetrics(
  lineItems: LineItemDefinition[],
  report: CalculatedReport
) {
  const perfItems = lineItems.filter(
    (i) => (i.statementType || 'position') === 'performance'
  );
  const sumPerfNet = (items: LineItemDefinition[]) =>
    items.reduce((sum, item) => {
      const v = report.values[item.id] || 0;
      return sum + (item.isContra ? -v : v);
    }, 0);

  const revItems = perfItems.filter((i) => i.section === 'REVENUE');
  const expItems = perfItems.filter((i) => i.section === 'EXPENSES');
  const trItems = perfItems.filter((i) => i.section === 'TRANSFERS');
  const trFromItems = trItems.filter((i) => !i.group.startsWith('Less:'));
  const trToItems = trItems.filter((i) => i.group.startsWith('Less:'));
  const nonOpItems = perfItems.filter((i) => i.section === 'NON_OPERATING');
  const lossItems = perfItems.filter((i) => i.section === 'LOSSES');

  const perfTotalRevenue = round2(sumPerfNet(revItems));
  const perfTotalExpenses = round2(sumPerfNet(expItems));
  const netTransfers = sumPerfNet(trFromItems) - sumPerfNet(trToItems);
  const netNonOp = sumPerfNet(nonOpItems);
  const totalLosses = lossItems.reduce(
    (sum, item) => sum + Math.abs(report.values[item.id] || 0),
    0
  );
  const perfSurplus = round2(
    perfTotalRevenue - perfTotalExpenses + netTransfers + netNonOp - totalLosses
  );

  return {
    perfTotalRevenue,
    perfTotalExpenses,
    perfSurplus,
  };
}

function buildComparisonEvaluation(
  year: string,
  leftLabel: string,
  leftAmount: number,
  rightLabel: string,
  rightAmount: number,
  note?: string
): AuditYearEvaluation {
  const left = round2(leftAmount);
  const right = round2(rightAmount);
  const difference = round2(left - right);
  const absDifference = Math.abs(difference);
  const status: AuditCheckStatus = absDifference < 0.01 ? 'pass' : 'fail';

  return {
    year,
    leftLabel,
    leftAmount: left,
    rightLabel,
    rightAmount: right,
    difference,
    absDifference,
    status,
    note,
  };
}

export function buildCrossStatementAuditReport(
  lineItems: LineItemDefinition[],
  dataStore: FinancialDataStore,
  selectedYear: string,
  divisionId?: string
): FullCrossStatementAuditReport {
  const priorYear = getComparativeYear(selectedYear);
  const priorPriorYear = getComparativeYear(priorYear);

  const buildYearBundle = (yr: string) => {
    const sfp = calculateReport(lineItems, dataStore, yr, divisionId);
    const cf = calculateCashFlowsSummary(lineItems, dataStore, yr, divisionId);
    const na = calculateNetAssetsSummary(dataStore, yr, divisionId);
    const perf = computePerformanceMetrics(lineItems, sfp);

    const context: YearStatementSnippetContext = {
      year: yr,
      sfpCash: round2(sfp.groupTotals['Current Assets__Cash and Cash Equivalents'] || 0),
      sfpCurrentAssets: round2(sfp.totalCurrentAssets),
      sfpTotalAssets: round2(sfp.totalAssets),
      sfpTotalLiabilities: round2(sfp.totalLiabilities),
      sfpAssetsLessLiabilities: round2(sfp.assetsLessLiabilities),
      sfpAccumulatedSurplus: round2(sfp.values['accumulated_surplus_deficit'] || 0),
      sfpTotalEquity: round2(sfp.totalEquity),
      perfRevenue: perf.perfTotalRevenue,
      perfExpenses: perf.perfTotalExpenses,
      perfSurplus: perf.perfSurplus,
      cfNetChange: round2(cf.netIncreaseDecrease),
      cfFxEffects: round2(cf.fxEffects),
      cfJan1Cash: round2(cf.january1Cash),
      cfDec31Cash: round2(cf.december31Cash),
      naJan1Balance: round2(na.january1Balance),
      naRestatedBalance: round2(na.restatedBalance),
      naSurplus: round2(na.surplusDeficitForPeriod),
      naOtherCalendarChanges: round2(na.netRevenueAdjustment + na.others),
      naDec31Balance: round2(na.december31Balance),
    };

    return {
      yr,
      prevYr: getComparativeYear(yr),
      hasPrevSystemYear: Number(getComparativeYear(yr)) >= EARLIEST_YEAR,
      sfp,
      cf,
      na,
      perfSurplus: perf.perfSurplus,
      context,
    };
  };

  const curr = buildYearBundle(selectedYear);
  const prev = buildYearBundle(priorYear);
  const prevPrev =
    Number(priorPriorYear) >= EARLIEST_YEAR ? buildYearBundle(priorPriorYear) : null;

  const contexts: Record<string, YearStatementSnippetContext> = {
    [curr.yr]: curr.context,
    [prev.yr]: prev.context,
    ...(prevPrev ? { [prevPrev.yr]: prevPrev.context } : {}),
  };

  const makePriorUnavailableEval = (
    yr: string,
    leftLabel: string,
    leftAmount: number,
    rightLabel: string
  ): AuditYearEvaluation => ({
    year: yr,
    leftLabel,
    leftAmount: round2(leftAmount),
    rightLabel,
    rightAmount: 0,
    difference: 0,
    absDifference: 0,
    status: 'na',
    note: `FY ${getComparativeYear(yr)} is outside system range (FY ${EARLIEST_YEAR}+); Jan 1 is baseline input.`,
  });

  const check1: AuditCheckItem = {
    id: 'sfp_accum_surplus_vs_na_ending',
    number: 1,
    title: 'Accumulated Surplus/(Deficit) = SCNAE Balance, Dec 31',
    ruleDescription:
      'Accumulated Surplus/(Deficit) in Statement of Financial Position must equal Balance at December 31 of Statement of Changes in Net Assets/Equity.',
    currentYear: buildComparisonEvaluation(
      curr.yr,
      'SFP Accum. Surplus/(Deficit)',
      curr.context.sfpAccumulatedSurplus,
      'SCNAE Balance, Dec 31',
      curr.context.naDec31Balance
    ),
    priorYear: buildComparisonEvaluation(
      prev.yr,
      'SFP Accum. Surplus/(Deficit)',
      prev.context.sfpAccumulatedSurplus,
      'SCNAE Balance, Dec 31',
      prev.context.naDec31Balance
    ),
    overallStatus: 'pass',
  };

  const check2: AuditCheckItem = {
    id: 'sfp_cash_vs_cf_ending',
    number: 2,
    title: 'SFP Cash & Cash Equivalents = SCF Cash, Dec 31',
    ruleDescription:
      'Cash and Cash Equivalents in Statement of Financial Position must equal Cash and Cash Equivalents, December 31 in Statement of Cash Flows.',
    currentYear: buildComparisonEvaluation(
      curr.yr,
      'SFP Cash & Cash Equivalents',
      curr.context.sfpCash,
      'SCF Cash, Dec 31',
      curr.context.cfDec31Cash
    ),
    priorYear: buildComparisonEvaluation(
      prev.yr,
      'SFP Cash & Cash Equivalents',
      prev.context.sfpCash,
      'SCF Cash, Dec 31',
      prev.context.cfDec31Cash
    ),
    overallStatus: 'pass',
  };

  const check3: AuditCheckItem = {
    id: 'equity_vs_assets_less_liab',
    number: 3,
    title: 'Total Net Assets/Equity = Total Assets − Total Liabilities',
    ruleDescription:
      'Total Net Assets/Equity in Statement of Financial Position must equal Total Assets less Total Liabilities.',
    currentYear: buildComparisonEvaluation(
      curr.yr,
      'Total Net Assets/Equity',
      curr.context.sfpTotalEquity,
      'Total Assets − Total Liabilities',
      curr.context.sfpAssetsLessLiabilities
    ),
    priorYear: buildComparisonEvaluation(
      prev.yr,
      'Total Net Assets/Equity',
      prev.context.sfpTotalEquity,
      'Total Assets − Total Liabilities',
      prev.context.sfpAssetsLessLiabilities
    ),
    overallStatus: 'pass',
  };

  const check4: AuditCheckItem = {
    id: 'perf_surplus_vs_na_surplus',
    number: 4,
    title: 'SFPerf Surplus/(Deficit) = SCNAE Surplus/(Deficit)',
    ruleDescription:
      'Surplus/(Deficit) for the Period in Statement of Financial Performance must equal Surplus/(Deficit) for the Period in Statement of Changes in Net Assets/Equity.',
    currentYear: buildComparisonEvaluation(
      curr.yr,
      'SFPerf Surplus/(Deficit)',
      curr.context.perfSurplus,
      'SCNAE Surplus/(Deficit)',
      curr.context.naSurplus
    ),
    priorYear: buildComparisonEvaluation(
      prev.yr,
      'SFPerf Surplus/(Deficit)',
      prev.context.perfSurplus,
      'SCNAE Surplus/(Deficit)',
      prev.context.naSurplus
    ),
    overallStatus: 'pass',
  };

  const check5: AuditCheckItem = {
    id: 'na_beg_vs_prev_ending',
    number: 5,
    title: 'SCNAE Balance, Jan 1 = Prior Year Balance, Dec 31',
    ruleDescription:
      'Beginning balance of Statement of Changes in Net Assets/Equity must equal Balance at December 31 of the previous year.',
    currentYear: curr.hasPrevSystemYear
      ? buildComparisonEvaluation(
          curr.yr,
          `SCNAE Balance, Jan 1 (${curr.yr})`,
          curr.context.naJan1Balance,
          `SCNAE Balance, Dec 31 (${curr.prevYr})`,
          prev.context.naDec31Balance
        )
      : makePriorUnavailableEval(
          curr.yr,
          `SCNAE Balance, Jan 1 (${curr.yr})`,
          curr.context.naJan1Balance,
          `SCNAE Balance, Dec 31 (${curr.prevYr})`
        ),
    priorYear:
      prev.hasPrevSystemYear && prevPrev
        ? buildComparisonEvaluation(
            prev.yr,
            `SCNAE Balance, Jan 1 (${prev.yr})`,
            prev.context.naJan1Balance,
            `SCNAE Balance, Dec 31 (${prev.prevYr})`,
            prevPrev.context.naDec31Balance
          )
        : makePriorUnavailableEval(
            prev.yr,
            `SCNAE Balance, Jan 1 (${prev.yr})`,
            prev.context.naJan1Balance,
            `SCNAE Balance, Dec 31 (${prev.prevYr})`
          ),
    overallStatus: 'pass',
  };

  const check6: AuditCheckItem = {
    id: 'cf_beg_vs_prev_ending',
    number: 6,
    title: 'SCF Cash, Jan 1 = Prior Year Cash, Dec 31',
    ruleDescription:
      'Cash and Cash Equivalents, January 1 in Statement of Cash Flows must equal Cash and Cash Equivalents, December 31 of the previous year.',
    currentYear: curr.hasPrevSystemYear
      ? buildComparisonEvaluation(
          curr.yr,
          `SCF Cash, Jan 1 (${curr.yr})`,
          curr.context.cfJan1Cash,
          `SCF Cash, Dec 31 (${curr.prevYr})`,
          prev.context.cfDec31Cash
        )
      : makePriorUnavailableEval(
          curr.yr,
          `SCF Cash, Jan 1 (${curr.yr})`,
          curr.context.cfJan1Cash,
          `SCF Cash, Dec 31 (${curr.prevYr})`
        ),
    priorYear:
      prev.hasPrevSystemYear && prevPrev
        ? buildComparisonEvaluation(
            prev.yr,
            `SCF Cash, Jan 1 (${prev.yr})`,
            prev.context.cfJan1Cash,
            `SCF Cash, Dec 31 (${prev.prevYr})`,
            prevPrev.context.cfDec31Cash
          )
        : makePriorUnavailableEval(
            prev.yr,
            `SCF Cash, Jan 1 (${prev.yr})`,
            prev.context.cfJan1Cash,
            `SCF Cash, Dec 31 (${prev.prevYr})`
          ),
    overallStatus: 'pass',
  };

  const checks = [check1, check2, check3, check4, check5, check6].map((chk) => ({
    ...chk,
    overallStatus:
      chk.currentYear.status === 'fail' || chk.priorYear.status === 'fail'
        ? ('fail' as const)
        : ('pass' as const),
  }));

  let totalApplicableEvaluations = 0;
  let passedEvaluations = 0;
  let failedEvaluations = 0;

  checks.forEach((chk) => {
    [chk.currentYear, chk.priorYear].forEach((ev) => {
      if (ev.status === 'na') return;
      totalApplicableEvaluations++;
      if (ev.status === 'pass') passedEvaluations++;
      else failedEvaluations++;
    });
  });

  const failedChecksCount = checks.filter((c) => c.overallStatus === 'fail').length;

  return {
    currentYear: selectedYear,
    priorYear,
    priorPriorYear,
    checks,
    totalApplicableEvaluations,
    passedEvaluations,
    failedEvaluations,
    failedChecksCount,
    allPassed: failedChecksCount === 0,
    currentSfp: curr.sfp,
    priorSfp: prev.sfp,
    contexts,
  };
}
