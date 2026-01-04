import { useTranslation } from "react-i18next";
import { useGetProfilesQuery } from "../store/api";

export const PlayersPage = () => {
  const { t } = useTranslation();
  const { data, isLoading, isError } = useGetProfilesQuery();

  return (
    <div className="space-y-8">
      <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-slate-900/60 p-8">
        <div className="absolute left-1/2 top-0 h-4 w-24 -translate-x-1/2 rounded-b-3xl border border-t-0 border-white/10 bg-slate-950/80" />
        <p className="text-xs uppercase tracking-[0.3em] text-teal-300">{t("players.tagline")}</p>
        <h1 className="mt-3 text-3xl font-semibold text-white">{t("players.title")}</h1>
        <p className="mt-3 max-w-2xl text-sm text-slate-300">{t("players.subtitle")}</p>
      </section>

      <section className="rounded-3xl border border-white/10 bg-slate-950/60 p-6">
        {isLoading && <p className="text-sm text-slate-400">{t("players.loading")}</p>}
        {isError && <p className="text-sm text-rose-300">{t("players.error")}</p>}
        {!isLoading && !isError && data?.profiles.length === 0 && (
          <div className="rounded-2xl border border-dashed border-white/10 bg-white/5 px-6 py-10 text-center">
            <p className="text-lg font-semibold text-white">{t("players.empty")}</p>
            <p className="mt-2 text-sm text-slate-400">{t("players.emptyHint")}</p>
          </div>
        )}
        {data?.profiles.length ? (
          <div className="grid gap-4 md:grid-cols-2">
            {data.profiles.map((profile) => (
              <article
                key={profile.id}
                className="rounded-2xl border border-white/10 bg-slate-950/40 p-5 shadow-[0_20px_50px_-40px_rgba(15,23,42,0.9)]"
              >
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-xs uppercase tracking-[0.3em] text-slate-400">
                      {t("players.cardLabel")}
                    </p>
                    <h2 className="mt-2 text-lg font-semibold text-white">{profile.display_name}</h2>
                  </div>
                  <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300">
                    {new Date(profile.created_at).toLocaleDateString()}
                  </span>
                </div>
                <p className="mt-3 text-sm text-slate-300">
                  {profile.bio || t("players.defaultBio")}
                </p>
              </article>
            ))}
          </div>
        ) : null}
      </section>
    </div>
  );
};
