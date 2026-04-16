/**
 * BYO (Bring Your Own) Manga Upload Pipeline
 * 
 * Multi-step wizard: Upload → Detect → Segment → Cleanup → Style → OCR → Review → Finalize
 */

import { motion, AnimatePresence } from "framer-motion";
import {
  Upload, Image, X, CheckCircle2, AlertCircle, Loader2,
  ChevronRight, ChevronLeft, Sparkles, Eye, Wand2, ScanLine,
  Type, FileText, Palette, Settings2, ArrowRight, RotateCcw,
  Zap, BookOpen, Layers, Grid3X3
} from "lucide-react";
import React, { useState, useRef, useCallback, useMemo } from "react";
import { useRoute, useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { trpc } from "@/lib/trpc";
import { AwakliButton } from "@/components/awakli/AwakliButton";
import { AwakliProgress } from "@/components/awakli/AwakliProgress";
import { StudioLayout } from "@/components/awakli/Layouts";
import { toast } from "sonner";

// ─── Types ──────────────────────────────────────────────────────────────────

type WizardStep = "upload" | "detect" | "segment" | "process" | "style" | "ocr" | "review";

interface UploadedPage {
  id: number;
  file: File;
  preview: string;
  url: string;
  pageNumber: number;
  sourceType?: string;
  sourceConfidence?: number;
  segmentation?: any;
  processed?: boolean;
  styled?: boolean;
  ocrDone?: boolean;
  metadata?: any;
}

const STEPS: { key: WizardStep; label: string; icon: React.ReactNode }[] = [
  { key: "upload", label: "Upload", icon: <Upload className="w-4 h-4" /> },
  { key: "detect", label: "Detect Source", icon: <ScanLine className="w-4 h-4" /> },
  { key: "segment", label: "Segment Panels", icon: <Grid3X3 className="w-4 h-4" /> },
  { key: "process", label: "Cleanup", icon: <Wand2 className="w-4 h-4" /> },
  { key: "style", label: "Style Transfer", icon: <Palette className="w-4 h-4" /> },
  { key: "ocr", label: "Extract Dialogue", icon: <Type className="w-4 h-4" /> },
  { key: "review", label: "Review & Finalize", icon: <CheckCircle2 className="w-4 h-4" /> },
];

const READING_DIRECTIONS = [
  { value: "rtl" as const, label: "Right-to-Left (Manga)", desc: "Japanese manga reading order" },
  { value: "ltr" as const, label: "Left-to-Right (Comics)", desc: "Western comic reading order" },
];

// ─── Main Component ─────────────────────────────────────────────────────────

export default function BYOUpload() {
  const { isAuthenticated, user } = useAuth();
  const [, navigate] = useLocation();
  const [match, params] = useRoute("/studio/byo-upload/:projectId");
  const projectId = match ? parseInt(params.projectId) : undefined;

  const [step, setStep] = useState<WizardStep>("upload");
  const [pages, setPages] = useState<UploadedPage[]>([]);
  const [readingDirection, setReadingDirection] = useState<"ltr" | "rtl">("rtl");
  const [selectedStyle, setSelectedStyle] = useState<string>("enhance_only");
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processProgress, setProcessProgress] = useState({ current: 0, total: 0, label: "" });
  const fileInputRef = useRef<HTMLInputElement>(null);

  // tRPC mutations
  const uploadPageMut = trpc.upload.uploadPage.useMutation();
  const detectSourceMut = trpc.upload.detectSourceType.useMutation();
  const segmentPageMut = trpc.upload.segmentPage.useMutation();
  const processPanelMut = trpc.upload.processPanel.useMutation();
  const styleTransferMut = trpc.upload.applyStyleTransfer.useMutation();
  const extractDialogueMut = trpc.upload.extractDialogue.useMutation();
  const autoFillMut = trpc.upload.autoFillMetadata.useMutation();
  const { data: limits } = trpc.upload.getLimits.useQuery();
  const { data: styleOptions } = trpc.upload.getStyleTransferOptions.useQuery();

  const stepIndex = STEPS.findIndex(s => s.key === step);

  // ─── File Upload Handlers ──────────────────────────────────────────────

  const addFiles = useCallback((newFiles: File[]) => {
    const valid = newFiles.filter(f => f.type.startsWith("image/") && f.size < 20 * 1024 * 1024);
    if (valid.length !== newFiles.length) {
      toast.error("Some files were skipped (images only, max 20MB)");
    }
    if (limits && pages.length + valid.length > (limits.limits.maxPages || 100)) {
      toast.error(`Page limit: ${limits.limits.maxPages} pages for ${limits.tier} tier`);
      return;
    }
    const items: UploadedPage[] = valid.map((file, i) => ({
      id: 0,
      file,
      preview: URL.createObjectURL(file),
      url: "",
      pageNumber: pages.length + i + 1,
    }));
    setPages(prev => [...prev, ...items]);
  }, [pages.length, limits]);

  const removePage = (index: number) => {
    setPages(prev => {
      URL.revokeObjectURL(prev[index].preview);
      return prev.filter((_, i) => i !== index).map((p, i) => ({ ...p, pageNumber: i + 1 }));
    });
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    addFiles(Array.from(e.dataTransfer.files));
  };

  // ─── Step: Upload to S3 ────────────────────────────────────────────────

  const handleUploadAll = async () => {
    if (!projectId) {
      toast.error("No project selected");
      return;
    }
    setIsProcessing(true);
    setProcessProgress({ current: 0, total: pages.length, label: "Uploading pages..." });

    const updated = [...pages];
    for (let i = 0; i < updated.length; i++) {
      setProcessProgress({ current: i + 1, total: pages.length, label: `Uploading page ${i + 1}...` });
      try {
        const reader = new FileReader();
        const base64 = await new Promise<string>((resolve) => {
          reader.onload = () => resolve((reader.result as string).split(",")[1]);
          reader.readAsDataURL(updated[i].file);
        });
        const result = await uploadPageMut.mutateAsync({
          projectId,
          imageBase64: base64,
          fileName: updated[i].file.name,
          mimeType: updated[i].file.type || "image/png",
          pageNumber: updated[i].pageNumber,
        });
        updated[i] = { ...updated[i], id: result.assetId, url: result.url || "" };
      } catch (err: any) {
        toast.error(`Failed to upload page ${i + 1}: ${err.message}`);
      }
    }
    setPages(updated);
    setIsProcessing(false);
    toast.success(`${updated.filter(p => p.id > 0).length} pages uploaded`);
    setStep("detect");
  };

  // ─── Step: Detect Source Type ──────────────────────────────────────────

  const handleDetectAll = async () => {
    setIsProcessing(true);
    const updated = [...pages];
    for (let i = 0; i < updated.length; i++) {
      if (!updated[i].url) continue;
      setProcessProgress({ current: i + 1, total: pages.length, label: `Analyzing page ${i + 1}...` });
      try {
        const result = await detectSourceMut.mutateAsync({
          assetId: updated[i].id,
          imageUrl: updated[i].url,
        });
        updated[i] = { ...updated[i], sourceType: result.sourceType, sourceConfidence: result.confidence };
      } catch {
        updated[i] = { ...updated[i], sourceType: "digital_art", sourceConfidence: 0.3 };
      }
    }
    setPages(updated);
    setIsProcessing(false);
    const types = updated.map(p => p.sourceType);
    const consensus = types.sort((a, b) => types.filter(t => t === b).length - types.filter(t => t === a).length)[0];
    toast.success(`Source detected: ${consensus?.replace("_", " ")} (${updated.length} pages)`);
    setStep("segment");
  };

  // ─── Step: Segment Panels ─────────────────────────────────────────────

  const handleSegmentAll = async () => {
    setIsProcessing(true);
    const updated = [...pages];
    for (let i = 0; i < updated.length; i++) {
      if (!updated[i].url) continue;
      setProcessProgress({ current: i + 1, total: pages.length, label: `Segmenting page ${i + 1}...` });
      try {
        const result = await segmentPageMut.mutateAsync({
          assetId: updated[i].id,
          imageUrl: updated[i].url,
          readingDirection,
        });
        updated[i] = { ...updated[i], segmentation: result };
      } catch {
        updated[i] = { ...updated[i], segmentation: { panels: [{ panelIndex: 0, x: 0, y: 0, width: 100, height: 100, readingOrder: 1 }], totalPanelsDetected: 1 } };
      }
    }
    setPages(updated);
    setIsProcessing(false);
    const totalPanels = updated.reduce((sum, p) => sum + (p.segmentation?.totalPanelsDetected || 1), 0);
    toast.success(`Found ${totalPanels} panels across ${updated.length} pages`);
    setStep("process");
  };

  // ─── Step: Process / Cleanup ──────────────────────────────────────────

  const handleProcessAll = async () => {
    setIsProcessing(true);
    const updated = [...pages];
    for (let i = 0; i < updated.length; i++) {
      if (!updated[i].url || !updated[i].sourceType) continue;
      setProcessProgress({ current: i + 1, total: pages.length, label: `Cleaning page ${i + 1}...` });
      try {
        await processPanelMut.mutateAsync({
          assetId: updated[i].id,
          imageUrl: updated[i].url,
          sourceType: updated[i].sourceType as "ai_generated" | "digital_art" | "hand_drawn",
        });
        updated[i] = { ...updated[i], processed: true };
      } catch {
        // Cleanup failed, continue with original
      }
    }
    setPages(updated);
    setIsProcessing(false);
    toast.success("Cleanup complete");
    setStep("style");
  };

  // ─── Step: Style Transfer ─────────────────────────────────────────────

  const handleStyleAll = async () => {
    if (selectedStyle === "none") {
      setPages(prev => prev.map(p => ({ ...p, styled: true })));
      toast.info("Keeping original style");
      setStep("ocr");
      return;
    }
    setIsProcessing(true);
    const updated = [...pages];
    for (let i = 0; i < updated.length; i++) {
      if (!updated[i].url) continue;
      setProcessProgress({ current: i + 1, total: pages.length, label: `Styling page ${i + 1}...` });
      try {
        await styleTransferMut.mutateAsync({
          assetId: updated[i].id,
          imageUrl: updated[i].url,
          option: selectedStyle as any,
        });
        updated[i] = { ...updated[i], styled: true };
      } catch {
        // Style transfer failed, continue
      }
    }
    setPages(updated);
    setIsProcessing(false);
    toast.success("Style transfer complete");
    setStep("ocr");
  };

  // ─── Step: OCR Dialogue Extraction ────────────────────────────────────

  const handleOCRAll = async () => {
    setIsProcessing(true);
    const updated = [...pages];
    for (let i = 0; i < updated.length; i++) {
      if (!updated[i].url) continue;
      setProcessProgress({ current: i + 1, total: pages.length, label: `Extracting dialogue ${i + 1}...` });
      try {
        const result = await extractDialogueMut.mutateAsync({
          assetId: updated[i].id,
          imageUrl: updated[i].url,
        });
        // Also auto-fill metadata
        const metadata = await autoFillMut.mutateAsync({
          assetId: updated[i].id,
          imageUrl: updated[i].url,
        });
        updated[i] = { ...updated[i], ocrDone: true, metadata: { ocr: result, ...metadata } };
      } catch {
        updated[i] = { ...updated[i], ocrDone: true };
      }
    }
    setPages(updated);
    setIsProcessing(false);
    toast.success("Dialogue extraction complete");
    setStep("review");
  };

  // ─── Computed Stats ───────────────────────────────────────────────────

  const totalPanels = useMemo(() =>
    pages.reduce((sum, p) => sum + (p.segmentation?.totalPanelsDetected || 1), 0),
    [pages]
  );

  const consensusSource = useMemo(() => {
    const types = pages.map(p => p.sourceType).filter(Boolean);
    if (types.length === 0) return null;
    const counts: Record<string, number> = {};
    types.forEach(t => { counts[t!] = (counts[t!] || 0) + 1; });
    return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
  }, [pages]);

  // ─── Auth Gate ────────────────────────────────────────────────────────

  if (!isAuthenticated) {
    return (
      <StudioLayout>
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6">
          <BookOpen className="w-16 h-16 text-cyan-400" />
          <h2 className="text-2xl font-bold text-white">Bring Your Manga to Life</h2>
          <p className="text-zinc-400 text-center max-w-md">
            Upload your existing manga pages and transform them into anime with AI-powered processing.
          </p>
          <a href={getLoginUrl("/studio/byo-upload")} className="px-6 py-3 bg-cyan-500 text-white rounded-lg font-semibold hover:bg-cyan-400 transition-colors">
            Sign In to Upload
          </a>
        </div>
      </StudioLayout>
    );
  }

  if (limits?.limits.maxPages === 0) {
    return (
      <StudioLayout>
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6">
          <Sparkles className="w-16 h-16 text-amber-400" />
          <h2 className="text-2xl font-bold text-white">Upgrade to Upload</h2>
          <p className="text-zinc-400 text-center max-w-md">
            BYO Manga Upload requires a Creator ($19/mo) or Studio ($49/mo) subscription.
          </p>
          <AwakliButton variant="primary" onClick={() => navigate("/pricing")}>
            View Plans
          </AwakliButton>
        </div>
      </StudioLayout>
    );
  }

  // ─── Render ───────────────────────────────────────────────────────────

  return (
    <StudioLayout>
      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white flex items-center gap-3">
            <BookOpen className="w-8 h-8 text-cyan-400" />
            Bring Your Manga to Life
          </h1>
          <p className="text-zinc-400 mt-2">
            Upload existing manga pages and transform them into anime-ready assets
          </p>
        </div>

        {/* Step Indicator */}
        <div className="flex items-center gap-2 mb-8 overflow-x-auto pb-2">
          {STEPS.map((s, i) => {
            const isActive = s.key === step;
            const isDone = i < stepIndex;
            return (
              <React.Fragment key={s.key}>
                {i > 0 && <ChevronRight className="w-4 h-4 text-zinc-600 flex-shrink-0" />}
                <button
                  onClick={() => isDone && setStep(s.key)}
                  disabled={!isDone && !isActive}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${
                    isActive
                      ? "bg-cyan-500/20 text-cyan-400 border border-cyan-500/30"
                      : isDone
                      ? "bg-zinc-800 text-zinc-300 hover:bg-zinc-700 cursor-pointer"
                      : "bg-zinc-900 text-zinc-600 cursor-not-allowed"
                  }`}
                >
                  {isDone ? <CheckCircle2 className="w-4 h-4 text-green-400" /> : s.icon}
                  {s.label}
                </button>
              </React.Fragment>
            );
          })}
        </div>

        {/* Processing Overlay */}
        <AnimatePresence>
          {isProcessing && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="mb-6 p-4 bg-zinc-900 border border-cyan-500/30 rounded-xl"
            >
              <div className="flex items-center gap-3 mb-2">
                <Loader2 className="w-5 h-5 text-cyan-400 animate-spin" />
                <span className="text-white font-medium">{processProgress.label}</span>
                <span className="text-zinc-500 text-sm ml-auto">
                  {processProgress.current} / {processProgress.total}
                </span>
              </div>
              <AwakliProgress
                value={(processProgress.current / Math.max(processProgress.total, 1)) * 100}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Step Content */}
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2 }}
          >
            {/* ─── UPLOAD STEP ─────────────────────────────────────────── */}
            {step === "upload" && (
              <div className="space-y-6">
                {/* Drag & Drop Zone */}
                <div
                  onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer transition-all ${
                    isDragging
                      ? "border-cyan-400 bg-cyan-500/10"
                      : "border-zinc-700 hover:border-zinc-500 bg-zinc-900/50"
                  }`}
                >
                  <Upload className={`w-12 h-12 mx-auto mb-4 ${isDragging ? "text-cyan-400" : "text-zinc-500"}`} />
                  <p className="text-lg font-medium text-white mb-1">
                    Drop manga pages here or click to browse
                  </p>
                  <p className="text-sm text-zinc-500">
                    PNG, JPG, WebP — up to 20MB per file — {limits?.limits.maxPages || 20} pages max ({limits?.tier} tier)
                  </p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => e.target.files && addFiles(Array.from(e.target.files))}
                  />
                </div>

                {/* Reading Direction */}
                <div className="flex gap-4">
                  {READING_DIRECTIONS.map(dir => (
                    <button
                      key={dir.value}
                      onClick={() => setReadingDirection(dir.value)}
                      className={`flex-1 p-4 rounded-xl border transition-all ${
                        readingDirection === dir.value
                          ? "border-cyan-500 bg-cyan-500/10"
                          : "border-zinc-800 bg-zinc-900 hover:border-zinc-600"
                      }`}
                    >
                      <p className="font-medium text-white">{dir.label}</p>
                      <p className="text-sm text-zinc-500">{dir.desc}</p>
                    </button>
                  ))}
                </div>

                {/* Uploaded Pages Grid */}
                {pages.length > 0 && (
                  <div>
                    <h3 className="text-lg font-semibold text-white mb-3">
                      {pages.length} page{pages.length !== 1 ? "s" : ""} selected
                    </h3>
                    <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-3">
                      {pages.map((page, i) => (
                        <div key={i} className="relative group">
                          <img
                            src={page.preview}
                            alt={`Page ${page.pageNumber}`}
                            className="w-full aspect-[3/4] object-cover rounded-lg border border-zinc-800"
                          />
                          <button
                            onClick={(e) => { e.stopPropagation(); removePage(i); }}
                            className="absolute top-1 right-1 w-6 h-6 bg-red-500/80 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <X className="w-3 h-3 text-white" />
                          </button>
                          <span className="absolute bottom-1 left-1 text-xs bg-black/60 text-white px-1.5 py-0.5 rounded">
                            P{page.pageNumber}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Upload Button */}
                {pages.length > 0 && (
                  <div className="flex justify-end">
                    <AwakliButton
                      variant="primary"
                      onClick={handleUploadAll}
                      disabled={isProcessing || !projectId}
                    >
                      Upload {pages.length} Pages <ArrowRight className="w-4 h-4 ml-2" />
                    </AwakliButton>
                  </div>
                )}
              </div>
            )}

            {/* ─── DETECT STEP ─────────────────────────────────────────── */}
            {step === "detect" && (
              <div className="space-y-6">
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
                  <h3 className="text-lg font-semibold text-white mb-2 flex items-center gap-2">
                    <ScanLine className="w-5 h-5 text-cyan-400" />
                    Source Type Detection
                  </h3>
                  <p className="text-zinc-400 mb-4">
                    AI analyzes each page to determine if it's AI-generated, digitally drawn, or hand-drawn.
                    This determines the cleanup pipeline.
                  </p>

                  {/* Detection Results */}
                  {pages.some(p => p.sourceType) && (
                    <div className="grid grid-cols-3 gap-4 mb-4">
                      {["ai_generated", "digital_art", "hand_drawn"].map(type => {
                        const count = pages.filter(p => p.sourceType === type).length;
                        return (
                          <div key={type} className={`p-3 rounded-lg border ${count > 0 ? "border-cyan-500/30 bg-cyan-500/5" : "border-zinc-800 bg-zinc-900/50"}`}>
                            <p className="text-sm text-zinc-400 capitalize">{type.replace("_", " ")}</p>
                            <p className="text-2xl font-bold text-white">{count}</p>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  <AwakliButton variant="primary" onClick={handleDetectAll} disabled={isProcessing}>
                    <ScanLine className="w-4 h-4 mr-2" />
                    Detect Source Type
                  </AwakliButton>
                </div>

                {/* Page Thumbnails with Detection Results */}
                <div className="grid grid-cols-4 sm:grid-cols-6 gap-3">
                  {pages.map((page, i) => (
                    <div key={i} className="relative">
                      <img src={page.preview} alt={`Page ${page.pageNumber}`}
                        className="w-full aspect-[3/4] object-cover rounded-lg border border-zinc-800" />
                      {page.sourceType && (
                        <span className={`absolute bottom-1 left-1 text-[10px] px-1.5 py-0.5 rounded font-medium ${
                          page.sourceType === "ai_generated" ? "bg-purple-500/80 text-white"
                          : page.sourceType === "digital_art" ? "bg-blue-500/80 text-white"
                          : "bg-amber-500/80 text-white"
                        }`}>
                          {page.sourceType.replace("_", " ")}
                        </span>
                      )}
                    </div>
                  ))}
                </div>

                {pages.some(p => p.sourceType) && (
                  <div className="flex justify-end">
                    <AwakliButton variant="primary" onClick={() => setStep("segment")}>
                      Continue to Segmentation <ArrowRight className="w-4 h-4 ml-2" />
                    </AwakliButton>
                  </div>
                )}
              </div>
            )}

            {/* ─── SEGMENT STEP ────────────────────────────────────────── */}
            {step === "segment" && (
              <div className="space-y-6">
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
                  <h3 className="text-lg font-semibold text-white mb-2 flex items-center gap-2">
                    <Grid3X3 className="w-5 h-5 text-cyan-400" />
                    Panel Segmentation
                  </h3>
                  <p className="text-zinc-400 mb-4">
                    AI identifies individual panels on each page and determines reading order
                    ({readingDirection === "rtl" ? "right-to-left" : "left-to-right"}).
                  </p>

                  {totalPanels > pages.length && (
                    <div className="mb-4 p-3 bg-cyan-500/10 border border-cyan-500/20 rounded-lg">
                      <p className="text-cyan-400 font-medium">
                        {totalPanels} panels detected across {pages.length} pages
                      </p>
                    </div>
                  )}

                  <AwakliButton variant="primary" onClick={handleSegmentAll} disabled={isProcessing}>
                    <Grid3X3 className="w-4 h-4 mr-2" />
                    Segment All Pages
                  </AwakliButton>
                </div>

                {/* Segmentation Preview */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  {pages.map((page, i) => (
                    <div key={i} className="relative bg-zinc-900 rounded-xl border border-zinc-800 p-3">
                      <div className="relative">
                        <img src={page.preview} alt={`Page ${page.pageNumber}`}
                          className="w-full rounded-lg" />
                        {/* Panel overlay boxes */}
                        {page.segmentation?.panels?.map((panel: any, pi: number) => (
                          <div
                            key={pi}
                            className="absolute border-2 border-cyan-400/60 bg-cyan-400/10 rounded"
                            style={{
                              left: `${panel.x}%`,
                              top: `${panel.y}%`,
                              width: `${panel.width}%`,
                              height: `${panel.height}%`,
                            }}
                          >
                            <span className="absolute top-0 left-0 bg-cyan-500 text-white text-[10px] px-1 rounded-br">
                              {panel.readingOrder}
                            </span>
                          </div>
                        ))}
                      </div>
                      <div className="mt-2 flex items-center justify-between">
                        <span className="text-sm text-zinc-400">Page {page.pageNumber}</span>
                        <span className="text-sm text-cyan-400 font-medium">
                          {page.segmentation?.totalPanelsDetected || "—"} panels
                        </span>
                      </div>
                    </div>
                  ))}
                </div>

                {pages.some(p => p.segmentation) && (
                  <div className="flex justify-end">
                    <AwakliButton variant="primary" onClick={() => setStep("process")}>
                      Continue to Cleanup <ArrowRight className="w-4 h-4 ml-2" />
                    </AwakliButton>
                  </div>
                )}
              </div>
            )}

            {/* ─── PROCESS / CLEANUP STEP ──────────────────────────────── */}
            {step === "process" && (
              <div className="space-y-6">
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
                  <h3 className="text-lg font-semibold text-white mb-2 flex items-center gap-2">
                    <Wand2 className="w-5 h-5 text-cyan-400" />
                    Scan Cleanup
                  </h3>
                  <p className="text-zinc-400 mb-4">
                    {consensusSource === "hand_drawn"
                      ? "Removing paper texture, deskewing, extracting line art, and normalizing brightness."
                      : consensusSource === "digital_art"
                      ? "Normalizing colors, checking style compatibility, and format conversion."
                      : "Verifying resolution, normalizing format, and checking aspect ratios."}
                  </p>

                  {/* Cleanup Steps Preview */}
                  <div className="space-y-2 mb-4">
                    {consensusSource && ["ai_generated", "digital_art", "hand_drawn"].includes(consensusSource) && (
                      <>
                        {consensusSource === "hand_drawn" && (
                          <>
                            <div className="flex items-center gap-2 text-sm"><CheckCircle2 className="w-4 h-4 text-green-400" /><span className="text-zinc-300">Deskew rotation correction</span></div>
                            <div className="flex items-center gap-2 text-sm"><CheckCircle2 className="w-4 h-4 text-green-400" /><span className="text-zinc-300">Scanner border removal</span></div>
                            <div className="flex items-center gap-2 text-sm"><CheckCircle2 className="w-4 h-4 text-green-400" /><span className="text-zinc-300">Paper texture removal</span></div>
                            <div className="flex items-center gap-2 text-sm"><CheckCircle2 className="w-4 h-4 text-green-400" /><span className="text-zinc-300">Line art extraction</span></div>
                            <div className="flex items-center gap-2 text-sm"><CheckCircle2 className="w-4 h-4 text-green-400" /><span className="text-zinc-300">Resolution upscale</span></div>
                          </>
                        )}
                        {consensusSource === "digital_art" && (
                          <>
                            <div className="flex items-center gap-2 text-sm"><CheckCircle2 className="w-4 h-4 text-green-400" /><span className="text-zinc-300">Color normalization (sRGB)</span></div>
                            <div className="flex items-center gap-2 text-sm"><CheckCircle2 className="w-4 h-4 text-green-400" /><span className="text-zinc-300">Format normalization (PNG)</span></div>
                            <div className="flex items-center gap-2 text-sm"><CheckCircle2 className="w-4 h-4 text-green-400" /><span className="text-zinc-300">Style compatibility check</span></div>
                          </>
                        )}
                        {consensusSource === "ai_generated" && (
                          <>
                            <div className="flex items-center gap-2 text-sm"><CheckCircle2 className="w-4 h-4 text-green-400" /><span className="text-zinc-300">Resolution verification (1024px+)</span></div>
                            <div className="flex items-center gap-2 text-sm"><CheckCircle2 className="w-4 h-4 text-green-400" /><span className="text-zinc-300">Format normalization</span></div>
                            <div className="flex items-center gap-2 text-sm"><CheckCircle2 className="w-4 h-4 text-green-400" /><span className="text-zinc-300">Aspect ratio check</span></div>
                          </>
                        )}
                      </>
                    )}
                  </div>

                  <AwakliButton variant="primary" onClick={handleProcessAll} disabled={isProcessing}>
                    <Wand2 className="w-4 h-4 mr-2" />
                    Run Cleanup Pipeline
                  </AwakliButton>
                </div>

                {pages.some(p => p.processed) && (
                  <div className="flex justify-end">
                    <AwakliButton variant="primary" onClick={() => setStep("style")}>
                      Continue to Style Transfer <ArrowRight className="w-4 h-4 ml-2" />
                    </AwakliButton>
                  </div>
                )}
              </div>
            )}

            {/* ─── STYLE TRANSFER STEP ─────────────────────────────────── */}
            {step === "style" && (
              <div className="space-y-6">
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
                  <h3 className="text-lg font-semibold text-white mb-2 flex items-center gap-2">
                    <Palette className="w-5 h-5 text-cyan-400" />
                    Style Transfer
                  </h3>
                  <p className="text-zinc-400 mb-4">
                    Choose how much to transform your manga art toward anime style.
                  </p>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                    {(styleOptions?.options || []).map(opt => (
                      <button
                        key={opt.key}
                        onClick={() => opt.available && setSelectedStyle(opt.key)}
                        disabled={!opt.available}
                        className={`p-4 rounded-xl border text-left transition-all ${
                          selectedStyle === opt.key
                            ? "border-cyan-500 bg-cyan-500/10"
                            : opt.available
                            ? "border-zinc-800 bg-zinc-900 hover:border-zinc-600"
                            : "border-zinc-800 bg-zinc-900/50 opacity-50 cursor-not-allowed"
                        }`}
                      >
                        <p className="font-medium text-white text-sm">{opt.label}</p>
                        <p className="text-xs text-zinc-500 mt-1">
                          Strength: {Math.round(opt.strength * 100)}%
                        </p>
                        {!opt.available && (
                          <p className="text-xs text-amber-400 mt-1">Requires {opt.tierRequired}</p>
                        )}
                      </button>
                    ))}
                  </div>

                  <AwakliButton variant="primary" onClick={handleStyleAll} disabled={isProcessing}>
                    <Palette className="w-4 h-4 mr-2" />
                    Apply Style Transfer
                  </AwakliButton>
                </div>

                {pages.some(p => p.styled) && (
                  <div className="flex justify-end">
                    <AwakliButton variant="primary" onClick={() => setStep("ocr")}>
                      Continue to Dialogue Extraction <ArrowRight className="w-4 h-4 ml-2" />
                    </AwakliButton>
                  </div>
                )}
              </div>
            )}

            {/* ─── OCR STEP ────────────────────────────────────────────── */}
            {step === "ocr" && (
              <div className="space-y-6">
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
                  <h3 className="text-lg font-semibold text-white mb-2 flex items-center gap-2">
                    <Type className="w-5 h-5 text-cyan-400" />
                    Dialogue Extraction & Metadata
                  </h3>
                  <p className="text-zinc-400 mb-4">
                    AI reads speech bubbles, thought bubbles, narration boxes, and sound effects.
                    Also auto-fills scene descriptions, camera angles, and mood for each panel.
                  </p>

                  <AwakliButton variant="primary" onClick={handleOCRAll} disabled={isProcessing}>
                    <Type className="w-4 h-4 mr-2" />
                    Extract Dialogue & Auto-Fill Metadata
                  </AwakliButton>
                </div>

                {/* OCR Results Preview */}
                {pages.some(p => p.ocrDone && p.metadata?.ocr) && (
                  <div className="space-y-3">
                    {pages.filter(p => p.metadata?.ocr?.dialogues?.length > 0).map((page, i) => (
                      <div key={i} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                        <h4 className="text-sm font-medium text-zinc-400 mb-2">Page {page.pageNumber}</h4>
                        <div className="space-y-1">
                          {page.metadata.ocr.dialogues.map((d: any, di: number) => (
                            <div key={di} className="flex items-start gap-2 text-sm">
                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                                d.bubbleType === "speech" ? "bg-blue-500/20 text-blue-400"
                                : d.bubbleType === "thought" ? "bg-purple-500/20 text-purple-400"
                                : d.bubbleType === "narration" ? "bg-amber-500/20 text-amber-400"
                                : "bg-red-500/20 text-red-400"
                              }`}>
                                {d.bubbleType}
                              </span>
                              {d.speaker && <span className="text-cyan-400 font-medium">{d.speaker}:</span>}
                              <span className="text-zinc-300">{d.text}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {pages.some(p => p.ocrDone) && (
                  <div className="flex justify-end">
                    <AwakliButton variant="primary" onClick={() => setStep("review")}>
                      Continue to Review <ArrowRight className="w-4 h-4 ml-2" />
                    </AwakliButton>
                  </div>
                )}
              </div>
            )}

            {/* ─── REVIEW STEP ─────────────────────────────────────────── */}
            {step === "review" && (
              <div className="space-y-6">
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
                  <h3 className="text-lg font-semibold text-white mb-2 flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5 text-green-400" />
                    Review & Finalize
                  </h3>
                  <p className="text-zinc-400 mb-4">
                    Review the processed panels and metadata before creating your anime project.
                  </p>

                  {/* Summary Stats */}
                  <div className="grid grid-cols-4 gap-4 mb-6">
                    <div className="p-3 bg-zinc-800 rounded-lg text-center">
                      <p className="text-2xl font-bold text-white">{pages.length}</p>
                      <p className="text-xs text-zinc-500">Pages</p>
                    </div>
                    <div className="p-3 bg-zinc-800 rounded-lg text-center">
                      <p className="text-2xl font-bold text-cyan-400">{totalPanels}</p>
                      <p className="text-xs text-zinc-500">Panels</p>
                    </div>
                    <div className="p-3 bg-zinc-800 rounded-lg text-center">
                      <p className="text-2xl font-bold text-purple-400 capitalize">
                        {consensusSource?.replace("_", " ") || "—"}
                      </p>
                      <p className="text-xs text-zinc-500">Source Type</p>
                    </div>
                    <div className="p-3 bg-zinc-800 rounded-lg text-center">
                      <p className="text-2xl font-bold text-amber-400 capitalize">
                        {selectedStyle.replace("_", " ")}
                      </p>
                      <p className="text-xs text-zinc-500">Style</p>
                    </div>
                  </div>

                  {/* Panel Grid */}
                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3 mb-6">
                    {pages.map((page, i) => (
                      <div key={i} className="relative group">
                        <img src={page.preview} alt={`Page ${page.pageNumber}`}
                          className="w-full aspect-[3/4] object-cover rounded-lg border border-zinc-700" />
                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex flex-col items-center justify-center gap-1 text-xs text-white">
                          <p>Page {page.pageNumber}</p>
                          <p>{page.segmentation?.totalPanelsDetected || 1} panels</p>
                          {page.metadata?.cameraAngle && <p>{page.metadata.cameraAngle}</p>}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="flex gap-3 justify-end">
                    <AwakliButton variant="secondary" onClick={() => setStep("upload")}>
                      <RotateCcw className="w-4 h-4 mr-2" />
                      Start Over
                    </AwakliButton>
                    <AwakliButton
                      variant="primary"
                      onClick={() => {
                        toast.success("Project finalized! Redirecting to pipeline...");
                        if (projectId) navigate(`/studio/project/${projectId}/pipeline`);
                      }}
                    >
                      <Zap className="w-4 h-4 mr-2" />
                      Finalize & Start Pipeline
                    </AwakliButton>
                  </div>
                </div>
              </div>
            )}
          </motion.div>
        </AnimatePresence>

        {/* Navigation Buttons */}
        {step !== "upload" && step !== "review" && !isProcessing && (
          <div className="flex justify-between mt-6">
            <AwakliButton
              variant="secondary"
              onClick={() => {
                const prevIndex = stepIndex - 1;
                if (prevIndex >= 0) setStep(STEPS[prevIndex].key);
              }}
            >
              <ChevronLeft className="w-4 h-4 mr-2" />
              Back
            </AwakliButton>
            <AwakliButton
              variant="secondary"
              onClick={() => {
                const nextIndex = stepIndex + 1;
                if (nextIndex < STEPS.length) setStep(STEPS[nextIndex].key);
              }}
            >
              Skip Step
              <ChevronRight className="w-4 h-4 ml-2" />
            </AwakliButton>
          </div>
        )}
      </div>
    </StudioLayout>
  );
}
