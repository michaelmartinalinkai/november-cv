// AI Assistant tool definitions.
// Each tool maps to one of Maria's wishlist points so the AI can make precise edits to the CV.
//
// IMPORTANT — content preservation rules (Maria's biggest complaint):
// - Tools that "rewrite" never invent new tasks/skills
// - Tools that "complete" only fill gaps without changing existing bullets
// - Tools that "improve language" preserve exact factual content
//
// Each tool has:
//   - name (used by AI to call it)
//   - description (tells the AI when to use it)
//   - input_schema (JSON schema for the parameters)

import { ToolDefinition } from './chatService';

// ─── PUNT 12 — CONTENT PRESERVATION ──────────────────────────────────────────
export const TOOL_REPHRASE_BULLET: ToolDefinition = {
  name: 'rephrase_bullet',
  description: `Herschrijf één enkele bullet in een werkervaring, met strikte content-regels.

GEBRUIK WANNEER de gebruiker een specifieke bullet wil aanpassen, zoals:
- "Maak deze korter, behoud de inhoud"
- "Maak professioneler, voeg niets toe"
- "Verbeter alleen het taalniveau"

MODES bepalen hoeveel je mag veranderen:
- "shorten_keep_content": Korter maken, ALLE feitelijke inhoud behouden
- "improve_language_only": Alleen taalniveau verbeteren (woordkeuze, professionaliteit), feitelijke inhoud EXACT behouden
- "professionalize": Professioneler maken in Novêmber-stijl, content niet uitbreiden of veranderen
- "preserve_tone": Originele toon behouden, alleen grammatica/spelling corrigeren

VERZIN NOOIT nieuwe taken, vaardigheden of verantwoordelijkheden.`,
  input_schema: {
    type: 'object',
    properties: {
      job_index: {
        type: 'number',
        description: 'Index van de werkervaring in de experience array (0 = eerste functie in de huidige volgorde)',
      },
      bullet_index: {
        type: 'number',
        description: 'Index van de bullet binnen die functie (0 = eerste bullet)',
      },
      mode: {
        type: 'string',
        enum: ['shorten_keep_content', 'improve_language_only', 'professionalize', 'preserve_tone'],
        description: 'De aanpassingsmodus die bepaalt hoeveel je mag veranderen',
      },
      additional_instruction: {
        type: 'string',
        description: 'Optionele aanvullende instructie van de gebruiker (bv. "max 12 woorden")',
      },
    },
    required: ['job_index', 'bullet_index', 'mode'],
  },
};

// ─── PUNT 3 — TEXT TO BULLETS ────────────────────────────────────────────────
export const TOOL_BULLETS_FROM_TEXT: ToolDefinition = {
  name: 'bullets_from_text',
  description: `Zet een blok lopende tekst om naar Novêmber-stijl bullets en voeg ze toe aan een functie.

GEBRUIK WANNEER de gebruiker tekst geeft die in bullets moet, zoals:
- "Maak dit 6 korte professionele bullets" + tekst
- "Voeg deze taken toe aan de rol Jeugdhulpverlener"
- "Zet deze paragraaf om in bullets en voeg toe aan de laatste functie"
- "Structureer deze Word-tekst voor de eerste functie"

GEDRAG:
- Tekst → korte professionele bullets in Novêmber-stijl (actieve werkwoorden, geen jargon)
- Target_count bepaalt hoeveel bullets — als niet opgegeven, kies een natuurlijk aantal (meestal 4-7)
- Bullets worden TOEGEVOEGD aan de bestaande bullets van de functie (niet vervangen)
- VERZIN GEEN content die niet in de bron-tekst staat — herformuleer alleen wat er staat`,
  input_schema: {
    type: 'object',
    properties: {
      job_index: {
        type: 'number',
        description: 'Index van de functie waar de nieuwe bullets aan worden toegevoegd',
      },
      source_text: {
        type: 'string',
        description: 'De lopende tekst die omgezet moet worden naar bullets',
      },
      target_count: {
        type: 'number',
        description: 'Gewenst aantal bullets (optioneel — als niet opgegeven kiest de tool een natuurlijk aantal van 4-7)',
      },
      replace_existing: {
        type: 'boolean',
        description: 'Of bestaande bullets vervangen moeten worden (default: false — bullets worden toegevoegd)',
      },
    },
    required: ['job_index', 'source_text'],
  },
};

// ─── PUNT 8 — SMART BULLET COMPLETION ────────────────────────────────────────
export const TOOL_COMPLETE_BULLETS: ToolDefinition = {
  name: 'complete_bullets',
  description: `Vul bullets aan tot een minimumaantal zonder bestaande bullets te veranderen.

GEBRUIK WANNEER de gebruiker bullets wil aanvullen, zoals:
- "Vul deze functie aan tot minimaal 5 bullets"
- "Voeg bullets toe waar nodig" (kies dan target_count=5)
- "Maak deze taken compleet zonder de bestaande te veranderen"

GEDRAG (HEEL BELANGRIJK):
- Bestaande bullets blijven EXACT zoals ze zijn — niet aangeraakt
- Alleen nieuwe bullets worden TOEGEVOEGD om tot target_count te komen
- Nieuwe bullets passen bij de functie (rol + werkgever) maar VERZIN GEEN concrete handelingen die niet plausibel zijn
- Als er al genoeg bullets zijn (>= target_count), niets doen
- Dit lost Maria's grootste frustratie op: dat de converter "zelf dingen verzint"`,
  input_schema: {
    type: 'object',
    properties: {
      job_index: {
        type: 'number',
        description: 'Index van de functie waar bullets aangevuld moeten worden',
      },
      target_count: {
        type: 'number',
        description: 'Minimumaantal bullets dat de functie moet hebben (meestal 5)',
      },
    },
    required: ['job_index', 'target_count'],
  },
};

// Export array of all currently-active tools (each chunk will add more)
export const ALL_TOOLS: ToolDefinition[] = [
  TOOL_REPHRASE_BULLET,
  TOOL_BULLETS_FROM_TEXT,
  TOOL_COMPLETE_BULLETS,
];
