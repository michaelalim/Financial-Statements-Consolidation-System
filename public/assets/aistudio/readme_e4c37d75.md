# DepEd Region VI Financial Statement System

A client-side web application for encoding, importing, auditing, consolidating, and printing Philippine public sector (COA GAM) financial statements for **DepEd Regional Office No. VI** and its **Schools Division Offices (SDOs)** across fiscal years **2024–2099**.

---

## Supported Financial Statements

1. **Statement of Financial Position** (`Detailed` & `Condensed FS`)
2. **Statement of Financial Performance** (`Detailed` & `Condensed FS`)
3. **Statement of Cash Flows**
4. **Statement of Changes in Net Assets/Equity**

---

## Core Capabilities

- **Data Entry & Division Accounting (`DataEntryForm`)**
  - Encodes balances per division and fiscal year with contra-account deduction handling (`Accumulated Depreciation`, `Allowance for Impairment`).
  - Automatic comparative chaining:
    - **Cash Flows**: `Cash and Cash Equivalents, January 1` pulls from prior period's `December 31` (editable for FY 2024 baseline), and `December 31` auto-computes from `January 1 + Increase/(Decrease) in Cash + FX Effects`.
    - **Net Assets/Equity**: Beginning balance chains from prior year ending equity (`Balance at End of Period`).
  - Explicit placement selector for dual-section items (`Other Gains` and `Miscellaneous Income`, defaulting to `Other Non-Operating Income` with an option for `Revenue`).

- **Smart Excel / XLSX Import (`ExcelPositionImportModal`, `excelImportPosition`)**
  - Auto-detects worksheets and comparative year columns (`2024–2099`).
  - Fuzzy & context-aware COA account matching with persistent user aliases, section/group disambiguation (including clipped multi-line PDF-to-Excel labels), and automatic exclusion of hierarchy subtotals/summary rows (`Total ...`, `Net Value`, `Cash Provided by ...`, dated `Cash and Cash Equivalents`).
  - Dedicated **Duplicates** review workflow with an anti-wobble searchable account selector (`SearchableLineItemSelect`) that keeps rows visible during active reclassification.
  - **Umbrella Auto-Aggregation**: Detects management recording mismatches and prevents double-counting for:
    - `Semi-Expendable Furniture, Fixtures and Books Expenses`
    - `Semi-Expendable Machinery and Equipment Expenses`
    - `Other Bonuses and Allowances` (4 covered incentives/allowances)
    - `Depreciation` groups (`Buildings and Other Structures`, `Machinery and Equipment`, `Transportation Equipment`, `Furniture, Fixtures and Books`)
  - Persists aggregation breakdowns with screen-only notices (`print:hidden`) across Data Entry, FS Draft, and Financial Statements without affecting printed reports.
  - **Draft Financial Statement** preview (`DraftStatementPreview`) displays father-account subtotals alongside imported values before saving.

- **Reporting, Consolidation & Audit**
  - **Financial Statements (`DivisionalFSView`)**: Print-ready per-division comparative statements (with `Detailed` / `Condensed FS` toggle and notes).
  - **Consolidated FS (`ConsolidatedFSView`)**: Aggregates all active divisions into comparative regional financial statements with CSV export.
  - **Division Matrix (`ConsolidatedMatrixView`)**: Side-by-side matrix across Regional Office VI and SDOs.
  - **Accounting Balance Check & Audit Drawer (`AccountingBalanceCheck`, `AccountingAuditDrawer`)**: Validates `Assets = Liabilities + Equity` and Cash/Net Assets reconciliations.
  - **Options (`OptionsView`)**: Manage divisions (`Regional Office VI`, `Iloilo`, `Iloilo City`, `Passi City`, `Guimaras`, `Antique`, `Aklan`, `Capiz`, `Roxas`), custom COA line items (`LineItemManager`), cross-division data transfer, and Data Bank backups.

---

## Tech Stack & Project Structure

- **Frontend**: React 19, TypeScript, Vite 8, Tailwind CSS v4, Lucide Icons, Motion (`motion`), SheetJS (`xlsx`)
- **Storage**: Browser `localStorage` & `sessionStorage` (`deped_ro6_*` versioned keys with automatic schema migrations)

```text
src/
├── App.tsx                     # Root state, localStorage persistence & schema migrations
├── context/ThemeContext.tsx    # Light/dark theme tokens & layout sizing
├── types/                      # Core financial statement & theme TypeScript types
├── data/                       # Default divisions, COA line items (SFP, Perf, Cash Flows, Net Assets), benchmarks
├── utils/                      # Statement calculations, Excel parser/matcher, formatters, year helpers
└── components/                 # Data Entry, Excel Import, Draft FS, Divisional/Consolidated/Matrix views, Options
