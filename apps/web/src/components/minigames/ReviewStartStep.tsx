import type { TaskSelectionState } from "./TaskSelectionStep";
import type { PlayerDraft, TeamDraft } from "./PlayersTeamsStep";

type ReviewStartStepProps = {
  mode: "ffa" | "tdm";
  taskSelection: TaskSelectionState;
  visibilityMode: "normal" | "hard" | "extreme";
  players: PlayerDraft[];
  teams: TeamDraft[];
  roundsPerPlayer: number;
};

export const ReviewStartStep = ({
  mode,
  taskSelection,
  visibilityMode,
  players,
  teams,
  roundsPerPlayer
}: ReviewStartStepProps) => {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="rounded-2xl border border-white/10 bg-slate-900/40 p-4">
        <p className="text-xs uppercase tracking-[0.2em] text-slate-300">Game mode</p>
        <p className="mt-2 text-lg font-semibold text-white">
          {mode === "tdm" ? "Team Deathmatch" : "Free For All"}
        </p>
        <p className="mt-3 text-xs text-slate-300">Visibility: {visibilityMode}</p>
        {mode === "tdm" && (
          <p className="mt-1 text-xs text-slate-300">
            Rounds per player: {roundsPerPlayer}
          </p>
        )}
      </div>
      <div className="rounded-2xl border border-white/10 bg-slate-900/40 p-4">
        <p className="text-xs uppercase tracking-[0.2em] text-slate-300">Task selection</p>
        <p className="mt-2 text-sm text-white">Strategy: {taskSelection.strategy}</p>
        {taskSelection.task_ids?.length ? (
          <p className="mt-2 text-xs text-slate-300">
            Manual tasks: {taskSelection.task_ids.length}
          </p>
        ) : null}
        {taskSelection.tags?.length ? (
          <p className="mt-2 text-xs text-slate-300">
            Tags: {taskSelection.tags.join(", ")}
          </p>
        ) : null}
        {taskSelection.skill_domains?.length ? (
          <p className="mt-2 text-xs text-slate-300">
            Domains: {taskSelection.skill_domains.join(", ")}
          </p>
        ) : null}
      </div>
      <div className="rounded-2xl border border-white/10 bg-slate-900/40 p-4">
        <p className="text-xs uppercase tracking-[0.2em] text-slate-300">Players</p>
        <div className="mt-2 space-y-1 text-xs text-slate-200">
          {players.map((player) => (
            <div key={player.id} className="flex items-center justify-between">
              <span>{player.name}</span>
              <span className="text-slate-400">{player.avatar}</span>
            </div>
          ))}
        </div>
      </div>
      {mode === "tdm" && (
        <div className="rounded-2xl border border-white/10 bg-slate-900/40 p-4">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-300">Teams</p>
          <div className="mt-2 space-y-1 text-xs text-slate-200">
            {teams.map((team) => (
              <div key={team.id} className="flex items-center justify-between">
                <span>{team.name}</span>
                <span className="text-slate-400">{team.color}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
