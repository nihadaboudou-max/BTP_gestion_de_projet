/**
 * Page /control-panel — Dashboard SUPER_ADMIN (vous).
 *
 * Cachée : non listée dans la navigation des clients.
 * Accès uniquement via URL directe + rôle SUPER_ADMIN dans le JWT.
 * Si quelqu'un d'autre y accède → 404 silencieux côté backend.
 *
 * Fonctionnalités :
 *  - Liste de toutes les entreprises clientes
 *  - KPI globaux plateforme
 *  - Stats par entreprise (nb users, projets, dépenses, paiements)
 *  - "Se connecter en tant que" un admin client (impersonation)
 *  - Édition plan / statut / limites / notes internes
 *  - Création manuelle d'une entreprise
 *  - Log des sessions d'impersonation
 */
import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatFCFA } from "@/lib/format";
import {
  Crown, Building2, Users, TrendingUp, Activity, LogIn, Edit3,
  Plus, Search, Loader2, EyeOff, History, ShieldCheck, AlertTriangle, Power,
} from "lucide-react";

const BACKEND = (import.meta as any).env?.VITE_API_URL ?? "https://btp-gestion-de-projet.onrender.com";

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
    const d = await res.json().catch(() => ({}));
    throw new Error(d?.message || `Erreur ${res.status}`);
  }
  return res.json();
}

const planColors: Record<string, string> = {
  FREE: "bg-gray-100 text-gray-700",
  STARTER: "bg-blue-100 text-blue-700",
  PRO: "bg-purple-100 text-purple-700",
  ENTERPRISE: "bg-amber-100 text-amber-700",
};

const statusColors: Record<string, string> = {
  TRIAL: "bg-yellow-100 text-yellow-800",
  ACTIVE: "bg-green-100 text-green-700",
  SUSPENDED: "bg-orange-100 text-orange-700",
  CANCELLED: "bg-red-100 text-red-700",
};

export default function SuperAdmin() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [editCompany, setEditCompany] = useState<any | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [showLogs, setShowLogs] = useState(false);

  // Garde : si pas SUPER_ADMIN, redirige discrètement
  if (user && user.role !== "SUPER_ADMIN") {
    navigate("/dashboard");
    return null;
  }

  const { data: stats, isLoading: loadingStats } = useQuery({
    queryKey: ["/api/super/stats"],
    queryFn: () => apiFetch("/api/super/stats"),
  });
  const { data: companies, isLoading: loadingCompanies, refetch: refetchCompanies } = useQuery({
    queryKey: ["/api/super/companies"],
    queryFn: () => apiFetch("/api/super/companies"),
  });

  const filtered = useMemo(() => {
    const list = (companies as any[]) || [];
    if (!search.trim()) return list;
    const q = search.toLowerCase();
    return list.filter((c: any) =>
      c.name.toLowerCase().includes(q) ||
      c.slug.toLowerCase().includes(q) ||
      (c.owner_email || "").toLowerCase().includes(q)
    );
  }, [companies, search]);

  const handleImpersonate = async (companyId: number, userId: number, userName: string) => {
    const reason = prompt(`Raison de la connexion en tant que ${userName} ? (facultatif)`);
    if (reason === null) return;
    try {
      const data = await apiFetch(`/api/super/impersonate/${userId}`, {
        method: "POST",
        body: JSON.stringify({ reason: reason || "Support/Vérification" }),
      });
      // Sauvegarde le token SUPER_ADMIN pour pouvoir revenir
      const adminToken = localStorage.getItem("hairou_token");
      if (adminToken) localStorage.setItem("hairou_super_token_backup", adminToken);
      // Bascule sur le token impersonation
      localStorage.setItem("hairou_token", data.token);
      toast({ title: `Connecté en tant que ${userName}`, description: "Naviguez normalement. Pour revenir, déconnectez-vous." });
      queryClient.clear();
      window.location.href = "/dashboard";
    } catch (err: any) {
      toast({ title: "Erreur", description: err.message, variant: "destructive" });
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white">
      {/* Header sombre, distinct du reste de l'app */}
      <header className="border-b border-white/10 bg-black/30 backdrop-blur sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500 flex items-center justify-center shadow-lg shadow-amber-500/30">
              <Crown className="w-6 h-6 text-slate-900" />
            </div>
            <div>
              <h1 className="font-display font-bold text-xl text-white">Control Panel</h1>
              <p className="text-xs text-white/60">Super-Admin · Vue globale plateforme</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-white/60 flex items-center gap-1">
              <EyeOff className="w-3.5 h-3.5" /> Mode caché
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowLogs(true)}
              className="text-white/80 hover:text-white hover:bg-white/10 rounded-xl"
            >
              <History className="w-4 h-4 mr-1.5" /> Logs accès
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                localStorage.removeItem("hairou_token");
                localStorage.removeItem("hairou_super_token_backup");
                navigate("/login");
              }}
              className="text-white/80 hover:text-white hover:bg-white/10 rounded-xl"
            >
              <Power className="w-4 h-4 mr-1.5" /> Déconnexion
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8 space-y-6">
        {/* KPIs globaux */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <SuperKpi label="Entreprises actives" value={(stats as any)?.active_companies || 0} icon={Building2} color="from-blue-500 to-blue-600" />
          <SuperKpi label="En essai gratuit" value={(stats as any)?.trial_companies || 0} icon={ShieldCheck} color="from-amber-500 to-orange-500" />
          <SuperKpi label="Clients payants" value={(stats as any)?.paying_companies || 0} icon={TrendingUp} color="from-green-500 to-emerald-600" />
          <SuperKpi label="Total users" value={(stats as any)?.total_users || 0} icon={Users} color="from-purple-500 to-pink-500" />
        </div>

        <div className="grid grid-cols-3 sm:grid-cols-4 gap-4">
          <SuperKpi label="Projets totaux" value={(stats as any)?.total_projects || 0} icon={Building2} color="from-slate-500 to-slate-600" small />
          <SuperKpi label="Ouvriers totaux" value={(stats as any)?.total_personnel || 0} icon={Users} color="from-slate-500 to-slate-600" small />
          <SuperKpi label="Fiches pointage" value={(stats as any)?.total_pointages || 0} icon={Activity} color="from-slate-500 to-slate-600" small />
          <SuperKpi label="Total payé (FCFA)" value={formatFCFA(parseFloat((stats as any)?.total_paid || "0"))} icon={TrendingUp} color="from-slate-500 to-slate-600" small isString />
        </div>

        {/* Recherche + Création */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Rechercher une entreprise (nom, slug, email)…"
              className="pl-9 bg-white/5 border-white/10 text-white placeholder:text-white/40 rounded-xl"
            />
          </div>
          <Button onClick={() => setIsCreateOpen(true)} className="rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-900 font-semibold">
            <Plus className="w-4 h-4 mr-2" /> Créer une entreprise
          </Button>
        </div>

        {/* Liste entreprises */}
        <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
          {loadingCompanies ? (
            <div className="p-10 text-center">
              <Loader2 className="w-6 h-6 animate-spin inline mr-2" />
              Chargement…
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-10 text-center text-white/60">Aucune entreprise.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-white/5 text-white/60 text-xs uppercase">
                  <tr>
                    <th className="px-4 py-3 text-left">Entreprise</th>
                    <th className="px-4 py-3 text-left">Email</th>
                    <th className="px-4 py-3 text-center">Plan</th>
                    <th className="px-4 py-3 text-center">Statut</th>
                    <th className="px-4 py-3 text-center">Users</th>
                    <th className="px-4 py-3 text-center">Projets</th>
                    <th className="px-4 py-3 text-right">Dépenses</th>
                    <th className="px-4 py-3 text-right">Payé</th>
                    <th className="px-4 py-3 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {filtered.map((c: any) => (
                    <tr key={c.id} className="hover:bg-white/5">
                      <td className="px-4 py-3">
                        <p className="font-semibold">{c.name}</p>
                        <p className="text-xs text-white/40">{c.slug}</p>
                      </td>
                      <td className="px-4 py-3 text-white/70">{c.owner_email || "—"}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${planColors[c.plan] || "bg-gray-100 text-gray-700"}`}>{c.plan}</span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${statusColors[c.status] || "bg-gray-100 text-gray-700"}`}>{c.status}</span>
                      </td>
                      <td className="px-4 py-3 text-center">{c.user_count || 0}</td>
                      <td className="px-4 py-3 text-center">{c.project_count || 0}</td>
                      <td className="px-4 py-3 text-right text-orange-300">{formatFCFA(parseFloat(c.total_expenses || "0"))}</td>
                      <td className="px-4 py-3 text-right text-green-300">{formatFCFA(parseFloat(c.total_payments || "0"))}</td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex gap-1 justify-center">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setEditCompany(c)}
                            className="h-7 w-7 p-0 text-white/70 hover:text-white hover:bg-white/10 rounded-lg"
                            title="Éditer"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </Button>
                          <CompanyImpersonateButton company={c} onImpersonate={handleImpersonate} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      {/* Modals */}
      {editCompany && (
        <EditCompanyModal
          company={editCompany}
          onClose={() => setEditCompany(null)}
          onSaved={() => { setEditCompany(null); refetchCompanies(); }}
        />
      )}
      {isCreateOpen && (
        <CreateCompanyModal
          onClose={() => setIsCreateOpen(false)}
          onCreated={() => { setIsCreateOpen(false); refetchCompanies(); queryClient.invalidateQueries({ queryKey: ["/api/super/stats"] }); }}
        />
      )}
      {showLogs && <LogsModal onClose={() => setShowLogs(false)} />}
    </div>
  );
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────

function SuperKpi({ label, value, icon: Icon, color, small, isString }: any) {
  return (
    <div className={`bg-gradient-to-br ${color} rounded-2xl p-4 text-white shadow-lg`}>
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wider opacity-90">{label}</p>
        <Icon className={`${small ? "w-4 h-4" : "w-5 h-5"} opacity-70`} />
      </div>
      <p className={`${small ? "text-xl" : "text-3xl"} font-display font-bold mt-2`}>
        {isString ? value : value}
      </p>
    </div>
  );
}

// ─── Impersonate button ──────────────────────────────────────────────────────

function CompanyImpersonateButton({ company, onImpersonate }: { company: any; onImpersonate: (cId: number, uId: number, name: string) => void }) {
  const [showPicker, setShowPicker] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: ["/api/super/companies", company.id, "detail"],
    queryFn: () => apiFetch(`/api/super/companies/${company.id}`),
    enabled: showPicker,
  });

  return (
    <>
      <Button
        size="sm"
        variant="ghost"
        onClick={() => setShowPicker(true)}
        className="h-7 w-7 p-0 text-amber-300 hover:text-amber-200 hover:bg-amber-500/20 rounded-lg"
        title="Se connecter en tant que…"
      >
        <LogIn className="w-3.5 h-3.5" />
      </Button>
      {showPicker && (
        <Dialog open onOpenChange={() => setShowPicker(false)}>
          <DialogContent className="rounded-2xl">
            <DialogHeader>
              <DialogTitle>Se connecter en tant que… ({company.name})</DialogTitle>
            </DialogHeader>
            {isLoading ? (
              <div className="py-8 text-center"><Loader2 className="w-5 h-5 animate-spin inline" /></div>
            ) : (
              <div className="space-y-2 max-h-[60vh] overflow-y-auto">
                {((data as any)?.users || []).map((u: any) => (
                  <button
                    key={u.id}
                    onClick={() => { setShowPicker(false); onImpersonate(company.id, u.id, u.name); }}
                    className="w-full flex items-center gap-3 p-3 rounded-xl border border-border hover:bg-muted/30 transition-all text-left"
                  >
                    <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">
                      {u.name.substring(0, 2).toUpperCase()}
                    </div>
                    <div className="flex-1">
                      <p className="font-semibold">{u.name}</p>
                      <p className="text-xs text-muted-foreground">{u.email} · {u.role}</p>
                    </div>
                    <LogIn className="w-4 h-4 text-amber-600" />
                  </button>
                ))}
              </div>
            )}
            <div className="flex items-start gap-2 mt-3 p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <p>Action loggée silencieusement. Vous reviendrez à votre session super-admin en vous déconnectant.</p>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}

// ─── Edit Company ─────────────────────────────────────────────────────────────

function EditCompanyModal({ company, onClose, onSaved }: any) {
  const { toast } = useToast();
  const [form, setForm] = useState({
    name: company.name,
    ownerEmail: company.owner_email || "",
    phone: company.phone || "",
    address: company.address || "",
    plan: company.plan,
    status: company.status,
    maxUsers: company.max_users || 5,
    maxProjects: company.max_projects || 3,
    notes: company.notes || "",
    isActive: company.is_active,
  });
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      await apiFetch(`/api/super/companies/${company.id}`, {
        method: "PUT",
        body: JSON.stringify(form),
      });
      toast({ title: "Entreprise modifiée" });
      onSaved();
    } catch (err: any) {
      toast({ title: "Erreur", description: err.message, variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[560px] rounded-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Edit3 className="w-5 h-5" /> {company.name}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Nom</Label><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="rounded-xl" /></div>
            <div><Label>Email propriétaire</Label><Input value={form.ownerEmail} onChange={e => setForm({ ...form, ownerEmail: e.target.value })} className="rounded-xl" /></div>
            <div><Label>Téléphone</Label><Input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} className="rounded-xl" /></div>
            <div><Label>Adresse</Label><Input value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} className="rounded-xl" /></div>
            <div>
              <Label>Plan</Label>
              <Select value={form.plan} onValueChange={v => setForm({ ...form, plan: v as any })}>
                <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="FREE">Free</SelectItem>
                  <SelectItem value="STARTER">Starter</SelectItem>
                  <SelectItem value="PRO">Pro</SelectItem>
                  <SelectItem value="ENTERPRISE">Enterprise</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Statut</Label>
              <Select value={form.status} onValueChange={v => setForm({ ...form, status: v as any })}>
                <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="TRIAL">Trial</SelectItem>
                  <SelectItem value="ACTIVE">Active</SelectItem>
                  <SelectItem value="SUSPENDED">Suspended</SelectItem>
                  <SelectItem value="CANCELLED">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Max users</Label><Input type="number" value={form.maxUsers} onChange={e => setForm({ ...form, maxUsers: parseInt(e.target.value) || 0 })} className="rounded-xl" /></div>
            <div><Label>Max projets</Label><Input type="number" value={form.maxProjects} onChange={e => setForm({ ...form, maxProjects: parseInt(e.target.value) || 0 })} className="rounded-xl" /></div>
          </div>
          <div>
            <Label>Notes internes (invisibles au client)</Label>
            <Textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={3} className="rounded-xl resize-none" placeholder="Vos notes sur ce client…" />
          </div>
          <div className="flex justify-end gap-2 pt-2 border-t">
            <Button type="button" variant="outline" onClick={onClose} className="rounded-xl">Annuler</Button>
            <Button type="submit" disabled={isSaving} className="rounded-xl bg-amber-500 text-slate-900 hover:bg-amber-600">
              {isSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Enregistrer
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Create Company ───────────────────────────────────────────────────────────

function CreateCompanyModal({ onClose, onCreated }: any) {
  const { toast } = useToast();
  const [form, setForm] = useState({
    name: "", slug: "", ownerName: "", ownerEmail: "", ownerPassword: "",
    phone: "", address: "", country: "SN", plan: "FREE",
  });
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.ownerEmail || !form.ownerPassword) {
      toast({ title: "Champs requis manquants", variant: "destructive" }); return;
    }
    const slug = form.slug || form.name.toLowerCase().replace(/[^a-z0-9]+/g, "-") + "-" + Date.now().toString(36);
    setIsSaving(true);
    try {
      await apiFetch("/api/super/companies", {
        method: "POST",
        body: JSON.stringify({ ...form, slug }),
      });
      toast({ title: "Entreprise créée", description: `${form.name} a été ajoutée avec son admin` });
      onCreated();
    } catch (err: any) {
      toast({ title: "Erreur", description: err.message, variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="rounded-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Créer une entreprise</DialogTitle></DialogHeader>
        <form onSubmit={handleSave} className="space-y-3">
          <div><Label>Nom entreprise *</Label><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required className="rounded-xl" /></div>
          <div><Label>Slug (facultatif)</Label><Input value={form.slug} onChange={e => setForm({ ...form, slug: e.target.value })} placeholder="auto-généré sinon" className="rounded-xl" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Nom du propriétaire *</Label><Input value={form.ownerName} onChange={e => setForm({ ...form, ownerName: e.target.value })} required className="rounded-xl" /></div>
            <div><Label>Email propriétaire *</Label><Input type="email" value={form.ownerEmail} onChange={e => setForm({ ...form, ownerEmail: e.target.value })} required className="rounded-xl" /></div>
          </div>
          <div><Label>Mot de passe propriétaire *</Label><Input type="password" value={form.ownerPassword} onChange={e => setForm({ ...form, ownerPassword: e.target.value })} required minLength={8} className="rounded-xl" /></div>
          <div className="grid grid-cols-3 gap-3">
            <div><Label>Téléphone</Label><Input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} className="rounded-xl" /></div>
            <div><Label>Pays</Label><Input value={form.country} onChange={e => setForm({ ...form, country: e.target.value })} className="rounded-xl" /></div>
            <div>
              <Label>Plan</Label>
              <Select value={form.plan} onValueChange={v => setForm({ ...form, plan: v as any })}>
                <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="FREE">Free</SelectItem>
                  <SelectItem value="STARTER">Starter</SelectItem>
                  <SelectItem value="PRO">Pro</SelectItem>
                  <SelectItem value="ENTERPRISE">Enterprise</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose} className="rounded-xl">Annuler</Button>
            <Button type="submit" disabled={isSaving} className="rounded-xl bg-amber-500 text-slate-900 hover:bg-amber-600">
              {isSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Créer
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Logs Modal ───────────────────────────────────────────────────────────────

function LogsModal({ onClose }: { onClose: () => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ["/api/super/impersonations"],
    queryFn: () => apiFetch("/api/super/impersonations"),
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[640px] rounded-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><History className="w-5 h-5" /> Logs des accès super-admin</DialogTitle></DialogHeader>
        {isLoading ? (
          <div className="py-8 text-center"><Loader2 className="w-5 h-5 animate-spin inline" /></div>
        ) : (data as any[])?.length === 0 ? (
          <p className="py-6 text-center text-muted-foreground">Aucun log d'impersonation.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-xs uppercase text-muted-foreground">
              <tr><th className="text-left p-2">Date</th><th className="text-left p-2">User cible</th><th className="text-left p-2">Entreprise</th><th className="text-left p-2">Raison</th></tr>
            </thead>
            <tbody className="divide-y">
              {((data as any[]) || []).map((l: any) => (
                <tr key={l.id}>
                  <td className="p-2 whitespace-nowrap">{new Date(l.startedAt).toLocaleString("fr-FR")}</td>
                  <td className="p-2">#{l.targetUserId}</td>
                  <td className="p-2">#{l.targetCompanyId}</td>
                  <td className="p-2 text-muted-foreground">{l.reason || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </DialogContent>
    </Dialog>
  );
}
