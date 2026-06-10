import React, { useRef, useState, useLayoutEffect } from 'react';
import { ParsedCV } from '../types';
import { LOGO_URL, WHITE_ARROW_URL } from '../assets';
import { EditableText } from './EditableText';
import { geminiService } from '../services/geminiService';
import { usageService } from '../services/usageService';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

// ─── SORTABLE WRAPPER ────────────────────────────────────────────────────────
// Wraps each experience block to make it draggable. Drag handle is in the children.
const SortableExpItem: React.FC<{ id: string; isEditing: boolean; children: (handleProps: any) => React.ReactNode }> = ({ id, isEditing, children }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, disabled: !isEditing });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    position: 'relative',
  };
  return (
    <div ref={setNodeRef} style={style}>
      {children({ ...attributes, ...listeners })}
    </div>
  );
};

interface CVPreviewProps {
  data: ParsedCV;
  isEditing?: boolean;
  onChange?: (newData: ParsedCV) => void;
}

const OrangeSeparator = ({ hidden, onToggle, isEditing }: { hidden?: boolean; onToggle?: () => void; isEditing?: boolean }) => (
  <div className="relative group/sep">
    {!hidden && <div className="w-full h-[1px] bg-[#f27f61] my-6 shrink-0" />}
    {hidden && isEditing && <div className="w-full h-[1px] bg-transparent my-6 shrink-0" />}
    {isEditing && (
      <button
        onClick={onToggle}
        className="print:hidden absolute right-0 top-1/2 -translate-y-1/2 text-[9px] px-1.5 py-0.5 rounded opacity-0 group-hover/sep:opacity-100 transition-opacity"
        style={{ background: hidden ? '#f27f61' : '#fee2e2', color: hidden ? 'white' : '#dc2626' }}
      >
        {hidden ? '+ lijn' : '– lijn'}
      </button>
    )}
  </div>
);


// Visual page-break ruler shown only in edit mode
const PageBreakRuler = ({ onRemove }: { onRemove: () => void }) => (
  <div className="print:hidden relative flex items-center my-2 group/pbr">
    <div className="flex-1 border-t-2 border-dashed border-blue-400 opacity-60" />
    <span className="mx-2 text-[9px] text-blue-500 font-bold whitespace-nowrap select-none">✂ PAGINA BREUK</span>
    <div className="flex-1 border-t-2 border-dashed border-blue-400 opacity-60" />
    <button
      onClick={onRemove}
      className="ml-2 text-[9px] text-red-400 hover:text-red-600 opacity-0 group-hover/pbr:opacity-100 transition-opacity"
      title="Verwijder pagina breuk"
    >✕</button>
  </div>
);

// Invisible print page break
const PrintPageBreak = () => (
  <div className="hidden print:block" style={{ pageBreakBefore: 'always', height: 0 }} />
);

const TUSSENVOEGSELS = new Set(['van', 'de', 'den', 'der', 'het', 'ten', 'ter', 'te', 'op', 'aan', 'in', 'bij', '\u2019t']);
const toTitleCase = (str: string) => {
  const words = str.toLowerCase().split(' ');
  return words.map((word, i) => {
    if (i > 0 && TUSSENVOEGSELS.has(word)) return word; // keep tussenvoegsel lowercase
    return word.charAt(0).toUpperCase() + word.slice(1);
  }).join(' ');
};

const normalizeEducationLevel = (text: string): string => {
  if (!text) return text;
  // Normalize education level abbreviations to Title Case (Hbo not HBO/hbo)
  const levels: Record<string, string> = {
    'HBO': 'Hbo', 'hbo': 'Hbo',
    'MBO': 'Mbo', 'mbo': 'Mbo',
    'MAVO': 'Mavo', 'mavo': 'Mavo',
    'HAVO': 'Havo', 'havo': 'Havo',
    'VWO': 'Vwo', 'vwo': 'Vwo',
    'VMBO': 'Vmbo', 'vmbo': 'Vmbo',
    'WO': 'Wo', 'wo': 'Wo',
  };
  return text.replace(/(HBO|MBO|MAVO|HAVO|VWO|VMBO|WO|hbo|mbo|mavo|havo|vwo|vmbo|wo)/g, (match) => levels[match] || match);
};

// If education level (hbo/mbo etc.) is in status field, move it to start of degree
// Parse period start for chronological sorting — returns YYYYMM number (higher = more recent)
const parsePeriodStart = (period: string): number => {
  if (!period) return 0;
  const p = formatDateToNumbers(period);
  // MM/YYYY
  const mmyyyy = p.match(/(\d{2})\/(\d{4})/);
  if (mmyyyy) return parseInt(mmyyyy[2]) * 100 + parseInt(mmyyyy[1]);
  // YYYY alone
  const yyyy = p.match(/(\d{4})/);
  if (yyyy) return parseInt(yyyy[1]) * 100;
  return 0;
};

// Parse period END for education sorting — heden = infinity so ongoing entries always sort first
const parsePeriodEnd = (period: string): number => {
  if (!period) return 0;
  if (/heden|nu|now|present|today/i.test(period)) return 999999; // always on top
  const p = formatDateToNumbers(period);
  // Take the LAST date in the string (end of range)
  const allMmYyyy = [...p.matchAll(/(\d{2})\/(\d{4})/g)];
  if (allMmYyyy.length > 0) {
    const last = allMmYyyy[allMmYyyy.length - 1];
    return parseInt(last[2]) * 100 + parseInt(last[1]);
  }
  const allYyyy = [...p.matchAll(/(\d{4})/g)];
  if (allYyyy.length > 0) {
    const last = allYyyy[allYyyy.length - 1];
    return parseInt(last[1]) * 100;
  }
  return 0;
};

// Split a period string into start and end parts for aligned rendering
// "2015 - 2020" → { start: "2015", end: "2020" }
// "09/2019 - heden" → { start: "09/2019", end: "heden" }
// "2015" → { start: "2015", end: "" }
const splitPeriod = (period: string): { start: string; end: string } => {
  const normalized = formatDateToNumbers(period || '');
  const sep = normalized.match(/\s[-–—]\s/);
  if (sep) {
    const idx = normalized.indexOf(sep[0]);
    return {
      start: normalized.slice(0, idx).trim(),
      end: normalized.slice(idx + sep[0].length).trim(),
    };
  }
  return { start: normalized.trim(), end: '' };
}; 

// Strip month from a date part — "09/2019" → "2019", "2019" → "2019", "heden" → "heden"
const yearOnly = (part: string): string => {
  const m = part.match(/(\d{4})/);
  return m ? m[1] : part;
};

const fixEducationEntry = (edu: { period: string; degree: string; status: string; school?: string }) => {
  const levelPattern = /^(Hbo|Mbo|Mavo|Havo|Vwo|Vmbo|Wo|HBO|MBO|MAVO|HAVO|VWO|VMBO|WO|hbo|mbo|mavo|havo|vwo|vmbo|wo)$/i;
  let { degree, status } = edu;

  // If status is just an education level, prepend it to degree
  if (levelPattern.test(status.trim())) {
    const level = normalizeEducationLevel(status.trim());
    degree = degree.startsWith(level) ? degree : `${level} ${degree}`;
    status = 'diploma behaald';
  }

  // Normalize any education levels within degree
  degree = normalizeEducationLevel(degree);

  // Only show status if it is a form of "behaald" — everything else is hidden
  const BEHAALD = /^(diploma behaald|propedeuse behaald|certificaat behaald)$/i;
  if (!BEHAALD.test(status.trim())) {
    status = '';
  }

  return { ...edu, degree, status };
};

// Strip redundant category prefix from course titles (e.g. "Cursus EHBO" → "EHBO")
const stripCoursePrefix = (title: string): string =>
  title.replace(/^(cursus|training|opleiding|workshop|e-learning|webinar)\s+/i, '').trim();

const formatDateToNumbers = (text: string): string => {
  if (!text) return text;

  const monthMap: Record<string, string> = {
    'januari': '01', 'februari': '02', 'maart': '03', 'april': '04', 'mei': '05', 'juni': '06',
    'juli': '07', 'augustus': '08', 'september': '09', 'oktober': '10', 'november': '11', 'december': '12',
    'january': '01', 'february': '02', 'march': '03', 'may': '05', 'june': '06',
    'july': '07', 'august': '08', 'october': '10',
    'jan': '01', 'feb': '02', 'mrt': '03', 'mar': '03', 'apr': '04', 'jun': '06', 'jul': '07',
    'aug': '08', 'sep': '09', 'sept': '09', 'okt': '10', 'oct': '10', 'nov': '11', 'dec': '12',
  };

  // Step 1: normalize em/en dash → ' - '
  let result = text.replace(/\s*[–—]\s*/g, ' - ');

  // Step 2: "sept 2023" / "september 2023" → "09/2023"
  result = result.replace(/([a-zA-Z]+)'?\s+(\d{4})/g, (match, monthStr, yearStr) => {
    const key = monthStr.toLowerCase().replace(/['.]/g, '');
    const num = monthMap[key];
    return num ? num + '/' + yearStr : match;
  });

  // Step 3: zero-pad single-digit months "7/2023" → "07/2023"
  result = result.replace(/(\s|^|-)(\d)\/(\d{4})/g, (m, pre, d, y) => pre + '0' + d + '/' + y);

  // Step 4: normalize heden/nu/now/present → 'heden'
  result = result.replace(/\b(nu|now|present|today)\b/gi, 'heden');

  // Step 5a: normalize " / " separator (not part of MM/YYYY) → ' - '
  result = result.replace(/ \/ /g, ' - ');

  // Step 5b: catch YYYY/YYYY pattern (no spaces, e.g. "2005/2006") → "2005 - 2006"
  // Must NOT match MM/YYYY so only replace when both sides are 4-digit years
  result = result.replace(/\b(\d{4})\/(\d{4})\b/g, '$1 - $2');

  // Step 5c: catch plain YYYY-YYYY (no spaces, e.g. "2014-2019") → "2014 - 2019"
  result = result.replace(/\b(\d{4})-(\d{4})\b/g, '$1 - $2');

  return result;
};


export const CVPreview: React.FC<CVPreviewProps> = ({ data, isEditing, onChange }) => {
  // ==================== NEW: DYNAMIC SPACER LOGIC ====================
  // ALL hooks must be declared before any conditional return
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);           // wraps header + body
  const footerRef = useRef<HTMLDivElement>(null);
  const pageHeightRef = useRef<HTMLDivElement>(null);        // hidden 297mm reference
  const [spacerHeight, setSpacerHeight] = useState(0);
  const [regeneratingIndices, setRegeneratingIndices] = useState<Set<number>>(new Set());
  // Ref always points to latest data — used inside async handlers to avoid stale-closure bugs
  const dataRef = useRef(data);
  dataRef.current = data;

  // Punt 11 — Page-break overlay in edit mode
  // Bereken het aantal en de pixel-offsets van A4 paginabreuken zodat we een
  // dotted line op iedere 297mm-grens kunnen tekenen tijdens bewerken.
  const [pageBreaks, setPageBreaks] = useState<{ pagePx: number; totalPx: number }>({ pagePx: 0, totalPx: 0 });

  useLayoutEffect(() => {
    if (!data) return; // guard inside effect — hooks must always be called
    const calculateSpacer = () => {
      if (!contentRef.current || !footerRef.current || !pageHeightRef.current) return;

      const pagePx = pageHeightRef.current.offsetHeight; // exact 297mm in current browser
      if (pagePx === 0) return;

      const contentHeight = contentRef.current.offsetHeight;
      const footerHeight = footerRef.current.offsetHeight;

      const totalBeforeSpacer = contentHeight + footerHeight;
      const remainder = totalBeforeSpacer % pagePx;
      const needed = remainder === 0 ? 0 : pagePx - remainder;

      // Only push footer to page bottom if last page is at least 75% full.
      // If the last page is mostly empty, footer sits naturally below content — no giant gap.
      const lastPageUsed = pagePx - needed;
      setSpacerHeight(lastPageUsed >= pagePx * 0.75 ? needed : 0);

      // Punt 11 — sla totaal aantal pixels content op zodat we paginabreuken kunnen renderen
      setPageBreaks({ pagePx, totalPx: contentHeight + footerHeight });
    };

    // Run after every render + when data changes
    calculateSpacer();

    // Optional safety net
    const timer = setTimeout(calculateSpacer, 50);
    return () => clearTimeout(timer);
  }, [data]); // ← important: re-calculate every time the CV data changes

  // Early return AFTER all hooks (React rules)
  if (!data) return null;

  // --- NEW STYLE PREVIEW ---
  const rawTags = data.analysis?.tags || [];
  const displaySkills = [...rawTags.slice(0, 5)];
  while (displaySkills.length < 5) displaySkills.push("Professional");

  // ─── Drag-and-drop sensors (Punt 5) ─────────────────────────────────────
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }), // 8px movement before drag starts
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleExpDragEnd = (event: DragEndEvent) => {
    if (!onChange) return;
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const activeIdx = parseInt((active.id as string).replace('exp-', ''));
    const overIdx = parseInt((over.id as string).replace('exp-', ''));
    if (isNaN(activeIdx) || isNaN(overIdx)) return;
    const newData = JSON.parse(JSON.stringify(data));
    newData.experience = arrayMove(newData.experience, activeIdx, overIdx);
    newData.manualOrder = true; // mark CV as manually ordered → render uses array order
    onChange(newData);
  };

  const handleResetOrder = () => {
    if (!onChange) return;
    const newData = JSON.parse(JSON.stringify(data));
    newData.manualOrder = false;
    onChange(newData);
  };

  const handleRegenerateJob = async (expIdx: number) => {
    if (!data?.experience) return;
    const job = data.experience[expIdx];
    setRegeneratingIndices(prev => new Set(prev).add(expIdx));
    try {
      // Punt 12 fix — always rewrite FROM the original bullets (snapshot at first conversion),
      // not from the current (possibly already-paraphrased) bullets. Prevents semantic drift
      // across multiple "rewrite" clicks. Fall back to current bullets if no snapshot exists
      // (e.g. for old CVs from before this feature).
      const inputBullets = (job.originalBullets && job.originalBullets.length > 0)
        ? job.originalBullets
        : job.bullets;
      const result = await geminiService.regenerateJob({
        period: job.period,
        employer: job.employer,
        role: job.role,
        bullets: inputBullets,
      });
      if (result.bullets.length > 0) {
        // Use ref to get LATEST data (user might have made edits during regenerate)
        const freshData = dataRef.current;
        const newData = JSON.parse(JSON.stringify(freshData));
        // Verify the experience at expIdx is still THE SAME job (user might have deleted/reordered).
        // Match on employer + period as a fingerprint.
        const currentJob = newData.experience?.[expIdx];
        const stillSameJob = currentJob
          && currentJob.employer === job.employer
          && currentJob.period === job.period;
        if (stillSameJob) {
          newData.experience[expIdx].bullets = result.bullets;
          onChange?.(newData);
          usageService.recordRegenerate(
            freshData.personalInfo?.name || 'unknown',
            freshData.personalInfo?.name || 'Onbekend',
            job.role
          );
        } else {
          console.warn('[Regenerate] Job at index changed during API call — discarding result to avoid corruption.');
        }
      }
    } catch (e) {
      console.error('Regenerate failed', e);
    } finally {
      setRegeneratingIndices(prev => {
        const next = new Set(prev);
        next.delete(expIdx);
        return next;
      });
    }
  };

  const handleEdit = (path: (string | number)[], value: string) => {
    if (!onChange) return;
    const newData = JSON.parse(JSON.stringify(data)); // Deep clone
    let current = newData;
    for (let i = 0; i < path.length - 1; i++) {
      if (current[path[i]] === undefined) {
        current[path[i]] = typeof path[i + 1] === 'number' ? [] : {};
      }
      current = current[path[i]];
    }
    current[path[path.length - 1]] = value;

    // Punt 12 — when a bullet is manually edited, sync the originalBullets snapshot.
    // This way the next "rewrite bullets" call uses the user's manual edit as the baseline
    // (instead of discarding it by reverting to the pre-edit original).
    // Path shape: ['experience', expIdx, 'bullets', bulletIdx]
    if (
      path.length === 4 &&
      path[0] === 'experience' &&
      typeof path[1] === 'number' &&
      path[2] === 'bullets' &&
      typeof path[3] === 'number'
    ) {
      const expIdx = path[1] as number;
      const bulletIdx = path[3] as number;
      const exp = newData.experience?.[expIdx];
      if (exp) {
        if (!Array.isArray(exp.originalBullets)) {
          exp.originalBullets = Array.isArray(exp.bullets) ? [...exp.bullets] : [];
        }
        // Ensure the array has enough slots (in case user added new bullets beyond original count)
        while (exp.originalBullets.length <= bulletIdx) {
          exp.originalBullets.push('');
        }
        exp.originalBullets[bulletIdx] = value;
      }
    }

    onChange(newData);
  };

  // Header content (reusable for both screen and print)
  const headerContent = (
    <div className="bg-[#284d32] text-white p-12 py-8 flex justify-between items-start relative z-10 min-h-[140px]">
      <div className="flex flex-col justify-center h-full">
        <h1
          className="leading-tight mb-1"
          style={{ fontSize: '41.1px', fontWeight: 800, letterSpacing: '-0.03em', fontFamily: 'Garet, sans-serif' }}
        >
          <EditableText
            value={toTitleCase(data.personalInfo?.name || "Kandidaat Naam")}
            onChange={(v) => handleEdit(['personalInfo', 'name'], v)}
            isEditing={!!isEditing}
          />
        </h1>
        <div className="text-[#e3fd01]" style={{ fontSize: '10px', fontFamily: 'Agrandir, sans-serif', fontWeight: 400 }}>
          {isEditing ? (
            <div className="flex flex-col gap-1 items-start mt-2">
              <div className="flex items-center gap-2"><span className="opacity-50">Beschikbaarheid:</span> <EditableText value={data.personalInfo?.availability || ''} onChange={(v) => handleEdit(['personalInfo', 'availability'], v)} isEditing={true} /></div>
              <div className="flex items-center gap-2"><span className="opacity-50">Uren:</span> <EditableText value={data.personalInfo?.hours || ''} onChange={(v) => handleEdit(['personalInfo', 'hours'], v)} isEditing={true} /></div>
              <div className="flex items-center gap-2"><span className="opacity-50">Geslacht:</span> <EditableText value={data.personalInfo?.gender || ''} onChange={(v) => handleEdit(['personalInfo', 'gender'], v)} isEditing={true} /></div>
              <div className="flex items-center gap-2"><span className="opacity-50">Woonplaats:</span> <EditableText value={data.personalInfo?.placeOfResidence || ''} onChange={(v) => handleEdit(['personalInfo', 'placeOfResidence'], v)} isEditing={true} /></div>
              <div className="flex items-center gap-2"><span className="opacity-50">Vakantieschema:</span> <EditableText value={data.personalInfo?.holidaySchedule || ''} onChange={(v) => handleEdit(['personalInfo', 'holidaySchedule'], v)} isEditing={true} /></div>
              <div className="flex items-center gap-2"><span className="opacity-50">SKJ Nummer:</span> <EditableText value={data.personalInfo?.skj || ''} onChange={(v) => handleEdit(['personalInfo', 'skj'], v)} isEditing={true} /></div>
              <div className="flex items-center gap-2"><span className="opacity-50">SKJ Afgegeven:</span> <EditableText value={data.personalInfo?.skjDate || ''} onChange={(v) => handleEdit(['personalInfo', 'skjDate'], v)} isEditing={true} /></div>
            </div>
          ) : (
            (() => {
              const isValid = (v?: string | null) => v && v.trim() !== '' && !v.toLowerCase().includes('niet gespecificeerd') && !v.toLowerCase().includes('onbekend');
              const parts: string[] = [];
              const avail = (data.personalInfo!.availability! || '').trim();
              const lowerAvail = avail.toLowerCase().trim();
              let availStr: string;
              if (lowerAvail.includes('direct')) {
                availStr = 'Per direct beschikbaar';
              } else if (lowerAvail.includes('beschikbaar')) {
                availStr = avail; // user wrote their own complete phrase
              } else {
                availStr = `Beschikbaar per ${avail}`;
              }
              parts.push(isValid(data.personalInfo?.availability) ? availStr : 'Beschikbaar op aanvraag');
              if (isValid(data.personalInfo?.hours)) {
                const h = data.personalInfo!.hours!;
                parts.push(`${h}${h.includes('uur per week') ? '' : ' uur per week'}`);
              }
              // Punt 2 — Maria June 9: gender comes BEFORE woonplaats, and woonplaats gets a "Woonplaats:" label
              if (isValid(data.personalInfo?.gender)) {
                parts.push(data.personalInfo!.gender!);
              }
              if (isValid(data.personalInfo?.placeOfResidence)) {
                parts.push(`Woonplaats: ${data.personalInfo!.placeOfResidence!}`);
              }
              if (isValid(data.personalInfo?.holidaySchedule)) {
                parts.push(`Vakantieschema: ${data.personalInfo!.holidaySchedule}`);
              }
              if (isValid(data.personalInfo?.skj)) {
                const skj = data.personalInfo!.skj!;
                parts.push(`SKJ-Registratie: ${skj}`);
                if (isValid(data.personalInfo?.skjDate)) parts.push(`Afgegeven op ${data.personalInfo!.skjDate}`);
              }
              return (
                <span style={{ display: 'flex', flexWrap: 'wrap', gap: '0 0', lineHeight: 1.5 }}>
                  {parts.map((part, i) => (
                    <span key={i} style={{ whiteSpace: 'nowrap' }}>
                      {part}{i < parts.length - 1 && <span style={{ margin: '0 4px' }}>|</span>}
                    </span>
                  ))}
                </span>
              );
            })()
          )}
        </div>
      </div>
      <div className="flex-shrink-0 mt-0">
        <img
          src={LOGO_URL}
          alt="Novêmber."
          className="w-[80px] h-auto object-contain"
        />
      </div>
    </div>
  );

  // Footer content (reusable for both screen and print)
  const footerContent = (
    <div className="bg-[#284d32] h-[80px] w-full relative flex items-center overflow-hidden">
      <div className="absolute h-[12px] bg-[#e3fd01] flex items-center" style={{ left: '0mm', width: '145mm', top: '55%', transform: 'translateY(-50%)' }}>
      </div>
      <div className="absolute h-[12px] bg-[#e3fd01]" style={{ left: '165mm', width: '70mm', top: '55%', transform: 'translateY(-50%)' }}></div>
      <img
        src={WHITE_ARROW_URL}
        alt=""
        className="absolute z-10 w-[10mm] h-[10mm]"
        style={{ left: '150mm', top: '25%', transform: 'translateY(-18%)' }}
      />
    </div>
  );

  // Main body content
  const bodyContent = (
    <div className="p-12 pt-6">
      <section className="mb-6 flex flex-col items-center w-full">
        <h3 className="tracking-[0.01em] text-center mb-3 uppercase text-black" style={{ fontSize: '11pt', fontWeight: 550, textShadow: '0.2px 0 0 currentColor, -0.2px 0 0 currentColor' }}>
          WAAR DEZE PROFESSIONAL STERK IN IS
        </h3>
        <div className="flex flex-col items-center gap-y-3 w-full">
          {/* Row 1: always 3 pills */}
          <div className="flex justify-center gap-x-4">
            {displaySkills.slice(0, 3).map((skill, i) => (
              <div
                key={i}
                className="bg-[#f27f61] text-white px-6 py-2 rounded-full text-center flex items-center justify-center min-w-[140px]"
                style={{ fontSize: '12px', fontFamily: 'Garet, sans-serif', fontWeight: 700, textTransform: 'uppercase' }}
              >
                <EditableText
                  value={skill}
                  onChange={(v) => handleEdit(['analysis', 'tags', i], v)}
                  isEditing={!!isEditing}
                />
              </div>
            ))}
          </div>
          {/* Row 2: always 2 pills */}
          <div className="flex justify-center gap-x-4">
            {displaySkills.slice(3, 5).map((skill, i) => (
              <div
                key={i}
                className="bg-[#f27f61] text-white px-6 py-2 rounded-full text-center flex items-center justify-center min-w-[140px]"
                style={{ fontSize: '12px', fontFamily: 'Garet, sans-serif', fontWeight: 700, textTransform: 'uppercase' }}
              >
                <EditableText
                  value={skill}
                  onChange={(v) => handleEdit(['analysis', 'tags', i + 3], v)}
                  isEditing={!!isEditing}
                />
              </div>
            ))}
          </div>
        </div>

      </section>

      <section className="mb-6">
        <div className="inline-block bg-[#e3fd01] px-3 py-1 mb-3">
          <h3 className="uppercase text-black" style={{ fontSize: '12px', fontWeight: 700, fontFamily: 'Agrandir, sans-serif' }}>OPLEIDINGEN</h3>
        </div>
        <div className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1" style={{ fontSize: '10.66px', fontFamily: 'Garet, sans-serif' }}>
          {(() => {
            const tagged = (data.education || []).map((edu, idx) => ({ ...edu, __origIdx: idx }));
            const sorted = isEditing
              ? tagged
              : [...tagged].sort((a, b) => parsePeriodEnd(b.period) - parsePeriodEnd(a.period));
            return sorted.map((edu, si) => {
              const origIdx = edu.__origIdx;
              const fixedEdu = fixEducationEntry(edu);
              return (
              <React.Fragment key={si}>
                <div className="opacity-70 font-normal flex items-start gap-1">
                  {isEditing && (
                    <span className="print:hidden flex flex-col mr-1">
                      <button
                        disabled={si === 0}
                        onClick={() => {
                          if (!onChange) return;
                          const newData = JSON.parse(JSON.stringify(data));
                          const aIdx = sorted[si].__origIdx;
                          const bIdx = sorted[si - 1].__origIdx;
                          [newData.education[aIdx], newData.education[bIdx]] = [newData.education[bIdx], newData.education[aIdx]];
                          onChange(newData);
                        }}
                        className="text-[8px] leading-none text-gray-400 hover:text-gray-700 disabled:opacity-20 disabled:cursor-not-allowed"
                        title="Omhoog"
                      >▲</button>
                      <button
                        disabled={si === sorted.length - 1}
                        onClick={() => {
                          if (!onChange) return;
                          const newData = JSON.parse(JSON.stringify(data));
                          const aIdx = sorted[si].__origIdx;
                          const bIdx = sorted[si + 1].__origIdx;
                          [newData.education[aIdx], newData.education[bIdx]] = [newData.education[bIdx], newData.education[aIdx]];
                          onChange(newData);
                        }}
                        className="text-[8px] leading-none text-gray-400 hover:text-gray-700 disabled:opacity-20 disabled:cursor-not-allowed"
                        title="Omlaag"
                      >▼</button>
                    </span>
                  )}
                  {isEditing && <div className="print:hidden text-[8px] text-gray-400 uppercase tracking-wider font-semibold mb-0.5">Periode</div>}
                  {isEditing ? (
                    <EditableText value={formatDateToNumbers(fixedEdu.period) || ''} onChange={(v) => handleEdit(['education', origIdx, 'period'], v)} isEditing={true} />
                  ) : (
                    (() => {
                      const { start, end } = splitPeriod(fixedEdu.period);
                      return (
                        <span className="inline-grid whitespace-nowrap" style={{ gridTemplateColumns: '4.5ch 1.5ch 4.5ch', fontVariantNumeric: 'tabular-nums' }}>
                          <span className="text-left">{yearOnly(start)}</span>
                          <span className="text-center">{end ? '-' : ''}</span>
                          <span className="text-left">{yearOnly(end)}</span>
                        </span>
                      );
                    })()
                  )}
                </div>
                <div className="leading-snug flex items-start justify-between gap-2">
                  <div>
                    {isEditing && <div className="print:hidden text-[8px] text-gray-400 uppercase tracking-wider font-semibold mb-0.5 mt-1.5">Opleiding</div>}
                    <span className="text-black inline">
                      <EditableText value={fixedEdu.degree || ''} onChange={(v) => handleEdit(['education', origIdx, 'degree'], v)} isEditing={!!isEditing} multiline />
                    </span>
                    {(edu.school || isEditing) && (
                      <>
                        {isEditing && <div className="print:hidden text-[8px] text-gray-400 uppercase tracking-wider font-semibold mb-0.5 mt-1.5">Onderwijsinstelling</div>}
                        <span className="font-normal opacity-70">{!isEditing && ', '}<EditableText value={edu.school || ''} onChange={(v) => handleEdit(['education', origIdx, 'school'], v)} isEditing={!!isEditing} /></span>
                      </>
                    )}
                    {isEditing && <div className="print:hidden text-[8px] text-gray-400 uppercase tracking-wider font-semibold mb-0.5 mt-1.5">Status (diploma behaald / in afronding / niet afgerond)</div>}
                    <span className="font-normal opacity-70 whitespace-nowrap">
                      {fixedEdu.status ? <>{!isEditing && ' - '}<EditableText value={fixedEdu.status} onChange={(v) => handleEdit(['education', origIdx, 'status'], v)} isEditing={!!isEditing} /></> : (isEditing ? <EditableText value='' onChange={(v) => handleEdit(['education', origIdx, 'status'], v)} isEditing={true} /> : null)}
                    </span>
                  </div>
                  {isEditing && (
                    <div className="print:hidden flex gap-1 shrink-0">
                      <button
                        className="text-[9px] text-blue-400 hover:text-blue-600 whitespace-nowrap"
                        title="Verplaats naar cursussen"
                        onClick={() => {
                          if (!onChange) return;
                          const newData = JSON.parse(JSON.stringify(data));
                          const edu = newData.education[origIdx];
                          // Move to courses: use degree as title, keep period
                          if (!newData.courses) newData.courses = [];
                          newData.courses.push({ period: edu.period || '', title: edu.degree || '', institute: [edu.school, edu.plaats].filter(Boolean).join(', ') });
                          newData.education.splice(origIdx, 1);
                          onChange(newData);
                        }}
                      >→ cursus</button>
                      <button
                        className="text-[10px] text-red-400 hover:text-red-600"
                        title="Verwijder opleiding"
                        onClick={() => {
                          if (!onChange) return;
                          const newData = JSON.parse(JSON.stringify(data));
                          newData.education.splice(origIdx, 1);
                          onChange(newData);
                        }}
                      >✕</button>
                    </div>
                  )}
                </div>
              </React.Fragment>
            );
            });
          })()}
        </div>
        {isEditing && (
          <button
            className="print:hidden mt-2 text-[10px] text-green-600 hover:text-green-800 font-medium"
            onClick={() => {
              if (!onChange) return;
              const newData = JSON.parse(JSON.stringify(data));
              if (!newData.education) newData.education = [];
              newData.education.push({ period: '', degree: '', status: 'diploma behaald', school: '' });
              onChange(newData);
            }}
          >+ opleiding toevoegen</button>
        )}
      </section>

      {((data.courses && data.courses.length > 0) || isEditing) && (
        <section className="mb-6">
          <div className="inline-block bg-[#e3fd01] px-3 py-1 mb-2">
            <h3 className="uppercase text-black" style={{ fontSize: '12px', fontWeight: 700, fontFamily: 'Agrandir, sans-serif' }}>CURSUSSEN</h3>
          </div>
          {isEditing ? (
            <div className="space-y-2">
              {(data.courses || []).map((c, ci) => (
                <div key={ci} className="print:hidden flex items-start gap-2 group/course pl-1 py-1.5 border-l-2 border-neutral-100 pl-2">
                  <span className="text-gray-300 text-[10px] shrink-0 mt-2">•</span>
                  <div className="flex-1 grid grid-cols-12 gap-x-2">
                    <div className="col-span-3">
                      <div className="text-[8px] text-gray-400 uppercase tracking-wider font-semibold mb-0.5">Jaar</div>
                      <span className="text-[10.66px]" style={{ fontFamily: 'Garet, sans-serif' }}>
                        <EditableText
                          value={c.period || ''}
                          onChange={(v) => {
                            if (!onChange) return;
                            const newData = JSON.parse(JSON.stringify(data));
                            newData.courses[ci].period = v;
                            onChange(newData);
                          }}
                          isEditing={true}
                        />
                      </span>
                    </div>
                    <div className="col-span-5">
                      <div className="text-[8px] text-gray-400 uppercase tracking-wider font-semibold mb-0.5">Cursus / certificaat</div>
                      <span className="text-[10.66px]" style={{ fontFamily: 'Garet, sans-serif' }}>
                        <EditableText
                          value={stripCoursePrefix(c.title)}
                          onChange={(v) => {
                            if (!onChange) return;
                            const newData = JSON.parse(JSON.stringify(data));
                            newData.courses[ci].title = v;
                            onChange(newData);
                          }}
                          isEditing={true}
                        />
                      </span>
                    </div>
                    <div className="col-span-4">
                      <div className="text-[8px] text-gray-400 uppercase tracking-wider font-semibold mb-0.5">Instituut (optioneel)</div>
                      <span className="text-[10.66px] opacity-70" style={{ fontFamily: 'Garet, sans-serif' }}>
                        <EditableText
                          value={c.institute || ''}
                          onChange={(v) => {
                            if (!onChange) return;
                            const newData = JSON.parse(JSON.stringify(data));
                            newData.courses[ci].institute = v;
                            onChange(newData);
                          }}
                          isEditing={true}
                        />
                      </span>
                    </div>
                  </div>
                  <button
                    className="text-[9px] text-blue-400 hover:text-blue-600 whitespace-nowrap opacity-0 group-hover/course:opacity-100 transition-opacity mt-3"
                    title="Verplaats naar opleidingen"
                    onClick={() => {
                      if (!onChange) return;
                      const newData = JSON.parse(JSON.stringify(data));
                      const course = newData.courses[ci];
                      if (!newData.education) newData.education = [];
                      newData.education.push({
                        period: course.period || '',
                        degree: stripCoursePrefix(course.title),
                        status: 'certificaat behaald',
                        school: course.institute || ''
                      });
                      newData.courses.splice(ci, 1);
                      onChange(newData);
                    }}
                  >→ opleiding</button>
                  <button
                    className="text-[10px] text-red-400 hover:text-red-600 opacity-0 group-hover/course:opacity-100 transition-opacity mt-3"
                    title="Verwijder cursus"
                    onClick={() => {
                      if (!onChange) return;
                      const newData = JSON.parse(JSON.stringify(data));
                      newData.courses.splice(ci, 1);
                      onChange(newData);
                    }}
                  >✕</button>
                </div>
              ))}
              <button
                className="print:hidden mt-1 text-[10px] text-green-600 hover:text-green-800 font-medium"
                onClick={() => {
                  if (!onChange) return;
                  const newData = JSON.parse(JSON.stringify(data));
                  if (!newData.courses) newData.courses = [];
                  newData.courses.push({ period: '', title: '', institute: '' });
                  onChange(newData);
                }}
              >+ cursus toevoegen</button>
            </div>
          ) : (
            <p className="pl-1" style={{ fontSize: '10.66px', fontFamily: 'Garet, sans-serif' }}>
              {(data.courses || []).map(c => stripCoursePrefix(c.title)).filter(t => t && t.trim()).join(' | ')}
            </p>
          )}
        </section>
      )}

      <OrangeSeparator
        hidden={(data.hideSeparators || [])[0]}
        isEditing={isEditing}
        onToggle={() => {
          if (!onChange) return;
          const newData = JSON.parse(JSON.stringify(data));
          if (!newData.hideSeparators) newData.hideSeparators = [];
          newData.hideSeparators[0] = !newData.hideSeparators[0];
          onChange(newData);
        }}
      />

      <section className="mb-6">
        <div className="inline-block bg-[#e3fd01] px-3 py-1 mb-4" style={{ breakAfter: 'avoid', pageBreakAfter: 'avoid' }}>
          <h3 className="uppercase text-black" style={{ fontSize: '12px', fontWeight: 700, fontFamily: 'Agrandir, sans-serif' }}>WERKERVARING</h3>
        </div>
        <div className="space-y-5">
          {(() => {
            // Tag each item with its original index BEFORE sorting to avoid findIndex collisions.
            // In edit mode: keep array order so reorder arrows/drag-and-drop visually work.
            // In view/print mode:
            //   - Pinned items ALWAYS come first (Maria June 9: pin must override even after drag-drop)
            //   - Within pinned/unpinned groups: respect manualOrder if set, else date-sort
            const tagged = (data.experience || []).map((exp, idx) => ({ ...exp, __origIdx: idx }));
            const sorted = isEditing
              ? tagged
              : (() => {
                  const pinned = tagged.filter(e => e.pinned);
                  const unpinned = tagged.filter(e => !e.pinned);
                  if (data.manualOrder) {
                    // Both halves keep their existing array order
                    return [...pinned, ...unpinned];
                  }
                  const byDate = (a: typeof tagged[number], b: typeof tagged[number]) =>
                    parsePeriodStart(b.period) - parsePeriodStart(a.period);
                  return [...[...pinned].sort(byDate), ...[...unpinned].sort(byDate)];
                })();
            const expIds = sorted.map(e => `exp-${e.__origIdx}`);
            return (
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleExpDragEnd}>
                <SortableContext items={expIds} strategy={verticalListSortingStrategy}>
                  {sorted.map((exp, si) => {
              const originalIdx = exp.__origIdx;
              return (
                <SortableExpItem id={`exp-${originalIdx}`} key={`exp-${originalIdx}`} isEditing={!!isEditing}>{(dragHandle) => (
                <div key={`exp-${originalIdx}`} className={`relative group/exp ${isEditing ? 'pl-9' : ''}`} style={{ fontFamily: 'Garet, sans-serif' }}>
                  {/* Drag handle (Punt 5) — only in edit mode. Made more visible per Maria June 9 Punt 4. */}
                  {isEditing && (
                    <button
                      {...dragHandle}
                      className="print:hidden absolute -left-2 top-0 cursor-grab active:cursor-grabbing text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100 rounded transition-colors p-1.5 select-none touch-none"
                      title="Sleep om te verplaatsen"
                      aria-label="Verplaats deze functie"
                      style={{ touchAction: 'none' }}
                    >
                      <svg width="16" height="16" viewBox="0 0 14 14" fill="currentColor" aria-hidden="true">
                        <circle cx="4" cy="3" r="1.5"/>
                        <circle cx="4" cy="7" r="1.5"/>
                        <circle cx="4" cy="11" r="1.5"/>
                        <circle cx="10" cy="3" r="1.5"/>
                        <circle cx="10" cy="7" r="1.5"/>
                        <circle cx="10" cy="11" r="1.5"/>
                      </svg>
                    </button>
                  )}
                  {/* Page break ruler (edit mode only) */}
                  {exp.pageBreakBefore && isEditing && (
                    <PageBreakRuler onRemove={() => {
                      if (!onChange) return;
                      const newData = JSON.parse(JSON.stringify(data));
                      if (originalIdx !== -1) newData.experience[originalIdx].pageBreakBefore = false;
                      onChange(newData);
                    }} />
                  )}
                  {exp.pageBreakBefore && <PrintPageBreak />}

                  {/* Reorder arrows removed per Maria June 9 Punt 4 — drag-and-drop replaces them */}

                  <div className="mb-2" style={{ breakInside: 'avoid', pageBreakInside: 'avoid', breakAfter: 'avoid', pageBreakAfter: 'avoid' }}>
                    {exp.pinned && (
                      <div className="print:hidden inline-block bg-blue-100 text-blue-700 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded mb-1">
                        📌 Vastgepind bovenaan
                      </div>
                    )}
                    {isEditing && <div className="print:hidden text-[8px] text-gray-400 uppercase tracking-wider font-semibold mb-0.5">Datum</div>}
                    <span className="block opacity-80" style={{ fontSize: '10.66px' }}>
                      <EditableText value={formatDateToNumbers(exp.period) || ''} onChange={(v) => handleEdit(['experience', originalIdx, 'period'], v)} isEditing={!!isEditing} />
                    </span>
                    {isEditing && <div className="print:hidden text-[8px] text-gray-400 uppercase tracking-wider font-semibold mb-0.5 mt-1.5">Werkgever | Functie</div>}
                    <div style={{ fontSize: '10.66px' }}>
                      <span className="text-black">
                        <EditableText value={exp.employer || ''} onChange={(v) => handleEdit(['experience', originalIdx, 'employer'], v)} isEditing={!!isEditing} multiline />
                      </span>
                      <span className="text-black/80 mx-1">|</span>
                      <span className="text-black font-bold uppercase" style={{ fontSize: '11px', fontFamily: 'Garet, sans-serif' }}>
                        <EditableText
                          value={exp.role.toUpperCase().startsWith((exp.employer || '').toUpperCase())
                            ? exp.role.replace(new RegExp(`^${(exp.employer || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\|?\\s*`, 'i'), '').trim()
                            : exp.role}
                          onChange={(v) => handleEdit(['experience', originalIdx, 'role'], v)}
                          isEditing={!!isEditing}
                          multiline
                        />
                      </span>
                    </div>
                  </div>

                  {isEditing && <div className="print:hidden text-[8px] text-gray-400 uppercase tracking-wider font-semibold mb-1">Taken / Verantwoordelijkheden</div>}
                  <ul className="list-none space-y-0 ml-1">
                    {(exp.bullets || []).map((bullet, bi) => (
                      <li key={bi} className="flex items-start gap-1 leading-[1.4] group/bullet" style={{ breakInside: 'avoid', pageBreakInside: 'avoid' }}>
                        {isEditing && (
                          <span className="print:hidden flex flex-col shrink-0 mt-[1px]">
                            <button
                              disabled={bi === 0}
                              onClick={() => {
                                if (!onChange) return;
                                const newData = JSON.parse(JSON.stringify(data));
                                const bullets = newData.experience[originalIdx].bullets;
                                [bullets[bi - 1], bullets[bi]] = [bullets[bi], bullets[bi - 1]];
                                onChange(newData);
                              }}
                              className="text-[7px] leading-none text-gray-300 hover:text-gray-600 disabled:opacity-10 disabled:cursor-not-allowed"
                            >▲</button>
                            <button
                              disabled={bi === exp.bullets.length - 1}
                              onClick={() => {
                                if (!onChange) return;
                                const newData = JSON.parse(JSON.stringify(data));
                                const bullets = newData.experience[originalIdx].bullets;
                                [bullets[bi], bullets[bi + 1]] = [bullets[bi + 1], bullets[bi]];
                                onChange(newData);
                              }}
                              className="text-[7px] leading-none text-gray-300 hover:text-gray-600 disabled:opacity-10 disabled:cursor-not-allowed"
                            >▼</button>
                          </span>
                        )}
                        <span className="flex-shrink-0 text-black" style={{ fontSize: '10.66px' }}>•</span>
                        <span style={{ fontSize: '10.66px' }} className="flex-1">
                          <EditableText
                            value={bullet.trim().replace(/[.;]+$/, '')}
                            onChange={(v) => {
                              // Detect multi-line content (paste from Word/text) and split into separate bullets
                              const lines = v.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
                              if (lines.length > 1) {
                                if (!onChange) return;
                                const newData = JSON.parse(JSON.stringify(data));
                                // Replace current bullet with the first line, then insert remaining lines after
                                newData.experience[originalIdx].bullets.splice(bi, 1, ...lines);
                                onChange(newData);
                              } else if (lines.length === 1) {
                                // Single line — use the cleaned line (strips trailing newlines/whitespace)
                                handleEdit(['experience', originalIdx, 'bullets', bi], lines[0]);
                              } else {
                                // All whitespace — preserve as empty string (lets user clear bullet)
                                handleEdit(['experience', originalIdx, 'bullets', bi], '');
                              }
                            }}
                            isEditing={!!isEditing}
                            multiline
                          />
                          {bi === exp.bullets.length - 1 ? '.' : ';'}
                        </span>
                        {isEditing && (
                          <button
                            className="print:hidden shrink-0 text-[9px] text-red-300 hover:text-red-500 opacity-0 group-hover/bullet:opacity-100 transition-opacity mt-[2px]"
                            onClick={() => {
                              if (!onChange) return;
                              const newData = JSON.parse(JSON.stringify(data));
                              newData.experience[originalIdx].bullets.splice(bi, 1);
                              onChange(newData);
                            }}
                            title="Verwijder bullet"
                          >✕</button>
                        )}
                      </li>
                    ))}
                  </ul>

                  {isEditing && (
                    <div className="print:hidden mt-2 flex gap-2 opacity-0 group-hover/exp:opacity-100 transition-opacity">
                      <button
                        onClick={() => {
                          if (!onChange) return;
                          const newData = JSON.parse(JSON.stringify(data));
                          if (!newData.experience[originalIdx].bullets) newData.experience[originalIdx].bullets = [];
                          newData.experience[originalIdx].bullets.push('');
                          onChange(newData);
                        }}
                        className="text-[10px] text-green-600 hover:text-green-800 font-medium"
                      >+ bullet</button>
                      <button
                        onClick={() => {
                          if (!onChange) return;
                          const newData = JSON.parse(JSON.stringify(data));
                          if (originalIdx !== -1) newData.experience[originalIdx].pageBreakBefore = !newData.experience[originalIdx].pageBreakBefore;
                          onChange(newData);
                        }}
                        className={`text-[10px] px-2 py-0.5 rounded font-medium ${exp.pageBreakBefore ? 'bg-blue-500 text-white' : 'bg-blue-100 text-blue-600 hover:bg-blue-200'}`}
                      >{exp.pageBreakBefore ? '✂ breuk actief' : '↵ pagina breuk'}</button>
                      <button
                        onClick={() => {
                          if (!onChange) return;
                          const newData = JSON.parse(JSON.stringify(data));
                          if (originalIdx !== -1) {
                            // Use __origIdx-tagged sorted array to safely find next item
                            const nextSortedItem = sorted[si + 1];
                            if (nextSortedItem) {
                              const nextIdx = nextSortedItem.__origIdx;
                              const deletedHadBreak = exp.pageBreakBefore;
                              const nextHasBreak = newData.experience[nextIdx]?.pageBreakBefore;
                              if (deletedHadBreak || nextHasBreak) {
                                newData.experience[nextIdx].pageBreakBefore = false;
                              }
                            }
                            newData.experience.splice(originalIdx, 1);
                          }
                          onChange(newData);
                        }}
                        className="text-[10px] text-red-400 hover:text-red-600"
                      >✕ verwijder functie</button>
                      <button
                        onClick={() => handleRegenerateJob(originalIdx)}
                        disabled={regeneratingIndices.has(originalIdx)}
                        className={`text-[10px] px-2 py-0.5 rounded font-medium ${regeneratingIndices.has(originalIdx) ? 'bg-orange-200 text-orange-400 cursor-wait' : 'bg-orange-100 text-orange-600 hover:bg-orange-200'}`}
                      >{regeneratingIndices.has(originalIdx) ? '⟳ herschrijven...' : '↺ herschrijf bullets'}</button>
                      <button
                        onClick={() => {
                          if (!onChange) return;
                          const newData = JSON.parse(JSON.stringify(data));
                          newData.experience[originalIdx].pinned = !newData.experience[originalIdx].pinned;
                          onChange(newData);
                        }}
                        className={`text-[10px] px-2 py-0.5 rounded font-medium ${exp.pinned ? 'bg-blue-200 text-blue-700' : 'bg-blue-50 text-blue-600 hover:bg-blue-100'}`}
                        title={exp.pinned ? 'Klik om los te maken — sortering keert terug naar datum' : 'Vastpinnen — deze functie blijft bovenaan ongeacht datum'}
                      >{exp.pinned ? '📌 vastgepind' : '📌 pin naar boven'}</button>
                    </div>
                  )}
                </div>
                )}</SortableExpItem>
              );
            })}
                </SortableContext>
              </DndContext>
            );
          })()}
        </div>
        {isEditing && (
          <button
            className="print:hidden mt-3 text-[10px] text-green-600 hover:text-green-800 font-medium"
            onClick={() => {
              if (!onChange) return;
              const newData = JSON.parse(JSON.stringify(data));
              if (!newData.experience) newData.experience = [];
              newData.experience.push({ period: '', employer: '', role: '', bullets: [''] });
              onChange(newData);
            }}
          >+ werkervaring toevoegen</button>
        )}
        {isEditing && data.manualOrder && (
          <button
            onClick={handleResetOrder}
            className="print:hidden mt-3 ml-3 text-[10px] text-orange-600 hover:text-orange-800 font-medium"
            title="Verwijder handmatige volgorde en sorteer weer op datum (pin-to-top blijft actief)"
          >🔄 reset naar chronologische volgorde</button>
        )}
        {isEditing && data.manualOrder && (
          <div className="print:hidden mt-2 text-[10px] text-orange-600 italic">
            ℹ️ Handmatige volgorde actief — werkervaring wordt weergegeven in de volgorde hieronder, niet op datum.
          </div>
        )}
      </section>
      {((data.systems && data.systems.length > 0) || (data.languages && data.languages.length > 0) || isEditing) && (
        <OrangeSeparator
          hidden={(data.hideSeparators || [])[1]}
          isEditing={isEditing}
          onToggle={() => {
            if (!onChange) return;
            const newData = JSON.parse(JSON.stringify(data));
            if (!newData.hideSeparators) newData.hideSeparators = [];
            newData.hideSeparators[1] = !newData.hideSeparators[1];
            onChange(newData);
          }}
        />
      )}

      <div className="space-y-6 mt-4">
        {(data.systems && data.systems.length > 0 || isEditing) && (
          <section>
            <div className="inline-block bg-[#e3fd01] px-3 py-1 mb-2">
              <h3 className="uppercase text-black" style={{ fontSize: '12px', fontWeight: 700, fontFamily: 'Agrandir, sans-serif' }}>SYSTEEMKENNIS</h3>
            </div>
            <p className="pl-1" style={{ fontSize: '10.66px', fontFamily: 'Garet, sans-serif' }}>
              <EditableText
                // Punt 10 — "Microsoft 365" is altijd default pre-filled wanneer er nog
                // geen systemen zijn ingevuld; bewerkbaar net als de rest.
                value={(data.systems && data.systems.length > 0 ? data.systems : (isEditing ? ['Microsoft 365'] : [])).join(' | ')}
                onChange={(v) => handleEdit(['systems'], v.split('|').map(s => s.trim()).filter(Boolean))}
                isEditing={!!isEditing}
                multiline
                placeholder="Voeg systemen toe, gescheiden door |"
              />
            </p>
          </section>
        )}

        {(data.languages && data.languages.length > 0 || isEditing) && (
          <section>
            <div className="inline-block bg-[#e3fd01] px-3 py-1 mb-2">
              <h3 className="uppercase text-black" style={{ fontSize: '12px', fontWeight: 700, fontFamily: 'Agrandir, sans-serif' }}>TALENKENNIS</h3>
            </div>
            <p className="pl-1" style={{ fontSize: '10.66px', fontFamily: 'Garet, sans-serif' }}>
              <EditableText
                value={(data.languages && data.languages.length > 0 ? data.languages : (isEditing ? ['Nederlands', 'Engels'] : [])).join(' | ')}
                onChange={(v) => {
                  const langs = v.split('|').map(s => s.trim()).filter(Boolean);
                  handleEdit(['languages'], langs);
                }}
                isEditing={!!isEditing}
                multiline
                placeholder="Voeg talen toe, gescheiden door |"
              />
            </p>
          </section>
        )}
      </div>

      {/* REFERENTIES */}
      {((data.references && data.references.length > 0) || data.referencesOnRequest || isEditing) && (
        <>
          <OrangeSeparator
            hidden={(data.hideSeparators || [])[2]}
            isEditing={isEditing}
            onToggle={() => {
              if (!onChange) return;
              const newData = JSON.parse(JSON.stringify(data));
              if (!newData.hideSeparators) newData.hideSeparators = [];
              newData.hideSeparators[2] = !newData.hideSeparators[2];
              onChange(newData);
            }}
          />
          <section className="mt-4 mb-6">
            <div className="inline-block bg-[#e3fd01] px-3 py-1 mb-4">
              <h3 className="uppercase text-black" style={{ fontSize: '12px', fontWeight: 700, fontFamily: 'Agrandir, sans-serif' }}>REFERENTIES</h3>
            </div>

            {/* Op aanvraag toggle in edit mode */}
            {isEditing && (
              <div className="print:hidden mb-3 flex items-center gap-2">
                <button
                  onClick={() => {
                    if (!onChange) return;
                    const newData = JSON.parse(JSON.stringify(data));
                    newData.referencesOnRequest = !newData.referencesOnRequest;
                    if (newData.referencesOnRequest) newData.references = [];
                    onChange(newData);
                  }}
                  className={`text-[9px] font-bold uppercase tracking-widest px-2 py-1 rounded ${data.referencesOnRequest ? 'bg-[#1E3A35] text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
                >
                  {data.referencesOnRequest ? '✓ Op aanvraag beschikbaar' : 'Op aanvraag beschikbaar'}
                </button>
              </div>
            )}

            {data.referencesOnRequest && !isEditing && (
              <p className="pl-1 opacity-70" style={{ fontSize: '10.66px', fontFamily: 'Garet, sans-serif' }}>Op aanvraag beschikbaar</p>
            )}

            {!data.referencesOnRequest && (
              <div className="space-y-4 pl-1" style={{ fontSize: '10.66px', fontFamily: 'Garet, sans-serif' }}>
                {/* Punt 6 — Maria June 9 — referentie-format header explicit for editors */}
                {isEditing && (data.references || []).length > 0 && (
                  <div className="print:hidden text-[9px] text-neutral-500 italic">
                    Format per referentie: <strong>Naam</strong> | <strong>Organisatie / Functie</strong> | <strong>e-mail of telefoon</strong>
                  </div>
                )}
                {(data.references || []).map((ref, ri) => (
                  <div key={ri} className="relative group/ref">
                    {isEditing ? (
                      <div className="grid grid-cols-12 gap-x-2 gap-y-1 pr-7">
                        <div className="col-span-5">
                          <div className="text-[8px] text-gray-400 uppercase tracking-wider font-semibold mb-0.5">Naam</div>
                          <EditableText value={ref.name || ''} onChange={(v) => { if (!onChange) return; const d = JSON.parse(JSON.stringify(data)); d.references[ri].name = v; onChange(d); }} isEditing={true} />
                        </div>
                        <div className="col-span-7">
                          <div className="text-[8px] text-gray-400 uppercase tracking-wider font-semibold mb-0.5">E-mail of telefoon</div>
                          <EditableText value={ref.contact || ''} onChange={(v) => { if (!onChange) return; const d = JSON.parse(JSON.stringify(data)); d.references[ri].contact = v; onChange(d); }} isEditing={true} />
                        </div>
                        <div className="col-span-5">
                          <div className="text-[8px] text-gray-400 uppercase tracking-wider font-semibold mb-0.5">Functie</div>
                          <EditableText value={ref.role || ''} onChange={(v) => { if (!onChange) return; const d = JSON.parse(JSON.stringify(data)); d.references[ri].role = v; onChange(d); }} isEditing={true} />
                        </div>
                        <div className="col-span-7">
                          <div className="text-[8px] text-gray-400 uppercase tracking-wider font-semibold mb-0.5">Organisatie</div>
                          <EditableText value={ref.company || ''} onChange={(v) => { if (!onChange) return; const d = JSON.parse(JSON.stringify(data)); d.references[ri].company = v; onChange(d); }} isEditing={true} />
                        </div>
                      </div>
                    ) : (
                      <>
                        <div>
                          <span>{ref.name || ''}</span>
                          {ref.contact && <span className="opacity-70"> | {ref.contact}</span>}
                        </div>
                        {(ref.role || ref.company) && (
                          <div className="opacity-70">
                            <span>{ref.role || ''}</span>
                            {ref.company && <span> | {ref.company}</span>}
                          </div>
                        )}
                      </>
                    )}
                    {isEditing && (
                      <button className="print:hidden absolute right-0 top-0 text-[10px] text-red-400 hover:text-red-600 opacity-0 group-hover/ref:opacity-100 transition-opacity"
                        onClick={() => { if (!onChange) return; const d = JSON.parse(JSON.stringify(data)); d.references.splice(ri, 1); onChange(d); }}>✕</button>
                    )}
                  </div>
                ))}
                {isEditing && (
                  <button className="print:hidden text-[10px] text-green-600 hover:text-green-800 font-medium"
                    onClick={() => { if (!onChange) return; const d = JSON.parse(JSON.stringify(data)); if (!d.references) d.references = []; d.references.push({ name: '', contact: '', role: '', company: '' }); onChange(d); }}>
                    + referentie toevoegen
                  </button>
                )}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );

  return (
    <div
      ref={containerRef}
      className="print-container w-[210mm] mx-auto bg-white relative overflow-hidden no-shadow print:shadow-none print:m-0 print:border-none border border-black"
      style={{ fontFamily: 'Garet, sans-serif', color: '#000000' }}
    >
      {/* Hidden A4 height reference – must be inside the container */}
      <div
        ref={pageHeightRef}
        style={{
          height: '297mm',
          width: '210mm',
          position: 'absolute',
          left: '-99999px',
          visibility: 'hidden',
        }}
      />

      {/* Table – thead repeats header, tfoot repeats footer on every printed page */}
      <table className="cv-print-table w-full border-collapse" style={{ borderSpacing: 0 }}>
        <thead className="cv-print-thead">
          <tr><td className="p-0 border-0">{headerContent}</td></tr>
        </thead>

        <tfoot className="cv-print-tfoot">
          <tr><td className="p-0 border-0"><div className="h-[80px]" /></td></tr>
        </tfoot>

        <tbody>
          <tr>
            <td className="p-0 border-0" ref={contentRef}>
              {/* Screen only header */}
              <div className="print:hidden">{headerContent}</div>

              {bodyContent}

              {/* Screen-only spacer – pushes footer to page bottom */}
              <div
                className="print:hidden"
                style={{
                  height: `${spacerHeight}px`,
                  backgroundColor: '#ffffff',
                  flexShrink: 0,
                }}
              />
            </td>
          </tr>
        </tbody>
      </table>

      {/* Screen-only footer – ref for spacer calculation, hidden during print (tfoot handles it) */}
      <div ref={footerRef} className="print:hidden">
        {footerContent}
      </div>

      {/* Punt 11 — Pagina-breuk overlay (alleen edit mode, niet zichtbaar in print/PDF).
          Tekent een gestippelde lijn op elke 297mm-grens binnen de CV-container
          zodat de gebruiker direct ziet waar straks een paginabreuk valt. */}
      {isEditing && pageBreaks.pagePx > 0 && (
        <div
          aria-hidden
          className="print:hidden pointer-events-none absolute left-0 right-0"
          style={{ top: 0, height: pageBreaks.totalPx, zIndex: 40 }}
        >
          {Array.from({ length: Math.max(0, Math.floor(pageBreaks.totalPx / pageBreaks.pagePx)) }).map((_, i) => (
            <div
              key={`pb-${i}`}
              className="absolute left-0 right-0 flex items-center"
              style={{ top: (i + 1) * pageBreaks.pagePx - 1, height: 0 }}
            >
              <div className="flex-1 border-t-2 border-dashed border-blue-400/80" />
              <span
                className="mx-3 px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest text-blue-600 bg-white border border-blue-300 rounded select-none whitespace-nowrap"
                style={{ transform: 'translateY(-50%)' }}
              >
                ✂ Einde pagina {i + 1}
              </span>
              <div className="flex-1 border-t-2 border-dashed border-blue-400/80" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
