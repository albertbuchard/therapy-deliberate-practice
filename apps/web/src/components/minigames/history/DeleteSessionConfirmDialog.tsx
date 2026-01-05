import { useEffect, useRef } from "react";

type DeleteSessionConfirmDialogProps = {
  open: boolean;
  sessionLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
};

export const DeleteSessionConfirmDialog = ({
  open,
  sessionLabel,
  onConfirm,
  onCancel
}: DeleteSessionConfirmDialogProps) => {
  const confirmRef = useRef<HTMLButtonElement | null>(null);
  const cancelRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (open) {
      confirmRef.current?.focus();
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onCancel();
      }
      if (event.key === "Tab") {
        const focusable = [confirmRef.current, cancelRef.current].filter(Boolean) as HTMLElement[];
        if (!focusable.length) return;
        const currentIndex = focusable.indexOf(document.activeElement as HTMLElement);
        let nextIndex = currentIndex;
        if (event.shiftKey) {
          nextIndex = currentIndex <= 0 ? focusable.length - 1 : currentIndex - 1;
        } else {
          nextIndex = currentIndex === focusable.length - 1 ? 0 : currentIndex + 1;
        }
        focusable[nextIndex]?.focus();
        event.preventDefault();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4"
      style={{ WebkitOverflowScrolling: "touch" }}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-md max-h-[90dvh] overflow-y-auto rounded-3xl border border-white/10 bg-slate-950/90 p-6 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-rose-200/70">Confirm delete</p>
            <h3 className="mt-2 text-xl font-semibold text-white">Remove this session?</h3>
          </div>
          <button
            onClick={onCancel}
            className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-white/70"
          >
            Close
          </button>
        </div>
        <p className="mt-4 text-sm text-slate-300">
          This will remove{sessionLabel ? ` ${sessionLabel}` : " this session"} from your history. You can’t undo this
          action.
        </p>
        <div className="mt-6 flex justify-end gap-2">
          <button
            ref={cancelRef}
            onClick={onCancel}
            className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white/70"
          >
            Cancel
          </button>
          <button
            ref={confirmRef}
            onClick={onConfirm}
            className="rounded-full border border-rose-300/50 bg-rose-500/20 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-rose-100"
          >
            Delete session
          </button>
        </div>
      </div>
    </div>
  );
};
