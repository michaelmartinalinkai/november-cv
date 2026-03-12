import React, { useRef, useState, useLayoutEffect } from 'react';
import { ParsedCV } from '../types';
import { LOGO_URL, WHITE_ARROW_URL } from '../assets';
import { EditableText } from './EditableText';

interface CVPreviewProps {
  data: ParsedCV;
  template?: 'old' | 'new';
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

const toTitleCase = (str: string) => {
  return str.toLowerCase().split(' ').map(word => {
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

  return { ...edu, degree, status };
};

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


export const CVPreview: React.FC<CVPreviewProps> = ({ data, template = 'new', isEditing, onChange }) => {
  // ==================== NEW: DYNAMIC SPACER LOGIC ====================
  // ALL hooks must be declared before any conditional return
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);           // wraps header + body
  const footerRef = useRef<HTMLDivElement>(null);
  const pageHeightRef = useRef<HTMLDivElement>(null);        // hidden 297mm reference
  const [spacerHeight, setSpacerHeight] = useState(0);

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
    };

    // Run after every render + when data changes
    calculateSpacer();

    // Optional safety net
    const timer = setTimeout(calculateSpacer, 50);
    return () => clearTimeout(timer);
  }, [data]); // ← important: re-calculate every time the CV data changes

  // Early return AFTER all hooks (React rules)
  if (!data) return null;

  // Common font settings for CVs
  const baseFontSize = '10.66px'; // 8pt in pixels
  const fontStyles = {
    fontFamily: 'Garet, sans-serif',
    color: '#000',
    fontSize: baseFontSize,
    lineHeight: '1.3'
  };

  if (template === 'old') {
    return (
      <div
        className="w-[210mm] min-h-[297mm] mx-auto bg-white p-[20mm] relative flex flex-col no-shadow print:shadow-none print:m-0"
        style={{ ...fontStyles, border: '1px solid #000' }}
      >
        {/* LOGO */}
        <div className="mb-10">
          <h1 className="font-bold tracking-tighter" style={{ fontSize: '26pt', color: '#000' }}>NOVÉMBER.</h1>
        </div>

        {/* PERSOONLIJKE GEGEVENS */}
        <section className="mb-6">
          <h2 className="font-bold mb-1">Persoonlijke gegevens:</h2>
          <div className="grid grid-cols-[140px_1fr] gap-y-0.5">
            <span>Naam:</span>
            <span>{data.personalInfo?.name}</span>
            <span>Beschikbaarheid:</span>
            <span>{data.personalInfo?.availability}</span>
            {data.personalInfo?.skj && (
              <>
                <span className="whitespace-nowrap">SKJ Registratienummer:</span>
                <span>{data.personalInfo.skj} | afgiftedatum: {data.personalInfo.skjDate || ""}</span>
              </>
            )}
          </div>
        </section>

        {/* OPLEIDINGEN */}
        <section className="mb-6">
          <h2 className="font-bold mb-2">Opleidingen:</h2>
          <div className="space-y-0.5">
            {(data.education || []).map((edu, i) => {
              const fixedEdu = fixEducationEntry(edu);
              return (
                <div key={i} className="flex gap-x-12">
                  <span className="w-[100px] shrink-0">{formatDateToNumbers(fixedEdu.period)}</span>
                  <span>{fixedEdu.degree} ({fixedEdu.status})</span>
                </div>
              );
            })}
          </div>
        </section>

        {/* CURSUSSEN */}
        {data.courses && data.courses.length > 0 && (
          <section className="mb-6">
            <h2 className="font-bold mb-2">Cursussen:</h2>
            <div className="space-y-0.5">
              {data.courses.map((c, i) => (
                <div key={i} className="flex gap-x-12">
                  <span className="w-[100px] shrink-0">{formatDateToNumbers(c.period)}</span>
                  <span>{c.title}{c.institute ? ` - ${c.institute}` : ''}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* SYSTEEMKENNIS */}
        <section className="mb-6">
          <h2 className="font-bold mb-1">Systeemkennis:</h2>
          <p>{(data.systems || []).join(' | ')}</p>
        </section>

        {/* TALENKENNIS */}
        <section className="mb-6">
          <h2 className="font-bold mb-1">Talenkennis:</h2>
          <p>{(data.languages || []).join(' | ')}</p>
        </section>

        <div className="w-full h-[0.5pt] bg-black/40 my-6" />

        {/* WERKERVARING */}
        <section className="mb-6">
          <h2 className="font-bold mb-4">Werkervaring:</h2>
          <div className="space-y-8">
            {[...(data.experience || [])].sort((a, b) => parsePeriodStart(b.period) - parsePeriodStart(a.period)).map((exp, i) => (
              <div key={i} className="grid grid-cols-[120px_1fr] gap-x-2 gap-y-0.5" style={{ breakInside: 'avoid', pageBreakInside: 'avoid' }}>
                <span className="text-neutral-500">Datum</span>
                <span>{formatDateToNumbers(exp.period)}</span>

                <span className="text-neutral-500">Werkgever</span>
                <span>{exp.employer}</span>

                <span className="text-neutral-500">Functie</span>
                <span className="font-bold">{exp.role}</span>

                <span className="text-neutral-500">Werkzaamheden:</span>
                <div className="mt-1">
                  <ul className="list-none space-y-0">
                    {(exp.bullets || []).map((bullet, bi) => (
                      <li key={bi} className="flex items-start gap-4">
                        <span className="font-bold shrink-0">•</span>
                        <span>{bullet.trim().replace(/[.;]+$/, '')}{bi === exp.bullets.length - 1 ? '.' : ';'}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* STICKY FOOTER */}
        <div className="mt-auto pt-8 text-center opacity-70" style={{ fontSize: '6.5pt' }}>
          NOVÉMBER. B.V. | Olympisch Stadion 24-28 | 1076 DE | Amsterdam | KVK 78054389 | NL861247656B01
        </div>
      </div>
    );
  }

  // --- NEW STYLE PREVIEW ---
  const rawTags = data.analysis?.tags || [];
  const displaySkills = [...rawTags.slice(0, 5)];
  while (displaySkills.length < 5) displaySkills.push("Professional");

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
        <div className="text-[#e3fd01]" style={{ fontSize: '9px', fontFamily: 'Agrandir, sans-serif', fontWeight: 400 }}>
          {isEditing ? (
            <div className="flex flex-col gap-1 items-start mt-2">
              <div className="flex items-center gap-2"><span className="opacity-50">Beschikbaarheid:</span> <EditableText value={data.personalInfo?.availability || ''} onChange={(v) => handleEdit(['personalInfo', 'availability'], v)} isEditing={true} /></div>
              <div className="flex items-center gap-2"><span className="opacity-50">Uren:</span> <EditableText value={data.personalInfo?.hours || ''} onChange={(v) => handleEdit(['personalInfo', 'hours'], v)} isEditing={true} /></div>
              <div className="flex items-center gap-2"><span className="opacity-50">SKJ Nummer:</span> <EditableText value={data.personalInfo?.skj || ''} onChange={(v) => handleEdit(['personalInfo', 'skj'], v)} isEditing={true} /></div>
              <div className="flex items-center gap-2"><span className="opacity-50">SKJ Afgegeven:</span> <EditableText value={data.personalInfo?.skjDate || ''} onChange={(v) => handleEdit(['personalInfo', 'skjDate'], v)} isEditing={true} /></div>
            </div>
          ) : (
            (() => {
              const isValid = (v?: string | null) => v && v.trim() !== '' && !v.toLowerCase().includes('niet gespecificeerd') && !v.toLowerCase().includes('onbekend');
              const parts: string[] = [];
              const avail = (data.personalInfo!.availability! || '').trim();
              const availStr = /^per/i.test(avail) ? `Beschikbaar ${avail}` : `Beschikbaar per ${avail}`;
              parts.push(isValid(data.personalInfo?.availability) ? availStr : 'Beschikbaar op aanvraag');
              if (isValid(data.personalInfo?.hours)) {
                const h = data.personalInfo!.hours!;
                parts.push(`${h}${h.includes('uur per week') ? '' : ' uur per week'}`);
              }
              if (isValid(data.personalInfo?.skj)) {
                const skj = data.personalInfo!.skj!;
                const skjDate = isValid(data.personalInfo?.skjDate) ? ` (afgegeven op ${data.personalInfo!.skjDate})` : '';
                parts.push(`SKJ-Registratie: ${skj}${skjDate}`);
              }
              return parts.join(' | ') || "Niet gespecificeerd | Niet gespecificeerd uur per week | SKJ-Registratie: Niet gespecificeerd";
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
          {(data.education || []).map((edu, i) => {
            const fixedEdu = fixEducationEntry(edu);
            return (
              <React.Fragment key={i}>
                <div className="opacity-70 font-normal whitespace-nowrap flex items-start gap-1">
                  {isEditing && (
                    <span className="print:hidden flex flex-col mr-1">
                      <button
                        disabled={i === 0}
                        onClick={() => {
                          if (!onChange) return;
                          const newData = JSON.parse(JSON.stringify(data));
                          [newData.education[i - 1], newData.education[i]] = [newData.education[i], newData.education[i - 1]];
                          onChange(newData);
                        }}
                        className="text-[8px] leading-none text-gray-400 hover:text-gray-700 disabled:opacity-20 disabled:cursor-not-allowed"
                        title="Omhoog"
                      >▲</button>
                      <button
                        disabled={i === (data.education || []).length - 1}
                        onClick={() => {
                          if (!onChange) return;
                          const newData = JSON.parse(JSON.stringify(data));
                          [newData.education[i], newData.education[i + 1]] = [newData.education[i + 1], newData.education[i]];
                          onChange(newData);
                        }}
                        className="text-[8px] leading-none text-gray-400 hover:text-gray-700 disabled:opacity-20 disabled:cursor-not-allowed"
                        title="Omlaag"
                      >▼</button>
                    </span>
                  )}
                  <EditableText value={formatDateToNumbers(fixedEdu.period) || ''} onChange={(v) => handleEdit(['education', i, 'period'], v)} isEditing={!!isEditing} />
                </div>
                <div className="leading-snug flex items-start justify-between gap-2">
                  <div>
                    <span className="text-black inline">
                      <EditableText value={fixedEdu.degree || ''} onChange={(v) => handleEdit(['education', i, 'degree'], v)} isEditing={!!isEditing} multiline />
                    </span>
                    {edu.school && (
                      <span className="font-normal opacity-70">, <EditableText value={edu.school || ''} onChange={(v) => handleEdit(['education', i, 'school'], v)} isEditing={!!isEditing} /></span>
                    )}
                    <span className="font-normal opacity-70 whitespace-nowrap">
                      {' '}- <EditableText value={fixedEdu.status || ''} onChange={(v) => handleEdit(['education', i, 'status'], v)} isEditing={!!isEditing} />
                    </span>
                  </div>
                  {isEditing && (
                    <button
                      className="print:hidden text-[10px] text-red-400 hover:text-red-600 shrink-0"
                      title="Verwijder opleiding"
                      onClick={() => {
                        if (!onChange) return;
                        const newData = JSON.parse(JSON.stringify(data));
                        newData.education.splice(i, 1);
                        onChange(newData);
                      }}
                    >✕</button>
                  )}
                </div>
              </React.Fragment>
            );
          })}
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

      {data.courses && data.courses.length > 0 && (
        <section className="mb-6">
          <div className="inline-block bg-[#e3fd01] px-3 py-1 mb-2">
            <h3 className="uppercase text-black" style={{ fontSize: '12px', fontWeight: 700, fontFamily: 'Agrandir, sans-serif' }}>CURSUSSEN</h3>
          </div>
          <p className="pl-1" style={{ fontSize: '10.66px', fontFamily: 'Garet, sans-serif' }}>
            <EditableText
              value={(data.courses || []).map(c => c.title).filter(t => t && t.trim()).join(' | ')}
              onChange={(v) => {
                const titles = v.split('|').map(s => s.trim()).filter(Boolean);
                const updated = titles.map((title, i) => ({ ...((data.courses || [])[i] || {}), title }));
                handleEdit(['courses'], updated as any);
              }}
              isEditing={!!isEditing}
              multiline
            />
          </p>
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
        <div className="inline-block bg-[#e3fd01] px-3 py-1 mb-4">
          <h3 className="uppercase text-black" style={{ fontSize: '12px', fontWeight: 700, fontFamily: 'Agrandir, sans-serif' }}>WERKERVARING</h3>
        </div>
        <div className="space-y-5">
          {(() => {
            // Tag each item with its original index BEFORE sorting to avoid findIndex collisions.
            // In edit mode: keep array order so reorder arrows visually work.
            // In view/print mode: sort by most-recent date.
            const tagged = (data.experience || []).map((exp, idx) => ({ ...exp, __origIdx: idx }));
            const sorted = isEditing
              ? tagged
              : [...tagged].sort((a, b) => parsePeriodStart(b.period) - parsePeriodStart(a.period));
            return sorted.map((exp, si) => {
              const originalIdx = exp.__origIdx;
              return (
                <div key={si} className={`relative group/exp ${isEditing ? 'pl-5' : ''}`} style={{ fontFamily: 'Garet, sans-serif', breakInside: 'avoid', pageBreakInside: 'avoid' }}>
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

                  {/* Reorder arrows */}
                  {isEditing && (
                    <div className="print:hidden absolute left-0 top-0 flex flex-col">
                      <button
                        disabled={si === 0}
                        onClick={() => {
                          if (!onChange) return;
                          const newData = JSON.parse(JSON.stringify(data));
                          // Use pre-tagged __origIdx from sorted array for safe swapping
                          const aIdx = sorted[si].__origIdx;
                          const bIdx = sorted[si - 1].__origIdx;
                          [newData.experience[aIdx], newData.experience[bIdx]] = [newData.experience[bIdx], newData.experience[aIdx]];
                          onChange(newData);
                        }}
                        className="text-[9px] leading-none text-gray-400 hover:text-gray-700 disabled:opacity-20 disabled:cursor-not-allowed"
                        title="Omhoog"
                      >▲</button>
                      <button
                        disabled={si === sorted.length - 1}
                        onClick={() => {
                          if (!onChange) return;
                          const newData = JSON.parse(JSON.stringify(data));
                          const aIdx = sorted[si].__origIdx;
                          const bIdx = sorted[si + 1].__origIdx;
                          [newData.experience[aIdx], newData.experience[bIdx]] = [newData.experience[bIdx], newData.experience[aIdx]];
                          onChange(newData);
                        }}
                        className="text-[9px] leading-none text-gray-400 hover:text-gray-700 disabled:opacity-20 disabled:cursor-not-allowed"
                        title="Omlaag"
                      >▼</button>
                    </div>
                  )}

                  <div className="mb-2">
                    <span className="block opacity-80" style={{ fontSize: '10.66px' }}>
                      <EditableText value={formatDateToNumbers(exp.period) || ''} onChange={(v) => handleEdit(['experience', originalIdx, 'period'], v)} isEditing={!!isEditing} />
                    </span>
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

                  <ul className="list-none space-y-0 ml-1">
                    {(exp.bullets || []).map((bullet, bi) => (
                      <li key={bi} className="flex items-start gap-1 leading-[1.4] group/bullet">
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
                            onChange={(v) => handleEdit(['experience', originalIdx, 'bullets', bi], v)}
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
                    </div>
                  )}
                </div>
              );
            });
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
      </section>
      {((data.systems && data.systems.length > 0) || (data.languages && data.languages.length > 0)) && (
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
        {data.systems && data.systems.length > 0 && (
          <section>
            <div className="inline-block bg-[#e3fd01] px-3 py-1 mb-2">
              <h3 className="uppercase text-black" style={{ fontSize: '12px', fontWeight: 700, fontFamily: 'Agrandir, sans-serif' }}>SYSTEEMKENNIS</h3>
            </div>
            <p className="pl-1" style={{ fontSize: '10.66px', fontFamily: 'Garet, sans-serif' }}>
              <EditableText
                value={(data.systems || []).join(' | ')}
                onChange={(v) => handleEdit(['systems'], v.split('|').map(s => s.trim()).filter(Boolean))}
                isEditing={!!isEditing}
                multiline
              />
            </p>
          </section>
        )}

        {data.languages && data.languages.length > 0 && (
          <section>
            <div className="inline-block bg-[#e3fd01] px-3 py-1 mb-2">
              <h3 className="uppercase text-black" style={{ fontSize: '12px', fontWeight: 700, fontFamily: 'Agrandir, sans-serif' }}>TALENKENNIS</h3>
            </div>
            <p className="pl-1" style={{ fontSize: '10.66px', fontFamily: 'Garet, sans-serif' }}>
              <EditableText
                value={(data.languages || []).join(' | ')}
                onChange={(v) => handleEdit(['languages'], v.split('|').map(s => s.trim()).filter(Boolean))}
                isEditing={!!isEditing}
                multiline
              />
            </p>
          </section>
        )}
      </div>
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
    </div>
  );
};
