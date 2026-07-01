export const screenLabels: Record<string, string> = {
  setup: "Settings",
  ledger: "Activity Ledger",
  daily: "Today",
  weekly: "Weekly Capacity",
  forecast: "Weekly Forecast",
  trends: "Capacity Trends",
  narrative: "Weekly Summary",
  corrections: "Corrections",
  audit: "Audit History",
  sensitive: "Flagged Captures",
  agent: "Agent",
  accelerate: "Acceleration",
  skills: "Saved Skills"
};

export function primarySectionForScreen(screen: string): string | null {
  if (screen === "daily") return "today";
  if (screen === "weekly" || screen === "forecast" || screen === "trends" || screen === "narrative") return "week";
  if (screen === "ledger" || screen === "corrections" || screen === "audit" || screen === "sensitive") return "history";
  if (screen === "agent" || screen === "accelerate" || screen === "skills") return "agent";
  return null;
}

export function sectionViews(section: string | null) {
  if (section === "week") {
    return [
      { id: "weekly" as const, label: "Capacity" },
      { id: "forecast" as const, label: "Forecast" },
      { id: "trends" as const, label: "Trends" },
      { id: "narrative" as const, label: "Summary" }
    ];
  }

  if (section === "history") {
    return [
      { id: "ledger" as const, label: "Activity" },
      { id: "corrections" as const, label: "Corrections" },
      { id: "audit" as const, label: "Audit" },
      { id: "sensitive" as const, label: "Flagged" }
    ];
  }

  if (section === "agent") {
    return [
      { id: "agent" as const, label: "Ask" },
      { id: "accelerate" as const, label: "Accelerate" },
      { id: "skills" as const, label: "Saved skills" }
    ];
  }

  return [];
}
