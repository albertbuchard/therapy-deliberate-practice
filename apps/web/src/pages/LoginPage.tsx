import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase } from "../supabase/client";
import { useAppSelector } from "../store/hooks";

export const LoginPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated, authChecked } = useAppSelector((state) => state.auth);
  const [error, setError] = useState<string | null>(null);
  const [loadingProvider, setLoadingProvider] = useState<"google" | "github" | null>(null);

  const returnTo = useMemo(() => {
    const params = new URLSearchParams(location.search);
    const value = params.get("returnTo");
    return value && value.startsWith("/") ? value : "/";
  }, [location.search]);

  useEffect(() => {
    if (authChecked && isAuthenticated) {
      navigate(returnTo, { replace: true });
    }
  }, [authChecked, isAuthenticated, navigate, returnTo]);

  const handleOAuth = async (provider: "google" | "github") => {
    setError(null);
    setLoadingProvider(provider);
    const redirectTo = `${window.location.origin}/login?returnTo=${encodeURIComponent(returnTo)}`;
    const { error: authError } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo }
    });
    if (authError) {
      setError(authError.message);
      setLoadingProvider(null);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <section className="rounded-3xl border border-white/10 bg-slate-900/60 p-8">
        <p className="text-xs uppercase tracking-[0.3em] text-teal-300">Welcome back</p>
        <h2 className="mt-3 text-3xl font-semibold">Sign in to continue</h2>
        <p className="mt-3 text-sm text-slate-300">
          Your practice history, personalized AI settings, and OpenAI key stay tied to your account.
        </p>
      </section>
      <section className="rounded-3xl border border-white/10 bg-slate-900/40 p-8">
        <div className="space-y-4">
          <button
            className="flex w-full items-center justify-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-semibold text-slate-950 transition hover:bg-slate-200"
            onClick={() => handleOAuth("google")}
            disabled={loadingProvider !== null}
          >
            {loadingProvider === "google" ? "Connecting to Google..." : "Continue with Google"}
          </button>
          <button
            className="flex w-full items-center justify-center gap-2 rounded-full border border-white/10 px-6 py-3 text-sm font-semibold text-white transition hover:border-white/20"
            onClick={() => handleOAuth("github")}
            disabled={loadingProvider !== null}
          >
            {loadingProvider === "github" ? "Connecting to GitHub..." : "Continue with GitHub"}
          </button>
          {error && <p className="text-sm text-rose-300">{error}</p>}
          <p className="text-xs text-slate-400">
            You&apos;ll be redirected back to {returnTo} after signing in.
          </p>
        </div>
      </section>
    </div>
  );
};
