import React, { useState, useMemo } from 'react';
import { LineItemDefinition, SubsectionType } from '../types/fs';
import { Plus, Trash2, Search, SlidersHorizontal, RotateCcw } from 'lucide-react';
import { ConfirmModal } from './ConfirmModal';
import { FinancialStatementSidebar, FinancialStatementType } from './FinancialStatementSidebar';

interface LineItemManagerProps {
  lineItems: LineItemDefinition[];
  onAddLineItem: (item: Omit<LineItemDefinition, 'id' | 'order'>) => void;
  onDeleteLineItem: (id: string) => void;
  onResetDefaultItems: () => void;
}

export const LineItemManager: React.FC<LineItemManagerProps> = ({
  lineItems,
  onAddLineItem,
  onDeleteLineItem,
  onResetDefaultItems,
}) => {
  const [selectedStatement, setSelectedStatement] = useState<FinancialStatementType>('position');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSubsectionFilter, setSelectedSubsectionFilter] = useState<string>('all');

  // Form states for adding new line item
  const [name, setName] = useState('');
  const [subsection, setSubsection] = useState<SubsectionType>('Current Assets');
  const [isCustomSubsection, setIsCustomSubsection] = useState(false);
  const [customSubsection, setCustomSubsection] = useState('');
  const [group, setGroup] = useState('Cash and Cash Equivalents');
  const [isCustomGroup, setIsCustomGroup] = useState(false);
  const [customGroup, setCustomGroup] = useState('');
  const [subgroup, setSubgroup] = useState('');
  const [isContra, setIsContra] = useState(false);

  // Confirm modals
  const [isAddConfirmOpen, setIsAddConfirmOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<LineItemDefinition | null>(null);
  const [isResetConfirmOpen, setIsResetConfirmOpen] = useState(false);

  const defaultSubsectionOptions: SubsectionType[] =
    selectedStatement === 'cash_flows'
      ? [
          'Cash Flows from Operating Activities',
          'Cash Flows from Investing Activities',
          'Cash Flows from Financing Activities',
        ]
      : selectedStatement === 'performance'
      ? ['Revenue', 'Current Operating Expenses', 'Transfers, Assistance and Subsidy']
      : selectedStatement === 'net_assets'
      ? ['Changes in Net Assets/Equity']
      : [
          'Current Assets',
          'Non-Current Assets',
          'Current Liabilities',
          'Non-Current Liabilities',
          'Net Assets/Equity',
        ];

  const groupSuggestionsBySubsection: Record<SubsectionType, string[]> = {
    'Current Assets': [
      'Cash and Cash Equivalents',
      'Receivables',
      'Inventories',
      'Other Current Assets',
    ],
    'Revenue': ['Tax Revenue', 'Service and Business Income', 'Shares, Grants and Donations'],
    'Current Operating Expenses': ['Personnel Services', 'Maintenance and Other Operating Expenses', 'Financial Expenses', 'Non-Cash Expenses'],
    'Transfers, Assistance and Subsidy': ['Assistance and Subsidy', 'Transfers'],
    'Cash Flows from Operating Activities': ['Cash Inflows', 'Cash Outflows'],
    'Cash Flows from Investing Activities': ['Cash Inflows', 'Cash Outflows'],
    'Cash Flows from Financing Activities': ['Cash Inflows', 'Cash Outflows'],
    'Changes in Net Assets/Equity': [
      'Balance at Beginning of Period',
      'Adjustments to Beginning Balance',
      'Restated Balance',
      'Changes in Net Assets/Equity for the Calendar Year',
      'Balance at End of Period',
    ],
    'Non-Current Assets': [
      'Property, Plant and Equipment',
      'Heritage Assets',
      'Biological Assets',
      'Intangible Assets',
      'Other Non-Current Assets',
    ],
    'Current Liabilities': [
      'Financial Liabilities',
      'Inter-Agency Payables',
      'Intra-Agency Payables',
      'Trust Liabilities',
      'Other Payables',
    ],
    'Non-Current Liabilities': ['Non-Current Payables'],
    'Net Assets/Equity': ['Government Equity'],
  };

  const statementLineItems = useMemo(() => {
    return lineItems.filter((item) => (item.statementType || 'position') === selectedStatement);
  }, [lineItems, selectedStatement]);

  const subsectionOptions = useMemo(() => {
    const set = new Set<string>(defaultSubsectionOptions);
    statementLineItems.forEach((item) => {
      if (item.subsection) set.add(item.subsection);
    });
    return Array.from(set) as SubsectionType[];
  }, [defaultSubsectionOptions, statementLineItems]);

  const activeSubsection = isCustomSubsection ? customSubsection.trim() : subsection;

  const availableGroups = useMemo(() => {
    const set = new Set<string>(groupSuggestionsBySubsection[activeSubsection] || []);
    statementLineItems.forEach((item) => {
      if (item.subsection === activeSubsection && item.group) {
        set.add(item.group);
      }
    });
    return Array.from(set);
  }, [activeSubsection, statementLineItems]);

  const filteredItems = useMemo(() => {
    return statementLineItems.filter((item) => {
      const matchesSearch =
        item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.group.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (item.subgroup && item.subgroup.toLowerCase().includes(searchQuery.toLowerCase()));
      const matchesFilter =
        selectedSubsectionFilter === 'all' || item.subsection === selectedSubsectionFilter;
      return matchesSearch && matchesFilter;
    });
  }, [statementLineItems, searchQuery, selectedSubsectionFilter]);

  const handleSelectStatement = (stmt: FinancialStatementType) => {
    setSelectedStatement(stmt);
    setSelectedSubsectionFilter('all');
    const defaultSub: SubsectionType =
      stmt === 'cash_flows'
        ? 'Cash Flows from Operating Activities'
        : stmt === 'performance'
        ? 'Revenue'
        : stmt === 'net_assets'
        ? 'Changes in Net Assets/Equity'
        : 'Current Assets';
    setSubsection(defaultSub);
    setIsCustomSubsection(false);
    setCustomSubsection('');
    setGroup(groupSuggestionsBySubsection[defaultSub]?.[0] || 'General');
    setIsCustomGroup(false);
    setCustomGroup('');
  };

  const handleInitiateAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    if (isCustomSubsection && !customSubsection.trim()) return;
    if (isCustomGroup && !customGroup.trim()) return;
    setIsAddConfirmOpen(true);
  };

  const handleConfirmAdd = () => {
    const finalSubsection = (isCustomSubsection ? customSubsection.trim() : subsection) as SubsectionType;
    const finalGroup = (isCustomGroup ? customGroup.trim() : group.trim()) || 'General';

    const section =
      finalSubsection.includes('Operating Activities')
        ? 'CASH_OPERATING'
        : finalSubsection.includes('Investing Activities')
        ? 'CASH_INVESTING'
        : finalSubsection.includes('Financing Activities')
        ? 'CASH_FINANCING'
        : finalSubsection === 'Revenue'
        ? 'REVENUE'
        : finalSubsection === 'Current Operating Expenses'
        ? 'EXPENSES'
        : finalSubsection === 'Transfers, Assistance and Subsidy'
        ? 'TRANSFERS'
        : selectedStatement === 'cash_flows'
        ? 'CASH_FLOWS'
        : selectedStatement === 'performance'
        ? 'REVENUE'
        : selectedStatement === 'net_assets'
        ? 'CHANGES_IN_NET_ASSETS'
        : finalSubsection.includes('Assets')
        ? 'ASSETS'
        : finalSubsection.includes('Liabilities')
        ? 'LIABILITIES'
        : 'EQUITY';

    onAddLineItem({
      name: name.trim(),
      statementType: selectedStatement,
      section,
      subsection: finalSubsection,
      group: finalGroup,
      subgroup: subgroup.trim() || undefined,
      isContra,
      isCustom: true,
    });

    setName('');
    setSubgroup('');
    setIsContra(false);
    setIsCustomSubsection(false);
    setCustomSubsection('');
    setSubsection(finalSubsection);
    setIsCustomGroup(false);
    setCustomGroup('');
    setGroup(finalGroup);
    setIsAddConfirmOpen(false);
  };

  const handleConfirmDelete = () => {
    if (itemToDelete) {
      onDeleteLineItem(itemToDelete.id);
      setItemToDelete(null);
    }
  };

  return (
    <div className="w-full max-w-[1780px] mx-auto px-2 sm:px-4 py-4">
      <div className="flex flex-col lg:flex-row gap-6 items-start">
        <FinancialStatementSidebar
          selectedStatement={selectedStatement}
          onSelectStatement={handleSelectStatement}
        />
        <div className="flex-1 min-w-0 w-full space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-th-text">Line Items Master Catalog</h2>
          <p className="text-sm text-th-muted mt-1 leading-relaxed">
            Official line items benchmarked against DepEd Regional Office VI Final Statement of Financial Position.
          </p>
        </div>
        <button
          onClick={() => setIsResetConfirmOpen(true)}
          className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-bold text-th-text bg-th-surface border border-th-border-strong rounded-lg shadow-2xs hover:bg-th-subtle transition-colors self-start cursor-pointer"
        >
          <RotateCcw className="w-4 h-4 text-th-muted" />
          Reset to Benchmark Line Items
        </button>
      </div>

      {/* Add Line Item Form Card */}
      <div className="bg-th-surface border border-th-border rounded-xl p-6 shadow-xs transition-colors">
        <h3 className="text-lg font-bold text-th-text mb-4 flex items-center gap-2">
          <Plus className="w-5 h-5 text-th-muted" />
          Add Custom Line Item
        </h3>
        <form onSubmit={handleInitiateAdd} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-bold text-th-text mb-1.5">
                Line Item Name *
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Enter line item name"
                className="w-full px-3.5 py-2.5 text-sm bg-th-input border border-th-border-strong rounded-lg text-th-text focus:outline-hidden focus:ring-2 focus:ring-th-accent focus:border-th-accent"
              />
            </div>

            <div>
              <label className="block text-sm font-bold text-th-text mb-1.5">
                Statement Classification *
              </label>
              {isCustomSubsection ? (
                <div className="flex gap-2">
                  <input
                    type="text"
                    required
                    value={customSubsection}
                    onChange={(e) => setCustomSubsection(e.target.value)}
                    placeholder="Enter new classification name"
                    autoFocus
                    className="flex-1 px-3.5 py-2.5 text-sm bg-th-input border border-th-accent text-th-text rounded-lg focus:outline-hidden focus:ring-2 focus:ring-th-accent"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setIsCustomSubsection(false);
                      setCustomSubsection('');
                    }}
                    className="px-3 py-2 text-xs font-medium text-th-text bg-th-subtle hover:bg-th-subtle-hover rounded-lg border border-th-border-strong cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <select
                  value={subsection}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === '__NEW__') {
                      setIsCustomSubsection(true);
                      setCustomSubsection('');
                      setIsCustomGroup(true);
                      setCustomGroup('');
                    } else {
                      setSubsection(val as SubsectionType);
                      const nextGroups = groupSuggestionsBySubsection[val as SubsectionType] || [];
                      setGroup(nextGroups[0] || '');
                      setIsCustomGroup(nextGroups.length === 0);
                      setCustomGroup('');
                    }
                  }}
                  className="w-full px-3.5 py-2.5 text-sm bg-th-input border border-th-border-strong text-th-text rounded-lg focus:outline-hidden focus:ring-2 focus:ring-th-accent focus:border-th-accent"
                >
                  {subsectionOptions.map((sub) => (
                    <option key={sub} value={sub}>
                      {sub}
                    </option>
                  ))}
                  <option value="__NEW__">+ Create New Classification...</option>
                </select>
              )}
            </div>

            <div>
              <label className="block text-sm font-bold text-th-text mb-1.5">
                Account Group *
              </label>
              {isCustomGroup || availableGroups.length === 0 ? (
                <div className="flex gap-2">
                  <input
                    type="text"
                    required
                    value={customGroup}
                    onChange={(e) => setCustomGroup(e.target.value)}
                    placeholder="Enter new account group"
                    className="flex-1 px-3.5 py-2.5 text-sm bg-th-input border border-th-accent text-th-text rounded-lg focus:outline-hidden focus:ring-2 focus:ring-th-accent"
                  />
                  {availableGroups.length > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        setIsCustomGroup(false);
                        setCustomGroup('');
                        setGroup(availableGroups[0]);
                      }}
                      className="px-3 py-2 text-xs font-medium text-th-text bg-th-subtle hover:bg-th-subtle-hover rounded-lg border border-th-border-strong cursor-pointer"
                    >
                      Cancel
                    </button>
                  )}
                </div>
              ) : (
                <select
                  value={availableGroups.includes(group) ? group : availableGroups[0]}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === '__NEW__') {
                      setIsCustomGroup(true);
                      setCustomGroup('');
                    } else {
                      setGroup(val);
                    }
                  }}
                  className="w-full px-3.5 py-2.5 text-sm bg-th-input border border-th-border-strong text-th-text rounded-lg focus:outline-hidden focus:ring-2 focus:ring-th-accent focus:border-th-accent"
                >
                  {availableGroups.map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                  <option value="__NEW__">+ Create New Account Group...</option>
                </select>
              )}
            </div>

            <div>
              <label className="block text-sm font-bold text-th-text mb-1.5">
                Sub-Group (Optional)
              </label>
              <input
                type="text"
                value={subgroup}
                onChange={(e) => setSubgroup(e.target.value)}
                placeholder="Enter sub-group (optional)"
                className="w-full px-3.5 py-2.5 text-sm bg-th-input border border-th-border-strong text-th-text rounded-lg focus:outline-hidden focus:ring-2 focus:ring-th-accent focus:border-th-accent"
              />
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
            <label className="flex items-center gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={isContra}
                onChange={(e) => setIsContra(e.target.checked)}
                className="w-4 h-4 text-th-accent accent-th-accent rounded border-th-border-strong focus:ring-th-accent"
              />
              <span className="text-sm text-th-text font-medium">
                This is a contra-account (e.g. Allowance for Impairment or Accumulated Depreciation)
              </span>
            </label>

            <button
              type="submit"
              disabled={!name.trim()}
              className="inline-flex items-center justify-center gap-2 px-6 py-2.5 text-sm font-semibold text-th-accent-fg bg-th-accent hover:bg-th-accent-hover disabled:opacity-50 disabled:cursor-not-allowed rounded-lg shadow-xs transition-colors self-start sm:self-auto cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              Add Line Item
            </button>
          </div>
        </form>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-th-surface border border-th-border rounded-xl p-4 shadow-xs flex flex-col sm:flex-row items-center gap-3">
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 text-th-muted absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search line items by name or group..."
            className="w-full pl-10 pr-4 py-2.5 text-sm bg-th-input border border-th-border-strong rounded-lg text-th-text focus:outline-hidden focus:ring-2 focus:ring-th-accent focus:border-th-accent"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <SlidersHorizontal className="w-4 h-4 text-th-muted shrink-0" />
          <select
            value={selectedSubsectionFilter}
            onChange={(e) => setSelectedSubsectionFilter(e.target.value)}
            className="w-full sm:w-auto px-3.5 py-2.5 text-sm font-semibold bg-th-input border border-th-border-strong text-th-text rounded-lg focus:outline-hidden focus:ring-2 focus:ring-th-accent"
          >
            <option value="all">All Classifications ({statementLineItems.length})</option>
            {subsectionOptions.map((sub) => (
              <option key={sub} value={sub}>
                {sub}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Items List Table */}
      <div className="bg-th-surface border border-th-border rounded-xl overflow-hidden shadow-xs">
        <div className="px-6 py-3.5 border-b border-th-border bg-th-table-head flex items-center justify-between text-xs font-bold text-th-table-head-fg uppercase tracking-wider">
          <span>Account Title / Line Item</span>
          <span>Classification &amp; Group</span>
        </div>

        <div className="divide-y divide-th-border max-h-[600px] overflow-y-auto">
          {filteredItems.length === 0 ? (
            <div className="p-8 text-center text-sm text-th-muted">
              No line items match your search.
            </div>
          ) : (
            filteredItems.map((item) => (
              <div
                key={item.id}
                className="px-6 py-3.5 flex items-center justify-between hover:bg-th-subtle transition-colors text-sm"
              >
                <div className="pr-4">
                  <div className="font-medium text-th-text flex items-center gap-2">
                    <span className="text-base font-semibold">{item.name}</span>
                    {item.isContra && (
                      <span className="text-xs text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 px-2 py-0.5 rounded font-semibold">
                        Contra Account
                      </span>
                    )}
                    {item.isCustom && (
                      <span className="text-xs text-th-text bg-th-subtle border border-th-border-strong px-2 py-0.5 rounded font-semibold">
                        Custom
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-th-muted mt-0.5">
                    {item.group} {item.subgroup ? `· ${item.subgroup}` : ''}
                  </div>
                </div>

                <div className="flex items-center gap-4 shrink-0">
                  <span className="text-xs text-th-muted hidden sm:inline">
                    {item.subsection}
                  </span>
                  <button
                    type="button"
                    onClick={() => setItemToDelete(item)}
                    className="p-1.5 text-th-muted hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-md transition-colors cursor-pointer"
                    title={`Delete line item: ${item.name}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Confirmation Modal for Adding Line Item */}
      <ConfirmModal
        isOpen={isAddConfirmOpen}
        title="Add New Line Item?"
        message={`Are you sure you want to add "${name.trim()}" under "${group.trim()}" (${subsection})? It will appear in line item selection dropdowns and on financial statements.`}
        confirmLabel="Yes, Add Item"
        cancelLabel="Cancel"
        variant="primary"
        onConfirm={handleConfirmAdd}
        onCancel={() => setIsAddConfirmOpen(false)}
      />

      {/* Confirmation Modal for Removing Line Item */}
      <ConfirmModal
        isOpen={itemToDelete !== null}
        title="Remove Line Item?"
        message={`Are you sure you want to remove "${itemToDelete?.name}"? It will no longer be available in the line item dropdown choices.`}
        confirmLabel="Yes, Remove Item"
        cancelLabel="Cancel"
        variant="danger"
        onConfirm={handleConfirmDelete}
        onCancel={() => setItemToDelete(null)}
      />

      {/* Confirmation Modal for Resetting to Defaults */}
      <ConfirmModal
        isOpen={isResetConfirmOpen}
        title="Reset Line Items to Benchmark?"
        message="Are you sure you want to restore the default line items from the official DepEd Regional Office VI Balance Sheet benchmark? Any custom items will be replaced with standard items."
        confirmLabel="Yes, Restore Defaults"
        cancelLabel="Cancel"
        variant="warning"
        onConfirm={() => {
          onResetDefaultItems();
          setIsResetConfirmOpen(false);
        }}
        onCancel={() => setIsResetConfirmOpen(false)}
      />
        </div>
      </div>
    </div>
  );
};
