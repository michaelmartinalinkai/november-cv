// AI Assistant tool executor.
// Receives a tool_use block from the chat agent loop, performs the action,
// and returns { result: string, updatedCv?: ParsedCV } back to the agent.
//
// For tools that need an LLM sub-call (like rephrasing a bullet), we use Gemini
// (cheap & fast) — the orchestrating Claude makes the decision, Gemini executes the edit.

import { ParsedCV } from '../types';
import { GoogleGenAI } from '@google/genai';

const GEMINI_API_KEY = (import.meta as any).env?.VITE_GEMINI_API_KEY || '';

// Lazy Gemini client (only initialized when first tool needs it)
let geminiClient: GoogleGenAI | null = null;
function getGemini(): GoogleGenAI {
  if (!geminiClient) {
    geminiClient = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
  }
  return geminiClient;
}

// ─── HELPER: deep clone CV ───────────────────────────────────────────────────
function cloneCv(cv: ParsedCV): ParsedCV {
  return JSON.parse(JSON.stringify(cv));
}

// ─── PUNT 12 — REPHRASE SINGLE BULLET ────────────────────────────────────────
async function executeRephraseBullet(
  input: { job_index: number; bullet_index: number; mode: string; additional_instruction?: string },
  cv: ParsedCV
): Promise<{ result: string; updatedCv?: ParsedCV }> {
  const { job_index, bullet_index, mode, additional_instruction } = input;

  // Validate indices
  if (!cv.experience || job_index < 0 || job_index >= cv.experience.length) {
    return { result: `Fout: functie-index ${job_index} bestaat niet (er zijn ${cv.experience?.length || 0} functies).` };
  }
  const job = cv.experience[job_index];
  if (!job.bullets || bullet_index < 0 || bullet_index >= job.bullets.length) {
    return { result: `Fout: bullet-index ${bullet_index} bestaat niet in functie "${job.role}" (er zijn ${job.bullets?.length || 0} bullets).` };
  }
  const originalBullet = job.bullets[bullet_index];

  // Mode-specific instructions
  const modeInstructions: Record<string, string> = {
    shorten_keep_content:
      'KORTER MAKEN, BEHOUD ALLE FEITELIJKE INHOUD. Elke handeling, verantwoordelijkheid en context moet behouden blijven, alleen compacter geformuleerd. Maximaal 15% korter dan het origineel.',
    improve_language_only:
      'ALLEEN TAALNIVEAU VERBETEREN. Verbeter woordkeuze en professionaliteit. Voeg GEEN nieuwe content toe. Verander GEEN feiten. Behoud exact dezelfde handelingen, verantwoordelijkheden en context.',
    professionalize:
      'PROFESSIONELER MAKEN in Novêmber-stijl: actieve werkwoorden, zakelijk, geen jargon, helder. Voeg geen content toe, verzin niets.',
    preserve_tone:
      'ALLEEN GRAMMATICA EN SPELLING CORRIGEREN. Behoud exact de oorspronkelijke toon, formulering en stijl van de kandidaat. Verander zo min mogelijk.',
  };
  const modeInstruction = modeInstructions[mode] || modeInstructions.professionalize;

  const prompt = `Je herschrijft één enkele CV-bullet voor recruitmentbureau Novêmber.

CONTEXT — Functie: ${job.role} bij ${job.employer} (${job.period})

ORIGINELE BULLET:
"${originalBullet}"

OPDRACHT:
${modeInstruction}
${additional_instruction ? `\nEXTRA INSTRUCTIE VAN GEBRUIKER: ${additional_instruction}` : ''}

ABSOLUTE REGELS:
- Verzin GEEN nieuwe taken, vaardigheden of verantwoordelijkheden
- Behoud alle feiten uit het origineel
- Schrijf in het Nederlands
- Geef ALLEEN de herschreven bullet terug, geen uitleg, geen aanhalingstekens, geen voorvoegsel

HERSCHREVEN BULLET:`;

  try {
    const response = await getGemini().models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: { temperature: 0.3, maxOutputTokens: 200 },
    });
    let rewritten = (response.text || '').trim();
    // Strip surrounding quotes if AI added them
    rewritten = rewritten.replace(/^["'`]+|["'`]+$/g, '').trim();
    // Strip leading bullet markers if AI added them
    rewritten = rewritten.replace(/^[-•*]\s+/, '').replace(/^\d+\.\s+/, '').trim();

    if (!rewritten || rewritten.length < 3) {
      return { result: 'AI gaf een leeg of te kort antwoord. Bullet niet aangepast.' };
    }

    // Apply the change
    const updatedCv = cloneCv(cv);
    updatedCv.experience![job_index].bullets[bullet_index] = rewritten;

    return {
      result: `Bullet ${bullet_index + 1} bij "${job.role}" aangepast (mode: ${mode}).\nVoor: ${originalBullet.slice(0, 60)}...\nNa: ${rewritten.slice(0, 60)}...`,
      updatedCv,
    };
  } catch (e: any) {
    return { result: `Fout bij herschrijven: ${e?.message || String(e)}` };
  }
}

// ─── PUNT 3 — TEXT TO BULLETS ────────────────────────────────────────────────
async function executeBulletsFromText(
  input: { job_index: number; source_text: string; target_count?: number; replace_existing?: boolean },
  cv: ParsedCV
): Promise<{ result: string; updatedCv?: ParsedCV }> {
  const { job_index, source_text, target_count, replace_existing = false } = input;

  if (!cv.experience || job_index < 0 || job_index >= cv.experience.length) {
    return { result: `Fout: functie-index ${job_index} bestaat niet.` };
  }
  if (!source_text || source_text.trim().length < 10) {
    return { result: 'Fout: bron-tekst is leeg of te kort.' };
  }

  const job = cv.experience[job_index];
  const count = target_count && target_count > 0 ? target_count : 0; // 0 = let AI choose

  const prompt = `Je zet een blok lopende tekst om naar professionele CV-bullets in Novêmber-stijl.

CONTEXT — Functie: ${job.role} bij ${job.employer}

BRON-TEKST:
${source_text}

OPDRACHT:
- Zet de bron-tekst om naar ${count > 0 ? `EXACT ${count}` : '4 tot 7'} korte professionele bullets
- Stijl: actieve werkwoorden, zakelijk, geen jargon, geen voorvoegsel-bullet-markers
- Behoud ALLE feitelijke inhoud uit de bron-tekst
- Verzin GEEN nieuwe taken die niet in de bron staan
- Schrijf in het Nederlands
- Lever de bullets als een genummerde lijst (1., 2., 3., ...) zonder extra uitleg

BULLETS:`;

  try {
    const response = await getGemini().models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: { temperature: 0.4, maxOutputTokens: 1500 },
    });
    const raw = (response.text || '').trim();

    // Parse numbered list — strip "1. ", "2. " etc and trim
    const newBullets = raw
      .split('\n')
      .map(line => line.replace(/^\s*\d+[.)]\s*/, '').replace(/^[-•*]\s*/, '').trim())
      .filter(line => line.length > 3);

    if (newBullets.length === 0) {
      return { result: 'AI gaf geen bruikbare bullets terug.' };
    }

    const updatedCv = cloneCv(cv);
    if (!updatedCv.experience![job_index].bullets) {
      updatedCv.experience![job_index].bullets = [];
    }
    if (replace_existing) {
      updatedCv.experience![job_index].bullets = newBullets;
    } else {
      updatedCv.experience![job_index].bullets = [...updatedCv.experience![job_index].bullets, ...newBullets];
    }

    return {
      result: `${newBullets.length} bullet${newBullets.length > 1 ? 's' : ''} ${replace_existing ? 'vervangen' : 'toegevoegd'} bij "${job.role}".`,
      updatedCv,
    };
  } catch (e: any) {
    return { result: `Fout bij omzetten naar bullets: ${e?.message || String(e)}` };
  }
}
// ─── PUNT 8 — SMART BULLET COMPLETION ────────────────────────────────────────
async function executeCompleteBullets(
  input: { job_index: number; target_count: number },
  cv: ParsedCV
): Promise<{ result: string; updatedCv?: ParsedCV }> {
  const { job_index, target_count } = input;

  if (!cv.experience || job_index < 0 || job_index >= cv.experience.length) {
    return { result: `Fout: functie-index ${job_index} bestaat niet.` };
  }
  if (!target_count || target_count < 1) {
    return { result: 'Fout: target_count moet minimaal 1 zijn.' };
  }

  const job = cv.experience[job_index];
  const currentCount = (job.bullets || []).length;

  if (currentCount >= target_count) {
    return { result: `Geen aanvulling nodig: functie "${job.role}" heeft al ${currentCount} bullets (target was ${target_count}).` };
  }

  const needed = target_count - currentCount;
  const existingBullets = (job.bullets || []).map((b, i) => `${i + 1}. ${b}`).join('\n');

  const prompt = `Je vult een werkervaring aan met extra bullets in Novêmber-stijl.

FUNCTIE: ${job.role} bij ${job.employer}
PERIODE: ${job.period}

BESTAANDE BULLETS (deze BLIJVEN ONGEWIJZIGD, herhaal ze NIET):
${existingBullets || '(nog geen bullets)'}

OPDRACHT:
- Genereer EXACT ${needed} NIEUWE bullets die passen bij deze functie
- Pas op de rol/werkgever — kies handelingen die plausibel zijn voor deze functie
- VERZIN GEEN concrete details (geen specifieke aantallen, geen specifieke organisaties, geen specifieke programma's tenzij die uit de rol logisch volgen)
- Stijl: actieve werkwoorden, zakelijk, geen jargon
- Geen overlap met de bestaande bullets

LEVER alleen de ${needed} nieuwe bullets als een genummerde lijst (1., 2., ...) zonder uitleg.

NIEUWE BULLETS:`;

  try {
    const response = await getGemini().models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: { temperature: 0.5, maxOutputTokens: 800 },
    });
    const raw = (response.text || '').trim();

    const newBullets = raw
      .split('\n')
      .map(line => line.replace(/^\s*\d+[.)]\s*/, '').replace(/^[-•*]\s*/, '').trim())
      .filter(line => line.length > 3)
      .slice(0, needed);

    if (newBullets.length === 0) {
      return { result: 'AI gaf geen bruikbare bullets terug.' };
    }

    const updatedCv = cloneCv(cv);
    if (!updatedCv.experience![job_index].bullets) {
      updatedCv.experience![job_index].bullets = [];
    }
    updatedCv.experience![job_index].bullets = [...updatedCv.experience![job_index].bullets, ...newBullets];

    return {
      result: `${newBullets.length} bullet${newBullets.length > 1 ? 's' : ''} toegevoegd bij "${job.role}". Totaal nu: ${updatedCv.experience![job_index].bullets.length} (was ${currentCount}). Bestaande bullets zijn niet gewijzigd.`,
      updatedCv,
    };
  } catch (e: any) {
    return { result: `Fout bij aanvullen: ${e?.message || String(e)}` };
  }
}

// ─── PUNT 9 — STRONGER KEYWORDS ──────────────────────────────────────────────
async function executeRegenerateKeywords(
  input: { focus?: string },
  cv: ParsedCV
): Promise<{ result: string; updatedCv?: ParsedCV }> {
  const { focus } = input;

  // Build a summary of the candidate's experience for context
  const expSummary = (cv.experience || []).slice(0, 5).map(e =>
    `- ${e.role} bij ${e.employer}: ${(e.bullets || []).slice(0, 3).join(' | ')}`
  ).join('\n');

  const prompt = `Genereer EXACT 5 sterke-punten-tags voor het CV bovenaan in Novêmber-stijl.

WERKERVARING-CONTEXT:
${expSummary || '(geen werkervaring opgegeven)'}

${focus ? `FOCUS VAN GEBRUIKER: ${focus}\nDeze focus is leidend — kies tags die hierop aansluiten.` : 'FOCUS: automatisch — kies de 5 sterkste, meest sector-specifieke tags op basis van de werkervaring.'}

HARDE REGELS:
- EXACT 5 tags
- Sector/rol-specifiek (bv. CASUÏSTIEKREGIE, JEUGDZORG, STAKEHOLDERMANAGEMENT, BELEIDSADVIES)
- ❌ VERMIJD: "Professional", "Gedreven", "Resultaatgericht", "Communicatief", "Teamspeler" — te vaag
- ✅ VOORKEUR: specifieke domeintermen, methodologie-namen, sectortermen
- Tags worden in UPPERCASE getoond — schrijf ze in UPPERCASE
- Geen punten of komma's in tags zelf

LEVER alleen de 5 tags als genummerde lijst (1., 2., 3., 4., 5.) zonder uitleg.

TAGS:`;

  try {
    const response = await getGemini().models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: { temperature: 0.5, maxOutputTokens: 300 },
    });
    const raw = (response.text || '').trim();

    const newTags = raw
      .split('\n')
      .map(line => line.replace(/^\s*\d+[.)]\s*/, '').replace(/^[-•*]\s*/, '').trim().toUpperCase())
      .filter(line => line.length > 1 && line.length < 50)
      .slice(0, 5);

    if (newTags.length < 3) {
      return { result: `AI gaf maar ${newTags.length} bruikbare tags terug. Probeer opnieuw met een duidelijkere focus.` };
    }

    const updatedCv = cloneCv(cv);
    if (!updatedCv.analysis) updatedCv.analysis = { scores: { overall: 0 }, tags: [], strengths: [], weaknesses: [], summary: '' } as any;
    updatedCv.analysis!.tags = newTags;

    return {
      result: `5 nieuwe tags gegenereerd: ${newTags.join(' | ')}`,
      updatedCv,
    };
  } catch (e: any) {
    return { result: `Fout bij keyword-generatie: ${e?.message || String(e)}` };
  }
}

async function executeSuggestKeywords(
  input: { role: string },
  cv: ParsedCV
): Promise<{ result: string; updatedCv?: ParsedCV }> {
  const { role } = input;
  const expSummary = (cv.experience || []).slice(0, 5).map(e =>
    `- ${e.role} bij ${e.employer}`
  ).join('\n');

  const prompt = `Adviseer welke 5-10 keywords passen bij deze kandidaat voor de rol: "${role}".

KANDIDAAT-WERKERVARING:
${expSummary}

LEVER:
- 5-10 sector-specifieke keywords (UPPERCASE)
- Korte uitleg per keyword waarom het past
- In het Nederlands

Format: 
KEYWORD — uitleg`;

  try {
    const response = await getGemini().models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: { temperature: 0.4, maxOutputTokens: 600 },
    });
    const advice = (response.text || '').trim();
    return { result: advice || 'Geen advies gegenereerd.' };
  } catch (e: any) {
    return { result: `Fout bij keyword-advies: ${e?.message || String(e)}` };
  }
}

// ─── PUNT 7 — VACANCY OPTIMIZATION ───────────────────────────────────────────
async function executeOptimizeForVacancy(
  input: { vacancy_text: string; scope?: string },
  cv: ParsedCV
): Promise<{ result: string; updatedCv?: ParsedCV }> {
  const { vacancy_text, scope = 'tags_and_bullets' } = input;

  if (!vacancy_text || vacancy_text.trim().length < 20) {
    return { result: 'Fout: vacaturetekst is te kort. Geef de volledige vacature of een gedetailleerde rolbeschrijving.' };
  }

  // Reuse the existing parseCV pipeline with vacancyText — this triggers the full optimization
  // that's already proven in production
  const { geminiService } = await import('./geminiService');

  try {
    // Pass the current CV as JSON text and let parseCV re-process it with vacancy context
    const result = await geminiService.parseCV({
      text: JSON.stringify(cv),
      vacancyText: vacancy_text,
      finalGradeMode: scope === 'tags_only' || scope === 'score_only', // light touch mode for these scopes
    });

    // Merge: keep certain fields from original, take optimization from result
    const updatedCv = cloneCv(cv);

    if (scope === 'tags_and_bullets' || scope === 'bullets_only') {
      // Update experience bullets
      if (result.experience && updatedCv.experience) {
        result.experience.forEach((newExp, i) => {
          if (updatedCv.experience![i] && newExp.bullets) {
            updatedCv.experience![i].bullets = newExp.bullets;
          }
        });
      }
    }

    if (scope === 'tags_and_bullets' || scope === 'tags_only') {
      // Update tags
      if (result.analysis?.tags) {
        if (!updatedCv.analysis) updatedCv.analysis = { scores: { overall: 0 }, tags: [], strengths: [], weaknesses: [], summary: '' } as any;
        updatedCv.analysis!.tags = result.analysis.tags;
      }
    }

    // Always include match scores when vacancy provided
    if (result.analysis?.vacancyMatches) {
      if (!updatedCv.analysis) updatedCv.analysis = { scores: { overall: 0 }, tags: [], strengths: [], weaknesses: [], summary: '' } as any;
      updatedCv.analysis!.vacancyMatches = result.analysis.vacancyMatches;
    }

    const scoreSummary = result.analysis?.vacancyMatches
      ? result.analysis.vacancyMatches.map(m => `${m.title}: ${Math.round(m.score)}%`).join(', ')
      : 'geen scores beschikbaar';

    return {
      result: `CV geoptimaliseerd voor de vacature (scope: ${scope}). Match-scores: ${scoreSummary}`,
      updatedCv,
    };
  } catch (e: any) {
    return { result: `Fout bij vacature-optimalisatie: ${e?.message || String(e)}` };
  }
}

export async function executeTool(
  name: string,
  input: Record<string, any>,
  cv: ParsedCV
): Promise<{ result: string; updatedCv?: ParsedCV }> {
  switch (name) {
    case 'rephrase_bullet':
      return executeRephraseBullet(input as any, cv);
    case 'bullets_from_text':
      return executeBulletsFromText(input as any, cv);
    case 'complete_bullets':
      return executeCompleteBullets(input as any, cv);
    case 'regenerate_keywords':
      return executeRegenerateKeywords(input as any, cv);
    case 'suggest_keywords':
      return executeSuggestKeywords(input as any, cv);
    case 'optimize_for_vacancy':
      return executeOptimizeForVacancy(input as any, cv);
    default:
      return { result: `Onbekende tool: ${name}` };
  }
}
