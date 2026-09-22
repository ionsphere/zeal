let runtimeApiKey = '';

export function setRuntimeApiKey(apiKey: string): void {
  runtimeApiKey = apiKey;
}

export const config = {
  get apiKey() {
    return runtimeApiKey || process.env.META_MODEL_API_KEY || process.env.ZEAL_API_KEY || '';
  },
  model: process.env.META_MODEL_API_MODEL || process.env.ZEAL_MODEL || 'muse-spark-1.2',
  workdir: process.env.WORKDIR || './workdir',
  apiBase: (
    process.env.META_MODEL_API_BASE_URL ||
    process.env.ZEAL_API_BASE ||
    'https://api.meta.ai/v1'
  ).replace(/\/$/, ''),
  maxSteps: Number(process.env.ZEAL_MAX_STEPS || 100),
  maxCompletionAttempts: Number(process.env.ZEAL_MAX_COMPLETION_ATTEMPTS || 3),
  commandTimeoutMs: Number(process.env.ZEAL_COMMAND_TIMEOUT_MS || 120_000),
  maxAgents: Number(process.env.ZEAL_MAX_AGENTS || 4),
};
