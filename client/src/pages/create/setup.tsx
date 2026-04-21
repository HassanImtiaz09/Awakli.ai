import { useState, useEffect, useMemo } from "react";
import { useLocation, useSearch } from "wouter";
import { motion } from "framer-motion";
import { Settings2, ArrowRight, ArrowLeft, Palette, Drama } from "lucide-react";
import { trpc } from "@/lib/trpc";
import CreateWizardLayout from "@/layouts/CreateWizardLayout";

const STYLES = [
  { key: "shonen", label: "Shonen", desc: "Bold action, vibrant colors" },
  { key: "seinen", label: "Seinen", desc: "Mature, detailed, realistic" },
  { key: "shoujo", label: "Shoujo", desc: "Soft, romantic, expressive" },
  { key: "chibi", label: "Chibi", desc: "Cute, exaggerated, playful" },
  { key: "cyberpunk", label: "Cyberpunk", desc: "Neon, gritty, futuristic" },
  { key: "watercolor", label: "Watercolor", desc: "Painterly, dreamy, soft" },
  { key: "noir", label: "Noir", desc: "Dark, high-contrast, moody" },
  { key: "mecha", label: "Mecha", desc: "Mechanical, epic, detailed" },
] as const;

const TONES = ["Epic", "Dark", "Lighthearted", "Mysterious", "Romantic", "Comedic", "Melancholic", "Intense"];
const AUDIENCES = [
  { key: "kids", label: "Kids", desc: "Ages 6–12" },
  { key: "teen", label: "Teen", desc: "Ages 13–17" },
  { key: "adult", label: "Adult", desc: "Ages 18+" },
] as const;

export default function WizardSetup() {
  const [, navigate] = useLocation();
  const search = useSearch();
  const params = new URLSearchParams(search);
  const projectId = params.get("projectId") || "";

  const { data: project } = trpc.projects.get.useQuery(
    { id: parseInt(projectId, 10) },
    { enabled: !!projectId && projectId !== "new" }
  );

  const [style, setStyle] = useState<string>("default");
  const [tone, setTone] = useState("");
  const [audience, setAudience] = useState<string>("teen");
  const [title, setTitle] = useState("Untitled Project");

  useEffect(() => {
    if (project) {
      setStyle(project.animeStyle || "default");
      setTone(project.tone || "");
      setAudience(project.targetAudience || "teen");
      setTitle(project.title);
    }
  }, [project]);

  const completedStages = useMemo(() => {
    const s = new Set<number>();
    if (project?.description && project?.genre) s.add(0);
    if (style !== "default" && tone) s.add(1);
    return s;
  }, [project, style, tone]);

  const autosaveData = useMemo(() => {
    if (!projectId || projectId === "new") return null;
    return { title, animeStyle: style as any, tone, targetAudience: audience as any };
  }, [projectId, title, style, tone, audience]);

  const canProceed = style !== "default" && tone;

  return (
    <CreateWizardLayout
      stage={1}
      projectId={projectId}
      projectTitle={title}
      onTitleChange={setTitle}
      autosaveData={autosaveData}
      completedStages={completedStages}
    >
      <div className="max-w-3xl mx-auto space-y-10">
        {/* Header */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-token-violet text-xs font-semibold uppercase tracking-widest">
            <Settings2 className="w-3.5 h-3.5" />
            Stage 02 — Project Setup
          </div>
          <h1 className="text-3xl lg:text-4xl font-bold text-white/90">
            Define your style
          </h1>
          <p className="text-white/40 text-sm">
            Choose the visual style, tone, and target audience for your anime.
          </p>
        </div>

        {/* Art Style Grid */}
        <div className="space-y-3">
          <label className="flex items-center gap-2 text-xs font-medium text-white/50 uppercase tracking-wider">
            <Palette className="w-3.5 h-3.5" />
            Art Style
          </label>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {STYLES.map((s) => (
              <button
                key={s.key}
                onClick={() => setStyle(s.key)}
                className={`p-4 rounded-2xl border text-left transition-all ${
                  style === s.key
                    ? "bg-token-violet/10 border-token-violet/50 shadow-[0_0_20px_rgba(107,91,255,0.15)]"
                    : "bg-white/[0.02] border-white/5 hover:border-white/15"
                }`}
              >
                <div className={`text-sm font-semibold mb-1 ${style === s.key ? "text-token-violet" : "text-white/70"}`}>
                  {s.label}
                </div>
                <div className="text-xs text-white/30">{s.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Tone Pills */}
        <div className="space-y-3">
          <label className="flex items-center gap-2 text-xs font-medium text-white/50 uppercase tracking-wider">
            <Drama className="w-3.5 h-3.5" />
            Tone
          </label>
          <div className="flex flex-wrap gap-2">
            {TONES.map((t) => (
              <button
                key={t}
                onClick={() => setTone(tone === t ? "" : t)}
                className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
                  tone === t
                    ? "bg-token-cyan/20 text-token-cyan ring-1 ring-token-cyan/40"
                    : "bg-white/5 text-white/50 hover:bg-white/10"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        {/* Target Audience */}
        <div className="space-y-3">
          <label className="text-xs font-medium text-white/50 uppercase tracking-wider">Target Audience</label>
          <div className="flex gap-3">
            {AUDIENCES.map((a) => (
              <button
                key={a.key}
                onClick={() => setAudience(a.key)}
                className={`flex-1 p-4 rounded-2xl border text-center transition-all ${
                  audience === a.key
                    ? "bg-token-gold/10 border-token-gold/40"
                    : "bg-white/[0.02] border-white/5 hover:border-white/15"
                }`}
              >
                <div className={`text-sm font-semibold ${audience === a.key ? "text-token-gold" : "text-white/70"}`}>
                  {a.label}
                </div>
                <div className="text-xs text-white/30 mt-1">{a.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Navigation */}
        <div className="flex justify-between pt-4">
          <button
            onClick={() => navigate(`/create/input?projectId=${projectId}`)}
            className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-white/5 text-white/50 hover:text-white/70 text-sm transition-all"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>
          <motion.button
            whileHover={{ scale: canProceed ? 1.02 : 1 }}
            whileTap={{ scale: canProceed ? 0.98 : 1 }}
            onClick={() => canProceed && navigate(`/create/script?projectId=${projectId}`)}
            disabled={!canProceed}
            className={`flex items-center gap-2 px-8 py-3 rounded-2xl font-semibold text-sm transition-all ${
              canProceed
                ? "bg-gradient-to-r from-token-violet to-token-cyan text-white shadow-[0_4px_20px_rgba(107,91,255,0.3)]"
                : "bg-white/5 text-white/20 cursor-not-allowed"
            }`}
          >
            Continue to Script
            <ArrowRight className="w-4 h-4" />
          </motion.button>
        </div>
      </div>
    </CreateWizardLayout>
  );
}
