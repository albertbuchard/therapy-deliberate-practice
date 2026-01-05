import type { MinigamePlayer, MinigameRoundResult, MinigameTeam } from "../../../store/api";
import { LeaderboardPanel } from "../LeaderboardPanel";

type SessionLeaderboardPanelProps = {
  mode: "ffa" | "tdm";
  players: MinigamePlayer[];
  teams: MinigameTeam[];
  results: MinigameRoundResult[];
};

export const SessionLeaderboardPanel = ({
  mode,
  players,
  teams,
  results
}: SessionLeaderboardPanelProps) => (
  <section className="rounded-3xl border border-white/10 bg-slate-900/60 p-6">
    <LeaderboardPanel mode={mode} players={players} teams={teams} results={results} badgeLabel="Final" />
  </section>
);
