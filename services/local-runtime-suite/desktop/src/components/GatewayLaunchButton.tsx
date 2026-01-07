import { useEffect, useMemo, useState } from "react";
import type { GatewayBootState } from "../hooks/useGatewayBoot";

type Props = {
  boot: GatewayBootState;
  progress: number;
  elapsedMs: number;
  maxWaitMs: number;
  onStart: () => void;
  onCancel: () => void;
  onReset: () => void;
  disabled?: boolean;
  disabledReason?: string;
  onReadyClick?: () => void;
};

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function formatDuration(ms: number) {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function CheckIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <path d="M7.75 13.5 4.5 10.25l1.25-1.25 2 2 6-6 1.25 1.25-7 7Z" fill="currentColor" />
    </svg>
  );
}

function Spinner() {
  return (
    <svg className="launch-spinner" width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <circle className="launch-spinner-track" cx="12" cy="12" r="9" />
      <path className="launch-spinner-head" d="M21 12a9 9 0 0 0-9-9" />
    </svg>
  );
}

function ProgressRing({ value }: { value: number }) {
  const normalized = clamp01(value);
  const radius = 9;
  const circumference = 2 * Math.PI * radius;
  const dash = circumference * normalized;
  const gap = circumference - dash;

  return (
    <svg className="launch-ring" width={22} height={22} viewBox="0 0 22 22" aria-hidden="true">
      <circle className="launch-ring-track" cx="11" cy="11" r={radius} />
      <circle
        className="launch-ring-fill"
        cx="11"
        cy="11"
        r={radius}
        strokeDasharray={`${dash} ${gap}`}
      />
    </svg>
  );
}

export function GatewayLaunchButton({
  boot,
  progress,
  elapsedMs,
  maxWaitMs,
  onStart,
  onCancel,
  onReset,
  disabled,
  disabledReason,
  onReadyClick
}: Props) {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (boot.phase !== "booting" && boot.phase !== "polling") return;
    const id = window.setInterval(() => setTick((value) => value + 1), 250);
    return () => window.clearInterval(id);
  }, [boot.phase]);

  const elapsed = boot.startedAtMs ? Math.max(0, Date.now() - boot.startedAtMs) : elapsedMs;
  const pct = clamp01(progress);
  const isBusy = boot.phase === "booting" || boot.phase === "polling";
  const isReady = boot.phase === "ready";
  const isDisabled = Boolean(disabled) && !isBusy && !isReady;

  const messages = useMemo(
    () => [
      "Starting the gateway…",
      "Checking your environment…",
      "Loading model catalog…",
      "Allocating memory…",
      "Loading models (first run can take 5–10 minutes)…",
      "Warming up inference…",
      "Running health checks…",
      "Almost ready…"
    ],
    []
  );

  const activeMessage = useMemo(() => {
    if (boot.phase === "ready") return "Gateway ready.";
    if (boot.phase === "error") return "Startup failed.";
    if (boot.phase === "cancelled") return "Startup cancelled.";
    if (boot.phase === "idle") return "Launch local server.";
    const idx = Math.floor((elapsed + tick * 250) / 6500) % messages.length;
    return messages[idx];
  }, [boot.phase, elapsed, messages, tick]);

  const subtitle = useMemo(() => {
    if (isDisabled && disabledReason) return disabledReason;
    if (boot.phase === "idle") return "Starts the local gateway and waits for /health.";
    if (boot.phase === "booting") return "Spawning process…";
    if (boot.phase === "polling") {
      const http = boot.lastHttpStatus ? `HTTP ${boot.lastHttpStatus}` : "No response yet";
      const readiness = boot.lastReadiness ? ` • status: ${boot.lastReadiness}` : "";
      return `Health check #${boot.attempts + 1} • ${http}${readiness}`;
    }
    if (boot.phase === "ready") return "You can continue to the next step.";
    if (boot.phase === "cancelled") return "You can launch again anytime.";
    return boot.error ?? "Check logs/doctor for details.";
  }, [
    boot.phase,
    boot.attempts,
    boot.lastHttpStatus,
    boot.lastReadiness,
    boot.error,
    disabledReason,
    isDisabled
  ]);

  const right = useMemo(() => {
    if (boot.phase === "ready") return <CheckIcon />;
    if (isBusy) return <Spinner />;
    return null;
  }, [boot.phase, isBusy]);

  const handleClick = async () => {
    if (isDisabled) {
      return;
    }
    if (isReady) {
      await onReadyClick?.();
      return;
    }
    if (isBusy) return;
    if (boot.phase === "error" || boot.phase === "cancelled") {
      onReset();
      onStart();
      return;
    }
    onStart();
  };

  return (
    <div className="launch-cta">
      <button
        type="button"
        className={[
          "launch-btn",
          isBusy ? "launch-btn--busy" : "",
          isReady ? "launch-btn--ready" : "",
          boot.phase === "error" ? "launch-btn--error" : ""
        ].join(" ")}
        onClick={handleClick}
        disabled={isBusy || isDisabled}
        aria-busy={isBusy}
      >
        <span className="launch-btn__shimmer" aria-hidden="true" />
        <span className="launch-btn__content">
          <span className="launch-btn__left">
            <span className="launch-btn__title">
              {boot.phase === "idle"
                ? "Launch local server"
                : boot.phase === "ready"
                  ? "Gateway ready"
                  : boot.phase === "error"
                    ? "Launch failed"
                    : "Launching"}
            </span>

            <span className="launch-btn__message" key={`${boot.phase}-${activeMessage}`}>
              <span className={isBusy ? "launch-btn__messageText launch-gradientText" : "launch-btn__messageText"}>
                {activeMessage}
              </span>
            </span>

            <span className="launch-btn__subtitle">{subtitle}</span>

            {isBusy && (
              <span className="launch-btn__meta">
                <ProgressRing value={pct} />
                <span>
                  {formatDuration(elapsed)} / {formatDuration(maxWaitMs)}
                </span>
              </span>
            )}
          </span>

          <span className="launch-btn__right">{right}</span>
        </span>
      </button>

      {isBusy && (
        <button type="button" className="btn launch-cancel" onClick={onCancel}>
          Stop
        </button>
      )}
    </div>
  );
}
