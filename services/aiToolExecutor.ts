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

// ─── MAIN EXECUTOR ────────────────────────────────────────────────────────────
export async function executeTool(
  name: string,
  input: Record<string, any>,
  cv: ParsedCV
): Promise<{ result: string; updatedCv?: ParsedCV }> {
  switch (name) {
    case 'rephrase_bullet':
      return executeRephraseBullet(input as any, cv);
    default:
      return { result: `Onbekende tool: ${name}` };
  }
}
