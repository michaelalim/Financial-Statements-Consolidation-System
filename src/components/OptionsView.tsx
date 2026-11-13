import React, { useState, useEffect } from 'react';
import { Division, LineItemDefinition, FinancialDataStore } from '../types/fs';
import { DataBankView } from './DataBankView';
import { DivisionManager } from './DivisionManager';
import { LineItemManager } from './LineItemManager';
import { TransferDivisionPanel } from './TransferDivisionModal';
import { Database, Building2, Sliders, RotateCcw, Settings, Sun, Moon, Check, Sparkles, ArrowLeftRight, Palette } from 'lucide-react';
import { ConfirmModal } from './ConfirmModal';
import { useTheme } from '../context/ThemeContext';
import { COLOR_THEMES } from '../types/theme';

export type OptionsSubTab = 'databank' | 'divisions' | 'lineItems' | 'transfer' | 'theme';

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
  onTransferDivisionData: (
    fromYear: string,
    fromDivId: string,
    toYear: string,
    toDivId: string,
    mode: 'move' | 'copy'
  ) => void;
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
  onTransferDivisionData,
}) => {
  const [subTab, setSubTab] = useState<OptionsSubTab>(initialSubTab);

  // Sync subTab whenever requested from outer navigation
  useEffect(() => {
    if (initialSubTab) {
      setSubTab(initialSubTab);
    }
  }, [initialSubTab]);

  const [isResetBenchmarkModalOpen, setIsResetBenchmarkModalOpen] = useState(false);
  const { mode, isDark, setMode, themeId, setThemeId, useContrastAccent, setUseContrastAccent } = useTheme();
  const activeTheme = COLOR_THEMES.find((t) => t.id === themeId) ?? COLOR_THEMES[0];
  const activeTonalHex = isDark ? activeTheme.tonalAccent.dark : activeTheme.tonalAccent.light;

  return (
    <div className="w-full max-w-[1780px] mx-auto px-2 sm:px-4 py-4 space-y-6">
      {/* Options Header & Sub-Tab Bar */}
      <div className="bg-th-surface border border-th-border rounded-xl p-6 shadow-xs transition-colors">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-th-border">
          <div className="flex items-center gap-3.5">
            <div className="p-3 bg-th-primary text-th-primary-fg border border-th-border-strong rounded-xl shrink-0">
              <Settings className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl sm:text-2xl font-bold text-th-text">
                System Options &amp; Administrative Tools
              </h2>
              <p className="text-sm text-th-muted mt-1 leading-relaxed">
                Manage the financial data bank, schools division offices, chart of accounts, data transfers, and appearance themes.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 self-start sm:self-auto flex-wrap">
            <button
              type="button"
              onClick={() => setIsResetBenchmarkModalOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-bold text-th-text bg-th-subtle hover:bg-th-subtle-hover rounded-lg transition-colors whitespace-nowrap border border-th-border-strong cursor-pointer"
            >
              <RotateCcw className="w-4 h-4 text-th-muted" />
              <span>Reload PDF Benchmark Data</span>
            </button>
          </div>
        </div>

        {/* Options Sub-Tabs */}
        <div className="mt-5 flex items-center gap-2.5 overflow-x-auto scrollbar-none">
          <button
            type="button"
            onClick={() => setSubTab('databank')}
            className={`px-4 py-2.5 rounded-lg text-sm font-bold flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer shadow-xs border ${
              subTab === 'databank'
                ? 'bg-th-primary text-th-primary-fg border-th-primary dark:border-th-border-strong'
                : 'bg-th-subtle text-th-text hover:bg-th-subtle-hover border-th-border'
            }`}
          >
            <Database className="w-4 h-4" />
            <span>1. Data Bank</span>
          </button>

          <button
            type="button"
            onClick={() => setSubTab('divisions')}
            className={`px-4 py-2.5 rounded-lg text-sm font-bold flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer shadow-xs border ${
              subTab === 'divisions'
                ? 'bg-th-primary text-th-primary-fg border-th-primary dark:border-th-border-strong'
                : 'bg-th-subtle text-th-text hover:bg-th-subtle-hover border-th-border'
            }`}
          >
            <Building2 className="w-4 h-4" />
            <span>2. Divisions ({divisions.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setSubTab('lineItems')}
            className={`px-4 py-2.5 rounded-lg text-sm font-bold flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer shadow-xs border ${
              subTab === 'lineItems'
                ? 'bg-th-primary text-th-primary-fg border-th-primary dark:border-th-border-strong'
                : 'bg-th-subtle text-th-text hover:bg-th-subtle-hover border-th-border'
            }`}
          >
            <Sliders className="w-4 h-4" />
            <span>3. Line Items ({lineItems.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setSubTab('transfer')}
            className={`px-4 py-2.5 rounded-lg text-sm font-bold flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer shadow-xs border ${
              subTab === 'transfer'
                ? 'bg-th-primary text-th-primary-fg border-th-primary dark:border-th-border-strong'
                : 'bg-th-subtle text-th-text hover:bg-th-subtle-hover border-th-border'
            }`}
          >
            <ArrowLeftRight className="w-4 h-4" />
            <span>4. Transfer / Reassign Data</span>
          </button>

          <button
            type="button"
            onClick={() => setSubTab('theme')}
            className={`px-4 py-2.5 rounded-lg text-sm font-bold flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer shadow-xs border ${
              subTab === 'theme'
                ? 'bg-th-primary text-th-primary-fg border-th-primary dark:border-th-border-strong'
                : 'bg-th-subtle text-th-text hover:bg-th-subtle-hover border-th-border'
            }`}
          >
            <Palette className="w-4 h-4" />
            <span>5. Themes &amp; Display</span>
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

        {subTab === 'transfer' && (
          <TransferDivisionPanel
            divisions={divisions}
            dataStore={dataStore}
            onTransfer={onTransferDivisionData}
            initialFromDivId="iloilo-div"
            initialToDivId="iloilo-city-div"
            initialYear="2024"
          />
        )}

        {subTab === 'theme' && (
          <div className="bg-th-surface border border-th-border rounded-xl p-6 sm:p-8 shadow-xs space-y-6 transition-colors">
            <div>
              <h3 className="text-lg sm:text-xl font-bold text-th-text flex items-center gap-2.5">
                <Palette className="w-5 h-5 text-th-muted" />
                <span>Themes &amp; Display Mode</span>
              </h3>
              <p className="text-sm text-th-muted mt-1 leading-relaxed">
                Select a color theme and choose between Light, Dark, or System display mode.
              </p>
            </div>

            {/* Color Theme Presets */}
            {(() => {
              const recommendedThemes = COLOR_THEMES.filter((t) => t.recommended);
              const additionalThemes = COLOR_THEMES.filter((t) => !t.recommended);

              const renderThemeCard = (preset: (typeof COLOR_THEMES)[number]) => {
                const isSelected = themeId === preset.id;
                const displayedThirdColor = useContrastAccent
                  ? preset.colors.accent
                  : isDark
                  ? preset.tonalAccent.dark
                  : preset.tonalAccent.light;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => setThemeId(preset.id)}
                    className={`p-4 rounded-xl border-2 text-left transition-all cursor-pointer flex flex-col justify-between gap-3 ${
                      isSelected
                        ? 'bg-th-surface border-th-primary dark:border-th-border-strong ring-2 ring-th-border-strong shadow-sm'
                        : 'bg-th-surface border-th-border hover:border-th-border-strong'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-base font-bold text-th-text flex items-center gap-2">
                          <span>{preset.name}</span>
                        </div>
                        <p className="text-sm text-th-muted mt-1 leading-relaxed">
                          {preset.description}
                        </p>
                      </div>
                      {isSelected && (
                        <span className="w-6 h-6 rounded-full bg-th-primary text-th-primary-fg flex items-center justify-center shrink-0 border border-th-border-strong">
                          <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                        </span>
                      )}
                    </div>

                    <div className="flex items-center justify-between pt-2.5 border-t border-th-border">
                      <div className="flex items-center gap-2">
                        <span
                          className="w-6 h-6 rounded-md border border-black/15 dark:border-white/20 shadow-2xs"
                          style={{ backgroundColor: preset.colors.primary }}
                          title={`Primary: ${preset.colors.primary}`}
                        />
                        <span
                          className="w-6 h-6 rounded-md border border-black/15 dark:border-white/20 shadow-2xs"
                          style={{ backgroundColor: preset.colors.light }}
                          title={`Surface / Light: ${preset.colors.light}`}
                        />
                        <span
                          className="w-6 h-6 rounded-md border border-black/15 dark:border-white/20 shadow-2xs"
                          style={{ backgroundColor: displayedThirdColor }}
                          title={
                            useContrastAccent
                              ? `Contrasting Accent: ${displayedThirdColor}`
                              : `Primary Shade Accent: ${displayedThirdColor}`
                          }
                        />
                      </div>
                      <span className="text-xs font-mono font-semibold text-th-muted">
                        {preset.colors.primary} · {preset.colors.light} · {displayedThirdColor}
                      </span>
                    </div>
                  </button>
                );
              };

              return (
                <div className="space-y-5">
                  {/* Recommended Themes */}
                  <div className="p-6 bg-th-subtle border-2 border-th-border-strong rounded-xl space-y-4">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2.5">
                        <h4 className="text-base font-bold text-th-text">
                          Recommended Themes
                        </h4>
                        <span className="px-2.5 py-0.5 rounded-md bg-th-primary text-th-primary-fg text-xs font-bold border border-th-border-strong">
                          {recommendedThemes.length} Presets
                        </span>
                      </div>
                      <span className="text-sm font-semibold text-th-muted">
                        Applies across both Light &amp; Dark modes
                      </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                      {recommendedThemes.map(renderThemeCard)}
                    </div>
                  </div>

                  {/* Additional Color Themes */}
                  <div className="p-6 bg-th-subtle border border-th-border rounded-xl space-y-4">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <h4 className="text-base font-bold text-th-text">
                        More Color Themes
                      </h4>
                      <span className="text-sm font-semibold text-th-muted">
                        {additionalThemes.length} Classic &amp; Calm Presets
                      </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                      {additionalThemes.map(renderThemeCard)}
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Accent Color Mode Selection */}
            <div className="p-6 bg-th-subtle border border-th-border rounded-xl space-y-4">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div>
                  <h4 className="text-base font-bold text-th-text">
                    Accent Color Style
                  </h4>
                  <p className="text-sm text-th-muted mt-1 leading-relaxed">
                    Choose whether primary action buttons and focus indicators use the theme&apos;s contrasting 3rd color or a tonal shade of its 1st primary color.
                  </p>
                </div>
                <span className="text-xs sm:text-sm font-mono font-semibold text-th-muted">
                  Active: {useContrastAccent ? activeTheme.colors.accent : activeTonalHex}
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <button
                  type="button"
                  onClick={() => setUseContrastAccent(true)}
                  className={`p-4 rounded-xl border-2 text-left flex items-center justify-between gap-4 transition-all cursor-pointer ${
                    useContrastAccent
                      ? 'bg-th-surface text-th-text border-th-primary dark:border-th-border-strong ring-2 ring-th-border-strong shadow-sm'
                      : 'bg-th-surface text-th-text border-th-border hover:border-th-border-strong'
                  }`}
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <span
                      className="w-9 h-9 rounded-lg border border-black/15 dark:border-white/20 shrink-0 shadow-2xs"
                      style={{ backgroundColor: activeTheme.colors.accent }}
                    />
                    <div className="min-w-0">
                      <div className="text-base font-bold text-th-text">
                        Use Contrasting Color (3rd Color)
                      </div>
                      <p className="text-sm text-th-muted mt-0.5 leading-relaxed">
                        Applies {activeTheme.name}&apos;s distinct accent ({activeTheme.colors.accent}) for primary action buttons.
                      </p>
                    </div>
                  </div>
                  {useContrastAccent && (
                    <span className="w-6 h-6 rounded-full bg-th-primary text-th-primary-fg flex items-center justify-center shrink-0 border border-th-border-strong">
                      <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                    </span>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => setUseContrastAccent(false)}
                  className={`p-4 rounded-xl border-2 text-left flex items-center justify-between gap-4 transition-all cursor-pointer ${
                    !useContrastAccent
                      ? 'bg-th-surface text-th-text border-th-primary dark:border-th-border-strong ring-2 ring-th-border-strong shadow-sm'
                      : 'bg-th-surface text-th-text border-th-border hover:border-th-border-strong'
                  }`}
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <span
                      className="w-9 h-9 rounded-lg border border-black/15 dark:border-white/20 shrink-0 shadow-2xs"
                      style={{ backgroundColor: activeTonalHex }}
                    />
                    <div className="min-w-0">
                      <div className="text-base font-bold text-th-text">
                        Use Shade of Primary Color (1st Color)
                      </div>
                      <p className="text-sm text-th-muted mt-0.5 leading-relaxed">
                        Replaces the contrasting color with a tonal shade ({activeTonalHex}) derived from {activeTheme.colors.primary}.
                      </p>
                    </div>
                  </div>
                  {!useContrastAccent && (
                    <span className="w-6 h-6 rounded-full bg-th-primary text-th-primary-fg flex items-center justify-center shrink-0 border border-th-border-strong">
                      <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                    </span>
                  )}
                </button>
              </div>
            </div>

            {/* Light / Dark / System Mode Selection */}
            <div className="p-6 bg-th-subtle border border-th-border rounded-xl space-y-4">
              <h4 className="text-base font-bold text-th-text">
                Display Mode
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <button
                  type="button"
                  onClick={() => setMode('light')}
                  className={`p-4 rounded-xl border-2 text-base font-bold flex items-center justify-between transition-all cursor-pointer ${
                    mode === 'light'
                      ? 'bg-th-primary text-th-primary-fg border-th-primary dark:border-th-border-strong shadow-sm'
                      : 'bg-th-surface text-th-text border-th-border hover:border-th-border-strong'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Sun className={`w-5 h-5 ${mode === 'light' ? 'text-th-primary-fg' : 'text-th-muted'}`} />
                    <span>Light Mode</span>
                  </div>
                  {mode === 'light' && <Check className="w-5 h-5 text-th-primary-fg" />}
                </button>

                <button
                  type="button"
                  onClick={() => setMode('dark')}
                  className={`p-4 rounded-xl border-2 text-base font-bold flex items-center justify-between transition-all cursor-pointer ${
                    mode === 'dark'
                      ? 'bg-th-primary text-th-primary-fg border-th-primary dark:border-th-border-strong shadow-sm'
                      : 'bg-th-surface text-th-text border-th-border hover:border-th-border-strong'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Moon className={`w-5 h-5 ${mode === 'dark' ? 'text-th-primary-fg' : 'text-th-muted'}`} />
                    <span>Dark Mode</span>
                  </div>
                  {mode === 'dark' && <Check className="w-5 h-5 text-th-primary-fg" />}
                </button>

                <button
                  type="button"
                  onClick={() => setMode('system')}
                  className={`p-4 rounded-xl border-2 text-base font-bold flex items-center justify-between transition-all cursor-pointer ${
                    mode === 'system'
                      ? 'bg-th-primary text-th-primary-fg border-th-primary dark:border-th-border-strong shadow-sm'
                      : 'bg-th-surface text-th-text border-th-border hover:border-th-border-strong'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Sparkles className={`w-5 h-5 ${mode === 'system' ? 'text-th-primary-fg' : 'text-th-muted'}`} />
                    <span>System Default</span>
                  </div>
                  {mode === 'system' && <Check className="w-5 h-5 text-th-primary-fg" />}
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
