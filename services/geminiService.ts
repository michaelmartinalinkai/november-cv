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

    parts.push({
      text: `INSTRUCTIE: Haal alle relevante data uit dit CV. Output moet EXACT voldoen aan het JSON schema.
    
    SPECIFIEKE REACTIES:
    - 'availability': Zoek naar startdatum (bijv. "Per direct", "1 maart").
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

    // Parse the original data to preserve bullets
    let originalData: ParsedCV | null = null;
    try {
      if (input.text) {
        originalData = JSON.parse(input.text) as ParsedCV;
      }
    } catch (e) {
      console.warn("Could not parse original data for bullet preservation");
    }

    let promptText = `TAAK: Refineer de onderstaande CV-data voor de ${input.template === 'old' ? 'OUDE' : 'NIEUWE'} NOVÉMBER STIJL. 

🚨🚨🚨 KRITIEKE INSTRUCTIE 🚨🚨🚨:
- De "bullets" arrays in "experience" moeten EXACT ONGEWIJZIGD blijven
- KOPIEER alle bullets 1-op-1 uit de input naar de output
- VERANDER NIETS aan de bullets: geen verkorten, geen samenvatten, geen herschrijven
- Als een functie 9 bullets heeft in de input, moet de output ook EXACT 9 bullets hebben
- Werkwoordvormen NIET wijzigen (infinitief "Begeleiden" blijft "Begeleiden")
- Je mag WEL de andere velden aanpassen (naam formaat, tags, titels, etc.)`;

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
          temperature: 0.1
        },
      });
      console.log("ai.models.generateContent returned.");


      const text = response.text;
      if (!text) throw new Error("Geen tekst ontvangen van AI bij styling.");

      try {
        const cleanedJson = this.extractJson(text);
        const parsed = JSON.parse(cleanedJson) as ParsedCV;

        // 🚨 CRITICAL: Restore original bullets from Phase 1 extraction
        // The AI tends to reduce/rewrite bullets during styling, so we force-restore them
        if (originalData?.experience && parsed.experience) {
          parsed.experience.forEach((exp, index) => {
            if (originalData!.experience[index]?.bullets) {
              const originalBullets = originalData!.experience[index].bullets;
              // Always use original bullets if AI reduced them
              if (originalBullets.length > exp.bullets.length) {
                console.warn(`Bullet reduction detected for experience[${index}]: ${originalBullets.length} -> ${exp.bullets.length}. Restoring originals.`);
                exp.bullets = [...originalBullets];
              }
            }
          });
        }

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