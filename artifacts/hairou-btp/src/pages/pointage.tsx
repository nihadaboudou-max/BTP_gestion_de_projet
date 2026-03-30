import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useListPointageSheets } from "@workspace/api-client-react";
import { formatDate, formatFCFA } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Plus, ClipboardList, Clock, ArrowRight, Eye,
  Calendar, CheckCircle2, XCircle, MinusCircle, AlertTriangle, ArrowLeft
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";

// ─── helpers ─────────────────────────────────────────────────────────────────

function apiFetch(path: string, opts?: RequestInit) {
  const token = localStorage.getItem("hairou_token");
  const BACKEND = "https://btp-gestion-de-projet.onrender.com";
  const fullUrl = path.startsWith("http") ? path : `${BACKEND}${path}`;
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

const SHEET_STATUS: Record<string, { label: string; color: string }> = {
  BROUILLON: { label: "Brouillon",  color: "bg-gray-100 text-gray-600" },
  SOUMISE:   { label: "En attente", color: "bg-blue-100 text-blue-700" },
  APPROUVEE: { label: "Approuvée",  color: "bg-green-100 text-green-700" },
  REJETEE:   { label: "Rejetée",    color: "bg-red-100 text-red-700" },
};

const MONTHS_FR = [
  "Janvier","Février","Mars","Avril","Mai","Juin",
  "Juillet","Août","Septembre","Octobre","Novembre","Décembre"
];

// ─── Main page ────────────────────────────────────────────────────────────────

export default function Pointage() {
  const { user } = useAuth();
  const [, navigate] = useLocation();

  if (user?.role === "OUVRIER") {
    return <WorkerHistory />;
  }

  return <ChefAdminList onNew={() => navigate("/pointage/new")} />;
}

// ─── Chef/Admin list ──────────────────────────────────────────────────────────

function ChefAdminList({ onNew }: { onNew: () => void }) {
  const { data: sheets, isLoading } = useListPointageSheets();

  return (
    <AppLayout title="Feuilles de Pointage">
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <p className="text-muted-foreground">Suivez la présence et les heures de vos équipes.</p>
          <Button
            onClick={onNew}
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
            <h3 className="text-xl font-bold mb-2">Aucune fiche de pointage</h3>
            <p className="text-muted-foreground mb-6">Commencez par créer une feuille de présence pour un chantier.</p>
            <Button onClick={onNew} className="rounded-xl">Nouveau Pointage</Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {(sheets as any[])?.map((sheet: any) => (
              <SheetCard key={sheet.id} sheet={sheet} />
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}

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
          <p className="text-sm font-bold text-primary">{formatFCFA(sheet.totalPay)}</p>
        )}
        <div className="flex items-center justify-end mt-2">
          <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
        </div>
      </div>
    </Link>
  );
}

// ─── Worker history view ──────────────────────────────────────────────────────

function WorkerHistory() {
  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth());
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [claimEntry, setClaimEntry] = useState<any>(null);
  const [, navigate] = useLocation();

  const { data: history, isLoading } = useQuery({
    queryKey: ["/api/pointage/my-history"],
    queryFn: () => apiFetch("/api/pointage/my-history"),
  });

  const records = ((history as any[]) || []).filter((r: any) => {
    if (!r.date) return true;
    const d = new Date(r.date);
    return d.getMonth() === selectedMonth && d.getFullYear() === selectedYear;
  });

  // Summary stats
  const presentDays = records.filter(r => r.myEntry?.status === "PRESENT" || r.myEntry?.status === "HEURE_SUP").length;
  const halfDays = records.filter(r => r.myEntry?.status === "DEMI_JOURNEE").length;
  const absentDays = records.filter(r => r.myEntry?.status === "ABSENT").length;
  const totalSalaire = records.reduce((s: number, r: any) => s + (r.myEntry?.amountDue || 0), 0);

  function fmtHours(h: number | null): string {
    if (!h) return "—";
    return `${Math.floor(h)}h${Math.round((h % 1) * 60).toString().padStart(2, "0")}`;
  }

  function statusLabel(s: string) {
    const m: Record<string, { label: string; icon: any; color: string }> = {
      PRESENT:      { label: "Présent",   icon: CheckCircle2, color: "text-green-700 bg-green-50" },
      ABSENT:       { label: "Absent",    icon: XCircle,      color: "text-red-600 bg-red-50" },
      DEMI_JOURNEE: { label: "Demi-j.",   icon: MinusCircle,  color: "text-yellow-700 bg-yellow-50" },
      HEURE_SUP:    { label: "H. Sup.",   icon: Clock,        color: "text-purple-700 bg-purple-50" },
    };
    return m[s] || { label: s, icon: Clock, color: "text-gray-600 bg-gray-50" };
  }

  const yearOptions = [now.getFullYear(), now.getFullYear() - 1];

  return (
    <AppLayout title="Mon Historique de Pointage">
      <div className="space-y-6">

        {/* Back button */}
        <Button variant="ghost" onClick={() => navigate("/")} className="text-muted-foreground -ml-2 w-fit">
          <ArrowLeft className="w-4 h-4 mr-1.5" />
          Retour au tableau de bord
        </Button>

        {/* Month filter */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex gap-2">
            <Select value={selectedMonth.toString()} onValueChange={v => setSelectedMonth(parseInt(v))}>
              <SelectTrigger className="w-36 rounded-xl h-10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MONTHS_FR.map((m, i) => <SelectItem key={i} value={i.toString()}>{m}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={selectedYear.toString()} onValueChange={v => setSelectedYear(parseInt(v))}>
              <SelectTrigger className="w-24 rounded-xl h-10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {yearOptions.map(y => <SelectItem key={y} value={y.toString()}>{y}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <p className="text-sm text-muted-foreground ml-1">
            {MONTHS_FR[selectedMonth]} {selectedYear}
          </p>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-green-50 border border-green-100 rounded-2xl p-4 text-center">
            <p className="text-xs text-green-700 font-semibold uppercase tracking-wider">Jours présents</p>
            <p className="text-3xl font-display font-bold text-green-800 mt-1">{presentDays}</p>
          </div>
          <div className="bg-yellow-50 border border-yellow-100 rounded-2xl p-4 text-center">
            <p className="text-xs text-yellow-700 font-semibold uppercase tracking-wider">Demi-journées</p>
            <p className="text-3xl font-display font-bold text-yellow-800 mt-1">{halfDays}</p>
          </div>
          <div className="bg-red-50 border border-red-100 rounded-2xl p-4 text-center">
            <p className="text-xs text-red-700 font-semibold uppercase tracking-wider">Absences</p>
            <p className="text-3xl font-display font-bold text-red-800 mt-1">{absentDays}</p>
          </div>
          <div className="bg-primary/5 border border-primary/10 rounded-2xl p-4 text-center">
            <p className="text-xs text-primary font-semibold uppercase tracking-wider">Salaire dû</p>
            <p className="text-xl font-display font-bold text-primary mt-1">{formatFCFA(totalSalaire)}</p>
          </div>
        </div>

        {/* Table */}
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => <div key={i} className="h-14 bg-muted/50 rounded-xl animate-pulse" />)}
          </div>
        ) : records.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-16 text-center bg-white rounded-3xl border border-border/50 shadow-sm">
            <Eye className="w-12 h-12 text-muted-foreground/30 mb-3" />
            <h3 className="text-lg font-bold mb-1">Aucune fiche ce mois-ci</h3>
            <p className="text-muted-foreground text-sm">Vos fiches de présence apparaîtront ici une fois saisies par le chef de chantier.</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-border/50 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/30 text-muted-foreground text-xs uppercase font-semibold border-b border-border/50">
                  <tr>
                    <th className="px-4 py-3 text-left">Date</th>
                    <th className="px-4 py-3 text-left">Projet</th>
                    <th className="px-4 py-3 text-center">Arrivée</th>
                    <th className="px-4 py-3 text-center">Départ</th>
                    <th className="px-4 py-3 text-center">Heures</th>
                    <th className="px-4 py-3 text-center">Statut</th>
                    <th className="px-4 py-3 text-right">Montant</th>
                    <th className="px-4 py-3 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/30">
                  {records.map((record: any) => {
                    const entry = record.myEntry;
                    const statusCfg = statusLabel(entry?.status || "PRESENT");
                    const StatusIcon = statusCfg.icon;
                    const sheetCfg = SHEET_STATUS[record.status] || SHEET_STATUS.BROUILLON;
                    return (
                      <tr key={record.id} className="hover:bg-muted/10 transition-colors">
                        <td className="px-4 py-3 font-medium whitespace-nowrap">
                          {new Date(record.date).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" })}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{record.projectName || `#${record.projectId}`}</td>
                        <td className="px-4 py-3 text-center text-muted-foreground">{entry?.arrivalTime || "—"}</td>
                        <td className="px-4 py-3 text-center text-muted-foreground">{entry?.departureTime || "—"}</td>
                        <td className="px-4 py-3 text-center">{fmtHours(entry?.hoursWorked)}</td>
                        <td className="px-4 py-3 text-center">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${statusCfg.color}`}>
                            <StatusIcon className="w-3 h-3" />
                            {statusCfg.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right font-bold text-foreground">
                          {entry?.amountDue ? formatFCFA(entry.amountDue) : "—"}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setClaimEntry({ record, entry })}
                            className="h-7 text-xs rounded-lg px-2.5 text-orange-600 border-orange-200 hover:bg-orange-50"
                          >
                            <AlertTriangle className="w-3 h-3 mr-1" />
                            Réclamer
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <p className="text-xs text-muted-foreground text-center">
          Lecture seule — vos fiches sont gérées par le chef de chantier
        </p>
      </div>

      {/* Claim modal */}
      {claimEntry && (
        <ClaimModal
          record={claimEntry.record}
          entry={claimEntry.entry}
          onClose={() => setClaimEntry(null)}
        />
      )}
    </AppLayout>
  );
}

// ─── Claim modal ──────────────────────────────────────────────────────────────

function ClaimModal({ record, entry, onClose }: { record: any; entry: any; onClose: () => void }) {
  const { toast } = useToast();
  const [type, setType] = useState("ERREUR_SALAIRE");
  const [description, setDescription] = useState("");
  const [isSending, setIsSending] = useState(false);

  const handleSend = async () => {
    if (!description.trim()) {
      toast({ title: "Décrivez votre réclamation", variant: "destructive" });
      return;
    }
    setIsSending(true);
    try {
      await apiFetch("/api/reclamations", {
        method: "POST",
        body: JSON.stringify({
          type,
          description: description.trim(),
          sheetId: record.id,
          entryId: entry?.entryId || null,
        }),
      });
      toast({ title: "Réclamation envoyée", description: "L'administrateur et le chef de chantier ont été notifiés." });
      onClose();
    } catch (err: any) {
      toast({ title: "Erreur", description: err.message, variant: "destructive" });
    } finally {
      setIsSending(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[440px] rounded-2xl">
        <DialogHeader>
          <DialogTitle className="font-display text-xl flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-orange-500" />
            Envoyer une réclamation
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <div className="p-3 bg-muted/40 rounded-xl text-sm text-muted-foreground">
            <p><strong>Date :</strong> {record.date ? new Date(record.date).toLocaleDateString("fr-FR") : "—"}</p>
            <p><strong>Projet :</strong> {record.projectName || `#${record.projectId}`}</p>
          </div>
          <div className="space-y-2">
            <Label>Type de réclamation</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger className="rounded-xl h-10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ERREUR_SALAIRE">Erreur de salaire</SelectItem>
                <SelectItem value="ERREUR_PRESENCE">Erreur de présence</SelectItem>
                <SelectItem value="ERREUR_HEURES">Erreur d'heures</SelectItem>
                <SelectItem value="AUTRE">Autre</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Description *</Label>
            <Textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Expliquez le problème en détail (max 500 caractères)..."
              maxLength={500}
              rows={4}
              className="rounded-xl resize-none"
            />
            <p className="text-xs text-muted-foreground text-right">{description.length}/500</p>
          </div>
          <div className="flex gap-3 pt-2">
            <Button variant="outline" onClick={onClose} className="flex-1 rounded-xl">Annuler</Button>
            <Button
              onClick={handleSend}
              disabled={isSending}
              className="flex-1 rounded-xl bg-orange-600 hover:bg-orange-700 text-white"
            >
              {isSending ? <><span className="w-4 h-4 mr-2 border-2 border-white/30 border-t-white rounded-full animate-spin inline-block" />Envoi...</> : "Envoyer la réclamation"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
