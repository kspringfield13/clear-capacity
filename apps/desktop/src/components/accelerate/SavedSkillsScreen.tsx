import { useState } from "react";
import {
  Check,
  Copy,
  Download,
  FileCode2,
  Library,
  Lightbulb,
  Rocket,
  Trash2,
  Workflow,
  Wrench,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { AccelerationPlayType, SavedSkill } from "../../../../../packages/domain/src/models";
import type { Screen } from "../../lib/types";
import { accelerationTypeLabel, formatAuditTime } from "../../lib/format";
import {
  downloadTextFile,
  exportFilename,
  exportMimeType,
  serializeSavedSkills,
  serializeSavedSkillAsSkillMd,
  serializeSavedSkillsAsSkillBundle,
} from "../../lib/dataExport";
import type { PushToast } from "../../hooks/useToasts";
import { EmptyState } from "../common/EmptyState";

const TYPE_ICONS: Record<AccelerationPlayType, LucideIcon> = {
  automate: Workflow,
  tool: Wrench,
  technique: Lightbulb,
};

function SavedSkillCard({
  skill,
  onRemove,
  pushToast,
}: {
  skill: SavedSkill;
  onRemove: (signalId: string) => void;
  pushToast: PushToast;
}) {
  const Icon = TYPE_ICONS[skill.play_type];
  const [copied, setCopied] = useState(false);
  const [copiedSkillMd, setCopiedSkillMd] = useState(false);

  async function copyRecipe() {
    try {
      // Non-optional so a missing clipboard (insecure webview) throws into the catch
      // rather than silently no-op'ing while we falsely announce success.
      await navigator.clipboard.writeText(skill.recipe);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
      pushToast({ tone: "success", message: "Recipe copied to clipboard" });
    } catch {
      pushToast({ tone: "error", message: "Couldn't copy to the clipboard" });
    }
  }

  async function copySkillMd() {
    try {
      await navigator.clipboard.writeText(serializeSavedSkillAsSkillMd(skill));
      setCopiedSkillMd(true);
      window.setTimeout(() => setCopiedSkillMd(false), 1200);
      pushToast({ tone: "success", message: "SKILL.md copied — paste into .claude/skills/<name>/SKILL.md" });
    } catch {
      pushToast({ tone: "error", message: "Couldn't copy to the clipboard" });
    }
  }

  function remove() {
    onRemove(skill.signal_id);
    pushToast({ tone: "info", message: `Removed "${skill.title}" from your skills library` });
  }

  return (
    <article className="saved-skill-card">
      <div className="play-header">
        <span className={`play-type-chip ${skill.play_type}`}>
          <Icon size={13} aria-hidden />
          <span>{accelerationTypeLabel(skill.play_type)}</span>
        </span>
        <span className="saved-skill-meta" title={`Saved ${formatAuditTime(skill.saved_at)}`}>
          Saved {formatAuditTime(skill.saved_at)}
          <span className="sr-only"> · estimated ~{skill.estimated_minutes_saved_per_week} min saved per week</span>
        </span>
      </div>
      <h3 className="play-title">{skill.title}</h3>
      {skill.detail && <p className="play-detail">{skill.detail}</p>}
      <pre className="saved-skill-recipe">{skill.recipe}</pre>
      {skill.recommended_tools.length > 0 && (
        <div className="play-tools">
          <span className="play-tools-label">Recommended tools</span>
          <ul className="play-tool-chips">
            {skill.recommended_tools.map((tool) => (
              <li key={tool} className="play-tool-chip">
                {tool}
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="play-recipe-actions">
        <button
          type="button"
          className="play-recipe-action"
          title={copied ? "Copied" : "Copy this recipe to the clipboard"}
          aria-label={copied ? "Recipe copied to clipboard" : "Copy this recipe to the clipboard"}
          onClick={() => void copyRecipe()}
        >
          {copied ? <Check size={13} aria-hidden /> : <Copy size={13} aria-hidden />}
          <span>{copied ? "Copied" : "Copy"}</span>
        </button>
        <button
          type="button"
          className="play-recipe-action"
          title={copiedSkillMd ? "Copied" : "Copy as an Agent Skill (SKILL.md, ready for .claude/skills/)"}
          aria-label={copiedSkillMd ? "SKILL.md copied to clipboard" : "Copy as an Agent Skill SKILL.md file"}
          onClick={() => void copySkillMd()}
        >
          {copiedSkillMd ? <Check size={13} aria-hidden /> : <FileCode2 size={13} aria-hidden />}
          <span>{copiedSkillMd ? "Copied" : "SKILL.md"}</span>
        </button>
        <button
          type="button"
          className="play-recipe-action"
          title="Remove this skill from your library"
          aria-label={`Remove ${skill.title} from your library`}
          onClick={remove}
        >
          <Trash2 size={13} aria-hidden />
          <span>Remove</span>
        </button>
      </div>
    </article>
  );
}

export function SavedSkillsScreen({
  savedSkills,
  onRemoveSkill,
  onOpenScreen,
  pushToast,
}: {
  savedSkills: SavedSkill[];
  onRemoveSkill: (signalId: string) => void;
  onOpenScreen: (screen: Screen) => void;
  pushToast: PushToast;
}) {
  // Newest first so the most recently saved skill is at the top.
  const ordered = [...savedSkills].sort((left, right) => right.saved_at.localeCompare(left.saved_at));

  function handleExport() {
    const content = serializeSavedSkills(ordered, "json");
    downloadTextFile(exportFilename("saved_skills", "json"), content, exportMimeType("json"));
    pushToast({ tone: "success", message: `Exported ${ordered.length} saved ${ordered.length === 1 ? "skill" : "skills"}` });
  }

  function handleExportSkills() {
    const now = new Date();
    const stamp = now.toISOString().slice(0, 19).replace(/[:T]/g, "-");
    const content = serializeSavedSkillsAsSkillBundle(ordered, now);
    downloadTextFile(`clear-capacity-agent-skills-${stamp}.md`, content, "text/markdown");
    pushToast({
      tone: "success",
      message: `Exported ${ordered.length} Agent ${ordered.length === 1 ? "Skill" : "Skills"} (SKILL.md)`,
    });
  }

  if (savedSkills.length === 0) {
    return (
      <section className="screen saved-skills-screen">
        <div className="screen-header">
          <div>
            <p className="eyebrow">Saved skills</p>
            <h1>No saved skills yet.</h1>
          </div>
        </div>
        <EmptyState
          icon={Library}
          title="Your skills library is empty."
          description="Generate skill recipes on the Acceleration screen (with an AI key), then use “Save to library” on any recipe to keep it here — reusable beyond this session."
        >
          <button className="primary-action" type="button" onClick={() => onOpenScreen("accelerate")}>
            <Rocket size={16} />
            <span>Open Acceleration</span>
          </button>
        </EmptyState>
      </section>
    );
  }

  return (
    <section className="screen saved-skills-screen">
      <div className="screen-header">
        <div>
          <p className="eyebrow">Saved skills</p>
          <h1>Your reusable skill recipes.</h1>
          <p className="screen-subhead">
            {ordered.length} saved {ordered.length === 1 ? "recipe" : "recipes"}, snapshotted from your
            acceleration plays so they survive regeneration. Copy one into your AI tool, export the set,
            or export as Agent Skills (SKILL.md) to run them in Claude.
          </p>
        </div>
        <div className="header-actions">
          <button type="button" className="secondary-action" onClick={handleExportSkills}>
            <FileCode2 size={16} />
            <span>Export as Agent Skills</span>
          </button>
          <button type="button" className="secondary-action" onClick={handleExport}>
            <Download size={16} />
            <span>Export JSON</span>
          </button>
        </div>
      </div>
      <div className="play-grid">
        {ordered.map((skill) => (
          <SavedSkillCard
            key={skill.signal_id}
            skill={skill}
            onRemove={onRemoveSkill}
            pushToast={pushToast}
          />
        ))}
      </div>
    </section>
  );
}
