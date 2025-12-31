import { useEffect, useState } from "react";
import {
  useDeleteOpenAiKeyMutation,
  useGetMeSettingsQuery,
  useUpdateMeSettingsMutation,
  useUpdateOpenAiKeyMutation,
  useValidateOpenAiKeyMutation
} from "../store/api";
import { useAppDispatch, useAppSelector } from "../store/hooks";
import { hydrateSettings, setHasOpenAiKey } from "../store/settingsSlice";

export const SettingsPage = () => {
  const dispatch = useAppDispatch();
  const { data, isLoading, isError } = useGetMeSettingsQuery();
  const settings = useAppSelector((state) => state.settings);
  const [saveSettings, { isLoading: isSavingSettings }] = useUpdateMeSettingsMutation();
  const [updateKey, { isLoading: isSavingKey }] = useUpdateOpenAiKeyMutation();
  const [deleteKey, { isLoading: isDeletingKey }] = useDeleteOpenAiKeyMutation();
  const [validateKey, { isLoading: isValidatingKey }] = useValidateOpenAiKeyMutation();

  const [aiMode, setAiMode] = useState(settings.aiMode);
  const [localSttUrl, setLocalSttUrl] = useState(settings.localEndpoints.stt);
  const [localLlmUrl, setLocalLlmUrl] = useState(settings.localEndpoints.llm);
  const [storeAudio, setStoreAudio] = useState(settings.privacy.storeAudio);
  const [openAiKey, setOpenAiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [keyStatus, setKeyStatus] = useState<string | null>(null);
  const [validationStatus, setValidationStatus] = useState<string | null>(null);

  useEffect(() => {
    if (data) {
      dispatch(hydrateSettings(data));
    }
  }, [data, dispatch]);

  useEffect(() => {
    setAiMode(settings.aiMode);
    setLocalSttUrl(settings.localEndpoints.stt);
    setLocalLlmUrl(settings.localEndpoints.llm);
    setStoreAudio(settings.privacy.storeAudio);
  }, [settings.aiMode, settings.localEndpoints.llm, settings.localEndpoints.stt, settings.privacy.storeAudio]);

  const handleSaveSettings = async () => {
    setSaveStatus(null);
    try {
      const result = await saveSettings({
        aiMode,
        localSttUrl: localSttUrl.trim() ? localSttUrl.trim() : null,
        localLlmUrl: localLlmUrl.trim() ? localLlmUrl.trim() : null,
        storeAudio
      }).unwrap();
      dispatch(hydrateSettings(result));
      setSaveStatus("Settings saved.");
    } catch (error) {
      setSaveStatus("We couldn't save your settings. Try again.");
    }
  };

  const handleSaveKey = async () => {
    setKeyStatus(null);
    setValidationStatus(null);
    if (!openAiKey.trim()) {
      setKeyStatus("Add an OpenAI key to connect.");
      return;
    }
    try {
      const result = await updateKey({ openaiApiKey: openAiKey.trim() }).unwrap();
      dispatch(setHasOpenAiKey(result.hasOpenAiKey));
      setOpenAiKey("");
      setKeyStatus("Key saved securely.");
    } catch (error) {
      setKeyStatus("We couldn't save that key. Double-check and try again.");
    }
  };

  const handleRemoveKey = async () => {
    setKeyStatus(null);
    setValidationStatus(null);
    if (!window.confirm("Remove your stored OpenAI key? This cannot be undone.")) {
      return;
    }
    try {
      const result = await deleteKey().unwrap();
      dispatch(setHasOpenAiKey(result.hasOpenAiKey));
      setKeyStatus("Key removed.");
    } catch (error) {
      setKeyStatus("We couldn't remove the key. Try again.");
    }
  };

  const handleValidateKey = async () => {
    setValidationStatus(null);
    const typed = openAiKey.trim();

    if (!typed && !settings.hasOpenAiKey) {
      setValidationStatus("Add a key (or save one first) before validating.");
      return;
    }

    try {
      const result = await validateKey(typed ? { openaiApiKey: typed } : {}).unwrap();
      if (result.ok) {
        setValidationStatus("Key is valid and ready for practice.");
      } else {
        setValidationStatus(result.error ?? "Key validation failed.");
      }
    } catch (error) {
      setValidationStatus("Unable to validate the key right now.");
    }
  };

  return (
    <div className="space-y-8">
      <section className="rounded-3xl border border-white/10 bg-slate-900/60 p-8">
        <p className="text-xs uppercase tracking-[0.3em] text-teal-300">Preferences</p>
        <h2 className="mt-3 text-3xl font-semibold">Practice settings</h2>
        <p className="mt-3 text-sm text-slate-300">
          Tune your AI stack, privacy defaults, and OpenAI credentials for the best practice flow.
        </p>
      </section>

      <section className="rounded-3xl border border-white/10 bg-slate-900/40 p-8">
        {isLoading && <p className="text-sm text-slate-400">Loading settings...</p>}
        {isError && (
          <p className="text-sm text-rose-300">We couldn't load your settings. Try again.</p>
        )}
        <div className="space-y-6">
          <div className="space-y-3">
            <label className="text-sm font-semibold">AI mode</label>
            <p className="text-xs text-slate-400">
              Choose how we prioritize local inference versus OpenAI during practice.
            </p>
            <select
              className="w-full rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-2 text-sm text-slate-100"
              value={aiMode}
              onChange={(event) => setAiMode(event.target.value as typeof aiMode)}
            >
              <option value="local_prefer">Local preferred (fallback to OpenAI)</option>
              <option value="openai_only">OpenAI only</option>
              <option value="local_only">Local only</option>
            </select>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-3">
              <label className="text-sm font-semibold">Local STT endpoint</label>
              <input
                className="w-full rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-2 text-sm text-slate-100"
                value={localSttUrl}
                onChange={(event) => setLocalSttUrl(event.target.value)}
                placeholder="http://localhost:7001"
              />
              <p className="text-xs text-slate-400">Used when local STT is selected.</p>
            </div>
            <div className="space-y-3">
              <label className="text-sm font-semibold">Local LLM endpoint</label>
              <input
                className="w-full rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-2 text-sm text-slate-100"
                value={localLlmUrl}
                onChange={(event) => setLocalLlmUrl(event.target.value)}
                placeholder="http://localhost:7002"
              />
              <p className="text-xs text-slate-400">Used when local LLM is selected.</p>
            </div>
          </div>

          <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-slate-950/40 p-4">
            <div>
              <p className="text-sm font-semibold">Store audio recordings</p>
              <p className="text-xs text-slate-400">
                Save audio clips alongside attempts for future review.
              </p>
            </div>
            <button
              className={`rounded-full px-4 py-2 text-xs font-semibold transition ${
                storeAudio ? "bg-emerald-400 text-slate-950" : "bg-slate-800 text-slate-200"
              }`}
              onClick={() => setStoreAudio((value) => !value)}
            >
              {storeAudio ? "Enabled" : "Disabled"}
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              className="rounded-full bg-teal-400 px-6 py-2 text-sm font-semibold text-slate-950"
              onClick={handleSaveSettings}
              disabled={isSavingSettings}
            >
              {isSavingSettings ? "Saving..." : "Save settings"}
            </button>
            {saveStatus && <span className="text-xs text-slate-300">{saveStatus}</span>}
          </div>
        </div>
      </section>

      <section className="rounded-3xl border border-white/10 bg-slate-900/40 p-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold">OpenAI API key</h3>
            <p className="text-sm text-slate-300">
              {settings.hasOpenAiKey
                ? "Your key is connected and ready for OpenAI calls."
                : "Connect your key to unlock OpenAI-powered practice."}
            </p>
          </div>
          <span
            className={`rounded-full px-3 py-1 text-xs font-semibold ${
              settings.hasOpenAiKey ? "bg-emerald-400/20 text-emerald-300" : "bg-amber-400/20 text-amber-200"
            }`}
          >
            {settings.hasOpenAiKey ? "Connected" : "Not connected"}
          </span>
        </div>

        <div className="mt-6 space-y-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center">
            <input
              className="flex-1 rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-2 text-sm text-slate-100"
              type={showKey ? "text" : "password"}
              placeholder="sk-..."
              value={openAiKey}
              onChange={(event) => setOpenAiKey(event.target.value)}
            />
            <button
              className="rounded-full border border-white/10 px-4 py-2 text-xs text-slate-200"
              onClick={() => setShowKey((value) => !value)}
            >
              {showKey ? "Hide" : "Reveal"}
            </button>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              className="rounded-full bg-slate-100 px-6 py-2 text-sm font-semibold text-slate-950"
              onClick={handleSaveKey}
              disabled={isSavingKey}
            >
              {isSavingKey ? "Saving..." : "Save key"}
            </button>
            <button
              className="rounded-full border border-white/10 px-6 py-2 text-sm text-slate-200"
              onClick={handleValidateKey}
              disabled={isValidatingKey}
            >
              {isValidatingKey ? "Validating..." : "Validate key"}
            </button>
            <button
              className="rounded-full border border-rose-400/40 px-6 py-2 text-sm text-rose-200"
              onClick={handleRemoveKey}
              disabled={isDeletingKey}
            >
              {isDeletingKey ? "Removing..." : "Remove key"}
            </button>
          </div>
          {keyStatus && <p className="text-xs text-slate-300">{keyStatus}</p>}
          {validationStatus && <p className="text-xs text-slate-300">{validationStatus}</p>}
          <p className="text-xs text-slate-500">
            Keys are encrypted at rest and never shared back to the browser after saving.
          </p>
        </div>
      </section>
    </div>
  );
};
