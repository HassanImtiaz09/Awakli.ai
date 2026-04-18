import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { AwakliCard } from "./AwakliCard";
import { AwakliButton } from "./AwakliButton";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "@/components/ui/collapsible";
import {
  Mic, Music, Footprints, Wind, Volume2, Shield, ChevronDown,
  Settings2, Loader2, Save, RotateCcw, Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";

interface AssemblySettingsPanelProps {
  episodeId: number;
}

// Default values matching shared/assemblySettings.ts
const DEFAULTS = {
  enableLipSync: false,
  enableFoley: false,
  enableAmbient: false,
  voiceLufs: -14,
  musicLufs: -24,
  foleyLufs: -28,
  ambientLufs: -32,
  enableVoiceValidation: true,
  voiceValidationThresholdLufs: -30,
  enableSidechainDucking: true,
  sidechainDuckDb: 8,
};

export function AssemblySettingsPanel({ episodeId }: AssemblySettingsPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [localSettings, setLocalSettings] = useState(DEFAULTS);
  const [isDirty, setIsDirty] = useState(false);

  const settingsQuery = trpc.episodes.getAssemblySettings.useQuery(
    { episodeId },
    { enabled: !!episodeId }
  );

  const updateMut = trpc.episodes.updateAssemblySettings.useMutation({
    onSuccess: (data) => {
      setLocalSettings(data);
      setIsDirty(false);
      toast.success("Assembly settings saved");
      settingsQuery.refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  // Sync from server
  useEffect(() => {
    if (settingsQuery.data) {
      setLocalSettings(settingsQuery.data);
      setIsDirty(false);
    }
  }, [settingsQuery.data]);

  const updateLocal = (key: string, value: any) => {
    setLocalSettings((prev) => ({ ...prev, [key]: value }));
    setIsDirty(true);
  };

  const handleSave = () => {
    updateMut.mutate({ episodeId, settings: localSettings });
  };

  const handleReset = () => {
    setLocalSettings(DEFAULTS);
    setIsDirty(true);
  };

  if (settingsQuery.isLoading) {
    return (
      <AwakliCard className="p-5">
        <div className="flex items-center gap-2 text-gray-400">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-sm">Loading assembly settings...</span>
        </div>
      </AwakliCard>
    );
  }

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <AwakliCard className="overflow-hidden">
        <CollapsibleTrigger className="w-full">
          <div className="flex items-center justify-between p-5 cursor-pointer hover:bg-zinc-800/30 transition-colors">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-accent-pink/20 to-accent-cyan/20 flex items-center justify-center">
                <Settings2 className="w-4.5 h-4.5 text-accent-pink" />
              </div>
              <div className="text-left">
                <h3 className="text-sm font-semibold text-zinc-100">Assembly Settings</h3>
                <p className="text-[10px] text-zinc-500">
                  Lip sync, audio buses, loudness levels
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {/* Quick status badges */}
              <div className="flex items-center gap-1.5">
                {localSettings.enableLipSync && (
                  <span className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-purple-500/20 text-purple-300 border border-purple-500/30">
                    Lip Sync
                  </span>
                )}
                {localSettings.enableFoley && (
                  <span className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-amber-500/20 text-amber-300 border border-amber-500/30">
                    Foley
                  </span>
                )}
                {localSettings.enableAmbient && (
                  <span className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-teal-500/20 text-teal-300 border border-teal-500/30">
                    Ambient
                  </span>
                )}
              </div>
              {isDirty && (
                <span className="w-2 h-2 rounded-full bg-accent-pink animate-pulse" />
              )}
              <ChevronDown
                className={`w-4 h-4 text-zinc-500 transition-transform ${isOpen ? "rotate-180" : ""}`}
              />
            </div>
          </div>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <AnimatePresence>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="px-5 pb-5 space-y-5"
            >
              <Separator className="bg-zinc-800" />

              {/* ─── Lip Sync Toggle ─── */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-purple-500/10 flex items-center justify-center">
                    <Sparkles className="w-4 h-4 text-purple-400" />
                  </div>
                  <div>
                    <Label className="text-sm font-medium text-zinc-200">Lip Sync</Label>
                    <p className="text-[10px] text-zinc-500 mt-0.5">
                      Post-production lip sync via Kling API for dialogue panels
                    </p>
                  </div>
                </div>
                <Switch
                  checked={localSettings.enableLipSync}
                  onCheckedChange={(v) => updateLocal("enableLipSync", v)}
                />
              </div>

              <Separator className="bg-zinc-800/50" />

              {/* ─── Audio Buses ─── */}
              <div>
                <h4 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">
                  Audio Buses
                </h4>

                {/* Voice Bus (always on) */}
                <div className="space-y-3">
                  <AudioBusRow
                    icon={<Mic className="w-4 h-4 text-cyan-400" />}
                    label="Voice"
                    description="Dialogue and narration"
                    enabled={true}
                    locked
                    lufs={localSettings.voiceLufs}
                    onLufsChange={(v) => updateLocal("voiceLufs", v)}
                    color="cyan"
                  />

                  {/* Music Bus (always on) */}
                  <AudioBusRow
                    icon={<Music className="w-4 h-4 text-pink-400" />}
                    label="Music"
                    description="Background music and score"
                    enabled={true}
                    locked
                    lufs={localSettings.musicLufs}
                    onLufsChange={(v) => updateLocal("musicLufs", v)}
                    color="pink"
                  />

                  {/* Foley Bus */}
                  <AudioBusRow
                    icon={<Footprints className="w-4 h-4 text-amber-400" />}
                    label="Foley"
                    description="Footsteps, impacts, doors"
                    enabled={localSettings.enableFoley}
                    onToggle={(v) => updateLocal("enableFoley", v)}
                    lufs={localSettings.foleyLufs}
                    onLufsChange={(v) => updateLocal("foleyLufs", v)}
                    color="amber"
                    defaultLufs={-28}
                  />

                  {/* Ambient Bus */}
                  <AudioBusRow
                    icon={<Wind className="w-4 h-4 text-teal-400" />}
                    label="Ambient"
                    description="Ocean hum, wind, city noise"
                    enabled={localSettings.enableAmbient}
                    onToggle={(v) => updateLocal("enableAmbient", v)}
                    lufs={localSettings.ambientLufs}
                    onLufsChange={(v) => updateLocal("ambientLufs", v)}
                    color="teal"
                    defaultLufs={-32}
                  />
                </div>
              </div>

              {/* ─── Advanced Settings ─── */}
              <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
                <CollapsibleTrigger className="w-full">
                  <div className="flex items-center justify-between py-2 cursor-pointer group">
                    <span className="text-xs font-medium text-zinc-500 group-hover:text-zinc-400 transition-colors">
                      Advanced Settings
                    </span>
                    <ChevronDown
                      className={`w-3.5 h-3.5 text-zinc-600 transition-transform ${advancedOpen ? "rotate-180" : ""}`}
                    />
                  </div>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="space-y-4 pt-2">
                    {/* Voice Validation */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Shield className="w-3.5 h-3.5 text-emerald-400" />
                        <div>
                          <Label className="text-xs text-zinc-300">Voice Validation Gate</Label>
                          <p className="text-[9px] text-zinc-600">
                            Verify dialogue is audible before final mux
                          </p>
                        </div>
                      </div>
                      <Switch
                        checked={localSettings.enableVoiceValidation}
                        onCheckedChange={(v) => updateLocal("enableVoiceValidation", v)}
                      />
                    </div>

                    {localSettings.enableVoiceValidation && (
                      <div className="pl-6">
                        <div className="flex items-center justify-between mb-1">
                          <Label className="text-[10px] text-zinc-500">Validation Threshold</Label>
                          <span className="text-[10px] font-mono text-zinc-400">
                            {localSettings.voiceValidationThresholdLufs} LUFS
                          </span>
                        </div>
                        <Slider
                          value={[localSettings.voiceValidationThresholdLufs]}
                          onValueChange={([v]) => updateLocal("voiceValidationThresholdLufs", v)}
                          min={-50}
                          max={-10}
                          step={1}
                          className="w-full"
                        />
                      </div>
                    )}

                    {/* Sidechain Ducking */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Volume2 className="w-3.5 h-3.5 text-blue-400" />
                        <div>
                          <Label className="text-xs text-zinc-300">Sidechain Ducking</Label>
                          <p className="text-[9px] text-zinc-600">
                            Reduce music volume when voice is present
                          </p>
                        </div>
                      </div>
                      <Switch
                        checked={localSettings.enableSidechainDucking}
                        onCheckedChange={(v) => updateLocal("enableSidechainDucking", v)}
                      />
                    </div>

                    {localSettings.enableSidechainDucking && (
                      <div className="pl-6">
                        <div className="flex items-center justify-between mb-1">
                          <Label className="text-[10px] text-zinc-500">Duck Amount</Label>
                          <span className="text-[10px] font-mono text-zinc-400">
                            {localSettings.sidechainDuckDb} dB
                          </span>
                        </div>
                        <Slider
                          value={[localSettings.sidechainDuckDb]}
                          onValueChange={([v]) => updateLocal("sidechainDuckDb", v)}
                          min={0}
                          max={24}
                          step={1}
                          className="w-full"
                        />
                      </div>
                    )}
                  </div>
                </CollapsibleContent>
              </Collapsible>

              {/* ─── Action Buttons ─── */}
              <div className="flex items-center justify-between pt-2">
                <AwakliButton
                  variant="ghost"
                  size="sm"
                  onClick={handleReset}
                  disabled={updateMut.isPending}
                >
                  <RotateCcw className="w-3.5 h-3.5 mr-1" />
                  Reset Defaults
                </AwakliButton>
                <AwakliButton
                  variant="primary"
                  size="sm"
                  onClick={handleSave}
                  disabled={!isDirty || updateMut.isPending}
                >
                  {updateMut.isPending ? (
                    <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
                  ) : (
                    <Save className="w-3.5 h-3.5 mr-1" />
                  )}
                  Save Settings
                </AwakliButton>
              </div>
            </motion.div>
          </AnimatePresence>
        </CollapsibleContent>
      </AwakliCard>
    </Collapsible>
  );
}

// ─── Audio Bus Row Component ──────────────────────────────────────────────

interface AudioBusRowProps {
  icon: React.ReactNode;
  label: string;
  description: string;
  enabled: boolean;
  locked?: boolean;
  onToggle?: (enabled: boolean) => void;
  lufs: number;
  onLufsChange: (lufs: number) => void;
  color: string;
  defaultLufs?: number;
}

function AudioBusRow({
  icon,
  label,
  description,
  enabled,
  locked,
  onToggle,
  lufs,
  onLufsChange,
  color,
  defaultLufs,
}: AudioBusRowProps) {
  const colorMap: Record<string, string> = {
    cyan: "bg-cyan-500/10 border-cyan-500/20",
    pink: "bg-pink-500/10 border-pink-500/20",
    amber: "bg-amber-500/10 border-amber-500/20",
    teal: "bg-teal-500/10 border-teal-500/20",
  };

  const meterWidth = Math.max(0, Math.min(100, ((lufs + 60) / 60) * 100));

  return (
    <div
      className={`rounded-lg border p-3 transition-all ${
        enabled
          ? colorMap[color] || "bg-zinc-800/50 border-zinc-700/50"
          : "bg-zinc-900/30 border-zinc-800/30 opacity-60"
      }`}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          {icon}
          <div>
            <span className="text-xs font-medium text-zinc-200">{label}</span>
            <span className="text-[9px] text-zinc-500 ml-2">{description}</span>
          </div>
        </div>
        {locked ? (
          <span className="text-[9px] text-zinc-600 px-1.5 py-0.5 rounded bg-zinc-800/50">
            Always On
          </span>
        ) : (
          <Switch
            checked={enabled}
            onCheckedChange={onToggle}
          />
        )}
      </div>

      {enabled && (
        <div className="mt-2">
          <div className="flex items-center justify-between mb-1">
            <Label className="text-[10px] text-zinc-500">Target Loudness</Label>
            <span className="text-[10px] font-mono text-zinc-400">{lufs} LUFS</span>
          </div>
          <Slider
            value={[lufs]}
            onValueChange={([v]) => onLufsChange(v)}
            min={-50}
            max={0}
            step={1}
            className="w-full"
          />
          {/* Visual meter */}
          <div className="mt-1.5 h-1 rounded-full bg-zinc-800 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-300 ${
                color === "cyan" ? "bg-cyan-500/60" :
                color === "pink" ? "bg-pink-500/60" :
                color === "amber" ? "bg-amber-500/60" :
                "bg-teal-500/60"
              }`}
              style={{ width: `${meterWidth}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
