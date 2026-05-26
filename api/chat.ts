// Vercel Edge Function — proxies chat requests to Anthropic API.
// Keeps ANTHROPIC_API_KEY server-side, never exposed to browser.
//
// ENV VAR REQUIRED on Vercel: ANTHROPIC_API_KEY
// Set via: Vercel Dashboard → Project Settings → Environment Variables

export const config = {
  runtime: 'edge',
};

interface ChatRequest {
  messages: Array<{ role: 'user' | 'assistant'; content: string | unknown[] }>;
  system?: string;
  tools?: unknown[];
  model?: string;
  max_tokens?: number;
  cv_context?: unknown; // The current CV state — gets injected into system prompt
}

const DEFAULT_MODEL = 'claude-sonnet-4-5'; // Sonnet 4.6 family — best for instruction-following

export default async function handler(req: Request): Promise<Response> {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'ANTHROPIC_API_KEY not configured on server' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let body: ChatRequest;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { messages, system, tools, model = DEFAULT_MODEL, max_tokens = 4096, cv_context } = body;

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return new Response(JSON.stringify({ error: 'messages array required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Build the system prompt: combine user-supplied system with CV context
  // The CV context is wrapped in a cacheable block (Anthropic prompt caching)
  // so repeated turns in the same session pay 10% of input cost for the CV.
  const systemBlocks: Array<{ type: 'text'; text: string; cache_control?: { type: 'ephemeral' } }> = [];

  const baseSystem = system || buildDefaultSystemPrompt();
  systemBlocks.push({ type: 'text', text: baseSystem });

  if (cv_context) {
    systemBlocks.push({
      type: 'text',
      text: `--- HUIDIGE CV-DATA ---\n${JSON.stringify(cv_context, null, 2)}`,
      cache_control: { type: 'ephemeral' }, // cache this block — saves 90% on repeat turns
    });
  }

  try {
    const anthropicResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens,
        system: systemBlocks,
        messages,
        ...(tools && tools.length > 0 ? { tools } : {}),
      }),
    });

    const data = await anthropicResponse.json();

    if (!anthropicResponse.ok) {
      console.error('[chat-edge] Anthropic API error:', data);
      return new Response(JSON.stringify({ error: data.error?.message || 'Anthropic API error', detail: data }), {
        status: anthropicResponse.status,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (err: any) {
    console.error('[chat-edge] Fetch error:', err);
    return new Response(JSON.stringify({ error: 'Internal error', detail: err?.message || String(err) }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }
}

function buildDefaultSystemPrompt(): string {
  return `Je bent een AI-CV-assistent voor Novêmber, een Nederlands wervings- en selectiebureau. Je helpt recruiters om CV's iteratief te bewerken.

KERNREGELS:
1. Behoud altijd de feitelijke inhoud van het CV. Verzin NIETS — geen taken, geen ervaringen, geen vaardigheden die niet in het origineel staan.
2. Werk altijd in het Nederlands tenzij de gebruiker iets anders vraagt.
3. Wees direct en zakelijk. Geen lange uitleg, geef snelle resultaten.
4. Wanneer je een wijziging in het CV wilt maken, gebruik je de beschikbare tools — verander niet zomaar tekst in je antwoord.
5. Als de gebruiker iets onduidelijks vraagt, vraag dan om verduidelijking voordat je iets verandert.
6. Het CV wordt geleverd in het "HUIDIGE CV-DATA" blok hieronder. Refereer altijd aan deze actuele data.

STIJL:
- Novêmber-stijl voor bullets: actieve werkwoorden, professioneel, geen jargon, kort en krachtig.
- Tags moeten sector-specifiek zijn (bv. "JEUGDZORG", "CASUÏSTIEKREGIE", "STAKEHOLDERMANAGEMENT") — geen vage termen als "Professional" of "Gedreven".

INSTRUCTIES VAN MARIA (klant):
- Behoud de originele content bij rewrites
- Voeg alleen toe waar nodig
- Maak het taalniveau professioneler zonder content te veranderen
- Voeg niets toe dat niet in het origineel staat`;
}
