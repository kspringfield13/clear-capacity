import type { ShieldCheck } from "lucide-react";

export type Screen = "setup" | "ledger" | "daily" | "weekly" | "forecast" | "narrative" | "corrections" | "audit" | "sensitive" | "agent";
export type WindowMode = "large" | "compact";
export type PrimarySection = "today" | "week" | "history";

export interface AppToolbarAction {
  label: string;
  icon: typeof ShieldCheck;
  onClick: () => void;
  disabled?: boolean;
  tone?: "default" | "primary";
}

export interface AgentChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt?: string;
  analysisSummary?: string;
}
