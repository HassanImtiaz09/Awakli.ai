import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { motion, AnimatePresence } from "framer-motion";
import { useState, useRef, useEffect, useCallback } from "react";
import { useParams, useLocation } from "wouter";
import { AwakliButton } from "@/components/awakli/AwakliButton";
import { AwakliCard } from "@/components/awakli/AwakliCard";
import { AwakliiBadge } from "@/components/awakli/AwakliiBadge";
import {
  Mic, Upload, Play, Pause, Trash2, Loader2, ArrowLeft,
  Volume2, CheckCircle, AlertTriangle, RefreshCw
} from "lucide-react";
import { toast } from "sonner";

export default function VoiceCloning() {
  const { user } = useAuth();
  const params = useParams<{ projectId: string; characterId: string }>();
  const projectId = Number(params.projectId);
  const characterId = Number(params.characterId);
  const [, navigate] = useLocation();

  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isPlayingOriginal, setIsPlayingOriginal] = useState(false);
  const [isPlayingClone, setIsPlayingClone] = useState(false);
  const [testText, setTestText] = useState("Hello, this is a test of my cloned voice. How does it sound?");
  const [testAudioUrl, setTestAudioUrl] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const originalAudioRef = useRef<HTMLAudioElement | null>(null);
  const cloneAudioRef = useRef<HTMLAudioElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Queries
  const characterQuery = trpc.characters.listByProject.useQuery(
    { projectId },
    { enabled: !!user && !!projectId }
  );

  const voiceQuery = trpc.voice.getSettings.useQuery(
    { characterId },
    { enabled: !!user && !!characterId }
  );

  // Mutations
  const cloneMut = trpc.voice.clone.useMutation({
    onSuccess: () => {
      toast.success("Voice cloned successfully!");
      voiceQuery.refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const testMut = trpc.voice.test.useMutation({
    onSuccess: (data) => {
      setTestAudioUrl(data.audioUrl);
      toast.success("Test audio generated!");
    },
    onError: (err) => toast.error(err.message),
  });

  const removeMut = trpc.voice.remove.useMutation({
    onSuccess: () => {
      toast.success("Voice clone removed");
      setTestAudioUrl(null);
      voiceQuery.refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const character = characterQuery.data?.find((c: any) => c.id === characterId);
  const voiceSettings = voiceQuery.data;
  const hasVoice = voiceSettings?.voiceCloneUrl;

  // File handling
  const handleFileSelect = (file: File) => {
    const validTypes = ["audio/mp3", "audio/mpeg", "audio/wav", "audio/ogg", "audio/webm", "audio/m4a"];
    if (!validTypes.some(t => file.type.startsWith(t.split("/")[0]))) {
      toast.error("Please upload an audio file (MP3, WAV, OGG, WebM, M4A)");
      return;
    }
    if (file.size > 16 * 1024 * 1024) {
      toast.error("File size must be under 16MB");
      return;
    }
    setAudioFile(file);
    setAudioUrl(URL.createObjectURL(file));
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  }, []);

  const handleCloneVoice = async () => {
    if (!audioUrl) {
      toast.error("Please upload an audio file first");
      return;
    }
    // In a real implementation, we'd upload to S3 first
    // For now, use a placeholder URL
    cloneMut.mutate({
      characterId,
      audioUrl: audioUrl.startsWith("blob:") ? `uploaded-voice-${characterId}.mp3` : audioUrl,
    });
  };

  // Audio playback
  const toggleOriginalPlay = () => {
    if (!originalAudioRef.current || !audioUrl) return;
    if (isPlayingOriginal) {
      originalAudioRef.current.pause();
    } else {
      originalAudioRef.current.play();
    }
    setIsPlayingOriginal(!isPlayingOriginal);
  };

  const toggleClonePlay = () => {
    if (!cloneAudioRef.current || !testAudioUrl) return;
    if (isPlayingClone) {
      cloneAudioRef.current.pause();
    } else {
      cloneAudioRef.current.play();
    }
    setIsPlayingClone(!isPlayingClone);
  };

  if (!user) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 animate-spin text-accent-cyan" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4">
        <AwakliButton
          variant="ghost"
          size="sm"
          onClick={() => navigate(`/studio/${projectId}/characters`)}
        >
          <ArrowLeft className="w-4 h-4 mr-1" />
          Back to Characters
        </AwakliButton>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-white font-display">
            Voice Cloning — {character?.name || "Character"}
          </h1>
          <p className="text-gray-400 text-sm mt-1">
            Upload a voice sample to create an AI voice clone for this character
          </p>
        </div>
        {hasVoice && (
          <AwakliiBadge variant="success">Voice Active</AwakliiBadge>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Upload & Clone */}
        <div className="space-y-6">
          {/* Upload Zone */}
          <AwakliCard className="p-6">
            <h2 className="text-lg font-semibold text-white font-display mb-4">
              <Mic className="w-5 h-5 inline mr-2 text-accent-pink" />
              Reference Audio
            </h2>

            <div
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`relative border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${
                isDragging
                  ? "border-accent-cyan bg-accent-cyan/5"
                  : audioFile
                  ? "border-green-500/50 bg-green-500/5"
                  : "border-gray-700 hover:border-gray-500 bg-gray-900/30"
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="audio/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFileSelect(file);
                }}
              />

              {audioFile ? (
                <div className="space-y-3">
                  <CheckCircle className="w-10 h-10 text-green-400 mx-auto" />
                  <p className="text-white font-medium">{audioFile.name}</p>
                  <p className="text-gray-400 text-sm">
                    {(audioFile.size / (1024 * 1024)).toFixed(2)} MB
                  </p>

                  {/* Waveform visualization placeholder */}
                  <div className="flex items-center justify-center gap-1 h-12 py-2">
                    {Array.from({ length: 40 }).map((_, i) => (
                      <motion.div
                        key={i}
                        initial={{ height: 4 }}
                        animate={{
                          height: isPlayingOriginal
                            ? Math.random() * 32 + 4
                            : Math.sin(i * 0.3) * 12 + 16,
                        }}
                        transition={{ duration: 0.15 }}
                        className="w-1 bg-accent-cyan/60 rounded-full"
                      />
                    ))}
                  </div>

                  <div className="flex items-center justify-center gap-3">
                    <AwakliButton variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); toggleOriginalPlay(); }}>
                      {isPlayingOriginal ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                    </AwakliButton>
                    <AwakliButton
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        setAudioFile(null);
                        setAudioUrl(null);
                      }}
                    >
                      <Trash2 className="w-4 h-4 text-red-400" />
                    </AwakliButton>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <Upload className="w-10 h-10 text-gray-500 mx-auto" />
                  <p className="text-gray-300">Drop audio file here or click to browse</p>
                  <p className="text-gray-500 text-xs">
                    MP3, WAV, OGG, WebM, M4A — Max 16MB
                  </p>
                </div>
              )}
            </div>

            {audioUrl && <audio ref={originalAudioRef} src={audioUrl} onEnded={() => setIsPlayingOriginal(false)} />}

            {/* Clone Button */}
            <AwakliButton
              variant="primary"
              className="w-full mt-4"
              onClick={handleCloneVoice}
              disabled={!audioFile || cloneMut.isPending}
            >
              {cloneMut.isPending ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin mr-2" />
                  <span>Cloning Voice...</span>
                  <motion.div
                    className="absolute inset-0 bg-gradient-to-r from-accent-pink/20 to-accent-cyan/20 rounded-lg"
                    animate={{ opacity: [0.3, 0.6, 0.3] }}
                    transition={{ duration: 2, repeat: Infinity }}
                  />
                </>
              ) : (
                <>
                  <Mic className="w-5 h-5 mr-2" />
                  Clone Voice
                </>
              )}
            </AwakliButton>
          </AwakliCard>

          {/* Voice Status */}
          {hasVoice && (
            <AwakliCard className="p-6">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-white font-semibold">Active Voice Clone</h3>
                <AwakliButton
                  variant="ghost"
                  size="sm"
                  onClick={() => removeMut.mutate({ characterId })}
                  disabled={removeMut.isPending}
                >
                  <Trash2 className="w-4 h-4 text-red-400 mr-1" />
                  Remove
                </AwakliButton>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between text-gray-400">
                  <span>Voice ID</span>
                  <span className="text-accent-cyan font-mono text-xs">{voiceSettings?.voiceId || "—"}</span>
                </div>
                <div className="flex justify-between text-gray-400">
                  <span>Stability</span>
                  <span className="text-white">{(voiceSettings?.voiceSettings as any)?.stability ?? 0.75}</span>
                </div>
                <div className="flex justify-between text-gray-400">
                  <span>Similarity</span>
                  <span className="text-white">{(voiceSettings?.voiceSettings as any)?.similarity ?? 0.85}</span>
                </div>
              </div>
            </AwakliCard>
          )}
        </div>

        {/* Right: Test Voice */}
        <div className="space-y-6">
          <AwakliCard className="p-6">
            <h2 className="text-lg font-semibold text-white font-display mb-4">
              <Volume2 className="w-5 h-5 inline mr-2 text-accent-cyan" />
              Test Voice
            </h2>

            <textarea
              value={testText}
              onChange={(e) => setTestText(e.target.value)}
              placeholder="Type text to test the cloned voice..."
              className="w-full p-3 bg-gray-900/50 border border-gray-700/50 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:border-accent-cyan resize-none mb-4"
              rows={4}
            />

            <AwakliButton
              variant="secondary"
              className="w-full"
              onClick={() => testMut.mutate({ characterId, text: testText })}
              disabled={!hasVoice || testMut.isPending || !testText.trim()}
            >
              {testMut.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  Generating...
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 mr-2" />
                  Test Voice
                </>
              )}
            </AwakliButton>

            {!hasVoice && (
              <p className="text-gray-500 text-xs mt-2 text-center">
                Clone a voice first to test it
              </p>
            )}
          </AwakliCard>

          {/* Test Result */}
          <AnimatePresence>
            {testAudioUrl && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
              >
                <AwakliCard className="p-6">
                  <h3 className="text-white font-semibold mb-4">Generated Sample</h3>

                  {/* Waveform */}
                  <div className="flex items-center justify-center gap-1 h-16 mb-4 bg-gray-900/30 rounded-lg p-3">
                    {Array.from({ length: 50 }).map((_, i) => (
                      <motion.div
                        key={i}
                        initial={{ height: 4 }}
                        animate={{
                          height: isPlayingClone
                            ? Math.random() * 40 + 4
                            : Math.sin(i * 0.25) * 16 + 20,
                        }}
                        transition={{ duration: 0.15 }}
                        className="w-1 bg-accent-pink/60 rounded-full"
                      />
                    ))}
                  </div>

                  <div className="flex items-center justify-center gap-3">
                    <AwakliButton variant="primary" size="sm" onClick={toggleClonePlay}>
                      {isPlayingClone ? <Pause className="w-4 h-4 mr-1" /> : <Play className="w-4 h-4 mr-1" />}
                      {isPlayingClone ? "Pause" : "Play"}
                    </AwakliButton>
                    <AwakliButton
                      variant="ghost"
                      size="sm"
                      onClick={() => testMut.mutate({ characterId, text: testText })}
                      disabled={testMut.isPending}
                    >
                      <RefreshCw className="w-4 h-4 mr-1" />
                      Regenerate
                    </AwakliButton>
                  </div>

                  <audio ref={cloneAudioRef} src={testAudioUrl} onEnded={() => setIsPlayingClone(false)} />
                </AwakliCard>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Side-by-side comparison */}
          {audioUrl && testAudioUrl && (
            <AwakliCard className="p-6">
              <h3 className="text-white font-semibold mb-4">Compare</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="text-center">
                  <p className="text-gray-400 text-sm mb-2">Original</p>
                  <AwakliButton variant="ghost" size="sm" onClick={toggleOriginalPlay}>
                    {isPlayingOriginal ? <Pause className="w-4 h-4 mr-1" /> : <Play className="w-4 h-4 mr-1" />}
                    {isPlayingOriginal ? "Pause" : "Play"}
                  </AwakliButton>
                </div>
                <div className="text-center">
                  <p className="text-gray-400 text-sm mb-2">Cloned</p>
                  <AwakliButton variant="ghost" size="sm" onClick={toggleClonePlay}>
                    {isPlayingClone ? <Pause className="w-4 h-4 mr-1" /> : <Play className="w-4 h-4 mr-1" />}
                    {isPlayingClone ? "Pause" : "Play"}
                  </AwakliButton>
                </div>
              </div>
            </AwakliCard>
          )}
        </div>
      </div>
    </div>
  );
}
