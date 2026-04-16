/**
 * Scene-Aware Auto-Transitions
 *
 * Automatically assigns transitions based on scene structure:
 * - Scene boundaries (different sceneNumber) → fade through black (0.8s)
 * - Within same scene (same sceneNumber) → cross-dissolve (0.5s)
 * - Last panel of episode → cut (no transition needed after final panel)
 *
 * This gives creators sensible defaults without manual configuration.
 */

export type TransitionAssignment = {
  panelId: number;
  panelNumber: number;
  sceneNumber: number;
  transition: "cut" | "fade" | "dissolve" | "cross-dissolve";
  transitionDuration: number;
  reason: "scene_boundary" | "within_scene" | "last_panel";
};

export type AutoTransitionSummary = {
  totalPanels: number;
  sceneBoundaries: number;
  withinScene: number;
  lastPanel: number;
  assignments: TransitionAssignment[];
};

/**
 * Defaults for auto-transition assignment.
 * Scene boundaries get a longer fade to signal the location/time change.
 * Within-scene panels get a shorter cross-dissolve for smooth continuity.
 */
export const AUTO_TRANSITION_DEFAULTS = {
  sceneBoundary: {
    transition: "fade" as const,
    duration: 0.8,
  },
  withinScene: {
    transition: "cross-dissolve" as const,
    duration: 0.5,
  },
};

export interface PanelForAutoTransition {
  id: number;
  panelNumber: number;
  sceneNumber: number;
}

/**
 * Compute scene-aware transition assignments for an ordered list of panels.
 *
 * Rules:
 * 1. If the next panel has a different sceneNumber → fade (scene boundary)
 * 2. If the next panel has the same sceneNumber → cross-dissolve (within scene)
 * 3. The last panel always gets "cut" (nothing follows it)
 */
export function computeAutoTransitions(
  panels: PanelForAutoTransition[]
): AutoTransitionSummary {
  if (panels.length === 0) {
    return {
      totalPanels: 0,
      sceneBoundaries: 0,
      withinScene: 0,
      lastPanel: 0,
      assignments: [],
    };
  }

  const assignments: TransitionAssignment[] = [];
  let sceneBoundaries = 0;
  let withinScene = 0;

  for (let i = 0; i < panels.length; i++) {
    const panel = panels[i];
    const isLast = i === panels.length - 1;

    if (isLast) {
      // Last panel — cut (no transition after it)
      assignments.push({
        panelId: panel.id,
        panelNumber: panel.panelNumber,
        sceneNumber: panel.sceneNumber,
        transition: "cut",
        transitionDuration: 0.5,
        reason: "last_panel",
      });
    } else {
      const nextPanel = panels[i + 1];
      const isBoundary = panel.sceneNumber !== nextPanel.sceneNumber;

      if (isBoundary) {
        // Scene boundary — fade through black
        assignments.push({
          panelId: panel.id,
          panelNumber: panel.panelNumber,
          sceneNumber: panel.sceneNumber,
          transition: AUTO_TRANSITION_DEFAULTS.sceneBoundary.transition,
          transitionDuration: AUTO_TRANSITION_DEFAULTS.sceneBoundary.duration,
          reason: "scene_boundary",
        });
        sceneBoundaries++;
      } else {
        // Same scene — cross-dissolve
        assignments.push({
          panelId: panel.id,
          panelNumber: panel.panelNumber,
          sceneNumber: panel.sceneNumber,
          transition: AUTO_TRANSITION_DEFAULTS.withinScene.transition,
          transitionDuration: AUTO_TRANSITION_DEFAULTS.withinScene.duration,
          reason: "within_scene",
        });
        withinScene++;
      }
    }
  }

  return {
    totalPanels: panels.length,
    sceneBoundaries,
    withinScene,
    lastPanel: panels.length > 0 ? 1 : 0,
    assignments,
  };
}
