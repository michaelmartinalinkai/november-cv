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

// Export array of all currently-active tools (each chunk will add more)
export const ALL_TOOLS: ToolDefinition[] = [
  TOOL_REPHRASE_BULLET,
];
