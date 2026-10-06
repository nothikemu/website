import "server-only";
import { env } from "@/server/env";

export type AiMessage = { role: "user" | "assistant"; content: string };
export type AiRequest = { system: string; messages: AiMessage[]; maxTokens?: number };
export type AiResponse = { text: string; model: string; provider: string };

/**
 * Provider-agnostic completion interface. Forge never imports a vendor SDK —
 * each provider is a thin fetch adapter selected by AI_PROVIDER, so swapping
 * OpenAI ⇄ Anthropic ⇄ Google is a configuration change.
 */
export interface AiProvider {
  readonly name: string;
  readonly model: string;
  complete(req: AiRequest): Promise<AiResponse>;
}

async function postJson(url: string, headers: Record<string, string>, body: unknown) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`AI provider returned HTTP ${res.status}`);
  return res.json() as Promise<Record<string, unknown>>;
}

class OpenAIProvider implements AiProvider {
  readonly name = "openai";
  constructor(private key: string, readonly model: string) {}
  async complete(req: AiRequest): Promise<AiResponse> {
    const data = (await postJson("https://api.openai.com/v1/chat/completions", { Authorization: `Bearer ${this.key}` }, {
      model: this.model,
      max_tokens: req.maxTokens ?? 1200,
      messages: [{ role: "system", content: req.system }, ...req.messages],
    })) as { choices?: { message?: { content?: string } }[] };
    return { text: data.choices?.[0]?.message?.content ?? "", model: this.model, provider: this.name };
  }
}

class AnthropicProvider implements AiProvider {
  readonly name = "anthropic";
  constructor(private key: string, readonly model: string) {}
  async complete(req: AiRequest): Promise<AiResponse> {
    const data = (await postJson(
      "https://api.anthropic.com/v1/messages",
      { "x-api-key": this.key, "anthropic-version": "2023-06-01" },
      { model: this.model, max_tokens: req.maxTokens ?? 1200, system: req.system, messages: req.messages },
    )) as { content?: { type: string; text?: string }[] };
    return { text: (data.content ?? []).filter((c) => c.type === "text").map((c) => c.text).join(""), model: this.model, provider: this.name };
  }
}

class GoogleProvider implements AiProvider {
  readonly name = "google";
  constructor(private key: string, readonly model: string) {}
  async complete(req: AiRequest): Promise<AiResponse> {
    const data = (await postJson(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(this.model)}:generateContent`,
      { "x-goog-api-key": this.key },
      {
        systemInstruction: { parts: [{ text: req.system }] },
        contents: req.messages.map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] })),
        generationConfig: { maxOutputTokens: req.maxTokens ?? 1200 },
      },
    )) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    return { text: data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "", model: this.model, provider: this.name };
  }
}

const DEFAULT_MODELS = { openai: "gpt-4.1-mini", anthropic: "claude-sonnet-5-5", google: "gemini-2.5-flash" } as const;

export function aiProvider(): AiProvider | null {
  const e = env();
  switch (e.AI_PROVIDER) {
    case "openai":
      return e.OPENAI_API_KEY ? new OpenAIProvider(e.OPENAI_API_KEY, e.AI_MODEL ?? DEFAULT_MODELS.openai) : null;
    case "anthropic":
      return e.ANTHROPIC_API_KEY ? new AnthropicProvider(e.ANTHROPIC_API_KEY, e.AI_MODEL ?? DEFAULT_MODELS.anthropic) : null;
    case "google":
      return e.GOOGLE_AI_API_KEY ? new GoogleProvider(e.GOOGLE_AI_API_KEY, e.AI_MODEL ?? DEFAULT_MODELS.google) : null;
    default:
      return null;
  }
}
