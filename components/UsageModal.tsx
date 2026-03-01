
import React, { useEffect, useState } from 'react';
import { X, FileText, Download, CheckCircle, BarChart3 } from 'lucide-react';
import { usageService } from '../services/usageService';
import { UsageSummary } from '../types';
import { clsx } from 'clsx';
import { Button } from './Button';

interface UsageModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDataChange?: () => void;
}

export const UsageModal: React.FC<UsageModalProps> = ({ isOpen, onClose, onDataChange }) => {
  const [summary, setSummary] = useState<UsageSummary[]>([]);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    if (isOpen) {
      setSummary(usageService.getUsageSummary());
      setTotal(usageService.getTotalCount());
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 animate-fade-in">
      <div className="bg-white w-full max-w-lg rounded-sm shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="bg-[#26392D] text-white p-6 flex justify-between items-center flex-shrink-0">
          <div>
            <h2 className="font-serif text-2xl font-bold">Billing Report</h2>
            <p className="text-[10px] uppercase tracking-widest text-[#D3FF2F] opacity-80 mt-1">
              Internal Corporate Tracking
            </p>
          </div>
          <button onClick={onClose} className="text-white/70 hover:text-white transition-colors">
            <X size={24} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto flex-1 bg-neutral-50">
           {/* Lifetime Summary Card */}
           <div className="bg-[#1E3A35] text-white p-6 rounded-sm mb-6 flex items-center justify-between shadow-lg">
              <div>
                <p className="text-[10px] uppercase tracking-widest text-[#D3FF2F] font-bold mb-1">Lifetime Total</p>
                <h3 className="text-3xl font-serif font-bold">Processed CVs</h3>
              </div>
              <div className="text-right">
                <p className="text-5xl font-serif font-bold text-[#EE8D70]">{total}</p>
              </div>
           </div>

           <h4 className="text-[10px] uppercase tracking-[0.2em] text-neutral-400 font-bold mb-4">Monthly Breakdown</h4>
           
           <div className="space-y-4">
             {summary.length === 0 ? (
               <div className="text-center py-12 text-neutral-400">
                 <FileText size={48} className="mx-auto mb-4 opacity-20" />
                 <p className="text-sm">No usage data recorded yet.</p>
               </div>
             ) : (
               summary.map((item) => (
                 <div key={item.year_month} className="bg-white border border-neutral-200 p-4 flex justify-between items-center shadow-sm hover:border-[#EE8D70] transition-colors">
                    <div>
                      <p className="font-bold text-[#1E3A35] text-lg">{item.year_month}</p>
                      <span className={clsx(
                        "text-[9px] uppercase tracking-widest font-bold px-2 py-1 rounded-sm",
                        item.status === 'OPEN' ? "bg-blue-100 text-blue-700" : "bg-green-100 text-green-700"
                      )}>
                        {item.status}
                      </span>
                    </div>
                    
                    <div className="text-right">
                       <p className="text-3xl font-serif font-bold text-[#EE8D70]">{item.count}</p>
                       <p className="text-[10px] text-neutral-400 uppercase tracking-wider">Generations</p>
                    </div>
                 </div>
               ))
             )}
           </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-neutral-200 bg-white flex-shrink-0 flex flex-col gap-3 text-center">
          <p className="text-[10px] text-neutral-400 uppercase tracking-widest">
             CRITICAL BILLING DATA — RESETS ARE FORBIDDEN
          </p>
          <Button variant="primary" onClick={onClose} className="w-full">
            Return to System
          </Button>
        </div>

      </div>
    </div>
  );
};
