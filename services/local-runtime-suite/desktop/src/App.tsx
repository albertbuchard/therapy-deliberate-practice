import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { GatewayLaunchButton } from "./components/GatewayLaunchButton";
import { useGatewayBoot } from "./hooks/useGatewayBoot";
import type { GatewayBootState } from "./hooks/useGatewayBoot";

type ModelSummary = {
  id: string;
  metadata: {
    display: { title: string };
    api: { endpoint: string };
    compat?: { platforms?: string[] };
  };
};

type ModelLoadStatus = {
  model_id: string;
  status: "pending" | "loading" | "loaded" | "skipped" | "error";
  started_at: number | null;
  finished_at: number | null;
  duration_ms: number | null;
  error: string | null;
};

type ModelLoadJob = {
  id: string;
  status: "pending" | "running" | "completed" | "failed";
  created_at: number;
  started_at: number | null;
  finished_at: number | null;
  models: ModelLoadStatus[];
};

type ModelLoadView = {
  phase: "idle" | "starting" | "running" | "completed" | "failed" | "timed_out";
  job?: ModelLoadJob;
  error?: string;
};

type GatewayRuntimeState = {
  platform_id: string | null;
  defaults: Record<string, string>;
  loaded_models: string[];
};

type DoctorCheck = {
  title: string;
  status: string;
  details: string;
  fix?: string | null;
};

type SaveState = "idle" | "saving" | "saved" | "error";

type QuickTestStatus = "idle" | "running" | "ok" | "error";

type QuickTestResult = {
  status: QuickTestStatus;
  durationMs?: number;
  preview?: string;
  error?: string;
};

type QuickTestsState = {
  status: QuickTestStatus;
  llm: QuickTestResult;
  stt: QuickTestResult;
  startedAt?: string;
  finishedAt?: string;
};

type GatewayConnectionInfo = {
  port: number;
  base_url: string;
  llm_url: string;
  stt_url: string;
  endpoints: {
    health: string;
    llm_example: string;
    stt_example: string;
  };
};

type GatewayConfig = {
  port: number;
  default_models: Record<string, string>;
  prefer_local: boolean;
};

type PairingToken = {
  token: string;
  masked: string;
};

const initialQuickTestsState: QuickTestsState = {
  status: "idle",
  llm: { status: "idle" },
  stt: { status: "idle" }
};

function makeSilentWavBlob(durationSec = 0.5, sampleRate = 16000): Blob {
  const numSamples = Math.floor(durationSec * sampleRate);
  const bytesPerSample = 2;
  const dataSize = numSamples * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  const writeString = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };

  writeString(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);   // PCM
  view.setUint16(22, 1, true);   // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 1 * bytesPerSample, true); // byteRate
  view.setUint16(32, 1 * bytesPerSample, true); // blockAlign
  view.setUint16(34, 16, true);  // bitsPerSample
  writeString(36, "data");
  view.setUint32(40, dataSize, true);
  // audio data remains zeros (silence)

  return new Blob([buffer], { type: "audio/wav" });
}

const truncatePreview = (value?: string, max = 120) => {
  if (!value) return "";
  if (value.length <= max) return value;
  return `${value.slice(0, max - 3)}...`;
};

const describeQuickTestStatus = (status: QuickTestStatus) => {
  switch (status) {
    case "ok":
      return "OK";
    case "running":
      return "Running";
    case "error":
      return "Error";
    default:
      return "Idle";
  }
};

const describeModelLoadPhase = (phase: ModelLoadView["phase"]) => {
  switch (phase) {
    case "starting":
      return "Starting…";
    case "running":
      return "Downloading / loading";
    case "completed":
      return "Ready";
    case "failed":
      return "Needs attention";
    case "timed_out":
      return "Still not ready";
    default:
      return "Not loaded";
  }
};

const formatModelDuration = (durationMs: number | null) => {
  if (durationMs === null) return "";
  if (durationMs < 1_000) return `${Math.round(durationMs)} ms`;
  return `${(durationMs / 1_000).toFixed(1)} s`;
};

const formatErrorMessage = (error: unknown) => {
  if (error instanceof DOMException && error.name === "AbortError") {
    return "Request timed out.";
  }
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch (stringifyError) {
    console.error("Unable to stringify error", stringifyError);
    return "Unknown error.";
  }
};

export const App = () => {
  const [status, setStatus] = useState("stopped");
  const [models, setModels] = useState<ModelSummary[]>([]);
  const [logs, setLogs] = useState<string[]>([]);
  const [doctorChecks, setDoctorChecks] = useState<DoctorCheck[]>([]);
  const [defaults, setDefaults] = useState({ llm: "", stt: "" });
  const [preferLocal, setPreferLocal] = useState(true);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [startError, setStartError] = useState<string | null>(null);
  const [port, setPort] = useState(8484);
  const [portInput, setPortInput] = useState("8484");
  const [portSaveState, setPortSaveState] = useState<SaveState>("idle");
  const [portSaveError, setPortSaveError] = useState<string | null>(null);
  const [connectionInfo, setConnectionInfo] = useState<GatewayConnectionInfo | null>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [simpleSteps, setSimpleSteps] = useState({
    copiedUrl: false,
    copiedKey: false,
    openedSettings: false
  });
  const [pairing, setPairing] = useState<PairingToken | null>(null);
  const [showPairingKey, setShowPairingKey] = useState(false);
  const [pairingKeyState, setPairingKeyState] = useState<SaveState>("idle");
  const [quickTests, setQuickTests] = useState<QuickTestsState>(initialQuickTestsState);
  const [runtimeState, setRuntimeState] = useState<GatewayRuntimeState | null>(null);
  const [modelLoad, setModelLoad] = useState<ModelLoadView>({ phase: "idle" });
  const [showAdvanced, setShowAdvanced] = useState(false);
  const logBoxRef = useRef<HTMLDivElement | null>(null);
  const advancedDrawerRef = useRef<HTMLElement | null>(null);
  const drawerReturnFocusRef = useRef<HTMLElement | null>(null);
  const bootLogRef = useRef({ readyRunId: 0, errorRunId: 0 });
  const modelLoadRunRef = useRef(0);
  const baseUrl = connectionInfo?.base_url ?? `http://127.0.0.1:${port}`;
  const llmUrl = connectionInfo?.llm_url ?? baseUrl;
  const sttUrl = connectionInfo?.stt_url ?? baseUrl;
  const healthUrl = connectionInfo?.endpoints.health ?? `${baseUrl}/health`;
  const llmExample = connectionInfo?.endpoints.llm_example ?? `${baseUrl}/v1/responses`;
  const sttExample =
    connectionInfo?.endpoints.stt_example ?? `${baseUrl}/v1/audio/transcriptions`;
  const settingsUrl = "https://therapy-deliberate-practice.com/settings";
  const helpUrl = "https://therapy-deliberate-practice.com/help";
  const isMac = /(Mac|iPhone|iPad|iPod)/i.test(navigator.userAgent);

  const logEvent = useCallback((message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs((prev) => [...prev, `[UI ${timestamp}] ${message}`]);
  }, []);

  const refreshStatus = async () => {
    const result = await invoke<{ status: string }>("gateway_status");
    setStatus(result.status);
    return result.status;
  };

  const waitForGatewayReady = async (maxWaitMs = 10 * 60_000) => {
    const deadline = Date.now() + maxWaitMs;
    while (Date.now() < deadline) {
      const nextStatus = await refreshStatus();
      if (nextStatus === "running") return;
      if (nextStatus === "stopped") {
        throw new Error("The gateway process stopped before its health check became ready.");
      }
      await new Promise((resolveDelay) => window.setTimeout(resolveDelay, 1_000));
    }
    throw new Error("Timed out waiting for the gateway health check.");
  };

  const refreshModels = useCallback(async () => {
    logEvent("Refreshing model catalog from gateway.");
    const result = await invoke<{ data: ModelSummary[] }>("gateway_models");
    setModels(result.data ?? []);
  }, [logEvent]);

  const refreshRuntimeState = useCallback(async () => {
    const result = await invoke<GatewayRuntimeState>("gateway_runtime_state");
    setRuntimeState(result);
    if (result.defaults.responses || result.defaults["audio.transcriptions"]) {
      setDefaults((current) => ({
        llm: current.llm || result.defaults.responses || "",
        stt: current.stt || result.defaults["audio.transcriptions"] || ""
      }));
    }
    return result;
  }, []);

  const trackModelLoadJob = async (
    jobId: string,
    initialJob: ModelLoadJob,
    runId: number
  ) => {
    let job = initialJob;
    setModelLoad({ phase: job.status === "pending" ? "starting" : "running", job });
    const deadline = Date.now() + 15 * 60_000;

    while (job.status === "pending" || job.status === "running") {
      if (runId !== modelLoadRunRef.current) return;
      if (Date.now() >= deadline) {
        setModelLoad({
          phase: "timed_out",
          job,
          error:
            "The desktop app stopped waiting after 15 minutes, but the gateway load job is still running. Check its current status instead of starting a duplicate job."
        });
        logEvent("Desktop polling paused after 15 minutes; the gateway load job continues.");
        return;
      }
      await new Promise((resolveDelay) => window.setTimeout(resolveDelay, 1_000));
      job = await invoke<ModelLoadJob>("gateway_model_load_status", {
        payload: { job_id: jobId }
      });
      setModelLoad({ phase: job.status === "completed" ? "completed" : job.status, job });
    }

    await refreshRuntimeState();
    if (job.status === "completed") {
      setModelLoad({ phase: "completed", job });
      setSaveState("saved");
      logEvent("Selected models are downloaded and loaded.");
    } else {
      const failedModels = job.models
        .filter((model) => model.status === "error")
        .map((model) => `${model.model_id}: ${model.error || "load failed"}`)
        .join(" · ");
      setModelLoad({
        phase: "failed",
        job,
        error: failedModels || "One or more selected models could not be loaded."
      });
      logEvent(`Model load failed: ${failedModels || "unknown model error"}`);
    }
    await refreshLogs();
  };

  const loadSelectedModels = async () => {
    const selectedModels = [...new Set([defaults.llm, defaults.stt].filter(Boolean))];
    if (status !== "running") {
      setModelLoad({ phase: "failed", error: "Start the gateway before loading models." });
      return;
    }
    if (!selectedModels.length) {
      setModelLoad({ phase: "failed", error: "Choose an LLM and a speech model first." });
      return;
    }

    const runId = ++modelLoadRunRef.current;
    let activeJob: ModelLoadJob | undefined;
    setModelLoad({ phase: "starting" });
    logEvent(`Starting model load for ${selectedModels.length} selected model(s).`);
    try {
      await invoke("save_gateway_config", {
        payload: {
          port,
          default_models: {
            responses: defaults.llm,
            "audio.transcriptions": defaults.stt
          },
          prefer_local: preferLocal
        }
      });
      const created = await invoke<{ job_id: string; status: ModelLoadJob }>(
        "gateway_load_models",
        { payload: { models: selectedModels } }
      );
      activeJob = created.status;
      await trackModelLoadJob(created.job_id, created.status, runId);
    } catch (error) {
      if (runId !== modelLoadRunRef.current) return;
      const message = formatErrorMessage(error);
      setModelLoad(
        activeJob
          ? {
              phase: "timed_out",
              job: activeJob,
              error: `The status connection was interrupted, but the gateway job may still be running: ${message}`
            }
          : { phase: "failed", error: message }
      );
      logEvent(`Unable to load selected models: ${message}`);
    }
  };

  const resumeModelLoadStatus = async () => {
    const existingJob = modelLoad.job;
    if (!existingJob) return;
    const runId = ++modelLoadRunRef.current;
    setModelLoad({ phase: "running", job: existingJob });
    logEvent(`Checking model-load job ${existingJob.id}.`);
    try {
      const latest = await invoke<ModelLoadJob>("gateway_model_load_status", {
        payload: { job_id: existingJob.id }
      });
      await trackModelLoadJob(existingJob.id, latest, runId);
    } catch (error) {
      if (runId !== modelLoadRunRef.current) return;
      const message = formatErrorMessage(error);
      setModelLoad({
        phase: "timed_out",
        job: existingJob,
        error: `The status connection was interrupted again: ${message}`
      });
      logEvent(`Unable to resume model-load status: ${message}`);
    }
  };

  const refreshLogs = async () => {
    const result = await invoke<{ logs: string[] }>("gateway_logs");
    setLogs((prev) => {
      const gatewayLogs = result.logs ?? [];
      const localLogs = prev.filter((line) => line.startsWith("[UI "));
      return [...localLogs, ...gatewayLogs];
    });
  };

  const refreshConnectionInfo = async () => {
    const result = await invoke<GatewayConnectionInfo>("gateway_connection_info");
    setConnectionInfo(result);
    setPort(result.port);
    setPortInput(String(result.port));
  };

  const refreshPairingToken = useCallback(async () => {
    const result = await invoke<PairingToken>("gateway_pairing_token");
    setPairing(result);
  }, []);

  const refreshConfig = async () => {
    const result = await invoke<GatewayConfig>("gateway_config");
    setPort(result.port);
    setPortInput(String(result.port));
    setPreferLocal(result.prefer_local);
    setDefaults({
      llm: result.default_models.responses ?? "",
      stt: result.default_models["audio.transcriptions"] ?? ""
    });
  };

  const saveConfig = async () => {
    setSaveState("saving");
    try {
      logEvent("Saving preferences to gateway config.");
      await invoke("save_gateway_config", {
        payload: {
          port,
          default_models: {
            responses: defaults.llm,
            "audio.transcriptions": defaults.stt
          },
          prefer_local: preferLocal
        }
      });
      setSaveState("saved");
      await refreshConnectionInfo();
      if (status === "running") {
        await refreshRuntimeState();
      }
      await refreshLogs();
    } catch (error) {
      console.error("Failed to save preferences", error);
      setSaveState("error");
      logEvent("Failed to save preferences.");
    }
  };

  const savePort = async () => {
    const parsed = Number(portInput);
    if (!Number.isInteger(parsed)) return;
    const restartRequired = (status === "running" || status === "starting") && parsed !== port;
    let configSaved = false;
    let previousGatewayStopped = false;
    setPortSaveState("saving");
    setPortSaveError(null);
    try {
      if (restartRequired) {
        logEvent(`Stopping the gateway before changing its port to ${parsed}.`);
        resetBoot();
        modelLoadRunRef.current += 1;
        setModelLoad({ phase: "idle" });
        setRuntimeState(null);
        setQuickTests(initialQuickTestsState);
        await invoke("stop_gateway");
        previousGatewayStopped = true;
        setStatus("stopped");
      }

      logEvent(`Saving gateway port ${parsed}.`);
      await invoke("save_gateway_config", {
        payload: {
          port: parsed,
          default_models: {
            responses: defaults.llm,
            "audio.transcriptions": defaults.stt
          },
          prefer_local: preferLocal
        }
      });
      configSaved = true;
      setPort(parsed);
      if (restartRequired) {
        logEvent(`Starting the gateway on port ${parsed}.`);
        const started = await invoke<{ status: string }>("start_gateway");
        setStatus(started.status);
        await waitForGatewayReady();
      }
      setPortSaveState("saved");
    } catch (error) {
      console.error("Failed to save port", error);
      setPortSaveState("error");
      const details = formatErrorMessage(error);
      let recovery = "";
      if (previousGatewayStopped && !configSaved) {
        try {
          logEvent("Port save failed; restarting the previous gateway configuration.");
          const restored = await invoke<{ status: string }>("start_gateway");
          setStatus(restored.status);
          await waitForGatewayReady();
          recovery = " The previous gateway configuration was restarted.";
        } catch (restartError) {
          recovery = ` The previous gateway also could not be restarted: ${formatErrorMessage(restartError)}`;
        }
      }
      const message =
        configSaved && restartRequired
          ? `Port ${parsed} was saved, but the gateway could not restart: ${details}`
          : `The gateway port was not applied: ${details}${recovery}`;
      setPortSaveError(message);
      logEvent(message);
    } finally {
      await Promise.allSettled([refreshStatus(), refreshConnectionInfo(), refreshLogs()]);
    }
  };

  const runDoctor = useCallback(async () => {
    logEvent("Running preflight doctor checks.");
    const result = await invoke<{ checks: DoctorCheck[] }>("gateway_doctor");
    setDoctorChecks(result.checks ?? []);
    await refreshLogs();
  }, [logEvent]);

  const startGateway = async () => {
    setStartError(null);
    try {
      logEvent("Starting local gateway.");
      const started = await invoke<{ status: string }>("start_gateway");
      setStatus(started.status);
      await waitForGatewayReady();
      await refreshLogs();
    } catch (error) {
      const message =
        typeof error === "string"
          ? error
          : error instanceof Error
            ? error.message
            : JSON.stringify(error);
      setStartError(message);
      logEvent(`Gateway failed to start: ${message}`);
    } finally {
      await Promise.allSettled([refreshStatus(), refreshLogs()]);
    }
  };

  const stopGateway = async () => {
    resetBoot();
    modelLoadRunRef.current += 1;
    await invoke("stop_gateway");
    setRuntimeState(null);
    setModelLoad({ phase: "idle" });
    setQuickTests(initialQuickTestsState);
    await refreshStatus();
    logEvent("Stopped local gateway.");
  };

  const rotatePairingToken = async () => {
    const confirmed = window.confirm(
      "Rotate the pairing key? The Therapy website will disconnect until you paste the new key. The gateway will restart if it is running."
    );
    if (!confirmed) return;
    setPairingKeyState("saving");
    try {
      const result = await invoke<PairingToken>("rotate_gateway_pairing_token");
      setPairing(result);
      setShowPairingKey(false);
      setSimpleSteps((previous) => ({ ...previous, copiedKey: false }));
      await Promise.allSettled([refreshStatus(), refreshLogs()]);
      setPairingKeyState("saved");
      logEvent("Rotated the local pairing key.");
    } catch (error) {
      setPairingKeyState("error");
      logEvent(`Pairing key rotation failed: ${formatErrorMessage(error)}`);
    }
  };

  const copyText = async (value: string) => {
    await navigator.clipboard.writeText(value);
    logEvent("Copied text to clipboard.");
  };

  const fetchWithTimeout = async (url: string, init: RequestInit, timeoutMs = 120_000) => {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timeoutId);
    }
  };

  const runQuickTests = async () => {
    if (status !== "running") {
      const message = "Gateway is not running. Start it before running tests.";
      logEvent(message);
      setQuickTests({
        status: "error",
        llm: { status: "error", error: message },
        stt: { status: "error", error: message },
        finishedAt: new Date().toISOString()
      });
      return;
    }
    const selected = [...new Set([defaults.llm, defaults.stt].filter(Boolean))];
    const loaded = new Set(runtimeState?.loaded_models ?? []);
    if (!selected.length || !selected.every((modelId) => loaded.has(modelId))) {
      const message =
        "The selected models are not loaded yet. Download and load them before running tests.";
      logEvent(message);
      setQuickTests({
        status: "error",
        llm: { status: "error", error: message },
        stt: { status: "error", error: message },
        finishedAt: new Date().toISOString()
      });
      return;
    }
    if (!pairing?.token) {
      const message = "Pairing key is unavailable. Reopen the desktop app and try again.";
      logEvent(message);
      setQuickTests({
        status: "error",
        llm: { status: "error", error: message },
        stt: { status: "error", error: message },
        finishedAt: new Date().toISOString()
      });
      return;
    }

    const startedAt = new Date().toISOString();
    setQuickTests({
      status: "running",
      llm: { status: "running" },
      stt: { status: "idle" },
      startedAt
    });

    logEvent("Running LLM test...");
    const llmStart = performance.now();
    let llmResult: QuickTestResult;
    try {
      const response = await fetchWithTimeout(
        `${baseUrl}/v1/responses`,
        {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${pairing.token}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            input: "Self-test: reply with exactly the single word 'pong'.",
            max_output_tokens: 32,
            temperature: 0
          })
        },
        120_000
      );
      const durationMs = Math.round(performance.now() - llmStart);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data = await response.json();
      const text =
        data?.output?.[0]?.content?.[0]?.text ??
        (typeof data?.output_text === "string" ? data.output_text : undefined);
      if (!text) {
        throw new Error("LLM response missing text.");
      }
      llmResult = { status: "ok", durationMs, preview: text.trim() };
      logEvent(`LLM test ok (${durationMs} ms)`);
    } catch (error) {
      const durationMs = Math.round(performance.now() - llmStart);
      const message = formatErrorMessage(error);
      llmResult = { status: "error", durationMs, error: message };
      logEvent(`LLM test failed: ${message}`);
    }
    setQuickTests((prev) => ({ ...prev, llm: llmResult }));

    logEvent("Running STT test...");
    setQuickTests((prev) => ({ ...prev, stt: { status: "running" } }));
    const sttStart = performance.now();
    let sttResult: QuickTestResult;
    try {
      const formData = new FormData();
      formData.append("file", makeSilentWavBlob(), "selftest.wav");
      formData.append("response_format", "json");
      formData.append("language", "en");
      const response = await fetchWithTimeout(
        `${baseUrl}/v1/audio/transcriptions`,
        {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${pairing.token}`
          },
          body: formData
        },
        120_000
      );
      const durationMs = Math.round(performance.now() - sttStart);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data = await response.json();
      const text = typeof data?.text === "string" ? data.text : undefined;
      if (text === undefined) {
        throw new Error("STT response missing text.");
      }
      sttResult = {
        status: "ok",
        durationMs,
        preview: text.trim() || "Engine responded correctly to silent audio."
      };
      logEvent(`STT test ok (${durationMs} ms)`);
    } catch (error) {
      const durationMs = Math.round(performance.now() - sttStart);
      const message = formatErrorMessage(error);
      sttResult = { status: "error", durationMs, error: message };
      logEvent(`STT test failed: ${message}`);
    }
    setQuickTests((prev) => ({ ...prev, stt: sttResult }));

    const finishedAt = new Date().toISOString();
    const overallStatus =
      llmResult.status === "ok" && sttResult.status === "ok" ? "ok" : "error";
    setQuickTests((prev) => ({
      ...prev,
      status: overallStatus,
      finishedAt
    }));
    await refreshLogs();
  };

  const boot = useGatewayBoot({
    healthUrl,
    onReady: async () => {
      await refreshStatus();
      await refreshConnectionInfo();
      await refreshModels();
      await refreshRuntimeState();
      await refreshLogs();
    }
  });
  const { start: startBoot, cancel: cancelBoot, reset: resetBoot } = boot;

  useEffect(() => {
    if (boot.state.phase === "error" && boot.state.error && bootLogRef.current.errorRunId !== boot.state.runId) {
      bootLogRef.current.errorRunId = boot.state.runId;
      logEvent(`Gateway launch failed: ${boot.state.error}`);
    }
    if (boot.state.phase === "ready" && bootLogRef.current.readyRunId !== boot.state.runId) {
      bootLogRef.current.readyRunId = boot.state.runId;
      logEvent("Gateway health checks passed.");
    }
  }, [boot.state.phase, boot.state.error, boot.state.runId, logEvent]);

  useEffect(() => {
    refreshStatus();
    refreshLogs();
    refreshConnectionInfo();
    refreshConfig();
    refreshPairingToken();
    runDoctor();
  }, [refreshPairingToken, runDoctor]);

  useEffect(() => {
    if (status !== "running") return;
    void Promise.all([refreshModels(), refreshRuntimeState()]).catch((error) => {
      logEvent(`Unable to refresh runtime state: ${formatErrorMessage(error)}`);
    });
  }, [logEvent, refreshModels, refreshRuntimeState, status]);

  useEffect(() => {
    const interval = setInterval(() => {
      refreshLogs();
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (status !== "starting") return;
    const interval = window.setInterval(() => {
      void refreshStatus().catch((error) => {
        logEvent(`Unable to refresh gateway readiness: ${formatErrorMessage(error)}`);
      });
    }, 1_000);
    return () => window.clearInterval(interval);
  }, [logEvent, status]);

  useEffect(() => {
    setSaveState("idle");
  }, [defaults.llm, defaults.stt, preferLocal]);

  useEffect(() => {
    setPortSaveState("idle");
    setPortSaveError(null);
  }, [portInput]);

  useEffect(() => {
    if (!autoScroll) return;
    if (!logBoxRef.current) return;
    logBoxRef.current.scrollTop = logBoxRef.current.scrollHeight;
  }, [logs, autoScroll]);

  useEffect(() => {
    document.body.classList.toggle("drawer-open", showAdvanced);
    return () => {
      document.body.classList.remove("drawer-open");
    };
  }, [showAdvanced]);

  useEffect(() => {
    if (!showAdvanced) return;
    const drawer = advancedDrawerRef.current;
    if (!drawer) return;
    drawer.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setShowAdvanced(false);
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = Array.from(
        drawer.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), select:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'
        )
      ).filter((element) => !element.hasAttribute("hidden"));
      if (!focusable.length) {
        event.preventDefault();
        drawer.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      window.requestAnimationFrame(() => drawerReturnFocusRef.current?.focus());
    };
  }, [showAdvanced]);

  useEffect(
    () => () => {
      modelLoadRunRef.current += 1;
    },
    []
  );

  const runtimePlatformId = runtimeState?.platform_id ?? null;
  const supportsRuntimePlatform = useCallback(
    (model: ModelSummary) =>
      !runtimePlatformId ||
      !model.metadata.compat?.platforms?.length ||
      model.metadata.compat.platforms.includes(runtimePlatformId),
    [runtimePlatformId]
  );
  const llmOptions = useMemo(
    () =>
      models.filter(
        (model) =>
          model.metadata.api.endpoint === "responses" && supportsRuntimePlatform(model)
      ),
    [models, supportsRuntimePlatform]
  );
  const sttOptions = useMemo(
    () =>
      models.filter((model) =>
        ["audio.transcriptions", "audio.translations"].includes(model.metadata.api.endpoint) &&
        supportsRuntimePlatform(model)
      ),
    [models, supportsRuntimePlatform]
  );

  useEffect(() => {
    if (!models.length) return;
    const pickModel = (options: ModelSummary[], currentId: string, preferredId: string) =>
      options.find((model) => model.id === currentId)?.id ??
      options.find((model) => model.id === preferredId)?.id ??
      options[0]?.id ??
      "";
    const nextDefaults = {
      llm: pickModel(
        llmOptions,
        defaults.llm,
        runtimeState?.defaults.responses ??
          (isMac ? "local//llm/qwen3-mlx" : "local//llm/qwen3-hf")
      ),
      stt: pickModel(
        sttOptions,
        defaults.stt,
        runtimeState?.defaults["audio.transcriptions"] ??
          (isMac ? "local//stt/parakeet-mlx" : "local//stt/faster-whisper")
      )
    };
    if (nextDefaults.llm !== defaults.llm || nextDefaults.stt !== defaults.stt) {
      setDefaults(nextDefaults);
      logEvent(
        `Selected compatible defaults for ${runtimePlatformId ?? "the detected platform"}.`
      );
    }
  }, [
    defaults.llm,
    defaults.stt,
    isMac,
    llmOptions,
    logEvent,
    models.length,
    runtimePlatformId,
    runtimeState?.defaults,
    sttOptions
  ]);

  const gatewayReady = status === "running" || boot.state.phase === "ready";
  const heroBootState: GatewayBootState =
    gatewayReady && boot.state.phase !== "ready" ? { ...boot.state, phase: "ready" as const } : boot.state;
  const isGatewayRunning = status === "running";
  const isGatewayActive = status === "running" || status === "starting";
  const portValue = Number(portInput);
  const portValid = Number.isInteger(portValue) && portValue >= 1024 && portValue <= 65535;
  const portDirty = portValue !== port;
  const doctorBlocking = doctorChecks.find(
    (check) => check.status === "error" && ["local_runtime import", "Python executable"].includes(check.title)
  );
  const canStartGateway = !doctorBlocking && !isGatewayActive;
  const canLoadModels = isGatewayRunning;
  const hasModels = models.length > 0;
  const canChooseDefaults = hasModels;
  const defaultsComplete = Boolean(defaults.llm && defaults.stt);
  const selectedModelIds = [...new Set([defaults.llm, defaults.stt].filter(Boolean))];
  const runtimeLoadedModels = new Set(runtimeState?.loaded_models ?? []);
  const selectedModelsLoaded =
    selectedModelIds.length > 0 &&
    selectedModelIds.every((modelId) => runtimeLoadedModels.has(modelId));
  const modelLoadBusy =
    modelLoad.phase === "starting" ||
    modelLoad.phase === "running" ||
    modelLoad.phase === "timed_out";
  const canSave = defaultsComplete && selectedModelsLoaded;
  const isSaved = saveState === "saved";
  const simpleStep1Complete = gatewayReady;
  const simpleStep2Complete = selectedModelsLoaded;
  const simpleStep3Complete = simpleSteps.copiedUrl && simpleSteps.copiedKey;
  const simpleStep4Complete = simpleSteps.openedSettings;
  const simpleActiveStep = !simpleStep1Complete
    ? 1
    : !simpleStep2Complete
      ? 2
      : !simpleStep3Complete
        ? 3
        : 4;
  const moduleNotFound = logs.some((line) =>
    line.includes("ModuleNotFoundError: No module named 'local_runtime'")
  );

  const handleLaunchStart = useCallback(() => {
    if (!canStartGateway) {
      logEvent("Launch blocked until doctor issues are resolved.");
      return;
    }
    logEvent("Launching local gateway via hero CTA.");
    startBoot();
  }, [canStartGateway, logEvent, startBoot]);

  const handleLaunchCancel = useCallback(() => {
    logEvent("Stopping local gateway launch.");
    cancelBoot();
  }, [cancelBoot, logEvent]);

  const handleLaunchReset = useCallback(() => {
    resetBoot();
  }, [resetBoot]);

  const openAdvanced = useCallback(() => {
    logEvent("Opened advanced connection controls.");
    drawerReturnFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setShowAdvanced(true);
  }, [logEvent]);

  const closeAdvanced = useCallback(() => {
    setShowAdvanced(false);
  }, []);

  const handleReadyLaunchClick = useCallback(() => {
    openAdvanced();
  }, [openAdvanced]);

  let activeStep = 1;
  if (isGatewayRunning) activeStep = 2;
  if (hasModels) activeStep = 3;
  if (defaultsComplete) activeStep = 4;
  if (selectedModelsLoaded) activeStep = 5;
  if (isSaved) activeStep = 6;

  const step1Description = doctorBlocking
    ? `Blocked: ${doctorBlocking.details}`
    : "Launch the local gateway so models can be discovered.";

  const steps = [
    {
      id: 1,
      title: "Start the gateway",
      description: step1Description,
      complete: isGatewayRunning
    },
    {
      id: 2,
      title: "Discover available models",
      description: "Read the compatible model catalog from the running gateway.",
      complete: hasModels
    },
    {
      id: 3,
      title: "Choose default LLM + STT",
      description: "Pick the defaults the suite should use for sessions.",
      complete: defaultsComplete
    },
    {
      id: 4,
      title: "Download and load models",
      description: "Prepare the selected local models and show their actual progress.",
      complete: selectedModelsLoaded
    },
    {
      id: 5,
      title: "Save preferences",
      description: "Persist your default selections and routing preference.",
      complete: isSaved
    }
  ];

  if (isSaved) {
    steps.push({
      id: 6,
      title: "Configure Therapy Settings",
      description: "Open the settings page to connect your saved preferences.",
      complete: false
    });
  }

  const loadJobModelIds = new Set(modelLoad.job?.models.map((model) => model.model_id) ?? []);
  const loadJobMatchesSelection =
    selectedModelIds.length === loadJobModelIds.size &&
    selectedModelIds.every((modelId) => loadJobModelIds.has(modelId));
  const effectiveModelLoadPhase: ModelLoadView["phase"] = selectedModelsLoaded
    ? "completed"
    : modelLoad.phase === "completed" && !loadJobMatchesSelection
      ? "idle"
      : modelLoad.phase;
  const modelTitleById = new Map(
    models.map((model) => [model.id, model.metadata.display.title] as const)
  );
  const modelLoadProgress = (
    <div className="model-load-panel" aria-live="polite">
      <div className="model-load-summary">
        <span
          className={`badge ${selectedModelsLoaded ? "badge-success" : ""}`}
        >
          {describeModelLoadPhase(effectiveModelLoadPhase)}
        </span>
        {runtimePlatformId ? (
          <span className="mono">Platform: {runtimePlatformId}</span>
        ) : null}
      </div>
      {loadJobMatchesSelection
        ? modelLoad.job?.models.map((model) => (
        <div className="model-load-row" key={model.model_id}>
          <div>
            <div className="text-sm">
              {modelTitleById.get(model.model_id) ?? model.model_id}
            </div>
            {model.error ? <div className="error-text">{model.error}</div> : null}
          </div>
          <div className="model-load-row-status">
            <span className={`model-status model-status-${model.status}`}>
              {model.status}
            </span>
            {model.duration_ms !== null ? (
              <span className="mono">{formatModelDuration(model.duration_ms)}</span>
            ) : null}
          </div>
        </div>
          ))
        : null}
      {modelLoad.error && (!modelLoad.job || loadJobMatchesSelection) ? (
        <div className="error-text">{modelLoad.error}</div>
      ) : null}
      {effectiveModelLoadPhase === "timed_out" && loadJobMatchesSelection ? (
        <div className="button-row">
          <button
            className="btn"
            onClick={resumeModelLoadStatus}
            disabled={status !== "running"}
          >
            Check current load status
          </button>
        </div>
      ) : null}
      {modelLoadBusy ? (
        <div className="helper-text">
          The first run may download model files. Keep the desktop app open; later starts reuse
          the local cache.
        </div>
      ) : null}
    </div>
  );

  return (
    <div className="app-shell">
      <div
        className={`drawer-scrim ${showAdvanced ? "open" : ""}`}
        onClick={closeAdvanced}
        aria-hidden="true"
      />
      <main
        className={`container simple-content ${showAdvanced ? "blurred" : ""}`}
        aria-hidden={showAdvanced}
        inert={showAdvanced ? true : undefined}
      >
        <div className="panel hero">
        <div className="hero-glow" />
        <div className="hero-header">
          <div>
            <div className="kicker">Local Runtime</div>
            <div className="title">Connect in four guided steps</div>
            <div className="hero-subtitle">
              Compatible models are selected for {runtimePlatformId ?? "your machine"}, with
              download progress and connection details in one place.
            </div>
          </div>
          <div className="hero-actions">
            <span className="badge">Status: {status}</span>
            <button className="btn ghost" onClick={openAdvanced}>
              Advanced controls
            </button>
          </div>
        </div>
        <div className="hero-steps">
          <div className={`simple-step ${simpleStep1Complete ? "complete" : ""} ${simpleActiveStep === 1 ? "active" : ""}`}>
            <div className="simple-step-index">{simpleStep1Complete ? "✓" : "1"}</div>
            <div className="simple-step-content">
              <div className="simple-step-title">Launch local server</div>
              <div className="simple-step-description">
                {doctorBlocking ? doctorBlocking.details : "Start the gateway and let the health checks finish in the background."}
              </div>
              <GatewayLaunchButton
                boot={heroBootState}
                onStart={handleLaunchStart}
                onCancel={handleLaunchCancel}
                onReset={handleLaunchReset}
                disabled={!canStartGateway}
                disabledReason={doctorBlocking ? doctorBlocking.details : undefined}
                onReadyClick={handleReadyLaunchClick}
              />
              {doctorBlocking ? (
                <div className="inline-row">
                  <div className="helper-text">Resolve the doctor issue above and retry.</div>
                  <button className="btn ghost" onClick={runDoctor}>
                    Run doctor
                  </button>
                </div>
              ) : null}
            </div>
          </div>
          <div className={`simple-step ${simpleStep2Complete ? "complete" : ""} ${simpleActiveStep === 2 ? "active" : ""}`}>
            <div className="simple-step-index">{simpleStep2Complete ? "✓" : "2"}</div>
            <div className="simple-step-content">
              <div className="simple-step-title">Prepare your local models</div>
              <div className="simple-step-description">
                Choose one language model and one speech model. The first download can take a few
                minutes; progress remains visible here.
              </div>
              <div className="grid">
                <div>
                  <div className="label">Language model</div>
                  <select
                    className="select"
                    value={defaults.llm}
                    onChange={(event) =>
                      setDefaults((previous) => ({ ...previous, llm: event.target.value }))
                    }
                    disabled={!canChooseDefaults || modelLoadBusy}
                  >
                    <option value="">Select language model</option>
                    {llmOptions.map((model) => (
                      <option key={model.id} value={model.id}>
                        {model.metadata.display.title}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <div className="label">Speech model</div>
                  <select
                    className="select"
                    value={defaults.stt}
                    onChange={(event) =>
                      setDefaults((previous) => ({ ...previous, stt: event.target.value }))
                    }
                    disabled={!canChooseDefaults || modelLoadBusy}
                  >
                    <option value="">Select speech model</option>
                    {sttOptions.map((model) => (
                      <option key={model.id} value={model.id}>
                        {model.metadata.display.title}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="button-row">
                <button
                  className="btn primary"
                  onClick={loadSelectedModels}
                  disabled={!defaultsComplete || modelLoadBusy || !gatewayReady}
                >
                  {modelLoadBusy
                    ? modelLoad.phase === "timed_out"
                      ? "Load continues in gateway"
                      : "Preparing models…"
                    : selectedModelsLoaded
                      ? "Reload selected models"
                      : "Download & load selected models"}
                </button>
                <button
                  className="btn ghost"
                  onClick={refreshModels}
                  disabled={!gatewayReady || modelLoadBusy}
                >
                  Refresh catalog
                </button>
              </div>
              {modelLoadProgress}
            </div>
          </div>
          <div className={`simple-step ${simpleStep3Complete ? "complete" : ""} ${simpleActiveStep === 3 ? "active" : ""}`}>
            <div className="simple-step-index">{simpleStep3Complete ? "✓" : "3"}</div>
            <div className="simple-step-content">
              <div className="simple-step-title">Copy your connection details</div>
              <div className="simple-step-description">
                Therapy Settings needs both values. Your pairing key stays on this computer.
              </div>
              <div className="connection-summary">
                <span className="mono">{baseUrl}</span>
                <span className="mono pairing-value">{pairing?.masked ?? "Creating pairing key…"}</span>
              </div>
              <div className="button-row">
                <button
                  className="btn"
                  onClick={async () => {
                    await copyText(baseUrl);
                    setSimpleSteps((prev) => ({ ...prev, copiedUrl: true }));
                  }}
                  disabled={!selectedModelsLoaded}
                >
                  {simpleSteps.copiedUrl ? "URL copied" : "Copy gateway URL"}
                </button>
                <button
                  className="btn"
                  onClick={async () => {
                    if (!pairing?.token) return;
                    await copyText(pairing.token);
                    setSimpleSteps((prev) => ({ ...prev, copiedKey: true }));
                  }}
                  disabled={!selectedModelsLoaded || !pairing?.token}
                >
                  {simpleSteps.copiedKey ? "Pairing key copied" : "Copy pairing key"}
                </button>
              </div>
            </div>
          </div>
          <div className={`simple-step ${simpleStep4Complete ? "complete" : ""} ${simpleActiveStep === 4 ? "active" : ""}`}>
            <div className="simple-step-index">{simpleStep4Complete ? "✓" : "4"}</div>
            <div className="simple-step-content">
              <div className="simple-step-title">Open Therapy Settings</div>
              <div className="simple-step-description">
                Paste the local URL and pairing key into their labeled fields, then test the connection.
              </div>
              <div className="button-row">
                <button
                  className="btn primary"
                  onClick={async () => {
                    await openUrl(settingsUrl);
                    setSimpleSteps((prev) => ({ ...prev, openedSettings: true }));
                    logEvent("Opened Therapy settings.");
                  }}
                  disabled={!simpleStep3Complete}
                  title={!simpleStep3Complete ? "Copy both connection values first." : undefined}
                >
                  {simpleStep4Complete ? "Settings opened" : "Next: Open Settings"}
                </button>
                <button
                  className="btn ghost"
                  onClick={async () => {
                    await openUrl(helpUrl);
                    logEvent("Opened help center.");
                  }}
                >
                  Help
                </button>
              </div>
            </div>
          </div>
        </div>
        </div>
      </main>

      <aside
        ref={advancedDrawerRef}
        className={`advanced-drawer ${showAdvanced ? "open" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="advanced-drawer-title"
        aria-hidden={!showAdvanced}
        inert={!showAdvanced ? true : undefined}
        tabIndex={-1}
      >
        <div className="drawer-header">
          <div>
            <div className="kicker">Advanced</div>
            <div className="title" id="advanced-drawer-title">Local Runtime controls</div>
          </div>
          <div className="hero-actions">
            <span className="badge">Status: {status}</span>
            <button className="btn ghost" onClick={closeAdvanced}>
              Close
            </button>
          </div>
        </div>
        <div className="drawer-body">
          <div className="panel header">
            <div>
              <div className="kicker">Local Runtime Suite</div>
              <div className="title">Desktop Launcher</div>
            </div>
            <span className="badge">Status: {status}</span>
          </div>

          <div className="panel connection">
            <div className="header">
              <div>
                <div className="kicker">Connection</div>
                <div className="title">Local gateway URLs</div>
              </div>
              <span className="badge">Port {port}</span>
            </div>
            <div className="connection-grid">
              <div className="connection-row">
                <div className="label">Base URL</div>
                <div className="pill-row">
                  <div className="pill" title={baseUrl}>{baseUrl}</div>
                  <button className="icon-btn" onClick={() => copyText(baseUrl)}>
                    Copy
                  </button>
                </div>
              </div>
              <div className="connection-row">
                <div className="label">LLM URL</div>
                <div className="pill-row">
                  <div className="pill" title={llmUrl}>{llmUrl}</div>
                  <button className="icon-btn" onClick={() => copyText(llmUrl)}>
                    Copy
                  </button>
                </div>
              </div>
              <div className="connection-row">
                <div className="label">STT URL</div>
                <div className="pill-row">
                  <div className="pill" title={sttUrl}>{sttUrl}</div>
                  <button className="icon-btn" onClick={() => copyText(sttUrl)}>
                    Copy
                  </button>
                </div>
              </div>
              <div className="connection-row">
                <div className="label">Pairing key</div>
                <div className="pill-row">
                  <div
                    className="pill pairing-value"
                    title={showPairingKey ? pairing?.token : pairing?.masked}
                  >
                    {showPairingKey
                      ? pairing?.token ?? "Creating pairing key…"
                      : pairing?.masked ?? "Creating pairing key…"}
                  </div>
                  <button
                    className="icon-btn"
                    onClick={() => setShowPairingKey((visible) => !visible)}
                    aria-pressed={showPairingKey}
                    disabled={!pairing}
                  >
                    {showPairingKey ? "Hide" : "Reveal"}
                  </button>
                  <button
                    className="icon-btn"
                    onClick={() => pairing?.token && copyText(pairing.token)}
                    disabled={!pairing?.token}
                  >
                    Copy
                  </button>
                </div>
                <div className="helper-text">
                  Keep this key private. It authorizes browser requests to models on this computer.
                </div>
                <div className="button-row">
                  <button
                    className="btn ghost"
                    onClick={rotatePairingToken}
                    disabled={pairingKeyState === "saving"}
                  >
                    {pairingKeyState === "saving" ? "Rotating…" : "Rotate pairing key"}
                  </button>
                  {pairingKeyState === "saved" ? (
                    <span className="success-text">New key created. Update Therapy Settings.</span>
                  ) : null}
                  {pairingKeyState === "error" ? (
                    <span className="error-text">Could not rotate the key.</span>
                  ) : null}
                </div>
              </div>
            </div>
            <div className="helper-row">
              <div>
                <div className="helper-title">Where do I paste these?</div>
                <div className="helper-text">
                  Open Therapy Settings and paste the Base URL and pairing key.
                </div>
              </div>
              <button className="btn" onClick={() => openUrl(settingsUrl)}>
                Open Therapy Settings
              </button>
            </div>
            <div className="button-row">
              <button className="btn" onClick={() => openUrl(healthUrl)}>
                Open health check
              </button>
              <button
                className="btn"
                onClick={runQuickTests}
                disabled={
                  quickTests.status === "running" ||
                  status !== "running" ||
                  !selectedModelsLoaded
                }
                title={
                  !selectedModelsLoaded
                    ? "Download and load the selected models first."
                    : undefined
                }
              >
                {quickTests.status === "running"
                  ? "Running tests..."
                  : "Run LLM + speech test"}
              </button>
              <button className="btn" onClick={() => copyText(llmExample)}>
                Copy example LLM endpoint
              </button>
              <button className="btn" onClick={() => copyText(sttExample)}>
                Copy example STT endpoint
              </button>
            </div>
            <div className="quick-test-results">
              <div className="helper-title">Quick test results</div>
              <div className="quick-test-row">
                <div className="quick-test-row-header">
                  <span className="text-sm">LLM</span>
                  <span className={`badge ${quickTests.llm.status === "ok" ? "badge-success" : ""}`}>
                    {describeQuickTestStatus(quickTests.llm.status)}
                  </span>
                  {typeof quickTests.llm.durationMs === "number" ? (
                    <span className="mono">{quickTests.llm.durationMs} ms</span>
                  ) : null}
                </div>
                {quickTests.llm.preview ? (
                  <div className="helper-text">Preview: {truncatePreview(quickTests.llm.preview)}</div>
                ) : null}
                {quickTests.llm.error ? <div className="error-text">{quickTests.llm.error}</div> : null}
              </div>
              <div className="quick-test-row">
                <div className="quick-test-row-header">
                  <span className="text-sm">STT</span>
                  <span className={`badge ${quickTests.stt.status === "ok" ? "badge-success" : ""}`}>
                    {describeQuickTestStatus(quickTests.stt.status)}
                  </span>
                  {typeof quickTests.stt.durationMs === "number" ? (
                    <span className="mono">{quickTests.stt.durationMs} ms</span>
                  ) : null}
                </div>
                {quickTests.stt.preview ? (
                  <div className="helper-text">Preview: {truncatePreview(quickTests.stt.preview)}</div>
                ) : null}
                {quickTests.stt.error ? <div className="error-text">{quickTests.stt.error}</div> : null}
              </div>
              {quickTests.status === "idle" ? (
                <div className="helper-text">Results appear after running the test.</div>
              ) : null}
            </div>
            <div className="port-editor">
              <div>
                <div className="label">Gateway port</div>
                <input
                  className="port-input"
                  type="number"
                  min={1024}
                  max={65535}
                  value={portInput}
                  onChange={(event) => setPortInput(event.target.value)}
                />
                <div className="helper-text">
                  Choose a port between 1024-65535. This updates the gateway + URLs above.
                </div>
                {!portValid ? (
                  <div className="error-text">Enter a valid port between 1024 and 65535.</div>
                ) : null}
              </div>
              <div className="button-row">
                <button
                  className="btn primary"
                  onClick={savePort}
                  disabled={!portValid || portSaveState === "saving"}
                >
                  {portSaveState === "saving" ? "Saving..." : "Save port"}
                </button>
                <button className="btn" onClick={() => setPortInput("8484")}>
                  Use 8484
                </button>
                {portSaveState === "error" ? (
                  <span className="error-text">{portSaveError ?? "Port save failed. Try again."}</span>
                ) : null}
                {portSaveState === "saved" ? (
                  <span className="success-text">Port saved.</span>
                ) : null}
              </div>
            </div>
            {portDirty && isGatewayActive ? (
              <div className="warning-banner">
                <div>
                  Saving this change will restart the gateway automatically on the new port.
                </div>
              </div>
            ) : null}
          </div>

          <div className="panel wizard">
            <div className="header">
              <div>
                <div className="kicker">Setup Wizard</div>
                <div className="title">Get ready in minutes</div>
              </div>
              <span className="badge">Step {activeStep} of {isSaved ? 6 : 5}</span>
            </div>

            <ol className="stepper">
              {steps.map((step) => (
                <li
                  key={step.id}
                  className={`step ${step.complete ? "complete" : ""} ${activeStep === step.id ? "active" : ""}`}
                >
                  <div className="step-index">{step.id}</div>
                  <div>
                    <div className="step-title">{step.title}</div>
                    <div className="step-description">{step.description}</div>
                  </div>
                </li>
              ))}
            </ol>

            <div className="step-card">
              <div className="step-card-header">
                <div>
                  <div className="label">Step 1</div>
                  <div className="step-title">Start the gateway</div>
                </div>
                <span className={`badge ${isGatewayRunning ? "badge-success" : ""}`}>
                  {isGatewayRunning
                    ? "Gateway ready"
                    : isGatewayActive
                      ? "Gateway starting"
                      : "Gateway stopped"}
                </span>
              </div>
              <p className="step-description">
                Launch the local gateway before loading models. You can stop it anytime.
              </p>
              {doctorBlocking ? (
                <div className="warning-banner">
                  <div>
                    {doctorBlocking.title}: {doctorBlocking.details}
                  </div>
                  {doctorBlocking.fix ? <div className="helper-text">Fix: {doctorBlocking.fix}</div> : null}
                  <button className="btn" onClick={runDoctor}>
                    Run doctor
                  </button>
                </div>
              ) : null}
              <div className="button-row">
                <button className="btn primary" onClick={startGateway} disabled={!canStartGateway}>
                  Start gateway
                </button>
                <button className="btn" onClick={stopGateway} disabled={!isGatewayActive}>
                  Stop gateway
                </button>
                <button className="btn" onClick={runDoctor}>
                  Run doctor
                </button>
              </div>
              {startError ? (
                <div className="error-banner">
                  <div>Gateway failed to start.</div>
                  <div className="helper-text">{startError}</div>
                </div>
              ) : null}
            </div>

            <div className={`step-card ${canLoadModels ? "" : "is-disabled"}`}>
              <div className="step-card-header">
                <div>
                  <div className="label">Step 2</div>
                  <div className="step-title">Discover compatible models</div>
                </div>
                <span className="badge">
                  {hasModels ? `${llmOptions.length + sttOptions.length} models available` : "No catalog yet"}
                </span>
              </div>
              <p className="step-description">
                Read the catalog and hide models that cannot run on{" "}
                {runtimePlatformId ?? "this platform"}.
              </p>
              <button className="btn" onClick={refreshModels} disabled={!canLoadModels}>
                Refresh models
              </button>
            </div>

            <div className={`step-card ${canChooseDefaults ? "" : "is-disabled"}`}>
              <div className="step-card-header">
                <div>
                  <div className="label">Step 3</div>
                  <div className="step-title">Choose defaults</div>
                </div>
                <span className="badge">{defaultsComplete ? "Defaults selected" : "Waiting on selections"}</span>
              </div>
              <p className="step-description">
                Select your preferred LLM and STT models to use in sessions.
              </p>
              <div className="grid">
                <div>
                  <div className="label">Default LLM</div>
                  <select
                    className="select"
                    value={defaults.llm}
                    onChange={(event) => setDefaults((prev) => ({ ...prev, llm: event.target.value }))}
                    disabled={!canChooseDefaults}
                  >
                    <option value="">Select LLM</option>
                    {llmOptions.map((model) => (
                      <option key={model.id} value={model.id}>
                        {model.metadata.display.title}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <div className="label">Default STT</div>
                  <select
                    className="select"
                    value={defaults.stt}
                    onChange={(event) => setDefaults((prev) => ({ ...prev, stt: event.target.value }))}
                    disabled={!canChooseDefaults}
                  >
                    <option value="">Select STT</option>
                    {sttOptions.map((model) => (
                      <option key={model.id} value={model.id}>
                        {model.metadata.display.title}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <div className={`step-card ${defaultsComplete ? "" : "is-disabled"}`}>
              <div className="step-card-header">
                <div>
                  <div className="label">Step 4</div>
                  <div className="step-title">Download and load selected models</div>
                </div>
                <span className={`badge ${selectedModelsLoaded ? "badge-success" : ""}`}>
                  {describeModelLoadPhase(effectiveModelLoadPhase)}
                </span>
              </div>
              <p className="step-description">
                Prepare both engines before connecting the Therapy website. Downloads are cached
                locally, and a failed engine is reported separately.
              </p>
              <div className="button-row">
                <button
                  className="btn primary"
                  onClick={loadSelectedModels}
                  disabled={!defaultsComplete || modelLoadBusy || !isGatewayRunning}
                >
                  {modelLoadBusy
                    ? modelLoad.phase === "timed_out"
                      ? "Load continues in gateway"
                      : "Preparing models…"
                    : selectedModelsLoaded
                      ? "Reload selected models"
                      : "Download & load selected models"}
                </button>
                <button
                  className="btn"
                  onClick={refreshRuntimeState}
                  disabled={!isGatewayRunning || modelLoadBusy}
                >
                  Refresh readiness
                </button>
              </div>
              {modelLoadProgress}
            </div>

            <div className={`step-card ${canSave ? "" : "is-disabled"}`}>
              <div className="step-card-header">
                <div>
                  <div className="label">Step 5</div>
                  <div className="step-title">Save preferences</div>
                </div>
                <span className={`badge ${isSaved ? "badge-success" : ""}`}>
                  {isSaved ? "Preferences saved" : "Not saved"}
                </span>
              </div>
              <p className="step-description">
                Save your defaults so the gateway uses them whenever it starts.
              </p>
              <div className="inline-row">
                <input
                  id="prefer-local"
                  type="checkbox"
                  checked={preferLocal}
                  onChange={(event) => setPreferLocal(event.target.checked)}
                  disabled={!canSave}
                />
                <label htmlFor="prefer-local" className="text-sm">
                  Prefer local models over proxy providers
                </label>
              </div>
              <div className="button-row">
                <button className="btn primary" onClick={saveConfig} disabled={!canSave || saveState === "saving"}>
                  {saveState === "saving" ? "Saving..." : "Save preferences"}
                </button>
                {saveState === "error" ? <span className="error-text">Save failed. Try again.</span> : null}
              </div>
              {isSaved ? (
                <div className="success-panel">
                  <span className="badge badge-success">Saved</span>
                  <span>Your preferences are ready. Continue to Therapy Settings.</span>
                </div>
              ) : null}
            </div>

            {isSaved ? (
              <div className="step-card">
                <div className="step-card-header">
                  <div>
                    <div className="label">Step 6</div>
                    <div className="step-title">Next: Configure in Therapy Settings</div>
                  </div>
                  <span className="badge">Ready</span>
                </div>
                <p className="step-description">
                  Finish setup by linking these preferences in the Therapy web app.
                </p>
                <div className="button-row">
                  <button className="btn primary" onClick={() => openUrl(settingsUrl)}>
                    Open Therapy Settings
                  </button>
                  <button className="btn" onClick={() => navigator.clipboard.writeText(settingsUrl)}>
                    Copy Settings Link
                  </button>
                </div>
              </div>
            ) : null}
          </div>

          <div className="panel">
            <div className="header">
              <div>
                <div className="kicker">Logs</div>
                <div className="title">Gateway output</div>
              </div>
              <div className="button-row">
                <button className="btn" onClick={refreshLogs}>
                  Refresh logs
                </button>
                <button className="btn" onClick={() => copyText(logs.join("\n"))} disabled={!logs.length}>
                  Copy logs
                </button>
                <button className="btn" onClick={() => setLogs([])} disabled={!logs.length}>
                  Clear logs
                </button>
                <button className="btn" onClick={() => setAutoScroll((value) => !value)}>
                  Auto-scroll: {autoScroll ? "On" : "Off"}
                </button>
              </div>
            </div>
            {moduleNotFound ? (
              <div className="error-banner">
                <div>
                  The gateway could not import <strong>local_runtime</strong>. The Python package is
                  missing from the expected path.
                </div>
                <div className="button-row">
                  <button className="btn" onClick={runDoctor}>
                    Run doctor
                  </button>
                  <button
                    className="btn"
                    onClick={() =>
                      copyText(
                        "Fix steps:\\n1) Set LOCAL_RUNTIME_ROOT to the local_runtime python package root.\\n2) Or bundle resources/local_runtime in the Tauri build.\\n3) Restart the gateway."
                      )
                    }
                  >
                    Copy fix steps
                  </button>
                </div>
              </div>
            ) : null}
            <div className="log-box" ref={logBoxRef}>
              {logs.length ? logs.join("\n") : "No logs yet."}
            </div>
          </div>

          <div className="panel">
            <div className="header">
              <div>
                <div className="kicker">Doctor</div>
                <div className="title">Preflight checks</div>
              </div>
              <button className="btn" onClick={runDoctor}>
                Run doctor
              </button>
            </div>
            <div className="grid">
              {doctorChecks.map((check) => (
                <div key={check.title} className="panel">
                  <div className="label">{check.title}</div>
                  <div>{check.details}</div>
                  {check.fix ? <p>Fix: {check.fix}</p> : null}
                </div>
              ))}
            </div>
          </div>

        </div>
      </aside>
    </div>
  );
};
