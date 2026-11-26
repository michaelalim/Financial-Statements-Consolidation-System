import * as XLSX from 'xlsx';

export type ExcelHorizontalAlign = 'left' | 'center' | 'right';
export type ExcelOrientation = 'portrait' | 'landscape';

export interface ExcelCellSpec {
  value: string | number;
  isNumber?: boolean;
  numFmt?: string;
  bold?: boolean;
  italic?: boolean;
  fontSize?: number;
  align?: ExcelHorizontalAlign;
  vertical?: 'top' | 'center' | 'bottom';
  wrapText?: boolean;
  indent?: number;
  topBorder?: 'thin';
  bottomBorder?: 'thin' | 'double';
  allThinBorders?: boolean;
  fillGray?: boolean;
}

export interface ExcelColumnSpec {
  wch: number;
}

export interface ExcelMergeSpec {
  startRow: number;
  startCol: number;
  endRow: number;
  endCol: number;
}

export interface ExportA4ExcelOptions {
  fileName: string;
  sheetName: string;
  rows: (ExcelCellSpec | string | number | null | undefined)[][];
  columns: ExcelColumnSpec[];
  rowHeights?: (number | undefined)[];
  merges?: ExcelMergeSpec[];
  orientation?: ExcelOrientation;
  fontFamily?: 'Times New Roman' | 'Calibri';
  defaultRowHeight?: number;
  fitToWidth?: number;
  fitToHeight?: number;
  margins?: {
    left?: number;
    right?: number;
    top?: number;
    bottom?: number;
    header?: number;
    footer?: number;
  };
}

const ACCOUNTING_NUM_FMT = '#,##0.00;(#,##0.00);"-"';

const escapeXml = (str: string): string =>
  str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

/**
 * Estimates the rendered row height in points (hpt) so wrapped multi-line labels
 * never get clipped inside fixed-width A4 Excel columns.
 */
export const estimateRowHeightPt = (
  row: (ExcelCellSpec | string | number | null | undefined)[],
  columns: ExcelColumnSpec[],
  merges: ExcelMergeSpec[] = [],
  rowIndex: number,
  basePt = 18
): number => {
  let maxLines = 1;
  let maxFontSize = 11;

  row.forEach((rawCell, colIdx) => {
    if (rawCell === null || rawCell === undefined) return;
    const spec: ExcelCellSpec =
      typeof rawCell === 'object' ? rawCell : { value: rawCell };
    if (spec.fontSize && spec.fontSize > maxFontSize) {
      maxFontSize = spec.fontSize;
    }
    if (typeof spec.value !== 'string' || !spec.value.trim()) return;

    // Determine effective column width including horizontal merges
    let effectiveWch = columns[colIdx]?.wch ?? 18;
    const merge = merges.find(
      (m) =>
        rowIndex >= m.startRow &&
        rowIndex <= m.endRow &&
        colIdx === m.startCol &&
        m.endCol > m.startCol
    );
    if (merge) {
      effectiveWch = 0;
      for (let c = merge.startCol; c <= merge.endCol; c++) {
        effectiveWch += columns[c]?.wch ?? 14;
      }
    }

    const indentChars = (spec.indent ?? 0) * 2.5;
    const usableChars = Math.max(8, Math.floor((effectiveWch - indentChars) * 0.92));

    const explicitLines = spec.value.split(/\r?\n/);
    let totalLinesForCell = 0;
    explicitLines.forEach((segment) => {
      const len = segment.trim().length;
      if (len === 0) {
        totalLinesForCell += 1;
      } else {
        totalLinesForCell += Math.max(1, Math.ceil(len / usableChars));
      }
    });

    if (totalLinesForCell > maxLines) {
      maxLines = totalLinesForCell;
    }
  });

  const lineLeading = maxFontSize >= 12 ? 15.5 : 14.5;
  const computed = Math.ceil(maxLines * lineLeading + 4);
  return Math.max(basePt, computed);
};

interface StyleRegistry {
  fontKeyToId: Map<string, number>;
  fontsXml: string[];
  borderKeyToId: Map<string, number>;
  bordersXml: string[];
  xfKeyToId: Map<string, number>;
  xfsXml: string[];
}

const createStyleRegistry = (fontFamily: 'Times New Roman' | 'Calibri'): StyleRegistry => {
  const reg: StyleRegistry = {
    fontKeyToId: new Map(),
    fontsXml: [],
    borderKeyToId: new Map(),
    bordersXml: [],
    xfKeyToId: new Map(),
    xfsXml: [],
  };

  // Default font 0
  const defaultFontKey = `${fontFamily}|11|0|0`;
  reg.fontKeyToId.set(defaultFontKey, 0);
  reg.fontsXml.push(
    `<font><sz val="11"/><color theme="1"/><name val="${escapeXml(fontFamily)}"/></font>`
  );

  // Default border 0
  const defaultBorderKey = 'none';
  reg.borderKeyToId.set(defaultBorderKey, 0);
  reg.bordersXml.push('<border><left/><right/><top/><bottom/><diagonal/></border>');

  // Default xf 0
  reg.xfKeyToId.set('default', 0);
  reg.xfsXml.push('<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>');

  return reg;
};

const getFontId = (
  reg: StyleRegistry,
  fontFamily: 'Times New Roman' | 'Calibri',
  size: number,
  bold: boolean,
  italic: boolean
): number => {
  const key = `${fontFamily}|${size}|${bold ? 1 : 0}|${italic ? 1 : 0}`;
  const existing = reg.fontKeyToId.get(key);
  if (existing !== undefined) return existing;
  const id = reg.fontsXml.length;
  reg.fontKeyToId.set(key, id);
  reg.fontsXml.push(
    `<font>${bold ? '<b/>' : ''}${italic ? '<i/>' : ''}<sz val="${size}"/><color theme="1"/><name val="${escapeXml(
      fontFamily
    )}"/></font>`
  );
  return id;
};

const getBorderId = (
  reg: StyleRegistry,
  top?: 'thin',
  bottom?: 'thin' | 'double',
  allThin?: boolean
): number => {
  const key = allThin
    ? 'all-thin'
    : `${top || ''}|${bottom || ''}`;
  if (key === '|') return 0;
  const existing = reg.borderKeyToId.get(key);
  if (existing !== undefined) return existing;
  const id = reg.bordersXml.length;
  reg.borderKeyToId.set(key, id);

  if (allThin) {
    reg.bordersXml.push(
      '<border><left style="thin"><color auto="1"/></left><right style="thin"><color auto="1"/></right><top style="thin"><color auto="1"/></top><bottom style="thin"><color auto="1"/></bottom><diagonal/></border>'
    );
  } else {
    const topXml = top ? `<top style="${top}"><color auto="1"/></top>` : '<top/>';
    const bottomXml = bottom ? `<bottom style="${bottom}"><color auto="1"/></bottom>` : '<bottom/>';
    reg.bordersXml.push(`<border><left/><right/>${topXml}${bottomXml}<diagonal/></border>`);
  }
  return id;
};

const getStyleIndex = (
  reg: StyleRegistry,
  fontFamily: 'Times New Roman' | 'Calibri',
  spec: ExcelCellSpec
): number => {
  const fontSize = spec.fontSize ?? 11;
  const bold = Boolean(spec.bold);
  const italic = Boolean(spec.italic);
  const fontId = getFontId(reg, fontFamily, fontSize, bold, italic);
  const borderId = getBorderId(reg, spec.topBorder, spec.bottomBorder, spec.allThinBorders);
  const fillId = spec.fillGray ? 2 : 0;
  const numFmtId = spec.isNumber ? 164 : 0;
  const align = spec.align ?? (spec.isNumber ? 'right' : 'left');
  const vertical = spec.vertical ?? 'center';
  const wrapText = spec.wrapText !== false;
  const indent = spec.indent && spec.indent > 0 && align === 'left' ? spec.indent : 0;

  const xfKey = `${numFmtId}|${fontId}|${fillId}|${borderId}|${align}|${vertical}|${
    wrapText ? 1 : 0
  }|${indent}`;
  const existing = reg.xfKeyToId.get(xfKey);
  if (existing !== undefined) return existing;

  const id = reg.xfsXml.length;
  reg.xfKeyToId.set(xfKey, id);

  const alignAttrs = [
    `horizontal="${align}"`,
    `vertical="${vertical}"`,
    wrapText ? 'wrapText="1"' : '',
    indent > 0 ? `indent="${indent}"` : '',
  ]
    .filter(Boolean)
    .join(' ');

  reg.xfsXml.push(
    `<xf numFmtId="${numFmtId}" fontId="${fontId}" fillId="${fillId}" borderId="${borderId}" xfId="0"${
      numFmtId > 0 ? ' applyNumberFormat="1"' : ''
    }${fontId > 0 ? ' applyFont="1"' : ''}${fillId > 0 ? ' applyFill="1"' : ''}${
      borderId > 0 ? ' applyBorder="1"' : ''
    } applyAlignment="1"><alignment ${alignAttrs}/></xf>`
  );
  return id;
};

const buildStylesXml = (reg: StyleRegistry): string => {
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<numFmts count="1"><numFmt numFmtId="164" formatCode="${escapeXml(ACCOUNTING_NUM_FMT)}"/></numFmts>` +
    `<fonts count="${reg.fontsXml.length}">${reg.fontsXml.join('')}</fonts>` +
    `<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF1F5F9"/><bgColor indexed="64"/></patternFill></fill></fills>` +
    `<borders count="${reg.bordersXml.length}">${reg.bordersXml.join('')}</borders>` +
    `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
    `<cellXfs count="${reg.xfsXml.length}">${reg.xfsXml.join('')}</cellXfs>` +
    `<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>` +
    `</styleSheet>`
  );
};

/**
 * Generates and downloads an .xlsx file with explicit column widths, explicit row heights,
 * accounting number formats, borders, merges, and A4 paper print configuration (`paperSize="9"`).
 */
export const exportA4ExcelWorkbook = ({
  fileName,
  sheetName,
  rows,
  columns,
  rowHeights,
  merges = [],
  orientation = 'portrait',
  fontFamily = 'Times New Roman',
  defaultRowHeight = 18,
  fitToWidth = 1,
  fitToHeight = 0,
  margins,
}: ExportA4ExcelOptions): void => {
  const safeSheetName = (sheetName || 'Financial Statement')
    .replace(/[\\/?*[\]:]/g, ' ')
    .trim()
    .slice(0, 31) || 'Sheet1';

  const registry = createStyleRegistry(fontFamily);
  const styleGrid: Record<string, number> = {};

  const aoa: (string | number | null)[][] = rows.map((row, rIdx) => {
    const outRow: (string | number | null)[] = new Array(columns.length).fill(null);
    row.forEach((rawCell, cIdx) => {
      if (rawCell === null || rawCell === undefined) return;
      const spec: ExcelCellSpec =
        typeof rawCell === 'object'
          ? rawCell
          : {
              value: rawCell,
              isNumber: typeof rawCell === 'number',
            };

      const isNumeric = spec.isNumber ?? typeof spec.value === 'number';
      const normalizedSpec: ExcelCellSpec = {
        ...spec,
        isNumber: isNumeric,
      };
      outRow[cIdx] = spec.value;
      const addr = XLSX.utils.encode_cell({ r: rIdx, c: cIdx });
      styleGrid[addr] = getStyleIndex(registry, fontFamily, normalizedSpec);
    });
    return outRow;
  });

  const ws = XLSX.utils.aoa_to_sheet(aoa);

  // Retain column widths (both wch and wpx for reliable Excel & Calc rendering)
  ws['!cols'] = columns.map((col) => ({
    wch: col.wch,
    wpx: Math.round(col.wch * 7.2),
  }));

  // Retain row heights (explicitly computed per row or provided)
  ws['!rows'] = rows.map((row, rIdx) => {
    const explicit = rowHeights?.[rIdx];
    const hpt =
      explicit !== undefined
        ? explicit
        : row.length === 0
        ? 10
        : estimateRowHeightPt(row, columns, merges, rIdx, defaultRowHeight);
    return {
      hpt,
      hpx: Math.round((hpt * 96) / 72),
    };
  });

  // Ensure merge boundary cells carry border styles when bordered
  if (merges.length > 0) {
    ws['!merges'] = merges.map((m) => ({
      s: { r: m.startRow, c: m.startCol },
      e: { r: m.endRow, c: m.endCol },
    }));
    merges.forEach((m) => {
      const topLeftAddr = XLSX.utils.encode_cell({ r: m.startRow, c: m.startCol });
      const topLeftStyle = styleGrid[topLeftAddr];
      if (topLeftStyle !== undefined) {
        for (let r = m.startRow; r <= m.endRow; r++) {
          for (let c = m.startCol; c <= m.endCol; c++) {
            const addr = XLSX.utils.encode_cell({ r, c });
            if (styleGrid[addr] === undefined) {
              styleGrid[addr] = topLeftStyle;
              if (!ws[addr]) {
                ws[addr] = { t: 's', v: '' };
              }
            }
          }
        }
      }
    });
  }

  // Default A4 margins (inches)
  ws['!margins'] = {
    left: margins?.left ?? 0.45,
    right: margins?.right ?? 0.45,
    top: margins?.top ?? 0.55,
    bottom: margins?.bottom ?? 0.55,
    header: margins?.header ?? 0.25,
    footer: margins?.footer ?? 0.25,
  };

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, safeSheetName);

  const rawBuffer = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  const cfb = XLSX.CFB.read(new Uint8Array(rawBuffer), { type: 'array' });

  // Inject styles.xml with Times New Roman / Calibri fonts, accounting formats, borders, and wrapText
  const stylesEntry = XLSX.CFB.find(cfb, '/xl/styles.xml');
  if (stylesEntry) {
    const encodedStyles = new TextEncoder().encode(buildStylesXml(registry));
    stylesEntry.content = encodedStyles;
    stylesEntry.size = encodedStyles.length;
  }

  // Inject cell style indices, fitToPage, printOptions, and A4 paperSize="9" pageSetup into sheet1.xml
  const sheetEntry = XLSX.CFB.find(cfb, '/xl/worksheets/sheet1.xml');
  if (sheetEntry) {
    let sheetXml = new TextDecoder().decode(sheetEntry.content);

    // Apply style index s="..." to each cell in sheetXml
    sheetXml = sheetXml.replace(
      /<c r="([A-Z]+\d+)"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g,
      (fullMatch, addr: string, attrs: string, inner: string | undefined) => {
        const sIdx = styleGrid[addr];
        if (sIdx === undefined) return fullMatch;
        const cleanedAttrs = attrs.replace(/\s+s="\d+"/, '');
        const newAttrs = `${cleanedAttrs} s="${sIdx}"`;
        if (inner === undefined) {
          return `<c r="${addr}"${newAttrs}/>`;
        }
        return `<c r="${addr}"${newAttrs}>${inner}</c>`;
      }
    );

    // Enable fitToPage in sheetPr
    if (sheetXml.includes('<sheetPr')) {
      if (!sheetXml.includes('<pageSetUpPr')) {
        sheetXml = sheetXml.replace(
          /<sheetPr([^>]*)>/,
          '<sheetPr$1><pageSetUpPr fitToPage="1"/>'
        );
      }
    } else {
      sheetXml = sheetXml.replace(
        '<dimension ',
        '<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr><dimension '
      );
    }

    // Add printOptions (center horizontally on A4) and pageSetup (paperSize="9" = A4)
    const printAndPageSetupXml =
      `<printOptions horizontalCentered="1"/>` +
      `<pageSetup paperSize="9" orientation="${orientation}" fitToWidth="${fitToWidth}" fitToHeight="${fitToHeight}"/>`;

    if (/<pageMargins[^>]*\/>/.test(sheetXml)) {
      sheetXml = sheetXml.replace(
        /(<pageMargins[^>]*\/>)/,
        `<printOptions horizontalCentered="1"/>$1<pageSetup paperSize="9" orientation="${orientation}" fitToWidth="${fitToWidth}" fitToHeight="${fitToHeight}"/>`
      );
    } else if (sheetXml.includes('<ignoredErrors')) {
      sheetXml = sheetXml.replace('<ignoredErrors', `${printAndPageSetupXml}<ignoredErrors`);
    } else {
      sheetXml = sheetXml.replace('</worksheet>', `${printAndPageSetupXml}</worksheet>`);
    }

    const encodedSheet = new TextEncoder().encode(sheetXml);
    sheetEntry.content = encodedSheet;
    sheetEntry.size = encodedSheet.length;
  }

  const finalOut = XLSX.CFB.write(cfb, { type: 'array', fileType: 'zip' });
  const blob = new Blob([new Uint8Array(finalOut)], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName.endsWith('.xlsx') ? fileName : `${fileName}.xlsx`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
