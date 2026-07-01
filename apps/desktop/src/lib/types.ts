import type { ShieldCheck } from "lucide-react";

export type Screen = "setup" | "ledger" | "daily" | "weekly" | "forecast" | "trends" | "narrative" | "corrections" | "audit" | "sensitive" | "agent" | "accelerate" | "skills";
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
  /** Set when a stream failed mid-response so the UI can offer a Retry affordance. */
  interrupted?: boolean;
}
