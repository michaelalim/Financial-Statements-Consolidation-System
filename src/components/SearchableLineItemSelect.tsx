import React, { useState, useRef, useEffect, useMemo } from 'react';
import { LineItemDefinition } from '../types/fs';
import { Search, ChevronDown, X, Check, ArrowUp, ArrowDown, CornerDownLeft, AlertCircle } from 'lucide-react';

export interface SearchableLineItemSelectProps {
  lineItems: LineItemDefinition[];
  selectedItemId: string;
  onSelectItem: (itemId: string, itemName?: string) => void;
  rawText?: string;
  onChangeRawText?: (text: string) => void;
  isInvalid?: boolean;
  placeholder?: string;
  className?: string;
  placement?: 'auto' | 'bottom' | 'top';
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

  // 5. All query tokens exist inside the item's name
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

export const SearchableLineItemSelect: React.FC<SearchableLineItemSelectProps> = ({
  lineItems,
  selectedItemId,
  onSelectItem,
  rawText,
  onChangeRawText,
  isInvalid = false,
  placeholder = 'Enter line item...',
  className = '',
  placement = 'auto',
  onOpenStateChange,
  onSelectAndNext,
  inputRef: externalInputRef,
  id,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState<number>(0);
  const [computedPlacement, setComputedPlacement] = useState<'top' | 'bottom'>('bottom');

  const containerRef = useRef<HTMLDivElement>(null);
  const internalInputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const itemButtonRefs = useRef<{ [key: number]: HTMLButtonElement | null }>({});

  const selectedItem = useMemo(() => {
    return lineItems.find((i) => i.id === selectedItemId);
  }, [lineItems, selectedItemId]);

  const updateIsOpen = (nextState: boolean) => {
    setIsOpen(nextState);
    if (onOpenStateChange) {
      onOpenStateChange(nextState);
    }
  };

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        updateIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Compute placement (top vs bottom) based on viewport and requested placement
  useEffect(() => {
    if (!isOpen) return;

    if (placement === 'top') {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        if (rect.top < 140 && window.innerHeight - rect.bottom > 260) {
          setComputedPlacement('bottom');
          return;
        }
      }
      setComputedPlacement('top');
      return;
    }
    if (placement === 'bottom') {
      setComputedPlacement('bottom');
      return;
    }

    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;

      if (spaceBelow < 270 && spaceAbove > spaceBelow) {
        setComputedPlacement('top');
      } else {
        setComputedPlacement('bottom');
      }
    }
  }, [isOpen, placement]);

  // Filter & rank items using forgiving non-alphanumeric matching
  const filteredItems = useMemo(() => {
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
      return a.item.name.localeCompare(b.item.name);
    });

    return scoredItems.map((s) => s.item);
  }, [lineItems, searchQuery]);

  // Map each item ID to its flat index for keyboard highlighting
  const itemIndexMap = useMemo(() => {
    const map = new Map<string, number>();
    filteredItems.forEach((item, idx) => {
      map.set(item.id, idx);
    });
    return map;
  }, [filteredItems]);

  // Reset highlighted index when filtered items change
  useEffect(() => {
    if (filteredItems.length > 0) {
      if (selectedItemId && itemIndexMap.has(selectedItemId)) {
        setHighlightedIndex(itemIndexMap.get(selectedItemId)!);
      } else {
        setHighlightedIndex(0);
      }
    } else {
      setHighlightedIndex(-1);
    }
  }, [filteredItems, selectedItemId, itemIndexMap]);

  // Group filtered items by subsection & group
  const groupedItems = useMemo(() => {
    const groups: { [key: string]: LineItemDefinition[] } = {};
    filteredItems.forEach((item) => {
      const key = `${item.subsection} · ${item.group}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(item);
    });
    return groups;
  }, [filteredItems]);

  // Scroll highlighted item into view
  useEffect(() => {
    if (isOpen && highlightedIndex >= 0 && itemButtonRefs.current[highlightedIndex]) {
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
    onSelectItem('', '');
    onChangeRawText?.('');
    setSearchQuery('');
    if (internalInputRef.current) {
      internalInputRef.current.focus();
    }
  };

  // Keyboard Navigation Handler (ArrowUp, ArrowDown, Tab, Enter)
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Pass Shift + Enter through so the form can handle "Save all entries"
    if (e.key === 'Enter' && e.shiftKey) {
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
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
        className={`w-full flex items-center gap-3 px-4 py-3 text-base rounded-xl transition-all cursor-text min-h-[46px] ${
          isInvalid
            ? 'bg-red-50/90 dark:bg-red-950/50 border-2 border-red-500 dark:border-red-500 ring-2 ring-red-500/25'
            : isOpen
            ? 'bg-white dark:bg-slate-800 border-2 border-[#0072ce] ring-2 ring-[#0072ce]/20 shadow-xs'
            : selectedItem
            ? 'bg-white dark:bg-slate-800 border-2 border-slate-300 dark:border-slate-700 hover:border-[#0072ce] dark:hover:border-[#38bdf8] shadow-xs'
            : 'bg-white dark:bg-slate-800 border-2 border-slate-300 dark:border-slate-700 hover:border-slate-400 dark:hover:border-slate-600 shadow-xs'
        }`}
      >
        <Search
          className={`w-5 h-5 shrink-0 ${
            isInvalid
              ? 'text-red-600 dark:text-red-400'
              : 'text-slate-400 dark:text-slate-400'
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
            const exact = lineItems.find(
              (i) => i.name.toLowerCase().trim() === val.toLowerCase().trim()
            );
            if (exact) {
              onSelectItem(exact.id, exact.name);
            } else if (selectedItemId) {
              onSelectItem('');
            }
          }}
          onFocus={(e) => {
            updateIsOpen(true);
            if (!searchQuery && (selectedItem?.name || rawText)) {
              setSearchQuery(selectedItem ? selectedItem.name : (rawText || ''));
            }
            e.target.select();
          }}
          onBlur={(e) => {
            if (containerRef.current?.contains(e.relatedTarget as Node)) {
              return;
            }
            if (searchQuery.trim() && !selectedItem) {
              onChangeRawText?.(searchQuery.trim());
            }
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className={`flex-1 bg-transparent border-none outline-hidden text-base min-w-0 font-bold ${
            isInvalid
              ? 'text-red-950 dark:text-red-100 placeholder:text-red-400 dark:placeholder:text-red-400'
              : 'text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500'
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

          {selectedItem?.isContra && (
            <span className="text-xs text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-md font-bold border border-slate-300 dark:border-slate-700">
              Contra
            </span>
          )}

          {(selectedItem || rawText || searchQuery) && (
            <button
              type="button"
              onClick={handleClear}
              className="text-slate-400 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 p-1.5 rounded-md cursor-pointer"
              title="Clear line item"
            >
              <X className="w-4 h-4" />
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
              className="text-xs text-slate-600 hover:text-[#0072ce] dark:hover:text-[#38bdf8] px-2 py-1 rounded-md border border-slate-300 dark:border-slate-700 cursor-pointer font-bold"
            >
              {computedPlacement === 'top' ? (
                <ArrowUp className="w-4 h-4" />
              ) : (
                <ArrowDown className="w-4 h-4" />
              )}
            </button>
          )}

          <ChevronDown
            className={`w-5 h-5 text-slate-400 shrink-0 transition-transform ${
              isOpen ? 'rotate-180 text-[#0072ce] dark:text-[#38bdf8]' : ''
            }`}
          />
        </div>
      </div>

      {/* Dropdown Menu - Navigable with Up/Down Arrow Keys and Selectable with Tab/Enter */}
      {isOpen && (
        <div
          ref={listRef}
          className={`absolute z-[100] left-0 right-0 max-h-84 overflow-y-auto bg-white dark:bg-slate-900 border-2 border-slate-300 dark:border-slate-700 rounded-2xl shadow-2xl divide-y divide-slate-200 dark:divide-slate-800 animate-in fade-in zoom-in-95 duration-100 ${
            computedPlacement === 'top' ? 'bottom-full mb-2' : 'top-full mt-2'
          }`}
        >
          {/* Header Info & Helper Bar */}
          <div className="p-3 bg-[#f0f5fa] dark:bg-[#0a274c] text-sm font-semibold text-[#0a3461] dark:text-[#93c5fd] border-b-2 border-slate-200 dark:border-slate-700 flex items-center justify-between sticky top-0 backdrop-blur-xs z-10">
            <div className="flex items-center gap-2">
              {searchQuery ? (
                <span>
                  Matches for: <strong className="text-slate-900 dark:text-white font-bold">"{searchQuery}"</strong>
                </span>
              ) : (
                <span className="font-bold">
                  Official Line Items Database
                </span>
              )}
            </div>

            <div className="flex items-center gap-2 text-xs font-bold text-slate-600 dark:text-slate-400">
              <span className="hidden sm:inline">Use ↑ ↓ then Tab / Enter to select</span>
              <span className="bg-white/80 dark:bg-slate-800/80 px-2 py-0.5 rounded-md border border-slate-300 dark:border-slate-700">({filteredItems.length})</span>
            </div>
          </div>

          {filteredItems.length === 0 ? (
            <div className="p-6 text-center text-base text-slate-600 dark:text-slate-400 space-y-1.5">
              <div className="font-semibold">No official line item found matching "{searchQuery}".</div>
              <div className="text-sm font-bold text-slate-500 dark:text-slate-400">
                Accounts not in the database will be highlighted in red.
              </div>
            </div>
          ) : (
            Object.entries(groupedItems).map(([groupTitle, items]) => (
              <div key={groupTitle} className="p-2.5">
                <div className="px-3.5 py-2 text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 rounded-lg">
                  {groupTitle}
                </div>
                <div className="mt-1.5 space-y-1">
                  {items.map((item) => {
                    const isSelected = selectedItemId === item.id;
                    const itemIndex = itemIndexMap.get(item.id) ?? -1;
                    const isHighlighted = highlightedIndex === itemIndex;

                    return (
                      <button
                        key={item.id}
                        ref={(el) => {
                          if (itemIndex >= 0) {
                            itemButtonRefs.current[itemIndex] = el;
                          }
                        }}
                        type="button"
                        onMouseEnter={() => {
                          if (itemIndex >= 0) {
                            setHighlightedIndex(itemIndex);
                          }
                        }}
                        onClick={() => handleSelect(item.id, true)}
                        className={`w-full text-left px-3.5 py-2.5 rounded-xl text-base flex items-center justify-between transition-colors cursor-pointer ${
                          isHighlighted
                            ? 'bg-[#edf4fb] dark:bg-[#0a3461]/60 text-[#0a3461] dark:text-white font-bold ring-2 ring-[#0072ce]/40'
                            : isSelected
                            ? 'bg-[#f0f5fa] dark:bg-[#0a3461]/40 text-[#0072ce] dark:text-[#60a5fa] font-bold'
                            : 'text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 font-semibold'
                        }`}
                      >
                        <div className="truncate mr-2 flex items-center gap-2.5">
                          {isHighlighted && (
                            <CornerDownLeft className="w-4 h-4 text-[#0072ce] dark:text-[#38bdf8] shrink-0" />
                          )}
                          <span className="truncate">{item.name}</span>
                          {item.subgroup && (
                            <span className="text-sm font-medium text-slate-500 dark:text-slate-400 ml-1 truncate">
                              ({item.subgroup})
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {item.isContra && (
                            <span className="text-xs text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-md font-bold border border-slate-300 dark:border-slate-700">
                              Contra
                            </span>
                          )}
                          {isSelected && (
                            <Check className="w-5 h-5 text-[#0072ce] dark:text-[#38bdf8]" />
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
      )}
    </div>
  );
};
