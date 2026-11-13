import * as XLSX from 'xlsx';
import { LineItemDefinition } from '../types/fs';
import { YEAR_RANGE } from './yearUtils';

export interface DetectedYearColumn {
  colIndex: number;
  colLetter: string;
  year: string;
  headerText: string;
  groupLabel?: string;
}

export interface SheetInspectionResult {
  sheetName: string;
  totalRows: number;
  totalCols: number;
  headerRowIndex: number; // 0-based; -1 if no year header row was detected
  detectedYearColumns: DetectedYearColumn[];
  candidateColumns: { colIndex: number; colLetter: string; headerSample: string; hasNumbers: boolean }[];
}

export interface YearImportColumnTarget {
  id: string;
  colIndex: number;
  colLetter: string;
  targetYear: string;
  headerText: string;
  enabled: boolean;
}

export type MatchConfidenceType = 'exact' | 'alias' | 'normalized' | 'suggested' | 'low' | 'none';

export interface LineItemRecommendation {
  bestItem: LineItemDefinition | null;
  confidence: number; // 0..100
  matchType: MatchConfidenceType;
  alternatives: { item: LineItemDefinition; confidence: number }[];
}

export interface ExtractedPositionRow {
  rowId: string;
  excelRowNumber: number; // 1-based Excel row number
  accountCode?: string;
  rawName: string;
  cleanedName: string;
  sourceColIndex: number;
  sourceColLetter: string;
  amountsByTargetId: Record<string, number | null>;
  isSummaryRow: boolean;
  isLumpedDepreciation?: boolean;
  summaryReason?: string;
  summaryKind?:
    | 'total_assets'
    | 'total_liabilities'
    | 'total_equity'
    | 'total_liabilities_equity'
    | 'subtotal'
    | 'hierarchy_group'
    | 'net_value'
    | 'lumped_depreciation'
    | 'equity_ignored';
  included: boolean;
  selectedLineItemId: string;
  recommendation: LineItemRecommendation;
  userModified: boolean;
}

export const EXCEL_ALIAS_STORAGE_KEY = 'deped_ro6_position_excel_aliases_v1';

export function loadSavedPositionAliases(): Record<string, string> {
  try {
    const raw = localStorage.getItem(EXCEL_ALIAS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

export function savePositionAlias(excelLabel: string, lineItemId: string): Record<string, string> {
  const key = normalizeAliasKey(excelLabel);
  const current = loadSavedPositionAliases();
  if (!key) return current;
  const next = { ...current, [key]: lineItemId };
  try {
    localStorage.setItem(EXCEL_ALIAS_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore storage quota errors
  }
  return next;
}

export function normalizeAliasKey(text: string): string {
  return cleanAccountLabel(text).toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function colIndexToLetter(index: number): string {
  let n = index;
  let letter = '';
  while (n >= 0) {
    letter = String.fromCharCode((n % 26) + 65) + letter;
    n = Math.floor(n / 26) - 1;
  }
  return letter;
}

function getFormattedCellText(sheet: XLSX.WorkSheet, r: number, c: number, rawVal: unknown): string {
  const addr = XLSX.utils.encode_cell({ r, c });
  const cell = sheet[addr];
  if (cell && typeof cell.w === 'string' && cell.w.trim() !== '') {
    return cell.w.trim();
  }
  if (rawVal === null || rawVal === undefined) return '';
  return String(rawVal).trim();
}

function getCellFormula(sheet: XLSX.WorkSheet, r: number, c: number): string | undefined {
  const addr = XLSX.utils.encode_cell({ r, c });
  const cell = sheet[addr];
  if (cell && typeof cell.f === 'string' && cell.f.trim() !== '') {
    return cell.f.trim();
  }
  return undefined;
}

/**
 * Extracts a fiscal year (2000..2099) from a header cell, avoiding monetary decimals like 2,025.00.
 */
export function extractYearFromHeaderCell(rawVal: unknown, formattedText: string): string | null {
  const text = formattedText.trim();
  if (!text && (rawVal === null || rawVal === undefined || rawVal === '')) return null;

  if (/[₱$€£]/.test(text) || /\.\d{2}\b/.test(text) || /^\(.*\)$/.test(text) || /,\d{3}/.test(text)) {
    return null;
  }

  if (typeof rawVal === 'number' && Number.isInteger(rawVal) && rawVal >= 2000 && rawVal <= 2099) {
    return String(rawVal);
  }

  if (typeof rawVal === 'number' && rawVal > 32000 && rawVal < 74000 && text.includes('/')) {
    const parsedDate = XLSX.SSF?.parse_date_code?.(rawVal);
    if (parsedDate && parsedDate.y >= 2000 && parsedDate.y <= 2099) {
      return String(parsedDate.y);
    }
  }

  const fourDigitMatch = text.match(/\b(20\d{2})\b/);
  if (fourDigitMatch) {
    const yr = Number(fourDigitMatch[1]);
    if (yr >= 2000 && yr <= 2099 && !/20\d{2}-\d{2}-\d{4,}/.test(text)) {
      return String(yr);
    }
  }

  const shortDateMatch = text.match(/\b(?:12\/31|dec(?:ember)?\s*31)[,\s/\-]+(\d{2})\b/i);
  if (shortDateMatch) {
    const yr = 2000 + Number(shortDateMatch[1]);
    if (yr >= 2000 && yr <= 2099) return String(yr);
  }

  return null;
}

/**
 * Parses an Excel/CSV cell into a number (null if blank, 0 if explicit dash "-").
 */
export function parseExcelNumericCell(rawVal: unknown, formattedText?: string): { hasValue: boolean; value: number } {
  if (typeof rawVal === 'number') {
    if (Number.isNaN(rawVal)) return { hasValue: false, value: 0 };
    return { hasValue: true, value: rawVal };
  }

  const text = (formattedText ?? String(rawVal ?? '')).trim();
  if (!text) return { hasValue: false, value: 0 };

  if (/^[-–—]+$/.test(text) || /^[₱$]\s*[-–—]+$/.test(text)) {
    return { hasValue: true, value: 0 };
  }

  let clean = text.replace(/[₱$,\s]/g, '');
  let negative = false;
  if (clean.startsWith('(') && clean.endsWith(')')) {
    negative = true;
    clean = clean.slice(1, -1);
  }

  if (!/^[+-]?\d+(\.\d+)?$/.test(clean)) {
    return { hasValue: false, value: 0 };
  }

  const parsed = parseFloat(clean);
  if (Number.isNaN(parsed)) return { hasValue: false, value: 0 };
  return { hasValue: true, value: negative ? -Math.abs(parsed) : parsed };
}

/**
 * Inspects a worksheet to locate the year header row (e.g., Row 8 with 2025 in Col E and 2024 in Col F)
 * and lists candidate numeric columns.
 */
export function inspectPositionWorksheet(
  sheet: XLSX.WorkSheet,
  sheetName: string,
  preferredCurrentYear: string,
  preferredComparativeYear: string
): SheetInspectionResult {
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '', raw: true });
  const totalRows = rows.length;
  const totalCols = rows.reduce((max, r) => (Array.isArray(r) ? Math.max(max, r.length) : max), 0);

  const countNumbersBelow = (rowIdx: number, colIdx: number): number => {
    let count = 0;
    const limit = Math.min(totalRows, rowIdx + 120);
    for (let r = rowIdx + 1; r < limit; r++) {
      const row = rows[r];
      if (!Array.isArray(row)) continue;
      const fmt = getFormattedCellText(sheet, r, colIdx, row[colIdx]);
      const parsed = parseExcelNumericCell(row[colIdx], fmt);
      if (parsed.hasValue && parsed.value !== 0) count++;
    }
    return count;
  };

  let bestRowIdx = -1;
  let bestScore = -1;
  let bestYearCols: DetectedYearColumn[] = [];

  const maxHeaderScanRows = Math.min(totalRows, 40);
  for (let r = 0; r < maxHeaderScanRows; r++) {
    const row = rows[r];
    if (!Array.isArray(row)) continue;

    const foundInRow: DetectedYearColumn[] = [];
    for (let c = 0; c < row.length; c++) {
      const fmt = getFormattedCellText(sheet, r, c, row[c]);
      const yr = extractYearFromHeaderCell(row[c], fmt);
      if (yr) {
        let groupLabel: string | undefined;
        for (let up = 1; up <= 2; up++) {
          if (r - up >= 0 && Array.isArray(rows[r - up])) {
            const upText = getFormattedCellText(sheet, r - up, c, rows[r - up][c]);
            if (upText && !extractYearFromHeaderCell(rows[r - up][c], upText)) {
              groupLabel = upText;
              break;
            }
          }
        }
        foundInRow.push({
          colIndex: c,
          colLetter: colIndexToLetter(c),
          year: yr,
          headerText: fmt || yr,
          groupLabel,
        });
      }
    }

    if (foundInRow.length === 0) continue;

    const validColsWithNumbers = foundInRow.filter((yc) => countNumbersBelow(r, yc.colIndex) > 0);
    if (validColsWithNumbers.length === 0 && foundInRow.length === 1) {
      continue;
    }

    const distinctYears = new Set(foundInRow.map((yc) => yc.year));
    let score = 0;
    score += distinctYears.size * 30;
    score += validColsWithNumbers.length * 40;
    if (distinctYears.has(preferredCurrentYear)) score += 25;
    if (distinctYears.has(preferredComparativeYear)) score += 20;
    if (foundInRow.every((yc) => yc.colIndex >= 1)) score += 15;
    score -= r * 0.25;

    if (score > bestScore) {
      bestScore = score;
      bestRowIdx = r;
      bestYearCols = validColsWithNumbers.length > 0 ? validColsWithNumbers : foundInRow;
    }
  }

  const candidateColumns: { colIndex: number; colLetter: string; headerSample: string; hasNumbers: boolean }[] = [];
  for (let c = 0; c < totalCols; c++) {
    const headerSample =
      bestRowIdx >= 0 && Array.isArray(rows[bestRowIdx])
        ? getFormattedCellText(sheet, bestRowIdx, c, rows[bestRowIdx][c])
        : Array.isArray(rows[0])
        ? getFormattedCellText(sheet, 0, c, rows[0][c])
        : '';
    const hasNumbers = countNumbersBelow(Math.max(bestRowIdx, -1), c) > 0;
    if (headerSample || hasNumbers) {
      candidateColumns.push({
        colIndex: c,
        colLetter: colIndexToLetter(c),
        headerSample,
        hasNumbers,
      });
    }
  }

  return {
    sheetName,
    totalRows,
    totalCols,
    headerRowIndex: bestRowIdx,
    detectedYearColumns: bestYearCols,
    candidateColumns,
  };
}

/**
 * Picks the most likely Statement of Financial Position sheet in a multi-sheet workbook.
 */
export function pickBestPositionSheetName(workbook: XLSX.WorkBook): string {
  const names = workbook.SheetNames;
  if (names.length <= 1) return names[0] || '';

  const sfpRegex = /(position|balance\s*sheet|\bsfp\b|\bbs\b)/i;
  const directHit = names.find((n) => sfpRegex.test(n));
  if (directHit) return directHit;

  for (const name of names) {
    const sheet = workbook.Sheets[name];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '', raw: true });
    const topText = rows
      .slice(0, 12)
      .flat()
      .map((v) => String(v ?? ''))
      .join(' ');
    if (/statement of financial position|total assets|current assets/i.test(topText)) {
      return name;
    }
  }

  return names[0];
}

// ============================================================================
// Misspelling-Tolerant Line Item Matching & Recommendation Engine
// ============================================================================

const ABBREVIATION_MAP: Record<string, string> = {
  acct: 'account',
  accts: 'accounts',
  accum: 'accumulated',
  acc: 'accumulated',
  admin: 'administrative',
  ag: 'agricultural',
  agri: 'agricultural',
  allow: 'allowance',
  amort: 'amortization',
  bldg: 'building',
  bldgs: 'buildings',
  comm: 'communications',
  const: 'construction',
  curr: 'current',
  depr: 'depreciation',
  deprec: 'depreciation',
  dev: 'development',
  devt: 'development',
  dist: 'distribution',
  educ: 'education',
  elect: 'electricity',
  emp: 'employees',
  eqpt: 'equipment',
  equip: 'equipment',
  equips: 'equipment',
  equiv: 'equivalents',
  fixt: 'fixtures',
  furn: 'furniture',
  gen: 'general',
  govt: 'government',
  imp: 'impairment',
  impair: 'impairment',
  impr: 'improvements',
  infra: 'infrastructure',
  inst: 'instructional',
  int: 'interest',
  intl: 'international',
  inv: 'inventory',
  invs: 'inventories',
  lab: 'laboratory',
  liab: 'liabilities',
  loc: 'local',
  mach: 'machinery',
  maint: 'maintenance',
  mat: 'materials',
  mats: 'materials',
  med: 'medical',
  misc: 'miscellaneous',
  natl: 'national',
  off: 'officer',
  offs: 'officers',
  op: 'operating',
  oper: 'operating',
  pay: 'payable',
  rec: 'receivable',
  recv: 'receivable',
  recvble: 'receivable',
  reg: 'regular',
  rep: 'repairs',
  sav: 'savings',
  sch: 'school',
  semiexp: 'semi expendable',
  supp: 'supplies',
  sup: 'supplies',
  tech: 'technical',
  trans: 'transportation',
  transp: 'transportation',
  treas: 'treasury',
};

const STOP_WORDS = new Set(['and', 'or', 'of', 'the', 'for', 'in', 'to', 'from', 'on', 'at', 'by', 'with']);

export function cleanAccountLabel(raw: string): string {
  let s = raw.trim();
  s = s.replace(/^\d{1,3}(?:[-.]\d{2,4}){2,5}\s*[-–—:]?\s*/, '');
  s = s.replace(/^\d{6,12}\s*[-–—:]?\s*/, '');
  s = s.replace(/\s*[\(\[]?\bnote\s*#?\s*\d+[a-z]?[\)\]]?\s*$/i, '');
  s = s.replace(/[–—]/g, '-').replace(/\s+/g, ' ').trim();
  return s;
}

function expandToken(token: string): string[] {
  const expanded = ABBREVIATION_MAP[token] || token;
  return expanded.split(/\s+/).filter(Boolean);
}

function tokenizeAndExpand(text: string): string[] {
  const rawTokens = text
    .toLowerCase()
    .replace(/semi[-\s]?exp(?:endable)?/g, 'semi expendable')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

  const out: string[] = [];
  rawTokens.forEach((tok) => {
    expandToken(tok).forEach((e) => out.push(e));
  });
  return out;
}

function singularizeToken(tok: string): string {
  if (tok.length <= 3) return tok;
  if (tok.endsWith('ies') && tok.length > 4) return tok.slice(0, -3) + 'y';
  if (tok.endsWith('s') && !tok.endsWith('ss')) return tok.slice(0, -1);
  return tok;
}

function damerauLevenshtein(a: string, b: string): number {
  const la = a.length;
  const lb = b.length;
  if (la === 0) return lb;
  if (lb === 0) return la;

  const dp: number[][] = Array.from({ length: la + 1 }, () => new Array(lb + 1).fill(0));
  for (let i = 0; i <= la; i++) dp[i][0] = i;
  for (let j = 0; j <= lb; j++) dp[0][j] = j;

  for (let i = 1; i <= la; i++) {
    for (let j = 1; j <= lb; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let val = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        val = Math.min(val, dp[i - 2][j - 2] + 1);
      }
      dp[i][j] = val;
    }
  }
  return dp[la][lb];
}

function tokenSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  const sa = singularizeToken(a);
  const sb = singularizeToken(b);
  if (sa === sb) return 0.96;

  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;

  if (maxLen >= 5 && (a.startsWith(b) || b.startsWith(a))) {
    const minLen = Math.min(a.length, b.length);
    if (minLen >= 4) {
      return Math.max(0.72, minLen / maxLen);
    }
  }

  const dist = Math.min(damerauLevenshtein(a, b), damerauLevenshtein(sa, sb));
  return Math.max(0, 1 - dist / maxLen);
}

function diceBigramSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;

  const bigramsA = new Map<string, number>();
  for (let i = 0; i < a.length - 1; i++) {
    const bg = a.slice(i, i + 2);
    bigramsA.set(bg, (bigramsA.get(bg) || 0) + 1);
  }

  let matches = 0;
  for (let i = 0; i < b.length - 1; i++) {
    const bg = b.slice(i, i + 2);
    const count = bigramsA.get(bg) || 0;
    if (count > 0) {
      matches++;
      bigramsA.set(bg, count - 1);
    }
  }

  return (2 * matches) / (a.length - 1 + (b.length - 1));
}

const CONTRA_KEYWORDS = ['allowance', 'impairment', 'accumulated', 'depreciation', 'amortization', 'contra'];

function hasContraKeywords(tokens: string[]): boolean {
  return tokens.some((t) => {
    const sing = singularizeToken(t);
    return CONTRA_KEYWORDS.some((kw) => t === kw || sing === kw || tokenSimilarity(t, kw) >= 0.72);
  });
}

function hasSemiKeywords(tokens: string[]): boolean {
  return tokens.some(
    (t) => t === 'semi' || t === 'semiexpendable' || tokenSimilarity(t, 'semiexpendable') >= 0.78
  );
}

function scoreStringSimilarity(rawQuery: string, targetLabel: string): number {
  const cleanedQuery = cleanAccountLabel(rawQuery);
  if (!cleanedQuery) return 0;

  const qLower = cleanedQuery.toLowerCase();
  const cLower = targetLabel.toLowerCase().trim();
  if (qLower === cLower) return 100;

  const qAlpha = qLower.replace(/[^a-z0-9]/g, '');
  const cAlpha = cLower.replace(/[^a-z0-9]/g, '');
  if (qAlpha && qAlpha === cAlpha) return 99;

  const qTokensAll = tokenizeAndExpand(cleanedQuery);
  const cTokensAll = tokenizeAndExpand(targetLabel);
  const qExpandedAlpha = qTokensAll.join('');
  const cExpandedAlpha = cTokensAll.join('');

  if (qExpandedAlpha && qExpandedAlpha === cExpandedAlpha) return 97;

  const qSingAlpha = qTokensAll.map(singularizeToken).join('');
  const cSingAlpha = cTokensAll.map(singularizeToken).join('');
  if (qSingAlpha && qSingAlpha === cSingAlpha) return 95;

  const qContent = qTokensAll.filter((t) => !STOP_WORDS.has(t));
  const cContent = cTokensAll.filter((t) => !STOP_WORDS.has(t));
  const qSet = qContent.length > 0 ? qContent : qTokensAll;
  const cSet = cContent.length > 0 ? cContent : cTokensAll;

  if (qSet.length === 0 || cSet.length === 0) return 0;

  let forwardSum = 0;
  for (const qt of qSet) {
    let best = 0;
    for (const ct of cSet) {
      const s = tokenSimilarity(qt, ct);
      if (s > best) best = s;
    }
    forwardSum += best;
  }
  const forwardAvg = forwardSum / qSet.length;

  let backwardSum = 0;
  for (const ct of cSet) {
    let best = 0;
    for (const qt of qSet) {
      const s = tokenSimilarity(ct, qt);
      if (s > best) best = s;
    }
    backwardSum += best;
  }
  const backwardAvg = backwardSum / cSet.length;

  const tokenF1 =
    forwardAvg + backwardAvg > 0 ? (2 * forwardAvg * backwardAvg) / (forwardAvg + backwardAvg) : 0;

  const bigramSim = diceBigramSimilarity(qExpandedAlpha, cExpandedAlpha);
  const maxStrLen = Math.max(qExpandedAlpha.length, cExpandedAlpha.length);
  const fullEditSim =
    maxStrLen > 0 ? Math.max(0, 1 - damerauLevenshtein(qExpandedAlpha, cExpandedAlpha) / maxStrLen) : 0;

  return Math.max(0, Math.min(94, Math.round((tokenF1 * 0.62 + bigramSim * 0.22 + fullEditSim * 0.16) * 94)));
}

function scoreLineItemMatch(rawQuery: string, item: LineItemDefinition): number {
  let score = scoreStringSimilarity(rawQuery, item.name);
  if (score === 0) return 0;

  const qTokensAll = tokenizeAndExpand(cleanAccountLabel(rawQuery));
  const cTokensAll = tokenizeAndExpand(item.name);

  const qContra = hasContraKeywords(qTokensAll);
  const cContra = Boolean(item.isContra) || hasContraKeywords(cTokensAll);
  if (qContra !== cContra) {
    score -= 22;
  }

  const qSemi = hasSemiKeywords(qTokensAll);
  const cSemi = hasSemiKeywords(cTokensAll);
  if (qSemi !== cSemi) {
    score -= 18;
  }

  const qDist = qTokensAll.includes('distribution');
  const cDist = cTokensAll.includes('distribution');
  const qInv = qTokensAll.includes('inventory') || qTokensAll.includes('inventories');
  const cInv = cTokensAll.includes('inventory') || cTokensAll.includes('inventories');
  if ((qDist && !cDist && cInv) || (qInv && !cInv && cDist)) {
    score -= 12;
  }

  return Math.max(0, Math.min(100, score));
}

export function matchLineItemWithRecommendation(
  rawName: string,
  encodableItems: LineItemDefinition[],
  savedAliases: Record<string, string> = {}
): LineItemRecommendation {
  const aliasKey = normalizeAliasKey(rawName);
  if (aliasKey && savedAliases[aliasKey]) {
    const aliasItem = encodableItems.find((i) => i.id === savedAliases[aliasKey]);
    if (aliasItem) {
      return {
        bestItem: aliasItem,
        confidence: 100,
        matchType: 'alias',
        alternatives: [],
      };
    }
  }

  const scored = encodableItems
    .map((item) => ({
      item,
      confidence: scoreLineItemMatch(rawName, item),
    }))
    .filter((entry) => entry.confidence >= 35)
    .sort((a, b) => b.confidence - a.confidence || a.item.order - b.item.order);

  if (scored.length === 0) {
    return {
      bestItem: null,
      confidence: 0,
      matchType: 'none',
      alternatives: [],
    };
  }

  const top = scored[0];
  let matchType: MatchConfidenceType = 'low';
  if (top.confidence >= 99) matchType = 'exact';
  else if (top.confidence >= 95) matchType = 'normalized';
  else if (top.confidence >= 66) matchType = 'suggested';

  return {
    bestItem: top.item,
    confidence: top.confidence,
    matchType,
    alternatives: scored.slice(0, 3),
  };
}

// ============================================================================
// Higher-Level Hierarchy & Summary Row Detection (Lowest-Level Leaf Enforcement)
// ============================================================================

interface HierarchyClassifier {
  strictHierarchyLabels: string[];   // Group/Subgroup/Subsection names that NEVER match a leaf item name
  ambiguousHierarchyLabels: string[]; // Labels that exist BOTH as a group/subgroup header AND as a leaf item name
}

function buildHierarchyClassifier(encodableItems: LineItemDefinition[]): HierarchyClassifier {
  const leafNormSet = new Set(encodableItems.map((i) => normalizeAliasKey(i.name)));
  const allHierarchyRaw = new Map<string, string>();

  const register = (label?: string) => {
    if (!label) return;
    const key = normalizeAliasKey(label);
    if (key && !allHierarchyRaw.has(key)) {
      allHierarchyRaw.set(key, label);
    }
  };

  encodableItems.forEach((item) => {
    register(item.section);
    register(item.subsection);
    register(item.group);
    register(item.subgroup);
  });

  // Common alternative phrasings in division Excel sheets
  [
    'Property and Equipment',
    'Loans and Receivables',
    'Other Receivables',
    'Semi-Expendable Machinery and Equipment',
    'Semi-Expendable Furniture, Fixtures and Books',
  ].forEach(register);

  const strictHierarchyLabels: string[] = [];
  const ambiguousHierarchyLabels: string[] = [];

  allHierarchyRaw.forEach((label, key) => {
    if (leafNormSet.has(key)) {
      ambiguousHierarchyLabels.push(label);
    } else {
      strictHierarchyLabels.push(label);
    }
  });

  return { strictHierarchyLabels, ambiguousHierarchyLabels };
}

export function detectSummaryRowKind(
  rawName: string
): ExtractedPositionRow['summaryKind'] | undefined {
  const cleaned = cleanAccountLabel(rawName).toLowerCase().replace(/\s+/g, ' ').trim();
  if (!cleaned) return undefined;

  if (/^net\s+(?:book\s+)?value\b|^carrying\s+(?:amount|value)\b/.test(cleaned)) {
    return 'net_value';
  }
  if (/^total\s+assets\b/.test(cleaned) || cleaned === 'assets') {
    return 'total_assets';
  }
  if (/^total\s+liabilities\s+and\s+(?:net\s+assets|equity)/.test(cleaned)) {
    return 'total_liabilities_equity';
  }
  if (/^total\s+liabilities\b/.test(cleaned)) {
    return 'total_liabilities';
  }
  if (/^total\s+(?:net\s+assets|equity|government\s+equity)\b/.test(cleaned)) {
    return 'total_equity';
  }
  if (
    /^(?:sub-?total|total\b|grand\s+total\b|net\s+assets\/equity$)/.test(cleaned) ||
    /\bsubtotal\b/.test(cleaned)
  ) {
    return 'subtotal';
  }
  return undefined;
}

function isAccountCodeCell(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  return /^\d{1,3}(?:[-.]\d{2,4}){2,5}$/.test(t) || /^\d{6,12}$/.test(t);
}

function looksLikeNoteOrCodeOnly(text: string): boolean {
  const t = text.trim();
  if (!t) return true;
  if (/^(?:note\s*#?\s*)?\d+(?:\.\d+)?[a-z]?$/i.test(t)) return true;
  if (isAccountCodeCell(t)) return true;
  if (/^[-–—]+$/.test(t)) return true;
  return false;
}

function isSumFormulaString(formula?: string): boolean {
  if (!formula) return false;
  const f = formula.toUpperCase();
  // Same-sheet SUM(...) or + / - between cell references (e.g. "SUM(E10:E12)" or "E10+E11")
  if (/\bSUM\s*\(/.test(f) && !f.includes('!')) return true;
  if (/^[A-Z]{1,3}\d+(?:\s*[+-]\s*[A-Z]{1,3}\d+)+$/.test(f.replace(/\s+/g, ''))) return true;
  return false;
}

/**
 * Detects generic/lumped Accumulated Depreciation rows (e.g. "Accumulated Depreciation",
 * "Less: Accumulated Depreciation", "Accum. Depr. - PPE") that combine all PPE classes
 * instead of specifying an individual PPE asset category.
 */
export function isLumpedAccumulatedDepreciation(rawName: string): boolean {
  let cleaned = cleanAccountLabel(rawName)
    .toLowerCase()
    .replace(/^(?:add\s*\/\s*)?(?:less|deduct)\s*[:\-–—]?\s*/i, '')
    .replace(/^(?:total\s+)/i, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned) return false;

  // Never treat "Accumulated Depreciation - Other Property, Plant and Equipment" as lumped
  if (/\bother\b/.test(cleaned)) return false;

  const tokens = cleaned
    .split(/\s+/)
    .flatMap((t) => {
      if (t === 'accu' || t === 'accum' || t === 'acc') return ['accumulated'];
      if (t === 'depr' || t === 'deprec' || t === 'depre') return ['depreciation'];
      if (t === 'imp' || t === 'impair') return ['impairment'];
      if (t === 'ppe') return ['property', 'plant', 'and', 'equipment'];
      return [t];
    });

  // Must mention accumulated + depreciation (with slight typo tolerance)
  const hasAccum = tokens.some((t) => t === 'accumulated' || tokenSimilarity(t, 'accumulated') >= 0.72);
  const hasDepr = tokens.some((t) => t === 'depreciation' || tokenSimilarity(t, 'depreciation') >= 0.72);
  if (!hasAccum || !hasDepr) return false;

  // Allowed generic/lumped filler words only (no specific asset class like buildings, equipment, vehicles, etc.)
  const ALLOWED_GENERIC_WORDS = new Set([
    'accumulated',
    'depreciation',
    'and',
    'impairment',
    'loss',
    'losses',
    'amortization',
    'property',
    'plant',
    'equipment',
    'all',
    'total',
    'ppe',
  ]);

  const remainingSpecific = tokens.filter((t) => {
    if (ALLOWED_GENERIC_WORDS.has(t)) return false;
    if (tokenSimilarity(t, 'accumulated') >= 0.72 || tokenSimilarity(t, 'depreciation') >= 0.72) {
      return false;
    }
    return true;
  });

  return remainingSpecific.length === 0;
}

type EquityRowRole =
  | 'ending_surplus_explicit'
  | 'surplus_unqualified'
  | 'beginning_surplus'
  | 'other_equity';

/**
 * Classifies a row inside the Equity / Net Assets portion of the Balance Sheet.
 * Only "Accumulated Surplus/(Deficit)" or "Accumulated Surplus/(Deficit, end)" should be imported.
 */
function classifyEquityRow(rawName: string): EquityRowRole {
  const cleaned = cleanAccountLabel(rawName).toLowerCase().replace(/\s+/g, ' ').trim();
  if (!cleaned) return 'other_equity';

  const tokens = cleaned
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

  const hasAccumulated = tokens.some(
    (t) => t === 'accumulated' || t === 'accum' || tokenSimilarity(t, 'accumulated') >= 0.72
  );
  const hasSurplusOrDeficit = tokens.some(
    (t) =>
      t === 'surplus' ||
      t === 'deficit' ||
      tokenSimilarity(t, 'surplus') >= 0.74 ||
      tokenSimilarity(t, 'deficit') >= 0.74
  );

  // Exclude summary/total lines even if they mention equity
  if (/^(?:total|sub-?total|net\s+assets\/equity$)/.test(cleaned)) {
    return 'other_equity';
  }

  if (hasAccumulated && hasSurplusOrDeficit) {
    // Explicit beginning balance -> skip
    if (/\b(?:beg|beginning|jan(?:uary)?\s*1|opening|start)\b/i.test(cleaned)) {
      return 'beginning_surplus';
    }
    // Explicit ending balance -> keep! (e.g. "Accumulated Surplus/(Deficit, end)", "Accumulated Surplus/(Deficit), End")
    if (/\b(?:end|ending|dec(?:ember)?\s*31|closing)\b/i.test(cleaned)) {
      return 'ending_surplus_explicit';
    }
    return 'surplus_unqualified';
  }

  return 'other_equity';
}

function isEquitySectionEntryText(rawName: string): boolean {
  const cleaned = cleanAccountLabel(rawName).toLowerCase().replace(/\s+/g, ' ').trim();
  if (!cleaned) return false;
  if (/^(?:net\s+assets\s*\/\s*equity|net\s+assets\s+and\s+equity|equity|government\s+equity|shareholders?\s*equity)$/i.test(cleaned)) {
    return true;
  }
  if (/accumulated\s+surplus/i.test(cleaned)) {
    return true;
  }
  return false;
}

interface InternalRawRow {
  excelRowNumber: number;
  accountCode?: string;
  rawName: string;
  cleanedName: string;
  sourceColIndex: number;
  sourceColLetter: string;
  amountsByTargetId: Record<string, number | null>;
  hasSumFormula: boolean;
  strictSummaryKind?: ExtractedPositionRow['summaryKind'];
  isLumpedDep: boolean;
  inEquitySection: boolean;
  equityRole?: EquityRowRole;
  matchesStrictHierarchy: boolean;
  matchesAmbiguousHierarchy: boolean;
  fuzzyHierarchyScore: number;
}

/**
 * Checks whether `parentRow` equals the sum of consecutive leaf/non-summary rows below it
 * across all enabled numeric columns (handling both signed sums and contra deductions).
 */
function checkIfRollupOfRowsBelow(
  allRows: InternalRawRow[],
  parentIdx: number,
  activeTargetIds: string[],
  maxLookahead = 25
): { isRollup: boolean; childCount: number } {
  const parent = allRows[parentIdx];
  const nonZeroTargets = activeTargetIds.filter((tid) => {
    const v = parent.amountsByTargetId[tid];
    return v !== null && v !== undefined && Math.abs(v) >= 0.01;
  });

  if (nonZeroTargets.length === 0) return { isRollup: false, childCount: 0 };

  const sums: Record<string, number> = {};
  activeTargetIds.forEach((tid) => {
    sums[tid] = 0;
  });

  let leafChildrenCount = 0;
  const limit = Math.min(allRows.length, parentIdx + 1 + maxLookahead);

  for (let j = parentIdx + 1; j < limit; j++) {
    const child = allRows[j];

    // Skip nested sub-headers / subtotals / net-value rows while accumulating leaf items underneath
    if (child.strictSummaryKind || child.matchesStrictHierarchy) {
      // Stop early if we hit a major section/total boundary
      if (
        child.strictSummaryKind === 'total_assets' ||
        child.strictSummaryKind === 'total_liabilities' ||
        child.strictSummaryKind === 'total_equity' ||
        child.strictSummaryKind === 'total_liabilities_equity'
      ) {
        break;
      }
      continue;
    }

    // If child itself is a subgroup header that matches a collision name AND has no account code when parent had none, skip it as a nested header
    if (child.matchesAmbiguousHierarchy && !child.accountCode && leafChildrenCount > 0) {
      // Check if we already matched before hitting the next sibling group
      break;
    }

    leafChildrenCount++;
    activeTargetIds.forEach((tid) => {
      const val = child.amountsByTargetId[tid];
      if (val !== null && val !== undefined) {
        sums[tid] += val;
      }
    });

    // Check if ALL active target columns now match parent's values (within rounding tolerance 0.05)
    const allTargetsMatch = activeTargetIds.every((tid) => {
      const pVal = parent.amountsByTargetId[tid] ?? 0;
      const cSum = sums[tid] ?? 0;
      return Math.abs(pVal - cSum) <= 0.05;
    });

    if (allTargetsMatch && leafChildrenCount >= 1) {
      return { isRollup: true, childCount: leafChildrenCount };
    }
  }

  return { isRollup: false, childCount: 0 };
}

/**
 * Extracts Statement of Financial Position rows using:
 * - Rule 1: Amounts under detected year columns
 * - Rule 2: Line items before amounts on the same row
 * - Rule 3: Misspelling-tolerant recommendations
 * - Rule 4: Lowest-level leaf enforcement (excludes higher-level group/subgroup totals and Net Value rows)
 */
export function extractPositionRowsFromSheet(
  sheet: XLSX.WorkSheet,
  yearTargets: YearImportColumnTarget[],
  startRowIndex: number,
  lineItemColOverride: number | 'auto',
  encodableItems: LineItemDefinition[],
  savedAliases: Record<string, string>
): ExtractedPositionRow[] {
  const activeTargets = yearTargets.filter((t) => t.colIndex >= 0);
  if (activeTargets.length === 0) return [];

  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '', raw: true });
  const earliestAmountCol = Math.min(...activeTargets.map((t) => t.colIndex));
  const hierarchy = buildHierarchyClassifier(encodableItems);

  // Pass 1: Extract raw candidate rows with metadata & track entry into the Equity section
  const rawExtracted: InternalRawRow[] = [];
  let inEquitySection = false;
  let passedTotalLiabilities = false;

  for (let r = Math.max(0, startRowIndex); r < rows.length; r++) {
    const row = rows[r];
    if (!Array.isArray(row)) continue;

    // Inspect descriptive text before the earliest amount column first (so amount-less section headers
    // like "NET ASSETS/EQUITY" or "GOVERNMENT EQUITY" still trigger equity-section tracking!)
    let accountCode: string | undefined;
    for (let c = 0; c < earliestAmountCol; c++) {
      const cellTxt = getFormattedCellText(sheet, r, c, row[c]);
      if (isAccountCodeCell(cellTxt)) {
        accountCode = cellTxt.trim();
        break;
      }
    }

    let chosenCol = -1;
    let chosenText = '';

    if (lineItemColOverride !== 'auto') {
      if (lineItemColOverride < earliestAmountCol) {
        chosenCol = lineItemColOverride;
        chosenText = getFormattedCellText(sheet, r, chosenCol, row[chosenCol]);
      }
    } else {
      const candidateCells: { col: number; text: string }[] = [];
      for (let c = 0; c < earliestAmountCol; c++) {
        const text = getFormattedCellText(sheet, r, c, row[c]);
        if (text && !looksLikeNoteOrCodeOnly(text)) {
          candidateCells.push({ col: c, text });
        }
      }

      if (candidateCells.length === 1) {
        chosenCol = candidateCells[0].col;
        chosenText = candidateCells[0].text;
      } else if (candidateCells.length > 1) {
        let bestCandidateScore = -1;
        for (const cand of candidateCells) {
          const isSum = Boolean(detectSummaryRowKind(cand.text));
          const rec = matchLineItemWithRecommendation(cand.text, encodableItems, savedAliases);
          const effectiveScore = isSum ? 98 : rec.confidence;
          if (effectiveScore >= bestCandidateScore) {
            bestCandidateScore = effectiveScore;
            chosenCol = cand.col;
            chosenText = cand.text;
          }
        }
      }
    }

    if (chosenText && !looksLikeNoteOrCodeOnly(chosenText)) {
      if (isEquitySectionEntryText(chosenText) || passedTotalLiabilities) {
        inEquitySection = true;
      }
      if (detectSummaryRowKind(chosenText) === 'total_liabilities') {
        passedTotalLiabilities = true;
      }
    }

    const amountsByTargetId: Record<string, number | null> = {};
    let hasAnyNonZeroAmount = false;
    let hasAnyNumericCell = false;
    let hasSumFormula = false;

    for (const target of activeTargets) {
      const fmt = getFormattedCellText(sheet, r, target.colIndex, row[target.colIndex]);
      const parsed = parseExcelNumericCell(row[target.colIndex], fmt);
      const formula = getCellFormula(sheet, r, target.colIndex);
      if (isSumFormulaString(formula)) {
        hasSumFormula = true;
      }
      if (parsed.hasValue) {
        hasAnyNumericCell = true;
        amountsByTargetId[target.id] = parsed.value;
        if (Math.abs(parsed.value) >= 0.005) {
          hasAnyNonZeroAmount = true;
        }
      } else {
        amountsByTargetId[target.id] = null;
      }
    }

    if (!hasAnyNumericCell || !hasAnyNonZeroAmount) continue;
    if (!chosenText || looksLikeNoteOrCodeOnly(chosenText)) continue;

    // If account code was embedded inside chosenText (e.g. "1010102000 Petty Cash Fund"), capture it
    if (!accountCode) {
      const embeddedMatch = chosenText.trim().match(/^(\d{1,3}(?:[-.]\d{2,4}){2,5}|\d{6,12})\s*[-–—:]?\s+/);
      if (embeddedMatch) {
        accountCode = embeddedMatch[1];
      }
    }

    const cleanedName = cleanAccountLabel(chosenText);
    const strictSummaryKind = detectSummaryRowKind(chosenText);
    const isLumpedDep = isLumpedAccumulatedDepreciation(chosenText);
    const equityRole = inEquitySection ? classifyEquityRow(chosenText) : undefined;

    let maxStrictScore = 0;
    for (const hLabel of hierarchy.strictHierarchyLabels) {
      const s = scoreStringSimilarity(chosenText, hLabel);
      if (s > maxStrictScore) maxStrictScore = s;
    }

    let maxAmbiguousScore = 0;
    for (const hLabel of hierarchy.ambiguousHierarchyLabels) {
      const s = scoreStringSimilarity(chosenText, hLabel);
      if (s > maxAmbiguousScore) maxAmbiguousScore = s;
    }

    const matchesStrictHierarchy = maxStrictScore >= 86;
    const matchesAmbiguousHierarchy = maxAmbiguousScore >= 90;
    const fuzzyHierarchyScore = Math.max(maxStrictScore, maxAmbiguousScore);

    rawExtracted.push({
      excelRowNumber: r + 1,
      accountCode,
      rawName: chosenText,
      cleanedName,
      sourceColIndex: chosenCol,
      sourceColLetter: chosenCol >= 0 ? colIndexToLetter(chosenCol) : '?',
      amountsByTargetId,
      hasSumFormula,
      strictSummaryKind,
      isLumpedDep,
      inEquitySection,
      equityRole,
      matchesStrictHierarchy,
      matchesAmbiguousHierarchy,
      fuzzyHierarchyScore,
    });
  }

  // Determine whether this spreadsheet consistently includes UACS/account codes on leaf rows
  const codedRowCount = rawExtracted.filter((r) => Boolean(r.accountCode)).length;
  const sheetUsesAccountCodes = codedRowCount >= 3;
  const activeTargetIds = activeTargets.map((t) => t.id);

  // Check if Equity portion has an explicit "Accumulated Surplus/(Deficit, end)" row
  const hasExplicitEndingSurplus = rawExtracted.some(
    (r) => r.inEquitySection && r.equityRole === 'ending_surplus_explicit'
  );
  const equityLineItemDef =
    encodableItems.find((i) => i.id === 'accumulated_surplus_deficit') ||
    encodableItems.find((i) => /accumulated\s+surplus/i.test(i.name));

  // Pass 2: Enforce lowest-level leaf extraction, Equity rule, and Lumped Depreciation guard
  const finalRows: ExtractedPositionRow[] = [];

  for (let i = 0; i < rawExtracted.length; i++) {
    const raw = rawExtracted[i];
    let isSummaryRow = false;
    let summaryKind: ExtractedPositionRow['summaryKind'] = raw.strictSummaryKind;
    let summaryReason: string | undefined;
    let isLumpedDepreciation = false;

    if (raw.inEquitySection) {
      const isChosenEndingSurplus =
        raw.equityRole === 'ending_surplus_explicit' ||
        (!hasExplicitEndingSurplus && raw.equityRole === 'surplus_unqualified');

      if (!isChosenEndingSurplus) {
        isSummaryRow = true;
        summaryKind = raw.strictSummaryKind || 'equity_ignored';
        summaryReason =
          raw.equityRole === 'beginning_surplus'
            ? 'Beginning Equity balance (skipped — only ending balance needed)'
            : raw.equityRole === 'surplus_unqualified' && hasExplicitEndingSurplus
            ? 'Superseded by Accumulated Surplus/(Deficit, end)'
            : 'Equity section row (only Accumulated Surplus/(Deficit) needed)';
      }
    } else if (raw.isLumpedDep) {
      isSummaryRow = true;
      isLumpedDepreciation = true;
      summaryKind = 'lumped_depreciation';
      summaryReason = 'Lumped Accumulated Depreciation — request breakdown per PPE';
    } else if (raw.strictSummaryKind) {
      isSummaryRow = true;
      summaryReason =
        raw.strictSummaryKind === 'net_value'
          ? 'Net Value row (auto-computed)'
          : 'Total / Subtotal row (skipped)';
    } else if (raw.matchesStrictHierarchy) {
      isSummaryRow = true;
      summaryKind = 'hierarchy_group';
      summaryReason = 'Higher-level group total (auto-computed)';
    } else if (raw.matchesAmbiguousHierarchy) {
      const rollup = checkIfRollupOfRowsBelow(rawExtracted, i, activeTargetIds);
      const nextRow = rawExtracted[i + 1];
      const noCodeWhileSheetHasCodes =
        sheetUsesAccountCodes && !raw.accountCode && Boolean(nextRow && nextRow.accountCode);

      if (rollup.isRollup || noCodeWhileSheetHasCodes || (raw.hasSumFormula && !raw.accountCode)) {
        isSummaryRow = true;
        summaryKind = 'hierarchy_group';
        summaryReason = rollup.isRollup
          ? `Higher-level rollup of ${rollup.childCount} item${rollup.childCount > 1 ? 's' : ''} below`
          : 'Higher-level group total (no account code)';
      }
    } else if (!raw.accountCode) {
      const rollup = checkIfRollupOfRowsBelow(rawExtracted, i, activeTargetIds);
      if (
        rollup.isRollup &&
        rollup.childCount >= 2 &&
        (raw.hasSumFormula || sheetUsesAccountCodes || raw.fuzzyHierarchyScore >= 72)
      ) {
        isSummaryRow = true;
        summaryKind = 'hierarchy_group';
        summaryReason = `Higher-level rollup of ${rollup.childCount} items below`;
      }
    }

    let recommendation: LineItemRecommendation;
    let autoSelectedId = '';

    if (isSummaryRow) {
      recommendation = { bestItem: null, confidence: 0, matchType: 'none', alternatives: [] };
    } else if (raw.inEquitySection && equityLineItemDef) {
      recommendation = {
        bestItem: equityLineItemDef,
        confidence: 100,
        matchType: 'exact',
        alternatives: [],
      };
      autoSelectedId = equityLineItemDef.id;
    } else {
      recommendation = matchLineItemWithRecommendation(raw.rawName, encodableItems, savedAliases);
      autoSelectedId =
        recommendation.bestItem && recommendation.confidence >= 66 ? recommendation.bestItem.id : '';
    }

    finalRows.push({
      rowId: `xl-row-${raw.excelRowNumber}`,
      excelRowNumber: raw.excelRowNumber,
      accountCode: raw.accountCode,
      rawName: raw.rawName,
      cleanedName: raw.cleanedName,
      sourceColIndex: raw.sourceColIndex,
      sourceColLetter: raw.sourceColLetter,
      amountsByTargetId: raw.amountsByTargetId,
      isSummaryRow,
      isLumpedDepreciation,
      summaryKind,
      summaryReason,
      included: !isSummaryRow,
      selectedLineItemId: autoSelectedId,
      recommendation,
      userModified: false,
    });
  }

  return finalRows;
}

export function resolveTargetFiscalYear(detectedYear: string, fallbackYear: string): string {
  if (YEAR_RANGE.includes(detectedYear)) return detectedYear;
  return YEAR_RANGE.includes(fallbackYear) ? fallbackYear : detectedYear;
}
