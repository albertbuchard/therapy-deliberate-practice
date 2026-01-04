import { useCallback, useState } from "react";
import type { MinigameRound } from "../../../store/api";
import { useStartMinigameRoundMutation, useSubmitMinigameRoundMutation } from "../../../store/api";
import { useAudioRecorder } from "./useAudioRecorder";
import { usePatientAudio } from "./usePatientAudio";

type RoundRunnerOptions = {
  sessionId: string;
  round?: MinigameRound;
  playerId?: string;
  audioElement?: HTMLAudioElement | null;
  onResult: (payload: {
    transcript?: string;
    evaluation?: unknown;
    score?: number;
    attemptId?: string;
  }) => void;
};

export const useMinigameRoundRunner = ({
  sessionId,
  round,
  playerId,
  audioElement,
  onResult
}: RoundRunnerOptions) => {
  const [startRound] = useStartMinigameRoundMutation();
  const [submitRound] = useSubmitMinigameRoundMutation();
  const { recordingState, startRecording, stopRecording } = useAudioRecorder();
  const { isPlaying, prefetchAndPlay, error: audioError } = usePatientAudio(audioElement);
  const [status, setStatus] = useState<"idle" | "playing" | "ready" | "submitting" | "complete">(
    "idle"
  );
  const [submitError, setSubmitError] = useState<string | null>(null);

  const startTurn = useCallback(async () => {
    if (!round || !playerId) return;
    setSubmitError(null);
    await startRound({ sessionId, roundId: round.id });
    setStatus("playing");
    await prefetchAndPlay(round.task_id, round.example_id);
    setStatus("ready");
  }, [playerId, prefetchAndPlay, round, sessionId, startRound]);

  const stopAndSubmit = useCallback(async () => {
    if (!round || !playerId) return;
    const recorded = await stopRecording();
    if (!recorded) return;
    setStatus("submitting");
    try {
      const response = await submitRound({
        sessionId,
        roundId: round.id,
        player_id: playerId,
        audio_base64: recorded.base64,
        audio_mime: recorded.mimeType,
        practice_mode: "real_time",
        turn_context: { patient_statement_id: round.example_id }
      }).unwrap();
      onResult({
        transcript: response.transcript?.text,
        evaluation: response.scoring?.evaluation,
        score: response.scoring?.evaluation?.overall?.score,
        attemptId: response.attemptId
      });
      setStatus("complete");
    } catch (error) {
      setSubmitError("Submission failed. Please try again.");
      setStatus("ready");
    }
  }, [onResult, playerId, round, sessionId, stopRecording, submitRound]);

  return {
    status,
    recordingState,
    isPlaying,
    audioError,
    submitError,
    startTurn,
    startRecording,
    stopAndSubmit
  };
};
