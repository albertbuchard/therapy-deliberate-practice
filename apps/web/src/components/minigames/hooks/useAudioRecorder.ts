import { useCallback, useRef, useState } from "react";

type RecordingState = "idle" | "recording" | "processing";

const blobToBase64 = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === "string") {
        const [, base64] = reader.result.split(",");
        resolve(base64 ?? "");
      } else {
        reject(new Error("Invalid reader result"));
      }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });

export const useAudioRecorder = () => {
  const [recordingState, setRecordingState] = useState<RecordingState>("idle");
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const startRecording = useCallback(async () => {
    if (recordingState === "recording") return;
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const recorder = new MediaRecorder(stream);
    chunksRef.current = [];
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        chunksRef.current.push(event.data);
      }
    };
    recorder.onstop = () => {
      stream.getTracks().forEach((track) => track.stop());
    };
    recorder.start();
    mediaRecorderRef.current = recorder;
    setRecordingState("recording");
  }, [recordingState]);

  const stopRecording = useCallback(async () => {
    if (recordingState !== "recording" || !mediaRecorderRef.current) return null;
    setRecordingState("processing");
    const recorder = mediaRecorderRef.current;
    return new Promise<{
      base64: string;
      mimeType: string;
      blob: Blob;
    }>((resolve, reject) => {
      recorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType });
        try {
          const base64 = await blobToBase64(blob);
          setRecordingState("idle");
          resolve({ base64, mimeType: recorder.mimeType, blob });
        } catch (error) {
          setRecordingState("idle");
          reject(error);
        }
      };
      recorder.stop();
    });
  }, [recordingState]);

  return {
    recordingState,
    startRecording,
    stopRecording
  };
};
