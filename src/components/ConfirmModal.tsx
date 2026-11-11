import React from 'react';
import { AlertCircle, AlertTriangle, Check, X } from 'lucide-react';

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'primary' | 'warning';
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'primary',
  onConfirm,
  onCancel,
}) => {
  if (!isOpen) return null;

  const getVariantStyles = () => {
    switch (variant) {
      case 'danger':
        return {
          icon: <AlertTriangle className="w-6 h-6 text-red-600 dark:text-red-400" />,
          button: 'bg-red-700 hover:bg-red-800 text-white focus:ring-red-500',
          badgeBg: 'bg-red-100 dark:bg-red-950/80 text-red-700 dark:text-red-300 border-2 border-red-200 dark:border-red-900',
        };
      case 'warning':
        return {
          icon: <AlertCircle className="w-6 h-6 text-amber-600 dark:text-amber-400" />,
          button: 'bg-amber-600 hover:bg-amber-700 text-white focus:ring-amber-500',
          badgeBg: 'bg-amber-50 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 border-2 border-amber-200 dark:border-amber-900',
        };
      case 'primary':
      default:
        return {
          icon: <Check className="w-6 h-6 text-[#0072ce] dark:text-[#38bdf8]" />,
          button: 'bg-[#0072ce] hover:bg-[#005ea8] text-white focus:ring-[#0072ce]',
          badgeBg: 'bg-[#f0f5fa] dark:bg-[#0a274c] text-[#0a3461] dark:text-[#93c5fd] border-2 border-[#b9d9f5] dark:border-[#1d4677]',
        };
    }
  };

  const styles = getVariantStyles();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/60 backdrop-blur-xs">
      <div 
        className="w-full max-w-lg bg-white dark:bg-stone-900 rounded-2xl shadow-2xl border-2 border-stone-300 dark:border-stone-700 overflow-hidden transform transition-all animate-in fade-in zoom-in-95 duration-150"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-headline"
      >
        <div className="p-6">
          <div className="flex items-start gap-4">
            <div className={`p-3 rounded-xl shrink-0 ${styles.badgeBg}`}>
              {styles.icon}
            </div>
            <div className="flex-1">
              <h3 id="modal-headline" className="text-lg font-bold text-stone-900 dark:text-stone-100">
                {title}
              </h3>
              <p className="mt-2 text-base font-medium text-stone-600 dark:text-stone-300 leading-relaxed">
                {message}
              </p>
            </div>
            <button
              onClick={onCancel}
              className="text-stone-400 hover:text-stone-600 dark:text-stone-400 dark:hover:text-stone-200 p-1.5 rounded-lg transition-colors cursor-pointer"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="px-6 py-4 bg-stone-50 dark:bg-stone-800/60 border-t-2 border-stone-200 dark:border-stone-700 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="px-5 py-2.5 text-base font-bold text-stone-700 dark:text-stone-300 bg-white dark:bg-stone-800 border-2 border-stone-300 dark:border-stone-700 rounded-xl hover:bg-stone-100 dark:hover:bg-stone-700 transition-colors cursor-pointer"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`px-5 py-2.5 text-base font-bold rounded-xl transition-colors cursor-pointer shadow-sm ${styles.button}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};
