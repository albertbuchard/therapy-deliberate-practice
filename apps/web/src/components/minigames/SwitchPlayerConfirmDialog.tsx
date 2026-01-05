type SwitchPlayerConfirmDialogProps = {
  open: boolean;
  playerName?: string;
  onCancel: () => void;
  onConfirm: () => void;
};

export const SwitchPlayerConfirmDialog = ({
  open,
  playerName,
  onCancel,
  onConfirm
}: SwitchPlayerConfirmDialogProps) => {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-40 overflow-y-auto bg-black/60 p-6"
      style={{ WebkitOverflowScrolling: "touch" }}
    >
      <div className="flex min-h-[100dvh] items-center justify-center">
        <div className="mx-auto w-full max-w-md max-h-[90dvh] overflow-y-auto rounded-3xl border border-white/10 bg-slate-950/80 p-6 shadow-2xl backdrop-blur">
          <h3 className="text-lg font-semibold text-white">Switch turn?</h3>
          <p className="mt-2 text-sm text-slate-300">
            This will stop the current round and move the turn to{" "}
            <span className="font-semibold text-white">{playerName ?? "this player"}</span>. No
            points will be awarded for the interrupted turn.
          </p>
          <div className="mt-6 flex items-center justify-between">
            <button
              onClick={onCancel}
              className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white/70 hover:border-white/40"
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              className="rounded-full border border-teal-300/60 bg-teal-500/30 px-5 py-2 text-xs font-semibold uppercase tracking-wide text-teal-100 hover:border-teal-200"
            >
              Switch
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
