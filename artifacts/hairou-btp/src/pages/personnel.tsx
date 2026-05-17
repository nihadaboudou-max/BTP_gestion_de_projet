import { useState } from "react";
import { AppLayout } from "@/components/layout";
import { useListPersonnel } from "@workspace/api-client-react";
import { useListUsers } from "@workspace/api-client-react";
import { formatFCFA } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Plus, Users, Phone, Briefcase, Loader2, Shield, HardHat, Wrench,
  UserCog, Search, Archive, ArchiveRestore, Folder, Edit3, IdCard, MapPin
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { WorkerModal, type WorkerData } from "@/components/worker-modal";

const BACKEND = import.meta.env.VITE_API_URL ?? "https://btp-gestion-de-projet.onrender.com";

function apiFetch(path: string, opts?: RequestInit) {
  const token = localStorage.getItem("hairou_token");
  return fetch(`${BACKEND}${path}`, {
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

const contractLabels: Record<string, string> = {
  CDI: "CDI",
  CDD: "CDD",
  JOURNALIER: "Journalier",
  FREELANCE: "Freelance",
};

const roleConfig: Record<string, { label: string; color: string; icon: any }> = {
  ADMIN:         { label: "Administrateur",    color: "bg-red-100 text-red-700 border-red-200",    icon: Shield },
  CHEF_CHANTIER: { label: "Chef de Chantier",  color: "bg-blue-100 text-blue-700 border-blue-200", icon: HardHat },
  OUVRIER:       { label: "Ouvrier",            color: "bg-gray-100 text-gray-700 border-gray-200", icon: Wrench },
};

export default function Personnel() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: personnel, isLoading: personnelLoading } = useListPersonnel();
  const { data: archivedPersonnel, isLoading: archivedLoading } = useQuery({
    queryKey: ["/api/personnel", "archived"],
    queryFn: () => apiFetch("/api/personnel?onlyArchived=true"),
  });
  const { data: users, isLoading: usersLoading } = useListUsers();
  const { user: currentUser } = useAuth();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editWorker, setEditWorker] = useState<any | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<"personnel" | "archives" | "comptes">("personnel");

  const isLoading = personnelLoading || usersLoading || archivedLoading;

  const filteredPersonnel = (personnel || []).filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    (p.trade || "").toLowerCase().includes(search.toLowerCase())
  );
  const filteredArchived = (archivedPersonnel as any[] || []).filter((p: any) =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    (p.trade || "").toLowerCase().includes(search.toLowerCase())
  );

  const approvedUsers = (users || []).filter((u: any) =>
    u.status === "APPROVED" &&
    (u.name.toLowerCase().includes(search.toLowerCase()) ||
     u.role.toLowerCase().includes(search.toLowerCase()) ||
     (u.email || "").toLowerCase().includes(search.toLowerCase()))
  );

  const canManage = currentUser?.role === "ADMIN" || (currentUser as any)?.canAddWorkers;

  const handleCreate = async (data: WorkerData) => {
    setIsSaving(true);
    try {
      await apiFetch("/api/personnel", {
        method: "POST",
        body: JSON.stringify({
          name: data.name,
          trade: data.trade,
          phone: data.phone,
          idNumber: data.idNumber,
          emergencyContact: data.emergencyContact,
          address: data.address,
          birthDate: data.birthDate,
          hireDate: data.hireDate,
          notes: data.notes,
          dailyWage: data.dailyWage ?? 0,
          contractType: data.contractType || "JOURNALIER",
        }),
      });
      queryClient.invalidateQueries({ queryKey: ["/api/personnel"] });
      toast({ title: "Employé ajouté avec succès" });
      setIsCreateOpen(false);
    } catch (err: any) {
      toast({ title: "Erreur", description: err.message, variant: "destructive" });
      throw err;
    } finally {
      setIsSaving(false);
    }
  };

  const handleUpdate = async (data: WorkerData) => {
    if (!editWorker) return;
    setIsSaving(true);
    try {
      await apiFetch(`/api/personnel/${editWorker.id}`, {
        method: "PUT",
        body: JSON.stringify(data),
      });
      queryClient.invalidateQueries({ queryKey: ["/api/personnel"] });
      toast({ title: "Employé mis à jour" });
      setEditWorker(null);
    } catch (err: any) {
      toast({ title: "Erreur", description: err.message, variant: "destructive" });
      throw err;
    } finally {
      setIsSaving(false);
    }
  };

  const handleArchive = async (id: number, currentlyArchived: boolean) => {
    if (!confirm(currentlyArchived ? "Restaurer cet ouvrier ?" : "Archiver cet ouvrier ?")) return;
    try {
      const action = currentlyArchived ? "unarchive" : "archive";
      await apiFetch(`/api/personnel/${id}/${action}`, { method: "POST" });
      queryClient.invalidateQueries({ queryKey: ["/api/personnel"] });
      queryClient.invalidateQueries({ queryKey: ["/api/personnel", "archived"] });
      toast({ title: currentlyArchived ? "Ouvrier restauré" : "Ouvrier archivé" });
    } catch (err: any) {
      toast({ title: "Erreur", description: err.message, variant: "destructive" });
    }
  };

  return (
    <AppLayout title="Personnel">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <p className="text-muted-foreground">Gérez votre équipe — personnel de chantier et comptes utilisateurs.</p>
          {canManage && (
            <Button
              onClick={() => setIsCreateOpen(true)}
              className="bg-secondary hover:bg-secondary/90 text-white rounded-xl shadow-lg shadow-secondary/20"
            >
              <Plus className="w-4 h-4 mr-2" />
              Ajouter un employé
            </Button>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-muted/30 p-1 rounded-xl w-fit">
          <button
            onClick={() => setTab("personnel")}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${tab === "personnel" ? "bg-white shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >
            <Wrench className="w-3.5 h-3.5 inline mr-1.5" />
            Personnel actif
            <span className="ml-2 text-xs bg-muted rounded-full px-1.5 py-0.5">{(personnel || []).length}</span>
          </button>
          <button
            onClick={() => setTab("archives")}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${tab === "archives" ? "bg-white shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >
            <Archive className="w-3.5 h-3.5 inline mr-1.5" />
            Archivés
            <span className="ml-2 text-xs bg-muted rounded-full px-1.5 py-0.5">{(archivedPersonnel as any[] || []).length}</span>
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
            placeholder={tab === "comptes" ? "Rechercher par nom, rôle ou email..." : "Rechercher par nom ou spécialité..."}
            className="pl-9 rounded-xl h-10"
          />
        </div>

        {/* ─── PERSONNEL TAB ─────────────────────────────────────────────── */}
        {tab === "personnel" && (
          <>
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-white rounded-2xl border border-border/50 p-4 shadow-sm text-center">
                <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Total</p>
                <p className="text-3xl font-display font-bold text-foreground mt-1">{(personnel || []).length}</p>
              </div>
              <div className="bg-green-50 rounded-2xl border border-green-100 p-4 shadow-sm text-center">
                <p className="text-xs text-green-700 uppercase tracking-wider font-semibold">Actifs</p>
                <p className="text-3xl font-display font-bold text-green-700 mt-1">{(personnel || []).filter((p: any) => p.isActive && !p.archived).length}</p>
              </div>
              <div className="bg-orange-50 rounded-2xl border border-orange-100 p-4 shadow-sm text-center">
                <p className="text-xs text-orange-700 uppercase tracking-wider font-semibold">Inactifs</p>
                <p className="text-3xl font-display font-bold text-orange-600 mt-1">{(personnel || []).filter((p: any) => !p.isActive && !p.archived).length}</p>
              </div>
            </div>

            {isLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {[1,2,3,4,5,6].map(i => <div key={i} className="h-36 bg-muted/50 rounded-2xl animate-pulse" />)}
              </div>
            ) : filteredPersonnel.length === 0 ? (
              <EmptyState label="Aucun employé enregistré" sublabel="Ajoutez votre premier employé pour commencer." onAction={canManage ? () => setIsCreateOpen(true) : undefined} actionLabel="Ajouter un employé" />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {filteredPersonnel.map((p: any) => (
                  <PersonnelCard
                    key={p.id}
                    personnel={p}
                    onEdit={canManage ? () => setEditWorker(p) : undefined}
                    onArchive={canManage ? () => handleArchive(p.id, false) : undefined}
                  />
                ))}
              </div>
            )}
          </>
        )}

        {/* ─── ARCHIVES TAB ──────────────────────────────────────────────── */}
        {tab === "archives" && (
          <>
            {archivedLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {[1,2,3].map(i => <div key={i} className="h-36 bg-muted/50 rounded-2xl animate-pulse" />)}
              </div>
            ) : filteredArchived.length === 0 ? (
              <EmptyState label="Aucun ouvrier archivé" sublabel="Les ouvriers que vous archivez apparaîtront ici." />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {filteredArchived.map((p: any) => (
                  <PersonnelCard
                    key={p.id}
                    personnel={p}
                    archived
                    onArchive={canManage ? () => handleArchive(p.id, true) : undefined}
                  />
                ))}
              </div>
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

      {/* Modal création */}
      <WorkerModal
        open={isCreateOpen}
        onOpenChange={setIsCreateOpen}
        onSubmit={handleCreate}
        isLoading={isSaving}
        submitLabel="Ajouter l'employé"
      />

      {/* Modal édition */}
      <WorkerModal
        open={!!editWorker}
        onOpenChange={(o) => { if (!o) setEditWorker(null); }}
        initial={editWorker || undefined}
        onSubmit={handleUpdate}
        isLoading={isSaving}
        submitLabel="Enregistrer les modifications"
        title="Modifier l'ouvrier"
      />
    </AppLayout>
  );
}

function PersonnelCard({ personnel: p, onEdit, onArchive, archived }: { personnel: any; onEdit?: () => void; onArchive?: () => void; archived?: boolean }) {
  return (
    <div className={`bg-white rounded-2xl border shadow-sm p-5 transition-all hover:shadow-md ${archived ? "border-gray-200 opacity-70" : p.isActive ? "border-border/50" : "border-orange-100"}`}>
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
        <div className="flex flex-col gap-1 items-end">
          {archived ? (
            <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-gray-100 text-gray-600 flex items-center gap-1">
              <Archive className="w-2.5 h-2.5" /> Archivé
            </span>
          ) : (
            <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${p.isActive ? "bg-green-100 text-green-700" : "bg-orange-100 text-orange-600"}`}>
              {p.isActive ? "Actif" : "Inactif"}
            </span>
          )}
          {p.createdViaPointage && (
            <span className="text-[9px] text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded">Créé en pointage</span>
          )}
        </div>
      </div>
      <div className="space-y-1.5 text-xs text-muted-foreground">
        {p.phone && (
          <div className="flex items-center gap-2">
            <Phone className="w-3 h-3" />
            <span>{p.phone}</span>
          </div>
        )}
        {p.idNumber && (
          <div className="flex items-center gap-2">
            <IdCard className="w-3 h-3" />
            <span>CNI : {p.idNumber}</span>
          </div>
        )}
        {p.address && (
          <div className="flex items-center gap-2">
            <MapPin className="w-3 h-3" />
            <span className="truncate">{p.address}</span>
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

      {/* Actions */}
      {(onEdit || onArchive) && (
        <div className="flex gap-2 mt-4 pt-3 border-t border-border/40">
          {onEdit && (
            <Button size="sm" variant="outline" onClick={onEdit} className="rounded-xl text-xs flex-1">
              <Edit3 className="w-3 h-3 mr-1.5" /> Modifier
            </Button>
          )}
          {onArchive && (
            <Button
              size="sm"
              variant="outline"
              onClick={onArchive}
              className={`rounded-xl text-xs flex-1 ${archived ? 'text-green-700 border-green-200 hover:bg-green-50' : 'text-orange-700 border-orange-200 hover:bg-orange-50'}`}
            >
              {archived ? <><ArchiveRestore className="w-3 h-3 mr-1.5" /> Restaurer</> : <><Archive className="w-3 h-3 mr-1.5" /> Archiver</>}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function UserAccountCard({ user: u }: { user: any }) {
  const cfg = roleConfig[u.role] || roleConfig.OUVRIER;
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
          <div className="flex flex-wrap gap-1 mt-2">
            {u.canManagePointage && (<span className="text-[10px] bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded-md border border-blue-100">Pointage</span>)}
            {u.canViewFinances && (<span className="text-[10px] bg-green-50 text-green-700 px-1.5 py-0.5 rounded-md border border-green-100">Finances</span>)}
            {u.canAddProjects && (<span className="text-[10px] bg-purple-50 text-purple-700 px-1.5 py-0.5 rounded-md border border-purple-100">Projets</span>)}
            {u.canAddWorkers && (<span className="text-[10px] bg-orange-50 text-orange-700 px-1.5 py-0.5 rounded-md border border-orange-100">Personnel</span>)}
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
