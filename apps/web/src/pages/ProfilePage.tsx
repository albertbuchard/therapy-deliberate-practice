import { supabase } from "../supabase/client";
import { useGetMeQuery } from "../store/api";

export const ProfilePage = () => {
  const { data, isLoading, isError } = useGetMeQuery();

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  return (
    <div className="space-y-8">
      <section className="rounded-3xl border border-white/10 bg-slate-900/60 p-8">
        <p className="text-xs uppercase tracking-[0.3em] text-teal-300">Your profile</p>
        <h2 className="mt-3 text-3xl font-semibold">Account overview</h2>
        <p className="mt-3 text-sm text-slate-300">
          Manage your identity and review account status in one place.
        </p>
      </section>
      <section className="rounded-3xl border border-white/10 bg-slate-900/40 p-8">
        {isLoading && <p className="text-sm text-slate-400">Loading profile...</p>}
        {isError && (
          <p className="text-sm text-rose-300">We couldn&apos;t load your profile. Try again.</p>
        )}
        {data && (
          <div className="grid gap-6 md:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-5">
              <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Identity</p>
              <p className="mt-3 text-lg font-semibold text-white">{data.email ?? "Email not available"}</p>
              <p className="mt-2 text-xs text-slate-400">User ID: {data.id}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-5">
              <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Account created</p>
              <p className="mt-3 text-lg font-semibold text-white">
                {data.created_at ? new Date(data.created_at).toLocaleString() : "Unknown"}
              </p>
              <p className="mt-2 text-xs text-slate-400">
                OpenAI key: {data.hasOpenAiKey ? "Connected" : "Not connected"}
              </p>
            </div>
          </div>
        )}
      </section>
      <section className="rounded-3xl border border-white/10 bg-slate-900/40 p-8">
        <h3 className="text-lg font-semibold">Account actions</h3>
        <p className="mt-2 text-sm text-slate-300">
          Sign out on shared devices or when you&apos;re done practicing.
        </p>
        <button
          className="mt-4 rounded-full border border-white/10 px-6 py-2 text-sm font-semibold text-slate-200 transition hover:border-white/20"
          onClick={handleLogout}
        >
          Log out
        </button>
      </section>
    </div>
  );
};
