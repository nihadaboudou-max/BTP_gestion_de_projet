import { useState } from "react";
import { useParams, useLocation, Link } from "wouter";
import { AppLayout } from "@/components/layout";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { formatFCFA, formatDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ArrowLeft, Building2, MapPin, Calendar, Users, DollarSign,
  TrendingUp, TrendingDown, ClipboardList, CheckCircle2, Clock,
  AlertCircle, Circle, Plus, Loader2, Wallet, ReceiptText,
  BadgeCheck, ChevronRight, Pencil, Save
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";

const BACKEND = import.meta.env.VITE_API_URL ?? "https://btp-gestion-de-projet.onrender.com";

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

const statusOptions = [
  { value: "PLANIFIE",  label: "Planifié",   color: "bg-gray-100 text-gray-700 border-gray-200" },
  { value: "EN_COURS",  label: "En cours",   color: "bg-blue-100 text-blue-700 border-blue-200" },
  { value: "EN_PAUSE",  label: "En pause",   color: "bg-orange-100 text-orange-700 border-orange-200" },
  { value: "TERMINE",   label: "Terminé",    color: "bg-green-100 text-green-700 border-green-200" },
];

const statusMap = Object.fromEntries(statusOptions.map(s => [s.value, s]));

const taskStatusIcons: Record<string, any> = {
  A_FAIRE: Circle, EN_COURS: Clock, BLOQUEE: AlertCircle, TERMINEE: CheckCircle2,
};
const taskStatusColors: Record<string, string> = {
  A_FAIRE: "text-gray-400", EN_COURS: "text-blue-500", BLOQUEE: "text-orange-500", TERMINEE: "text-green-500",
};
const taskStatusLabels: Record<string, string> = {
  A_FAIRE: "À faire", EN_COURS: "En cours", BLOQUEE: "Bloquée", TERMINEE: "Terminée",
};

export default function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const projectId = parseInt(id || "0");

  const [activeTab, setActiveTab] = useState<"overview" | "tasks" | "pointage" | "expenses" | "finance">("overview");
  const [editOpen, setEditOpen] = useState(false);
  const [addPaymentOpen, setAddPaymentOpen] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentNote, setPaymentNote] = useState("");

  const isAdmin = user?.role === "ADMIN";
  const isAdminOrChef = isAdmin || user?.role === "CHEF_CHANTIER";

  // ── Data fetching ──────────────────────────────────────────────────────────
  const { data: project, isLoading: loadingProject } = useQuery({
    queryKey: [`/api/projects/${projectId}`],
    queryFn: () => apiFetch(`/api/projects/${projectId}`),
    enabled: !!projectId,
  });

  const { data: tasks } = useQuery({
    queryKey: ["/api/tasks", projectId],
    queryFn: () => apiFetch(`/api/tasks?projectId=${projectId}`),
    enabled: !!projectId,
  });

  const { data: sheets } = useQuery({
    queryKey: ["/api/pointage", projectId],
    queryFn: () => apiFetch(`/api/pointage?projectId=${projectId}`),
    enabled: !!projectId,
  });

  const { data: expenses } = useQuery({
    queryKey: ["/api/expenses", projectId],
    queryFn: () => apiFetch(`/api/expenses?projectId=${projectId}`),
    enabled: !!projectId,
  });

  const { data: users } = useQuery({
    queryKey: ["/api/users"],
    queryFn: () => apiFetch("/api/users"),
    enabled: isAdmin,
  });

  // ── Payments (localStorage) ────────────────────────────────────────────────
  const getPayments = () => {
    try { return JSON.parse(localStorage.getItem(`payments_${projectId}`) || "[]") as number[]; }
    catch { return []; }
  };
  const [payments, setPayments] = useState<number[]>(getPayments);

  const handleAddPayment = () => {
    const amount = parseFloat(paymentAmount);
    if (!amount || amount <= 0) { toast({ title: "Montant invalide", variant: "destructive" }); return; }
    const updated = [...payments, amount];
    localStorage.setItem(`payments_${projectId}`, JSON.stringify(updated));
    setPayments(updated);
    toast({ title: `Paiement de ${formatFCFA(amount)} enregistré` });
    setPaymentAmount(""); setPaymentNote(""); setAddPaymentOpen(false);
  };

  // ── Edit project mutation ──────────────────────────────────────────────────
  const updateMutation = useMutation({
    mutationFn: (data: any) => apiFetch(`/api/projects/${projectId}`, { method: "PUT", body: JSON.stringify(data) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      toast({ title: "Projet mis à jour" });
      setEditOpen(false);
    },
    onError: (err: any) => toast({ title: "Erreur", description: err.message, variant: "destructive" }),
  });

  // ── Guards ─────────────────────────────────────────────────────────────────
  if (loadingProject) return (
    <AppLayout title="Projet">
      <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
    </AppLayout>
  );

  if (!project) return (
    <AppLayout title="Projet">
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <Building2 className="w-16 h-16 text-muted-foreground/30 mb-4" />
        <h3 className="text-xl font-bold mb-2">Projet introuvable</h3>
        <Button onClick={() => navigate("/projets")} variant="outline" className="rounded-xl mt-4">
          <ArrowLeft className="w-4 h-4 mr-2" /> Retour aux projets
        </Button>
      </div>
    </AppLayout>
  );

  // ── Computed values ────────────────────────────────────────────────────────
  const cfg = statusMap[project.status] || statusOptions[0];
  const allTasks = (tasks as any[]) ?? [];
  const allSheets = (sheets as any[]) ?? [];
  const allExpenses = (expenses as any[]) ?? [];
  const approvedExpenses = allExpenses.filter((e: any) => e.status === "APPROUVEE");

  const totalBudget = parseFloat(project.budgetTotal || "0");
  const totalExpenses = approvedExpenses.reduce((s: number, e: any) => s + parseFloat(e.amount || "0"), 0);
  const totalPointagePay = allSheets.reduce((s: number, sh: any) => s + parseFloat(sh.totalPay || "0"), 0);
  const totalCharges = totalExpenses + totalPointagePay;
  const totalPaid = payments.reduce((s, p) => s + p, 0);
  const restant = Math.max(0, totalBudget - totalPaid);
  const profit = totalPaid - totalCharges;

  const taskStats = {
    total: allTasks.length,
    done: allTasks.filter((t: any) => t.status === "TERMINEE").length,
    inProgress: allTasks.filter((t: any) => t.status === "EN_COURS").length,
    todo: allTasks.filter((t: any) => t.status === "A_FAIRE").length,
    blocked: allTasks.filter((t: any) => t.status === "BLOQUEE").length,
  };

  const tabs = [
    { key: "overview",  label: "Vue d'ensemble" },
    { key: "tasks",     label: `Tâches (${taskStats.total})` },
    { key: "pointage",  label: `Pointage (${allSheets.length})` },
    { key: "expenses",  label: `Dépenses (${allExpenses.length})` },
    ...(isAdminOrChef ? [{ key: "finance", label: "Finance" }] : []),
  ];

  return (
    <AppLayout title={project.name}>
      <div className="space-y-5 pb-10 max-w-5xl mx-auto">

        {/* Back */}
        <Button variant="ghost" onClick={() => navigate("/projets")} className="text-muted-foreground -ml-2">
          <ArrowLeft className="w-4 h-4 mr-1.5" /> Retour aux projets
        </Button>

        {/* Header */}
        <div className="bg-white rounded-2xl border border-border/50 shadow-sm p-6">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className="w-14 h-14 bg-primary/10 rounded-xl flex items-center justify-center flex-shrink-0">
                <Building2 className="w-7 h-7 text-primary" />
              </div>
              <div>
                <div className="flex items-center gap-3 flex-wrap">
                  <h1 className="text-2xl font-bold text-foreground">{project.name}</h1>
                  <span className={`px-3 py-1 rounded-full text-xs font-semibold border ${cfg.color}`}>{cfg.label}</span>
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-sm text-muted-foreground">
                  {project.location && <span className="flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5" />{project.location}</span>}
                  {project.clientName && <span className="flex items-center gap-1.5"><Users className="w-3.5 h-3.5" />{project.clientName}</span>}
                  {project.startDate && <span className="flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5" />Début : {formatDate(project.startDate)}</span>}
                  {project.endDate && <span className="flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5" />Fin : {formatDate(project.endDate)}</span>}
                  {project.chefName && <span className="flex items-center gap-1.5"><BadgeCheck className="w-3.5 h-3.5 text-primary" />Chef : {project.chefName}</span>}
                </div>
              </div>
            </div>
            {isAdmin && (
              <Button variant="outline" size="sm" onClick={() => setEditOpen(true)} className="rounded-xl flex-shrink-0">
                <Pencil className="w-3.5 h-3.5 mr-1.5" /> Modifier
              </Button>
            )}
          </div>

          {/* Progress */}
          <div className="mt-5">
            <div className="flex items-center justify-between text-sm mb-2">
              <span className="text-muted-foreground font-medium">Avancement global</span>
              <span className="font-bold text-primary">{project.progress ?? 0}%</span>
            </div>
            <div className="h-3 bg-muted rounded-full overflow-hidden">
              <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${project.progress ?? 0}%` }} />
            </div>
          </div>
        </div>

        {/* KPI row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <KpiCard icon={DollarSign} label="Marché / Budget" value={formatFCFA(totalBudget)} color="blue" />
          <KpiCard icon={Wallet} label="Encaissé" value={formatFCFA(totalPaid)} color="green" />
          <KpiCard icon={ReceiptText} label="Charges totales" value={formatFCFA(totalCharges)} color="orange" />
          <KpiCard icon={profit >= 0 ? TrendingUp : TrendingDown} label="Résultat" value={formatFCFA(profit)} color={profit >= 0 ? "green" : "red"} />
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-muted/40 rounded-xl p-1 overflow-x-auto scrollbar-none">
          {tabs.map(tab => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key as any)}
              className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all flex-shrink-0 ${
                activeTab === tab.key ? "bg-white shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
              }`}>
              {tab.label}
            </button>
          ))}
        </div>

        {/* ── Tab: Vue d'ensemble ── */}
        {activeTab === "overview" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <SummaryCard title="Tâches" icon={ClipboardList} onMore={() => setActiveTab("tasks")}>
              {[
                { label: "À faire",   count: taskStats.todo,       color: "text-gray-600" },
                { label: "En cours",  count: taskStats.inProgress,  color: "text-blue-600" },
                { label: "Bloquées",  count: taskStats.blocked,     color: "text-orange-500" },
                { label: "Terminées", count: taskStats.done,        color: "text-green-600" },
              ].map(s => (
                <div key={s.label} className="flex items-center justify-between py-1.5">
                  <span className="text-sm text-muted-foreground">{s.label}</span>
                  <span className={`text-sm font-bold ${s.color}`}>{s.count}</span>
                </div>
              ))}
            </SummaryCard>

            <SummaryCard title="Pointage" icon={Clock} onMore={() => setActiveTab("pointage")}>
              <div className="flex items-center justify-between py-1.5">
                <span className="text-sm text-muted-foreground">Fiches créées</span>
                <span className="text-sm font-bold">{allSheets.length}</span>
              </div>
              <div className="flex items-center justify-between py-1.5">
                <span className="text-sm text-muted-foreground">Approuvées</span>
                <span className="text-sm font-bold text-green-600">{allSheets.filter((s: any) => s.status === "APPROUVEE").length}</span>
              </div>
              <div className="flex items-center justify-between py-1.5">
                <span className="text-sm text-muted-foreground">Total salaires</span>
                <span className="text-sm font-bold text-secondary">{formatFCFA(totalPointagePay)}</span>
              </div>
            </SummaryCard>

            <div className="md:col-span-2 bg-white rounded-2xl border border-border/50 shadow-sm overflow-hidden">
              <div className="px-5 py-3 border-b border-border/30 flex items-center justify-between">
                <h3 className="font-bold text-sm text-foreground flex items-center gap-2">
                  <ReceiptText className="w-4 h-4 text-accent" /> Dépenses récentes
                </h3>
                <button onClick={() => setActiveTab("expenses")} className="text-xs text-primary hover:underline flex items-center gap-0.5">
                  Voir tout <ChevronRight className="w-3 h-3" />
                </button>
              </div>
              {allExpenses.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">Aucune dépense</p>
              ) : (
                <div className="divide-y divide-border/20">
                  {allExpenses.slice(0, 4).map((e: any) => (
                    <div key={e.id} className="px-5 py-3 flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">{e.description || e.title}</p>
                        <p className="text-xs text-muted-foreground">{formatDate(e.date)} · {e.category}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-sm">{formatFCFA(parseFloat(e.amount))}</p>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${
                          e.status === "APPROUVEE" ? "bg-green-100 text-green-700" :
                          e.status === "EN_ATTENTE" ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700"
                        }`}>{e.status === "APPROUVEE" ? "Approuvée" : e.status === "EN_ATTENTE" ? "En attente" : "Rejetée"}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Tab: Tâches ── */}
        {activeTab === "tasks" && (
          <div className="bg-white rounded-2xl border border-border/50 shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-border/30">
              <h3 className="font-bold text-foreground">Tâches du projet</h3>
            </div>
            {allTasks.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground"><Circle className="w-10 h-10 mx-auto mb-3 opacity-30" /><p>Aucune tâche</p></div>
            ) : (
              <div className="divide-y divide-border/20">
                {allTasks.map((task: any) => {
                  const Icon = taskStatusIcons[task.status] || Circle;
                  return (
                    <div key={task.id} className="px-5 py-3.5 flex items-start gap-3">
                      <Icon className={`w-4 h-4 mt-0.5 flex-shrink-0 ${taskStatusColors[task.status]}`} />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm text-foreground">{task.title}</p>
                        {task.description && <p className="text-xs text-muted-foreground mt-0.5">{task.description}</p>}
                        <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1.5 text-xs text-muted-foreground">
                          <span>{taskStatusLabels[task.status]}</span>
                          {task.assignedToName && <span className="text-primary font-medium">→ {task.assignedToName}</span>}
                          {task.dueDate && <span>Éch. {formatDate(task.dueDate)}</span>}
                        </div>
                      </div>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-semibold flex-shrink-0 ${
                        task.priority === "URGENTE" ? "bg-red-100 text-red-700" :
                        task.priority === "HAUTE" ? "bg-orange-100 text-orange-700" :
                        task.priority === "NORMALE" ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-600"
                      }`}>{task.priority}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── Tab: Pointage ── */}
        {activeTab === "pointage" && (
          <div className="bg-white rounded-2xl border border-border/50 shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-border/30 flex items-center justify-between">
              <h3 className="font-bold text-foreground">Fiches de pointage</h3>
              {isAdminOrChef && (
                <Link href="/pointage/new">
                  <Button size="sm" className="rounded-xl text-xs bg-secondary text-white hover:bg-secondary/90 h-7">
                    <Plus className="w-3.5 h-3.5 mr-1" /> Nouveau
                  </Button>
                </Link>
              )}
            </div>
            {allSheets.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground"><Clock className="w-10 h-10 mx-auto mb-3 opacity-30" /><p>Aucune fiche</p></div>
            ) : (
              <>
                <div className="divide-y divide-border/20">
                  {allSheets.map((sh: any) => (
                    <Link key={sh.id} href={`/pointage/${sh.id}`}>
                      <div className="px-5 py-3.5 flex items-center gap-4 hover:bg-muted/20 cursor-pointer transition-colors">
                        <div className="flex-1">
                          <p className="font-medium text-sm">{formatDate(sh.date)}</p>
                          <p className="text-xs text-muted-foreground">Chef : {sh.chefName || "—"}</p>
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-secondary text-sm">{formatFCFA(parseFloat(sh.totalPay || "0"))}</p>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${
                            sh.status === "APPROUVEE" ? "bg-green-100 text-green-700" :
                            sh.status === "SOUMISE" ? "bg-blue-100 text-blue-700" :
                            sh.status === "REJETEE" ? "bg-red-100 text-red-700" : "bg-gray-100 text-gray-600"
                          }`}>{sh.status === "APPROUVEE" ? "Approuvée" : sh.status === "SOUMISE" ? "En attente" : sh.status === "REJETEE" ? "Rejetée" : "Brouillon"}</span>
                        </div>
                        <ChevronRight className="w-4 h-4 text-muted-foreground" />
                      </div>
                    </Link>
                  ))}
                </div>
                <div className="px-5 py-3 bg-muted/20 flex items-center justify-between">
                  <span className="text-sm font-semibold text-muted-foreground">Total salaires</span>
                  <span className="font-bold text-secondary">{formatFCFA(totalPointagePay)}</span>
                </div>
              </>
            )}
          </div>
        )}

        {/* ── Tab: Dépenses ── */}
        {activeTab === "expenses" && (
          <div className="bg-white rounded-2xl border border-border/50 shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-border/30">
              <h3 className="font-bold text-foreground">Dépenses du projet</h3>
            </div>
            {allExpenses.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground"><ReceiptText className="w-10 h-10 mx-auto mb-3 opacity-30" /><p>Aucune dépense</p></div>
            ) : (
              <>
                <div className="divide-y divide-border/20">
                  {allExpenses.map((e: any) => (
                    <div key={e.id} className="px-5 py-3.5 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium text-sm text-foreground">{e.description || e.title}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{formatDate(e.date)} · {e.category}{e.addedByName ? ` · ${e.addedByName}` : ""}</p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="font-bold text-sm">{formatFCFA(parseFloat(e.amount))}</p>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${
                          e.status === "APPROUVEE" ? "bg-green-100 text-green-700" :
                          e.status === "EN_ATTENTE" ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700"
                        }`}>{e.status === "APPROUVEE" ? "Approuvée" : e.status === "EN_ATTENTE" ? "En attente" : "Rejetée"}</span>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="px-5 py-3 bg-red-50 flex items-center justify-between">
                  <span className="text-sm font-semibold text-muted-foreground">Total dépenses approuvées</span>
                  <span className="font-bold text-red-700">{formatFCFA(totalExpenses)}</span>
                </div>
              </>
            )}
          </div>
        )}

        {/* ── Tab: Finance (admin/chef only) ── */}
        {activeTab === "finance" && isAdminOrChef && (
          <div className="space-y-5">
            {/* Finance KPIs */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-white rounded-2xl border border-blue-200 shadow-sm p-5">
                <p className="text-xs text-muted-foreground mb-1">Montant du marché</p>
                <p className="text-2xl font-bold text-blue-700">{formatFCFA(totalBudget)}</p>
              </div>
              <div className="bg-white rounded-2xl border border-green-200 shadow-sm p-5">
                <p className="text-xs text-muted-foreground mb-1">Montant encaissé</p>
                <p className="text-2xl font-bold text-green-700">{formatFCFA(totalPaid)}</p>
                <p className="text-xs text-muted-foreground mt-1">Restant : {formatFCFA(restant)}</p>
              </div>
              <div className={`bg-white rounded-2xl border shadow-sm p-5 ${profit >= 0 ? "border-emerald-200" : "border-red-200"}`}>
                <p className="text-xs text-muted-foreground mb-1">Bénéfice estimé</p>
                <p className={`text-2xl font-bold ${profit >= 0 ? "text-emerald-700" : "text-red-600"}`}>{formatFCFA(profit)}</p>
                <p className="text-xs text-muted-foreground mt-1">Encaissé − Charges</p>
              </div>
            </div>

            {/* Progress bars */}
            <div className="bg-white rounded-2xl border border-border/50 shadow-sm p-5 space-y-4">
              <h4 className="font-bold text-foreground text-sm">Indicateurs financiers</h4>
              <ProgressBar label="Encaissé / Budget" value={totalPaid} max={totalBudget} color="green" />
              <ProgressBar label="Charges / Budget" value={totalCharges} max={totalBudget} color={totalCharges / totalBudget > 0.9 ? "red" : "orange"} />
              <ProgressBar label="Avancement physique" value={project.progress ?? 0} max={100} isPercent color="primary" />
            </div>

            {/* Paiements reçus */}
            <div className="bg-white rounded-2xl border border-border/50 shadow-sm overflow-hidden">
              <div className="px-5 py-3 border-b border-border/30 flex items-center justify-between">
                <h4 className="font-bold text-sm text-foreground">Paiements reçus du client</h4>
                <Button size="sm" onClick={() => setAddPaymentOpen(true)} className="rounded-xl text-xs bg-green-600 hover:bg-green-700 text-white h-7">
                  <Plus className="w-3.5 h-3.5 mr-1" /> Ajouter
                </Button>
              </div>
              {payments.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">Aucun paiement enregistré</p>
              ) : (
                <>
                  <div className="divide-y divide-border/20">
                    {payments.map((p, i) => (
                      <div key={i} className="px-5 py-3 flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Versement #{i + 1}</span>
                        <span className="font-bold text-green-700 text-sm">{formatFCFA(p)}</span>
                      </div>
                    ))}
                  </div>
                  <div className="px-5 py-3 bg-green-50 flex items-center justify-between">
                    <span className="font-semibold text-sm">Total encaissé</span>
                    <span className="font-bold text-green-700">{formatFCFA(totalPaid)}</span>
                  </div>
                </>
              )}
            </div>

            {/* Charges détail */}
            <div className="bg-white rounded-2xl border border-border/50 shadow-sm overflow-hidden">
              <div className="px-5 py-3 border-b border-border/30">
                <h4 className="font-bold text-sm text-foreground">Détail des charges</h4>
              </div>
              <div className="divide-y divide-border/20">
                <div className="px-5 py-3 flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Salaires (pointage)</span>
                  <span className="font-bold text-sm">{formatFCFA(totalPointagePay)}</span>
                </div>
                <div className="px-5 py-3 flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Dépenses approuvées</span>
                  <span className="font-bold text-sm">{formatFCFA(totalExpenses)}</span>
                </div>
                <div className="px-5 py-3 bg-red-50 flex items-center justify-between">
                  <span className="font-semibold text-sm">Total charges</span>
                  <span className="font-bold text-red-700">{formatFCFA(totalCharges)}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Edit Dialog (admin only) ── */}
        {editOpen && (
          <EditProjectDialog
            project={project}
            users={(users as any[]) ?? []}
            onClose={() => setEditOpen(false)}
            onSave={(data: any) => updateMutation.mutate(data)}
            isSaving={updateMutation.isPending}
          />
        )}

        {/* ── Add Payment Dialog ── */}
        <Dialog open={addPaymentOpen} onOpenChange={setAddPaymentOpen}>
          <DialogContent className="sm:max-w-[360px] rounded-2xl">
            <DialogHeader><DialogTitle>Enregistrer un paiement</DialogTitle></DialogHeader>
            <div className="space-y-4 mt-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Montant reçu (FCFA) *</Label>
                <Input type="number" value={paymentAmount} onChange={e => setPaymentAmount(e.target.value)} placeholder="Ex: 500000" className="rounded-xl h-10" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Note (optionnel)</Label>
                <Input value={paymentNote} onChange={e => setPaymentNote(e.target.value)} placeholder="Ex: Acompte phase 1" className="rounded-xl h-10" />
              </div>
              <div className="flex gap-3 pt-1">
                <Button variant="outline" onClick={() => setAddPaymentOpen(false)} className="flex-1 rounded-xl">Annuler</Button>
                <Button onClick={handleAddPayment} className="flex-1 rounded-xl bg-green-600 hover:bg-green-700 text-white">Enregistrer</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────

function KpiCard({ icon: Icon, label, value, color }: { icon: any; label: string; value: string; color: string }) {
  const colorMap: Record<string, string> = {
    blue: "bg-blue-50 text-blue-600", green: "bg-green-50 text-green-600",
    orange: "bg-orange-50 text-orange-600", red: "bg-red-50 text-red-600",
  };
  return (
    <div className="bg-white rounded-2xl border border-border/50 shadow-sm p-4">
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-3 ${colorMap[color]}`}>
        <Icon className="w-4 h-4" />
      </div>
      <p className="text-xs text-muted-foreground mb-0.5">{label}</p>
      <p className="font-bold text-foreground text-sm leading-tight">{value}</p>
    </div>
  );
}

function SummaryCard({ title, icon: Icon, children, onMore }: { title: string; icon: any; children: React.ReactNode; onMore: () => void }) {
  return (
    <div className="bg-white rounded-2xl border border-border/50 shadow-sm p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-bold text-sm text-foreground flex items-center gap-2"><Icon className="w-4 h-4 text-primary" />{title}</h3>
        <button onClick={onMore} className="text-xs text-primary hover:underline flex items-center gap-0.5">Voir tout <ChevronRight className="w-3 h-3" /></button>
      </div>
      <div className="divide-y divide-border/20">{children}</div>
    </div>
  );
}

function ProgressBar({ label, value, max, color, isPercent }: { label: string; value: number; max: number; color: string; isPercent?: boolean }) {
  const pct = max > 0 ? Math.min(100, (isPercent ? value : (value / max) * 100)) : 0;
  const colorClass = { green: "bg-green-500", orange: "bg-orange-400", red: "bg-red-500", primary: "bg-primary" }[color] || "bg-primary";
  return (
    <div>
      <div className="flex justify-between text-xs mb-1.5">
        <span className="text-muted-foreground">{label}</span>
        <span className={`font-medium ${color === "red" && pct > 90 ? "text-red-600" : ""}`}>
          {isPercent ? `${Math.round(pct)}%` : `${Math.round(pct)}%`}
        </span>
      </div>
      <div className="h-2.5 bg-muted rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${colorClass}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function EditProjectDialog({ project, users, onClose, onSave, isSaving }: {
  project: any; users: any[]; onClose: () => void; onSave: (data: any) => void; isSaving: boolean;
}) {
  const [form, setForm] = useState({
    name: project.name || "",
    location: project.location || "",
    clientName: project.clientName || "",
    budgetTotal: project.budgetTotal?.toString() || "",
    status: project.status || "PLANIFIE",
    progress: project.progress?.toString() || "0",
    startDate: project.startDate || "",
    endDate: project.endDate || "",
    chefId: project.chefId?.toString() || "",
  });

  const chefs = users.filter((u: any) => u.role === "CHEF_CHANTIER" || u.role === "ADMIN");

  const handleSave = () => {
    if (!form.name || !form.budgetTotal) return;
    onSave({
      name: form.name,
      location: form.location || null,
      clientName: form.clientName || null,
      budgetTotal: parseFloat(form.budgetTotal),
      status: form.status,
      progress: parseInt(form.progress) || 0,
      startDate: form.startDate || null,
      endDate: form.endDate || null,
      chefId: form.chefId && form.chefId !== "none" ? parseInt(form.chefId) : null,
    });
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[520px] rounded-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle className="font-display text-xl">Modifier le projet</DialogTitle></DialogHeader>
        <div className="space-y-4 mt-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Nom du projet *</Label>
            <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
              className="flex h-10 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Lieu</Label>
              <input value={form.location} onChange={e => setForm({ ...form, location: e.target.value })}
                className="flex h-10 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Client</Label>
              <input value={form.clientName} onChange={e => setForm({ ...form, clientName: e.target.value })}
                className="flex h-10 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Budget / Montant marché (FCFA) *</Label>
              <input type="number" value={form.budgetTotal} onChange={e => setForm({ ...form, budgetTotal: e.target.value })}
                className="flex h-10 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Avancement (%)</Label>
              <input type="number" min="0" max="100" value={form.progress} onChange={e => setForm({ ...form, progress: e.target.value })}
                className="flex h-10 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Statut</Label>
              <Select value={form.status} onValueChange={v => setForm({ ...form, status: v })}>
                <SelectTrigger className="rounded-xl h-10"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {statusOptions.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Chef de chantier</Label>
              <Select value={form.chefId} onValueChange={v => setForm({ ...form, chefId: v })}>
                <SelectTrigger className="rounded-xl h-10"><SelectValue placeholder="— Aucun —" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— Aucun —</SelectItem>
                  {chefs.map((u: any) => <SelectItem key={u.id} value={u.id.toString()}>{u.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Date début</Label>
              <input type="date" value={form.startDate} onChange={e => setForm({ ...form, startDate: e.target.value })}
                className="flex h-10 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Date fin prévue</Label>
              <input type="date" value={form.endDate} onChange={e => setForm({ ...form, endDate: e.target.value })}
                className="flex h-10 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <Button variant="outline" onClick={onClose} className="flex-1 rounded-xl">Annuler</Button>
            <Button onClick={handleSave} disabled={isSaving || !form.name || !form.budgetTotal} className="flex-1 rounded-xl bg-primary text-white">
              {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
              Enregistrer
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
