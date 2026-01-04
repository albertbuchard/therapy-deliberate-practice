import { useCallback, useState } from "react";
import { usePrefetchPatientAudioMutation } from "../../../store/api";

export const usePatientAudio = (audioElement?: HTMLAudioElement | null) => {
  const [prefetch] = usePrefetchPatientAudioMutation();
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const prefetchAndPlay = useCallback(
    async (taskId: string, exampleId: string) => {
      if (!audioElement) return;
      setError(null);
      const response = await prefetch({
        exercise_id: taskId,
        practice_mode: "real_time",
        statement_id: exampleId
      }).unwrap();

      if (response.status === "ready" && response.audio_url) {
        setAudioUrl(response.audio_url);
        audioElement.src = response.audio_url;
        try {
          await audioElement.play();
          setIsPlaying(true);
          audioElement.onended = () => setIsPlaying(false);
        } catch (playError) {
          setError("Autoplay blocked. Tap play to continue.");
        }
      } else {
        setError("Audio is still preparing. Try again in a moment.");
      }
    },
    [audioElement, prefetch]
  );

  const pause = useCallback(() => {
    if (!audioElement) return;
    audioElement.pause();
    setIsPlaying(false);
  }, [audioElement]);

  return {
    audioUrl,
    isPlaying,
    error,
    prefetchAndPlay,
    pause
  };
};
