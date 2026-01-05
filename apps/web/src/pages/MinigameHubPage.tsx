import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { PageHeader } from "./help/components/PageHeader";
import {
  useDeleteMinigameSessionMutation,
  useListMinigameSessionsQuery,
  type MinigameSessionSummary
} from "../store/api";
import { SessionFilters } from "../components/minigames/history/SessionFilters";
import { SessionCard } from "../components/minigames/history/SessionCard";
import { SessionListSkeleton } from "../components/minigames/history/SessionListSkeleton";
import { EmptyState } from "../components/minigames/history/EmptyState";
import { DeleteSessionConfirmDialog } from "../components/minigames/history/DeleteSessionConfirmDialog";

export const MinigameHubPage = () => {
  const navigate = useNavigate();
  const [status, setStatus] = useState<"active" | "ended" | "all">("all");
  const [sort, setSort] = useState<"newest" | "oldest" | "recently_active">("newest");
  const [pendingDelete, setPendingDelete] = useState<MinigameSessionSummary | null>(null);

  const { data, isLoading, isError, refetch } = useListMinigameSessionsQuery({ status, sort });
  const [deleteSession, deleteState] = useDeleteMinigameSessionMutation();

  const sessions = useMemo(() => data?.sessions ?? [], [data?.sessions]);

  const handleOpenSession = (session: MinigameSessionSummary) => {
    if (session.ended_at) {
      navigate(`/minigames/session/${session.id}`);
    } else {
      navigate(`/minigames/play/${session.id}`);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!pendingDelete) return;
    await deleteSession({ sessionId: pendingDelete.id });
    setPendingDelete(null);
  };

  return (
    <div className="space-y-6 pb-12">
      <PageHeader
        kicker="Minigames"
        title="Minigame hub"
        subtitle="Resume active matches, review past results, or launch a new session with a curated setup flow."
        actions={
          <button
            onClick={() => navigate("/minigames/play", { state: { fromHub: true } })}
            className="rounded-full border border-teal-300/40 bg-teal-500/20 px-5 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-teal-100"
          >
            New game
          </button>
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-4">
        <SessionFilters status={status} sort={sort} onStatusChange={setStatus} onSortChange={setSort} />
        {isError && (
          <button
            onClick={() => refetch()}
            className="rounded-full border border-rose-300/40 bg-rose-500/10 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-rose-100"
          >
            Retry
          </button>
        )}
      </div>

      {isLoading ? (
        <SessionListSkeleton />
      ) : sessions.length ? (
        <div className="space-y-4">
          {sessions.map((session) => (
            <SessionCard
              key={session.id}
              session={session}
              onOpen={() => handleOpenSession(session)}
              onDelete={() => setPendingDelete(session)}
            />
          ))}
        </div>
      ) : (
        <EmptyState
          title="No minigame sessions yet"
          description="Start a new session to build your history and track how your matches evolve."
          actionLabel="Start a new game"
          onAction={() => navigate("/minigames/play", { state: { fromHub: true } })}
        />
      )}

      <DeleteSessionConfirmDialog
        open={Boolean(pendingDelete)}
        sessionLabel={pendingDelete ? `${pendingDelete.game_type.toUpperCase()} session` : undefined}
        onCancel={() => setPendingDelete(null)}
        onConfirm={handleDeleteConfirm}
      />

      {deleteState.isError && (
        <div className="rounded-2xl border border-rose-300/40 bg-rose-500/10 p-4 text-sm text-rose-100">
          We couldn’t delete that session. Please try again.
        </div>
      )}
    </div>
  );
};
