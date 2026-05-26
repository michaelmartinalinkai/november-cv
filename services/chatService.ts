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
