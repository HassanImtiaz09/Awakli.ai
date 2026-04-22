/**
 * MasterExport — export format dialog with tier-aware pricing.
 *
 * Options: 1080p MP4 (default), 4K MP4 (+30%), ProRes 422 HQ (+60%),
 * separated stems (+20%). Additive pricing.
 */
import { useState, useMemo, useCallback } from "react";
import { motion } from "framer-motion";
import { Download, Film, Music, Layers, Check } from "lucide-react";
import { Button } from "@/components/ui/button";

// ─── Exported copy strings (exact spec) ─────────────────────────────
export const EXPORT_COPY = {
  title: "How would you like the master?",
  option1080: "1080p MP4",
  option1080Desc: "Default — no extra cost",
  option4K: "4K MP4 · +30% credits",
  optionProRes: "ProRes 422 HQ · +60% credits",
  optionStems: "Separated stems (dialogue · music · sfx) · +20% credits",
  confirm: "Export",
  cancel: "Back",
} as const;

// ─── Export option types ────────────────────────────────────────────
export type ExportResolution = "1080p" | "4k";
export type ExportFormat = "mp4" | "prores";

export interface ExportConfig {
  resolution: ExportResolution;
  format: ExportFormat;
  stems: boolean;
}

export interface ExportOption {
  id: string;
  label: string;
  description: string;
  icon: typeof Film;
  multiplier: number; // additive percentage: 0 = no extra, 0.3 = +30%
  category: "resolution" | "format" | "addon";
  value: string;
}

// ─── Export options ─────────────────────────────────────────────────
export const EXPORT_OPTIONS: ExportOption[] = [
  {
    id: "1080p",
    label: "1080p MP4",
    description: "Default — no extra cost",
    icon: Film,
    multiplier: 0,
    category: "resolution",
    value: "1080p",
  },
  {
    id: "4k",
    label: "4K MP4",
    description: "+30% credits",
    icon: Film,
    multiplier: 0.3,
    category: "resolution",
    value: "4k",
  },
  {
    id: "prores",
    label: "ProRes 422 HQ",
    description: "+60% credits",
    icon: Film,
    multiplier: 0.6,
    category: "format",
    value: "prores",
  },
  {
    id: "stems",
    label: "Separated stems",
    description: "dialogue · music · sfx · +20% credits",
    icon: Layers,
    multiplier: 0.2,
    category: "addon",
    value: "stems",
  },
];

// ─── Credit calculation ─────────────────────────────────────────────
export function calculateExportCredits(
  baseCredits: number,
  config: ExportConfig
): { total: number; breakdown: { label: string; credits: number }[] } {
  const breakdown: { label: string; credits: number }[] = [
    { label: "Base render", credits: baseCredits },
  ];

  let multiplier = 1;

  if (config.resolution === "4k") {
    const surcharge = Math.ceil(baseCredits * 0.3);
    breakdown.push({ label: "4K upscale (+30%)", credits: surcharge });
    multiplier += 0.3;
  }

  if (config.format === "prores") {
    const surcharge = Math.ceil(baseCredits * 0.6);
    breakdown.push({ label: "ProRes master (+60%)", credits: surcharge });
    multiplier += 0.6;
  }

  if (config.stems) {
    const surcharge = Math.ceil(baseCredits * 0.2);
    breakdown.push({ label: "Stem separation (+20%)", credits: surcharge });
    multiplier += 0.2;
  }

  const total = breakdown.reduce((sum, b) => sum + b.credits, 0);
  return { total, breakdown };
}

// ─── Props ──────────────────────────────────────────────────────────
export interface MasterExportProps {
  baseCredits: number;
  availableCredits: number;
  tier: string;
  onExport: (config: ExportConfig) => void;
  onCancel: () => void;
}

// ─── Component ──────────────────────────────────────────────────────
export default function MasterExport({
  baseCredits,
  availableCredits,
  tier,
  onExport,
  onCancel,
}: MasterExportProps) {
  const [resolution, setResolution] = useState<ExportResolution>("1080p");
  const [format, setFormat] = useState<ExportFormat>("mp4");
  const [stems, setStems] = useState(false);

  const config: ExportConfig = useMemo(
    () => ({ resolution, format, stems }),
    [resolution, format, stems]
  );

  const pricing = useMemo(
    () => calculateExportCredits(baseCredits, config),
    [baseCredits, config]
  );

  const canAfford = availableCredits >= pricing.total;
  const isStudio = tier === "studio" || tier === "studio_pro";
  const isStudioPro = tier === "studio_pro";

  const handleExport = useCallback(() => {
    if (!canAfford) return;
    onExport(config);
  }, [canAfford, config, onExport]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      className="max-w-lg mx-auto rounded-2xl bg-[hsl(240,6%,10%)] border border-white/5 p-6 space-y-4"
    >
      {/* Title */}
      <div className="flex items-center gap-2">
        <Download className="w-5 h-5 text-violet-400" />
        <h2 className="text-lg font-semibold text-white/90">
          {EXPORT_COPY.title}
        </h2>
      </div>

      {/* Resolution options */}
      <div className="space-y-2">
        <p className="text-xs text-white/40 uppercase tracking-wider">
          Resolution
        </p>
        <div className="grid grid-cols-2 gap-2">
          <OptionCard
            selected={resolution === "1080p"}
            onClick={() => setResolution("1080p")}
            label={EXPORT_COPY.option1080}
            sublabel={EXPORT_COPY.option1080Desc}
            icon={Film}
          />
          <OptionCard
            selected={resolution === "4k"}
            onClick={() => setResolution("4k")}
            label="4K MP4"
            sublabel="+30% credits"
            icon={Film}
            disabled={!isStudio}
            lockedLabel={!isStudio ? "Studio+" : undefined}
          />
        </div>
      </div>

      {/* Format options */}
      <div className="space-y-2">
        <p className="text-xs text-white/40 uppercase tracking-wider">
          Format
        </p>
        <div className="grid grid-cols-2 gap-2">
          <OptionCard
            selected={format === "mp4"}
            onClick={() => setFormat("mp4")}
            label="MP4 H.264"
            sublabel="Standard"
            icon={Film}
          />
          <OptionCard
            selected={format === "prores"}
            onClick={() => setFormat("prores")}
            label="ProRes 422 HQ"
            sublabel="+60% credits"
            icon={Film}
            disabled={!isStudio}
            lockedLabel={!isStudio ? "Studio+" : undefined}
          />
        </div>
      </div>

      {/* Stems addon */}
      <div className="space-y-2">
        <p className="text-xs text-white/40 uppercase tracking-wider">
          Add-ons
        </p>
        <OptionCard
          selected={stems}
          onClick={() => setStems(!stems)}
          label="Separated stems"
          sublabel="dialogue · music · sfx · +20% credits"
          icon={Music}
          disabled={!isStudio}
          lockedLabel={!isStudio ? "Studio+" : undefined}
          toggle
        />
      </div>

      {/* Pricing breakdown */}
      <div className="border-t border-white/5 pt-4 space-y-2">
        {pricing.breakdown.map((item, i) => (
          <div
            key={i}
            className="flex items-center justify-between text-xs text-white/40"
          >
            <span>{item.label}</span>
            <span className="font-mono">{item.credits}c</span>
          </div>
        ))}
        <div className="flex items-center justify-between pt-2 border-t border-white/5">
          <span className="text-sm font-medium text-white/70">Total</span>
          <span
            className={`text-lg font-bold font-mono ${
              canAfford ? "text-white/90" : "text-red-400"
            }`}
          >
            {pricing.total} credits
          </span>
        </div>
        {!canAfford && (
          <p className="text-xs text-red-400/80">
            Not enough credits ({availableCredits} available)
          </p>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-3 pt-2">
        <Button
          variant="outline"
          onClick={onCancel}
          className="flex-1 border-white/10 text-white/60"
        >
          {EXPORT_COPY.cancel}
        </Button>
        <Button
          onClick={handleExport}
          disabled={!canAfford}
          className="flex-1 bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white border-none gap-2"
        >
          <Download className="w-4 h-4" />
          {EXPORT_COPY.confirm}
        </Button>
      </div>
    </motion.div>
  );
}

// ─── OptionCard sub-component ───────────────────────────────────────
function OptionCard({
  selected,
  onClick,
  label,
  sublabel,
  icon: Icon,
  disabled,
  lockedLabel,
  toggle,
}: {
  selected: boolean;
  onClick: () => void;
  label: string;
  sublabel: string;
  icon: typeof Film;
  disabled?: boolean;
  lockedLabel?: string;
  toggle?: boolean;
}) {
  return (
    <button
      onClick={disabled ? undefined : onClick}
      className={`relative flex flex-col gap-1 p-3 rounded-lg border text-left transition-all ${
        disabled
          ? "opacity-40 cursor-not-allowed border-white/5 bg-white/[0.01]"
          : selected
          ? "border-violet-500/40 bg-violet-500/10 ring-1 ring-violet-500/30"
          : "border-white/5 bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/10"
      }`}
    >
      <div className="flex items-center gap-2">
        {toggle ? (
          <div
            className={`w-4 h-4 rounded border flex items-center justify-center ${
              selected
                ? "bg-violet-500 border-violet-500"
                : "border-white/20"
            }`}
          >
            {selected && <Check className="w-3 h-3 text-white" />}
          </div>
        ) : (
          <div
            className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
              selected ? "border-violet-500" : "border-white/20"
            }`}
          >
            {selected && (
              <div className="w-2 h-2 rounded-full bg-violet-500" />
            )}
          </div>
        )}
        <span className="text-xs font-medium text-white/80">{label}</span>
      </div>
      <span className="text-[10px] text-white/30 pl-6">{sublabel}</span>
      {lockedLabel && (
        <span className="absolute top-2 right-2 text-[9px] bg-white/5 text-white/30 px-1.5 py-0.5 rounded-full">
          {lockedLabel}
        </span>
      )}
    </button>
  );
}
