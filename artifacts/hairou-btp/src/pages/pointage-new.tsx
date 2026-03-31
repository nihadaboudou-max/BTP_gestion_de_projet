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
  Loader2, Save, ArrowLeft, CheckCircle2, AlertCircle,
  Users, ChevronDown, ChevronUp, Trash2, Search,
  UserCheck, UserX, DollarSign
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";

// ─── helpers ──────────────────────────────────────────────────────────────────

function apiFetch(path: string, opts?: RequestInit) {
  const token = localStorage.getItem("hairou_token");
  const baseUrl = import.meta.env.VITE_API_URL ?? "https://btp-gestion-de-projet.onrender.com";
  const fullUrl = path.startsWith("http") ? path : `${baseUrl}${path}`;
  return fetch(fullUrl, {
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
  return `${Math.floor(h)}h${Math.round((h - Math.floor(h)) * 60).toString().padStart(2, "0")}`;
}

function calcEntryAmount(e: WorkerState): number {
  if (e.status === "ABSENT") return 0;
  if (e.payMode === "PAR_TACHE") return (e.taskAmount || 0) * ((e.taskProgressPct ?? 100) / 100);
  const wage = e.dailyWage || 0;
  if (e.status === "DEMI_JOURNEE") return wage / 2;
  const hours = calcHoursNum(e.arrivalTime, e.departureTime);
  if (hours && hours > 0) return hours * (wage / 8);
  return wage;
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface PersonnelRecord {
  id: number; name: string; trade: string;
  dailyWage: string | number; assignedToProject?: boolean; included: boolean;
}

interface WorkerState {
  personnelId: number; name: string; trade: string;
  status: "PRESENT" | "ABSENT" | "DEMI_JOURNEE";
  arrivalTime: string; arrivalSigned: boolean; arrivalSignedAt: string | null;
  departureTime: string; departureSigned: boolean; departureSignedAt: string | null;
  payMode: "PAR_JOUR" | "PAR_TACHE";
  dailyWage: number; taskId: number | null; taskAmount: number; taskProgressPct: number;
  notes: string; expanded: boolean;
}

const STATUS_PILL: Record<string, string> = {
  PRESENT:      "bg-green-100 text-green-700 border-green-300",
  ABSENT:       "bg-red-100 text-red-600 border-red-300",
  DEMI_JOURNEE: "bg-yellow-100 text-yellow-700 border-yellow-300",
};
const STATUS_LABEL: Record<string, string> = { PRESENT: "Présent", ABSENT: "Absent", DEMI_JOURNEE: "½ Jour" };

// ─── Page principale ──────────────────────────────────────────────────────────

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
  const [searchQuery, setSearchQuery] = useState("");

  const padRefs = useRef<Record<string, SignaturePad>>({});
  const canvasRefs = useRef<Record<string, HTMLCanvasElement | null>>({});
  const padCanvasTracker = useRef<Record<string, HTMLCanvasElement>>({});

  // ── Charger ouvriers quand projet change ──────────────────────────────────
  useEffect(() => {
    if (!projectId) { setWorkers([]); setPersonnel([]); return; }
    setLoadingWorkers(true);
    Promise.all([
      apiFetch(`/api/pointage/workers-for-project/${projectId}`),
      apiFetch(`/api/projects/${projectId}/tasks`),
    ]).then(([workerData, taskData]) => {
      setTasks(taskData || []);
      const list: PersonnelRecord[] = (workerData || []).map((w: any) => ({ ...w, included: true }));
      setPersonnel(list);
      setWorkers(list.filter(p => p.included).map(p => ({
        personnelId: p.id, name: p.name, trade: p.trade || "",
        status: "PRESENT", arrivalTime: "07:30", arrivalSigned: false, arrivalSignedAt: null,
        departureTime: "17:00", departureSigned: false, departureSignedAt: null,
        payMode: "PAR_JOUR", dailyWage: parseFloat(String(p.dailyWage || 0)),
        taskId: null, taskAmount: 0, taskProgressPct: 100, notes: "", expanded: false,
      })));
    }).catch(() => toast({ title: "Impossible de charger les ouvriers", variant: "destructive" }))
      .finally(() => setLoadingWorkers(false));
  }, [projectId]);

  // ── Init pads signature ───────────────────────────────────────────────────
  useEffect(() => {
    const initPad = (key: string, opts: object) => {
      const canvas = canvasRefs.current[key];
      if (!canvas) return;
      if (padRefs.current[key] && padCanvasTracker.current[key] !== canvas) {
        padRefs.current[key].off(); delete padRefs.current[key]; delete padCanvasTracker.current[key];
      }
      const rect = canvas.getBoundingClientRect();
      const w = Math.round(rect.width) || 350;
      const h = Math.round(rect.height) || 90;
      if (w > 0 && h > 0) { canvas.width = w; canvas.height = h; }
      if (!padRefs.current[key]) {
        try {
          padRefs.current[key] = new SignaturePad(canvas, { backgroundColor: "rgb(255,255,255)", ...opts });
          padCanvasTracker.current[key] = canvas;
        } catch {}
      }
    };
    const timer = setTimeout(() => {
      workers.filter(w => w.expanded).forEach(w => {
        initPad(`arr_${w.personnelId}`, { penColor: "rgb(15,45,76)", minWidth: 1, maxWidth: 2.5 });
        initPad(`dep_${w.personnelId}`, { penColor: "rgb(20,83,45)", minWidth: 1, maxWidth: 2.5 });
      });
      initPad("chef", { penColor: "rgb(15,45,76)", minWidth: 1.5, maxWidth: 3 });
    }, 80);
    return () => clearTimeout(timer);
  }, [workers.map(w => `${w.personnelId}-${w.expanded}`).join(",")]);

  const updateWorker = useCallback((idx: number, field: string, value: any) => {
    setWorkers(prev => prev.map((w, i) => i === idx ? { ...w, [field]: value } : w));
  }, []);

  const validateSig = (key: string, onSuccess: (url: string, ts: string) => void) => {
    const pad = padRefs.current[key];
    if (!pad || pad.isEmpty()) { toast({ title: "Veuillez signer d'abord", variant: "destructive" }); return; }
    onSuccess(pad.toDataURL("image/png"), new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }));
  };

  const clearSig = (key: string) => padRefs.current[key]?.clear();

  // ── Actions globales ──────────────────────────────────────────────────────
  const setAllStatus = (status: WorkerState["status"]) =>
    setWorkers(prev => prev.map(w => ({ ...w, status })));

  // ── Filtrage par recherche ────────────────────────────────────────────────
  const filteredWorkers = workers.filter(w =>
    !searchQuery || w.name.toLowerCase().includes(searchQuery.toLowerCase()) || w.trade.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // ── Soumission ────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!projectId || !date) { toast({ title: "Choisissez un projet et une date", variant: "destructive" }); return; }
    if (workers.length === 0) { toast({ title: "Aucun ouvrier sélectionné", variant: "destructive" }); return; }

    const chefPad = padRefs.current["chef"];
    const chefSigData = chefPad && !chefPad.isEmpty() ? chefPad.toDataURL("image/png") : null;

    setIsSaving(true);
    try {
      const entries = workers.map(w => {
        const arrPad = padRefs.current[`arr_${w.personnelId}`];
        const depPad = padRefs.current[`dep_${w.personnelId}`];
        const hours = w.status !== "ABSENT" ? calcHoursNum(w.arrivalTime, w.departureTime) : null;
        const overtime = hours && hours > 8 ? hours - 8 : 0;
        return {
          personnelId: w.personnelId, status: w.status,
          arrivalTime: w.status !== "ABSENT" ? w.arrivalTime : null,
          arrivalSignature: w.status !== "ABSENT" && arrPad && !arrPad.isEmpty() ? arrPad.toDataURL("image/png") : null,
          arrivalSignedAt: w.arrivalSignedAt ? new Date().toISOString() : null,
          departureTime: w.status !== "ABSENT" ? w.departureTime : null,
          departureSignature: w.status !== "ABSENT" && depPad && !depPad.isEmpty() ? depPad.toDataURL("image/png") : null,
          departureSignedAt: w.departureSignedAt ? new Date().toISOString() : null,
          hoursWorked: hours ?? null, overtimeHours: overtime,
          payMode: w.payMode,
          dailyWage: w.payMode === "PAR_JOUR" ? w.dailyWage : null,
          taskId: w.payMode === "PAR_TACHE" ? w.taskId : null,
          taskAmount: w.payMode === "PAR_TACHE" ? w.taskAmount : null,
          taskProgressPct: w.payMode === "PAR_TACHE" ? w.taskProgressPct : 100,
          amountDue: calcEntryAmount(w), notes: w.notes || null,
        };
      });

      const totalAmountDue = entries.reduce((s, e) => s + (e.amountDue || 0), 0);
      const result = await apiFetch("/api/pointage", {
        method: "POST",
        body: JSON.stringify({ projectId: parseInt(projectId), date, chefSignature: chefSigData, chefSignedAt: chefSigData ? new Date().toISOString() : null, entries, totalAmountDue }),
      });

      queryClient.invalidateQueries({ queryKey: ["/api/pointage"] });
      toast({ title: "Fiche créée", description: `${workers.filter(w => w.status !== "ABSENT").length} présent(s) — ${formatFCFA(totalAmountDue)}` });
      navigate(`/pointage/${result.id}`);
    } catch (err: any) {
      toast({ title: "Erreur", description: err.message, variant: "destructive" });
    } finally { setIsSaving(false); }
  };

  const totalDue = workers.reduce((s, w) => s + calcEntryAmount(w), 0);
  const presentCount = workers.filter(w => w.status === "PRESENT").length;
  const halfCount = workers.filter(w => w.status === "DEMI_JOURNEE").length;
  const absentCount = workers.filter(w => w.status === "ABSENT").length;
  const allUnassigned = personnel.length > 0 && personnel.every(p => !p.assignedToProject);

  return (
    <AppLayout title="Nouveau Pointage">
      <div className="max-w-4xl mx-auto space-y-5 pb-24">

        {/* Retour */}
        <Button variant="ghost" onClick={() => navigate("/pointage")} className="text-muted-foreground -ml-2">
          <ArrowLeft className="w-4 h-4 mr-1.5" /> Retour aux fiches
        </Button>

        {/* ── Étape 1 : Projet + Date ── */}
        <div className="bg-white rounded-2xl border border-border/50 shadow-sm p-5">
          <h2 className="text-base font-bold mb-4 flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-primary text-white text-xs flex items-center justify-center font-bold">1</span>
            Chantier et date
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Projet / Chantier *</Label>
              <Select value={projectId} onValueChange={setProjectId}>
                <SelectTrigger className="rounded-xl h-10">
                  <SelectValue placeholder="Sélectionner un chantier..." />
                </SelectTrigger>
                <SelectContent>
                  {(projects as any[])?.map((p: any) => (
                    <SelectItem key={p.id} value={p.id.toString()}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Date du pointage *</Label>
              <Input type="date" value={date} onChange={e => setDate(e.target.value)} className="rounded-xl h-10" />
            </div>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">Chef responsable : <span className="font-semibold text-foreground">{user?.name}</span></p>
        </div>

        {/* Chargement */}
        {loadingWorkers && (
          <div className="flex items-center justify-center py-10 text-muted-foreground gap-3">
            <Loader2 className="w-5 h-5 animate-spin" /> Chargement des ouvriers...
          </div>
        )}

        {!projectId && !loadingWorkers && (
          <div className="flex flex-col items-center py-12 text-center text-muted-foreground bg-muted/20 rounded-2xl border border-dashed border-border">
            <Users className="w-10 h-10 mb-2 opacity-30" />
            <p className="font-medium text-sm">Sélectionnez un chantier pour commencer</p>
          </div>
        )}

        {/* Avertissement ouvriers non assignés */}
        {allUnassigned && !loadingWorkers && projectId && (
          <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
            <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Aucun ouvrier assigné à ce chantier</p>
              <p className="mt-0.5 text-xs">Voici tout le personnel actif — décochez ceux qui ne participent pas.</p>
            </div>
          </div>
        )}

        {/* Sélection manuelle si fallback */}
        {allUnassigned && personnel.length > 0 && !loadingWorkers && (
          <div className="bg-white rounded-2xl border border-border/50 shadow-sm p-5">
            <h3 className="font-semibold mb-3 text-xs text-muted-foreground uppercase tracking-wider">Personnel à inclure</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
              {personnel.map(p => {
                const isIncluded = workers.some(w => w.personnelId === p.id);
                return (
                  <label key={p.id} className={`flex items-center gap-2 p-2.5 rounded-xl border cursor-pointer transition-all text-sm ${isIncluded ? "border-primary bg-primary/5" : "border-border/50 hover:bg-muted/30"}`}>
                    <input type="checkbox" checked={isIncluded} onChange={e => {
                      if (e.target.checked) {
                        setWorkers(prev => [...prev, {
                          personnelId: p.id, name: p.name, trade: p.trade || "",
                          status: "PRESENT", arrivalTime: "07:30", arrivalSigned: false, arrivalSignedAt: null,
                          departureTime: "17:00", departureSigned: false, departureSignedAt: null,
                          payMode: "PAR_JOUR", dailyWage: parseFloat(String(p.dailyWage || 0)),
                          taskId: null, taskAmount: 0, taskProgressPct: 100, notes: "", expanded: false,
                        }]);
                      } else {
                        setWorkers(prev => prev.filter(w => w.personnelId !== p.id));
                      }
                    }} className="w-4 h-4 accent-primary" />
                    <div className="min-w-0">
                      <p className="font-semibold truncate text-xs">{p.name}</p>
                      {p.trade && <p className="text-[10px] text-muted-foreground truncate">{p.trade}</p>}
                    </div>
                  </label>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Étape 2 : Tableau de présence ── */}
        {workers.length > 0 && !loadingWorkers && (
          <div className="bg-white rounded-2xl border border-border/50 shadow-sm overflow-hidden">
            {/* Toolbar */}
            <div className="px-4 py-3 border-b border-border/20 flex flex-col sm:flex-row sm:items-center gap-2">
              <h2 className="text-base font-bold flex items-center gap-2 flex-shrink-0">
                <span className="w-6 h-6 rounded-full bg-primary text-white text-xs flex items-center justify-center font-bold">2</span>
                Présences
                <span className="text-sm font-normal text-muted-foreground">({workers.length})</span>
              </h2>
              {/* Recherche */}
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                <input
                  type="text" placeholder="Rechercher..." value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full pl-8 pr-3 h-8 text-sm rounded-lg border border-input bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
              {/* Actions masse */}
              <div className="flex gap-1.5 flex-shrink-0">
                <button onClick={() => setAllStatus("PRESENT")}
                  className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold rounded-lg bg-green-50 text-green-700 border border-green-200 hover:bg-green-100 transition-colors">
                  <UserCheck className="w-3 h-3" /> Tous présents
                </button>
                <button onClick={() => setAllStatus("ABSENT")}
                  className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold rounded-lg bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 transition-colors">
                  <UserX className="w-3 h-3" /> Tous absents
                </button>
              </div>
            </div>

            {/* Barre de stats */}
            <div className="px-4 py-1.5 bg-muted/20 flex gap-4 text-xs font-medium border-b border-border/10">
              <span className="text-green-700">{presentCount} présent{presentCount > 1 ? "s" : ""}</span>
              {halfCount > 0 && <span className="text-yellow-700">{halfCount} demi-j.</span>}
              <span className="text-red-600">{absentCount} absent{absentCount > 1 ? "s" : ""}</span>
              <span className="ml-auto text-primary font-bold">{formatFCFA(totalDue)}</span>
            </div>

            {/* Lignes ouvriers */}
            <div className="divide-y divide-border/15">
              {filteredWorkers.length === 0 && (
                <p className="text-center text-sm text-muted-foreground py-8">Aucun résultat pour "{searchQuery}"</p>
              )}
              {filteredWorkers.map(w => {
                const realIdx = workers.findIndex(x => x.personnelId === w.personnelId);
                return (
                  <WorkerRow
                    key={w.personnelId} worker={w} tasks={tasks}
                    onChange={(field, value) => updateWorker(realIdx, field, value)}
                    onToggle={() => updateWorker(realIdx, "expanded", !workers[realIdx].expanded)}
                    canvasRefs={canvasRefs} padRefs={padRefs}
                    onValidateSig={validateSig} onClearSig={clearSig}
                  />
                );
              })}
            </div>
          </div>
        )}

        {/* ── Étape 3 : Récapitulatif ── */}
        {workers.length > 0 && (
          <div className="bg-white rounded-2xl border border-border/50 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-border/20 flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-primary text-white text-xs flex items-center justify-center font-bold">3</span>
              <h2 className="text-base font-bold">Récapitulatif</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/30 text-muted-foreground text-xs uppercase font-semibold">
                  <tr>
                    <th className="px-4 py-2.5 text-left">Ouvrier</th>
                    <th className="px-3 py-2.5 text-center">Statut</th>
                    <th className="px-3 py-2.5 text-center">Arrivée</th>
                    <th className="px-3 py-2.5 text-center">Départ</th>
                    <th className="px-3 py-2.5 text-center">Heures</th>
                    <th className="px-3 py-2.5 text-right">Montant</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/20">
                  {workers.map(w => {
                    const hours = w.status !== "ABSENT" ? calcHoursNum(w.arrivalTime, w.departureTime) : null;
                    return (
                      <tr key={w.personnelId} className={w.status === "ABSENT" ? "opacity-50" : ""}>
                        <td className="px-4 py-2.5 font-medium text-sm">
                          {w.name}
                          {w.trade && <span className="text-xs text-muted-foreground ml-1.5">{w.trade}</span>}
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-semibold border ${STATUS_PILL[w.status]}`}>
                            {STATUS_LABEL[w.status]}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-center text-xs text-muted-foreground">{w.status !== "ABSENT" ? w.arrivalTime : "—"}</td>
                        <td className="px-3 py-2.5 text-center text-xs text-muted-foreground">{w.status !== "ABSENT" ? w.departureTime : "—"}</td>
                        <td className="px-3 py-2.5 text-center text-xs">{formatHours(hours)}</td>
                        <td className="px-3 py-2.5 text-right font-bold">{formatFCFA(calcEntryAmount(w))}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="bg-primary/5 font-bold">
                  <tr>
                    <td colSpan={5} className="px-4 py-3 text-right">TOTAL JOURNÉE :</td>
                    <td className="px-3 py-3 text-right text-primary text-base">{formatFCFA(totalDue)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}

        {/* ── Étape 4 : Signature chef ── */}
        {workers.length > 0 && (
          <div className="bg-white rounded-2xl border border-border/50 shadow-sm p-5">
            <h2 className="text-base font-bold mb-3 flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-primary text-white text-xs flex items-center justify-center font-bold">4</span>
              Signature du Chef de Chantier
            </h2>
            <div className="border-2 border-primary/30 rounded-xl overflow-hidden bg-white">
              <canvas ref={el => { canvasRefs.current["chef"] = el; }}
                className="w-full touch-none cursor-crosshair block" style={{ touchAction: "none", height: "120px" }} />
            </div>
            <div className="flex items-center gap-3 mt-3">
              <Button size="sm" variant="outline" onClick={() => { clearSig("chef"); setChefSigned(false); setChefSignedAt(null); }}
                className="rounded-xl h-8 text-xs text-muted-foreground">
                <Trash2 className="w-3 h-3 mr-1" /> Effacer
              </Button>
              <Button size="sm" onClick={() => validateSig("chef", (_, ts) => { setChefSigned(true); setChefSignedAt(ts); })}
                className="rounded-xl h-8 text-xs bg-primary text-white">
                <CheckCircle2 className="w-3 h-3 mr-1" /> Valider ma signature
              </Button>
              {chefSigned && <span className="text-xs text-green-700 font-medium flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Signé à {chefSignedAt}</span>}
            </div>
          </div>
        )}

        {/* ── Barre de soumission fixe ── */}
        {workers.length > 0 && (
          <div className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur border-t border-border/50 p-4 shadow-lg z-20">
            <div className="flex items-center justify-between gap-4 max-w-4xl mx-auto">
              <div>
                <p className="font-bold text-lg text-primary leading-tight">{formatFCFA(totalDue)}</p>
                <p className="text-xs text-muted-foreground">{presentCount} présent(s) · {halfCount} demi-j. · {absentCount} absent(s)</p>
              </div>
              <div className="flex gap-3">
                <Button variant="outline" onClick={() => navigate("/pointage")} className="rounded-xl">Annuler</Button>
                <Button onClick={handleSubmit} disabled={isSaving || !projectId}
                  className="rounded-xl bg-secondary hover:bg-secondary/90 text-white shadow-lg px-6">
                  {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                  Créer la fiche
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}

// ─── WorkerRow (compact + accordéon) ─────────────────────────────────────────

interface WorkerRowProps {
  worker: WorkerState; tasks: any[];
  onChange: (field: string, value: any) => void;
  onToggle: () => void;
  canvasRefs: React.MutableRefObject<Record<string, HTMLCanvasElement | null>>;
  padRefs: React.MutableRefObject<Record<string, SignaturePad>>;
  onValidateSig: (key: string, cb: (url: string, ts: string) => void) => void;
  onClearSig: (key: string) => void;
}

function WorkerRow({ worker: w, tasks, onChange, onToggle, canvasRefs, padRefs, onValidateSig, onClearSig }: WorkerRowProps) {
  const arrKey = `arr_${w.personnelId}`;
  const depKey = `dep_${w.personnelId}`;
  const hours = w.status !== "ABSENT" ? calcHoursNum(w.arrivalTime, w.departureTime) : null;
  const amount = calcEntryAmount(w);
  const initials = w.name.split(" ").map(n => n[0]).join("").substring(0, 2).toUpperCase();

  return (
    <div className={w.status === "ABSENT" ? "bg-red-50/30" : w.status === "DEMI_JOURNEE" ? "bg-yellow-50/20" : ""}>
      {/* Ligne compacte toujours visible */}
      <div className="flex items-center gap-3 px-4 py-3">
        {/* Avatar */}
        <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
          w.status === "ABSENT" ? "bg-red-100 text-red-600" :
          w.status === "DEMI_JOURNEE" ? "bg-yellow-100 text-yellow-700" : "bg-primary/10 text-primary"
        }`}>{initials}</div>

        {/* Nom + métier */}
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm leading-tight truncate">{w.name}</p>
          {w.trade && <p className="text-xs text-muted-foreground truncate">{w.trade}</p>}
        </div>

        {/* Boutons statut rapide */}
        <div className="flex gap-1 flex-shrink-0">
          {(["PRESENT", "DEMI_JOURNEE", "ABSENT"] as const).map(s => (
            <button key={s} onClick={() => onChange("status", s)}
              className={`w-8 h-7 rounded-lg text-xs font-bold border transition-all ${
                w.status === s ? STATUS_PILL[s] + " shadow-sm" : "bg-transparent text-muted-foreground border-border/40 hover:bg-muted/30"
              }`}>
              {s === "PRESENT" ? "✓" : s === "ABSENT" ? "✗" : "½"}
            </button>
          ))}
        </div>

        {/* Montant */}
        <div className="text-right min-w-[75px] hidden sm:block">
          {hours !== null && <p className="text-xs text-muted-foreground">{formatHours(hours)}</p>}
          <p className="text-sm font-bold text-primary">{formatFCFA(amount)}</p>
        </div>

        {/* Expand */}
        <button onClick={onToggle} className="p-1 rounded-lg hover:bg-muted/40 text-muted-foreground transition-colors flex-shrink-0">
          {w.expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      </div>

      {/* Détail accordéon */}
      {w.expanded && (
        <div className="px-4 pb-5 pt-2 border-t border-border/15 bg-muted/5 space-y-4">

          {/* Heures + mode paiement */}
          {w.status !== "ABSENT" && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <Label className="text-xs">Arrivée</Label>
                <Input type="time" value={w.arrivalTime} onChange={e => onChange("arrivalTime", e.target.value)} className="h-9 rounded-xl mt-1 text-sm" />
              </div>
              <div>
                <Label className="text-xs">Départ</Label>
                <Input type="time" value={w.departureTime} onChange={e => onChange("departureTime", e.target.value)} className="h-9 rounded-xl mt-1 text-sm" />
              </div>
              <div>
                <Label className="text-xs">Mode paiement</Label>
                <select value={w.payMode} onChange={e => onChange("payMode", e.target.value)}
                  className="mt-1 w-full h-9 px-2 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring">
                  <option value="PAR_JOUR">Par jour</option>
                  <option value="PAR_TACHE">Par tâche</option>
                </select>
              </div>
              <div>
                {w.payMode === "PAR_JOUR" ? (
                  <>
                    <Label className="text-xs">Tarif/jour (FCFA)</Label>
                    <Input type="number" value={w.dailyWage || ""} onChange={e => onChange("dailyWage", parseFloat(e.target.value) || 0)}
                      placeholder="10000" className="h-9 rounded-xl mt-1 text-sm" />
                  </>
                ) : (
                  <>
                    <Label className="text-xs">Montant tâche (FCFA)</Label>
                    <Input type="number" value={w.taskAmount || ""} onChange={e => onChange("taskAmount", parseFloat(e.target.value) || 0)}
                      placeholder="50000" className="h-9 rounded-xl mt-1 text-sm" />
                  </>
                )}
              </div>
            </div>
          )}

          {/* PAR_TACHE extras */}
          {w.status !== "ABSENT" && w.payMode === "PAR_TACHE" && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Tâche associée</Label>
                <select value={w.taskId?.toString() || ""} onChange={e => onChange("taskId", parseInt(e.target.value) || null)}
                  className="mt-1 w-full h-9 px-2 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring">
                  <option value="">Sélectionner...</option>
                  {tasks.map(t => <option key={t.id} value={t.id.toString()}>{t.title}</option>)}
                </select>
              </div>
              <div>
                <Label className="text-xs">Avancement : {w.taskProgressPct}%</Label>
                <input type="range" min={0} max={100} step={5} value={w.taskProgressPct}
                  onChange={e => onChange("taskProgressPct", parseInt(e.target.value))} className="w-full mt-2.5 accent-primary" />
              </div>
            </div>
          )}

          {/* Montant calculé */}
          {w.status !== "ABSENT" && (
            <div className="flex items-center gap-2 text-sm bg-primary/5 rounded-xl px-3 py-2">
              <DollarSign className="w-4 h-4 text-primary" />
              <span className="text-muted-foreground">Montant calculé :</span>
              <span className="font-bold text-primary">{formatFCFA(amount)}</span>
              {hours !== null && <span className="text-xs text-muted-foreground">({formatHours(hours)})</span>}
            </div>
          )}

          {/* Signatures côte à côte */}
          {w.status !== "ABSENT" && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Signature arrivée */}
              <div>
                <Label className="text-xs font-bold text-primary uppercase tracking-wider">Signature arrivée</Label>
                <div className="border border-border/60 rounded-xl overflow-hidden bg-white mt-1.5">
                  <canvas ref={el => { canvasRefs.current[arrKey] = el; }}
                    className="w-full cursor-crosshair touch-none block" style={{ touchAction: "none", height: "85px" }} />
                </div>
                <div className="flex items-center gap-2 mt-1.5">
                  <Button size="sm" variant="outline" onClick={() => { onClearSig(arrKey); onChange("arrivalSigned", false); onChange("arrivalSignedAt", null); }}
                    className="h-7 text-xs rounded-lg px-2"><Trash2 className="w-3 h-3" /></Button>
                  <Button size="sm" onClick={() => onValidateSig(arrKey, (_, ts) => { onChange("arrivalSigned", true); onChange("arrivalSignedAt", ts); })}
                    className="h-7 text-xs rounded-lg px-2.5 bg-primary text-white">
                    <CheckCircle2 className="w-3 h-3 mr-1" />OK
                  </Button>
                  {w.arrivalSigned && <span className="text-xs text-green-700 font-medium">✓ {w.arrivalSignedAt}</span>}
                </div>
              </div>
              {/* Signature départ */}
              <div>
                <Label className="text-xs font-bold text-accent uppercase tracking-wider">Signature départ</Label>
                <div className="border border-border/60 rounded-xl overflow-hidden bg-white mt-1.5">
                  <canvas ref={el => { canvasRefs.current[depKey] = el; }}
                    className="w-full cursor-crosshair touch-none block" style={{ touchAction: "none", height: "85px" }} />
                </div>
                <div className="flex items-center gap-2 mt-1.5">
                  <Button size="sm" variant="outline" onClick={() => { onClearSig(depKey); onChange("departureSigned", false); onChange("departureSignedAt", null); }}
                    className="h-7 text-xs rounded-lg px-2"><Trash2 className="w-3 h-3" /></Button>
                  <Button size="sm" onClick={() => onValidateSig(depKey, (_, ts) => { onChange("departureSigned", true); onChange("departureSignedAt", ts); })}
                    className="h-7 text-xs rounded-lg px-2.5 bg-accent text-white">
                    <CheckCircle2 className="w-3 h-3 mr-1" />OK
                  </Button>
                  {w.departureSigned && <span className="text-xs text-green-700 font-medium">✓ {w.departureSignedAt}</span>}
                </div>
              </div>
            </div>
          )}

          {/* Notes */}
          <div>
            <Label className="text-xs">Notes</Label>
            <Textarea value={w.notes} onChange={e => onChange("notes", e.target.value)}
              placeholder="Remarques..." rows={2} className="rounded-xl mt-1 resize-none text-sm" />
          </div>
        </div>
      )}
    </div>
  );
}
