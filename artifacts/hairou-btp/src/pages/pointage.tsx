import { useState, useEffect, useCallback } from "react";
import { Link, useLocation } from "wouter";
import { AppLayout } from "@/components/layout";
import { useListPointageSheets, useCreatePointageSheet, useListProjects } from "@workspace/api-client-react";
import { formatDate, formatFCFA } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Plus, ClipboardList, Clock, ArrowRight, Loader2,
  CheckCircle2, XCircle, MinusCircle, ChevronDown, ChevronUp,
  Users, Calendar, Building2, Eye
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";

// ─── helpers ─────────────────────────────────────────────────────────────────

const STATUS_CONFIG = {
  PRESENT:     { label: "Présent",     icon: CheckCircle2, color: "bg-green-100 text-green-700 border-green-200" },
  ABSENT:      { label: "Absent",      icon: XCircle,      color: "bg-red-100 text-red-700 border-red-200" },
  DEMI_JOURNEE:{ label: "Demi-j.",     icon: MinusCircle,  color: "bg-yellow-100 text-yellow-700 border-yellow-200" },
};

const SHEET_STATUS: Record<string, { label: string; color: string }> = {
  BROUILLON: { label: "Brouillon",       color: "bg-gray-100 text-gray-600" },
  SOUMISE:   { label: "En attente",      color: "bg-blue-100 text-blue-700" },
  APPROUVEE: { label: "Approuvée",       color: "bg-green-100 text-green-700" },
  REJETEE:   { label: "Rejetée",         color: "bg-red-100 text-red-700" },
};

function calcHours(arrival: string, departure: string): number | null {
  if (!arrival || !departure) return null;
  const [ah, am] = arrival.split(":").map(Number);
  const [dh, dm] = departure.split(":").map(Number);
  const diff = (dh * 60 + dm) - (ah * 60 + am);
  return diff > 0 ? Math.round(diff / 60 * 100) / 100 : null;
}

function calcAmount(w: WorkerRow): number {
  if (w.status === "ABSENT") return 0;
  const wage = w.dailyWage || 0;
  const hours = calcHours(w.arrivalTime, w.departureTime);
  if (w.status === "DEMI_JOURNEE") return wage / 2;
  if (hours && hours > 0) return hours * (wage / 8);
  return wage;
}

function apiFetch(path: string, options?: RequestInit) {
  const token = localStorage.getItem("hairou_token");
  return fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options?.headers,
    },
  }).then(async r => {
    if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d?.message || "Erreur serveur"); }
    return r.json();
  });
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface WorkerRow {
  personnelId: number;
  name: string;
  trade: string;
  dailyWage: number;
  status: "PRESENT" | "ABSENT" | "DEMI_JOURNEE";
  arrivalTime: string;
  departureTime: string;
  notes: string;
  expanded: boolean;
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function Pointage() {
  const { data: sheets, isLoading } = useListPointageSheets();
  const { user } = useAuth();
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  const isWorker = user?.role === "OUVRIER";

  if (isWorker) {
    return <WorkerHistory />;
  }

  return (
    <AppLayout title="Feuilles de Pointage">
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <p className="text-muted-foreground">Suivez la présence et les heures de vos équipes.</p>
          <Button
            onClick={() => setIsCreateOpen(true)}
            className="bg-secondary hover:bg-secondary/90 text-white rounded-xl shadow-lg shadow-secondary/20"
          >
            <Plus className="w-4 h-4 mr-2" />
            Nouveau Pointage
          </Button>
        </div>

        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3].map(i => <div key={i} className="h-24 bg-muted/50 rounded-2xl animate-pulse" />)}
          </div>
        ) : (sheets as any[])?.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-16 text-center bg-white rounded-3xl border border-border/50 shadow-sm">
            <div className="w-20 h-20 bg-muted rounded-full flex items-center justify-center mb-4">
              <Clock className="w-10 h-10 text-muted-foreground/50" />
            </div>
            <h3 className="text-xl font-bold mb-2">Aucun pointage</h3>
            <p className="text-muted-foreground mb-6">Commencez par initier une feuille de présence pour un chantier.</p>
            <Button onClick={() => setIsCreateOpen(true)} className="rounded-xl">Nouveau Pointage</Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {(sheets as any[])?.map((sheet: any) => (
              <SheetCard key={sheet.id} sheet={sheet} />
            ))}
          </div>
        )}
      </div>

      {/* Create dialog */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="sm:max-w-3xl rounded-2xl max-h-[95vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl">Nouvelle Feuille de Pointage</DialogTitle>
          </DialogHeader>
          <CreatePointageForm onSuccess={() => setIsCreateOpen(false)} />
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}

// ─── Sheet card ────────────────────────────────────────────────────────────────

function SheetCard({ sheet }: { sheet: any }) {
  const cfg = SHEET_STATUS[sheet.status] || SHEET_STATUS.BROUILLON;
  return (
    <Link href={`/pointage/${sheet.id}`}>
      <div className="bg-white border border-border/50 rounded-2xl p-5 shadow-sm hover:shadow-md transition-all cursor-pointer group">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 bg-secondary/10 rounded-xl flex items-center justify-center flex-shrink-0">
              <ClipboardList className="w-5 h-5 text-secondary" />
            </div>
            <div>
              <h4 className="font-bold text-foreground leading-tight">{sheet.projectName || `Projet #${sheet.projectId}`}</h4>
              <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                <Calendar className="w-3 h-3" />{formatDate(sheet.date)}
              </p>
            </div>
          </div>
          <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${cfg.color} whitespace-nowrap`}>{cfg.label}</span>
        </div>
        {sheet.totalPay > 0 && (
          <p className="text-sm font-bold text-primary mt-2">{formatFCFA(sheet.totalPay)}</p>
        )}
        <div className="flex items-center justify-end mt-2">
          <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
        </div>
      </div>
    </Link>
  );
}

// ─── Create form (presence list) ───────────────────────────────────────────────

function CreatePointageForm({ onSuccess }: { onSuccess: () => void }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: projects, isLoading: projectsLoading } = useListProjects();
  const [, navigate] = useLocation();

  const [projectId, setProjectId] = useState<string>("");
  const [date, setDate] = useState<string>(new Date().toISOString().split("T")[0]);
  const [workers, setWorkers] = useState<WorkerRow[]>([]);
  const [loadingWorkers, setLoadingWorkers] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Load workers when project changes
  useEffect(() => {
    if (!projectId) { setWorkers([]); return; }
    setLoadingWorkers(true);
    apiFetch(`/api/pointage/workers-for-project/${projectId}`)
      .then((data: any[]) => {
        setWorkers(data.map(w => ({
          personnelId: w.id,
          name: w.name,
          trade: w.trade || "",
          dailyWage: parseFloat(w.dailyWage || "0"),
          status: "PRESENT",
          arrivalTime: "07:30",
          departureTime: "17:00",
          notes: "",
          expanded: false,
        })));
      })
      .catch(() => { toast({ title: "Impossible de charger les ouvriers", variant: "destructive" }); })
      .finally(() => setLoadingWorkers(false));
  }, [projectId]);

  const updateWorker = useCallback((idx: number, field: string, value: any) => {
    setWorkers(prev => prev.map((w, i) => i === idx ? { ...w, [field]: value } : w));
  }, []);

  const setAllStatus = (status: WorkerRow["status"]) => {
    setWorkers(prev => prev.map(w => ({ ...w, status })));
  };

  const handleSubmit = async () => {
    if (!projectId || !date) {
      toast({ title: "Choisissez un projet et une date", variant: "destructive" });
      return;
    }
    if (workers.length === 0) {
      toast({ title: "Aucun ouvrier assigné à ce projet", variant: "destructive" });
      return;
    }
    setIsSaving(true);
    try {
      const entries = workers.map(w => {
        const hours = calcHours(w.arrivalTime, w.departureTime);
        return {
          personnelId: w.personnelId,
          status: w.status,
          arrivalTime: w.status !== "ABSENT" ? w.arrivalTime : null,
          departureTime: w.status !== "ABSENT" ? w.departureTime : null,
          hoursWorked: w.status !== "ABSENT" ? hours : null,
          payMode: "PAR_JOUR",
          dailyWage: w.dailyWage,
          notes: w.notes || null,
        };
      });

      const result = await apiFetch("/api/pointage", {
        method: "POST",
        body: JSON.stringify({ projectId: parseInt(projectId), date, entries }),
      });

      queryClient.invalidateQueries({ queryKey: ["/api/pointage"] });
      toast({ title: "Fiche de pointage créée", description: `${workers.filter(w => w.status !== "ABSENT").length} ouvrier(s) présent(s)` });
      onSuccess();
      navigate(`/pointage/${result.id}`);
    } catch (err: any) {
      toast({ title: "Erreur", description: err.message, variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  const presentCount = workers.filter(w => w.status === "PRESENT").length;
  const absentCount = workers.filter(w => w.status === "ABSENT").length;
  const totalDue = workers.reduce((s, w) => s + calcAmount(w), 0);

  return (
    <div className="space-y-5 mt-2">
      {/* Project + Date */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Projet *</Label>
          <Select value={projectId} onValueChange={setProjectId}>
            <SelectTrigger className="rounded-xl h-11">
              <SelectValue placeholder={projectsLoading ? "Chargement..." : "Sélectionner un chantier"} />
            </SelectTrigger>
            <SelectContent>
              {(projects as any[])?.map((p: any) => (
                <SelectItem key={p.id} value={p.id.toString()}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Date *</Label>
          <Input
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            className="rounded-xl h-11"
          />
        </div>
      </div>

      {/* Workers loading state */}
      {loadingWorkers && (
        <div className="flex items-center justify-center py-10 text-muted-foreground gap-2">
          <Loader2 className="w-5 h-5 animate-spin" />
          Chargement des ouvriers du chantier...
        </div>
      )}

      {/* No project selected */}
      {!projectId && !loadingWorkers && (
        <div className="flex flex-col items-center py-8 text-center text-muted-foreground">
          <Building2 className="w-10 h-10 mb-2 opacity-30" />
          <p className="text-sm">Sélectionnez un chantier pour afficher la liste des ouvriers</p>
        </div>
      )}

      {/* No workers assigned */}
      {projectId && !loadingWorkers && workers.length === 0 && (
        <div className="flex flex-col items-center py-8 text-center text-muted-foreground">
          <Users className="w-10 h-10 mb-2 opacity-30" />
          <p className="text-sm font-medium">Aucun ouvrier assigné à ce chantier</p>
          <p className="text-xs mt-1">Ajoutez des ouvriers dans la section Personnel</p>
        </div>
      )}

      {/* Worker list */}
      {workers.length > 0 && (
        <div className="space-y-3">
          {/* Summary bar */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-foreground">{workers.length} ouvrier(s)</span>
              <span className="text-xs text-green-700 bg-green-50 border border-green-200 px-2 py-0.5 rounded-full font-medium">{presentCount} présent(s)</span>
              {absentCount > 0 && <span className="text-xs text-red-700 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full font-medium">{absentCount} absent(s)</span>}
            </div>
            <div className="flex gap-1.5">
              <Button size="sm" variant="outline" onClick={() => setAllStatus("PRESENT")} className="h-7 text-xs rounded-lg px-2.5 text-green-700 border-green-200 hover:bg-green-50">
                Tous présents
              </Button>
              <Button size="sm" variant="outline" onClick={() => setAllStatus("ABSENT")} className="h-7 text-xs rounded-lg px-2.5 text-red-600 border-red-200 hover:bg-red-50">
                Tous absents
              </Button>
            </div>
          </div>

          {/* Workers */}
          <div className="space-y-2">
            {workers.map((w, idx) => (
              <WorkerPresenceRow
                key={w.personnelId}
                worker={w}
                onChange={(field, value) => updateWorker(idx, field, value)}
              />
            ))}
          </div>

          {/* Total */}
          <div className="flex items-center justify-between p-4 bg-primary/5 rounded-xl border border-primary/10">
            <span className="font-semibold text-foreground">Total journée</span>
            <span className="text-xl font-display font-bold text-primary">{formatFCFA(totalDue)}</span>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex justify-end gap-3 pt-2">
        <Button variant="outline" onClick={onSuccess} className="rounded-xl">Annuler</Button>
        <Button
          onClick={handleSubmit}
          disabled={isSaving || !projectId || workers.length === 0}
          className="rounded-xl bg-secondary hover:bg-secondary/90 text-white"
        >
          {isSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
          Créer la fiche
        </Button>
      </div>
    </div>
  );
}

// ─── Worker row in the creation form ──────────────────────────────────────────

function WorkerPresenceRow({ worker: w, onChange }: { worker: WorkerRow; onChange: (field: string, value: any) => void }) {
  const statusCfg = STATUS_CONFIG[w.status];
  const StatusIcon = statusCfg.icon;
  const hours = w.status !== "ABSENT" ? calcHours(w.arrivalTime, w.departureTime) : null;
  const amount = calcAmount(w);

  return (
    <div className={`border rounded-xl overflow-hidden transition-all ${w.status === "ABSENT" ? "opacity-60" : ""} ${w.expanded ? "border-primary/30 shadow-sm" : "border-border/50"}`}>
      {/* Row header */}
      <div className="flex items-center gap-3 px-4 py-3">
        {/* Avatar */}
        <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
          w.status === "PRESENT" ? "bg-green-100 text-green-700" :
          w.status === "ABSENT" ? "bg-red-100 text-red-600" :
          "bg-yellow-100 text-yellow-700"
        }`}>
          {w.name.substring(0, 2).toUpperCase()}
        </div>

        {/* Name */}
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm text-foreground truncate">{w.name}</p>
          <p className="text-xs text-muted-foreground">{w.trade}</p>
        </div>

        {/* Status toggles */}
        <div className="flex gap-1">
          {(["PRESENT", "DEMI_JOURNEE", "ABSENT"] as const).map(s => (
            <button
              key={s}
              onClick={() => onChange("status", s)}
              className={`px-2 py-1 rounded-lg text-xs font-semibold border transition-all ${
                w.status === s ? STATUS_CONFIG[s].color + " shadow-sm" : "bg-transparent text-muted-foreground border-border/50 hover:bg-muted/30"
              }`}
            >
              {STATUS_CONFIG[s].label}
            </button>
          ))}
        </div>

        {/* Hours & amount */}
        {w.status !== "ABSENT" && (
          <div className="text-right text-xs text-muted-foreground min-w-[70px]">
            {hours ? <p className="font-medium text-foreground">{Math.floor(hours)}h{Math.round((hours % 1) * 60).toString().padStart(2,"0")}</p> : null}
            <p className="font-bold text-primary">{formatFCFA(amount)}</p>
          </div>
        )}

        {/* Expand toggle */}
        <button
          onClick={() => onChange("expanded", !w.expanded)}
          className="text-muted-foreground hover:text-foreground transition-colors ml-1"
          disabled={w.status === "ABSENT"}
        >
          {w.expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      </div>

      {/* Expanded details */}
      {w.expanded && w.status !== "ABSENT" && (
        <div className="px-4 pb-4 pt-1 border-t border-border/30 bg-muted/10">
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Heure d'arrivée</Label>
              <Input
                type="time"
                value={w.arrivalTime}
                onChange={e => onChange("arrivalTime", e.target.value)}
                className="h-9 rounded-xl text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Heure de départ</Label>
              <Input
                type="time"
                value={w.departureTime}
                onChange={e => onChange("departureTime", e.target.value)}
                className="h-9 rounded-xl text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Taux journalier (FCFA)</Label>
              <Input
                type="number"
                value={w.dailyWage}
                onChange={e => onChange("dailyWage", parseFloat(e.target.value) || 0)}
                className="h-9 rounded-xl text-sm"
              />
            </div>
            <div className="col-span-3 space-y-1">
              <Label className="text-xs">Notes (optionnel)</Label>
              <Input
                type="text"
                placeholder="Remarques..."
                value={w.notes}
                onChange={e => onChange("notes", e.target.value)}
                className="h-9 rounded-xl text-sm"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Worker history view (read-only) ──────────────────────────────────────────

function WorkerHistory() {
  const { data: history, isLoading } = useQuery({
    queryKey: ["/api/pointage/my-history"],
    queryFn: () => apiFetch("/api/pointage/my-history"),
  });

  const records = (history as any[]) || [];

  return (
    <AppLayout title="Mon Historique de Pointage">
      <div className="space-y-6">
        <p className="text-muted-foreground">Consultez vos fiches de présence et vos paiements.</p>

        {isLoading ? (
          <div className="space-y-3">
            {[1,2,3].map(i => <div key={i} className="h-20 bg-muted/50 rounded-2xl animate-pulse" />)}
          </div>
        ) : records.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-16 text-center bg-white rounded-3xl border border-border/50 shadow-sm">
            <div className="w-20 h-20 bg-muted rounded-full flex items-center justify-center mb-4">
              <Eye className="w-10 h-10 text-muted-foreground/50" />
            </div>
            <h3 className="text-xl font-bold mb-2">Aucun pointage</h3>
            <p className="text-muted-foreground">Vos fiches de présence apparaîtront ici une fois saisies par le chef de chantier.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {records.map((record: any) => (
              <WorkerHistoryCard key={record.id} record={record} />
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}

function WorkerHistoryCard({ record }: { record: any }) {
  const cfg = SHEET_STATUS[record.status] || SHEET_STATUS.BROUILLON;
  const entry = record.myEntry;

  const statusEntry = entry?.status || "PRESENT";
  const entryCfg = STATUS_CONFIG[statusEntry as keyof typeof STATUS_CONFIG] || STATUS_CONFIG.PRESENT;

  function fmtHours(h: number | null): string {
    if (!h) return "—";
    return `${Math.floor(h)}h${Math.round((h % 1) * 60).toString().padStart(2,"0")}`;
  }

  return (
    <div className="bg-white border border-border/50 rounded-2xl p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 bg-secondary/10 rounded-xl flex items-center justify-center flex-shrink-0">
            <ClipboardList className="w-5 h-5 text-secondary" />
          </div>
          <div>
            <h4 className="font-bold text-foreground">{record.projectName || `Projet #${record.projectId}`}</h4>
            <p className="text-sm text-muted-foreground flex items-center gap-1 mt-0.5">
              <Calendar className="w-3 h-3" />
              {formatDate(record.date)}
            </p>
          </div>
        </div>
        <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${cfg.color} whitespace-nowrap`}>{cfg.label}</span>
      </div>

      {entry && (
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-muted/40 rounded-xl p-3">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-1">Présence</p>
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border ${entryCfg.color}`}>
              {entryCfg.label}
            </span>
          </div>
          <div className="bg-muted/40 rounded-xl p-3">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-1">Horaires</p>
            <p className="text-sm font-semibold text-foreground">
              {entry.arrivalTime && entry.departureTime
                ? `${entry.arrivalTime} – ${entry.departureTime}`
                : "—"}
            </p>
          </div>
          <div className="bg-muted/40 rounded-xl p-3">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-1">Heures</p>
            <p className="text-sm font-semibold text-foreground">{fmtHours(entry.hoursWorked)}</p>
          </div>
          <div className="bg-primary/5 border border-primary/10 rounded-xl p-3">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-1">Montant</p>
            <p className="text-sm font-bold text-primary">{entry.amountDue ? formatFCFA(entry.amountDue) : "—"}</p>
          </div>
        </div>
      )}

      {record.adminComment && record.status === "REJETEE" && (
        <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700">
          <strong>Motif de rejet :</strong> {record.adminComment}
        </div>
      )}
    </div>
  );
}
