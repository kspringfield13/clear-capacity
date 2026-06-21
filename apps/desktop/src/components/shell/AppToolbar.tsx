import { getCurrentWindow } from "@tauri-apps/api/window";
import { Moon, Pause, Play, PanelLeft, Sun, Maximize2, Minimize2 } from "lucide-react";
import { screenLabels } from "../../lib/ui";
import type { AppToolbarAction } from "../../lib/types";
import type { Screen } from "../../lib/types";

export function AppToolbar({
  active,
  actions,
  status,
  paused,
  setPaused,
  sidebarCollapsed,
  setSidebarCollapsed,
  windowMode,
  setWindowMode,
  theme,
  setTheme,
  demoMode
}: {
  active: Screen;
  actions: AppToolbarAction[];
  status: string;
  paused: boolean;
  setPaused: (value: boolean) => void;
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (value: boolean) => void;
  windowMode: "large" | "compact";
  setWindowMode: (value: "large" | "compact") => void;
  theme: "light" | "dark";
  setTheme: (value: "light" | "dark") => void;
  demoMode: boolean;
}) {
  function startToolbarDrag(event: React.PointerEvent<HTMLElement>) {
    if (event.button !== 0) {
      return;
    }

    const target = event.target as HTMLElement;
    if (target.closest("button, input, select, textarea, a, [role='button']")) {
      return;
    }

    void getCurrentWindow().startDragging();
  }

  return (
    <header className="app-toolbar" onPointerDown={startToolbarDrag}>
      <div className="toolbar-left">
        {windowMode === "large" && (
          <button
            className="chrome-button"
            type="button"
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            title={sidebarCollapsed ? "Show Sidebar" : "Hide Sidebar"}
          >
            <PanelLeft size={15} />
          </button>
        )}
        <div className="toolbar-title">
          <div>
            <strong>{windowMode === "compact" ? "ClearCapacity" : screenLabels[active]}</strong>
            {demoMode && <b className="demo-badge">Demo</b>}
          </div>
          <span>{paused ? "Private mode on" : status}</span>
        </div>
      </div>

      <div className="toolbar-drag-region" />

      <div className="toolbar-actions" onPointerDown={(event) => event.stopPropagation()}>
        {windowMode === "large" &&
          actions.map((action) => {
            const Icon = action.icon;
            return (
              <button
                className={`toolbar-action ${action.tone ?? "default"}`}
                disabled={action.disabled}
                key={action.label}
                type="button"
                onClick={action.onClick}
                title={action.label}
              >
                <Icon size={15} />
                <span>{action.label}</span>
              </button>
            );
          })}
        <button
          className={paused ? "chrome-button is-paused" : "chrome-button"}
          type="button"
          onClick={() => setPaused(!paused)}
          title={paused ? "Resume Tracking" : "Pause Tracking"}
        >
          {paused ? <Play size={15} /> : <Pause size={15} />}
        </button>
        <button
          aria-label={theme === "dark" ? "Use Light Theme" : "Use Dark Theme"}
          aria-pressed={theme === "dark"}
          className="chrome-button theme-toggle"
          type="button"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          title={theme === "dark" ? "Use Light Theme" : "Use Dark Theme"}
        >
          {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
        </button>
        <button
          className="chrome-button"
          type="button"
          onClick={() => setWindowMode(windowMode === "compact" ? "large" : "compact")}
          title={windowMode === "compact" ? "Use Large Window" : "Use Compact Widget"}
        >
          {windowMode === "compact" ? <Maximize2 size={15} /> : <Minimize2 size={15} />}
        </button>
      </div>
    </header>
  );
}
