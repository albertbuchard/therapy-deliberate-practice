import type { LlmProvider, SttProvider } from "@deliberate/shared";
import type { ProviderMode, RuntimeEnv } from "../env";
import { LocalMlxLlmProvider, OpenAILlmProvider } from "./llm";
import { LocalWhisperSttProvider, OpenAISttProvider } from "./stt";

export const selectSttProvider = async (
  mode: ProviderMode,
  env: RuntimeEnv,
  openaiApiKey: string
): Promise<SttProvider> => {
  const local = LocalWhisperSttProvider(env);
  const cloud = OpenAISttProvider({ apiKey: openaiApiKey });

  if (mode === "local_only") {
    if (!(await local.healthCheck())) {
      throw new Error("Local STT unavailable");
    }
    return local;
  }

  if (mode === "openai_only") {
    if (!(await cloud.healthCheck())) {
      throw new Error("OpenAI STT unavailable");
    }
    return cloud;
  }

  if (await local.healthCheck()) {
    return local;
  }
  if (await cloud.healthCheck()) {
    return cloud;
  }
  throw new Error("No STT provider available");
};

export const selectLlmProvider = async (
  mode: ProviderMode,
  env: RuntimeEnv,
  openaiApiKey: string
): Promise<LlmProvider> => {
  const local = LocalMlxLlmProvider(env);
  const cloud = OpenAILlmProvider({ apiKey: openaiApiKey });

  if (mode === "local_only") {
    if (!(await local.healthCheck())) {
      throw new Error("Local LLM unavailable");
    }
    return local;
  }

  if (mode === "openai_only") {
    if (!(await cloud.healthCheck())) {
      throw new Error("OpenAI LLM unavailable");
    }
    return cloud;
  }

  if (await local.healthCheck()) {
    return local;
  }
  if (await cloud.healthCheck()) {
    return cloud;
  }
  throw new Error("No LLM provider available");
};
