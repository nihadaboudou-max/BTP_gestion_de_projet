import { useState } from "react";
import { AppLayout } from "@/components/layout";
import { useListUsers, useDeleteUser } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Plus, Shield, Loader2, Pencil, Trash2, UserCheck, UserX, Clock, CheckCircle2, XCircle, Phone } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient, useMutation, useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";

const roleLabels: Record<string, { label: string; color: string }> = {
  ADMIN: { label: "Administrateur", color: "bg-red-100 text-red-700 border-red-200" },
  CHEF_CHANTIER: { label: "Chef de Chantier", color: "bg-blue-100 text-blue-700 border-blue-200" },
  OUVRIER: { label: "Ouvrier", color: "bg-gray-100 text-gray-700 border-gray-200" },
};

const PERMISSIONS = [
  { key: "canAddWorkers", label: "Ajouter du personnel" },
  { key: "canDeleteWorkers", label: "Supprimer du personnel" },
  { key: "canEditWorkers", label: "Modifier le personnel" },
  { key: "canAddExpenses", label: "Déclarer des dépenses" },
  { key: "canDeleteExpenses", label: "Supprimer des dépenses" },
  { key: "canAddProjects", label: "Créer des projets" },
  { key: "canViewFinances", label: "Voir les finances" },
  { key: "canManagePointage", label: "Gérer le pointage" },
];

async function apiFetch(path: string, options?: RequestInit) {
  const BACKEND = "https://btp-gestion-de-projet.onrender.com";
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

const statusConfig: Record<string, { label: string; icon: any; rowClass: string; badgeClass: string }> = {
  APPROVED: { label: "Actif", icon: UserCheck, rowClass: "", badgeClass: "text-green-700 bg-green-50 border border-green-200" },
  PENDING:  { label: "En attente", icon: Clock, rowClass: "bg-amber-50/60", badgeClass: "text-amber-700 bg-amber-50 border border-amber-200" },
  REJECTED: { label: "Rejeté", icon: UserX, rowClass: "bg-red-50/40", badgeClass: "text-red-600 bg-red-50 border border-red-200" },
};

export default function Administration() {
  const { data: users, isLoading } = useListUsers();
  const { user: currentUser } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<any>(null);
  const [deleteTarget, setDeleteTarget] = useState<any>(null);
  const [approveTarget, setApproveTarget] = useState<any>(null);
  const [rejectTarget, setRejectTarget] = useState<any>(null);

  const allUsers = (users as any[]) || [];
  const pendingCount = allUsers.filter((u: any) => u.status === "PENDING").length;

  if (currentUser?.role !== 'ADMIN') {
    return (
      <AppLayout title="Administration">
        <div className="flex flex-col items-center justify-center p-20 text-center">
          <Shield className="w-16 h-16 text-muted-foreground/30 mb-4" />
          <h3 className="text-xl font-bold mb-2">Accès restreint</h3>
          <p className="text-muted-foreground">Cette page est réservée aux administrateurs.</p>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout title="Administration">
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <p className="text-muted-foreground">Gérez tous les comptes utilisateurs et leurs permissions.</p>
            {pendingCount > 0 && (
              <p className="text-sm text-amber-600 font-semibold mt-1 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" />
                {pendingCount} compte{pendingCount > 1 ? 's' : ''} en attente d'approbation
              </p>
            )}
          </div>
          <Button onClick={() => setIsCreateOpen(true)} className="bg-primary hover:bg-primary/90 text-white rounded-xl shadow-lg shadow-primary/20">
            <Plus className="w-4 h-4 mr-2" />
            Nouvel Utilisateur
          </Button>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-4 gap-4">
          {Object.entries(roleLabels).map(([role, cfg]) => (
            <div key={role} className="bg-white rounded-2xl border border-border/50 p-4 shadow-sm">
              <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">{cfg.label}</p>
              <p className="text-3xl font-display font-bold text-foreground mt-1">
                {allUsers.filter((u: any) => u.role === role).length}
              </p>
            </div>
          ))}
          <div className="bg-amber-50 rounded-2xl border border-amber-200 p-4 shadow-sm">
            <p className="text-xs text-amber-700 uppercase tracking-wider font-semibold">En attente</p>
            <p className="text-3xl font-display font-bold text-amber-800 mt-1">{pendingCount}</p>
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => <div key={i} className="h-20 bg-muted/50 rounded-2xl animate-pulse" />)}
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-border/50 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-border/50 flex items-center justify-between">
              <h3 className="font-bold text-foreground">Tous les comptes ({allUsers.length})</h3>
              <p className="text-xs text-muted-foreground">L'administrateur a accès complet à tous les comptes</p>
            </div>
            <table className="w-full text-sm text-left">
              <thead className="bg-muted/30 text-muted-foreground uppercase font-semibold text-xs border-b border-border/50">
                <tr>
                  <th className="px-6 py-4">Utilisateur</th>
                  <th className="px-6 py-4">Email</th>
                  <th className="px-6 py-4">Rôle</th>
                  <th className="px-6 py-4">Statut compte</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {allUsers.map((u: any) => {
                  const status = u.status || "APPROVED";
                  const statusCfg = statusConfig[status] || statusConfig.APPROVED;
                  const StatusIcon = statusCfg.icon;
                  return (
                    <tr key={u.id} className={`hover:bg-muted/20 transition-colors ${statusCfg.rowClass}`}>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 ${
                            status === "PENDING" ? "bg-amber-200 text-amber-800" :
                            status === "REJECTED" ? "bg-red-100 text-red-700" :
                            "bg-primary/10 text-primary"
                          }`}>
                            {u.name?.substring(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <span className="font-semibold text-foreground">{u.name}</span>
                            {u.phone && <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5"><Phone className="w-3 h-3" />{u.phone}</p>}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-muted-foreground">{u.email}</td>
                      <td className="px-6 py-4">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${roleLabels[u.role]?.color || 'bg-gray-100 text-gray-700'}`}>
                          {roleLabels[u.role]?.label || u.role}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${statusCfg.badgeClass}`}>
                          <StatusIcon className="w-3.5 h-3.5" />
                          {statusCfg.label}
                          {status === "REJECTED" && u.rejectionReason && (
                            <span className="ml-1 opacity-75 truncate max-w-[100px]" title={u.rejectionReason}>— {u.rejectionReason}</span>
                          )}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* Approve button: for PENDING and REJECTED accounts */}
                          {(status === "PENDING" || status === "REJECTED") && (
                            <Button
                              size="sm"
                              onClick={() => setApproveTarget(u)}
                              className="rounded-xl bg-green-600 hover:bg-green-700 text-white text-xs h-7 px-2.5 shadow-sm"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                              {status === "REJECTED" ? "Ré-approuver" : "Approuver"}
                            </Button>
                          )}
                          {/* Reject button: for PENDING and APPROVED accounts */}
                          {status === "PENDING" && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setRejectTarget(u)}
                              className="rounded-xl border-red-200 text-red-600 hover:bg-red-50 text-xs h-7 px-2.5"
                            >
                              <XCircle className="w-3.5 h-3.5 mr-1" />
                              Rejeter
                            </Button>
                          )}
                          {/* Edit: for all non-pending accounts */}
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setEditTarget(u)}
                            className="w-7 h-7 text-muted-foreground hover:text-primary"
                            title="Modifier"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                          {u.id !== currentUser?.id && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setDeleteTarget(u)}
                              className="w-7 h-7 text-muted-foreground hover:text-destructive"
                              title="Supprimer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {allUsers.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-muted-foreground">
                      Aucun compte trouvé
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Create user dialog */}
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogContent className="sm:max-w-[520px] rounded-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="font-display text-2xl">Créer un Compte</DialogTitle>
            </DialogHeader>
            <UserForm onSuccess={() => setIsCreateOpen(false)} />
          </DialogContent>
        </Dialog>

        {/* Edit user dialog */}
        {editTarget && (
          <Dialog open onOpenChange={() => setEditTarget(null)}>
            <DialogContent className="sm:max-w-[520px] rounded-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="font-display text-2xl">Modifier: {editTarget.name}</DialogTitle>
              </DialogHeader>
              <UserForm existingUser={editTarget} onSuccess={() => setEditTarget(null)} />
            </DialogContent>
          </Dialog>
        )}

        {/* Delete confirmation */}
        {deleteTarget && <DeleteUserModal user={deleteTarget} onClose={() => setDeleteTarget(null)} />}

        {/* Approve modal */}
        {approveTarget && (
          <ApproveModal
            user={approveTarget}
            onClose={() => setApproveTarget(null)}
            onSuccess={() => {
              setApproveTarget(null);
              queryClient.invalidateQueries({ queryKey: ["/api/users"] });
              toast({ title: `${approveTarget.name} approuvé avec succès` });
            }}
          />
        )}

        {/* Reject modal */}
        {rejectTarget && (
          <RejectModal
            user={rejectTarget}
            onClose={() => setRejectTarget(null)}
            onSuccess={() => {
              setRejectTarget(null);
              queryClient.invalidateQueries({ queryKey: ["/api/users"] });
              toast({ title: `Compte de ${rejectTarget.name} refusé` });
            }}
          />
        )}
      </div>
    </AppLayout>
  );
}

// ─── Approve Modal ──────────────────────────────────────────────────────────

function ApproveModal({ user, onClose, onSuccess }: { user: any; onClose: () => void; onSuccess: () => void }) {
  const [role, setRole] = useState(user.role || "OUVRIER");
  const [permissions, setPermissions] = useState({
    canAddWorkers: false,
    canDeleteWorkers: false,
    canEditWorkers: false,
    canAddExpenses: true,
    canDeleteExpenses: false,
    canAddProjects: role === "CHEF_CHANTIER",
    canViewFinances: false,
    canManagePointage: role === "CHEF_CHANTIER",
  });
  const [isLoading, setIsLoading] = useState(false);

  const handleApprove = async () => {
    setIsLoading(true);
    try {
      await apiFetch(`/api/users/${user.id}/approve`, {
        method: "POST",
        body: JSON.stringify({ role, permissions }),
      });
      onSuccess();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[520px] rounded-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl text-green-700">Approuver le compte</DialogTitle>
        </DialogHeader>
        <div className="space-y-5 mt-2">
          <div className="bg-green-50 border border-green-200 rounded-xl p-4">
            <p className="font-semibold text-green-800">{user.name}</p>
            <p className="text-sm text-green-700">{user.email}</p>
            {user.phone && <p className="text-xs text-green-600 mt-1">{user.phone}</p>}
          </div>

          <div className="space-y-2">
            <Label>Rôle attribué</Label>
            <Select value={role} onValueChange={r => {
              setRole(r);
              setPermissions(p => ({ ...p, canAddProjects: r === "CHEF_CHANTIER", canManagePointage: r === "CHEF_CHANTIER" }));
            }}>
              <SelectTrigger className="rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="OUVRIER">Ouvrier</SelectItem>
                <SelectItem value="CHEF_CHANTIER">Chef de Chantier</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {role !== "ADMIN" && (
            <div className="space-y-3">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Permissions accordées</Label>
              <div className="grid grid-cols-2 gap-2 bg-muted/30 rounded-xl p-4">
                {PERMISSIONS.map(perm => (
                  <label key={perm.key} className="flex items-center gap-2 cursor-pointer text-sm text-muted-foreground hover:text-foreground">
                    <input
                      type="checkbox"
                      checked={(permissions as any)[perm.key]}
                      onChange={e => setPermissions({ ...permissions, [perm.key]: e.target.checked })}
                      className="w-4 h-4 accent-primary rounded"
                    />
                    {perm.label}
                  </label>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <Button variant="outline" onClick={onClose} className="flex-1 rounded-xl">Annuler</Button>
            <Button onClick={handleApprove} disabled={isLoading} className="flex-1 rounded-xl bg-green-600 hover:bg-green-700 text-white">
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <><CheckCircle2 className="w-4 h-4 mr-2" />Approuver</>}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Reject Modal ────────────────────────────────────────────────────────────

function RejectModal({ user, onClose, onSuccess }: { user: any; onClose: () => void; onSuccess: () => void }) {
  const [reason, setReason] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleReject = async () => {
    setIsLoading(true);
    try {
      await apiFetch(`/api/users/${user.id}/reject`, {
        method: "POST",
        body: JSON.stringify({ reason }),
      });
      onSuccess();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[420px] rounded-2xl">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl text-destructive">Refuser le compte</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <p className="text-muted-foreground text-sm">
            Vous allez refuser le compte de <span className="font-bold text-foreground">{user.name}</span>.
          </p>
          <div className="space-y-2">
            <Label>Motif du refus (optionnel)</Label>
            <Textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="Ex: Informations incorrectes, demande en doublon..."
              className="rounded-xl resize-none"
              rows={3}
            />
          </div>
          <div className="flex gap-3">
            <Button variant="outline" onClick={onClose} className="flex-1 rounded-xl">Annuler</Button>
            <Button onClick={handleReject} disabled={isLoading} variant="destructive" className="flex-1 rounded-xl">
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <><XCircle className="w-4 h-4 mr-2" />Refuser</>}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── User Form ───────────────────────────────────────────────────────────────

function UserForm({ existingUser, onSuccess }: { existingUser?: any; onSuccess: () => void }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);

  const [form, setForm] = useState({
    name: existingUser?.name || "",
    email: existingUser?.email || "",
    password: "",
    role: existingUser?.role || "CHEF_CHANTIER",
    isActive: existingUser?.isActive ?? true,
    permissions: {
      canAddWorkers: existingUser?.permissions?.canAddWorkers ?? false,
      canDeleteWorkers: existingUser?.permissions?.canDeleteWorkers ?? false,
      canEditWorkers: existingUser?.permissions?.canEditWorkers ?? false,
      canAddExpenses: existingUser?.permissions?.canAddExpenses ?? true,
      canDeleteExpenses: existingUser?.permissions?.canDeleteExpenses ?? false,
      canAddProjects: existingUser?.permissions?.canAddProjects ?? false,
      canViewFinances: existingUser?.permissions?.canViewFinances ?? false,
      canManagePointage: existingUser?.permissions?.canManagePointage ?? true,
    }
  });

  const isEditing = !!existingUser;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isEditing && !form.password) {
      toast({ title: "Mot de passe requis", variant: "destructive" });
      return;
    }
    setIsLoading(true);
    try {
      if (isEditing) {
        const payload: any = { name: form.name, email: form.email, role: form.role, isActive: form.isActive, permissions: form.permissions };
        if (form.password) payload.password = form.password;
        await apiFetch(`/api/users/${existingUser.id}`, { method: "PUT", body: JSON.stringify(payload) });
        toast({ title: "Utilisateur mis à jour" });
      } else {
        await apiFetch("/api/users", { method: "POST", body: JSON.stringify(form) });
        toast({ title: "Utilisateur créé" });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      onSuccess();
    } catch (err: any) {
      toast({ title: "Erreur", description: err?.message || "Opération impossible", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 mt-2">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Nom complet *</Label>
          <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required className="rounded-xl" />
        </div>
        <div className="space-y-2">
          <Label>Email *</Label>
          <Input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} required className="rounded-xl" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>{isEditing ? "Nouveau mot de passe" : "Mot de passe *"}</Label>
          <Input type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} required={!isEditing} placeholder={isEditing ? "Laisser vide = inchangé" : ""} className="rounded-xl" />
        </div>
        <div className="space-y-2">
          <Label>Rôle *</Label>
          <Select value={form.role} onValueChange={v => setForm({ ...form, role: v })}>
            <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(roleLabels).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {isEditing && (
        <div className="flex items-center gap-3 p-3 bg-muted/40 rounded-xl">
          <input type="checkbox" id="isActive" checked={form.isActive} onChange={e => setForm({ ...form, isActive: e.target.checked })} className="w-4 h-4 accent-primary" />
          <Label htmlFor="isActive" className="cursor-pointer font-normal">Compte actif</Label>
        </div>
      )}

      {form.role !== 'ADMIN' && (
        <div className="space-y-3">
          <Label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Permissions</Label>
          <div className="grid grid-cols-2 gap-2 bg-muted/30 rounded-xl p-4">
            {PERMISSIONS.map(perm => (
              <label key={perm.key} className="flex items-center gap-2 cursor-pointer hover:text-foreground text-sm text-muted-foreground">
                <input
                  type="checkbox"
                  checked={(form.permissions as any)[perm.key]}
                  onChange={e => setForm({ ...form, permissions: { ...form.permissions, [perm.key]: e.target.checked } })}
                  className="w-4 h-4 accent-primary rounded"
                />
                {perm.label}
              </label>
            ))}
          </div>
        </div>
      )}

      <div className="pt-4 flex justify-end gap-3">
        <Button type="button" variant="outline" onClick={onSuccess} className="rounded-xl">Annuler</Button>
        <Button type="submit" disabled={isLoading} className="rounded-xl bg-primary hover:bg-primary/90 text-white">
          {isLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
          {isEditing ? "Enregistrer" : "Créer le compte"}
        </Button>
      </div>
    </form>
  );
}

// ─── Delete Modal ────────────────────────────────────────────────────────────

function DeleteUserModal({ user, onClose }: { user: any; onClose: () => void }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const deleteMutation = useDeleteUser({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/users"] });
        toast({ title: `${user.name} supprimé` });
        onClose();
      },
      onError: () => toast({ title: "Erreur de suppression", variant: "destructive" })
    }
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[400px] rounded-2xl">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl text-destructive">Supprimer l'utilisateur</DialogTitle>
        </DialogHeader>
        <div className="py-4">
          <p className="text-muted-foreground">Voulez-vous vraiment supprimer le compte de <span className="font-bold text-foreground">{user.name}</span> ? Cette action est irréversible.</p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" onClick={onClose} className="flex-1 rounded-xl">Annuler</Button>
          <Button
            onClick={() => deleteMutation.mutate({ id: user.id })}
            disabled={deleteMutation.isPending}
            variant="destructive"
            className="flex-1 rounded-xl"
          >
            {deleteMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Supprimer"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
