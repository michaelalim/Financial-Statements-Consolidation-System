import React, { useState, useMemo } from 'react';
import { LineItemDefinition, SubsectionType } from '../types/fs';
import { AGGREGATED_ACCUMULATED_DEPRECIATION_ID } from '../data/defaultLineItems';
import { Plus, Trash2, Search, SlidersHorizontal, RotateCcw, Pencil, X, Check } from 'lucide-react';
import { ConfirmModal } from './ConfirmModal';
import { FinancialStatementSidebar, FinancialStatementType } from './FinancialStatementSidebar';

interface LineItemManagerProps {
  lineItems: LineItemDefinition[];
  onAddLineItem: (item: Omit<LineItemDefinition, 'id' | 'order'>) => void;
  onUpdateLineItem: (id: string, updates: Omit<LineItemDefinition, 'id' | 'order'>) => void;
  onDeleteLineItem: (id: string) => void;
  onResetDefaultItems: () => void;
}

export const LineItemManager: React.FC<LineItemManagerProps> = ({
  lineItems,
  onAddLineItem,
  onUpdateLineItem,
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

  // Edit Line Item modal state
  const [editingItem, setEditingItem] = useState<LineItemDefinition | null>(null);
  const [editName, setEditName] = useState('');
  const [editSubsection, setEditSubsection] = useState<SubsectionType>('Current Assets');
  const [editIsCustomSubsection, setEditIsCustomSubsection] = useState(false);
  const [editCustomSubsection, setEditCustomSubsection] = useState('');
  const [editGroup, setEditGroup] = useState('');
  const [editIsCustomGroup, setEditIsCustomGroup] = useState(false);
  const [editCustomGroup, setEditCustomGroup] = useState('');
  const [editSubgroup, setEditSubgroup] = useState('');
  const [editIsContra, setEditIsContra] = useState(false);

  const defaultSubsectionOptions: SubsectionType[] =
    selectedStatement === 'cash_flows'
      ? [
          'Cash Flows from Operating Activities',
          'Cash Flows from Investing Activities',
          'Cash Flows from Financing Activities',
        ]
      : selectedStatement === 'performance'
      ? [
          'Revenue',
          'Current Operating Expenses',
          'Transfers, Assistance and Subsidy',
          'Other Non-Operating Income',
          'Losses',
        ]
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
    'Revenue': [
      'Tax Revenue',
      'Service and Business Income',
      'Shares, Grants and Donations',
      'Gains',
      'Miscellaneous Income',
    ],
    'Current Operating Expenses': [
      'Personnel Services',
      'Maintenance and Other Operating Expenses',
      'Financial Expenses',
      'Non-Cash Expenses',
    ],
    'Transfers, Assistance and Subsidy': [
      'Financial Assistance/Subsidy from NGAs, LGUs, GOCCs',
      'Less: Financial Assistance/Subsidy to NGAs, LGUs, GOCCs',
    ],
    'Other Non-Operating Income': ['Sale of Assets', 'Gains'],
    'Losses': ['Losses'],
    'Cash Flows from Operating Activities': [
      'Receipt of Notice of Cash Allocation',
      'Collection of Income/Revenues',
      'Receipt of Assistance and Subsidy from Other NGAs, LGUs and GOCCs',
      'Collection of Receivables',
      'Receipt of Inter-Agency Fund Transfers',
      'Receipt of Intra-Agency Fund Transfers',
      'Trust Receipts',
      'Other Receipts',
      'Adjustments',
      'Replenishment of Negotiated MDS Checks (for BTr)',
      'Remittance to National Treasury',
      'Payment of Expenses',
      'Payment to Suppliers and Creditors',
      'Other Payments',
      'Purchase of Inventories',
      'Purchase of Semi-Expendable Machinery, Equipment, Furniture, Fixtures and Books',
      'Grant of Cash Advances',
      'Prepayments',
      'Refund of Deposits',
      'Payment of Accounts Payables',
      'Payment of tax refunds payable',
      'Remittance of Personnel Benefit Contributions and Mandatory Deductions',
      'Grant of Financial Assistance/Subsidy',
      'Release of Inter-Agency Fund Transfers',
      'Release of Intra-Agency Fund Transfers',
      'Other Disbursements',
      'Reversal of Unutilized NCA',
    ],
    'Cash Flows from Investing Activities': [
      'Proceeds from Sale/Disposal of Property, Plant and Equipment',
      'Sale of Investments',
      'Receipt of Cash Dividends',
      'Proceeds from Matured/Return of Investments',
      'Collection of Long-Term Loans',
      'Proceeds from Sale of Other Assets',
      'Proceeds from Sale of Investment Property',
      'Proceeds from Sale of Biological Assets',
      'Proceeds from Sale of Intangible Assets',
      'Other Investing Receipts',
      'Purchase/Construction of Property, Plant and Equipment',
      'Purchase of Bearer Biological Assets',
      'Grant of Loans',
      'Purchase of Investments',
      'Purchase of Intangible Assets',
      'Other Investing Disbursements',
    ],
    'Cash Flows from Financing Activities': [
      'Financing Cash Inflows',
      'Financing Cash Outflows',
    ],
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
    return lineItems.filter(
      (item) =>
        item.id !== AGGREGATED_ACCUMULATED_DEPRECIATION_ID &&
        (item.statementType || 'position') === selectedStatement
    );
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

  const editActiveSubsection = (
    editIsCustomSubsection ? editCustomSubsection.trim() : editSubsection
  ) as SubsectionType;

  const editAvailableGroups = useMemo(() => {
    const set = new Set<string>(groupSuggestionsBySubsection[editActiveSubsection] || []);
    statementLineItems.forEach((item) => {
      if (item.subsection === editActiveSubsection && item.group) {
        set.add(item.group);
      }
    });
    return Array.from(set);
  }, [editActiveSubsection, statementLineItems]);

  const editActiveGroup = editIsCustomGroup ? editCustomGroup.trim() : editGroup;

  const editAvailableSubgroups = useMemo(() => {
    const set = new Set<string>();
    statementLineItems.forEach((item) => {
      if (
        item.subsection === editActiveSubsection &&
        (!editActiveGroup || item.group === editActiveGroup) &&
        item.subgroup
      ) {
        set.add(item.subgroup);
      }
    });
    return Array.from(set);
  }, [editActiveSubsection, editActiveGroup, statementLineItems]);

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

  const deriveSectionForSubsection = (
    finalSubsection: string,
    stmt: string
  ): LineItemDefinition['section'] => {
    if (finalSubsection.includes('Operating Activities')) return 'CASH_OPERATING';
    if (finalSubsection.includes('Investing Activities')) return 'CASH_INVESTING';
    if (finalSubsection.includes('Financing Activities')) return 'CASH_FINANCING';
    if (finalSubsection === 'Revenue') return 'REVENUE';
    if (finalSubsection === 'Current Operating Expenses') return 'EXPENSES';
    if (finalSubsection === 'Transfers, Assistance and Subsidy') return 'TRANSFERS';
    if (finalSubsection === 'Other Non-Operating Income') return 'NON_OPERATING';
    if (finalSubsection === 'Losses') return 'LOSSES';
    if (stmt === 'cash_flows') return 'CASH_FLOWS';
    if (stmt === 'performance') return 'REVENUE';
    if (stmt === 'net_assets') return 'CHANGES_IN_NET_ASSETS';
    if (finalSubsection.includes('Assets')) return 'ASSETS';
    if (finalSubsection.includes('Liabilities')) return 'LIABILITIES';
    return 'EQUITY';
  };

  const handleConfirmAdd = () => {
    const finalSubsection = (isCustomSubsection ? customSubsection.trim() : subsection) as SubsectionType;
    const finalGroup = (isCustomGroup ? customGroup.trim() : group.trim()) || 'General';
    const section = deriveSectionForSubsection(finalSubsection, selectedStatement);

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

  const openEditModal = (item: LineItemDefinition) => {
    setEditingItem(item);
    setEditName(item.name);
    const inSubOptions = subsectionOptions.includes(item.subsection);
    if (inSubOptions) {
      setEditSubsection(item.subsection);
      setEditIsCustomSubsection(false);
      setEditCustomSubsection('');
    } else {
      setEditSubsection(subsectionOptions[0] || 'Current Assets');
      setEditIsCustomSubsection(true);
      setEditCustomSubsection(item.subsection);
    }

    const groupsForItemSub = new Set<string>(groupSuggestionsBySubsection[item.subsection] || []);
    statementLineItems.forEach((li) => {
      if (li.subsection === item.subsection && li.group) groupsForItemSub.add(li.group);
    });
    if (groupsForItemSub.has(item.group)) {
      setEditGroup(item.group);
      setEditIsCustomGroup(false);
      setEditCustomGroup('');
    } else {
      setEditGroup(Array.from(groupsForItemSub)[0] || '');
      setEditIsCustomGroup(true);
      setEditCustomGroup(item.group);
    }

    setEditSubgroup(item.subgroup || '');
    setEditIsContra(Boolean(item.isContra));
  };

  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingItem) return;
    const trimmedName = editName.trim();
    if (!trimmedName) return;
    if (editIsCustomSubsection && !editCustomSubsection.trim()) return;
    if (editIsCustomGroup && !editCustomGroup.trim()) return;

    const finalSubsection = (
      editIsCustomSubsection ? editCustomSubsection.trim() : editSubsection
    ) as SubsectionType;
    const finalGroup =
      (editIsCustomGroup ? editCustomGroup.trim() : editGroup.trim()) || 'General';
    const stmt = editingItem.statementType || selectedStatement;
    const section = deriveSectionForSubsection(finalSubsection, stmt);

    onUpdateLineItem(editingItem.id, {
      name: trimmedName,
      statementType: editingItem.statementType,
      section,
      subsection: finalSubsection,
      group: finalGroup,
      subgroup: editSubgroup.trim() || undefined,
      isContra: editIsContra,
      isCustom: editingItem.isCustom,
    });

    setEditingItem(null);
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
                className="group px-6 py-3.5 flex items-center justify-between gap-4 hover:bg-th-subtle transition-colors text-sm"
              >
                <div className="pr-4 min-w-0">
                  <div className="font-medium text-th-text flex items-center gap-2 flex-wrap">
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

                <div className="flex items-center gap-3 shrink-0">
                  <button
                    type="button"
                    onClick={() => openEditModal(item)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 min-h-[40px] text-sm font-bold text-th-text bg-th-surface hover:bg-th-primary hover:text-th-primary-fg border-2 border-th-border-strong rounded-xl shadow-2xs transition-all cursor-pointer opacity-80 sm:opacity-35 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100"
                    title={`Modify line item: ${item.name}`}
                  >
                    <Pencil className="w-4 h-4" />
                    <span>Modify</span>
                  </button>

                  <span className="text-sm font-medium text-th-muted hidden sm:inline">
                    {item.subsection}
                  </span>
                  <button
                    type="button"
                    onClick={() => setItemToDelete(item)}
                    className="min-w-[40px] min-h-[40px] flex items-center justify-center text-th-muted hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-xl transition-colors cursor-pointer"
                    title={`Delete line item: ${item.name}`}
                    aria-label={`Delete line item: ${item.name}`}
                  >
                    <Trash2 className="w-5 h-5" />
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

      {/* Modify Line Item Modal */}
      {editingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/65 backdrop-blur-xs">
          <div className="w-full max-w-xl bg-th-surface border-2 border-th-border-strong rounded-2xl shadow-2xl overflow-hidden">
            <div className="px-6 py-4 bg-th-subtle border-b border-th-border flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-th-primary text-th-primary-fg border border-th-border-strong">
                  <Pencil className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-th-text">Modify Line Item</h3>
                  <p className="text-xs text-th-muted mt-0.5">
                    Update account title, classification, group, or sub-group without losing saved balances.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingItem(null)}
                className="p-1.5 rounded-lg text-th-muted hover:text-th-text hover:bg-th-surface border border-transparent hover:border-th-border-strong cursor-pointer"
                aria-label="Close modify dialog"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-bold text-th-text mb-1.5">
                  Line Item Name *
                </label>
                <input
                  type="text"
                  required
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="Enter line item name"
                  className="w-full px-3.5 py-2.5 text-sm font-semibold bg-th-input border border-th-border-strong rounded-lg text-th-text focus:outline-hidden focus:ring-2 focus:ring-th-accent focus:border-th-accent"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-th-text mb-1.5">
                    Classification *
                  </label>
                  {editIsCustomSubsection ? (
                    <div className="flex gap-2">
                      <input
                        type="text"
                        required
                        value={editCustomSubsection}
                        onChange={(e) => setEditCustomSubsection(e.target.value)}
                        placeholder="Enter classification"
                        className="flex-1 min-w-0 px-3 py-2 text-sm bg-th-input border border-th-accent text-th-text rounded-lg focus:outline-hidden focus:ring-2 focus:ring-th-accent"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setEditIsCustomSubsection(false);
                          setEditCustomSubsection('');
                        }}
                        className="px-2.5 py-2 text-xs font-semibold text-th-text bg-th-subtle hover:bg-th-subtle-hover rounded-lg border border-th-border-strong cursor-pointer shrink-0"
                      >
                        List
                      </button>
                    </div>
                  ) : (
                    <select
                      value={editSubsection}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === '__NEW__') {
                          setEditIsCustomSubsection(true);
                          setEditCustomSubsection('');
                          setEditIsCustomGroup(true);
                          setEditCustomGroup('');
                        } else {
                          const nextSub = val as SubsectionType;
                          setEditSubsection(nextSub);
                          const nextGroups = Array.from(
                            new Set([
                              ...(groupSuggestionsBySubsection[nextSub] || []),
                              ...statementLineItems
                                .filter((li) => li.subsection === nextSub && li.group)
                                .map((li) => li.group),
                            ])
                          );
                          if (!nextGroups.includes(editGroup)) {
                            setEditGroup(nextGroups[0] || '');
                            setEditIsCustomGroup(nextGroups.length === 0);
                            setEditCustomGroup('');
                          }
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
                  {editIsCustomGroup || editAvailableGroups.length === 0 ? (
                    <div className="flex gap-2">
                      <input
                        type="text"
                        required
                        value={editCustomGroup}
                        onChange={(e) => setEditCustomGroup(e.target.value)}
                        placeholder="Enter account group"
                        className="flex-1 min-w-0 px-3 py-2 text-sm bg-th-input border border-th-accent text-th-text rounded-lg focus:outline-hidden focus:ring-2 focus:ring-th-accent"
                      />
                      {editAvailableGroups.length > 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            setEditIsCustomGroup(false);
                            setEditCustomGroup('');
                            setEditGroup(editAvailableGroups[0]);
                          }}
                          className="px-2.5 py-2 text-xs font-semibold text-th-text bg-th-subtle hover:bg-th-subtle-hover rounded-lg border border-th-border-strong cursor-pointer shrink-0"
                        >
                          List
                        </button>
                      )}
                    </div>
                  ) : (
                    <select
                      value={editAvailableGroups.includes(editGroup) ? editGroup : editAvailableGroups[0]}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === '__NEW__') {
                          setEditIsCustomGroup(true);
                          setEditCustomGroup('');
                        } else {
                          setEditGroup(val);
                        }
                      }}
                      className="w-full px-3.5 py-2.5 text-sm bg-th-input border border-th-border-strong text-th-text rounded-lg focus:outline-hidden focus:ring-2 focus:ring-th-accent focus:border-th-accent"
                    >
                      {editAvailableGroups.map((g) => (
                        <option key={g} value={g}>
                          {g}
                        </option>
                      ))}
                      <option value="__NEW__">+ Create New Account Group...</option>
                    </select>
                  )}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-sm font-bold text-th-text">
                    Sub-Group (Optional)
                  </label>
                  {editSubgroup && (
                    <button
                      type="button"
                      onClick={() => setEditSubgroup('')}
                      className="text-xs font-semibold text-th-muted hover:text-th-text underline cursor-pointer"
                    >
                      Clear sub-group
                    </button>
                  )}
                </div>
                <input
                  type="text"
                  list="edit-subgroup-suggestions"
                  value={editSubgroup}
                  onChange={(e) => setEditSubgroup(e.target.value)}
                  placeholder="Enter sub-group or leave blank"
                  className="w-full px-3.5 py-2.5 text-sm bg-th-input border border-th-border-strong text-th-text rounded-lg focus:outline-hidden focus:ring-2 focus:ring-th-accent focus:border-th-accent"
                />
                <datalist id="edit-subgroup-suggestions">
                  {editAvailableSubgroups.map((sg) => (
                    <option key={sg} value={sg} />
                  ))}
                </datalist>
                {editAvailableSubgroups.length > 0 && (
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <span className="text-xs text-th-muted font-semibold">Existing:</span>
                    {editAvailableSubgroups.map((sg) => (
                      <button
                        key={sg}
                        type="button"
                        onClick={() => setEditSubgroup(sg)}
                        className={`px-2 py-0.5 rounded-md text-xs font-semibold border cursor-pointer transition-colors ${
                          editSubgroup === sg
                            ? 'bg-th-primary text-th-primary-fg border-th-primary'
                            : 'bg-th-subtle hover:bg-th-subtle-hover text-th-text border-th-border-strong'
                        }`}
                      >
                        {sg}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <label className="flex items-center gap-2.5 cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={editIsContra}
                  onChange={(e) => setEditIsContra(e.target.checked)}
                  className="w-4 h-4 text-th-accent accent-th-accent rounded border-th-border-strong focus:ring-th-accent"
                />
                <span className="text-sm text-th-text font-medium">
                  This is a contra-account (deducted from gross balance)
                </span>
              </label>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-th-border">
                <button
                  type="button"
                  onClick={() => setEditingItem(null)}
                  className="px-4 py-2 text-sm font-bold text-th-text bg-th-subtle hover:bg-th-subtle-hover border border-th-border-strong rounded-xl cursor-pointer transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!editName.trim()}
                  className="inline-flex items-center gap-1.5 px-5 py-2 text-sm font-bold text-th-accent-fg bg-th-accent hover:bg-th-accent-hover disabled:opacity-50 rounded-xl shadow-xs cursor-pointer transition-colors"
                >
                  <Check className="w-4 h-4" />
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
        </div>
      </div>
    </div>
  );
};
