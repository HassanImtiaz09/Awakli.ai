import { trpc } from "@/lib/trpc";
import { motion } from "framer-motion";
import { useState, useEffect } from "react";
import { Loader2, Sparkles, CheckCircle, AlertCircle, Cpu } from "lucide-react";
import { toast } from "sonner";

const STAGES = [
  { key: "queued", label: "Queued", icon: "⏳" },
  { key: "preprocessing", label: "Pre-processing", icon: "🔧" },
  { key: "training", label: "Training", icon: "🧠" },
  { key: "validating", label: "Validating", icon: "✅" },
  { key: "complete", label: "Complete", icon: "🎉" },
] as const;

interface LoraTrainingCardProps {
  characterId: number;
  characterName: string;
  loraStatus: string | null;
  loraModelUrl: string | null;
  loraTriggerWord: string | null;
  onStatusChange: () => void;
}

export default function LoraTrainingCard({
  characterId,
  characterName,
  loraStatus,
  loraModelUrl,
  loraTriggerWord,
  onStatusChange,
}: LoraTrainingCardProps) {
  const [isTraining, setIsTraining] = useState(
    loraStatus === "queued" || loraStatus === "preprocessing" || loraStatus === "training" || loraStatus === "validating"
  );

  const trainMut = trpc.characters.trainLora.useMutation({
    onSuccess: () => {
      toast.success("LoRA training started!");
      setIsTraining(true);
      onStatusChange();
    },
    onError: () => toast.error("Failed to start training"),
  });

  const { data: statusData } = trpc.characters.loraStatus.useQuery(
    { characterId },
    {
      enabled: isTraining,
      refetchInterval: isTraining ? 3000 : false,
    }
  );

  useEffect(() => {
    if (statusData) {
      if (statusData.status === "ready" || statusData.status === "failed") {
        setIsTraining(false);
        onStatusChange();
      }
    }
  }, [statusData?.status]);

  const currentStageIndex = STAGES.findIndex(
    (s) => s.key === (statusData?.status || loraStatus)
  );
  const progress = statusData?.progress ?? (currentStageIndex >= 0 ? (currentStageIndex / (STAGES.length - 1)) * 100 : 0);

  const isComplete = loraStatus === "ready" || statusData?.status === "ready";
  const isFailed = loraStatus === "failed" || statusData?.status === "failed";
  const isActive = isTraining && !isComplete && !isFailed;

  return (
    <div className="bg-[var(--bg-elevated)] border border-white/10 rounded-xl p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Cpu className="w-4 h-4 text-token-cyan" />
          <h4 className="text-sm font-semibold text-white">LoRA Model</h4>
        </div>
        {isComplete && (
          <span className="flex items-center gap-1 text-xs text-green-400">
            <CheckCircle className="w-3 h-3" /> Trained
          </span>
        )}
        {isFailed && (
          <span className="flex items-center gap-1 text-xs text-red-400">
            <AlertCircle className="w-3 h-3" /> Failed
          </span>
        )}
      </div>

      {/* Progress Ring */}
      {isActive && (
        <div className="flex items-center gap-4">
          <div className="relative w-16 h-16 flex-shrink-0">
            <svg className="w-16 h-16 -rotate-90" viewBox="0 0 64 64">
              <circle
                cx="32" cy="32" r="28"
                fill="none"
                stroke="rgba(255,255,255,0.1)"
                strokeWidth="4"
              />
              <motion.circle
                cx="32" cy="32" r="28"
                fill="none"
                stroke="url(#lora-gradient)"
                strokeWidth="4"
                strokeLinecap="round"
                strokeDasharray={2 * Math.PI * 28}
                animate={{ strokeDashoffset: 2 * Math.PI * 28 * (1 - progress / 100) }}
                transition={{ duration: 0.5 }}
              />
              <defs>
                <linearGradient id="lora-gradient" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="var(--token-cyan)" />
                  <stop offset="100%" stopColor="var(--token-cyan)" />
                </linearGradient>
              </defs>
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-xs font-bold text-white">{Math.round(progress)}%</span>
            </div>
          </div>

          <div className="flex-1 space-y-2">
            {STAGES.map((stage, idx) => {
              const isCurrent = idx === currentStageIndex;
              const isDone = idx < currentStageIndex;
              return (
                <div
                  key={stage.key}
                  className={`flex items-center gap-2 text-xs transition-all ${
                    isCurrent
                      ? "text-token-cyan font-semibold"
                      : isDone
                      ? "text-green-400/70"
                      : "text-muted/40"
                  }`}
                >
                  <span className="w-4 text-center">
                    {isDone ? "✓" : isCurrent ? (
                      <Loader2 className="w-3 h-3 animate-spin inline" />
                    ) : stage.icon}
                  </span>
                  <span>{stage.label}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Complete state */}
      {isComplete && (
        <div className="space-y-2">
          {loraTriggerWord && (
            <div className="text-xs text-muted">
              Trigger word: <code className="px-1.5 py-0.5 rounded bg-white/10 text-token-cyan font-mono">{loraTriggerWord}</code>
            </div>
          )}
          <p className="text-xs text-muted/70">
            This LoRA model will be automatically used when generating panels featuring {characterName}.
          </p>
        </div>
      )}

      {/* Start training / Retrain button */}
      {!isActive && (
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => trainMut.mutate({ characterId })}
          disabled={trainMut.isPending}
          className="w-full py-2.5 rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-all bg-gradient-to-r from-token-violet/20 to-token-cyan/20 border border-white/10 text-white hover:border-token-cyan/30 disabled:opacity-50"
        >
          {trainMut.isPending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Sparkles className="w-4 h-4" />
          )}
          {isComplete ? "Retrain Model" : isFailed ? "Retry Training" : "Train LoRA Model"}
        </motion.button>
      )}
    </div>
  );
}
