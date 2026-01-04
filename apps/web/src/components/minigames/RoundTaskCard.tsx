import type { TaskCriterion } from "@deliberate/shared";

type RoundTaskCardProps = {
  title?: string;
  criteria: TaskCriterion[];
  visibilityMode: "normal" | "hard" | "extreme";
};

export const RoundTaskCard = ({ title, criteria, visibilityMode }: RoundTaskCardProps) => {
  if (visibilityMode === "extreme") return null;

  const hasCriteria = criteria.length > 0;

  return (
    <div className="rounded-3xl border border-white/10 bg-slate-900/60 px-6 py-4 shadow-[0_0_25px_rgba(15,23,42,0.35)] backdrop-blur">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-teal-200/70">Task</p>
          <h2 className="mt-2 text-lg font-semibold text-white">
            {title ?? "Loading task details..."}
          </h2>
        </div>
        <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] uppercase tracking-[0.25em] text-slate-200/80">
          {visibilityMode} visibility
        </span>
      </div>
      <div className="mt-4">
        <p className="text-xs uppercase tracking-[0.25em] text-slate-400">Criteria</p>
        {hasCriteria ? (
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {criteria.map((criterion) => (
              <div
                key={criterion.id}
                className="rounded-2xl border border-white/10 bg-slate-950/40 p-3"
              >
                <p className="text-sm font-semibold text-white">{criterion.label}</p>
                <p className="mt-1 text-xs text-slate-300">{criterion.description}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-2 text-xs text-slate-300">Criteria details will appear shortly.</p>
        )}
      </div>
    </div>
  );
};
