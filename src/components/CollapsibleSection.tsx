import React from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

interface CollapsibleSectionProps {
  title: string;
  subtitle?: string;
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  accentDotColor?: string;
  rightSlot?: React.ReactNode;
}

export const CollapsibleSection: React.FC<CollapsibleSectionProps> = ({
  title,
  subtitle,
  isOpen,
  onToggle,
  children,
  accentDotColor,
  rightSlot,
}) => {
  return (
    <section className="border-b border-slate-800/80 last:border-b-0">
      <div className="flex items-center justify-between gap-2 px-4 py-2.5 bg-[#0A0F1C]">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={isOpen}
          className="flex flex-1 items-center gap-2 text-left text-xs font-semibold tracking-wide text-slate-200 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 rounded-sm py-0.5"
        >
          {isOpen ? (
            <ChevronDown className="h-3.5 w-3.5 text-slate-400 shrink-0" aria-hidden="true" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 text-slate-400 shrink-0" aria-hidden="true" />
          )}
          {accentDotColor && (
            <span
              className="h-2.5 w-2.5 rounded-xs shrink-0"
              style={{ backgroundColor: accentDotColor }}
              aria-hidden="true"
            />
          )}
          <span className="truncate">{title}</span>
          {subtitle && (
            <span className="text-[11px] font-normal text-slate-500 truncate">
              {subtitle}
            </span>
          )}
        </button>
        {rightSlot && <div className="shrink-0">{rightSlot}</div>}
      </div>
      {isOpen && <div className="px-4 pb-3.5 pt-2 bg-[#080C16]">{children}</div>}
    </section>
  );
};
