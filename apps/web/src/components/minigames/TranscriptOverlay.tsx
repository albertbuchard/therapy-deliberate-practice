type TranscriptOverlayProps = {
  text?: string;
  hidden: boolean;
  onToggle: () => void;
};

export const TranscriptOverlay = ({ text, hidden, onToggle }: TranscriptOverlayProps) => (
  <div className="pointer-events-none absolute left-1/2 top-8 z-20 w-full max-w-3xl -translate-x-1/2 px-6">
    <div className="pointer-events-auto flex items-center justify-between rounded-3xl border border-white/10 bg-slate-950/70 px-5 py-3 text-sm text-white shadow-[0_0_25px_rgba(15,23,42,0.4)] backdrop-blur">
      <span className="truncate">{hidden ? "Transcript hidden" : text ?? "Awaiting transcript..."}</span>
      <button
        onClick={onToggle}
        className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-white/70 hover:border-white/40"
      >
        {hidden ? "Show" : "Hide"}
      </button>
    </div>
  </div>
);
