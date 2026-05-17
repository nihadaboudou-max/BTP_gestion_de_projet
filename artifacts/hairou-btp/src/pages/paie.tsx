/**
 * Page /paie — Paie hebdomadaire
 *
 * Pour chaque semaine (Lundi → Dimanche par défaut), affiche pour chaque
 * ouvrier ayant pointé : nombre de jours, heures, montant dû, déjà payé,
 * et solde restant à payer. Permet d'enregistrer un paiement (modal) avec
 * méthode (espèces, virement, mobile money…) et de générer un bordereau PDF.
 */
import { useState, useMemo } from "react";
import { AppLayout } from "@/components/layout";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatFCFA } from "@/lib/format";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import {
  Wallet, Calendar, ChevronLeft, ChevronRight, Users, DollarSign, Loader2,
  FileDown, CheckCircle2, Banknote, Smartphone, CreditCard, Building, Receipt,
  TrendingUp, TrendingDown, History,
} from "lucide-react";

const BACKEND = import.meta.env.VITE_API_URL ?? "https://btp-gestion-de-projet.onrender.com";

async function apiFetch(path: string, opts?: RequestInit) {
  const token = localStorage.getItem("hairou_token");
  const res = await fetch(`${BACKEND}${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...opts?.headers,
    },
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.message || "Erreur réseau — vérifiez votre connexion ou redéployez le backend");
  }
  return res.json();
}

// ─── Helpers de semaine ──────────────────────────────────────────────────────

/** Lundi de la semaine ISO contenant `d` */
function getMonday(d: Date): Date {
  const dt = new Date(d);
  const day = dt.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  dt.setDate(dt.getDate() + diff);
  dt.setHours(0, 0, 0, 0);
  return dt;
}

function addDays(d: Date, n: number): Date {
  const dt = new Date(d);
  dt.setDate(dt.getDate() + n);
  return dt;
}

function toISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function formatFR(d: Date): string {
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short" });
}

// ─── Méthodes de paiement ────────────────────────────────────────────────────

const PAYMENT_METHODS = [
  { value: "CASH", label: "Espèces", icon: Banknote, color: "bg-green-100 text-green-700" },
  { value: "MOBILE_MONEY", label: "Mobile Money", icon: Smartphone, color: "bg-orange-100 text-orange-700" },
  { value: "BANK_TRANSFER", label: "Virement bancaire", icon: Building, color: "bg-blue-100 text-blue-700" },
  { value: "CHECK", label: "Chèque", icon: CreditCard, color: "bg-purple-100 text-purple-700" },
  { value: "OTHER", label: "Autre", icon: Receipt, color: "bg-gray-100 text-gray-700" },
];

function methodMeta(v: string) {
  return PAYMENT_METHODS.find(m => m.value === v) || PAYMENT_METHODS[4];
}

// ─── Page principale ─────────────────────────────────────────────────────────

export default function Paie() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [weekStart, setWeekStart] = useState<Date>(getMonday(new Date()));
  const [payWorker, setPayWorker] = useState<any | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  const weekEnd = addDays(weekStart, 6);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["/api/payroll/week", toISO(weekStart)],
    queryFn: () => apiFetch(`/api/payroll/week?start=${toISO(weekStart)}&end=${toISO(weekEnd)}`),
  });

  const summary = data?.summary || { totalDue: 0, totalPaid: 0, totalBalance: 0, workerCount: 0 };
  const workers: any[] = data?.workers || [];

  const goPrevWeek = () => setWeekStart(prev => addDays(prev, -7));
  const goNextWeek = () => setWeekStart(prev => addDays(prev, 7));
  const goCurrentWeek = () => setWeekStart(getMonday(new Date()));

  const isCurrentWeek = useMemo(() => {
    return toISO(getMonday(new Date())) === toISO(weekStart);
  }, [weekStart]);

  const handleExportCSV = () => {
    const rows: any[][] = [
      ["Ouvrier", "Métier", "Jours travaillés", "Heures totales", "Montant dû (FCFA)", "Déjà payé (FCFA)", "Reste à payer (FCFA)"],
      ...workers.map(w => [w.name, w.trade, w.daysWorked, w.totalHours.toFixed(2), w.totalAmount, w.alreadyPaid, w.balance]),
      [],
      ["TOTAUX", "", "", "", summary.totalDue, summary.totalPaid, summary.totalBalance],
    ];
    const csv = rows.map(r => r.map(c => {
      const s = String(c ?? "");
      return s.includes(",") || s.includes("\"") || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(",")).join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `paie_${toISO(weekStart)}_${toISO(weekEnd)}.csv`;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <AppLayout title="Paie hebdomadaire">
      <div className="space-y-6">
        <PageHeader
          backTo="/dashboard"
          backLabel="Retour au tableau de bord"
          title="Paie hebdomadaire"
          subtitle="Centralise les pointages de la semaine pour effectuer les paiements aux ouvriers"
        />

        {/* Sélecteur de semaine */}
        <div className="bg-white rounded-2xl border border-border/50 shadow-sm p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm" onClick={goPrevWeek} className="rounded-xl">
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <div className="text-center min-w-[240px]">
              <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">
                Semaine du
              </p>
              <p className="font-display font-bold text-foreground text-lg">
                {formatFR(weekStart)} → {formatFR(weekEnd)} {weekEnd.getFullYear()}
              </p>
              {isCurrentWeek && (
                <span className="inline-block text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-full font-semibold mt-1">
                  Semaine en cours
                </span>
              )}
            </div>
            <Button variant="outline" size="sm" onClick={goNextWeek} className="rounded-xl">
              <ChevronRight className="w-4 h-4" />
            </Button>
            {!isCurrentWeek && (
              <Button variant="ghost" size="sm" onClick={goCurrentWeek} className="rounded-xl text-xs">
                Aujourd'hui
              </Button>
            )}
            {/* Date picker custom */}
            <Input
              type="date"
              value={toISO(weekStart)}
              onChange={e => {
                if (e.target.value) setWeekStart(getMonday(new Date(e.target.value)));
              }}
              className="h-9 rounded-xl text-xs w-36"
            />
          </div>

          <div className="flex gap-2">
            <Button variant="outline" onClick={handleExportCSV} className="rounded-xl">
              <FileDown className="w-4 h-4 mr-2" /> Export CSV
            </Button>
            <Button variant="outline" onClick={handlePrint} className="rounded-xl">
              <Receipt className="w-4 h-4 mr-2" /> Bordereau (imprimer)
            </Button>
            <Button variant="outline" onClick={() => setShowHistory(true)} className="rounded-xl">
              <History className="w-4 h-4 mr-2" /> Historique
            </Button>
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <KpiCard
            label="Ouvriers concernés"
            value={summary.workerCount.toString()}
            icon={Users}
            color="bg-blue-50 text-blue-700 border-blue-100"
          />
          <KpiCard
            label="Montant total dû"
            value={formatFCFA(summary.totalDue)}
            icon={DollarSign}
            color="bg-amber-50 text-amber-700 border-amber-100"
          />
          <KpiCard
            label="Déjà payé"
            value={formatFCFA(summary.totalPaid)}
            icon={CheckCircle2}
            color="bg-green-50 text-green-700 border-green-100"
          />
          <KpiCard
            label="Reste à payer"
            value={formatFCFA(summary.totalBalance)}
            icon={summary.totalBalance > 0 ? TrendingUp : TrendingDown}
            color={summary.totalBalance > 0
              ? "bg-red-50 text-red-700 border-red-100"
              : "bg-green-50 text-green-700 border-green-100"}
          />
        </div>

        {/* Tableau */}
        <div className="bg-white rounded-2xl border border-border/50 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-border/30 flex items-center gap-2">
            <Wallet className="w-5 h-5 text-primary" />
            <h3 className="font-bold text-foreground">Détail par ouvrier</h3>
          </div>

          {isLoading ? (
            <div className="p-10 text-center text-muted-foreground">
              <Loader2 className="w-6 h-6 animate-spin inline-block mr-2" />
              Calcul de la paie...
            </div>
          ) : workers.length === 0 ? (
            <div className="p-12 text-center">
              <Calendar className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
              <p className="font-bold text-foreground">Aucun pointage cette semaine</p>
              <p className="text-sm text-muted-foreground mt-1">
                Les fiches de pointage de la période apparaîtront ici.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/30 text-muted-foreground text-xs uppercase font-semibold">
                  <tr>
                    <th className="px-4 py-3 text-left">Ouvrier</th>
                    <th className="px-4 py-3 text-center">Jours</th>
                    <th className="px-4 py-3 text-center">Heures</th>
                    <th className="px-4 py-3 text-right">Montant dû</th>
                    <th className="px-4 py-3 text-right">Déjà payé</th>
                    <th className="px-4 py-3 text-right">Solde</th>
                    <th className="px-4 py-3 text-center print:hidden">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/30">
                  {workers.map((w: any) => (
                    <tr key={w.personnelId} className="hover:bg-muted/10">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">
                            {w.name.substring(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <p className="font-semibold text-foreground">{w.name}</p>
                            <p className="text-[11px] text-muted-foreground">{w.trade}{w.phone ? ` · ${w.phone}` : ""}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center font-medium">{w.daysWorked}</td>
                      <td className="px-4 py-3 text-center">{w.totalHours.toFixed(1)}h</td>
                      <td className="px-4 py-3 text-right font-semibold text-amber-700">{formatFCFA(w.totalAmount)}</td>
                      <td className="px-4 py-3 text-right text-green-700">{formatFCFA(w.alreadyPaid)}</td>
                      <td className={`px-4 py-3 text-right font-bold ${w.balance > 0 ? 'text-red-700' : 'text-green-700'}`}>
                        {formatFCFA(w.balance)}
                      </td>
                      <td className="px-4 py-3 text-center print:hidden">
                        {w.balance > 0 ? (
                          <Button
                            size="sm"
                            onClick={() => setPayWorker({ ...w, periodStart: toISO(weekStart), periodEnd: toISO(weekEnd) })}
                            className="rounded-xl bg-secondary hover:bg-secondary/90 text-white text-xs"
                          >
                            <Banknote className="w-3.5 h-3.5 mr-1" /> Payer
                          </Button>
                        ) : (
                          <span className="text-xs text-green-700 font-medium flex items-center gap-1 justify-center">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Soldé
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-primary/5 font-bold">
                  <tr>
                    <td className="px-4 py-3" colSpan={3}>TOTAUX</td>
                    <td className="px-4 py-3 text-right">{formatFCFA(summary.totalDue)}</td>
                    <td className="px-4 py-3 text-right text-green-700">{formatFCFA(summary.totalPaid)}</td>
                    <td className="px-4 py-3 text-right text-red-700">{formatFCFA(summary.totalBalance)}</td>
                    <td className="print:hidden"></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Modal de paiement */}
      {payWorker && (
        <PaymentModal
          worker={payWorker}
          onClose={() => setPayWorker(null)}
          onSuccess={() => {
            setPayWorker(null);
            refetch();
            queryClient.invalidateQueries({ queryKey: ["/api/payroll"] });
            toast({ title: "Paiement enregistré" });
          }}
        />
      )}

      {/* Modal historique */}
      {showHistory && (
        <HistoryModal onClose={() => setShowHistory(false)} />
      )}
    </AppLayout>
  );
}

// ─── KpiCard ──────────────────────────────────────────────────────────────────

function KpiCard({ label, value, icon: Icon, color }: { label: string; value: string; icon: any; color: string }) {
  return (
    <div className={`rounded-2xl border p-4 ${color}`}>
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wider opacity-80">{label}</p>
        <Icon className="w-4 h-4 opacity-60" />
      </div>
      <p className="text-2xl font-display font-bold mt-2">{value}</p>
    </div>
  );
}

// ─── PaymentModal ─────────────────────────────────────────────────────────────

function PaymentModal({ worker, onClose, onSuccess }: { worker: any; onClose: () => void; onSuccess: () => void }) {
  const { toast } = useToast();
  const [amount, setAmount] = useState<string>(worker.balance.toString());
  const [paymentMethod, setPaymentMethod] = useState<string>("CASH");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) {
      toast({ title: "Montant invalide", variant: "destructive" });
      return;
    }
    setIsLoading(true);
    try {
      await apiFetch("/api/payroll/pay", {
        method: "POST",
        body: JSON.stringify({
          personnelId: worker.personnelId,
          periodStart: worker.periodStart,
          periodEnd: worker.periodEnd,
          amount: amt,
          paymentMethod,
          reference: reference || undefined,
          notes: notes || undefined,
          paymentDate,
        }),
      });
      onSuccess();
    } catch (err: any) {
      toast({ title: "Erreur", description: err.message, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-[480px] rounded-2xl">
        <DialogHeader>
          <DialogTitle className="font-display text-xl flex items-center gap-2">
            <Banknote className="w-5 h-5 text-secondary" />
            Paiement — {worker.name}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          {/* Récap */}
          <div className="p-3 bg-muted/30 rounded-xl text-sm space-y-1">
            <div className="flex justify-between"><span>Période :</span><span className="font-medium">{worker.periodStart} → {worker.periodEnd}</span></div>
            <div className="flex justify-between"><span>Montant dû :</span><span className="font-medium">{formatFCFA(worker.totalAmount)}</span></div>
            <div className="flex justify-between"><span>Déjà payé :</span><span className="font-medium text-green-700">{formatFCFA(worker.alreadyPaid)}</span></div>
            <div className="flex justify-between border-t border-border/40 pt-1 mt-1"><span className="font-bold">Solde :</span><span className="font-bold text-red-700">{formatFCFA(worker.balance)}</span></div>
          </div>

          <div className="space-y-2">
            <Label>Montant à payer (FCFA) *</Label>
            <Input
              type="number"
              min="1"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              required
              className="rounded-xl text-lg font-bold"
            />
            <div className="flex gap-2 text-xs">
              <button type="button" onClick={() => setAmount(worker.balance.toString())} className="px-2 py-1 bg-muted/40 rounded-md hover:bg-muted">Solde total</button>
              <button type="button" onClick={() => setAmount((worker.balance / 2).toFixed(0))} className="px-2 py-1 bg-muted/40 rounded-md hover:bg-muted">Moitié</button>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Méthode de paiement *</Label>
            <Select value={paymentMethod} onValueChange={setPaymentMethod}>
              <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
              <SelectContent>
                {PAYMENT_METHODS.map(m => (
                  <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Date de paiement</Label>
              <Input type="date" value={paymentDate} onChange={e => setPaymentDate(e.target.value)} className="rounded-xl" />
            </div>
            <div className="space-y-2">
              <Label>Référence / N° transaction</Label>
              <Input value={reference} onChange={e => setReference(e.target.value)} placeholder="N° MM / Chèque…" className="rounded-xl" />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Notes (optionnel)</Label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} className="rounded-xl resize-none" placeholder="Commentaire…" />
          </div>

          <div className="flex gap-3 pt-2">
            <Button type="button" variant="outline" onClick={onClose} className="flex-1 rounded-xl">Annuler</Button>
            <Button type="submit" disabled={isLoading} className="flex-1 rounded-xl bg-secondary hover:bg-secondary/90 text-white">
              {isLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
              Enregistrer le paiement
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── HistoryModal ─────────────────────────────────────────────────────────────

function HistoryModal({ onClose }: { onClose: () => void }) {
  const { data: history, isLoading } = useQuery({
    queryKey: ["/api/payroll/history"],
    queryFn: () => apiFetch("/api/payroll/history?limit=100"),
  });

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-[760px] rounded-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display text-xl flex items-center gap-2">
            <History className="w-5 h-5 text-primary" />
            Historique des paiements (100 derniers)
          </DialogTitle>
        </DialogHeader>
        {isLoading ? (
          <div className="p-8 text-center text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin inline mr-2" /> Chargement…
          </div>
        ) : (history as any[])?.length === 0 ? (
          <p className="p-8 text-center text-muted-foreground">Aucun paiement enregistré.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/30 text-muted-foreground text-xs uppercase font-semibold">
              <tr>
                <th className="px-3 py-2 text-left">Date</th>
                <th className="px-3 py-2 text-left">Ouvrier</th>
                <th className="px-3 py-2 text-left">Période</th>
                <th className="px-3 py-2 text-center">Méthode</th>
                <th className="px-3 py-2 text-right">Montant</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/20">
              {((history as any[]) || []).map((p: any) => {
                const m = methodMeta(p.paymentMethod);
                const Icon = m.icon;
                return (
                  <tr key={p.id} className="hover:bg-muted/10">
                    <td className="px-3 py-2 whitespace-nowrap">{new Date(p.paymentDate).toLocaleDateString("fr-FR")}</td>
                    <td className="px-3 py-2 font-medium">{p.personnelName}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{p.periodStart} → {p.periodEnd}</td>
                    <td className="px-3 py-2 text-center">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${m.color}`}>
                        <Icon className="w-3 h-3" /> {m.label}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right font-bold">{formatFCFA(p.amount)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </DialogContent>
    </Dialog>
  );
}
