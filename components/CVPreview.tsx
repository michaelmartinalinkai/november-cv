import React from 'react';
import { ParsedCV } from '../types';
import { LOGO_URL, WHITE_ARROW_URL } from '../assets';

interface CVPreviewProps {
  data: ParsedCV;
  template?: 'old' | 'new';
}

const OrangeSeparator = () => (
  <div className="w-full h-[1px] bg-[#f27f61] my-6 shrink-0" />
);

const toTitleCase = (str: string) => {
  return str.toLowerCase().split(' ').map(word => {
    return word.charAt(0).toUpperCase() + word.slice(1);
  }).join(' ');
};

const formatDateToNumbers = (text: string) => {
  if (!text) return text;

  const monthMap: Record<string, string> = {
    'januari': '01', 'februari': '02', 'maart': '03', 'april': '04', 'mei': '05', 'juni': '06',
    'juli': '07', 'augustus': '08', 'september': '09', 'oktober': '10', 'november': '11', 'december': '12',
    'january': '01', 'february': '02', 'march': '03', 'may': '05', 'june': '06',
    'july': '07', 'august': '08', 'october': '10',
    'jan': '01', 'feb': '02', 'mrt': '03', 'apr': '04', 'jun': '06', 'jul': '07',
    'aug': '08', 'sep': '09', 'okt': '10', 'nov': '11', 'dec': '12',
    'mar': '03', 'oct': '10'
  };

  // Replace "Month YYYY" or "Month" with "MM/YYYY" or just "MM"
  // Note: we look for month name followed optionally by a space and 4 digits
  return text.replace(/\b([a-zA-Z]+)\s*(\d{4})?\b/g, (match, monthStr, yearStr) => {
    const lower = monthStr.toLowerCase();
    const monthNum = monthMap[lower];

    if (monthNum) {
      return yearStr ? `${monthNum}/${yearStr}` : monthNum;
    }
    return match; // return original if not a recognized month
  });
};

export const CVPreview: React.FC<CVPreviewProps> = ({ data, template = 'new' }) => {
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
            {(data.education || []).map((edu, i) => (
              <div key={i} className="flex gap-x-12">
                <span className="w-[100px] shrink-0">{formatDateToNumbers(edu.period)}</span>
                <span>{edu.degree} ({edu.status})</span>
              </div>
            ))}
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
            {(data.experience || []).map((exp, i) => (
              <div key={i} className="grid grid-cols-[120px_1fr] gap-x-2 gap-y-0.5">
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

  // Header content (reusable for both screen and print)
  const headerContent = (
    <div className="bg-[#284d32] text-white p-12 py-8 flex justify-between items-start relative z-10 min-h-[140px]">
      <div className="flex flex-col justify-center h-full">
        <h1
          className="leading-tight mb-1"
          style={{ fontSize: '41.1px', fontWeight: 700, letterSpacing: '-0.082em', fontFamily: 'Garet, sans-serif' }}
        >
          {toTitleCase(data.personalInfo?.name || "Kandidaat Naam")}
        </h1>
        <p className="text-[#e3fd01]" style={{ fontSize: '8px', fontFamily: 'Agrandir, sans-serif', fontWeight: 400 }}>
          {data.personalInfo?.availability || "Beschikbaarheid onbekend"}
          {data.personalInfo?.hours && ` | ${data.personalInfo.hours}${data.personalInfo.hours.includes('uur per week') ? '' : ' uur per week'}`}
          {data.personalInfo?.skj && (
            <> | SKJ-Registratie: {data.personalInfo.skj}{data.personalInfo.skjDate ? ` (afgegeven op ${data.personalInfo.skjDate})` : ''}</>
          )}
        </p>
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
    <div className="p-12 pt-8">
      <section className="mb-6 flex flex-col items-center w-full">
        <h3 className="tracking-[0.01em] text-center mb-3 uppercase text-black" style={{ fontSize: '11pt', fontWeight: 500 }}>
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
                {skill}
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
                {skill}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mb-6">
        <div className="inline-block bg-[#e3fd01] px-3 py-1 mb-4">
          <h3 className="uppercase text-black" style={{ fontSize: '12px', fontWeight: 700, fontFamily: 'Agrandir, sans-serif' }}>OPLEIDINGEN</h3>
        </div>
        <div className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1" style={{ fontSize: '8px', fontFamily: 'Garet, sans-serif' }}>
          {(data.education || []).map((edu, i) => (
            <React.Fragment key={i}>
              <div className="opacity-70 font-normal whitespace-nowrap pb-0.5">{formatDateToNumbers(edu.period)}</div>
              <div className="pb-0.5">
                <span className="text-black">{edu.degree}</span> <span className="font-normal opacity-70">- {edu.status}</span>
              </div>
            </React.Fragment>
          ))}
        </div>
      </section>

      <OrangeSeparator />

      <section className="mb-6">
        <div className="inline-block bg-[#e3fd01] px-3 py-1 mb-4">
          <h3 className="uppercase text-black" style={{ fontSize: '12px', fontWeight: 700, fontFamily: 'Agrandir, sans-serif' }}>WERKERVARING</h3>
        </div>
        <div className="space-y-5">
          {(data.experience || []).map((exp, i) => (
            <div key={i} className="relative" style={{ fontFamily: 'Garet, sans-serif' }}>
              <div className="mb-2">
                <span className="block mb-1 opacity-70" style={{ fontSize: '8px' }}>{formatDateToNumbers(exp.period)}</span>
                <div className="flex items-center gap-2">
                  <span className="text-[#1E3A35]" style={{ fontSize: '8px' }}>{exp.employer}</span>
                  <span className="text-black/30" style={{ fontSize: '8px' }}>|</span>
                  <span className="text-black" style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', fontFamily: 'Garet, sans-serif' }}>{
                    exp.role.toUpperCase().startsWith(exp.employer.toUpperCase())
                      ? exp.role.replace(new RegExp(`^${exp.employer.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\|?\\s*`, 'i'), '').trim()
                      : exp.role
                  }</span>
                </div>
              </div>
              <ul className="list-none space-y-0 ml-1">
                {(exp.bullets || []).map((bullet, bi) => (
                  <li key={bi} className="flex items-start gap-2 leading-snug">
                    <span className="flex-shrink-0 text-black" style={{ fontSize: '8px' }}>•</span>
                    <span style={{ fontSize: '8px' }}>{bullet.trim().replace(/[.;]+$/, '')}{bi === exp.bullets.length - 1 ? '.' : ';'}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <OrangeSeparator />

      <div className="space-y-6 mt-4">
        {data.systems && data.systems.length > 0 && (
          <section>
            <div className="inline-block bg-[#e3fd01] px-3 py-1 mb-2">
              <h3 className="uppercase text-black" style={{ fontSize: '12px', fontWeight: 700, fontFamily: 'Agrandir, sans-serif' }}>SYSTEEMKENNIS</h3>
            </div>
            <p className="pl-1" style={{ fontSize: '8px', fontFamily: 'Garet, sans-serif' }}>{data.systems.join(' | ')}</p>
          </section>
        )}

        {data.languages && data.languages.length > 0 && (
          <section>
            <div className="inline-block bg-[#e3fd01] px-3 py-1 mb-2">
              <h3 className="uppercase text-black" style={{ fontSize: '12px', fontWeight: 700, fontFamily: 'Agrandir, sans-serif' }}>TALENKENNIS</h3>
            </div>
            <p className="pl-1" style={{ fontSize: '8px', fontFamily: 'Garet, sans-serif' }}>{data.languages.join(' | ')}</p>
          </section>
        )}
      </div>
    </div>
  );

  return (
    <div
      className="print-container w-[210mm] mx-auto bg-white relative overflow-hidden no-shadow print:shadow-none print:m-0 print:border-none border border-black"
      style={{ fontFamily: 'Garet, sans-serif', color: '#000000' }}
    >
      {/* Table layout: thead repeats header, tfoot repeats footer on every printed page */}
      <table className="cv-print-table w-full border-collapse" style={{ borderSpacing: 0 }}>
        <thead className="cv-print-thead">
          <tr><td className="p-0 border-0">{headerContent}</td></tr>
        </thead>
        <tfoot className="cv-print-tfoot">
          <tr><td className="p-0 border-0">{footerContent}</td></tr>
        </tfoot>
        <tbody>
          <tr><td className="p-0 border-0">{bodyContent}</td></tr>
        </tbody>
      </table>
      {/* Screen-only footer — shown below content on screen, hidden in print (tfoot handles print) */}
      <div className="print:hidden">
        {footerContent}
      </div>
    </div>
  );
};
