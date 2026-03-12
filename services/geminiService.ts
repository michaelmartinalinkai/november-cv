import { GoogleGenAI } from "@google/genai";
import {
  EXTRACT_SYSTEM_INSTRUCTION,
  OLD_STYLE_SYSTEM_INSTRUCTION,
  NEW_STYLE_SYSTEM_INSTRUCTION,
  CV_SCHEMA
} from "../constants";
import { ParsedCV } from "../types";
import { config } from "../config";

export interface CVInput {
  text: string;
  files?: Array<{
    mimeType: string;
    data: string;
  }>;
  vacancyText?: string;
  extraContext?: string;
  template?: 'old' | 'new';
  fileName?: string;
}

export class GeminiService {

  private extractJson(text: string): string {
    if (!text) return "{}";
    let cleaned = text.trim();

    // Remove markdown code blocks if present
    if (cleaned.startsWith('```')) {
      const match = cleaned.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
      if (match) {
        cleaned = match[1].trim();
      } else {
        // Fallback: just strip the marks manually
        cleaned = cleaned.replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
      }
    }

    // Attempt to find the first '{' and last '}'
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start !== -1 && end !== -1 && end > start) {
      cleaned = cleaned.substring(start, end + 1);
    }

    return cleaned;
  }

  /**
   * Wrapper to handle transient API errors (like 500, 503, or XHR Rpc failures) with retries.
   */
  private async generateWithRetry(ai: GoogleGenAI, params: any, retries = 3): Promise<any> {
    for (let i = 0; i < retries; i++) {
      try {
        return await ai.models.generateContent(params);
      } catch (error: any) {
        const isLastAttempt = i === retries - 1;

        // Identify transient errors
        // Code 6 / "Rpc failed" often happens with network interruptions or server overload
        // 500/503 are standard server errors
        const errorMessage = error.message || "";
        const isTransient =
          error.status === 500 ||
          error.status === 503 ||
          errorMessage.includes("Rpc failed") ||
          errorMessage.includes("xhr error") ||
          errorMessage.includes("error code: 6");

        if (isTransient && !isLastAttempt) {
          const delay = 1000 * Math.pow(2, i); // 1s, 2s, 4s
          console.warn(`Gemini API Attempt ${i + 1} failed (${errorMessage}). Retrying in ${delay}ms...`);
          await new Promise(res => setTimeout(res, delay));
          continue;
        }

        // If not transient or last attempt, throw
        throw error;
      }
    }
  }

  private getApiKey(): string {
    const key = config.geminiApiKey || process.env.API_KEY || "";
    if (!key) {
      throw new Error("API Key ontbreekt. Voer uw Google Gemini API Key in via config.ts of .env file.");
    }
    return key;
  }

  /**
   * Phase 1: General Data Extraction
   */
  async extractCVData(input: CVInput): Promise<ParsedCV> {
    const ai = new GoogleGenAI({ apiKey: this.getApiKey() });
    const parts: any[] = [];

    if (input.files && input.files.length > 0) {
      parts.push(...input.files.map(f => ({
        inlineData: { mimeType: f.mimeType, data: f.data }
      })));
    }

    // Try to extract full name from filename (e.g. "CV_van_Alice_Mahfouz_NOVEMBER.pdf" -> "Alice Mahfouz")
    const fileNameHint = (() => {
      if (!input.fileName) return null;
      const base = input.fileName.replace(/\.[^.]+$/, '').replace(/_/g, ' ');
      const m = base.match(/CV\s*(?:van\s+)?([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/);
      return m ? m[1] : null;
    })();

    const nameInstruction = fileNameHint
      ? `- 'name': Het CV bevat mogelijk alleen een voorletter. De bestandsnaam geeft de volledige naam: "${fileNameHint}". Gebruik deze naam tenzij het CV zelf een duidelijk andere volledige naam vermeldt.`
      : `- 'name': Als het CV alleen een voorletter bevat (bijv. "A. Mahfouz") en geen volledige voornaam staat vermeld, gebruik dan ALLEEN de voorletter + achternaam. VERZIN NOOIT een voornaam.`;

    parts.push({
      text: `INSTRUCTIE: Haal alle relevante data uit dit CV. Output moet EXACT voldoen aan het JSON schema.
    
    SPECIFIEKE REACTIES:
    ${nameInstruction}
    - 'availability': Zoek naar beschikbaarheidsdatum. Sla ALLEEN de datum/term op ZONDER "Beschikbaar" of "per" vooraan. Voorbeelden: "direct" (niet "per direct"), "1 maart" (niet "per 1 maart"), "16 maart". Als het CV zegt "per direct" sla dan op: "direct".
    - 'hours': Zoek naar uren/beschikbaarheid (bijv. "32-36 uur", "Fulltime").
    - 'skj': Zoek naar SKJ registratie nummer.
    
    Raw Text Bron:\n${input.text}`
    });

    const response = await this.generateWithRetry(ai, {
      model: "gemini-2.0-flash",
      contents: { parts },
      config: {
        systemInstruction: EXTRACT_SYSTEM_INSTRUCTION,
        responseMimeType: "application/json",
        responseSchema: CV_SCHEMA,
        temperature: 0.1
      }
    });

    const text = response.text;
    if (!text) throw new Error("Geen tekst ontvangen van AI bij extractie.");

    try {
      const cleaned = this.extractJson(text);
      return JSON.parse(cleaned) as ParsedCV;
    } catch (e) {
      console.error("JSON Parse Error in extraction:", e, "Raw text:", text);
      throw new Error("Ongeldig JSON formaat ontvangen van AI.");
    }
  }

  /**
   * Phase 2: Template-Specific Styling & Refinement
   */
  async parseCV(input: CVInput): Promise<ParsedCV> {
    const ai = new GoogleGenAI({ apiKey: this.getApiKey() });
    const parts: any[] = [];

    let promptText = `JE ENIGE TAAK IS TRANSFORMEREN. ELKE BULLET OPNIEUW SCHRIJVEN.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
WERKWIJZE — VERPLICHT VOOR ELKE BULLET AFZONDERLIJK
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Behandel elke bullet als ruwe grondstof die volledig omgesmolten wordt.
Doorloop voor ELKE bullet dit proces:

  Stap 1 → WAT is de kern van deze taak? (extraheer de essentie)
  Stap 2 → VOOR WIE of WAARVOOR? (voeg object toe)
  Stap 3 → IN WELKE CONTEXT? (voeg toe: binnen / conform / gericht op / in afstemming met)
  Stap 4 → BEGIN met een INFINITIEF WERKWOORD
  Stap 5 → CONTROLEER: verschilt de output substantieel van de input? Zo niet → herschrijf opnieuw

De output bullet MOET aantoonbaar anders zijn dan de input.
Zelfde betekenis is toegestaan. Zelfde woorden zijn NIET toegestaan.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TRANSFORMATIEVOORBEELDEN — PRECIES ZO WERKT HET
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Input:  "Verlenen van crisisopvang, wonen, weekendopvang en dagbesteding;"
❌ FOUT:  "Verlenen van zorg, wonen, weekendopvang en dagbesteding;" (te gelijkend)
✅ GOED:  "Uitvoeren van zorgverlening binnen crisisopvang, woonvoorzieningen en dagbesteding conform het zorgplan;"

Input:  "Zowel face-to-face als telefonisch en per mail contact hebben met klanten;"
❌ FOUT:  "Contact hebben met klanten via telefoon, e-mail en persoonlijk gesprek;" (no infinitief opener)
✅ GOED:  "Onderhouden van klantcontact via persoonlijke gesprekken, telefoon en e-mail;"

Input:  "Omgaan met trauma, diverse beperkingen en stoornissen;"
❌ FOUT:  "Begeleiden van cliënten met trauma, diverse beperkingen en stoornissen;" (geen context)
✅ GOED:  "Begeleiden van cliënten met trauma, gedragsproblematiek en psychiatrische stoornissen binnen een gespecialiseerde zorgsetting;"

Input:  "Deelnemen aan zelfsturende teams;"
❌ FOUT:  "Deelnemen aan zelfsturende teams;" (letterlijk overgenomen — nooit acceptabel)
✅ GOED:  "Werken binnen zelfsturende teams en bijdragen aan gezamenlijke taakverdeling en teamontwikkeling;"

Input:  "Onderdeel zijn van diverse kwaliteitsgroepen;"
❌ FOUT:  "Deelnemen aan diverse kwaliteitsgroepen;" (bijna identiek)
✅ GOED:  "Deelnemen aan kwaliteitsgroepen en bijdragen aan de ontwikkeling en borging van kwaliteitsstandaarden;"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
HARDE REGELS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. Elke bullet begint met een INFINITIEF WERKWOORD — geen uitzonderingen
2. VERBODEN OPENERS: "Zowel", "Naast", "Tevens", "Daarnaast", "Ook", "Hierbij", "Waarbij"
3. Elke bullet = volledig: infinitief + object + context
4. Volgorde: Kern → Dagelijkse taken → Coördinatie → Administratie
5. Eindigt op ; — alleen LAATSTE bullet op .
6. Geen ik-vorm, geen marketingtaal, geen resultaatclaims
7. Grammatica- en spelfouten ALTIJD corrigeren

🔴 MINIMUM 4 BULLETS PER FUNCTIE:
Heeft de bron minder dan 4? Leid aanvullende bullets logisch af uit de functienaam en context.

OVERIGE VELDEN aanpassen conform stijlregels: naam, tags, titels, beschikbaarheid, opleidingen.`;

    if (input.text) {
      promptText += `\n\n--- HUIDIGE DATA ---\n${input.text}`;
    }

    parts.push({ text: promptText });

    console.log("Starting parseCV with template:", input.template);
    const instruction = input.template === 'old' ? OLD_STYLE_SYSTEM_INSTRUCTION : NEW_STYLE_SYSTEM_INSTRUCTION;
    console.log("Using instruction length:", instruction.length);

    try {
      console.log("Calling ai.models.generateContent...");
      const response = await this.generateWithRetry(ai, {
        model: "gemini-2.0-flash",
        contents: { parts },
        config: {
          systemInstruction: instruction,
          responseMimeType: "application/json",
          responseSchema: CV_SCHEMA,
          temperature: 0.65
        },
      });
      console.log("ai.models.generateContent returned.");


      const text = response.text;
      if (!text) throw new Error("Geen tekst ontvangen van AI bij styling.");

      try {
        const cleanedJson = this.extractJson(text);
        const parsed = JSON.parse(cleanedJson) as ParsedCV;

        // New Style Specific: Ensure 5 tags
        if (input.template === 'new') {
          if (!parsed.analysis) {
            parsed.analysis = {
              scores: { overall: 80, relevance: 80, skillMatch: 80, completeness: 80, consistency: 80, professional: 80 },
              profile: { sector: "Sociaal Domein", role: parsed.personalInfo.name, seniority: "Medior" },
              tags: ["Professional", "Gedreven", "Expert", "Novêmber", "Kandidaat"],
              strengths: [],
              weaknesses: [],
              summary: ""
            };
          } else if (!parsed.analysis.tags || parsed.analysis.tags.length < 5) {
            const currentTags = parsed.analysis.tags || [];
            const fillers = ["Professional", "Gedreven", "Expert", "Novêmber", "Kandidaat"];
            parsed.analysis.tags = [...currentTags, ...fillers].slice(0, 5);
          }
        }

        return parsed;
      } catch (error: any) {
        console.error("JSON Parse Error in styling:", error, "Raw text:", text);
        throw new Error("Styling mislukt: Ongeldige data van AI.");
      }
    } catch (error: any) {
      console.error("Gemini API Error in parseCV:", error);
      throw error;
    }
  }
}

export const geminiService = new GeminiService();