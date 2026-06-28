import { Settings, Moon, Pause, CalendarCheck, BarChart3, History, Bot, Radio, Gauge } from "lucide-react";
import type { ReactNode } from "react";
import type { WeeklyCapacitySnapshot } from "../../../../../packages/domain/src/models";
import type { AppToolbarAction, Screen } from "../../lib/types";
import { AppToolbar } from "./AppToolbar";
import { ContextNavigation } from "./ContextNavigation";
import { primarySectionForScreen } from "../../lib/ui";
import { pct } from "../../lib/format";

export function AppShell({
  active,
  setActive,
  toolbarActions,
  toolbarStatus,
  snapshot,
  hasWorkBlocks,
  reviewCount,
  paused,
  setPaused,
  sidebarCollapsed,
  setSidebarCollapsed,
  windowMode,
  setWindowMode,
  theme,
  setTheme,
  demoMode,
  children
}: {
  active: Screen;
  setActive: (screen: Screen) => void;
  toolbarActions: AppToolbarAction[];
  toolbarStatus: string;
  snapshot: WeeklyCapacitySnapshot;
  hasWorkBlocks: boolean;
  reviewCount: number;
  paused: boolean;
  setPaused: (value: boolean) => void;
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (value: boolean) => void;
  windowMode: "large" | "compact";
  setWindowMode: (value: "large" | "compact") => void;
  theme: "light" | "dark";
  setTheme: (value: "light" | "dark") => void;
  demoMode: boolean;
  children: ReactNode;
}) {
  return (
    <div className={`app ${sidebarCollapsed ? "sidebar-collapsed" : ""} ${windowMode === "compact" ? "is-compact-widget" : ""} ${active === "agent" ? "agent-active" : ""}`}>
      <AppToolbar
        active={active}
        actions={toolbarActions}
        status={toolbarStatus}
        paused={paused}
        setPaused={setPaused}
        sidebarCollapsed={sidebarCollapsed}
        setSidebarCollapsed={setSidebarCollapsed}
        windowMode={windowMode}
        setWindowMode={setWindowMode}
        theme={theme}
        setTheme={setTheme}
        demoMode={demoMode}
      />
      {windowMode === "large" && (
      <aside className="sidebar" aria-label="Primary navigation">
        <div className="brand">
          <div className="brand-mark">cc</div>
          <div>
            <strong>ClearCapacity</strong>
            <span>Explainable Workload Intelligence</span>
          </div>
        </div>
        <nav className="nav-list">
          {[
            { id: "today", label: "Today", description: "Review and current activity", screen: "daily" as const, icon: CalendarCheck },
            { id: "week", label: "Week", description: "Capacity and summary", screen: "weekly" as const, icon: BarChart3 },
            { id: "agent", label: "Agent", description: "Ask, plan, and understand", screen: "agent" as const, icon: Bot },
            { id: "history", label: "History", description: "Ledger and audit trail", screen: "ledger" as const, icon: History },
            // Narrow-viewport-only: the dedicated `.settings-button` below is hidden at
            // ≤760px, so surface Settings here too (CSS keeps it hidden on desktop).
            { id: "setup", label: "Settings", description: "AI, calendar, retention", screen: "setup" as const, icon: Settings }
          ].map((item) => {
            const Icon = item.icon;
            const isSettings = item.id === "setup";
            const selected = isSettings ? active === "setup" : primarySectionForScreen(active) === item.id;
            return (
              <button
                className={`nav-item${isSettings ? " nav-item-settings" : ""}${selected ? " is-active" : ""}`}
                key={item.id}
                onClick={() => setActive(item.screen)}
                type="button"
              >
                <Icon size={18} />
                <span>
                  <strong>{item.label}</strong>
                  <small>{item.description}</small>
                </span>
                {item.id === "today" && reviewCount > 0 && <b>{reviewCount}</b>}
              </button>
            );
          })}
        </nav>
        <div className="sidebar-intelligence">
          <div className="side-metric-heading">
            <span>Reliable capacity</span>
            <Gauge size={14} />
          </div>
          <div className="side-metric-value">
            <strong>{hasWorkBlocks ? pct(snapshot.reliable_new_work_capacity_pct) : "--"}</strong>
            <small>{hasWorkBlocks ? "Next week" : "Needs signal"}</small>
          </div>
          <div className="side-capacity-track" aria-hidden="true">
            <span style={{ width: `${Math.max(0, Math.min(100, snapshot.reliable_new_work_capacity_pct || 0))}%` }} />
          </div>
          <div className="tracking-status">
            <Radio size={12} />
            <span>{paused ? "Tracking paused" : "Tracking locally"}</span>
          </div>
        </div>
        <button className={paused ? "pause-button is-paused" : "pause-button"} type="button" onClick={() => setPaused(!paused)}>
          {paused ? <Moon size={18} /> : <Pause size={18} />}
          <span>{paused ? "Resume Tracking" : "Pause Tracking"}</span>
        </button>
        <button className={active === "setup" ? "settings-button is-active" : "settings-button"} type="button" onClick={() => setActive("setup")}>
          <Settings size={17} />
          <span>Settings</span>
        </button>
      </aside>
      )}
      <main className="main-panel">
        {windowMode === "large" && active !== "setup" && (
          <ContextNavigation active={active} setActive={setActive} />
        )}
        {children}
      </main>
    </div>
  );
}
