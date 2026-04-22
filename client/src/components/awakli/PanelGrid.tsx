/**
 * PanelGrid — Responsive grid of PanelTile components.
 *
 * Renders a 2-col (mobile) / 3-col (tablet) / 4-col (desktop) grid
 * with shimmer placeholders for panels not yet generated.
 *
 * Supports selection mode for batch operations and flagged state
 * for consistency report highlighting.
 */
import { PanelTile, type PanelTileData } from "./PanelTile";

interface PanelGridProps {
  panels: PanelTileData[];
  totalExpected: number;
  newPanelIds: Set<number>;
  onRedraw: (panelId: number) => void;
  onOpen: (panelId: number) => void;
  /** Set of selected panel IDs for batch operations */
  selectedIds?: Set<number>;
  /** Set of flagged panel IDs from consistency report */
  flaggedIds?: Set<number>;
  /** Whether selection mode is active */
  selectionMode?: boolean;
  /** Callback to toggle selection on a panel */
  onToggleSelect?: (panelId: number) => void;
}

export function PanelGrid({
  panels,
  totalExpected,
  newPanelIds,
  onRedraw,
  onOpen,
  selectedIds = new Set(),
  flaggedIds = new Set(),
  selectionMode = false,
  onToggleSelect,
}: PanelGridProps) {
  // Build the grid: real panels + shimmer placeholders for remaining
  const placeholderCount = Math.max(0, totalExpected - panels.length);
  const placeholders = Array.from({ length: placeholderCount }, (_, i) => ({
    id: -(i + 1),
    panelNumber: panels.length + i + 1,
    status: "draft" as const,
    imageUrl: null,
    compositeImageUrl: null,
  }));

  return (
    <div data-component="panel-grid" className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
      {panels.map((panel) => (
        <PanelTile
          key={panel.id}
          panel={panel}
          isNew={newPanelIds.has(panel.id)}
          isSelected={selectedIds.has(panel.id)}
          isFlagged={flaggedIds.has(panel.id)}
          selectionMode={selectionMode}
          onRedraw={onRedraw}
          onOpen={onOpen}
          onToggleSelect={onToggleSelect}
        />
      ))}
      {placeholders.map((ph) => (
        <PanelTile
          key={ph.id}
          panel={ph}
          onRedraw={() => {}}
          onOpen={() => {}}
        />
      ))}
    </div>
  );
}
