
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Header } from './components/Header';
import { Button } from './components/Button';
import { CVPreview } from './components/CVPreview';
import { FileUploader } from './components/FileUploader';
import { LoginScreen } from './components/LoginScreen';
import { UsageModal } from './components/UsageModal';
import { geminiService, CVInput } from './services/geminiService';
import { usageService } from './services/usageService';
import { generateDocxBlob } from './services/docxGenerator';
import { CVPdfDocument } from './components/CVPdfDocument';
import { pdf } from '@react-pdf/renderer';
import { BatchItem, ParsedCV } from './types';
import { AlertCircle, FileText, CheckCircle, Clock, Loader2, XCircle, LogOut, Layout, FileDown, ChevronDown, Play, RefreshCcw, Settings, X, Undo2 } from 'lucide-react';
import * as mammoth from 'mammoth';
import saveAs from 'file-saver';
import { loadGoogleScripts } from './services/driveService';
import { clsx } from 'clsx';
import { config } from './config';
import { WHITE_ARROW_URL } from './assets';

const MAX_WAIT_MS = 90000;

// Scales its children to fit the available width on mobile, 1:1 on desktop
const ScaleToCVFit: React.FC<{ children: React.ReactNode; className?: string; style?: React.CSSProperties }> = ({ children, className, style }) => {
  const wrapRef = React.useRef<HTMLDivElement>(null);
  const [scale, setScale] = React.useState(1);
  React.useLayoutEffect(() => {
    const update = () => {
      if (!wrapRef.current) return;
      const available = wrapRef.current.offsetWidth;
      const cvPx = 794; // 210mm @ 96 dpi
      setScale(Math.min(1, available / cvPx));
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);
  // When scaled down, the div still occupies 210mm height in the flow → collapse it
  const scaledHeight = scale < 1 ? `calc(297mm * ${scale})` : undefined;
  return (
    <div ref={wrapRef} className="w-full" style={{ height: scaledHeight, overflow: 'hidden' }}>
      <div className={className} style={{ ...style, transform: `scale(${scale})`, transformOrigin: 'top left', width: '210mm' }}>
        {children}
      </div>
    </div>
  );
};

const App: React.FC = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(true);
  const [userEmail, setUserEmail] = useState('');
  const [queue, setQueue] = useState<BatchItem[]>([]);
  const [isProcessingBatch, setIsProcessingBatch] = useState(false);
  const [selectedResultId, setSelectedResultId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [usageCount, setUsageCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [isUsageModalOpen, setIsUsageModalOpen] = useState(false);
  const [isDownloadMenuOpen, setIsDownloadMenuOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  // Punt 9 — profielfocus die de tag-generatie stuurt wanneer er geen vacature is.
  const [profileFocus, setProfileFocus] = useState<string>('');
  const [vacancyText, setVacancyText] = useState<string>('');
  // Punt 13 — final-grade mode: minimale rewrites bij re-upload van al-Novémber-stijl CV's.
  const [finalGradeMode, setFinalGradeMode] = useState<boolean>(() => {
    try { return localStorage.getItem('novcv_finalgrade_mode') === '1'; } catch { return false; }
  });
  // Persist final-grade toggle across page reloads — Maria asked for this implicitly
  // ("had to toggle every time" friction)
  useEffect(() => {
    try { localStorage.setItem('novcv_finalgrade_mode', finalGradeMode ? '1' : '0'); } catch { /* ignore */ }
  }, [finalGradeMode]);
  const undoStackRef = useRef<Map<string, ParsedCV[]>>(new Map());

  const processingRef = useRef<Set<string>>(new Set());

  // Reset edit mode when user switches between CVs in the queue
  useEffect(() => {
    setIsEditing(false);
  }, [selectedResultId]);

  // Ctrl+Z keyboard shortcut for undo
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && isEditing) {
        e.preventDefault();
        handleUndo();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isEditing, selectedResultId]);

  const refreshCounters = useCallback(async () => {
    // Show cached values instantly, then update with live data from Sheets
    setUsageCount(usageService.getCachedMonthCount());
    setTotalCount(usageService.getCachedTotal());
    const live = await usageService.fetchLiveSummary();
    setUsageCount(live.summary.find(s => {
      const now = new Date();
      return s.year_month === `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    })?.count ?? 0);
    setTotalCount(live.total);
  }, []);

  useEffect(() => {
    const storedEmail = sessionStorage.getItem('november_user_email');
    if (storedEmail) setUserEmail(storedEmail);
    refreshCounters();
    loadGoogleScripts().catch(err => console.error("Google Scripts error:", err));
  }, [refreshCounters]);

  const handleLogin = (email: string) => {
    setIsAuthenticated(true);
    sessionStorage.setItem('november_auth', 'true');
    if (email) {
      setUserEmail(email);
      sessionStorage.setItem('november_user_email', email);
    }
  };

  // Extract candidate name from filename like "CV_van_Alice_Mahfouz_NOVEMBER_2026.pdf"
  // or "CV van John Smith NOVÉMBER.pdf" (Maria juni 18 naming).
  const extractNameFromFilename = (filename: string): string | null => {
    // Remove extension
    const base = filename.replace(/\.[^.]+$/, '');
    // Pattern: CV_van_Firstname_Lastname or CV_Firstname_Lastname
    const match = base.match(/CV[_\s-]*(?:van[_\s]+)?([A-Z][a-zÀ-ÿ]+(?:[_\s]+[A-Z][a-zÀ-ÿ]+)+)/i);
    if (!match) return null;
    // Replace underscores with spaces, then title-case per word.
    // Note: \b\w mis-capitalizes accented names (José -> JosÉ) because JS \b
    // treats accented chars as boundaries. Split on whitespace and uppercase
    // only the first char of each word instead. Dutch particles (de/van/der)
    // are left lowercase.
    const particles = new Set(['de', 'van', 'der', 'den', 'het', 'ten', 'ter', 'te', 'op', 'in']);
    let name = match[1]
      .replace(/_/g, ' ')
      .split(/\s+/)
      .map((w, i) => {
        const lower = w.toLowerCase();
        if (i > 0 && particles.has(lower)) return lower; // keep particles lowercase (not first word)
        return w.charAt(0).toUpperCase() + w.slice(1);
      })
      .join(' ')
      .trim();
    // Maria juni 18: strip "NOVEMBER"/"NOVÉMBER"/"NOVÊMBER" suffix (new filename format)
    name = name.replace(/\s+Nov[eêé]mber\s*$/i, '').trim();
    return name || null;
  };

  const addToQueue = async (files: File[]) => {
    const newItems: BatchItem[] = [];
    for (const file of files) {
      const id = Math.random().toString(36).substr(2, 9);
      let textContext = '';
      let base64Data = '';
      try {
        if (file.name.toLowerCase().endsWith('.docx') || file.name.toLowerCase().endsWith('.doc')) {
          const arrayBuffer = await file.arrayBuffer();
          const result = await mammoth.extractRawText({ arrayBuffer });
          textContext = result.value;
        } else if (file.type === 'application/pdf' || file.type.startsWith('image/')) {
          base64Data = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = () => resolve((reader.result as string).split(',')[1]);
            reader.onerror = reject;
          });
        } else {
          textContext = await file.text();
        }
        newItems.push({ id, file, status: 'PENDING', statusMessage: 'Wacht op analyse', textContext, base64Data, mimeType: file.type });
      } catch (e: any) {
        newItems.push({ id, file, status: 'ERROR', statusMessage: 'Fout', error: "Bestand kon niet worden gelezen." });
      }
    }
    setQueue(prev => {
      const updated = [...prev, ...newItems];
      if (!selectedResultId && updated.length > 0) setSelectedResultId(updated[0].id);
      return updated;
    });
  };

  const startExtraction = async (targetId: string) => {
    if (processingRef.current.has(targetId)) return;
    const item = queue.find(q => q.id === targetId);
    if (!item) return;

    processingRef.current.add(targetId);
    setQueue(prev => prev.map(q => q.id === targetId ? { ...q, status: 'PROCESSING', statusMessage: 'Analyseren...' } : q));

    try {
      const extractionPromise = geminiService.extractCVData({
        text: item.textContext || '',
        files: item.base64Data ? [{ mimeType: item.mimeType!, data: item.base64Data }] : undefined,
        fileName: item.file.name
      });
      const result = await extractionPromise;

      // Save the name as extracted (before parseCV can hallucinate it)
      const extractedNameRaw: string = (result as any)?.personalInfo?.name || '';
      const extractedIsInitialOnly = /^[A-Za-z]\./.test(extractedNameRaw.trim());

      // Auto-process with new style immediately
      setQueue(prev => prev.map(q => q.id === targetId ? { ...q, status: 'PROCESSING', statusMessage: 'Stijlen...' } : q));

      // Punt 13 — auto-detect "final-grade" CV's: bestandsnaam bevat "NOVEMBER" of
      // bron-text bevat de typische Novémber-footerstring / het Novémber-merk.
      const looksFinalGrade = (() => {
        if (finalGradeMode) return true; // expliciete toggle wint altijd
        const fn = (item.file.name || '').toLowerCase();
        // Maria juni 18: nieuwe filenames bevatten "NOVÉMBER" (met é), oude bestanden
        // gebruiken "NOVÉMBER"/"NOVÊMBER"/"NOVEMBER" — regex accepteert alle drie.
        if (/november|nov[eêé]mber/.test(fn)) return true;
        const txt = (item.textContext || '').toLowerCase();
        if (/nov[eêé]mber\./.test(txt)) return true;
        // signaal: alle bullets eindigen al op ; of . (Novémber-stijl)
        try {
          const exp = (result as any)?.experience || [];
          if (exp.length >= 2) {
            const flat = exp.flatMap((e: any) => e?.bullets || []) as string[];
            if (flat.length >= 6) {
              const styled = flat.filter(b => /[;.]\s*$/.test(b)).length;
              if (styled / flat.length >= 0.8) return true;
            }
          }
        } catch { /* noop */ }
        return false;
      })();

      const finalResult = await geminiService.parseCV({
        text: JSON.stringify(result),
        profileFocus: profileFocus || undefined,
        vacancyText: vacancyText || undefined,
        finalGradeMode: looksFinalGrade,
      });

      // Punt 13 — mark CV so UI can show a clear indicator that final-grade was applied
      (finalResult as any).wasFinalGradeProcessed = looksFinalGrade;

      // Punt 12 — snapshot original bullets so future rewrites start from the same baseline
      // (prevents semantic drift on repeated 'herschrijf bullets' clicks).
      if (finalResult.experience) {
        finalResult.experience.forEach((exp: any) => {
          if (Array.isArray(exp.bullets) && !exp.originalBullets) {
            exp.originalBullets = [...exp.bullets];
          }
        });
      }

      // PERIOD RESTORATION — phase 1 extracted dates at temperature 0.1 (very reliable).
      // Phase 2 sometimes mutates years despite "EXACT kopieer" instructions.
      // Match by employer+role (fuzzy), fall back to index — handles the rare case
      // where Phase 2 drops or reorders a job and a pure index lookup would copy a
      // period to the wrong job.
      const norm = (s: any) => (s || '').toString().toLowerCase().trim().replace(/[.,;:!?'"`()\[\]{}]/g, '').replace(/\s+/g, ' ');

      if (result.experience && finalResult.experience) {
        const claimed = new Set<number>();
        finalResult.experience.forEach((finalExp: any, i: number) => {
          const te = norm(finalExp.employer);
          const tr = norm(finalExp.role);
          // 1) Exact employer + role match (handles internal promotions)
          let idx = result.experience.findIndex((o: any, oi: number) => !claimed.has(oi) && norm(o.employer) === te && norm(o.role) === tr);
          // 2) Exact employer alone
          if (idx === -1 && te) {
            idx = result.experience.findIndex((o: any, oi: number) => !claimed.has(oi) && norm(o.employer) === te);
          }
          // 3) Fuzzy employer substring
          if (idx === -1 && te) {
            idx = result.experience.findIndex((o: any, oi: number) => {
              if (claimed.has(oi)) return false;
              const n = norm(o.employer);
              return n.length > 0 && (n.startsWith(te) || te.startsWith(n) || n.includes(te) || te.includes(n));
            });
          }
          // 4) Fall back to positional
          if (idx === -1) idx = i;
          const source = result.experience[idx];
          if (source) {
            claimed.add(idx);
            if (source.period) finalExp.period = source.period;
          }
        });
      }
      if (result.education && finalResult.education) {
        // Education matches on degree+school
        const claimed = new Set<number>();
        finalResult.education.forEach((finalEdu: any, i: number) => {
          const td = norm(finalEdu.degree);
          const ts = norm(finalEdu.school);
          let idx = result.education.findIndex((o: any, oi: number) => !claimed.has(oi) && norm(o.degree) === td && norm(o.school) === ts);
          if (idx === -1 && td) {
            idx = result.education.findIndex((o: any, oi: number) => !claimed.has(oi) && norm(o.degree) === td);
          }
          if (idx === -1 && td) {
            idx = result.education.findIndex((o: any, oi: number) => {
              if (claimed.has(oi)) return false;
              const n = norm(o.degree);
              return n.length > 0 && (n.startsWith(td) || td.startsWith(n) || n.includes(td) || td.includes(n));
            });
          }
          if (idx === -1) idx = i;
          const source = result.education[idx];
          if (source) {
            claimed.add(idx);
            if (source.period) finalEdu.period = source.period;
          }
        });
      }
      if (result.courses && finalResult.courses) {
        const claimed = new Set<number>();
        finalResult.courses.forEach((finalCourse: any, i: number) => {
          const tt = norm(finalCourse.title);
          let idx = result.courses.findIndex((o: any, oi: number) => !claimed.has(oi) && norm(o.title) === tt);
          if (idx === -1 && tt) {
            idx = result.courses.findIndex((o: any, oi: number) => {
              if (claimed.has(oi)) return false;
              const n = norm(o.title);
              return n.length > 0 && (n.startsWith(tt) || tt.startsWith(n) || n.includes(tt) || tt.includes(n));
            });
          }
          if (idx === -1) idx = i;
          const source = result.courses[idx];
          if (source) {
            claimed.add(idx);
            if (source.period) finalCourse.period = source.period;
          }
        });
      }

      // If extraction only had an initial, parseCV may have hallucinated a first name.
      // Override with the name from the filename (e.g. "CV_van_Alice_Mahfouz...") if available.
      const nameFromFile = extractNameFromFilename(item.file.name);
      if (extractedIsInitialOnly && nameFromFile) {
        (finalResult as any).personalInfo.name = nameFromFile;
      }

      const sourceHash = await usageService.generateHash(JSON.stringify(result) + 'new');
      const candidateName = (finalResult as any)?.personalInfo?.name || 'Onbekend';
      usageService.recordConversion(targetId, sourceHash, item.file.name, candidateName, `gen_${targetId}_${Date.now()}`);
      refreshCounters();

      setQueue(prev => prev.map(q => q.id === targetId ? { ...q, status: 'SUCCESS', statusMessage: 'Afgerond', result: finalResult as ParsedCV } : q));
    } catch (err: any) {
      setQueue(prev => prev.map(q => q.id === targetId ? { ...q, status: 'ERROR', statusMessage: 'Fout', error: err.message } : q));
    } finally {
      processingRef.current.delete(targetId);
    }
  };

  const processAll = async () => {
    const pending = queue.filter(q => q.status === 'PENDING' || q.status === 'ERROR');
    if (pending.length === 0) return;
    setIsProcessingBatch(true);
    for (const item of pending) {
      await startExtraction(item.id);
    }
    setIsProcessingBatch(false);
  };

  // ─── Preview PDF in new tab (no download) — Punt 11 Maria June 9 ─────────────
  // Maria's complaint: they had to download 5x to see the final result. Now they can
  // open the PDF inline before deciding to keep it.
  const [isGeneratingPreview, setIsGeneratingPreview] = useState(false);
  const handlePreviewPdf = async (data: ParsedCV) => {
    if (isGeneratingPreview) return; // prevent double-clicks during slow renders
    setIsGeneratingPreview(true);
    try {
      const blob = await pdf(
        <CVPdfDocument data={data} letterText={data.motivationLetter} />
      ).toBlob();
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank', 'noopener,noreferrer');
      // Revoke after a short delay so the new tab has time to load.
      // 60s is generous — typical render is under 2s.
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      console.error('PDF preview error:', err);
      alert('Fout bij genereren preview. Probeer opnieuw of gebruik Download.');
    } finally {
      setIsGeneratingPreview(false);
    }
  };

  const handleDownload = async (format: 'docx' | 'pdf', data: ParsedCV, sourceId?: string) => {
    setIsDownloadMenuOpen(false);
    try {
      // Maria juni 18: bestandsnaam "CV van Voornaam Achternaam NOVÉMBER." — spaties + accent behouden,
      // alleen filesystem-illegale tekens strippen (niet de spaties/accenten).
      const safeName = (data.personalInfo?.name || "Kandidaat").replace(/[\/\\:*?"<>|]/g, '').replace(/\s+/g, ' ').trim();
      const fileNameBase = `CV van ${safeName} NOVÉMBER`;

      const effectiveSourceId = sourceId || crypto.randomUUID();
      const contentHash = await usageService.generateHash(JSON.stringify(data));

      if (format === 'docx') {
        const blob = await generateDocxBlob(data);
        saveAs(blob, `${fileNameBase}.docx`);

        // Record conversion for DOCX
        usageService.recordConversion(effectiveSourceId, contentHash, `${fileNameBase}.docx`, data.personalInfo?.name || 'Onbekend');
      } else {
        // Generate real text-searchable PDF using @react-pdf/renderer.
        // Punt 1 — Maria June 9: merge cover letter into the same PDF as the CV.
        const blob = await pdf(
          <CVPdfDocument data={data} letterText={data.motivationLetter} />
        ).toBlob();
        saveAs(blob, `${fileNameBase}.pdf`);
        // Record conversion for PDF
        usageService.recordConversion(effectiveSourceId, contentHash, `${fileNameBase}.pdf`, data.personalInfo?.name || 'Onbekend');
      }

      // Refresh counters after recording
      refreshCounters();
    } catch (err) {
      console.error("Download error:", err);
      alert("Fout bij genereren download.");
    }
  };

  const handlePreviewEdit = (newData: ParsedCV) => {
    if (!selectedResultId) return;
    // Push current state to undo stack before applying change
    const currentItem = queue.find(i => i.id === selectedResultId);
    if (currentItem?.result) {
      const stack = undoStackRef.current.get(selectedResultId) || [];
      stack.push(JSON.parse(JSON.stringify(currentItem.result)));
      if (stack.length > 50) stack.shift(); // max 50 steps
      undoStackRef.current.set(selectedResultId, stack);
    }
    setQueue(prev => prev.map(item =>
      item.id === selectedResultId
        ? { ...item, result: newData }
        : item
    ));
  };

  const handleUndo = () => {
    if (!selectedResultId) return;
    const stack = undoStackRef.current.get(selectedResultId) || [];
    if (stack.length === 0) return;
    const previous = stack.pop();
    undoStackRef.current.set(selectedResultId, stack);
    setQueue(prev => prev.map(item =>
      item.id === selectedResultId
        ? { ...item, result: previous }
        : item
    ));
  };

  const canUndo = selectedResultId
    ? (undoStackRef.current.get(selectedResultId)?.length ?? 0) > 0
    : false;

  const renderDashboardContent = () => {
    const selectedItem = queue.find(i => i.id === selectedResultId);
    if (!selectedItem) return (
      <div className="flex flex-col items-center justify-center mt-32 text-neutral-300">
        <FileText size={64} strokeWidth={1} />
        <p className="mt-4 uppercase tracking-[0.2em] text-[10px] font-bold">Selecteer een bestand uit de wachtrij</p>
      </div>
    );

    if (selectedItem.status === 'PROCESSING') {
      return (
        <div className="flex flex-col items-center mt-32 text-center animate-fade-in">
          <div className="relative w-20 h-20 mb-8">
            <div className="absolute inset-0 border-[3px] border-neutral-100 rounded-full"></div>
            <div className="absolute inset-0 border-[3px] border-[#EE8D70] border-t-transparent rounded-full animate-spin"></div>
            <div className="absolute inset-0 flex items-center justify-center">
              <RefreshCcw size={24} className="text-[#EE8D70]" />
            </div>
          </div>
          <h3 className="font-serif text-2xl font-bold text-[#1E3A35]">{selectedItem.statusMessage}</h3>
        </div>
      );
    }

    if (selectedItem.status === 'SUCCESS' && selectedItem.result) {
      return (
        <div className="w-full flex flex-col items-center animate-fade-in">
          <div className="w-full max-w-[210mm] flex justify-between items-center mb-8 no-print">
            <div className="flex items-center gap-4">
              <div className="bg-[#4caf50]/10 text-[#4caf50] px-3 py-1 rounded-sm text-[10px] font-bold uppercase tracking-wider flex items-center gap-2">
                <CheckCircle size={12} /> Conversie geslaagd
              </div>
              {selectedItem.result?.wasFinalGradeProcessed && (
                <div
                  className="bg-[#1E3A35]/10 text-[#1E3A35] px-3 py-1 rounded-sm text-[10px] font-bold uppercase tracking-wider flex items-center gap-2"
                  title="Dit CV is verwerkt in Final-grade modus — minimale aanpassingen, geen herschrijving van bullets"
                >
                  🛡️ Final-grade
                </div>
              )}
            </div>
            <div className="relative flex flex-col items-end gap-1">
              <div className="flex items-center gap-3">
                <Button
                  onClick={() => setIsEditing(!isEditing)}
                  variant={isEditing ? "primary" : "secondary"}
                  className={clsx("h-10 px-6 transition-all", isEditing ? "bg-[#e3fd01] text-black border-[#e3fd01]" : "")}
                >
                  <Settings size={14} className="mr-2" />
                  {isEditing ? "Klaar met bewerken" : "Bewerken"}
                </Button>
                {isEditing && (
                  <button
                    onClick={handleUndo}
                    disabled={!canUndo}
                    title="Ongedaan maken (Ctrl+Z)"
                    className="h-10 px-4 flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest border border-neutral-200 text-neutral-500 hover:text-neutral-800 hover:border-neutral-400 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                  >
                    <Undo2 size={13} />
                    Ongedaan
                  </button>
                )}
                <button
                  onClick={() => handlePreviewPdf(selectedItem.result!)}
                  disabled={isGeneratingPreview}
                  title="Bekijk PDF in nieuw tabblad zonder downloaden"
                  className="py-3 text-sm tracking-widest uppercase font-semibold transition-all duration-300 disabled:opacity-50 disabled:cursor-wait flex items-center justify-center bg-white text-[#1E3A35] hover:bg-neutral-100 border border-[#1E3A35] h-10 px-6"
                >
                  {isGeneratingPreview ? '⏳ Bezig…' : '👁 Preview'}
                </button>
                <button
                  onClick={() => handleDownload('pdf', selectedItem.result!, selectedItem.id)}
                  className="py-3 text-sm tracking-widest uppercase font-semibold transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center bg-[#EE8D70] text-white hover:bg-[#E07C60] border border-transparent shadow-lg h-10 px-8"
                >
                  Download PDF
                </button>
              </div>
              {selectedItem.result?.motivationLetter && selectedItem.result.motivationLetter.trim() && (
                <span
                  className="text-[10px] text-[#1E3A35] mt-1 flex items-center gap-1"
                  title="De motivatiebrief is meegenomen in dezelfde PDF als het CV"
                >
                  📝 Motivatiebrief wordt bijgevoegd in de PDF
                </span>
              )}
              <span className="text-[10px] text-gray-500 font-mono mt-1">
                Total CVs Converted: {totalCount}
              </span>

              {/* Vacancy match scores (Punt 7) — only shows when vacancy was provided */}
              {selectedItem.result?.analysis?.vacancyMatches && selectedItem.result.analysis.vacancyMatches.length > 0 && (
                <div className="no-print mt-4 max-w-3xl bg-white border border-neutral-200 p-4 shadow-sm">
                  <div className="flex justify-between items-baseline mb-3">
                    <div className="text-[10px] font-bold uppercase tracking-widest text-[#1E3A35]">
                      Match met vacature
                    </div>
                    <span className="text-[9px] text-neutral-400 uppercase tracking-wider">
                      Groen ≥75% · Geel 50–74% · Rood &lt;50%
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    {selectedItem.result.analysis.vacancyMatches.map((match, i) => {
                      const score = match.score || 0;
                      const color = score >= 75 ? '#16A34A' : score >= 50 ? '#EAB308' : '#DC2626';
                      // Punt 7 — explain what each score dimension means
                      const explanation: Record<string, string> = {
                        'Algehele match': 'Hoe goed past deze kandidaat in totaal bij deze vacature',
                        'Werkervaring relevantie': 'Hoe sterk overlapt de werkhistorie met de vacature-eisen',
                        'Sectorkennis': 'Hoe goed kent de kandidaat de sector / het domein van de vacature',
                      };
                      const hint = explanation[match.title] || '';
                      return (
                        <div key={i} className="flex items-center gap-2 px-3 py-2 bg-neutral-50 border border-neutral-200" title={hint}>
                          <span className="text-[11px] font-semibold text-neutral-700">{match.title}</span>
                          <span
                            className="text-[12px] font-bold text-white px-2 py-0.5 rounded-full"
                            style={{ backgroundColor: color }}
                          >
                            {Math.round(score)}%
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  <div className="text-[10px] text-neutral-500 mt-3 leading-snug">
                    Deze scores zijn een <strong>indicatie op basis van de huidige CV-tekst</strong>. Het CV is ook aangepast: tags zijn herzien en bullets met overlappende concepten gebruiken nu vacature-terminologie waar feitelijk juist.
                  </div>
                </div>
              )}

              {/* Motivatiebrief textarea — Punt 1 Maria Achterberg */}
              {selectedItem.result && (
                <div className="no-print mt-4 max-w-3xl">
                  <label className="block text-[10px] font-bold uppercase tracking-widest text-[#1E3A35] mb-2">
                    Motivatiebrief (optioneel) — wordt automatisch toegevoegd als extra pagina aan de PDF-download
                  </label>
                  <textarea
                    value={selectedItem.result.motivationLetter || ''}
                    onChange={(e) => {
                      // Update result directly without pushing every keystroke to undo stack
                      // (undo stack is reserved for CV content edits)
                      const newData = { ...selectedItem.result!, motivationLetter: e.target.value };
                      setQueue(prev => prev.map(item =>
                        item.id === selectedResultId
                          ? { ...item, result: newData }
                          : item
                      ));
                    }}
                    placeholder="Geachte heer/mevrouw,&#10;&#10;Met veel enthousiasme reageer ik op de vacature..."
                    rows={6}
                    className="w-full px-3 py-2 text-sm border border-neutral-200 focus:outline-none focus:border-[#EE8D70] transition-colors font-mono leading-relaxed"
                  />
                  <p className="text-[10px] text-neutral-400 mt-1.5 leading-snug">
                    Een lege regel = nieuwe paragraaf. De brief krijgt dezelfde header (naam + logo) en footer als het CV.
                  </p>
                </div>
              )}
            </div>
          </div>
          <ScaleToCVFit
            className={clsx("print-container bg-white shadow-2xl border transition-colors", isEditing ? "border-[#e3fd01] ring-4 ring-[#e3fd01]/20" : "border-neutral-200")}
          >
            {isEditing && (
              <div className="absolute top-0 left-0 w-full bg-[#1E3A35] text-white text-xs text-center py-1.5 font-bold tracking-widest z-50 animate-fade-in no-print">
                BEWERK MODUS ACTIEF — KLIK OP TEKST OM TE WIJZIGEN
              </div>
            )}
            <CVPreview
              data={selectedItem.result}
              isEditing={isEditing}
              onChange={handlePreviewEdit}
            />
          </ScaleToCVFit>
        </div>
      );
    }

    if (selectedItem.status === 'READY') {
      return null;
    }

    if (selectedItem.status === 'PENDING' || selectedItem.status === 'ERROR') {
      return (
        <div className="flex flex-col items-center mt-32 text-center animate-fade-in">
          <div className="mb-10 opacity-30">{selectedItem.status === 'ERROR' ? <XCircle size={64} className="text-red-500" /> : <FileText size={64} className="text-neutral-500" />}</div>
          <h3 className="font-serif text-2xl font-bold text-[#1E3A35] mb-4">{selectedItem.status === 'ERROR' ? 'Fout opgetreden' : 'Gereed voor analyse'}</h3>
          {selectedItem.error && <p className="text-red-500 text-xs uppercase tracking-widest font-bold mb-8 max-w-sm bg-red-50 px-4 py-2 border border-red-100">{selectedItem.error}</p>}
          <Button onClick={() => startExtraction(selectedItem.id)} variant="primary" className="px-14 py-5 shadow-2xl scale-110"><Play size={18} className="mr-3 fill-current" /> VERWERK CV</Button>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="min-h-screen pb-20 bg-[#fdfdfd]">
      <Header usageCount={usageCount} totalCount={totalCount} onOpenUsage={() => setIsUsageModalOpen(true)} />

      {!isAuthenticated ? <LoginScreen onLogin={handleLogin} /> : (
        <>
          <UsageModal isOpen={isUsageModalOpen} onClose={() => setIsUsageModalOpen(false)} />
          <main className="container mx-auto px-4 mt-12 max-w-6xl">
            {/* Punt 9 + 13 — Recruiter-controls vóór upload: focus voor keywords + final-grade toggle */}
            <div className="mb-6 no-print max-w-3xl mx-auto bg-white border border-neutral-200 p-5 shadow-sm">
              <div className="flex flex-col gap-4">
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-widest text-[#1E3A35] mb-2">
                    Focus voor keywords (optioneel)
                  </label>
                  <input
                    type="text"
                    value={profileFocus}
                    onChange={(e) => setProfileFocus(e.target.value)}
                    placeholder="Bijv. 'jeugdzorg, crisisinterventies, regie complexe casuïstiek'"
                    className="w-full px-3 py-2 text-sm border border-neutral-200 focus:outline-none focus:border-[#EE8D70] transition-colors"
                  />
                  <p className="text-[10px] text-neutral-400 mt-1.5 leading-snug">
                    Stuurt de 5 sterke-punten-tags. Leeg laten = automatische focus op kernkwaliteiten + expertise + terugkerende sterke punten uit werkervaring.
                  </p>
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-widest text-[#1E3A35] mb-2">
                    Vacaturetekst (optioneel) — Punt 7
                  </label>
                  <textarea
                    value={vacancyText}
                    onChange={(e) => setVacancyText(e.target.value)}
                    placeholder="Plak hier de volledige vacaturetekst. De AI past dan tags + bullets aan om de match met deze vacature te tonen."
                    rows={4}
                    className="w-full px-3 py-2 text-sm border border-neutral-200 focus:outline-none focus:border-[#EE8D70] transition-colors font-mono leading-relaxed"
                  />
                  {/* Maria Punt 7 — explicit explanation of what vacancy-mode actually changes */}
                  <div className="mt-2 bg-[#1E3A35]/5 border border-[#1E3A35]/20 p-3 text-[11px] leading-relaxed text-neutral-700">
                    <div className="font-bold uppercase tracking-wider text-[10px] text-[#1E3A35] mb-1.5">
                      Wat doet deze functie precies?
                    </div>
                    <ol className="list-decimal pl-4 space-y-1">
                      <li>
                        <strong>Tags afstemmen</strong> — de 5 sterke-punten-tags krijgen woorden die in de vacature voorkomen (bv. "casuïstiekregie" in plaats van "coördineren").
                      </li>
                      <li>
                        <strong>Bullet-terminologie</strong> — bestaande bullets die hetzelfde concept beschrijven worden hertaald met vacature-woorden. <span className="text-neutral-500">Geen feiten of taken worden verzonnen of toegevoegd.</span>
                      </li>
                      <li>
                        <strong>Match-score</strong> — er verschijnt een blok met 3 scores (algemeen, ervaring, sectorkennis) zodat je in één blik ziet hoe goed deze kandidaat past.
                      </li>
                    </ol>
                    <div className="mt-2 text-neutral-500 text-[10px]">
                      <strong>Voorbeeld:</strong> vacature noemt "Wmo-consulent"; een bullet "Beoordelen van aanvragen volgens de Wet maatschappelijke ondersteuning" wordt hertaald naar "Beoordelen van Wmo-aanvragen". Dezelfde betekenis, vacature-terminologie.
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setFinalGradeMode(v => !v)}
                    className={clsx(
                      "px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest border transition-all",
                      finalGradeMode
                        ? "bg-[#1E3A35] text-white border-[#1E3A35]"
                        : "bg-white text-neutral-500 border-neutral-200 hover:border-neutral-400"
                    )}
                  >
                    {finalGradeMode ? '✓ Final-grade upload-modus' : 'Final-grade upload-modus'}
                  </button>
                  <p className="text-[10px] text-neutral-400 leading-snug flex-1">
                    Aan = al-geformatteerd CV opnieuw uploaden (alleen kleine edits + extends, geen volledige rewrite). Deze instelling blijft aan over sessies heen, dus zet 'm UIT als je weer een ruwe CV gaat verwerken. Detectie is ook automatisch op basis van bestandsnaam/inhoud.
                  </p>
                </div>
              </div>
            </div>
            <div className="mb-8 no-print"><FileUploader onFilesSelect={addToQueue} /></div>
            {queue.length > 0 && (
              <div className="flex flex-col gap-10 lg:flex-row lg:items-start">
                <div className="bg-white border border-neutral-200 flex flex-col h-[700px] shadow-sm no-print w-full lg:w-80 flex-shrink-0">
                  <div className="p-5 border-b border-neutral-100 flex justify-between items-center bg-neutral-50/50">
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-serif font-bold text-lg text-[#1E3A35]">Wachtrij</h3>
                        <span className="text-[10px] font-bold bg-[#1E3A35] text-white px-2.5 py-0.5 rounded-full">{queue.length}</span>
                      </div>
                      {(() => {
                        const pendingCount = queue.filter(q => q.status === 'PENDING' || q.status === 'ERROR').length;
                        const doneCount = queue.filter(q => q.status === 'SUCCESS').length;
                        if (pendingCount === 0) return null;
                        return (
                          <button
                            onClick={processAll}
                            disabled={isProcessingBatch}
                            className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest bg-[#EE8D70] text-white px-3 py-1.5 hover:bg-[#E07C60] disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                          >
                            {isProcessingBatch
                              ? <><Loader2 size={10} className="animate-spin" /> {doneCount} / {queue.length} verwerkt</>
                              : <><Play size={10} className="fill-current" /> Verwerk alle ({pendingCount})</>
                            }
                          </button>
                        );
                      })()}
                    </div>
                  </div>
                  <div className="flex-1 overflow-y-auto p-4 space-y-3">
                    {queue.map(item => (
                      <div key={item.id} onClick={() => setSelectedResultId(item.id)} className={clsx("p-4 border rounded-sm flex flex-col transition-all cursor-pointer group shadow-sm", selectedResultId === item.id ? "border-[#EE8D70] bg-[#EE8D70]/5" : "border-neutral-100 bg-white hover:border-neutral-200")}>
                        <div className="flex items-center gap-3 mb-2">
                          <FileText size={16} className={clsx(selectedResultId === item.id ? "text-[#EE8D70]" : "text-neutral-400")} />
                          <p className="text-[12px] font-bold truncate text-[#1E3A35] flex-1">{item.file.name}</p>
                          {item.status === 'SUCCESS' && <CheckCircle size={16} className="text-[#4caf50]" />}
                          {item.status === 'PROCESSING' && <Loader2 size={14} className="animate-spin text-[#EE8D70]" />}
                        </div>
                        <span className={clsx("text-[9px] uppercase tracking-widest font-bold", item.status === 'SUCCESS' ? "text-[#4caf50]" : "text-neutral-400")}>{item.statusMessage}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="flex-1 flex flex-col items-center min-h-[900px]">
                  {renderDashboardContent()}
                </div>
              </div>
            )}
          </main>
        </>
      )}

      {/* Print-only fixed footer — placed OUTSIDE all print-container/wrapper divs */}
      <div className="cv-print-footer-fixed">
        <div style={{
          backgroundColor: '#284d32',
          height: '80px',
          width: '100%',
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          overflow: 'hidden',
        }}>
          <div style={{
            position: 'absolute', height: '12px', backgroundColor: '#e3fd01',
            left: '0mm', width: '145mm', top: '55%', transform: 'translateY(-50%)',
          }} />
          <div style={{
            position: 'absolute', height: '12px', backgroundColor: '#e3fd01',
            left: '165mm', width: '70mm', top: '55%', transform: 'translateY(-50%)',
          }} />
          <img
            src={WHITE_ARROW_URL}
            alt=""
            style={{
              position: 'absolute', zIndex: 10,
              width: '10mm', height: '10mm',
              left: '150mm', top: '25%', transform: 'translateY(-18%)',
            }}
          />
        </div>
      </div>
    </div>
  );
};
export default App;
