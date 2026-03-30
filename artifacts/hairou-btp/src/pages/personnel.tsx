import { useState } from "react";
import { AppLayout } from "@/components/layout";
import { useListPersonnel, useCreatePersonnel, CreatePersonnelRequestContractType } from "@workspace/api-client-react";
import { useListUsers } from "@workspace/api-client-react";
import { formatFCFA } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, Users, Phone, Briefcase, Loader2, Shield, HardHat, Wrench, BarChart3, UserCog, Search } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";

const contractLabels: Record<string, string> = {
  CDI: "CDI",
  CDD: "CDD",
  JOURNALIER: "Journalier",
  FREELANCE: "Freelance",
};

// Extended speciality options — all roles that can intervene on a construction site
const specialityGroups = [
  {
    label: "Direction & Administration",
    options: [
      "Directeur de Travaux",
      "Conducteur de Travaux",
      "Chef de Chantier",
      "Ingénieur BTP",
      "Architecte",
      "Responsable Administratif",
      "Comptable / Financier",
      "Assistant Administratif",
    ],
  },
  {
    label: "Ouvriers & Artisans",
    options: [
      "Maçon",
      "Ferrailleur",
      "Coffreur",
      "Carreleur",
      "Charpentier",
      "Menuisier",
      "Électricien",
      "Plombier",
      "Peintre",
      "Étancheur",
      "Façadier",
      "Couvreur",
      "Soudeur",
      "Manœuvre",
      "Chef d'équipe",
    ],
  },
  {
    label: "Engins & Logistique",
    options: [
      "Conducteur d'engin",
      "Chauffeur / Livreur",
      "Magasinier",
      "Grutier",
    ],
  },
  {
    label: "Sécurité & Contrôle",
    options: [
      "Agent de Sécurité",
      "Contrôleur de Qualité",
      "Responsable HSE",
    ],
  },
  {
    label: "Autres",
    options: ["Technicien", "Stagiaire", "Prestataire", "Autre"],
  },
];

const roleConfig: Record<string, { label: string; color: string; icon: any }> = {
  ADMIN:         { label: "Administrateur",    color: "bg-red-100 text-red-700 border-red-200",    icon: Shield },
  CHEF_CHANTIER: { label: "Chef de Chantier",  color: "bg-blue-100 text-blue-700 border-blue-200", icon: HardHat },
  OUVRIER:       { label: "Ouvrier",            color: "bg-gray-100 text-gray-700 border-gray-200", icon: Wrench },
};

export default function Personnel() {
  const { data: personnel, isLoading: personnelLoading } = useListPersonnel();
  const { data: users, isLoading: usersLoading } = useListUsers();
  const { user: currentUser } = useAuth();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<"personnel" | "comptes">("personnel");

  const isLoading = personnelLoading || usersLoading;

  // Personnel tab (workers in personnelTable - pointable)
  const filteredPersonnel = (personnel || []).filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    (p.trade || "").toLowerCase().includes(search.toLowerCase())
  );
  const active = filteredPersonnel.filter(p => p.isActive);
  const inactive = filteredPersonnel.filter(p => !p.isActive);

  // Comptes tab (users with accounts - all roles)
  const approvedUsers = (users || []).filter((u: any) =>
    u.status === "APPROVED" &&
    (u.name.toLowerCase().includes(search.toLowerCase()) ||
     u.role.toLowerCase().includes(search.toLowerCase()) ||
     (u.email || "").toLowerCase().includes(search.toLowerCase()))
  );

  const canManage = currentUser?.role === "ADMIN" || currentUser?.canAddWorkers;

  return (
    <AppLayout title="Personnel">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <p className="text-muted-foreground">Gérez votre équipe — personnel de chantier et comptes utilisateurs.</p>
          {canManage && (
            <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
              <DialogTrigger asChild>
                <Button className="bg-secondary hover:bg-secondary/90 text-white rounded-xl shadow-lg shadow-secondary/20">
                  <Plus className="w-4 h-4 mr-2" />
                  Ajouter un employé
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[520px] rounded-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle className="font-display text-2xl">Nouvel Employé</DialogTitle>
                </DialogHeader>
                <CreatePersonnelForm onSuccess={() => setIsCreateOpen(false)} />
              </DialogContent>
            </Dialog>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-muted/30 p-1 rounded-xl w-fit">
          <button
            onClick={() => setTab("personnel")}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${tab === "personnel" ? "bg-white shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >
            <Wrench className="w-3.5 h-3.5 inline mr-1.5" />
            Personnel de chantier
            <span className="ml-2 text-xs bg-muted rounded-full px-1.5 py-0.5">{(personnel || []).length}</span>
          </button>
          <button
            onClick={() => setTab("comptes")}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${tab === "comptes" ? "bg-white shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >
            <UserCog className="w-3.5 h-3.5 inline mr-1.5" />
            Comptes utilisateurs
            <span className="ml-2 text-xs bg-muted rounded-full px-1.5 py-0.5">{approvedUsers.length}</span>
          </button>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={tab === "personnel" ? "Rechercher par nom ou spécialité..." : "Rechercher par nom, rôle ou email..."}
            className="pl-9 rounded-xl h-10"
          />
        </div>

        {/* ─── PERSONNEL TAB ─────────────────────────────────────────────── */}
        {tab === "personnel" && (
          <>
            {/* Summary */}
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-white rounded-2xl border border-border/50 p-4 shadow-sm text-center">
                <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Total</p>
                <p className="text-3xl font-display font-bold text-foreground mt-1">{(personnel || []).length}</p>
              </div>
              <div className="bg-green-50 rounded-2xl border border-green-100 p-4 shadow-sm text-center">
                <p className="text-xs text-green-700 uppercase tracking-wider font-semibold">Actifs</p>
                <p className="text-3xl font-display font-bold text-green-700 mt-1">{(personnel || []).filter(p => p.isActive).length}</p>
              </div>
              <div className="bg-red-50 rounded-2xl border border-red-100 p-4 shadow-sm text-center">
                <p className="text-xs text-red-500 uppercase tracking-wider font-semibold">Inactifs</p>
                <p className="text-3xl font-display font-bold text-red-400 mt-1">{(personnel || []).filter(p => !p.isActive).length}</p>
              </div>
            </div>

            {isLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {[1,2,3,4,5,6].map(i => <div key={i} className="h-36 bg-muted/50 rounded-2xl animate-pulse" />)}
              </div>
            ) : active.length === 0 && inactive.length === 0 ? (
              <EmptyState label="Aucun employé enregistré" sublabel="Ajoutez votre premier employé pour commencer." onAction={() => setIsCreateOpen(true)} actionLabel="Ajouter un employé" />
            ) : (
              <>
                {active.length > 0 && (
                  <section className="space-y-3">
                    <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wider">Actifs ({active.length})</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                      {active.map(p => <PersonnelCard key={p.id} personnel={p} />)}
                    </div>
                  </section>
                )}
                {inactive.length > 0 && (
                  <section className="space-y-3">
                    <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wider">Inactifs ({inactive.length})</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                      {inactive.map(p => <PersonnelCard key={p.id} personnel={p} />)}
                    </div>
                  </section>
                )}
              </>
            )}
          </>
        )}

        {/* ─── COMPTES TAB ──────────────────────────────────────────────── */}
        {tab === "comptes" && (
          <>
            {isLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {[1,2,3,4].map(i => <div key={i} className="h-28 bg-muted/50 rounded-2xl animate-pulse" />)}
              </div>
            ) : approvedUsers.length === 0 ? (
              <EmptyState label="Aucun compte utilisateur trouvé" sublabel="Les comptes approuvés apparaîtront ici." />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {approvedUsers.map((u: any) => <UserAccountCard key={u.id} user={u} />)}
              </div>
            )}
          </>
        )}
      </div>
    </AppLayout>
  );
}

function PersonnelCard({ personnel: p }: { personnel: any }) {
  return (
    <div className={`bg-white rounded-2xl border shadow-sm p-5 transition-all hover:shadow-md ${p.isActive ? "border-border/50" : "border-red-100 opacity-70"}`}>
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-full bg-secondary/10 flex items-center justify-center font-bold text-secondary text-sm border border-secondary/20">
            {p.name.substring(0, 2).toUpperCase()}
          </div>
          <div>
            <h4 className="font-bold text-foreground">{p.name}</h4>
            <p className="text-xs text-muted-foreground">{p.trade}</p>
          </div>
        </div>
        <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${p.isActive ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600"}`}>
          {p.isActive ? "Actif" : "Inactif"}
        </span>
      </div>
      <div className="space-y-1.5 text-xs text-muted-foreground">
        {p.phone && (
          <div className="flex items-center gap-2">
            <Phone className="w-3 h-3" />
            <span>{p.phone}</span>
          </div>
        )}
        <div className="flex items-center gap-2">
          <Briefcase className="w-3 h-3" />
          <span>{contractLabels[p.contractType] || p.contractType}</span>
        </div>
        {p.dailyWage > 0 && (
          <div className="flex items-center justify-between mt-3 pt-3 border-t border-border/40">
            <span className="font-medium">Salaire journalier</span>
            <span className="font-bold text-primary">{formatFCFA(Number(p.dailyWage))}</span>
          </div>
        )}
        {(p.totalDaysWorked > 0 || p.totalPayOwed > 0) && (
          <div className="flex items-center justify-between pt-1">
            <span>{p.totalDaysWorked} jour(s) pointé(s)</span>
            <span className="font-semibold text-foreground">{formatFCFA(p.totalPayOwed)}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function UserAccountCard({ user: u }: { user: any }) {
  const cfg = roleConfig[u.role] || roleConfig.OUVRIER;
  const Icon = cfg.icon;
  return (
    <div className="bg-white rounded-2xl border border-border/50 shadow-sm p-5 hover:shadow-md transition-all">
      <div className="flex items-start gap-3">
        <div className="w-11 h-11 rounded-full bg-primary/10 flex items-center justify-center font-bold text-primary text-sm border border-primary/20 shrink-0">
          {u.name.substring(0, 2).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h4 className="font-bold text-foreground truncate">{u.name}</h4>
              <p className="text-xs text-muted-foreground truncate">{u.email}</p>
            </div>
            <span className={`text-[10px] font-bold px-2 py-1 rounded-full border whitespace-nowrap ${cfg.color}`}>
              {cfg.label}
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5 mt-2">
            {u.phone && (
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <Phone className="w-3 h-3" />{u.phone}
              </span>
            )}
          </div>
          {/* Permissions summary */}
          <div className="flex flex-wrap gap-1 mt-2">
            {u.canManagePointage && (
              <span className="text-[10px] bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded-md border border-blue-100">Pointage</span>
            )}
            {u.canViewFinances && (
              <span className="text-[10px] bg-green-50 text-green-700 px-1.5 py-0.5 rounded-md border border-green-100">Finances</span>
            )}
            {u.canAddProjects && (
              <span className="text-[10px] bg-purple-50 text-purple-700 px-1.5 py-0.5 rounded-md border border-purple-100">Projets</span>
            )}
            {u.canAddWorkers && (
              <span className="text-[10px] bg-orange-50 text-orange-700 px-1.5 py-0.5 rounded-md border border-orange-100">Personnel</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function EmptyState({ label, sublabel, onAction, actionLabel }: { label: string; sublabel: string; onAction?: () => void; actionLabel?: string }) {
  return (
    <div className="flex flex-col items-center justify-center p-16 text-center bg-white rounded-3xl border border-border/50 shadow-sm">
      <div className="w-20 h-20 bg-muted rounded-full flex items-center justify-center mb-4">
        <Users className="w-10 h-10 text-muted-foreground/50" />
      </div>
      <h3 className="text-xl font-bold mb-2">{label}</h3>
      <p className="text-muted-foreground mb-6">{sublabel}</p>
      {onAction && actionLabel && (
        <Button onClick={onAction} className="rounded-xl">{actionLabel}</Button>
      )}
    </div>
  );
}

function CreatePersonnelForm({ onSuccess }: { onSuccess: () => void }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const createMutation = useCreatePersonnel({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/personnel"] });
        toast({ title: "Employé ajouté avec succès" });
        onSuccess();
      },
      onError: () => toast({ title: "Erreur", description: "Impossible d'ajouter l'employé.", variant: "destructive" }),
    }
  });

  const [form, setForm] = useState({
    name: "",
    phone: "",
    trade: "",
    contractType: "JOURNALIER" as CreatePersonnelRequestContractType,
    dailyWage: "",
    idNumber: "",
  });
  const [customTrade, setCustomTrade] = useState("");
  const [useCustom, setUseCustom] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const finalTrade = useCustom ? customTrade : form.trade;
    if (!form.name || !finalTrade) return;
    createMutation.mutate({
      data: {
        ...form,
        trade: finalTrade,
        dailyWage: form.dailyWage ? Number(form.dailyWage) : undefined,
        idNumber: form.idNumber || undefined,
        phone: form.phone || undefined,
      }
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 mt-2">
      <div className="space-y-2">
        <Label>Nom complet *</Label>
        <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Prénom NOM" required className="rounded-xl" />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Téléphone</Label>
          <Input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="77 XXX XX XX" className="rounded-xl" />
        </div>
        <div className="space-y-2">
          <Label>N° CNI / Identité</Label>
          <Input value={form.idNumber} onChange={e => setForm({ ...form, idNumber: e.target.value })} placeholder="Optionnel" className="rounded-xl" />
        </div>
      </div>

      <div className="space-y-2">
        <Label>Fonction / Spécialité *</Label>
        {!useCustom ? (
          <>
            <Select value={form.trade} onValueChange={v => {
              if (v === "__custom__") { setUseCustom(true); return; }
              setForm({ ...form, trade: v });
            }}>
              <SelectTrigger className="rounded-xl"><SelectValue placeholder="Sélectionner la fonction" /></SelectTrigger>
              <SelectContent>
                {specialityGroups.map(group => (
                  <div key={group.label}>
                    <div className="px-2 py-1.5 text-xs font-bold text-muted-foreground uppercase tracking-wide bg-muted/40">{group.label}</div>
                    {group.options.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </div>
                ))}
                <SelectItem value="__custom__">✏️ Autre (saisie libre)...</SelectItem>
              </SelectContent>
            </Select>
          </>
        ) : (
          <div className="flex gap-2">
            <Input
              value={customTrade}
              onChange={e => setCustomTrade(e.target.value)}
              placeholder="Saisir la fonction..."
              className="rounded-xl flex-1"
              autoFocus
            />
            <Button type="button" variant="outline" size="sm" className="rounded-xl" onClick={() => setUseCustom(false)}>
              ← Liste
            </Button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Type de contrat *</Label>
          <Select value={form.contractType} onValueChange={v => setForm({ ...form, contractType: v as CreatePersonnelRequestContractType })}>
            <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(contractLabels).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Salaire Journalier (FCFA)</Label>
          <Input type="number" value={form.dailyWage} onChange={e => setForm({ ...form, dailyWage: e.target.value })} placeholder="15 000" className="rounded-xl" />
        </div>
      </div>

      <div className="pt-4 flex justify-end gap-3">
        <Button type="button" variant="outline" onClick={onSuccess} className="rounded-xl">Annuler</Button>
        <Button
          type="submit"
          disabled={createMutation.isPending || !form.name || (!form.trade && !customTrade)}
          className="rounded-xl bg-secondary hover:bg-secondary/90 text-white"
        >
          {createMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
          Ajouter l'employé
        </Button>
      </div>
    </form>
  );
}
