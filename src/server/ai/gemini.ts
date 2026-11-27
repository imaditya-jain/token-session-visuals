import "server-only";

import { AppError } from "@/server/http/errors";
import { logger } from "@/server/logger";

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";

type Part = { text?: string; inline_data?: { mime_type: string; data: string } };
type GeminiResponse = {
  candidates?: {
    content?: { parts?: { text?: string }[] };
    finishReason?: string;
    groundingMetadata?: { groundingChunks?: { web?: { uri?: string; title?: string } }[] };
  }[];
  promptFeedback?: { blockReason?: string };
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
  modelVersion?: string;
};

/** Tried in order when the chosen model is overloaded, slow or retired (they are on a free plan: this happens). */
const FALLBACK_MODELS = ["gemini-3.5-flash-lite", "gemini-flash-lite-latest"] as const;

/**
 * Thinking is kept as small as the model allows (it is billed as output). The 2.x and "flash-preview" models take a
 * token budget; the newer lite and "latest" models take a level and reject a budget.
 */
const thinkingFor = (model: string): object =>
  /flash-preview|^gemini-2\./.test(model) ? { thinkingBudget: 0 } : { thinkingLevel: "minimal" };

async function generate(
  apiKey: string,
  model: string,
  makeBody: (model: string) => object,
  timeoutMs: number,
): Promise<GeminiResponse> {
  const models = [model, ...FALLBACK_MODELS.filter((name) => name !== model)];
  const started = Date.now();
  let last: AppError | null = null;
  for (const [index, name] of models.entries()) {
    // The first model gets most of the time; each fallback gets what is left, up to a short slice.
    const remaining = timeoutMs - (Date.now() - started);
    if (remaining < 4_000) break;
    try {
      return await generateOnce(
        apiKey,
        name,
        makeBody(name),
        index === 0 ? Math.round(timeoutMs * 0.55) : remaining,
      );
    } catch (error) {
      if (!(error instanceof AppError) || error.status === 422) throw error;
      last = error;
      logger.warn({ model: name }, "Gemini model failed, trying the next one");
    }
  }
  throw (
    last ??
    new AppError(
      503,
      "plant_doctor_unavailable",
      "The Plant Doctor is unavailable right now. Please try again shortly.",
    )
  );
}

async function generateOnce(
  apiKey: string,
  model: string,
  body: object,
  timeoutMs: number,
): Promise<GeminiResponse> {
  let response: Response;
  try {
    // The key travels in a header, never in the URL, so it cannot end up in access logs.
    response = await fetch(`${ENDPOINT}/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    logger.error({ err: error }, "Gemini request failed");
    throw new AppError(
      503,
      "plant_doctor_unavailable",
      "The Plant Doctor is unavailable right now. Please try again shortly.",
    );
  }
  if (!response.ok) {
    // Upstream error text is logged for us, never shown to customers.
    logger.error(
      { status: response.status, body: (await response.text()).slice(0, 300) },
      "Gemini refused the request",
    );
    throw new AppError(
      response.status === 429 ? 503 : 502,
      "plant_doctor_unavailable",
      "The Plant Doctor is unavailable right now. Please try again shortly.",
    );
  }
  return (await response.json()) as GeminiResponse;
}

const textOf = (data: GeminiResponse): string =>
  (data.candidates?.[0]?.content?.parts ?? []).map((part) => part.text ?? "").join("");

/** One photo plus text in, schema-constrained JSON out. A blocked or unreadable answer is a clean error. */
export async function geminiAnalyse(input: {
  apiKey: string;
  model: string;
  system: string;
  jpeg: Buffer;
  userText: string;
  jsonSchema: object;
}): Promise<{ data: unknown; model: string; inputTokens: number; outputTokens: number }> {
  const parts: Part[] = [
    { inline_data: { mime_type: "image/jpeg", data: input.jpeg.toString("base64") } },
    { text: input.userText },
  ];
  const data = await generate(
    input.apiKey,
    input.model,
    (model) => ({
      systemInstruction: { parts: [{ text: input.system }] },
      contents: [{ role: "user", parts }],
      generationConfig: {
        responseMimeType: "application/json",
        responseJsonSchema: input.jsonSchema,
        // Short answers cost less: the prompt asks for brief sentences and this is the hard ceiling.
        maxOutputTokens: 1800,
        temperature: 0.3,
        thinkingConfig: thinkingFor(model),
      },
    }),
    55_000,
  );
  if (data.promptFeedback?.blockReason || data.candidates?.[0]?.finishReason === "SAFETY") {
    throw new AppError(
      422,
      "could_not_analyse",
      "We couldn't analyse that photo. Try a different one.",
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(textOf(data));
  } catch {
    throw new AppError(
      502,
      "plant_doctor_bad_answer",
      "We couldn't read the result. Please try again.",
    );
  }
  return {
    data: parsed,
    model: data.modelVersion ?? input.model,
    inputTokens: data.usageMetadata?.promptTokenCount ?? 0,
    outputTokens: data.usageMetadata?.candidatesTokenCount ?? 0,
  };
}

/** Text-only question answered with Google Search grounding; returns the text and the pages it was grounded on. */
export async function geminiResearch(input: {
  apiKey: string;
  model: string;
  system: string;
  userText: string;
  timeoutMs: number;
}): Promise<{ text: string; sources: { url: string; title: string }[] }> {
  const data = await generate(
    input.apiKey,
    input.model,
    (model) => ({
      systemInstruction: { parts: [{ text: input.system }] },
      contents: [{ role: "user", parts: [{ text: input.userText }] }],
      tools: [{ google_search: {} }],
      generationConfig: {
        maxOutputTokens: 1200,
        temperature: 0.3,
        thinkingConfig: thinkingFor(model),
      },
    }),
    input.timeoutMs,
  );
  const chunks = data.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
  return {
    text: textOf(data),
    sources: chunks.flatMap((chunk) =>
      chunk.web?.uri ? [{ url: chunk.web.uri, title: chunk.web.title ?? chunk.web.uri }] : [],
    ),
  };
}
