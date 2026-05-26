// Client-side service for the AI Assistant chat feature.
// Communicates with /api/chat (Vercel Edge Function) which proxies to Anthropic.
//
// The API key never touches the browser — it lives only in Vercel env vars.

import { ParsedCV } from '../types';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string | ContentBlock[];
}

export type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, any> }
  | { type: 'tool_result'; tool_use_id: string; content: string; is_error?: boolean };

export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  };
}

export interface ChatResponse {
  id: string;
  model: string;
  role: 'assistant';
  content: ContentBlock[];
  stop_reason: 'end_turn' | 'tool_use' | 'max_tokens' | 'stop_sequence' | string;
  usage?: {
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  };
}

export interface ChatRequestPayload {
  messages: ChatMessage[];
  system?: string;
  tools?: ToolDefinition[];
  cv_context?: ParsedCV;
  model?: string;
  max_tokens?: number;
}

class ChatService {
  private endpoint = '/api/chat';

  async sendMessage(payload: ChatRequestPayload): Promise<ChatResponse> {
    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errBody = await response.json().catch(() => ({ error: 'Onbekende fout' }));
      throw new Error(errBody.error || `Chat API fout (${response.status})`);
    }

    return response.json();
  }

  /**
   * Send a streaming message — returns the parsed Anthropic events as they arrive.
   * onTextDelta fires for each text chunk. onComplete fires once with the full final response.
   *
   * Anthropic streaming events (SSE format):
   * - message_start, content_block_start, content_block_delta, content_block_stop, message_delta, message_stop
   */
  async streamMessage(
    payload: ChatRequestPayload,
    callbacks: {
      onTextDelta?: (text: string) => void;
      onToolUseStart?: (toolUse: { id: string; name: string }) => void;
      onComplete: (response: ChatResponse) => void;
      onError?: (err: Error) => void;
    }
  ): Promise<void> {
    try {
      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, stream: true }),
      });

      if (!response.ok) {
        const errBody = await response.json().catch(() => ({ error: 'Onbekende fout' }));
        throw new Error(errBody.error || `Chat API fout (${response.status})`);
      }
      if (!response.body) {
        throw new Error('Streaming niet ondersteund door browser');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      const finalContent: ContentBlock[] = [];
      let stopReason: string = 'end_turn';
      let usage: ChatResponse['usage'] = { input_tokens: 0, output_tokens: 0 };
      let messageId = '';
      let model = '';

      const blockTextBuffers: Map<number, string> = new Map();
      const blockToolBuffers: Map<number, { id: string; name: string; jsonAccum: string }> = new Map();

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const events = buffer.split('\n\n');
        buffer = events.pop() || '';

        for (const evt of events) {
          if (!evt.trim()) continue;
          const lines = evt.split('\n');
          let dataPayload = '';
          for (const line of lines) {
            if (line.startsWith('data: ')) dataPayload += line.slice(6);
          }
          if (!dataPayload || dataPayload === '[DONE]') continue;

          let parsed: any;
          try { parsed = JSON.parse(dataPayload); } catch { continue; }

          switch (parsed.type) {
            case 'message_start':
              messageId = parsed.message?.id || '';
              model = parsed.message?.model || '';
              if (parsed.message?.usage) usage = parsed.message.usage;
              break;
            case 'content_block_start':
              if (parsed.content_block?.type === 'text') {
                blockTextBuffers.set(parsed.index, '');
              } else if (parsed.content_block?.type === 'tool_use') {
                blockToolBuffers.set(parsed.index, {
                  id: parsed.content_block.id,
                  name: parsed.content_block.name,
                  jsonAccum: '',
                });
                callbacks.onToolUseStart?.({ id: parsed.content_block.id, name: parsed.content_block.name });
              }
              break;
            case 'content_block_delta':
              if (parsed.delta?.type === 'text_delta') {
                const cur = blockTextBuffers.get(parsed.index) || '';
                blockTextBuffers.set(parsed.index, cur + (parsed.delta.text || ''));
                callbacks.onTextDelta?.(parsed.delta.text || '');
              } else if (parsed.delta?.type === 'input_json_delta') {
                const cur = blockToolBuffers.get(parsed.index);
                if (cur) cur.jsonAccum += parsed.delta.partial_json || '';
              }
              break;
            case 'content_block_stop':
              if (blockTextBuffers.has(parsed.index)) {
                finalContent.push({ type: 'text', text: blockTextBuffers.get(parsed.index) || '' });
              } else if (blockToolBuffers.has(parsed.index)) {
                const tool = blockToolBuffers.get(parsed.index)!;
                let parsedInput: Record<string, any> = {};
                try { parsedInput = JSON.parse(tool.jsonAccum || '{}'); } catch { /* keep empty */ }
                finalContent.push({ type: 'tool_use', id: tool.id, name: tool.name, input: parsedInput });
              }
              break;
            case 'message_delta':
              if (parsed.delta?.stop_reason) stopReason = parsed.delta.stop_reason;
              if (parsed.usage) usage = { ...usage, ...parsed.usage };
              break;
            case 'message_stop':
              break;
          }
        }
      }

      callbacks.onComplete({
        id: messageId,
        model,
        role: 'assistant',
        content: finalContent,
        stop_reason: stopReason as any,
        usage,
      });
    } catch (e: any) {
      callbacks.onError?.(e instanceof Error ? e : new Error(String(e)));
    }
  }

  /**
   * Helper: extract plain text from an assistant response (concatenates all text blocks).
   * Tool-use blocks are ignored — those should be handled by the tool executor.
   */
  extractText(response: ChatResponse): string {
    return response.content
      .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
      .map(b => b.text)
      .join('\n');
  }

  /**
   * Helper: extract tool_use blocks from an assistant response.
   */
  extractToolUses(response: ChatResponse): Array<{ id: string; name: string; input: Record<string, any> }> {
    return response.content
      .filter((b): b is { type: 'tool_use'; id: string; name: string; input: Record<string, any> } => b.type === 'tool_use')
      .map(b => ({ id: b.id, name: b.name, input: b.input }));
  }
}

export const chatService = new ChatService();
