export const screenLabels: Record<string, string> = {
  setup: "Settings",
  ledger: "Activity Ledger",
  daily: "Today",
  weekly: "Weekly Capacity",
  forecast: "Weekly Forecast",
  narrative: "Weekly Summary",
  audit: "Audit History",
  agent: "Agent"
};

export function primarySectionForScreen(screen: string): string | null {
  if (screen === "daily") return "today";
  if (screen === "weekly" || screen === "forecast" || screen === "narrative") return "week";
  if (screen === "ledger" || screen === "audit") return "history";
  if (screen === "agent") return "agent";
  return null;
}

export function sectionViews(section: string | null) {
  if (section === "week") {
    return [
      { id: "weekly" as const, label: "Capacity" },
      { id: "forecast" as const, label: "Forecast" },
      { id: "narrative" as const, label: "Summary" }
    ];
  }

  if (section === "history") {
    return [
      { id: "ledger" as const, label: "Activity" },
      { id: "audit" as const, label: "Audit" }
    ];
  }

  return [];
}
