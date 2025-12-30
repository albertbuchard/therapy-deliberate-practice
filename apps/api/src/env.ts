export type RuntimeEnvBindings = {
  AI_MODE?: string;
  OPENAI_API_KEY?: string;
  LOCAL_STT_URL?: string;
  LOCAL_LLM_URL?: string;
  LOCAL_LLM_MODEL?: string;
};

export const getRuntimeEnv = (bindings?: RuntimeEnvBindings) => {
  const processEnv = typeof process !== "undefined" ? process.env : undefined;
  return {
    aiMode: bindings?.AI_MODE ?? processEnv?.AI_MODE ?? "local_prefer",
    openaiApiKey: bindings?.OPENAI_API_KEY ?? processEnv?.OPENAI_API_KEY ?? "",
    localSttUrl: bindings?.LOCAL_STT_URL ?? processEnv?.LOCAL_STT_URL ?? "http://localhost:7001",
    localLlmUrl: bindings?.LOCAL_LLM_URL ?? processEnv?.LOCAL_LLM_URL ?? "http://localhost:7002",
    localLlmModel:
      bindings?.LOCAL_LLM_MODEL ?? processEnv?.LOCAL_LLM_MODEL ?? "mlx-community/Mistral-7B-Instruct-v0.2"
  };
};

export type RuntimeEnv = ReturnType<typeof getRuntimeEnv>;
