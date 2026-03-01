import React, { useEffect, useState } from 'react';
import { X, FileText, User, ChevronDown, ChevronUp, RefreshCw, AlertCircle } from 'lucide-react';
import { usageService, AuditEntry } from '../services/usageService';
import { UsageSummary } from '../types';
import { clsx } from 'clsx';
import { Button } from './Button';

interface UsageModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDataChange?: () => void;
}

export const UsageModal: React.FC<UsageModalProps> = ({ isOpen, onClose }) => {
  const [summary, setSummary] = useState<UsageSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [log, setLog] = useState<AuditEntry[]>([]);
  const [expandedMonth, setExpanded] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [logLoading, setLogLoading] = useState(false);
  const [adminName, setAdminName] = useState('');
  const [adminInput, setAdminInput] = useState('');
  const [adminEditing, setAdminEditing] = useState(false);
  const [noUrl, setNoUrl] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setAdminName(usageService.getAdminUser());
    setAdminInput(usageService.getAdminUser());
    setNoUrl(!usageService.getTrackingUrl());
    loadSummary();
  }, [isOpen]);

  const loadSummary = async () => {
    setLoading(true);
    const data = await usageService.fetchLiveSummary();
    setSummary(data.summary);
    setTotal(data.total);
    setLoading(false);
  };

  const loadLog = async (month: string) => {
    if (expandedMonth === month) {
      setExpanded(null);
      setLog([]);
      return;
    }
    setExpanded(month);
    setLogLoading(true);
    const entries = await usageService.fetchLog(month);
    setLog(entries);
    setLogLoading(false);
  };

  const saveAdminName = () => {
    usageService.setAdminUser(adminInput);
    setAdminName(adminInput);
    setAdminEditing(false);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 animate-fade-in">
      <div className="bg-white w-full max-w-2xl rounded-sm shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="bg-[#26392D] text-white p-6 flex justify-between items-start flex-shrink-0">
          <div>
            <h2 className="font-serif text-2xl font-bold">Billing Report</h2>
            <p className="text-[10px] uppercase tracking-widest text-[#D3FF2F] opacity-80 mt-1">
              Central Tracking — Google Sheets
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={loadSummary} title="Ververs" className="text-white/60 hover:text-white transition-colors">
              <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
            </button>
            <button onClick={onClose} className="text-white/70 hover:text-white transition-colors">
              <X size={24} />
            </button>
          </div>
        </div>

        <div className="p-6 overflow-y-auto flex-1 bg-neutral-50 space-y-6">

          {/* No URL warning */}
          {noUrl && (
            <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-sm p-4">
              <AlertCircle size={18} className="text-amber-500 mt-0.5 shrink-0" />
              <p className="text-sm text-amber-800">
                Geen tracking URL ingesteld. Open <strong>Instellingen</strong> en plak de Apps Script URL om central tracking te activeren.
              </p>
            </div>
          )}

          {/* Admin user */}
          <div className="bg-white border border-neutral-200 rounded-sm p-4 flex items-center justify-between gap-4 shadow-sm">
            <div className="flex items-center gap-3">
              <User size={18} className="text-[#284d32]" />
              <div>
                <p className="text-[10px] uppercase tracking-widest text-neutral-400 font-bold">Jij bent ingelogd als</p>
                {adminEditing ? (
                  <div className="flex items-center gap-2 mt-1">
                    <input
                      className="border border-neutral-300 rounded px-2 py-1 text-sm font-bold text-[#1E3A35] focus:outline-none focus:border-[#284d32]"
                      value={adminInput}
                      onChange={e => setAdminInput(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && saveAdminName()}
                      placeholder="Jouw naam"
                      autoFocus
                    />
                    <button onClick={saveAdminName} className="text-xs bg-[#284d32] text-white px-2 py-1 rounded">Opslaan</button>
                    <button onClick={() => setAdminEditing(false)} className="text-xs text-neutral-400">Annuleer</button>
                  </div>
                ) : (
                  <p className="font-bold text-[#1E3A35] text-sm mt-0.5">
                    {adminName || <span className="text-neutral-400 italic">Niet ingesteld</span>}
                  </p>
                )}
              </div>
            </div>
            {!adminEditing && (
              <button onClick={() => setAdminEditing(true)} className="text-xs text-[#284d32] underline">
                Wijzigen
              </button>
            )}
          </div>

          {/* Lifetime total */}
          <div className="bg-[#1E3A35] text-white p-6 rounded-sm flex items-center justify-between shadow-lg">
            <div>
              <p className="text-[10px] uppercase tracking-widest text-[#D3FF2F] font-bold mb-1">Lifetime Total</p>
              <h3 className="text-3xl font-serif font-bold">Verwerkte CV's</h3>
              <p className="text-[10px] text-white/50 mt-1">Alle admins · Alle apparaten · Alle tijden</p>
            </div>
            <div className="text-right">
              <p className="text-5xl font-serif font-bold text-[#EE8D70]">{loading ? '…' : total}</p>
            </div>
          </div>

          {/* Monthly breakdown with expandable log */}
          <div>
            <h4 className="text-[10px] uppercase tracking-[0.2em] text-neutral-400 font-bold mb-3">Maandoverzicht</h4>
            <div className="space-y-3">
              {summary.length === 0 && !loading ? (
                <div className="text-center py-12 text-neutral-400">
                  <FileText size={48} className="mx-auto mb-4 opacity-20" />
                  <p className="text-sm">{noUrl ? 'Stel eerst een tracking URL in.' : 'Nog geen data geregistreerd.'}</p>
                </div>
              ) : (
                summary.map(item => (
                  <div key={item.year_month} className="bg-white border border-neutral-200 shadow-sm rounded-sm overflow-hidden">
                    {/* Month header row */}
                    <button
                      onClick={() => loadLog(item.year_month)}
                      className="w-full flex justify-between items-center p-4 hover:bg-neutral-50 transition-colors text-left"
                    >
                      <div>
                        <p className="font-bold text-[#1E3A35] text-lg">{item.year_month}</p>
                        <span className={clsx(
                          "text-[9px] uppercase tracking-widest font-bold px-2 py-0.5 rounded-sm",
                          item.status === 'OPEN' ? "bg-blue-100 text-blue-700" : "bg-green-100 text-green-700"
                        )}>
                          {item.status}
                        </span>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <p className="text-3xl font-serif font-bold text-[#EE8D70]">{item.count}</p>
                          <p className="text-[10px] text-neutral-400 uppercase tracking-wider">CV's</p>
                        </div>
                        {expandedMonth === item.year_month
                          ? <ChevronUp size={16} className="text-neutral-400" />
                          : <ChevronDown size={16} className="text-neutral-400" />}
                      </div>
                    </button>

                    {/* Expanded audit log */}
                    {expandedMonth === item.year_month && (
                      <div className="border-t border-neutral-100">
                        {logLoading ? (
                          <p className="p-4 text-sm text-neutral-400 text-center">Laden…</p>
                        ) : log.length === 0 ? (
                          <p className="p-4 text-sm text-neutral-400 text-center">Geen entries gevonden.</p>
                        ) : (
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="bg-neutral-50 text-neutral-400 uppercase tracking-widest text-[9px]">
                                <th className="text-left p-3 font-bold">Tijdstip</th>
                                <th className="text-left p-3 font-bold">Kandidaat</th>
                                <th className="text-left p-3 font-bold">Admin</th>
                                <th className="text-left p-3 font-bold hidden sm:table-cell">Bestand</th>
                              </tr>
                            </thead>
                            <tbody>
                              {log.map((entry, i) => (
                                <tr key={entry.event_id || i} className="border-t border-neutral-100 hover:bg-neutral-50">
                                  <td className="p-3 text-neutral-500 whitespace-nowrap">{entry.timestamp.slice(0, 16).replace('T', ' ')}</td>
                                  <td className="p-3 font-semibold text-[#1E3A35]">{entry.candidate_name || '—'}</td>
                                  <td className="p-3 text-neutral-600">{entry.admin_user || '—'}</td>
                                  <td className="p-3 text-neutral-400 hidden sm:table-cell truncate max-w-[160px]">{entry.file_name || '—'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-neutral-200 bg-white flex-shrink-0 text-center">
          <p className="text-[9px] text-neutral-400 uppercase tracking-widest mb-3">
            CENTRAL BILLING DATA — RESETS ARE FORBIDDEN
          </p>
          <Button variant="primary" onClick={onClose} className="w-full">Sluiten</Button>
        </div>
      </div>
    </div>
  );
};
