const statusOptions = [
  { value: "active", label: "Active" },
  { value: "ended", label: "Ended" },
  { value: "all", label: "All" }
] as const;

const sortOptions = [
  { value: "newest", label: "Newest" },
  { value: "oldest", label: "Oldest" },
  { value: "recently_active", label: "Recently active" }
] as const;

type SessionFiltersProps = {
  status: (typeof statusOptions)[number]["value"];
  sort: (typeof sortOptions)[number]["value"];
  onStatusChange: (value: SessionFiltersProps["status"]) => void;
  onSortChange: (value: SessionFiltersProps["sort"]) => void;
};

export const SessionFilters = ({ status, sort, onStatusChange, onSortChange }: SessionFiltersProps) => (
  <div className="flex flex-wrap items-center gap-3">
    <div className="inline-flex rounded-full border border-white/10 bg-white/5 p-1">
      {statusOptions.map((option) => (
        <button
          key={option.value}
          onClick={() => onStatusChange(option.value)}
          className={`rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-wide transition ${
            status === option.value
              ? "bg-teal-500/30 text-teal-100"
              : "text-white/70 hover:text-white"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
    <label className="relative">
      <span className="sr-only">Sort sessions</span>
      <select
        value={sort}
        onChange={(event) => onSortChange(event.target.value as SessionFiltersProps["sort"])}
        className="appearance-none rounded-full border border-white/10 bg-white/5 px-4 py-2 pr-10 text-xs font-semibold uppercase tracking-wide text-white/80"
      >
        {sortOptions.map((option) => (
          <option key={option.value} value={option.value} className="bg-slate-950 text-white">
            {option.label}
          </option>
        ))}
      </select>
      <svg
        className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/60"
        viewBox="0 0 20 20"
        fill="currentColor"
        aria-hidden="true"
      >
        <path
          fillRule="evenodd"
          d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 10.94l3.71-3.7a.75.75 0 1 1 1.06 1.06l-4.24 4.25a.75.75 0 0 1-1.06 0L5.25 8.29a.75.75 0 0 1-.02-1.08Z"
          clipRule="evenodd"
        />
      </svg>
    </label>
  </div>
);
