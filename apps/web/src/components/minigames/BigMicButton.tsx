type BigMicButtonProps = {
  isRecording: boolean;
  disabled?: boolean;
  onClick: () => void;
};

export const BigMicButton = ({ isRecording, disabled, onClick }: BigMicButtonProps) => (
  <button
    onClick={onClick}
    disabled={disabled}
    className={`relative flex h-28 w-28 items-center justify-center rounded-full border text-white transition ${
      isRecording
        ? "border-rose-300/60 bg-rose-500/30 shadow-[0_0_40px_rgba(244,63,94,0.5)]"
        : "border-teal-300/60 bg-teal-500/20 shadow-[0_0_40px_rgba(45,212,191,0.4)]"
    } ${disabled ? "opacity-50" : "hover:-translate-y-1"}`}
  >
    <span className="text-xl">{isRecording ? "■" : "●"}</span>
    <span className="absolute -bottom-8 text-[10px] uppercase tracking-[0.3em] text-slate-300">
      {isRecording ? "Stop" : "Record"}
    </span>
  </button>
);
