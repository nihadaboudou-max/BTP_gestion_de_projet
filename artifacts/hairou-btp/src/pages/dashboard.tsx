import { useState } from "react";
import { AppLayout } from "@/components/layout";
import { useGetDashboardStats, useListActivityLogs, useListTasks, useListNotifications } from "@workspace/api-client-react";
import { formatFCFA, formatDateTime } from "@/lib/format";
import { HardHat, Users, Receipt, AlertTriangle, TrendingUp, Activity, Calendar, CheckSquare, Bell, CheckCircle2, Clock, XCircle, HelpCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer 
} from "recharts";

// ─── Main Dashboard ───────────────────────────────────────────────────────────

export default function Dashboard() {
  const { user } = useAuth();

  if (user?.role === "OUVRIER") {
    return <WorkerDashboard />;
  }

  return <AdminChefDashboard />;
}

// ─── Admin/Chef View ──────────────────────────────────────────────────────────

function AdminChefDashboard() {
  const { data: stats, isLoading: statsLoading } = useGetDashboardStats();
  const { data: activities, isLoading: activitiesLoading } = useListActivityLogs();

  const chartData = [
    { name: 'Lun', depenses: 1200000 },
    { name: 'Mar', depenses: 800000 },
    { name: 'Mer', depenses: 1500000 },
    { name: 'Jeu', depenses: 900000 },
    { name: 'Ven', depenses: 2100000 },
    { name: 'Sam', depenses: 400000 },
    { name: 'Dim', depenses: 100000 },
  ];

  return (
    <AppLayout title="Tableau de Bord">
      <div className="space-y-8">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          <StatCard 
            title="Projets Actifs" 
            value={stats?.activeProjects} 
            subtitle={`Sur ${stats?.totalProjects || 0} total`}
            icon={HardHat} 
            loading={statsLoading} 
            color="bg-blue-500/10 text-blue-600"
          />
          <StatCard 
            title="Personnel Total" 
            value={stats?.totalWorkers} 
            subtitle="Ouvriers enregistrés"
            icon={Users} 
            loading={statsLoading} 
            color="bg-green-500/10 text-green-600"
          />
          <StatCard 
            title="Dépenses du Mois" 
            value={formatFCFA(stats?.monthlyExpenses || 0)} 
            subtitle={`${stats?.pendingExpenses || 0} en attente`}
            icon={Receipt} 
            loading={statsLoading} 
            color="bg-orange-500/10 text-orange-600"
          />
          <StatCard 
            title="Alertes Budget" 
            value={stats?.budgetOverruns} 
            subtitle="Dépassements signalés"
            icon={AlertTriangle} 
            loading={statsLoading} 
            color="bg-red-500/10 text-red-600"
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <Card className="lg:col-span-2 border-border/50 shadow-lg shadow-black/5 rounded-2xl overflow-hidden">
            <CardHeader className="bg-muted/30 border-b border-border/50">
              <CardTitle className="flex items-center gap-2 text-lg">
                <TrendingUp className="w-5 h-5 text-accent" />
                Dépenses Hebdomadaires
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6 h-[350px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#6b7280', fontSize: 12}} dy={10} />
                  <YAxis axisLine={false} tickLine={false} tick={{fill: '#6b7280', fontSize: 12}} tickFormatter={(val) => `${val / 1000000}M`} />
                  <Tooltip 
                    formatter={(value: number) => [formatFCFA(value), "Dépenses"]}
                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1)' }}
                  />
                  <Line type="monotone" dataKey="depenses" stroke="hsl(var(--accent))" strokeWidth={4} dot={{ r: 4, strokeWidth: 2 }} activeDot={{ r: 6, strokeWidth: 0 }} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card className="border-border/50 shadow-lg shadow-black/5 rounded-2xl overflow-hidden flex flex-col">
            <CardHeader className="bg-muted/30 border-b border-border/50">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Activity className="w-5 h-5 text-primary" />
                Activité Récente
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0 flex-1 overflow-auto">
              {activitiesLoading ? (
                <div className="p-6 space-y-4">
                  {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}
                </div>
              ) : activities?.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">Aucune activité récente.</div>
              ) : (
                <div className="divide-y divide-border/50">
                  {activities?.slice(0, 5).map((log) => (
                    <div key={log.id} className="p-4 hover:bg-muted/30 transition-colors">
                      <p className="text-sm font-medium text-foreground">{log.action}</p>
                      <p className="text-xs text-muted-foreground mt-1">{log.details}</p>
                      <div className="flex items-center justify-between mt-2">
                        <span className="text-xs font-medium text-primary">{log.userName}</span>
                        <span className="text-[10px] text-muted-foreground">{formatDateTime(log.createdAt)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}

// ─── Worker Dashboard ─────────────────────────────────────────────────────────

function WorkerDashboard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { data: tasks } = useListTasks();
  const { data: notifications } = useListNotifications();

  // Dates
  const today = new Date();
  const todayStr = today.toISOString().split("T")[0];
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().split("T")[0];
  const tomorrowLabel = tomorrow.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });

  // My tasks (assigned to current user via assignedToId)
  const myTasks = tasks?.filter((t: any) => t.status !== "TERMINEE") || [];
  const urgentTasks = myTasks.filter((t: any) => t.priority === "URGENTE" || t.priority === "HAUTE");

  // Unread notifications
  const unread = notifications?.filter((n: any) => !n.isRead) || [];

  // Presence confirmation state
  const [presenceStatus, setPresenceStatus] = useState<string | null>(null);
  const [isSavingPresence, setIsSavingPresence] = useState(false);

  const confirmPresence = async (status: string) => {
    setIsSavingPresence(true);
    try {
      const token = localStorage.getItem("hairou_token");
      const BACKEND = import.meta.env.VITE_API_URL ?? "https://btp-gestion-de-projet.onrender.com";
      const res = await fetch(`${BACKEND}/api/presence-confirmations`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ date: tomorrowStr, status }),
      });
      if (!res.ok) throw new Error("Erreur");
      setPresenceStatus(status);
      toast({
        title: status === "PRESENT" ? "Présence confirmée" : status === "ABSENT" ? "Absence signalée" : "Incertitude signalée",
        description: `Pour le ${tomorrowLabel}`,
      });
    } catch {
      toast({ title: "Erreur", description: "Impossible de confirmer", variant: "destructive" });
    } finally {
      setIsSavingPresence(false);
    }
  };

  return (
    <AppLayout title="Mon Tableau de Bord">
      <div className="space-y-6 max-w-3xl mx-auto">

        {/* Welcome banner */}
        <div className="bg-gradient-to-r from-primary to-primary/80 rounded-2xl p-6 text-white shadow-xl shadow-primary/20">
          <p className="text-white/70 text-sm font-medium uppercase tracking-wider">Bienvenue</p>
          <h2 className="text-2xl font-display font-bold mt-1">{user?.name}</h2>
          <p className="text-white/70 mt-1 text-sm">
            {today.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
          </p>
        </div>

        {/* Presence confirmation card */}
        <div className="bg-white rounded-2xl border border-border/50 shadow-sm p-6">
          <h3 className="font-bold text-foreground flex items-center gap-2 mb-1">
            <Calendar className="w-5 h-5 text-accent" />
            Confirmation de présence
          </h3>
          <p className="text-sm text-muted-foreground mb-4">
            Confirmez votre présence pour <strong>{tomorrowLabel}</strong>
          </p>

          {presenceStatus ? (
            <div className={`rounded-xl p-4 flex items-center gap-3 ${
              presenceStatus === "PRESENT" ? "bg-green-50 border border-green-200 text-green-700" :
              presenceStatus === "ABSENT" ? "bg-red-50 border border-red-200 text-red-700" :
              "bg-amber-50 border border-amber-200 text-amber-700"
            }`}>
              {presenceStatus === "PRESENT" ? <CheckCircle2 className="w-5 h-5" /> : presenceStatus === "ABSENT" ? <XCircle className="w-5 h-5" /> : <HelpCircle className="w-5 h-5" />}
              <div>
                <p className="font-semibold">
                  {presenceStatus === "PRESENT" ? "Présence confirmée" : presenceStatus === "ABSENT" ? "Absence signalée" : "Incertitude signalée"}
                </p>
                <p className="text-xs opacity-80">Pour {tomorrowLabel}</p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setPresenceStatus(null)} className="ml-auto rounded-lg text-xs">
                Modifier
              </Button>
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row gap-3">
              <Button
                onClick={() => confirmPresence("PRESENT")}
                disabled={isSavingPresence}
                className="flex-1 rounded-xl bg-green-600 hover:bg-green-700 text-white h-12"
              >
                <CheckCircle2 className="w-5 h-5 mr-2" />
                Je serai présent(e)
              </Button>
              <Button
                onClick={() => confirmPresence("ABSENT")}
                disabled={isSavingPresence}
                variant="outline"
                className="flex-1 rounded-xl border-red-200 text-red-600 hover:bg-red-50 h-12"
              >
                <XCircle className="w-5 h-5 mr-2" />
                Je serai absent(e)
              </Button>
              <Button
                onClick={() => confirmPresence("INCERTAIN")}
                disabled={isSavingPresence}
                variant="outline"
                className="rounded-xl h-12 px-4"
              >
                <HelpCircle className="w-5 h-5" />
              </Button>
            </div>
          )}
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-white rounded-2xl border border-border/50 shadow-sm p-5">
            <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold mb-1">Tâches en cours</p>
            <p className="text-3xl font-display font-bold text-foreground">{myTasks.length}</p>
            {urgentTasks.length > 0 && (
              <p className="text-xs text-red-600 font-medium mt-1 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" />{urgentTasks.length} urgente(s)
              </p>
            )}
          </div>
          <div className="bg-white rounded-2xl border border-border/50 shadow-sm p-5">
            <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold mb-1">Notifications</p>
            <p className="text-3xl font-display font-bold text-foreground">{unread.length}</p>
            {unread.length > 0 && (
              <p className="text-xs text-primary font-medium mt-1">non lues</p>
            )}
          </div>
        </div>

        {/* My tasks */}
        <div className="bg-white rounded-2xl border border-border/50 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-border/50 flex items-center gap-2">
            <CheckSquare className="w-5 h-5 text-primary" />
            <h3 className="font-bold text-foreground">Mes Tâches</h3>
          </div>
          {myTasks.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              <CheckSquare className="w-12 h-12 mx-auto mb-3 opacity-20" />
              <p>Aucune tâche en cours</p>
            </div>
          ) : (
            <div className="divide-y divide-border/50">
              {myTasks.slice(0, 5).map((task: any) => (
                <div key={task.id} className="px-6 py-4 flex items-center gap-3">
                  <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                    task.priority === "URGENTE" ? "bg-red-500" :
                    task.priority === "HAUTE" ? "bg-orange-500" :
                    task.priority === "NORMALE" ? "bg-blue-500" : "bg-gray-400"
                  }`} />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-foreground text-sm truncate">{task.title}</p>
                    <p className="text-xs text-muted-foreground">{task.projectName}</p>
                  </div>
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                    task.status === "EN_COURS" ? "bg-blue-100 text-blue-700" :
                    task.status === "BLOQUEE" ? "bg-red-100 text-red-700" :
                    "bg-gray-100 text-gray-600"
                  }`}>
                    {task.status === "EN_COURS" ? "En cours" : task.status === "BLOQUEE" ? "Bloquée" : "À faire"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent notifications */}
        {unread.length > 0 && (
          <div className="bg-white rounded-2xl border border-border/50 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-border/50 flex items-center gap-2">
              <Bell className="w-5 h-5 text-accent" />
              <h3 className="font-bold text-foreground">Nouvelles notifications</h3>
            </div>
            <div className="divide-y divide-border/50">
              {unread.slice(0, 3).map((n: any) => (
                <div key={n.id} className="px-6 py-4">
                  <p className="font-medium text-sm text-foreground">{n.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{n.message}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}

// ─── Stat Card ────────────────────────────────────────────────────────────────

function StatCard({ title, value, subtitle, icon: Icon, loading, color }: any) {
  return (
    <Card className="border-border/50 shadow-lg shadow-black/5 rounded-2xl overflow-hidden hover:shadow-xl transition-all duration-300 group">
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm font-medium text-muted-foreground mb-1">{title}</p>
            {loading ? (
              <Skeleton className="h-8 w-24 mb-2" />
            ) : (
              <h3 className="text-3xl font-display font-bold text-foreground group-hover:text-primary transition-colors">{value}</h3>
            )}
            <p className="text-xs text-muted-foreground mt-2">{subtitle}</p>
          </div>
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${color}`}>
            <Icon className="w-6 h-6" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
