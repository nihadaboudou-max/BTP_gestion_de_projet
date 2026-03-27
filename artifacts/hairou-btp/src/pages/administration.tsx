import { useState } from "react";
import { AppLayout } from "@/components/layout";
import { useListUsers, useCreateUser, useUpdateUser, useDeleteUser } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Shield, Loader2, Pencil, Trash2, UserCheck, UserX } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
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

export default function Administration() {
  const { data: users, isLoading } = useListUsers();
  const { user: currentUser } = useAuth();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<any>(null);
  const [deleteTarget, setDeleteTarget] = useState<any>(null);

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
          <p className="text-muted-foreground">Gérez les comptes utilisateurs et leurs permissions.</p>
          <Button onClick={() => setIsCreateOpen(true)} className="bg-primary hover:bg-primary/90 text-white rounded-xl shadow-lg shadow-primary/20">
            <Plus className="w-4 h-4 mr-2" />
            Nouvel Utilisateur
          </Button>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-3 gap-4">
          {Object.entries(roleLabels).map(([role, cfg]) => (
            <div key={role} className="bg-white rounded-2xl border border-border/50 p-4 shadow-sm">
              <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">{cfg.label}</p>
              <p className="text-3xl font-display font-bold text-foreground mt-1">
                {users?.filter(u => u.role === role).length ?? 0}
              </p>
            </div>
          ))}
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => <div key={i} className="h-20 bg-muted/50 rounded-2xl animate-pulse" />)}
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-border/50 shadow-sm overflow-hidden">
            <table className="w-full text-sm text-left">
              <thead className="bg-muted/30 text-muted-foreground uppercase font-semibold text-xs border-b border-border/50">
                <tr>
                  <th className="px-6 py-4">Utilisateur</th>
                  <th className="px-6 py-4">Email</th>
                  <th className="px-6 py-4">Rôle</th>
                  <th className="px-6 py-4">Statut</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {users?.map(u => (
                  <tr key={u.id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-sm font-bold text-primary">
                          {u.name?.substring(0, 2).toUpperCase()}
                        </div>
                        <span className="font-semibold text-foreground">{u.name}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-muted-foreground">{u.email}</td>
                    <td className="px-6 py-4">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${roleLabels[u.role]?.color || 'bg-gray-100 text-gray-700'}`}>
                        {roleLabels[u.role]?.label || u.role}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${u.isActive ? 'text-green-600' : 'text-red-500'}`}>
                        {u.isActive ? <UserCheck className="w-3.5 h-3.5" /> : <UserX className="w-3.5 h-3.5" />}
                        {u.isActive ? 'Actif' : 'Désactivé'}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setEditTarget(u)}
                          className="w-8 h-8 text-muted-foreground hover:text-primary"
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
                        {u.id !== currentUser?.id && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setDeleteTarget(u)}
                            className="w-8 h-8 text-muted-foreground hover:text-destructive"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
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
        {deleteTarget && (
          <DeleteUserModal user={deleteTarget} onClose={() => setDeleteTarget(null)} />
        )}
      </div>
    </AppLayout>
  );
}

function UserForm({ existingUser, onSuccess }: { existingUser?: any; onSuccess: () => void }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const createMutation = useCreateUser({
    mutation: {
      onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/users"] }); toast({ title: "Utilisateur créé" }); onSuccess(); },
      onError: (err: any) => toast({ title: "Erreur", description: err?.data?.message || "Impossible de créer l'utilisateur", variant: "destructive" })
    }
  });
  const updateMutation = useUpdateUser({
    mutation: {
      onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/users"] }); toast({ title: "Utilisateur mis à jour" }); onSuccess(); },
      onError: () => toast({ title: "Erreur de mise à jour", variant: "destructive" })
    }
  });

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
  const isPending = createMutation.isPending || updateMutation.isPending;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isEditing) {
      const data: any = { name: form.name, email: form.email, role: form.role, isActive: form.isActive, permissions: form.permissions };
      if (form.password) data.password = form.password;
      updateMutation.mutate({ id: existingUser.id, data });
    } else {
      if (!form.password) { toast({ title: "Mot de passe requis", variant: "destructive" }); return; }
      createMutation.mutate({ data: form });
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
        <Button type="submit" disabled={isPending} className="rounded-xl bg-primary hover:bg-primary/90 text-white">
          {isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
          {isEditing ? "Enregistrer" : "Créer le compte"}
        </Button>
      </div>
    </form>
  );
}

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
