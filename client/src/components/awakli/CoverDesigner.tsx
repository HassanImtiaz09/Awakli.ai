/**
 * CoverDesigner — Sheet overlay for designing the manga episode cover.
 *
 * Pick any rendered panel as cover source, adjust title/author, choose style preset.
 * Three presets: Shonen bold, Seinen minimal, Shojo soft.
 */
import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Check, ImageIcon, Type, User, Palette } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface CoverPanel {
  id: number;
  panelNumber: number;
  imageUrl: string;
}

export type CoverStylePreset = "shonen" | "seinen" | "shojo";

export interface CoverConfig {
  title: string;
  author: string;
  coverPanelId: number | null;
  coverImageUrl: string | null;
  stylePreset: CoverStylePreset;
}

export const COVER_STYLE_PRESETS: Record<
  CoverStylePreset,
  { label: string; description: string; titleFont: string; accent: string }
> = {
  shonen: {
    label: "Shonen Bold",
    description: "Dynamic, high-energy title treatment with bold strokes",
    titleFont: "font-black uppercase tracking-tight",
    accent: "from-red-500 to-orange-500",
  },
  seinen: {
    label: "Seinen Minimal",
    description: "Clean, understated typography with refined spacing",
    titleFont: "font-light tracking-[0.2em] uppercase",
    accent: "from-zinc-400 to-zinc-600",
  },
  shojo: {
    label: "Shojo Soft",
    description: "Elegant, flowing title with soft pastel accents",
    titleFont: "font-medium italic tracking-wide",
    accent: "from-pink-400 to-rose-400",
  },
};

interface CoverDesignerProps {
  open: boolean;
  onClose: () => void;
  panels: CoverPanel[];
  initialConfig: CoverConfig;
  onSave: (config: CoverConfig) => void;
  onCoverPicked?: () => void;
}

export function CoverDesigner({
  open,
  onClose,
  panels,
  initialConfig,
  onSave,
  onCoverPicked,
}: CoverDesignerProps) {
  const [config, setConfig] = useState<CoverConfig>(initialConfig);

  const handlePanelSelect = useCallback(
    (panel: CoverPanel) => {
      setConfig((prev) => ({
        ...prev,
        coverPanelId: panel.id,
        coverImageUrl: panel.imageUrl,
      }));
      onCoverPicked?.();
    },
    [onCoverPicked]
  );

  const handleSave = useCallback(() => {
    onSave(config);
    onClose();
  }, [config, onSave, onClose]);

  const preset = COVER_STYLE_PRESETS[config.stylePreset];

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 z-40"
          />

          {/* Sheet */}
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
            className="fixed inset-x-0 bottom-0 z-50 max-h-[85vh] overflow-y-auto rounded-t-2xl bg-[#0D0D12] p-6 border-t border-white/[0.06]"
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-lg font-bold text-white/90">Design your cover</h3>
                <p className="text-sm text-white/40">Pick art, set your title, choose a style.</p>
              </div>
              <button
                onClick={onClose}
                className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center hover:bg-white/10 transition-colors"
              >
                <X className="w-4 h-4 text-white/50" />
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
              {/* Left: Controls */}
              <div className="space-y-6">
                {/* Title */}
                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-xs font-medium text-white/50 uppercase tracking-wider">
                    <Type className="w-3.5 h-3.5" />
                    Title
                  </label>
                  <input
                    type="text"
                    value={config.title}
                    onChange={(e) =>
                      setConfig((prev) => ({ ...prev, title: e.target.value }))
                    }
                    placeholder="Episode title"
                    className="w-full px-4 py-3 rounded-xl bg-white/[0.04] border border-white/[0.06] text-white/90 text-sm placeholder:text-white/20 focus:outline-none focus:border-white/15 transition-colors"
                  />
                </div>

                {/* Author */}
                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-xs font-medium text-white/50 uppercase tracking-wider">
                    <User className="w-3.5 h-3.5" />
                    Author
                  </label>
                  <input
                    type="text"
                    value={config.author}
                    onChange={(e) =>
                      setConfig((prev) => ({ ...prev, author: e.target.value }))
                    }
                    placeholder="Your name"
                    className="w-full px-4 py-3 rounded-xl bg-white/[0.04] border border-white/[0.06] text-white/90 text-sm placeholder:text-white/20 focus:outline-none focus:border-white/15 transition-colors"
                  />
                </div>

                {/* Style presets */}
                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-xs font-medium text-white/50 uppercase tracking-wider">
                    <Palette className="w-3.5 h-3.5" />
                    Style preset
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {(Object.entries(COVER_STYLE_PRESETS) as [CoverStylePreset, typeof COVER_STYLE_PRESETS["shonen"]][]).map(
                      ([key, style]) => (
                        <button
                          key={key}
                          onClick={() =>
                            setConfig((prev) => ({ ...prev, stylePreset: key }))
                          }
                          className={`p-3 rounded-xl border text-left transition-all ${
                            config.stylePreset === key
                              ? "bg-white/[0.06] border-white/15"
                              : "bg-white/[0.02] border-white/[0.04] hover:border-white/10"
                          }`}
                        >
                          <div
                            className={`h-1 w-8 rounded-full bg-gradient-to-r ${style.accent} mb-2`}
                          />
                          <div className="text-xs font-semibold text-white/70">
                            {style.label}
                          </div>
                          <div className="text-[10px] text-white/30 mt-0.5 line-clamp-2">
                            {style.description}
                          </div>
                        </button>
                      )
                    )}
                  </div>
                </div>

                {/* Panel picker */}
                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-xs font-medium text-white/50 uppercase tracking-wider">
                    <ImageIcon className="w-3.5 h-3.5" />
                    Cover art
                  </label>
                  <div className="grid grid-cols-4 sm:grid-cols-5 gap-2 max-h-48 overflow-y-auto pr-1">
                    {panels.map((panel) => (
                      <button
                        key={panel.id}
                        onClick={() => handlePanelSelect(panel)}
                        className={`relative aspect-[3/4] rounded-lg overflow-hidden border-2 transition-all ${
                          config.coverPanelId === panel.id
                            ? "border-white/40 ring-1 ring-white/20"
                            : "border-transparent hover:border-white/10"
                        }`}
                      >
                        <img
                          src={panel.imageUrl}
                          alt={`Panel ${panel.panelNumber}`}
                          className="w-full h-full object-cover"
                        />
                        {config.coverPanelId === panel.id && (
                          <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                            <Check className="w-5 h-5 text-white" />
                          </div>
                        )}
                        <span className="absolute bottom-1 left-1 text-[9px] text-white/60 bg-black/40 px-1 rounded">
                          {panel.panelNumber}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Save */}
                <div className="flex gap-3 pt-2">
                  <Button
                    onClick={handleSave}
                    className="flex-1 bg-gradient-to-r from-[#00E5A0] to-[#00C8FF] text-black font-semibold"
                  >
                    <Check className="w-4 h-4 mr-2" />
                    Save cover
                  </Button>
                  <Button variant="outline" onClick={onClose} className="text-white/50">
                    Cancel
                  </Button>
                </div>
              </div>

              {/* Right: Live preview */}
              <div className="hidden lg:block">
                <div className="sticky top-0">
                  <p className="text-[10px] text-white/30 uppercase tracking-widest mb-2">
                    Preview
                  </p>
                  <div className="aspect-[2/3] rounded-lg overflow-hidden bg-[#F5F0E8] shadow-[0_4px_20px_rgba(0,0,0,0.4)] relative">
                    {config.coverImageUrl ? (
                      <img
                        src={config.coverImageUrl}
                        alt="Cover"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <ImageIcon className="w-12 h-12 text-black/10" />
                      </div>
                    )}

                    {/* Title overlay */}
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-4 pt-16">
                      {config.title && (
                        <h4
                          className={`text-white text-lg leading-tight mb-1 ${preset.titleFont}`}
                        >
                          {config.title}
                        </h4>
                      )}
                      {config.author && (
                        <p className="text-white/50 text-xs">{config.author}</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
