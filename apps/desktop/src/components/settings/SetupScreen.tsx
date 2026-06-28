import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  AlertCircle,
  BellRing,
  CalendarCheck,
  CalendarSync,
  CheckCircle2,
  ChevronRight,
  Download,
  Eye,
  FileText,
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
  Timer,
  Upload
} from "lucide-react";
import type {
  ActiveWindowSample,
  ActivitySession,
  AuditEvent,
  OutlookCalendarEvent,
  VisualContextInsight,
  WorkBlock,
  AIConfig,
  AIProvider
} from "../../../../../packages/domain/src/models";
import { getLocalDateKey } from "../../lib/date";
import { formatAuditTime } from "../../lib/format";
import { MAX_PROACTIVE_ALERTS_PER_DAY, MAX_VISUAL_CONTEXT_CAPTURES_PER_DAY } from "../../lib/constants";
import type { ProactiveAlertSettings } from "../../lib/proactiveAlerts";
import {
  downloadTextFile,
  exportFilename,
  exportMimeType,
  serializeAuditTrail,
  serializeWorkLedger,
  type ExportFormat
} from "../../lib/dataExport";
import {
  AI_PROVIDER_PRESETS,
  createDefaultAIConfig,
  getAIProviderPreset,
  upgradeRetiredAppDefault
} from "../../services/aiProviders";
import { OnboardingCard, buildOnboardingSteps } from "../common/OnboardingCard";
import { CALENDAR_PROVIDERS } from "../../../../../packages/integrations/src/calendar/calendarSource";

// Automated (OAuth) calendar providers — disabled until the native connector
// lands (see packages/integrations/src/calendar/calendarSource.ts). The .ics
// file-import source stays available via the "Outlook calendar" row above.
const OAUTH_CALENDAR_PROVIDERS = CALENDAR_PROVIDERS.filter((provider) => provider.connection === "oauth");

// Retention windows (in days) offered for auto-expiring stored activity samples.
const RETENTION_OPTIONS = [7, 14, 30, 90] as const;

// Reliable-capacity floors (%) offered for the proactive guardrail.
const CAPACITY_THRESHOLD_OPTIONS = [5, 10, 15, 20] as const;

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
  blocks,
  auditEvents,
  retentionDays,
  setRetentionDays,
  proactiveAlertSettings,
  onProactiveAlertSettingsChange,
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
  blocks: WorkBlock[];
  auditEvents: AuditEvent[];
  retentionDays: number | null;
  setRetentionDays: (value: number | null) => void;
  proactiveAlertSettings: ProactiveAlertSettings;
  onProactiveAlertSettingsChange: (value: ProactiveAlertSettings) => void;
}) {
  const steps = buildOnboardingSteps({
    trackingActive: !paused && activeWindowSamples.length > 0,
    calendarImported: calendarEvents.length > 0,
    aiConfigured: Boolean(aiConfig?.apiKey),
    classified: hasClassification,
  });
  const allDone = steps.every((step) => step.done);

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

  const exportLedger = (format: ExportFormat) => {
    downloadTextFile(
      exportFilename("work-ledger", format),
      serializeWorkLedger(blocks, format),
      exportMimeType(format)
    );
  };

  const exportAudit = (format: ExportFormat) => {
    downloadTextFile(
      exportFilename("audit-trail", format),
      serializeAuditTrail(auditEvents, format),
      exportMimeType(format)
    );
  };

  const onRetentionChange = (value: string) => {
    setRetentionDays(value === "off" ? null : Number(value));
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

      {!allDone && <OnboardingCard steps={steps} />}

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
        <div className="settings-row-icon"><CalendarSync size={18} /></div>
        <div>
          <h2>Automated calendar sync</h2>
          <p>Connect Google Calendar or Microsoft 365 to sync meetings automatically — no manual `.ics` export. Account connection runs through the native connector and is coming soon.</p>
        </div>
        <div className="settings-row-status">
          <strong>Coming soon</strong>
          <span>Manual import works today</span>
        </div>
        <div className="calendar-connect-options">
          {OAUTH_CALENDAR_PROVIDERS.map((provider) => (
            <button
              key={provider.id}
              className="settings-control"
              type="button"
              disabled
              title={provider.description}
              aria-label={`Connect ${provider.label} (coming soon)`}
            >
              <PlugZap size={15} />
              <span>Connect {provider.label}</span>
            </button>
          ))}
        </div>
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

      <section className="settings-row">
        <div className="settings-row-icon"><BellRing size={18} /></div>
        <div>
          <h2>Proactive alerts</h2>
          <p>Get a menu-bar notification when your reliable capacity runs low or carryover risk climbs. Alerts use capacity metrics only — never window titles or app names — and are capped at {MAX_PROACTIVE_ALERTS_PER_DAY} per day.</p>
        </div>
        <div className="settings-row-status">
          <strong>{proactiveAlertSettings.enabled ? "On" : "Off"}</strong>
          <span>{proactiveAlertSettings.enabled ? `Warns below ${proactiveAlertSettings.capacityThresholdPct}%` : "No notifications sent"}</span>
        </div>
        <button
          className={proactiveAlertSettings.enabled ? "settings-control is-on" : "settings-control"}
          type="button"
          onClick={() => onProactiveAlertSettingsChange({ ...proactiveAlertSettings, enabled: !proactiveAlertSettings.enabled })}
        >
          {proactiveAlertSettings.enabled ? "Disable Alerts" : "Enable Alerts"}
        </button>
      </section>

      {proactiveAlertSettings.enabled && (
        <section className="settings-row">
          <div className="settings-row-icon"><AlertCircle size={18} /></div>
          <div>
            <h2>Capacity guardrail</h2>
            <p>Notify me when reliable new-work capacity drops to or below this level (or carryover risk spikes). Lower it to be warned only when capacity is nearly gone.</p>
          </div>
          <div className="settings-row-status">
            <strong>{proactiveAlertSettings.capacityGuardrailEnabled ? "Active" : "Muted"}</strong>
            <span>Floor at {proactiveAlertSettings.capacityThresholdPct}%</span>
          </div>
          <div className="data-export-options">
            <label className="sr-only" htmlFor="capacity-threshold">Capacity warning threshold</label>
            <select
              id="capacity-threshold"
              value={String(proactiveAlertSettings.capacityThresholdPct)}
              onChange={(event) => onProactiveAlertSettingsChange({ ...proactiveAlertSettings, capacityThresholdPct: Number(event.target.value) })}
            >
              {CAPACITY_THRESHOLD_OPTIONS.map((value) => (
                <option key={value} value={value}>Below {value}%</option>
              ))}
            </select>
            <button
              className={proactiveAlertSettings.capacityGuardrailEnabled ? "settings-control is-on" : "settings-control"}
              type="button"
              onClick={() => onProactiveAlertSettingsChange({ ...proactiveAlertSettings, capacityGuardrailEnabled: !proactiveAlertSettings.capacityGuardrailEnabled })}
            >
              {proactiveAlertSettings.capacityGuardrailEnabled ? "Mute Guardrail" : "Unmute Guardrail"}
            </button>
          </div>
        </section>
      )}

      <div className="settings-section-heading">
        <div>
          <h2>Data control</h2>
          <span>Your ledger stays local. Export it, or set how long raw activity samples are kept.</span>
        </div>
      </div>

      <section className="settings-row">
        <div className="settings-row-icon"><Timer size={18} /></div>
        <div>
          <h2>Activity retention</h2>
          <p>Automatically delete stored active-window samples older than the window you choose. Sessions and work blocks already derived from them are kept — only the raw samples expire.</p>
        </div>
        <div className="settings-row-status">
          <strong>{activeWindowSamples.length} samples stored</strong>
          <span>{retentionDays === null ? "Kept until you reset" : `Auto-expire after ${retentionDays} days`}</span>
        </div>
        <div className="data-export-options">
          <label className="sr-only" htmlFor="retention-window">Activity retention window</label>
          <select
            id="retention-window"
            value={retentionDays === null ? "off" : String(retentionDays)}
            onChange={(event) => onRetentionChange(event.target.value)}
          >
            <option value="off">Keep all samples</option>
            {RETENTION_OPTIONS.map((days) => (
              <option key={days} value={days}>Last {days} days</option>
            ))}
          </select>
        </div>
      </section>

      <section className="settings-row">
        <div className="settings-row-icon"><Download size={18} /></div>
        <div>
          <h2>Export work ledger</h2>
          <p>Download every classified work block as JSON or CSV. The file is saved locally — nothing leaves this Mac.</p>
        </div>
        <div className="settings-row-status">
          <strong>{blocks.length} work blocks</strong>
          <span>{blocks.length === 0 ? "Nothing to export yet" : "JSON keeps full detail"}</span>
        </div>
        <div className="data-export-options">
          <button
            className="settings-control"
            type="button"
            disabled={blocks.length === 0}
            onClick={() => exportLedger("json")}
            aria-label="Export work ledger as JSON"
          >
            <Download size={15} />
            <span>JSON</span>
          </button>
          <button
            className="settings-control"
            type="button"
            disabled={blocks.length === 0}
            onClick={() => exportLedger("csv")}
            aria-label="Export work ledger as CSV"
          >
            <Download size={15} />
            <span>CSV</span>
          </button>
        </div>
      </section>

      <section className="settings-row">
        <div className="settings-row-icon"><FileText size={18} /></div>
        <div>
          <h2>Export audit trail</h2>
          <p>Download the full explainability log — every classification, correction, and privacy action — as JSON or CSV.</p>
        </div>
        <div className="settings-row-status">
          <strong>{auditEvents.length} audit events</strong>
          <span>{auditEvents.length === 0 ? "Nothing to export yet" : "Stored locally only"}</span>
        </div>
        <div className="data-export-options">
          <button
            className="settings-control"
            type="button"
            disabled={auditEvents.length === 0}
            onClick={() => exportAudit("json")}
            aria-label="Export audit trail as JSON"
          >
            <Download size={15} />
            <span>JSON</span>
          </button>
          <button
            className="settings-control"
            type="button"
            disabled={auditEvents.length === 0}
            onClick={() => exportAudit("csv")}
            aria-label="Export audit trail as CSV"
          >
            <Download size={15} />
            <span>CSV</span>
          </button>
        </div>
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
              className={`ai-provider-status${providerStatus ? ` is-${providerStatus.tone}` : ''}`}
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
