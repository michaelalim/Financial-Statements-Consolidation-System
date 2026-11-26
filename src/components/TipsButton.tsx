import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { HelpCircle } from 'lucide-react';

interface TipsButtonProps {
  children: React.ReactNode;
  heading?: string;
  ariaLabel?: string;
  className?: string;
}

export const TipsButton: React.FC<TipsButtonProps> = ({
  children,
  heading = 'Tips',
  ariaLabel = 'Tips',
  className = '',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState<{ top: number; left: number; width: number }>({
    top: 0,
    left: 12,
    width: 360,
  });

  const updatePosition = () => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const margin = 12;
    const width = Math.min(384, vw - margin * 2);

    let left = rect.left;
    if (left + width > vw - margin) {
      left = vw - margin - width;
    }
    if (left < margin) {
      left = margin;
    }

    const popoverHeight = popoverRef.current?.offsetHeight || 180;
    let top = rect.bottom + 8;
    if (top + popoverHeight > vh - margin && rect.top - popoverHeight - 8 >= margin) {
      top = rect.top - popoverHeight - 8;
    }

    setCoords({ top, left, width });
  };

  useLayoutEffect(() => {
    if (!isOpen) return;
    updatePosition();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (e: PointerEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (triggerRef.current?.contains(target)) return;
      if (popoverRef.current?.contains(target)) return;
      setIsOpen(false);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };

    const handleReposition = () => updatePosition();

    document.addEventListener('pointerdown', handlePointerDown, true);
    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('resize', handleReposition);
    window.addEventListener('scroll', handleReposition, true);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true);
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', handleReposition);
      window.removeEventListener('scroll', handleReposition, true);
    };
  }, [isOpen]);

  return (
    <span className={`relative inline-flex items-center align-middle ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-label={ariaLabel}
        aria-expanded={isOpen}
        className={`peer inline-flex items-center justify-center w-6 h-6 rounded-full border transition-colors cursor-pointer ${
          isOpen
            ? 'bg-th-accent text-th-accent-fg border-th-accent'
            : 'bg-th-subtle text-th-muted hover:text-th-text border-th-border-strong hover:bg-th-subtle-hover'
        }`}
      >
        <HelpCircle className="w-3.5 h-3.5" />
      </button>

      {!isOpen && (
        <span
          role="tooltip"
          className="pointer-events-none opacity-0 peer-hover:opacity-100 peer-focus-visible:opacity-100 transition-opacity duration-150 absolute left-1/2 -translate-x-1/2 bottom-full mb-1.5 px-2 py-0.5 rounded-md bg-th-primary text-th-primary-fg text-[11px] font-bold whitespace-nowrap shadow-sm z-40"
        >
          Tips
        </span>
      )}

      {isOpen &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={popoverRef}
            role="dialog"
            aria-label={heading}
            style={{
              top: `${coords.top}px`,
              left: `${coords.left}px`,
              width: `${coords.width}px`,
            }}
            onClick={() => {
              if (!window.getSelection()?.toString()) {
                setIsOpen(false);
              }
            }}
            className="fixed z-[90] p-3.5 bg-th-surface border-2 border-th-border-strong rounded-xl shadow-xl text-left space-y-2.5 cursor-pointer"
          >
            <div className="text-xs font-extrabold uppercase tracking-wider text-th-text">
              {heading}
            </div>
            <div className="space-y-2 text-xs sm:text-sm font-normal text-th-muted leading-relaxed">
              {children}
            </div>
          </div>,
          document.body
        )}
    </span>
  );
};
