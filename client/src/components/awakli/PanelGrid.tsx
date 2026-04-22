/**
 * PanelGrid — Responsive grid of PanelTile components.
 *
 * Renders a 2-col (mobile) / 3-col (tablet) / 4-col (desktop) grid
 * with shimmer placeholders for panels not yet generated.
 */
import { PanelTile, type PanelTileData } from "./PanelTile";

interface PanelGridProps {
  panels: PanelTileData[];
  totalExpected: number;
  newPanelIds: Set<number>;
  onRedraw: (panelId: number) => void;
  onOpen: (panelId: number) => void;
}

export function PanelGrid({
  panels,
  totalExpected,
  newPanelIds,
  onRedraw,
  onOpen,
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
    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
      {panels.map((panel) => (
        <PanelTile
          key={panel.id}
          panel={panel}
          isNew={newPanelIds.has(panel.id)}
          onRedraw={onRedraw}
          onOpen={onOpen}
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
