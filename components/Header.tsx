
import React, { useEffect, useState } from 'react';
import { BarChart3, ListFilter, Settings } from 'lucide-react';
import { clsx } from 'clsx';

interface HeaderProps {
  usageCount?: number;
  totalCount?: number;
  onOpenUsage?: () => void;
  onOpenSettings?: () => void;
}

export const Header: React.FC<HeaderProps> = ({ usageCount = 0, totalCount = 0, onOpenUsage, onOpenSettings }) => {
  const [pulseTotal, setPulseTotal] = useState(false);
  const [pulseMonth, setPulseMonth] = useState(false);

  useEffect(() => {
    if (totalCount > 0) {
      setPulseTotal(true);
      const timer = setTimeout(() => setPulseTotal(false), 1000);
      return () => clearTimeout(timer);
    }
  }, [totalCount]);

  useEffect(() => {
    if (usageCount > 0) {
      setPulseMonth(true);
      const timer = setTimeout(() => setPulseMonth(false), 1000);
      return () => clearTimeout(timer);
    }
  }, [usageCount]);

  return (
    <header className="w-full py-8 flex flex-col items-center justify-center bg-[#26392D] text-white shadow-md relative no-print">

      {/* Settings (Top Left) */}
      {onOpenSettings && (
        <button
          onClick={onOpenSettings}
          className="absolute top-4 left-6 md:left-12 text-white/30 hover:text-[#D3FF2F] transition-colors"
          title="Instellingen"
        >
          <Settings size={20} />
        </button>
      )}

      {/* Billing Indicators (Top Right) */}
      {onOpenUsage && (
        <div className="absolute top-4 right-6 md:right-12 flex gap-8">
          <button
            onClick={onOpenUsage}
            className="group flex flex-col items-end text-right transition-transform active:scale-95"
          >
            <div className={clsx(
              "flex items-center gap-2 text-white transition-all duration-300",
              pulseTotal ? "text-[#D3FF2F] scale-110" : "group-hover:text-[#D3FF2F]"
            )}>
              <BarChart3 size={14} />
              <span className="font-bold text-lg leading-none">{totalCount}</span>
            </div>
            <span className="text-[8px] uppercase tracking-widest text-white/30 group-hover:text-white/60 font-bold">
              GENERATIONS
            </span>
          </button>

          <button
            onClick={onOpenUsage}
            className="group flex flex-col items-end text-right transition-transform active:scale-95"
          >
            <div className={clsx(
              "flex items-center gap-2 transition-all duration-300",
              pulseMonth ? "text-white scale-110" : "text-[#D3FF2F] group-hover:text-white"
            )}>
              <ListFilter size={14} />
              <span className="font-bold text-lg leading-none">{usageCount}</span>
            </div>
            <span className="text-[8px] uppercase tracking-widest text-white/50 group-hover:text-white/80 font-bold">
              CVS THIS MONTH
            </span>
          </button>
        </div>
      )}

      {/* Wrapper */}
      <div className="inline-flex flex-col items-center mb-6">
        <h1 className="font-serif text-4xl md:text-5xl tracking-tighter font-semibold">NOVÉMBER.</h1>
        <div className="w-full h-[1px] bg-[#D3FF2F] mt-4"></div>
      </div>

      {/* Subheader */}
      <p className="text-[11px] md:text-xs tracking-[0.35em] uppercase font-bold text-[#D3FF35]">
        CV Conversion System
      </p>
    </header>
  );
};
