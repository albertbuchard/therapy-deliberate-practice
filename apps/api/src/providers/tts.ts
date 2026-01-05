import type { LogFn } from "../utils/logger";
import { OPENAI_TTS_FORMAT, OPENAI_TTS_INSTRUCTIONS, OPENAI_TTS_MODEL } from "./models";
import { BaseTtsProvider } from "./base";
import { synthesizeWithOpenAI } from "./openaiTts";
import { localSuiteHealthCheck, localSuiteSynthesize } from "./localSuite";

export type TtsFormat = "mp3" | "opus" | "aac" | "flac" | "wav" | "pcm";

export type TtsProvider = {
  kind: "local" | "openai";
  model: string;
  voice: string;
  format: TtsFormat;
  healthCheck: () => Promise<boolean>;
  synthesize: (input: { text: string }) => Promise<{ bytes: Uint8Array; contentType: string }>;
};

const formatContentType: Record<TtsFormat, string> = {
  mp3: "audio/mpeg",
  opus: "audio/ogg",
  aac: "audio/aac",
  flac: "audio/flac",
  wav: "audio/wav",
  pcm: "audio/pcm"
};

class LocalTtsProviderImpl extends BaseTtsProvider {
  readonly voice: string;
  readonly format: TtsFormat;

  constructor(
    private baseUrl: string,
    config: { voice: string; format: TtsFormat },
    logger?: LogFn
  ) {
    super("local", "local-suite", logger);
    this.voice = config.voice;
    this.format = config.format;
  }

  healthCheck() {
    return localSuiteHealthCheck(this.baseUrl);
  }

  protected async doSynthesize(input: { text: string }) {
    const result = await localSuiteSynthesize({
      baseUrl: this.baseUrl,
      text: input.text,
      voice: this.voice,
      format: this.format
    });
    const contentType = result.contentType ?? formatContentType[this.format];
    return { value: { bytes: result.bytes, contentType }, log: { bytes: result.bytes.length } };
  }
}

class OpenAITtsProviderImpl extends BaseTtsProvider {
  readonly voice: string;
  readonly format: TtsFormat;
  private readonly instructions?: string;

  constructor(
    private apiKey: string,
    config: { model?: string; voice?: string; format?: TtsFormat; instructions?: string } = {},
    logger?: LogFn
  ) {
    super("openai", config.model ?? OPENAI_TTS_MODEL, logger);
    this.voice = config.voice ?? "marin";
    this.format = config.format ?? OPENAI_TTS_FORMAT;
    this.instructions = config.instructions;
  }

  healthCheck() {
    return Promise.resolve(Boolean(this.apiKey));
  }

  async synthesize(input: { text: string }) {
    return this.runWithTelemetry("tts.synthesize", () => this.doSynthesize(input), {
      startFields: {
        text_length: input.text.length,
        ...(this.instructions ? { instructions_length: this.instructions.length } : {})
      }
    });
  }

  protected async doSynthesize(input: { text: string }) {
    const result = await synthesizeWithOpenAI({
      apiKey: this.apiKey,
      model: this.model ?? OPENAI_TTS_MODEL,
      voice: this.voice,
      format: this.format,
      text: input.text,
      ...(this.instructions ? { instructions: this.instructions } : {})
    });
    return {
      value: { bytes: result.bytes, contentType: result.contentType },
      requestId: result.requestId,
      log: { bytes: result.bytes.length }
    };
  }
}

export const LocalTtsProvider = (
  { baseUrl, voice, format }: { baseUrl: string; voice: string; format: TtsFormat },
  logger?: LogFn
): TtsProvider => new LocalTtsProviderImpl(baseUrl, { voice, format }, logger);

export const OpenAITtsProvider = (
  {
    apiKey,
    model = OPENAI_TTS_MODEL,
    voice = "marin",
    format = OPENAI_TTS_FORMAT,
    instructions
  }: { apiKey: string; model?: string; voice?: string; format?: TtsFormat; instructions?: string },
  logger?: LogFn
): TtsProvider => new OpenAITtsProviderImpl(apiKey, { model, voice, format, instructions }, logger);
