import { useState } from "react";
import { Link } from "wouter";
import { AppLayout } from "@/components/layout";
import { useListProjects, useCreateProject, ProjectStatus, CreateProjectRequestStatus } from "@workspace/api-client-react";
import { formatFCFA, formatDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, MapPin, Building2, Calendar, HardHat, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

export default function Projects() {
  const { data: projects, isLoading } = useListProjects();
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  return (
    <AppLayout title="Projets">
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <p className="text-muted-foreground">Gérez vos chantiers et suivez leur progression.</p>
          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button className="bg-accent hover:bg-accent/90 text-white rounded-xl shadow-lg shadow-accent/20">
                <Plus className="w-4 h-4 mr-2" />
                Nouveau Projet
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px] rounded-2xl">
              <DialogHeader>
                <DialogTitle className="font-display text-2xl">Créer un Projet</DialogTitle>
              </DialogHeader>
              <CreateProjectForm onSuccess={() => setIsCreateOpen(false)} />
            </DialogContent>
          </Dialog>
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
            <Button onClick={() => setIsCreateOpen(true)} className="rounded-xl">Créer un projet</Button>
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
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'EN_COURS': return 'bg-blue-100 text-blue-700 border-blue-200';
      case 'TERMINE': return 'bg-green-100 text-green-700 border-green-200';
      case 'EN_PAUSE': return 'bg-orange-100 text-orange-700 border-orange-200';
      default: return 'bg-gray-100 text-gray-700 border-gray-200';
    }
  };

  return (
    <Link href={`/projets/${project.id}`}>
      <div className="bg-white border border-border/50 rounded-2xl p-6 shadow-md shadow-black/5 hover:shadow-xl hover:border-accent/30 transition-all duration-300 cursor-pointer group flex flex-col h-full">
        <div className="flex justify-between items-start mb-4">
          <div className="w-12 h-12 bg-primary/5 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform">
            <Building2 className="w-6 h-6 text-primary" />
          </div>
          <span className={`px-3 py-1 rounded-full text-xs font-semibold border ${getStatusColor(project.status)}`}>
            {project.status.replace('_', ' ')}
          </span>
        </div>
        
        <h3 className="font-display text-xl font-bold text-foreground mb-1 group-hover:text-accent transition-colors">
          {project.name}
        </h3>
        
        <div className="space-y-2 mt-4 text-sm text-muted-foreground flex-1">
          {project.location && (
            <div className="flex items-center gap-2">
              <MapPin className="w-4 h-4" />
              <span>{project.location}</span>
            </div>
          )}
          {project.clientName && (
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4" />
              <span>{project.clientName}</span>
            </div>
          )}
          {project.startDate && (
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4" />
              <span>{formatDate(project.startDate)}</span>
            </div>
          )}
        </div>

        <div className="mt-6 pt-4 border-t border-border/50">
          <div className="flex justify-between items-end mb-2">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Budget</span>
            <span className="text-sm font-bold text-foreground">{formatFCFA(project.budgetTotal)}</span>
          </div>
          <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
            <div 
              className="bg-accent h-full rounded-full transition-all duration-1000" 
              style={{ width: `${project.progress}%` }}
            />
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
  const createMutation = useCreateProject({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
        toast({ title: "Succès", description: "Projet créé avec succès." });
        onSuccess();
      },
      onError: (err) => {
        toast({ title: "Erreur", description: "Impossible de créer le projet.", variant: "destructive" });
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
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate({
      data: {
        ...formData,
        budgetTotal: Number(formData.budgetTotal) || 0,
      }
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 mt-4">
      <div className="space-y-2">
        <Label htmlFor="name">Nom du Projet *</Label>
        <Input 
          id="name" 
          value={formData.name} 
          onChange={e => setFormData({...formData, name: e.target.value})} 
          required 
          className="rounded-xl"
        />
      </div>
      
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="location">Lieu</Label>
          <Input 
            id="location" 
            value={formData.location} 
            onChange={e => setFormData({...formData, location: e.target.value})} 
            className="rounded-xl"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="clientName">Client</Label>
          <Input 
            id="clientName" 
            value={formData.clientName} 
            onChange={e => setFormData({...formData, clientName: e.target.value})} 
            className="rounded-xl"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="budgetTotal">Budget Total (FCFA) *</Label>
        <Input 
          id="budgetTotal" 
          type="number" 
          value={formData.budgetTotal} 
          onChange={e => setFormData({...formData, budgetTotal: e.target.value})} 
          required 
          className="rounded-xl"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="startDate">Date de début</Label>
        <Input 
          id="startDate" 
          type="date" 
          value={formData.startDate} 
          onChange={e => setFormData({...formData, startDate: e.target.value})} 
          className="rounded-xl"
        />
      </div>

      <div className="pt-4 flex justify-end gap-3">
        <Button type="button" variant="outline" onClick={onSuccess} className="rounded-xl">Annuler</Button>
        <Button 
          type="submit" 
          disabled={createMutation.isPending} 
          className="rounded-xl bg-primary hover:bg-primary/90 text-white"
        >
          {createMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
          Créer le projet
        </Button>
      </div>
    </form>
  );
}
