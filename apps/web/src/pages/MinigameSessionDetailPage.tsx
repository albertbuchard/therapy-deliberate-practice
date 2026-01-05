import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { PageHeader } from "./help/components/PageHeader";
import {
  useDeleteMinigameSessionMutation,
  useGetMinigameSessionDetailQuery
} from "../store/api";
import { computeWinner } from "../components/minigames/utils/computeWinner";
import { SessionOverviewPanel } from "../components/minigames/detail/SessionOverviewPanel";
import { SessionLeaderboardPanel } from "../components/minigames/detail/SessionLeaderboardPanel";
import { RoundsAccordion } from "../components/minigames/detail/RoundsAccordion";
import { DeleteSessionConfirmDialog } from "../components/minigames/history/DeleteSessionConfirmDialog";

export const MinigameSessionDetailPage = () => {
  const navigate = useNavigate();
  const params = useParams();
  const sessionId = params.sessionId ?? "";
  const [tab, setTab] = useState<"overview" | "leaderboard" | "rounds">("overview");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const { data, isLoading, isError, refetch } = useGetMinigameSessionDetailQuery(sessionId, {
    skip: !sessionId
  });
  const [deleteSession, deleteState] = useDeleteMinigameSessionMutation();

  const winnerSummary = useMemo(() => {
    if (!data) return null;
    return computeWinner({
      mode: data.session.game_type,
      players: data.players,
      teams: data.teams,
      results: data.results
    });
  }, [data]);

  const handleDelete = async () => {
    await deleteSession({ sessionId });
    setConfirmDelete(false);
    navigate("/minigames", { replace: true });
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-32 rounded-3xl border border-white/10 bg-slate-900/40" />
        <div className="h-64 rounded-3xl border border-white/10 bg-slate-900/40" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="rounded-3xl border border-white/10 bg-slate-900/60 p-6 text-slate-200">
        <p className="text-lg font-semibold text-white">Session not found</p>
        <p className="mt-2 text-sm text-slate-300">
          We couldn’t load that session. It may have been deleted.
        </p>
        <div className="mt-4 flex gap-3">
          <button
            onClick={() => navigate("/minigames")}
            className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white/70"
          >
            Back to hub
          </button>
          <button
            onClick={() => refetch()}
            className="rounded-full border border-teal-300/40 bg-teal-500/20 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-teal-100"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12">
      <PageHeader
        kicker="Session detail"
        title="Minigame results"
        subtitle="Review final outcomes, leaderboard standings, and every round of play."
        actions={
          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => navigate("/minigames")}
              className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white/70"
            >
              Back to hub
            </button>
            <button
              onClick={() => setConfirmDelete(true)}
              className="rounded-full border border-rose-300/40 bg-rose-500/10 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-rose-100"
            >
              Delete session
            </button>
          </div>
        }
      />

      <SessionOverviewPanel session={data.session} />

      {winnerSummary && (
        <section className="rounded-3xl border border-white/10 bg-gradient-to-br from-emerald-500/20 via-slate-900/60 to-slate-950/80 p-6">
          <p className="text-xs uppercase tracking-[0.3em] text-emerald-200/70">Winner</p>
          <h3 className="mt-2 text-2xl font-semibold text-white">{winnerSummary.label}</h3>
          <p className="mt-1 text-sm text-emerald-100">Score {winnerSummary.score.toFixed(2)}</p>
        </section>
      )}

      <div className="flex flex-wrap gap-2">
        {(
          [
            { key: "overview", label: "Overview" },
            { key: "leaderboard", label: "Leaderboard" },
            { key: "rounds", label: "Rounds" }
          ] as const
        ).map((entry) => (
          <button
            key={entry.key}
            onClick={() => setTab(entry.key)}
            className={`rounded-full border px-4 py-2 text-xs font-semibold uppercase tracking-wide ${
              tab === entry.key
                ? "border-teal-300/60 bg-teal-500/20 text-teal-100"
                : "border-white/10 bg-white/5 text-white/70"
            }`}
          >
            {entry.label}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <section className="rounded-3xl border border-white/10 bg-slate-900/60 p-6 text-sm text-slate-200">
          <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Summary</p>
          <p className="mt-3 text-sm text-slate-200">
            {data.rounds.length} rounds completed with {data.players.length} players.
          </p>
        </section>
      )}

      {tab === "leaderboard" && (
        <SessionLeaderboardPanel
          mode={data.session.game_type}
          players={data.players}
          teams={data.teams}
          results={data.results}
        />
      )}

      {tab === "rounds" && (
        <section className="rounded-3xl border border-white/10 bg-slate-900/60 p-6">
          <RoundsAccordion rounds={data.rounds} players={data.players} results={data.results} />
        </section>
      )}

      <DeleteSessionConfirmDialog
        open={confirmDelete}
        sessionLabel="this session"
        onCancel={() => setConfirmDelete(false)}
        onConfirm={handleDelete}
      />

      {deleteState.isError && (
        <div className="rounded-2xl border border-rose-300/40 bg-rose-500/10 p-4 text-sm text-rose-100">
          We couldn’t delete that session. Please try again.
        </div>
      )}
    </div>
  );
};
