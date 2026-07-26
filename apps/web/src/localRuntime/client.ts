import {
  evaluationResultSchema,
  type EvaluationResult,
  type Task,
  type TaskExample
} from "@deliberate/shared";
import { z } from "zod";

const STORAGE_PREFIX = "therapy.localRuntimePairingKey";
const GATEWAY_SERVICE_ID = "therapy-local-runtime";
const GATEWAY_PROTOCOL_VERSION = "1";
const REQUEST_TIMEOUT_MS = 120_000;

export class LocalRuntimeRequestError extends Error {
  readonly status: number | null;
  readonly code: "PAIRING_REQUIRED" | "HTTP_ERROR" | "TIMEOUT";

  constructor(
    message: string,
    {
      status = null,
      code = "HTTP_ERROR",
      cause
    }: {
      status?: number | null;
      code?: "PAIRING_REQUIRED" | "HTTP_ERROR" | "TIMEOUT";
      cause?: unknown;
    } = {}
  ) {
    super(message, { cause });
    this.name = "LocalRuntimeRequestError";
    this.status = status;
    this.code = code;
  }
}

export const isLocalRuntimePairingError = (error: unknown) =>
  error instanceof LocalRuntimeRequestError &&
  (error.code === "PAIRING_REQUIRED" || error.status === 401);

const isLoopbackHostname = (hostname: string) =>
  hostname === "127.0.0.1" || hostname === "localhost" || hostname === "[::1]";

export const normalizeLocalRuntimeBaseUrl = (value: string): string => {
  const parsed = new URL(value.trim());
  if (parsed.protocol !== "http:" || !isLoopbackHostname(parsed.hostname)) {
    throw new Error("The local runtime URL must use http://localhost or http://127.0.0.1.");
  }
  if (
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash ||
    (parsed.pathname !== "/" && parsed.pathname !== "")
  ) {
    throw new Error(
      "The local runtime URL cannot contain credentials, a path, a query, or a fragment."
    );
  }
  return parsed.origin;
};

export const resolveLocalRuntimeGatewayOrigin = ({
  baseUrl,
  sttUrl,
  llmUrl
}: {
  baseUrl?: string | null;
  sttUrl?: string | null;
  llmUrl?: string | null;
}): string => {
  const origins = [
    ...(baseUrl?.trim() ? [normalizeLocalRuntimeBaseUrl(baseUrl)] : []),
    ...(sttUrl?.trim() ? [normalizeLocalRuntimeBaseUrl(sttUrl)] : []),
    ...(llmUrl?.trim() ? [normalizeLocalRuntimeBaseUrl(llmUrl)] : [])
  ];
  const uniqueOrigins = [...new Set(origins)];
  if (uniqueOrigins.length === 0) {
    throw new Error("The local runtime URL is missing.");
  }
  if (uniqueOrigins.length > 1) {
    throw new Error(
      "Speech recognition and evaluation must use the same local gateway URL."
    );
  }
  return uniqueOrigins[0];
};

const storageKey = (baseUrl: string) =>
  `${STORAGE_PREFIX}:${normalizeLocalRuntimeBaseUrl(baseUrl)}`;

export const loadLocalRuntimePairingKey = (baseUrl: string): string =>
  window.localStorage.getItem(storageKey(baseUrl)) ?? "";

export const requireLocalRuntimePairingKey = (baseUrl: string): string => {
  const token = loadLocalRuntimePairingKey(baseUrl);
  if (!token) {
    throw new LocalRuntimeRequestError("Pair this browser with the local runtime again.", {
      code: "PAIRING_REQUIRED"
    });
  }
  return token;
};

export const saveLocalRuntimePairingKey = (baseUrl: string, token: string): void => {
  const normalizedToken = token.trim();
  if (normalizedToken.length < 32) {
    throw new Error("The pairing key is incomplete.");
  }
  window.localStorage.setItem(storageKey(baseUrl), normalizedToken);
};

export const removeLocalRuntimePairingKey = (baseUrl: string): void => {
  window.localStorage.removeItem(storageKey(baseUrl));
};

const buildUrl = (baseUrl: string, path: string) =>
  `${normalizeLocalRuntimeBaseUrl(baseUrl)}${path}`;

const readError = async (response: Response) => {
  const text = await response.text();
  if (!text) return `HTTP ${response.status}`;
  try {
    const parsed = JSON.parse(text) as {
      error?: string | { message?: string };
      detail?: string;
      message?: string;
    };
    return (
      (typeof parsed.error === "string" ? parsed.error : parsed.error?.message) ??
      parsed.detail ??
      parsed.message ??
      `HTTP ${response.status}`
    );
  } catch {
    return text.slice(0, 240);
  }
};

export const localRuntimeResponseError = async (response: Response) =>
  new LocalRuntimeRequestError(await readError(response), {
    status: response.status,
    code: response.status === 401 ? "PAIRING_REQUIRED" : "HTTP_ERROR"
  });

const localFetch = async (
  baseUrl: string,
  path: string,
  token: string | null,
  init: RequestInit = {},
  timeoutMs = REQUEST_TIMEOUT_MS
) => {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  const headers = new Headers(init.headers);
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  try {
    return await fetch(buildUrl(baseUrl, path), {
      ...init,
      cache: "no-store",
      headers,
      mode: "cors",
      signal: controller.signal
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new LocalRuntimeRequestError(
        "The local runtime did not respond before the timeout.",
        {
          code: "TIMEOUT",
          cause: error
        }
      );
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
};

export type LocalRuntimeHealth = {
  service: typeof GATEWAY_SERVICE_ID;
  protocol_version: typeof GATEWAY_PROTOCOL_VERSION;
  status: string;
};

export const checkLocalRuntimeHealth = async (
  baseUrl: string
): Promise<LocalRuntimeHealth> => {
  const response = await localFetch(baseUrl, "/health", null, {}, 5_000);
  if (!response.ok) {
    throw await localRuntimeResponseError(response);
  }
  const payload = (await response.json()) as Partial<LocalRuntimeHealth>;
  if (payload.service !== GATEWAY_SERVICE_ID) {
    throw new Error("A different service is using this port.");
  }
  if (payload.protocol_version !== GATEWAY_PROTOCOL_VERSION) {
    throw new Error("This local runtime version is not compatible with the website.");
  }
  if (typeof payload.status !== "string") {
    throw new Error("The local runtime returned an invalid health response.");
  }
  return payload as LocalRuntimeHealth;
};

export const getLocalRuntimeDetails = async (baseUrl: string, token: string) => {
  const response = await localFetch(baseUrl, "/health/details", token, {}, 5_000);
  if (!response.ok) {
    throw await localRuntimeResponseError(response);
  }
  const payload = (await response.json()) as {
    service: typeof GATEWAY_SERVICE_ID;
    protocol_version: typeof GATEWAY_PROTOCOL_VERSION;
    status: string;
    platform_id?: string;
    defaults?: Record<string, string>;
  };
  if (
    payload.service !== GATEWAY_SERVICE_ID ||
    payload.protocol_version !== GATEWAY_PROTOCOL_VERSION ||
    typeof payload.status !== "string"
  ) {
    throw new Error("The local runtime returned incompatible connection details.");
  }
  return payload;
};

export type LocalTranscription = {
  text: string;
  model: string;
  durationMs: number;
};

export const transcribeWithLocalRuntime = async ({
  baseUrl,
  token,
  audio,
  language
}: {
  baseUrl: string;
  token: string;
  audio: Blob;
  language?: string;
}): Promise<LocalTranscription> => {
  const form = new FormData();
  const extension = audio.type.includes("wav")
    ? "wav"
    : audio.type.includes("mp4") || audio.type.includes("aac")
      ? "m4a"
      : audio.type.includes("mpeg")
        ? "mp3"
        : "webm";
  form.append("file", audio, `practice-response.${extension}`);
  form.append("response_format", "json");
  if (language) form.append("language", language);

  const startedAt = performance.now();
  const response = await localFetch(
    baseUrl,
    "/v1/audio/transcriptions",
    token,
    { method: "POST", body: form }
  );
  if (!response.ok) {
    throw await localRuntimeResponseError(response);
  }
  const payload = (await response.json()) as { text?: string; model?: string };
  const text = payload.text?.trim();
  if (!text) {
    throw new Error("The local speech model returned an empty transcript.");
  }
  return {
    text,
    model: payload.model ?? "local-stt",
    durationMs: Math.round(performance.now() - startedAt)
  };
};

const strictJsonSchema = () => {
  const schema = z.toJSONSchema(evaluationResultSchema, {
    target: "draft-07",
    reused: "inline"
  }) as Record<string, unknown>;
  const enforceStrictObjects = (node: unknown): void => {
    if (!node || typeof node !== "object") return;
    const record = node as Record<string, unknown>;
    if (record.type === "object" && record.properties && typeof record.properties === "object") {
      record.additionalProperties = false;
      record.required = Object.keys(record.properties);
      Object.values(record.properties).forEach(enforceStrictObjects);
    }
    if (record.items) enforceStrictObjects(record.items);
    for (const key of ["anyOf", "oneOf", "allOf"]) {
      const items = record[key];
      if (Array.isArray(items)) items.forEach(enforceStrictObjects);
    }
  };
  enforceStrictObjects(schema);
  return schema;
};

const outputText = (payload: unknown): string | null => {
  if (!payload || typeof payload !== "object") return null;
  const record = payload as {
    output_text?: string;
    output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
  };
  if (record.output_text?.trim()) return record.output_text;
  for (const item of record.output ?? []) {
    for (const content of item.content ?? []) {
      if (content.type === "output_text" && content.text?.trim()) return content.text;
    }
  }
  return null;
};

export type LocalEvaluation = {
  evaluation: EvaluationResult;
  model: string;
  durationMs: number;
};

export const evaluateWithLocalRuntime = async ({
  baseUrl,
  token,
  task,
  example,
  attemptId,
  transcript
}: {
  baseUrl: string;
  token: string;
  task: Task;
  example: TaskExample;
  attemptId: string;
  transcript: string;
}): Promise<LocalEvaluation> => {
  const startedAt = performance.now();
  const response = await localFetch(baseUrl, "/v1/responses", token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      instructions:
        "You are an evaluator for psychotherapy deliberate practice tasks. Return strict JSON only matching EvaluationResult. Score every supplied criterion exactly once. Use only the supplied transcript as evidence.",
      input: JSON.stringify({
        task,
        example,
        attempt_id: attemptId,
        transcript: { text: transcript }
      }),
      temperature: 0.2,
      text: {
        format: {
          type: "json_schema",
          name: "EvaluationResult",
          schema: strictJsonSchema(),
          strict: true
        }
      }
    })
  });
  if (!response.ok) {
    throw await localRuntimeResponseError(response);
  }
  const payload = (await response.json()) as { model?: string };
  const raw = outputText(payload);
  if (!raw) {
    throw new Error("The local language model returned an empty evaluation.");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("The local language model returned invalid JSON.");
  }
  const validated = evaluationResultSchema.safeParse(parsed);
  if (!validated.success) {
    throw new Error("The local evaluation did not match the required schema.");
  }
  return {
    evaluation: validated.data,
    model: payload.model ?? "local-llm",
    durationMs: Math.round(performance.now() - startedAt)
  };
};
