import { useState, useRef, useEffect, useCallback } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { useRoute, useLocation } from "wouter";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

// ─── Performance Guide Display ──────────────────────────────────────────

interface PerformanceSection {
  label: string;
  direction: string;
  energyLevel: number;
  lines: {
    text: string;
    volume: string;
    emotion: string;
    technique: string[];
    notes: string;
  }[];
}

const VOLUME_COLORS: Record<string, string> = {
  whisper: "bg-blue-900/30 text-blue-300",
  soft: "bg-blue-800/30 text-blue-200",
  medium: "bg-purple-800/30 text-purple-200",
  loud: "bg-orange-800/30 text-orange-200",
  belt: "bg-red-800/30 text-red-200",
};

const EMOTION_ICONS: Record<string, string> = {
  hopeful: "✨", angry: "🔥", sad: "💧", joyful: "☀️",
  desperate: "💔", triumphant: "⚡", vulnerable: "🌙",
  confident: "💪", mysterious: "🌀", playful: "🎭",
};

function PerformanceGuide({ sections }: { sections: PerformanceSection[] }) {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center text-sm">🎤</div>
        <div>
          <h3 className="font-semibold text-lg">Performance Guide</h3>
          <p className="text-sm text-muted-foreground">Follow these annotations while recording</p>
        </div>
      </div>

      {sections.map((section, si) => (
        <div key={si} className="rounded-lg border border-border/50 overflow-hidden">
          {/* Section Header */}
          <div className="bg-muted/30 px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Badge variant="outline" className="font-mono text-xs">{section.label}</Badge>
              <span className="text-sm text-muted-foreground italic">{section.direction}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-muted-foreground">Energy</span>
              <div className="flex gap-0.5">
                {Array.from({ length: 10 }).map((_, i) => (
                  <div
                    key={i}
                    className={`w-1.5 h-4 rounded-sm ${
                      i < section.energyLevel
                        ? i < 3 ? "bg-blue-500" : i < 6 ? "bg-purple-500" : i < 8 ? "bg-orange-500" : "bg-red-500"
                        : "bg-muted/30"
                    }`}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Lines */}
          <div className="divide-y divide-border/30">
            {section.lines.map((line, li) => (
              <div key={li} className="px-4 py-3 flex items-start gap-3 hover:bg-muted/10 transition-colors">
                {/* Emotion Icon */}
                <span className="text-lg mt-0.5 shrink-0">{EMOTION_ICONS[line.emotion] || "🎵"}</span>

                {/* Lyrics + Annotations */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium leading-relaxed">{line.text}</p>
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    <Badge className={`text-[10px] px-1.5 py-0 ${VOLUME_COLORS[line.volume] || "bg-muted"}`}>
                      {line.volume}
                    </Badge>
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-purple-500/30 text-purple-300">
                      {line.emotion}
                    </Badge>
                    {line.technique.map((t, ti) => (
                      <Badge key={ti} variant="outline" className="text-[10px] px-1.5 py-0 border-amber-500/30 text-amber-300">
                        {t.replace(/_/g, " ")}
                      </Badge>
                    ))}
                  </div>
                  {line.notes && (
                    <p className="text-xs text-muted-foreground mt-1 italic">💡 {line.notes}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Recording Studio UI ────────────────────────────────────────────────

function RecordingStudio({
  projectId,
  trackType,
  onRecordingComplete,
}: {
  projectId: number;
  trackType: "opening" | "ending";
  onRecordingComplete: (recordingId: number) => void;
}) {
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [mode, setMode] = useState<"full_take" | "section_by_section">("full_take");
  const [audioLevel, setAudioLevel] = useState(0);
  const [showTips, setShowTips] = useState(true);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number>(0);
  const timerRef = useRef<number>(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const uploadMutation = trpc.vocalRecording.upload.useMutation();

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const audioContext = new AudioContext();
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;

      const mediaRecorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        const reader = new FileReader();
        reader.onloadend = async () => {
          const base64 = (reader.result as string).split(",")[1];
          try {
            const result = await uploadMutation.mutateAsync({
              projectId,
              trackType,
              recordingMode: mode,
              audioBase64: base64,
              mimeType: "audio/webm",
            });
            toast.success("Recording uploaded successfully!");
            onRecordingComplete(result.recordingId);
          } catch {
            toast.error("Failed to upload recording");
          }
        };
        reader.readAsDataURL(blob);
      };

      mediaRecorder.start(250);
      setIsRecording(true);
      setShowTips(false);
      setRecordingTime(0);

      // Timer
      timerRef.current = window.setInterval(() => {
        setRecordingTime(t => t + 1);
      }, 1000);

      // Audio level visualization
      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      const drawLevel = () => {
        analyser.getByteFrequencyData(dataArray);
        const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
        setAudioLevel(avg / 255);

        // Draw waveform on canvas
        if (canvasRef.current) {
          const ctx = canvasRef.current.getContext("2d");
          if (ctx) {
            const w = canvasRef.current.width;
            const h = canvasRef.current.height;
            ctx.fillStyle = "rgba(0,0,0,0.1)";
            ctx.fillRect(0, 0, w, h);
            ctx.strokeStyle = `hsl(${280 + avg * 0.5}, 80%, 60%)`;
            ctx.lineWidth = 2;
            ctx.beginPath();
            const sliceWidth = w / dataArray.length;
            let x = 0;
            for (let i = 0; i < dataArray.length; i++) {
              const v = dataArray[i] / 255;
              const y = h / 2 + (v - 0.5) * h * 0.8;
              if (i === 0) ctx.moveTo(x, y);
              else ctx.lineTo(x, y);
              x += sliceWidth;
            }
            ctx.stroke();
          }
        }

        animFrameRef.current = requestAnimationFrame(drawLevel);
      };
      drawLevel();
    } catch {
      toast.error("Microphone access denied. Please allow microphone access to record.");
    }
  }, [projectId, trackType, mode, onRecordingComplete, uploadMutation]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      setIsPaused(false);
      clearInterval(timerRef.current);
      cancelAnimationFrame(animFrameRef.current);
      setAudioLevel(0);
    }
  }, [isRecording]);

  const pauseRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      if (isPaused) {
        mediaRecorderRef.current.resume();
        setIsPaused(false);
      } else {
        mediaRecorderRef.current.pause();
        setIsPaused(true);
      }
    }
  }, [isRecording, isPaused]);

  useEffect(() => {
    return () => {
      clearInterval(timerRef.current);
      cancelAnimationFrame(animFrameRef.current);
    };
  }, []);

  const formatTime = (s: number) => `${Math.floor(s / 60).toString().padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`;

  return (
    <div className="space-y-6">
      {/* Tips Overlay */}
      {showTips && (
        <Card className="border-amber-500/30 bg-amber-950/20">
          <CardContent className="pt-4">
            <div className="flex items-start gap-3">
              <span className="text-2xl">🎧</span>
              <div className="space-y-2">
                <h4 className="font-semibold text-amber-200">Recording Tips</h4>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li>• Use headphones to prevent backing track bleed</li>
                  <li>• Record in a quiet room with minimal echo</li>
                  <li>• Keep the microphone 6-12 inches from your mouth</li>
                  <li>• Don't worry about pitch perfection — the AI will handle that</li>
                  <li>• Focus on emotion and timing — that's what makes your version unique</li>
                </ul>
                <Button variant="ghost" size="sm" onClick={() => setShowTips(false)} className="text-amber-300">
                  Got it, let's record
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Mode Toggle */}
      <div className="flex items-center gap-3">
        <span className="text-sm text-muted-foreground">Recording Mode:</span>
        <div className="flex gap-2">
          <Button
            variant={mode === "full_take" ? "default" : "outline"}
            size="sm"
            onClick={() => setMode("full_take")}
            disabled={isRecording}
          >
            Full Take
          </Button>
          <Button
            variant={mode === "section_by_section" ? "default" : "outline"}
            size="sm"
            onClick={() => setMode("section_by_section")}
            disabled={isRecording}
          >
            Section by Section
          </Button>
        </div>
      </div>

      {/* Waveform Canvas */}
      <div className="relative rounded-lg overflow-hidden bg-black/40 border border-border/30">
        <canvas
          ref={canvasRef}
          width={800}
          height={120}
          className="w-full h-[120px]"
        />
        {/* VU Meter */}
        <div className="absolute right-3 top-3 bottom-3 w-3 rounded-full bg-black/50 overflow-hidden flex flex-col-reverse">
          <div
            className="transition-all duration-75 rounded-full"
            style={{
              height: `${audioLevel * 100}%`,
              background: audioLevel > 0.8 ? "#ef4444" : audioLevel > 0.5 ? "#f59e0b" : "#22c55e",
            }}
          />
        </div>
        {/* Timer */}
        <div className="absolute left-3 top-3 font-mono text-lg text-white/80">
          {formatTime(recordingTime)}
        </div>
        {isRecording && (
          <div className="absolute left-3 bottom-3 flex items-center gap-2">
            <div className={`w-3 h-3 rounded-full ${isPaused ? "bg-amber-500" : "bg-red-500 animate-pulse"}`} />
            <span className="text-xs text-white/60">{isPaused ? "PAUSED" : "RECORDING"}</span>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="flex items-center justify-center gap-4">
        {!isRecording ? (
          <Button
            size="lg"
            className="bg-gradient-to-r from-red-600 to-pink-600 hover:from-red-500 hover:to-pink-500 text-white rounded-full px-8 gap-2"
            onClick={startRecording}
          >
            <span className="text-lg">⏺</span> Start Recording
          </Button>
        ) : (
          <>
            <Button
              variant="outline"
              size="lg"
              className="rounded-full"
              onClick={pauseRecording}
            >
              {isPaused ? "▶ Resume" : "⏸ Pause"}
            </Button>
            <Button
              size="lg"
              className="bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white rounded-full px-8"
              onClick={stopRecording}
            >
              ⏹ Stop & Upload
            </Button>
          </>
        )}
      </div>

      {uploadMutation.isPending && (
        <div className="text-center text-sm text-muted-foreground animate-pulse">
          Uploading recording...
        </div>
      )}
    </div>
  );
}

// ─── AI Voice Selection Grid ────────────────────────────────────────────

function VoiceSelectionGrid({
  onSelect,
  selectedId,
}: {
  onSelect: (voiceId: number) => void;
  selectedId: number | null;
}) {
  const [genderFilter, setGenderFilter] = useState<string | null>(null);
  const { data } = trpc.singingVoice.list.useQuery(
    genderFilter ? { gender: genderFilter } : undefined
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <span className="text-sm text-muted-foreground">Filter:</span>
        <div className="flex gap-2">
          {[null, "female", "male", "non-binary"].map(g => (
            <Button
              key={g || "all"}
              variant={genderFilter === g ? "default" : "outline"}
              size="sm"
              onClick={() => setGenderFilter(g)}
            >
              {g ? g.charAt(0).toUpperCase() + g.slice(1) : "All"}
            </Button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        {data?.voices.map(voice => (
          <Card
            key={voice.id}
            className={`cursor-pointer transition-all hover:scale-[1.02] ${
              selectedId === voice.id
                ? "border-amber-500 ring-2 ring-amber-500/30 bg-amber-950/20"
                : "border-border/50 hover:border-border"
            }`}
            onClick={() => onSelect(voice.id)}
          >
            <CardContent className="p-4">
              <div className="flex items-start justify-between mb-2">
                <h4 className="font-medium text-sm">{voice.name}</h4>
                {selectedId === voice.id && (
                  <span className="text-amber-400 text-sm">✓</span>
                )}
              </div>
              <div className="flex flex-wrap gap-1 mb-2">
                <Badge variant="outline" className="text-[10px]">{voice.gender}</Badge>
                <Badge variant="outline" className="text-[10px]">{voice.vocalRange}</Badge>
              </div>
              <div className="flex flex-wrap gap-1">
                {voice.styleTags.slice(0, 3).map(tag => (
                  <Badge key={tag} className="text-[10px] bg-muted/50">{tag}</Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ─── Three-Way Comparison Player ────────────────────────────────────────

function ComparisonPlayer({
  recordingId,
  rawUrl,
  convertedUrl,
  finalMixUrl,
  targetVoice,
  onTryDifferentVoice,
  onReRecord,
  onApprove,
  onAdjustMix,
}: {
  recordingId: number;
  rawUrl: string | null;
  convertedUrl: string | null;
  finalMixUrl: string | null;
  targetVoice: string | null;
  onTryDifferentVoice: () => void;
  onReRecord: () => void;
  onApprove: () => void;
  onAdjustMix: () => void;
}) {
  const [playing, setPlaying] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const playTrack = (url: string | null, label: string) => {
    if (!url) return;
    if (audioRef.current) {
      audioRef.current.pause();
    }
    if (playing === label) {
      setPlaying(null);
      return;
    }
    const audio = new Audio(url);
    audioRef.current = audio;
    audio.play();
    audio.onended = () => setPlaying(null);
    setPlaying(label);
  };

  const tracks = [
    { label: "Your Recording", url: rawUrl, icon: "🎤", desc: "Raw vocal performance" },
    { label: "AI Voice Only", url: convertedUrl, icon: "🤖", desc: "AI-generated vocal" },
    { label: "Your Emotion + AI Voice", url: finalMixUrl, icon: "✨", desc: "Your performance with AI voice", highlight: true },
  ];

  return (
    <div className="space-y-6">
      <div className="text-center mb-4">
        <h3 className="text-lg font-semibold">Compare Versions</h3>
        {targetVoice && (
          <p className="text-sm text-muted-foreground">AI Voice: {targetVoice}</p>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {tracks.map(track => (
          <Card
            key={track.label}
            className={`transition-all ${
              track.highlight
                ? "border-amber-500/50 bg-gradient-to-b from-amber-950/20 to-transparent"
                : "border-border/50"
            }`}
          >
            <CardContent className="p-4 text-center space-y-3">
              <span className="text-3xl">{track.icon}</span>
              <div>
                <h4 className="font-medium text-sm">{track.label}</h4>
                <p className="text-xs text-muted-foreground">{track.desc}</p>
              </div>
              {track.highlight && (
                <Badge className="bg-amber-500/20 text-amber-300 border-amber-500/30">
                  Recommended
                </Badge>
              )}
              <Button
                variant={playing === track.label ? "default" : "outline"}
                size="sm"
                className="w-full"
                onClick={() => playTrack(track.url, track.label)}
                disabled={!track.url}
              >
                {playing === track.label ? "⏹ Stop" : "▶ Play"}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Actions */}
      <div className="flex flex-wrap justify-center gap-3">
        <Button
          className="bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white gap-2"
          onClick={onApprove}
        >
          ✓ Use This Version
        </Button>
        <Button variant="outline" onClick={onTryDifferentVoice}>
          🔄 Try Different Voice
        </Button>
        <Button variant="outline" onClick={onReRecord}>
          🎤 Re-record
        </Button>
        <Button variant="ghost" onClick={onAdjustMix}>
          🎚️ Adjust Mix
        </Button>
      </div>
    </div>
  );
}

// ─── Mix Adjustment Panel ───────────────────────────────────────────────

function MixAdjustment({
  recordingId,
  onClose,
}: {
  recordingId: number;
  onClose: () => void;
}) {
  const [vocalVolume, setVocalVolume] = useState(1);
  const [reverbAmount, setReverbAmount] = useState(0.15);
  const [backingVolume, setBackingVolume] = useState(1);

  const adjustMutation = trpc.voiceConversion.adjustMix.useMutation();

  const handleApply = async () => {
    try {
      await adjustMutation.mutateAsync({
        recordingId,
        vocalVolume,
        reverbAmount,
        backingTrackVolume: backingVolume,
      });
      toast.success("Mix adjusted successfully!");
      onClose();
    } catch {
      toast.error("Failed to adjust mix");
    }
  };

  return (
    <Card className="border-border/50">
      <CardHeader>
        <CardTitle className="text-base">🎚️ Mix Adjustment</CardTitle>
        <CardDescription>Fine-tune the final mix balance</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span>Vocal Volume</span>
            <span className="text-muted-foreground">{Math.round(vocalVolume * 100)}%</span>
          </div>
          <Slider value={[vocalVolume * 100]} onValueChange={([v]) => setVocalVolume(v / 100)} max={200} step={5} />
        </div>
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span>Reverb Amount</span>
            <span className="text-muted-foreground">{Math.round(reverbAmount * 100)}%</span>
          </div>
          <Slider value={[reverbAmount * 100]} onValueChange={([v]) => setReverbAmount(v / 100)} max={100} step={5} />
        </div>
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span>Backing Track Volume</span>
            <span className="text-muted-foreground">{Math.round(backingVolume * 100)}%</span>
          </div>
          <Slider value={[backingVolume * 100]} onValueChange={([v]) => setBackingVolume(v / 100)} max={200} step={5} />
        </div>
        <div className="flex gap-3">
          <Button onClick={handleApply} disabled={adjustMutation.isPending} className="flex-1">
            {adjustMutation.isPending ? "Applying..." : "Apply Changes"}
          </Button>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────────

type Step = "intro" | "guide" | "record" | "voice" | "processing" | "compare" | "mix";

export default function VocalRecordingStudio() {
  const { user } = useAuth();
  const [, params] = useRoute("/studio/:projectId/vocal-recording");
  const [, navigate] = useLocation();
  const projectId = params?.projectId ? Number(params.projectId) : 0;

  const [step, setStep] = useState<Step>("intro");
  const [trackType, setTrackType] = useState<"opening" | "ending">("opening");
  const [recordingId, setRecordingId] = useState<number | null>(null);
  const [selectedVoiceId, setSelectedVoiceId] = useState<number | null>(null);
  const [guideSections, setGuideSections] = useState<PerformanceSection[]>([]);

  const generateGuideMutation = trpc.performanceGuide.generate.useMutation();
  const convertMutation = trpc.voiceConversion.convert.useMutation();
  const approveMutation = trpc.voiceConversion.approve.useMutation();

  const { data: recordingStatus } = trpc.vocalRecording.getStatus.useQuery(
    { recordingId: recordingId! },
    { enabled: !!recordingId, refetchInterval: step === "processing" ? 2000 : false }
  );

  // Auto-advance from processing to compare when ready
  useEffect(() => {
    if (step === "processing" && recordingStatus?.status === "ready") {
      setStep("compare");
    }
  }, [step, recordingStatus?.status]);

  const handleGenerateGuide = async (lyrics: string) => {
    try {
      const result = await generateGuideMutation.mutateAsync({
        projectId,
        lyrics,
        themeConcept: "anime theme song",
      });
      setGuideSections(result.guide.sections);
      setStep("guide");
    } catch {
      toast.error("Failed to generate performance guide");
    }
  };

  const handleRecordingComplete = (id: number) => {
    setRecordingId(id);
    setStep("voice");
  };

  const handleConvert = async () => {
    if (!recordingId || !selectedVoiceId) return;
    try {
      setStep("processing");
      await convertMutation.mutateAsync({
        recordingId,
        targetVoiceModelId: selectedVoiceId,
      });
      // Status polling will auto-advance to compare
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Conversion failed";
      toast.error(msg);
      setStep("voice");
    }
  };

  const handleApprove = async () => {
    if (!recordingId) return;
    try {
      await approveMutation.mutateAsync({ recordingId });
      toast.success("Vocal recording approved and set as theme track!");
      navigate(`/studio/${projectId}/music`);
    } catch {
      toast.error("Failed to approve recording");
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Please log in to access the recording studio.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border/50 bg-gradient-to-r from-amber-950/20 via-background to-purple-950/20">
        <div className="container py-6">
          <div className="flex items-center gap-3 mb-2">
            <Button variant="ghost" size="sm" onClick={() => navigate(`/studio/${projectId}/music`)}>
              ← Back to Music Studio
            </Button>
          </div>
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center text-2xl">
              🎤
            </div>
            <div>
              <h1 className="text-2xl font-bold">Vocal Recording Studio</h1>
              <p className="text-muted-foreground">Record your performance, transform with AI voice</p>
            </div>
            <Badge className="bg-amber-500/20 text-amber-300 border-amber-500/30 ml-auto">
              Studio Exclusive
            </Badge>
          </div>

          {/* Progress Steps */}
          <div className="flex items-center gap-2 mt-6">
            {(["intro", "guide", "record", "voice", "processing", "compare"] as Step[]).map((s, i) => {
              const labels = ["Setup", "Guide", "Record", "Voice", "Convert", "Compare"];
              const current = ["intro", "guide", "record", "voice", "processing", "compare"].indexOf(step);
              const isComplete = i < current;
              const isCurrent = i === current;
              return (
                <div key={s} className="flex items-center gap-2">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium ${
                    isComplete ? "bg-green-600 text-white" :
                    isCurrent ? "bg-amber-500 text-white" :
                    "bg-muted/30 text-muted-foreground"
                  }`}>
                    {isComplete ? "✓" : i + 1}
                  </div>
                  <span className={`text-xs ${isCurrent ? "text-amber-300 font-medium" : "text-muted-foreground"}`}>
                    {labels[i]}
                  </span>
                  {i < 5 && <div className="w-6 h-px bg-border/50" />}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="container py-8 max-w-4xl">
        {/* Step: Intro */}
        {step === "intro" && (
          <div className="space-y-8">
            <Card className="border-amber-500/20 bg-gradient-to-b from-amber-950/10 to-transparent">
              <CardContent className="pt-6">
                <div className="text-center space-y-4">
                  <span className="text-5xl">🎤</span>
                  <h2 className="text-2xl font-bold">Record Your Performance</h2>
                  <p className="text-muted-foreground max-w-lg mx-auto">
                    You sing with your emotions and timing. Our AI transforms your voice into a professional
                    vocalist while preserving everything that makes your performance unique.
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Track Type Selection */}
            <div className="space-y-3">
              <h3 className="font-semibold">Which theme are you recording?</h3>
              <div className="grid grid-cols-2 gap-4">
                <Card
                  className={`cursor-pointer transition-all hover:scale-[1.01] ${
                    trackType === "opening" ? "border-amber-500 ring-2 ring-amber-500/30" : "border-border/50"
                  }`}
                  onClick={() => setTrackType("opening")}
                >
                  <CardContent className="p-4 text-center">
                    <span className="text-2xl">🌅</span>
                    <h4 className="font-medium mt-2">Opening Theme</h4>
                    <p className="text-xs text-muted-foreground">The hype intro</p>
                  </CardContent>
                </Card>
                <Card
                  className={`cursor-pointer transition-all hover:scale-[1.01] ${
                    trackType === "ending" ? "border-amber-500 ring-2 ring-amber-500/30" : "border-border/50"
                  }`}
                  onClick={() => setTrackType("ending")}
                >
                  <CardContent className="p-4 text-center">
                    <span className="text-2xl">🌙</span>
                    <h4 className="font-medium mt-2">Ending Theme</h4>
                    <p className="text-xs text-muted-foreground">The emotional closer</p>
                  </CardContent>
                </Card>
              </div>
            </div>

            {/* Lyrics Input for Guide */}
            <div className="space-y-3">
              <h3 className="font-semibold">Paste your lyrics</h3>
              <textarea
                id="lyrics-input"
                className="w-full h-40 rounded-lg bg-muted/20 border border-border/50 p-4 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-amber-500/30"
                placeholder="Paste the lyrics for your theme song here..."
              />
              <div className="flex gap-3">
                <Button
                  className="bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white"
                  onClick={() => {
                    const el = document.getElementById("lyrics-input") as HTMLTextAreaElement;
                    if (el?.value.trim()) handleGenerateGuide(el.value.trim());
                    else toast.error("Please paste your lyrics first");
                  }}
                  disabled={generateGuideMutation.isPending}
                >
                  {generateGuideMutation.isPending ? "Generating Guide..." : "Generate Performance Guide"}
                </Button>
                <Button variant="outline" onClick={() => setStep("record")}>
                  Skip Guide → Record
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Step: Performance Guide */}
        {step === "guide" && (
          <div className="space-y-6">
            <PerformanceGuide sections={guideSections} />
            <div className="flex justify-center gap-3">
              <Button
                size="lg"
                className="bg-gradient-to-r from-red-600 to-pink-600 hover:from-red-500 hover:to-pink-500 text-white gap-2"
                onClick={() => setStep("record")}
              >
                🎤 Start Recording
              </Button>
              <Button variant="outline" onClick={() => setStep("intro")}>
                ← Back
              </Button>
            </div>
          </div>
        )}

        {/* Step: Record */}
        {step === "record" && (
          <RecordingStudio
            projectId={projectId}
            trackType={trackType}
            onRecordingComplete={handleRecordingComplete}
          />
        )}

        {/* Step: Voice Selection */}
        {step === "voice" && (
          <div className="space-y-6">
            <div className="text-center">
              <h2 className="text-xl font-bold mb-2">Choose an AI Voice</h2>
              <p className="text-muted-foreground">Select the voice that will sing your performance</p>
            </div>
            <VoiceSelectionGrid
              selectedId={selectedVoiceId}
              onSelect={setSelectedVoiceId}
            />
            <div className="flex justify-center gap-3">
              <Button
                size="lg"
                className="bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white gap-2"
                onClick={handleConvert}
                disabled={!selectedVoiceId || convertMutation.isPending}
              >
                {convertMutation.isPending ? "Starting Conversion..." : "✨ Convert My Performance"}
              </Button>
              <Button variant="outline" onClick={() => setStep("record")}>
                ← Re-record
              </Button>
            </div>
          </div>
        )}

        {/* Step: Processing */}
        {step === "processing" && (
          <Card className="border-border/50">
            <CardContent className="py-12 text-center space-y-6">
              <div className="text-5xl animate-pulse">🎵</div>
              <h2 className="text-xl font-bold">Converting Your Performance</h2>
              <div className="max-w-md mx-auto space-y-4">
                {["Isolating vocals (Demucs V4)", "Converting voice (RVC V2)", "Mixing final track"].map((step, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${
                      i === 0 ? "bg-amber-500 text-white animate-spin" :
                      i === 1 ? "bg-muted/30 text-muted-foreground" :
                      "bg-muted/30 text-muted-foreground"
                    }`}>
                      {i === 0 ? "⟳" : i + 1}
                    </div>
                    <span className={`text-sm ${i === 0 ? "text-amber-300" : "text-muted-foreground"}`}>
                      {step}
                    </span>
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">This usually takes 30-60 seconds</p>
            </CardContent>
          </Card>
        )}

        {/* Step: Compare */}
        {step === "compare" && recordingStatus && (
          <ComparisonPlayer
            recordingId={recordingId!}
            rawUrl={recordingStatus.rawRecordingUrl}
            convertedUrl={recordingStatus.convertedVocalUrl}
            finalMixUrl={recordingStatus.finalMixUrl}
            targetVoice={recordingStatus.targetVoiceModel}
            onTryDifferentVoice={() => {
              setSelectedVoiceId(null);
              setStep("voice");
            }}
            onReRecord={() => {
              setRecordingId(null);
              setStep("record");
            }}
            onApprove={handleApprove}
            onAdjustMix={() => setStep("mix")}
          />
        )}

        {/* Step: Mix Adjustment */}
        {step === "mix" && recordingId && (
          <MixAdjustment
            recordingId={recordingId}
            onClose={() => setStep("compare")}
          />
        )}
      </div>
    </div>
  );
}
