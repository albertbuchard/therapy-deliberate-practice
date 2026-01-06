import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router-dom";
import { useGetPublicProfileQuery } from "../store/api";
import { formatDateTime, formatScore } from "../utils/scoreFormatters";

const buildInitials = (name: string) => {
  const parts = name
    .split(" ")
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length === 0) {
    return "?";
  }
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
};

export const PublicProfilePage = () => {
  const { t, i18n } = useTranslation();
  const { id } = useParams();
  const profileId = id ?? "";
  const { data, isLoading, isError } = useGetPublicProfileQuery(profileId, { skip: !profileId });
  const profile = data?.profile;

  const joinedDate = useMemo(() => {
    if (!profile?.created_at) return null;
    return formatDateTime(new Date(profile.created_at).getTime(), i18n.resolvedLanguage ?? "en");
  }, [profile?.created_at, i18n.resolvedLanguage]);

  const lastActive = useMemo(() => {
    if (!profile?.stats.last_active_at) return null;
    return formatDateTime(new Date(profile.stats.last_active_at).getTime(), i18n.resolvedLanguage ?? "en");
  }, [profile?.stats.last_active_at, i18n.resolvedLanguage]);

  const initials = profile ? buildInitials(profile.display_name) : "?";

  return (
    <div className="space-y-8">
      <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-slate-950 via-slate-900/90 to-slate-950 p-8 shadow-[0_30px_120px_-60px_rgba(15,23,42,0.9)]">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.15),_transparent_60%)]" />
        <div className="relative z-10 flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-5">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-2xl font-semibold text-teal-100">
              {initials}
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-teal-300">{t("publicProfile.tagline")}</p>
              <h1 className="mt-2 text-3xl font-semibold text-white">
                {profile?.display_name ?? t("publicProfile.loadingTitle")}
              </h1>
              <p className="mt-2 max-w-xl text-sm text-slate-300">
                {profile?.bio || t("publicProfile.bioEmpty")}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-200 transition hover:border-white/20"
              to="/leaderboard"
            >
              {t("publicProfile.backToLeaderboard")}
            </Link>
            <span className="rounded-full border border-teal-400/30 bg-teal-400/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-teal-200">
              {joinedDate ? t("publicProfile.joined", { date: joinedDate }) : t("publicProfile.joinedUnknown")}
            </span>
          </div>
        </div>
      </section>

      <section className="rounded-3xl border border-white/10 bg-slate-950/60 p-6">
        {isLoading && <p className="text-sm text-slate-400">{t("publicProfile.loading")}</p>}
        {isError && <p className="text-sm text-rose-300">{t("publicProfile.error")}</p>}
        {!isLoading && !isError && !profile && (
          <p className="text-sm text-slate-400">{t("publicProfile.missing")}</p>
        )}
        {profile && (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-semibold text-white">{t("publicProfile.statsTitle")}</h2>
              <p className="mt-2 text-sm text-slate-300">{t("publicProfile.statsSubtitle")}</p>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-5">
                <p className="text-xs uppercase tracking-[0.3em] text-slate-400">{t("publicProfile.stats.averageScore")}</p>
                <p className="mt-3 text-2xl font-semibold text-teal-200">
                  {formatScore(profile.stats.average_score)}
                </p>
                <p className="mt-2 text-xs text-slate-400">{t("publicProfile.stats.averageScoreHint")}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-5">
                <p className="text-xs uppercase tracking-[0.3em] text-slate-400">{t("publicProfile.stats.tasksPlayed")}</p>
                <p className="mt-3 text-2xl font-semibold text-white">{profile.stats.tasks_played}</p>
                <p className="mt-2 text-xs text-slate-400">{t("publicProfile.stats.tasksPlayedHint")}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-5">
                <p className="text-xs uppercase tracking-[0.3em] text-slate-400">{t("publicProfile.stats.lastActive")}</p>
                <p className="mt-3 text-2xl font-semibold text-white">
                  {lastActive ?? t("publicProfile.stats.lastActiveUnknown")}
                </p>
                <p className="mt-2 text-xs text-slate-400">{t("publicProfile.stats.lastActiveHint")}</p>
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
};
