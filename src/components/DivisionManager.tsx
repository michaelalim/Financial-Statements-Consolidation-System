import React, { useState } from 'react';
import { Division } from '../types/fs';
import { Plus, Trash2, Building2, CheckCircle2 } from 'lucide-react';
import { ConfirmModal } from './ConfirmModal';

interface DivisionManagerProps {
  divisions: Division[];
  onAddDivision: (name: string) => void;
  onDeleteDivision: (id: string) => void;
  onResetDefaults: () => void;
}

export const DivisionManager: React.FC<DivisionManagerProps> = ({
  divisions,
  onAddDivision,
  onDeleteDivision,
  onResetDefaults,
}) => {
  const [newDivisionName, setNewDivisionName] = useState('');
  
  // Modal confirmation states
  const [isAddConfirmOpen, setIsAddConfirmOpen] = useState(false);
  const [divisionToDelete, setDivisionToDelete] = useState<Division | null>(null);
  const [isResetConfirmOpen, setIsResetConfirmOpen] = useState(false);

  const handleInitiateAdd = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newDivisionName.trim();
    if (!trimmed) return;
    setIsAddConfirmOpen(true);
  };

  const handleConfirmAdd = () => {
    if (newDivisionName.trim()) {
      onAddDivision(newDivisionName.trim());
      setNewDivisionName('');
    }
    setIsAddConfirmOpen(false);
  };

  const handleInitiateDelete = (division: Division) => {
    setDivisionToDelete(division);
  };

  const handleConfirmDelete = () => {
    if (divisionToDelete) {
      onDeleteDivision(divisionToDelete.id);
      setDivisionToDelete(null);
    }
  };

  return (
    <div className="w-full max-w-[1780px] mx-auto px-2 sm:px-4 py-4 space-y-6">
      <div className="mb-2">
        <h2 className="text-xl sm:text-2xl font-bold text-th-text">Schools Division Offices &amp; Regional Management</h2>
        <p className="text-sm text-th-muted mt-1 leading-relaxed">
          Manage reporting divisions for Region VI Western Visayas. Confirmation is required before adding or deleting any division.
        </p>
      </div>

      {/* Add Division Card */}
      <div className="bg-th-surface border border-th-border rounded-xl p-6 shadow-xs transition-colors">
        <h3 className="text-lg font-bold text-th-text mb-4 flex items-center gap-2">
          <Building2 className="w-5 h-5 text-th-muted" />
          Add New Division
        </h3>
        <form onSubmit={handleInitiateAdd} className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            value={newDivisionName}
            onChange={(e) => setNewDivisionName(e.target.value)}
            placeholder="Enter schools division name"
            className="flex-1 px-4 py-2.5 text-sm bg-th-input border border-th-border-strong rounded-lg text-th-text focus:outline-hidden focus:ring-2 focus:ring-th-accent focus:border-th-accent"
          />
          <button
            type="submit"
            disabled={!newDivisionName.trim()}
            className="inline-flex items-center justify-center gap-2 px-6 py-2.5 text-sm font-bold text-th-accent-fg bg-th-accent hover:bg-th-accent-hover disabled:opacity-50 disabled:cursor-not-allowed rounded-lg shadow-xs transition-colors whitespace-nowrap cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Add Division
          </button>
        </form>
        <p className="text-sm text-th-muted mt-2.5 leading-relaxed">
          You will be prompted to confirm before this division is created.
        </p>
      </div>

      {/* Existing Divisions List */}
      <div className="bg-th-surface border border-th-border rounded-xl overflow-hidden shadow-xs transition-colors">
        <div className="px-6 py-4 border-b border-th-border bg-th-subtle flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-base font-bold text-th-text">Registered Divisions</span>
            <span className="text-sm font-medium text-th-muted">({divisions.length} total)</span>
          </div>
          <button
            onClick={() => setIsResetConfirmOpen(true)}
            className="text-sm font-semibold text-th-muted hover:text-th-text transition-colors cursor-pointer"
          >
            Reset to Default 9 Divisions
          </button>
        </div>

        <div className="divide-y divide-th-border">
          {divisions.map((division, idx) => (
            <div
              key={division.id}
              className="px-6 py-3.5 flex items-center justify-between hover:bg-th-subtle transition-colors"
            >
              <div className="flex items-center gap-3">
                <span className="text-sm font-mono font-semibold text-th-muted w-7">
                  {(idx + 1).toString().padStart(2, '0')}
                </span>
                <span className="text-base font-semibold text-th-text">
                  {division.name}
                </span>
                {division.id === 'ro-vi' && (
                  <span className="text-xs text-th-text bg-th-subtle border border-th-border-strong px-2.5 py-0.5 rounded-md font-bold flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5 text-th-muted" /> Regional Office
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleInitiateDelete(division)}
                  className="p-1.5 text-th-muted hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-md transition-colors cursor-pointer"
                  title={`Delete ${division.name}`}
                  aria-label={`Delete ${division.name}`}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Confirmation Modal for Adding Division */}
      <ConfirmModal
        isOpen={isAddConfirmOpen}
        title="Add New Division?"
        message={`Are you sure you want to add "${newDivisionName.trim()}" to the reporting divisions list? It will become selectable for entering financial statements across all years.`}
        confirmLabel="Yes, Add Division"
        cancelLabel="Cancel"
        variant="primary"
        onConfirm={handleConfirmAdd}
        onCancel={() => setIsAddConfirmOpen(false)}
      />

      {/* Confirmation Modal for Deleting Division */}
      <ConfirmModal
        isOpen={divisionToDelete !== null}
        title="Delete Division?"
        message={`Are you sure you want to delete "${divisionToDelete?.name}"? Deleting this division will remove it from future reporting and remove its financial data from consolidated reports.`}
        confirmLabel="Yes, Delete Division"
        cancelLabel="Cancel"
        variant="danger"
        onConfirm={handleConfirmDelete}
        onCancel={() => setDivisionToDelete(null)}
      />

      {/* Confirmation Modal for Resetting to Defaults */}
      <ConfirmModal
        isOpen={isResetConfirmOpen}
        title="Reset to Default Divisions?"
        message="Are you sure you want to reset the division list back to the standard 9 divisions (Regional Office VI, Iloilo, Iloilo City, Passi City, Guimaras, Antique, Aklan, Capiz, Roxas)?"
        confirmLabel="Yes, Reset List"
        cancelLabel="Cancel"
        variant="warning"
        onConfirm={() => {
          onResetDefaults();
          setIsResetConfirmOpen(false);
        }}
        onCancel={() => setIsResetConfirmOpen(false)}
      />
    </div>
  );
};
