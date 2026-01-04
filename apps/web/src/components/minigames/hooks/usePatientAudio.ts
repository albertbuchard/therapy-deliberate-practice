import { useCallback, useEffect, useRef, useState } from "react";
import { usePrefetchPatientAudioMutation } from "../../../store/api";

export type PatientAudioStatus = "idle" | "loading" | "ready" | "playing" | "blocked" | "error";

export const usePatientAudio = (audioElement?: HTMLAudioElement | null) => {
  const [prefetch] = usePrefetchPatientAudioMutation();
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<PatientAudioStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [patientEndedAt, setPatientEndedAt] = useState<number | null>(null);
  const latestElementRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (!audioElement) return;
    latestElementRef.current = audioElement;
  }, [audioElement]);

  const attachEndedListener = useCallback(
    (element: HTMLAudioElement) => {
      element.onended = () => {
        setStatus("ready");
        setPatientEndedAt(Date.now());
      };
      element.onerror = () => {
        setStatus("error");
        setError("Audio failed to load. Try again.");
      };
    },
    []
  );

  const prefetchAudio = useCallback(
    async (taskId: string, exampleId: string) => {
      if (!audioElement) return;
      setError(null);
      setStatus("loading");
      const response = await prefetch({
        exercise_id: taskId,
        practice_mode: "real_time",
        statement_id: exampleId
      }).unwrap();

      if (response.status === "ready" && response.audio_url) {
        setAudioUrl(response.audio_url);
        audioElement.src = response.audio_url;
        setPatientEndedAt(null);
        attachEndedListener(audioElement);
        setStatus("ready");
      } else {
        setStatus("loading");
        setError("Audio is still preparing. Try again in a moment.");
      }
    },
    [attachEndedListener, audioElement, prefetch]
  );

  const play = useCallback(async () => {
    const element = latestElementRef.current;
    if (!element) return;
    setError(null);
    try {
      await element.play();
      setStatus("playing");
      attachEndedListener(element);
    } catch (playError) {
      setStatus("blocked");
      setError("Autoplay blocked. Tap play to continue.");
    }
  }, [attachEndedListener]);

  const pause = useCallback(() => {
    const element = latestElementRef.current;
    if (!element) return;
    element.pause();
    if (status === "playing") {
      setStatus("ready");
    }
  }, [status]);

  const stop = useCallback(() => {
    const element = latestElementRef.current;
    if (!element) return;
    element.pause();
    element.currentTime = 0;
    if (status === "playing") {
      setPatientEndedAt(Date.now());
    }
    if (status === "playing" || status === "blocked") {
      setStatus("ready");
    }
  }, [status]);

  return {
    audioUrl,
    status,
    error,
    patientEndedAt,
    prefetch: prefetchAudio,
    play,
    pause,
    stop
  };
};
