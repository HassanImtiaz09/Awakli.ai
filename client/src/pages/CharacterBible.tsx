/**
 * P26 Character Bible Review & Lock UI
 *
 * Shows the extracted character registry for a project:
 *   - Character cards with visual attributes
 *   - Identity mode indicator (None / IP-Adapter / LoRA)
 *   - Lock/Unlock affordance to switch identity modes
 *   - Inline attribute editing
 *   - QA pass rate overview
 *   - Registry version history
 */

import { useState } from "react";
import { useRoute, Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ArrowLeft,
  Lock,
  Unlock,
  Pencil,
  Shield,
  ShieldCheck,
  ShieldAlert,
  User,
  Ruler,
  Palette,
  Eye,
  Sparkles,
  History,
  CheckCircle2,
  XCircle,
  AlertTriangle,
} from "lucide-react";

interface CharacterAttributes {
  heightCm: number;
  build: string;
  ageBracket: string;
  hairColor: string;
  hairStyle: string;
  eyeColor: string;
  skinTone: string;
  distinguishingFeatures: string[];
  defaultOutfit: string;
}

interface CharacterIdentity {
  identityMode: string;
  referenceSheetUrl?: string;
  ipAdapterRefUrl?: string;
  ipAdapterWeight?: number;
  loraUrl?: string;
  loraTriggerWord?: string;
  loraWeight?: number;
  loraTrainingStatus?: string;
  referenceSheetSeed?: number;
}

interface CharacterEntry {
  characterId: string;
  name: string;
  role: string;
  attributes: CharacterAttributes;
  identity: CharacterIdentity;
  inferredFields?: string[];
}

interface CharacterRegistry {
  characters: CharacterEntry[];
  tallestHeightCm: number;
  artStyle: string;
  genre: string;
}

export default function CharacterBible() {
  const [, params] = useRoute("/create/:projectId/character-bible");
  const projectId = Number(params?.projectId);
  const { user } = useAuth();

  const [editingChar, setEditingChar] = useState<CharacterEntry | null>(null);
  const [editValues, setEditValues] = useState<Partial<CharacterAttributes>>({});
  const [lockDialogChar, setLockDialogChar] = useState<CharacterEntry | null>(null);
  const [selectedMode, setSelectedMode] = useState<string>("ip_adapter");

  const registryQuery = trpc.characterBible.getRegistry.useQuery(
    { projectId },
    { enabled: !!projectId && !!user },
  );

  const historyQuery = trpc.characterBible.getRegistryHistory.useQuery(
    { projectId },
    { enabled: !!projectId && !!user },
  );

  const qaQuery = trpc.characterBible.getQaResultsForProject.useQuery(
    { projectId },
    { enabled: !!projectId && !!user },
  );

  const pipelineQuery = trpc.characterBible.getPipelineState.useQuery(
    { projectId },
    { enabled: !!projectId && !!user },
  );

  const utils = trpc.useUtils();

  const updateCharMutation = trpc.characterBible.updateCharacter.useMutation({
    onSuccess: () => {
      toast.success("Character updated");
      utils.characterBible.getRegistry.invalidate({ projectId });
      setEditingChar(null);
    },
    onError: (err) => toast.error(err.message),
  });

  const lockMutation = trpc.characterBible.lockCharacter.useMutation({
    onSuccess: (data) => {
      toast.success(`Identity mode set to ${data.identityMode}`);
      utils.characterBible.getRegistry.invalidate({ projectId });
      setLockDialogChar(null);
    },
    onError: (err) => toast.error(err.message),
  });

  const registry = registryQuery.data?.registry as CharacterRegistry | undefined;

  if (registryQuery.isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Loading character bible...</div>
      </div>
    );
  }

  if (!registry || !registry.characters?.length) {
    return (
      <div className="min-h-screen bg-background p-6">
        <Link href={`/create/${projectId}`}>
          <Button variant="ghost" size="sm" className="mb-4">
            <ArrowLeft className="w-4 h-4 mr-2" /> Back to Project
          </Button>
        </Link>
        <Card className="max-w-lg mx-auto">
          <CardContent className="py-12 text-center">
            <User className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
            <h2 className="text-xl font-semibold mb-2">No Character Bible Yet</h2>
            <p className="text-muted-foreground">
              Generate a manga chapter first. The character bible is automatically
              created during panel generation.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // QA stats
  const qaResults = qaQuery.data || [];
  const passCount = qaResults.filter((r: any) => r.overallVerdict === "pass").length;
  const softFailCount = qaResults.filter((r: any) => r.overallVerdict === "soft_fail").length;
  const hardFailCount = qaResults.filter((r: any) => r.overallVerdict === "hard_fail").length;
  const totalQa = qaResults.length;
  const passRate = totalQa > 0 ? Math.round((passCount / totalQa) * 100) : 0;

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-6xl mx-auto p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Link href={`/create/${projectId}`}>
              <Button variant="ghost" size="sm">
                <ArrowLeft className="w-4 h-4 mr-2" /> Back
              </Button>
            </Link>
            <div>
              <h1 className="text-2xl font-bold">Character Bible</h1>
              <p className="text-sm text-muted-foreground">
                {registry.characters.length} characters · {registry.artStyle} · v{registryQuery.data?.version}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {totalQa > 0 && (
              <Badge variant={passRate >= 80 ? "default" : passRate >= 50 ? "secondary" : "destructive"}>
                QA: {passRate}% pass
              </Badge>
            )}
          </div>
        </div>

        <Tabs defaultValue="characters">
          <TabsList className="mb-4">
            <TabsTrigger value="characters">Characters</TabsTrigger>
            <TabsTrigger value="qa">QA Results</TabsTrigger>
            <TabsTrigger value="history">Version History</TabsTrigger>
            <TabsTrigger value="pipeline">Pipeline</TabsTrigger>
          </TabsList>

          {/* ─── Characters Tab ─────────────────────────────────────── */}
          <TabsContent value="characters">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {registry.characters.map((char) => (
                <CharacterCard
                  key={char.characterId}
                  character={char}
                  tallestHeight={registry.tallestHeightCm}
                  onEdit={() => {
                    setEditingChar(char);
                    setEditValues({ ...char.attributes });
                  }}
                  onLock={() => {
                    setLockDialogChar(char);
                    setSelectedMode(char.identity.identityMode || "ip_adapter");
                  }}
                />
              ))}
            </div>
          </TabsContent>

          {/* ─── QA Results Tab ─────────────────────────────────────── */}
          <TabsContent value="qa">
            <div className="space-y-4">
              {/* Summary */}
              <div className="grid grid-cols-3 gap-4">
                <Card>
                  <CardContent className="py-4 text-center">
                    <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-green-500" />
                    <div className="text-2xl font-bold">{passCount}</div>
                    <div className="text-sm text-muted-foreground">Passed</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="py-4 text-center">
                    <AlertTriangle className="w-8 h-8 mx-auto mb-2 text-yellow-500" />
                    <div className="text-2xl font-bold">{softFailCount}</div>
                    <div className="text-sm text-muted-foreground">Soft Fail</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="py-4 text-center">
                    <XCircle className="w-8 h-8 mx-auto mb-2 text-red-500" />
                    <div className="text-2xl font-bold">{hardFailCount}</div>
                    <div className="text-sm text-muted-foreground">Hard Fail</div>
                  </CardContent>
                </Card>
              </div>

              {/* Individual results */}
              {qaResults.length === 0 ? (
                <Card>
                  <CardContent className="py-8 text-center text-muted-foreground">
                    No QA results yet. Generate panels to see quality checks.
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-2">
                  {qaResults.slice(0, 20).map((qa: any) => (
                    <Card key={qa.id} className="p-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <VerdictIcon verdict={qa.overallVerdict} />
                          <div>
                            <span className="font-medium">Panel #{qa.panelId}</span>
                            <span className="text-sm text-muted-foreground ml-2">
                              Face: {qa.faceSimilarityScore?.toFixed(2)} · 
                              Height: {qa.heightRatioDeviation?.toFixed(1)}% · 
                              Style: {qa.styleCoherenceScore?.toFixed(2)}
                            </span>
                          </div>
                        </div>
                        <Badge variant={
                          qa.overallVerdict === "pass" ? "default" :
                          qa.overallVerdict === "soft_fail" ? "secondary" : "destructive"
                        }>
                          {qa.overallVerdict}
                        </Badge>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </TabsContent>

          {/* ─── Version History Tab ────────────────────────────────── */}
          <TabsContent value="history">
            {historyQuery.data?.length ? (
              <div className="space-y-2">
                {historyQuery.data.map((h: any) => (
                  <Card key={h.id} className="p-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <History className="w-4 h-4 text-muted-foreground" />
                        <div>
                          <span className="font-medium">Version {h.version}</span>
                          <span className="text-sm text-muted-foreground ml-2">
                            {h.characterCount} characters
                          </span>
                        </div>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {h.createdAt ? new Date(h.createdAt).toLocaleString() : ""}
                      </span>
                    </div>
                  </Card>
                ))}
              </div>
            ) : (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground">
                  No version history yet.
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* ─── Pipeline Tab ──────────────────────────────────────── */}
          <TabsContent value="pipeline">
            <PipelineStateView state={pipelineQuery.data} />
          </TabsContent>
        </Tabs>

        {/* ─── Edit Character Dialog ─────────────────────────────── */}
        <Dialog open={!!editingChar} onOpenChange={(o) => !o && setEditingChar(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Edit {editingChar?.name}</DialogTitle>
            </DialogHeader>
            {editingChar && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Height (cm)</Label>
                    <Input
                      type="number"
                      value={editValues.heightCm ?? ""}
                      onChange={(e) =>
                        setEditValues((v) => ({ ...v, heightCm: Number(e.target.value) }))
                      }
                    />
                  </div>
                  <div>
                    <Label>Build</Label>
                    <Select
                      value={editValues.build ?? "average"}
                      onValueChange={(v) => setEditValues((prev) => ({ ...prev, build: v }))}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="slim">Slim</SelectItem>
                        <SelectItem value="average">Average</SelectItem>
                        <SelectItem value="athletic">Athletic</SelectItem>
                        <SelectItem value="muscular">Muscular</SelectItem>
                        <SelectItem value="heavyset">Heavyset</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Hair Color</Label>
                    <Input
                      value={editValues.hairColor ?? ""}
                      onChange={(e) =>
                        setEditValues((v) => ({ ...v, hairColor: e.target.value }))
                      }
                    />
                  </div>
                  <div>
                    <Label>Hair Style</Label>
                    <Input
                      value={editValues.hairStyle ?? ""}
                      onChange={(e) =>
                        setEditValues((v) => ({ ...v, hairStyle: e.target.value }))
                      }
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Eye Color</Label>
                    <Input
                      value={editValues.eyeColor ?? ""}
                      onChange={(e) =>
                        setEditValues((v) => ({ ...v, eyeColor: e.target.value }))
                      }
                    />
                  </div>
                  <div>
                    <Label>Skin Tone</Label>
                    <Input
                      value={editValues.skinTone ?? ""}
                      onChange={(e) =>
                        setEditValues((v) => ({ ...v, skinTone: e.target.value }))
                      }
                    />
                  </div>
                </div>
                <div>
                  <Label>Default Outfit</Label>
                  <Input
                    value={editValues.defaultOutfit ?? ""}
                    onChange={(e) =>
                      setEditValues((v) => ({ ...v, defaultOutfit: e.target.value }))
                    }
                  />
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditingChar(null)}>
                Cancel
              </Button>
              <Button
                onClick={() => {
                  if (!editingChar) return;
                  updateCharMutation.mutate({
                    projectId,
                    characterId: editingChar.characterId,
                    updates: editValues as any,
                  });
                }}
                disabled={updateCharMutation.isPending}
              >
                {updateCharMutation.isPending ? "Saving..." : "Save Changes"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ─── Lock Character Dialog ─────────────────────────────── */}
        <Dialog open={!!lockDialogChar} onOpenChange={(o) => !o && setLockDialogChar(null)}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Lock {lockDialogChar?.name}'s Identity</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground mb-3">
              Choose how this character's appearance is enforced during generation.
            </p>
            <Select value={selectedMode} onValueChange={setSelectedMode}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None (prompt only)</SelectItem>
                <SelectItem value="ip_adapter">IP-Adapter (reference image)</SelectItem>
                <SelectItem value="lora">LoRA (trained model)</SelectItem>
              </SelectContent>
            </Select>
            <div className="mt-2 text-xs text-muted-foreground">
              {selectedMode === "none" && "Character appearance relies solely on text prompts. Lowest consistency."}
              {selectedMode === "ip_adapter" && "Uses a reference face image to guide generation. Good consistency for free tier."}
              {selectedMode === "lora" && "Uses a trained LoRA model for strongest identity lock. Requires LoRA training."}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setLockDialogChar(null)}>
                Cancel
              </Button>
              <Button
                onClick={() => {
                  if (!lockDialogChar) return;
                  lockMutation.mutate({
                    projectId,
                    characterId: lockDialogChar.characterId,
                    identityMode: selectedMode as "none" | "ip_adapter" | "lora",
                  });
                }}
                disabled={lockMutation.isPending}
              >
                {lockMutation.isPending ? "Locking..." : "Apply Lock"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}

// ─── Sub-Components ─────────────────────────────────────────────────────

function CharacterCard({
  character,
  tallestHeight,
  onEdit,
  onLock,
}: {
  character: CharacterEntry;
  tallestHeight: number;
  onEdit: () => void;
  onLock: () => void;
}) {
  const a = character.attributes;
  const identity = character.identity;
  const heightRatio = Math.round((a.heightCm / tallestHeight) * 100);

  const roleColors: Record<string, string> = {
    protagonist: "bg-amber-500/10 text-amber-600 border-amber-500/20",
    antagonist: "bg-red-500/10 text-red-600 border-red-500/20",
    supporting: "bg-blue-500/10 text-blue-600 border-blue-500/20",
    background: "bg-gray-500/10 text-gray-600 border-gray-500/20",
  };

  const identityIcons: Record<string, React.ReactNode> = {
    none: <Unlock className="w-4 h-4 text-muted-foreground" />,
    ip_adapter: <Shield className="w-4 h-4 text-blue-500" />,
    lora: <ShieldCheck className="w-4 h-4 text-green-500" />,
  };

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CardTitle className="text-lg">{character.name}</CardTitle>
            <Badge variant="outline" className={roleColors[character.role] || ""}>
              {character.role}
            </Badge>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onEdit}>
              <Pencil className="w-3.5 h-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onLock}>
              {identityIcons[identity.identityMode] || identityIcons.none}
            </Button>
          </div>
        </div>
        <CardDescription className="flex items-center gap-2 text-xs">
          {identityIcons[identity.identityMode] || identityIcons.none}
          <span className="capitalize">{identity.identityMode?.replace("_", " ") || "None"}</span>
          {identity.ipAdapterWeight && (
            <span className="text-muted-foreground">· weight {identity.ipAdapterWeight}</span>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Reference images */}
        {(identity.referenceSheetUrl || identity.ipAdapterRefUrl) && (
          <div className="flex gap-2">
            {identity.referenceSheetUrl && (
              <div className="w-20 h-20 rounded overflow-hidden border">
                <img
                  src={identity.referenceSheetUrl}
                  alt="Reference sheet"
                  className="w-full h-full object-cover"
                />
              </div>
            )}
            {identity.ipAdapterRefUrl && identity.ipAdapterRefUrl !== identity.referenceSheetUrl && (
              <div className="w-20 h-20 rounded overflow-hidden border">
                <img
                  src={identity.ipAdapterRefUrl}
                  alt="Face reference"
                  className="w-full h-full object-cover"
                />
              </div>
            )}
          </div>
        )}

        {/* Attributes grid */}
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
          <div className="flex items-center gap-1.5">
            <Ruler className="w-3.5 h-3.5 text-muted-foreground" />
            <span>{a.heightCm}cm</span>
            <span className="text-xs text-muted-foreground">({heightRatio}%)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <User className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="capitalize">{a.build} · {a.ageBracket.replace("_", " ")}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Palette className="w-3.5 h-3.5 text-muted-foreground" />
            <span>{a.hairColor} {a.hairStyle}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Eye className="w-3.5 h-3.5 text-muted-foreground" />
            <span>{a.eyeColor} eyes · {a.skinTone}</span>
          </div>
        </div>

        {/* Outfit */}
        <div className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Outfit:</span> {a.defaultOutfit}
        </div>

        {/* Distinguishing features */}
        {a.distinguishingFeatures.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {a.distinguishingFeatures.map((f, i) => (
              <Badge key={i} variant="secondary" className="text-xs">
                <Sparkles className="w-3 h-3 mr-1" />
                {f}
              </Badge>
            ))}
          </div>
        )}

        {/* Inferred fields indicator */}
        {character.inferredFields && character.inferredFields.length > 0 && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <ShieldAlert className="w-3 h-3" />
            <span>Inferred: {character.inferredFields.join(", ")}</span>
          </div>
        )}

        {/* Height bar */}
        <div className="relative h-2 bg-muted rounded-full overflow-hidden">
          <div
            className="absolute left-0 top-0 h-full bg-primary/60 rounded-full transition-all"
            style={{ width: `${heightRatio}%` }}
          />
        </div>
      </CardContent>
    </Card>
  );
}

function VerdictIcon({ verdict }: { verdict: string }) {
  if (verdict === "pass") return <CheckCircle2 className="w-5 h-5 text-green-500" />;
  if (verdict === "soft_fail") return <AlertTriangle className="w-5 h-5 text-yellow-500" />;
  return <XCircle className="w-5 h-5 text-red-500" />;
}

function PipelineStateView({ state }: { state: any }) {
  if (!state) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          No pipeline state available. Generate a chapter to see pipeline progress.
        </CardContent>
      </Card>
    );
  }

  const stages = [
    { key: "stage1_extraction", label: "Character Extraction", status: state.stage1_extraction },
    { key: "stage2_identity", label: "Identity Lock-in", status: state.stage2_identity },
    { key: "stage3_shotPlan", label: "Shot Planning", status: state.stage3_shotPlan },
    { key: "stage4_generation", label: "Panel Generation", status: state.stage4_generation },
    { key: "stage5_qa", label: "QA Gate", status: state.stage5_qa },
  ];

  const statusColors: Record<string, string> = {
    pending: "bg-muted text-muted-foreground",
    running: "bg-blue-500/10 text-blue-600 animate-pulse",
    completed: "bg-green-500/10 text-green-600",
    failed: "bg-red-500/10 text-red-600",
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-5 gap-2">
        {stages.map((s) => (
          <Card key={s.key} className={`p-3 text-center ${statusColors[s.status] || ""}`}>
            <div className="text-xs font-medium">{s.label}</div>
            <div className="text-xs mt-1 capitalize">{s.status}</div>
          </Card>
        ))}
      </div>

      <Card className="p-4">
        <div className="grid grid-cols-4 gap-4 text-center">
          <div>
            <div className="text-2xl font-bold">{state.totalPanels}</div>
            <div className="text-xs text-muted-foreground">Total Panels</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-green-600">{state.completedPanels}</div>
            <div className="text-xs text-muted-foreground">Passed QA</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-red-600">{state.failedPanels}</div>
            <div className="text-xs text-muted-foreground">Failed QA</div>
          </div>
          <div>
            <div className="text-2xl font-bold">{state.qaPassRate}%</div>
            <div className="text-xs text-muted-foreground">Pass Rate</div>
          </div>
        </div>
      </Card>
    </div>
  );
}
