import { useState } from "react";
import { AppLayout } from "@/components/layout";
import { useListProjects, useListExpenses } from "@workspace/api-client-react";
import { formatFCFA, formatDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TrendingUp, TrendingDown, DollarSign, AlertTriangle, Plus, Loader2, CheckCircle2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";

const BACKEND = "https://btp-gestion-de-projet.onrender.com";

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

// Stockage local des paiements reçus par projet
function getPayments(projectId: number): number[] {
  try {
    return JSON.parse(localStorage.getItem(`payments_${projectId}`) || "[]");
  } catch { return []; }
}

function savePayments(projectId: number, payments: number[]) {
  localStorage.setItem(`payments_${projectId}`, JSON.stringify(payments));
}

export default function Finance() {
  const { data: projects, isLoading: loadingProjects } = useListProjects();
  const { data: expenses } = useListExpenses();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedProject, setSelectedProject] = useState<any>(null);
  const [addPaymentOpen, setAddPaymentOpen] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentNote, setPaymentNote] = useState("");
  const [payments, setPayments] = useState<Record<number, number[]>>({});

  const isAdmin = user?.role === "ADMIN";
  const isChef = user?.role === "CHEF_CHANTIER";

  if (!isAdmin && !isChef) {
    return (
      <AppLayout title="Finance">
        <div className="flex flex-col items-center justify-center p-20 text-center">
          <DollarSign className="w-16 h-16 text-muted-foreground/30 mb-4" />
          <h3 className="text-xl font-bold mb-2">Accès restreint</h3>
          <p className="text-muted-foreground">Cette section est réservée aux administrateurs et chefs de chantier.</p>
        </div>
      </AppLayout>
    );
  }

  const getProjectExpenses = (projectId: number) =>
    expenses?.filter(e => e.projectId === projectId && e.status === "APPROUVEE") ?? [];

  const getProjectPayments = (projectId: number) =>
    payments[projectId] || getPayments(projectId);

  const getTotalPaid = (projectId: number) =>
    getProjectPayments(projectId).reduce((s, p) => s + p, 0);

  const handleAddPayment = (project: any) => {
    const amount = parseFloat(paymentAmount);
    if (!amount || amount <= 0) {
      toast({ title: "Montant invalide", variant: "destructive" });
      return;
    }
    const existing = getPayments(project.id);
    const updated = [...existing, amount];
    savePayments(project.id, updated);
    setPayments(prev => ({ ...prev, [project.id]: updated }));
    toast({ title: `Paiement de ${formatFCFA(amount)} enregistré` });
    setPaymentAmount("");
    setPaymentNote("");
    setAddPaymentOpen(false);
  };

  // Global totals
  const totalBudget = projects?.reduce((s, p) => s + Number(p.budgetTotal || 0), 0) ?? 0;
  const totalExpenses = projects?.reduce((s, p) => {
    const exp = getProjectExpenses(p.id);
    return s + exp.reduce((es, e) => es + Number(e.amount || 0), 0);
  }, 0) ?? 0;
  const totalReceived = projects?.reduce((s, p) => s + getTotalPaid(p.id), 0) ?? 0;

  return (
    <AppLayout title="Finance">
      <div className="space-y-6">
        <p className="text-muted-foreground">Suivi financier de tous les chantiers.</p>

        {/* KPI globaux */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white rounded-2xl border border-border/50 shadow-sm p-5">
            <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold mb-2">Budget total</p>
            <p className="text-2xl font-bold text-foreground">{formatFCFA(totalBudget)}</p>
          </div>
          <div className="bg-green-50 rounded-2xl border border-green-200 shadow-sm p-5">
            <p className="text-xs text-green-700 uppercase tracking-wider font-semibold mb-2">Montant encaissé</p>
            <p className="text-2xl font-bold text-green-700">{formatFCFA(totalReceived)}</p>
          </div>
          <div className="bg-red-50 rounded-2xl border border-red-200 shadow-sm p-5">
            <p className="text-xs text-red-700 uppercase tracking-wider font-semibold mb-2">Total dépenses</p>
            <p className="text-2xl font-bold text-red-700">{formatFCFA(totalExpenses)}</p>
          </div>
        </div>

        {/* Liste des projets avec détails financiers */}
        <div className="space-y-4">
          {loadingProjects ? (
            [1,2,3].map(i => <div key={i} className="h-32 bg-muted/50 rounded-2xl animate-pulse" />)
          ) : projects?.map(project => {
            const projExpenses = getProjectExpenses(project.id);
            const totalExp = projExpenses.reduce((s, e) => s + Number(e.amount || 0), 0);
            const budget = Number(project.budgetTotal || 0);
            const received = getTotalPaid(project.id);
            const remaining = budget - received;
            const profit = received - totalExp;
            const budgetUsedPct = budget > 0 ? Math.min(100, (totalExp / budget) * 100) : 0;

            return (
              <div key={project.id} className="bg-white rounded-2xl border border-border/50 shadow-sm overflow-hidden">
                <div
                  className="p-5 cursor-pointer hover:bg-muted/10 transition-colors"
                  onClick={() => setSelectedProject(selectedProject?.id === project.id ? null : project)}
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-bold text-foreground truncate">{project.name}</h3>
                      <p className="text-sm text-muted-foreground mt-0.5">{project.location || "—"}</p>
                    </div>
                    <span className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${
                      project.status === "EN_COURS" ? "bg-blue-100 text-blue-700 border-blue-200" :
                      project.status === "TERMINE" ? "bg-green-100 text-green-700 border-green-200" :
                      "bg-gray-100 text-gray-700 border-gray-200"
                    }`}>{project.status}</span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
                    <div className="text-center p-3 bg-muted/30 rounded-xl">
                      <p className="text-xs text-muted-foreground mb-1">Budget</p>
                      <p className="font-bold text-sm">{formatFCFA(budget)}</p>
                    </div>
                    <div className="text-center p-3 bg-green-50 rounded-xl">
                      <p className="text-xs text-green-700 mb-1">Encaissé</p>
                      <p className="font-bold text-sm text-green-700">{formatFCFA(received)}</p>
                    </div>
                    <div className="text-center p-3 bg-orange-50 rounded-xl">
                      <p className="text-xs text-orange-700 mb-1">Restant dû</p>
                      <p className="font-bold text-sm text-orange-700">{formatFCFA(remaining)}</p>
                    </div>
                    <div className={`text-center p-3 rounded-xl ${profit >= 0 ? "bg-green-50" : "bg-red-50"}`}>
                      <p className={`text-xs mb-1 ${profit >= 0 ? "text-green-700" : "text-red-700"}`}>Résultat</p>
                      <p className={`font-bold text-sm ${profit >= 0 ? "text-green-700" : "text-red-700"}`}>{formatFCFA(profit)}</p>
                    </div>
                  </div>

                  {/* Barre de progression budget */}
                  <div className="mt-3">
                    <div className="flex justify-between text-xs text-muted-foreground mb-1">
                      <span>Dépenses vs Budget</span>
                      <span>{budgetUsedPct.toFixed(0)}%</span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${budgetUsedPct > 90 ? "bg-red-500" : budgetUsedPct > 70 ? "bg-orange-500" : "bg-green-500"}`}
                        style={{ width: `${budgetUsedPct}%` }}
                      />
                    </div>
                  </div>
                </div>

                {/* Détails expandés */}
                {selectedProject?.id === project.id && (
                  <div className="border-t border-border/50 p-5 space-y-4">
                    {/* Bouton ajouter paiement */}
                    {isAdmin && (
                      <div className="flex justify-end">
                        <Button
                          size="sm"
                          onClick={() => { setSelectedProject(project); setAddPaymentOpen(true); }}
                          className="rounded-xl bg-green-600 hover:bg-green-700 text-white"
                        >
                          <Plus className="w-4 h-4 mr-2" />
                          Ajouter un paiement reçu
                        </Button>
                      </div>
                    )}

                    {/* Historique paiements */}
                    <div>
                      <h4 className="font-semibold text-sm mb-3 text-foreground">Paiements reçus du client</h4>
                      {getProjectPayments(project.id).length === 0 ? (
                        <p className="text-sm text-muted-foreground italic">Aucun paiement enregistré</p>
                      ) : (
                        <div className="space-y-2">
                          {getProjectPayments(project.id).map((p, i) => (
                            <div key={i} className="flex items-center justify-between p-3 bg-green-50 rounded-xl text-sm">
                              <span className="text-green-700 font-medium">Paiement #{i + 1}</span>
                              <span className="font-bold text-green-700">{formatFCFA(p)}</span>
                            </div>
                          ))}
                          <div className="flex items-center justify-between p-3 bg-green-100 rounded-xl text-sm font-bold border border-green-200">
                            <span>Total encaissé</span>
                            <span className="text-green-800">{formatFCFA(received)}</span>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Dépenses du projet */}
                    <div>
                      <h4 className="font-semibold text-sm mb-3 text-foreground">Dépenses approuvées</h4>
                      {projExpenses.length === 0 ? (
                        <p className="text-sm text-muted-foreground italic">Aucune dépense approuvée</p>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead className="bg-muted/30 text-xs text-muted-foreground uppercase">
                              <tr>
                                <th className="px-3 py-2 text-left">Titre</th>
                                <th className="px-3 py-2 text-left">Catégorie</th>
                                <th className="px-3 py-2 text-left">Date</th>
                                <th className="px-3 py-2 text-right">Montant</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-border/30">
                              {projExpenses.map(e => (
                                <tr key={e.id}>
                                  <td className="px-3 py-2 font-medium">{e.title}</td>
                                  <td className="px-3 py-2 text-muted-foreground">{e.category}</td>
                                  <td className="px-3 py-2 text-muted-foreground">{formatDate(e.date)}</td>
                                  <td className="px-3 py-2 text-right font-bold text-red-700">{formatFCFA(Number(e.amount))}</td>
                                </tr>
                              ))}
                              <tr className="bg-red-50 font-bold">
                                <td colSpan={3} className="px-3 py-2 text-right text-red-800">Total dépenses</td>
                                <td className="px-3 py-2 text-right text-red-800">{formatFCFA(totalExp)}</td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>

                    {/* Résumé final */}
                    <div className="grid grid-cols-2 gap-3 p-4 bg-muted/20 rounded-xl border border-border/50">
                      <div>
                        <p className="text-xs text-muted-foreground">Solde client (restant à payer)</p>
                        <p className={`text-lg font-bold ${remaining > 0 ? "text-orange-600" : "text-green-600"}`}>{formatFCFA(remaining)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Résultat net (encaissé - dépenses)</p>
                        <p className={`text-lg font-bold ${profit >= 0 ? "text-green-600" : "text-red-600"}`}>{formatFCFA(profit)}</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Modal ajouter paiement */}
      <Dialog open={addPaymentOpen} onOpenChange={setAddPaymentOpen}>
        <DialogContent className="sm:max-w-[400px] rounded-2xl">
          <DialogHeader>
            <DialogTitle className="font-display text-xl">Ajouter un paiement reçu</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">Projet : <strong>{selectedProject?.name}</strong></p>
          <div className="space-y-4 mt-2">
            <div className="space-y-2">
              <Label>Montant reçu (FCFA) *</Label>
              <Input
                type="number"
                value={paymentAmount}
                onChange={e => setPaymentAmount(e.target.value)}
                placeholder="100 000"
                className="rounded-xl"
              />
            </div>
            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setAddPaymentOpen(false)} className="flex-1 rounded-xl">Annuler</Button>
              <Button onClick={() => handleAddPayment(selectedProject)} className="flex-1 rounded-xl bg-green-600 hover:bg-green-700 text-white">
                <CheckCircle2 className="w-4 h-4 mr-2" />
                Enregistrer
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
