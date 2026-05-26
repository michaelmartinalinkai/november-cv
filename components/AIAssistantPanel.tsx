import React, { useState, useRef, useEffect } from 'react';
import { ParsedCV } from '../types';
import { chatService, ChatMessage, ContentBlock, ToolDefinition } from '../services/chatService';

interface AIAssistantPanelProps {
  cv: ParsedCV;
  cvId: string; // Used to detect CV switches and reset chat
  onCvChange: (newCv: ParsedCV) => void;
  isOpen: boolean;
  onClose: () => void;
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

export const AIAssistantPanel: React.FC<AIAssistantPanelProps> = ({
  cv,
  cvId,
  onCvChange,
  isOpen,
  onClose,
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

  /**
   * Agent loop: send messages → if response has tool_use, execute tools, send results back, repeat.
   * Stops when the model returns stop_reason: 'end_turn' (i.e. it's done).
   * Safety: max 10 iterations to prevent infinite loops.
   */
  const runAgentLoop = async () => {
    const MAX_ITERATIONS = 10;
    let workingCv: ParsedCV = cv;

    for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
      const response = await chatService.sendMessage({
        messages: apiMessagesRef.current,
        cv_context: workingCv,
        tools: tools && tools.length > 0 ? tools : undefined,
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

      // Extract text for display
      const text = chatService.extractText(response);
      const toolUses = chatService.extractToolUses(response);

      // Display assistant message
      if (text || toolUses.length > 0) {
        addDisplayMessage({
          role: 'assistant',
          text: text || (toolUses.length > 0 ? `_(${toolUses.length} bewerking${toolUses.length > 1 ? 'en' : ''} uitgevoerd)_` : ''),
          toolUses: toolUses.map(t => ({ name: t.name, input: t.input })),
        });
      }

      // If no tools were used, the model is done
      if (toolUses.length === 0 || response.stop_reason !== 'tool_use') {
        return;
      }

      // Execute each tool and gather results
      const toolResults: ContentBlock[] = [];
      for (const tu of toolUses) {
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
          // Update last display message with the tool result
          setMessages(prev => {
            const next = [...prev];
            const last = next[next.length - 1];
            if (last && last.toolUses) {
              const tuIdx = last.toolUses.findIndex(t => t.name === tu.name);
              if (tuIdx >= 0) {
                last.toolUses[tuIdx] = { ...last.toolUses[tuIdx], result };
              }
            }
            return next;
          });
        } catch (e: any) {
          toolResults.push({
            type: 'tool_result',
            tool_use_id: tu.id,
            content: `Tool-fout: ${e?.message || String(e)}`,
            is_error: true,
          });
          setMessages(prev => {
            const next = [...prev];
            const last = next[next.length - 1];
            if (last && last.toolUses) {
              const tuIdx = last.toolUses.findIndex(t => t.name === tu.name);
              if (tuIdx >= 0) {
                last.toolUses[tuIdx] = { ...last.toolUses[tuIdx], result: e?.message || 'Fout', error: true };
              }
            }
            return next;
          });
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
  const estimatedCost = (
    (tokenUsage.input - tokenUsage.cached) * 3 / 1_000_000
    + tokenUsage.cached * 0.3 / 1_000_000
    + tokenUsage.output * 15 / 1_000_000
  ).toFixed(4);

  if (!isOpen) return null;

  return (
    <div
      className="fixed top-0 right-0 h-screen w-full sm:w-[420px] bg-white shadow-2xl z-50 flex flex-col border-l border-neutral-200"
      style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}
    >
      {/* Header */}
      <div className="bg-[#1E3A35] text-white px-5 py-4 flex justify-between items-center">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-widest text-[#e3fd01]">AI Assistent</div>
          <div className="text-sm font-semibold mt-0.5">CV-bewerking via gesprek</div>
        </div>
        <button
          onClick={onClose}
          className="text-white/70 hover:text-white text-2xl leading-none w-8 h-8 flex items-center justify-center"
          title="Sluiten"
        >×</button>
      </div>

      {/* Welcome / empty state */}
      {messages.length === 0 && (
        <div className="px-5 py-6 text-[12px] text-neutral-600 leading-relaxed border-b border-neutral-100">
          <p className="font-semibold text-neutral-800 mb-2">Hoe kan ik je helpen?</p>
          <p className="mb-3">Voorbeelden van wat je kunt vragen:</p>
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
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
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
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-[11px]">
            ⚠️ {error}
          </div>
        )}
      </div>

      {/* Token usage footer */}
      {(tokenUsage.input > 0 || tokenUsage.output > 0) && (
        <div className="px-5 py-1.5 bg-neutral-50 border-t border-neutral-100 flex items-center justify-between text-[9px] text-neutral-500 font-mono">
          <span>📊 In: {tokenUsage.input.toLocaleString()} (cache: {tokenUsage.cached.toLocaleString()}) · Out: {tokenUsage.output.toLocaleString()}</span>
          <span>~${estimatedCost}</span>
        </div>
      )}

      {/* Input area */}
      <div className="border-t border-neutral-200 p-3 bg-neutral-50">
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Typ een bericht… (Enter om te versturen, Shift+Enter voor nieuwe regel)"
          rows={2}
          className="w-full px-3 py-2 text-[12px] border border-neutral-200 rounded resize-none focus:outline-none focus:border-[#EE8D70] transition-colors leading-relaxed"
          disabled={isThinking}
        />
        <div className="flex justify-between items-center mt-2">
          <button
            onClick={handleClear}
            className="text-[10px] text-neutral-400 hover:text-neutral-600 uppercase tracking-wider"
            disabled={messages.length === 0}
          >
            Gesprek wissen
          </button>
          <button
            onClick={handleSend}
            disabled={!input.trim() || isThinking}
            className="px-4 py-1.5 bg-[#EE8D70] text-white text-[11px] font-bold uppercase tracking-widest hover:bg-[#E07C60] disabled:opacity-40 disabled:cursor-not-allowed transition-colors rounded"
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
