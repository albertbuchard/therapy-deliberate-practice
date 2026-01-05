import type { MinigameSessionSummary } from "../../../store/api";

const formatDate = (timestamp?: number | null) =>
  timestamp ? new Date(timestamp).toLocaleString() : "—";

const formatMode = (mode: MinigameSessionSummary["game_type"]) => (mode === "tdm" ? "TDM" : "FFA");

type SessionCardProps = {
  session: MinigameSessionSummary;
  onOpen: () => void;
  onDelete: () => void;
};

export const SessionCard = ({ session, onOpen, onDelete }: SessionCardProps) => {
  const isActive = !session.ended_at;
  const progressLabel = `${session.progress.completed} / ${session.progress.total} rounds`;
  const winnerLabel = session.winner?.label ? `${session.winner.label} · ${session.winner.score.toFixed(2)}` : "—";

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen();
        }
      }}
      className="w-full rounded-3xl border border-white/10 bg-slate-900/60 p-5 text-left shadow-[0_0_30px_rgba(15,23,42,0.4)] transition hover:border-white/20"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.3em] text-white/70">
            {formatMode(session.game_type)}
          </span>
          <span
            className={`rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.3em] ${
              isActive
                ? "border-emerald-300/40 bg-emerald-500/20 text-emerald-100"
                : "border-slate-400/40 bg-slate-500/20 text-slate-200"
            }`}
          >
            {isActive ? "Active" : "Ended"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={(event) => {
              event.stopPropagation();
              onDelete();
            }}
            className="rounded-full border border-rose-300/40 bg-rose-500/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.3em] text-rose-100 hover:border-rose-200/70"
          >
            Delete
          </button>
          <button
            onClick={(event) => {
              event.stopPropagation();
              onOpen();
            }}
            className="rounded-full border border-white/10 bg-white/10 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white/80 hover:border-white/30 hover:text-white"
          >
            {isActive ? "Resume" : "View"}
          </button>
        </div>
      </div>
      <div className="mt-4 grid gap-3 text-sm text-slate-200 md:grid-cols-3">
        <div>
          <p className="text-[10px] uppercase tracking-[0.2em] text-slate-400">Created</p>
          <p className="mt-1 text-sm text-white">{formatDate(session.created_at)}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-[0.2em] text-slate-400">Ended</p>
          <p className="mt-1 text-sm text-white">{formatDate(session.ended_at)}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-[0.2em] text-slate-400">Progress</p>
          <p className="mt-1 text-sm text-white">{progressLabel}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-[0.2em] text-slate-400">Players</p>
          <p className="mt-1 text-sm text-white">{session.players_count}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-[0.2em] text-slate-400">Teams</p>
          <p className="mt-1 text-sm text-white">{session.teams_count}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-[0.2em] text-slate-400">Winner</p>
          <p className="mt-1 text-sm text-white">{winnerLabel}</p>
        </div>
      </div>
    </div>
  );
};
