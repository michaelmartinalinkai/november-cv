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
                <span className="w-[100px] shrink-0">{edu.period}</span>
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
                  <span className="w-[100px] shrink-0">{c.period}</span>
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
                <span>{exp.period}</span>

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

  return (
    <div
      className="print-container w-[210mm] min-h-[297mm] mx-auto bg-white relative flex flex-col overflow-hidden no-shadow print:shadow-none print:m-0 print:border-none border border-black"
      style={{ fontFamily: 'Garet, sans-serif', color: '#4a4e57' }}
    >
      {/* HEADER */}
      <header className="bg-[#284d32] text-white p-12 py-8 flex justify-between items-start relative z-10 flex-shrink-0 min-h-[140px]">
        <div className="flex flex-col justify-center h-full">
          <h1
            className="leading-tight mb-1"
            style={{ fontSize: '32pt', fontWeight: 600, letterSpacing: '-0.02em', fontFamily: 'Garet, sans-serif' }}
          >
            {toTitleCase(data.personalInfo?.name || "Kandidaat Naam")}
          </h1>
          <p className="text-[#e3fd01] font-normal" style={{ fontSize: '7pt' }}>
            {data.personalInfo?.availability || "Beschikbaarheid onbekend"}
            {data.personalInfo?.hours && ` | ${data.personalInfo.hours}${data.personalInfo.hours.includes('uur per week') ? '' : ' uur per week'}`}
            {data.personalInfo?.skj && (
              <> | SKJ-Registratie: {data.personalInfo.skj}{data.personalInfo.skjDate ? ` (afgegeven op ${data.personalInfo.skjDate})` : ''}</>
            )}
          </p>
        </div>

        {/* LOGO */}
        <div className="flex-shrink-0 mt-0">
          <img
            src="/logo.png"
            alt="Novêmber."
            className="w-[80px] h-auto object-contain"
          />
        </div>
      </header>

      <main className="flex-grow p-12 pt-10">
        <section className="mb-6 flex flex-col items-center w-full">
          <h3 className="font-medium tracking-[0.1em] text-center mb-3 uppercase text-black" style={{ fontSize: '11pt' }}>
            WAAR DEZE PROFESSIONAL STERK IN IS
          </h3>
          <div className="flex flex-wrap justify-center gap-x-4 gap-y-3 px-4 w-full">
            {displaySkills.map((skill, i) => (
              <div
                key={i}
                className="bg-[#f27f61] text-white px-6 py-2 rounded-full font-bold uppercase tracking-wider text-center flex items-center justify-center min-w-[140px]"
                style={{ fontSize: '8.5pt' }}
              >
                {skill}
              </div>
            ))}
          </div>
        </section>

        <section className="mb-8">
          <div className="inline-block bg-[#e3fd01] px-3 py-1 mb-4">
            <h3 className="font-bold uppercase tracking-[0.1em] text-black" style={{ fontSize: '8pt' }}>OPLEIDINGEN</h3>
          </div>
          <div className="space-y-0.5">
            {(data.education || []).map((edu, i) => (
              <div key={i} className="grid grid-cols-[70px_1fr] gap-x-2" style={{ fontSize: '8pt' }}>
                <div className="opacity-70 font-normal">{edu.period}</div>
                <div>
                  <span className="text-black">{edu.degree}</span> <span className="text-gray-500 font-normal opacity-70">- {edu.status}</span>
                </div>
              </div>
            ))}
          </div>
        </section>

        <OrangeSeparator />

        <section className="mb-8">
          <div className="inline-block bg-[#e3fd01] px-3 py-1 mb-6">
            <h3 className="font-bold uppercase tracking-[0.1em] text-black" style={{ fontSize: '8pt' }}>WERKERVARING</h3>
          </div>
          <div className="space-y-8">
            {(data.experience || []).map((exp, i) => (
              <div key={i} className="relative" style={{ fontSize: '8pt' }}>
                <div className="mb-2">
                  <span className="block mb-1 opacity-70 font-medium">{exp.period}</span>
                  <div className="flex items-center gap-2">
                    <span className="font-normal text-[#1E3A35]">{exp.employer}</span>
                    <span className="text-neutral-300">|</span>
                    <span className="font-bold uppercase tracking-wider text-black">{
                      // Strip employer name from role if Gemini duplicated it (e.g. "GEMEENTE DEN HAAG | ROLE" -> "ROLE")
                      exp.role.toUpperCase().startsWith(exp.employer.toUpperCase())
                        ? exp.role.replace(new RegExp(`^${exp.employer.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\|?\\s*`, 'i'), '').trim()
                        : exp.role
                    }</span>
                  </div>
                </div>
                <ul className="list-none space-y-0 ml-1">
                  {(exp.bullets || []).map((bullet, bi) => (
                    <li key={bi} className="flex items-start gap-2 leading-snug">
                      <span className="flex-shrink-0 text-black font-bold">•</span>
                      <span>{bullet.trim().replace(/[.;]+$/, '')}{bi === exp.bullets.length - 1 ? '.' : ';'}</span>
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
                <h3 className="font-bold uppercase tracking-[0.1em] text-black" style={{ fontSize: '8pt' }}>SYSTEEMKENNIS</h3>
              </div>
              <p className="tracking-wide pl-1" style={{ fontSize: '8pt' }}>{data.systems.join(' | ')}</p>
            </section>
          )}

          {data.languages && data.languages.length > 0 && (
            <section>
              <div className="inline-block bg-[#e3fd01] px-3 py-1 mb-2">
                <h3 className="font-bold uppercase tracking-[0.1em] text-black" style={{ fontSize: '8pt' }}>TALENKENNIS</h3>
              </div>
              <p className="tracking-wide pl-1" style={{ fontSize: '8pt' }}>{data.languages.join(' | ')}</p>
            </section>
          )}
        </div>
      </main>

      <footer className="bg-[#284d32] h-[80px] w-[210mm] relative flex-shrink-0 flex items-center overflow-hidden">
        <div className="absolute h-[12px] bg-[#e3fd01] flex items-center" style={{ left: '0mm', width: '145mm', top: '50%', transform: 'translateY(-50%)' }}>
          {/* Address removed as per request */}
        </div>
        <div className="absolute h-[12px] bg-[#e3fd01]" style={{ left: '165mm', width: '70mm', top: '50%', transform: 'translateY(-50%)' }}></div>
        <img
          src="/logo-footer.png"
          alt=""
          className="absolute z-10 w-[10mm] h-[10mm]"
          style={{ left: '150mm', top: '20%', transform: 'translateY(-18%)' }}
        />
      </footer>
    </div>
  );
};
