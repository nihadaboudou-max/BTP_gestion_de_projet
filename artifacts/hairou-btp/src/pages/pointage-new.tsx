import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { AppLayout } from "@/components/layout";
import { useListProjects } from "@workspace/api-client-react";
import { formatFCFA } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import SignaturePad from "signature_pad";
import {
  Loader2, Save, ArrowLeft, RefreshCw, CheckCircle2, AlertTriangle,
  Clock, DollarSign, Users, ChevronDown, ChevronUp, Pen, Trash2,
  AlertCircle
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";

// ─── helpers ─────────────────────────────────────────────────────────────────

function apiFetch(path: string, opts?: RequestInit) {
  const token = localStorage.getItem("hairou_token");
  return fetch(path, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...opts?.headers,
    },
  }).then(async r => {
    if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d?.message || "Erreur"); }
    return r.json();
  });
}

function calcHoursNum(arrival: string, departure: string): number | null {
  if (!arrival || !departure) return null;
  const [ah, am] = arrival.split(":").map(Number);
  const [dh, dm] = departure.split(":").map(Number);
  const diff = (dh * 60 + dm) - (ah * 60 + am);
  return diff > 0 ? diff / 60 : null;
}

function formatHours(h: number | null): string {
  if (!h) return "—";
  const hrs = Math.floor(h);
  const mins = Math.round((h - hrs) * 60);
  return `${hrs}h${mins.toString().padStart(2, "0")}`;
}

function calcEntryAmount(e: WorkerState): number {
  if (e.status === "ABSENT") return 0;
  if (e.payMode === "PAR_TACHE") {
    return (e.taskAmount || 0) * ((e.taskProgressPct ?? 100) / 100);
  }
  const wage = e.dailyWage || 0;
  if (e.status === "DEMI_JOURNEE") return wage / 2;
  const hours = calcHoursNum(e.arrivalTime, e.departureTime);
  if (hours && hours > 0) return hours * (wage / 8);
  return wage;
}

// ─── Types ───────────────────────────────────────────────────────────────────

interface PersonnelRecord {
  id: number;
  name: string;
  trade: string;
  dailyWage: string | number;
  assignedToProject?: boolean;
  included: boolean;
}

interface WorkerState {
  personnelId: number;
  name: string;
  trade: string;
  status: "PRESENT" | "ABSENT" | "DEMI_JOURNEE";
  arrivalTime: string;
  arrivalSigned: boolean;
  arrivalSignedAt: string | null;
  departureTime: string;
  departureSigned: boolean;
  departureSignedAt: string | null;
  payMode: "PAR_JOUR" | "PAR_TACHE";
  dailyWage: number;
  taskId: number | null;
  taskAmount: number;
  taskProgressPct: number;
  notes: string;
  expanded: boolean;
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function PointageNew() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  const { data: projects } = useListProjects();

  const [projectId, setProjectId] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [workers, setWorkers] = useState<WorkerState[]>([]);
  const [personnel, setPersonnel] = useState<PersonnelRecord[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [loadingWorkers, setLoadingWorkers] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [chefSigned, setChefSigned] = useState(false);
  const [chefSignedAt, setChefSignedAt] = useState<string | null>(null);

  // Signature pads: { workerId_arrival, workerId_departure, chef }
  const padRefs = useRef<Record<string, SignaturePad>>({});
  const canvasRefs = useRef<Record<string, HTMLCanvasElement | null>>({});
  // Track which canvas element each pad is bound to (detect remounts)
  const padCanvasTracker = useRef<Record<string, HTMLCanvasElement>>({});

  // ─── Load workers when project changes ──────────────────────────────────────
  useEffect(() => {
    if (!projectId) { setWorkers([]); setPersonnel([]); return; }
    setLoadingWorkers(true);
    Promise.all([
      apiFetch(`/api/pointage/workers-for-project/${projectId}`),
      apiFetch(`/api/projects/${projectId}/tasks`),
    ]).then(([workerData, taskData]) => {
      setTasks(taskData || []);
      const list: PersonnelRecord[] = (workerData || []).map((w: any) => ({
        ...w,
        included: true,
      }));
      setPersonnel(list);
      const included = list.filter(p => p.included);
      setWorkers(included.map(p => ({
        personnelId: p.id,
        name: p.name,
        trade: p.trade || "",
        status: "PRESENT",
        arrivalTime: "07:30",
        arrivalSigned: false,
        arrivalSignedAt: null,
        departureTime: "17:00",
        departureSigned: false,
        departureSignedAt: null,
        payMode: "PAR_JOUR",
        dailyWage: parseFloat(String(p.dailyWage || 0)),
        taskId: null,
        taskAmount: 0,
        taskProgressPct: 100,
        notes: "",
        expanded: true,
      })));
    }).catch(() => {
      toast({ title: "Impossible de charger les ouvriers", variant: "destructive" });
    }).finally(() => setLoadingWorkers(false));
  }, [projectId]);

  // ─── Re-init signature pads whenever workers change ─────────────────────────
  // Use a small timeout to ensure canvases are laid out and have real dimensions
  useEffect(() => {
    const initPad = (key: string, opts: object) => {
      const canvas = canvasRefs.current[key];
      if (!canvas) return;

      // Destroy stale pad if canvas element was remounted
      if (padRefs.current[key] && padCanvasTracker.current[key] !== canvas) {
        padRefs.current[key].off();
        delete padRefs.current[key];
        delete padCanvasTracker.current[key];
      }

      // Resize canvas buffer to actual CSS display dimensions (prevents coordinate offset)
      const rect = canvas.getBoundingClientRect();
      const w = Math.round(rect.width) || canvas.offsetWidth || 350;
      const h = Math.round(rect.height) || canvas.offsetHeight || 100;
      if (w > 0 && h > 0) {
        canvas.width = w;
        canvas.height = h;
      }

      if (!padRefs.current[key]) {
        try {
          const pad = new SignaturePad(canvas, { backgroundColor: "rgb(255,255,255)", ...opts });
          padRefs.current[key] = pad;
          padCanvasTracker.current[key] = canvas;
        } catch {}
      }
    };

    const timer = setTimeout(() => {
      workers.forEach(w => {
        initPad(`arr_${w.personnelId}`, { penColor: "rgb(15,45,76)", minWidth: 1, maxWidth: 2.5 });
        initPad(`dep_${w.personnelId}`, { penColor: "rgb(20,83,45)", minWidth: 1, maxWidth: 2.5 });
      });
      initPad("chef", { penColor: "rgb(15,45,76)", minWidth: 1.5, maxWidth: 3 });
    }, 80);

    return () => clearTimeout(timer);
  }, [workers.map(w => w.personnelId).join(","), workers.map(w => w.expanded).join(","), workers.map(w => w.status).join(",")]);

  const updateWorker = useCallback((idx: number, field: string, value: any) => {
    setWorkers(prev => prev.map((w, i) => i === idx ? { ...w, [field]: value } : w));
  }, []);

  const toggleExpand = (idx: number) => updateWorker(idx, "expanded", !workers[idx].expanded);

  const validateSig = (key: string, onSuccess: (dataUrl: string, timestamp: string) => void) => {
    const pad = padRefs.current[key];
    if (!pad || pad.isEmpty()) {
      toast({ title: "Veuillez signer d'abord", variant: "destructive" });
      return;
    }
    const dataUrl = pad.toDataURL("image/png");
    const ts = new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
    onSuccess(dataUrl, ts);
  };

  const clearSig = (key: string) => {
    padRefs.current[key]?.clear();
  };

  const handleSubmit = async () => {
    if (!projectId || !date) {
      toast({ title: "Choisissez un projet et une date", variant: "destructive" });
      return;
    }
    if (workers.length === 0) {
      toast({ title: "Aucun ouvrier sélectionné", variant: "destructive" });
      return;
    }

    // Get chef signature
    const chefPad = padRefs.current["chef"];
    let chefSigData: string | null = null;
    if (chefPad && !chefPad.isEmpty()) {
      chefSigData = chefPad.toDataURL("image/png");
    }

    setIsSaving(true);
    try {
      // Collect worker signatures
      const entries = workers.map(w => {
        const arrKey = `arr_${w.personnelId}`;
        const depKey = `dep_${w.personnelId}`;
        const arrPad = padRefs.current[arrKey];
        const depPad = padRefs.current[depKey];
        const hours = w.status !== "ABSENT" ? calcHoursNum(w.arrivalTime, w.departureTime) : null;
        const overtime = hours && hours > 8 ? hours - 8 : 0;
        const amount = calcEntryAmount(w);

        return {
          personnelId: w.personnelId,
          status: w.status,
          arrivalTime: w.status !== "ABSENT" ? w.arrivalTime : null,
          arrivalSignature: (w.status !== "ABSENT" && arrPad && !arrPad.isEmpty()) ? arrPad.toDataURL("image/png") : null,
          arrivalSignedAt: w.arrivalSignedAt ? new Date().toISOString() : null,
          departureTime: w.status !== "ABSENT" ? w.departureTime : null,
          departureSignature: (w.status !== "ABSENT" && depPad && !depPad.isEmpty()) ? depPad.toDataURL("image/png") : null,
          departureSignedAt: w.departureSignedAt ? new Date().toISOString() : null,
          hoursWorked: hours ?? null,
          overtimeHours: overtime,
          payMode: w.payMode,
          dailyWage: w.payMode === "PAR_JOUR" ? w.dailyWage : null,
          taskId: w.payMode === "PAR_TACHE" ? w.taskId : null,
          taskAmount: w.payMode === "PAR_TACHE" ? w.taskAmount : null,
          taskProgressPct: w.payMode === "PAR_TACHE" ? w.taskProgressPct : 100,
          amountDue: amount,
          notes: w.notes || null,
        };
      });

      const totalAmountDue = entries.reduce((s, e) => s + (e.amountDue || 0), 0);

      const result = await apiFetch("/api/pointage", {
        method: "POST",
        body: JSON.stringify({
          projectId: parseInt(projectId),
          date,
          chefSignature: chefSigData,
          chefSignedAt: chefSigData ? new Date().toISOString() : null,
          entries,
          totalAmountDue,
        }),
      });

      queryClient.invalidateQueries({ queryKey: ["/api/pointage"] });
      toast({
        title: "Fiche de pointage créée",
        description: `${workers.filter(w => w.status !== "ABSENT").length} présent(s) — ${formatFCFA(totalAmountDue)}`,
      });
      navigate(`/pointage/${result.id}`);
    } catch (err: any) {
      toast({ title: "Erreur", description: err.message, variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  // Summary totals
  const totalDue = workers.reduce((s, w) => s + calcEntryAmount(w), 0);
  const presentCount = workers.filter(w => w.status !== "ABSENT").length;
  const absentCount = workers.filter(w => w.status === "ABSENT").length;

  const allUnassigned = personnel.length > 0 && personnel.every(p => !p.assignedToProject);

  return (
    <AppLayout title="Nouveau Pointage">
      <div className="max-w-4xl mx-auto space-y-6 pb-20">

        {/* Back button */}
        <Button variant="ghost" onClick={() => navigate("/pointage")} className="text-muted-foreground -ml-2">
          <ArrowLeft className="w-4 h-4 mr-1.5" />
          Retour aux fiches
        </Button>

        {/* Step 1: Project + Date */}
        <div className="bg-white rounded-2xl border border-border/50 shadow-sm p-6">
          <h2 className="text-lg font-bold text-foreground mb-4 flex items-center gap-2">
            <span className="w-7 h-7 rounded-full bg-primary text-white text-sm flex items-center justify-center font-bold">1</span>
            Chantier et date
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Projet / Chantier *</Label>
              <Select value={projectId} onValueChange={setProjectId}>
                <SelectTrigger className="rounded-xl h-11">
                  <SelectValue placeholder="Sélectionner un chantier..." />
                </SelectTrigger>
                <SelectContent>
                  {(projects as any[])?.map((p: any) => (
                    <SelectItem key={p.id} value={p.id.toString()}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Date du pointage *</Label>
              <Input
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
                className="rounded-xl h-11"
              />
            </div>
          </div>
          <div className="mt-3 text-sm text-muted-foreground">
            Chef responsable : <span className="font-semibold text-foreground">{user?.name}</span>
          </div>
        </div>

        {/* Loading */}
        {loadingWorkers && (
          <div className="flex items-center justify-center py-12 text-muted-foreground gap-3">
            <Loader2 className="w-5 h-5 animate-spin" />
            Chargement des ouvriers du chantier...
          </div>
        )}

        {/* No project */}
        {!projectId && !loadingWorkers && (
          <div className="flex flex-col items-center py-12 text-center text-muted-foreground bg-muted/20 rounded-2xl border border-dashed border-border">
            <Users className="w-12 h-12 mb-3 opacity-30" />
            <p className="font-medium">Sélectionnez un chantier pour commencer le pointage</p>
          </div>
        )}

        {/* Unassigned warning */}
        {allUnassigned && !loadingWorkers && (
          <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
            <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Aucun ouvrier assigné à ce chantier</p>
              <p className="mt-0.5">Voici tout le personnel actif. Décochez ceux qui ne participent pas à ce chantier.</p>
            </div>
          </div>
        )}

        {/* Personnel inclusion list (shown when fallback) */}
        {allUnassigned && personnel.length > 0 && !loadingWorkers && (
          <div className="bg-white rounded-2xl border border-border/50 shadow-sm p-5">
            <h3 className="font-semibold mb-3 text-sm text-muted-foreground uppercase tracking-wider">Personnel à inclure dans cette fiche</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {personnel.map((p, idx) => {
                const isIncluded = workers.some(w => w.personnelId === p.id);
                return (
                  <label key={p.id} className={`flex items-center gap-2 p-3 rounded-xl border cursor-pointer transition-all ${isIncluded ? "border-primary bg-primary/5" : "border-border/50 hover:bg-muted/30"}`}>
                    <input
                      type="checkbox"
                      checked={isIncluded}
                      onChange={e => {
                        if (e.target.checked) {
                          setWorkers(prev => [...prev, {
                            personnelId: p.id,
                            name: p.name,
                            trade: p.trade || "",
                            status: "PRESENT",
                            arrivalTime: "07:30",
                            arrivalSigned: false,
                            arrivalSignedAt: null,
                            departureTime: "17:00",
                            departureSigned: false,
                            departureSignedAt: null,
                            payMode: "PAR_JOUR",
                            dailyWage: parseFloat(String(p.dailyWage || 0)),
                            taskId: null,
                            taskAmount: 0,
                            taskProgressPct: 100,
                            notes: "",
                            expanded: true,
                          }]);
                        } else {
                          setWorkers(prev => prev.filter(w => w.personnelId !== p.id));
                        }
                      }}
                      className="w-4 h-4 rounded accent-primary"
                    />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold truncate">{p.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{p.trade}</p>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>
        )}

        {/* Step 2: Worker cards */}
        {workers.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
                <span className="w-7 h-7 rounded-full bg-primary text-white text-sm flex items-center justify-center font-bold">2</span>
                Présences ({workers.length} ouvrier{workers.length > 1 ? "s" : ""})
              </h2>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setWorkers(prev => prev.map(w => ({ ...w, status: "PRESENT" })))}
                  className="h-8 text-xs rounded-xl text-green-700 border-green-200 hover:bg-green-50">
                  Tous présents
                </Button>
                <Button size="sm" variant="outline" onClick={() => setWorkers(prev => prev.map(w => ({ ...w, status: "ABSENT" })))}
                  className="h-8 text-xs rounded-xl text-red-600 border-red-200 hover:bg-red-50">
                  Tous absents
                </Button>
              </div>
            </div>

            {workers.map((w, idx) => (
              <WorkerCard
                key={w.personnelId}
                worker={w}
                index={idx}
                tasks={tasks}
                onChange={(field, value) => updateWorker(idx, field, value)}
                onToggle={() => toggleExpand(idx)}
                canvasRefs={canvasRefs}
                padRefs={padRefs}
                onValidateSig={validateSig}
                onClearSig={clearSig}
              />
            ))}
          </div>
        )}

        {/* Step 3: Summary table */}
        {workers.length > 0 && (
          <div className="bg-white rounded-2xl border border-border/50 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-border/50 flex items-center gap-2">
              <span className="w-7 h-7 rounded-full bg-primary text-white text-sm flex items-center justify-center font-bold">3</span>
              <h2 className="text-lg font-bold text-foreground">Récapitulatif</h2>
              <div className="ml-auto flex items-center gap-3 text-sm">
                <span className="text-green-700 font-medium">{presentCount} présent{presentCount > 1 ? "s" : ""}</span>
                {absentCount > 0 && <span className="text-red-600 font-medium">{absentCount} absent{absentCount > 1 ? "s" : ""}</span>}
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/30 text-muted-foreground text-xs uppercase font-semibold">
                  <tr>
                    <th className="px-4 py-3 text-left">Ouvrier</th>
                    <th className="px-4 py-3 text-center">Arrivée</th>
                    <th className="px-4 py-3 text-center">Départ</th>
                    <th className="px-4 py-3 text-center">Heures</th>
                    <th className="px-4 py-3 text-center">Statut</th>
                    <th className="px-4 py-3 text-right">Montant</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/30">
                  {workers.map(w => {
                    const hours = w.status !== "ABSENT" ? calcHoursNum(w.arrivalTime, w.departureTime) : null;
                    const amount = calcEntryAmount(w);
                    return (
                      <tr key={w.personnelId} className={w.status === "ABSENT" ? "opacity-50" : ""}>
                        <td className="px-4 py-3 font-medium">{w.name}</td>
                        <td className="px-4 py-3 text-center text-muted-foreground">{w.status !== "ABSENT" ? w.arrivalTime : "—"}</td>
                        <td className="px-4 py-3 text-center text-muted-foreground">{w.status !== "ABSENT" ? w.departureTime : "—"}</td>
                        <td className="px-4 py-3 text-center">{formatHours(hours)}</td>
                        <td className="px-4 py-3 text-center">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                            w.status === "PRESENT" ? "bg-green-100 text-green-700" :
                            w.status === "ABSENT" ? "bg-red-100 text-red-700" :
                            "bg-yellow-100 text-yellow-700"
                          }`}>
                            {w.status === "PRESENT" ? "Présent" : w.status === "ABSENT" ? "Absent" : "Demi-j."}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right font-bold text-foreground">{formatFCFA(amount)}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="bg-primary/5 font-bold">
                  <tr>
                    <td colSpan={5} className="px-4 py-3 text-right text-foreground">TOTAL JOURNÉE :</td>
                    <td className="px-4 py-3 text-right text-primary text-base">{formatFCFA(totalDue)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}

        {/* Step 4: Chef signature */}
        {workers.length > 0 && (
          <div className="bg-white rounded-2xl border border-border/50 shadow-sm p-6">
            <h2 className="text-lg font-bold text-foreground mb-4 flex items-center gap-2">
              <span className="w-7 h-7 rounded-full bg-primary text-white text-sm flex items-center justify-center font-bold">4</span>
              Signature du Chef de Chantier
            </h2>
            <p className="text-sm text-muted-foreground mb-4">
              Signez ici pour valider la fiche et la soumettre à l'administrateur.
            </p>

            <div className="border-2 border-primary/30 rounded-xl overflow-hidden bg-white">
              <canvas
                ref={el => { canvasRefs.current["chef"] = el; }}
                className="w-full touch-none cursor-crosshair block"
                style={{ touchAction: "none", height: "130px", display: "block" }}
              />
            </div>

            <div className="flex items-center gap-3 mt-3">
              <Button
                size="sm"
                variant="outline"
                onClick={() => { clearSig("chef"); setChefSigned(false); setChefSignedAt(null); }}
                className="rounded-xl text-muted-foreground"
              >
                <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                Effacer
              </Button>
              <Button
                size="sm"
                onClick={() => validateSig("chef", (_, ts) => { setChefSigned(true); setChefSignedAt(ts); })}
                className="rounded-xl bg-primary text-white"
              >
                <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
                Valider ma signature
              </Button>
              {chefSigned && (
                <span className="text-xs text-green-700 font-medium flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Signé à {chefSignedAt}
                </span>
              )}
            </div>
          </div>
        )}

        {/* Submit bar */}
        {workers.length > 0 && (
          <div className="sticky bottom-0 bg-white/95 backdrop-blur border-t border-border/50 p-4 rounded-t-2xl shadow-lg -mx-4 sm:-mx-6">
            <div className="flex items-center justify-between gap-4 max-w-4xl mx-auto">
              <div className="text-sm">
                <p className="font-bold text-lg text-primary">{formatFCFA(totalDue)}</p>
                <p className="text-muted-foreground text-xs">{presentCount} présent(s) · {absentCount} absent(s)</p>
              </div>
              <div className="flex gap-3">
                <Button variant="outline" onClick={() => navigate("/pointage")} className="rounded-xl">
                  Annuler
                </Button>
                <Button
                  onClick={handleSubmit}
                  disabled={isSaving || !projectId}
                  className="rounded-xl bg-secondary hover:bg-secondary/90 text-white shadow-lg shadow-secondary/20 px-6"
                >
                  {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                  Créer et soumettre la fiche
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}

// ─── WorkerCard ───────────────────────────────────────────────────────────────

interface WorkerCardProps {
  worker: WorkerState;
  index: number;
  tasks: any[];
  onChange: (field: string, value: any) => void;
  onToggle: () => void;
  canvasRefs: React.MutableRefObject<Record<string, HTMLCanvasElement | null>>;
  padRefs: React.MutableRefObject<Record<string, SignaturePad>>;
  onValidateSig: (key: string, cb: (url: string, ts: string) => void) => void;
  onClearSig: (key: string) => void;
}

function WorkerCard({ worker: w, index, tasks, onChange, onToggle, canvasRefs, padRefs, onValidateSig, onClearSig }: WorkerCardProps) {
  const arrKey = `arr_${w.personnelId}`;
  const depKey = `dep_${w.personnelId}`;

  const hours = w.status !== "ABSENT" ? calcHoursNum(w.arrivalTime, w.departureTime) : null;
  const overtime = hours && hours > 8 ? hours - 8 : 0;
  const lateMinutes = w.arrivalTime > "08:00" && w.status !== "ABSENT"
    ? (() => {
        const [ah, am] = w.arrivalTime.split(":").map(Number);
        return (ah * 60 + am) - (8 * 60);
      })() : 0;
  const amount = calcEntryAmount(w);
  const suggestDemiJournee = hours !== null && hours < 4 && w.status === "PRESENT";

  return (
    <div className={`bg-white rounded-2xl border shadow-sm overflow-hidden transition-all ${
      w.status === "ABSENT" ? "border-red-200 opacity-75" :
      w.status === "DEMI_JOURNEE" ? "border-yellow-200" :
      "border-border/50"
    }`}>
      {/* Header row */}
      <div
        className="flex items-center gap-3 px-5 py-4 cursor-pointer hover:bg-muted/10 transition-colors"
        onClick={onToggle}
      >
        <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 ${
          w.status === "ABSENT" ? "bg-red-100 text-red-600" :
          w.status === "DEMI_JOURNEE" ? "bg-yellow-100 text-yellow-700" :
          "bg-primary/10 text-primary"
        }`}>
          {w.name.substring(0, 2).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-foreground">{w.name}</p>
          <p className="text-xs text-muted-foreground">{w.trade}</p>
        </div>

        {/* Status quick-select */}
        <div className="flex gap-1.5" onClick={e => e.stopPropagation()}>
          {(["PRESENT", "DEMI_JOURNEE", "ABSENT"] as const).map(s => (
            <button
              key={s}
              onClick={() => onChange("status", s)}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all ${
                w.status === s
                  ? s === "PRESENT" ? "bg-green-100 text-green-700 border-green-300 shadow-sm"
                    : s === "ABSENT" ? "bg-red-100 text-red-700 border-red-300 shadow-sm"
                    : "bg-yellow-100 text-yellow-700 border-yellow-300 shadow-sm"
                  : "bg-transparent text-muted-foreground border-border/50 hover:bg-muted/30"
              }`}
            >
              {s === "PRESENT" ? "Présent" : s === "ABSENT" ? "Absent" : "Demi-j."}
            </button>
          ))}
        </div>

        {/* Amount summary */}
        <div className="text-right min-w-[80px] ml-2">
          {hours !== null && (
            <p className="text-xs text-muted-foreground">{formatHours(hours)}</p>
          )}
          <p className="font-bold text-primary text-sm">{formatFCFA(amount)}</p>
        </div>

        {w.expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
      </div>

      {/* Alerts */}
      {w.expanded && w.status !== "ABSENT" && (
        <div className="px-5 flex flex-wrap gap-2">
          {overtime > 0 && (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 px-2.5 py-1 rounded-full">
              <Clock className="w-3 h-3" />
              Heures sup : {formatHours(overtime)}
            </span>
          )}
          {lateMinutes > 0 && (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-orange-700 bg-orange-50 border border-orange-200 px-2.5 py-1 rounded-full">
              <AlertTriangle className="w-3 h-3" />
              Retard : {lateMinutes}min
            </span>
          )}
          {suggestDemiJournee && (
            <button
              onClick={() => onChange("status", "DEMI_JOURNEE")}
              className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-full hover:bg-amber-100 transition-colors"
            >
              <AlertCircle className="w-3 h-3" />
              Moins de 4h — passer en demi-journée ?
            </button>
          )}
        </div>
      )}

      {/* Expanded form */}
      {w.expanded && w.status !== "ABSENT" && (
        <div className="px-5 pb-6 pt-3 space-y-6 border-t border-border/20 mt-3">

          {/* Arrival + Departure grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {/* Arrival */}
            <div className="space-y-3">
              <h4 className="text-sm font-bold text-primary uppercase tracking-wider">Arrivée</h4>
              <div>
                <Label className="text-xs">Heure d'arrivée</Label>
                <Input
                  type="time"
                  value={w.arrivalTime}
                  onChange={e => onChange("arrivalTime", e.target.value)}
                  className="h-10 rounded-xl mt-1 text-base"
                />
              </div>
              <div>
                <Label className="text-xs mb-1 block">Signature à l'arrivée</Label>
                <div className="border border-border/60 rounded-xl overflow-hidden bg-gray-50">
                  <canvas
                    ref={el => { canvasRefs.current[arrKey] = el; }}
                    className="w-full cursor-crosshair touch-none block"
                    style={{ touchAction: "none", height: "100px", display: "block" }}
                  />
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <Button size="sm" variant="outline" onClick={() => { onClearSig(arrKey); onChange("arrivalSigned", false); onChange("arrivalSignedAt", null); }}
                    className="h-7 text-xs rounded-lg px-2.5">
                    <Trash2 className="w-3 h-3 mr-1" />Effacer
                  </Button>
                  <Button size="sm" onClick={() => onValidateSig(arrKey, (_, ts) => { onChange("arrivalSigned", true); onChange("arrivalSignedAt", ts); })}
                    className="h-7 text-xs rounded-lg px-2.5 bg-primary text-white">
                    <CheckCircle2 className="w-3 h-3 mr-1" />Valider
                  </Button>
                  {w.arrivalSigned && (
                    <span className="text-xs text-green-700 flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" /> Signé à {w.arrivalSignedAt}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Departure */}
            <div className="space-y-3">
              <h4 className="text-sm font-bold text-accent uppercase tracking-wider">Départ</h4>
              <div>
                <Label className="text-xs">Heure de départ</Label>
                <Input
                  type="time"
                  value={w.departureTime}
                  onChange={e => onChange("departureTime", e.target.value)}
                  className="h-10 rounded-xl mt-1 text-base"
                />
              </div>
              <div>
                <Label className="text-xs mb-1 block">Signature au départ</Label>
                <div className="border border-border/60 rounded-xl overflow-hidden bg-gray-50">
                  <canvas
                    ref={el => { canvasRefs.current[depKey] = el; }}
                    className="w-full cursor-crosshair touch-none block"
                    style={{ touchAction: "none", height: "100px", display: "block" }}
                  />
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <Button size="sm" variant="outline" onClick={() => { onClearSig(depKey); onChange("departureSigned", false); onChange("departureSignedAt", null); }}
                    className="h-7 text-xs rounded-lg px-2.5">
                    <Trash2 className="w-3 h-3 mr-1" />Effacer
                  </Button>
                  <Button size="sm" onClick={() => onValidateSig(depKey, (_, ts) => { onChange("departureSigned", true); onChange("departureSignedAt", ts); })}
                    className="h-7 text-xs rounded-lg px-2.5 bg-accent text-white">
                    <CheckCircle2 className="w-3 h-3 mr-1" />Valider
                  </Button>
                  {w.departureSigned && (
                    <span className="text-xs text-green-700 flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" /> Signé à {w.departureSignedAt}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Pay mode */}
          <div className="space-y-3">
            <h4 className="text-sm font-bold text-foreground uppercase tracking-wider">Mode de paiement</h4>
            <div className="flex gap-3">
              {(["PAR_JOUR", "PAR_TACHE"] as const).map(mode => (
                <label key={mode} className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border cursor-pointer transition-all ${
                  w.payMode === mode ? "border-primary bg-primary/5 text-primary font-semibold" : "border-border/50 text-muted-foreground hover:bg-muted/20"
                }`}>
                  <input
                    type="radio"
                    name={`paymode_${w.personnelId}`}
                    value={mode}
                    checked={w.payMode === mode}
                    onChange={() => onChange("payMode", mode)}
                    className="accent-primary"
                  />
                  {mode === "PAR_JOUR" ? "Par jour" : "Par tâche"}
                </label>
              ))}
            </div>

            {/* PAR_JOUR fields */}
            {w.payMode === "PAR_JOUR" && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs">Tarif journalier (FCFA)</Label>
                  <Input
                    type="number"
                    value={w.dailyWage || ""}
                    onChange={e => onChange("dailyWage", parseFloat(e.target.value) || 0)}
                    placeholder="10 000"
                    className="h-10 rounded-xl mt-1"
                  />
                </div>
                <div className="flex flex-col justify-end">
                  <div className="bg-primary/5 border border-primary/10 rounded-xl p-3 text-center">
                    <p className="text-xs text-muted-foreground">Montant dû</p>
                    <p className="text-lg font-bold text-primary">{formatFCFA(calcEntryAmount(w))}</p>
                  </div>
                </div>
              </div>
            )}

            {/* PAR_TACHE fields */}
            {w.payMode === "PAR_TACHE" && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-xs">Tâche</Label>
                    <Select value={w.taskId?.toString() || ""} onValueChange={v => onChange("taskId", parseInt(v))}>
                      <SelectTrigger className="h-10 rounded-xl mt-1">
                        <SelectValue placeholder="Sélectionner..." />
                      </SelectTrigger>
                      <SelectContent>
                        {tasks.map(t => <SelectItem key={t.id} value={t.id.toString()}>{t.title}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Montant négocié (FCFA)</Label>
                    <Input
                      type="number"
                      value={w.taskAmount || ""}
                      onChange={e => onChange("taskAmount", parseFloat(e.target.value) || 0)}
                      placeholder="50 000"
                      className="h-10 rounded-xl mt-1"
                    />
                  </div>
                </div>
                <div>
                  <Label className="text-xs">Avancement : {w.taskProgressPct}%</Label>
                  <input
                    type="range"
                    min={0} max={100} step={5}
                    value={w.taskProgressPct}
                    onChange={e => onChange("taskProgressPct", parseInt(e.target.value))}
                    className="w-full mt-1 accent-primary"
                  />
                  <div className="flex justify-between text-xs text-muted-foreground mt-0.5">
                    <span>0%</span><span>50%</span><span>100%</span>
                  </div>
                </div>
                <div className="bg-primary/5 border border-primary/10 rounded-xl p-3 flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Montant dû :</span>
                  <span className="text-lg font-bold text-primary">{formatFCFA(calcEntryAmount(w))}</span>
                </div>
              </div>
            )}
          </div>

          {/* Notes */}
          <div>
            <Label className="text-xs">Notes / Observations</Label>
            <Textarea
              value={w.notes}
              onChange={e => onChange("notes", e.target.value)}
              placeholder="Remarques sur la journée de travail..."
              rows={2}
              className="rounded-xl mt-1 resize-none text-sm"
            />
          </div>
        </div>
      )}
    </div>
  );
}
