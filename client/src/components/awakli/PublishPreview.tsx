/**
 * PublishPreview — Scrolling feed preview of the finished manga episode.
 *
 * Auto-composes panels into pages (1-4 panels per page based on aspect).
 * Renders a vertical scroll of manga-style pages.
 */
import { useMemo, useEffect } from "react";
import { motion } from "framer-motion";
import { BookOpen, Eye } from "lucide-react";

export interface PreviewPanel {
  id: number;
  panelNumber: number;
  imageUrl: string;
  compositeImageUrl?: string | null;
  cameraAngle?: string | null;
}

export interface MangaPage {
  pageNumber: number;
  panels: PreviewPanel[];
  layout: "single" | "double" | "triple" | "quad";
}

interface PublishPreviewProps {
  panels: PreviewPanel[];
  episodeTitle?: string;
  showWatermark?: boolean;
  onPreviewShown?: () => void;
}

/**
 * Compose panels into manga pages (1-4 panels per page).
 * Uses a simple heuristic: wide shots get full pages, close-ups are grouped.
 */
export function composePanelsIntoPages(panels: PreviewPanel[]): MangaPage[] {
  const pages: MangaPage[] = [];
  let i = 0;
  let pageNum = 1;

  while (i < panels.length) {
    const current = panels[i];
    const remaining = panels.length - i;

    // Wide shots or establishing shots get full pages
    if (current.cameraAngle === "wide" || current.cameraAngle === "establishing") {
      pages.push({ pageNumber: pageNum++, panels: [current], layout: "single" });
      i++;
    }
    // If only 1 panel left, single page
    else if (remaining === 1) {
      pages.push({ pageNumber: pageNum++, panels: [current], layout: "single" });
      i++;
    }
    // If 2 panels left, double page
    else if (remaining === 2) {
      pages.push({
        pageNumber: pageNum++,
        panels: [panels[i], panels[i + 1]],
        layout: "double",
      });
      i += 2;
    }
    // If 3 panels left, triple page
    else if (remaining === 3) {
      pages.push({
        pageNumber: pageNum++,
        panels: [panels[i], panels[i + 1], panels[i + 2]],
        layout: "triple",
      });
      i += 3;
    }
    // Default: group 2-4 panels per page based on camera angles
    else {
      const next = panels[i + 1];
      const nextNext = panels[i + 2];

      // Two close-ups → double
      if (current.cameraAngle === "close-up" && next?.cameraAngle === "close-up") {
        pages.push({
          pageNumber: pageNum++,
          panels: [current, next],
          layout: "double",
        });
        i += 2;
      }
      // Three medium shots → triple
      else if (
        current.cameraAngle === "medium" &&
        next?.cameraAngle === "medium" &&
        nextNext?.cameraAngle === "medium"
      ) {
        pages.push({
          pageNumber: pageNum++,
          panels: [current, next, nextNext],
          layout: "triple",
        });
        i += 3;
      }
      // Default: double page
      else {
        pages.push({
          pageNumber: pageNum++,
          panels: [current, next],
          layout: "double",
        });
        i += 2;
      }
    }
  }

  return pages;
}

export function PublishPreview({
  panels,
  episodeTitle,
  showWatermark = false,
  onPreviewShown,
}: PublishPreviewProps) {
  const pages = useMemo(() => composePanelsIntoPages(panels), [panels]);

  useEffect(() => {
    if (pages.length > 0 && onPreviewShown) {
      onPreviewShown();
    }
  }, [pages.length, onPreviewShown]);

  if (panels.length === 0) {
    return (
      <div className="max-w-2xl mx-auto p-6 rounded-2xl bg-white/[0.02] border border-white/[0.04] text-center">
        <BookOpen className="w-10 h-10 text-white/10 mx-auto mb-3" />
        <p className="text-white/30 text-sm">No panels to preview yet.</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-2 bg-white/[0.02] p-6 rounded-2xl">
      {/* Episode title header */}
      {episodeTitle && (
        <div className="text-center pb-4 border-b border-white/[0.04] mb-4">
          <p className="text-white/50 text-xs uppercase tracking-widest mb-1">
            <Eye className="w-3 h-3 inline mr-1" />
            Preview
          </p>
          <h3 className="text-lg font-bold text-white/80">{episodeTitle}</h3>
        </div>
      )}

      {/* Pages */}
      {pages.map((page, idx) => (
        <motion.div
          key={page.pageNumber}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: idx * 0.05, duration: 0.3 }}
          className="aspect-[2/3] bg-[#F5F0E8] shadow-[0_2px_12px_rgba(0,0,0,0.3)] rounded-lg overflow-hidden relative"
        >
          <PageLayout page={page} />

          {/* Page number */}
          <div className="absolute bottom-2 right-3 text-[10px] text-black/20 font-mono">
            {page.pageNumber}
          </div>
        </motion.div>
      ))}

      {/* Watermark on last page */}
      {showWatermark && pages.length > 0 && (
        <div className="text-center py-2">
          <span className="text-[10px] text-white/15 font-medium tracking-wider">
            Made with Awakli
          </span>
        </div>
      )}
    </div>
  );
}

// ─── Page layout renderer ─────────────────────────────────────────────────

function PageLayout({ page }: { page: MangaPage }) {
  switch (page.layout) {
    case "single":
      return (
        <img
          src={page.panels[0].compositeImageUrl || page.panels[0].imageUrl}
          alt={`Panel ${page.panels[0].panelNumber}`}
          className="w-full h-full object-cover"
        />
      );

    case "double":
      return (
        <div className="grid grid-rows-2 h-full gap-px bg-black/10">
          {page.panels.map((p) => (
            <img
              key={p.id}
              src={p.compositeImageUrl || p.imageUrl}
              alt={`Panel ${p.panelNumber}`}
              className="w-full h-full object-cover"
            />
          ))}
        </div>
      );

    case "triple":
      return (
        <div className="grid grid-rows-[1fr_1fr_1fr] h-full gap-px bg-black/10">
          {page.panels.map((p) => (
            <img
              key={p.id}
              src={p.compositeImageUrl || p.imageUrl}
              alt={`Panel ${p.panelNumber}`}
              className="w-full h-full object-cover"
            />
          ))}
        </div>
      );

    case "quad":
      return (
        <div className="grid grid-cols-2 grid-rows-2 h-full gap-px bg-black/10">
          {page.panels.map((p) => (
            <img
              key={p.id}
              src={p.compositeImageUrl || p.imageUrl}
              alt={`Panel ${p.panelNumber}`}
              className="w-full h-full object-cover"
            />
          ))}
        </div>
      );

    default:
      return null;
  }
}
