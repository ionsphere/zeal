export type ModelMessage = {
  role: string;
  content?: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
};

export type ToolCall = {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
};

export type ToolDefinition = {
  type: 'function';
  function: { name: string; description: string; parameters: Record<string, unknown> };
};

export type ModelSelection = {
  provider: string;
  model: string;
};

export interface ModelProvider {
  readonly id: string;
  complete(messages: ModelMessage[], tools: readonly ToolDefinition[], model: string): Promise<ModelMessage>;
}

type ProviderConfig = { baseUrl: string; apiKey: () => string; headers?: Record<string, string> };

const runtimeCredentials = new Map<string, string>();

export function setModelCredential(provider: string, apiKey: string): void {
  runtimeCredentials.set(provider, apiKey);
}

const PRESETS: Record<string, { baseUrl: string; keyEnv: string }> = {
  meta: { baseUrl: 'https://api.meta.ai/v1', keyEnv: 'META_MODEL_API_KEY' },
  openai: { baseUrl: 'https://api.openai.com/v1', keyEnv: 'OPENAI_API_KEY' },
  xai: { baseUrl: 'https://api.x.ai/v1', keyEnv: 'XAI_API_KEY' },
  kimi: { baseUrl: 'https://api.moonshot.ai/v1', keyEnv: 'MOONSHOT_API_KEY' },
  qwen: { baseUrl: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1', keyEnv: 'DASHSCOPE_API_KEY' },
  openrouter: { baseUrl: 'https://openrouter.ai/api/v1', keyEnv: 'OPENROUTER_API_KEY' },
  ollama: { baseUrl: 'http://localhost:11434/v1', keyEnv: 'OLLAMA_API_KEY' },
};

export class OpenAICompatibleProvider implements ModelProvider {
  constructor(readonly id: string, private readonly config: ProviderConfig) {}

  async complete(messages: ModelMessage[], tools: readonly ToolDefinition[], model: string): Promise<ModelMessage> {
    const apiKey = this.config.apiKey();
    if (!apiKey && this.id !== 'ollama') {
      throw new Error(`No API key configured for provider ${this.id}`);
    }
    const toolOptions = tools.length ? { tools, tool_choice: 'auto', parallel_tool_calls: true } : {};
    const response = await fetch(`${this.config.baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey || 'ollama'}`,
        'Content-Type': 'application/json',
        ...this.config.headers,
      },
      body: JSON.stringify({ model, messages, ...toolOptions }),
    });
    const raw = await response.text();
    if (!response.ok) throw new Error(`${this.id} model API ${response.status}: ${raw.slice(0, 2_000)}`);
    let data: any;
    try { data = JSON.parse(raw); }
    catch { throw new Error(`${this.id} model API returned invalid JSON: ${raw.slice(0, 1_000)}`); }
    const message = data.choices?.[0]?.message;
    if (!message) throw new Error(`${this.id} response has no choices[0].message`);
    return { role: 'assistant', content: message.content ?? '', tool_calls: message.tool_calls ?? [] };
  }
}

export class ModelRegistry {
  private readonly providers = new Map<string, ModelProvider>();

  constructor() {
    for (const [id, preset] of Object.entries(PRESETS)) {
      const prefix = id.toUpperCase();
      const baseUrl = process.env[`${prefix}_API_BASE`] || preset.baseUrl;
      const apiKey = () => runtimeCredentials.get(id) || process.env[`${prefix}_API_KEY`] || process.env[preset.keyEnv] || '';
      this.register(new OpenAICompatibleProvider(id, { baseUrl, apiKey }));
    }
    // A custom OpenAI-compatible server can be added without changing source.
    if (process.env.ZEAL_API_BASE) {
      this.register(new OpenAICompatibleProvider('custom', {
        baseUrl: process.env.ZEAL_API_BASE,
        apiKey: () => runtimeCredentials.get('custom') || process.env.ZEAL_API_KEY || '',
      }));
    }
  }

  register(provider: ModelProvider) { this.providers.set(provider.id, provider); }

  resolve(selection: ModelSelection): ModelProvider {
    const provider = this.providers.get(selection.provider);
    if (!provider) throw new Error(`Unknown provider ${selection.provider}. Available: ${this.list().join(', ')}`);
    return provider;
  }

  list() { return [...this.providers.keys()].sort(); }
}

export function parseModelSelection(value: string, fallbackProvider = 'meta'): ModelSelection {
  const slash = value.indexOf('/');
  return slash > 0
    ? { provider: value.slice(0, slash), model: value.slice(slash + 1) }
    : { provider: fallbackProvider, model: value };
}
