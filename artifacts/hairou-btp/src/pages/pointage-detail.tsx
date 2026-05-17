import { useState, useRef, useCallback, useEffect } from "react";
import { AppLayout } from "@/components/layout";
import {
  useGetPointageSheet,
  useSubmitPointageSheet,
  useApprovePointageSheet,
} from "@workspace/api-client-react";
import { formatFCFA, formatDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  CheckCircle, XCircle, PenTool, Loader2, Save, FileSignature,
  Clock, AlertTriangle, MessageSquare, ChevronDown, ChevronUp,
  Lock, FileDown, UserPlus, Trash2, Edit3, Archive, ArchiveRestore,
  Cloud, MapPin, ClipboardEdit, CheckCircle2,
} from "lucide-react";
import { exportPointagePDF } from "@/lib/pdf-pointage";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import SignatureCanvas from "react-signature-canvas";
import { useAuth } from "@/hooks/use-auth";
import { WorkerModal, type WorkerData } from "@/components/worker-modal";

// ─── helpers ─────────────────────────────────────────────────────────────────

const BACKEND = import.meta.env.VITE_API_URL ?? "https://btp-gestion-de-projet.onrender.com";

function calcHours(arrival: string, departure: string): number | null {
  if (!arrival || !departure) return null;
  const [ah, am] = arrival.split(":").map(Number);
  const [dh, dm] = departure.split(":").map(Number);
  const diff = (dh * 60 + dm) - (ah * 60 + am);
  return diff > 0 ? Math.round(diff / 60 * 100) / 100 : null;
}

function calcAmountDue(entry: {
  status: string;
  payMode: string;
  hoursWorked?: number | null;
  overtimeHours?: number | null;
  dailyWage?: number | null;
  taskAmount?: number | null;
  taskProgressPct?: number | null;
}): number {
  if (entry.status === "ABSENT") return 0;
  if (entry.payMode === "PAR_TACHE") {
    const amt = entry.taskAmount || 0;
    const pct = entry.taskProgressPct ?? 100;
    return amt * (pct / 100);
  }
  const wage = entry.dailyWage || 0;
  const hours = entry.hoursWorked || 0;
  const overtime = entry.overtimeHours || 0;
  if (entry.status === "DEMI_JOURNEE") return wage / 2;
  if (entry.status === "HEURE_SUP") {
    const normalPay = (hours - overtime) * (wage / 8);
    const overtimePay = overtime * (wage / 8) * 1.5;
    return normalPay + overtimePay;
  }
  if (hours > 0) return hours * (wage / 8);
  return wage;
}

const STATUS_OPTIONS = [
  { value: "PRESENT", label: "Présent", color: "bg-green-100 text-green-700" },
  { value: "ABSENT", label: "Absent", color: "bg-red-100 text-red-700" },
  { value: "DEMI_JOURNEE", label: "Demi-journée", color: "bg-yellow-100 text-yellow-700" },
  { value: "HEURE_SUP", label: "Heures sup.", color: "bg-purple-100 text-purple-700" },
];

const WEATHER_OPTIONS = [
  { value: "ENSOLEILLE", label: "Ensoleillé ☀️" },
  { value: "NUAGEUX", label: "Nuageux ⛅" },
  { value: "PLUVIEUX", label: "Pluvieux 🌧️" },
  { value: "ORAGEUX", label: "Orageux ⛈️" },
  { value: "VENTEUX", label: "Venteux 💨" },
];

const SHEET_STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  BROUILLON: { label: "Brouillon", color: "bg-gray-100 text-gray-600" },
  SOUMISE: { label: "Soumise", color: "bg-blue-100 text-blue-700" },
  APPROUVEE: { label: "Approuvée", color: "bg-green-100 text-green-700" },
  REJETEE: { label: "Rejetée", color: "bg-red-100 text-red-700" },
  ARCHIVEE: { label: "Archivée", color: "bg-gray-200 text-gray-700" },
};

async function apiFetch(path: string, options?: RequestInit) {
  const token = localStorage.getItem("hairou_token");
  const fullUrl = path.startsWith("http") ? path : `${BACKEND}${path}`;
  const res = await fetch(fullUrl, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options?.headers,
    },
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.message || "Erreur serveur");
  }
  return res.json();
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function PointageDetail() {
  const pathId = typeof window !== "undefined"
    ? window.location.pathname.split("/").filter(Boolean).pop()
    : "0";
  const id = parseInt(pathId || "0");
  const { user } = useAuth();

  const { data: sheet, isLoading } = useGetPointageSheet(id, { query: { enabled: !!id } });
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [editedEntries, setEditedEntries] = useState<Record<number, any>>({});
  const [editedMeta, setEditedMeta] = useState<Record<string, any>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [isSignModalOpen, setIsSignModalOpen] = useState(false);
  const [isAdminModalOpen, setIsAdminModalOpen] = useState(false);
  const [isChefSignOpen, setIsChefSignOpen] = useState(false);
  const [adminComment, setAdminComment] = useState("");
  const [approvalType, setApprovalType] = useState<"approve" | "reject">("approve");
  const [reclamationEntry, setReclamationEntry] = useState<any>(null);
  const [expandedEntries, setExpandedEntries] = useState<Set<number>>(new Set());
  const [isAddWorkerOpen, setIsAddWorkerOpen] = useState(false);
  const [isAddingWorker, setIsAddingWorker] = useState(false);
  const [entrySigningFor, setEntrySigningFor] = useState<{ entryId: number; type: "arrival" | "departure" } | null>(null);
  const [editMode, setEditMode] = useState(false);

  const sigPad = useRef<any>(null);
  const chefSigPad = useRef<any>(null);
  const entrySigPad = useRef<any>(null);

  useEffect(() => {
    if (!isSignModalOpen) return;
    const t = setTimeout(() => {
      if (sigPad.current) {
        const canvas = sigPad.current.getCanvas();
        const w = canvas.offsetWidth || canvas.clientWidth || 440;
        const h = canvas.offsetHeight || canvas.clientHeight || 180;
        if (w > 0) canvas.width = w;
        if (h > 0) canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (ctx) { ctx.fillStyle = "white"; ctx.fillRect(0, 0, canvas.width, canvas.height); }
        sigPad.current.clear();
        sigPad.current.on();
      }
    }, 200);
    return () => clearTimeout(t);
  }, [isSignModalOpen]);

  useEffect(() => {
    if (!isChefSignOpen) return;
    const t = setTimeout(() => {
      if (chefSigPad.current) {
        const canvas = chefSigPad.current.getCanvas();
        const w = canvas.offsetWidth || canvas.clientWidth || 440;
        const h = canvas.offsetHeight || canvas.clientHeight || 180;
        if (w > 0) canvas.width = w;
        if (h > 0) canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (ctx) { ctx.fillStyle = "white"; ctx.fillRect(0, 0, canvas.width, canvas.height); }
        chefSigPad.current.clear();
        chefSigPad.current.on();
      }
    }, 200);
    return () => clearTimeout(t);
  }, [isChefSignOpen]);

  useEffect(() => {
    if (!entrySigningFor) return;
    const t = setTimeout(() => {
      if (entrySigPad.current) {
        const canvas = entrySigPad.current.getCanvas();
        const w = canvas.offsetWidth || canvas.clientWidth || 440;
        const h = canvas.offsetHeight || canvas.clientHeight || 180;
        if (w > 0) canvas.width = w;
        if (h > 0) canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (ctx) { ctx.fillStyle = "white"; ctx.fillRect(0, 0, canvas.width, canvas.height); }
        entrySigPad.current.clear();
        entrySigPad.current.on();
      }
    }, 200);
    return () => clearTimeout(t);
  }, [entrySigningFor]);

  const submitMutation = useSubmitPointageSheet();
  const approveMutation = useApprovePointageSheet();

  const isAdmin = user?.role === 'ADMIN';
  const isChef = user?.role === 'CHEF_CHANTIER';
  const isManager = isAdmin || isChef;
  // Édition autorisée tant que la fiche n'est pas verrouillée ni approuvée
  const canEdit = isManager && !sheet?.locked && sheet?.status !== 'APPROUVEE' && !(sheet as any)?.archived;
  const canApprove = isAdmin && sheet?.status === 'SOUMISE';
  const canSign = isManager && !sheet?.locked && !sheet?.chefSignature;
  const [isExporting, setIsExporting] = useState(false);

  // Auto-switch en mode édition pour les brouillons (UX existante)
  useEffect(() => {
    if (sheet?.status === 'BROUILLON' && canEdit) setEditMode(true);
  }, [sheet?.status, canEdit]);

  const handleExportPDF = async () => {
    if (!sheet) return;
    setIsExporting(true);
    try {
      await exportPointagePDF({
        projectName: sheet.projectName || "Projet",
        date: sheet.date,
        chefName: sheet.chefName || "—",
        status: sheet.status || "BROUILLON",
        chefSignature: sheet.chefSignature || null,
        chefSignedAt: sheet.chefSignedAt || null,
        adminComment: sheet.adminComment || null,
        entries: (sheet.entries || []).map((e: any) => ({
          workerName: e.personnelName || "—",
          status: e.status || "PRESENT",
          arrivalTime: e.arrivalTime || null,
          arrivalSignature: e.arrivalSignature || null,
          arrivalSignedAt: e.arrivalSignedAt || null,
          departureTime: e.departureTime || null,
          departureSignature: e.departureSignature || null,
          departureSignedAt: e.departureSignedAt || null,
          hoursWorked: e.hoursWorked ?? null,
          payMode: e.payMode || "PAR_JOUR",
          dailyWage: e.dailyWage ?? null,
          taskAmount: e.taskAmount ?? null,
          taskProgressPct: e.taskProgressPct ?? null,
          amountDue: e.amountDue ?? null,
          notes: e.notes || null,
        })),
      });
      toast({ title: "PDF téléchargé avec succès" });
    } catch (err: any) {
      toast({ title: "Erreur export PDF", description: err.message, variant: "destructive" });
    } finally {
      setIsExporting(false);
    }
  };

  const getEntry = useCallback((entry: any) => ({
    ...entry,
    ...(editedEntries[entry.id] || {}),
  }), [editedEntries]);

  const updateEntry = (entryId: number, field: string, value: any) => {
    setEditedEntries(prev => {
      const entry = sheet?.entries?.find((e: any) => e.id === entryId);
      const current = { ...(entry || {}), ...(prev[entryId] || {}) };
      const updated = { ...current, [field]: value };
      if (field === "arrivalTime" || field === "departureTime") {
        const arrival = field === "arrivalTime" ? value : (current.arrivalTime || "");
        const dep = field === "departureTime" ? value : (current.departureTime || "");
        const hours = calcHours(arrival, dep);
        if (hours !== null) updated.hoursWorked = hours;
      }
      return { ...prev, [entryId]: updated };
    });
  };

  const handleSave = async () => {
    if (!sheet) return;
    setIsSaving(true);
    try {
      const entries = sheet.entries?.map((e: any) => {
        const edited = editedEntries[e.id] || {};
        const merged = { ...e, ...edited };
        return {
          personnelId: e.personnelId,
          status: merged.status || "PRESENT",
          arrivalTime: merged.arrivalTime,
          arrivalSignature: merged.arrivalSignature,
          departureTime: merged.departureTime,
          departureSignature: merged.departureSignature,
          hoursWorked: merged.hoursWorked,
          overtimeHours: merged.overtimeHours || 0,
          payMode: merged.payMode || "PAR_JOUR",
          dailyWage: merged.dailyWage,
          taskId: merged.taskId,
          taskAmount: merged.taskAmount,
          taskProgressPct: merged.taskProgressPct ?? 100,
          notes: merged.notes,
        };
      });

      // Met à jour méta + entries en un seul appel
      await apiFetch(`/api/pointage/${id}`, {
        method: "PUT",
        body: JSON.stringify({ entries, ...editedMeta }),
      });

      setEditedEntries({});
      setEditedMeta({});
      queryClient.invalidateQueries({ queryKey: ["/api/pointage", id] });
      toast({ title: "Fiche sauvegardée" });
    } catch (err: any) {
      toast({ title: "Erreur", description: err.message, variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  const handleSignSubmit = () => {
    if (sigPad.current?.isEmpty()) {
      toast({ title: "Signature requise", variant: "destructive" });
      return;
    }
    const dataUrl = sigPad.current.getTrimmedCanvas().toDataURL("image/png");
    submitMutation.mutate({ id, data: { signatureData: dataUrl } }, {
      onSuccess: () => {
        setIsSignModalOpen(false);
        queryClient.invalidateQueries({ queryKey: ["/api/pointage", id] });
        toast({ title: "Fiche soumise pour validation" });
      },
      onError: (err: any) => toast({ title: "Erreur", description: err?.message, variant: "destructive" })
    });
  };

  const handleChefSign = async () => {
    if (chefSigPad.current?.isEmpty()) {
      toast({ title: "Signature requise", variant: "destructive" });
      return;
    }
    const signatureData = chefSigPad.current.getTrimmedCanvas().toDataURL("image/png");
    try {
      await apiFetch(`/api/pointage/${id}/sign-chef`, {
        method: "POST",
        body: JSON.stringify({ signatureData }),
      });
      setIsChefSignOpen(false);
      queryClient.invalidateQueries({ queryKey: ["/api/pointage", id] });
      toast({ title: "Signature apposée" });
    } catch (err: any) {
      toast({ title: "Erreur", description: err.message, variant: "destructive" });
    }
  };

  const handleAdminAction = () => {
    approveMutation.mutate({
      id,
      data: { approved: approvalType === "approve", comment: adminComment }
    }, {
      onSuccess: () => {
        setIsAdminModalOpen(false);
        queryClient.invalidateQueries({ queryKey: ["/api/pointage", id] });
        toast({ title: approvalType === "approve" ? "Pointage approuvé" : "Pointage rejeté" });
      }
    });
  };

  // Ajout d'un ouvrier en cours d'édition de la fiche (auto-création personnel si nouveau)
  const handleAddWorker = async (data: WorkerData) => {
    setIsAddingWorker(true);
    try {
      await apiFetch(`/api/pointage/${id}/entries`, {
        method: "POST",
        body: JSON.stringify({
          newPersonnel: data,
          status: "PRESENT",
          dailyWage: data.dailyWage,
        }),
      });
      setIsAddWorkerOpen(false);
      queryClient.invalidateQueries({ queryKey: ["/api/pointage", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/personnel"] });
      toast({ title: "Ouvrier ajouté à la fiche", description: `${data.name} a été ajouté et enregistré dans le personnel.` });
    } catch (err: any) {
      toast({ title: "Erreur", description: err.message, variant: "destructive" });
      throw err;
    } finally {
      setIsAddingWorker(false);
    }
  };

  const handleDeleteEntry = async (entryId: number) => {
    if (!confirm("Retirer cet ouvrier de la fiche ?")) return;
    try {
      await apiFetch(`/api/pointage/${id}/entries/${entryId}`, { method: "DELETE" });
      queryClient.invalidateQueries({ queryKey: ["/api/pointage", id] });
      toast({ title: "Ouvrier retiré" });
    } catch (err: any) {
      toast({ title: "Erreur", description: err.message, variant: "destructive" });
    }
  };

  const handleEntrySign = async () => {
    if (!entrySigningFor) return;
    if (entrySigPad.current?.isEmpty()) {
      toast({ title: "Signature requise", variant: "destructive" });
      return;
    }
    const signatureData = entrySigPad.current.getTrimmedCanvas().toDataURL("image/png");
    try {
      await apiFetch(`/api/pointage/${id}/entries/${entrySigningFor.entryId}/sign`, {
        method: "POST",
        body: JSON.stringify({ type: entrySigningFor.type, signatureData }),
      });
      setEntrySigningFor(null);
      queryClient.invalidateQueries({ queryKey: ["/api/pointage", id] });
      toast({ title: "Signature ajoutée" });
    } catch (err: any) {
      toast({ title: "Erreur", description: err.message, variant: "destructive" });
    }
  };

  const handleArchive = async () => {
    if (!confirm((sheet as any)?.archived ? "Restaurer cette fiche depuis les archives ?" : "Archiver cette fiche ?")) return;
    try {
      const action = (sheet as any)?.archived ? "unarchive" : "archive";
      await apiFetch(`/api/pointage/${id}/${action}`, { method: "POST" });
      queryClient.invalidateQueries({ queryKey: ["/api/pointage", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/pointage"] });
      toast({ title: action === "archive" ? "Fiche archivée" : "Fiche restaurée" });
    } catch (err: any) {
      toast({ title: "Erreur", description: err.message, variant: "destructive" });
    }
  };

  if (isLoading) return (
    <AppLayout title="Chargement...">
      <div className="space-y-4">
        {[1,2,3].map(i => <div key={i} className="h-24 bg-muted/50 rounded-2xl animate-pulse" />)}
      </div>
    </AppLayout>
  );
  if (!sheet) return <AppLayout title="Erreur"><p>Feuille introuvable.</p></AppLayout>;

  const sheetAny = sheet as any;
  const statusCfg = SHEET_STATUS_CONFIG[sheet.status] || SHEET_STATUS_CONFIG.BROUILLON;
  const hasChanges = Object.keys(editedEntries).length > 0 || Object.keys(editedMeta).length > 0;
  const isEditing = editMode && canEdit;

  const totalDue = sheet.entries?.reduce((sum: number, e: any) => {
    const entry = getEntry(e);
    return sum + calcAmountDue({
      status: entry.status || "PRESENT",
      payMode: entry.payMode || "PAR_JOUR",
      hoursWorked: entry.hoursWorked,
      overtimeHours: entry.overtimeHours,
      dailyWage: entry.dailyWage,
      taskAmount: entry.taskAmount,
      taskProgressPct: entry.taskProgressPct,
    });
  }, 0) ?? 0;

  const presentCount = sheet.entries?.filter((e: any) => (getEntry(e).status || "PRESENT") !== "ABSENT").length || 0;
  const absentCount = sheet.entries?.filter((e: any) => (getEntry(e).status || "PRESENT") === "ABSENT").length || 0;
  const signedCount = sheet.entries?.filter((e: any) => e.arrivalSignature || e.departureSignature).length || 0;

  return (
    <AppLayout title={`Pointage — ${formatDate(sheet.date)}`}>
      <div className="space-y-6">

        {/* En-tête de la fiche */}
        <div className="bg-white rounded-2xl border border-border/50 shadow-sm p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex-1">
              <h2 className="text-xl font-bold text-foreground">{sheet.projectName}</h2>
              <p className="text-muted-foreground text-sm mt-1">
                Chef : {sheet.chefName} · {sheet.entries?.length || 0} ouvrier(s) · {formatDate(sheet.date)}
              </p>
              {sheet.adminComment && (
                <div className="mt-2 p-3 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
                  <strong>Commentaire admin :</strong> {sheet.adminComment}
                </div>
              )}
            </div>
            <div className="flex items-center gap-3">
              {sheetAny.archived && (
                <span className="flex items-center gap-1 text-xs font-medium text-gray-600 bg-gray-100 px-2 py-1 rounded-full">
                  <Archive className="w-3.5 h-3.5" /> Archivée
                </span>
              )}
              {sheet.locked && (
                <span className="flex items-center gap-1 text-xs font-medium text-gray-500">
                  <Lock className="w-3.5 h-3.5" /> Verrouillée
                </span>
              )}
              <Badge className={`${statusCfg.color} border-0 px-3 py-1 text-sm font-semibold`}>
                {statusCfg.label}
              </Badge>
            </div>
          </div>

          {/* Champs pro de la fiche */}
          <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs flex items-center gap-1"><Cloud className="w-3 h-3" /> Météo</Label>
              {isEditing ? (
                <Select
                  value={editedMeta.weather ?? sheetAny.weather ?? ""}
                  onValueChange={v => setEditedMeta({ ...editedMeta, weather: v })}
                >
                  <SelectTrigger className="h-9 rounded-xl text-sm"><SelectValue placeholder="Météo du jour" /></SelectTrigger>
                  <SelectContent>
                    {WEATHER_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              ) : (
                <p className="text-sm font-medium">
                  {WEATHER_OPTIONS.find(o => o.value === sheetAny.weather)?.label || "—"}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs flex items-center gap-1"><MapPin className="w-3 h-3" /> Localisation chantier</Label>
              {isEditing ? (
                <Input
                  value={editedMeta.siteLocation ?? sheetAny.siteLocation ?? ""}
                  onChange={e => setEditedMeta({ ...editedMeta, siteLocation: e.target.value })}
                  placeholder="Zone, étage, bâtiment…"
                  className="h-9 rounded-xl text-sm"
                />
              ) : (
                <p className="text-sm font-medium">{sheetAny.siteLocation || "—"}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Début chantier</Label>
              {isEditing ? (
                <Input
                  type="time"
                  value={editedMeta.workStartTime ?? sheetAny.workStartTime ?? ""}
                  onChange={e => setEditedMeta({ ...editedMeta, workStartTime: e.target.value })}
                  className="h-9 rounded-xl text-sm"
                />
              ) : (
                <p className="text-sm font-medium">{sheetAny.workStartTime || "—"}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Fin chantier</Label>
              {isEditing ? (
                <Input
                  type="time"
                  value={editedMeta.workEndTime ?? sheetAny.workEndTime ?? ""}
                  onChange={e => setEditedMeta({ ...editedMeta, workEndTime: e.target.value })}
                  className="h-9 rounded-xl text-sm"
                />
              ) : (
                <p className="text-sm font-medium">{sheetAny.workEndTime || "—"}</p>
              )}
            </div>

            <div className="space-y-1.5 sm:col-span-2 lg:col-span-4">
              <Label className="text-xs flex items-center gap-1"><ClipboardEdit className="w-3 h-3" /> Observations du chef</Label>
              {isEditing ? (
                <Textarea
                  value={editedMeta.observations ?? sheetAny.observations ?? ""}
                  onChange={e => setEditedMeta({ ...editedMeta, observations: e.target.value })}
                  placeholder="Incidents, retards, livraisons matériaux, points de sécurité…"
                  rows={2}
                  className="rounded-xl text-sm resize-none"
                />
              ) : (
                <p className="text-sm text-muted-foreground italic">
                  {sheetAny.observations || "Aucune observation"}
                </p>
              )}
            </div>
          </div>

          {/* KPI */}
          <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-primary/5 rounded-xl p-3 text-center">
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Total à payer</p>
              <p className="text-lg font-display font-bold text-primary mt-1">{formatFCFA(totalDue)}</p>
            </div>
            <div className="bg-green-50 rounded-xl p-3 text-center">
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Présents</p>
              <p className="text-lg font-display font-bold text-green-700 mt-1">{presentCount}</p>
            </div>
            <div className="bg-red-50 rounded-xl p-3 text-center">
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Absents</p>
              <p className="text-lg font-display font-bold text-red-700 mt-1">{absentCount}</p>
            </div>
            <div className="bg-blue-50 rounded-xl p-3 text-center">
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Signés</p>
              <p className="text-lg font-display font-bold text-blue-700 mt-1">{signedCount}/{sheet.entries?.length || 0}</p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-wrap gap-3 mt-5 pt-5 border-t border-border/50">
            <Button
              variant="outline"
              onClick={handleExportPDF}
              disabled={isExporting}
              className="rounded-xl border-primary/40 text-primary hover:bg-primary/5"
            >
              {isExporting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <FileDown className="w-4 h-4 mr-2" />}
              Exporter PDF
            </Button>

            {isManager && (
              <Button
                variant="outline"
                onClick={handleArchive}
                className="rounded-xl border-gray-300 text-gray-600 hover:bg-gray-50"
              >
                {sheetAny.archived
                  ? <><ArchiveRestore className="w-4 h-4 mr-2" /> Restaurer</>
                  : <><Archive className="w-4 h-4 mr-2" /> Archiver</>}
              </Button>
            )}

            <div className="ml-auto flex flex-wrap gap-3">
              {canEdit && !editMode && (
                <Button onClick={() => setEditMode(true)} variant="outline" className="rounded-xl border-accent text-accent hover:bg-accent/5">
                  <Edit3 className="w-4 h-4 mr-2" /> Modifier
                </Button>
              )}

              {canEdit && editMode && (
                <Button onClick={() => setIsAddWorkerOpen(true)} variant="outline" className="rounded-xl border-secondary text-secondary hover:bg-secondary/5">
                  <UserPlus className="w-4 h-4 mr-2" /> Ajouter un ouvrier
                </Button>
              )}

              {isEditing && hasChanges && (
                <Button onClick={handleSave} disabled={isSaving} className="rounded-xl bg-primary text-white">
                  {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                  Sauvegarder
                </Button>
              )}

              {canSign && (
                <Button onClick={() => setIsChefSignOpen(true)} variant="outline" className="rounded-xl border-primary text-primary">
                  <PenTool className="w-4 h-4 mr-2" /> Signer la fiche
                </Button>
              )}

              {sheet.chefSignature && canEdit && !submitMutation.isPending && (
                <Button onClick={() => setIsSignModalOpen(true)} className="rounded-xl bg-accent text-white">
                  <FileSignature className="w-4 h-4 mr-2" /> Soumettre pour validation
                </Button>
              )}

              {!sheet.chefSignature && canEdit && (
                <Button onClick={() => setIsSignModalOpen(true)} className="rounded-xl bg-accent text-white">
                  <FileSignature className="w-4 h-4 mr-2" /> Signer & Soumettre
                </Button>
              )}

              {canApprove && (
                <>
                  <Button onClick={() => { setApprovalType("approve"); setIsAdminModalOpen(true); }} className="rounded-xl bg-green-600 hover:bg-green-700 text-white">
                    <CheckCircle className="w-4 h-4 mr-2" /> Approuver
                  </Button>
                  <Button onClick={() => { setApprovalType("reject"); setIsAdminModalOpen(true); }} variant="outline" className="rounded-xl border-destructive text-destructive hover:bg-destructive/10">
                    <XCircle className="w-4 h-4 mr-2" /> Rejeter
                  </Button>
                </>
              )}
            </div>
          </div>

          {sheet.chefSignature && (
            <div className="mt-4 flex items-center gap-3 text-sm text-green-700">
              <CheckCircle className="w-4 h-4" />
              <span>Fiche signée par le chef</span>
              <img src={sheet.chefSignature} alt="Signature chef" className="h-10 border rounded-lg ml-2 bg-white p-1" />
            </div>
          )}
        </div>

        {/* Entrées ouvriers */}
        <div className="space-y-3">
          {sheet.entries?.length === 0 && (
            <div className="bg-white rounded-2xl border border-dashed border-border p-10 text-center">
              <p className="text-muted-foreground">Aucun ouvrier sur cette fiche.</p>
              {canEdit && (
                <Button onClick={() => setIsAddWorkerOpen(true)} className="mt-4 rounded-xl bg-secondary text-white">
                  <UserPlus className="w-4 h-4 mr-2" /> Ajouter le premier ouvrier
                </Button>
              )}
            </div>
          )}
          {sheet.entries?.map((entry: any) => {
            const e = getEntry(entry);
            const statusOpt = STATUS_OPTIONS.find(s => s.value === (e.status || "PRESENT"));
            const isExpanded = expandedEntries.has(entry.id);
            const amount = calcAmountDue({
              status: e.status || "PRESENT",
              payMode: e.payMode || "PAR_JOUR",
              hoursWorked: e.hoursWorked,
              overtimeHours: e.overtimeHours,
              dailyWage: e.dailyWage,
              taskAmount: e.taskAmount,
              taskProgressPct: e.taskProgressPct,
            });
            const hasArrivalSig = !!entry.arrivalSignature;
            const hasDepartureSig = !!entry.departureSignature;

            return (
              <div key={entry.id} className="bg-white rounded-2xl border border-border/50 shadow-sm overflow-hidden">
                <div
                  className="flex items-center gap-3 px-5 py-4 cursor-pointer hover:bg-muted/20 transition-colors"
                  onClick={() => setExpandedEntries(prev => {
                    const next = new Set(prev);
                    if (next.has(entry.id)) next.delete(entry.id); else next.add(entry.id);
                    return next;
                  })}
                >
                  <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-sm font-bold text-primary flex-shrink-0">
                    {(entry.personnelName || "?").substring(0, 2).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-foreground">{entry.personnelName}</p>
                    <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
                      {entry.personnelTrade && <span className="font-medium text-secondary/80">{entry.personnelTrade}</span>}
                      {e.arrivalTime && <span><Clock className="w-3 h-3 inline mr-0.5" />{e.arrivalTime}–{e.departureTime || "?"}</span>}
                      {e.hoursWorked > 0 && <span>{e.hoursWorked}h</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {/* Indicateurs de signature */}
                    <div className="hidden sm:flex items-center gap-1">
                      <span title="Signature arrivée" className={`w-2 h-2 rounded-full ${hasArrivalSig ? 'bg-green-500' : 'bg-gray-300'}`} />
                      <span title="Signature départ" className={`w-2 h-2 rounded-full ${hasDepartureSig ? 'bg-green-500' : 'bg-gray-300'}`} />
                    </div>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${statusOpt?.color || 'bg-gray-100 text-gray-600'}`}>
                      {statusOpt?.label}
                    </span>
                    <span className="font-bold text-foreground text-sm">{formatFCFA(amount)}</span>
                    <Button variant="ghost" size="icon" className="w-7 h-7" onClick={ev => { ev.stopPropagation(); setReclamationEntry(entry); }}>
                      <MessageSquare className="w-4 h-4 text-muted-foreground hover:text-primary" />
                    </Button>
                    {isExpanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                  </div>
                </div>

                {isExpanded && (
                  <div className="px-5 pb-5 pt-2 border-t border-border/30 space-y-4">
                    {/* Infos personnel */}
                    {(entry.personnelPhone || entry.personnelIdNumber) && (
                      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                        {entry.personnelPhone && <span>📞 {entry.personnelPhone}</span>}
                        {entry.personnelIdNumber && <span>🪪 CNI : {entry.personnelIdNumber}</span>}
                      </div>
                    )}

                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                      <div className="space-y-1.5">
                        <Label className="text-xs">Statut présence</Label>
                        {isEditing ? (
                          <Select value={e.status || "PRESENT"} onValueChange={v => updateEntry(entry.id, "status", v)}>
                            <SelectTrigger className="h-9 rounded-xl text-sm"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {STATUS_OPTIONS.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        ) : <p className="text-sm font-medium">{statusOpt?.label}</p>}
                      </div>

                      <div className="space-y-1.5">
                        <Label className="text-xs">Mode de paiement</Label>
                        {isEditing ? (
                          <Select value={e.payMode || "PAR_JOUR"} onValueChange={v => updateEntry(entry.id, "payMode", v)}>
                            <SelectTrigger className="h-9 rounded-xl text-sm"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="PAR_JOUR">Par jour</SelectItem>
                              <SelectItem value="PAR_TACHE">Par tâche</SelectItem>
                            </SelectContent>
                          </Select>
                        ) : <p className="text-sm font-medium">{e.payMode === "PAR_TACHE" ? "Par tâche" : "Par jour"}</p>}
                      </div>

                      <div className="space-y-1.5">
                        <Label className="text-xs">Heure arrivée</Label>
                        {isEditing ? (
                          <Input type="time" value={e.arrivalTime || ""} onChange={ev => updateEntry(entry.id, "arrivalTime", ev.target.value)} className="h-9 rounded-xl text-sm" />
                        ) : <p className="text-sm font-medium">{e.arrivalTime || "—"}</p>}
                      </div>

                      <div className="space-y-1.5">
                        <Label className="text-xs">Heure départ</Label>
                        {isEditing ? (
                          <Input type="time" value={e.departureTime || ""} onChange={ev => updateEntry(entry.id, "departureTime", ev.target.value)} className="h-9 rounded-xl text-sm" />
                        ) : <p className="text-sm font-medium">{e.departureTime || "—"}</p>}
                      </div>

                      <div className="space-y-1.5">
                        <Label className="text-xs">Heures travaillées</Label>
                        {isEditing ? (
                          <Input type="number" step="0.25" min="0" max="24" value={e.hoursWorked || ""} onChange={ev => updateEntry(entry.id, "hoursWorked", parseFloat(ev.target.value) || 0)} className="h-9 rounded-xl text-sm" />
                        ) : <p className="text-sm font-medium">{e.hoursWorked ? `${e.hoursWorked}h` : "—"}</p>}
                      </div>

                      {(e.status === "HEURE_SUP" || e.overtimeHours > 0) && (
                        <div className="space-y-1.5">
                          <Label className="text-xs">Heures sup.</Label>
                          {isEditing ? (
                            <Input type="number" step="0.25" min="0" value={e.overtimeHours || ""} onChange={ev => updateEntry(entry.id, "overtimeHours", parseFloat(ev.target.value) || 0)} className="h-9 rounded-xl text-sm" />
                          ) : <p className="text-sm font-medium">{e.overtimeHours ? `${e.overtimeHours}h` : "—"}</p>}
                        </div>
                      )}

                      {(e.payMode || "PAR_JOUR") === "PAR_JOUR" && (
                        <div className="space-y-1.5">
                          <Label className="text-xs">Salaire journalier (FCFA)</Label>
                          {isEditing ? (
                            <Input type="number" min="0" value={e.dailyWage || ""} onChange={ev => updateEntry(entry.id, "dailyWage", parseFloat(ev.target.value) || 0)} className="h-9 rounded-xl text-sm" placeholder={entry.defaultDailyWage ? `${entry.defaultDailyWage}` : "0"} />
                          ) : <p className="text-sm font-medium">{e.dailyWage ? formatFCFA(e.dailyWage) : "—"}</p>}
                        </div>
                      )}

                      {e.payMode === "PAR_TACHE" && (
                        <>
                          <div className="space-y-1.5">
                            <Label className="text-xs">Montant tâche (FCFA)</Label>
                            {isEditing ? (
                              <Input type="number" min="0" value={e.taskAmount || ""} onChange={ev => updateEntry(entry.id, "taskAmount", parseFloat(ev.target.value) || 0)} className="h-9 rounded-xl text-sm" />
                            ) : <p className="text-sm font-medium">{e.taskAmount ? formatFCFA(e.taskAmount) : "—"}</p>}
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-xs">Avancement (%)</Label>
                            {isEditing ? (
                              <Input type="number" min="0" max="100" value={e.taskProgressPct ?? 100} onChange={ev => updateEntry(entry.id, "taskProgressPct", parseInt(ev.target.value) || 100)} className="h-9 rounded-xl text-sm" />
                            ) : <p className="text-sm font-medium">{e.taskProgressPct ?? 100}%</p>}
                          </div>
                        </>
                      )}

                      <div className="space-y-1.5 col-span-2">
                        <Label className="text-xs">Notes</Label>
                        {isEditing ? (
                          <Input value={e.notes || ""} onChange={ev => updateEntry(entry.id, "notes", ev.target.value)} placeholder="Commentaire..." className="h-9 rounded-xl text-sm" />
                        ) : <p className="text-sm text-muted-foreground">{e.notes || "—"}</p>}
                      </div>
                    </div>

                    {/* Signatures arrivée / départ */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-3 border-t border-border/30">
                      <SignatureSlot
                        label="Signature arrivée"
                        signedAt={entry.arrivalSignedAt}
                        signature={entry.arrivalSignature}
                        canSign={canEdit}
                        onClickSign={() => setEntrySigningFor({ entryId: entry.id, type: "arrival" })}
                      />
                      <SignatureSlot
                        label="Signature départ"
                        signedAt={entry.departureSignedAt}
                        signature={entry.departureSignature}
                        canSign={canEdit}
                        onClickSign={() => setEntrySigningFor({ entryId: entry.id, type: "departure" })}
                      />
                    </div>

                    <div className="flex items-center justify-between bg-primary/5 rounded-xl px-4 py-3">
                      <span className="text-sm font-medium text-muted-foreground">Montant dû</span>
                      <div className="flex items-center gap-3">
                        <span className="text-lg font-display font-bold text-primary">{formatFCFA(amount)}</span>
                        {canEdit && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="w-8 h-8 text-destructive hover:bg-destructive/10"
                            onClick={() => handleDeleteEntry(entry.id)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Modal : Ajouter un ouvrier */}
      <WorkerModal
        open={isAddWorkerOpen}
        onOpenChange={setIsAddWorkerOpen}
        onSubmit={handleAddWorker}
        isLoading={isAddingWorker}
        title="Ajouter un ouvrier à la fiche"
        submitLabel="Ajouter au pointage"
      />

      {/* Modal : Signer & Soumettre */}
      <Dialog open={isSignModalOpen} onOpenChange={setIsSignModalOpen}>
        <DialogContent className="sm:max-w-[480px] rounded-2xl">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl">Signature du Chef</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            En signant, vous certifiez l'exactitude de cette feuille de pointage du <strong>{formatDate(sheet.date)}</strong>.
          </p>
          <div className="border-2 border-dashed border-border rounded-xl overflow-hidden bg-white">
            <SignatureCanvas
              ref={sigPad}
              penColor="#011638"
              canvasProps={{ style: { width: "100%", height: "180px", display: "block", touchAction: "none" } }}
            />
          </div>
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => sigPad.current?.clear()} className="rounded-xl">Effacer</Button>
            <Button variant="outline" onClick={() => setIsSignModalOpen(false)} className="flex-1 rounded-xl">Annuler</Button>
            <Button onClick={handleSignSubmit} disabled={submitMutation.isPending} className="flex-1 rounded-xl bg-accent text-white">
              {submitMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <><FileSignature className="w-4 h-4 mr-2" />Soumettre</>}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal : Signature chef seule */}
      <Dialog open={isChefSignOpen} onOpenChange={setIsChefSignOpen}>
        <DialogContent className="sm:max-w-[480px] rounded-2xl">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl">Signature du Chef</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">Signez pour valider la fiche avant soumission.</p>
          <div className="border-2 border-dashed border-border rounded-xl overflow-hidden bg-white">
            <SignatureCanvas
              ref={chefSigPad}
              penColor="#011638"
              canvasProps={{ style: { width: "100%", height: "180px", display: "block", touchAction: "none" } }}
            />
          </div>
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => chefSigPad.current?.clear()} className="rounded-xl">Effacer</Button>
            <Button variant="outline" onClick={() => setIsChefSignOpen(false)} className="flex-1 rounded-xl">Annuler</Button>
            <Button onClick={handleChefSign} className="flex-1 rounded-xl bg-primary text-white">
              <PenTool className="w-4 h-4 mr-2" /> Apposer ma signature
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal : Signature a posteriori pour une entry */}
      <Dialog open={!!entrySigningFor} onOpenChange={(o) => { if (!o) setEntrySigningFor(null); }}>
        <DialogContent className="sm:max-w-[480px] rounded-2xl">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl">
              Signature {entrySigningFor?.type === "arrival" ? "d'arrivée" : "de départ"}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            L'ouvrier signe pour confirmer son {entrySigningFor?.type === "arrival" ? "arrivée" : "départ"} sur le chantier.
          </p>
          <div className="border-2 border-dashed border-border rounded-xl overflow-hidden bg-white">
            <SignatureCanvas
              ref={entrySigPad}
              penColor="#011638"
              canvasProps={{ style: { width: "100%", height: "180px", display: "block", touchAction: "none" } }}
            />
          </div>
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => entrySigPad.current?.clear()} className="rounded-xl">Effacer</Button>
            <Button variant="outline" onClick={() => setEntrySigningFor(null)} className="flex-1 rounded-xl">Annuler</Button>
            <Button onClick={handleEntrySign} className="flex-1 rounded-xl bg-accent text-white">
              <PenTool className="w-4 h-4 mr-2" /> Apposer la signature
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal : Approbation admin */}
      <Dialog open={isAdminModalOpen} onOpenChange={setIsAdminModalOpen}>
        <DialogContent className="sm:max-w-[420px] rounded-2xl">
          <DialogHeader>
            <DialogTitle className={`font-display text-2xl ${approvalType === "approve" ? "text-green-700" : "text-destructive"}`}>
              {approvalType === "approve" ? "Approuver la fiche" : "Rejeter la fiche"}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Fiche du <strong>{formatDate(sheet.date)}</strong> — Total : <strong>{formatFCFA(totalDue)}</strong>
          </p>
          <div className="space-y-2">
            <Label>Commentaire (optionnel)</Label>
            <Textarea value={adminComment} onChange={e => setAdminComment(e.target.value)} placeholder="Motif du rejet, remarques..." className="rounded-xl resize-none" rows={3} />
          </div>
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => setIsAdminModalOpen(false)} className="flex-1 rounded-xl">Annuler</Button>
            <Button onClick={handleAdminAction} disabled={approveMutation.isPending}
              className={`flex-1 rounded-xl text-white ${approvalType === "approve" ? "bg-green-600 hover:bg-green-700" : "bg-destructive hover:bg-destructive/90"}`}>
              {approveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : approvalType === "approve" ? "Approuver" : "Rejeter"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal : Réclamation */}
      {reclamationEntry && (
        <ReclamationModal entry={reclamationEntry} sheetId={id} onClose={() => setReclamationEntry(null)} />
      )}
    </AppLayout>
  );
}

// ─── SignatureSlot ────────────────────────────────────────────────────────────

function SignatureSlot({
  label, signedAt, signature, canSign, onClickSign,
}: { label: string; signedAt?: string | null; signature?: string | null; canSign: boolean; onClickSign: () => void; }) {
  return (
    <div className={`flex items-center justify-between p-3 rounded-xl border ${signature ? 'border-green-200 bg-green-50/40' : 'border-dashed border-border bg-muted/20'}`}>
      <div className="flex-1">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{label}</p>
        {signature ? (
          <div className="flex items-center gap-2 mt-1.5">
            <CheckCircle2 className="w-4 h-4 text-green-600" />
            <img src={signature} alt={label} className="h-9 max-w-[120px] bg-white border rounded-md p-0.5" />
            {signedAt && <span className="text-[10px] text-muted-foreground">{new Date(signedAt).toLocaleString("fr-FR")}</span>}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground italic mt-1">Non signé</p>
        )}
      </div>
      {canSign && (
        <Button
          size="sm"
          variant={signature ? "outline" : "default"}
          className={`rounded-xl text-xs ${signature ? '' : 'bg-accent text-white'}`}
          onClick={onClickSign}
        >
          <PenTool className="w-3 h-3 mr-1" /> {signature ? "Re-signer" : "Signer"}
        </Button>
      )}
    </div>
  );
}

// ─── Réclamation Modal ────────────────────────────────────────────────────────

function ReclamationModal({ entry, sheetId, onClose }: { entry: any; sheetId: number; onClose: () => void }) {
  const { toast } = useToast();
  const [type, setType] = useState("ERREUR_PRESENCE");
  const [description, setDescription] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim()) { toast({ title: "Description requise", variant: "destructive" }); return; }
    setIsLoading(true);
    try {
      await apiFetch("/api/reclamations", {
        method: "POST",
        body: JSON.stringify({ sheetId, type, description }),
      });
      toast({ title: "Réclamation envoyée", description: "L'administrateur en sera informé." });
      onClose();
    } catch (err: any) {
      toast({ title: "Erreur", description: err.message, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[420px] rounded-2xl">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">
            <AlertTriangle className="w-5 h-5 inline-block mr-2 text-amber-500" />
            Soumettre une réclamation
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">Réclamation pour <strong>{entry.personnelName}</strong></p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Type de réclamation</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ERREUR_SALAIRE">Erreur de salaire</SelectItem>
                <SelectItem value="ERREUR_PRESENCE">Erreur de présence</SelectItem>
                <SelectItem value="AUTRE">Autre</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Description *</Label>
            <Textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Décrivez le problème..." className="rounded-xl resize-none" rows={4} required />
          </div>
          <div className="flex gap-3">
            <Button type="button" variant="outline" onClick={onClose} className="flex-1 rounded-xl">Annuler</Button>
            <Button type="submit" disabled={isLoading} className="flex-1 rounded-xl bg-amber-600 hover:bg-amber-700 text-white">
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Envoyer"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
