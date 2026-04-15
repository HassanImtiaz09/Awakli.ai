import { useState, useEffect } from "react";
import { useRoute, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Users, Mic, Film, Mountain, Settings, CheckCircle2,
  ChevronRight, ChevronLeft, ArrowLeft, Sparkles, Lock,
  Play, RefreshCw, Check, X, Upload, Volume2, Eye,
  Palette, Cloud, Sun, Moon, Sunrise, Sunset,
  Loader2, Crown, Zap, DollarSign, Clock,
} from "lucide-react";
import SubjectLibrary from "@/components/awakli/SubjectLibrary";

// ─── Stage Definitions ──────────────────────────────────────────────

const STAGES = [
  { id: 1, label: "Characters", icon: Users, description: "Approve character designs" },
  { id: 2, label: "Voices", icon: Mic, description: "Cast voice actors" },
  { id: 3, label: "Animation", icon: Film, description: "Choose animation style" },
  { id: 4, label: "Environments", icon: Mountain, description: "Review locations" },
  { id: 5, label: "Production", icon: Settings, description: "Configure output" },
  { id: 6, label: "Review", icon: CheckCircle2, description: "Final review & launch" },
];

// ─── Main PreProduction Page ────────────────────────────────────────

export default function PreProduction() {
  const [, params] = useRoute("/studio/:projectId/pre-production");
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const projectId = Number(params?.projectId);

  const startMutation = trpc.preProduction.start.useMutation();
  const statusQuery = trpc.preProduction.getStatus.useQuery(
    { projectId },
    { enabled: !!projectId && !!user }
  );
  const advanceMutation = trpc.preProduction.advanceStage.useMutation();
  const goToStageMutation = trpc.preProduction.goToStage.useMutation();

  const [activeStage, setActiveStage] = useState(1);

  // Initialize pre-production on first visit
  useEffect(() => {
    if (user && projectId && !statusQuery.data) {
      startMutation.mutate({ projectId }, {
        onSuccess: () => statusQuery.refetch(),
        onError: (e) => toast.error(e.message),
      });
    }
  }, [user, projectId]);

  useEffect(() => {
    if (statusQuery.data?.config) {
      setActiveStage(statusQuery.data.config.currentStage);
    }
  }, [statusQuery.data]);

  const handleNext = () => {
    if (activeStage >= 6) return;
    const nextStage = activeStage + 1;
    advanceMutation.mutate(
      { projectId },
      {
        onSuccess: () => {
          setActiveStage(nextStage);
          statusQuery.refetch();
        },
        onError: (e) => toast.error(e.message),
      }
    );
  };

  const handleGoToStage = (stage: number) => {
    if (stage > (statusQuery.data?.config?.currentStage ?? 1)) return;
    goToStageMutation.mutate(
      { projectId, stage },
      {
        onSuccess: () => {
          setActiveStage(stage);
          statusQuery.refetch();
        },
      }
    );
  };

  const isLocked = statusQuery.data?.config?.status === "locked";

  if (!user) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Please log in to access pre-production.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border/50 bg-card/50 backdrop-blur-sm sticky top-0 z-40">
        <div className="container py-3 flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => navigate(`/studio/${projectId}`)}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Back to Studio
          </Button>
          <div className="flex-1">
            <h1 className="text-lg font-bold">Pre-Production Suite</h1>
            <p className="text-xs text-muted-foreground">Configure every detail before animation begins</p>
          </div>
          {isLocked && (
            <Badge variant="secondary" className="bg-green-500/20 text-green-400 border-green-500/30">
              <Lock className="h-3 w-3 mr-1" /> Locked & In Production
            </Badge>
          )}
        </div>
      </div>

      {/* Stepper */}
      <div className="border-b border-border/30 bg-card/30">
        <div className="container py-4">
          <div className="flex items-center gap-1 overflow-x-auto pb-2">
            {STAGES.map((stage, idx) => {
              const StageIcon = stage.icon;
              const isActive = activeStage === stage.id;
              const isCompleted = stage.id < (statusQuery.data?.config?.currentStage ?? 1);
              const isAccessible = stage.id <= (statusQuery.data?.config?.currentStage ?? 1);

              return (
                <div key={stage.id} className="flex items-center">
                  <button
                    onClick={() => isAccessible && handleGoToStage(stage.id)}
                    disabled={!isAccessible || isLocked}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-all whitespace-nowrap ${
                      isActive
                        ? "bg-primary/20 text-primary border border-primary/30"
                        : isCompleted
                        ? "bg-green-500/10 text-green-400 hover:bg-green-500/20 cursor-pointer"
                        : isAccessible
                        ? "text-muted-foreground hover:bg-muted/50 cursor-pointer"
                        : "text-muted-foreground/40 cursor-not-allowed"
                    }`}
                  >
                    <div
                      className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                        isActive
                          ? "bg-primary text-primary-foreground"
                          : isCompleted
                          ? "bg-green-500 text-white"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {isCompleted ? <Check className="h-3.5 w-3.5" /> : stage.id}
                    </div>
                    <div className="hidden sm:block">
                      <div className="text-xs font-medium">{stage.label}</div>
                    </div>
                  </button>
                  {idx < STAGES.length - 1 && (
                    <ChevronRight className="h-4 w-4 text-muted-foreground/30 mx-1 shrink-0" />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Stage Content */}
      <div className="container py-6">
        {activeStage === 1 && <CharacterGalleryStage projectId={projectId} characters={statusQuery.data?.characters ?? []} />}
        {activeStage === 2 && <VoiceCastingStage projectId={projectId} characters={statusQuery.data?.characters ?? []} />}
        {activeStage === 3 && <AnimationStyleStage projectId={projectId} config={statusQuery.data?.config} />}
        {activeStage === 4 && <EnvironmentsStage projectId={projectId} config={statusQuery.data?.config} />}
        {activeStage === 5 && <ProductionConfigStage projectId={projectId} config={statusQuery.data?.config} />}
        {activeStage === 6 && <FinalReviewStage projectId={projectId} />}

        {/* Navigation */}
        {!isLocked && (
          <div className="flex justify-between mt-8 pt-6 border-t border-border/30">
            <Button
              variant="outline"
              onClick={() => handleGoToStage(activeStage - 1)}
              disabled={activeStage <= 1}
            >
              <ChevronLeft className="h-4 w-4 mr-1" /> Previous
            </Button>
            {activeStage < 6 ? (
              <Button onClick={handleNext} disabled={advanceMutation.isPending}>
                {advanceMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : null}
                Next: {STAGES[activeStage]?.label} <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            ) : (
              <div /> // Final review has its own lock button
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// STAGE 1: CHARACTER GALLERY
// ═══════════════════════════════════════════════════════════════════════

function CharacterGalleryStage({ projectId, characters }: { projectId: number; characters: any[] }) {
  const generateSheet = trpc.characterGallery.generateSheet.useMutation();
  const approve = trpc.characterGallery.approve.useMutation();
  const [selectedChar, setSelectedChar] = useState<number | null>(null);
  const [generatingFor, setGeneratingFor] = useState<number | null>(null);

  const versionsQuery = trpc.characterGallery.getVersions.useQuery(
    { characterId: selectedChar! },
    { enabled: !!selectedChar }
  );

  const handleGenerate = (charId: number) => {
    setGeneratingFor(charId);
    generateSheet.mutate(
      { characterId: charId, projectId },
      {
        onSuccess: (data) => {
          toast.success(`Generated ${data.characterName} sheet v${data.versionNumber}`);
          setSelectedChar(charId);
          setGeneratingFor(null);
          versionsQuery.refetch();
        },
        onError: (e) => {
          toast.error(e.message);
          setGeneratingFor(null);
        },
      }
    );
  };

  const handleApprove = (charId: number) => {
    approve.mutate(
      { characterId: charId, projectId },
      {
        onSuccess: () => {
          toast.success("Character design approved!");
          versionsQuery.refetch();
        },
        onError: (e) => toast.error(e.message),
      }
    );
  };

  const VIEWS = ["portrait", "fullBody", "threeQuarter", "action", "expressions"];
  const VIEW_LABELS: Record<string, string> = {
    portrait: "Portrait",
    fullBody: "Full Body",
    threeQuarter: "3/4 View",
    action: "Action Pose",
    expressions: "Expressions",
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold flex items-center gap-2">
          <Users className="h-5 w-5 text-primary" /> Character Gallery
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Generate and approve 5-view character sheets for each character. These will be used as reference for consistent animation.
        </p>
      </div>

      {characters.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center">
            <Users className="h-12 w-12 mx-auto text-muted-foreground/30 mb-3" />
            <p className="text-muted-foreground">No characters found in this project.</p>
            <p className="text-xs text-muted-foreground mt-1">Characters are extracted during manga generation.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {characters.map((char) => (
            <Card
              key={char.id}
              className={`cursor-pointer transition-all hover:border-primary/30 ${
                selectedChar === char.id ? "border-primary/50 bg-primary/5" : ""
              }`}
              onClick={() => setSelectedChar(char.id)}
            >
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">{char.name}</CardTitle>
                  <Badge variant="outline" className="text-xs">{char.role || "Character"}</Badge>
                </div>
                <CardDescription className="text-xs line-clamp-2">
                  {char.description || "No description"}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1"
                    onClick={(e) => { e.stopPropagation(); handleGenerate(char.id); }}
                    disabled={generatingFor === char.id}
                  >
                    {generatingFor === char.id ? (
                      <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                    ) : (
                      <Sparkles className="h-3 w-3 mr-1" />
                    )}
                    Generate Sheet
                  </Button>
                  <Button
                    size="sm"
                    onClick={(e) => { e.stopPropagation(); handleApprove(char.id); }}
                    disabled={approve.isPending}
                  >
                    <Check className="h-3 w-3 mr-1" /> Approve
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Version History Panel */}
      {selectedChar && versionsQuery.data && versionsQuery.data.length > 0 && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-base">Version History</CardTitle>
            <CardDescription>
              {versionsQuery.data.length} version(s) generated
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {versionsQuery.data.map((version: any) => (
                <div key={version.id} className="border border-border/50 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Badge variant={version.isApproved ? "default" : "outline"}>
                        v{version.versionNumber}
                      </Badge>
                      {version.isApproved ? (
                        <Badge className="bg-green-500/20 text-green-400 border-green-500/30">
                          <Check className="h-3 w-3 mr-1" /> Approved
                        </Badge>
                      ) : null}
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {new Date(version.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  <div className="grid grid-cols-5 gap-2">
                    {VIEWS.map((view) => {
                      const images = version.images as Record<string, string> | null;
                      return (
                        <div key={view} className="text-center">
                          <div className="aspect-[3/4] bg-muted/30 rounded border border-border/30 flex items-center justify-center mb-1">
                            <Eye className="h-4 w-4 text-muted-foreground/30" />
                          </div>
                          <span className="text-[10px] text-muted-foreground">{VIEW_LABELS[view]}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// STAGE 2: VOICE CASTING
// ═══════════════════════════════════════════════════════════════════════

function VoiceCastingStage({ projectId, characters }: { projectId: number; characters: any[] }) {
  const [selectedChar, setSelectedChar] = useState<number | null>(characters[0]?.id ?? null);
  const [genderFilter, setGenderFilter] = useState<string>("");
  const [toneFilter, setToneFilter] = useState<string>("");

  const libraryQuery = trpc.voiceCasting.browseLibrary.useQuery({
    gender: genderFilter as any || undefined,
    tone: toneFilter as any || undefined,
  });
  const auditionMutation = trpc.voiceCasting.auditionWithScript.useMutation();
  const castMutation = trpc.voiceCasting.castVoice.useMutation();
  const auditionsQuery = trpc.voiceCasting.getAuditions.useQuery(
    { characterId: selectedChar! },
    { enabled: !!selectedChar }
  );

  const handleAudition = (voiceId: string, voiceName: string) => {
    if (!selectedChar) return;
    auditionMutation.mutate(
      { characterId: selectedChar, projectId, voiceId, voiceName },
      {
        onSuccess: (data) => {
          toast.success(`Audition ready: "${data.dialogueText.substring(0, 40)}..."`);
          auditionsQuery.refetch();
        },
        onError: (e) => toast.error(e.message),
      }
    );
  };

  const handleCast = (voiceId: string, voiceName: string) => {
    if (!selectedChar) return;
    castMutation.mutate(
      { characterId: selectedChar, projectId, voiceId, voiceName, source: "library" },
      {
        onSuccess: () => {
          toast.success(`${voiceName} cast successfully!`);
          auditionsQuery.refetch();
        },
        onError: (e) => toast.error(e.message),
      }
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold flex items-center gap-2">
          <Mic className="h-5 w-5 text-primary" /> Voice Casting
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Browse voices, audition with your character's dialogue, and cast the perfect voice for each role.
        </p>
      </div>

      {/* Character selector */}
      <div className="flex gap-2 overflow-x-auto pb-2">
        {characters.map((char) => (
          <Button
            key={char.id}
            variant={selectedChar === char.id ? "default" : "outline"}
            size="sm"
            onClick={() => setSelectedChar(char.id)}
          >
            {char.name}
          </Button>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Voice Library */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Voice Library</CardTitle>
              <div className="flex gap-2 mt-2">
                <Select value={genderFilter} onValueChange={setGenderFilter}>
                  <SelectTrigger className="w-32">
                    <SelectValue placeholder="Gender" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="male">Male</SelectItem>
                    <SelectItem value="female">Female</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={toneFilter} onValueChange={setToneFilter}>
                  <SelectTrigger className="w-32">
                    <SelectValue placeholder="Tone" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="warm">Warm</SelectItem>
                    <SelectItem value="cool">Cool</SelectItem>
                    <SelectItem value="rough">Rough</SelectItem>
                    <SelectItem value="smooth">Smooth</SelectItem>
                    <SelectItem value="energetic">Energetic</SelectItem>
                    <SelectItem value="calm">Calm</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {libraryQuery.data?.voices.map((voice: any) => (
                  <div
                    key={voice.id}
                    className="flex items-center justify-between p-3 rounded-lg border border-border/50 hover:border-primary/30 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                        <Volume2 className="h-4 w-4 text-primary" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">{voice.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {voice.gender} · {voice.age} · {voice.tone}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleAudition(voice.id, voice.name)}
                        disabled={auditionMutation.isPending || !selectedChar}
                      >
                        <Play className="h-3 w-3 mr-1" /> Audition
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => handleCast(voice.id, voice.name)}
                        disabled={castMutation.isPending || !selectedChar}
                      >
                        <Check className="h-3 w-3 mr-1" /> Cast
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Auditions Panel */}
        <div>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Auditions</CardTitle>
              <CardDescription>
                {auditionsQuery.data?.length ?? 0} / 10 auditions used
              </CardDescription>
            </CardHeader>
            <CardContent>
              {auditionsQuery.data?.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">
                  Click "Audition" on a voice to hear it with your character's dialogue.
                </p>
              ) : (
                <div className="space-y-2">
                  {auditionsQuery.data?.map((aud: any) => (
                    <div
                      key={aud.id}
                      className={`p-3 rounded-lg border transition-colors ${
                        aud.isSelected
                          ? "border-green-500/50 bg-green-500/5"
                          : "border-border/50"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium">{aud.voiceName}</span>
                        {aud.isSelected ? (
                          <Badge className="bg-green-500/20 text-green-400 text-xs">Cast</Badge>
                        ) : null}
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-2">
                        "{aud.dialogueText}"
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Subject Library — Native Lip Sync */}
      <div className="mt-8 pt-6 border-t border-border/50">
        <SubjectLibrary projectId={projectId} characters={characters} />
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// STAGE 3: ANIMATION STYLE
// ═══════════════════════════════════════════════════════════════════════

function AnimationStyleStage({ projectId, config }: { projectId: number; config: any }) {
  const optionsQuery = trpc.animationStyle.getOptions.useQuery();
  const selectMutation = trpc.animationStyle.select.useMutation();
  const previewMutation = trpc.animationStyle.generatePreview.useMutation();
  const [selectedStyle, setSelectedStyle] = useState(config?.animationStyle || "");

  const handleSelect = (styleId: string) => {
    setSelectedStyle(styleId);
    selectMutation.mutate(
      { projectId, styleId },
      {
        onSuccess: (data) => toast.success(`Selected: ${data.styleName}`),
        onError: (e) => toast.error(e.message),
      }
    );
  };

  const STYLE_COLORS: Record<string, string> = {
    limited: "from-blue-500/20 to-blue-600/10",
    sakuga: "from-amber-500/20 to-orange-600/10",
    cel_shaded: "from-purple-500/20 to-violet-600/10",
    rotoscope: "from-emerald-500/20 to-green-600/10",
    motion_comic: "from-rose-500/20 to-pink-600/10",
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold flex items-center gap-2">
          <Film className="h-5 w-5 text-primary" /> Animation Style
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Choose how your anime will look and move. Each style affects visual quality, motion fluidity, and production cost.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {optionsQuery.data?.map((style: any) => (
          <Card
            key={style.id}
            className={`cursor-pointer transition-all hover:scale-[1.01] ${
              selectedStyle === style.id
                ? "border-primary/50 ring-2 ring-primary/20"
                : "hover:border-primary/30"
            }`}
            onClick={() => handleSelect(style.id)}
          >
            <div className={`h-24 rounded-t-lg bg-gradient-to-br ${STYLE_COLORS[style.id] || "from-gray-500/20 to-gray-600/10"} flex items-center justify-center relative`}>
              <Film className="h-8 w-8 text-foreground/20" />
              {selectedStyle === style.id && (
                <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-primary flex items-center justify-center">
                  <Check className="h-3.5 w-3.5 text-primary-foreground" />
                </div>
              )}
              <Badge className="absolute bottom-2 right-2 text-[10px]" variant="secondary">
                {style.costLabel}
              </Badge>
            </div>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">{style.name}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">{style.description}</p>
              <p className="text-[10px] text-muted-foreground/70 mt-2">
                e.g. {style.references?.join(", ")}
              </p>
              <Button
                size="sm"
                variant="outline"
                className="w-full mt-3"
                onClick={(e) => {
                  e.stopPropagation();
                  previewMutation.mutate({ projectId, styleId: style.id });
                  toast.info("Generating preview clip...");
                }}
                disabled={previewMutation.isPending}
              >
                <Play className="h-3 w-3 mr-1" /> Preview
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// STAGE 4: ENVIRONMENTS
// ═══════════════════════════════════════════════════════════════════════

function EnvironmentsStage({ projectId, config }: { projectId: number; config: any }) {
  const locationsQuery = trpc.environments.extractLocations.useQuery({ projectId });
  const colorPresetsQuery = trpc.environments.getColorGradingPresets.useQuery();
  const generateArt = trpc.environments.generateConceptArt.useMutation();
  const approveLocation = trpc.environments.approveLocation.useMutation();
  const setColorGrading = trpc.environments.setColorGrading.useMutation();
  const [selectedColor, setSelectedColor] = useState(config?.colorGrading || "");

  const handleGenerateArt = (locationName: string, timeOfDay: string) => {
    generateArt.mutate(
      { projectId, locationName, timeOfDay: timeOfDay as any },
      {
        onSuccess: (data) => toast.success(`Concept art generated for ${data.locationName}`),
        onError: (e) => toast.error(e.message),
      }
    );
  };

  const handleColorGrading = (preset: string) => {
    setSelectedColor(preset);
    setColorGrading.mutate(
      { projectId, preset },
      {
        onSuccess: (data) => toast.success(`Color grading: ${data.name}`),
        onError: (e) => toast.error(e.message),
      }
    );
  };

  const TIME_ICONS: Record<string, any> = {
    day: Sun,
    night: Moon,
    dawn: Sunrise,
    dusk: Sunset,
  };

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-bold flex items-center gap-2">
          <Mountain className="h-5 w-5 text-primary" /> Environments & Color
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Review locations from your story, generate concept art, and set the overall color grading.
        </p>
      </div>

      {/* Locations */}
      <div>
        <h3 className="text-base font-semibold mb-3">Locations</h3>
        {locationsQuery.data?.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="py-8 text-center">
              <Mountain className="h-10 w-10 mx-auto text-muted-foreground/30 mb-2" />
              <p className="text-sm text-muted-foreground">No locations extracted yet.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {locationsQuery.data?.map((loc: any, idx: number) => (
              <Card key={idx}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">{loc.name}</CardTitle>
                  <CardDescription className="text-xs">
                    {loc.sceneIds.length} scene(s) · {loc.mood}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="aspect-video bg-muted/30 rounded border border-border/30 flex items-center justify-center mb-3">
                    <Mountain className="h-6 w-6 text-muted-foreground/20" />
                  </div>
                  <div className="flex gap-1 mb-2">
                    {["day", "night", "dawn", "dusk"].map((tod) => {
                      const Icon = TIME_ICONS[tod] || Sun;
                      return (
                        <Button
                          key={tod}
                          size="sm"
                          variant="outline"
                          className="flex-1 text-[10px] px-1"
                          onClick={() => handleGenerateArt(loc.name, tod)}
                          disabled={generateArt.isPending}
                        >
                          <Icon className="h-3 w-3" />
                        </Button>
                      );
                    })}
                  </div>
                  <Button
                    size="sm"
                    className="w-full"
                    onClick={() =>
                      approveLocation.mutate(
                        { projectId, locationName: loc.name, imageUrl: "placeholder" },
                        { onSuccess: () => toast.success("Location approved!") }
                      )
                    }
                  >
                    <Check className="h-3 w-3 mr-1" /> Approve
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Color Grading */}
      <div>
        <h3 className="text-base font-semibold mb-3 flex items-center gap-2">
          <Palette className="h-4 w-4" /> Color Grading
        </h3>
        <div className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
          {colorPresetsQuery.data?.map((preset: any) => {
            const PRESET_COLORS: Record<string, string> = {
              warm: "from-amber-500/30 to-orange-500/20",
              cool: "from-blue-500/30 to-cyan-500/20",
              vivid: "from-red-500/30 to-yellow-500/20",
              muted: "from-gray-500/30 to-slate-500/20",
              neon: "from-purple-500/30 to-pink-500/20",
              pastel: "from-pink-300/30 to-sky-300/20",
            };
            return (
              <button
                key={preset.id}
                onClick={() => handleColorGrading(preset.id)}
                className={`p-3 rounded-lg border text-center transition-all ${
                  selectedColor === preset.id
                    ? "border-primary/50 ring-2 ring-primary/20"
                    : "border-border/50 hover:border-primary/30"
                }`}
              >
                <div className={`h-12 rounded bg-gradient-to-br ${PRESET_COLORS[preset.id] || "from-gray-500/20 to-gray-600/10"} mb-2`} />
                <p className="text-xs font-medium">{preset.name}</p>
                <p className="text-[10px] text-muted-foreground">{preset.description}</p>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// STAGE 5: PRODUCTION CONFIG
// ═══════════════════════════════════════════════════════════════════════

function ProductionConfigStage({ projectId, config }: { projectId: number; config: any }) {
  const setAspectRatio = trpc.productionConfig.setAspectRatio.useMutation();
  const setOpeningStyle = trpc.productionConfig.setOpeningStyle.useMutation();
  const setEndingStyle = trpc.productionConfig.setEndingStyle.useMutation();
  const setPacing = trpc.productionConfig.setPacing.useMutation();
  const setSubtitles = trpc.productionConfig.setSubtitles.useMutation();
  const setAudio = trpc.productionConfig.setAudio.useMutation();

  const [aspectRatio, setAR] = useState(config?.aspectRatio || "16:9");
  const [opening, setOpening] = useState(config?.openingStyle || "title_card");
  const [ending, setEnding] = useState(config?.endingStyle || "credits_roll");
  const [pacing, setPacingVal] = useState(config?.pacing || "standard_tv");
  const [musicVol, setMusicVol] = useState(30);
  const [sfxVol, setSfxVol] = useState(60);
  const [subtitleLang, setSubtitleLang] = useState("en");

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-bold flex items-center gap-2">
          <Settings className="h-5 w-5 text-primary" /> Production Config
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Fine-tune aspect ratio, opening/ending styles, pacing, subtitles, and audio mix.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Aspect Ratio */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Aspect Ratio</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-2">
              {[
                { value: "16:9", label: "16:9 Widescreen", desc: "Standard TV/YouTube" },
                { value: "9:16", label: "9:16 Vertical", desc: "TikTok/Reels" },
                { value: "4:3", label: "4:3 Classic", desc: "Retro anime feel" },
                { value: "2.35:1", label: "2.35:1 Cinematic", desc: "Studio only" },
              ].map((ar) => (
                <button
                  key={ar.value}
                  onClick={() => {
                    setAR(ar.value);
                    setAspectRatio.mutate(
                      { projectId, aspectRatio: ar.value as any },
                      { onSuccess: () => toast.success(`Aspect ratio: ${ar.label}`) }
                    );
                  }}
                  className={`p-3 rounded-lg border text-left transition-all ${
                    aspectRatio === ar.value
                      ? "border-primary/50 bg-primary/5"
                      : "border-border/50 hover:border-primary/30"
                  }`}
                >
                  <p className="text-xs font-medium">{ar.label}</p>
                  <p className="text-[10px] text-muted-foreground">{ar.desc}</p>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Opening & Ending */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Opening & Ending</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label className="text-xs">Opening Style</Label>
              <Select
                value={opening}
                onValueChange={(v) => {
                  setOpening(v);
                  setOpeningStyle.mutate(
                    { projectId, style: v as any },
                    { onSuccess: () => toast.success("Opening style updated") }
                  );
                }}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="classic_anime_op">Classic Anime OP</SelectItem>
                  <SelectItem value="title_card">Title Card</SelectItem>
                  <SelectItem value="cold_open">Cold Open</SelectItem>
                  <SelectItem value="custom">Custom (Studio)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Ending Style</Label>
              <Select
                value={ending}
                onValueChange={(v) => {
                  setEnding(v);
                  setEndingStyle.mutate(
                    { projectId, style: v as any },
                    { onSuccess: () => toast.success("Ending style updated") }
                  );
                }}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="credits_roll">Credits Roll</SelectItem>
                  <SelectItem value="still_frame">Still Frame</SelectItem>
                  <SelectItem value="next_preview">Next Episode Preview</SelectItem>
                  <SelectItem value="none">None</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Pacing */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Pacing</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-2">
              {[
                { value: "cinematic_slow", label: "Cinematic", desc: "Slow, dramatic" },
                { value: "standard_tv", label: "Standard TV", desc: "Balanced pacing" },
                { value: "fast_dynamic", label: "Fast & Dynamic", desc: "Quick cuts, energy" },
              ].map((p) => (
                <button
                  key={p.value}
                  onClick={() => {
                    setPacingVal(p.value);
                    setPacing.mutate(
                      { projectId, pacing: p.value as any },
                      { onSuccess: () => toast.success(`Pacing: ${p.label}`) }
                    );
                  }}
                  className={`p-3 rounded-lg border text-center transition-all ${
                    pacing === p.value
                      ? "border-primary/50 bg-primary/5"
                      : "border-border/50 hover:border-primary/30"
                  }`}
                >
                  <p className="text-xs font-medium">{p.label}</p>
                  <p className="text-[10px] text-muted-foreground">{p.desc}</p>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Audio Mix */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Audio Mix</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label className="text-xs">Music Volume: {musicVol}%</Label>
              <Slider
                value={[musicVol]}
                onValueChange={([v]) => setMusicVol(v)}
                min={10}
                max={50}
                step={5}
                onValueCommit={([v]) =>
                  setAudio.mutate({ projectId, musicVolume: v, sfxVolume: sfxVol })
                }
              />
            </div>
            <div>
              <Label className="text-xs">SFX Volume: {sfxVol}%</Label>
              <Slider
                value={[sfxVol]}
                onValueChange={([v]) => setSfxVol(v)}
                min={30}
                max={80}
                step={5}
                onValueCommit={([v]) =>
                  setAudio.mutate({ projectId, musicVolume: musicVol, sfxVolume: v })
                }
              />
            </div>
          </CardContent>
        </Card>

        {/* Subtitles */}
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="text-sm">Subtitles</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-3">
              <div>
                <Label className="text-xs">Primary Language</Label>
                <Select
                  value={subtitleLang}
                  onValueChange={(v) => {
                    setSubtitleLang(v);
                    setSubtitles.mutate({ projectId, primaryLang: v });
                  }}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="en">English</SelectItem>
                    <SelectItem value="ja">Japanese</SelectItem>
                    <SelectItem value="ko">Korean</SelectItem>
                    <SelectItem value="zh">Chinese</SelectItem>
                    <SelectItem value="es">Spanish</SelectItem>
                    <SelectItem value="fr">French</SelectItem>
                    <SelectItem value="de">German</SelectItem>
                    <SelectItem value="pt">Portuguese</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Style</Label>
                <Select defaultValue="standard_white">
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="standard_white">Standard White</SelectItem>
                    <SelectItem value="anime_yellow">Anime Yellow</SelectItem>
                    <SelectItem value="styled">Styled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Font Size</Label>
                <Select defaultValue="medium">
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="small">Small</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="large">Large</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// STAGE 6: FINAL REVIEW
// ═══════════════════════════════════════════════════════════════════════

function FinalReviewStage({ projectId }: { projectId: number }) {
  const summaryQuery = trpc.review.getSummary.useQuery({ projectId });
  const costQuery = trpc.review.estimateCost.useQuery({ projectId });
  const lockMutation = trpc.review.lock.useMutation();
  const [, navigate] = useLocation();
  const [showConfirm, setShowConfirm] = useState(false);

  const handleLock = () => {
    lockMutation.mutate(
      { projectId },
      {
        onSuccess: (data) => {
          toast.success("Pre-production locked! Pipeline starting...");
          if (data.redirectTo) navigate(data.redirectTo);
        },
        onError: (e) => toast.error(e.message),
      }
    );
  };

  const summary = summaryQuery.data;
  const cost = costQuery.data;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold flex items-center gap-2">
          <CheckCircle2 className="h-5 w-5 text-primary" /> Final Review
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Review all settings before locking. Once locked, the animation pipeline will begin.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Characters Summary */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <Users className="h-4 w-4" /> Characters
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {summary?.characters.map((char: any) => (
                <div key={char.id} className="flex items-center justify-between p-2 rounded border border-border/30">
                  <div>
                    <p className="text-sm font-medium">{char.name}</p>
                    <p className="text-xs text-muted-foreground">Voice: {char.voiceName}</p>
                  </div>
                  {char.approved ? (
                    <Badge className="bg-green-500/20 text-green-400 text-xs">
                      <Check className="h-3 w-3 mr-1" /> Approved
                    </Badge>
                  ) : (
                    <Badge variant="destructive" className="text-xs">
                      <X className="h-3 w-3 mr-1" /> Not Approved
                    </Badge>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Animation Style */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <Film className="h-4 w-4" /> Animation & Color
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between">
              <span className="text-xs text-muted-foreground">Animation Style</span>
              <span className="text-sm font-medium">{summary?.animationStyle?.name || "Not selected"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-xs text-muted-foreground">Color Grading</span>
              <span className="text-sm font-medium">{summary?.colorGrading?.name || "Default"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-xs text-muted-foreground">Aspect Ratio</span>
              <span className="text-sm font-medium">{summary?.config?.aspectRatio || "16:9"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-xs text-muted-foreground">Pacing</span>
              <span className="text-sm font-medium capitalize">
                {(summary?.config?.pacing || "standard_tv").replace(/_/g, " ")}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Cost Estimation */}
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <DollarSign className="h-4 w-4" /> Cost Estimation
            </CardTitle>
          </CardHeader>
          <CardContent>
            {cost ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                  {Object.entries(cost.breakdown).map(([key, value]) => (
                    <div key={key} className="text-center p-3 rounded-lg bg-muted/30">
                      <p className="text-lg font-bold">{value as number}</p>
                      <p className="text-[10px] text-muted-foreground capitalize">
                        {key.replace(/([A-Z])/g, " $1").trim()}
                      </p>
                    </div>
                  ))}
                </div>
                <div className="flex items-center justify-between p-4 rounded-lg bg-primary/5 border border-primary/20">
                  <div>
                    <p className="text-sm font-medium">Total Estimated Cost</p>
                    <p className="text-xs text-muted-foreground">
                      {cost.episodeCount} episodes · {cost.totalPanels} panels · ~{cost.estimatedMinutesPerEpisode} min/ep
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold">{cost.totalCredits}</p>
                    <p className="text-xs text-muted-foreground">credits (~${cost.estimatedDollars})</p>
                  </div>
                </div>
                {cost.styleMultiplier > 1 && (
                  <p className="text-xs text-amber-400">
                    <Zap className="h-3 w-3 inline mr-1" />
                    Style multiplier: {cost.styleMultiplier}x (higher quality animation costs more)
                  </p>
                )}
              </div>
            ) : (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Lock & Start */}
      <div className="flex justify-center pt-4">
        <Button
          size="lg"
          className="px-8 bg-gradient-to-r from-primary to-purple-600 hover:from-primary/90 hover:to-purple-600/90"
          onClick={() => setShowConfirm(true)}
          disabled={lockMutation.isPending}
        >
          {lockMutation.isPending ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Lock className="h-4 w-4 mr-2" />
          )}
          Lock & Start Production
        </Button>
      </div>

      {/* Confirmation Dialog */}
      <Dialog open={showConfirm} onOpenChange={setShowConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Start Production?</DialogTitle>
            <DialogDescription>
              Once locked, pre-production settings cannot be changed. The animation pipeline will begin
              processing your {cost?.episodeCount || 0} episode(s).
            </DialogDescription>
          </DialogHeader>
          <div className="p-4 rounded-lg bg-amber-500/10 border border-amber-500/20">
            <p className="text-sm text-amber-400">
              <Crown className="h-4 w-4 inline mr-1" />
              Estimated cost: {cost?.totalCredits || 0} credits (~${cost?.estimatedDollars || "0.00"})
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowConfirm(false)}>
              Go Back
            </Button>
            <Button onClick={handleLock} disabled={lockMutation.isPending}>
              {lockMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <Zap className="h-4 w-4 mr-1" />
              )}
              Confirm & Start
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
