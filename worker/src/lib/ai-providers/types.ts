/** One internal interface; each provider is a small adapter. Adding a provider = one new file + one registry line. */
export interface AIMessage { role: 'user' | 'assistant'; content: string }

export interface AIGenerateInput {
  system: string;
  messages: AIMessage[];
  maxTokens?: number;
  temperature?: number;
  json?: boolean;
}

export interface AIProvider {
  readonly id: 'gemini' | 'workers_ai' | 'openai';
  readonly label: string;
  generate(input: AIGenerateInput): Promise<string>;
}

export class AIProviderError extends Error {
  constructor(public provider: string, message: string) {
    super(`${provider}: ${message}`);
  }
}
