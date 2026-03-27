import { AppLayout } from "@/components/layout";
import { useGetDashboardStats, useListActivityLogs } from "@workspace/api-client-react";
import { formatFCFA, formatDateTime } from "@/lib/format";
import { HardHat, Users, Receipt, AlertTriangle, TrendingUp, Activity } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer 
} from "recharts";

export default function Dashboard() {
  const { data: stats, isLoading: statsLoading } = useGetDashboardStats();
  const { data: activities, isLoading: activitiesLoading } = useListActivityLogs();

  // Mock data for chart since API only returns single number for monthlyExpenses
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
        
        {/* KPI Cards */}
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
          {/* Chart Section */}
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
                  <YAxis 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{fill: '#6b7280', fontSize: 12}} 
                    tickFormatter={(val) => `${val / 1000000}M`}
                  />
                  <Tooltip 
                    formatter={(value: number) => [formatFCFA(value), "Dépenses"]}
                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1)' }}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="depenses" 
                    stroke="hsl(var(--accent))" 
                    strokeWidth={4}
                    dot={{ r: 4, strokeWidth: 2 }}
                    activeDot={{ r: 6, strokeWidth: 0 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Activity Feed */}
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
                <div className="p-8 text-center text-muted-foreground">
                  Aucune activité récente.
                </div>
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
