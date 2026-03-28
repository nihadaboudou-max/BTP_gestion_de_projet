import { useState } from "react";
import { Link } from "wouter";
import { AppLayout } from "@/components/layout";
import { useListProjects, useCreateProject, useListUsers, CreateProjectRequestStatus } from "@workspace/api-client-react";
import { formatFCFA, formatDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, MapPin, Building2, Calendar, Users, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useSocket } from "@/hooks/use-socket";

const statusLabels: Record<string, { label: string; color: string }> = {
  PLANIFIE: { label: "Planifié", color: "bg-gray-100 text-gray-700 border-gray-200" },
  EN_COURS: { label: "En cours", color: "bg-blue-100 text-blue-700 border-blue-200" },
  EN_PAUSE: { label: "En pause", color: "bg-orange-100 text-orange-700 border-orange-200" },
  TERMINE: { label: "Terminé", color: "bg-green-100 text-green-700 border-green-200" },
};

export default function Projects() {
  const { data: projects, isLoading } = useListProjects();
  const { user } = useAuth();
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  // Real-time synchronization
  useSocket();

  const canCreate = user?.role === "ADMIN" || user?.role === "CHEF_CHANTIER";

  return (
    <AppLayout title="Projets">
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <p className="text-muted-foreground">
            {user?.role === "ADMIN" ? "Vue globale de tous les chantiers." : "Chantiers de votre équipe."}
          </p>
          {canCreate && (
            <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
              <DialogTrigger asChild>
                <Button className="bg-accent hover:bg-accent/90 text-white rounded-xl shadow-lg shadow-accent/20">
                  <Plus className="w-4 h-4 mr-2" />
                  Nouveau Projet
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[520px] rounded-2xl">
                <DialogHeader>
                  <DialogTitle className="font-display text-2xl">Créer un Projet</DialogTitle>
                </DialogHeader>
                <CreateProjectForm onSuccess={() => setIsCreateOpen(false)} />
              </DialogContent>
            </Dialog>
          )}
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map(i => <div key={i} className="h-64 bg-muted/50 rounded-2xl animate-pulse" />)}
          </div>
        ) : projects?.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-16 text-center bg-white rounded-3xl border border-border/50 shadow-sm">
            <div className="w-20 h-20 bg-muted rounded-full flex items-center justify-center mb-4">
              <Building2 className="w-10 h-10 text-muted-foreground/50" />
            </div>
            <h3 className="text-xl font-bold mb-2">Aucun projet</h3>
            <p className="text-muted-foreground mb-6">Commencez par créer votre premier chantier.</p>
            {canCreate && <Button onClick={() => setIsCreateOpen(true)} className="rounded-xl">Créer un projet</Button>}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {projects?.map(project => (
              <ProjectCard key={project.id} project={project} />
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}

function ProjectCard({ project }: { project: any }) {
  const cfg = statusLabels[project.status] || { label: project.status, color: "bg-gray-100 text-gray-700 border-gray-200" };

  return (
    <Link href={`/projets/${project.id}`}>
      <div className="bg-white border border-border/50 rounded-2xl p-6 shadow-md shadow-black/5 hover:shadow-xl hover:border-accent/30 transition-all duration-300 cursor-pointer group flex flex-col h-full">
        <div className="flex justify-between items-start mb-4">
          <div className="w-12 h-12 bg-primary/5 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform">
            <Building2 className="w-6 h-6 text-primary" />
          </div>
          <span className={`px-3 py-1 rounded-full text-xs font-semibold border ${cfg.color}`}>
            {cfg.label}
          </span>
        </div>

        <h3 className="font-display text-xl font-bold text-foreground mb-1 group-hover:text-accent transition-colors">
          {project.name}
        </h3>

        <div className="space-y-1.5 mt-3 text-sm text-muted-foreground flex-1">
          {project.location && (
            <div className="flex items-center gap-2">
              <MapPin className="w-3.5 h-3.5" />
              <span>{project.location}</span>
            </div>
          )}
          {project.clientName && (
            <div className="flex items-center gap-2">
              <Users className="w-3.5 h-3.5" />
              <span>{project.clientName}</span>
            </div>
          )}
          {project.chefName && (
            <div className="flex items-center gap-2">
              <Users className="w-3.5 h-3.5 text-primary/60" />
              <span className="text-primary/70 font-medium">{project.chefName}</span>
            </div>
          )}
          {project.startDate && (
            <div className="flex items-center gap-2">
              <Calendar className="w-3.5 h-3.5" />
              <span>{formatDate(project.startDate)}</span>
            </div>
          )}
        </div>

        <div className="mt-5 pt-4 border-t border-border/50">
          <div className="flex justify-between items-end mb-2">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Budget</span>
            <span className="text-sm font-bold text-foreground">{formatFCFA(project.budgetTotal)}</span>
          </div>
          <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
            <div className="bg-accent h-full rounded-full transition-all duration-1000" style={{ width: `${Math.min(project.progress, 100)}%` }} />
          </div>
          <div className="flex justify-end mt-1">
            <span className="text-xs font-medium text-accent">{project.progress}%</span>
          </div>
        </div>
      </div>
    </Link>
  );
}

function CreateProjectForm({ onSuccess }: { onSuccess: () => void }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: users } = useListUsers();
  const { user: currentUser } = useAuth();

  const createMutation = useCreateProject({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
        toast({ title: "Projet créé avec succès." });
        onSuccess();
      },
      onError: (err: any) => {
        const msg = err?.data?.message || "Impossible de créer le projet.";
        toast({ title: "Erreur", description: msg, variant: "destructive" });
      }
    }
  });

  const [formData, setFormData] = useState({
    name: "",
    location: "",
    clientName: "",
    budgetTotal: "",
    status: "PLANIFIE" as CreateProjectRequestStatus,
    startDate: "",
    endDate: "",
    chefId: "",
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.budgetTotal) return;
    createMutation.mutate({
      data: {
        name: formData.name,
        location: formData.location || undefined,
        clientName: formData.clientName || undefined,
        budgetTotal: Number(formData.budgetTotal),
        status: formData.status,
        startDate: formData.startDate || undefined,
        endDate: formData.endDate || undefined,
        chefId: formData.chefId ? Number(formData.chefId) : undefined,
      }
    });
  };

  const chefs = users?.filter(u => u.role === "CHEF_CHANTIER" || u.role === "ADMIN");

  return (
    <form onSubmit={handleSubmit} className="space-y-4 mt-4">
      <div className="space-y-2">
        <Label htmlFor="name">Nom du Projet *</Label>
        <Input id="name" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} required className="rounded-xl" placeholder="Ex: Immeuble Résidentiel Cocody" />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="location">Lieu</Label>
          <Input id="location" value={formData.location} onChange={e => setFormData({ ...formData, location: e.target.value })} className="rounded-xl" placeholder="Abidjan, Plateau" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="clientName">Client</Label>
          <Input id="clientName" value={formData.clientName} onChange={e => setFormData({ ...formData, clientName: e.target.value })} className="rounded-xl" placeholder="Société XYZ" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="budgetTotal">Budget Total (FCFA) *</Label>
          <Input id="budgetTotal" type="number" min="1" value={formData.budgetTotal} onChange={e => setFormData({ ...formData, budgetTotal: e.target.value })} required className="rounded-xl" />
        </div>
        <div className="space-y-2">
          <Label>Statut</Label>
          <Select value={formData.status} onValueChange={v => setFormData({ ...formData, status: v as CreateProjectRequestStatus })}>
            <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(statusLabels).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="startDate">Date de début</Label>
          <Input id="startDate" type="date" value={formData.startDate} onChange={e => setFormData({ ...formData, startDate: e.target.value })} className="rounded-xl" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="endDate">Date de fin prévue</Label>
          <Input id="endDate" type="date" value={formData.endDate} onChange={e => setFormData({ ...formData, endDate: e.target.value })} className="rounded-xl" />
        </div>
      </div>

      {currentUser?.role === "ADMIN" && chefs && chefs.length > 0 && (
        <div className="space-y-2">
          <Label>Chef de Chantier responsable</Label>
          <Select value={formData.chefId} onValueChange={v => setFormData({ ...formData, chefId: v })}>
            <SelectTrigger className="rounded-xl"><SelectValue placeholder="Sélectionner (optionnel)" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">— Aucun —</SelectItem>
              {chefs.map(u => <SelectItem key={u.id} value={u.id.toString()}>{u.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="pt-4 flex justify-end gap-3">
        <Button type="button" variant="outline" onClick={onSuccess} className="rounded-xl">Annuler</Button>
        <Button
          type="submit"
          disabled={createMutation.isPending || !formData.name || !formData.budgetTotal}
          className="rounded-xl bg-primary hover:bg-primary/90 text-white"
        >
          {createMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
          Créer le projet
        </Button>
      </div>
    </form>
  );
}
