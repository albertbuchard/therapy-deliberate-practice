import type { MinigamePlayer, MinigameRound, MinigameRoundResult } from "../../../store/api";

const formatScore = (score?: number | null) => (score == null ? "—" : score.toFixed(2));

type RoundResponseCardProps = {
  round: MinigameRound;
  player?: MinigamePlayer;
  result?: MinigameRoundResult;
};

export const RoundResponseCard = ({ round, player, result }: RoundResponseCardProps) => (
  <div className="space-y-3">
    <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Prompt</p>
          <p className="mt-1 text-sm text-white">{round.patient_text ?? "Prompt unavailable"}</p>
        </div>
        <div className="text-right">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Player</p>
          <p className="mt-1 text-sm text-white">{player?.name ?? "—"}</p>
        </div>
      </div>
    </div>
    <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Score</p>
          <p className="mt-1 text-sm text-white">{formatScore(result?.overall_score)}</p>
        </div>
        <div className="text-right">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Status</p>
          <p className="mt-1 text-sm text-white">{round.status}</p>
        </div>
      </div>
      <div className="mt-4 space-y-3">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Transcript</p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-slate-200">
            {result?.transcript ?? "No transcript captured."}
          </p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Evaluation</p>
          <pre className="mt-1 max-h-48 overflow-y-auto rounded-xl border border-white/10 bg-slate-900/60 p-3 text-xs text-slate-200">
            {result?.evaluation ? JSON.stringify(result.evaluation, null, 2) : "No evaluation recorded."}
          </pre>
        </div>
      </div>
    </div>
  </div>
);
