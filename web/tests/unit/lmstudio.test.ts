import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as submitFeedback } from "../../src/app/api/lmstudio/feedback/route";
import { GET as listModels } from "../../src/app/api/lmstudio/models/route";
import { POST as suggestTopics } from "../../src/app/api/lmstudio/topics/route";
import { assertLoopbackBaseUrl } from "../../src/lib/server/lmstudio";

function jsonResponse(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function chatResponse(content: string) {
  return jsonResponse({ choices: [{ message: { content } }] });
}

function routeRequest(path: string, body: unknown, headers?: HeadersInit) {
  return new Request(`http://127.0.0.1${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

const validFeedback = {
  creditedPoints: ["Identifies that the membrane controls movement."],
  missingPoints: ["Does not explain selective permeability."],
  explanation: "Your answer has one supported point; add the missing idea.",
  uncertainty: [],
};

describe("loopback-only LM Studio integration", () => {
  beforeEach(() => {
    vi.stubEnv("LM_STUDIO_BASE_URL", "http://127.0.0.1:1234/v1");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("accepts loopback endpoints and rejects LAN or internet hosts", () => {
    expect(assertLoopbackBaseUrl("http://127.0.0.1:1234/v1").hostname).toBe("127.0.0.1");
    expect(assertLoopbackBaseUrl("http://localhost:1234/v1").hostname).toBe("localhost");
    expect(() => assertLoopbackBaseUrl("https://example.com/v1")).toThrow();
    expect(() => assertLoopbackBaseUrl("http://192.168.1.20:1234/v1")).toThrow();
  });

  it("lists the models exposed by LM Studio without contacting another host", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      jsonResponse({ data: [{ id: "qwen3-8b" }, { id: "llama-3.2-vision" }] }),
    );

    const response = await listModels();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      models: [{ id: "qwen3-8b" }, { id: "llama-3.2-vision" }],
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toBe("http://127.0.0.1:1234/v1/models");
  });

  it("rejects an internet host configured on the server before making a request", async () => {
    vi.stubEnv("LM_STUDIO_BASE_URL", "https://example.com/v1");
    const fetchMock = vi.spyOn(globalThis, "fetch");

    const response = await listModels();

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "LM_STUDIO_CONFIGURATION" } });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns a typed disconnected response and never falls back remotely", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("connection refused"));

    const response = await listModels();

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "LM_STUDIO_UNAVAILABLE" } });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toMatch(/^http:\/\/(127\.0\.0\.1|localhost):/);
  });

  it("rejects malformed model feedback instead of showing it as an answer", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(chatResponse("not valid JSON"));

    const response = await submitFeedback(routeRequest("/api/lmstudio/feedback", {
      modelId: "qwen3-8b",
      questionText: "State one function of the cell membrane.",
      answer: { text: "It controls movement into and out of the cell." },
      markschemeText: "Accept: controls movement into and out of the cell.",
    }));

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "LM_STUDIO_INVALID_RESPONSE" } });
  });

  it("does not expose an official mark even if the model includes one", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(chatResponse(JSON.stringify({
      ...validFeedback,
      officialMark: "6/8",
    })));

    const response = await submitFeedback(routeRequest("/api/lmstudio/feedback", {
      modelId: "qwen3-8b",
      questionText: "State one function of the cell membrane.",
      answer: { text: "It controls movement into and out of the cell." },
      markschemeText: "Accept: controls movement into and out of the cell.",
    }));

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "LM_STUDIO_INVALID_RESPONSE" } });
  });

  it("returns only topic IDs present in the allowed syllabus topics", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(chatResponse(JSON.stringify({ suggestions: [
      { topicId: "biology:cell-structure", reason: "The answer discusses a membrane." },
      { topicId: "invented-topic", reason: "This ID was not supplied." },
    ] })));

    const response = await suggestTopics(routeRequest("/api/lmstudio/topics", {
      modelId: "qwen3-8b",
      questionText: "State one function of the cell membrane.",
      allowedTopics: [
        { id: "biology:cell-structure", title: "Cell structure" },
        { id: "biology:enzymes", title: "Enzymes" },
      ],
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      suggestions: [{ topicId: "biology:cell-structure", reason: "The answer discusses a membrane." }],
    });
  });

  it("encodes answer images as local OpenAI-compatible image_url content", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(chatResponse(JSON.stringify(validFeedback)));
    const imageDataUrl = "data:image/jpeg;base64,ZmFrZS1pbWFnZQ==";

    const response = await submitFeedback(routeRequest("/api/lmstudio/feedback", {
      modelId: "llama-3.2-vision",
      questionText: "Explain how the cell membrane controls movement.",
      answer: { text: "It is selectively permeable.", images: [imageDataUrl] },
      markschemeText: "Award credit for selective permeability and controlled exchange.",
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(validFeedback);
    const [target, init] = fetchMock.mock.calls[0];
    expect(String(target)).toBe("http://127.0.0.1:1234/v1/chat/completions");
    expect(init?.redirect).toBe("error");
    const payload = JSON.parse(String(init?.body));
    expect(payload.messages[1].content).toContainEqual({
      type: "image_url",
      image_url: { url: imageDataUrl },
    });
  });

  it("blocks oversized answer payloads before calling LM Studio", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const request = routeRequest("/api/lmstudio/feedback", {
      modelId: "qwen3-8b",
      questionText: "Question",
      answer: { text: "My answer" },
      markschemeText: "Markscheme",
    }, { "content-length": String(13 * 1024 * 1024) });

    const response = await submitFeedback(request);

    expect(response.status).toBe(413);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
