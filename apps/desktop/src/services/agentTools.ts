import { z } from "zod";
import type {
  WorkBlock,
  ActivitySession,
  OutlookCalendarEvent,
  UserCorrection,
  VisualContextInsight,
  WeeklyCapacitySnapshot,
} from "../../../../packages/domain/src/models";
import { pct } from "../lib/format";

/**
 * Local stand-in for Eve's defineTool (from "eve/tools").
 * Matches Eve authoring exactly: description + inputSchema + execute(input, ctx).
 * In a full Eve project these would live under agent/tools/*.ts and be auto-discovered.
 * Here we co-locate them to embed the Agent experience inside the desktop app while following the same conventions.
 */
export function defineTool<T extends { description: string; inputSchema: any; execute: any }>(tool: T) {
  return tool;
}

export const getCapacitySnapshot = defineTool({
  description: "Get the current week's capacity snapshot including reliable new-work capacity, planned vs reactive breakdown, and key metrics.",
  inputSchema: z.object({}),
  execute: async ({}: {}, { snapshot }: { snapshot: WeeklyCapacitySnapshot }) => {
    return {
      reliableNewWorkCapacityPct: snapshot.reliable_new_work_capacity_pct,
      allocatedPct: snapshot.allocated_pct,
      plannedPct: snapshot.planned_pct,
      reactivePct: snapshot.reactive_pct,
      meetingPct: snapshot.meeting_pct,
      deepWorkPct: snapshot.deep_work_pct,
      fragmentedWorkPct: snapshot.fragmented_work_pct,
      carryoverRiskPct: snapshot.carryover_risk_pct,
      contextSwitchScore: snapshot.context_switch_score,
      wipLoadScore: snapshot.wip_load_score,
      summaryConfidence: snapshot.summary_confidence,
    };
  },
});

export const getWeekWorkload = defineTool({
  description: "Summarize the week's work blocks: top projects by capacity, categories, modes (deep/reactive), verified status.",
  inputSchema: z.object({}),
  execute: async ({}: {}, { blocks }: { blocks: WorkBlock[] }) => {
    const byProject = blocks.reduce((acc, b) => {
      acc[b.project_name] = (acc[b.project_name] || 0) + b.estimated_capacity_pct;
      return acc;
    }, {} as Record<string, number>);
    const topProjects = Object.entries(byProject)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([p, c]) => ({ project: p, capacityPct: Math.round(c) }));
    const byCategory = blocks.reduce((acc, b) => {
      acc[b.category] = (acc[b.category] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    return {
      totalBlocks: blocks.length,
      topProjects,
      categories: byCategory,
      verifiedCount: blocks.filter(b => b.user_verified).length,
    };
  },
});

export const getDayActivity = defineTool({
  description: "Get summary of today's active window sessions and recent blocks (filter by current day key).",
  inputSchema: z.object({ todayKey: z.string().optional() }),
  execute: async ({ todayKey }: { todayKey?: string }, { sessions, blocks }: { sessions: ActivitySession[]; blocks: WorkBlock[] }) => {
    const todaySessions = sessions.filter(s => {
      const d = new Date(s.start_time);
      return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` === todayKey;
    });
    const totalMin = todaySessions.reduce((sum, s) => sum + s.duration_minutes, 0);
    const topApps = todaySessions.reduce((acc, s) => {
      acc[s.app_name] = (acc[s.app_name] || 0) + s.duration_minutes;
      return acc;
    }, {} as Record<string, number>);
    const top = Object.entries(topApps).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([a,m])=>({app:a, min:m}));
    return { totalMinutes: totalMin, topApps: top, sessionCount: todaySessions.length };
  },
});

export const getPrimaryFocus = defineTool({
  description: "Infer primary focus areas for the week from blocks: highest capacity projects and categories.",
  inputSchema: z.object({}),
  execute: async ({}: {}, { blocks }: { blocks: WorkBlock[] }) => {
    const byProject: Record<string, number> = {};
    blocks.forEach(b => { byProject[b.project_name] = (byProject[b.project_name]||0) + b.estimated_capacity_pct; });
    const top = Object.entries(byProject).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([p,c]) => ({project:p, capacityPct:Math.round(c)}));
    return { topProjects: top };
  },
});

export const getRecentCorrections = defineTool({
  description: "List recent user corrections and adjustments for workload understanding.",
  inputSchema: z.object({ limit: z.number().default(5) }),
  execute: async ({ limit }: { limit: number }, { corrections }: { corrections: UserCorrection[] }) => {
    return corrections.slice(0, limit).map(c => ({ field: c.field, old: c.old_value, new: c.new_value, reason: c.reason }));
  },
});

export const getCalendarSummary = defineTool({
  description: "Summarize calendar events for the week: number of meetings, total hours, and any heavy meeting days impacting capacity.",
  inputSchema: z.object({}),
  execute: async ({}: {}, { calendarEvents }: { calendarEvents: OutlookCalendarEvent[] }) => {
    const totalEvents = calendarEvents.length;
    const totalMinutes = calendarEvents.reduce((sum, e) => {
      const start = new Date(e.start_time).getTime();
      const end = new Date(e.end_time).getTime();
      return sum + Math.max(0, (end - start) / 60000);
    }, 0);
    const byDay: Record<string, number> = {};
    calendarEvents.forEach(e => {
      const d = new Date(e.start_time);
      const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
      byDay[key] = (byDay[key] || 0) + 1;
    });
    const topDays = Object.entries(byDay).sort((a,b)=>b[1]-a[1]).slice(0,3);
    return {
      totalEvents,
      totalHours: Math.round(totalMinutes / 60 * 10) / 10,
      topMeetingDays: topDays.map(([day, count]) => ({ day, count })),
    };
  },
});

export const getVisualInsightsSummary = defineTool({
  description: "Summarize recent visual context insights (screenshots of work) for activity patterns, tools used, and categories observed.",
  inputSchema: z.object({ limit: z.number().default(5) }),
  execute: async ({ limit }: { limit: number }, { visualContextInsights }: { visualContextInsights: VisualContextInsight[] }) => {
    const recent = visualContextInsights.slice(0, limit);
    const categories: Record<string, number> = {};
    const tools: Record<string, number> = {};
    recent.forEach(i => {
      if (i.likely_work_category) categories[i.likely_work_category] = (categories[i.likely_work_category] || 0) + 1;
      if (i.visible_tool) tools[i.visible_tool] = (tools[i.visible_tool] || 0) + 1;
    });
    return {
      count: recent.length,
      recentSummaries: recent.map(i => ({
        app: i.app_name,
        summary: i.activity_summary,
        tool: i.visible_tool,
        category: i.likely_work_category,
        confidence: i.confidence,
      })),
      categoryCounts: categories,
      commonTools: Object.entries(tools).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([t,c]) => ({tool: t, count: c})),
    };
  },
});

// For the AI SDK, we can export tools array or use directly.
export const agentTools = {
  getCapacitySnapshot,
  getWeekWorkload,
  getDayActivity,
  getPrimaryFocus,
  getRecentCorrections,
  getCalendarSummary,
  getVisualInsightsSummary,
};

/**
 * Eve-style instructions (equivalent to agent/instructions.md).
 * Kept here so the embedded Agent chat has focused, always-on guidance.
 */
export const AGENT_INSTRUCTIONS = `You are the ClearCapacity Agent.

Your job is to help the user understand and explain:
- Their capacity (reliable new-work % and drivers)
- Current workload (today + this week: blocks, sessions, calendar events, visual activity insights, categories)
- Primary focus for the week (top projects and areas)

Rules:
- Always call tools first to read live facts from the user's data before answering.
- Be specific: cite exact percentages, project names, app minutes, verified vs draft counts.
- If data is missing or thin, say so and note what would improve the picture.
- Stay strictly within the tracked workload domain. Do not give generic productivity advice.
- When the user asks "what have I been working on", "where is my time going", or "what is my focus", lead with tool-backed numbers and project lists.`;
