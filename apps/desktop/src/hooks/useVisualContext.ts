import { useEffect, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useAsyncStatus } from "./useAsyncStatus";
import { buildVisualContextPrompt, VISUAL_CONTEXT_PROMPT_VERSION } from "../services/visualContextPrompt";
import { stableHash } from "../lib/blocks";
import { getLocalDateKey } from "../lib/date";
import { createAuditEvent } from "../lib/audit";
import {
  MAX_VISUAL_CONTEXT_CAPTURES_PER_DAY,
  MIN_VISUAL_CONTEXT_SESSION_MINUTES,
  MIN_VISUAL_CONTEXT_GAP_MS,
} from "../lib/constants";
import type {
  ActivitySession,
  AuditEvent,
  AIConfig,
  VisualContextInsight,
} from "../../../../packages/domain/src/models";

interface NativeVisualContextResponse {
  insight: Omit<
    VisualContextInsight,
    | "insight_id"
    | "captured_at"
    | "session_id"
    | "app_name"
    | "window_title"
    | "privacy_level"
    | "model"
    | "raw_screenshot_retained"
  >;
  model: string;
  captured_at_ms: number;
  app_name: string;
  window_title: string | null;
  session_id: string | null;
  raw_screenshot_retained: boolean;
}

interface UseVisualContextParams {
  isDemoMode: boolean;
  paused: boolean;
  activeWindowSessions: ActivitySession[];
  visualContextEnabled: boolean;
  visualContextInsights: VisualContextInsight[];
  todayKey: string;
  aiConfig: AIConfig | null;
  setVisualContextInsights: Dispatch<SetStateAction<VisualContextInsight[]>>;
  setAuditEvents: Dispatch<SetStateAction<AuditEvent[]>>;
}

export function useVisualContext(params: UseVisualContextParams) {
  const {
    isDemoMode,
    paused,
    activeWindowSessions,
    visualContextEnabled,
    visualContextInsights,
    todayKey,
    aiConfig,
    setVisualContextInsights,
    setAuditEvents,
  } = params;

  const [visualContextStatus, visualContextError, visualContextAsync] =
    useAsyncStatus<"idle" | "capturing">("idle");
  const [visualContextAttemptedSessionIds, setVisualContextAttemptedSessionIds] = useState<string[]>([]);

  async function captureVisualContext(session: ActivitySession, captureCountToday: number) {
    if (isDemoMode) return;
    const startedAt = new Date().toISOString();
    const prompt = buildVisualContextPrompt({
      session,
      captureCountToday,
      maxDailyCaptures: MAX_VISUAL_CONTEXT_CAPTURES_PER_DAY,
    });

    visualContextAsync.start("capturing");

    try {
      const response = await invoke<NativeVisualContextResponse>("capture_visual_context_with_openai", {
        request: {
          prompt,
          appName: session.app_name,
          windowTitle: session.window_title,
          sessionId: session.session_id,
          ai_config: aiConfig,
        },
      });
      const insight: VisualContextInsight = {
        insight_id: `visual-${stableHash(`${response.captured_at_ms}-${session.session_id}`)}`,
        captured_at: new Date(response.captured_at_ms).toISOString(),
        session_id: response.session_id,
        app_name: response.app_name,
        window_title: response.window_title,
        activity_summary: response.insight.activity_summary,
        visible_tool: response.insight.visible_tool,
        likely_work_category: response.insight.likely_work_category,
        likely_mode: response.insight.likely_mode,
        project_hint: response.insight.project_hint,
        sensitive_content_detected: response.insight.sensitive_content_detected,
        confidence: response.insight.confidence,
        evidence: response.insight.evidence,
        privacy_level: "derived_only",
        model: response.model,
        raw_screenshot_retained: response.raw_screenshot_retained,
      };

      setVisualContextInsights((current) => [...current, insight].slice(-200));
      visualContextAsync.setStatus("idle");
      setAuditEvents((current) => [
        ...current,
        createAuditEvent({
          type: "visual_context",
          source: "openai_vision",
          title: "Visual context captured",
          summary: insight.activity_summary,
          privacy_level: "derived_only",
          timestamp: insight.captured_at,
          details: {
            insight,
            prompt_version: VISUAL_CONTEXT_PROMPT_VERSION,
            capture_mode: "smart_occasional",
            capture_count_today: captureCountToday + 1,
            max_daily_captures: MAX_VISUAL_CONTEXT_CAPTURES_PER_DAY,
            sent_to_openai: true,
            raw_screenshot_retained: response.raw_screenshot_retained,
            store: false,
          },
        }),
      ].slice(-1000));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      visualContextAsync.fail(message);
      setAuditEvents((current) => [
        ...current,
        createAuditEvent({
          type: "visual_context",
          source: "openai_vision",
          title: "Visual context capture failed",
          summary: message,
          privacy_level: "derived_only",
          timestamp: startedAt,
          details: {
            session_id: session.session_id,
            app_name: session.app_name,
            window_title: session.window_title,
            prompt_version: VISUAL_CONTEXT_PROMPT_VERSION,
            capture_mode: "smart_occasional",
            sent_to_openai: false,
            raw_screenshot_retained: false,
          },
        }),
      ].slice(-1000));
    }
  }

  // Auto-trigger capture when a qualifying session arrives
  useEffect(() => {
    const latestSession = activeWindowSessions[0];
    if (
      !visualContextEnabled ||
      paused ||
      !latestSession ||
      latestSession.duration_minutes < MIN_VISUAL_CONTEXT_SESSION_MINUTES ||
      latestSession.sample_count < 3 ||
      visualContextStatus === "capturing"
    ) {
      return;
    }

    const capturedToday = visualContextInsights.filter(
      (insight) => getLocalDateKey(new Date(insight.captured_at)) === todayKey
    );
    if (capturedToday.length >= MAX_VISUAL_CONTEXT_CAPTURES_PER_DAY) return;

    const alreadyCaptured = visualContextInsights.some(
      (insight) => insight.session_id === latestSession.session_id
    );
    const alreadyAttempted = visualContextAttemptedSessionIds.includes(latestSession.session_id);
    if (alreadyCaptured || alreadyAttempted) return;

    const lastCapture = [...visualContextInsights].sort(
      (left, right) => new Date(right.captured_at).getTime() - new Date(left.captured_at).getTime()
    )[0];
    if (lastCapture && Date.now() - new Date(lastCapture.captured_at).getTime() < MIN_VISUAL_CONTEXT_GAP_MS) {
      return;
    }

    setVisualContextAttemptedSessionIds((current) => [...current, latestSession.session_id]);
    void captureVisualContext(latestSession, capturedToday.length);
  }, [
    activeWindowSessions,
    paused,
    todayKey,
    visualContextAttemptedSessionIds,
    visualContextEnabled,
    visualContextInsights,
    visualContextStatus,
  ]);

  function resetVisualContext() {
    visualContextAsync.reset();
    setVisualContextAttemptedSessionIds([]);
  }

  return {
    visualContextStatus,
    visualContextError,
    captureVisualContext,
    resetVisualContext,
  };
}
