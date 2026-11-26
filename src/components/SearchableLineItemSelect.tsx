import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { LineItemDefinition } from '../types/fs';
import { Search, ChevronDown, X, Check, ArrowUp, ArrowDown, CornerDownLeft, AlertCircle } from 'lucide-react';

export interface SearchableLineItemSelectProps {
  lineItems: LineItemDefinition[];
  selectedItemId: string;
  onSelectItem: (itemId: string, itemName?: string) => void;
  rawText?: string;
  onChangeRawText?: (text: string) => void;
  isInvalid?: boolean;
  isDuplicate?: boolean;
  placeholder?: string;
  className?: string;
  placement?: 'auto' | 'bottom' | 'top';
  usePortal?: boolean;
  compact?: boolean;
  onOpenStateChange?: (isOpen: boolean) => void;
  onSelectAndNext?: () => void;
  inputRef?: React.RefObject<HTMLInputElement | null> | ((el: HTMLInputElement | null) => void);
  id?: string;
}

/**
 * Normalizes text by removing all non-alphanumeric characters and lowercasing.
 * e.g., "Cash - Collecting Officer" -> "cashcollectingofficer"
 * e.g., "cash collecting" -> "cashcollecting"
 */
export function normalizeAlphanumeric(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Splits text into individual alphanumeric words/tokens.
 * e.g., "Cash - Collecting Officer (Contra)" -> ["cash", "collecting", "officer", "contra"]
 */
export function getAlphanumericTokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * Determines whether a line item matches a query, forgiving missing punctuation,
 * hyphens, slashes, spaces, and parenthesis.
 * Example: User types "cash collecting" -> matches "Cash - Collecting Officer"
 */
export function matchLineItemForgiving(
  item: LineItemDefinition,
  query: string
): { matched: boolean; score: number } {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return { matched: true, score: 0 };

  const nameLower = item.name.toLowerCase();
  const nameAlpha = normalizeAlphanumeric(item.name);
  const queryAlpha = normalizeAlphanumeric(trimmed);
  const queryTokens = getAlphanumericTokens(trimmed);

  // 1. Exact match (case-insensitive or normalized)
  if (nameLower === trimmed || (queryAlpha && nameAlpha === queryAlpha)) {
    return { matched: true, score: 100 };
  }

  // 2. Starts with query (direct or alphanumeric)
  if (nameLower.startsWith(trimmed) || (queryAlpha && nameAlpha.startsWith(queryAlpha))) {
    return { matched: true, score: 90 };
  }

  // 3. Substring match (direct)
  if (nameLower.includes(trimmed)) {
    return { matched: true, score: 80 };
  }

  // 4. Substring match without non-alphanumerics:
  if (queryAlpha && nameAlpha.includes(queryAlpha)) {
    return { matched: true, score: 75 };
  }

  // 5. UACS code match (if assigned)
  if (item.uacs) {
    const uacsLower = item.uacs.toLowerCase();
    const uacsAlpha = normalizeAlphanumeric(item.uacs);
    if (uacsLower === trimmed || (queryAlpha && uacsAlpha === queryAlpha)) {
      return { matched: true, score: 98 };
    }
    if (uacsLower.startsWith(trimmed) || (queryAlpha && uacsAlpha.startsWith(queryAlpha))) {
      return { matched: true, score: 88 };
    }
    if (uacsLower.includes(trimmed) || (queryAlpha && uacsAlpha.includes(queryAlpha))) {
      return { matched: true, score: 74 };
    }
  }

  // 6. All query tokens exist inside the item's name
  if (queryTokens.length > 0) {
    const nameTokens = getAlphanumericTokens(item.name);
    const allTokensMatchName = queryTokens.every(
      (qTok) => nameTokens.some((nTok) => nTok.includes(qTok)) || nameAlpha.includes(qTok)
    );
    if (allTokensMatchName) {
      return { matched: true, score: 70 };
    }
  }

  // 6. Check subsection, group, and subgroup
  const contextualFields = [item.subgroup || '', item.group, item.subsection];
  for (const field of contextualFields) {
    if (!field) continue;
    const fieldLower = field.toLowerCase();
    const fieldAlpha = normalizeAlphanumeric(field);

    if (fieldLower.includes(trimmed) || (queryAlpha && fieldAlpha.includes(queryAlpha))) {
      return { matched: true, score: 50 };
    }

    if (queryTokens.length > 0) {
      const fieldTokens = getAlphanumericTokens(field);
      if (
        queryTokens.every(
          (qTok) => fieldTokens.some((fTok) => fTok.includes(qTok)) || fieldAlpha.includes(qTok)
        )
      ) {
        return { matched: true, score: 45 };
      }
    }
  }

  return { matched: false, score: 0 };
}

interface LineItemsLookupMeta {
  byId: Map<string, LineItemDefinition>;
  duplicateNormalizedNames: Set<string>;
}

const LINE_ITEMS_META_CACHE = new WeakMap<LineItemDefinition[], LineItemsLookupMeta>();
const EMPTY_LINE_ITEMS: LineItemDefinition[] = [];
const EMPTY_INDEX_MAP = new Map<string, number>();
const EMPTY_GROUPED_ITEMS: { [key: string]: LineItemDefinition[] } = {};

function getLineItemsLookupMeta(lineItems: LineItemDefinition[]): LineItemsLookupMeta {
  const cached = LINE_ITEMS_META_CACHE.get(lineItems);
  if (cached) return cached;

  const byId = new Map<string, LineItemDefinition>();
  const counts = new Map<string, number>();
  for (let i = 0; i < lineItems.length; i++) {
    const item = lineItems[i];
    byId.set(item.id, item);
    const key = normalizeAlphanumeric(item.name);
    if (key) {
      counts.set(key, (counts.get(key) || 0) + 1);
    }
  }
  const dups = new Set<string>();
  counts.forEach((count, key) => {
    if (count > 1) dups.add(key);
  });

  const meta: LineItemsLookupMeta = { byId, duplicateNormalizedNames: dups };
  LINE_ITEMS_META_CACHE.set(lineItems, meta);
  return meta;
}

const SearchableLineItemSelectInner: React.FC<SearchableLineItemSelectProps> = ({
  lineItems,
  selectedItemId,
  onSelectItem,
  rawText,
  onChangeRawText,
  isInvalid = false,
  isDuplicate = false,
  placeholder = 'Enter line item...',
  className = '',
  placement = 'auto',
  usePortal = false,
  compact = false,
  onOpenStateChange,
  onSelectAndNext,
  inputRef: externalInputRef,
  id,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState<number>(0);
  const [computedPlacement, setComputedPlacement] = useState<'top' | 'bottom'>('bottom');
  const [portalCoords, setPortalCoords] = useState<{
    top: number;
    left: number;
    width: number;
    maxHeight: number;
  } | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const internalInputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const itemButtonRefs = useRef<{ [key: number]: HTMLButtonElement | null }>({});
  const isClearingRef = useRef(false);
  const lastHighlightSourceRef = useRef<'keyboard' | 'mouse'>('keyboard');
  const onOpenStateChangeRef = useRef(onOpenStateChange);
  onOpenStateChangeRef.current = onOpenStateChange;
  const isOpenRef = useRef(isOpen);
  isOpenRef.current = isOpen;

  const { byId: itemsById, duplicateNormalizedNames } = useMemo(
    () => getLineItemsLookupMeta(lineItems),
    [lineItems]
  );

  const selectedItem = useMemo(() => {
    return selectedItemId ? itemsById.get(selectedItemId) : undefined;
  }, [itemsById, selectedItemId]);

  const updateIsOpen = useCallback((nextState: boolean) => {
    if (isOpenRef.current === nextState) return;
    isOpenRef.current = nextState;
    setIsOpen(nextState);
    onOpenStateChangeRef.current?.(nextState);
  }, []);

  // Clear stale internal search query whenever the dropdown is closed or selection changes externally
  useEffect(() => {
    if (!isOpen) {
      setSearchQuery('');
    }
  }, [selectedItemId, isOpen]);

  // Close dropdown on outside click (only attach listener while open!)
  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        containerRef.current &&
        !containerRef.current.contains(target) &&
        (!dropdownRef.current || !dropdownRef.current.contains(target))
      ) {
        updateIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, updateIsOpen]);

  const updatePosition = useCallback(() => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;

    let nextPlacement: 'top' | 'bottom' = 'bottom';
    if (placement === 'top') {
      nextPlacement = rect.top < 140 && spaceBelow > 260 ? 'bottom' : 'top';
    } else if (placement === 'bottom') {
      nextPlacement = 'bottom';
    } else {
      nextPlacement = spaceBelow < 270 && spaceAbove > spaceBelow ? 'top' : 'bottom';
    }
    setComputedPlacement(nextPlacement);

    if (usePortal) {
      const menuWidth = Math.min(Math.max(rect.width, 420), Math.min(window.innerWidth * 0.92, 580));
      const clampedLeft = Math.max(
        12,
        Math.min(rect.left, window.innerWidth - menuWidth - 12)
      );
      const maxH = Math.min(
        448,
        Math.max(200, (nextPlacement === 'top' ? spaceAbove : spaceBelow) - 16)
      );
      setPortalCoords({
        top: nextPlacement === 'top' ? rect.top - 8 : rect.bottom + 8,
        left: clampedLeft,
        width: menuWidth,
        maxHeight: maxH,
      });
    }
  }, [placement, usePortal]);

  // Compute placement (top vs bottom) and portal coordinates
  useEffect(() => {
    if (!isOpen) return;
    updatePosition();
    if (!usePortal) return;

    const handleReposition = () => updatePosition();
    window.addEventListener('resize', handleReposition);
    window.addEventListener('scroll', handleReposition, true);
    return () => {
      window.removeEventListener('resize', handleReposition);
      window.removeEventListener('scroll', handleReposition, true);
    };
  }, [isOpen, usePortal, updatePosition]);

  // Filter & rank items using forgiving non-alphanumeric matching (only when dropdown is open)
  const filteredItems = useMemo(() => {
    if (!isOpen) return EMPTY_LINE_ITEMS;
    const q = searchQuery.trim();
    if (!q) return lineItems;

    const scoredItems: { item: LineItemDefinition; score: number }[] = [];

    lineItems.forEach((item) => {
      const { matched, score } = matchLineItemForgiving(item, q);
      if (matched) {
        scoredItems.push({ item, score });
      }
    });

    scoredItems.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const cmp = a.item.name.localeCompare(b.item.name);
      if (cmp !== 0) return cmp;
      const aNonOp = a.item.section === 'NON_OPERATING' ? 0 : 1;
      const bNonOp = b.item.section === 'NON_OPERATING' ? 0 : 1;
      if (aNonOp !== bNonOp) return aNonOp - bNonOp;
      return a.item.order - b.item.order;
    });

    return scoredItems.map((s) => s.item);
  }, [isOpen, lineItems, searchQuery]);

  // Map each item ID to its flat index for keyboard highlighting
  const itemIndexMap = useMemo(() => {
    if (!isOpen) return EMPTY_INDEX_MAP;
    const map = new Map<string, number>();
    filteredItems.forEach((item, idx) => {
      map.set(item.id, idx);
    });
    return map;
  }, [isOpen, filteredItems]);

  // Reset highlighted index when filtered items change
  useEffect(() => {
    if (!isOpen) return;
    lastHighlightSourceRef.current = 'keyboard';
    if (filteredItems.length > 0) {
      if (selectedItemId && itemIndexMap.has(selectedItemId)) {
        setHighlightedIndex(itemIndexMap.get(selectedItemId)!);
      } else {
        setHighlightedIndex(0);
      }
    } else {
      setHighlightedIndex(-1);
    }
  }, [isOpen, filteredItems, selectedItemId, itemIndexMap]);

  // Group filtered items by subsection & group
  const groupedItems = useMemo(() => {
    if (!isOpen) return EMPTY_GROUPED_ITEMS;
    const groups: { [key: string]: LineItemDefinition[] } = {};
    filteredItems.forEach((item) => {
      const key = `${item.subsection} · ${item.group}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(item);
    });
    return groups;
  }, [isOpen, filteredItems]);

  const activePreviewItem = useMemo(() => {
    if (!isOpen) return null;
    if (highlightedIndex >= 0 && highlightedIndex < filteredItems.length) {
      return filteredItems[highlightedIndex];
    }
    return null;
  }, [isOpen, filteredItems, highlightedIndex]);

  // Scroll highlighted item into view only for keyboard navigation or initial open (never yank on mouse hover)
  useEffect(() => {
    if (
      lastHighlightSourceRef.current === 'keyboard' &&
      isOpen &&
      highlightedIndex >= 0 &&
      itemButtonRefs.current[highlightedIndex]
    ) {
      itemButtonRefs.current[highlightedIndex]?.scrollIntoView({
        block: 'nearest',
      });
    }
  }, [highlightedIndex, isOpen]);

  const handleSelect = (itemId: string, triggerNext = false) => {
    const chosen = lineItems.find((i) => i.id === itemId);
    onSelectItem(itemId, chosen?.name);
    onChangeRawText?.(chosen ? chosen.name : '');
    setSearchQuery('');
    updateIsOpen(false);

    if (triggerNext && onSelectAndNext) {
      setTimeout(() => {
        onSelectAndNext();
      }, 20);
    }
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    isClearingRef.current = true;
    onSelectItem('', '');
    onChangeRawText?.('');
    setSearchQuery('');
    if (internalInputRef.current) {
      internalInputRef.current.focus();
    }
    isClearingRef.current = false;
  };

  // Keyboard Navigation Handler (ArrowUp, ArrowDown, Tab, Enter)
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Pass Shift + Enter through so the form can handle "Save all entries"
    if (e.key === 'Enter' && e.shiftKey) {
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      lastHighlightSourceRef.current = 'keyboard';
      if (!isOpen) {
        updateIsOpen(true);
        setHighlightedIndex(0);
      } else if (filteredItems.length > 0) {
        setHighlightedIndex((prev) => (prev < filteredItems.length - 1 ? prev + 1 : 0));
      }
      return;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      lastHighlightSourceRef.current = 'keyboard';
      if (!isOpen) {
        updateIsOpen(true);
        setHighlightedIndex(filteredItems.length - 1);
      } else if (filteredItems.length > 0) {
        setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : filteredItems.length - 1));
      }
      return;
    }

    // Tab or Enter:
    if (e.key === 'Enter' || e.key === 'Tab') {
      // 1. If dropdown is open and user actively typed a search query matching item:
      if (
        isOpen &&
        filteredItems.length > 0 &&
        highlightedIndex >= 0 &&
        highlightedIndex < filteredItems.length &&
        searchQuery.trim() !== ''
      ) {
        e.preventDefault();
        const chosenItem = filteredItems[highlightedIndex];
        handleSelect(chosenItem.id, true);
        return;
      }

      // 2. If already selected a valid item:
      if (selectedItem) {
        if (e.key === 'Enter') {
          e.preventDefault();
          onSelectAndNext?.();
          return;
        }
        if (e.key === 'Tab' && !e.shiftKey) {
          e.preventDefault();
          onSelectAndNext?.();
          return;
        }
      }

      // 3. Free typing of unlisted or custom item:
      // Allow user to advance to amount freely without blocking dialogs!
      if (e.key === 'Enter') {
        e.preventDefault();
        updateIsOpen(false);
        onSelectAndNext?.();
        return;
      }
      if (e.key === 'Tab') {
        updateIsOpen(false);
      }
    }

    if (e.key === 'Escape') {
      e.preventDefault();
      updateIsOpen(false);
      return;
    }
  };

  // Assign ref to both internal and external callers
  const setInputRef = (element: HTMLInputElement | null) => {
    internalInputRef.current = element;
    if (typeof externalInputRef === 'function') {
      externalInputRef(element);
    } else if (externalInputRef) {
      (externalInputRef as React.MutableRefObject<HTMLInputElement | null>).current = element;
    }
  };

  // Determine current display value:
  // If dropdown open, show typed search query.
  // Otherwise show selected item name or user raw text.
  const displayValue = isOpen
    ? searchQuery
    : selectedItem
    ? selectedItem.name
    : rawText !== undefined
    ? rawText
    : searchQuery;

  const inputHoverTitle = selectedItem
    ? `${selectedItem.uacs ? `[UACS ${selectedItem.uacs}] ` : ''}${selectedItem.name} (${selectedItem.subsection} › ${selectedItem.group}${
        selectedItem.subgroup ? ` › ${selectedItem.subgroup}` : ''
      })`
    : displayValue || undefined;

  return (
    <div
      ref={containerRef}
      className={`relative ${isOpen ? 'z-[90]' : 'z-auto'} ${className}`}
    >
      {/* Search Input Box - Highlighted red if written item is not in the database */}
      <div
        onClick={() => {
          updateIsOpen(true);
          internalInputRef.current?.focus();
        }}
        className={`w-full flex items-center transition-all cursor-text ${
          compact ? 'gap-2 px-3 py-2 text-sm sm:text-base rounded-xl min-h-[42px]' : 'gap-3 px-4 py-2.5 text-base rounded-xl min-h-[52px]'
        } ${
          isInvalid
            ? 'bg-red-50/90 dark:bg-red-950/50 border-2 border-red-500 dark:border-red-500 ring-2 ring-red-500/25'
            : isDuplicate
            ? 'bg-amber-50/85 dark:bg-amber-950/40 border-2 border-amber-500 dark:border-amber-400 ring-2 ring-amber-500/25'
            : isOpen
            ? 'bg-th-input border-2 border-th-accent ring-2 ring-th-accent/20 shadow-xs'
            : selectedItem
            ? 'bg-th-input border-2 border-th-border-strong hover:border-th-accent shadow-xs'
            : 'bg-th-input border-2 border-th-border-strong hover:border-th-accent/60 shadow-xs'
        }`}
      >
        <Search
          className={`${compact ? 'w-4 h-4' : 'w-5 h-5'} shrink-0 ${
            isInvalid
              ? 'text-red-600 dark:text-red-400'
              : isDuplicate
              ? 'text-amber-600 dark:text-amber-400'
              : 'text-th-muted'
          }`}
        />

        {/* Input is always mounted to support seamless tabbing and keyboard flow */}
        <input
          id={id}
          ref={setInputRef}
          type="text"
          value={displayValue}
          onChange={(e) => {
            const val = e.target.value;
            setSearchQuery(val);
            onChangeRawText?.(val);
            updateIsOpen(true);

            // Check if user typed an exact match to a database item
            const valTrimmed = val.toLowerCase().trim();
            const exactMatches = valTrimmed
              ? lineItems.filter((i) => i.name.toLowerCase().trim() === valTrimmed)
              : [];
            if (exactMatches.length === 1) {
              onSelectItem(exactMatches[0].id, exactMatches[0].name);
            } else if (exactMatches.length > 1) {
              if (selectedItemId && !exactMatches.some((m) => m.id === selectedItemId)) {
                onSelectItem('');
              }
            } else if (selectedItemId) {
              onSelectItem('');
            }
          }}
          onFocus={(e) => {
            updateIsOpen(true);
            if (isClearingRef.current) {
              isClearingRef.current = false;
              return;
            }
            if (!searchQuery && (selectedItem?.name || rawText)) {
              setSearchQuery(selectedItem ? selectedItem.name : (rawText || ''));
            }
            e.target.select();
          }}
          onBlur={(e) => {
            const related = e.relatedTarget as Node | null;
            if (
              containerRef.current?.contains(related) ||
              dropdownRef.current?.contains(related)
            ) {
              return;
            }
            if (searchQuery.trim() && !selectedItem) {
              onChangeRawText?.(searchQuery.trim());
            }
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          title={inputHoverTitle}
          className={`flex-1 bg-transparent border-none outline-hidden min-w-0 font-bold ${
            compact ? 'text-sm sm:text-base' : 'text-base'
          } ${
            isInvalid
              ? 'text-red-950 dark:text-red-100 placeholder:text-red-500 dark:placeholder:text-red-400'
              : 'text-th-text placeholder:text-th-muted'
          }`}
        />

        {/* Selected Badges & Controls */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Highlight Red Warning Badge when written item is not in database */}
          {isInvalid && (
            <span
              className="text-xs font-bold text-red-800 dark:text-red-300 bg-red-100 dark:bg-red-900/60 px-2.5 py-1 rounded-md border border-red-300 dark:border-red-800 flex items-center gap-1.5 shrink-0"
              title="This written line item does not exist in the official line items database"
            >
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
              <span>Not in database</span>
            </span>
          )}

          {selectedItem && duplicateNormalizedNames.has(normalizeAlphanumeric(selectedItem.name)) && (
            <span
              className="text-[11px] font-bold text-th-accent-text bg-th-subtle px-2 py-0.5 rounded-md border border-th-border-strong truncate max-w-[150px]"
              title={[selectedItem.subsection, selectedItem.group, selectedItem.subgroup]
                .filter((p): p is string => Boolean(p))
                .filter((p, idx, arr) => idx === 0 || p.toLowerCase() !== arr[idx - 1]?.toLowerCase())
                .join(' → ')}
            >
              {selectedItem.subgroup || selectedItem.group || selectedItem.subsection}
            </span>
          )}

          {selectedItem?.uacs && (
            <span className="text-[11px] font-mono font-bold text-th-accent-text bg-th-subtle px-2 py-0.5 rounded-md border border-th-border-strong shrink-0">
              {selectedItem.uacs}
            </span>
          )}

          {selectedItem?.isContra && (
            <span className="text-xs text-th-text bg-th-subtle px-2 py-0.5 rounded-md font-bold border border-th-border-strong">
              Contra
            </span>
          )}

          {(selectedItem || rawText || searchQuery) && (
            <button
              type="button"
              onClick={handleClear}
              className="text-th-muted hover:text-th-text min-w-[36px] min-h-[36px] flex items-center justify-center rounded-lg hover:bg-th-subtle cursor-pointer"
              title="Clear line item"
              aria-label="Clear line item"
            >
              <X className="w-5 h-5" />
            </button>
          )}

          {isOpen && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setComputedPlacement((prev) => (prev === 'top' ? 'bottom' : 'top'));
              }}
              title={
                computedPlacement === 'top'
                  ? 'Switch dropdown to open downward'
                  : 'Switch dropdown to open upward (on top)'
              }
              aria-label={
                computedPlacement === 'top'
                  ? 'Switch dropdown to open downward'
                  : 'Switch dropdown to open upward'
              }
              className="text-xs text-th-text hover:text-th-accent-text min-w-[36px] min-h-[36px] flex items-center justify-center rounded-lg border border-th-border-strong hover:bg-th-subtle cursor-pointer font-bold"
            >
              {computedPlacement === 'top' ? (
                <ArrowUp className="w-4 h-4" />
              ) : (
                <ArrowDown className="w-4 h-4" />
              )}
            </button>
          )}

          <ChevronDown
            className={`w-5 h-5 text-th-muted shrink-0 transition-transform ${
              isOpen ? 'rotate-180 text-th-accent-text' : ''
            }`}
          />
        </div>
      </div>

      {/* Dropdown Menu - Navigable with Up/Down Arrow Keys and Selectable with Tab/Enter */}
      {isOpen && (() => {
        const dropdownContent = (
          <div
            ref={dropdownRef}
            style={
              usePortal && portalCoords
                ? {
                    position: 'fixed',
                    top: portalCoords.top,
                    left: portalCoords.left,
                    width: portalCoords.width,
                    maxHeight: portalCoords.maxHeight,
                    transform: computedPlacement === 'top' ? 'translateY(-100%)' : undefined,
                  }
                : undefined
            }
            className={`${
              usePortal
                ? 'z-[140]'
                : `absolute z-[100] left-0 min-w-full sm:min-w-[420px] max-w-[min(92vw,580px)] max-h-[28rem] ${
                    computedPlacement === 'top' ? 'bottom-full mb-2' : 'top-full mt-2'
                  }`
            } flex flex-col overflow-hidden bg-th-surface border-2 border-th-border-strong rounded-2xl shadow-2xl animate-in fade-in zoom-in-95 duration-100`}
          >
            {/* Non-scrolling Header Info & Helper Bar */}
            <div className="px-3.5 py-2.5 bg-th-table-head text-sm font-semibold text-th-table-head-fg border-b border-th-border flex items-center justify-between gap-2 shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                {searchQuery ? (
                  <span className="truncate">
                    Matches for: <strong className="underline font-bold">&quot;{searchQuery}&quot;</strong>
                  </span>
                ) : (
                  <span className="font-bold truncate">
                    Official Line Items Database
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2 text-xs font-bold text-th-table-head-fg shrink-0">
                <span className="hidden sm:inline">Use ↑ ↓ then Tab / Enter to select</span>
                <span className="bg-white/15 px-2 py-0.5 rounded-md border border-white/25">({filteredItems.length})</span>
              </div>
            </div>

            {/* Scrollable Options List */}
            <div ref={listRef} className="flex-1 overflow-y-auto divide-y divide-th-border">
              {filteredItems.length === 0 ? (
                <div className="p-6 text-center text-base text-th-muted space-y-1.5">
                  <div className="font-semibold">No official line item found matching &quot;{searchQuery}&quot;.</div>
                  <div className="text-sm font-bold text-th-muted">
                    Accounts not in the database will be highlighted in red.
                  </div>
                </div>
              ) : (
                Object.entries(groupedItems).map(([groupTitle, items]) => (
                  <div key={groupTitle} className="p-2.5">
                    <div className="px-3.5 py-2 text-xs font-bold uppercase tracking-wider text-th-text bg-th-subtle rounded-lg">
                      {groupTitle}
                    </div>
                    <div className="mt-1.5 space-y-1">
                      {items.map((item) => {
                        const isSelected = selectedItemId === item.id;
                        const itemIndex = itemIndexMap.get(item.id) ?? -1;
                        const isHighlighted = highlightedIndex === itemIndex;
                        const optionTitle = `${item.uacs ? `[UACS ${item.uacs}] ` : ''}${item.name}\n${item.subsection} › ${item.group}${
                          item.subgroup ? ` › ${item.subgroup}` : ''
                        }${item.isContra ? ' [Contra]' : ''}`;

                        return (
                          <button
                            key={item.id}
                            ref={(el) => {
                              if (itemIndex >= 0) {
                                itemButtonRefs.current[itemIndex] = el;
                              }
                            }}
                            type="button"
                            title={optionTitle}
                            onMouseEnter={() => {
                              if (itemIndex >= 0) {
                                lastHighlightSourceRef.current = 'mouse';
                                setHighlightedIndex(itemIndex);
                              }
                            }}
                            onClick={() => handleSelect(item.id, true)}
                            className={`w-full text-left px-4 py-3 rounded-xl text-base font-semibold flex items-start justify-between gap-2.5 transition-colors cursor-pointer ${
                              isHighlighted
                                ? 'bg-th-subtle text-th-text ring-2 ring-th-border-strong'
                                : isSelected
                                ? 'bg-th-subtle text-th-text'
                                : 'text-th-text hover:bg-th-subtle'
                            }`}
                          >
                            <div className="min-w-0 flex-1 flex items-start gap-2">
                              <CornerDownLeft
                                className={`w-4 h-4 text-th-text shrink-0 mt-1 transition-opacity ${
                                  isHighlighted ? 'opacity-100' : 'opacity-0'
                                }`}
                                aria-hidden="true"
                              />
                              <div className="min-w-0 flex-1">
                                <div className="whitespace-normal break-words leading-snug">
                                  {item.name}
                                </div>
                                {(() => {
                                  const isSharedName = duplicateNormalizedNames.has(
                                    normalizeAlphanumeric(item.name)
                                  );
                                  if (!isSharedName && !item.subgroup) return null;
                                  const hierarchyParts = [
                                    item.subsection,
                                    item.group,
                                    item.subgroup,
                                  ]
                                    .filter((part): part is string => Boolean(part))
                                    .filter(
                                      (part, idx, arr) =>
                                        idx === 0 || part.toLowerCase() !== arr[idx - 1]?.toLowerCase()
                                    );
                                  return (
                                    <div className="text-xs sm:text-sm font-medium text-th-muted mt-0.5 whitespace-normal break-words leading-snug">
                                      {isSharedName
                                        ? hierarchyParts.join(' › ')
                                        : item.name.toLowerCase() === item.subgroup!.toLowerCase() ||
                                          item.name.toLowerCase() === item.group.toLowerCase()
                                        ? `Individual Line Item · ${item.group}`
                                        : item.subgroup}
                                    </div>
                                  );
                                })()}
                              </div>
                            </div>

                            <div className="flex items-center gap-2 shrink-0 pt-0.5">
                              {item.uacs && (
                                <span className="text-xs font-mono font-bold text-th-accent-text bg-th-subtle px-2 py-0.5 rounded-md border border-th-border-strong">
                                  {item.uacs}
                                </span>
                              )}
                              {item.isContra && (
                                <span className="text-xs text-th-text bg-th-subtle px-2 py-0.5 rounded-md font-bold border border-th-border-strong">
                                  Contra
                                </span>
                              )}
                              {isSelected && (
                                <Check className="w-5 h-5 text-th-text" />
                              )}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Live Hovered / Highlighted Item Preview Footer (constant height to prevent list wobble on hover) */}
            {activePreviewItem && (
              <div className="px-4 py-3 h-[112px] bg-th-subtle border-t-2 border-th-border-strong shrink-0 flex flex-col justify-center overflow-hidden">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-th-muted">
                    Hovered / Highlighted Item
                    {activePreviewItem.uacs ? ` · UACS ${activePreviewItem.uacs}` : ''}
                  </span>
                  {activePreviewItem.isContra && (
                    <span className="text-xs font-bold px-2 py-0.5 rounded bg-th-surface border border-th-border-strong text-th-text">
                      Contra Account
                    </span>
                  )}
                </div>
                <div className="text-base font-bold text-th-text leading-snug line-clamp-2 mt-0.5">
                  {activePreviewItem.name}
                </div>
                <div className="text-xs sm:text-sm font-medium text-th-muted leading-snug line-clamp-1 mt-0.5">
                  {activePreviewItem.subsection} › {activePreviewItem.group}
                  {activePreviewItem.subgroup ? ` › ${activePreviewItem.subgroup}` : ''}
                </div>
              </div>
            )}
          </div>
        );

        return usePortal && typeof document !== 'undefined'
          ? createPortal(dropdownContent, document.body)
          : dropdownContent;
      })()}
    </div>
  );
};

export const SearchableLineItemSelect = React.memo(SearchableLineItemSelectInner);
