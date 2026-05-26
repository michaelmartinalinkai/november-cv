import React, { useState, useRef, useEffect } from 'react';
import { ParsedCV } from '../types';
import { chatService, ChatMessage, ContentBlock, ToolDefinition } from '../services/chatService';

interface AIAssistantPanelProps {
  cv: ParsedCV;
  cvId: string; // Used to detect CV switches and reset chat
  onCvChange: (newCv: ParsedCV) => void;
  isOpen: boolean;
  onClose: () => void;
  isEditing?: boolean; // Show warning if true — manual edits may not be saved yet
  // Tools registered by the parent that the AI can use to modify the CV
  tools?: ToolDefinition[];
  // Tool executor — called when AI invokes a tool. Returns a string result (or throws on error).
  executeTool?: (name: string, input: Record<string, any>, cv: ParsedCV) => Promise<{ result: string; updatedCv?: ParsedCV }>;
}

interface DisplayMessage {
  id: string;
  role: 'user' | 'assistant' | 'system-info';
  text: string;
  toolUses?: Array<{ name: string; input: Record<string, any>; result?: string; error?: boolean }>;
  timestamp: number;
}

// ─── SUGGESTION CHIPS ────────────────────────────────────────────────────────
// Returns 2-3 contextual follow-up prompts based on the last AI action.
// Keeps the user moving without having to think of what to ask next.
function getSuggestionsFor(lastMsg: DisplayMessage | undefined, cv: ParsedCV): string[] {
  if (!lastMsg || lastMsg.role !== 'assistant' || !lastMsg.toolUses || lastMsg.toolUses.length === 0) {
    return [];
  }
  const lastTool = lastMsg.toolUses[lastMsg.toolUses.length - 1].name;

  switch (lastTool) {
    case 'rephrase_bullet':
      return [
        'Doe hetzelfde voor de andere bullets',
        'Maak deze nog korter',
        'Ongedaan maken graag, terug naar origineel',
      ];
    case 'bullets_from_text':
      return [
        'Vul aan tot 5 bullets minimaal',
        'Maak de laatste bullet professioneler',
        'Genereer nieuwe sterke-punten-tags',
      ];
    case 'complete_bullets':
      return [
        'Optimaliseer dit CV voor een specifieke vacature',
        'Pas de tags aan op de nieuwe inhoud',
        'Herschrijf de bullets korter',
      ];
    case 'regenerate_keywords':
    case 'suggest_keywords':
      return [
        'Maak ze nog sector-specifieker',
        'Focus meer op leiderschap',
        'Schrijf een motivatiebrief op basis hiervan',
      ];
    case 'optimize_for_vacancy':
      return [
        'Schrijf nu ook een motivatiebrief voor deze vacature',
        'Welke werkervaring zou je bovenaan zetten?',
        'Pas alleen de tags nog wat aan',
      ];
    case 'generate_cover_letter':
      return [
        'Maak de brief iets korter',
        'Verander de toon naar enthousiast',
        'Optimaliseer ook het CV voor deze vacature',
      ];
    case 'adjust_role':
    case 'rewrite_job_bullets':
      return [
        'Doe hetzelfde voor de vorige functie',
        'Vul deze functie aan tot 5 bullets',
        'Genereer nieuwe tags op basis van de wijzigingen',
      ];
    case 'add_new_role':
      return [
        'Vul de net toegevoegde functie aan met meer bullets',
        'Pin deze nieuwe functie bovenaan',
        'Pas de tags aan op de nieuwe ervaring',
      ];
    case 'advise_relevance':
      return [
        'Pin de top-functie bovenaan',
        'Optimaliseer dit CV voor die vacature',
        'Schrijf een motivatiebrief gericht op die rol',
      ];
    case 'set_pinned':
      return [
        'Optimaliseer het CV voor een specifieke vacature',
        'Schrijf een motivatiebrief',
        'Pas de tags aan',
      ];
    default:
      return [
        'Optimaliseer dit CV voor een vacature',
        'Schrijf een motivatiebrief',
        'Genereer nieuwe sterke-punten-tags',
      ];
  }
}

export const AIAssistantPanel: React.FC<AIAssistantPanelProps> = ({
  cv,
  cvId,
  onCvChange,
  isOpen,
  onClose,
  isEditing,
  tools,
  executeTool,
}) => {
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  // Mirror of the conversation in Anthropic API format
  const apiMessagesRef = useRef<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tokenUsage, setTokenUsage] = useState<{ input: number; output: number; cached: number }>({ input: 0, output: 0, cached: 0 });
  // Safety: hard cap per session to prevent runaway costs. ~€0.50 of usage.
  const MAX_SESSION_COST_USD = 0.50;
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isThinking]);

  // Auto-focus input when panel opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  const addDisplayMessage = (msg: Omit<DisplayMessage, 'id' | 'timestamp'>) => {
    setMessages(prev => [...prev, { ...msg, id: `msg-${Date.now()}-${Math.random()}`, timestamp: Date.now() }]);
  };

  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed || isThinking) return;

    if (isOverLimit) {
      setError(`Sessie-limiet bereikt (~$${estimatedCost} gebruikt). Wis het gesprek of start een nieuw.`);
      return;
    }

    setError(null);
    setInput('');

    // Add user message to display + API mirror
    addDisplayMessage({ role: 'user', text: trimmed });
    apiMessagesRef.current.push({ role: 'user', content: trimmed });

    setIsThinking(true);
    try {
      await runAgentLoop();
    } catch (e: any) {
      console.error('[AIAssistant] Error:', e);
      setError(e?.message || 'Onbekende fout');
    } finally {
      setIsThinking(false);
    }
  };

  const handleRetry = async () => {
    setError(null);
    setIsThinking(true);
    try {
      await runAgentLoop();
    } catch (e: any) {
      console.error('[AIAssistant] Retry error:', e);
      setError(e?.message || 'Onbekende fout');
    } finally {
      setIsThinking(false);
    }
  };

  /**
   * Agent loop: send messages → if response has tool_use, execute tools, send results back, repeat.
   * Stops when the model returns stop_reason: 'end_turn' (i.e. it's done).
   * Safety: max 10 iterations to prevent infinite loops.
   *
   * Streams text responses live for snappier UX.
   */
  const runAgentLoop = async () => {
    const MAX_ITERATIONS = 10;
    let workingCv: ParsedCV = cv;

    for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
      // Push an empty assistant message that we'll fill with streaming deltas
      const streamingMsgId = `msg-${Date.now()}-${Math.random()}`;
      let streamingText = '';
      const streamingToolUses: Array<{ name: string; input: Record<string, any>; result?: string; error?: boolean }> = [];

      setMessages(prev => [...prev, {
        id: streamingMsgId,
        role: 'assistant',
        text: '',
        toolUses: [],
        timestamp: Date.now(),
      }]);

      // Wait for streaming completion via a Promise
      const response = await new Promise<typeof chatService extends { sendMessage: (...args: any[]) => Promise<infer R> } ? R : any>((resolve, reject) => {
        chatService.streamMessage({
          messages: apiMessagesRef.current,
          cv_context: workingCv,
          tools: tools && tools.length > 0 ? tools : undefined,
        }, {
          onTextDelta: (delta) => {
            streamingText += delta;
            setMessages(prev => prev.map(m =>
              m.id === streamingMsgId ? { ...m, text: streamingText } : m
            ));
          },
          onToolUseStart: (toolUse) => {
            streamingToolUses.push({ name: toolUse.name, input: {} });
            setMessages(prev => prev.map(m =>
              m.id === streamingMsgId ? { ...m, toolUses: [...streamingToolUses] } : m
            ));
          },
          onComplete: (res) => resolve(res),
          onError: (e) => reject(e),
        });
      });

      // Track token usage
      if (response.usage) {
        setTokenUsage(prev => ({
          input: prev.input + (response.usage?.input_tokens || 0),
          output: prev.output + (response.usage?.output_tokens || 0),
          cached: prev.cached + (response.usage?.cache_read_input_tokens || 0),
        }));
      }

      // Add the assistant's full response to API history (text + tool_use blocks)
      apiMessagesRef.current.push({ role: 'assistant', content: response.content });

      const toolUses = chatService.extractToolUses(response);

      // If no tools were used, the model is done — and our streaming message has the text already
      if (toolUses.length === 0 || response.stop_reason !== 'tool_use') {
        // If the response had no text (only tool calls), show a placeholder
        if (!streamingText && toolUses.length === 0) {
          setMessages(prev => prev.map(m =>
            m.id === streamingMsgId ? { ...m, text: '_(geen antwoord)_' } : m
          ));
        }
        return;
      }

      // Execute each tool and gather results
      const toolResults: ContentBlock[] = [];
      for (let i = 0; i < toolUses.length; i++) {
        const tu = toolUses[i];
        if (!executeTool) {
          toolResults.push({
            type: 'tool_result',
            tool_use_id: tu.id,
            content: 'Geen tool-executor geregistreerd in de UI.',
            is_error: true,
          });
          continue;
        }
        try {
          const { result, updatedCv } = await executeTool(tu.name, tu.input, workingCv);
          if (updatedCv) {
            workingCv = updatedCv;
            onCvChange(updatedCv);
          }
          toolResults.push({
            type: 'tool_result',
            tool_use_id: tu.id,
            content: result,
          });
          // Update display: attach result to corresponding tool use
          setMessages(prev => prev.map(m => {
            if (m.id !== streamingMsgId || !m.toolUses) return m;
            const newToolUses = [...m.toolUses];
            if (newToolUses[i]) newToolUses[i] = { ...newToolUses[i], result };
            return { ...m, toolUses: newToolUses };
          }));
        } catch (e: any) {
          toolResults.push({
            type: 'tool_result',
            tool_use_id: tu.id,
            content: `Tool-fout: ${e?.message || String(e)}`,
            is_error: true,
          });
          setMessages(prev => prev.map(m => {
            if (m.id !== streamingMsgId || !m.toolUses) return m;
            const newToolUses = [...m.toolUses];
            if (newToolUses[i]) newToolUses[i] = { ...newToolUses[i], result: e?.message || 'Fout', error: true };
            return { ...m, toolUses: newToolUses };
          }));
        }
      }

      // Send tool results back as a user message (Anthropic API convention)
      apiMessagesRef.current.push({ role: 'user', content: toolResults });
    }

    addDisplayMessage({
      role: 'system-info',
      text: '⚠️ Maximale aantal stappen bereikt. Stel een nieuwe vraag om door te gaan.',
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter to send, Shift+Enter for newline
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleClear = () => {
    setMessages([]);
    apiMessagesRef.current = [];
    setError(null);
    setTokenUsage({ input: 0, output: 0, cached: 0 });
  };

  // Estimated cost (Sonnet 4.6: $3/M input, $15/M output, cached input 10% = $0.30/M)
  const estimatedCostNum =
    (tokenUsage.input - tokenUsage.cached) * 3 / 1_000_000
    + tokenUsage.cached * 0.3 / 1_000_000
    + tokenUsage.output * 15 / 1_000_000;
  const estimatedCost = estimatedCostNum.toFixed(4);
  const isOverLimit = estimatedCostNum >= MAX_SESSION_COST_USD;

  if (!isOpen) return null;

  return (
    <div
      className="fixed top-0 right-0 h-[100dvh] w-full sm:w-[420px] bg-white shadow-2xl z-50 flex flex-col border-l border-neutral-200"
      style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}
    >
      {/* Header */}
      <div className="bg-[#1E3A35] text-white px-5 py-4 flex justify-between items-center flex-shrink-0">
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-bold uppercase tracking-widest text-[#e3fd01]">AI Assistent</div>
          <div className="text-sm font-semibold mt-0.5 truncate">CV-bewerking via gesprek</div>
        </div>
        <button
          onClick={onClose}
          className="text-white/70 hover:text-white text-3xl leading-none w-11 h-11 flex items-center justify-center flex-shrink-0 -mr-2"
          title="Sluiten"
          aria-label="Sluiten"
        >×</button>
      </div>

      {/* Edit-mode warning */}
      {isEditing && (
        <div className="bg-amber-50 border-b border-amber-200 px-5 py-2 text-[10px] text-amber-800 leading-snug">
          ⚠️ <span className="font-semibold">Bewerk-modus actief.</span> Klik buiten een veld om je handmatige wijzigingen op te slaan voordat je de AI vraagt iets te doen.
        </div>
      )}

      {/* Welcome / empty state */}
      {messages.length === 0 && (
        <div className="px-5 py-6 text-[12px] text-neutral-600 leading-relaxed border-b border-neutral-100">
          <p className="font-semibold text-neutral-800 mb-1">Hoe kan ik je helpen?</p>
          {cv.personalInfo?.name && (
            <p className="text-[11px] text-neutral-500 mb-3">
              Werkend aan het CV van <span className="font-medium text-neutral-700">{cv.personalInfo.name}</span>
            </p>
          )}
          <p className="mb-3 text-[11px]">Voorbeelden van wat je kunt vragen:</p>
          <div className="space-y-1.5 text-[11px]">
            {[
              'Optimaliseer dit CV voor een rol als Jeugdbeleidsadviseur',
              'Maak deze bullets korter, behoud de inhoud',
              'Schrijf een motivatiebrief voor de gemeente Rotterdam',
              'Voeg bullets toe aan de laatste functie',
              'Welke werkervaring zou je bovenaan zetten voor deze vacature?',
            ].map((ex, i) => (
              <button
                key={i}
                onClick={() => setInput(ex)}
                className="block w-full text-left px-2.5 py-1.5 bg-neutral-50 hover:bg-neutral-100 border border-neutral-200 rounded text-neutral-700 italic"
              >"{ex}"</button>
            ))}
          </div>
        </div>
      )}

      {/* Message thread */}
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-3" style={{ WebkitOverflowScrolling: 'touch' as any }}>
        {messages.map((msg) => (
          <MessageBubble key={msg.id} msg={msg} />
        ))}
        {isThinking && (
          <div className="flex items-start gap-2 text-neutral-500">
            <div className="bg-neutral-100 px-3 py-2 rounded-lg text-[12px]">
              <span className="inline-block animate-pulse">⏳</span> AI denkt na…
            </div>
          </div>
        )}
        {/* Suggestion chips — shown after last assistant message completes */}
        {!isThinking && !error && messages.length > 0 && (() => {
          const lastMsg = messages[messages.length - 1];
          const suggestions = getSuggestionsFor(lastMsg, cv);
          if (suggestions.length === 0) return null;
          return (
            <div className="pt-1">
              <div className="text-[9px] uppercase tracking-wider text-neutral-400 mb-1.5">Vervolgvragen</div>
              <div className="flex flex-wrap gap-1.5">
                {suggestions.map((s, i) => (
                  <button
                    key={i}
                    onClick={() => { setInput(s); inputRef.current?.focus(); }}
                    className="text-[10px] px-2.5 py-1 bg-white border border-neutral-200 hover:border-[#EE8D70] hover:bg-orange-50 text-neutral-700 rounded-full transition-colors"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          );
        })()}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-[11px]">
            <div className="flex items-start gap-2">
              <span>⚠️</span>
              <div className="flex-1">
                <div>{error}</div>
                <button
                  onClick={handleRetry}
                  disabled={isThinking}
                  className="mt-1.5 text-[10px] font-semibold uppercase tracking-wider text-red-600 hover:text-red-800 disabled:opacity-50"
                >
                  ↻ Opnieuw proberen
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Token usage footer */}
      {(tokenUsage.input > 0 || tokenUsage.output > 0) && (
        <div className={`px-5 py-1.5 border-t flex items-center justify-between text-[9px] font-mono ${
          isOverLimit ? 'bg-red-50 border-red-200 text-red-700' :
          estimatedCostNum > MAX_SESSION_COST_USD * 0.7 ? 'bg-amber-50 border-amber-200 text-amber-700' :
          'bg-neutral-50 border-neutral-100 text-neutral-500'
        }`}>
          <span>📊 In: {tokenUsage.input.toLocaleString()} (cache: {tokenUsage.cached.toLocaleString()}) · Out: {tokenUsage.output.toLocaleString()}</span>
          <span>~${estimatedCost} / ${MAX_SESSION_COST_USD.toFixed(2)}{isOverLimit ? ' ⚠️' : ''}</span>
        </div>
      )}

      {/* Input area */}
      <div
        className="border-t border-neutral-200 p-3 bg-neutral-50 flex-shrink-0"
        style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
      >
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Typ een bericht… (Enter om te versturen, Shift+Enter voor nieuwe regel)"
          rows={2}
          className="w-full px-3 py-2 text-[13px] sm:text-[12px] border border-neutral-200 rounded resize-none focus:outline-none focus:border-[#EE8D70] transition-colors leading-relaxed"
          disabled={isThinking}
          inputMode="text"
          autoComplete="off"
        />
        <div className="flex justify-between items-center mt-2">
          <button
            onClick={handleClear}
            className="text-[10px] text-neutral-400 hover:text-neutral-600 uppercase tracking-wider min-h-[36px] px-2"
            disabled={messages.length === 0}
          >
            Gesprek wissen
          </button>
          <button
            onClick={handleSend}
            disabled={!input.trim() || isThinking}
            className="px-5 py-2.5 bg-[#EE8D70] text-white text-[11px] font-bold uppercase tracking-widest hover:bg-[#E07C60] disabled:opacity-40 disabled:cursor-not-allowed transition-colors rounded min-h-[40px]"
          >
            {isThinking ? '...' : 'Verstuur'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── MESSAGE BUBBLE ─────────────────────────────────────────────────────────
const MessageBubble: React.FC<{ msg: DisplayMessage }> = ({ msg }) => {
  if (msg.role === 'system-info') {
    return (
      <div className="text-center text-[10px] text-neutral-500 italic px-3 py-1">
        {msg.text}
      </div>
    );
  }
  const isUser = msg.role === 'user';
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[85%] px-3 py-2 rounded-lg text-[12px] leading-relaxed ${
        isUser
          ? 'bg-[#1E3A35] text-white'
          : 'bg-neutral-100 text-neutral-800'
      }`}>
        {msg.text && <div className="whitespace-pre-wrap">{msg.text}</div>}
        {msg.toolUses && msg.toolUses.length > 0 && (
          <div className={`mt-2 space-y-1 ${msg.text ? 'pt-2 border-t' : ''} ${isUser ? 'border-white/20' : 'border-neutral-200'}`}>
            {msg.toolUses.map((tu, i) => (
              <div key={i} className={`text-[10px] font-mono ${isUser ? 'text-white/70' : 'text-neutral-500'}`}>
                {tu.error ? '⚠️' : tu.result ? '✓' : '⚙️'} <span className="font-bold">{tu.name}</span>
                {tu.result && <span className="ml-1 opacity-75">— {tu.result.slice(0, 80)}{tu.result.length > 80 ? '…' : ''}</span>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
