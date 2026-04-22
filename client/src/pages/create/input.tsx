/**
 * Stage 0 · Input — Text + Manga Upload + Character Foundation
 *
 * Tab A: "Start from an idea" — IdeaPrompt textarea + LengthPicker + ChapterPicker
 * Tab B: "Upload manga / webtoon" — MangaUpload + PanelExtractor (Mangaka+ only)
 * Tab C: "Upload character sheets / style refs" — CharacterFoundation + StyleSheetUpload (Studio+ only)
 */
import { useState, useEffect, useMemo, useCallback } from "react";
import { useLocation, useSearch } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowRight,
  Loader2,
  Lock,
  BookOpen,
  Sparkles,
  Upload,
  Users,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import CreateWizardLayout from "@/layouts/CreateWizardLayout";
import { useAdvanceStage } from "@/hooks/useAdvanceStage";
import IdeaPrompt from "@/components/awakli/IdeaPrompt";
import LengthPicker from "@/components/awakli/LengthPicker";
import MangaUpload, {
  type ExtractedPanel,
} from "@/components/awakli/MangaUpload";
import PanelExtractor, {
  type Panel,
} from "@/components/awakli/PanelExtractor";
import CharacterFoundation, {
  type CharacterData,
} from "@/components/awakli/CharacterFoundation";
import StyleSheetUpload, {
  type StyleRef,
} from "@/components/awakli/StyleSheetUpload";
import { UpgradeModalBus } from "@/components/awakli/UpgradeModal";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const MIN_CHARS = 40;
const MAX_CHARS = 2000;

type InputTab = "idea" | "upload" | "characters";

export default function WizardInput() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const search = useSearch();
  const params = new URLSearchParams(search);
  const projectIdParam = params.get("projectId");
  const promptParam = params.get("prompt");

  // ─── State ──────────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<InputTab>("idea");
  const [prompt, setPrompt] = useState(promptParam || "");
  const [panelCount, setPanelCount] = useState(20);
  const [chapterCount, setChapterCount] = useState(1);
  const [creating, setCreating] = useState(false);
  const [projectId, setProjectId] = useState<number | null>(
    projectIdParam && projectIdParam !== "new"
      ? parseInt(projectIdParam, 10)
      : null
  );
  const [title, setTitle] = useState("Untitled Project");

  // Upload state
  const [extractedPanels, setExtractedPanels] = useState<Panel[]>([]);
  const [isUploading, setIsUploading] = useState(false);

  // Character foundation state (Studio+)
  const [characters, setCharacters] = useState<CharacterData[]>([]);
  const [styleRefs, setStyleRefs] = useState<StyleRef[]>([]);

  // Tier detection
  const { data: subData } = trpc.billing.getSubscription.useQuery(undefined, {
    enabled: !!user,
  });
  const userTier = (subData?.tier as string) ?? "free_trial";
  const isMangakaPlus = ["creator", "creator_pro", "studio", "enterprise"].includes(userTier);
  const isStudioPlus = ["studio", "enterprise"].includes(userTier);

  const createMut = trpc.projects.create.useMutation();
  const { advance, advancing } = useAdvanceStage(String(projectId || ""), 0);

  // Load existing project if projectId is set
  const { data: project } = trpc.projects.get.useQuery(
    { id: projectId! },
    { enabled: !!projectId && !isNaN(projectId) }
  );

  useEffect(() => {
    if (project) {
      setTitle(project.title);
      setPrompt(project.originalPrompt || project.description || "");
    }
  }, [project]);

  // Auto-provision draft project on first visit
  useEffect(() => {
    if (projectIdParam === "new" && user && !creating) {
      setCreating(true);
      createMut
        .mutateAsync({
          title: "Untitled Project",
          description: promptParam || undefined,
        })
        .then(({ id }) => {
          setProjectId(id);
          navigate(`/create/input?projectId=${id}`, { replace: true });
          setCreating(false);
        })
        .catch(() => setCreating(false));
    }
  }, [projectIdParam, user]);

  // Emit analytics on mount
  useEffect(() => {
    emitAnalytics("stage0_open");
  }, []);

  // ─── Validation ─────────────────────────────────────────────────────────────
  const isValid = useMemo(() => {
    if (activeTab === "idea") return prompt.trim().length >= MIN_CHARS;
    if (activeTab === "upload") return extractedPanels.length > 0;
    if (activeTab === "characters") {
      // Need at least one character with at least one ref image
      return characters.length > 0 && characters.some((c) => c.refImages.length > 0);
    }
    return false;
  }, [activeTab, prompt, extractedPanels, characters]);

  const isOverCap = activeTab === "idea" && prompt.length > MAX_CHARS;
  const canProceed = isValid && !isOverCap && !isUploading;

  const completedStages = useMemo(() => {
    const s = new Set<number>();
    if (canProceed) s.add(0);
    return s;
  }, [canProceed]);

  const autosaveData = useMemo(() => {
    if (!projectId) return null;
    return {
      title,
      description: prompt,
      panelCount: activeTab === "upload" ? extractedPanels.length : panelCount,
    };
  }, [projectId, title, prompt, panelCount, activeTab, extractedPanels.length]);

  // ─── Handlers ───────────────────────────────────────────────────────────────
  const handleSummon = async () => {
    if (!canProceed || !projectId) return;
    emitAnalytics("stage0_idea_submit", {
      mode: activeTab,
      charCount: prompt.length,
      panelCount: activeTab === "upload" ? extractedPanels.length : panelCount,
      characterCount: activeTab === "characters" ? characters.length : 0,
      styleRefCount: activeTab === "characters" ? styleRefs.length : 0,
    });
    await advance({
      inputs: {
        prompt,
        panelCount: activeTab === "upload" ? extractedPanels.length : panelCount,
        chapterCount,
        title,
        inputMode: activeTab,
        uploadedPanelCount: activeTab === "upload" ? extractedPanels.length : 0,
        characterCount: activeTab === "characters" ? characters.length : 0,
        styleRefCount: activeTab === "characters" ? styleRefs.length : 0,
      },
    });
  };

  const handleTabSwitch = (tab: InputTab) => {
    if (tab === "upload" && !isMangakaPlus) {
      emitAnalytics("stage0_upgrade_prompt", { trigger: "upload_tab" });
      UpgradeModalBus.open({
        currentTier: userTier,
        required: "creator",
        requiredDisplayName: "Mangaka",
        upgradeSku: "price_mangaka_monthly",
        ctaText: "Unlock with Mangaka — from $19/mo",
        pricingUrl: "/pricing",
      });
      return;
    }
    if (tab === "characters" && !isStudioPlus) {
      emitAnalytics("stage0_upgrade_prompt", { trigger: "characters_tab" });
      UpgradeModalBus.open({
        currentTier: userTier,
        required: "studio",
        requiredDisplayName: "Studio Pro",
        upgradeSku: "price_studio_pro_monthly",
        ctaText: "Unlock with Studio Pro — from $99/mo",
        pricingUrl: "/pricing",
      });
      return;
    }
    setActiveTab(tab);
  };

  const handlePanelsExtracted = useCallback((panels: ExtractedPanel[]) => {
    const mapped: Panel[] = panels.map((p) => ({
      ...p,
      fileKey: p.fileKey,
    }));
    setExtractedPanels((prev) => [...prev, ...mapped]);
    setIsUploading(false);
  }, []);

  const handlePanelsChange = useCallback((panels: Panel[]) => {
    setExtractedPanels(panels);
  }, []);

  // ─── Character foundation cost ─────────────────────────────────────────────
  const characterCost = useMemo(() => {
    const imageIngest = characters.reduce((sum, c) => sum + c.refImages.length * 4, 0);
    const embeddingCompute = characters.length * 2;
    return imageIngest + embeddingCompute;
  }, [characters]);

  // ─── Loading state ──────────────────────────────────────────────────────────
  if (creating) {
    return (
      <CreateWizardLayout stage={0} projectId="new" projectTitle="Creating...">
        <div className="flex items-center justify-center h-[60vh]">
          <Loader2 className="w-8 h-8 animate-spin text-token-violet" />
        </div>
      </CreateWizardLayout>
    );
  }

  return (
    <CreateWizardLayout
      stage={0}
      projectId={String(projectId || "new")}
      projectTitle={title}
      onTitleChange={setTitle}
      autosaveData={autosaveData}
      completedStages={completedStages}
      unsavedChanges={prompt !== (project?.description || "")}
    >
      <div className="max-w-3xl mx-auto space-y-10 py-4">
        {/* ─── Hero Headline ────────────────────────────────────────── */}
        <div className="text-center space-y-3">
          <h1 className="text-3xl lg:text-4xl font-bold text-white/90 leading-tight">
            Tonight, your idea becomes{" "}
            <span className="bg-gradient-to-r from-token-cyan via-token-violet to-token-magenta bg-clip-text text-transparent">
              anime
            </span>
            .
          </h1>
        </div>

        {/* ─── Tab Switcher (3 tabs) ───────────────────────────────── */}
        <div className="flex items-center justify-center gap-1 p-1 rounded-2xl bg-white/[0.03] border border-white/[0.06] max-w-2xl mx-auto">
          <TabButton
            active={activeTab === "idea"}
            onClick={() => handleTabSwitch("idea")}
            icon={<Sparkles className="w-3.5 h-3.5" />}
            label="Start from an idea"
            shortLabel="Idea"
          />
          <TabButton
            active={activeTab === "upload"}
            onClick={() => handleTabSwitch("upload")}
            icon={<Upload className="w-3.5 h-3.5" />}
            label="Upload manga / webtoon"
            shortLabel="Upload"
            locked={!isMangakaPlus}
          />
          <TabButton
            active={activeTab === "characters"}
            onClick={() => handleTabSwitch("characters")}
            icon={<Users className="w-3.5 h-3.5" />}
            label="Upload character sheets / style refs"
            shortLabel="Characters"
            locked={!isStudioPlus}
          />
        </div>

        {/* ─── Tab Content ──────────────────────────────────────────── */}
        <AnimatePresence mode="wait">
          {activeTab === "idea" && (
            <motion.div
              key="idea"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.2 }}
              className="space-y-8"
            >
              <IdeaPrompt
                value={prompt}
                onChange={setPrompt}
                minChars={MIN_CHARS}
                maxChars={MAX_CHARS}
                placeholder="A rain-soaked rooftop. Two rivals. One city. Go\u2026"
              />
              <div className="flex flex-col sm:flex-row gap-6 sm:items-end sm:justify-between">
                <div className="space-y-5 flex-1">
                  <LengthPicker
                    value={panelCount}
                    onChange={setPanelCount}
                    allUnlocked={false}
                    userTier={userTier}
                  />
                  <ChapterPicker
                    value={chapterCount}
                    onChange={setChapterCount}
                    isMangakaPlus={isMangakaPlus}
                    isStudioPlus={isStudioPlus}
                    userTier={userTier}
                  />
                </div>
                <SummonButton
                  canProceed={canProceed}
                  advancing={advancing}
                  isOverCap={isOverCap}
                  onClick={handleSummon}
                />
              </div>
            </motion.div>
          )}

          {activeTab === "upload" && (
            <motion.div
              key="upload"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
              className="space-y-8"
            >
              <MangaUpload
                projectId={projectId}
                onPanelsExtracted={handlePanelsExtracted}
                onUploadStart={() => setIsUploading(true)}
                onError={() => setIsUploading(false)}
              />
              {extractedPanels.length > 0 && projectId && (
                <PanelExtractor
                  panels={extractedPanels}
                  projectId={projectId}
                  onPanelsChange={handlePanelsChange}
                />
              )}
              <div className="flex flex-col sm:flex-row gap-6 sm:items-end sm:justify-between">
                <div className="space-y-5 flex-1">
                  <LengthPicker
                    value={extractedPanels.length || panelCount}
                    onChange={setPanelCount}
                    allUnlocked={false}
                    uploadMode
                    userTier={userTier}
                  />
                  <ChapterPicker
                    value={chapterCount}
                    onChange={setChapterCount}
                    isMangakaPlus={isMangakaPlus}
                    isStudioPlus={isStudioPlus}
                    maxChapters={3}
                    userTier={userTier}
                  />
                </div>
                <SummonButton
                  canProceed={canProceed}
                  advancing={advancing}
                  isOverCap={false}
                  onClick={handleSummon}
                  label={extractedPanels.length > 0 ? "Continue with panels" : "Upload first"}
                />
              </div>
            </motion.div>
          )}

          {activeTab === "characters" && (
            <motion.div
              key="characters"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
              className="space-y-8"
            >
              {/* Idea prompt (still needed for story direction) */}
              <IdeaPrompt
                value={prompt}
                onChange={setPrompt}
                minChars={MIN_CHARS}
                maxChars={MAX_CHARS}
                placeholder="A rain-soaked rooftop. Two rivals. One city. Go\u2026"
              />

              {/* Character Foundation */}
              <CharacterFoundation
                characters={characters}
                onChange={setCharacters}
                projectId={projectId}
              />

              {/* Style Sheet Upload */}
              <StyleSheetUpload
                styleRefs={styleRefs}
                onChange={setStyleRefs}
                projectId={projectId}
              />

              {/* Controls */}
              <div className="flex flex-col sm:flex-row gap-6 sm:items-end sm:justify-between">
                <div className="space-y-5 flex-1">
                  <LengthPicker
                    value={panelCount}
                    onChange={setPanelCount}
                    allUnlocked={false}
                    characterMode
                    userTier={userTier}
                  />
                  <ChapterPicker
                    value={chapterCount}
                    onChange={setChapterCount}
                    isMangakaPlus={true}
                    isStudioPlus={true}
                    maxChapters={10}
                    userTier={userTier}
                  />
                </div>
                <SummonButton
                  canProceed={canProceed}
                  advancing={advancing}
                  isOverCap={isOverCap}
                  onClick={handleSummon}
                  label="Summon with characters"
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ─── Dynamic Cost Hint ──────────────────────────────────────────── */}
        <CostHint
          panelCount={activeTab === "upload" ? extractedPanels.length || panelCount : panelCount}
          isUploadMode={activeTab === "upload"}
          isCharacterMode={activeTab === "characters"}
          characterCost={characterCost}
        />
      </div>
    </CreateWizardLayout>
  );
}

// ─── Tab Button ───────────────────────────────────────────────────────────────

function TabButton({
  active,
  onClick,
  icon,
  label,
  shortLabel,
  locked = false,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  shortLabel?: string;
  locked?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`relative flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-xs sm:text-sm font-medium transition-all flex-1 justify-center ${
        active
          ? "bg-white/[0.08] text-white/90 shadow-sm"
          : locked
          ? "text-white/25 hover:text-white/35"
          : "text-white/40 hover:text-white/60 hover:bg-white/[0.03]"
      }`}
    >
      {icon}
      <span className="sr-only">{label}</span>
      <span className="hidden lg:inline" aria-hidden="true">{label}</span>
      <span className="lg:hidden" aria-hidden="true">{shortLabel || label}</span>
      {locked && <Lock className="w-3 h-3 text-white/20" />}
    </button>
  );
}

// ─── Chapter Picker ───────────────────────────────────────────────────────────

function ChapterPicker({
  value,
  onChange,
  isMangakaPlus,
  isStudioPlus = false,
  maxChapters = 1,
  userTier = "free_trial",
}: {
  value: number;
  onChange: (v: number) => void;
  isMangakaPlus: boolean;
  isStudioPlus?: boolean;
  maxChapters?: number;
  userTier?: string;
}) {
  // Studio+ gets up to maxChapters (10 for character mode), Mangaka gets 3, Apprentice gets 1
  const effectiveMax = isStudioPlus ? maxChapters : isMangakaPlus ? Math.min(maxChapters, 3) : 1;

  // Show a reasonable number of pills (max 5 visible, then a "more" indicator)
  const visibleCount = Math.min(effectiveMax, 5);

  return (
    <div className="space-y-2">
      <label className="text-xs font-medium text-white/50 uppercase tracking-wider">
        Chapters
      </label>
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: visibleCount }, (_, i) => i + 1).map((ch) => (
          <button
            key={ch}
            onClick={() => onChange(ch)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${
              value === ch
                ? "bg-token-violet/10 text-token-violet ring-1 ring-token-violet/30"
                : "bg-white/5 text-white/40 hover:bg-white/10"
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            Chapter {ch}
          </button>
        ))}

        {/* Show "more" if effectiveMax > 5 */}
        {effectiveMax > 5 && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => {
                  const next = Math.min(value + 1, effectiveMax);
                  onChange(next);
                }}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/5 text-white/40 hover:bg-white/10 text-sm font-medium transition-all"
              >
                <BookOpen className="w-3.5 h-3.5" />
                +{effectiveMax - 5} more
              </button>
            </TooltipTrigger>
            <TooltipContent
              side="top"
              className="bg-[#1A1A2E] border-white/10 text-white/70 text-xs"
            >
              Up to {effectiveMax} chapters available on your plan
            </TooltipContent>
          </Tooltip>
        )}

        {/* Locked multi-chapter (for Apprentice) */}
        {!isMangakaPlus && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => {
                  UpgradeModalBus.open({
                    currentTier: userTier,
                    required: "creator",
                    requiredDisplayName: "Mangaka",
                    upgradeSku: "price_mangaka_monthly",
                    ctaText: "Unlock with Mangaka — from $19/mo",
                    pricingUrl: "/pricing",
                  });
                }}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/[0.02] text-white/20 text-sm border border-white/5 cursor-not-allowed"
              >
                <Lock className="w-3 h-3" />
                Multi-chapter
              </button>
            </TooltipTrigger>
            <TooltipContent
              side="top"
              className="bg-[#1A1A2E] border-white/10 text-white/70 text-xs"
            >
              Multi-chapter stories are part of Mangaka — upgrade to unlock
            </TooltipContent>
          </Tooltip>
        )}

        {/* Locked additional chapters for Mangaka (show Studio upgrade) */}
        {isMangakaPlus && !isStudioPlus && effectiveMax < maxChapters && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => {
                  UpgradeModalBus.open({
                    currentTier: userTier,
                    required: "studio",
                    requiredDisplayName: "Studio Pro",
                    upgradeSku: "price_studio_pro_monthly",
                    ctaText: "Unlock with Studio Pro — from $99/mo",
                    pricingUrl: "/pricing",
                  });
                }}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/[0.02] text-white/20 text-sm border border-white/5 cursor-not-allowed"
              >
                <Lock className="w-3 h-3" />
                More chapters
              </button>
            </TooltipTrigger>
            <TooltipContent
              side="top"
              className="bg-[#1A1A2E] border-white/10 text-white/70 text-xs"
            >
              Up to {maxChapters} chapters on Studio Pro
            </TooltipContent>
          </Tooltip>
        )}
      </div>
    </div>
  );
}

// ─── Summon Button ────────────────────────────────────────────────────────────

function SummonButton({
  canProceed,
  advancing,
  isOverCap,
  onClick,
  label,
}: {
  canProceed: boolean;
  advancing: boolean;
  isOverCap: boolean;
  onClick: () => void;
  label?: string;
}) {
  return (
    <div className="flex-shrink-0">
      <Tooltip>
        <TooltipTrigger asChild>
          <div>
            <motion.button
              whileHover={{ scale: canProceed && !advancing ? 1.02 : 1 }}
              whileTap={{ scale: canProceed && !advancing ? 0.97 : 1 }}
              onClick={onClick}
              disabled={!canProceed || advancing}
              className={`flex items-center gap-2.5 px-8 py-3.5 rounded-2xl font-semibold text-sm transition-all whitespace-nowrap ${
                canProceed && !advancing
                  ? "bg-gradient-to-r from-token-mint to-token-cyan text-[#0B0B18] shadow-[0_4px_24px_rgba(0,229,160,0.25)]"
                  : "bg-white/5 text-white/20 cursor-not-allowed"
              }`}
            >
              {advancing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Summoning...
                </>
              ) : (
                <>
                  {label || "Summon script"}
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </motion.button>
          </div>
        </TooltipTrigger>
        {!canProceed && !advancing && (
          <TooltipContent
            side="top"
            className="bg-[#1A1A2E] border-white/10 text-white/70 text-xs max-w-[260px]"
          >
            {isOverCap
              ? "Your idea is over 2,000 characters — trim it down a bit"
              : "Give us a bit more to work with — at least 40 characters"}
          </TooltipContent>
        )}
      </Tooltip>
    </div>
  );
}

// ─── Dynamic Cost Hint Component ─────────────────────────────────────────────

function CostHint({
  panelCount,
  isUploadMode = false,
  isCharacterMode = false,
  characterCost = 0,
}: {
  panelCount: number;
  isUploadMode?: boolean;
  isCharacterMode?: boolean;
  characterCost?: number;
}) {
  const { user } = useAuth();
  const { data: creditData } = trpc.projects.creditBalance.useQuery(undefined, {
    enabled: !!user,
  });

  // Scale costs based on panel count (base costs are for 20 panels)
  const scaleFactor = panelCount / 20;

  // Stage 0 cost (input → setup)
  const stageCost = creditData?.stageCosts?.[0]?.cost ?? 0;

  // Upload mode adds 2c per panel for ingest + OCR
  const uploadIngestCost = isUploadMode ? panelCount * 2 : 0;

  // Total project forecast
  const baseTotalCost = creditData?.totalProjectCost ?? 17;
  const scalableCosts = (creditData?.stageCosts ?? []).reduce(
    (sum: number, s: { cost: number; stage: number }) =>
      [2, 3, 5].includes(s.stage) ? sum + s.cost : sum,
    0
  );
  const fixedCosts = baseTotalCost - scalableCosts;
  const scaledTotal = Math.round(
    fixedCosts + scalableCosts * scaleFactor + uploadIngestCost + characterCost
  );

  const balance = creditData?.balance ?? 0;
  const canAfford = balance >= scaledTotal;

  return (
    <div className="text-center">
      <p className="text-[11px] text-white/20">
        This stage: {stageCost === 0 ? "free" : `${stageCost}c`}
        {isUploadMode && panelCount > 0 && (
          <span> + {uploadIngestCost}c ingest</span>
        )}
        {isCharacterMode && characterCost > 0 && (
          <span> + {characterCost}c characters</span>
        )}
        {" \u00b7 "}
        full project forecast:{" "}
        <span className={canAfford ? "text-token-mint/40" : "text-red-400/50"}>
          ~{scaledTotal}c
        </span>
        {panelCount > 20 && (
          <span className="text-white/15"> ({panelCount} panels)</span>
        )}
      </p>
    </div>
  );
}

// ─── Analytics Helper ─────────────────────────────────────────────────────────

function emitAnalytics(event: string, data?: Record<string, unknown>) {
  try {
    window.dispatchEvent(
      new CustomEvent("awakli:analytics", {
        detail: { event, ...data, timestamp: Date.now() },
      })
    );
  } catch {
    // Silently fail
  }
}
