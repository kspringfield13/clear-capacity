import type { WorkCategory, WorkMode, PlannedStatus } from "./models";

export const workCategories: WorkCategory[] = [
  "Planned analysis / project work",
  "Ad hoc stakeholder requests",
  "Recurring reporting",
  "Dashboard development / edits",
  "SQL / data modeling / query work",
  "QA / data validation",
  "Debugging / issue investigation",
  "Documentation / requirement clarification",
  "Meetings / stakeholder syncs",
  "Admin / coordination",
  "Blocked / waiting / dependency delay"
];

export const workModes: WorkMode[] = [
  "Deep work",
  "Reactive",
  "Collaborative",
  "Fragmented",
  "Blocked"
];

export const plannedStatuses: PlannedStatus[] = ["planned", "unplanned", "fixed", "blocked"];

export const categoryColors: Record<WorkCategory, string> = {
  "Planned analysis / project work": "#2563eb",
  "Ad hoc stakeholder requests": "#dc2626",
  "Recurring reporting": "#0891b2",
  "Dashboard development / edits": "#7c3aed",
  "SQL / data modeling / query work": "#0f766e",
  "QA / data validation": "#ca8a04",
  "Debugging / issue investigation": "#ea580c",
  "Documentation / requirement clarification": "#4b5563",
  "Meetings / stakeholder syncs": "#16a34a",
  "Admin / coordination": "#64748b",
  "Blocked / waiting / dependency delay": "#9333ea"
};
