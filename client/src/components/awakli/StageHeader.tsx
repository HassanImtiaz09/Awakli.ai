/**
 * StageHeader — derives the stage numeral from the STAGES array index.
 *
 * Single source of truth: reordering STAGES in CreateWizardLayout
 * automatically updates every visible header without per-page edits.
 */
import { STAGES, type StageKey } from "@/layouts/CreateWizardLayout";
import type { LucideIcon } from "lucide-react";

interface StageHeaderProps {
  /** The stage key matching STAGES[].key */
  stageKey: StageKey;
  /** Override label (e.g. "Anime Setup" instead of "Setup") */
  label?: string;
  /** Icon to render before the numeral */
  icon?: LucideIcon;
  /** Additional CSS classes for the container */
  className?: string;
}

/**
 * Renders "STAGE 0X — LABEL" where X is derived from the stage's
 * position in the canonical STAGES array (1-indexed).
 */
export function StageHeader({
  stageKey,
  label,
  icon: Icon,
  className = "",
}: StageHeaderProps) {
  const index = STAGES.findIndex((s) => s.key === stageKey);
  const numeral = String(index + 1).padStart(2, "0");
  const stage = STAGES[index];
  const displayLabel = label ?? stage?.label ?? stageKey;

  return (
    <div
      className={`flex items-center gap-2 text-xs font-semibold uppercase tracking-widest ${className}`}
      data-component="stage-header"
      data-stage={stageKey}
      data-stage-numeral={numeral}
    >
      {Icon && <Icon className="w-3.5 h-3.5" />}
      Stage {numeral} — {displayLabel}
    </div>
  );
}

export default StageHeader;
