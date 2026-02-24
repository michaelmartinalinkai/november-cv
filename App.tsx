
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
import { BatchItem, ParsedCV } from './types';
import { AlertCircle, FileText, CheckCircle, Clock, Loader2, XCircle, LogOut, Layout, FileDown, ChevronDown, Play, RefreshCcw, Settings, X } from 'lucide-react';
import * as mammoth from 'mammoth';
import saveAs from 'file-saver';
import { loadGoogleScripts } from './services/driveService';
import { clsx } from 'clsx';
import { config } from './config';

const MAX_WAIT_MS = 90000;

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

  const processingRef = useRef<Set<string>>(new Set());

  const refreshCounters = useCallback(() => {
    setUsageCount(usageService.getCurrentMonthCount());
    setTotalCount(usageService.getTotalCount());
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
        files: item.base64Data ? [{ mimeType: item.mimeType!, data: item.base64Data }] : undefined
      });
      const result = await extractionPromise;

      // Auto-process with 'new' template immediately
      setQueue(prev => prev.map(q => q.id === targetId ? { ...q, status: 'PROCESSING', statusMessage: 'Stijlen...' } : q));

      const finalResult = await geminiService.parseCV({
        text: JSON.stringify(result),
        template: 'new'
      });

      const sourceHash = await usageService.generateHash(JSON.stringify(result) + 'new');
      usageService.recordConversion(targetId, sourceHash, item.file.name, `gen_${targetId}_${Date.now()}`);
      refreshCounters();

      setQueue(prev => prev.map(q => q.id === targetId ? { ...q, status: 'SUCCESS', statusMessage: 'Afgerond', result: finalResult as ParsedCV, template: 'new' } : q));
    } catch (err: any) {
      setQueue(prev => prev.map(q => q.id === targetId ? { ...q, status: 'ERROR', statusMessage: 'Fout', error: err.message } : q));
    } finally {
      processingRef.current.delete(targetId);
    }
  };

  // Deprecated manual trigger (keeping for safety but unused in new flow)
  const processTemplate = async (targetId: string, template: 'old' | 'new') => {
    // Logic merged into startExtraction
  };

  const handleDownload = async (format: 'docx' | 'pdf', data: ParsedCV, template?: 'old' | 'new', sourceId?: string) => {
    setIsDownloadMenuOpen(false);
    try {
      const fileNameBase = `CV_${(data.personalInfo?.name || "Kandidaat").replace(/\s+/g, '_')}_NOVEMBER`;

      const effectiveSourceId = sourceId || crypto.randomUUID();
      const contentHash = await usageService.generateHash(JSON.stringify(data) + (template || ''));

      if (format === 'docx') {
        const blob = await generateDocxBlob(data, template);
        saveAs(blob, `${fileNameBase}.docx`);

        // Record conversion for DOCX
        usageService.recordConversion(effectiveSourceId, contentHash, `${fileNameBase}.docx`);
      } else {
        window.print();
        // Record conversion for PDF (print)
        usageService.recordConversion(effectiveSourceId, contentHash, `${fileNameBase}.pdf`);
      }

      // Refresh counters after recording
      refreshCounters();
    } catch (err) {
      console.error("Download error:", err);
      alert("Fout bij genereren download.");
    }
  };

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
              <button onClick={() => setQueue(prev => prev.map(q => q.id === selectedItem.id ? { ...q, status: 'READY', result: undefined, template: undefined } : q))} className="text-[10px] text-neutral-400 font-bold uppercase tracking-widest hover:text-[#EE8D70] transition-colors">Aanpassen</button>
            </div>
            <div className="relative flex flex-col items-end gap-1">
              <Button onClick={() => setIsDownloadMenuOpen(!isDownloadMenuOpen)} variant="primary" className="shadow-lg h-10 px-8">
                DOWNLOAD <ChevronDown size={14} className="ml-2" />
              </Button>
              <span className="text-[10px] text-gray-500 font-mono">
                Total CVs Converted: {totalCount}
              </span>
              {isDownloadMenuOpen && (
                <div className="absolute right-0 top-full mt-2 w-52 bg-white border border-neutral-200 shadow-xl z-50 py-2 rounded-sm overflow-hidden animate-fade-in">
                  <button onClick={() => handleDownload('docx', selectedItem.result!, selectedItem.template, selectedItem.id)} className="w-full text-left px-4 py-3 text-[11px] uppercase tracking-widest font-bold text-[#1E3A35] hover:bg-neutral-50 transition-colors">Microsoft Word (.docx)</button>
                  <button onClick={() => handleDownload('pdf', selectedItem.result!, selectedItem.template, selectedItem.id)} className="w-full text-left px-4 py-3 text-[11px] uppercase tracking-widest font-bold text-[#1E3A35] hover:bg-neutral-50 transition-colors">Opslaan als PDF (.pdf)</button>
                </div>
              )}
            </div>
          </div>
          <div className="scale-[0.85] lg:scale-100 origin-top transform print-container bg-white shadow-2xl mb-20 border border-neutral-200">
            <CVPreview data={selectedItem.result} template={selectedItem.template} />
          </div>
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
            <div className="mb-8 no-print"><FileUploader onFilesSelect={addToQueue} /></div>
            {queue.length > 0 && (
              <div className="flex flex-col gap-10 lg:flex-row lg:items-start">
                <div className="bg-white border border-neutral-200 flex flex-col h-[700px] shadow-sm no-print w-full lg:w-80 flex-shrink-0">
                  <div className="p-5 border-b border-neutral-100 flex justify-between items-center bg-neutral-50/50">
                    <h3 className="font-serif font-bold text-lg text-[#1E3A35]">Wachtrij</h3>
                    <span className="text-[10px] font-bold bg-[#1E3A35] text-white px-2.5 py-0.5 rounded-full">{queue.length}</span>
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
    </div>
  );
};
export default App;
