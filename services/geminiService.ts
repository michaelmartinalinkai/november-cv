import { GoogleGenAI } from "@google/genai";
import {
  EXTRACT_SYSTEM_INSTRUCTION,
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
  fileName?: string;
  // Punt 9 — vrije guidance van de recruiter waar de keywords zich op moeten focussen
  // (alternatief voor een geüploade vacature). Voorbeeld: "ervaring jeugdzorg + crisisinterventies".
  profileFocus?: string;
  // Punt 13 — als true: minimale rewrites, alleen schoonmaken/extenden
  finalGradeMode?: boolean;
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
      model: "gemini-2.5-flash",
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

    // Punt 12 — bewaar het originele aantal bullets per functie zodat we na de call
    // kunnen controleren of de AI niets heeft weggegooid.
    let originalBulletCounts: number[] = [];
    let originalExperience: Array<{ employer: string; role: string; bullets: string[] }> = [];
    try {
      const parsedSrc = JSON.parse(input.text || '{}');
      if (Array.isArray(parsedSrc.experience)) {
        originalExperience = parsedSrc.experience.map((e: any) => ({
          employer: e?.employer || '',
          role: e?.role || '',
          bullets: Array.isArray(e?.bullets) ? e.bullets.filter((b: any) => typeof b === 'string' && b.trim()) : [],
        }));
        originalBulletCounts = originalExperience.map(e => e.bullets.length);
      }
    } catch { /* niet parseable → skip check */ }

    // Punt 9 — profile-focus context (door recruiter ingevoerd of uit vacature)
    let focusBlock = '';
    if (input.vacancyText && input.vacancyText.trim()) {
      focusBlock = `\n\n--- VACATURE-CONTEXT (Punt 7 — Maria Achterberg) ---\nDe kandidaat solliciteert op DEZE vacature. Pas de CV-content aan om de match te tonen:\n\n1. TAGS: De 5 tags ("WAAR DEZE PROFESSIONAL STERK IN IS") MOETEN aansluiten op de kerneisen van de vacature. Kies woorden die DIRECT in de vacature voorkomen of er duidelijk mee verbonden zijn.\n\n2. BULLETS — TERMINOLOGIE-ALIGNMENT (medium tailoring):\n   - Identificeer keywords/sectorterminologie uit de vacature (bv. "casuïstiekregie", "ketenpartners", "Wmo", "jeugdwet").\n   - Voor bullets die deze concepten OOK in de candidate's ervaring beschrijven, herschrijf de bullet zodat het woord uit de VACATURE gebruikt wordt (waar feitelijk juist).\n   - VERZIN NIETS. Voeg geen verantwoordelijkheden toe die er niet stonden. Verander GEEN feiten.\n   - Bullets die niets met de vacature te maken hebben: behoud zoals normaal volgens stijlregels.\n\n3. VOORBEELD:\n   Vacature noemt: "casuïstiekregie binnen jeugdbescherming"\n   Bestaande bullet: "Coördineren van complexe dossiers en bewaken van voortgang"\n   ❌ Onveranderd laten (mist match-signaal)\n   ❌ "Uitvoeren van casuïstiekregie en alle stappen binnen het traject" (verzonnen "alle stappen")\n   ✅ "Voeren van casuïstiekregie binnen complexe dossiers en bewaken van de voortgang" (oorspronkelijke betekenis + vacature-terminologie)\n\n4. MATCH-SCORE — vul analysis.vacancyMatches met EERLIJKE scores (geen inflatie):\n   - { "title": "Algehele match", "score": 0-100 } — hoe goed past kandidaat bij deze vacature in totaal?\n   - { "title": "Werkervaring relevantie", "score": 0-100 } — hoe relevant is de werkhistorie?\n   - { "title": "Sectorkennis", "score": 0-100 } — hoe goed kent kandidaat de sector/het domein?\n   Wees eerlijk: lage match = lage score. Niet inflateren.\n\nVACATURETEKST:\n${input.vacancyText.trim()}`;
    } else if (input.profileFocus && input.profileFocus.trim()) {
      focusBlock = `\n\n--- PROFIEL-FOCUS (Punt 9 — door recruiter opgegeven) ---\nDe 5 tags MOETEN deze focus weerspiegelen: "${input.profileFocus.trim()}".`;
    } else {
      focusBlock = `\n\n--- DEFAULT KEYWORD-FOCUS (Punt 9) ---\nGeen vacature of profiel-focus aanwezig. Genereer de 5 tags op basis van:\n  (1) Kernkwaliteiten uit de werkervaring (terugkerende sterke punten over meerdere functies),\n  (2) Expertisegebieden (sector + specialisatie zoals "jeugdzorg", "schulddienstverlening"),\n  (3) Recurring strengths uit bullets (woorden / thema's die meermaals voorkomen).\nVermijd generieke vulwoorden ("Professional", "Gedreven") tenzij de input écht niets concreets bevat.`;
    }

    // Punt 13 — final-grade mode: minimale aanpassingen
    let finalGradePreamble = '';
    if (input.finalGradeMode) {
      finalGradePreamble = `🔵 FINAL-GRADE MODUS ACTIEF (Punt 13 — Maria Achterberg feedback):
Dit CV is al eerder geformatteerd in Novémber-stijl. Houd de inhoud, wording en bullets ZOVEEL MOGELIJK ongewijzigd. Doe ALLEEN:
  - Spel- en grammaticafouten corrigeren;
  - Ontbrekende velden aanvullen (school, plaats) als ze in de bron staan;
  - Nieuwe werkervaring toevoegen als die in de bron staat en in de huidige output ontbreekt;
  - Bullet-volgorde behouden, niet herschikken;
  - GEEN volledige herformulering, GEEN bullets weghalen, GEEN bullets samenvoegen.

`;
    }

    let promptText: string;
    if (input.finalGradeMode) {
      // FINAL-GRADE MODE: minimal-touch prompt. NO "rewrite every bullet" instruction.
      promptText = finalGradePreamble + `JE TAAK: Lichte cleanup van een al-eerder geconverteerd CV.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
WAT JE WEL DOET:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- Bullets, functies, opleidingen en cursussen exact overnemen zoals ze zijn.
- Alleen evidente spelfouten en typo's corrigeren.
- Ontbrekende velden invullen als die in de bron staan (school, plaats, periode).
- Datums normaliseren (MM/JJJJ format).
- Nieuwe werkervaring of cursussen toevoegen als die in de bron staan en in de output ontbreken.
- Systems en talen overnemen.
- De 5 tags ("WAAR DEZE PROFESSIONAL STERK IN IS") opnieuw genereren op basis van de inhoud.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
WAT JE NOOIT DOET:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- GEEN bullets herformuleren of herschrijven.
- GEEN bullets samenvoegen of opsplitsen.
- GEEN bullets verwijderen.
- GEEN volgorde van bullets veranderen.
- GEEN nieuwe taken verzinnen of toevoegen.
- GEEN extra context-woorden toevoegen aan bullets die al goed zijn.

`;
    } else {
      // STANDARD MODE: full rewrite to November style.
      promptText = `JE ENIGE TAAK IS TRANSFORMEREN. ELKE BULLET OPNIEUW SCHRIJVEN.

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

🔴 KORTE INPUT = ALTIJD UITBREIDEN — HARDE REGEL:
Een bullet van 5 woorden of minder is PER DEFINITIE onvolledig. ALTIJD uitbouwen tot een volledige zin.
❌ "Administratie;" → ✅ "Verzorgen van administratieve werkzaamheden en verwerken van gegevens conform de geldende procedures;"
❌ "Klantcontact;" → ✅ "Onderhouden van klantcontact via persoonlijke gesprekken, telefoon en e-mail;"
❌ "Rapportages schrijven;" → ✅ "Opstellen en verwerken van rapportages en verslaglegging conform de geldende richtlijnen;"
❌ "Coördineren;" → ✅ "Coördineren van de dagelijkse werkzaamheden en bewaken van de voortgang binnen het team;"
❌ "Begeleiden van cliënten;" → ✅ "Begeleiden van cliënten bij het bereiken van persoonlijke doelen conform het ondersteuningsplan;"

OVERIGE VELDEN aanpassen conform stijlregels: naam, tags, titels, beschikbaarheid, opleidingen.

🚨 SCHOOL VELD VERPLICHT BEWAREN:
Het "school" veld in education MOET altijd worden overgenomen uit de input.
Als input school: "Hogeschool InHolland" heeft, moet output dat ook hebben. Nooit weglaten.
Als er geen school in de input staat, gebruik dan een lege string "".`;
    }

    if (input.text) {
      promptText += `\n\n--- HUIDIGE DATA ---\n${input.text}`;
    }

    promptText += focusBlock;

    // Punt 12 — herhaal de hard floor expliciet bij de input zelf
    if (originalBulletCounts.length > 0) {
      promptText += `\n\n--- BULLET-COUNT FLOOR (Punt 12) ---\nVoor elke functie hieronder geldt: aantal bullets in de output >= aantal bullets in de input.`;
      originalBulletCounts.forEach((cnt, i) => {
        const empl = originalExperience[i]?.employer || `functie ${i + 1}`;
        promptText += `\n  • ${empl}: minimaal ${cnt} bullets (input had er ${cnt}).`;
      });
    }

    parts.push({ text: promptText });

    const instruction = NEW_STYLE_SYSTEM_INSTRUCTION;

    try {
      console.log("Calling ai.models.generateContent...");
      const response = await this.generateWithRetry(ai, {
        model: "gemini-2.5-flash",
        contents: { parts },
        config: {
          systemInstruction: instruction,
          responseMimeType: "application/json",
          responseSchema: CV_SCHEMA,
          temperature: 0.45
        },
      });
      console.log("ai.models.generateContent returned.");


      const text = response.text;
      if (!text) throw new Error("Geen tekst ontvangen van AI bij styling.");

      try {
        const cleanedJson = this.extractJson(text);
        const parsed = JSON.parse(cleanedJson) as ParsedCV;

        // Ensure 5 tags always present
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

        // Punt 12 — BULLET PRESERVATION POST-PROCESS
        // Per functie: als de AI minder bullets heeft teruggeven dan de bron, restore de ontbrekende
        // bullets vanuit het origineel zodat we GARANDEREN dat er niets verdwijnt. We matchen op
        // employer met fuzzy normalisatie zodat kleine wijzigingen (kapitalisatie, leestekens) geen
        // mismatch geven.
        if (parsed.experience && originalExperience.length > 0) {
          // Helper: aggressieve normalisatie voor matching (strip leestekens, lowercase, normalize spaces)
          const normalize = (s: string) => s.toLowerCase().trim()
            .replace(/[.,;:!?'"`()\[\]{}]/g, '')
            .replace(/\s+/g, ' ');

          // Use Promise.all so styleBullets calls can run in parallel
          await Promise.all(parsed.experience.map(async (parsedExp: any, i: number) => {
            const parsedEmpl = normalize(parsedExp?.employer || '');
            // Try exact normalized match first, then startsWith/contains, then index fallback
            let orig = originalExperience.find(o => normalize(o.employer) === parsedEmpl);
            if (!orig) {
              orig = originalExperience.find(o => {
                const n = normalize(o.employer);
                return parsedEmpl.length > 0 && (n.startsWith(parsedEmpl) || parsedEmpl.startsWith(n) || n.includes(parsedEmpl) || parsedEmpl.includes(n));
              });
            }
            if (!orig) orig = originalExperience[i];
            if (!orig) return;

            const outBullets: string[] = Array.isArray(parsedExp.bullets)
              ? parsedExp.bullets.filter((b: any) => typeof b === 'string' && b.trim())
              : [];

            if (outBullets.length < orig.bullets.length) {
              const missing = orig.bullets.length - outBullets.length;
              console.warn(
                `[Punt 12] Bullet-reductie gedetecteerd bij "${orig.employer}": input had ${orig.bullets.length} bullets, output ${outBullets.length}. Restore ${missing} ontbrekende bullet(s) uit origineel + re-style.`
              );
              const seen = new Set(outBullets.map(b => b.toLowerCase().trim().replace(/[.;]+$/, '')));
              const rawMissing = orig.bullets
                .filter(b => !seen.has(b.toLowerCase().trim().replace(/[.;]+$/, '')))
                .slice(0, missing);

              // Re-style the restored bullets so they match Novémber-style instead of being raw
              const styledMissing = await this.styleBullets(rawMissing, {
                role: parsedExp.role || orig.role || '',
                employer: parsedExp.employer || orig.employer || '',
              });

              parsedExp.bullets = [...outBullets, ...styledMissing];
            }
          }));
        }

        // Punt 10 — Microsoft 365 altijd vooraan in systems
        if (!parsed.systems) parsed.systems = [];
        const hasMs365 = parsed.systems.some((s: string) =>
          /microsoft\s*(365|office|m365)|office\s*365|ms\s*365/i.test(s || '')
        );
        if (!hasMs365) {
          parsed.systems = ['Microsoft 365', ...parsed.systems];
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

  /**
   * Style raw bullets to match Novémber-style without changing content.
   * Used in post-process restore — keeps the meaning identical, only fixes phrasing.
   */
  async styleBullets(rawBullets: string[], context: { role: string; employer: string }): Promise<string[]> {
    if (rawBullets.length === 0) return [];
    const ai = new GoogleGenAI({ apiKey: this.getApiKey() });
    const bulletList = rawBullets.map((b, i) => (i + 1) + '. ' + b).join('\n');
    const prompt = 'TAAK: HERSCHRIJF DEZE BULLETS NAAR NOVÉMBER-STIJL.\n\n'
      + 'BELANGRIJK: BEHOUD DE INHOUDELIJKE BETEKENIS EXACT. Verander geen feiten, voeg geen taken toe, verwijder niks.\n\n'
      + 'CONTEXT — Functie: ' + context.role + ' bij ' + context.employer + '\n\n'
      + 'INPUT BULLETS:\n' + bulletList + '\n\n'
      + 'REGELS:\n'
      + '- Aantal bullets in output MOET exact ' + rawBullets.length + ' zijn.\n'
      + '- Elke bullet begint met INFINITIEF werkwoord.\n'
      + '- Voeg context-woorden toe: binnen / conform / gericht op / in afstemming met.\n'
      + '- Corrigeer spel- en grammaticafouten.\n'
      + '- Behoud alle feiten en informatie uit de bron.\n'
      + '- Elke bullet eindigt op ; (de laatste op .).\n'
      + '- Output ALLEEN de bullets als genummerde lijst (1. 2. 3. ...) — geen uitleg.';

    try {
      const response = await this.generateWithRetry(ai, {
        model: 'gemini-2.5-flash',
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        config: { temperature: 0.3 }
      });
      const text = response.text || '';
      const styled = text
        .split('\n')
        .map((l: string) => l.replace(/^\d+\.\s*/, '').trim())
        .filter((l: string) => l.length > 2);
      // If AI returned fewer than expected, return original raws rather than losing content
      return styled.length >= rawBullets.length ? styled : rawBullets;
    } catch (e) {
      console.warn('[styleBullets] Failed to restyle, returning raw bullets:', e);
      return rawBullets;
    }
  }

  async regenerateJob(job: { period: string; employer: string; role: string; bullets: string[] }): Promise<{ bullets: string[] }> {
    const ai = new GoogleGenAI({ apiKey: this.getApiKey() });
    const bulletList = job.bullets.map((b, i) => (i + 1) + '. ' + b).join('\n');
    const prompt = 'TAAK: HERSCHRIJF ELKE BULLET BEHOUDEND.\n\n'
      + 'BELANGRIJKSTE REGEL: BEHOUD DE INHOUDELIJKE BETEKENIS EN FEITEN VAN ELKE BULLET. Verzin geen nieuwe verantwoordelijkheden. Voeg geen taken toe die niet in de bron staan. Maak teksten NIET ingewikkelder dan ze al zijn.\n\n'
      + 'Je herschrijft alleen de FORMULERING — niet de inhoud — zodat alle bullets de Novémber-stijl volgen.\n\n'
      + 'FUNCTIE: ' + job.role + '\n'
      + 'WERKGEVER: ' + job.employer + '\n'
      + 'PERIODE: ' + job.period + '\n\n'
      + 'ORIGINELE BULLETS:\n' + bulletList + '\n\n'
      + 'REGELS:\n'
      + '- BEHOUD DE FEITEN. Wat de bron zegt = wat de output zegt.\n'
      + '- HOUD HET SIMPEL. Geen onnodig complexe zinsbouw of jargon. Korte, professionele zinnen.\n'
      + '- AANTAL bullets MOET exact ' + job.bullets.length + ' zijn. Niet minder, niet meer.\n'
      + '- Begin elke bullet met een INFINITIEF werkwoord (Begeleiden van..., Uitvoeren van..., etc.).\n'
      + '- Voeg context-woorden toe waar passend: binnen / conform / gericht op / in afstemming met.\n'
      + '- Corrigeer spel- en grammaticafouten zonder de boodschap te veranderen.\n'
      + '- Elke bullet eindigt op puntkomma (;) — de LAATSTE op punt (.).\n'
      + '- NOOIT bullets samenvoegen. NOOIT informatie weglaten. NOOIT informatie toevoegen die niet in de bron staat.\n'
      + '- Output ALLEEN de herschreven bullets als genummerde lijst (1. 2. 3. ...) — geen inleiding, geen uitleg.';

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: { temperature: 0.3 } // lower = more consistent, less drift across re-clicks
    });

    const text = response.text || '';
    let bullets = text
      .split('\n')
      .map((l: string) => l.replace(/^\d+\.\s*/, '').trim())
      .filter((l: string) => l.length > 2);

    // Post-process safety: if AI returned fewer bullets than original, restore the missing ones from source
    if (bullets.length < job.bullets.length) {
      const missing = job.bullets.length - bullets.length;
      console.warn(`[Regenerate] Bullet drop: ${job.bullets.length} input vs ${bullets.length} output. Restoring ${missing}.`);
      const seen = new Set(bullets.map(b => b.toLowerCase().trim().replace(/[.;]+$/, '')));
      const toAppend = job.bullets
        .filter(b => !seen.has(b.toLowerCase().trim().replace(/[.;]+$/, '')))
        .slice(0, missing);
      bullets = [...bullets, ...toAppend];
    }

    return { bullets };
  }
}

export const geminiService = new GeminiService();