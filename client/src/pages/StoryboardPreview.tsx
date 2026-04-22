import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { motion, AnimatePresence } from "framer-motion";
import { useParams, useLocation } from "wouter";
import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  Play, Pause, SkipForward, SkipBack, Maximize2, Minimize2,
  Download, ChevronLeft, ChevronRight, Loader2, BookOpen, Monitor, X
} from "lucide-react";
import { toast } from "sonner";
import { getLoginUrl } from "@/const";

type StoryboardPanel = {
  id: number;
  episodeId: number;
  sceneNumber: number;
  panelNumber: number;
  visualDescription: string | null;
  cameraAngle: string | null;
  dialogue: { character: string; text: string; emotion: string }[] | null;
  sfx: string | null;
  imageUrl: string | null;
  compositeImageUrl: string | null;
  status: string;
};

export default function StoryboardPreview() {
  const { projectId } = useParams<{ projectId: string }>();
  const pid = Number(projectId);
  const { user, loading: authLoading } = useAuth();
  const [, navigate] = useLocation();
  const [mode, setMode] = useState<"reader" | "slideshow">("reader");
  const [activeEpisodeId, setActiveEpisodeId] = useState<number | null>(null);
  const [slideshowIndex, setSlideshowIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [autoAdvanceDelay, setAutoAdvanceDelay] = useState(4000);
  const [showDialogue, setShowDialogue] = useState(true);
  const [typewriterText, setTypewriterText] = useState("");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data: project } = trpc.projects.get.useQuery({ id: pid }, { enabled: !!user && !!pid });
  const { data: episodes } = trpc.episodes.listByProject.useQuery(
    { projectId: pid },
    { enabled: !!user && !!pid }
  );

  useEffect(() => {
    if (episodes && episodes.length > 0 && !activeEpisodeId) {
      setActiveEpisodeId(episodes[0].id);
    }
  }, [episodes, activeEpisodeId]);

  const { data: rawPanels } = trpc.panels.listByEpisode.useQuery(
    { episodeId: activeEpisodeId! },
    { enabled: !!activeEpisodeId }
  );

  const panels = useMemo(() => {
    if (!rawPanels) return [];
    return (rawPanels as StoryboardPanel[])
      .filter((p) => p.imageUrl && (p.status === "approved" || p.status === "generated"))
      .sort((a, b) => a.sceneNumber - b.sceneNumber || a.panelNumber - b.panelNumber);
  }, [rawPanels]);

  // Group panels by scene for reader layout
  const scenes = useMemo(() => {
    const map = new Map<number, StoryboardPanel[]>();
    panels.forEach((p) => {
      const arr = map.get(p.sceneNumber) || [];
      arr.push(p);
      map.set(p.sceneNumber, arr);
    });
    return Array.from(map.entries()).sort((a, b) => a[0] - b[0]);
  }, [panels]);

  // Current slideshow panel
  const currentPanel = panels[slideshowIndex];

  // Typewriter effect for dialogue
  useEffect(() => {
    if (mode !== "slideshow" || !currentPanel?.dialogue || !showDialogue) {
      setTypewriterText("");
      return;
    }
    const fullText = (currentPanel.dialogue as { character: string; text: string }[])
      .map((d) => `${d.character}: "${d.text}"`)
      .join("\n");
    let i = 0;
    setTypewriterText("");
    const interval = setInterval(() => {
      if (i <= fullText.length) {
        setTypewriterText(fullText.slice(0, i));
        i++;
      } else {
        clearInterval(interval);
      }
    }, 30);
    return () => clearInterval(interval);
  }, [mode, slideshowIndex, currentPanel?.id, showDialogue]);

  // Auto-advance in slideshow
  useEffect(() => {
    if (mode !== "slideshow" || !isPlaying) return;
    timerRef.current = setTimeout(() => {
      if (slideshowIndex < panels.length - 1) {
        setSlideshowIndex((i) => i + 1);
      } else {
        setIsPlaying(false);
      }
    }, autoAdvanceDelay);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [mode, isPlaying, slideshowIndex, panels.length, autoAdvanceDelay]);

  // Keyboard navigation
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (mode !== "slideshow") return;
    switch (e.key) {
      case "ArrowRight":
      case " ":
        e.preventDefault();
        if (slideshowIndex < panels.length - 1) setSlideshowIndex((i) => i + 1);
        break;
      case "ArrowLeft":
        if (slideshowIndex > 0) setSlideshowIndex((i) => i - 1);
        break;
      case "Escape":
        setMode("reader");
        break;
      case "p":
        setIsPlaying((p) => !p);
        break;
    }
  }, [mode, slideshowIndex, panels.length]);

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  // PDF Export
  const handleExportPDF = async () => {
    toast.info("Preparing PDF export...");
    try {
      const { default: jsPDF } = await import("jspdf");
      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const pageWidth = 210;
      const pageHeight = 297;
      const margin = 10;
      const usableWidth = pageWidth - margin * 2;
      let yPos = margin;

      // Title page
      pdf.setFontSize(24);
      pdf.setTextColor(255, 255, 255);
      pdf.setFillColor(10, 10, 20);
      pdf.rect(0, 0, pageWidth, pageHeight, "F");
      pdf.text(project?.title || "Storyboard", pageWidth / 2, pageHeight / 2 - 10, { align: "center" });
      pdf.setFontSize(12);
      pdf.text("Generated by Awakli", pageWidth / 2, pageHeight / 2 + 10, { align: "center" });
      pdf.addPage();

      // Panel pages
      for (let i = 0; i < panels.length; i++) {
        const panel = panels[i];
        if (!panel.imageUrl) continue;

        if (yPos > pageHeight - 80) {
          pdf.addPage();
          yPos = margin;
        }

        pdf.setFillColor(10, 10, 20);
        pdf.rect(0, 0, pageWidth, pageHeight, "F");

        try {
          const img = new Image();
          img.crossOrigin = "anonymous";
          await new Promise<void>((resolve, reject) => {
            img.onload = () => resolve();
            img.onerror = () => reject(new Error("Image load failed"));
            img.src = panel.imageUrl!;
          });

          const ratio = img.width / img.height;
          let imgW = usableWidth;
          let imgH = imgW / ratio;
          if (imgH > 120) {
            imgH = 120;
            imgW = imgH * ratio;
          }

          pdf.addImage(img, "JPEG", margin + (usableWidth - imgW) / 2, yPos, imgW, imgH);
          yPos += imgH + 5;
        } catch {
          yPos += 5;
        }

        // Dialogue below panel
        if (panel.dialogue && Array.isArray(panel.dialogue)) {
          pdf.setFontSize(9);
          pdf.setTextColor(200, 200, 200);
          (panel.dialogue as { character: string; text: string }[]).forEach((d) => {
            const line = `${d.character}: "${d.text}"`;
            pdf.text(line, margin, yPos, { maxWidth: usableWidth });
            yPos += 6;
          });
        }
        yPos += 10;
      }

      pdf.save(`${project?.title || "storyboard"}-chapter.pdf`);
      toast.success("PDF exported!");
    } catch (err) {
      toast.error("PDF export failed");
      console.error(err);
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-void flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-token-violet" />
      </div>
    );
  }

  if (!user) {
    window.location.href = getLoginUrl();
    return null;
  }

  // Panel size based on camera angle
  const getPanelSize = (angle: string | null) => {
    switch (angle) {
      case "wide":
      case "birds-eye":
        return "col-span-2";
      case "extreme-close-up":
        return "col-span-1 row-span-2";
      default:
        return "col-span-1";
    }
  };

  return (
    <div className="min-h-screen bg-void text-white">
      {/* Header */}
      <div className="border-b border-white/10 bg-deep/80 backdrop-blur-md sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-display font-bold bg-gradient-to-r from-token-violet to-token-cyan bg-clip-text text-transparent">
              Storyboard
            </h1>
            <p className="text-xs text-muted">{project?.title}</p>
          </div>

          <div className="flex items-center gap-3">
            {/* Episode selector */}
            <select
              value={activeEpisodeId || ""}
              onChange={(e) => {
                setActiveEpisodeId(Number(e.target.value));
                setSlideshowIndex(0);
              }}
              className="bg-surface border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-token-violet/50"
            >
              {episodes?.map((ep: any) => (
                <option key={ep.id} value={ep.id}>
                  Ep {ep.episodeNumber}: {ep.title}
                </option>
              ))}
            </select>

            {/* Mode toggle */}
            <div className="flex bg-surface/80 rounded-lg p-0.5 border border-white/10">
              <button
                onClick={() => setMode("reader")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                  mode === "reader" ? "bg-token-violet/20 text-token-violet" : "text-muted hover:text-white"
                }`}
              >
                <BookOpen className="w-3.5 h-3.5" /> Reader
              </button>
              <button
                onClick={() => { setMode("slideshow"); setSlideshowIndex(0); }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                  mode === "slideshow" ? "bg-token-cyan/20 text-token-cyan" : "text-muted hover:text-white"
                }`}
              >
                <Monitor className="w-3.5 h-3.5" /> Slideshow
              </button>
            </div>

            {/* Export */}
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={handleExportPDF}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 text-sm text-muted hover:text-white hover:border-white/20 transition-colors"
            >
              <Download className="w-3.5 h-3.5" /> PDF
            </motion.button>
          </div>
        </div>
      </div>

      {/* Content */}
      {panels.length === 0 ? (
        <div className="text-center py-20">
          <BookOpen className="w-12 h-12 text-muted mx-auto mb-4" />
          <h3 className="text-lg font-semibold mb-2">No approved panels yet</h3>
          <p className="text-sm text-muted">Generate and approve panels to see them in the storyboard.</p>
        </div>
      ) : mode === "reader" ? (
        /* ─── Manga Reader Mode ─── */
        <div className="max-w-4xl mx-auto px-4 py-8">
          {/* Paper texture overlay */}
          <div className="relative">
            <div className="absolute inset-0 opacity-[0.03] pointer-events-none bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyMDAiIGhlaWdodD0iMjAwIj48ZmlsdGVyIGlkPSJuIj48ZmVUdXJidWxlbmNlIHR5cGU9ImZyYWN0YWxOb2lzZSIgYmFzZUZyZXF1ZW5jeT0iMC44IiBudW1PY3RhdmVzPSI0IiBzdGl0Y2hUaWxlcz0ic3RpdGNoIi8+PC9maWx0ZXI+PHJlY3Qgd2lkdGg9IjEwMCUiIGhlaWdodD0iMTAwJSIgZmlsdGVyPSJ1cmwoI24pIiBvcGFjaXR5PSIwLjUiLz48L3N2Zz4=')] bg-repeat" />

            {scenes.map(([sceneNum, scenePanels]) => (
              <div key={sceneNum} className="mb-8">
                <div className="text-xs text-muted/50 uppercase tracking-widest mb-3 font-mono">
                  Scene {sceneNum}
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-[3px] bg-white/10 p-[3px] rounded-lg">
                  {scenePanels.map((panel, idx) => (
                    <motion.div
                      key={panel.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: idx * 0.1 }}
                      className={`${getPanelSize(panel.cameraAngle)} relative overflow-hidden cursor-pointer group`}
                      onClick={() => {
                        const globalIdx = panels.findIndex((p) => p.id === panel.id);
                        setSlideshowIndex(globalIdx);
                        setMode("slideshow");
                      }}
                    >
                      {panel.imageUrl && (
                        <img
                          src={panel.compositeImageUrl || panel.imageUrl}
                          alt={`S${panel.sceneNumber}P${panel.panelNumber}`}
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                      )}
                      {/* Hover info */}
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-end">
                        <div className="p-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <span className="text-[10px] font-mono text-white/80">
                            S{panel.sceneNumber}P{panel.panelNumber}
                          </span>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>

                {/* Dialogue below scene */}
                {showDialogue && (
                  <div className="mt-2 space-y-1">
                    {scenePanels.map((panel) =>
                      panel.dialogue && Array.isArray(panel.dialogue) ? (
                        (panel.dialogue as { character: string; text: string; emotion: string }[]).map((d, di) => (
                          <div key={`${panel.id}-${di}`} className="text-xs text-muted/70 pl-2 border-l border-white/5">
                            <span className="text-token-violet/70 font-semibold">{d.character}</span>
                            <span className="ml-1">"{d.text}"</span>
                          </div>
                        ))
                      ) : null
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ) : (
        /* ─── Slideshow Mode ─── */
        <div className="fixed inset-0 bg-void z-40 flex flex-col">
          {/* Slideshow header */}
          <div className="flex items-center justify-between px-6 py-3 bg-deep/80 backdrop-blur-md border-b border-white/10">
            <div className="flex items-center gap-4">
              <button
                onClick={() => setMode("reader")}
                className="text-muted hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
              <span className="text-sm text-muted">
                Panel {slideshowIndex + 1} of {panels.length}
              </span>
            </div>

            <div className="flex items-center gap-3">
              {/* Auto-advance controls */}
              <div className="flex items-center gap-2 text-xs text-muted">
                <span>Speed:</span>
                <select
                  value={autoAdvanceDelay}
                  onChange={(e) => setAutoAdvanceDelay(Number(e.target.value))}
                  className="bg-surface border border-white/10 rounded px-2 py-1 text-xs text-white"
                >
                  <option value={2000}>2s</option>
                  <option value={4000}>4s</option>
                  <option value={6000}>6s</option>
                  <option value={8000}>8s</option>
                </select>
              </div>

              <button
                onClick={() => setSlideshowIndex(Math.max(0, slideshowIndex - 1))}
                disabled={slideshowIndex === 0}
                className="p-1.5 rounded-lg text-muted hover:text-white disabled:opacity-30"
              >
                <SkipBack className="w-4 h-4" />
              </button>
              <button
                onClick={() => setIsPlaying(!isPlaying)}
                className="p-2 rounded-full bg-token-violet/20 border border-token-violet/30 text-token-violet hover:bg-token-violet/30"
              >
                {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
              </button>
              <button
                onClick={() => setSlideshowIndex(Math.min(panels.length - 1, slideshowIndex + 1))}
                disabled={slideshowIndex >= panels.length - 1}
                className="p-1.5 rounded-lg text-muted hover:text-white disabled:opacity-30"
              >
                <SkipForward className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Main slideshow area */}
          <div className="flex-1 flex items-center justify-center relative overflow-hidden">
            <AnimatePresence mode="wait">
              {currentPanel && (
                <motion.div
                  key={currentPanel.id}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 1.05 }}
                  transition={{ duration: 0.5 }}
                  className="flex flex-col items-center max-w-3xl"
                >
                  {currentPanel.imageUrl && (
                    <img
                      src={currentPanel.compositeImageUrl || currentPanel.imageUrl}
                      alt={`Panel ${slideshowIndex + 1}`}
                      className="max-h-[65vh] w-auto rounded-xl shadow-2xl shadow-black/50"
                    />
                  )}

                  {/* Typewriter dialogue */}
                  {showDialogue && currentPanel.dialogue && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.3 }}
                      className="mt-6 max-w-xl text-center"
                    >
                      <pre className="text-sm text-white/80 font-sans whitespace-pre-wrap leading-relaxed">
                        {typewriterText}
                        <span className="animate-pulse text-token-violet">|</span>
                      </pre>
                    </motion.div>
                  )}

                  {/* Panel info */}
                  <div className="mt-3 text-xs text-muted/50 font-mono">
                    S{currentPanel.sceneNumber} · P{currentPanel.panelNumber} · {currentPanel.cameraAngle}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Click zones for navigation */}
            <div
              className="absolute left-0 top-0 bottom-0 w-1/4 cursor-pointer z-10"
              onClick={() => slideshowIndex > 0 && setSlideshowIndex(slideshowIndex - 1)}
            />
            <div
              className="absolute right-0 top-0 bottom-0 w-1/4 cursor-pointer z-10"
              onClick={() => slideshowIndex < panels.length - 1 && setSlideshowIndex(slideshowIndex + 1)}
            />
          </div>

          {/* Progress bar */}
          <div className="h-1 bg-surface">
            <motion.div
              className="h-full bg-gradient-to-r from-token-violet to-token-cyan"
              animate={{ width: `${((slideshowIndex + 1) / panels.length) * 100}%` }}
              transition={{ duration: 0.3 }}
            />
          </div>

          {/* Keyboard hints */}
          <div className="text-center py-2 text-[10px] text-muted/30">
            ← → Navigate · Space Next · P Play/Pause · Esc Exit
          </div>
        </div>
      )}
    </div>
  );
}
