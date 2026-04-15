import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Sparkles,
  Loader2,
  Trash2,
  RefreshCw,
  Check,
  X,
  AlertCircle,
  Mic,
  User,
  Zap,
} from "lucide-react";

interface SubjectLibraryProps {
  projectId: number;
  characters: Array<{
    id: number;
    name: string;
    referenceImages?: any;
    voiceId?: string | null;
    voiceCloneUrl?: string | null;
  }>;
}

const STATUS_LABELS: Record<string, { label: string; color: string; icon: typeof Loader2 }> = {
  pending: { label: "Pending", color: "text-muted-foreground", icon: Loader2 },
  creating_voice: { label: "Cloning Voice...", color: "text-blue-400", icon: Loader2 },
  voice_ready: { label: "Voice Ready", color: "text-cyan-400", icon: Check },
  creating_element: { label: "Creating Element...", color: "text-amber-400", icon: Loader2 },
  ready: { label: "Ready for Lip Sync", color: "text-green-400", icon: Check },
  failed: { label: "Failed", color: "text-red-400", icon: X },
};

export default function SubjectLibrary({ projectId, characters }: SubjectLibraryProps) {
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [selectedCharId, setSelectedCharId] = useState<number | null>(null);
  const [voiceAudioUrl, setVoiceAudioUrl] = useState("");
  const [frontalImageUrl, setFrontalImageUrl] = useState("");

  const elementsQuery = trpc.subjectLibrary.listElements.useQuery(
    { projectId },
    { refetchInterval: 5000 } // Poll for status updates
  );

  const createMutation = trpc.subjectLibrary.createElement.useMutation();
  const deleteMutation = trpc.subjectLibrary.deleteElement.useMutation();
  const retryMutation = trpc.subjectLibrary.retryElement.useMutation();

  const elements = elementsQuery.data ?? [];
  const elementCharIds = new Set(elements.map((e) => e.characterId));

  // Characters that don't have an element yet
  const availableChars = characters.filter((c) => !elementCharIds.has(c.id));

  const handleCreate = () => {
    if (!selectedCharId || !voiceAudioUrl) {
      toast.error("Please select a character and provide a voice audio URL");
      return;
    }

    createMutation.mutate(
      {
        projectId,
        characterId: selectedCharId,
        voiceAudioUrl,
        frontalImageUrl: frontalImageUrl || undefined,
      },
      {
        onSuccess: (data) => {
          toast.success(`Creating lip sync element for ${data.characterName}...`);
          setCreateDialogOpen(false);
          setSelectedCharId(null);
          setVoiceAudioUrl("");
          setFrontalImageUrl("");
          elementsQuery.refetch();
        },
        onError: (e) => toast.error(e.message),
      }
    );
  };

  const handleDelete = (elementId: number, characterName: string) => {
    if (!confirm(`Delete lip sync element for "${characterName}"? This cannot be undone.`)) return;
    deleteMutation.mutate(
      { elementId },
      {
        onSuccess: () => {
          toast.success(`Element for "${characterName}" deleted`);
          elementsQuery.refetch();
        },
        onError: (e) => toast.error(e.message),
      }
    );
  };

  const handleRetry = (elementId: number) => {
    retryMutation.mutate(
      { elementId },
      {
        onSuccess: () => {
          toast.success("Retrying element creation...");
          elementsQuery.refetch();
        },
        onError: (e) => toast.error(e.message),
      }
    );
  };

  const readyCount = elements.filter((e) => e.status === "ready").length;
  const processingCount = elements.filter((e) =>
    ["creating_voice", "voice_ready", "creating_element", "pending"].includes(e.status)
  ).length;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-amber-400" />
            Subject Library
            <Badge variant="secondary" className="text-[10px]">
              Native Lip Sync
            </Badge>
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Create character elements with voice binding for true lip-synced animation via Kling V3 Omni.
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => setCreateDialogOpen(true)}
          disabled={availableChars.length === 0}
        >
          <Zap className="h-3.5 w-3.5 mr-1" />
          Create Element
        </Button>
      </div>

      {/* Status Summary */}
      {elements.length > 0 && (
        <div className="flex gap-3 text-xs">
          <span className="text-green-400">{readyCount} ready</span>
          {processingCount > 0 && (
            <span className="text-amber-400">{processingCount} processing</span>
          )}
          <span className="text-muted-foreground">{characters.length} characters total</span>
        </div>
      )}

      {/* Elements List */}
      {elements.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-8 text-center">
            <Sparkles className="h-8 w-8 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">
              No character elements created yet.
            </p>
            <p className="text-xs text-muted-foreground/70 mt-1">
              Create elements to enable native lip sync in the animation pipeline.
              Each element requires a frontal reference image and a voice audio sample (5-30s).
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {elements.map((el) => {
            const statusInfo = STATUS_LABELS[el.status] ?? STATUS_LABELS.pending;
            const StatusIcon = statusInfo.icon;
            const isProcessing = ["creating_voice", "voice_ready", "creating_element", "pending"].includes(el.status);

            return (
              <Card key={el.id} className={`transition-colors ${
                el.status === "ready"
                  ? "border-green-500/30 bg-green-500/5"
                  : el.status === "failed"
                  ? "border-red-500/30 bg-red-500/5"
                  : isProcessing
                  ? "border-amber-500/20"
                  : ""
              }`}>
                <CardContent className="py-3 px-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {/* Character avatar */}
                      <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center overflow-hidden">
                        {el.characterImage ? (
                          <img
                            src={el.characterImage}
                            alt={el.characterName}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <User className="h-5 w-5 text-muted-foreground" />
                        )}
                      </div>

                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">{el.characterName}</span>
                          <div className={`flex items-center gap-1 ${statusInfo.color}`}>
                            <StatusIcon className={`h-3 w-3 ${isProcessing ? "animate-spin" : ""}`} />
                            <span className="text-[11px]">{statusInfo.label}</span>
                          </div>
                        </div>

                        {el.status === "ready" && el.klingElementId && (
                          <p className="text-[10px] text-muted-foreground">
                            Element ID: {el.klingElementId} · Voice: {el.klingVoiceId ? "Bound" : "None"}
                          </p>
                        )}

                        {el.status === "failed" && el.errorMessage && (
                          <p className="text-[10px] text-red-400 flex items-center gap-1 mt-0.5">
                            <AlertCircle className="h-3 w-3" />
                            {el.errorMessage.slice(0, 80)}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1">
                      {el.status === "failed" && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleRetry(el.id)}
                          disabled={retryMutation.isPending}
                        >
                          <RefreshCw className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-red-400 hover:text-red-300"
                        onClick={() => handleDelete(el.id, el.characterName)}
                        disabled={deleteMutation.isPending}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create Element Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-amber-400" />
              Create Lip Sync Element
            </DialogTitle>
            <DialogDescription>
              Create a Kling Subject Library element for native lip-synced animation.
              This clones the character's voice and creates a persistent element that
              the pipeline uses for true lip sync.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Character Selection */}
            <div className="space-y-2">
              <Label>Character</Label>
              {availableChars.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  All characters already have elements. Delete an existing element to recreate.
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {availableChars.map((char) => (
                    <Button
                      key={char.id}
                      variant={selectedCharId === char.id ? "default" : "outline"}
                      size="sm"
                      onClick={() => {
                        setSelectedCharId(char.id);
                        // Auto-fill frontal image from character reference images
                        const refs = char.referenceImages;
                        if (Array.isArray(refs) && refs.length > 0) {
                          setFrontalImageUrl(refs[0] as string);
                        }
                        // Auto-fill voice URL from character voice clone
                        if (char.voiceCloneUrl) {
                          setVoiceAudioUrl(char.voiceCloneUrl);
                        }
                      }}
                    >
                      {char.name}
                    </Button>
                  ))}
                </div>
              )}
            </div>

            {/* Voice Audio URL */}
            <div className="space-y-2">
              <Label className="flex items-center gap-1">
                <Mic className="h-3.5 w-3.5" />
                Voice Audio Sample URL
              </Label>
              <Input
                placeholder="https://... (MP3/WAV, 5-30 seconds)"
                value={voiceAudioUrl}
                onChange={(e) => setVoiceAudioUrl(e.target.value)}
              />
              <p className="text-[10px] text-muted-foreground">
                A clear voice recording of the character speaking. 5-30 seconds, MP3 or WAV format.
                {selectedCharId && characters.find(c => c.id === selectedCharId)?.voiceCloneUrl && (
                  <span className="text-green-400 ml-1">(Auto-filled from voice casting)</span>
                )}
              </p>
            </div>

            {/* Frontal Image URL (optional override) */}
            <div className="space-y-2">
              <Label>Frontal Reference Image URL (optional)</Label>
              <Input
                placeholder="Auto-filled from character reference images"
                value={frontalImageUrl}
                onChange={(e) => setFrontalImageUrl(e.target.value)}
              />
              <p className="text-[10px] text-muted-foreground">
                A clear frontal face image. Auto-filled from the character's first reference image.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreate}
              disabled={!selectedCharId || !voiceAudioUrl || createMutation.isPending}
            >
              {createMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 mr-1" />
                  Create Element
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
