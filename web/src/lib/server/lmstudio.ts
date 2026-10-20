import { z } from "zod";
import {
  feedbackRequestSchema,
  MAX_AI_REQUEST_BYTES,
  feedbackResultSchema,
  modelListSchema,
  topicRequestSchema,
  topicSuggestionsSchema,
  type FeedbackRequest,
  type FeedbackResult,
  type ModelList,
  type TopicRequest,
  type TopicSuggestions,
} from "../ai/contracts";
import { buildFeedbackMessages, buildTopicMessages } from "../ai/prompts";

export const DEFAULT_LM_STUDIO_BASE_URL = "http://127.0.0.1:1234/v1";
const REQUEST_TIMEOUT_MS = 90_000;

export type LMStudioErrorCode =
  | "LM_STUDIO_UNAVAILABLE"
  | "LM_STUDIO_CONFIGURATION"
  | "LM_STUDIO_INVALID_RESPONSE"
  | "INVALID_REQUEST"
  | "PAYLOAD_TOO_LARGE";

const errorStatus: Record<LMStudioErrorCode, number> = {
  LM_STUDIO_UNAVAILABLE: 503,
  LM_STUDIO_CONFIGURATION: 503,
  LM_STUDIO_INVALID_RESPONSE: 502,
  INVALID_REQUEST: 400,
  PAYLOAD_TOO_LARGE: 413,
};

const errorMessage: Record<LMStudioErrorCode, string> = {
  LM_STUDIO_UNAVAILABLE: "LM Studio is not responding. Start its local server and try again.",
  LM_STUDIO_CONFIGURATION: "LM Studio must use an address on this laptop. Check the local server settings.",
  LM_STUDIO_INVALID_RESPONSE: "LM Studio returned a response this app could not safely read.",
  INVALID_REQUEST: "Check the information and try again.",
  PAYLOAD_TOO_LARGE: "This answer is too large. Choose fewer or smaller images and try again.",
};

export class LMStudioError extends Error {
  readonly status: number;

  constructor(readonly code: LMStudioErrorCode) {
    super(errorMessage[code]);
    this.name = "LMStudioError";
    this.status = errorStatus[code];
  }
}

class RequestBodyError extends Error {
  constructor(readonly code: "INVALID_REQUEST" | "PAYLOAD_TOO_LARGE") {
    super(errorMessage[code]);
    this.name = "RequestBodyError";
  }
}

export function assertLoopbackBaseUrl(value?: string): URL {
  const configured = value?.trim() || process.env.LM_STUDIO_BASE_URL?.trim() || DEFAULT_LM_STUDIO_BASE_URL;
  let url: URL;
  try {
    url = new URL(configured);
  } catch {
    throw new LMStudioError("LM_STUDIO_CONFIGURATION");
  }

  const hostname = url.hostname.toLocaleLowerCase("en");
  const loopbackHosts = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);
  const cleanPath = url.pathname.replace(/\/+$/, "");
  if (
    !["http:", "https:"].includes(url.protocol) ||
    !loopbackHosts.has(hostname) ||
    url.username !== "" ||
    url.password !== "" ||
    url.search !== "" ||
    url.hash !== "" ||
    !cleanPath.endsWith("/v1")
  ) {
    throw new LMStudioError("LM_STUDIO_CONFIGURATION");
  }

  url.pathname = `${cleanPath}/`;
  return url;
}

export async function readJsonRequest<T>(request: Request, schema: z.ZodType<T>): Promise<T> {
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > 0 && declaredLength > MAX_AI_REQUEST_BYTES) {
    throw new RequestBodyError("PAYLOAD_TOO_LARGE");
  }

  let raw: string;
  try {
    raw = await request.text();
  } catch {
    throw new RequestBodyError("INVALID_REQUEST");
  }
  if (new TextEncoder().encode(raw).byteLength > MAX_AI_REQUEST_BYTES) {
    throw new RequestBodyError("PAYLOAD_TOO_LARGE");
  }

  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new RequestBodyError("INVALID_REQUEST");
  }
  const result = schema.safeParse(value);
  if (!result.success) throw new RequestBodyError("INVALID_REQUEST");
  return result.data;
}

export function lmStudioErrorResponse(error: unknown): Response {
  if (error instanceof LMStudioError) {
    return Response.json({ error: { code: error.code, message: error.message } }, { status: error.status });
  }
  if (error instanceof RequestBodyError) {
    return Response.json({ error: { code: error.code, message: error.message } }, { status: errorStatus[error.code] });
  }
  return Response.json(
    { error: { code: "LM_STUDIO_UNAVAILABLE", message: errorMessage.LM_STUDIO_UNAVAILABLE } },
    { status: errorStatus.LM_STUDIO_UNAVAILABLE },
  );
}

async function requestLocal(path: "models" | "chat/completions", init?: RequestInit): Promise<Response> {
  const baseUrl = assertLoopbackBaseUrl();
  const target = new URL(path, baseUrl);
  try {
    const response = await fetch(target, {
      ...init,
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) throw new LMStudioError("LM_STUDIO_UNAVAILABLE");
    return response;
  } catch (error) {
    if (error instanceof LMStudioError) throw error;
    throw new LMStudioError("LM_STUDIO_UNAVAILABLE");
  }
}

export async function listLocalModels(): Promise<ModelList> {
  let payload: unknown;
  try {
    const response = await requestLocal("models", { method: "GET" });
    payload = await response.json();
  } catch (error) {
    if (error instanceof LMStudioError) throw error;
    throw new LMStudioError("LM_STUDIO_INVALID_RESPONSE");
  }
  const source = z.object({ data: z.array(z.object({ id: z.string().trim().min(1) }).passthrough()) }).safeParse(payload);
  if (!source.success) throw new LMStudioError("LM_STUDIO_INVALID_RESPONSE");
  return modelListSchema.parse({ models: source.data.data.map(({ id }) => ({ id })) });
}

async function requestAssistantContent(
  modelId: string,
  messages: ReturnType<typeof buildFeedbackMessages>["messages"] | ReturnType<typeof buildTopicMessages>["messages"],
  responseFormat: ReturnType<typeof buildFeedbackMessages>["responseFormat"] | ReturnType<typeof buildTopicMessages>["responseFormat"],
  maxTokens: number,
): Promise<string> {
  let payload: unknown;
  try {
    const response = await requestLocal("chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: modelId,
        messages,
        temperature: 0.1,
        max_tokens: maxTokens,
        stream: false,
        response_format: responseFormat,
      }),
    });
    payload = await response.json();
  } catch (error) {
    if (error instanceof LMStudioError) throw error;
    throw new LMStudioError("LM_STUDIO_INVALID_RESPONSE");
  }

  const parsed = z.object({
    choices: z.array(z.object({ message: z.object({ content: z.string() }).passthrough() }).passthrough()).min(1),
  }).safeParse(payload);
  const content = parsed.success ? parsed.data.choices[0]?.message.content : undefined;
  if (!content) throw new LMStudioError("LM_STUDIO_INVALID_RESPONSE");
  return content;
}

function parseModelJson<T>(content: string, schema: z.ZodType<T>): T {
  try {
    const value: unknown = JSON.parse(content);
    const result = schema.safeParse(value);
    if (result.success) return result.data;
  } catch {
    // The route deliberately exposes only a safe, typed failure.
  }
  throw new LMStudioError("LM_STUDIO_INVALID_RESPONSE");
}

export async function suggestLocalTopics(request: TopicRequest): Promise<TopicSuggestions> {
  const input = topicRequestSchema.parse(request);
  const prompt = buildTopicMessages(input);
  const content = await requestAssistantContent(input.modelId, prompt.messages, prompt.responseFormat, 350);
  const result = parseModelJson(content, topicSuggestionsSchema);
  const allowedIds = new Set(input.allowedTopics.map(({ id }) => id));
  const included = new Set<string>();
  return {
    suggestions: result.suggestions.filter(({ topicId }) => {
      if (!allowedIds.has(topicId) || included.has(topicId)) return false;
      included.add(topicId);
      return true;
    }).slice(0, 3),
  };
}

export async function getLocalFeedback(request: FeedbackRequest): Promise<FeedbackResult> {
  const input = feedbackRequestSchema.parse(request);
  const prompt = buildFeedbackMessages(input);
  const content = await requestAssistantContent(input.modelId, prompt.messages, prompt.responseFormat, 900);
  return parseModelJson(content, feedbackResultSchema);
}
