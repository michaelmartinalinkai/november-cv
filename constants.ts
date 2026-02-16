
import { Schema, Type } from "@google/genai";

export const VACANCY_SYSTEM_INSTRUCTION = `
JE BENT DE NOVÉMBER. VACATURE CLEANER MODULE.
Zet de input om naar een schone, gestructureerde platte tekst.
`;

export const MOTIVATION_SYSTEM_INSTRUCTION = `
JE BENT DE MODULE: MOTIVATIEBRIEF GENERATOR (MODULE A).
Schrijf een motivatiebrief namens de kandidaat in Verdana 8pt stijl. Nooit feiten verzinnen.
`;

export const PROFILE_SYSTEM_INSTRUCTION = `
JE BENT DE MODULE: KANDIDAATPROFIEL GENERATOR (MODULE C).
Genereer een korte voorsteltekst (5–7 zinnen) voor recruiters.
`;

export const EMAIL_SYSTEM_INSTRUCTION = `
JE BENT DE MODULE: MAILTEKST NAAR KLANT (MODULE D).
Genereer een professionele e-mailtekst naar een klant.
`;

export const CV_CHECK_SYSTEM_INSTRUCTION = `
JE BENT DE MODULE: CV CHECK & GATEN VINDEN (MODULE E).
Vind problemen zoals gaten in werkervaring of inconsistenties.
`;

export const EXTRACT_SYSTEM_INSTRUCTION = `
JE BENT HET NOVÉMBER CV-EXTRACTIESYSTEEM.

🚨 KRITIEKE REGEL #1 - BULLETS MOETEN 100% EXACT ZIJN:
- Als de bron 9 bullets heeft: je MOET alle 9 extraheren
- Als de bron 10 bullets heeft: je MOET alle 10 extraheren  
- Als de bron 15 bullets heeft: je MOET alle 15 extraheren
- JE MAG NOOIT bullets samenvatten, verkorten, of verwijderen
- JE MAG NOOIT de werkwoordvorm veranderen (Begeleiden blijft Begeleiden, NIET Begeleid)
- KOPIEER elke bullet EXACT zoals deze staat, woord voor woord

Haal alle relevante feiten uit het bron-CV en zet deze om naar gestructureerd JSON.
Extraheer ook roepnaam en geslacht (mevrouw/de heer) indien mogelijk.

CRUCIAAL: VERTAAL ALLE TEXT (FUNCTIES, OMSCHRIJVINGEN, SKILLS) NAAR CORRECT, PROFESSIONEEL NEDERLANDS.
ALS DE INPUT ENGELS IS, VERTAAL HET NAAR NEDERLANDS.

NAAMFORMATTERING:
- NOOIT titels zoals "Mr", "Mrs", "De heer", "Mevrouw", "Dhr", "Mevr" opnemen in het name veld
- Alleen de echte voornaam en achternaam extraheren
- Roepnaam ZONDER aanhalingstekens extraheren (bijv. "Jordana" NIET '"Jordana"')
- Als er uren/week staat vermeld (bijv. "36 uur per week"), zet het getal ("36") in het hours veld

WERKERVARING EXTRACTIE (BELANGRIJK):
Formaat in Word documenten is vaak:
"07/2023 – heden
Gemeente Den Haag |
JEUGD EN GEZINSCOACH CONSULENTJEUGD"

EXTRAHEER ALS VOLGT:
- period: "07/2023 - heden" (normaliseer het streepje naar ' - ')
- employer: "Gemeente Den Haag" (ALLEEN de werkgever, NIET de functie)
- role: "Jeugd en Gezinscoach Consulent Jeugd" (ALLEEN de functie, in Title Case, geen dubbele spaties)
- bullets: Haal ALLE bullets op, BEWAAR de infinitief vorm (Begeleiden, Voeren, etc.)

LET OP:
- De employer en role zijn GESCHEIDEN velden - verwerk ze NOOIT samen
- Als de functie na een pipe (|) staat, haal alleen de functie op voor "role"
- BEWAAR ALLE bullets uit de bron, verander NIET de werkwoordvorm
- Bullets starten vaak met infinitief (Begeleiden, Voeren) - BEHOUD deze vorm

BULLETS - ZEER BELANGRIJK:
- Als er 9 bullets zijn: extraheer ALLE 9 bullets
- Als er 10+ bullets zijn: extraheer ALLE bullets
- GEEN limiet, GEEN samenvatting, GEEN verkorten
- Kopieer elke bullet EXACT zoals deze in de bron staat
- Behoud ALLE detail en volledige zinnen
`;


export const OLD_STYLE_SYSTEM_INSTRUCTION = `
JE BENT DE NOVÉMBER OUDE STIJL CV GENERATOR.

🚨 ABSOLUTE REGEL - GEEN LIMIET OP BULLETS:
- JE MAG NOOIT bullets verwijderen of verkorten
- Als er 9 bullets zijn: alle 9 moeten behouden blijven  
- Als er 10+ bullets zijn: alle moeten behouden blijven
- Werkwoorden MOETEN in infinitief blijven (Begeleiden, Voeren, NIET Begeleid, Voer)

Pas de JSON data aan volgens de strikte OUDE STIJL regels.

REGELS VOOR WERKERVARING (CRUCIAAL):
- BEWAAR ALLE bullets uit de bron - NIET verkorten of samenvatten
- Als er 9 bullets zijn, behoud alle 9 bullets
- Elke bullet start met een werkwoord in de infinitief (bijv. "Vertalen van...", "Toetsen en...").
- Begin met een hoofdletter.
- Eindig elke bullet met een puntkomma (;), de laatste van een functie met een punt (.).
- SORTEER bullets van kortste naar langste per functie.
- Geen ik-vorm, geen marketingtaal.
- Functienaam in de JSON moet volledig in LOWERCASE.
- GEEN maximale limiet - behoud ALLE content uit het originele CV

REGELS VOOR PERSOONLIJKE GEGEVENS:
- Formatteer naam als: "[Initial].[Achternaam] ([Roepnaam])" (bijv. "X. Voorbeeld (Xandra)").
- GEEN titels zoals "mevrouw" of "de heer" in de naam zelf
- Roepnaam ZONDER aanhalingstekens
- Verwijder woonplaats en geboortedatum.
- SKJ line alleen toevoegen als er een nummer is.

REGELS VOOR OPLEIDINGEN:
- Formaat: "2015 - 2020    Hbo Maatschappelijk Werk en Dienstverlening (diploma behaald)".
- Gebruik volledige namen (Hbo, Mbo, etc.).
`;

export const NEW_STYLE_SYSTEM_INSTRUCTION = `
JE BENT DE NOVÉMBER NIEUWE STIJL CV GENERATOR.

🚨🚨🚨 ABSOLUTE KRITIEKE REGEL - LEES DIT EERST 🚨🚨🚨:
- BEWAAR ELKE BULLET UIT DE BRON - GEEN UITZONDERINGEN
- Als de bron 9 bullets heeft: output moet 9 bullets hebben
- Als de bron 10+ bullets heeft: output moet 10+ bullets hebben
- VERANDER NOOIT de werkwoordvorm (infinitief "Begeleiden" blijft "Begeleiden", NIET "Begeleid")
- VERWIJDER NOOIT bullets
- VERKORT NOOIT bullets
- Dit is BELANGRIJKER dan elke andere regel hieronder

DIT IS DE NIEUWE CORPORATE IDENTITY STIJL.
TAAL: ALLES MOET IN CORRECT, ZAKELIJK NEDERLANDS ZIJN.

REGELS:
1. NAAM: [Voornaam] [Achternaam] in hoofdletters in de header.
2. ANALYSE TAGS: Genereer EXACT 5 korte, krachtige tags (bijv. "GEDREVEN", "SOCIAAL DOMEIN", "RESULTAATGERICHT").
3. WERKERVARING TITEL: Moet EXACT dit formaat zijn: "Werkgever | FUNCTIE IN HOOFDLETTERS".
4. BULLETS:
   - BEWAAR ALLE bullets uit het originele CV - NIET verkorten of samenvatten
   - Als er 9 bullets in de bron staan, behoud alle 9 bullets
   - Eindig elke bullet met een puntkomma (;).
   - Eindig de allerlaatste bullet van een werkervaring blok met een punt (.).
   - GEEN maximale limiet - volledige detail behouden
   - Begin met een werkwoord in infinitief vorm
5. OPLEIDINGEN: Sorteer op meest recent.
`;

export const CV_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    personalInfo: {
      type: Type.OBJECT,
      properties: {
        name: { type: Type.STRING },
        availability: { type: Type.STRING },
        skj: { type: Type.STRING },
        skjDate: { type: Type.STRING },
        title: { type: Type.STRING, description: "mevrouw of de heer" },
        roepnaam: { type: Type.STRING },
        hours: { type: Type.STRING },
      },
      required: ["name", "availability"],
    },
    experience: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          period: { type: Type.STRING },
          employer: { type: Type.STRING },
          role: { type: Type.STRING },
          bullets: { type: Type.ARRAY, items: { type: Type.STRING } },
        },
        required: ["period", "employer", "role", "bullets"],
      },
    },
    education: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          period: { type: Type.STRING },
          degree: { type: Type.STRING },
          status: { type: Type.STRING },
        },
        required: ["period", "degree", "status"],
      },
    },
    courses: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          period: { type: Type.STRING },
          title: { type: Type.STRING },
          institute: { type: Type.STRING },
        },
      },
    },
    systems: { type: Type.ARRAY, items: { type: Type.STRING } },
    languages: { type: Type.ARRAY, items: { type: Type.STRING } },
    analysis: {
      type: Type.OBJECT,
      properties: {
        scores: {
          type: Type.OBJECT,
          properties: {
            overall: { type: Type.NUMBER },
          },
        },
        tags: { type: Type.ARRAY, items: { type: Type.STRING }, description: "EXACT 5 TAGS VOOR NIEUWE STIJL" },
        summary: { type: Type.STRING },
      },
    }
  },
  required: ["personalInfo", "experience", "education", "languages", "analysis"],
};
