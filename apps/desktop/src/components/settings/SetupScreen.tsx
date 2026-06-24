import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  AlertCircle,
  CalendarCheck,
  Check,
  CheckCircle2,
  ChevronRight,
  Eye,
  LoaderCircle,
  Lock,
  Monitor,
  Pause,
  Play,
  PlugZap,
  RotateCcw,
  Save,
  Settings,
  ShieldCheck,
  Upload
} from "lucide-react";
import type {
  ActiveWindowSample,
  ActivitySession,
  OutlookCalendarEvent,
  VisualContextInsight,
  AIConfig,
  AIProvider
} from "../../../../../packages/domain/src/models";
import { getLocalDateKey } from "../../lib/date";
import { formatAuditTime } from "../../lib/format";
import { MAX_VISUAL_CONTEXT_CAPTURES_PER_DAY } from "../../lib/constants";
import {
  AI_PROVIDER_PRESETS,
  createDefaultAIConfig,
  getAIProviderPreset,
  upgradeRetiredAppDefault
} from "../../services/aiProviders";

interface TestConnectionResponse {
  provider: string;
  model: string;
  message: string;
}

type ProviderStatus =
  | { tone: "success" | "error" | "info"; message: string }
  | null;

export function SetupScreen({
  paused,
  setPaused,
  visualContextEnabled,
  setVisualContextEnabled,
  visualContextInsights,
  calendarEvents,
  activeWindowSamples,
  activeWindowSessions,
  captureError,
  importError,
  onImportOutlookIcs,
  aiConfig,
  setAiConfig,
  hasClassification,
}: {
  paused: boolean;
  setPaused: (value: boolean) => void;
  visualContextEnabled: boolean;
  setVisualContextEnabled: (value: boolean) => void;
  visualContextInsights: VisualContextInsight[];
  calendarEvents: OutlookCalendarEvent[];
  activeWindowSamples: ActiveWindowSample[];
  activeWindowSessions: ActivitySession[];
  captureError: string | null;
  importError: string | null;
  onImportOutlookIcs: (file: File) => void;
  aiConfig: AIConfig | null;
  setAiConfig: (config: AIConfig | null) => void;
  hasClassification: boolean;
}) {
  const steps = [
    { label: "Tracking active", done: !paused && activeWindowSamples.length > 0, hint: "Resume tracking above and wait for the first activity sample" },
    { label: "Calendar imported", done: calendarEvents.length > 0, hint: "Import an .ics file in the Calendar section below" },
    { label: "AI provider configured", done: Boolean(aiConfig?.apiKey), hint: "Set up in Advanced Settings below" },
    { label: "First classification run", done: hasClassification, hint: "Run classification from the Weekly Capacity view" },
  ];
  const completedCount = steps.filter((s) => s.done).length;
  const allDone = completedCount === steps.length;

  const latestImport = calendarEvents.reduce<string | null>((latest, event) => {
    if (!latest || new Date(event.imported_at) > new Date(latest)) {
      return event.imported_at;
    }
    return latest;
  }, null);
  const visualCapturesToday = visualContextInsights.filter((insight) => getLocalDateKey(new Date(insight.captured_at)) === getLocalDateKey()).length;

  const [draftConfig, setDraftConfig] = useState<AIConfig>(() =>
    upgradeRetiredAppDefault(aiConfig || createDefaultAIConfig())
  );
  const [providerStatus, setProviderStatus] = useState<ProviderStatus>(() =>
    aiConfig && aiConfig.model !== upgradeRetiredAppDefault(aiConfig).model
      ? { tone: "info", message: `Updated the retired ${aiConfig.model} default. Save to keep the new model.` }
      : null
  );
  const [isTesting, setIsTesting] = useState(false);
  const selectedPreset = getAIProviderPreset(draftConfig.provider);
  const isDirty = !aiConfig || JSON.stringify(draftConfig) !== JSON.stringify(aiConfig);

  const updateDraftConfig = (patch: Partial<AIConfig>) => {
    const newConfig: AIConfig = { ...draftConfig, ...patch };
    if (patch.provider) {
      const preset = getAIProviderPreset(patch.provider);
      newConfig.baseUrl = preset.baseUrl;
      newConfig.model = preset.model;
      newConfig.visionModel = preset.visionModel;
    }
    setDraftConfig(newConfig);
    setProviderStatus(null);
  };

  const restoreDefaults = () => {
    const defaults = createDefaultAIConfig(draftConfig.provider);
    setDraftConfig({ ...defaults, apiKey: draftConfig.apiKey });
    setProviderStatus({ tone: "info", message: `Restored the recommended ${selectedPreset.label} settings.` });
  };

  const saveAIConfig = () => {
    const config = {
      ...draftConfig,
      apiKey: draftConfig.apiKey.trim(),
      baseUrl: draftConfig.baseUrl?.trim().replace(/\/+$/, ""),
      model: draftConfig.model.trim(),
      visionModel: draftConfig.visionModel?.trim() || undefined
    };
    if (!config.apiKey || !config.baseUrl || !config.model) {
      setProviderStatus({ tone: "error", message: "API key, base URL, and model are required." });
      return;
    }
    setDraftConfig(config);
    setAiConfig(config);
    setProviderStatus({ tone: "success", message: "Provider settings saved locally." });
  };

  const testConnection = async () => {
    if (!draftConfig.apiKey.trim() || !draftConfig.baseUrl?.trim() || !draftConfig.model.trim()) {
      setProviderStatus({ tone: "error", message: "Enter an API key, base URL, and model before testing." });
      return;
    }

    setIsTesting(true);
    setProviderStatus(null);
    try {
      const result = await invoke<TestConnectionResponse>("test_ai_connection", {
        request: {
          aiConfig: {
            ...draftConfig,
            apiKey: draftConfig.apiKey.trim(),
            baseUrl: draftConfig.baseUrl.trim().replace(/\/+$/, ""),
            model: draftConfig.model.trim()
          }
        }
      });
      setProviderStatus({ tone: "success", message: result.message });
    } catch (error) {
      setProviderStatus({
        tone: "error",
        message: error instanceof Error ? error.message : String(error)
      });
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <section className="screen settings-screen">
      <div className="screen-header">
        <div>
          <p className="eyebrow">Settings</p>
          <h1>Privacy and data sources</h1>
          <p className="screen-intro">ClearCapacity collects only the signals you enable. Tracking can be paused at any time.</p>
        </div>
        <button className="primary-action" type="button" onClick={() => setPaused(!paused)}>
          {paused ? <Play size={18} /> : <Pause size={18} />}
          <span>{paused ? "Resume Tracking" : "Pause Tracking"}</span>
        </button>
      </div>

      {!allDone && (
        <section className="onboarding-checklist">
          <div className="onboarding-checklist-header">
            <strong>Getting started</strong>
            <span>{completedCount}/{steps.length} complete</span>
          </div>
          <ol className="onboarding-steps">
            {steps.map((step) => (
              <li key={step.label} className={step.done ? "onboarding-step is-done" : "onboarding-step"}>
                <span className="onboarding-step-icon">
                  {step.done ? <Check size={13} /> : null}
                </span>
                <span>
                  {step.label}
                  {!step.done && <span className="onboarding-step-hint">{step.hint}</span>}
                </span>
              </li>
            ))}
          </ol>
        </section>
      )}

      <section className="privacy-summary">
        <div className={paused ? "privacy-state is-paused" : "privacy-state"}>
          <span className={paused ? "live-dot is-paused" : "live-dot"} />
          <div>
            <strong>{paused ? "Tracking is paused" : "Tracking is active"}</strong>
            <span>{paused ? "No new activity or visual signals are being collected." : "Foreground app and window-title metadata stay on this Mac."}</span>
          </div>
        </div>
        <div className="privacy-facts">
          <span><Lock size={15} /> Local storage</span>
          <span><Eye size={15} /> User-reviewed output</span>
          <span><ShieldCheck size={15} /> No keystrokes or webcam</span>
        </div>
      </section>

      <div className="settings-section-heading">
        <div>
          <h2>Data sources</h2>
          <span>Enable sources only when they add useful workload context.</span>
        </div>
      </div>

      <section className="settings-row">
        <div className="settings-row-icon"><Monitor size={18} /></div>
        <div>
          <h2>Active window activity</h2>
          <p>Records foreground app, window title, and timestamp locally. It never records keystrokes or file contents.</p>
        </div>
        <div className="settings-row-status">
          <strong>{activeWindowSessions.length} sessions</strong>
          <span>{activeWindowSamples.length} samples stored</span>
          {captureError && <small className="import-error">{captureError}</small>}
        </div>
        <span className={paused ? "source-status is-paused" : "source-status is-active"}>
          {paused ? <Pause size={13} /> : <span className="source-status-dot" />}
          {paused ? "Paused" : "Active"}
        </span>
      </section>

      <section className="settings-row">
        <div className="settings-row-icon"><CalendarCheck size={18} /></div>
        <div>
          <h2>Outlook calendar</h2>
          <p>Imports meeting titles and time windows from a local `.ics` export. Email bodies and meeting notes are ignored.</p>
        </div>
        <div className="settings-row-status">
          <strong>{calendarEvents.length} events</strong>
          <span>{latestImport ? `Imported ${formatAuditTime(latestImport)}` : "Not imported yet"}</span>
          {importError && <small className="import-error">{importError}</small>}
        </div>
        <label className="settings-control">
          <Upload size={16} />
          <span>Import Calendar</span>
          <input
            accept=".ics,text/calendar"
            type="file"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) onImportOutlookIcs(file);
              event.currentTarget.value = "";
            }}
          />
        </label>
      </section>

      <section className="settings-row">
        <div className="settings-row-icon"><Eye size={18} /></div>
        <div>
          <h2>Visual context</h2>
          <p>Optional screenshot analysis for sustained sessions. Images are sent to your chosen AI provider with `store: false` (where supported), then deleted locally.</p>
        </div>
        <div className="settings-row-status">
          <strong>{visualContextEnabled ? "On" : "Off"}</strong>
          <span>{visualCapturesToday}/{MAX_VISUAL_CONTEXT_CAPTURES_PER_DAY} captures today</span>
        </div>
        <button className={visualContextEnabled ? "settings-control is-on" : "settings-control"} type="button" onClick={() => setVisualContextEnabled(!visualContextEnabled)}>
          {visualContextEnabled ? "Disable Visual Context" : "Enable Visual Context"}
        </button>
      </section>

      <details className="advanced-settings">
        <summary>
          <span>
            <Settings size={17} />
            <strong>Advanced Settings</strong>
          </span>
          <ChevronRight size={16} />
        </summary>
        <div>
          <p>Raw activity metadata stays in local storage. AI features send only the data required for classification, forecasts, and summaries to the provider you select.</p>
          <p>Window titles and screenshots may include sensitive details. Pause tracking or disable visual context before handling confidential work.</p>

          <div className="ai-provider">
            <div className="ai-provider-header">
              <strong>AI Provider</strong>
              <small>API keys and endpoints are stored locally only.</small>
            </div>

            <div className="ai-form">
              <div className="ai-field">
                <label htmlFor="ai-provider">Provider</label>
                <select
                  id="ai-provider"
                  value={draftConfig.provider}
                  onChange={(e) => updateDraftConfig({ provider: e.target.value as AIProvider })}
                >
                  {AI_PROVIDER_PRESETS.map(p => (
                    <option key={p.value} value={p.value}>{p.label}</option>
                  ))}
                </select>
              </div>

              <div className="ai-field">
                <label htmlFor="ai-api-key">API Key</label>
                <input
                  id="ai-api-key"
                  type="password"
                  autoComplete="off"
                  placeholder={selectedPreset.keyPlaceholder}
                  value={draftConfig.apiKey}
                  onChange={(e) => updateDraftConfig({ apiKey: e.target.value })}
                />
              </div>

              <div className="ai-field">
                <label htmlFor="ai-base-url">Base URL</label>
                <input
                  id="ai-base-url"
                  type="text"
                  placeholder="https://api.example.com/v1"
                  value={draftConfig.baseUrl || ""}
                  onChange={(e) => updateDraftConfig({ baseUrl: e.target.value || undefined })}
                />
              </div>

              <div className="ai-field">
                <label htmlFor="ai-model">Model</label>
                <input
                  id="ai-model"
                  type="text"
                  placeholder={selectedPreset.model || "provider-model-id"}
                  value={draftConfig.model}
                  onChange={(e) => updateDraftConfig({ model: e.target.value })}
                />
                <small>{selectedPreset.modelNote}</small>
              </div>

              <div className="ai-field">
                <label htmlFor="ai-vision-model">Vision Model <span>Optional</span></label>
                <input
                  id="ai-vision-model"
                  type="text"
                  placeholder={selectedPreset.visionModel || "No recommended vision model"}
                  value={draftConfig.visionModel || ""}
                  onChange={(e) => updateDraftConfig({ visionModel: e.target.value || undefined })}
                />
              </div>
            </div>

            <div className="ai-provider-footer">
              <button className="ai-text-button" type="button" onClick={restoreDefaults}>
                <RotateCcw size={14} />
                Restore recommended defaults
              </button>
              <div className="ai-provider-actions">
                <button className="settings-control" type="button" onClick={testConnection} disabled={isTesting}>
                  {isTesting ? <LoaderCircle className="spin" size={15} /> : <PlugZap size={15} />}
                  {isTesting ? "Testing…" : "Test Connection"}
                </button>
                <button className="primary-action" type="button" onClick={saveAIConfig} disabled={!isDirty}>
                  <Save size={15} />
                  {isDirty ? "Save Settings" : "Saved"}
                </button>
              </div>
            </div>

            <div
              className={providerStatus ? `ai-provider-status is-${providerStatus.tone}` : undefined}
              role="status"
              aria-live="polite"
              aria-atomic="true"
            >
              {providerStatus && (
                <>
                  {providerStatus.tone === "success"
                    ? <CheckCircle2 size={15} />
                    : providerStatus.tone === "error"
                      ? <AlertCircle size={15} />
                      : <Settings size={15} />}
                  <span>{providerStatus.message}</span>
                </>
              )}
            </div>
          </div>
        </div>
      </details>
    </section>
  );
}
