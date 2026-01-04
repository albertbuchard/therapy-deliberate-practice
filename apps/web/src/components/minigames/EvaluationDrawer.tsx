import type { MinigamePlayer, MinigameRound, MinigameRoundResult } from "../../store/api";

type EvaluationDrawerProps = {
  open: boolean;
  rounds: MinigameRound[];
  results: MinigameRoundResult[];
  players: MinigamePlayer[];
  onClose: () => void;
};

export const EvaluationDrawer = ({
  open,
  rounds,
  results,
  players,
  onClose
}: EvaluationDrawerProps) => {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-6">
      <div className="w-full max-w-4xl rounded-3xl border border-white/10 bg-slate-950/90 p-6 shadow-2xl backdrop-blur">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-white">Review evaluations</h3>
          <button
            onClick={onClose}
            className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs uppercase tracking-wide text-white/70 hover:border-white/30"
          >
            Close
          </button>
        </div>
        <div className="mt-4 max-h-[60vh] space-y-4 overflow-auto">
          {rounds.map((round) => {
            const roundResults = results.filter((result) => result.round_id === round.id);
            return (
              <div
                key={round.id}
                className="rounded-2xl border border-white/10 bg-slate-900/60 p-4"
              >
                <div className="flex items-center justify-between text-xs text-slate-300">
                  <span>Round {round.position + 1}</span>
                  <span>{round.status}</span>
                </div>
                {roundResults.map((result) => {
                  const player = players.find((entry) => entry.id === result.player_id);
                  return (
                    <div key={result.id} className="mt-3 rounded-xl border border-white/10 bg-slate-950/50 p-3">
                      <div className="flex items-center justify-between text-sm text-white">
                        <span>{player?.name ?? "Player"}</span>
                        <span className="text-teal-200">{result.overall_score.toFixed(2)}</span>
                      </div>
                      {result.transcript && (
                        <p className="mt-2 text-xs text-slate-300">Transcript: {result.transcript}</p>
                      )}
                      {result.evaluation && (
                        <pre className="mt-2 max-h-40 overflow-auto rounded-lg bg-black/40 p-2 text-[10px] text-slate-200">
                          {JSON.stringify(result.evaluation, null, 2)}
                        </pre>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
