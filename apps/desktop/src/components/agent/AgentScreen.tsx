import { lazy, Suspense, useMemo, useState, useEffect, useRef } from "react";
import type { CSSProperties } from "react";
import {
  ArrowRight,
  Bot,
  BrainCircuit,
  CalendarRange,
  Check,
  ChevronDown,
  Clock3,
  Copy,
  Database,
  Gauge,
  Paperclip,
  RotateCcw,
  Send,
  ShieldCheck,
  Sparkles,
  Square,
  Trash2,
  User,
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import type {
  WorkBlock,
  ActivitySession,
  OutlookCalendarEvent,
  UserCorrection,
  VisualContextInsight,
  WeeklyCapacitySnapshot,
  AIConfig,
} from "../../../../../packages/domain/src/models";
import type { AgentChatMessage } from "../../lib/types";
import type { PushToast } from "../../hooks/useToasts";
import { agentTools, AGENT_INSTRUCTIONS } from "../../services/agentTools";
import { ConfirmDialog } from "../common/ConfirmDialog";
import type { tool as AiToolFn } from "ai";

const AgentMarkdown = lazy(() => import("./AgentMarkdown"));
const CHAT_STORAGE_KEY = "clear-capacity.agent-chat.v2";
const DRAFT_STORAGE_KEY = "clear-capacity.agent-draft.v1";
const BRIEFING_STORAGE_KEY = "clear-capacity.agent-briefing.v1";
const INITIAL_MESSAGE_COUNT = 24;
const MESSAGE_PAGE_SIZE = 20;

interface AgentScreenProps {
  blocks: WorkBlock[];
  snapshot: WeeklyCapacitySnapshot;
  activeWindowSessions: ActivitySession[];
  calendarEvents: OutlookCalendarEvent[];
  corrections: UserCorrection[];
  visualContextInsights: VisualContextInsight[];
  todayKey: string;
  currentWeekRangeLabel: string;
  aiConfig: AIConfig | null;
  pushToast: PushToast;
}

export function AgentScreen({
  blocks,
  snapshot,
  activeWindowSessions,
  calendarEvents,
  corrections,
  visualContextInsights,
  todayKey,
  currentWeekRangeLabel,
  aiConfig,
  pushToast,
}: AgentScreenProps) {
  const [messages, setMessages] = useState<AgentChatMessage[]>(() => {
    try {
      const cached = window.localStorage.getItem(CHAT_STORAGE_KEY);
      const parsed = cached ? JSON.parse(cached) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });
  const [input, setInput] = useState(() => {
    try {
      return window.localStorage.getItem(DRAFT_STORAGE_KEY) || "";
    } catch {
      return "";
    }
  });
  const [isSending, setIsSending] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(null);
  const [visibleMessageCount, setVisibleMessageCount] = useState(INITIAL_MESSAGE_COUNT);
  const [analysisStage, setAnalysisStage] = useState(0);
  const [expandedDetails, setExpandedDetails] = useState<Record<string, boolean>>({});
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [confirmingClear, setConfirmingClear] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const topProjects = useMemo(() => {
    const totals = new Map<string, number>();
    blocks.forEach((block) => {
      const name = block.project_name?.trim() || "Unassigned work";
      totals.set(name, (totals.get(name) || 0) + block.estimated_capacity_pct);
    });
    return [...totals.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([name, capacity]) => ({ name, capacity: Math.round(capacity) }));
  }, [blocks]);

  const liveBriefing = useMemo(() => ({
    weekId: snapshot.week_id,
    capacity: Math.round(snapshot.reliable_new_work_capacity_pct),
    planned: Math.round(snapshot.planned_pct),
    reactive: Math.round(snapshot.reactive_pct),
    carryoverRisk: Math.round(snapshot.carryover_risk_pct),
    primaryFocus: topProjects[0]?.name || "Building your workload signal",
    updatedAt: new Date().toISOString(),
  }), [snapshot, topProjects]);

  const [briefing, setBriefing] = useState(() => {
    try {
      const cached = window.localStorage.getItem(BRIEFING_STORAGE_KEY);
      return cached ? { ...liveBriefing, ...JSON.parse(cached) } : liveBriefing;
    } catch {
      return liveBriefing;
    }
  });

  const starterActions = [
    {
      icon: CalendarRange,
      title: "Plan within my capacity",
      description: "Shape a realistic week from the capacity you can rely on.",
      prompt: "Help me plan the rest of my week within my reliable capacity.",
    },
    {
      icon: Clock3,
      title: "Summarize today",
      description: "Turn tracked sessions and calendar activity into a clear recap.",
      prompt: "Summarize my activity today and call out the most important work.",
    },
    {
      icon: ShieldCheck,
      title: "Find workload risks",
      description: "Surface fragmentation, reactive load, and likely carryover.",
      prompt: "Find the biggest workload risks in my current week and explain what is driving them.",
    },
    {
      icon: BrainCircuit,
      title: "Explain what changed",
      description: "Compare planned and reactive work using your local evidence.",
      prompt: "Explain what changed in my workload this week, especially planned versus reactive work.",
    },
  ];

  // Static, snapshot-derived follow-up prompts shown beneath the latest settled reply.
  // Reuses the handleSuggested path; the empty-state starterActions stay separate.
  const followUpSuggestions = useMemo(() => {
    const suggestions: string[] = [];
    if (snapshot.reactive_pct >= 30) suggestions.push("Why is my reactive load this high?");
    if (snapshot.carryover_risk_pct >= 30) suggestions.push("What's driving my carryover risk?");
    if (snapshot.reliable_new_work_capacity_pct < 30) suggestions.push("How can I free up reliable capacity?");
    suggestions.push("Plan around this");
    suggestions.push("What should I focus on next?");
    return suggestions.slice(0, 3);
  }, [snapshot]);

  // Data context for tools (bound here)
  const context = {
    blocks,
    snapshot,
    sessions: activeWindowSessions,
    calendarEvents,
    corrections,
    visualContextInsights,
    todayKey,
  };

  useEffect(() => {
    void import("./AgentMarkdown");
  }, []);

  useEffect(() => {
    const refresh = window.setTimeout(() => {
      setBriefing(liveBriefing);
      try {
        window.localStorage.setItem(BRIEFING_STORAGE_KEY, JSON.stringify(liveBriefing));
      } catch {
        // Local persistence is an enhancement, not a prerequisite.
      }
    }, 0);
    return () => window.clearTimeout(refresh);
  }, [liveBriefing]);

  useEffect(() => {
    try {
      window.localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(messages.slice(-200)));
    } catch {
      // Keep the in-memory conversation if storage is full or disabled.
    }
  }, [messages]);

  useEffect(() => {
    try {
      if (input) window.localStorage.setItem(DRAFT_STORAGE_KEY, input);
      else window.localStorage.removeItem(DRAFT_STORAGE_KEY);
    } catch {
      // Draft persistence is best effort.
    }
  }, [input]);

  useEffect(() => {
    const textarea = inputRef.current;
    if (!textarea) return;
    textarea.style.height = "0px";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 144)}px`;
  }, [input]);

  useEffect(() => {
    if (!isSending) {
      setAnalysisStage(0);
      return;
    }
    const timer = window.setInterval(() => {
      setAnalysisStage((current) => Math.min(current + 1, 2));
    }, 850);
    return () => window.clearInterval(timer);
  }, [isSending]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    if (visibleMessageCount === INITIAL_MESSAGE_COUNT) scrollToBottom();
  }, [messages, visibleMessageCount]);

  const visibleMessages = useMemo(
    () => messages.slice(Math.max(0, messages.length - visibleMessageCount)),
    [messages, visibleMessageCount]
  );

  // Helper: resolve a Vercel AI SDK model from aiConfig for direct + local tool execution.
  // Follows Eve agent patterns (defineTool + instructions + generateText loop) but embedded
  // inside the app so tools can close over live app state (blocks, snapshot, etc).
  async function resolveAgentModel(config: AIConfig | null) {
    if (!config?.apiKey?.trim()) return null;
    const provider = config.provider;
    const apiKey = config.apiKey;
    const modelId = config.model || "gpt-4o";
    const baseURL = config.baseUrl ? config.baseUrl.replace(/\/$/, "") : undefined;

    if (provider === "claude") {
      const { createAnthropic } = await import("@ai-sdk/anthropic");
      const anth = createAnthropic({ apiKey, baseURL });
      return anth(modelId);
    }
    // All others (openai / grok / deepseek / custom) via OpenAI-compatible provider.
    // Use "compatible" for 3rd-party / non-strict OpenAI endpoints.
    const isCustomish = provider === "custom" || provider === "grok" || provider === "deepseek";
    const { createOpenAI } = await import("@ai-sdk/openai");
    const openaiProvider = createOpenAI({
      apiKey,
      baseURL,
      compatibility: isCustomish ? "compatible" : "strict",
    });
    return openaiProvider(modelId);
  }

  // Wrap Eve-style tools (inputSchema) for the ai SDK (expects parameters).
  // Execute is rebound to inject our app context (the "ctx" in a real Eve tool).
  // createTool is the `tool` helper from the ai SDK; t is intentionally `any` because Eve
  // tool execute signatures have narrow ctx types (e.g. { snapshot }) that are structurally
  // incompatible with a shared interface, but are always safe at runtime.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function createBoundTools(ctx: typeof context, createTool: typeof AiToolFn) {
    const toAiTool = (t: any) =>
      createTool({
        description: t.description,
        parameters: t.inputSchema ?? t.parameters,
        execute: async (input: Record<string, unknown>) => t.execute(input ?? {}, ctx),
      });

    return {
      getCapacitySnapshot: toAiTool(agentTools.getCapacitySnapshot),
      getWeekWorkload: toAiTool(agentTools.getWeekWorkload),
      getDayActivity: toAiTool(agentTools.getDayActivity),
      getPrimaryFocus: toAiTool(agentTools.getPrimaryFocus),
      getRecentCorrections: toAiTool(agentTools.getRecentCorrections),
      getCalendarSummary: toAiTool(agentTools.getCalendarSummary),
      getVisualInsightsSummary: toAiTool(agentTools.getVisualInsightsSummary),
    } as const;
  }

  // Appends a user turn, then runs the assistant turn over the new history.
  // Used by both typed input and suggested question chips.
  async function sendMessage(messageText: string) {
    if (!messageText.trim() || isSending) return;

    const userMsg: AgentChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: messageText.trim(),
      createdAt: new Date().toISOString(),
    };
    const updated = [...messages, userMsg];
    setMessages(updated);
    setInput("");
    await runAssistantTurn(updated);
  }

  // Streams an assistant reply for a conversation that already ends with a user turn.
  // Uses streamText for live typewriter-like responses (Eve style). An AbortController is
  // threaded into streamText so the Stop button can halt mid-stream and keep partial text.
  async function runAssistantTurn(history: AgentChatMessage[]) {
    setIsSending(true);
    setIsStreaming(false);
    setStreamingMessageId(null);

    const controller = new AbortController();
    abortControllerRef.current = controller;
    // Drives the Rust fallback prompt below if the SDK + grounded paths both fail.
    const latestUserQuestion = [...history].reverse().find((m) => m.role === "user")?.content ?? "";

    try {
      const sdkModel = await resolveAgentModel(aiConfig);

      if (sdkModel) {
        const [{ streamText, tool: createTool }] = await Promise.all([import("ai")]);
        const boundTools = createBoundTools(context, createTool);

        const historyForModel = history
          .filter((m) => m.role === "user" || m.role === "assistant")
          .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

        // Start streaming immediately (model will invoke tools behind the scenes as needed)
        const { textStream } = await streamText({
          model: sdkModel,
          system: AGENT_INSTRUCTIONS,
          messages: historyForModel,
          tools: boundTools,
          maxSteps: 6,
          abortSignal: controller.signal,
        });

        const assistantId = `asst-${Date.now()}`;
        setMessages((prev) => [...prev, {
          id: assistantId,
          role: "assistant",
          content: "",
          createdAt: new Date().toISOString(),
        }]);
        setStreamingMessageId(assistantId);
        setIsStreaming(true);

        let streamed = "";
        try {
          for await (const delta of textStream) {
            streamed += delta;
            setMessages((prev) =>
              prev.map((m) => (m.id === assistantId ? { ...m, content: streamed } : m))
            );
          }
        } catch {
          // User pressed Stop: keep whatever streamed so far, surface no error.
          if (controller.signal.aborted) {
            finalizeAbortedStream(assistantId, streamed);
            return;
          }
          // Partial content + a retryable interruption marker. Don't rethrow — the
          // Retry affordance on this message is the recovery path, so falling through
          // to the outer Rust fallback (a second, redundant reply) is undesirable.
          const interruptedContent = streamed.trim()
            ? streamed + "\n\n(Streaming interrupted)"
            : "I started analyzing your data with tools but the stream was interrupted.";
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId ? { ...m, content: interruptedContent, interrupted: true } : m
            )
          );
          setIsStreaming(false);
          setStreamingMessageId(null);
          return;
        }

        // Stop pressed but the stream ended cleanly: keep partial text, no finalize.
        if (controller.signal.aborted) {
          finalizeAbortedStream(assistantId, streamed);
          return;
        }

        // Guard against completely empty final output from the model
        if (!streamed.trim()) {
          streamed = "I consulted the tools on your tracked data (capacity, workload, focus) but received an empty response. Try rephrasing or verify your AI provider key works for tool-enabled models.";
          setMessages((prev) =>
            prev.map((m) => (m.id === assistantId ? { ...m, content: streamed } : m))
          );
        }

        setMessages((prev) => prev.map((message) =>
          message.id === assistantId
            ? {
                ...message,
                analysisSummary: `Reviewed ${blocks.length} work blocks, ${activeWindowSessions.length} sessions, ${calendarEvents.length} calendar events, and ${corrections.length} corrections.`,
              }
            : message
        ));
        setIsStreaming(false);
        setStreamingMessageId(null);
        return;
      } else {
        // Grounded fallback (no key)
        const top = blocks.slice(0, 3).map((b) => b.project_name).join(", ") || "none yet";
        const capLine = snapshot
          ? `reliable new-work capacity ${snapshot.reliable_new_work_capacity_pct}%, allocated ${snapshot.allocated_pct}% (planned ${snapshot.planned_pct}%, reactive ${snapshot.reactive_pct}%)`
          : "no capacity snapshot yet";
        const fallback = `I don't have an AI provider configured yet. Based on current data: ${capLine}. Top projects in view: ${top}. ${activeWindowSessions.length} active sessions tracked today. Go to Settings → Advanced Settings to add a key (OpenAI, Grok, Claude, DeepSeek, or custom).`;
        setMessages((prev) => [...prev, {
          id: `asst-${Date.now()}`,
          role: "assistant",
          content: fallback,
          createdAt: new Date().toISOString(),
          analysisSummary: `Read ${blocks.length} work blocks and ${activeWindowSessions.length} tracked sessions locally.`,
        }]);
      }
    } catch (e: any) {
      // An abort that surfaced here (rather than inside the stream loop) is a user Stop,
      // not a failure — don't run the fallback or surface an error. The finally block
      // resets the streaming flags.
      if (controller.signal.aborted) return;
      // Best effort fallback via the Rust path, then pure data
      try {
        const historyStr = history.map((m) => `${m.role}: ${m.content}`).join("\n");
        const fallbackPrompt = `You are the ClearCapacity Agent focused only on capacity, workload and weekly focus. Use only the user's data. Conversation so far:\n${historyStr}\n\nLatest user question: ${latestUserQuestion}`;
        const resp = await invoke<{ response?: string }>("chat_with_agent", {
          request: { prompt: fallbackPrompt, ai_config: aiConfig || undefined },
        });
        const text =
          resp?.response ||
          `Capacity snapshot: ${snapshot ? snapshot.reliable_new_work_capacity_pct + "% reliable new-work" : "n/a"}. Focus projects: ${blocks.slice(0, 2).map((b) => b.project_name).join(", ") || "n/a"}.`;
        setMessages((prev) => [...prev, {
          id: `asst-${Date.now()}`,
          role: "assistant",
          content: text,
          createdAt: new Date().toISOString(),
          analysisSummary: `Reviewed available capacity and workload context through the local agent bridge.`,
        }]);
      } catch {
        const errText = `Sorry, the Agent hit an error: ${e?.message || e}. Make sure your AI provider is set in Advanced Settings and you have data for the week.`;
        setMessages((prev) => [...prev, {
          id: `err-${Date.now()}`,
          role: "assistant",
          content: errText,
          createdAt: new Date().toISOString(),
        }]);
      }
    } finally {
      setIsSending(false);
      setIsStreaming(false);
      setStreamingMessageId(null);
      abortControllerRef.current = null;
    }
  }

  // Public handlers
  async function handleSend() {
    await sendMessage(input);
  }

  function handleSuggested(question: string) {
    if (isSending) return;
    void sendMessage(question);
  }

  // Abort the active stream; the partial assistant message stays put, no error surfaced.
  function stopGeneration() {
    abortControllerRef.current?.abort();
  }

  // Settle a stream the user stopped: keep partial text, but drop an empty placeholder so
  // it isn't persisted and replayed to the model as empty assistant content (some providers
  // reject that) and doesn't render as a blank bubble.
  function finalizeAbortedStream(assistantId: string, streamed: string) {
    if (!streamed.trim()) {
      setMessages((prev) => prev.filter((m) => m.id !== assistantId));
    }
    setIsStreaming(false);
    setStreamingMessageId(null);
  }

  // Re-run the assistant turn for an interrupted reply by replaying the history up to
  // (and including) the user turn that triggered it — dropping the failed reply first.
  function retryMessage(assistantId: string) {
    if (isSending) return;
    const index = messages.findIndex((m) => m.id === assistantId);
    if (index === -1) return;
    const history = messages.slice(0, index);
    if (!history.some((m) => m.role === "user")) return;
    setMessages(history);
    void runAssistantTurn(history);
  }

  function clearChat() {
    setMessages([]);
    setVisibleMessageCount(INITIAL_MESSAGE_COUNT);
    setIsStreaming(false);
    setStreamingMessageId(null);
    try {
      window.localStorage.removeItem(CHAT_STORAGE_KEY);
    } catch {
      // The current view is still cleared.
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (!e.shiftKey || e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      void handleSend();
    }
  };

  async function copyMessage(message: AgentChatMessage) {
    try {
      // Non-optional so a missing clipboard (insecure webview) throws into the catch
      // rather than silently no-op'ing while we falsely announce success.
      await navigator.clipboard.writeText(message.content);
      setCopiedMessageId(message.id);
      window.setTimeout(() => setCopiedMessageId(null), 1200);
      pushToast({ tone: "success", message: "Copied to clipboard" });
    } catch {
      pushToast({ tone: "error", message: "Couldn't copy to the clipboard" });
    }
  }

  function loadEarlierMessages() {
    const container = messagesRef.current;
    const previousHeight = container?.scrollHeight || 0;
    setVisibleMessageCount((count) => Math.min(messages.length, count + MESSAGE_PAGE_SIZE));
    requestAnimationFrame(() => {
      if (container) container.scrollTop += container.scrollHeight - previousHeight;
    });
  }

  const capacityTone = briefing.capacity >= 45 ? "steady" : briefing.capacity >= 25 ? "watch" : "risk";
  const riskLabel = briefing.carryoverRisk >= 50 ? "High carryover risk" : briefing.carryoverRisk >= 25 ? "Watch carryover" : "Low carryover risk";
  const analysisSteps = [
    "Reading workload context",
    "Comparing planned and reactive work",
    "Calculating capacity implications",
  ];

  return (
    <section className="screen agent-screen">
      <div className="agent-page-header">
        <div>
          <div className="agent-title-row">
            <span className="agent-title-icon"><Sparkles size={16} /></span>
            <h1>Workload Agent</h1>
          </div>
          <p>Understand your capacity and decide what to work on next.</p>
        </div>
        <div className="agent-header-actions">
          <span className="agent-data-freshness"><span /> Data current · {currentWeekRangeLabel}</span>
        {messages.length > 0 && (
          <button className="secondary-action" onClick={() => setConfirmingClear(true)} title="Clear chat">
            <Trash2 size={16} /> Clear
          </button>
        )}
        </div>
      </div>

      <div className="agent-workspace">
        <section className="agent-briefing" aria-label="Weekly workload briefing">
          <div className="briefing-primary">
            <div
              className={`capacity-orb ${capacityTone}`}
              style={{ "--capacity": briefing.capacity } as CSSProperties}
            >
              <span>{briefing.capacity}%</span>
              <small>reliable</small>
            </div>
            <div>
              <span className="briefing-kicker"><Sparkles size={13} /> This week's intelligence</span>
              <h2>{briefing.capacity}% of your capacity is reliable for new work.</h2>
              <p>Your primary focus is <strong>{briefing.primaryFocus}</strong>. Planned work is {briefing.planned}% and reactive work is {briefing.reactive}%.</p>
            </div>
          </div>
          <div className="briefing-metrics">
            <div title="Share of your tracked work this week that was scheduled or planned ahead of time">
              <span>Planned</span><strong>{briefing.planned}%</strong>
              <span className="sr-only">Share of your tracked work this week that was scheduled or planned ahead of time.</span>
            </div>
            <div title="Share of your tracked work this week that was unplanned — reacting to chats, interruptions, or ad-hoc requests">
              <span>Reactive</span><strong>{briefing.reactive}%</strong>
              <span className="sr-only">Share of your tracked work this week that was unplanned — reacting to chats, interruptions, or ad-hoc requests.</span>
            </div>
            <div title="How likely your unfinished work is to spill into next week, based on this week's load">
              <span>Outlook</span><strong>{riskLabel}</strong>
              <span className="sr-only">How likely your unfinished work is to spill into next week, based on this week's load.</span>
            </div>
          </div>
          <div className="briefing-actions">
            <button type="button" onClick={() => handleSuggested("Explain why my reliable capacity is at its current level.")}>Explain forecast <ArrowRight size={14} /></button>
            <button type="button" onClick={() => handleSuggested("Help me plan my week around my current reliable capacity.")}>Plan my week <ArrowRight size={14} /></button>
          </div>
        </section>

        {messages.length === 0 && !isSending && (
          <section className="agent-starters" aria-label="Suggested agent actions">
            <div className="starter-heading">
              <div><span>Start with an outcome</span><p>The Agent will ground its answer in your tracked work.</p></div>
              <Database size={16} />
            </div>
            <div className="starter-grid">
              {starterActions.map((action) => {
                const Icon = action.icon;
                return (
                  <button key={action.title} type="button" onClick={() => handleSuggested(action.prompt)}>
                    <span className="starter-icon"><Icon size={17} /></span>
                    <span><strong>{action.title}</strong><small>{action.description}</small></span>
                    <ArrowRight size={15} />
                  </button>
                );
              })}
            </div>
          </section>
        )}

        <div className={`agent-chat-container ${messages.length === 0 ? "is-empty" : ""}`}>
        <div className="agent-messages" ref={messagesRef} aria-live="polite">
          {messages.length > visibleMessages.length && (
            <button className="load-earlier-messages" type="button" onClick={loadEarlierMessages}>
              Load {Math.min(MESSAGE_PAGE_SIZE, messages.length - visibleMessages.length)} earlier messages
            </button>
          )}
          {visibleMessages.map((m, idx) => {
            const isCurrentStream = streamingMessageId === m.id;
            return (
              <div key={m.id || idx} className={`agent-message ${m.role}`}>
                <div className="agent-avatar">
                  {m.role === "assistant" ? <Bot size={16} /> : <User size={16} />}
                </div>
                <div className="agent-bubble">
                  <div className={`agent-content ${isCurrentStream ? "streaming" : ""}`}>
                    {m.role === "assistant" ? (
                      <Suspense fallback={<span>{m.content}</span>}>
                        <AgentMarkdown content={m.content} />
                      </Suspense>
                    ) : (
                      m.content
                    )}
                  </div>
                  {!isCurrentStream && m.content && (
                    <div className="agent-message-meta">
                      <time>{m.createdAt ? new Date(m.createdAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : ""}</time>
                      <button
                        type="button"
                        onClick={() => void copyMessage(m)}
                        title={copiedMessageId === m.id ? "Copied" : "Copy response"}
                        aria-label={copiedMessageId === m.id ? "Copied" : "Copy response"}
                      >
                        {copiedMessageId === m.id ? <Check size={13} /> : <Copy size={13} />}
                      </button>
                      {m.role === "assistant" && m.analysisSummary && (
                        <button
                          type="button"
                          onClick={() => setExpandedDetails((value) => ({ ...value, [m.id]: !value[m.id] }))}
                          aria-expanded={Boolean(expandedDetails[m.id])}
                          aria-label="Toggle analysis details"
                        >
                          Analysis <ChevronDown size={13} />
                        </button>
                      )}
                    </div>
                  )}
                  {expandedDetails[m.id] && m.analysisSummary && (
                    <div className="agent-analysis-detail">
                      <Database size={14} />
                      <span>{m.analysisSummary}</span>
                    </div>
                  )}
                  {!isCurrentStream && m.role === "assistant" && m.interrupted && (
                    <div className="agent-retry-row">
                      <button
                        type="button"
                        className="agent-retry-button"
                        onClick={() => retryMessage(m.id)}
                        disabled={isSending}
                      >
                        <RotateCcw size={13} /> Retry
                      </button>
                    </div>
                  )}
                  {!isCurrentStream &&
                    m.role === "assistant" &&
                    m.content &&
                    !m.interrupted &&
                    !isSending &&
                    idx === visibleMessages.length - 1 &&
                    followUpSuggestions.length > 0 && (
                      <div className="agent-followups" aria-label="Suggested follow-up questions">
                        {followUpSuggestions.map((question) => (
                          <button
                            key={question}
                            type="button"
                            className="agent-followup-chip"
                            onClick={() => handleSuggested(question)}
                          >
                            {question} <ArrowRight size={12} />
                          </button>
                        ))}
                      </div>
                    )}
                </div>
              </div>
            );
          })}

          {isSending && !streamingMessageId && (
            <div className="agent-progress" role="status">
              <div className="agent-progress-head">
                <span className="agent-pulse"><BrainCircuit size={15} /></span>
                <div><strong>Working through your workload</strong><small>Using local activity, calendar, blocks, and corrections</small></div>
              </div>
              <div className="agent-progress-steps">
                {analysisSteps.map((step, index) => (
                  <div className={index < analysisStage ? "is-complete" : index === analysisStage ? "is-active" : ""} key={step}>
                    <span>{index < analysisStage ? <Check size={11} /> : index + 1}</span>{step}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        <div className="agent-composer-shell">
        <div className="agent-input-area">
          <span className="agent-attach" role="img" title="Context is attached automatically" aria-label="Workload context attached">
            <Paperclip size={17} />
          </span>
          <textarea
            ref={inputRef}
            className="agent-input"
            placeholder="Ask about your capacity, focus, or what to do next…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isSending}
            rows={1}
          />
          {isStreaming ? (
            <button
              className="agent-send agent-stop"
              onClick={stopGeneration}
              title="Stop generating"
              aria-label="Stop generating"
            >
              <Square size={15} />
            </button>
          ) : (
            <button
              className="agent-send"
              onClick={handleSend}
              disabled={!input.trim() || isSending}
              title="Send"
              aria-label="Send message"
            >
              <Send size={16} />
            </button>
          )}
        </div>
        <div className="agent-composer-meta">
          <span><Gauge size={13} /> Using activity, calendar, blocks, and corrections</span>
          <span><kbd>Enter</kbd> send · <kbd>Shift ↵</kbd> new line</span>
        </div>
        </div>
        </div>
      </div>

      {confirmingClear && (
        <ConfirmDialog
          title="Clear this conversation?"
          description="This clears this saved conversation from your device. It can't be undone."
          confirmLabel="Clear conversation"
          onConfirm={() => {
            setConfirmingClear(false);
            clearChat();
          }}
          onCancel={() => setConfirmingClear(false)}
        />
      )}
    </section>
  );
}
