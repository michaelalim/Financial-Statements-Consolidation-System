import * as XLSX from 'xlsx';
import {
  LineItemDefinition,
  StatementType,
  DivisionAggregationRecord,
  AggregatedComponentItem,
} from '../types/fs';
import { AGGREGATED_ACCUMULATED_DEPRECIATION_ID } from '../data/defaultLineItems';
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

export interface AggregatedChildDetail {
  rawName: string;
  cleanedName: string;
  excelRowNumber?: number;
  amountsByTargetId: Record<string, number | null>;
}

export interface AggregationBreakdown {
  parentItemId: string;
  parentLabel: string;
  parentRawName: string;
  parentExcelRowNumber?: number;
  isParentless: boolean;
  aggregationReason?: 'hierarchy_rollup' | 'duplicate_entries';
  aggregationNote?: string;
  parentOwnAmountsByTargetId: Record<string, number | null>;
  resolvedAmountsByTargetId: Record<string, number | null>;
  wasAggregatedByTargetId: Record<string, boolean>;
  children: AggregatedChildDetail[];
}

export interface ExtractedPositionRow {
  rowId: string;
  excelRowNumber: number; // 1-based Excel row number
  accountCode?: string;
  rawName: string;
  cleanedName: string;
  sourceColIndex: number;
  sourceColLetter: string;
  indentScore?: number;
  amountsByTargetId: Record<string, number | null>;
  isSummaryRow: boolean;
  isLumpedDepreciation?: boolean;
  summaryReason?: string;
  aggregationNote?: string;
  aggregationBreakdown?: AggregationBreakdown;
  summaryKind?:
    | 'total_assets'
    | 'total_liabilities'
    | 'total_equity'
    | 'total_liabilities_equity'
    | 'total_revenue'
    | 'total_expenses'
    | 'surplus_deficit'
    | 'cash_inflows_outflows'
    | 'net_cash_activity'
    | 'cash_increase_decrease'
    | 'cash_beginning'
    | 'cash_beginning_ending'
    | 'cash_checking_ignored'
    | 'net_assets_beginning'
    | 'net_assets_summary'
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

export function getAliasStorageKey(statementType: StatementType = 'position'): string {
  if (statementType === 'position') return EXCEL_ALIAS_STORAGE_KEY;
  return `deped_ro6_${statementType}_excel_aliases_v1`;
}

export function loadSavedPositionAliases(
  statementType: StatementType = 'position'
): Record<string, string> {
  try {
    const raw = localStorage.getItem(getAliasStorageKey(statementType));
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

export function savePositionAlias(
  excelLabel: string,
  lineItemId: string,
  statementType: StatementType = 'position'
): Record<string, string> {
  const key = normalizeAliasKey(excelLabel);
  const current = loadSavedPositionAliases(statementType);
  if (!key) return current;
  const next = { ...current, [key]: lineItemId };
  try {
    localStorage.setItem(getAliasStorageKey(statementType), JSON.stringify(next));
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

function getCellLeadingIndentSpaces(sheet: XLSX.WorkSheet, r: number, c: number, rawVal: unknown): number {
  const addr = XLSX.utils.encode_cell({ r, c });
  const cell = sheet[addr];
  const rawStr =
    cell && typeof cell.w === 'string' && cell.w.trim() !== ''
      ? cell.w
      : rawVal !== null && rawVal !== undefined
      ? String(rawVal)
      : '';
  const match = rawStr.match(/^([ \t]+)/);
  if (!match) return 0;
  let spaces = 0;
  for (const ch of match[1]) {
    spaces += ch === '\t' ? 4 : 1;
  }
  return spaces;
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

  const text = (formattedText ?? String(rawVal ?? '')).replace(/\u00A0/g, ' ').trim();
  if (!text) return { hasValue: false, value: 0 };

  // Recognize accounting dashes and currency-prefixed dashes such as "-", "₱ -", "Php -", "( - )"
  const strippedCurrencyDash = text
    .replace(/^(?:php|ph[p]?|[₱$€£])\s*/i, '')
    .replace(/^\(\s*([-–—]+)\s*\)$/, '$1')
    .trim();
  if (/^[-–—]+$/.test(strippedCurrencyDash)) {
    return { hasValue: true, value: 0 };
  }

  let clean = text.replace(/(?:php|[₱$,\s])/gi, '');
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
  if (Math.abs(parsed) < 0.005) return { hasValue: true, value: 0 };
  return { hasValue: true, value: negative ? -Math.abs(parsed) : parsed };
}

interface ParsedSheetGrid {
  rows: unknown[][];
  totalRows: number;
  totalCols: number;
}

const SHEET_GRID_CACHE = new WeakMap<XLSX.WorkSheet, ParsedSheetGrid>();

function fastDecodeCellAddress(addr: string): { r: number; c: number } | null {
  let i = 0;
  const len = addr.length;
  let c = 0;
  while (i < len) {
    const code = addr.charCodeAt(i);
    if (code >= 65 && code <= 90) {
      c = c * 26 + (code - 64);
      i++;
    } else {
      break;
    }
  }
  if (i === 0 || i === len) return null;
  let r = 0;
  while (i < len) {
    const code = addr.charCodeAt(i);
    if (code >= 48 && code <= 57) {
      r = r * 10 + (code - 48);
      i++;
    } else {
      return null;
    }
  }
  if (r <= 0 || c <= 0) return null;
  return { r: r - 1, c: c - 1 };
}

function getTrimmedSheetGrid(sheet: XLSX.WorkSheet): ParsedSheetGrid {
  const cached = SHEET_GRID_CACHE.get(sheet);
  if (cached) return cached;

  const rows: unknown[][] = [];
  let maxRow = -1;
  let maxCol = -1;

  const keys = Object.keys(sheet);
  for (let k = 0; k < keys.length; k++) {
    const key = keys[k];
    if (key.charCodeAt(0) === 33) continue; // skip '!' metadata keys
    const cell = sheet[key] as XLSX.CellObject | undefined;
    if (!cell) continue;
    const hasContent =
      (cell.v !== undefined && cell.v !== null && cell.v !== '') ||
      (typeof cell.w === 'string' && cell.w.trim() !== '') ||
      (typeof cell.f === 'string' && cell.f.trim() !== '');
    if (!hasContent) continue;

    const coords = fastDecodeCellAddress(key) || XLSX.utils.decode_cell(key);
    const { r, c } = coords;
    if (r < 0 || c < 0) continue;

    let rowArr = rows[r];
    if (!rowArr) {
      rowArr = [];
      rows[r] = rowArr;
    }
    rowArr[c] = cell.v !== undefined ? cell.v : '';
    if (r > maxRow) maxRow = r;
    if (c > maxCol) maxCol = c;
  }

  const result: ParsedSheetGrid = {
    rows,
    totalRows: maxRow >= 0 ? maxRow + 1 : 0,
    totalCols: maxCol >= 0 ? maxCol + 1 : 0,
  };
  SHEET_GRID_CACHE.set(sheet, result);
  return result;
}

function getSheetTopTextSample(sheet: XLSX.WorkSheet, maxRows = 14, maxCols = 30): string {
  const parts: string[] = [];
  const keys = Object.keys(sheet);
  for (let k = 0; k < keys.length; k++) {
    const key = keys[k];
    if (key.charCodeAt(0) === 33) continue;
    const coords = fastDecodeCellAddress(key);
    if (!coords || coords.r >= maxRows || coords.c >= maxCols) continue;
    const cell = sheet[key] as XLSX.CellObject | undefined;
    if (!cell) continue;
    const txt =
      typeof cell.w === 'string' && cell.w.trim() !== ''
        ? cell.w
        : cell.v !== undefined && cell.v !== null
        ? String(cell.v)
        : '';
    if (txt) parts.push(txt);
  }
  return parts.join(' ');
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
  const { rows, totalRows, totalCols } = getTrimmedSheetGrid(sheet);

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
 * Picks the most likely worksheet matching the requested financial statement in a multi-sheet workbook.
 */
export function pickBestPositionSheetName(
  workbook: XLSX.WorkBook,
  statementType: StatementType = 'position'
): string {
  const names = workbook.SheetNames;
  if (names.length <= 1) return names[0] || '';

  const sheetMatchesName = (name: string): boolean => {
    if (statementType === 'performance') {
      return /(performance|income\s*statement|\bsfpe\b)/i.test(name);
    }
    if (statementType === 'cash_flows') {
      return /(cash\s*flow|\bscf\b)/i.test(name);
    }
    if (statementType === 'net_assets') {
      return /(net\s*assets|changes\s*in\s*(?:net\s*assets|equity)|\bscnae\b)/i.test(name);
    }
    return (
      /(position|balance\s*sheet|\bsfp\b|\bbs\b)/i.test(name) &&
      !/(performance|\bsfpe\b)/i.test(name)
    );
  };

  const directHit = names.find(sheetMatchesName);
  if (directHit) return directHit;

  for (const name of names) {
    const sheet = workbook.Sheets[name];
    if (!sheet) continue;
    const topText = getSheetTopTextSample(sheet, 14, 30);

    if (statementType === 'performance') {
      if (
        /statement of financial performance|service and business income|current operating expenses|surplus\/?\(deficit\)\s*from\s*current\s*operations/i.test(
          topText
        )
      ) {
        return name;
      }
    } else if (statementType === 'cash_flows') {
      if (
        /statement of cash flows|cash flows from operating|cash inflows|cash outflows/i.test(
          topText
        )
      ) {
        return name;
      }
    } else if (statementType === 'net_assets') {
      if (
        /statement of changes in net assets|changes in net assets\/equity|restated balance|changes in accounting policy/i.test(
          topText
        )
      ) {
        return name;
      }
    } else if (
      /statement of financial position|total assets|current assets/i.test(topText) &&
      !/statement of financial performance/i.test(topText)
    ) {
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
  acquistion: 'acquisition',
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
  drrmf: 'disaster risk reduction and management fund',
  ecc: 'ecc contributions',
  ecip: 'ecc contributions',
  educ: 'education',
  elect: 'electricity',
  emp: 'employees',
  eqpt: 'equipment',
  equip: 'equipment',
  equips: 'equipment',
  equiv: 'equivalents',
  fixt: 'fixtures',
  fom: 'from',
  furn: 'furniture',
  gen: 'general',
  goccs: 'government owned and controlled corporations',
  govt: 'government',
  imp: 'impairment',
  impair: 'impairment',
  impr: 'improvements',
  infra: 'infrastructure',
  inocme: 'income',
  inst: 'instructional',
  int: 'interest',
  intl: 'international',
  inv: 'inventory',
  invs: 'inventories',
  lab: 'laboratory',
  lgus: 'local government units',
  liab: 'liabilities',
  loc: 'local',
  mach: 'machinery',
  maint: 'maintenance',
  mat: 'materials',
  mats: 'materials',
  med: 'medical',
  misc: 'miscellaneous',
  mooe: 'maintenance and other operating expenses',
  natl: 'national',
  nca: 'notice of cash allocation',
  ngas: 'national government agencies',
  ntca: 'notice of transfer of cash allocation',
  off: 'officer',
  offs: 'officers',
  op: 'operating',
  oper: 'operating',
  pay: 'payable',
  pera: 'personnel economic relief allowance',
  ppe: 'property plant and equipment',
  ra: 'representation allowance',
  rec: 'receivable',
  recv: 'receivable',
  recvble: 'receivable',
  reg: 'regular',
  rep: 'repairs',
  rlip: 'life and retirement insurance contributions',
  sav: 'savings',
  sch: 'school',
  semiexp: 'semi expendable',
  sudsidy: 'subsidy',
  supp: 'supplies',
  sup: 'supplies',
  ta: 'transportation allowance',
  tech: 'technical',
  tra: 'tax remittance advice',
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

let dlBuffer = new Int32Array(4096);

function damerauLevenshtein(a: string, b: string): number {
  const la = a.length;
  const lb = b.length;
  if (la === 0) return lb;
  if (lb === 0) return la;
  if (a === b) return 0;

  const stride = lb + 1;
  const needed = (la + 1) * stride;
  if (dlBuffer.length < needed) {
    dlBuffer = new Int32Array(Math.max(needed, dlBuffer.length * 2));
  }
  const dp = dlBuffer;

  for (let i = 0; i <= la; i++) dp[i * stride] = i;
  for (let j = 0; j <= lb; j++) dp[j] = j;

  for (let i = 1; i <= la; i++) {
    const ai = a.charCodeAt(i - 1);
    const aiPrev = i > 1 ? a.charCodeAt(i - 2) : 0;
    const rowOff = i * stride;
    const prevRowOff = (i - 1) * stride;
    const prev2RowOff = (i - 2) * stride;
    for (let j = 1; j <= lb; j++) {
      const bj = b.charCodeAt(j - 1);
      const cost = ai === bj ? 0 : 1;
      let val = dp[prevRowOff + j] + 1;
      const ins = dp[rowOff + j - 1] + 1;
      if (ins < val) val = ins;
      const sub = dp[prevRowOff + j - 1] + cost;
      if (sub < val) val = sub;
      if (i > 1 && j > 1 && ai === b.charCodeAt(j - 2) && aiPrev === bj) {
        const trans = dp[prev2RowOff + j - 2] + 1;
        if (trans < val) val = trans;
      }
      dp[rowOff + j] = val;
    }
  }
  return dp[la * stride + lb];
}

const TOKEN_SIM_CACHE = new Map<string, number>();

function tokenSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  const key = a < b ? `${a}\x00${b}` : `${b}\x00${a}`;
  const cached = TOKEN_SIM_CACHE.get(key);
  if (cached !== undefined) return cached;

  const sa = singularizeToken(a);
  const sb = singularizeToken(b);
  let res: number;
  if (sa === sb) {
    res = 0.96;
  } else {
    const maxLen = Math.max(a.length, b.length);
    if (maxLen === 0) {
      res = 1;
    } else if (maxLen >= 5 && (a.startsWith(b) || b.startsWith(a)) && Math.min(a.length, b.length) >= 4) {
      res = Math.max(0.72, Math.min(a.length, b.length) / maxLen);
    } else {
      const dist = Math.min(damerauLevenshtein(a, b), damerauLevenshtein(sa, sb));
      res = Math.max(0, 1 - dist / maxLen);
    }
  }

  if (TOKEN_SIM_CACHE.size > 30000) TOKEN_SIM_CACHE.clear();
  TOKEN_SIM_CACHE.set(key, res);
  return res;
}

function buildSortedBigrams(str: string): Uint16Array {
  if (str.length < 2) return new Uint16Array(0);
  const arr = new Uint16Array(str.length - 1);
  for (let i = 0; i < str.length - 1; i++) {
    arr[i] = ((str.charCodeAt(i) & 0xff) << 8) | (str.charCodeAt(i + 1) & 0xff);
  }
  arr.sort();
  return arr;
}

function countSortedBigramIntersection(a: Uint16Array, b: Uint16Array): number {
  let i = 0;
  let j = 0;
  let matches = 0;
  const la = a.length;
  const lb = b.length;
  while (i < la && j < lb) {
    const va = a[i];
    const vb = b[j];
    if (va === vb) {
      matches++;
      i++;
      j++;
    } else if (va < vb) {
      i++;
    } else {
      j++;
    }
  }
  return matches;
}

function diceBigramSimilarityFromSorted(aStrLen: number, aBigrams: Uint16Array, bStrLen: number, bBigrams: Uint16Array): number {
  if (aStrLen < 2 || bStrLen < 2) return 0;
  const matches = countSortedBigramIntersection(aBigrams, bBigrams);
  return (2 * matches) / (aBigrams.length + bBigrams.length);
}

const CONTRA_KEYWORDS = ['impairment', 'accumulated', 'depreciation', 'amortization', 'contra'];

function hasContraKeywords(tokens: string[]): boolean {
  const hasCoreContra = tokens.some((t) => {
    const sing = singularizeToken(t);
    return CONTRA_KEYWORDS.some((kw) => t === kw || sing === kw || tokenSimilarity(t, kw) >= 0.72);
  });
  if (hasCoreContra) return true;

  // Treat "allowance" as contra only for contra-asset phrases (e.g. "Allowance for ..."),
  // never for compensation/expense allowances like "Other Bonuses and Allowances" or "Special Hardship Allowance".
  const hasAllowance = tokens.some(
    (t) => singularizeToken(t) === 'allowance' || tokenSimilarity(t, 'allowance') >= 0.8
  );
  if (!hasAllowance) return false;

  return (
    tokens.includes('for') ||
    tokens.some((t) =>
      ['doubtful', 'bad', 'uncollectible', 'credit', 'decline', 'obsolescence'].some(
        (kw) => tokenSimilarity(t, kw) >= 0.78
      )
    )
  );
}

function hasSemiKeywords(tokens: string[]): boolean {
  return tokens.some(
    (t) => t === 'semi' || t === 'semiexpendable' || tokenSimilarity(t, 'semiexpendable') >= 0.78
  );
}

function hasRepairsKeywords(tokens: string[]): boolean {
  const hasRepair = tokens.some(
    (t) => t === 'repair' || t === 'repairs' || singularizeToken(t) === 'repair' || tokenSimilarity(t, 'repair') >= 0.78
  );
  if (hasRepair) return true;
  const hasMaint = tokens.some((t) => t === 'maintenance' || tokenSimilarity(t, 'maintenance') >= 0.78);
  const hasOperating = tokens.some((t) => t === 'operating' || tokenSimilarity(t, 'operating') >= 0.8);
  return hasMaint && !hasOperating;
}

const SEMI_FURN_BOOKS_UMBRELLA_ID = 'perf-mooe-semi-furn-books';
const SEMI_MACH_UMBRELLA_ID = 'perf-mooe-semi-mach';
const OTHER_BONUSES_UMBRELLA_ID = 'perf-ps-other-bonuses';
const DEPR_BLDG_UMBRELLA_ID = 'perf-nc-depr-bldg';
const DEPR_MACH_UMBRELLA_ID = 'perf-nc-depr-mach';
const DEPR_TRANS_UMBRELLA_ID = 'perf-nc-depr-trans';
const DEPR_FURN_UMBRELLA_ID = 'perf-nc-depr-furn';
const UMBRELLA_PARENT_IDS = new Set([
  SEMI_FURN_BOOKS_UMBRELLA_ID,
  SEMI_MACH_UMBRELLA_ID,
  OTHER_BONUSES_UMBRELLA_ID,
  DEPR_BLDG_UMBRELLA_ID,
  DEPR_MACH_UMBRELLA_ID,
  DEPR_TRANS_UMBRELLA_ID,
  DEPR_FURN_UMBRELLA_ID,
]);

function isSemiMachUmbrellaLabel(rawText: string): boolean {
  const cleaned = cleanAccountLabel(rawText);
  if (!cleaned) return false;
  const tokens = tokenizeAndExpand(cleaned);
  if (hasRepairsKeywords(tokens) || hasContraKeywords(tokens)) return false;
  // Never confuse "Semi-Expendable Machinery and Equipment Expenses - Other Equipment" with the umbrella parent
  if (tokens.includes('other')) return false;
  const hasSemi = hasSemiKeywords(tokens);
  const hasMach = tokens.some((t) => tokenSimilarity(t, 'machinery') >= 0.78);
  const hasEquip = tokens.some((t) => tokenSimilarity(t, 'equipment') >= 0.78);
  if (hasSemi && hasMach && hasEquip) return true;
  return (
    Math.max(
      scoreStringSimilarity(cleaned, 'Semi-Expendable Machinery and Equipment Expenses'),
      scoreStringSimilarity(cleaned, 'Semi-Expendable Machinery and Equipment')
    ) >= 86
  );
}

function classifySemiMachChildKind(rawText: string): string | null {
  const cleaned = cleanAccountLabel(rawText);
  if (!cleaned) return null;
  const tokens = tokenizeAndExpand(cleaned);
  if (hasRepairsKeywords(tokens) || hasContraKeywords(tokens)) return null;
  if (
    tokens.some(
      (t) =>
        t === 'furniture' ||
        t === 'fixtures' ||
        singularizeToken(t) === 'book' ||
        t === 'textbook' ||
        t === 'textbooks' ||
        t === 'instructional' ||
        t === 'supplies' ||
        t === 'supply' ||
        t === 'materials'
    )
  ) {
    return null;
  }

  // Never consume the distinct official "Semi-Expendable Machinery and Equipment Expenses - Other Equipment"
  if (hasSemiKeywords(tokens) && tokens.includes('other')) {
    return null;
  }
  // Never consume the parent itself
  if (isSemiMachUmbrellaLabel(cleaned)) return null;

  const knownSubEquipmentTargets: [string, string[]][] = [
    ['machinery', ['Machinery']],
    ['office_equip', ['Office Equipment']],
    ['ict_equip', ['Information and Communications Technology Equipment', 'ICT Equipment', 'Information Technology Equipment']],
    ['comm_equip', ['Communications Equipment', 'Communication Equipment']],
    ['disaster_equip', ['Disaster Response and Rescue Equipment']],
    ['military_equip', ['Military, Police and Security Equipment', 'Military Police and Security Equipment']],
    ['medical_equip', ['Medical Equipment']],
    ['printing_equip', ['Printing Equipment']],
    ['sports_equip', ['Sports Equipment']],
    ['tech_sci_equip', ['Technical and Scientific Equipment']],
    ['agri_equip', ['Agricultural and Forestry Equipment']],
    ['marine_equip', ['Marine and Fishery Equipment']],
    ['airport_equip', ['Airport Equipment']],
    ['const_equip', ['Construction and Heavy Equipment', 'Construction Equipment']],
    ['other_mach_equip', ['Other Machinery and Equipment']],
  ];

  for (const [kind, labels] of knownSubEquipmentTargets) {
    for (const label of labels) {
      if (scoreStringSimilarity(cleaned, label) >= 78) {
        return kind;
      }
    }
  }

  return null;
}

export function buildDivisionAggregationRecordForTarget(
  row: ExtractedPositionRow,
  targetId: string,
  officialItem: LineItemDefinition,
  sourceFileName?: string
): DivisionAggregationRecord | null {
  const bd = row.aggregationBreakdown;
  if (!bd) return null;

  const totalRaw = row.amountsByTargetId[targetId] ?? bd.resolvedAmountsByTargetId[targetId];
  if (totalRaw === null || totalRaw === undefined || Math.abs(totalRaw) < 0.005) {
    return null;
  }

  const totalAmount = officialItem.isContra ? Math.abs(totalRaw) : totalRaw;
  const parentOwnRaw = bd.isParentless ? 0 : (bd.parentOwnAmountsByTargetId[targetId] ?? 0);
  const wasAggregated = Boolean(bd.wasAggregatedByTargetId[targetId]);

  const components: AggregatedComponentItem[] = [];
  if (!bd.isParentless && Math.abs(parentOwnRaw) >= 0.005) {
    components.push({
      label: `${bd.parentRawName} (Original parent balance)`,
      amount: Math.round(parentOwnRaw * 10000) / 10000,
      isParentOriginal: true,
      excelRowNumber: bd.parentExcelRowNumber,
    });
  }

  bd.children.forEach((child) => {
    const childVal = child.amountsByTargetId[targetId];
    if (childVal !== null && childVal !== undefined && Math.abs(childVal) >= 0.005) {
      components.push({
        label: child.cleanedName || child.rawName,
        amount: Math.round(childVal * 10000) / 10000,
        isParentOriginal: false,
        excelRowNumber: child.excelRowNumber,
      });
    }
  });

  if (components.length === 0) return null;

  return {
    lineItemId: officialItem.id,
    lineItemName: officialItem.name,
    wasAggregated,
    totalAmount: Math.round(totalAmount * 10000) / 10000,
    parentOriginalAmount: Math.round(parentOwnRaw * 10000) / 10000,
    components,
    sourceFileName,
    updatedAt: new Date().toISOString(),
  };
}

function isSemiFurnBooksUmbrellaLabel(rawText: string): boolean {
  const cleaned = cleanAccountLabel(rawText);
  if (!cleaned) return false;
  const tokens = tokenizeAndExpand(cleaned);
  if (hasRepairsKeywords(tokens) || hasContraKeywords(tokens)) return false;
  const hasSemi = hasSemiKeywords(tokens);
  const hasFurn = tokens.some((t) => tokenSimilarity(t, 'furniture') >= 0.76);
  const hasBooks = tokens.some((t) => singularizeToken(t) === 'book' || tokenSimilarity(t, 'books') >= 0.82);
  if (hasSemi && hasFurn && hasBooks) return true;
  return (
    Math.max(
      scoreStringSimilarity(cleaned, 'Semi-Expendable Furniture, Fixtures and Books Expenses'),
      scoreStringSimilarity(cleaned, 'Semi-Expendable Furniture, Fixtures and Books')
    ) >= 84
  );
}

function classifySemiFurnBooksChildKind(rawText: string): 'furniture' | 'books' | null {
  const cleaned = cleanAccountLabel(rawText);
  if (!cleaned) return null;
  const tokens = tokenizeAndExpand(cleaned);
  if (hasRepairsKeywords(tokens) || hasContraKeywords(tokens)) return null;
  if (
    tokens.some(
      (t) =>
        t === 'machinery' ||
        t === 'equipment' ||
        t === 'building' ||
        t === 'buildings' ||
        t === 'land' ||
        t === 'office' ||
        t === 'textbook' ||
        t === 'textbooks' ||
        t === 'instructional' ||
        t === 'other'
    )
  ) {
    return null;
  }

  const hasFurn = tokens.some((t) => tokenSimilarity(t, 'furniture') >= 0.76);
  const hasFixt = tokens.some((t) => tokenSimilarity(t, 'fixtures') >= 0.74);
  const hasBooks = tokens.some(
    (t) =>
      (singularizeToken(t) === 'book' || tokenSimilarity(t, 'books') >= 0.84) &&
      t !== 'textbook' &&
      t !== 'textbooks'
  );

  // Must not already be the full combined umbrella term containing both Furniture and Books
  if (hasFurn && hasBooks) return null;

  if (hasFurn && hasFixt) {
    const furnScore = Math.max(
      scoreStringSimilarity(cleaned, 'Furnitures and Fixtures'),
      scoreStringSimilarity(cleaned, 'Furniture and Fixtures'),
      scoreStringSimilarity(cleaned, 'Semi-Expendable Furniture and Fixtures'),
      scoreStringSimilarity(cleaned, 'Semi-Expendable Furnitures and Fixtures')
    );
    if (furnScore >= 72) return 'furniture';
  }

  if (hasBooks) {
    const booksScore = Math.max(
      scoreStringSimilarity(cleaned, 'Books'),
      scoreStringSimilarity(cleaned, 'Semi-Expendable Books')
    );
    if (booksScore >= 80) return 'books';
  }

  return null;
}

function isOtherBonusesUmbrellaLabel(rawText: string): boolean {
  const cleaned = cleanAccountLabel(rawText);
  if (!cleaned) return false;
  const tokens = tokenizeAndExpand(cleaned);
  if (hasRepairsKeywords(tokens) || hasContraKeywords(tokens)) return false;
  return scoreStringSimilarity(cleaned, 'Other Bonuses and Allowances') >= 84;
}

function classifyOtherBonusesChildKind(
  rawText: string
): 'hardship' | 'cna' | 'pei' | 'pbb' | null {
  const cleaned = cleanAccountLabel(rawText);
  if (!cleaned) return null;
  const tokens = tokenizeAndExpand(cleaned);
  if (hasContraKeywords(tokens) || hasRepairsKeywords(tokens)) return null;

  const hasTokenNear = (target: string, minSim = 0.74) =>
    tokens.some((t) => tokenSimilarity(t, target) >= minSim);

  // 1. Special Hardship Allowance
  if (hasTokenNear('hardship', 0.72) && (hasTokenNear('allowance', 0.7) || hasTokenNear('special', 0.72))) {
    const s = Math.max(
      scoreStringSimilarity(cleaned, 'Special Hardship Allowance'),
      scoreStringSimilarity(cleaned, 'Hardship Allowance')
    );
    if (s >= 72) return 'hardship';
  }

  // 2. Collective Negotiation Agreement Incentive-Civilian
  const hasCnaAcronym = tokens.includes('cna');
  if (
    (hasCnaAcronym && (hasTokenNear('incentive', 0.72) || tokens.length <= 3)) ||
    (hasTokenNear('collective', 0.72) &&
      (hasTokenNear('negotiation', 0.7) || hasTokenNear('agreement', 0.7)))
  ) {
    const s = Math.max(
      scoreStringSimilarity(cleaned, 'Collective Negotiation Agreement Incentive - Civilian'),
      scoreStringSimilarity(cleaned, 'Collective Negotiation Agreement Incentive'),
      scoreStringSimilarity(cleaned, 'CNA Incentive - Civilian')
    );
    if (s >= 68 || hasCnaAcronym) return 'cna';
  }

  // 3. Productivity Enhancement Incentive - Civilian
  // Require "enhancement" (or "pei") so distinct "Productivity Incentive Benefits" is never swallowed.
  const hasPeiAcronym = tokens.includes('pei');
  if (hasPeiAcronym || (hasTokenNear('enhancement', 0.72) && hasTokenNear('productivity', 0.68))) {
    const s = Math.max(
      scoreStringSimilarity(cleaned, 'Productivity Enhancement Incentive - Civilian'),
      scoreStringSimilarity(cleaned, 'Productivity Enhancement Incentive'),
      scoreStringSimilarity(cleaned, 'PEI - Civilian')
    );
    if (s >= 68 || hasPeiAcronym) return 'pei';
  }

  // 4. Performance Based Bonus - Civilian
  const hasPbbAcronym = tokens.includes('pbb');
  if (hasPbbAcronym || (hasTokenNear('performance', 0.72) && hasTokenNear('bonus', 0.7))) {
    const s = Math.max(
      scoreStringSimilarity(cleaned, 'Performance Based Bonus - Civilian'),
      scoreStringSimilarity(cleaned, 'Performance Based Bonus'),
      scoreStringSimilarity(cleaned, 'PBB - Civilian')
    );
    if (s >= 68 || hasPbbAcronym) return 'pbb';
  }

  return null;
}

function hasDeprExpensePrefixTokens(tokens: string[]): boolean {
  const hasDepr = tokens.some(
    (t) => t === 'depreciation' || tokenSimilarity(t, 'depreciation') >= 0.78
  );
  if (!hasDepr) return false;
  const hasForbidden = tokens.some(
    (t) =>
      t === 'accumulated' ||
      tokenSimilarity(t, 'accumulated') >= 0.78 ||
      t === 'amortization' ||
      tokenSimilarity(t, 'amortization') >= 0.78 ||
      t === 'impairment' ||
      tokenSimilarity(t, 'impairment') >= 0.78
  );
  return !hasForbidden && !hasRepairsKeywords(tokens) && !hasSemiKeywords(tokens);
}

function isDeprBldgUmbrellaLabel(rawText: string): boolean {
  const cleaned = cleanAccountLabel(rawText);
  if (!cleaned) return false;
  const tokens = tokenizeAndExpand(cleaned);
  if (!hasDeprExpensePrefixTokens(tokens)) return false;
  const hasBldg = tokens.some((t) => singularizeToken(t) === 'building' || tokenSimilarity(t, 'buildings') >= 0.8);
  const hasStruct = tokens.some((t) => singularizeToken(t) === 'structure' || tokenSimilarity(t, 'structures') >= 0.8);
  if (hasBldg && hasStruct) return true;
  return scoreStringSimilarity(cleaned, 'Depreciation - Buildings and Other Structures') >= 84;
}

function classifyDeprBldgChildKind(
  rawText: string
): 'buildings' | 'school_buildings' | 'other_structures' | null {
  const cleaned = cleanAccountLabel(rawText);
  if (!cleaned) return null;
  const tokens = tokenizeAndExpand(cleaned);
  if (hasContraKeywords(tokens) || hasRepairsKeywords(tokens) || hasSemiKeywords(tokens)) return null;
  if (
    tokens.some(
      (t) =>
        t === 'machinery' ||
        t === 'equipment' ||
        t === 'furniture' ||
        t === 'fixtures' ||
        singularizeToken(t) === 'book' ||
        t === 'land' ||
        t === 'heritage' ||
        t === 'transportation' ||
        singularizeToken(t) === 'vehicle' ||
        t === 'infrastructure'
    )
  ) {
    return null;
  }
  if (scoreStringSimilarity(cleaned, 'School Buildings') >= 78) return 'school_buildings';
  if (scoreStringSimilarity(cleaned, 'Other Structures') >= 78) return 'other_structures';
  if (scoreStringSimilarity(cleaned, 'Buildings') >= 84) return 'buildings';
  return null;
}

function isDeprMachUmbrellaLabel(rawText: string): boolean {
  const cleaned = cleanAccountLabel(rawText);
  if (!cleaned) return false;
  const tokens = tokenizeAndExpand(cleaned);
  if (!hasDeprExpensePrefixTokens(tokens)) return false;
  if (tokens.includes('office') || tokens.includes('transportation') || tokens.includes('other')) {
    return false;
  }
  const hasMach = tokens.some((t) => tokenSimilarity(t, 'machinery') >= 0.78);
  const hasEquip = tokens.some((t) => tokenSimilarity(t, 'equipment') >= 0.78);
  if (hasMach && hasEquip) return true;
  return scoreStringSimilarity(cleaned, 'Depreciation - Machinery and Equipment') >= 84;
}

function classifyDeprMachChildKind(rawText: string): string | null {
  const cleaned = cleanAccountLabel(rawText);
  if (!cleaned) return null;
  const tokens = tokenizeAndExpand(cleaned);
  if (hasContraKeywords(tokens) || hasRepairsKeywords(tokens) || hasSemiKeywords(tokens)) return null;
  if (
    tokens.some(
      (t) =>
        t === 'furniture' ||
        t === 'fixtures' ||
        singularizeToken(t) === 'book' ||
        singularizeToken(t) === 'building' ||
        singularizeToken(t) === 'structure' ||
        t === 'land' ||
        t === 'transportation' ||
        singularizeToken(t) === 'vehicle' ||
        t === 'heritage' ||
        t === 'infrastructure'
    )
  ) {
    return null;
  }
  if (isDeprMachUmbrellaLabel(cleaned)) return null;
  const subKind = classifySemiMachChildKind(cleaned);
  if (subKind) return subKind;
  if (
    scoreStringSimilarity(cleaned, 'Other Equipment') >= 82 ||
    scoreStringSimilarity(cleaned, 'Other Machinery and Equipment') >= 82
  ) {
    return 'other_equip';
  }
  return null;
}

function isDeprTransUmbrellaLabel(rawText: string): boolean {
  const cleaned = cleanAccountLabel(rawText);
  if (!cleaned) return false;
  const tokens = tokenizeAndExpand(cleaned);
  if (!hasDeprExpensePrefixTokens(tokens)) return false;
  const hasTrans = tokens.some((t) => tokenSimilarity(t, 'transportation') >= 0.78);
  const hasEquip = tokens.some((t) => tokenSimilarity(t, 'equipment') >= 0.78);
  if (hasTrans && hasEquip) return true;
  return scoreStringSimilarity(cleaned, 'Depreciation - Transportation Equipment') >= 84;
}

function classifyDeprTransChildKind(
  rawText: string
): 'motor_vehicles' | 'other_trans_equip' | null {
  const cleaned = cleanAccountLabel(rawText);
  if (!cleaned) return null;
  const tokens = tokenizeAndExpand(cleaned);
  if (hasContraKeywords(tokens) || hasRepairsKeywords(tokens) || hasSemiKeywords(tokens)) return null;
  if (
    tokens.some(
      (t) =>
        t === 'machinery' ||
        t === 'office' ||
        t === 'ict' ||
        t === 'furniture' ||
        t === 'fixtures' ||
        singularizeToken(t) === 'book' ||
        singularizeToken(t) === 'building' ||
        singularizeToken(t) === 'structure' ||
        t === 'land' ||
        t === 'heritage'
    )
  ) {
    return null;
  }
  if (scoreStringSimilarity(cleaned, 'Motor Vehicles') >= 78) return 'motor_vehicles';
  if (scoreStringSimilarity(cleaned, 'Other Transportation Equipment') >= 78) return 'other_trans_equip';
  return null;
}

function isDeprFurnUmbrellaLabel(rawText: string): boolean {
  const cleaned = cleanAccountLabel(rawText);
  if (!cleaned) return false;
  const tokens = tokenizeAndExpand(cleaned);
  if (!hasDeprExpensePrefixTokens(tokens)) return false;
  const hasFurn = tokens.some((t) => tokenSimilarity(t, 'furniture') >= 0.76);
  const hasBooks = tokens.some(
    (t) => singularizeToken(t) === 'book' || tokenSimilarity(t, 'books') >= 0.82
  );
  if (hasFurn && hasBooks) return true;
  return scoreStringSimilarity(cleaned, 'Depreciation - Furniture, Fixtures and Books') >= 84;
}

function classifyDeprFurnChildKind(rawText: string): 'furniture' | 'books' | null {
  const cleaned = cleanAccountLabel(rawText);
  if (!cleaned) return null;
  const tokens = tokenizeAndExpand(cleaned);
  if (hasSemiKeywords(tokens)) return null;
  return classifySemiFurnBooksChildKind(cleaned);
}

interface PreparedLabelInfo {
  cleaned: string;
  lower: string;
  alpha: string;
  tokensAll: string[];
  expandedAlpha: string;
  singAlpha: string;
  contentSet: string[];
  bigrams: Uint16Array;
  hasContra: boolean;
  hasSemi: boolean;
  hasRepairs: boolean;
  hasDist: boolean;
  hasInv: boolean;
}

const PREPARED_LABEL_CACHE = new Map<string, PreparedLabelInfo>();

function getPreparedLabel(raw: string): PreparedLabelInfo {
  const cached = PREPARED_LABEL_CACHE.get(raw);
  if (cached) return cached;

  const cleaned = cleanAccountLabel(raw);
  const lower = cleaned.toLowerCase();
  const alpha = lower.replace(/[^a-z0-9]/g, '');
  const tokensAll = tokenizeAndExpand(cleaned);
  const expandedAlpha = tokensAll.join('');
  const singAlpha = tokensAll.map(singularizeToken).join('');
  const content = tokensAll.filter((t) => !STOP_WORDS.has(t));
  const contentSet = content.length > 0 ? content : tokensAll;
  const bigrams = buildSortedBigrams(expandedAlpha);

  const info: PreparedLabelInfo = {
    cleaned,
    lower,
    alpha,
    tokensAll,
    expandedAlpha,
    singAlpha,
    contentSet,
    bigrams,
    hasContra: hasContraKeywords(tokensAll),
    hasSemi: hasSemiKeywords(tokensAll),
    hasRepairs: hasRepairsKeywords(tokensAll),
    hasDist: tokensAll.includes('distribution'),
    hasInv: tokensAll.includes('inventory') || tokensAll.includes('inventories'),
  };

  if (PREPARED_LABEL_CACHE.size > 8000) PREPARED_LABEL_CACHE.clear();
  PREPARED_LABEL_CACHE.set(raw, info);
  return info;
}

function scorePreparedSimilarity(q: PreparedLabelInfo, c: PreparedLabelInfo, minRelevantBase = 0): number {
  if (!q.cleaned) return 0;
  if (q.lower === c.lower) return 100;
  if (q.alpha && q.alpha === c.alpha) return 99;
  if (q.expandedAlpha && q.expandedAlpha === c.expandedAlpha) return 97;
  if (q.singAlpha && q.singAlpha === c.singAlpha) return 95;

  const qSet = q.contentSet;
  const cSet = c.contentSet;
  const qLen = qSet.length;
  const cLen = cSet.length;
  if (qLen === 0 || cLen === 0) return 0;

  // Compute both forwardSum and backwardBest in a single symmetric pass
  const backwardBest = new Float64Array(cLen);
  let forwardSum = 0;
  for (let i = 0; i < qLen; i++) {
    const qt = qSet[i];
    let fBest = 0;
    for (let j = 0; j < cLen; j++) {
      const s = tokenSimilarity(qt, cSet[j]);
      if (s > fBest) fBest = s;
      if (s > backwardBest[j]) backwardBest[j] = s;
    }
    forwardSum += fBest;
  }
  const forwardAvg = forwardSum / qLen;

  let backwardSum = 0;
  for (let j = 0; j < cLen; j++) {
    backwardSum += backwardBest[j];
  }
  const backwardAvg = backwardSum / cLen;

  const tokenF1 =
    forwardAvg + backwardAvg > 0 ? (2 * forwardAvg * backwardAvg) / (forwardAvg + backwardAvg) : 0;

  const bigramSim = diceBigramSimilarityFromSorted(
    q.expandedAlpha.length,
    q.bigrams,
    c.expandedAlpha.length,
    c.bigrams
  );

  // Skip full-string Damerau-Levenshtein when even a 1.0 fullEditSim cannot reach minRelevantBase
  const prelimNoEdit = tokenF1 * 0.62 + bigramSim * 0.22;
  if (minRelevantBase > 0 && (prelimNoEdit + 0.16) * 94 < minRelevantBase) {
    return 0;
  }

  const maxStrLen = Math.max(q.expandedAlpha.length, c.expandedAlpha.length);
  const fullEditSim =
    maxStrLen > 0 ? Math.max(0, 1 - damerauLevenshtein(q.expandedAlpha, c.expandedAlpha) / maxStrLen) : 0;

  return Math.max(0, Math.min(94, Math.round((prelimNoEdit + fullEditSim * 0.16) * 94)));
}

function scoreStringSimilarity(rawQuery: string, targetLabel: string): number {
  return scorePreparedSimilarity(getPreparedLabel(rawQuery), getPreparedLabel(targetLabel));
}

type PerfSectionContext =
  | 'REVENUE'
  | 'PS'
  | 'MOOE'
  | 'FIN_EXP'
  | 'NON_CASH'
  | 'TRANSFERS_FROM'
  | 'TRANSFERS_TO'
  | 'NON_OP'
  | 'LOSSES';

type PerfSubContext = 'SUPPLIES' | 'REPAIRS';

type CashFlowSectionContext =
  | 'CASH_OPERATING_IN'
  | 'CASH_OPERATING_OUT'
  | 'CASH_INVESTING_IN'
  | 'CASH_INVESTING_OUT'
  | 'CASH_FINANCING_IN'
  | 'CASH_FINANCING_OUT';

type NetAssetsSectionContext = 'BEG_ADJ' | 'CY_CHANGES';

function isPerfSectionContext(ctx?: string): ctx is PerfSectionContext {
  return (
    ctx === 'REVENUE' ||
    ctx === 'PS' ||
    ctx === 'MOOE' ||
    ctx === 'FIN_EXP' ||
    ctx === 'NON_CASH' ||
    ctx === 'TRANSFERS_FROM' ||
    ctx === 'TRANSFERS_TO' ||
    ctx === 'NON_OP' ||
    ctx === 'LOSSES'
  );
}

function isCashFlowSectionContext(ctx?: string): ctx is CashFlowSectionContext {
  return Boolean(ctx && ctx.startsWith('CASH_'));
}

function isNetAssetsSectionContext(ctx?: string): ctx is NetAssetsSectionContext {
  return ctx === 'BEG_ADJ' || ctx === 'CY_CHANGES';
}

function stripTrailingNetAssetsFootnote(text: string): string {
  const cleaned = cleanAccountLabel(text);
  const match = cleaned.match(/^(.*\S)\s+(?:[\(\[]?\d{1,2}[\)\]]?)$/);
  if (!match) return cleaned;
  const prefix = match[1].trim();
  if (/(?:january|jan|december|dec|year|fy|no\.?|note|part|quarter|q)$/i.test(prefix)) {
    return cleaned;
  }
  return prefix;
}

function isNetAssetsEndingBalanceText(rawText: string): boolean {
  const withoutFootnote = stripTrailingNetAssetsFootnote(rawText);
  if (!withoutFootnote) return false;
  const naCleaned = withoutFootnote
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/\s+/g, ' ')
    .trim();
  return (
    /^(?:total\s+)?(?:balance|net\s+assets\s*\/?\s*equity)\s*(?:,?\s*(?:at|of|as\s+(?:at|of))|,)?\s*(?:december\s*31|dec\.?\s*31|end(?:ing)?(?:\s+of\s+period)?)\b/.test(
      naCleaned
    ) || /^ending\s+balance\b/.test(naCleaned)
  );
}

function isNetAssetsSummaryOrHeaderText(cleanedLower: string): boolean {
  if (!cleanedLower) return true;
  if (/^(?:sub-?total|total\b|grand\s+total\b)/.test(cleanedLower)) return true;
  if (/^add\s*\/?\s*\(?deduct\)?\s*:?$/.test(cleanedLower)) return true;
  if (/^restated\s+balance\s*:?$/.test(cleanedLower)) return true;
  if (isNetAssetsEndingBalanceText(cleanedLower)) {
    return true;
  }
  if (
    /^(?:adjustments\s+to\s+beginning\s+balance|changes\s+in\s+net\s+assets\s*\/?\s*equity(?:\s+for\s+the\s+(?:calendar\s+)?(?:year|period))?)\s*:?$/.test(
      cleanedLower
    )
  ) {
    return true;
  }
  return false;
}

function classifyCanonicalNetAssetsItemId(
  rawText: string,
  ctx?: NetAssetsSectionContext
): string | null {
  const withoutFootnote = stripTrailingNetAssetsFootnote(rawText);
  if (!withoutFootnote) return null;
  const lower = withoutFootnote
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/\s+/g, ' ')
    .trim();

  if (
    /^(?:balance|net\s+assets\s*\/?\s*equity)\s*(?:at|of|as\s+(?:at|of)|,)?\s*(?:january\s*1|jan\.?\s*1|beginning(?:\s+of\s+period)?)\b/.test(
      lower
    ) ||
    /^beginning\s+balance\b/.test(lower)
  ) {
    return 'na-beg-balance';
  }

  if (isNetAssetsSummaryOrHeaderText(lower)) return null;

  const norm = withoutFootnote.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!norm) return null;

  // 1. Adjustment of net revenue recognized directly in net assets/equity
  if (
    norm === 'adjustmentofnetrevenuerecognizeddirectlyinnetassetsequity' ||
    norm === 'adjustmentsofnetrevenuerecognizeddirectlyinnetassetsequity' ||
    norm === 'adjustmentofnetrevenuedirectlyrecognizedinnetassetsequity' ||
    (lower.includes('net revenue') &&
      (lower.includes('recognized') || lower.includes('directly') || lower.includes('net assets'))) ||
    scoreStringSimilarity(
      withoutFootnote,
      'Adjustment of net revenue recognized directly in net assets/equity'
    ) >= 80
  ) {
    return 'na-cy-net-revenue-adj';
  }

  // 2. Changes in Accounting Policy
  if (
    norm === 'changesinaccountingpolicy' ||
    norm === 'changeinaccountingpolicy' ||
    norm === 'changesinaccountingpolicies' ||
    scoreStringSimilarity(withoutFootnote, 'Changes in Accounting Policy') >= 84
  ) {
    return 'na-adj-accounting-policy';
  }

  // 3. Prior period errors (also COA variants like "Prior Period Adjustments/Unrecorded Income and Expenses")
  if (
    norm === 'priorperioderrors' ||
    norm === 'priorperioderror' ||
    norm === 'correctionofpriorperioderrors' ||
    norm === 'priorperiodadjustmentsunrecordedincomeandexpenses' ||
    norm === 'priorperiodadjustmentsunrecordedincomeexpenses' ||
    norm === 'priorperiodadjustments' ||
    norm === 'priorperiodadjustment' ||
    norm === 'unrecordedincomeandexpenses' ||
    (/\bprior\s+period\b/.test(lower) && /\b(?:error|errors|adjustment|adjustments)\b/.test(lower)) ||
    (/\bunrecorded\b/.test(lower) && /\bincome\b/.test(lower) && /\bexpense/.test(lower)) ||
    scoreStringSimilarity(withoutFootnote, 'Prior period errors') >= 84 ||
    scoreStringSimilarity(
      withoutFootnote,
      'Prior Period Adjustments/Unrecorded Income and Expenses'
    ) >= 82
  ) {
    return 'na-adj-prior-period-errors';
  }

  // 4. Surplus/(Deficit) for the Period
  if (
    norm === 'surplusdeficitfortheperiod' ||
    norm === 'surplusfortheperiod' ||
    norm === 'deficitfortheperiod' ||
    norm === 'netsurplusdeficitfortheperiod' ||
    norm === 'netsurplusfortheperiod' ||
    norm === 'surplusdeficitforthecalendaryear' ||
    (/^(?:net\s+)?(?:surplus|deficit)(?:\s*\/?\s*\(?(?:surplus|deficit)\)?)?\s+(?:for|of)\s+(?:the\s+)?(?:period|year|calendar\s+year)\b/.test(
      lower
    ))
  ) {
    return 'na-cy-surplus-deficit';
  }

  // 5. Other Adjustments
  if (
    norm === 'otheradjustments' ||
    norm === 'otheradjustment' ||
    scoreStringSimilarity(withoutFootnote, 'Other Adjustments') >= 88
  ) {
    return 'na-adj-other-adjustments';
  }

  // 6. Others
  if (
    norm === 'others' ||
    norm === 'otherchangesinnetassetsequity' ||
    norm === 'otherchanges'
  ) {
    return ctx === 'BEG_ADJ' && norm === 'others' ? 'na-adj-other-adjustments' : 'na-cy-others';
  }

  return null;
}

function classifyNetRevenueAdjustmentChildLabel(rawText: string): boolean {
  const withoutFootnote = stripTrailingNetAssetsFootnote(rawText);
  if (!withoutFootnote) return false;
  const lower = withoutFootnote
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!lower || isNetAssetsSummaryOrHeaderText(lower)) return false;
  if (classifyCanonicalNetAssetsItemId(rawText) !== null) return false;

  if (/^closing(?:\s*\/?\s*adjustment)?\s+of\s+cash\b/.test(lower)) {
    return true;
  }
  if (
    /\btreasury\s*\/?\s*agency\s+deposit\b/.test(lower) &&
    /\b(?:closing|adjustment|regular|special|trust)\b/.test(lower)
  ) {
    return true;
  }
  if (/\btax\s+remittance\s+advice\b/.test(lower) && /\b(?:closing|cash|bir|boc|btr)\b/.test(lower)) {
    return true;
  }
  if (
    /\bconstructive\s*(?:income|disbursement|disbursements)\b/.test(lower) ||
    /\bconstructivedisbursements?\b/.test(lower)
  ) {
    return true;
  }
  if (/^reversal\s+of\s+impairments?(?:\s+loss(?:es)?)?\b/.test(lower)) {
    return true;
  }
  return false;
}

function isNetAssetsCorrectionOfErrorLabel(rawText: string): boolean {
  const withoutFootnote = stripTrailingNetAssetsFootnote(rawText);
  if (!withoutFootnote) return false;
  const lower = withoutFootnote
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!lower || isNetAssetsSummaryOrHeaderText(lower)) return false;
  if (classifyCanonicalNetAssetsItemId(rawText) !== null) return false;
  if (/\bprior\s+period\b/.test(lower)) return false;

  const norm = lower.replace(/[^a-z0-9]/g, '');
  return (
    norm === 'correctionoferror' ||
    norm === 'correctionoferrors' ||
    norm === 'correctionsoferror' ||
    norm === 'correctionsoferrors' ||
    /^corrections?\s+of\s+errors?$/.test(lower) ||
    scoreStringSimilarity(withoutFootnote, 'Correction of Error') >= 88
  );
}

const PERFORMANCE_SYNONYM_GROUPS: string[][] = [
  ['retirementandlifeinsurancepremiums', 'lifeandretirementinsurancecontributions'],
  ['employeescompensationinsurancepremiums', 'ecccontributions'],
  ['incomefromgrantsanddonationsincash', 'donationsincash'],
  ['incomefromgrantsanddonationsinkind', 'donationsinkind'],
];

const CASH_FLOWS_SYNONYM_GROUPS: string[][] = [
  ['constructionacquistionofheritageassets', 'constructionacquisitionofheritageassets'],
  ['refundofcustomersdeposit', 'refundofcustomersdeposits'],
  ['paymentofdepositsonletterofcredits', 'paymentofdepositsonlettersofcredit'],
  ['purchaseofsemiexpendablemachineryandequipment', 'purchaseofsemiexpendablemachineryandequipments'],
  ['effectsofexchangeratechangesoncashandcashequivalents', 'effectofexchangeratechangesoncashandcashequivalents', 'effectsofexchangeratechangesoncash'],
  ['receiptofsharesgrantsanddonations', 'receiptofsharesgrantsanddonation'],
  ['repaymentoflongtermloansbygoccgfi', 'repaymentoflongtermloansbygoccsgfis'],
  ['collectionofreceivablefromauditdisallowances', 'collectionofreceivablesfromauditdisallowances'],
  [
    'cashandcashequivalentsjanuary1',
    'cashandcashequivalentsjan1',
    'cashandcashequivalentsbeginning',
    'cashandcashequivalentsbeg',
    'cashandcashequivalentsasofjanuary1',
    'cashandcashequivalentsatjanuary1',
    'cashbalancejanuary1',
    'cashbalancebeginning',
    'beginningcashandcashequivalents',
  ],
];

function arePerformanceSynonyms(a: string, b: string): boolean {
  const normA = normalizeAliasKey(a);
  const normB = normalizeAliasKey(b);
  if (!normA || !normB) return false;
  return PERFORMANCE_SYNONYM_GROUPS.some(
    (grp) => grp.includes(normA) && grp.includes(normB)
  );
}

function areCashFlowsSynonyms(a: string, b: string): boolean {
  const normA = normalizeAliasKey(a);
  const normB = normalizeAliasKey(b);
  if (!normA || !normB) return false;
  return CASH_FLOWS_SYNONYM_GROUPS.some(
    (grp) => grp.includes(normA) && grp.includes(normB)
  );
}

function resolveCashFlowClippedTargetId(
  normQuery: string,
  cashCtx?: CashFlowSectionContext,
  cashGroupCtx?: string
): string | undefined {
  if (!normQuery) return undefined;
  switch (normQuery) {
    case 'ngaslgusgoccs':
      if (cashGroupCtx === 'Other Receipts') return 'cf-op-in-oth-11';
      if (cashGroupCtx === 'Receipt of Inter-Agency Fund Transfers' || cashCtx === 'CASH_OPERATING_IN') {
        return 'cf-op-in-inter-2';
      }
      return undefined;
    case 'programsprojects':
    case 'programprojects':
      return 'cf-op-in-intra-1';
    case 'expenses':
      return cashCtx === 'CASH_OPERATING_IN' || cashGroupCtx === 'Other Receipts'
        ? 'cf-op-in-oth-8'
        : undefined;
    case 'receipts':
      return cashCtx === 'CASH_OPERATING_OUT' || cashGroupCtx === 'Remittance to National Treasury'
        ? 'cf-op-out-rem-4'
        : undefined;
    case 'andequipmentnotcapitalizable':
    case 'equipmentnotcapitalizable':
      return 'cf-op-out-prep-1';
    case 'plantandequipmentnotcapitalizable':
    case 'propertyplantandequipmentnotcapitalizable':
    case 'ofpropertyplantandequipmentnotcapitalizable':
      return 'cf-op-out-prep-0';
    case 'goodsservicesasauthorizedbylaw':
    case 'forpurchaseofgoodsservicesasauthorizedbylaw':
      return 'cf-op-out-inter-2';
    case 'projects':
      return cashGroupCtx === 'Release of Inter-Agency Fund Transfers' || cashCtx === 'CASH_OPERATING_OUT'
        ? 'cf-op-out-inter-3'
        : undefined;
    case 'consularoffices':
    case 'regionalconsularoffices':
      return 'cf-op-out-intra-1';
    case 'capitalizedrepair':
      return 'cf-inv-out-ppe-18';
    case 'andequipment':
      return cashCtx === 'CASH_INVESTING_OUT' ||
        cashGroupCtx === 'Purchase/Construction of Property, Plant and Equipment'
        ? 'cf-inv-out-ppe-19'
        : undefined;
    default:
      return undefined;
  }
}

function itemMatchesCashFlowContext(item: LineItemDefinition, ctx: CashFlowSectionContext): boolean {
  const isOutflow = item.subgroup === 'Cash Outflows';
  switch (ctx) {
    case 'CASH_OPERATING_IN':
      return item.section === 'CASH_OPERATING' && !isOutflow;
    case 'CASH_OPERATING_OUT':
      return item.section === 'CASH_OPERATING' && isOutflow;
    case 'CASH_INVESTING_IN':
      return item.section === 'CASH_INVESTING' && !isOutflow;
    case 'CASH_INVESTING_OUT':
      return item.section === 'CASH_INVESTING' && isOutflow;
    case 'CASH_FINANCING_IN':
      return item.section === 'CASH_FINANCING' && !isOutflow;
    case 'CASH_FINANCING_OUT':
      return item.section === 'CASH_FINANCING' && isOutflow;
  }
}

function itemMatchesPerfContext(item: LineItemDefinition, ctx: PerfSectionContext): boolean {
  switch (ctx) {
    case 'REVENUE':
      return item.section === 'REVENUE';
    case 'PS':
      return item.group === 'Personnel Services';
    case 'MOOE':
      return item.group === 'Maintenance and Other Operating Expenses';
    case 'FIN_EXP':
      return item.group === 'Financial Expenses';
    case 'NON_CASH':
      return item.group === 'Non-Cash Expenses';
    case 'TRANSFERS_FROM':
      return item.section === 'TRANSFERS' && !item.group.startsWith('Less:');
    case 'TRANSFERS_TO':
      return item.section === 'TRANSFERS' && item.group.startsWith('Less:');
    case 'NON_OP':
      return item.section === 'NON_OPERATING';
    case 'LOSSES':
      return item.section === 'LOSSES';
  }
}

function normalizeUacsKey(code?: string): string {
  return (code || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

const NON_OP_DEFAULT_AMBIGUOUS_KEYS = new Set(['miscellaneousincome', 'othergains']);

interface IndexedEncodableItems {
  byId: Map<string, LineItemDefinition>;
  byNormName: Map<string, LineItemDefinition[]>;
  byNormUacs: Map<string, LineItemDefinition[]>;
  itemMeta: Map<
    string,
    {
      prep: PreparedLabelInfo;
      normName: string;
      cContra: boolean;
      isNonOpDual: boolean;
    }
  >;
}

const ENCODABLE_ITEMS_INDEX_CACHE = new WeakMap<LineItemDefinition[], IndexedEncodableItems>();

function getIndexedEncodableItems(encodableItems: LineItemDefinition[]): IndexedEncodableItems {
  const cached = ENCODABLE_ITEMS_INDEX_CACHE.get(encodableItems);
  if (cached) return cached;

  const byId = new Map<string, LineItemDefinition>();
  const byNormName = new Map<string, LineItemDefinition[]>();
  const byNormUacs = new Map<string, LineItemDefinition[]>();
  const itemMeta = new Map<
    string,
    {
      prep: PreparedLabelInfo;
      normName: string;
      cContra: boolean;
      isNonOpDual: boolean;
    }
  >();

  for (let i = 0; i < encodableItems.length; i++) {
    const item = encodableItems[i];
    byId.set(item.id, item);
    const prep = getPreparedLabel(item.name);
    const normName = normalizeAliasKey(item.name);
    if (normName) {
      let arr = byNormName.get(normName);
      if (!arr) {
        arr = [];
        byNormName.set(normName, arr);
      }
      arr.push(item);
    }
    const normUacs = normalizeUacsKey(item.uacs);
    if (normUacs) {
      let uArr = byNormUacs.get(normUacs);
      if (!uArr) {
        uArr = [];
        byNormUacs.set(normUacs, uArr);
      }
      uArr.push(item);
    }
    itemMeta.set(item.id, {
      prep,
      normName,
      cContra: Boolean(item.isContra) || prep.hasContra,
      isNonOpDual: item.statementType === 'performance' && NON_OP_DEFAULT_AMBIGUOUS_KEYS.has(normName),
    });
  }

  const indexed: IndexedEncodableItems = { byId, byNormName, byNormUacs, itemMeta };
  ENCODABLE_ITEMS_INDEX_CACHE.set(encodableItems, indexed);
  return indexed;
}

interface PrecomputedQueryMatchMeta {
  rawQuery: string;
  qPrep: PreparedLabelInfo;
  normQuery: string;
  cashCtx?: CashFlowSectionContext;
  perfCtx?: PerfSectionContext;
  netAssetsCtx?: NetAssetsSectionContext;
  cashGroupCtx?: string;
  perfSubCtx?: PerfSubContext;
  clippedTargetId?: string;
  isCashBeginning: boolean;
  netAssetsCanonicalId: string | null;
  isNetAssetsRevenueChild: boolean;
  isNetAssetsCorrectionOfError: boolean;
  perfSemiFurnKind: 'furniture' | 'books' | null;
  perfSemiMachKind: string | null;
  perfDeprMachKind: string | null;
  perfDeprBldgKind: 'buildings' | 'school_buildings' | 'other_structures' | null;
  perfDeprTransKind: 'motor_vehicles' | 'other_trans_equip' | null;
  perfOtherBonusesKind: 'hardship' | 'cna' | 'pei' | 'pbb' | null;
}

function buildPrecomputedQueryMeta(
  rawQuery: string,
  statementTypeHint: StatementType | undefined,
  sectionContext?: PerfSectionContext | CashFlowSectionContext | NetAssetsSectionContext,
  subContext?: PerfSubContext | string
): PrecomputedQueryMatchMeta {
  const cleanedForNa =
    statementTypeHint === 'net_assets' ? stripTrailingNetAssetsFootnote(rawQuery) : rawQuery;
  const qPrep = getPreparedLabel(cleanedForNa);
  const normQuery = normalizeAliasKey(cleanedForNa);
  const cashCtx = isCashFlowSectionContext(sectionContext) ? sectionContext : undefined;
  const perfCtx = isPerfSectionContext(sectionContext) ? sectionContext : undefined;
  const netAssetsCtx = isNetAssetsSectionContext(sectionContext) ? sectionContext : undefined;
  const cashGroupCtx = cashCtx ? subContext : undefined;
  const perfSubCtx = !cashCtx ? (subContext as PerfSubContext | undefined) : undefined;

  const isCash = statementTypeHint === 'cash_flows' || Boolean(cashCtx);
  const isPerf = statementTypeHint === 'performance' || Boolean(perfCtx);
  const isNetAssets = statementTypeHint === 'net_assets' || Boolean(netAssetsCtx);
  const canPerfUmbrellaChild = isPerf && !qPrep.hasContra && !qPrep.hasRepairs;
  const netAssetsCanonicalId = isNetAssets
    ? classifyCanonicalNetAssetsItemId(rawQuery, netAssetsCtx)
    : null;

  return {
    rawQuery,
    qPrep,
    normQuery,
    cashCtx,
    perfCtx,
    netAssetsCtx,
    cashGroupCtx,
    perfSubCtx,
    clippedTargetId: isCash ? resolveCashFlowClippedTargetId(normQuery, cashCtx, cashGroupCtx) : undefined,
    isCashBeginning: isCash && detectSummaryRowKind(rawQuery, 'cash_flows') === 'cash_beginning',
    netAssetsCanonicalId,
    isNetAssetsRevenueChild:
      isNetAssets && !netAssetsCanonicalId && classifyNetRevenueAdjustmentChildLabel(rawQuery),
    isNetAssetsCorrectionOfError:
      isNetAssets && !netAssetsCanonicalId && isNetAssetsCorrectionOfErrorLabel(rawQuery),
    perfSemiFurnKind: canPerfUmbrellaChild ? classifySemiFurnBooksChildKind(rawQuery) : null,
    perfSemiMachKind: canPerfUmbrellaChild ? classifySemiMachChildKind(rawQuery) : null,
    perfDeprMachKind:
      canPerfUmbrellaChild && perfCtx === 'NON_CASH' ? classifyDeprMachChildKind(rawQuery) : null,
    perfDeprBldgKind:
      canPerfUmbrellaChild && perfCtx === 'NON_CASH' ? classifyDeprBldgChildKind(rawQuery) : null,
    perfDeprTransKind:
      canPerfUmbrellaChild && perfCtx === 'NON_CASH' ? classifyDeprTransChildKind(rawQuery) : null,
    perfOtherBonusesKind: canPerfUmbrellaChild ? classifyOtherBonusesChildKind(rawQuery) : null,
  };
}

function scoreLineItemMatchFast(
  q: PrecomputedQueryMatchMeta,
  item: LineItemDefinition,
  cMeta: { prep: PreparedLabelInfo; normName: string; cContra: boolean; isNonOpDual: boolean }
): number {
  let score = scorePreparedSimilarity(q.qPrep, cMeta.prep, 18);

  if (item.statementType === 'performance') {
    if (arePerformanceSynonyms(q.rawQuery, item.name)) {
      score = Math.max(score, 95);
    }
  } else if (item.statementType === 'cash_flows') {
    if (areCashFlowsSynonyms(q.rawQuery, item.name)) {
      score = Math.max(score, 95);
    }
    if (q.clippedTargetId && item.id === q.clippedTargetId) {
      score = Math.max(score, 96);
    }
    if (item.id === 'cf-sum-beg-cash' && q.isCashBeginning) {
      score = Math.max(score, 98);
    }
  } else if (item.statementType === 'net_assets') {
    if (q.netAssetsCanonicalId === item.id) {
      score = Math.max(score, 98);
    } else if (q.netAssetsCanonicalId && q.netAssetsCanonicalId !== item.id) {
      score = Math.max(0, score - 24);
    } else if (q.isNetAssetsRevenueChild && item.id === 'na-cy-net-revenue-adj') {
      score = Math.max(score, 90);
    } else if (q.isNetAssetsCorrectionOfError) {
      // As per prior consolidation basis, "Correction of Error" maps/suggests to "Other Adjustments"
      if (item.id === 'na-adj-other-adjustments') {
        score = Math.max(score, 88);
      } else if (item.id === 'na-adj-prior-period-errors') {
        score = Math.min(score, 62);
      }
    }
  }

  const qContra = q.qPrep.hasContra;
  const cContra = cMeta.cContra;
  const qRepairs = q.qPrep.hasRepairs;
  const cRepairs = cMeta.prep.hasRepairs;

  if (
    item.statementType === 'performance' &&
    !qContra &&
    !qRepairs &&
    q.perfSemiFurnKind !== null
  ) {
    if (q.perfSubCtx === 'REPAIRS') {
      if (item.id === 'perf-mooe-repairs-furn' || item.id === 'perf-mooe-repairs-semi-furn') {
        const prefersSemi = q.qPrep.hasSemi;
        const isSemiRepair = item.id === 'perf-mooe-repairs-semi-furn';
        score = Math.max(score, prefersSemi === isSemiRepair ? 86 : 76);
      }
    } else if (q.perfCtx === 'NON_CASH') {
      if (item.id === DEPR_FURN_UMBRELLA_ID && !q.qPrep.hasSemi) {
        score = Math.max(score, 84);
      }
    } else if (item.id === SEMI_FURN_BOOKS_UMBRELLA_ID) {
      score = Math.max(score, q.perfSubCtx === 'SUPPLIES' ? 86 : 80);
    }
  } else if (
    item.statementType === 'performance' &&
    !qContra &&
    !qRepairs &&
    (q.perfSemiMachKind !== null || (q.perfCtx === 'NON_CASH' && q.perfDeprMachKind !== null))
  ) {
    if (q.perfSubCtx === 'REPAIRS') {
      if (item.id === 'perf-mooe-repairs-mach' || item.id === 'perf-mooe-repairs-semi-mach') {
        const prefersSemi = q.qPrep.hasSemi;
        const isSemiRepair = item.id === 'perf-mooe-repairs-semi-mach';
        score = Math.max(score, prefersSemi === isSemiRepair ? 86 : 76);
      }
    } else if (q.perfCtx === 'NON_CASH') {
      if (item.id === DEPR_MACH_UMBRELLA_ID && !q.qPrep.hasSemi) {
        score = Math.max(score, 84);
      }
    } else if (item.id === SEMI_MACH_UMBRELLA_ID && q.perfSemiMachKind !== null) {
      score = Math.max(score, q.perfSubCtx === 'SUPPLIES' ? 86 : 80);
    }
  } else if (
    item.statementType === 'performance' &&
    q.perfCtx === 'NON_CASH' &&
    !qContra &&
    !qRepairs &&
    item.id === DEPR_BLDG_UMBRELLA_ID &&
    q.perfDeprBldgKind !== null
  ) {
    score = Math.max(score, 84);
  } else if (
    item.statementType === 'performance' &&
    q.perfCtx === 'NON_CASH' &&
    !qContra &&
    !qRepairs &&
    item.id === DEPR_TRANS_UMBRELLA_ID &&
    q.perfDeprTransKind !== null
  ) {
    score = Math.max(score, 84);
  } else if (
    item.statementType === 'performance' &&
    !qContra &&
    !qRepairs &&
    item.id === OTHER_BONUSES_UMBRELLA_ID &&
    q.perfOtherBonusesKind !== null
  ) {
    score = Math.max(score, q.perfCtx === 'PS' ? 88 : 82);
  }

  if (score === 0) return 0;

  if (qContra !== cContra) {
    score -= 22;
  }

  if (q.qPrep.hasSemi !== cMeta.prep.hasSemi) {
    score -= 18;
  }

  if (qRepairs && !cRepairs) {
    score -= 28;
  } else if (!qRepairs && cRepairs) {
    const allowedIndentedRepairChild =
      q.perfSubCtx === 'REPAIRS' && item.subgroup === 'Repairs and Maintenance';
    if (!allowedIndentedRepairChild) {
      score -= 28;
    }
  }

  if ((q.qPrep.hasDist && !cMeta.prep.hasDist && cMeta.prep.hasInv) || (q.qPrep.hasInv && !cMeta.prep.hasInv && cMeta.prep.hasDist)) {
    score -= 12;
  }

  if (q.perfCtx && item.statementType === 'performance' && !cMeta.isNonOpDual) {
    if (itemMatchesPerfContext(item, q.perfCtx)) {
      score = Math.min(100, score + 4);
    } else {
      score = Math.max(0, score - 8);
    }
  }

  if (
    q.perfSubCtx &&
    item.statementType === 'performance' &&
    item.group === 'Maintenance and Other Operating Expenses'
  ) {
    if (q.perfSubCtx === 'SUPPLIES') {
      if (item.subgroup === 'Supplies and Materials Expenses') {
        score = Math.min(100, score + 8);
      } else if (item.subgroup === 'Repairs and Maintenance') {
        score = Math.max(0, score - 14);
      }
    } else if (q.perfSubCtx === 'REPAIRS') {
      if (item.subgroup === 'Repairs and Maintenance') {
        score = Math.min(100, score + 10);
      } else if (item.subgroup === 'Supplies and Materials Expenses') {
        score = Math.max(0, score - 14);
      }
    }
  }

  if (q.cashCtx && item.statementType === 'cash_flows') {
    if (item.section !== 'CASH_FLOWS') {
      if (itemMatchesCashFlowContext(item, q.cashCtx)) {
        score = Math.min(100, score + 6);
      } else {
        score = Math.max(0, score - 14);
      }
    }
    if (q.cashGroupCtx && item.group === q.cashGroupCtx) {
      score = Math.min(100, score + 8);
    }
  }

  return Math.max(0, Math.min(100, score));
}

export function matchLineItemWithRecommendation(
  rawName: string,
  encodableItems: LineItemDefinition[],
  savedAliases: Record<string, string> = {},
  sectionContext?: PerfSectionContext | CashFlowSectionContext | NetAssetsSectionContext,
  subContext?: PerfSubContext | string,
  accountCode?: string
): LineItemRecommendation {
  const indexed = getIndexedEncodableItems(encodableItems);
  const aliasKey = normalizeAliasKey(rawName);
  if (aliasKey && savedAliases[aliasKey]) {
    const aliasItem = indexed.byId.get(savedAliases[aliasKey]);
    const normMatches = indexed.byNormName.get(aliasKey);
    const exactInContext = normMatches
      ? isPerfSectionContext(sectionContext)
        ? normMatches.find((i) => itemMatchesPerfContext(i, sectionContext))
        : isCashFlowSectionContext(sectionContext)
        ? normMatches.find((i) => itemMatchesCashFlowContext(i, sectionContext))
        : undefined
      : undefined;
    if (aliasItem && (!exactInContext || exactInContext.id === aliasItem.id)) {
      return {
        bestItem: aliasItem,
        confidence: 100,
        matchType: 'alias',
        alternatives: [],
      };
    }
  }

  const allowAggregatedDepMatch =
    isLumpedAccumulatedDepreciation(rawName) || /\baggregated\b/i.test(rawName);

  const normQueryUacs = accountCode && indexed.byNormUacs.size > 0 ? normalizeUacsKey(accountCode) : '';
  const uacsCandidates = normQueryUacs
    ? (indexed.byNormUacs.get(normQueryUacs) || []).filter(
        (item) => allowAggregatedDepMatch || item.id !== AGGREGATED_ACCUMULATED_DEPRECIATION_ID
      )
    : [];
  if (uacsCandidates.length === 1) {
    return {
      bestItem: uacsCandidates[0],
      confidence: 100,
      matchType: 'exact',
      alternatives: [],
    };
  }
  const uacsMatchIds = uacsCandidates.length > 1 ? new Set(uacsCandidates.map((i) => i.id)) : null;

  const statementTypeHint = encodableItems[0]?.statementType;
  const queryMeta = buildPrecomputedQueryMeta(
    rawName,
    statementTypeHint,
    sectionContext,
    subContext
  );

  const scored: { item: LineItemDefinition; confidence: number; meta: { normName: string; isNonOpDual: boolean } }[] = [];
  for (let i = 0; i < encodableItems.length; i++) {
    const item = encodableItems[i];
    if (!allowAggregatedDepMatch && item.id === AGGREGATED_ACCUMULATED_DEPRECIATION_ID) {
      continue;
    }
    const cMeta = indexed.itemMeta.get(item.id)!;
    let confidence = scoreLineItemMatchFast(queryMeta, item, cMeta);
    if (uacsMatchIds?.has(item.id)) {
      confidence = Math.min(100, Math.max(confidence, 85) + 12);
    }
    if (confidence >= 35) {
      scored.push({ item, confidence, meta: cMeta });
    }
  }

  if (scored.length === 0) {
    return {
      bestItem: null,
      confidence: 0,
      matchType: 'none',
      alternatives: [],
    };
  }

  scored.sort((a, b) => {
    if (b.confidence !== a.confidence) return b.confidence - a.confidence;
    if (a.meta.normName === b.meta.normName && a.meta.isNonOpDual) {
      const aNonOp = a.item.section === 'NON_OPERATING' ? 0 : 1;
      const bNonOp = b.item.section === 'NON_OPERATING' ? 0 : 1;
      if (aNonOp !== bNonOp) return aNonOp - bNonOp;
    }
    return a.item.order - b.item.order;
  });

  const top = scored[0];
  let matchType: MatchConfidenceType = 'low';
  if (top.confidence >= 99) matchType = 'exact';
  else if (top.confidence >= 95) matchType = 'normalized';
  else if (top.confidence >= 66) matchType = 'suggested';

  return {
    bestItem: top.item,
    confidence: top.confidence,
    matchType,
    alternatives: scored.slice(0, 3).map((s) => ({ item: s.item, confidence: s.confidence })),
  };
}

// ============================================================================
// Higher-Level Hierarchy & Summary Row Detection (Lowest-Level Leaf Enforcement)
// ============================================================================

interface HierarchyClassifier {
  strictHierarchyLabels: string[];   // Group/Subgroup/Subsection names that NEVER match a leaf item name
  ambiguousHierarchyLabels: string[]; // Labels that exist BOTH as a group/subgroup header AND as a leaf item name
  leafNormSet: Set<string>;
}

function buildHierarchyClassifier(
  encodableItems: LineItemDefinition[],
  statementType: StatementType = 'position'
): HierarchyClassifier {
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
  if (statementType === 'position') {
    [
      'Property and Equipment',
      'Loans and Receivables',
      'Other Receivables',
      'Semi-Expendable Machinery and Equipment',
      'Semi-Expendable Furniture, Fixtures and Books',
    ].forEach(register);
  } else if (statementType === 'performance') {
    [
      'Service Income',
      'Business Income',
      'Shares, Grants and Donation',
      'Shares, Grants and Donations',
      'Donations',
      'Training and Scholarship',
      'Training and Scholarship Expenses',
      'Taxes, Insurance Premiums and Other Fees',
      'Transfers, Assistance and Subsidy',
      'Less: Current Operating Expenses',
      'Financial Assistance/Subsidy',
      'Financial Assistance/Subsidy from NGAs, LGUs, GOCCs',
      'Less: Financial Assistance/Subsidy to NGAs, LGUs, GOCCs',
      'Other Non-Operating Income',
      'Sale of Assets',
      'Gains',
      'Losses',
    ].forEach(register);
  } else if (statementType === 'cash_flows') {
    [
      'Operating Activities',
      'Investing Activities',
      'Financing Activities',
      'Add: Cash Inflows',
      'Less: Cash Outflows',
      'Receipt of Assistance/Subsidy',
      'Collection of Income/Revenue',
      'and Books',
    ].forEach(register);
  }

  const strictHierarchyLabels: string[] = [];
  const ambiguousHierarchyLabels: string[] = [];

  allHierarchyRaw.forEach((label, key) => {
    if (leafNormSet.has(key)) {
      ambiguousHierarchyLabels.push(label);
    } else {
      strictHierarchyLabels.push(label);
    }
  });

  return { strictHierarchyLabels, ambiguousHierarchyLabels, leafNormSet };
}

export function detectSummaryRowKind(
  rawName: string,
  statementType: StatementType = 'position'
): ExtractedPositionRow['summaryKind'] | undefined {
  const cleaned = cleanAccountLabel(rawName).toLowerCase().replace(/\s+/g, ' ').trim();
  if (!cleaned) return undefined;

  if (statementType === 'position') {
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
  } else if (statementType === 'performance') {
    if (/^total\s+(?:revenue|revenues|income)\b/.test(cleaned)) {
      return 'total_revenue';
    }
    if (
      /^current\s+operating\s+expenses$/.test(cleaned) ||
      /^total\s+(?:current\s+)?(?:operating\s+)?expenses?\b/.test(cleaned)
    ) {
      return 'total_expenses';
    }
    if (
      /^(?:net\s+)?surplus\s*\/?\s*\(?deficit\)?\s+(?:from\s+current\s+operations|before\s+transfers|for\s+the\s+period|after\s+transfers)\b/.test(
        cleaned
      ) ||
      /^surplus\s*\/?\s*\(deficit\)$/.test(cleaned)
    ) {
      return 'surplus_deficit';
    }
    if (/^net\s+financial\s+assistance\s*\/?\s*subsidy\b/.test(cleaned)) {
      return 'subtotal';
    }
  } else if (statementType === 'cash_flows') {
    if (
      /^(?:total\s+)?(?:(?:add|less)\s*:\s*)?cash\s+(?:inflows|outflows)\b/.test(cleaned)
    ) {
      return 'cash_inflows_outflows';
    }
    if (/^(?:net\s+)?cash\s+(?:provided|generated|used|from)\b/.test(cleaned)) {
      return 'net_cash_activity';
    }
    const cashIncDecNormalized = cleaned
      .replace(/^(?:(?:add|less)(?:\s*\/\s*\(?less\)?)?\s*:\s*)+/i, '')
      .replace(/^(?:total|net)\s+/i, '')
      .replace(/&/g, ' and ')
      .replace(/[\/()[\],–—-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const cashIncDecTokens = cashIncDecNormalized.split(' ').filter(Boolean);
    const hasFuzzyCashIncDec =
      cashIncDecTokens.length >= 4 &&
      (cashIncDecTokens[0] === 'inc' || tokenSimilarity(cashIncDecTokens[0], 'increase') >= 0.72) &&
      (cashIncDecTokens[1] === 'dec' ||
        tokenSimilarity(cashIncDecTokens[1], 'decrease') >= 0.72 ||
        (cashIncDecTokens[1] === 'or' &&
          cashIncDecTokens[2] !== undefined &&
          (cashIncDecTokens[2] === 'dec' || tokenSimilarity(cashIncDecTokens[2], 'decrease') >= 0.72))) &&
      /\b(?:in|of)\s+cash\b/.test(cashIncDecNormalized) &&
      !cashIncDecNormalized.includes('exchange') &&
      !cashIncDecNormalized.includes('rate');
    const hasSingleIncOrDecInCash =
      /^(?:increase|decrease|increse|decrese)\s+(?:in|of)\s+cash(?:\s+and\s+cash\s+equiv(?:alent|alents)?)?$/.test(
        cashIncDecNormalized
      );
    if (
      /^(?:net\s+)?increase\s*\/?\s*\(?decrease\)?\s+(?:in|of)\s+cash\b/.test(cleaned) ||
      hasFuzzyCashIncDec ||
      hasSingleIncOrDecInCash
    ) {
      return 'cash_increase_decrease';
    }
    const cashDateNormalized = cleaned
      .replace(/^(?:add|less)\s*:\s*/i, '')
      .replace(/&/g, ' and ')
      .replace(/[.,()–—-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (
      /^cash\s+(?:and\s+cash\s+equivalents|balance)\s+(?:as\s+(?:of|at)\s+|at\s+)?(?:january\s*1|jan\s*1|beg(?:inning)?)\b/.test(
        cashDateNormalized
      ) ||
      /^beg(?:inning)?\s+cash\s+(?:and\s+cash\s+equivalents|balance)\b/.test(cashDateNormalized)
    ) {
      return 'cash_beginning';
    }
    if (
      /^cash\s+(?:and\s+cash\s+equivalents|balance)\s+(?:as\s+(?:of|at)\s+|at\s+)?(?:december\s*31|dec\s*31|end(?:ing)?)\b/.test(
        cashDateNormalized
      )
    ) {
      return 'cash_beginning_ending';
    }
    // FUTURE TODO: Cash Flows Excel worksheets often include a "CHECKING" row (used to verify
    // Ending Cash against the Statement of Financial Position). Ignore it during import for now;
    // cross-statement checking will be added once all financial statements are finalized.
    const checkingNormalized = cleaned
      .replace(/[:\-–—.,()\[\]\/]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (/^(?:(?:for|cash(?:\s+flows?)?|scf)\s+)?checking\b/.test(checkingNormalized)) {
      return 'cash_checking_ignored';
    }
  } else if (statementType === 'net_assets') {
    const naCleaned = cleaned.replace(/&/g, ' and ').replace(/\s+/g, ' ').trim();
    if (
      /^(?:balance|net\s+assets\s*\/?\s*equity)\s*(?:at|of|as\s+(?:at|of)|,)?\s*(?:january\s*1|jan\.?\s*1|beginning(?:\s+of\s+period)?)\b/.test(
        naCleaned
      ) ||
      /^beginning\s+balance\b/.test(naCleaned)
    ) {
      return 'net_assets_beginning';
    }
    if (
      isNetAssetsEndingBalanceText(naCleaned) ||
      /^restated\s+balance\b/.test(naCleaned) ||
      /^add\s*\/?\s*\(?deduct\)?\s*:?$/.test(naCleaned) ||
      /^(?:adjustments\s+to\s+beginning\s+balance|changes\s+in\s+net\s+assets\s*\/?\s*equity(?:\s+for\s+the\s+(?:calendar\s+)?(?:year|period))?)\s*:?$/.test(
        naCleaned
      ) ||
      /^total\s+(?:adjustments(?:\s+to\s+beginning\s+balance)?|changes\s+in\s+net\s+assets(?:\s*\/?\s*equity)?)\b/.test(
        naCleaned
      )
    ) {
      return 'net_assets_summary';
    }
  }

  if (
    /^(?:sub-?total|total\b|grand\s+total\b|net\s+assets\/equity$)/.test(cleaned) ||
    /\bsubtotal\b/.test(cleaned) ||
    /(?:^|[\s,\-–—(])total\)?$/.test(cleaned)
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
 * Checks whether an Excel formula is a same-sheet rollup summing 2+ rows strictly below
 * `parentExcelRow` and within the parent's block (before `blockEndExcelRow`).
 * Prevents leaf accounts that share a group name (e.g. "Other Current Assets" under Deposits)
 * from being skipped as group totals when they compute from cells above or external schedules.
 */
function isDownwardBlockSumFormula(
  formula: string | undefined,
  parentExcelRow: number,
  blockEndExcelRow: number | null,
  lastBlockExcelRow: number | null
): boolean {
  if (!formula || !isSumFormulaString(formula)) return false;
  const f = formula.toUpperCase().replace(/\$/g, '').replace(/\s+/g, '');
  if (f.includes('!')) return false;

  const isRowInDownwardBlock = (rowNum: number): boolean => {
    if (rowNum <= parentExcelRow) return false;
    if (blockEndExcelRow !== null) return rowNum < blockEndExcelRow;
    return lastBlockExcelRow !== null && rowNum <= lastBlockExcelRow;
  };

  const referencedRows = new Set<number>();
  let hasInvalidReference = false;

  // Inspect SUM(...) argument expressions
  const sumMatch = f.match(/\bSUM\(([^()]+)\)/);
  if (sumMatch) {
    const args = sumMatch[1].split(',').filter(Boolean);
    if (args.length === 0) return false;
    for (const arg of args) {
      const rangeMatch = arg.match(/^([A-Z]{1,3})(\d+):([A-Z]{1,3})(\d+)$/);
      if (rangeMatch) {
        const startRow = parseInt(rangeMatch[2], 10);
        const endRow = parseInt(rangeMatch[4], 10);
        const lo = Math.min(startRow, endRow);
        const hi = Math.max(startRow, endRow);
        if (!isRowInDownwardBlock(lo) || !isRowInDownwardBlock(hi)) {
          hasInvalidReference = true;
          break;
        }
        referencedRows.add(lo);
        referencedRows.add(hi);
      } else {
        const cellMatch = arg.match(/^([A-Z]{1,3})(\d+)$/);
        if (!cellMatch) {
          hasInvalidReference = true;
          break;
        }
        const rowNum = parseInt(cellMatch[2], 10);
        if (!isRowInDownwardBlock(rowNum)) {
          hasInvalidReference = true;
          break;
        }
        referencedRows.add(rowNum);
      }
    }
    return !hasInvalidReference && referencedRows.size >= 2;
  }

  // Inspect direct cell addition/subtraction (e.g. E98+E105+E110)
  if (/^[A-Z]{1,3}\d+(?:[+-][A-Z]{1,3}\d+)+$/.test(f)) {
    const refs = f.match(/[A-Z]{1,3}(\d+)/g) || [];
    for (const ref of refs) {
      const numMatch = ref.match(/(\d+)$/);
      if (!numMatch) {
        hasInvalidReference = true;
        break;
      }
      const rowNum = parseInt(numMatch[1], 10);
      if (!isRowInDownwardBlock(rowNum)) {
        hasInvalidReference = true;
        break;
      }
      referencedRows.add(rowNum);
    }
    return !hasInvalidReference && referencedRows.size >= 2;
  }

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
    'aggregated',
    'combined',
    'lumped',
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

/**
 * Detects summary net PPE subtotal rows (e.g. "Property, Plant, and Equipment (Net)",
 * "PPE - Net", "Net Property, Plant and Equipment") so they are cleanly skipped as
 * auto-computed net summary rows without triggering a lumped-depreciation error.
 */
export function isNetPPESummaryRow(rawName: string): boolean {
  const cleaned = cleanAccountLabel(rawName)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned) return false;

  // Individual class rows like "Net Value - Other Property, Plant and Equipment" or "Other PPE" must not trigger
  if (/\bother\b/.test(cleaned)) return false;
  if (/\b(?:accumulated|accum|depr|depreciation|impairment)\b/.test(cleaned)) return false;

  const tokens = cleaned.split(/\s+/).filter(Boolean);
  const hasNetOrCarrying =
    tokens.includes('net') ||
    (tokens.includes('carrying') && (tokens.includes('amount') || tokens.includes('value')));
  if (!hasNetOrCarrying) return false;

  // Reject specific PPE sub-classes (e.g., "Net Value - School Buildings", "Net Value - Office Equipment")
  const SPECIFIC_PPE_CLASSES = new Set([
    'land',
    'building',
    'buildings',
    'school',
    'office',
    'ict',
    'information',
    'communications',
    'technical',
    'scientific',
    'medical',
    'sports',
    'printing',
    'military',
    'police',
    'disaster',
    'rescue',
    'agricultural',
    'forestry',
    'marine',
    'fishery',
    'airport',
    'motor',
    'vehicle',
    'vehicles',
    'furniture',
    'fixtures',
    'books',
    'leased',
    'heritage',
    'biological',
    'intangible',
    'machinery',
    'structures',
    'infrastructure',
    'road',
    'water',
    'power',
    'sewer',
    'parks',
    'plazas',
    'construction',
    'progress',
  ]);
  if (tokens.some((t) => SPECIFIC_PPE_CLASSES.has(t))) {
    return false;
  }

  // Matches "PPE - Net" / "Net PPE" / "Total PPE, Net"
  if (tokens.includes('ppe')) {
    const allowedPpeTokens = new Set(['ppe', 'net', 'total', 'carrying', 'amount', 'value', 'and']);
    return tokens.every((t) => allowedPpeTokens.has(t));
  }

  // Matches "Property, Plant, and Equipment - Net" / "Total Property, Plant and Equipment, Net"
  const hasProperty = tokens.some((t) => t === 'property' || tokenSimilarity(t, 'property') >= 0.78);
  const hasPlant = tokens.some((t) => t === 'plant' || tokenSimilarity(t, 'plant') >= 0.8);
  const hasEquipment = tokens.some((t) => t === 'equipment' || tokenSimilarity(t, 'equipment') >= 0.78);

  if (hasProperty && hasPlant && hasEquipment) {
    return tokens.every((t) => {
      if (['and', 'net', 'total', 'carrying', 'amount', 'value'].includes(t)) return true;
      if (t === 'property' || tokenSimilarity(t, 'property') >= 0.78) return true;
      if (t === 'plant' || tokenSimilarity(t, 'plant') >= 0.8) return true;
      if (t === 'equipment' || tokenSimilarity(t, 'equipment') >= 0.78) return true;
      return false;
    });
  }

  return false;
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
  indentScore: number;
  isContraName: boolean;
  amountsByTargetId: Record<string, number | null>;
  formulas: string[];
  hasSumFormula: boolean;
  strictSummaryKind?: ExtractedPositionRow['summaryKind'];
  isLumpedDep: boolean;
  isNetPpeSummary: boolean;
  inEquitySection: boolean;
  equityRole?: EquityRowRole;
  perfContext?: PerfSectionContext;
  perfSubContext?: PerfSubContext;
  cashContext?: CashFlowSectionContext;
  cashGroupContext?: string;
  netAssetsContext?: NetAssetsSectionContext;
  isProvisionalZeroUmbrella?: boolean;
  matchesStrictHierarchy: boolean;
  matchesAmbiguousHierarchy: boolean;
  fuzzyHierarchyScore: number;
}

function findAmbiguousBlockEndExcelRow(
  allRows: InternalRawRow[],
  parentIdx: number
): {
  blockEndExcelRow: number | null;
  lastBlockExcelRow: number | null;
  hasCandidateChildRows: boolean;
} {
  const parent = allRows[parentIdx];
  let enteredIndented = false;
  let hasCandidateChildRows = false;
  let lastBlockExcelRow: number | null = null;

  for (let j = parentIdx + 1; j < allRows.length; j++) {
    const child = allRows[j];
    if (child.strictSummaryKind) {
      return {
        blockEndExcelRow: child.excelRowNumber,
        lastBlockExcelRow,
        hasCandidateChildRows,
      };
    }
    if (child.indentScore < parent.indentScore) {
      return {
        blockEndExcelRow: child.excelRowNumber,
        lastBlockExcelRow,
        hasCandidateChildRows,
      };
    }
    if (child.indentScore === parent.indentScore && enteredIndented) {
      return {
        blockEndExcelRow: child.excelRowNumber,
        lastBlockExcelRow,
        hasCandidateChildRows,
      };
    }
    if (child.indentScore > parent.indentScore) {
      enteredIndented = true;
    }
    hasCandidateChildRows = true;
    lastBlockExcelRow = child.excelRowNumber;
  }

  return { blockEndExcelRow: null, lastBlockExcelRow, hasCandidateChildRows };
}

const MAJOR_SECTION_BOUNDARY_KINDS = new Set<
  NonNullable<ExtractedPositionRow['summaryKind']>
>([
  'total_assets',
  'total_liabilities',
  'total_equity',
  'total_liabilities_equity',
  'total_revenue',
  'total_expenses',
  'surplus_deficit',
  'cash_inflows_outflows',
  'net_cash_activity',
  'cash_increase_decrease',
  'cash_beginning',
  'cash_beginning_ending',
  'cash_checking_ignored',
  'net_assets_beginning',
  'net_assets_summary',
]);

/**
 * Returns true if `parentIdx` is immediately followed by at least one strictly more-indented
 * non-contra row before indentation returns to `<= parent.indentScore` or a major total boundary.
 */
function hasIndentedNonContraChild(allRows: InternalRawRow[], parentIdx: number): boolean {
  const parent = allRows[parentIdx];
  for (let j = parentIdx + 1; j < allRows.length; j++) {
    const child = allRows[j];
    if (child.indentScore <= parent.indentScore) {
      break;
    }
    if (child.strictSummaryKind) {
      if (
        MAJOR_SECTION_BOUNDARY_KINDS.has(child.strictSummaryKind) ||
        child.strictSummaryKind === 'subtotal'
      ) {
        break;
      }
      if (child.strictSummaryKind === 'net_value') {
        continue;
      }
    }
    if (child.isContraName) {
      continue;
    }
    return true;
  }
  return false;
}

/**
 * Checks whether `parentRow` equals the sum of consecutive leaf/non-summary rows below it
 * across all enabled numeric columns, respecting spreadsheet indentation so indented items
 * (even those sharing a group name like Other Payables) are included inside their parent's block.
 */
function checkIfRollupOfRowsBelow(
  allRows: InternalRawRow[],
  parentIdx: number,
  activeTargetIds: string[],
  maxLookahead = 25,
  depth = 0
): { isRollup: boolean; childCount: number; singleMatchedChildIdx?: number } {
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

  const parentIndent = parent.indentScore;
  let hasEnteredIndentedBlock = false;
  let leafChildrenCount = 0;
  let firstLeafChildIdx: number | undefined = undefined;
  const limit = Math.min(allRows.length, parentIdx + 1 + maxLookahead);

  for (let j = parentIdx + 1; j < limit; j++) {
    const child = allRows[j];

    // Stop early if we hit a major section/total boundary
    if (child.strictSummaryKind && MAJOR_SECTION_BOUNDARY_KINDS.has(child.strictSummaryKind)) {
      break;
    }

    // Stop if indentation steps back out above parent's level
    if (child.indentScore < parentIndent) {
      break;
    }

    // If we already entered an indented child block under parent and returned to parent's indent level, the block has ended
    if (child.indentScore === parentIndent && hasEnteredIndentedBlock) {
      break;
    }

    if (child.indentScore > parentIndent) {
      hasEnteredIndentedBlock = true;
    }

    // Stop if a subtotal closes this block at the parent's indentation level or shallower
    if (child.strictSummaryKind === 'subtotal' && child.indentScore <= parentIndent) {
      break;
    }

    // Skip nested sub-headers / subtotals / net-value rows while accumulating leaf items underneath
    if (child.strictSummaryKind || child.matchesStrictHierarchy) {
      continue;
    }

    if (child.matchesAmbiguousHierarchy && !child.accountCode) {
      const childHasIndentedChildren = hasIndentedNonContraChild(allRows, j);
      const childIsNestedRollup =
        depth < 1 &&
        checkIfRollupOfRowsBelow(allRows, j, activeTargetIds, Math.max(1, limit - j), depth + 1)
          .isRollup;

      if (child.indentScore > parentIndent) {
        // Inside parent's indented block: skip only if this row itself is an intermediate subgroup header
        if (childHasIndentedChildren || childIsNestedRollup) {
          continue;
        }
      } else if (leafChildrenCount > 0) {
        // Same indentation level: break if this looks like the next sibling group header
        if (childHasIndentedChildren || childIsNestedRollup) {
          break;
        }
      }
    }

    leafChildrenCount++;
    if (leafChildrenCount === 1) {
      firstLeafChildIdx = j;
    }
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
      return {
        isRollup: true,
        childCount: leafChildrenCount,
        singleMatchedChildIdx: leafChildrenCount === 1 ? firstLeafChildIdx : undefined,
      };
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
  savedAliases: Record<string, string>,
  statementType: StatementType = 'position'
): ExtractedPositionRow[] {
  const activeTargets = yearTargets.filter((t) => t.enabled && t.colIndex >= 0);
  if (activeTargets.length === 0) return [];

  const isPositionStatement = statementType === 'position';
  const { rows } = getTrimmedSheetGrid(sheet);
  const earliestAmountCol = Math.min(...activeTargets.map((t) => t.colIndex));
  const hierarchy = buildHierarchyClassifier(encodableItems, statementType);
  const strictHierarchyPreps = hierarchy.strictHierarchyLabels.map((lbl) => getPreparedLabel(lbl));
  const ambiguousHierarchyPreps = hierarchy.ambiguousHierarchyLabels.map((lbl) => getPreparedLabel(lbl));

  const activeTargetIds = activeTargets.map((t) => t.id);
  const hasTarget2024 = activeTargets.some((t) => t.targetYear === '2024');
  const hasBegCashEncodableItem = encodableItems.some((i) => i.id === 'cf-sum-beg-cash');
  const hasBegNetAssetsEncodableItem = encodableItems.some((i) => i.id === 'na-beg-balance');

  // Pass 1: Extract raw candidate rows with metadata & section context
  const rawExtracted: InternalRawRow[] = [];
  let inEquitySection = false;
  let passedTotalLiabilities = false;
  let currentPerfContext: PerfSectionContext | undefined =
    statementType === 'performance' ? 'REVENUE' : undefined;
  let currentPerfSubContext: PerfSubContext | undefined = undefined;
  let currentCashContext: CashFlowSectionContext | undefined =
    statementType === 'cash_flows' ? 'CASH_OPERATING_IN' : undefined;
  let currentCashGroupContext: string | undefined = undefined;
  let currentNetAssetsContext: NetAssetsSectionContext | undefined =
    statementType === 'net_assets' ? 'BEG_ADJ' : undefined;
  let passedNetAssetsEndingBalance = false;

  const cashGroupByNorm = new Map<string, { group: string; cashCtx: CashFlowSectionContext }>();
  if (statementType === 'cash_flows') {
    encodableItems.forEach((it) => {
      if (it.section === 'CASH_FLOWS') return;
      const gNorm = normalizeAliasKey(it.group);
      if (!gNorm) return;
      const isOut = it.subgroup === 'Cash Outflows';
      const ctx: CashFlowSectionContext =
        it.section === 'CASH_INVESTING'
          ? isOut
            ? 'CASH_INVESTING_OUT'
            : 'CASH_INVESTING_IN'
          : it.section === 'CASH_FINANCING'
          ? isOut
            ? 'CASH_FINANCING_OUT'
            : 'CASH_FINANCING_IN'
          : isOut
          ? 'CASH_OPERATING_OUT'
          : 'CASH_OPERATING_IN';
      if (!cashGroupByNorm.has(`${ctx}::${gNorm}`)) {
        cashGroupByNorm.set(`${ctx}::${gNorm}`, { group: it.group, cashCtx: ctx });
      }
      if (it.group.startsWith('Purchase of Semi-Expendable')) {
        cashGroupByNorm.set(`${ctx}::andbooks`, { group: it.group, cashCtx: ctx });
      }
    });
  }

  const updateCashContextFromText = (txt: string) => {
    const cleanedLow = cleanAccountLabel(txt).toLowerCase().trim();
    const norm = normalizeAliasKey(txt);
    if (!cleanedLow || !norm) return;

    if (/^(?:cash\s+flows\s+from\s+)?operating\s+activities\b/.test(cleanedLow)) {
      currentCashContext = 'CASH_OPERATING_IN';
      currentCashGroupContext = undefined;
      return;
    }
    if (/^(?:cash\s+flows\s+from\s+)?investing\s+activities\b/.test(cleanedLow)) {
      currentCashContext = 'CASH_INVESTING_IN';
      currentCashGroupContext = undefined;
      return;
    }
    if (/^(?:cash\s+flows\s+from\s+)?financing\s+activities\b/.test(cleanedLow)) {
      currentCashContext = 'CASH_FINANCING_IN';
      currentCashGroupContext = undefined;
      return;
    }
    if (/^(?:add\s*:\s*)?cash\s+inflows\b/.test(cleanedLow)) {
      if (currentCashContext?.startsWith('CASH_INVESTING')) currentCashContext = 'CASH_INVESTING_IN';
      else if (currentCashContext?.startsWith('CASH_FINANCING')) currentCashContext = 'CASH_FINANCING_IN';
      else currentCashContext = 'CASH_OPERATING_IN';
      currentCashGroupContext = undefined;
      return;
    }
    if (/^(?:less\s*:\s*)?cash\s+outflows\b/.test(cleanedLow)) {
      if (currentCashContext?.startsWith('CASH_INVESTING')) currentCashContext = 'CASH_INVESTING_OUT';
      else if (currentCashContext?.startsWith('CASH_FINANCING')) currentCashContext = 'CASH_FINANCING_OUT';
      else currentCashContext = 'CASH_OPERATING_OUT';
      currentCashGroupContext = undefined;
      return;
    }
    if (
      /^(?:total\s+cash\s+(?:inflows|outflows)|(?:net\s+)?cash\s+(?:provided|generated|used|from)|(?:net\s+)?increase)/.test(
        cleanedLow
      ) ||
      detectSummaryRowKind(txt, 'cash_flows') !== undefined
    ) {
      currentCashGroupContext = undefined;
      return;
    }
    if (currentCashContext) {
      const grpEntry = cashGroupByNorm.get(`${currentCashContext}::${norm}`);
      if (grpEntry) {
        currentCashGroupContext = grpEntry.group;
      }
    }
  };

  const updatePerfContextFromText = (txt: string) => {
    const low = cleanAccountLabel(txt).toLowerCase();
    if (!low) return;
    if (/^revenue\b|^service and business income\b|^shares,\s*grants/.test(low)) {
      currentPerfContext = 'REVENUE';
      currentPerfSubContext = undefined;
    } else if (
      /^(?:personnel services|salaries and wages|other compensation|personnel benefit contributions|other personnel benefits)\b/.test(
        low
      )
    ) {
      currentPerfContext = 'PS';
      currentPerfSubContext = undefined;
    } else if (/^(?:less:\s*)?maintenance and other operating expenses\b/.test(low)) {
      currentPerfContext = 'MOOE';
      currentPerfSubContext = undefined;
    } else if (/^supplies and materials\b|^semi[-\s]?expendable\b/.test(low) && !/\brepair|\bmaint(?:enance)?\b/.test(low)) {
      currentPerfContext = 'MOOE';
      currentPerfSubContext = 'SUPPLIES';
    } else if (/^(?:total|sub-?total)\s+(?:supplies and materials|repairs and maintenance)\b/.test(low)) {
      currentPerfSubContext = undefined;
    } else if (/^repairs\s*(?:&|and)\s*maintenance\b/.test(low)) {
      currentPerfContext = 'MOOE';
      currentPerfSubContext = 'REPAIRS';
    } else if (
      /^(?:traveling expenses|training and scholarship|utility expenses|communication expenses|awards\/rewards|awards and rewards|survey,\s*research|confidential,\s*intelligence|demolition|generation,\s*transmission|professional services|general services|taxes,\s*insurance|labor and wages|other maintenance and operating)\b/.test(
        low
      )
    ) {
      currentPerfContext = 'MOOE';
      currentPerfSubContext = undefined;
    } else if (/^financial expenses\b/.test(low)) {
      currentPerfContext = 'FIN_EXP';
      currentPerfSubContext = undefined;
    } else if (/^non-cash expenses\b|^depreciation$/.test(low)) {
      currentPerfContext = 'NON_CASH';
      currentPerfSubContext = undefined;
    } else if (/^less:\s*financial assistance\/subsidy to\b/.test(low)) {
      currentPerfContext = 'TRANSFERS_TO';
      currentPerfSubContext = undefined;
    } else if (/^financial assistance\/subsidy from\b/.test(low)) {
      currentPerfContext = 'TRANSFERS_FROM';
      currentPerfSubContext = undefined;
    } else if (
      /^other\s+non[-\s]?operating\s+income\b|^non[-\s]?operating\s+income\b|^sale of assets\b|^gains$/.test(
        low
      )
    ) {
      currentPerfContext = 'NON_OP';
      currentPerfSubContext = undefined;
    } else if (/^losses\b|^loss on sale\b/.test(low)) {
      currentPerfContext = 'LOSSES';
      currentPerfSubContext = undefined;
    }
  };

  const resolveNetAssetsContextFromText = (
    txt: string,
    prev: NetAssetsSectionContext | undefined
  ): NetAssetsSectionContext | undefined => {
    const low = stripTrailingNetAssetsFootnote(txt).toLowerCase().replace(/\s+/g, ' ').trim();
    if (!low) return prev;
    if (
      /^(?:balance|net\s+assets\s*\/?\s*equity)\s*(?:at|of|as\s+(?:at|of)|,)?\s*(?:january\s*1|jan\.?\s*1|beginning)\b/.test(
        low
      ) ||
      /^adjustments\s+to\s+beginning\s+balance\b/.test(low)
    ) {
      return 'BEG_ADJ';
    }
    if (
      /^restated\s+balance\b/.test(low) ||
      /^changes\s+in\s+net\s+assets\s*\/?\s*equity\b/.test(low) ||
      classifyCanonicalNetAssetsItemId(txt, 'CY_CHANGES') === 'na-cy-net-revenue-adj' ||
      classifyCanonicalNetAssetsItemId(txt, 'CY_CHANGES') === 'na-cy-surplus-deficit'
    ) {
      return 'CY_CHANGES';
    }
    return prev;
  };

  for (let r = Math.max(0, startRowIndex); r < rows.length; r++) {
    // Audit/checking rows placed after "Balance at December 31" on Statement of Changes in Net Assets/Equity are ignored
    if (statementType === 'net_assets' && passedNetAssetsEndingBalance) break;
    const row = rows[r];
    if (!Array.isArray(row)) continue;

    // Inspect numeric target columns first so empty/header-only rows skip expensive multi-column scoring
    const amountsByTargetId: Record<string, number | null> = {};
    const formulas: string[] = [];
    let hasAnyNonZeroAmount = false;
    let hasAnyNumericCell = false;
    let hasSumFormula = false;

    for (const target of activeTargets) {
      const fmt = getFormattedCellText(sheet, r, target.colIndex, row[target.colIndex]);
      const parsed = parseExcelNumericCell(row[target.colIndex], fmt);
      const formula = getCellFormula(sheet, r, target.colIndex);
      if (formula) {
        formulas.push(formula);
      }
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

    let accountCode: string | undefined;
    const candidateCells: { col: number; text: string }[] = [];
    for (let c = 0; c < earliestAmountCol; c++) {
      const cellTxt = getFormattedCellText(sheet, r, c, row[c]);
      if (!cellTxt) continue;
      if (!accountCode && isAccountCodeCell(cellTxt)) {
        accountCode = cellTxt.trim();
        continue;
      }
      if (!looksLikeNoteOrCodeOnly(cellTxt)) {
        candidateCells.push({ col: c, text: cellTxt });
      }
    }

    let chosenCol = -1;
    let chosenText = '';

    if (lineItemColOverride !== 'auto') {
      if (lineItemColOverride < earliestAmountCol) {
        chosenCol = lineItemColOverride;
        chosenText = getFormattedCellText(sheet, r, chosenCol, row[chosenCol]);
      }
    } else if (candidateCells.length === 1) {
      chosenCol = candidateCells[0].col;
      chosenText = candidateCells[0].text;
    } else if (candidateCells.length > 1) {
      if (hasAnyNumericCell && hasAnyNonZeroAmount) {
        let bestCandidateScore = -1;
        for (const cand of candidateCells) {
          const isSum = Boolean(detectSummaryRowKind(cand.text, statementType));
          const rec = isSum
            ? null
            : matchLineItemWithRecommendation(
                cand.text,
                encodableItems,
                savedAliases,
                currentPerfContext || currentCashContext || currentNetAssetsContext,
                currentPerfContext ? currentPerfSubContext : currentCashGroupContext
              );
          const effectiveScore = isSum ? 98 : (rec?.confidence ?? 0);
          if (effectiveScore >= bestCandidateScore) {
            bestCandidateScore = effectiveScore;
            chosenCol = cand.col;
            chosenText = cand.text;
          }
        }
      } else {
        chosenCol = candidateCells[candidateCells.length - 1].col;
        chosenText = candidateCells[candidateCells.length - 1].text;
      }
    }

    if (statementType === 'performance') {
      if (chosenText && !looksLikeNoteOrCodeOnly(chosenText)) {
        updatePerfContextFromText(chosenText);
      } else {
        for (let c = 0; c < candidateCells.length; c++) {
          updatePerfContextFromText(candidateCells[c].text);
        }
      }
    } else if (statementType === 'cash_flows') {
      if (chosenText && !looksLikeNoteOrCodeOnly(chosenText)) {
        updateCashContextFromText(chosenText);
      } else {
        for (let c = 0; c < candidateCells.length; c++) {
          updateCashContextFromText(candidateCells[c].text);
        }
      }
    } else if (statementType === 'net_assets') {
      if (chosenText && !looksLikeNoteOrCodeOnly(chosenText)) {
        currentNetAssetsContext = resolveNetAssetsContextFromText(chosenText, currentNetAssetsContext);
      } else {
        for (let c = 0; c < candidateCells.length; c++) {
          currentNetAssetsContext = resolveNetAssetsContextFromText(
            candidateCells[c].text,
            currentNetAssetsContext
          );
        }
      }
    }

    if (isPositionStatement && chosenText && !looksLikeNoteOrCodeOnly(chosenText)) {
      if (isEquitySectionEntryText(chosenText) || passedTotalLiabilities) {
        inEquitySection = true;
      }
      if (detectSummaryRowKind(chosenText, statementType) === 'total_liabilities') {
        passedTotalLiabilities = true;
      }
    }

    const netAssetsProvisionalCanonicalId =
      statementType === 'net_assets' &&
      chosenText &&
      !looksLikeNoteOrCodeOnly(chosenText) &&
      (!hasAnyNumericCell || !hasAnyNonZeroAmount)
        ? classifyCanonicalNetAssetsItemId(chosenText, currentNetAssetsContext)
        : null;

    const isProvisionalZeroUmbrella =
      (statementType === 'performance' &&
        Boolean(chosenText) &&
        !looksLikeNoteOrCodeOnly(chosenText) &&
        (!hasAnyNumericCell || !hasAnyNonZeroAmount) &&
        (isSemiFurnBooksUmbrellaLabel(chosenText) ||
          isSemiMachUmbrellaLabel(chosenText) ||
          isOtherBonusesUmbrellaLabel(chosenText) ||
          isDeprBldgUmbrellaLabel(chosenText) ||
          isDeprMachUmbrellaLabel(chosenText) ||
          isDeprTransUmbrellaLabel(chosenText) ||
          isDeprFurnUmbrellaLabel(chosenText))) ||
      (statementType === 'net_assets' &&
        Boolean(netAssetsProvisionalCanonicalId) &&
        (netAssetsProvisionalCanonicalId !== 'na-beg-balance' ||
          (hasTarget2024 && hasBegNetAssetsEncodableItem)));

    const hitNetAssetsEndingBalanceOnThisRow =
      statementType === 'net_assets' &&
      (rawExtracted.length > 0 || currentNetAssetsContext === 'CY_CHANGES') &&
      ((Boolean(chosenText) &&
        !looksLikeNoteOrCodeOnly(chosenText) &&
        isNetAssetsEndingBalanceText(chosenText)) ||
        candidateCells.some((c) => isNetAssetsEndingBalanceText(c.text)));

    if ((!hasAnyNumericCell || !hasAnyNonZeroAmount) && !isProvisionalZeroUmbrella) {
      if (hitNetAssetsEndingBalanceOnThisRow) {
        passedNetAssetsEndingBalance = true;
      }
      continue;
    }
    if (!chosenText || looksLikeNoteOrCodeOnly(chosenText)) {
      if (hitNetAssetsEndingBalanceOnThisRow) {
        passedNetAssetsEndingBalance = true;
      }
      continue;
    }

    // If account code was embedded inside chosenText (e.g. "1010102000 Petty Cash Fund"), capture it
    if (!accountCode) {
      const embeddedMatch = chosenText.trim().match(/^(\d{1,3}(?:[-.]\d{2,4}){2,5}|\d{6,12})\s*[-–—:]?\s+/);
      if (embeddedMatch) {
        accountCode = embeddedMatch[1];
      }
    }

    const chosenPrep = getPreparedLabel(chosenText);
    const cleanedName = chosenPrep.cleaned;
    const leadingSpaces =
      chosenCol >= 0 ? getCellLeadingIndentSpaces(sheet, r, chosenCol, row[chosenCol]) : 0;
    const indentScore = Math.max(0, chosenCol) * 100 + Math.min(99, leadingSpaces);
    const isContraName = chosenPrep.hasContra;
    const strictSummaryKind = detectSummaryRowKind(chosenText, statementType);
    const isLumpedDep = isPositionStatement && isLumpedAccumulatedDepreciation(chosenText);
    const isNetPpeSummary = isPositionStatement && isNetPPESummaryRow(chosenText);
    const equityRole =
      isPositionStatement && inEquitySection ? classifyEquityRow(chosenText) : undefined;

    let maxStrictScore = 0;
    for (let h = 0; h < strictHierarchyPreps.length; h++) {
      const s = scorePreparedSimilarity(chosenPrep, strictHierarchyPreps[h], 68);
      if (s > maxStrictScore) {
        maxStrictScore = s;
        if (maxStrictScore >= 97) break;
      }
    }

    let maxAmbiguousScore = 0;
    for (let h = 0; h < ambiguousHierarchyPreps.length; h++) {
      const s = scorePreparedSimilarity(chosenPrep, ambiguousHierarchyPreps[h], 68);
      if (s > maxAmbiguousScore) {
        maxAmbiguousScore = s;
        if (maxAmbiguousScore >= 97) break;
      }
    }

    const isExactLeafName = hierarchy.leafNormSet.has(normalizeAliasKey(chosenText));
    const matchesStrictHierarchy =
      !isExactLeafName &&
      maxStrictScore >= 86 &&
      !(maxAmbiguousScore >= 90 && maxAmbiguousScore >= maxStrictScore);
    const matchesAmbiguousHierarchy = maxAmbiguousScore >= 90;
    const fuzzyHierarchyScore = Math.max(maxStrictScore, maxAmbiguousScore);

    rawExtracted.push({
      excelRowNumber: r + 1,
      accountCode,
      rawName: chosenText,
      cleanedName,
      sourceColIndex: chosenCol,
      sourceColLetter: chosenCol >= 0 ? colIndexToLetter(chosenCol) : '?',
      indentScore,
      isContraName,
      amountsByTargetId,
      formulas,
      hasSumFormula,
      strictSummaryKind,
      isLumpedDep,
      isNetPpeSummary,
      inEquitySection: isPositionStatement && inEquitySection,
      equityRole,
      perfContext: currentPerfContext,
      perfSubContext: currentPerfSubContext,
      cashContext: currentCashContext,
      cashGroupContext: currentCashGroupContext,
      netAssetsContext: currentNetAssetsContext,
      isProvisionalZeroUmbrella,
      matchesStrictHierarchy,
      matchesAmbiguousHierarchy,
      fuzzyHierarchyScore,
    });

    if (hitNetAssetsEndingBalanceOnThisRow) {
      passedNetAssetsEndingBalance = true;
    }
  }

  // Determine whether this spreadsheet consistently includes UACS/account codes on leaf rows
  const codedRowCount = rawExtracted.filter((r) => Boolean(r.accountCode)).length;
  const sheetUsesAccountCodes = codedRowCount >= 3;

  // Check if Equity portion has an explicit "Accumulated Surplus/(Deficit, end)" row (SFP only)
  const hasExplicitEndingSurplus =
    isPositionStatement &&
    rawExtracted.some((r) => r.inEquitySection && r.equityRole === 'ending_surplus_explicit');
  const equityLineItemDef = isPositionStatement
    ? encodableItems.find((i) => i.id === 'accumulated_surplus_deficit') ||
      encodableItems.find((i) => /accumulated\s+surplus/i.test(i.name))
    : undefined;

  // Pre-Pass 2 (Performance only): Handle umbrella groupings:
  //   1. "Semi-Expendable Furniture, Fixtures and Books Expenses" -> Furnitures & Fixtures, Books
  //   2. "Semi-Expendable Machinery and Equipment Expenses" -> Indented equipment items below (not in DB)
  //   3. "Other Bonuses and Allowances" -> Special Hardship Allowance, CNA Incentive, PEI, PBB
  // - If parent amount already equals sum of children for a column -> keep parent amount (no double count).
  // - If parent amount has no correlation with children (e.g. 0 or partial balance) -> aggregate parent + children.
  interface UmbrellaParentResolution {
    mode: 'parent';
    targetItemId: string;
    resolvedAmounts: Record<string, number | null>;
    aggregationNote: string;
    aggregationBreakdown: AggregationBreakdown;
  }
  interface UmbrellaChildResolution {
    mode: 'consumed_child';
    reason: string;
  }
  const umbrellaResolutionByRawIdx = new Map<
    number,
    UmbrellaParentResolution | UmbrellaChildResolution
  >();
  const dropProvisionalZeroIndices = new Set<number>();

  // Official leaf accounts (excluding the 3 umbrella parents) so indentation matching
  // never accidentally consumes valid standalone COA accounts such as
  // "Semi-Expendable Machinery and Equipment Expenses - Other Equipment" or "Textbooks..."
  const nonUmbrellaOfficialPerfItems = encodableItems.filter(
    (item) => item.statementType === 'performance' && !UMBRELLA_PARENT_IDS.has(item.id)
  );
  const nonUmbrellaOfficialPerfNorms = new Set(
    nonUmbrellaOfficialPerfItems.map((item) => normalizeAliasKey(item.name)).filter(Boolean)
  );
  const matchesOfficialNonUmbrellaPerfAccount = (rawText: string): boolean => {
    const norm = normalizeAliasKey(rawText);
    if (!norm) return false;
    if (nonUmbrellaOfficialPerfNorms.has(norm)) return true;
    const cleaned = cleanAccountLabel(rawText);
    return nonUmbrellaOfficialPerfItems.some(
      (item) => scoreStringSimilarity(cleaned, item.name) >= 90
    );
  };

  interface UmbrellaRuleConfig {
    parentItemId: string;
    parentLabel: string;
    allowContraParent?: boolean;
    isParentMatch: (raw: InternalRawRow) => boolean;
    isChildMatch: (raw: InternalRawRow, parent?: InternalRawRow) => boolean;
    allowParentlessConsolidation: (raw: InternalRawRow) => boolean;
  }

  const isEligibleDeprIndentedChild = (r: InternalRawRow, parent?: InternalRawRow): boolean => {
    if (!parent || r.indentScore <= parent.indentScore) return false;
    const toks = tokenizeAndExpand(r.cleanedName);
    if (hasContraKeywords(toks) || hasRepairsKeywords(toks) || hasSemiKeywords(toks)) {
      return false;
    }
    return !matchesOfficialNonUmbrellaPerfAccount(r.rawName);
  };

  const umbrellaRules: UmbrellaRuleConfig[] = [
    {
      parentItemId: SEMI_FURN_BOOKS_UMBRELLA_ID,
      parentLabel: 'Semi-Expendable Furniture, Fixtures and Books Expenses',
      isParentMatch: (r) =>
        r.perfSubContext !== 'REPAIRS' &&
        r.perfContext !== 'NON_CASH' &&
        isSemiFurnBooksUmbrellaLabel(r.rawName),
      isChildMatch: (r) =>
        r.perfSubContext !== 'REPAIRS' &&
        r.perfContext !== 'NON_CASH' &&
        classifySemiFurnBooksChildKind(r.rawName) !== null,
      allowParentlessConsolidation: (r) =>
        r.perfSubContext === 'SUPPLIES' && classifySemiFurnBooksChildKind(r.rawName) !== null,
    },
    {
      parentItemId: SEMI_MACH_UMBRELLA_ID,
      parentLabel: 'Semi-Expendable Machinery and Equipment Expenses',
      isParentMatch: (r) =>
        r.perfSubContext !== 'REPAIRS' &&
        r.perfContext !== 'NON_CASH' &&
        isSemiMachUmbrellaLabel(r.rawName),
      isChildMatch: (r, parent) => {
        if (r.perfSubContext === 'REPAIRS' || r.perfContext === 'NON_CASH') return false;
        const toks = tokenizeAndExpand(r.cleanedName);
        if (hasRepairsKeywords(toks) || hasContraKeywords(toks)) return false;
        if (
          isSemiFurnBooksUmbrellaLabel(r.rawName) ||
          isOtherBonusesUmbrellaLabel(r.rawName) ||
          isSemiMachUmbrellaLabel(r.rawName) ||
          classifySemiFurnBooksChildKind(r.rawName) !== null ||
          classifyOtherBonusesChildKind(r.rawName) !== null
        ) {
          return false;
        }
        // Known sub-equipment label (works whether indented or aligned)
        if (classifySemiMachChildKind(r.rawName) !== null) return true;
        // Indented directly below parent AND not an official leaf account in DB
        if (
          parent &&
          r.indentScore > parent.indentScore &&
          !matchesOfficialNonUmbrellaPerfAccount(r.rawName)
        ) {
          return true;
        }
        return false;
      },
      allowParentlessConsolidation: (r) =>
        r.perfSubContext === 'SUPPLIES' && classifySemiMachChildKind(r.rawName) !== null,
    },
    {
      parentItemId: OTHER_BONUSES_UMBRELLA_ID,
      parentLabel: 'Other Bonuses and Allowances',
      isParentMatch: (r) => isOtherBonusesUmbrellaLabel(r.rawName),
      isChildMatch: (r) => classifyOtherBonusesChildKind(r.rawName) !== null,
      allowParentlessConsolidation: (r) =>
        (r.perfContext === 'PS' || !r.perfContext) &&
        classifyOtherBonusesChildKind(r.rawName) !== null,
    },
    {
      parentItemId: DEPR_BLDG_UMBRELLA_ID,
      parentLabel: 'Depreciation - Buildings and Other Structures',
      allowContraParent: true,
      isParentMatch: (r) => isDeprBldgUmbrellaLabel(r.rawName),
      isChildMatch: (r, parent) =>
        classifyDeprBldgChildKind(r.rawName) !== null || isEligibleDeprIndentedChild(r, parent),
      allowParentlessConsolidation: (r) =>
        r.perfContext === 'NON_CASH' && classifyDeprBldgChildKind(r.rawName) !== null,
    },
    {
      parentItemId: DEPR_MACH_UMBRELLA_ID,
      parentLabel: 'Depreciation - Machinery and Equipment',
      allowContraParent: true,
      isParentMatch: (r) => isDeprMachUmbrellaLabel(r.rawName),
      isChildMatch: (r, parent) =>
        classifyDeprMachChildKind(r.rawName) !== null || isEligibleDeprIndentedChild(r, parent),
      allowParentlessConsolidation: (r) =>
        r.perfContext === 'NON_CASH' && classifyDeprMachChildKind(r.rawName) !== null,
    },
    {
      parentItemId: DEPR_TRANS_UMBRELLA_ID,
      parentLabel: 'Depreciation - Transportation Equipment',
      allowContraParent: true,
      isParentMatch: (r) => isDeprTransUmbrellaLabel(r.rawName),
      isChildMatch: (r, parent) =>
        classifyDeprTransChildKind(r.rawName) !== null || isEligibleDeprIndentedChild(r, parent),
      allowParentlessConsolidation: (r) =>
        r.perfContext === 'NON_CASH' && classifyDeprTransChildKind(r.rawName) !== null,
    },
    {
      parentItemId: DEPR_FURN_UMBRELLA_ID,
      parentLabel: 'Depreciation - Furniture, Fixtures and Books',
      allowContraParent: true,
      isParentMatch: (r) => isDeprFurnUmbrellaLabel(r.rawName),
      isChildMatch: (r, parent) =>
        classifyDeprFurnChildKind(r.rawName) !== null || isEligibleDeprIndentedChild(r, parent),
      allowParentlessConsolidation: (r) =>
        r.perfContext === 'NON_CASH' && classifyDeprFurnChildKind(r.rawName) !== null,
    },
  ];

  if (statementType === 'performance') {
    for (const rule of umbrellaRules) {
      const ruleDef = encodableItems.find((item) => item.id === rule.parentItemId);
      if (!ruleDef) continue;

      for (let i = 0; i < rawExtracted.length; i++) {
        if (umbrellaResolutionByRawIdx.has(i)) continue;
        const parent = rawExtracted[i];
        if (
          parent.strictSummaryKind ||
          parent.matchesStrictHierarchy ||
          (parent.isContraName && !rule.allowContraParent)
        ) {
          continue;
        }

        if (rule.isParentMatch(parent)) {
          const childIndices: number[] = [];
          for (let j = i + 1; j < rawExtracted.length; j++) {
            if (umbrellaResolutionByRawIdx.has(j)) break;
            const child = rawExtracted[j];
            if (child.strictSummaryKind || child.matchesStrictHierarchy || child.isContraName) break;
            if (child.indentScore < parent.indentScore) break;
            if (!rule.isChildMatch(child, parent)) break;
            childIndices.push(j);
          }

          if (childIndices.length === 0) {
            if (parent.isProvisionalZeroUmbrella) {
              dropProvisionalZeroIndices.add(i);
            }
            continue;
          }

          const resolvedAmounts: Record<string, number | null> = {};
          const wasAggregatedByTargetId: Record<string, boolean> = {};
          let aggregatedAnyCol = false;
          let rolledUpOnlyAnyCol = false;

          activeTargetIds.forEach((tid) => {
            const pRaw = parent.amountsByTargetId[tid];
            const pVal = pRaw ?? 0;
            const childSum = childIndices.reduce(
              (acc, idx) => acc + (rawExtracted[idx].amountsByTargetId[tid] ?? 0),
              0
            );
            const hasNonZeroChildren = childIndices.some(
              (idx) => Math.abs(rawExtracted[idx].amountsByTargetId[tid] ?? 0) >= 0.005
            );
            const hasNonZeroParent = Math.abs(pVal) >= 0.005;

            if (hasNonZeroChildren && hasNonZeroParent && Math.abs(pVal - childSum) <= 0.05) {
              resolvedAmounts[tid] = pRaw ?? Math.round(pVal * 10000) / 10000;
              wasAggregatedByTargetId[tid] = false;
              rolledUpOnlyAnyCol = true;
            } else if (hasNonZeroChildren) {
              resolvedAmounts[tid] = Math.round((pVal + childSum) * 10000) / 10000;
              wasAggregatedByTargetId[tid] = true;
              aggregatedAnyCol = true;
            } else {
              resolvedAmounts[tid] = pRaw ?? null;
              wasAggregatedByTargetId[tid] = false;
            }
          });

          const hasAnyResolvedNonZero = activeTargetIds.some(
            (tid) => Math.abs(resolvedAmounts[tid] ?? 0) >= 0.005
          );
          if (!hasAnyResolvedNonZero) {
            if (parent.isProvisionalZeroUmbrella) {
              dropProvisionalZeroIndices.add(i);
            }
            continue;
          }

          const childNamesList =
            childIndices.length <= 4
              ? childIndices.map((idx) => rawExtracted[idx].cleanedName).join(' & ')
              : `${childIndices
                  .slice(0, 3)
                  .map((idx) => rawExtracted[idx].cleanedName)
                  .join(', ')} + ${childIndices.length - 3} more sub-items`;
          const noteText =
            aggregatedAnyCol && rolledUpOnlyAnyCol
              ? `This account has been aggregated with ${childNamesList} (columns already matching subtotal kept as-is)`
              : aggregatedAnyCol
              ? `This account has been aggregated with ${childNamesList} into ${rule.parentLabel}`
              : `Parent balance already matches breakdown (${childNamesList})`;

          const breakdown: AggregationBreakdown = {
            parentItemId: rule.parentItemId,
            parentLabel: rule.parentLabel,
            parentRawName: parent.cleanedName || parent.rawName,
            parentExcelRowNumber: parent.excelRowNumber,
            isParentless: false,
            parentOwnAmountsByTargetId: { ...parent.amountsByTargetId },
            resolvedAmountsByTargetId: { ...resolvedAmounts },
            wasAggregatedByTargetId,
            children: childIndices.map((cIdx) => ({
              rawName: rawExtracted[cIdx].rawName,
              cleanedName: rawExtracted[cIdx].cleanedName,
              excelRowNumber: rawExtracted[cIdx].excelRowNumber,
              amountsByTargetId: { ...rawExtracted[cIdx].amountsByTargetId },
            })),
          };

          umbrellaResolutionByRawIdx.set(i, {
            mode: 'parent',
            targetItemId: rule.parentItemId,
            resolvedAmounts,
            aggregationNote: noteText,
            aggregationBreakdown: breakdown,
          });

          const childSkipReason = aggregatedAnyCol
            ? `Aggregated into ${rule.parentLabel} above`
            : `Already included in ${rule.parentLabel} above`;

          childIndices.forEach((cIdx) => {
            umbrellaResolutionByRawIdx.set(cIdx, {
              mode: 'consumed_child',
              reason: childSkipReason,
            });
          });
        } else if (rule.allowParentlessConsolidation(parent)) {
          const siblingIndices: number[] = [i];
          for (let j = i + 1; j < rawExtracted.length; j++) {
            if (umbrellaResolutionByRawIdx.has(j)) break;
            const sib = rawExtracted[j];
            if (sib.strictSummaryKind || sib.matchesStrictHierarchy || sib.isContraName) break;
            if (!rule.allowParentlessConsolidation(sib)) break;
            siblingIndices.push(j);
          }

          if (siblingIndices.length >= 2) {
            const resolvedAmounts: Record<string, number | null> = {};
            const wasAggregatedByTargetId: Record<string, boolean> = {};
            activeTargetIds.forEach((tid) => {
              const sum = siblingIndices.reduce(
                (acc, idx) => acc + (rawExtracted[idx].amountsByTargetId[tid] ?? 0),
                0
              );
              const anyValue = siblingIndices.some(
                (idx) =>
                  rawExtracted[idx].amountsByTargetId[tid] !== null &&
                  rawExtracted[idx].amountsByTargetId[tid] !== undefined
              );
              resolvedAmounts[tid] = anyValue ? Math.round(sum * 10000) / 10000 : null;
              wasAggregatedByTargetId[tid] = anyValue && Math.abs(sum) >= 0.005;
            });

            const childNamesList =
              siblingIndices.length <= 4
                ? siblingIndices.map((idx) => rawExtracted[idx].cleanedName).join(' & ')
                : `${siblingIndices
                    .slice(0, 3)
                    .map((idx) => rawExtracted[idx].cleanedName)
                    .join(', ')} + ${siblingIndices.length - 3} more`;

            const breakdown: AggregationBreakdown = {
              parentItemId: rule.parentItemId,
              parentLabel: rule.parentLabel,
              parentRawName: rule.parentLabel,
              isParentless: true,
              parentOwnAmountsByTargetId: {},
              resolvedAmountsByTargetId: { ...resolvedAmounts },
              wasAggregatedByTargetId,
              children: siblingIndices.map((cIdx) => ({
                rawName: rawExtracted[cIdx].rawName,
                cleanedName: rawExtracted[cIdx].cleanedName,
                excelRowNumber: rawExtracted[cIdx].excelRowNumber,
                amountsByTargetId: { ...rawExtracted[cIdx].amountsByTargetId },
              })),
            };

            umbrellaResolutionByRawIdx.set(i, {
              mode: 'parent',
              targetItemId: rule.parentItemId,
              resolvedAmounts,
              aggregationNote: `This account has been aggregated from ${childNamesList} into ${rule.parentLabel}`,
              aggregationBreakdown: breakdown,
            });

            siblingIndices.slice(1).forEach((cIdx) => {
              umbrellaResolutionByRawIdx.set(cIdx, {
                mode: 'consumed_child',
                reason: `Aggregated into ${rule.parentLabel}`,
              });
            });
          }
        }
      }
    }
  } else if (statementType === 'net_assets') {
    const encodableById = new Map<string, LineItemDefinition>();
    encodableItems.forEach((it) => encodableById.set(it.id, it));

    for (let i = 0; i < rawExtracted.length; i++) {
      if (umbrellaResolutionByRawIdx.has(i)) continue;
      const parent = rawExtracted[i];

      const parentCanonicalId = classifyCanonicalNetAssetsItemId(
        parent.rawName,
        parent.netAssetsContext
      );
      const isAllowedBeginning =
        parentCanonicalId === 'na-beg-balance' && hasTarget2024 && hasBegNetAssetsEncodableItem;

      if (parentCanonicalId && (parentCanonicalId !== 'na-beg-balance' || isAllowedBeginning)) {
        const parentDef = encodableById.get(parentCanonicalId);
        if (!parentDef) {
          if (parent.isProvisionalZeroUmbrella) {
            dropProvisionalZeroIndices.add(i);
          }
          continue;
        }

        const isNetRevParent = parentCanonicalId === 'na-cy-net-revenue-adj';
        const isOtherAdjParent = parentCanonicalId === 'na-adj-other-adjustments';
        const childIndices: number[] = [];
        let hasEnteredIndentedBlock = false;

        for (let j = i + 1; j < rawExtracted.length; j++) {
          if (umbrellaResolutionByRawIdx.has(j)) break;
          const child = rawExtracted[j];
          if (child.strictSummaryKind) break;
          if (classifyCanonicalNetAssetsItemId(child.rawName, child.netAssetsContext) !== null) {
            break;
          }
          if (!isNetRevParent && classifyNetRevenueAdjustmentChildLabel(child.rawName)) {
            break;
          }
          if (!isOtherAdjParent && isNetAssetsCorrectionOfErrorLabel(child.rawName)) {
            break;
          }
          if (child.netAssetsContext !== parent.netAssetsContext) {
            break;
          }
          if (child.sourceColIndex < parent.sourceColIndex) {
            break;
          }
          if (child.indentScore > parent.indentScore) {
            hasEnteredIndentedBlock = true;
          } else if (
            hasEnteredIndentedBlock &&
            child.indentScore <= parent.indentScore &&
            !(isNetRevParent && classifyNetRevenueAdjustmentChildLabel(child.rawName))
          ) {
            break;
          }
          childIndices.push(j);
        }

        if (childIndices.length === 0) {
          if (parent.isProvisionalZeroUmbrella) {
            dropProvisionalZeroIndices.add(i);
          }
          continue;
        }

        const allChildrenAreIndented = childIndices.every(
          (idx) => rawExtracted[idx].indentScore > parent.indentScore
        );
        const allChildrenMatchKnownNetRev =
          isNetRevParent &&
          childIndices.every((idx) =>
            classifyNetRevenueAdjustmentChildLabel(rawExtracted[idx].rawName)
          );
        const parentMatchesChildSumAllCols = activeTargetIds.every((tid) => {
          const pVal = parent.amountsByTargetId[tid] ?? 0;
          const cSum = childIndices.reduce(
            (acc, idx) => acc + (rawExtracted[idx].amountsByTargetId[tid] ?? 0),
            0
          );
          return Math.abs(pVal - cSum) <= 0.05;
        });

        const shouldAggregateChildren =
          isNetRevParent ||
          Boolean(parent.isProvisionalZeroUmbrella) ||
          allChildrenAreIndented ||
          allChildrenMatchKnownNetRev ||
          parentMatchesChildSumAllCols ||
          parent.hasSumFormula;

        if (!shouldAggregateChildren) {
          continue;
        }

        const resolvedAmounts: Record<string, number | null> = {};
        const wasAggregatedByTargetId: Record<string, boolean> = {};
        let aggregatedAnyCol = false;
        let rolledUpOnlyAnyCol = false;

        activeTargetIds.forEach((tid) => {
          const pRaw = parent.amountsByTargetId[tid];
          const pVal = pRaw ?? 0;
          const childSum = childIndices.reduce(
            (acc, idx) => acc + (rawExtracted[idx].amountsByTargetId[tid] ?? 0),
            0
          );
          const hasNonZeroChildren = childIndices.some(
            (idx) => Math.abs(rawExtracted[idx].amountsByTargetId[tid] ?? 0) >= 0.005
          );
          const hasNonZeroParent = Math.abs(pVal) >= 0.005;

          if (hasNonZeroChildren && hasNonZeroParent && Math.abs(pVal - childSum) <= 0.05) {
            resolvedAmounts[tid] = pRaw ?? Math.round(pVal * 10000) / 10000;
            wasAggregatedByTargetId[tid] = false;
            rolledUpOnlyAnyCol = true;
          } else if (hasNonZeroChildren) {
            resolvedAmounts[tid] = Math.round((pVal + childSum) * 10000) / 10000;
            wasAggregatedByTargetId[tid] = true;
            aggregatedAnyCol = true;
          } else {
            resolvedAmounts[tid] = pRaw ?? null;
            wasAggregatedByTargetId[tid] = false;
          }
        });

        const hasAnyResolvedNonZero = activeTargetIds.some(
          (tid) => Math.abs(resolvedAmounts[tid] ?? 0) >= 0.005
        );
        if (!hasAnyResolvedNonZero) {
          if (parent.isProvisionalZeroUmbrella) {
            dropProvisionalZeroIndices.add(i);
          }
          continue;
        }

        const childNamesList =
          childIndices.length <= 4
            ? childIndices.map((idx) => rawExtracted[idx].cleanedName).join(' & ')
            : `${childIndices
                .slice(0, 3)
                .map((idx) => rawExtracted[idx].cleanedName)
                .join(', ')} + ${childIndices.length - 3} more sub-items`;
        const noteText =
          aggregatedAnyCol && rolledUpOnlyAnyCol
            ? `This account has been aggregated with ${childNamesList} (columns already matching subtotal kept as-is)`
            : aggregatedAnyCol
            ? `This account has been aggregated with ${childNamesList} into ${parentDef.name}`
            : `Parent balance already matches breakdown (${childNamesList})`;

        const breakdown: AggregationBreakdown = {
          parentItemId: parentDef.id,
          parentLabel: parentDef.name,
          parentRawName: stripTrailingNetAssetsFootnote(parent.cleanedName || parent.rawName),
          parentExcelRowNumber: parent.excelRowNumber,
          isParentless: false,
          parentOwnAmountsByTargetId: { ...parent.amountsByTargetId },
          resolvedAmountsByTargetId: { ...resolvedAmounts },
          wasAggregatedByTargetId,
          children: childIndices.map((cIdx) => ({
            rawName: rawExtracted[cIdx].rawName,
            cleanedName: rawExtracted[cIdx].cleanedName,
            excelRowNumber: rawExtracted[cIdx].excelRowNumber,
            amountsByTargetId: { ...rawExtracted[cIdx].amountsByTargetId },
          })),
        };

        umbrellaResolutionByRawIdx.set(i, {
          mode: 'parent',
          targetItemId: parentDef.id,
          resolvedAmounts,
          aggregationNote: noteText,
          aggregationBreakdown: breakdown,
        });

        const childSkipReason = aggregatedAnyCol
          ? `Aggregated into ${parentDef.name} above`
          : `Already included in ${parentDef.name} above`;

        childIndices.forEach((cIdx) => {
          umbrellaResolutionByRawIdx.set(cIdx, {
            mode: 'consumed_child',
            reason: childSkipReason,
          });
        });
      } else if (
        !parent.strictSummaryKind &&
        classifyNetRevenueAdjustmentChildLabel(parent.rawName)
      ) {
        // Parentless consolidation when division omitted the "Adjustment of net revenue..." heading row
        const netRevDef = encodableById.get('na-cy-net-revenue-adj');
        if (!netRevDef) continue;

        const siblingIndices: number[] = [i];
        for (let j = i + 1; j < rawExtracted.length; j++) {
          if (umbrellaResolutionByRawIdx.has(j)) break;
          const sib = rawExtracted[j];
          if (sib.strictSummaryKind) break;
          if (!classifyNetRevenueAdjustmentChildLabel(sib.rawName)) break;
          siblingIndices.push(j);
        }

        if (siblingIndices.length >= 2) {
          const resolvedAmounts: Record<string, number | null> = {};
          const wasAggregatedByTargetId: Record<string, boolean> = {};
          activeTargetIds.forEach((tid) => {
            const sum = siblingIndices.reduce(
              (acc, idx) => acc + (rawExtracted[idx].amountsByTargetId[tid] ?? 0),
              0
            );
            const anyValue = siblingIndices.some(
              (idx) =>
                rawExtracted[idx].amountsByTargetId[tid] !== null &&
                rawExtracted[idx].amountsByTargetId[tid] !== undefined
            );
            resolvedAmounts[tid] = anyValue ? Math.round(sum * 10000) / 10000 : null;
            wasAggregatedByTargetId[tid] = anyValue && Math.abs(sum) >= 0.005;
          });

          const childNamesList =
            siblingIndices.length <= 4
              ? siblingIndices.map((idx) => rawExtracted[idx].cleanedName).join(' & ')
              : `${siblingIndices
                  .slice(0, 3)
                  .map((idx) => rawExtracted[idx].cleanedName)
                  .join(', ')} + ${siblingIndices.length - 3} more`;

          const breakdown: AggregationBreakdown = {
            parentItemId: netRevDef.id,
            parentLabel: netRevDef.name,
            parentRawName: netRevDef.name,
            isParentless: true,
            parentOwnAmountsByTargetId: {},
            resolvedAmountsByTargetId: { ...resolvedAmounts },
            wasAggregatedByTargetId,
            children: siblingIndices.map((cIdx) => ({
              rawName: rawExtracted[cIdx].rawName,
              cleanedName: rawExtracted[cIdx].cleanedName,
              excelRowNumber: rawExtracted[cIdx].excelRowNumber,
              amountsByTargetId: { ...rawExtracted[cIdx].amountsByTargetId },
            })),
          };

          umbrellaResolutionByRawIdx.set(i, {
            mode: 'parent',
            targetItemId: netRevDef.id,
            resolvedAmounts,
            aggregationNote: `This account has been aggregated from ${childNamesList} into ${netRevDef.name}`,
            aggregationBreakdown: breakdown,
          });

          siblingIndices.slice(1).forEach((cIdx) => {
            umbrellaResolutionByRawIdx.set(cIdx, {
              mode: 'consumed_child',
              reason: `Aggregated into ${netRevDef.name}`,
            });
          });
        }
      }
    }
  }

  // Pass 2: Enforce lowest-level leaf extraction, statement-specific summary rules, and SFP guards
  const finalRows: ExtractedPositionRow[] = [];

  for (let i = 0; i < rawExtracted.length; i++) {
    if (dropProvisionalZeroIndices.has(i)) continue;
    const raw = rawExtracted[i];
    const umbrellaRes = umbrellaResolutionByRawIdx.get(i);
    let isSummaryRow = false;
    let summaryKind: ExtractedPositionRow['summaryKind'] = raw.strictSummaryKind;
    let summaryReason: string | undefined;
    let aggregationNote: string | undefined;
    let aggregationBreakdown: AggregationBreakdown | undefined;
    let isLumpedDepreciation = false;
    let amountsByTargetId = raw.amountsByTargetId;

    if (umbrellaRes?.mode === 'consumed_child') {
      isSummaryRow = true;
      summaryKind = 'hierarchy_group';
      summaryReason = umbrellaRes.reason;
    } else if (umbrellaRes?.mode === 'parent') {
      isSummaryRow = false;
      amountsByTargetId = umbrellaRes.resolvedAmounts;
      aggregationNote = umbrellaRes.aggregationNote;
      aggregationBreakdown = umbrellaRes.aggregationBreakdown;
    } else if (isPositionStatement && raw.inEquitySection) {
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
    } else if (isPositionStatement && raw.isLumpedDep) {
      isLumpedDepreciation = true;
      const hasAggregatedTarget = encodableItems.some(
        (i) => i.id === AGGREGATED_ACCUMULATED_DEPRECIATION_ID
      );
      if (hasAggregatedTarget) {
        isSummaryRow = false;
        summaryReason =
          'Temporarily mapped to Aggregated Accumulated Depreciation — breakdown per PPE recommended';
      } else {
        isSummaryRow = true;
        summaryKind = 'lumped_depreciation';
        summaryReason = 'Lumped Accumulated Depreciation — request breakdown per PPE';
      }
    } else if (isPositionStatement && raw.isNetPpeSummary) {
      isSummaryRow = true;
      summaryKind = 'net_value';
      summaryReason = 'Net PPE summary row (auto-computed)';
    } else if (
      statementType === 'cash_flows' &&
      raw.strictSummaryKind === 'cash_beginning' &&
      hasTarget2024 &&
      hasBegCashEncodableItem
    ) {
      // Allow FY 2024 Beginning Cash ("Cash and Cash Equivalents, January 1") to be imported & encoded
      isSummaryRow = false;
      summaryKind = undefined;
    } else if (
      statementType === 'net_assets' &&
      raw.strictSummaryKind === 'net_assets_beginning' &&
      hasTarget2024 &&
      hasBegNetAssetsEncodableItem
    ) {
      // Allow FY 2024 Beginning Net Assets/Equity ("Balance at January 1") to be imported & encoded
      isSummaryRow = false;
      summaryKind = undefined;
    } else if (raw.strictSummaryKind) {
      isSummaryRow = true;
      summaryReason =
        raw.strictSummaryKind === 'net_value'
          ? 'Net Value row (auto-computed)'
          : raw.strictSummaryKind === 'cash_checking_ignored'
          ? 'Checking / verification row (ignored for now — reserved for future final FS check)'
          : raw.strictSummaryKind === 'cash_beginning'
          ? 'Beginning Cash (auto-computed from prior year Dec 31 for FY 2025+)'
          : raw.strictSummaryKind === 'cash_increase_decrease'
          ? 'Increase/(Decrease) in Cash and Cash Equivalents (auto-computed from Operating, Investing & Financing cash flows)'
          : raw.strictSummaryKind === 'cash_beginning_ending' ||
            raw.strictSummaryKind === 'net_cash_activity'
          ? 'Cash Flow reconciliation / net activity row (auto-computed)'
          : raw.strictSummaryKind === 'cash_inflows_outflows'
          ? 'Cash Inflows / Outflows subtotal row (auto-computed)'
          : raw.strictSummaryKind === 'net_assets_beginning'
          ? 'Beginning Balance (auto-computed from prior year Dec 31 for FY 2025+)'
          : raw.strictSummaryKind === 'net_assets_summary'
          ? 'Restated / Ending Balance or section header row (auto-computed)'
          : raw.strictSummaryKind === 'surplus_deficit'
          ? 'Surplus/(Deficit) summary row (auto-computed)'
          : 'Total / Subtotal row (skipped)';
    } else if (
      statementType === 'net_assets' &&
      classifyCanonicalNetAssetsItemId(raw.rawName, raw.netAssetsContext) !== null
    ) {
      // Canonical Net Assets items are already resolved in Pre-Pass 2; never skip as hierarchy wrapper
      isSummaryRow = false;
    } else if (raw.matchesStrictHierarchy) {
      isSummaryRow = true;
      summaryKind = 'hierarchy_group';
      summaryReason = 'Higher-level group total (auto-computed)';
    } else if (raw.matchesAmbiguousHierarchy) {
      const nextRow = rawExtracted[i + 1];
      const nextSubtotalBase =
        nextRow?.strictSummaryKind === 'subtotal'
          ? nextRow.cleanedName.replace(/^(?:sub-?total|total)\s+/i, '').trim()
          : '';
      const immediatelyFollowedByOwnSubtotal = Boolean(
        nextSubtotalBase && scoreStringSimilarity(nextSubtotalBase, raw.cleanedName) >= 75
      );

      if (!immediatelyFollowedByOwnSubtotal) {
        const rollup = checkIfRollupOfRowsBelow(rawExtracted, i, activeTargetIds);
        const hasIndentedChildren = !raw.accountCode && hasIndentedNonContraChild(rawExtracted, i);
        const noCodeWhileSheetHasCodes =
          sheetUsesAccountCodes &&
          !raw.accountCode &&
          Boolean(nextRow && nextRow.accountCode && nextRow.indentScore > raw.indentScore);
        const { blockEndExcelRow, lastBlockExcelRow, hasCandidateChildRows } =
          findAmbiguousBlockEndExcelRow(rawExtracted, i);
        const hasDownwardSumFormula =
          !raw.accountCode &&
          hasCandidateChildRows &&
          raw.formulas.some((f) =>
            isDownwardBlockSumFormula(
              f,
              raw.excelRowNumber,
              blockEndExcelRow,
              lastBlockExcelRow
            )
          );

        if (
          rollup.isRollup ||
          hasIndentedChildren ||
          noCodeWhileSheetHasCodes ||
          hasDownwardSumFormula
        ) {
          isSummaryRow = true;
          summaryKind = 'hierarchy_group';
          summaryReason = rollup.isRollup
            ? `Higher-level rollup of ${rollup.childCount} item${rollup.childCount > 1 ? 's' : ''} below`
            : hasIndentedChildren
            ? 'Higher-level group/subgroup total (indented items below)'
            : 'Higher-level group total (no account code)';
        }
      }
    } else if (!raw.accountCode) {
      const rollup = checkIfRollupOfRowsBelow(rawExtracted, i, activeTargetIds);
      const hasIndentedChildren = hasIndentedNonContraChild(rawExtracted, i);
      const singleChild =
        rollup.isRollup && rollup.childCount === 1 && rollup.singleMatchedChildIdx !== undefined
          ? rawExtracted[rollup.singleMatchedChildIdx]
          : undefined;
      const isSingleLeafWrapper = Boolean(
        singleChild &&
          !singleChild.strictSummaryKind &&
          singleChild.isContraName === raw.isContraName &&
          raw.cashContext === singleChild.cashContext &&
          raw.perfContext === singleChild.perfContext &&
          ((hasIndentedChildren && singleChild.indentScore > raw.indentScore) ||
            (singleChild.indentScore >= raw.indentScore &&
              (normalizeAliasKey(raw.cleanedName) === normalizeAliasKey(singleChild.cleanedName) ||
                scoreStringSimilarity(raw.cleanedName, singleChild.cleanedName) >= 92)))
      );

      if (
        rollup.isRollup &&
        rollup.childCount >= 2 &&
        (raw.hasSumFormula ||
          sheetUsesAccountCodes ||
          raw.fuzzyHierarchyScore >= 72 ||
          hasIndentedChildren)
      ) {
        isSummaryRow = true;
        summaryKind = 'hierarchy_group';
        summaryReason = `Higher-level rollup of ${rollup.childCount} items below`;
      } else if (isSingleLeafWrapper) {
        isSummaryRow = true;
        summaryKind = 'hierarchy_group';
        summaryReason =
          singleChild && singleChild.indentScore > raw.indentScore
            ? 'Group header wrapping single indented leaf account below'
            : 'Group/wrapper row duplicating single leaf account below';
      }
    } else {
      const nextRow = rawExtracted[i + 1];
      if (
        nextRow &&
        !nextRow.strictSummaryKind &&
        nextRow.isContraName === raw.isContraName &&
        raw.cashContext === nextRow.cashContext &&
        raw.perfContext === nextRow.perfContext &&
        nextRow.indentScore >= raw.indentScore &&
        (normalizeAliasKey(raw.cleanedName) === normalizeAliasKey(nextRow.cleanedName) ||
          scoreStringSimilarity(raw.cleanedName, nextRow.cleanedName) >= 92) &&
        activeTargetIds.every((tid) => {
          const a = raw.amountsByTargetId[tid] ?? 0;
          const b = nextRow.amountsByTargetId[tid] ?? 0;
          return Math.abs(a - b) <= 0.05;
        })
      ) {
        isSummaryRow = true;
        summaryKind = 'hierarchy_group';
        summaryReason = 'Group/wrapper row duplicating single leaf account below';
      }
    }

    let recommendation: LineItemRecommendation;
    let autoSelectedId = '';

    const aggregatedDepItem = encodableItems.find(
      (i) => i.id === AGGREGATED_ACCUMULATED_DEPRECIATION_ID
    );

    const resolvedParentDef =
      umbrellaRes?.mode === 'parent'
        ? encodableItems.find((i) => i.id === umbrellaRes.targetItemId)
        : undefined;

    if (isSummaryRow) {
      recommendation = { bestItem: null, confidence: 0, matchType: 'none', alternatives: [] };
    } else if (umbrellaRes?.mode === 'parent' && resolvedParentDef) {
      recommendation = {
        bestItem: resolvedParentDef,
        confidence: 100,
        matchType: 'exact',
        alternatives: [],
      };
      autoSelectedId = resolvedParentDef.id;
    } else if (isLumpedDepreciation && aggregatedDepItem) {
      recommendation = {
        bestItem: aggregatedDepItem,
        confidence: 100,
        matchType: 'exact',
        alternatives: [],
      };
      autoSelectedId = aggregatedDepItem.id;
    } else if (raw.inEquitySection && equityLineItemDef) {
      recommendation = {
        bestItem: equityLineItemDef,
        confidence: 100,
        matchType: 'exact',
        alternatives: [],
      };
      autoSelectedId = equityLineItemDef.id;
    } else {
      recommendation = matchLineItemWithRecommendation(
        raw.rawName,
        encodableItems,
        savedAliases,
        raw.perfContext || raw.cashContext || raw.netAssetsContext,
        raw.perfContext ? raw.perfSubContext : raw.cashGroupContext,
        raw.accountCode
      );
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
      indentScore: raw.indentScore,
      amountsByTargetId,
      isSummaryRow,
      isLumpedDepreciation,
      summaryKind,
      summaryReason,
      aggregationNote,
      aggregationBreakdown,
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

export type DatabaseDiffStatus = 'amount_mismatch' | 'missing_in_upload' | 'new_in_upload';

export interface DatabaseLineItemDiff {
  lineItemId: string;
  itemName: string;
  section: LineItemDefinition['section'];
  subsection: string;
  group: string;
  isContra?: boolean;
  uploadedAmount: number;
  databaseAmount: number;
  difference: number; // uploadedAmount - databaseAmount
  status: DatabaseDiffStatus;
}

export interface DatabaseSectionSummary {
  key: string;
  label: string;
  uploaded: number;
  db: number;
  variance: number;
}

export interface DatabaseTargetComparison {
  target: YearImportColumnTarget;
  hasExistingData: boolean;
  databaseItemCount: number;
  uploadedMappedItemCount: number;
  exactMatchCount: number;
  unmatchedNonZeroCount: number;
  isFullMatch: boolean;
  differences: DatabaseLineItemDiff[];
  dbTotals: {
    assets: number;
    liabilities: number;
    equity: number;
  };
  uploadedTotals: {
    assets: number;
    liabilities: number;
    equity: number;
  };
  sectionSummaries: DatabaseSectionSummary[];
  diffByLineItemId: Record<string, DatabaseLineItemDiff>;
}

/**
 * Compares the extracted & matched values for a spreadsheet year column against
 * the balances already saved in the database (`dataStore[year][divisionId]`).
 */
export function compareTargetAgainstDatabase(
  target: YearImportColumnTarget,
  rows: ExtractedPositionRow[],
  encodableItems: LineItemDefinition[],
  existingYearDivisionData?: Record<string, number>,
  statementType: StatementType = 'position'
): DatabaseTargetComparison {
  const itemById = new Map<string, LineItemDefinition>();
  encodableItems.forEach((item) => itemById.set(item.id, item));

  const uploadedMap = new Map<string, number>();
  let unmatchedNonZeroCount = 0;

  rows.forEach((r) => {
    if (!r.included) return;
    const rawAmt = r.amountsByTargetId[target.id];
    if (rawAmt === null || rawAmt === undefined || Math.abs(rawAmt) < 0.005) return;

    if (!r.selectedLineItemId) {
      unmatchedNonZeroCount++;
      return;
    }

    if (
      (statementType === 'cash_flows' &&
        r.selectedLineItemId === 'cf-sum-beg-cash' &&
        target.targetYear !== '2024') ||
      (statementType === 'net_assets' &&
        r.selectedLineItemId === 'na-beg-balance' &&
        target.targetYear !== '2024')
    ) {
      return;
    }

    const def = itemById.get(r.selectedLineItemId);
    if (!def) return;
    const normalizedAmt = def.isContra ? Math.abs(rawAmt) : rawAmt;
    uploadedMap.set(
      def.id,
      Math.round(((uploadedMap.get(def.id) ?? 0) + normalizedAmt) * 10000) / 10000
    );
  });

  let databaseItemCount = 0;
  let uploadedMappedItemCount = 0;
  let exactMatchCount = 0;
  const differences: DatabaseLineItemDiff[] = [];
  const diffByLineItemId: Record<string, DatabaseLineItemDiff> = {};

  const dbTotals = { assets: 0, liabilities: 0, equity: 0 };
  const uploadedTotals = { assets: 0, liabilities: 0, equity: 0 };

  const sectionBucketsDb: Record<string, number> = { s1: 0, s2: 0, s3: 0 };
  const sectionBucketsUp: Record<string, number> = { s1: 0, s2: 0, s3: 0 };

  const addSectionTotal = (
    totals: { assets: number; liabilities: number; equity: number },
    buckets: Record<string, number>,
    item: LineItemDefinition,
    normalizedVal: number
  ) => {
    const effective = item.isContra ? -Math.abs(normalizedVal) : normalizedVal;
    if (statementType === 'performance') {
      if (item.section === 'REVENUE') buckets.s1 += effective;
      else if (item.section === 'EXPENSES') buckets.s2 += effective;
      else if (item.section === 'TRANSFERS') {
        buckets.s3 += item.group.startsWith('Less:') ? -effective : effective;
      } else if (item.section === 'NON_OPERATING') {
        buckets.s3 += effective;
      } else if (item.section === 'LOSSES') {
        buckets.s3 -= Math.abs(effective);
      }
    } else if (statementType === 'cash_flows') {
      const signed = item.subgroup === 'Cash Outflows' ? -effective : effective;
      if (item.section === 'CASH_OPERATING') buckets.s1 += signed;
      else if (item.section === 'CASH_INVESTING') buckets.s2 += signed;
      else if (item.section === 'CASH_FINANCING') buckets.s3 += signed;
    } else if (statementType === 'net_assets') {
      if (item.group === 'Adjustments to Beginning Balance') buckets.s1 += effective;
      else if (item.group === 'Changes in Net Assets/Equity for the Calendar Year') {
        buckets.s2 += effective;
      }
      buckets.s3 += effective;
    } else {
      if (item.section === 'ASSETS') {
        totals.assets += effective;
        buckets.s1 += effective;
      } else if (item.section === 'LIABILITIES') {
        totals.liabilities += effective;
        buckets.s2 += effective;
      } else if (item.section === 'EQUITY' || item.subsection === 'Net Assets/Equity') {
        totals.equity += effective;
        buckets.s3 += effective;
      }
    }
  };

  encodableItems.forEach((item) => {
    if (
      (statementType === 'cash_flows' &&
        item.id === 'cf-sum-beg-cash' &&
        target.targetYear !== '2024') ||
      (statementType === 'net_assets' &&
        item.id === 'na-beg-balance' &&
        target.targetYear !== '2024')
    ) {
      return;
    }

    const dbRaw = existingYearDivisionData?.[item.id] ?? 0;
    const dbNormalized = item.isContra ? Math.abs(dbRaw) : dbRaw;
    const uploadedVal = uploadedMap.get(item.id) ?? 0;

    const hasDb = Math.abs(dbNormalized) >= 0.005;
    const hasUpload = Math.abs(uploadedVal) >= 0.005;

    if (hasDb) {
      databaseItemCount++;
      addSectionTotal(dbTotals, sectionBucketsDb, item, dbNormalized);
    }
    if (hasUpload) {
      uploadedMappedItemCount++;
      addSectionTotal(uploadedTotals, sectionBucketsUp, item, uploadedVal);
    }

    if (!hasDb && !hasUpload) return;

    const diff = uploadedVal - dbNormalized;
    if (Math.abs(diff) < 0.01) {
      exactMatchCount++;
      return;
    }

    const status: DatabaseDiffStatus =
      hasDb && !hasUpload
        ? 'missing_in_upload'
        : !hasDb && hasUpload
        ? 'new_in_upload'
        : 'amount_mismatch';

    const entry: DatabaseLineItemDiff = {
      lineItemId: item.id,
      itemName: item.name,
      section: item.section,
      subsection: item.subsection,
      group: item.group,
      isContra: item.isContra,
      uploadedAmount: uploadedVal,
      databaseAmount: dbNormalized,
      difference: diff,
      status,
    };
    differences.push(entry);
    diffByLineItemId[item.id] = entry;
  });

  const sectionLabels: [string, string, string] =
    statementType === 'performance'
      ? ['Total Revenue', 'Operating Expenses', 'Transfers & Subsidy']
      : statementType === 'cash_flows'
      ? ['Net Operating Cash', 'Net Investing Cash', 'Net Financing Cash']
      : statementType === 'net_assets'
      ? ['Beginning Adjustments', 'Calendar Year Changes', 'Total Net Change']
      : ['Total Assets', 'Total Liabilities', 'Net Assets / Equity'];

  const sectionSummaries: DatabaseSectionSummary[] = (['s1', 's2', 's3'] as const).map(
    (k, idx) => ({
      key: k,
      label: sectionLabels[idx],
      uploaded: sectionBucketsUp[k],
      db: sectionBucketsDb[k],
      variance: sectionBucketsUp[k] - sectionBucketsDb[k],
    })
  );

  const hasExistingData = databaseItemCount > 0;
  const isFullMatch =
    hasExistingData && differences.length === 0 && unmatchedNonZeroCount === 0;

  return {
    target,
    hasExistingData,
    databaseItemCount,
    uploadedMappedItemCount,
    exactMatchCount,
    unmatchedNonZeroCount,
    isFullMatch,
    differences,
    dbTotals,
    uploadedTotals,
    sectionSummaries,
    diffByLineItemId,
  };
}

