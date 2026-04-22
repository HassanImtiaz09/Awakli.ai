/**
 * QAPanelsFixture — Deterministic fixture-backed Panels stage for QA verification.
 *
 * Renders the full component tree (PanelGrid, PanelLightbox, PanelBatchBar,
 * StyleDrift, ConsistencyReport) with fixture data from qaFixtures.ts.
 * No tRPC calls are made. Activated via ?qa=panels query param.
 */
import { useState, useCallback } from "react";
import { LayoutGrid, CheckCircle2, Paintbrush, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import CreateWizardLayout from "@/layouts/CreateWizardLayout";
import { PanelGrid } from "./PanelGrid";
import { PanelLightbox } from "./PanelLightbox";
import { PanelBatchBar, getBatchLimit } from "./PanelBatchBar";
import { StyleDrift, STYLE_DRIFT_PREVIEW_COST } from "./StyleDrift";
import { ConsistencyReport, AUTO_CORRECT_MONTHLY_CAP } from "./ConsistencyReport";
import { StageHeader } from "./StageHeader";
import { QA_PANELS, QA_FLAGGED_PANELS } from "@/fixtures/qaFixtures";
import type { FlaggedPanel } from "./ConsistencyReport";

interface QAPanelsFixtureProps {
  selectedIds: Set<number>;
  setSelectedIds: React.Dispatch<React.SetStateAction<Set<number>>>;
  lightboxPanelId: number | null;
  setLightboxPanelId: React.Dispatch<React.SetStateAction<number | null>>;
  styleDriftOpen: boolean;
  setStyleDriftOpen: React.Dispatch<React.SetStateAction<boolean>>;
  consistencyOpen: boolean;
  setConsistencyOpen: React.Dispatch<React.SetStateAction<boolean>>;
}

export function QAPanelsFixture({
  selectedIds,
  setSelectedIds,
  lightboxPanelId,
  setLightboxPanelId,
  styleDriftOpen,
  setStyleDriftOpen,
  consistencyOpen,
  setConsistencyOpen,
}: QAPanelsFixtureProps) {
  const [flaggedPanels] = useState<FlaggedPanel[]>(QA_FLAGGED_PANELS);
  const [styleDriftPreviewing, setStyleDriftPreviewing] = useState(false);
  const [styleDriftApplying, setStyleDriftApplying] = useState(false);
  const [styleDriftPreviewUrl, setStyleDriftPreviewUrl] = useState<string | null>(null);
  const [batchProcessing, setBatchProcessing] = useState(false);
  const [correctingPanelIds] = useState<Set<number>>(new Set());
  const [autoCorrectUsed] = useState(0);

  const flaggedIds = new Set(flaggedPanels.map((fp) => fp.panelId));
  const selectionMode = selectedIds.size > 0;
  const panelsWithImages = QA_PANELS.filter((p) => !!p.imageUrl);

  const handleToggleSelect = useCallback(
    (id: number) => {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
    },
    [setSelectedIds],
  );

  const handleRedraw = useCallback((id: number) => {
    toast.info(`[QA] Redraw panel ${id}`, { description: "No-op in fixture mode" });
  }, []);

  const handleBatchRedraw = useCallback(
    (prompt: string) => {
      setBatchProcessing(true);
      toast.info(`[QA] Batch redraw ${selectedIds.size} panels`, {
        description: `Prompt: "${prompt.slice(0, 50)}..."`,
      });
      setTimeout(() => {
        setBatchProcessing(false);
        setSelectedIds(new Set());
      }, 1500);
    },
    [selectedIds, setSelectedIds],
  );

  const handleStyleDriftPreview = useCallback((driftValue: number) => {
    setStyleDriftPreviewing(true);
    setTimeout(() => {
      setStyleDriftPreviewUrl(QA_PANELS[0].imageUrl || null);
      setStyleDriftPreviewing(false);
    }, 1000);
  }, []);

  const handleStyleDriftApply = useCallback(
    (driftValue: number) => {
      setStyleDriftApplying(true);
      setTimeout(() => {
        toast.success("[QA] Style drift applied");
        setStyleDriftApplying(false);
        setStyleDriftOpen(false);
        setStyleDriftPreviewUrl(null);
      }, 1000);
    },
    [setStyleDriftOpen],
  );

  const handleConsistencyJump = useCallback(
    (panelId: number) => {
      setConsistencyOpen(false);
      setLightboxPanelId(panelId);
    },
    [setConsistencyOpen, setLightboxPanelId],
  );

  const COST_PER_PANEL = 3;

  return (
    <CreateWizardLayout
      stage={2}
      projectId="qa-fixture"
      projectTitle="QA Fixture: The Awakening"
      completedStages={new Set([0, 1])}
    >
      <div className="max-w-5xl mx-auto space-y-8" data-qa="panels">
        {/* Header */}
        <div className="space-y-2">
          <StageHeader stageKey="panels" icon={LayoutGrid} className="text-token-cyan" />
          <h1 className="text-3xl lg:text-4xl font-bold text-white/90">Your panels</h1>
          <p className="text-token-gold text-xs font-mono">
            QA FIXTURE MODE — no tRPC calls, deterministic data ({QA_PANELS.length} panels)
          </p>
        </div>

        {/* Selection hint */}
        {!selectionMode && (
          <p className="text-[11px] text-white/20 text-center">
            Shift+click to select. Batch tools appear below.
          </p>
        )}

        {/* Progress bar */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-white/30">
            <span>
              {panelsWithImages.length} / {QA_PANELS.length} panels rendered
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-token-violet via-token-cyan to-token-mint"
              style={{
                width: `${(panelsWithImages.length / Math.max(QA_PANELS.length, 1)) * 100}%`,
              }}
            />
          </div>
        </div>

        {/* Complete banner with pro tools */}
        <div className="flex items-center justify-between px-4 py-3 rounded-xl bg-token-mint/5 border border-token-mint/10 text-token-mint text-sm">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
            All panels ready. Publish when you are.
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setStyleDriftOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] text-token-violet text-xs font-medium transition-colors"
            >
              <Paintbrush className="w-3.5 h-3.5" />
              Style drift
            </button>
            <button
              onClick={() => setConsistencyOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] text-token-gold text-xs font-medium transition-colors"
            >
              <ShieldAlert className="w-3.5 h-3.5" />
              Consistency check
            </button>
          </div>
        </div>

        {/* Panel grid */}
        <PanelGrid
          panels={QA_PANELS}
          totalExpected={QA_PANELS.length}
          newPanelIds={new Set()}
          onRedraw={handleRedraw}
          onOpen={(id) => setLightboxPanelId(id)}
          selectedIds={selectedIds}
          flaggedIds={flaggedIds}
          selectionMode={selectionMode}
          onToggleSelect={handleToggleSelect}
        />
      </div>

      {/* Lightbox */}
      <PanelLightbox
        panels={panelsWithImages}
        activePanelId={lightboxPanelId}
        onClose={() => setLightboxPanelId(null)}
        onRedraw={handleRedraw}
        isRedrawing={false}
        regenCount={2}
        regenLimit={15}
      />

      {/* Batch bar */}
      <PanelBatchBar
        selectedIds={selectedIds}
        maxBatch={getBatchLimit("creator")}
        costPerPanel={COST_PER_PANEL}
        isProcessing={batchProcessing}
        onBatchRedraw={handleBatchRedraw}
        onMatchToPanel={() => toast.info("[QA] Match to panel")}
        onOpenStyleDrift={() => setStyleDriftOpen(true)}
        onClearSelection={() => setSelectedIds(new Set())}
      />

      {/* Style drift */}
      <StyleDrift
        isOpen={styleDriftOpen}
        onClose={() => {
          setStyleDriftOpen(false);
          setStyleDriftPreviewUrl(null);
        }}
        totalPanels={panelsWithImages.length}
        costPerPanel={COST_PER_PANEL}
        previewCost={STYLE_DRIFT_PREVIEW_COST}
        isPreviewing={styleDriftPreviewing}
        isApplying={styleDriftApplying}
        previewImageUrl={styleDriftPreviewUrl}
        onPreview={handleStyleDriftPreview}
        onApply={handleStyleDriftApply}
      />

      {/* Consistency report */}
      <ConsistencyReport
        isOpen={consistencyOpen}
        onClose={() => setConsistencyOpen(false)}
        flaggedPanels={flaggedPanels}
        isLoading={false}
        userTier="creator"
        autoCorrectRemaining={AUTO_CORRECT_MONTHLY_CAP - autoCorrectUsed}
        autoCorrectCap={AUTO_CORRECT_MONTHLY_CAP}
        onJumpToPanel={handleConsistencyJump}
        onAutoCorrect={(id) => toast.info(`[QA] Auto-correct panel ${id}`)}
        onOpenLoraRetraining={() => toast.info("[QA] Open LoRA retraining")}
        correctingPanelIds={correctingPanelIds}
      />
    </CreateWizardLayout>
  );
}
