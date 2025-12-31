import type {
  LlmProvider,
  EvaluationInput,
  EvaluationResult,
  LlmParseResult
} from "@deliberate/shared";
import type { RuntimeEnv } from "../env";
import type { LogFn } from "../utils/logger";
import { safeTruncate } from "../utils/logger";
import { evaluationResultSchema, llmParseSchema } from "@deliberate/shared";
import { createStructuredResponse } from "./openaiResponses";
import { OPENAI_LLM_MODEL } from "./models";

const healthCheck = async (url: string) => {
  try {
    const response = await fetch(`${url}/health`);
    return response.ok;
  } catch {
    return false;
  }
};

export const LocalMlxLlmProvider = (env: RuntimeEnv, logger?: LogFn): LlmProvider => ({
  kind: "local",
  model: env.localLlmModel,
  healthCheck: () => healthCheck(env.localLlmUrl),
  evaluateDeliberatePractice: async (input) => {
    const start = Date.now();
    logger?.("info", "llm.evaluate.http_start", {
      provider: { kind: "local", model: env.localLlmModel }
    });
    const response = await fetch(`${env.localLlmUrl}/evaluate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input)
    });
    if (!response.ok) {
      const body = safeTruncate(await response.text(), 200);
      logger?.("error", "llm.evaluate.http_error", {
        provider: { kind: "local", model: env.localLlmModel },
        duration_ms: Date.now() - start,
        status: response.status,
        body
      });
      throw new Error(`Local LLM failed (${response.status})`);
    }
    logger?.("info", "llm.evaluate.http_ok", {
      provider: { kind: "local", model: env.localLlmModel },
      duration_ms: Date.now() - start
    });
    return response.json();
  },
  parseExercise: async () => {
    throw new Error("Local LLM does not support exercise parsing.");
  }
});

export const OpenAILlmProvider = (
  { apiKey }: { apiKey: string },
  logger?: LogFn
): LlmProvider => ({
  kind: "openai",
  model: OPENAI_LLM_MODEL,
  healthCheck: async () => Boolean(apiKey),
  evaluateDeliberatePractice: async (input: EvaluationInput) => {
    if (!apiKey) {
      throw new Error("OpenAI key missing");
    }
    const start = Date.now();
    logger?.("info", "llm.evaluate.http_start", {
      provider: { kind: "openai", model: OPENAI_LLM_MODEL }
    });
    const systemPrompt =
      "You are an evaluator for psychotherapy deliberate practice. Return strict JSON only that matches EvaluationResult.";
    try {
      const result = await createStructuredResponse<EvaluationResult>({
        apiKey,
        model: OPENAI_LLM_MODEL,
        temperature: 0.2,
        instructions: systemPrompt,
        input: JSON.stringify(input),
        schemaName: "EvaluationResult",
        schema: evaluationResultSchema
      });
      logger?.("info", "llm.evaluate.http_ok", {
        provider: { kind: "openai", model: OPENAI_LLM_MODEL },
        duration_ms: Date.now() - start,
        response_id: result.responseId
      });
      return result.value;
    } catch (error) {
      logger?.("error", "llm.evaluate.http_error", {
        provider: { kind: "openai", model: OPENAI_LLM_MODEL },
        duration_ms: Date.now() - start,
        error: safeTruncate(String(error), 200)
      });
      throw error;
    }
  },
  parseExercise: async (input): Promise<LlmParseResult> => {
    if (!apiKey) {
      throw new Error("OpenAI key missing");
    }
    const start = Date.now();
    logger?.("info", "llm.parse.http_start", {
      provider: { kind: "openai", model: OPENAI_LLM_MODEL }
    });
    const systemPrompt = `You are a meticulous content-to-JSON extractor for a psychotherapy deliberate-practice platform.
Your ONLY job is to transform the provided free text into a single JSON object that matches the schema.
Return STRICT JSON ONLY. No markdown. No commentary. No trailing commas. No extra keys.

Hard rules:
- Preserve meaning; you may rewrite for clarity but do not invent facts not present in the text.
- If a field is not present, use null (not empty string) or [] for arrays.
- Every item that can be graded MUST be represented as a criterion/objective with an explicit rubric.
- All example dialogues MUST be represented as structured interactions with criterion references.
- All client statements MUST be captured and tagged with: difficulty_label, affect_tag, and extracted patient cues.
- Patient cues MUST be a separate list (“patient_cues”) and each cue MUST have a difficulty rating.
- Create stable ids:
  - criterion ids: "c1", "c2", ...
  - objective ids: "o1", "o2", ... (usually 1:1 with criteria)
  - example dialogue ids: "ex1", "ex2", ...
  - client statement ids: "b1".."bN", "i1".."iN", "a1".."aN" (beginner/intermediate/advanced)
  - cue ids: "cue1", "cue2", ...
- Normalize difficulty_label to one of: "beginner", "intermediate", "advanced".
- Map difficulty_label to difficulty_numeric (1..5) as:
  - beginner → 2
  - intermediate → 3
  - advanced → 4
  (Use 1 or 5 ONLY if the text explicitly suggests easier/harder than the named level.)

Rubric requirements (for each objective):
- score_min must be 0, score_max must be 4
- provide anchors for 0, 2, 4 at minimum (you may add 1 and 3 if helpful)
- anchors must describe observable therapist behavior in the response (not internal states)

What “patient cues” means here:
- Short, concrete signals embedded in the client text that guide the therapist response:
  examples: hesitancy, shame, defensiveness, self-doubt, testing the therapist, anger, fear, pride, relief,
  relational dynamics, boundary setting, self-advocacy, vulnerability, critic-mode language, etc.
- Each cue must include:
  - label (short)
  - evidence (a short quote fragment from the client statement)
  - why_it_matters (1 sentence)
  - therapist_response_hint (1 sentence)
  - difficulty (1..5) and difficulty_reason (1 sentence)`;
    try {
      const result = await createStructuredResponse<LlmParseResult>({
        apiKey,
        model: OPENAI_LLM_MODEL,
        temperature: 0.2,
        instructions: systemPrompt,
        input: input.sourceText,
        schemaName: "DeliberatePracticeTask",
        schema: llmParseSchema
      });
      logger?.("info", "llm.parse.http_ok", {
        provider: { kind: "openai", model: OPENAI_LLM_MODEL },
        duration_ms: Date.now() - start,
        response_id: result.responseId
      });
      return result.value;
    } catch (error) {
      logger?.("error", "llm.parse.http_error", {
        provider: { kind: "openai", model: OPENAI_LLM_MODEL },
        duration_ms: Date.now() - start,
        error: safeTruncate(String(error), 200)
      });
      throw error;
    }
  }
});
