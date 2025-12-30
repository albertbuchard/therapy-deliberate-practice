import type { SttProvider } from "@deliberate/shared";
import type { RuntimeEnv } from "../env";

const healthCheck = async (url: string) => {
  try {
    const response = await fetch(`${url}/health`);
    return response.ok;
  } catch {
    return false;
  }
};

export const LocalWhisperSttProvider = (runtimeEnv: RuntimeEnv): SttProvider => ({
  kind: "local",
  model: "whisper-large-v3",
  healthCheck: () => healthCheck(runtimeEnv.localSttUrl),
  transcribe: async (audio) => {
    const response = await fetch(`${runtimeEnv.localSttUrl}/transcribe`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ audio })
    });
    if (!response.ok) {
      throw new Error("Local STT failed");
    }
    return response.json();
  }
});

const decodeBase64ToBytes = (base64: string) => {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
};

export const OpenAISttProvider = (runtimeEnv: RuntimeEnv): SttProvider => ({
  kind: "openai",
  model: "whisper-1",
  healthCheck: async () => Boolean(runtimeEnv.openaiApiKey),
  transcribe: async (audio) => {
    if (!runtimeEnv.openaiApiKey) {
      throw new Error("OpenAI key missing");
    }
    const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${runtimeEnv.openaiApiKey}`
      },
      body: (() => {
        const form = new FormData();
        form.append("model", "whisper-1");
        form.append("file", new Blob([decodeBase64ToBytes(audio)]), "audio.webm");
        return form;
      })()
    });
    if (!response.ok) {
      throw new Error("OpenAI STT failed");
    }
    const data = (await response.json()) as { text: string };
    return { text: data.text };
  }
});
