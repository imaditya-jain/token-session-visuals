// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/ai/image", () => ({ shrinkForTokens: async (jpeg: Buffer) => jpeg }));

import { resetEnvCache } from "@/server/config/env";

import { analysePlantPhoto, researchProblem } from "./plant-doctor";

const answer = {
  isPlant: true,
  photoIssue: null,
  plant: { commonName: "Monstera", scientificName: "Monstera deliciosa", confidence: "high" },
  health: "healthy",
  summary: "Looks healthy.",
  findings: [],
  carePlan: { rightNow: [], thisWeek: [], ongoing: ["Water when the top inch is dry."], avoid: [] },
  watchFor: [],
  prevention: ["Water only when the top inch is dry."],
  questions: [],
  whenToGetHelp: null,
  productPicks: [],
};

const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const candidate = (text: string, extra: object = {}) => ({
  candidates: [{ content: { parts: [{ text }] }, ...extra }],
  usageMetadata: { promptTokenCount: 1200, candidatesTokenCount: 300 },
  modelVersion: "gemini-3-flash-preview",
});

const fetchMock = vi.fn();
const input = { jpeg: Buffer.from("jpeg-bytes"), notes: "", catalog: [] };

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("ANTHROPIC_API_KEY", "");
  vi.stubEnv("PLANT_DOCTOR_PROVIDER", "");
  vi.stubEnv("GEMINI_API_KEY", "AIza-test-key-0000000000000000000");
  vi.stubEnv("GEMINI_APIKEY", "");
  resetEnvCache();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  resetEnvCache();
});

describe("Plant Doctor through Gemini", () => {
  it("sends the photo with the key in a header (never the URL) and returns validated output", async () => {
    fetchMock.mockImplementation(async () => reply(candidate(JSON.stringify(answer))));
    const result = await analysePlantPhoto({ ...input, notes: "yellow tips" });
    expect(result.output.plant?.commonName).toBe("Monstera");
    expect(result).toMatchObject({
      model: "gemini-3-flash-preview",
      inputTokens: 1200,
      outputTokens: 300,
    });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("gemini-3-flash-preview:generateContent");
    expect(url).not.toContain("AIza");
    expect((init.headers as Record<string, string>)["x-goog-api-key"]).toContain("AIza");
    const body = JSON.parse(String(init.body));
    expect(body.contents[0].parts[0].inline_data.mime_type).toBe("image/jpeg");
    expect(body.contents[0].parts[1].text).toContain("Notes (untrusted)");
    expect(body.generationConfig.responseMimeType).toBe("application/json");
    expect(body.generationConfig.responseJsonSchema.type).toBe("object");
  });

  it("falls back to another model when the first is overloaded, and keeps the request small", async () => {
    fetchMock
      .mockResolvedValueOnce(reply({ error: { message: "high demand" } }, 503))
      .mockResolvedValueOnce(reply(candidate(JSON.stringify(answer))));
    const result = await analysePlantPhoto({
      ...input,
      catalog: [
        { handle: "pot", name: "Pot", category: "Pots", price: 9, inStock: true },
        { handle: "sold", name: "Gone", category: "Pots", price: 9, inStock: false },
      ],
    });
    expect(result.output.health).toBe("healthy");
    const urls = fetchMock.mock.calls.map((call) => String(call[0]));
    expect(urls[0]).toContain("gemini-3-flash-preview");
    expect(urls[1]).toContain("gemini-3.5-flash-lite");
    const sent = JSON.parse(String((fetchMock.mock.calls[1] as [string, RequestInit])[1].body));
    // Compact brief: sold-out items are not sent and the answer is capped.
    expect(sent.systemInstruction.parts[0].text).toContain("pot|Pot|9");
    expect(sent.systemInstruction.parts[0].text).not.toContain("Gone");
    expect(sent.systemInstruction.parts[0].text.length).toBeLessThan(2200);
    expect(sent.generationConfig.maxOutputTokens).toBeLessThanOrEqual(1800);
  });

  it("accepts the GEMINI_APIKEY spelling", async () => {
    vi.stubEnv("GEMINI_API_KEY", "");
    vi.stubEnv("GEMINI_APIKEY", "AIza-alias-key-00000000000000000");
    resetEnvCache();
    fetchMock.mockImplementation(async () => reply(candidate(JSON.stringify(answer))));
    await expect(analysePlantPhoto(input)).resolves.toBeTruthy();
  });

  it("turns upstream trouble into clean errors without leaking the upstream text", async () => {
    fetchMock.mockImplementation(async () =>
      reply({ error: { message: "quota exceeded for project 123" } }, 429),
    );
    const error = await analysePlantPhoto(input).catch((e: unknown) => e);
    expect(error).toMatchObject({ status: 503, code: "plant_doctor_unavailable" });
    expect(String((error as Error).message)).not.toContain("quota");

    fetchMock.mockImplementation(async () => reply({ promptFeedback: { blockReason: "SAFETY" } }));
    await expect(analysePlantPhoto(input)).rejects.toMatchObject({ status: 422 });

    fetchMock.mockImplementation(async () => reply(candidate("not json at all")));
    await expect(analysePlantPhoto(input)).rejects.toMatchObject({
      status: 502,
      code: "plant_doctor_bad_answer",
    });

    fetchMock.mockImplementation(async () =>
      reply(candidate(JSON.stringify({ ...answer, health: "great" }))),
    );
    await expect(analysePlantPhoto(input)).rejects.toMatchObject({ status: 502 });

    fetchMock.mockRejectedValue(new Error("network down"));
    await expect(analysePlantPhoto(input)).rejects.toMatchObject({ status: 503 });
  });

  it("research uses Google Search grounding, keeps only https pages and never throws", async () => {
    const tips = { tips: ["Isolate the plant."], treatments: [], productPicks: [] };
    fetchMock.mockImplementation(async () =>
      reply(
        candidate(JSON.stringify(tips), {
          groundingMetadata: {
            groundingChunks: [
              { web: { uri: "https://extension.example.edu/guide", title: "Guide" } },
              { web: { uri: "http://insecure.example/page", title: "Plain http" } },
            ],
          },
        }),
      ),
    );
    const found = await researchProblem({ problem: "yellow leaves", catalog: [], timeoutMs: 5000 });
    expect(found?.tips).toEqual(["Isolate the plant."]);
    expect(found?.sources.map((s) => s.url)).toEqual(["https://extension.example.edu/guide"]);
    expect(
      JSON.parse(String((fetchMock.mock.calls[0] as [string, RequestInit])[1].body)).tools,
    ).toEqual([{ google_search: {} }]);

    fetchMock.mockRejectedValue(new Error("boom"));
    await expect(
      researchProblem({ problem: "x", catalog: [], timeoutMs: 100 }),
    ).resolves.toBeNull();
  });

  it("reports itself off when neither provider has a key, and honours an explicit provider", async () => {
    vi.stubEnv("GEMINI_API_KEY", "");
    resetEnvCache();
    await expect(analysePlantPhoto(input)).rejects.toMatchObject({
      status: 503,
      code: "plant_doctor_not_configured",
    });
    vi.stubEnv("GEMINI_API_KEY", "AIza-test-key-0000000000000000000");
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-test-key-0000000000000000");
    vi.stubEnv("PLANT_DOCTOR_PROVIDER", "gemini");
    resetEnvCache();
    fetchMock.mockImplementation(async () => reply(candidate(JSON.stringify(answer))));
    await expect(analysePlantPhoto(input)).resolves.toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
