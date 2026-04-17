import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Anchor, CheckCircle, ChevronRight, Star, Target,
  ArrowRight, Sparkles, BarChart3
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { TierSamplerStrip } from "./TierSamplerStrip";
import { toast } from "sonner";

// ─── Types ─────────────────────────────────────────────────────────────

interface AnchorStep {
  sceneType: string;
  selectedTier: number | null;
  confidence: number;
  archetypeId: string;
}

interface ExpectationAnchorSurveyProps {
  sceneTypes?: string[];
  onComplete?: (anchors: AnchorStep[]) => void;
}

// ─── Constants ─────────────────────────────────────────────────────────

const DEFAULT_SCENE_TYPES = [
  "dialogue",
  "action",
  "establishing",
  "reaction",
];

const SCENE_TYPE_LABELS: Record<string, string> = {
  dialogue: "Dialogue Scene",
  action: "Action Scene",
  establishing: "Establishing Shot",
  reaction: "Reaction Close-up",
  montage: "Montage Sequence",
  transition: "Transition",
};

const SCENE_TYPE_DESCRIPTIONS: Record<string, string> = {
  dialogue: "Two characters talking — focus on lip sync, expressions, and consistent character appearance.",
  action: "Fast movement — explosions, fights, chases. Motion blur and dynamic camera expected.",
  establishing: "Wide environmental shot — city skyline, forest, room interior. Atmosphere and detail matter.",
  reaction: "Close-up on a character's face — subtle emotion, eye detail, skin texture.",
  montage: "Quick cuts across multiple scenes — consistency and pacing matter most.",
  transition: "Scene-to-scene bridge — smooth visual flow and color grading.",
};

// ─── Component ─────────────────────────────────────────────────────────

export function ExpectationAnchorSurvey({
  sceneTypes = DEFAULT_SCENE_TYPES,
  onComplete,
}: ExpectationAnchorSurveyProps) {

  const [currentStep, setCurrentStep] = useState(0);
  const [anchors, setAnchors] = useState<AnchorStep[]>(
    sceneTypes.map(st => ({
      sceneType: st,
      selectedTier: null,
      confidence: 0.7,
      archetypeId: "V1",
    }))
  );
  const [isComplete, setIsComplete] = useState(false);

  const recordAnchor = trpc.tierSampler.recordExpectationAnchor.useMutation();

  const currentAnchor = anchors[currentStep];
  const progress = ((currentStep + (currentAnchor?.selectedTier ? 1 : 0)) / sceneTypes.length) * 100;

  const handleTierSelect = (tier: number, archetypeId: string) => {
    setAnchors(prev => prev.map((a, i) =>
      i === currentStep ? { ...a, selectedTier: tier, archetypeId } : a
    ));
  };

  const handleConfidenceChange = (value: number[]) => {
    setAnchors(prev => prev.map((a, i) =>
      i === currentStep ? { ...a, confidence: value[0] } : a
    ));
  };

  const handleNext = async () => {
    if (!currentAnchor?.selectedTier) return;

    // Record anchor to backend
    try {
      await recordAnchor.mutateAsync({
        sceneType: currentAnchor.sceneType,
        anchoredSampleId: currentAnchor.selectedTier * 100, // simulated sample ID
        anchoredTier: currentAnchor.selectedTier,
        anchorConfidence: currentAnchor.confidence,
      });
    } catch {
      // Continue even if recording fails
    }

    if (currentStep < sceneTypes.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      setIsComplete(true);
      toast.success(`Expectations anchored! ${sceneTypes.length} scene types calibrated.`);
      onComplete?.(anchors);
    }
  };

  if (isComplete) {
    return (
      <Card className="bg-zinc-900/50 border-zinc-700/50">
        <CardContent className="py-8 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-emerald-500/20 mb-4">
            <CheckCircle className="h-8 w-8 text-emerald-400" />
          </div>
          <h3 className="text-lg font-bold text-white mb-2">Expectations Anchored</h3>
          <p className="text-sm text-zinc-400 mb-4 max-w-md mx-auto">
            Your quality expectations have been recorded across {sceneTypes.length} scene types.
            The platform will use these anchors to calibrate your experience and reduce surprise gaps.
          </p>
          <div className="flex flex-wrap justify-center gap-2 mb-6">
            {anchors.map((a, i) => (
              <Badge key={i} className="bg-zinc-800 text-zinc-300 border-zinc-700">
                {SCENE_TYPE_LABELS[a.sceneType] ?? a.sceneType}: Tier {a.selectedTier}
              </Badge>
            ))}
          </div>
          <div className="flex justify-center gap-3">
            <Button
              variant="outline"
              onClick={() => { setIsComplete(false); setCurrentStep(0); }}
              className="border-zinc-700"
            >
              Redo Survey
            </Button>
            <Button className="bg-gradient-to-r from-emerald-600 to-teal-600">
              <BarChart3 className="h-4 w-4 mr-2" />
              View Report Card
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Progress header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Anchor className="h-5 w-5 text-amber-400" />
          <h3 className="text-sm font-bold text-white">Expectation Anchor Survey</h3>
        </div>
        <span className="text-xs text-zinc-400">
          Step {currentStep + 1} of {sceneTypes.length}
        </span>
      </div>
      <Progress value={progress} className="h-1.5" />

      {/* Step indicators */}
      <div className="flex gap-1">
        {sceneTypes.map((st, i) => (
          <button
            key={st}
            onClick={() => i <= currentStep && setCurrentStep(i)}
            className={`
              flex-1 h-1.5 rounded-full transition-colors
              ${i < currentStep ? "bg-emerald-500" : i === currentStep ? "bg-amber-500" : "bg-zinc-700"}
              ${i <= currentStep ? "cursor-pointer" : "cursor-default"}
            `}
          />
        ))}
      </div>

      {/* Current scene type card */}
      <Card className="bg-zinc-900/50 border-zinc-700/50">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Target className="h-4 w-4 text-amber-400" />
                {SCENE_TYPE_LABELS[currentAnchor.sceneType] ?? currentAnchor.sceneType}
              </CardTitle>
              <CardDescription className="mt-1 text-xs">
                {SCENE_TYPE_DESCRIPTIONS[currentAnchor.sceneType] ?? "Select the quality tier that matches your expectation."}
              </CardDescription>
            </div>
            <Badge variant="outline" className="border-amber-500/30 text-amber-400">
              {currentAnchor.selectedTier ? `Tier ${currentAnchor.selectedTier}` : "Not set"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Tier Sampler Strip */}
          <TierSamplerStrip
            archetypeId={currentAnchor.archetypeId}
            onTierSelect={handleTierSelect}
            showAnchorPrompt={!currentAnchor.selectedTier}
          />

          {/* Confidence slider */}
          {currentAnchor.selectedTier && (
            <div className="space-y-2 pt-2 border-t border-zinc-800">
              <div className="flex items-center justify-between">
                <span className="text-xs text-zinc-400">How confident are you in this selection?</span>
                <span className="text-xs font-mono text-amber-400">
                  {Math.round(currentAnchor.confidence * 100)}%
                </span>
              </div>
              <Slider
                value={[currentAnchor.confidence]}
                onValueChange={handleConfidenceChange}
                min={0}
                max={1}
                step={0.05}
                className="w-full"
              />
              <div className="flex justify-between text-[10px] text-zinc-500">
                <span>Just guessing</span>
                <span>Very confident</span>
              </div>
            </div>
          )}

          {/* Navigation */}
          <div className="flex justify-between pt-2">
            <Button
              variant="ghost"
              size="sm"
              disabled={currentStep === 0}
              onClick={() => setCurrentStep(currentStep - 1)}
              className="text-zinc-400"
            >
              Back
            </Button>
            <Button
              size="sm"
              disabled={!currentAnchor.selectedTier}
              onClick={handleNext}
              className="bg-gradient-to-r from-amber-600 to-orange-600"
            >
              {currentStep < sceneTypes.length - 1 ? (
                <>
                  Next Scene <ChevronRight className="h-4 w-4 ml-1" />
                </>
              ) : (
                <>
                  Complete <Sparkles className="h-4 w-4 ml-1" />
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
