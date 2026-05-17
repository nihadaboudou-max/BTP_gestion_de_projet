/**
 * Page Rapports — Analytics professionnels exportables.
 * Vue stratégique pour positionner la plateforme comme outil de pilotage :
 * - Masse salariale par chantier
 * - Rentabilité (budget vs dépenses + main d'œuvre)
 * - Productivité (jours/heures pointés par ouvrier)
 * - Export CSV
 */
import { useMemo, useState } from "react";
import { AppLayout } from "@/components/layout";
import { useListProjects, useListPersonnel, useListPointageSheets, useListExpenses } from "@workspace/api-client-react";
import { formatFCFA } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  TrendingUp, BarChart3, Users, Building2, FileDown,
  Calendar, DollarSign, Activity, AlertTriangle, CheckCircle2,
} from "lucide-react";

const MONTHS_FR = [
  "Janvier","Février","Mars","Avril","Mai","Juin",
  "Juillet","Août","Septembre","Octobre","Novembre","Décembre"
];

function downloadCSV(filename: string, rows: any[][]) {
  const csv = rows.map(r => r.map(c => {
    const s = String(c ?? "");
    return s.includes(",") || s.includes("\"") || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(",")).join("\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
}

export default function Rapports() {
  const { data: projects } = useListProjects();
  const { data: personnel } = useListPersonnel();
  const { data: sheets } = useListPointageSheets();
  const { data: expenses } = useListExpenses();

  const now = new Date();
  const [month, setMonth] = useState<string>("ALL");
  const [year, setYear] = useState<number>(now.getFullYear());

  const filteredSheets = useMemo(() => {
    return (sheets as any[] || []).filter((s: any) => {
      if (!s.date) return false;
      const d = new Date(s.date);
      if (d.getFullYear() !== year) return false;
      if (month !== "ALL" && d.getMonth() !== parseInt(month)) return false;
      return true;
    });
  }, [sheets, month, year]);

  const filteredExpenses = useMemo(() => {
    return (expenses as any[] || []).filter((e: any) => {
      if (!e.date) return false;
      const d = new Date(e.date);
      if (d.getFullYear() !== year) return false;
      if (month !== "ALL" && d.getMonth() !== parseInt(month)) return false;
      return true;
    });
  }, [expenses, month, year]);

  // KPIs globaux
  const totalMasseSalariale = filteredSheets.reduce((s: number, sh: any) => s + (Number(sh.totalPay) || 0), 0);
  const totalDepenses = filteredExpenses.reduce((s: number, e: any) => s + (Number(e.amount) || 0), 0);
  const totalBudget = (projects as any[] || []).reduce((s: number, p: any) => s + (Number(p.budgetTotal) || 0), 0);
  const totalCharges = totalMasseSalariale + totalDepenses;
  const margeProjetee = totalBudget - totalCharges;

  // Par chantier
  const projectStats = useMemo(() => {
    return (projects as any[] || []).map((p: any) => {
      const sSheets = filteredSheets.filter((s: any) => s.projectId === p.id);
      const sExpenses = filteredExpenses.filter((e: any) => e.projectId === p.id);
      const masseSalariale = sSheets.reduce((sum: number, s: any) => sum + (Number(s.totalPay) || 0), 0);
      const depenses = sExpenses.reduce((sum: number, e: any) => sum + (Number(e.amount) || 0), 0);
      const total = masseSalariale + depenses;
      const budget = Number(p.budgetTotal) || 0;
      const marge = budget - total;
      const margePct = budget > 0 ? (marge / budget) * 100 : 0;
      return {
        ...p,
        masseSalariale,
        depenses,
        total,
        marge,
        margePct,
        nbFiches: sSheets.length,
      };
    }).sort((a: any, b: any) => b.total - a.total);
  }, [projects, filteredSheets, filteredExpenses]);

  // Par ouvrier
  const workerStats = useMemo(() => {
    const map = new Map<number, { name: string; trade: string; days: number; total: number }>();
    filteredSheets.forEach((s: any) => {
      (s.entries || []).forEach((e: any) => {
        if (!map.has(e.personnelId)) {
          map.set(e.personnelId, { name: e.personnelName || "?", trade: e.personnelTrade || "—", days: 0, total: 0 });
        }
        const r = map.get(e.personnelId)!;
        if (e.status !== "ABSENT") r.days += (e.status === "DEMI_JOURNEE" ? 0.5 : 1);
        r.total += Number(e.amountDue) || 0;
      });
    });
    return Array.from(map.entries())
      .map(([id, v]) => ({ id, ...v }))
      .sort((a, b) => b.total - a.total);
  }, [filteredSheets]);

  const exportProjectsCSV = () => {
    const rows: any[][] = [
      ["Chantier", "Client", "Budget", "Masse salariale", "Dépenses", "Total charges", "Marge", "Marge %", "Nb fiches"],
      ...projectStats.map((p: any) => [
        p.name, p.clientName || "", p.budgetTotal, p.masseSalariale, p.depenses, p.total, p.marge, p.margePct.toFixed(1) + "%", p.nbFiches,
      ]),
    ];
    downloadCSV(`rapport_chantiers_${year}_${month}.csv`, rows);
  };

  const exportWorkersCSV = () => {
    const rows: any[][] = [
      ["Ouvrier", "Métier", "Jours travaillés", "Total dû (FCFA)"],
      ...workerStats.map(w => [w.name, w.trade, w.days, w.total]),
    ];
    downloadCSV(`rapport_ouvriers_${year}_${month}.csv`, rows);
  };

  const periodLabel = month === "ALL" ? `Année ${year}` : `${MONTHS_FR[parseInt(month)]} ${year}`;

  return (
    <AppLayout title="Rapports & Analyses">
      <div className="space-y-6">

        {/* Header + filtres */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <p className="text-muted-foreground">Vue stratégique pour piloter votre entreprise — {periodLabel}</p>
          </div>
          <div className="flex gap-2">
            <Select value={month} onValueChange={setMonth}>
              <SelectTrigger className="w-36 rounded-xl h-10"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Toute l'année</SelectItem>
                {MONTHS_FR.map((m, i) => <SelectItem key={i} value={i.toString()}>{m}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={year.toString()} onValueChange={v => setYear(parseInt(v))}>
              <SelectTrigger className="w-24 rounded-xl h-10"><SelectValue /></SelectTrigger>
              <SelectContent>
                {[now.getFullYear(), now.getFullYear() - 1, now.getFullYear() - 2].map(y => (
                  <SelectItem key={y} value={y.toString()}>{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* KPIs principaux */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard
            label="Budget total"
            value={formatFCFA(totalBudget)}
            icon={Building2}
            color="bg-blue-50 text-blue-700 border-blue-100"
          />
          <KpiCard
            label="Masse salariale"
            value={formatFCFA(totalMasseSalariale)}
            icon={Users}
            color="bg-amber-50 text-amber-700 border-amber-100"
            sub={`${filteredSheets.length} fiche(s) de pointage`}
          />
          <KpiCard
            label="Dépenses matériaux"
            value={formatFCFA(totalDepenses)}
            icon={Activity}
            color="bg-orange-50 text-orange-700 border-orange-100"
            sub={`${filteredExpenses.length} dépense(s)`}
          />
          <KpiCard
            label="Marge prévisionnelle"
            value={formatFCFA(margeProjetee)}
            icon={margeProjetee >= 0 ? CheckCircle2 : AlertTriangle}
            color={margeProjetee >= 0 ? "bg-green-50 text-green-700 border-green-100" : "bg-red-50 text-red-700 border-red-100"}
            sub={totalBudget > 0 ? `${((margeProjetee / totalBudget) * 100).toFixed(1)}% du budget` : ""}
          />
        </div>

        {/* Rentabilité par chantier */}
        <div className="bg-white rounded-2xl border border-border/50 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-border/30">
            <div className="flex items-center gap-2">
              <Building2 className="w-5 h-5 text-primary" />
              <h3 className="font-bold text-foreground">Rentabilité par chantier</h3>
            </div>
            <Button size="sm" variant="outline" onClick={exportProjectsCSV} className="rounded-xl">
              <FileDown className="w-4 h-4 mr-1.5" /> Export CSV
            </Button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 text-muted-foreground text-xs uppercase font-semibold">
                <tr>
                  <th className="px-4 py-3 text-left">Chantier</th>
                  <th className="px-4 py-3 text-right">Budget</th>
                  <th className="px-4 py-3 text-right">Salaires</th>
                  <th className="px-4 py-3 text-right">Dépenses</th>
                  <th className="px-4 py-3 text-right">Marge</th>
                  <th className="px-4 py-3 text-right">Marge %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                {projectStats.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">Aucune donnée pour cette période</td></tr>
                )}
                {projectStats.map((p: any) => (
                  <tr key={p.id} className="hover:bg-muted/10">
                    <td className="px-4 py-3 font-medium">
                      <div>{p.name}</div>
                      {p.clientName && <div className="text-xs text-muted-foreground">Client : {p.clientName}</div>}
                    </td>
                    <td className="px-4 py-3 text-right">{formatFCFA(Number(p.budgetTotal) || 0)}</td>
                    <td className="px-4 py-3 text-right text-amber-700">{formatFCFA(p.masseSalariale)}</td>
                    <td className="px-4 py-3 text-right text-orange-700">{formatFCFA(p.depenses)}</td>
                    <td className={`px-4 py-3 text-right font-bold ${p.marge >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                      {formatFCFA(p.marge)}
                    </td>
                    <td className={`px-4 py-3 text-right font-semibold ${p.margePct >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                      {p.margePct.toFixed(1)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Top ouvriers */}
        <div className="bg-white rounded-2xl border border-border/50 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-border/30">
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5 text-primary" />
              <h3 className="font-bold text-foreground">Productivité par ouvrier</h3>
            </div>
            <Button size="sm" variant="outline" onClick={exportWorkersCSV} className="rounded-xl">
              <FileDown className="w-4 h-4 mr-1.5" /> Export CSV
            </Button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 text-muted-foreground text-xs uppercase font-semibold">
                <tr>
                  <th className="px-4 py-3 text-left">Ouvrier</th>
                  <th className="px-4 py-3 text-left">Métier</th>
                  <th className="px-4 py-3 text-right">Jours travaillés</th>
                  <th className="px-4 py-3 text-right">Total dû</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                {workerStats.length === 0 && (
                  <tr><td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">Aucune donnée pour cette période</td></tr>
                )}
                {workerStats.slice(0, 20).map(w => (
                  <tr key={w.id} className="hover:bg-muted/10">
                    <td className="px-4 py-3 font-medium">{w.name}</td>
                    <td className="px-4 py-3 text-muted-foreground">{w.trade}</td>
                    <td className="px-4 py-3 text-right">{w.days}</td>
                    <td className="px-4 py-3 text-right font-bold text-primary">{formatFCFA(w.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {workerStats.length > 20 && (
            <p className="px-4 py-2 text-xs text-muted-foreground text-center border-t border-border/30">
              {workerStats.length - 20} ouvrier(s) supplémentaire(s) — utilisez l'export CSV pour la liste complète
            </p>
          )}
        </div>

      </div>
    </AppLayout>
  );
}

function KpiCard({ label, value, icon: Icon, color, sub }: { label: string; value: string; icon: any; color: string; sub?: string }) {
  return (
    <div className={`rounded-2xl border p-4 ${color}`}>
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wider opacity-80">{label}</p>
        <Icon className="w-4 h-4 opacity-60" />
      </div>
      <p className="text-2xl font-display font-bold mt-2">{value}</p>
      {sub && <p className="text-xs opacity-70 mt-1">{sub}</p>}
    </div>
  );
}
