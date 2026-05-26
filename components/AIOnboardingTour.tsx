import React, { useState, useEffect } from 'react';

const STORAGE_KEY = 'novcv_ai_onboarding_seen_v1';

interface AIOnboardingTourProps {
  // Triggered when user clicks "Probeer het uit" — caller should open the panel
  onTry: () => void;
}

/**
 * One-time popover shown next to the "AI Assistent" button on first login per browser.
 * Sets localStorage flag once dismissed so it doesn't show again.
 *
 * Mike can reset by clearing localStorage or bumping the version suffix on STORAGE_KEY.
 */
export const AIOnboardingTour: React.FC<AIOnboardingTourProps> = ({ onTry }) => {
  const [show, setShow] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    try {
      if (!localStorage.getItem(STORAGE_KEY)) {
        // Slight delay so the UI renders first
        setTimeout(() => setShow(true), 800);
      }
    } catch { /* localStorage unavailable, skip onboarding */ }
  }, []);

  const dismiss = () => {
    try { localStorage.setItem(STORAGE_KEY, '1'); } catch { /* ignore */ }
    setShow(false);
  };

  const handleTry = () => {
    try { localStorage.setItem(STORAGE_KEY, '1'); } catch { /* ignore */ }
    setShow(false);
    onTry();
  };

  if (!show) return null;

  const steps = [
    {
      title: '✨ Nieuw: AI Assistent',
      body: (
        <>
          <p className="mb-2">
            Je kunt nu het CV bewerken via een <strong>gesprek</strong> in plaats van handmatig per veld.
          </p>
          <p className="text-[11px] text-neutral-600">
            Klik op de AI Assistent-knop rechtsboven, typ wat je wilt, en de AI doet de rest.
          </p>
        </>
      ),
    },
    {
      title: 'Voorbeelden waar het in uitblinkt',
      body: (
        <ul className="space-y-1.5 text-[11px] text-neutral-700">
          <li>• <em>"Maak deze bullets korter, behoud de inhoud"</em></li>
          <li>• <em>"Vul deze functie aan tot 5 bullets, verander niets aan de bestaande"</em></li>
          <li>• <em>"Optimaliseer dit CV voor een rol als Jeugdbeleidsadviseur"</em></li>
          <li>• <em>"Schrijf een motivatiebrief voor de gemeente Rotterdam"</em></li>
          <li>• <em>"Alleen de laatste werkervaring aanpassen"</em></li>
        </ul>
      ),
    },
    {
      title: 'Klaar om het te proberen?',
      body: (
        <p className="text-[12px] text-neutral-700">
          Onderaan het paneel zie je altijd je verbruik. Je kunt het gesprek wissen of de assistent sluiten wanneer je wilt.
        </p>
      ),
    },
  ];

  const current = steps[step];
  const isLastStep = step === steps.length - 1;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/30 z-40 animate-fade-in"
        onClick={dismiss}
      />
      {/* Popover — positioned in the center-top area */}
      <div
        className="fixed top-24 left-1/2 -translate-x-1/2 z-50 w-[92vw] max-w-md bg-white rounded-lg shadow-2xl border border-neutral-200 overflow-hidden"
        style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-[#1E3A35] to-[#2A5048] text-white px-5 py-3 flex justify-between items-center">
          <div className="text-[10px] font-bold uppercase tracking-widest text-[#e3fd01]">
            Stap {step + 1} van {steps.length}
          </div>
          <button
            onClick={dismiss}
            className="text-white/70 hover:text-white text-xl leading-none w-7 h-7 flex items-center justify-center"
            title="Sluiten"
            aria-label="Sluiten"
          >×</button>
        </div>

        {/* Body */}
        <div className="px-5 py-4">
          <h3 className="font-bold text-[15px] text-neutral-900 mb-2">{current.title}</h3>
          <div className="text-[12px] leading-relaxed">{current.body}</div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 bg-neutral-50 border-t border-neutral-200 flex justify-between items-center">
          <button
            onClick={dismiss}
            className="text-[10px] text-neutral-400 hover:text-neutral-700 uppercase tracking-wider"
          >
            Niet nu
          </button>
          <div className="flex gap-2">
            {step > 0 && (
              <button
                onClick={() => setStep(step - 1)}
                className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-neutral-700 hover:bg-neutral-200 rounded transition-colors"
              >
                Vorige
              </button>
            )}
            {!isLastStep ? (
              <button
                onClick={() => setStep(step + 1)}
                className="px-4 py-1.5 bg-[#1E3A35] text-white text-[11px] font-bold uppercase tracking-wider hover:bg-[#2A5048] rounded transition-colors"
              >
                Volgende
              </button>
            ) : (
              <button
                onClick={handleTry}
                className="px-4 py-1.5 bg-[#EE8D70] text-white text-[11px] font-bold uppercase tracking-wider hover:bg-[#E07C60] rounded transition-colors"
              >
                ✨ Probeer het uit
              </button>
            )}
          </div>
        </div>

        {/* Step dots */}
        <div className="flex justify-center gap-1.5 pb-3 bg-neutral-50">
          {steps.map((_, i) => (
            <span
              key={i}
              className={`w-1.5 h-1.5 rounded-full transition-colors ${i === step ? 'bg-[#1E3A35]' : 'bg-neutral-300'}`}
            />
          ))}
        </div>
      </div>
    </>
  );
};
