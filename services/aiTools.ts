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

// ─── PUNT 9 — STRONGER KEYWORDS ──────────────────────────────────────────────
export const TOOL_REGENERATE_KEYWORDS: ToolDefinition = {
  name: 'regenerate_keywords',
  description: `Genereer nieuwe sterke-punten-tags (de 5 keywords bovenaan het CV) op basis van een focus of de huidige werkervaring.

GEBRUIK WANNEER de gebruiker tags wil aanpassen, zoals:
- "Focus meer op change management en stakeholder management"
- "Maak de tags sterker"
- "Vervang de tags door iets meer recruitment-gericht"
- "Genereer nieuwe keywords"

REGELS:
- Lever ALTIJD exact 5 tags
- Tags moeten sector/rol-specifiek zijn (bv. "CASUÏSTIEKREGIE", "JEUGDZORG", "STAKEHOLDERMANAGEMENT")
- VERMIJD vage tags zoals "Professional", "Gedreven", "Resultaatgericht"
- Tags worden UPPERCASE getoond in het CV
- Baseer op de werkervaring in het CV, niet op verzonnen informatie`,
  input_schema: {
    type: 'object',
    properties: {
      focus: {
        type: 'string',
        description: 'Optionele focus-instructie van de gebruiker (bv. "change management" of "voor secondment bij gemeenten"). Leeg laten voor automatische keuze.',
      },
    },
    required: [],
  },
};

export const TOOL_SUGGEST_KEYWORDS: ToolDefinition = {
  name: 'suggest_keywords',
  description: `Stel keywords voor zonder het CV te wijzigen — alleen advies.

GEBRUIK WANNEER de gebruiker advies wil over keywords, zoals:
- "Welke keywords passen bij deze kandidaat voor een HR Business Partner rol?"
- "Welke woorden zou je sterker maken voor deze functie?"

Dit is een ADVIES-tool — verandert het CV NIET. Het antwoord komt terug als tekst.`,
  input_schema: {
    type: 'object',
    properties: {
      role: {
        type: 'string',
        description: 'De rol waarvoor keywords gesuggereerd worden (bv. "HR Business Partner")',
      },
    },
    required: ['role'],
  },
};

// ─── PUNT 7 — VACANCY OPTIMIZATION ───────────────────────────────────────────
export const TOOL_OPTIMIZE_FOR_VACANCY: ToolDefinition = {
  name: 'optimize_for_vacancy',
  description: `Optimaliseer het volledige CV voor een specifieke vacature.

GEBRUIK WANNEER de gebruiker een CV wil afstemmen op een vacature, zoals:
- "Optimaliseer dit CV voor een rol als Jeugdbeleidsadviseur"
- "Stem dit CV af op de vacature [tekst]"
- "Maak dit CV vacature-gericht voor de Municipality of Rotterdam"

GEDRAG:
- Tags worden afgestemd op de vacaturevereisten
- Bullets worden herschreven om vacature-terminologie te gebruiken WAAR FEITELIJK CORRECT
- Match-scores worden gegenereerd (Algehele match, Werkervaring relevantie, Sectorkennis)
- VERZIN NIETS — geen nieuwe vaardigheden of taken die niet in het origineel staan
- Originele inhoud blijft behouden, alleen formulering wordt afgestemd`,
  input_schema: {
    type: 'object',
    properties: {
      vacancy_text: {
        type: 'string',
        description: 'De volledige vacaturetekst waarop het CV moet worden afgestemd. Als de gebruiker alleen een rol noemt zonder tekst, gebruik dan de rol als beschrijving.',
      },
      scope: {
        type: 'string',
        enum: ['tags_and_bullets', 'tags_only', 'bullets_only', 'score_only'],
        description: 'Welke onderdelen worden geoptimaliseerd. Default: tags_and_bullets',
      },
    },
    required: ['vacancy_text'],
  },
};

// ─── PUNT 1 — COVER LETTER GENERATION ────────────────────────────────────────
export const TOOL_GENERATE_COVER_LETTER: ToolDefinition = {
  name: 'generate_cover_letter',
  description: `Genereer een motivatiebrief op basis van het CV en (optioneel) een vacature.

GEBRUIK WANNEER de gebruiker een motivatiebrief wil, zoals:
- "Schrijf een motivatiebrief voor deze kandidaat voor de gemeente Rotterdam"
- "Maak een motivatiebrief op basis van de vacature [tekst]"
- "Genereer een motivatiebrief in zakelijke toon"

GEDRAG:
- Brief wordt opgeslagen in CV's motivationLetter veld
- Recruiter kan brief daarna downloaden als losse PDF (matching Novêmber stijl)
- Stijl en toon worden aangepast op basis van tone parameter
- Refereert naar feitelijke ervaring uit het CV
- VERZIN GEEN ervaringen of vaardigheden die niet in het CV staan`,
  input_schema: {
    type: 'object',
    properties: {
      vacancy_text: {
        type: 'string',
        description: 'Vacaturetekst om de brief op af te stemmen (optioneel — als niet opgegeven, generieke brief op basis van CV)',
      },
      target_company: {
        type: 'string',
        description: 'Naam van het bedrijf/de organisatie waarop gericht (bv. "Gemeente Rotterdam")',
      },
      tone: {
        type: 'string',
        enum: ['professional', 'enthusiastic', 'formal', 'conversational'],
        description: 'Toon van de brief. Default: professional',
      },
      length: {
        type: 'string',
        enum: ['short', 'medium', 'long'],
        description: 'Lengte: short (~150 woorden, 2 paragrafen), medium (~300 woorden, 3-4 paragrafen), long (~500 woorden, 4-5 paragrafen). Default: medium',
      },
    },
    required: [],
  },
};

// ─── PUNT 13 — EXISTING CV EDITING ───────────────────────────────────────────
export const TOOL_ADJUST_ROLE: ToolDefinition = {
  name: 'adjust_role',
  description: `Pas één specifieke werkervaring aan op basis van een instructie.

GEBRUIK WANNEER de gebruiker een specifieke functie wil aanpassen, zoals:
- "Pas alleen de laatste werkervaring aan"
- "Voeg deze taken toe aan de rol van Jeugdbegeleider"
- "Maak deze functie meer geschikt voor secondment bij gemeenten"

GEDRAG:
- Wijzigt ALLEEN de aangewezen functie — andere functies blijven onaangeraakt
- Volgt de instructie (uitbreiden, herformuleren, focus aanpassen)
- VERZIN GEEN nieuwe ervaring die niet plausibel is voor de rol`,
  input_schema: {
    type: 'object',
    properties: {
      job_index: {
        type: 'number',
        description: 'Index van de functie die aangepast moet worden',
      },
      instruction: {
        type: 'string',
        description: 'Specifieke instructie wat aangepast moet worden (bv. "maak meer secondment-gericht", "voeg ketenpartner-samenwerking toe als die er was")',
      },
    },
    required: ['job_index', 'instruction'],
  },
};

export const TOOL_ADD_NEW_ROLE: ToolDefinition = {
  name: 'add_new_role',
  description: `Voeg een nieuwe werkervaring toe aan het CV.

GEBRUIK WANNEER de gebruiker een nieuwe functie wil toevoegen, zoals:
- "Voeg deze nieuwe opdracht toe in dezelfde stijl als de rest"
- "Voeg toe: Beleidsadviseur bij Gemeente Amsterdam, jan 2024 - heden"

GEDRAG:
- Nieuwe functie wordt aan het BEGIN van de experience array gezet (meest recent)
- Bullets worden gegenereerd in dezelfde stijl als bestaande bullets — als ze niet zijn opgegeven
- VERZIN GEEN ervaring — als bullets niet zijn opgegeven, vraag om verduidelijking of laat ze leeg`,
  input_schema: {
    type: 'object',
    properties: {
      period: {
        type: 'string',
        description: 'Periode (bv. "jan 2024 - heden" of "2020 - 2023")',
      },
      employer: {
        type: 'string',
        description: 'Werkgever / organisatie',
      },
      role: {
        type: 'string',
        description: 'Functietitel',
      },
      bullets: {
        type: 'array',
        items: { type: 'string' },
        description: 'Taken/verantwoordelijkheden. Als leeg gelaten, worden bullets gegenereerd op basis van rol+werkgever.',
      },
    },
    required: ['period', 'employer', 'role'],
  },
};

export const TOOL_REWRITE_JOB_BULLETS: ToolDefinition = {
  name: 'rewrite_job_bullets',
  description: `Herschrijf alle bullets van één functie tegelijk.

GEBRUIK WANNEER de gebruiker een complete herschrijving van een functie wil, zoals:
- "Herschrijf alle bullets van de laatste functie meer beleids-gericht"
- "Maak alle taken van Jeugdbegeleider professioneler"

GEDRAG:
- Alle bullets van de aangewezen functie worden herschreven
- Aantal blijft hetzelfde tenzij anders aangegeven
- VERZIN GEEN nieuwe content — alleen herformuleren
- Behoud feitelijke inhoud`,
  input_schema: {
    type: 'object',
    properties: {
      job_index: {
        type: 'number',
        description: 'Index van de functie',
      },
      instruction: {
        type: 'string',
        description: 'Instructie voor de herschrijving (bv. "meer beleids-gericht", "professioneler", "korter en krachtiger")',
      },
    },
    required: ['job_index', 'instruction'],
  },
};

// ─── PUNT 4 — RELEVANCE ADVISORY ─────────────────────────────────────────────
export const TOOL_ADVISE_RELEVANCE: ToolDefinition = {
  name: 'advise_relevance',
  description: `Geef advies over welke werkervaring het meest relevant is voor een specifieke rol of vacature.

GEBRUIK WANNEER de gebruiker advies wil over werkervaring-prioritering, zoals:
- "Welke werkervaring zou je bovenaan zetten voor deze vacature?"
- "Welke 3 functies zijn het meest relevant voor een rol als Jeugdbeleidsadviseur?"
- "Help me kiezen welke ervaring te benadrukken"

Dit is een ADVIES-tool — verandert het CV NIET (geen herordening, geen pin). 
Het antwoord komt als tekst terug, de recruiter beslist daarna zelf om te pinnen of slepen.`,
  input_schema: {
    type: 'object',
    properties: {
      target_role_or_vacancy: {
        type: 'string',
        description: 'De rol of vacature waarvoor relevantie geadviseerd moet worden',
      },
    },
    required: ['target_role_or_vacancy'],
  },
};

export const TOOL_SET_PINNED: ToolDefinition = {
  name: 'set_pinned',
  description: `Pin of unpin een specifieke werkervaring zodat die altijd bovenaan blijft (ongeacht datum).

GEBRUIK WANNEER de gebruiker een functie aan bovenaan wil vasthouden, zoals:
- "Pin de Beleidsadviseur-functie naar boven"
- "Maak de pin op de eerste functie los"`,
  input_schema: {
    type: 'object',
    properties: {
      job_index: {
        type: 'number',
        description: 'Index van de functie',
      },
      pinned: {
        type: 'boolean',
        description: 'true om te pinnen, false om los te maken',
      },
    },
    required: ['job_index', 'pinned'],
  },
};

// ─── DELETION TOOLS ──────────────────────────────────────────────────────────
export const TOOL_DELETE_BULLET: ToolDefinition = {
  name: 'delete_bullet',
  description: `Verwijder één specifieke bullet uit een functie.

GEBRUIK WANNEER de gebruiker een bullet wil verwijderen, zoals:
- "Verwijder de derde bullet van de laatste functie"
- "Haal de laatste bullet weg uit de Jeugdbegeleider-rol"
- "Verwijder die ene bullet over administratie"

GEDRAG:
- Verwijdert ALLEEN de aangewezen bullet
- Andere bullets blijven onveranderd
- Vraag om verduidelijking als je niet zeker weet welke bullet de gebruiker bedoelt`,
  input_schema: {
    type: 'object',
    properties: {
      job_index: {
        type: 'number',
        description: 'Index van de functie',
      },
      bullet_index: {
        type: 'number',
        description: 'Index van de bullet die verwijderd moet worden (0 = eerste)',
      },
    },
    required: ['job_index', 'bullet_index'],
  },
};

export const TOOL_DELETE_ROLE: ToolDefinition = {
  name: 'delete_role',
  description: `Verwijder een hele werkervaring uit het CV.

GEBRUIK WANNEER de gebruiker een functie helemaal wil weghalen, zoals:
- "Verwijder die korte opdracht bij X"
- "Haal de Jeugdbegeleider-functie weg"
- "Die 6-maand klus mag eruit"

GEDRAG:
- VRAAG ALTIJD EERST OM BEVESTIGING door de functietitel + werkgever te noemen voordat je verwijdert
- Bijvoorbeeld: "Ik ga 'Jeugdbegeleider bij Stichting X (2022-2023)' verwijderen. Klopt dat?"
- Pas verwijderen NA gebruikersbevestiging`,
  input_schema: {
    type: 'object',
    properties: {
      job_index: {
        type: 'number',
        description: 'Index van de functie die verwijderd moet worden',
      },
      confirmed: {
        type: 'boolean',
        description: 'Of de gebruiker expliciet heeft bevestigd dat deze functie verwijderd mag worden. MOET true zijn — anders weigert de tool.',
      },
    },
    required: ['job_index', 'confirmed'],
  },
};

// ─── REORDER EXPERIENCE (via AI) ─────────────────────────────────────────────
export const TOOL_REORDER_EXPERIENCE: ToolDefinition = {
  name: 'reorder_experience',
  description: `Verander de volgorde van werkervaringen in het CV.

GEBRUIK WANNEER de gebruiker werkervaring wil herordenen, zoals:
- "Zet de beleidsadviseur-functie bovenaan"
- "Verplaats de tweede functie naar onderaan"
- "Zet de Jeugdzorg-rollen samen"

GEDRAG:
- Activeert "handmatige volgorde" — daarna respecteert het CV de array-volgorde in plaats van datum-sortering
- new_order moet ALLE bestaande job-indices bevatten (gewoon herschikt)
- Voorbeeld: als er 4 functies zijn (indices 0-3) en de gebruiker wil index 2 bovenaan, dan new_order = [2, 0, 1, 3]`,
  input_schema: {
    type: 'object',
    properties: {
      new_order: {
        type: 'array',
        items: { type: 'number' },
        description: 'Nieuwe volgorde van indices. Moet ALLE bestaande indices precies één keer bevatten.',
      },
    },
    required: ['new_order'],
  },
};

// Export array of all currently-active tools
export const ALL_TOOLS: ToolDefinition[] = [
  TOOL_REPHRASE_BULLET,
  TOOL_BULLETS_FROM_TEXT,
  TOOL_COMPLETE_BULLETS,
  TOOL_REGENERATE_KEYWORDS,
  TOOL_SUGGEST_KEYWORDS,
  TOOL_OPTIMIZE_FOR_VACANCY,
  TOOL_GENERATE_COVER_LETTER,
  TOOL_ADJUST_ROLE,
  TOOL_ADD_NEW_ROLE,
  TOOL_REWRITE_JOB_BULLETS,
  TOOL_ADVISE_RELEVANCE,
  TOOL_SET_PINNED,
  TOOL_DELETE_BULLET,
  TOOL_DELETE_ROLE,
  TOOL_REORDER_EXPERIENCE,
];
