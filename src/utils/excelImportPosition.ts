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
  rawName: string;
  cleanedName: string;
  sourceColIndex: number;
  sourceColLetter: string;
  amountsByTargetId: Record<string, number | null>;
  isSummaryRow: boolean;
  summaryKind?: 'total_assets' | 'total_liabilities' | 'total_equity' | 'total_liabilities_equity' | 'subtotal';
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

/**
 * Reads formatted cell text from a sheet if available, falling back to raw matrix value.
 */
function getFormattedCellText(sheet: XLSX.WorkSheet, r: number, c: number, rawVal: unknown): string {
  const addr = XLSX.utils.encode_cell({ r, c });
  const cell = sheet[addr];
  if (cell && typeof cell.w === 'string' && cell.w.trim() !== '') {
    return cell.w.trim();
  }
  if (rawVal === null || rawVal === undefined) return '';
  return String(rawVal).trim();
}

/**
 * Extracts a fiscal year (2000..2099) from a header cell, avoiding monetary decimals like 2,025.00.
 */
export function extractYearFromHeaderCell(rawVal: unknown, formattedText: string): string | null {
  const text = formattedText.trim();
  if (!text && (rawVal === null || rawVal === undefined || rawVal === '')) return null;

  // Reject values that look like currency or decimal amounts (e.g. "2,025.00", "₱ 2025", "(2025)")
  if (/[₱$€£]/.test(text) || /\.\d{2}\b/.test(text) || /^\(.*\)$/.test(text) || /,\d{3}/.test(text)) {
    return null;
  }

  // Exact integer year cell (numeric 2000..2099)
  if (typeof rawVal === 'number' && Number.isInteger(rawVal) && rawVal >= 2000 && rawVal <= 2099) {
    return String(rawVal);
  }

  // Excel serial date (roughly 1990..2099 -> serial ~32874..73050)
  if (typeof rawVal === 'number' && rawVal > 32000 && rawVal < 74000 && text.includes('/')) {
    const parsedDate = XLSX.SSF?.parse_date_code?.(rawVal);
    if (parsedDate && parsedDate.y >= 2000 && parsedDate.y <= 2099) {
      return String(parsedDate.y);
    }
  }

  // Exact 4-digit year string or "FY 2025", "CY 2025", "December 31, 2025", "2025 (Restated)", "2025-12-31"
  const fourDigitMatch = text.match(/\b(20\d{2})\b/);
  if (fourDigitMatch) {
    const yr = Number(fourDigitMatch[1]);
    if (yr >= 2000 && yr <= 2099) {
      // Make sure it's not a long reference/account code like 2025-01-0012
      if (!/20\d{2}-\d{2}-\d{4,}/.test(text)) {
        return String(yr);
      }
    }
  }

  // Short date like "12/31/25" or "Dec 31, 25"
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

  // Dash or em-dash alone means zero in accounting sheets
  if (/^[-–—]+$/.test(text) || /^[₱$]\s*[-–—]+$/.test(text)) {
    return { hasValue: true, value: 0 };
  }

  let clean = text.replace(/[₱$,\s]/g, '');
  let negative = false;
  if (clean.startsWith('(') && clean.endsWith(')')) {
    negative = true;
    clean = clean.slice(1, -1);
  }

  // Must look strictly numeric (reject text like "Note 4" or "FY 2025")
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

  // Track numeric density below each row to verify year columns actually have numbers under them
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
        // Check 1-2 rows above for an optional entity/fund group label
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

    // Score this candidate header row
    // Rule 1: The amount is always under the year -> prioritize columns with actual numbers underneath!
    const validColsWithNumbers = foundInRow.filter((yc) => countNumbersBelow(r, yc.colIndex) > 0);
    if (validColsWithNumbers.length === 0 && foundInRow.length === 1) {
      // Single year mention in a title row with no numbers underneath (e.g., "As of Dec 31, 2025" in Col A) -> skip
      continue;
    }

    const distinctYears = new Set(foundInRow.map((yc) => yc.year));
    let score = 0;
    score += distinctYears.size * 30;
    score += validColsWithNumbers.length * 40;
    if (distinctYears.has(preferredCurrentYear)) score += 25;
    if (distinctYears.has(preferredComparativeYear)) score += 20;
    // Prefer columns further right than Col A (Rule 2: line item is always before the amount)
    if (foundInRow.every((yc) => yc.colIndex >= 1)) score += 15;
    // Slight preference for rows closer to top among valid headers
    score -= r * 0.25;

    if (score > bestScore) {
      bestScore = score;
      bestRowIdx = r;
      bestYearCols = validColsWithNumbers.length > 0 ? validColsWithNumbers : foundInRow;
    }
  }

  // Build candidate columns metadata (so user can inspect/pick columns manually if desired)
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

  // Scan top 12 rows of each sheet for SFP keywords
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

/**
 * Removes leading UACS / account codes and trailing note annotations.
 */
export function cleanAccountLabel(raw: string): string {
  let s = raw.trim();
  // Strip leading UACS/account codes like "1-01-01-010 ", "10101010 - ", "1.01.01.010 "
  s = s.replace(/^\d{1,3}(?:[-.]\d{2,4}){2,5}\s*[-–—:]?\s*/, '');
  s = s.replace(/^\d{6,12}\s*[-–—:]?\s*/, '');
  // Strip trailing "(Note 4)" or "- Note 12" or "[Note 5]"
  s = s.replace(/\s*[\(\[]?\bnote\s*#?\s*\d+[a-z]?[\)\]]?\s*$/i, '');
  // Normalize dashes and multiple spaces
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

/**
 * Damerau-Levenshtein distance (treats adjacent letter swaps like "ie" <-> "ei" as cost 1).
 */
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
      let val = Math.min(
        dp[i - 1][j] + 1,      // deletion
        dp[i][j - 1] + 1,      // insertion
        dp[i - 1][j - 1] + cost // substitution
      );
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        val = Math.min(val, dp[i - 2][j - 2] + 1); // transposition
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

  // Prefix shortcut for truncated words (e.g., "collect" vs "collecting")
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
  return tokens.some((t) => t === 'semi' || t === 'semiexpendable' || tokenSimilarity(t, 'semiexpendable') >= 0.78);
}

function scoreLineItemMatch(rawQuery: string, item: LineItemDefinition): number {
  const cleanedQuery = cleanAccountLabel(rawQuery);
  if (!cleanedQuery) return 0;

  const qLower = cleanedQuery.toLowerCase();
  const cLower = item.name.toLowerCase().trim();
  if (qLower === cLower) return 100;

  const qAlpha = qLower.replace(/[^a-z0-9]/g, '');
  const cAlpha = cLower.replace(/[^a-z0-9]/g, '');
  if (qAlpha && qAlpha === cAlpha) return 99;

  const qTokensAll = tokenizeAndExpand(cleanedQuery);
  const cTokensAll = tokenizeAndExpand(item.name);
  const qExpandedAlpha = qTokensAll.join('');
  const cExpandedAlpha = cTokensAll.join('');

  if (qExpandedAlpha && qExpandedAlpha === cExpandedAlpha) return 97;

  const qSingAlpha = qTokensAll.map(singularizeToken).join('');
  const cSingAlpha = cTokensAll.map(singularizeToken).join('');
  if (qSingAlpha && qSingAlpha === cSingAlpha) return 95;

  // Content words (filter minor stop words when computing semantic coverage)
  const qContent = qTokensAll.filter((t) => !STOP_WORDS.has(t));
  const cContent = cTokensAll.filter((t) => !STOP_WORDS.has(t));
  const qSet = qContent.length > 0 ? qContent : qTokensAll;
  const cSet = cContent.length > 0 ? cContent : cTokensAll;

  if (qSet.length === 0 || cSet.length === 0) return 0;

  // Forward token similarity (how well each query token finds a match in candidate)
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

  // Backward token similarity (penalizes candidates with lots of unmatched extra words)
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

  // Bigram + whole-string Damerau-Levenshtein similarity (catches merged/split words & typos)
  const bigramSim = diceBigramSimilarity(qExpandedAlpha, cExpandedAlpha);
  const maxStrLen = Math.max(qExpandedAlpha.length, cExpandedAlpha.length);
  const fullEditSim =
    maxStrLen > 0 ? Math.max(0, 1 - damerauLevenshtein(qExpandedAlpha, cExpandedAlpha) / maxStrLen) : 0;

  let score = (tokenF1 * 0.62 + bigramSim * 0.22 + fullEditSim * 0.16) * 94;

  // Accounting domain guards so contra/semi-expendable accounts don't cross-match regular PPE
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

  // Distribution vs Inventory guard
  const qDist = qTokensAll.includes('distribution');
  const cDist = cTokensAll.includes('distribution');
  const qInv = qTokensAll.includes('inventory') || qTokensAll.includes('inventories');
  const cInv = cTokensAll.includes('inventory') || cTokensAll.includes('inventories');
  if ((qDist && !cDist && cInv) || (qInv && !cInv && cDist)) {
    score -= 12;
  }

  return Math.max(0, Math.min(94, Math.round(score)));
}

/**
 * Recommends the best matching line item (plus top alternatives) even with misspellings or abbreviations.
 */
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

/**
 * Detects whether a row label is a Summary/Total/Section Header row (so it won't be double-counted).
 */
export function detectSummaryRowKind(
  rawName: string
): ExtractedPositionRow['summaryKind'] | undefined {
  const cleaned = cleanAccountLabel(rawName).toLowerCase().replace(/\s+/g, ' ').trim();
  if (!cleaned) return undefined;

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

function looksLikeNoteOrCodeOnly(text: string): boolean {
  const t = text.trim();
  if (!t) return true;
  if (/^(?:note\s*#?\s*)?\d+(?:\.\d+)?[a-z]?$/i.test(t)) return true;
  if (/^\d{1,3}(?:[-.]\d{2,4}){2,5}$/.test(t)) return true;
  if (/^\d{6,12}$/.test(t)) return true;
  if (/^[-–—]+$/.test(t)) return true;
  return false;
}

/**
 * Extracts Statement of Financial Position rows from a sheet using Rule 1 (amount under year)
 * and Rule 2 (line item before amount on the same row), with misspelling-tolerant recommendations.
 */
export function extractPositionRowsFromSheet(
  sheet: XLSX.WorkSheet,
  yearTargets: YearImportColumnTarget[],
  startRowIndex: number, // 0-based row to start scanning data
  lineItemColOverride: number | 'auto',
  encodableItems: LineItemDefinition[],
  savedAliases: Record<string, string>
): ExtractedPositionRow[] {
  const activeTargets = yearTargets.filter((t) => t.colIndex >= 0);
  if (activeTargets.length === 0) return [];

  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '', raw: true });
  const earliestAmountCol = Math.min(...activeTargets.map((t) => t.colIndex));
  const extracted: ExtractedPositionRow[] = [];

  for (let r = Math.max(0, startRowIndex); r < rows.length; r++) {
    const row = rows[r];
    if (!Array.isArray(row)) continue;

    // 1. Extract amounts strictly under each target year column (Rule 1)
    const amountsByTargetId: Record<string, number | null> = {};
    let hasAnyNonZeroAmount = false;
    let hasAnyNumericCell = false;

    for (const target of activeTargets) {
      const fmt = getFormattedCellText(sheet, r, target.colIndex, row[target.colIndex]);
      const parsed = parseExcelNumericCell(row[target.colIndex], fmt);
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

    // Skip rows with no non-zero amounts (blank spacers, pure section headings)
    if (!hasAnyNumericCell || !hasAnyNonZeroAmount) continue;

    // 2. Extract line item label strictly BEFORE the earliest amount column on the same row (Rule 2)
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
        // If multiple text cells exist before the amount (e.g. group in Col A and account in Col B),
        // pick whichever scores higher in the database, favoring rightmost descriptive cell on ties.
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

    if (!chosenText || looksLikeNoteOrCodeOnly(chosenText)) continue;

    const cleanedName = cleanAccountLabel(chosenText);
    const summaryKind = detectSummaryRowKind(chosenText);
    const isSummaryRow = Boolean(summaryKind);

    const recommendation = isSummaryRow
      ? { bestItem: null, confidence: 0, matchType: 'none' as const, alternatives: [] }
      : matchLineItemWithRecommendation(chosenText, encodableItems, savedAliases);

    const autoSelectedId =
      !isSummaryRow && recommendation.bestItem && recommendation.confidence >= 66
        ? recommendation.bestItem.id
        : '';

    extracted.push({
      rowId: `xl-row-${r + 1}`,
      excelRowNumber: r + 1,
      rawName: chosenText,
      cleanedName,
      sourceColIndex: chosenCol,
      sourceColLetter: chosenCol >= 0 ? colIndexToLetter(chosenCol) : '?',
      amountsByTargetId,
      isSummaryRow,
      summaryKind,
      included: !isSummaryRow,
      selectedLineItemId: autoSelectedId,
      recommendation,
      userModified: false,
    });
  }

  return extracted;
}

/**
 * Normalizes a Year string to one present in YEAR_RANGE if possible, otherwise keeps the extracted year string.
 */
export function resolveTargetFiscalYear(detectedYear: string, fallbackYear: string): string {
  if (YEAR_RANGE.includes(detectedYear)) return detectedYear;
  return YEAR_RANGE.includes(fallbackYear) ? fallbackYear : detectedYear;
}
