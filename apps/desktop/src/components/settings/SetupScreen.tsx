import {
  CalendarCheck,
  Check,
  ChevronRight,
  Eye,
  Lock,
  Monitor,
  Pause,
  Play,
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
    { label: "Tracking active", done: !paused && activeWindowSamples.length > 0 },
    { label: "Calendar imported", done: calendarEvents.length > 0 },
    { label: "AI provider configured", done: Boolean(aiConfig?.apiKey) },
    { label: "First classification run", done: hasClassification },
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

  const providers: { value: AIProvider; label: string; defaultBase?: string; defaultModel?: string; defaultVision?: string }[] = [
    { value: "openai", label: "OpenAI", defaultBase: "https://api.openai.com/v1", defaultModel: "gpt-4o", defaultVision: "gpt-4o" },
    { value: "grok", label: "Grok (xAI)", defaultBase: "https://api.x.ai/v1", defaultModel: "grok-2-1212", defaultVision: "grok-2-1212" },
    { value: "deepseek", label: "DeepSeek", defaultBase: "https://api.deepseek.com", defaultModel: "deepseek-chat", defaultVision: "deepseek-chat" },
    { value: "claude", label: "Claude (Anthropic)", defaultBase: "https://api.anthropic.com/v1", defaultModel: "claude-3-5-sonnet-20241022", defaultVision: "claude-3-5-sonnet-20241022" },
    { value: "custom", label: "Custom / OpenAI Compatible" },
  ];

  const currentConfig: AIConfig = aiConfig || {
    provider: "openai",
    apiKey: "",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4o",
    visionModel: "gpt-4o",
  };

  const updateAIConfig = (patch: Partial<AIConfig>) => {
    const newConfig: AIConfig = { ...currentConfig, ...patch };
    // auto fill defaults on provider change
    if (patch.provider) {
      const p = providers.find(pp => pp.value === patch.provider);
      if (p) {
        if (p.defaultBase) newConfig.baseUrl = p.defaultBase;
        if (p.defaultModel) newConfig.model = p.defaultModel;
        if (p.defaultVision) newConfig.visionModel = p.defaultVision;
      }
    }
    setAiConfig(newConfig);
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
                <span>{step.label}</span>
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
                <label>Provider</label>
                <select
                  value={currentConfig.provider}
                  onChange={(e) => updateAIConfig({ provider: e.target.value as AIProvider })}
                >
                  {providers.map(p => (
                    <option key={p.value} value={p.value}>{p.label}</option>
                  ))}
                </select>
              </div>

              <div className="ai-field">
                <label>API Key</label>
                <input
                  type="password"
                  placeholder="sk-..."
                  value={currentConfig.apiKey}
                  onChange={(e) => updateAIConfig({ apiKey: e.target.value })}
                />
              </div>

              <div className="ai-field">
                <label>Base URL</label>
                <input
                  type="text"
                  placeholder="https://api.example.com/v1"
                  value={currentConfig.baseUrl || ''}
                  onChange={(e) => updateAIConfig({ baseUrl: e.target.value || undefined })}
                />
              </div>

              <div className="ai-field">
                <label>Model</label>
                <input
                  type="text"
                  placeholder="gpt-4o"
                  value={currentConfig.model}
                  onChange={(e) => updateAIConfig({ model: e.target.value })}
                />
              </div>

              <div className="ai-field">
                <label>Vision Model</label>
                <input
                  type="text"
                  placeholder="gpt-4o (optional)"
                  value={currentConfig.visionModel || ''}
                  onChange={(e) => updateAIConfig({ visionModel: e.target.value || undefined })}
                />
              </div>
            </div>
          </div>
        </div>
      </details>
    </section>
  );
}
