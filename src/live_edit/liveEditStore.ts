import { FinancialDataStore, LineItemDefinition } from '../types/fs';
import { parseNumberInput } from '../utils/formatters';

export interface LiveEditStagedRow {
  lineItemId: string;
  rawText?: string;
  amount: string;
}

export interface LiveEditTopDraft {
  itemId: string;
  rawText: string;
  amount: string;
}

export interface LiveEditOverlayResult {
  liveDataStore: FinancialDataStore;
  modifiedItemIds: Set<string>;
  pendingCount: number;
}

function resolveLineItemId(
  explicitId: string,
  rawText: string | undefined,
  encodableItems: LineItemDefinition[]
): string | null {
  if (explicitId && encodableItems.some((i) => i.id === explicitId)) {
    return explicitId;
  }
  const trimmed = rawText?.trim().toLowerCase();
  if (!trimmed) return null;
  const exactMatches = encodableItems.filter(
    (i) => i.name.trim().toLowerCase() === trimmed
  );
  return exactMatches.length === 1 ? exactMatches[0].id : null;
}

/**
 * [live_edit] Builds a non-destructive virtual FinancialDataStore overlaying
 * unsaved batch rows and the active top-form draft on top of persisted dataStore.
 */
export function buildLiveEditOverlay(
  baseDataStore: FinancialDataStore,
  selectedYear: string,
  selectedDivisionId: string,
  encodableItems: LineItemDefinition[],
  stagedEntries: LiveEditStagedRow[],
  topDraft?: LiveEditTopDraft
): LiveEditOverlayResult {
  const existingDivYear = baseDataStore[selectedYear]?.[selectedDivisionId] || {};
  const nextDivYear: Record<string, number> = { ...existingDivYear };
  const modifiedItemIds = new Set<string>();

  stagedEntries.forEach((row) => {
    if (!row.amount || !row.amount.trim()) return;
    const resolvedId = resolveLineItemId(row.lineItemId, row.rawText, encodableItems);
    if (!resolvedId) return;
    const parsed = parseNumberInput(row.amount);
    if (isNaN(parsed)) return;
    nextDivYear[resolvedId] = parsed;
    modifiedItemIds.add(resolvedId);
  });

  if (topDraft && topDraft.amount && topDraft.amount.trim()) {
    const resolvedTopId = resolveLineItemId(
      topDraft.itemId,
      topDraft.rawText,
      encodableItems
    );
    if (resolvedTopId) {
      const parsed = parseNumberInput(topDraft.amount);
      if (!isNaN(parsed)) {
        nextDivYear[resolvedTopId] = parsed;
        modifiedItemIds.add(resolvedTopId);
      }
    }
  }

  const liveDataStore: FinancialDataStore = {
    ...baseDataStore,
    [selectedYear]: {
      ...(baseDataStore[selectedYear] || {}),
      [selectedDivisionId]: nextDivYear,
    },
  };

  return {
    liveDataStore,
    modifiedItemIds,
    pendingCount: modifiedItemIds.size,
  };
}
