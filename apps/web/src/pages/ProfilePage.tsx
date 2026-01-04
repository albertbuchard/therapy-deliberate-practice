import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "../supabase/client";
import { useGetMeQuery, useUpdateMeProfileMutation } from "../store/api";

export const ProfilePage = () => {
  const { t } = useTranslation();
  const { data, isLoading, isError } = useGetMeQuery();
  const [updateProfile, updateState] = useUpdateMeProfileMutation();
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");

  useEffect(() => {
    if (!data) return;
    setDisplayName(data.display_name ?? "");
    setBio(data.bio ?? "");
  }, [data]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  const handleProfileSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await updateProfile({
      displayName: displayName.trim(),
      bio: bio.trim() ? bio.trim() : null
    });
  };

  return (
    <div className="space-y-8">
      <section className="rounded-3xl border border-white/10 bg-slate-900/60 p-8">
        <p className="text-xs uppercase tracking-[0.3em] text-teal-300">{t("profile.tagline")}</p>
        <h2 className="mt-3 text-3xl font-semibold">{t("profile.title")}</h2>
        <p className="mt-3 text-sm text-slate-300">{t("profile.subtitle")}</p>
      </section>
      <section className="rounded-3xl border border-white/10 bg-slate-900/40 p-8">
        {isLoading && <p className="text-sm text-slate-400">{t("profile.loading")}</p>}
        {isError && (
          <p className="text-sm text-rose-300">{t("profile.error")}</p>
        )}
        {data && (
          <div className="grid gap-6 md:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-5">
              <p className="text-xs uppercase tracking-[0.3em] text-slate-400">{t("profile.identity")}</p>
              <p className="mt-3 text-lg font-semibold text-white">{data.display_name}</p>
              <p className="mt-2 text-sm text-slate-300">
                {data.email ?? t("profile.emailUnavailable")}
              </p>
              <p className="mt-2 text-xs text-slate-400">{t("profile.userIdLabel", { id: data.id })}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-5">
              <p className="text-xs uppercase tracking-[0.3em] text-slate-400">{t("profile.accountCreated")}</p>
              <p className="mt-3 text-lg font-semibold text-white">
                {data.created_at ? new Date(data.created_at).toLocaleString() : t("profile.unknown")}
              </p>
              <p className="mt-2 text-xs text-slate-400">
                {t("profile.openAiKeyLabel", {
                  status: data.hasOpenAiKey ? t("profile.openAiKeyConnected") : t("profile.openAiKeyNotConnected")
                })}
              </p>
            </div>
          </div>
        )}
      </section>
      <section className="rounded-3xl border border-white/10 bg-slate-900/40 p-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold">{t("profile.profileTitle")}</h3>
            <p className="mt-2 text-sm text-slate-300">{t("profile.profileSubtitle")}</p>
          </div>
          {updateState.isSuccess && (
            <span className="rounded-full border border-teal-400/40 bg-teal-400/10 px-3 py-1 text-xs font-semibold text-teal-200">
              {t("profile.profileSaved")}
            </span>
          )}
        </div>
        <form className="mt-6 grid gap-6 md:grid-cols-2" onSubmit={handleProfileSubmit}>
          <label className="block text-sm text-slate-200">
            <span className="text-sm font-semibold">{t("profile.displayNameLabel")}</span>
            <input
              className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3 text-sm text-white placeholder:text-slate-500 focus:border-teal-400 focus:outline-none focus:ring-2 focus:ring-teal-400/30"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              placeholder={t("profile.displayNamePlaceholder")}
              maxLength={40}
              required
            />
          </label>
          <label className="block text-sm text-slate-200 md:col-span-2">
            <span className="text-sm font-semibold">{t("profile.bioLabel")}</span>
            <textarea
              className="mt-2 min-h-[120px] w-full resize-none rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3 text-sm text-white placeholder:text-slate-500 focus:border-teal-400 focus:outline-none focus:ring-2 focus:ring-teal-400/30"
              value={bio}
              onChange={(event) => setBio(event.target.value)}
              placeholder={t("profile.bioPlaceholder")}
              maxLength={160}
            />
          </label>
          <div className="flex flex-wrap items-center gap-4 md:col-span-2">
            <button
              className="rounded-full border border-white/10 px-6 py-2 text-sm font-semibold text-slate-200 transition hover:border-white/20"
              type="submit"
              disabled={updateState.isLoading}
            >
              {updateState.isLoading ? t("profile.profileSaving") : t("profile.profileSave")}
            </button>
            {updateState.isError && (
              <span className="text-sm text-rose-300">{t("profile.profileError")}</span>
            )}
          </div>
        </form>
      </section>
      <section className="rounded-3xl border border-white/10 bg-slate-900/40 p-8">
        <h3 className="text-lg font-semibold">{t("profile.actionsTitle")}</h3>
        <p className="mt-2 text-sm text-slate-300">{t("profile.actionsSubtitle")}</p>
        <button
          className="mt-4 rounded-full border border-white/10 px-6 py-2 text-sm font-semibold text-slate-200 transition hover:border-white/20"
          onClick={handleLogout}
        >
          {t("profile.logout")}
        </button>
      </section>
    </div>
  );
};
