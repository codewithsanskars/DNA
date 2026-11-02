import axios from 'axios';
import { env } from '../config/env';
import { httpError } from '../utils/http';

/**
 * Provider-agnostic LLM client. OpenAI when OPENAI_API_KEY is set, otherwise
 * a local Ollama server. Every feature goes through `chat` / `json`, so
 * swapping providers never touches feature code.
 */
export type LlmProvider = 'openai' | 'ollama';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface ChatOptions {
  json?: boolean;
  temperature?: number;
  maxTokens?: number;
}

export function activeProvider(): LlmProvider {
  return env.ai.openaiApiKey ? 'openai' : 'ollama';
}

export function activeModel(): string {
  return activeProvider() === 'openai' ? env.ai.openaiModel : env.ai.ollamaModel;
}

async function chatOpenAI(messages: ChatMessage[], opts: ChatOptions): Promise<string> {
  const { data } = await axios.post(
    `${env.ai.openaiBaseUrl}/chat/completions`,
    {
      model: env.ai.openaiModel,
      messages,
      temperature: opts.temperature ?? 0.2,
      max_tokens: opts.maxTokens ?? 1500,
      ...(opts.json ? { response_format: { type: 'json_object' } } : {}),
    },
    {
      headers: { Authorization: `Bearer ${env.ai.openaiApiKey}` },
      timeout: env.ai.timeoutMs,
    }
  );
  return data?.choices?.[0]?.message?.content ?? '';
}

async function chatOllama(messages: ChatMessage[], opts: ChatOptions): Promise<string> {
  const { data } = await axios.post(
    `${env.ai.ollamaUrl}/api/chat`,
    {
      model: env.ai.ollamaModel,
      messages,
      stream: false,
      ...(opts.json ? { format: 'json' } : {}),
      options: { temperature: opts.temperature ?? 0.2, num_predict: opts.maxTokens ?? 1500 },
    },
    { timeout: env.ai.timeoutMs }
  );
  return data?.message?.content ?? '';
}

/** Turns provider/network failures into a clear 503 instead of an opaque 500. */
function wrapError(err: any): Error {
  const provider = activeProvider();
  if (err?.code === 'ECONNREFUSED' || err?.code === 'ENOTFOUND') {
    return httpError(
      503,
      provider === 'ollama'
        ? `AI is unavailable: can't reach Ollama at ${env.ai.ollamaUrl}. Start Ollama or set OPENAI_API_KEY.`
        : 'AI is unavailable: cannot reach OpenAI.'
    );
  }
  if (err?.code === 'ECONNABORTED') return httpError(504, 'The AI request timed out. Try again.');
  const status = err?.response?.status;
  if (status === 401) return httpError(503, 'AI is misconfigured: the OpenAI API key was rejected.');
  if (status === 404 && provider === 'ollama') {
    return httpError(503, `Ollama model "${env.ai.ollamaModel}" isn't installed. Run: ollama pull ${env.ai.ollamaModel}`);
  }
  if (status === 429) return httpError(429, 'The AI provider is rate-limiting requests. Try again shortly.');
  const msg = err?.response?.data?.error?.message || err?.response?.data?.error || err?.message || 'AI request failed';
  return httpError(502, `AI request failed: ${typeof msg === 'string' ? msg : 'unknown error'}`);
}

export const llm = {
  async chat(messages: ChatMessage[], opts: ChatOptions = {}): Promise<string> {
    try {
      const out = activeProvider() === 'openai' ? await chatOpenAI(messages, opts) : await chatOllama(messages, opts);
      return out.trim();
    } catch (err) {
      throw wrapError(err);
    }
  },

  /** Chat expecting a JSON object back. Retries once if the model returns invalid JSON. */
  async json<T = any>(messages: ChatMessage[], opts: Omit<ChatOptions, 'json'> = {}): Promise<T> {
    for (let attempt = 0; attempt < 2; attempt++) {
      const raw = await llm.chat(messages, { ...opts, json: true });
      const parsed = extractJson(raw);
      if (parsed !== undefined) return parsed as T;
    }
    throw httpError(502, 'The AI returned an unreadable response. Try again.');
  },

  /** Cheap reachability check for the status endpoint. */
  async health(): Promise<{ ok: boolean; detail?: string }> {
    try {
      if (activeProvider() === 'openai') return { ok: true };
      const { data } = await axios.get(`${env.ai.ollamaUrl}/api/tags`, { timeout: 3000 });
      const models: string[] = (data?.models || []).map((m: any) => String(m.name));
      const wanted = env.ai.ollamaModel;
      const has = models.some((m) => m === wanted || m.split(':')[0] === wanted.split(':')[0]);
      return has ? { ok: true } : { ok: false, detail: `Model "${wanted}" not pulled. Run: ollama pull ${wanted}` };
    } catch {
      return { ok: false, detail: `Ollama not reachable at ${env.ai.ollamaUrl}` };
    }
  },
};

function extractJson(raw: string): unknown {
  const text = raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(text.slice(start, end + 1));
      } catch {
        /* fall through */
      }
    }
    return undefined;
  }
}
