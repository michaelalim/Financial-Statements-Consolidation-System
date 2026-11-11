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
        <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">Schools Division Offices & Regional Management</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Manage reporting divisions for Region VI Western Visayas. Confirmation is required before adding or deleting any division.
        </p>
      </div>

      {/* Add Division Card */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-xs">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 uppercase tracking-wider mb-4 flex items-center gap-2">
          <Building2 className="w-4 h-4 text-sky-700 dark:text-sky-400" />
          Add New Division
        </h3>
        <form onSubmit={handleInitiateAdd} className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            value={newDivisionName}
            onChange={(e) => setNewDivisionName(e.target.value)}
            placeholder="Enter schools division name"
            className="flex-1 px-4 py-2.5 text-sm bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-sky-600 focus:border-sky-600"
          />
          <button
            type="submit"
            disabled={!newDivisionName.trim()}
            className="inline-flex items-center justify-center gap-2 px-6 py-2.5 text-sm font-semibold text-white bg-sky-800 hover:bg-sky-900 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg shadow-xs transition-colors whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            Add Division
          </button>
        </form>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
          You will be prompted to confirm before this division is created.
        </p>
      </div>

      {/* Existing Divisions List */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-xs">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">Registered Divisions</span>
            <span className="text-xs text-slate-500 dark:text-slate-400">({divisions.length} total)</span>
          </div>
          <button
            onClick={() => setIsResetConfirmOpen(true)}
            className="text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 transition-colors"
          >
            Reset to Default 9 Divisions
          </button>
        </div>

        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {divisions.map((division, idx) => (
            <div
              key={division.id}
              className="px-6 py-3.5 flex items-center justify-between hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <span className="text-xs font-mono text-slate-400 dark:text-slate-500 w-6">
                  {(idx + 1).toString().padStart(2, '0')}
                </span>
                <span className="text-sm font-medium text-slate-800 dark:text-slate-200">
                  {division.name}
                </span>
                {division.id === 'ro-vi' && (
                  <span className="text-xs text-sky-800 dark:text-sky-400 font-medium flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Regional Office
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleInitiateDelete(division)}
                  className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-md transition-colors"
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
