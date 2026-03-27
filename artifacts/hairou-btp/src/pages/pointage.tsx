import { useState } from "react";
import { Link } from "wouter";
import { AppLayout } from "@/components/layout";
import { useListPointageSheets, useCreatePointageSheet, useListProjects } from "@workspace/api-client-react";
import { formatDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, ClipboardList, Clock, ArrowRight, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

export default function Pointage() {
  const { data: sheets, isLoading } = useListPointageSheets();
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  return (
    <AppLayout title="Feuilles de Pointage">
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <p className="text-muted-foreground">Suivez la présence et les heures de vos équipes.</p>
          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button className="bg-secondary hover:bg-secondary/90 text-white rounded-xl shadow-lg shadow-secondary/20">
                <Plus className="w-4 h-4 mr-2" />
                Nouveau Pointage
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[400px] rounded-2xl">
              <DialogHeader>
                <DialogTitle className="font-display text-2xl">Initier un Pointage</DialogTitle>
              </DialogHeader>
              <CreatePointageForm onSuccess={() => setIsCreateOpen(false)} />
            </DialogContent>
          </Dialog>
        </div>

        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3].map(i => <div key={i} className="h-24 bg-muted/50 rounded-2xl animate-pulse" />)}
          </div>
        ) : sheets?.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-16 text-center bg-white rounded-3xl border border-border/50 shadow-sm">
            <div className="w-20 h-20 bg-muted rounded-full flex items-center justify-center mb-4">
              <Clock className="w-10 h-10 text-muted-foreground/50" />
            </div>
            <h3 className="text-xl font-bold mb-2">Aucun pointage</h3>
            <p className="text-muted-foreground mb-6">Commencez par initier une feuille de présence pour un chantier.</p>
            <Button onClick={() => setIsCreateOpen(true)} className="rounded-xl">Nouveau Pointage</Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {sheets?.map(sheet => (
              <SheetCard key={sheet.id} sheet={sheet} />
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}

function SheetCard({ sheet }: { sheet: any }) {
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'BROUILLON': return <span className="px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-xs font-semibold">Brouillon</span>;
      case 'SOUMISE': return <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-semibold">Soumise (En attente)</span>;
      case 'APPROUVEE': return <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-xs font-semibold">Approuvée</span>;
      case 'REJETEE': return <span className="px-3 py-1 bg-red-100 text-red-700 rounded-full text-xs font-semibold">Rejetée</span>;
      default: return <span className="px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-xs font-semibold">{status}</span>;
    }
  };

  return (
    <Link href={`/pointage/${sheet.id}`}>
      <div className="bg-white border border-border/50 rounded-2xl p-5 shadow-sm hover:shadow-md transition-all cursor-pointer group flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-secondary/10 rounded-xl flex items-center justify-center">
            <ClipboardList className="w-6 h-6 text-secondary" />
          </div>
          <div>
            <h4 className="font-bold text-foreground mb-1">{sheet.projectName || `Projet #${sheet.projectId}`}</h4>
            <p className="text-sm text-muted-foreground">{formatDate(sheet.date)}</p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          {getStatusBadge(sheet.status)}
          <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
        </div>
      </div>
    </Link>
  );
}

function CreatePointageForm({ onSuccess }: { onSuccess: () => void }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: projects, isLoading: projectsLoading } = useListProjects();
  
  const createMutation = useCreatePointageSheet({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/pointage"] });
        toast({ title: "Succès", description: "Feuille de pointage initiée." });
        onSuccess();
      },
      onError: () => {
        toast({ title: "Erreur", description: "Impossible d'initier le pointage.", variant: "destructive" });
      }
    }
  });

  const [projectId, setProjectId] = useState<string>("");
  const [date, setDate] = useState<string>(new Date().toISOString().split('T')[0]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectId) return;
    createMutation.mutate({
      data: {
        projectId: parseInt(projectId),
        date: date,
        entries: [] // Initially empty
      }
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6 mt-4">
      <div className="space-y-2">
        <Label>Projet *</Label>
        <Select value={projectId} onValueChange={setProjectId} required>
          <SelectTrigger className="rounded-xl h-12">
            <SelectValue placeholder={projectsLoading ? "Chargement..." : "Sélectionner un chantier"} />
          </SelectTrigger>
          <SelectContent>
            {projects?.map(p => (
              <SelectItem key={p.id} value={p.id.toString()}>{p.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label>Date du pointage *</Label>
        <Input 
          type="date" 
          value={date} 
          onChange={e => setDate(e.target.value)} 
          required 
          className="rounded-xl h-12"
        />
      </div>

      <div className="pt-4 flex justify-end gap-3">
        <Button type="button" variant="outline" onClick={onSuccess} className="rounded-xl">Annuler</Button>
        <Button 
          type="submit" 
          disabled={createMutation.isPending || !projectId} 
          className="rounded-xl bg-secondary hover:bg-secondary/90 text-white"
        >
          {createMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
          Démarrer
        </Button>
      </div>
    </form>
  );
}
