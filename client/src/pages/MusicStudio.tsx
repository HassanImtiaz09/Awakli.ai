import { useState, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  Music, Mic, Volume2, Play, Pause, SkipForward, RefreshCw,
  Check, Sparkles, Wand2, Upload, ChevronLeft, ChevronRight,
  Headphones, Guitar, Piano, Drum, Radio, Zap, Heart, Swords,
  Eye, Laugh, Sun, Moon, CloudRain, Flame,
} from "lucide-react";

// ─── Constants ────────────────────────────────────────────────────────

const GENRE_OPTIONS = [
  { id: "j_rock", name: "J-Rock / Anime Rock", icon: Guitar, color: "from-red-500 to-orange-500" },
  { id: "j_pop", name: "J-Pop / Catchy Pop", icon: Music, color: "from-pink-500 to-purple-500" },
  { id: "epic_orchestral", name: "Epic Orchestral", icon: Volume2, color: "from-amber-500 to-yellow-500" },
  { id: "electronic", name: "Electronic / Future Bass", icon: Zap, color: "from-cyan-500 to-blue-500" },
  { id: "hip_hop", name: "Hip-Hop / Rap", icon: Mic, color: "from-violet-500 to-purple-500" },
  { id: "metal", name: "Metal / Screamo", icon: Flame, color: "from-gray-700 to-red-700" },
  { id: "lofi", name: "Lo-Fi / Chill", icon: Headphones, color: "from-teal-500 to-green-500" },
  { id: "acoustic", name: "Acoustic / Ballad", icon: Piano, color: "from-rose-400 to-pink-400" },
];

const VOCAL_OPTIONS = [
  { id: "female", label: "Female Vocal" },
  { id: "male", label: "Male Vocal" },
  { id: "duet", label: "Duet" },
  { id: "choir", label: "Choir" },
  { id: "instrumental", label: "Instrumental Only" },
];

const LANGUAGE_OPTIONS = [
  { id: "japanese", label: "Japanese" },
  { id: "english", label: "English" },
  { id: "bilingual", label: "Bilingual (JP + EN)" },
  { id: "korean", label: "Korean" },
];

const BGM_MOOD_ICONS: Record<string, any> = {
  main_theme: Music,
  battle: Swords,
  tension: Eye,
  emotional: Heart,
  romance: Heart,
  mystery: Moon,
  comedy: Laugh,
  triumph: Sun,
  daily_life: Sun,
  dark: CloudRain,
};

const REFINEMENT_OPTIONS = [
  { id: "more_energetic", label: "More Energetic", icon: "⚡" },
  { id: "softer", label: "Softer", icon: "🌙" },
  { id: "speed_up", label: "Speed Up", icon: "⏩" },
  { id: "slow_down", label: "Slow Down", icon: "⏪" },
  { id: "add_guitar_solo", label: "Add Guitar Solo", icon: "🎸" },
  { id: "add_piano_break", label: "Piano Break", icon: "🎹" },
  { id: "heavier_drums", label: "Heavier Drums", icon: "🥁" },
  { id: "more_orchestral", label: "More Orchestral", icon: "🎻" },
];

// ─── Main Component ──────────────────────────────────────────────────

export default function MusicStudio() {
  const { projectId } = useParams<{ projectId: string }>();
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const pid = Number(projectId);

  const [activeTab, setActiveTab] = useState("opening");

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container py-4">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate(`/studio/${pid}/pre-production`)}>
              <ChevronLeft className="h-5 w-5" />
            </Button>
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-pink-500 to-purple-600 flex items-center justify-center">
                <Music className="h-5 w-5 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold">Music Studio</h1>
                <p className="text-sm text-muted-foreground">Compose your anime soundtrack</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="container py-6">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-3 mb-6">
            <TabsTrigger value="opening" className="gap-2">
              <Sparkles className="h-4 w-4" />
              Opening Theme
            </TabsTrigger>
            <TabsTrigger value="ending" className="gap-2">
              <Music className="h-4 w-4" />
              Ending Theme
            </TabsTrigger>
            <TabsTrigger value="bgm" className="gap-2">
              <Headphones className="h-4 w-4" />
              BGM / OST
            </TabsTrigger>
          </TabsList>

          <TabsContent value="opening">
            <ThemeComposer projectId={pid} themeType="opening" />
          </TabsContent>

          <TabsContent value="ending">
            <ThemeComposer projectId={pid} themeType="ending" />
          </TabsContent>

          <TabsContent value="bgm">
            <BgmStudio projectId={pid} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

// ─── Theme Composer (OP/ED) ──────────────────────────────────────────

function ThemeComposer({ projectId, themeType }: { projectId: number; themeType: "opening" | "ending" }) {
  const [step, setStep] = useState<"concept" | "lyrics" | "style" | "generate" | "review">("concept");
  const [concept, setConcept] = useState<any>(null);
  const [lyrics, setLyrics] = useState<any>(null);
  const [lyricsText, setLyricsText] = useState("");
  const [selectedGenre, setSelectedGenre] = useState("j_rock");
  const [vocalType, setVocalType] = useState("female");
  const [language, setLanguage] = useState("japanese");
  const [tempo, setTempo] = useState([140]);
  const [generatedTracks, setGeneratedTracks] = useState<any[]>([]);
  const [selectedTrackId, setSelectedTrackId] = useState<number | null>(null);

  const suggestConcept = trpc.musicConcept.suggestThemeConcept.useMutation({
    onSuccess: (data) => {
      setConcept(data);
      toast.success("Concept generated!", { description: data.concept_summary?.substring(0, 80) });
    },
  });

  const generateLyrics = trpc.musicConcept.generateLyrics.useMutation({
    onSuccess: (data) => {
      setLyrics(data);
      const fullText = data.sections?.map((s: any) =>
        `[${s.section_name}] ${s.emotion_marker}\n${s.lines?.join("\n")}`
      ).join("\n\n") || "";
      setLyricsText(fullText);
      setStep("style");
    },
  });

  const generateTheme = trpc.musicGeneration.generateTheme.useMutation({
    onSuccess: (data) => {
      setGeneratedTracks(data.tracks);
      setStep("review");
      toast.success(`${data.variationsGenerated} variations generating!`);
    },
    onError: (err) => {
      toast.error("Generation failed", { description: err.message });
    },
  });

  const confirmTheme = trpc.musicGeneration.confirmTheme.useMutation({
    onSuccess: () => {
      toast.success(`${themeType === "opening" ? "OP" : "ED"} theme confirmed!`);
    },
  });

  const label = themeType === "opening" ? "Opening" : "Ending";

  return (
    <div className="space-y-6">
      {/* Progress Steps */}
      <div className="flex items-center gap-2 mb-8">
        {["concept", "lyrics", "style", "generate", "review"].map((s, i) => {
          const isActive = s === step;
          const isPast = ["concept", "lyrics", "style", "generate", "review"].indexOf(step) > i;
          return (
            <div key={s} className="flex items-center gap-2">
              <div className={`h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                isActive ? "bg-primary text-primary-foreground scale-110" :
                isPast ? "bg-green-500 text-white" : "bg-muted text-muted-foreground"
              }`}>
                {isPast ? <Check className="h-4 w-4" /> : i + 1}
              </div>
              <span className={`text-sm hidden sm:inline ${isActive ? "font-semibold" : "text-muted-foreground"}`}>
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </span>
              {i < 4 && <ChevronRight className="h-4 w-4 text-muted-foreground" />}
            </div>
          );
        })}
      </div>

      {/* Step 1: Concept */}
      {step === "concept" && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wand2 className="h-5 w-5 text-primary" />
              {label} Theme Concept
            </CardTitle>
            <CardDescription>
              Let AI analyze your story and suggest a musical direction
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button
              onClick={() => suggestConcept.mutate({ projectId, themeType })}
              disabled={suggestConcept.isPending}
              className="w-full"
              size="lg"
            >
              {suggestConcept.isPending ? (
                <><RefreshCw className="h-4 w-4 mr-2 animate-spin" /> Analyzing your story...</>
              ) : (
                <><Sparkles className="h-4 w-4 mr-2" /> Generate {label} Concept</>
              )}
            </Button>

            {concept && (
              <div className="space-y-4 mt-4">
                <div className="p-4 rounded-lg bg-gradient-to-br from-primary/10 to-purple-500/10 border">
                  <h3 className="font-semibold mb-2">AI Concept</h3>
                  <p className="text-sm text-muted-foreground mb-3">{concept.concept_summary}</p>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div><span className="text-muted-foreground">Mood:</span> <Badge variant="outline">{concept.suggested_mood}</Badge></div>
                    <div><span className="text-muted-foreground">Genre:</span> <Badge variant="outline">{concept.suggested_genre}</Badge></div>
                    <div><span className="text-muted-foreground">Tempo:</span> <Badge variant="outline">{concept.suggested_tempo}</Badge></div>
                    <div><span className="text-muted-foreground">Vocals:</span> <Badge variant="outline">{concept.vocal_suggestion}</Badge></div>
                  </div>
                  {concept.key_themes_for_lyrics && (
                    <div className="mt-3">
                      <span className="text-sm text-muted-foreground">Lyric Themes:</span>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {concept.key_themes_for_lyrics.map((t: string, i: number) => (
                          <Badge key={i} variant="secondary" className="text-xs">{t}</Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                <Button onClick={() => setStep("lyrics")} className="w-full">
                  Continue to Lyrics <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Step 2: Lyrics */}
      {step === "lyrics" && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Mic className="h-5 w-5 text-primary" />
              {label} Lyrics
            </CardTitle>
            <CardDescription>Generate and edit your theme song lyrics</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-3">
              <Select value={vocalType} onValueChange={setVocalType}>
                <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {VOCAL_OPTIONS.map(v => (
                    <SelectItem key={v.id} value={v.id}>{v.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={language} onValueChange={setLanguage}>
                <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {LANGUAGE_OPTIONS.map(l => (
                    <SelectItem key={l.id} value={l.id}>{l.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Button
              onClick={() => generateLyrics.mutate({
                projectId,
                themeType,
                concept: concept?.concept_summary || "Anime theme song",
                genre: selectedGenre,
                vocalType: vocalType as any,
                language: language as any,
              })}
              disabled={generateLyrics.isPending}
              className="w-full"
            >
              {generateLyrics.isPending ? (
                <><RefreshCw className="h-4 w-4 mr-2 animate-spin" /> Writing lyrics...</>
              ) : (
                <><Wand2 className="h-4 w-4 mr-2" /> Generate Lyrics</>
              )}
            </Button>

            {lyricsText && (
              <>
                <Textarea
                  value={lyricsText}
                  onChange={(e) => setLyricsText(e.target.value)}
                  className="min-h-[300px] font-mono text-sm"
                  placeholder="Lyrics will appear here..."
                />
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setStep("concept")}>
                    <ChevronLeft className="h-4 w-4 mr-1" /> Back
                  </Button>
                  <Button onClick={() => setStep("style")} className="flex-1">
                    Continue to Style <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* Step 3: Style */}
      {step === "style" && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Guitar className="h-5 w-5 text-primary" />
              Musical Style
            </CardTitle>
            <CardDescription>Choose the genre and sound for your {label.toLowerCase()} theme</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {GENRE_OPTIONS.map(genre => {
                const Icon = genre.icon;
                const isSelected = selectedGenre === genre.id;
                return (
                  <button
                    key={genre.id}
                    onClick={() => setSelectedGenre(genre.id)}
                    className={`relative p-4 rounded-xl border-2 transition-all text-left ${
                      isSelected
                        ? "border-primary ring-2 ring-primary/30 scale-[1.02]"
                        : "border-border hover:border-primary/50"
                    }`}
                  >
                    <div className={`h-10 w-10 rounded-lg bg-gradient-to-br ${genre.color} flex items-center justify-center mb-2`}>
                      <Icon className="h-5 w-5 text-white" />
                    </div>
                    <p className="text-sm font-medium leading-tight">{genre.name}</p>
                    {isSelected && (
                      <div className="absolute top-2 right-2 h-5 w-5 rounded-full bg-primary flex items-center justify-center">
                        <Check className="h-3 w-3 text-primary-foreground" />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Tempo: {tempo[0]} BPM</label>
              <Slider value={tempo} onValueChange={setTempo} min={60} max={220} step={5} />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Slow (60)</span><span>Medium (140)</span><span>Fast (220)</span>
              </div>
            </div>

            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep("lyrics")}>
                <ChevronLeft className="h-4 w-4 mr-1" /> Back
              </Button>
              <Button onClick={() => {
                generateTheme.mutate({
                  projectId,
                  themeType,
                  lyrics: lyricsText,
                  genre: selectedGenre,
                  tempo: tempo[0],
                  vocalType: vocalType as any,
                  language,
                  variationCount: 3,
                });
              }} disabled={generateTheme.isPending} className="flex-1">
                {generateTheme.isPending ? (
                  <><RefreshCw className="h-4 w-4 mr-2 animate-spin" /> Generating...</>
                ) : (
                  <><Sparkles className="h-4 w-4 mr-2" /> Generate {3} Variations</>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 4/5: Review Generated Tracks */}
      {step === "review" && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Headphones className="h-5 w-5 text-primary" />
                {label} Theme Variations
              </CardTitle>
              <CardDescription>Listen, compare, and select your {label.toLowerCase()} theme</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {generatedTracks.map((track, i) => (
                <div
                  key={track.id}
                  className={`p-4 rounded-xl border-2 transition-all cursor-pointer ${
                    selectedTrackId === track.id
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/50"
                  }`}
                  onClick={() => setSelectedTrackId(track.id)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`h-12 w-12 rounded-lg flex items-center justify-center ${
                        selectedTrackId === track.id ? "bg-primary text-primary-foreground" : "bg-muted"
                      }`}>
                        <Play className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="font-medium">{track.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {track.status === "generating" ? "Generating..." : "Ready to play"}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {selectedTrackId === track.id && (
                        <Badge className="bg-primary">Selected</Badge>
                      )}
                    </div>
                  </div>
                </div>
              ))}

              {/* Refinement Options */}
              {selectedTrackId && (
                <div className="mt-6">
                  <h4 className="text-sm font-medium mb-3">Refine Selected Track</h4>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {REFINEMENT_OPTIONS.map(opt => (
                      <Button
                        key={opt.id}
                        variant="outline"
                        size="sm"
                        className="text-xs"
                        onClick={() => toast.info("Refinement queued", { description: `Applying: ${opt.label}` })}
                      >
                        <span className="mr-1">{opt.icon}</span> {opt.label}
                      </Button>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex gap-2 mt-4">
                <Button variant="outline" onClick={() => setStep("style")}>
                  <ChevronLeft className="h-4 w-4 mr-1" /> Back
                </Button>
                <Button
                  onClick={() => {
                    if (selectedTrackId) {
                      confirmTheme.mutate({ trackId: selectedTrackId });
                    }
                  }}
                  disabled={!selectedTrackId || confirmTheme.isPending}
                  className="flex-1"
                >
                  {confirmTheme.isPending ? (
                    <><RefreshCw className="h-4 w-4 mr-2 animate-spin" /> Confirming...</>
                  ) : (
                    <><Check className="h-4 w-4 mr-2" /> Confirm as {label} Theme</>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

// ─── BGM Studio ──────────────────────────────────────────────────────

function BgmStudio({ projectId }: { projectId: number }) {
  const [activeSection, setActiveSection] = useState<"tracks" | "scenes" | "stingers">("tracks");

  const tracksQuery = trpc.musicTrack.getTracks.useQuery({ projectId, trackType: "bgm" });
  const stingersQuery = trpc.musicTrack.getTracks.useQuery({ projectId, trackType: "stinger" });

  const generateOst = trpc.musicOst.generateOst.useMutation({
    onSuccess: (data) => {
      toast.success(`${data.totalGenerated} BGM tracks generating!`);
      tracksQuery.refetch();
    },
    onError: (err) => {
      toast.error("Generation failed", { description: err.message });
    },
  });

  const generateStingers = trpc.musicOst.generateStingers.useMutation({
    onSuccess: (data) => {
      toast.success(`${data.total} stingers generating!`);
      stingersQuery.refetch();
    },
  });

  const autoAssign = trpc.musicOst.autoAssignScenes.useMutation({
    onSuccess: (data) => {
      toast.success(`${data.total} scenes assigned BGM!`);
    },
  });

  const approveTrack = trpc.musicTrack.approveTrack.useMutation({
    onSuccess: () => {
      toast.success("Track approved!");
      tracksQuery.refetch();
    },
  });

  const bgmTracks = tracksQuery.data || [];
  const stingerTracks = stingersQuery.data || [];

  return (
    <div className="space-y-6">
      {/* Sub-navigation */}
      <div className="flex gap-2">
        {[
          { id: "tracks" as const, label: "BGM Tracks", icon: Music },
          { id: "scenes" as const, label: "Scene Assignment", icon: Radio },
          { id: "stingers" as const, label: "Stingers", icon: Zap },
        ].map(section => {
          const Icon = section.icon;
          return (
            <Button
              key={section.id}
              variant={activeSection === section.id ? "default" : "outline"}
              onClick={() => setActiveSection(section.id)}
              className="gap-2"
            >
              <Icon className="h-4 w-4" />
              {section.label}
            </Button>
          );
        })}
      </div>

      {/* BGM Tracks */}
      {activeSection === "tracks" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold">Background Music Tracks</h3>
              <p className="text-sm text-muted-foreground">
                {bgmTracks.length} tracks generated
              </p>
            </div>
            <Button
              onClick={() => generateOst.mutate({ projectId })}
              disabled={generateOst.isPending}
            >
              {generateOst.isPending ? (
                <><RefreshCw className="h-4 w-4 mr-2 animate-spin" /> Generating...</>
              ) : (
                <><Sparkles className="h-4 w-4 mr-2" /> Generate Full OST</>
              )}
            </Button>
          </div>

          {bgmTracks.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="py-12 text-center">
                <Music className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h4 className="font-medium mb-2">No BGM tracks yet</h4>
                <p className="text-sm text-muted-foreground mb-4">
                  Generate a full OST with mood-matched instrumental tracks
                </p>
                <Button onClick={() => generateOst.mutate({ projectId })} disabled={generateOst.isPending}>
                  <Sparkles className="h-4 w-4 mr-2" /> Generate OST
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-3">
              {bgmTracks.map(track => {
                const MoodIcon = BGM_MOOD_ICONS[track.mood || ""] || Music;
                return (
                  <Card key={track.id} className={`transition-all ${track.isApproved ? "border-green-500/50" : ""}`}>
                    <CardContent className="py-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center">
                            <MoodIcon className="h-5 w-5" />
                          </div>
                          <div>
                            <p className="font-medium">{track.title}</p>
                            <p className="text-xs text-muted-foreground">
                              {track.mood} · {track.durationSeconds ? `${Math.round(track.durationSeconds)}s` : "2:00"} · v{track.versionNumber}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <Play className="h-4 w-4" />
                          </Button>
                          {track.isApproved ? (
                            <Badge className="bg-green-500">Approved</Badge>
                          ) : (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => approveTrack.mutate({ trackId: track.id })}
                            >
                              <Check className="h-3 w-3 mr-1" /> Approve
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Scene Assignment */}
      {activeSection === "scenes" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold">Scene BGM Assignment</h3>
              <p className="text-sm text-muted-foreground">
                Assign background music to each scene
              </p>
            </div>
            <Button
              onClick={() => autoAssign.mutate({ projectId })}
              disabled={autoAssign.isPending}
            >
              {autoAssign.isPending ? (
                <><RefreshCw className="h-4 w-4 mr-2 animate-spin" /> Analyzing...</>
              ) : (
                <><Wand2 className="h-4 w-4 mr-2" /> Auto-Assign All</>
              )}
            </Button>
          </div>

          <Card>
            <CardContent className="py-6">
              <div className="text-center text-muted-foreground">
                <Radio className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p className="font-medium mb-2">Scene assignment ready</p>
                <p className="text-sm">
                  Click "Auto-Assign All" to let AI match BGM moods to your scenes,
                  or manually assign tracks after generation.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Stingers */}
      {activeSection === "stingers" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold">Stingers & Transitions</h3>
              <p className="text-sm text-muted-foreground">
                Short sound effects for dramatic moments
              </p>
            </div>
            <Button
              onClick={() => generateStingers.mutate({ projectId })}
              disabled={generateStingers.isPending}
            >
              {generateStingers.isPending ? (
                <><RefreshCw className="h-4 w-4 mr-2 animate-spin" /> Generating...</>
              ) : (
                <><Zap className="h-4 w-4 mr-2" /> Generate Stingers</>
              )}
            </Button>
          </div>

          {stingerTracks.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="py-12 text-center">
                <Zap className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h4 className="font-medium mb-2">No stingers yet</h4>
                <p className="text-sm text-muted-foreground mb-4">
                  Generate impact hits, suspense stings, and transition sounds
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {stingerTracks.map(stinger => (
                <Card key={stinger.id} className="cursor-pointer hover:border-primary/50 transition-all">
                  <CardContent className="py-4 text-center">
                    <Zap className="h-8 w-8 mx-auto mb-2 text-primary" />
                    <p className="font-medium text-sm">{stinger.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {stinger.durationSeconds ? `${(stinger.durationSeconds * 1000).toFixed(0)}ms` : "—"}
                    </p>
                    <Button variant="ghost" size="sm" className="mt-2">
                      <Play className="h-3 w-3 mr-1" /> Play
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
