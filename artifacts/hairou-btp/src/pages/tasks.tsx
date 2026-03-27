import { useState } from "react";
import { AppLayout } from "@/components/layout";
import {
  useListTasks, useCreateTask, useUpdateTask, useListProjects, useListUsers,
  CreateTaskRequestPriority, CreateTaskRequestStatus, TaskStatus
} from "@workspace/api-client-react";
import { formatDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, CheckSquare, Loader2, Circle, CheckCircle2, Clock, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

const priorityLabels: Record<string, { label: string; color: string }> = {
  FAIBLE: { label: "Faible", color: "bg-gray-100 text-gray-700" },
  NORMALE: { label: "Normale", color: "bg-blue-100 text-blue-700" },
  HAUTE: { label: "Haute", color: "bg-orange-100 text-orange-700" },
  URGENTE: { label: "Urgente", color: "bg-red-100 text-red-700" },
};

const statusConfig: Record<string, { label: string; icon: any; color: string }> = {
  A_FAIRE: { label: "À faire", icon: Circle, color: "text-gray-500" },
  EN_COURS: { label: "En cours", icon: Clock, color: "text-blue-500" },
  EN_REVISION: { label: "En révision", icon: AlertCircle, color: "text-orange-500" },
  TERMINE: { label: "Terminée", icon: CheckCircle2, color: "text-green-500" },
};

export default function Tasks() {
  const { data: tasks, isLoading } = useListTasks();
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  const grouped = {
    A_FAIRE: tasks?.filter(t => t.status === "A_FAIRE") ?? [],
    EN_COURS: tasks?.filter(t => t.status === "EN_COURS") ?? [],
    EN_REVISION: tasks?.filter(t => t.status === "EN_REVISION") ?? [],
    TERMINE: tasks?.filter(t => t.status === "TERMINE") ?? [],
  };

  return (
    <AppLayout title="Tâches">
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <p className="text-muted-foreground">Suivez l'avancement des tâches par chantier.</p>
          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button className="bg-primary hover:bg-primary/90 text-white rounded-xl shadow-lg shadow-primary/20">
                <Plus className="w-4 h-4 mr-2" />
                Nouvelle Tâche
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px] rounded-2xl">
              <DialogHeader>
                <DialogTitle className="font-display text-2xl">Créer une Tâche</DialogTitle>
              </DialogHeader>
              <CreateTaskForm onSuccess={() => setIsCreateOpen(false)} />
            </DialogContent>
          </Dialog>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map(i => <div key={i} className="h-64 bg-muted/50 rounded-2xl animate-pulse" />)}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            {Object.entries(grouped).map(([status, items]) => {
              const cfg = statusConfig[status];
              const Icon = cfg.icon;
              return (
                <div key={status} className="bg-white rounded-2xl border border-border/50 shadow-sm overflow-hidden flex flex-col">
                  <div className="px-4 py-3 border-b border-border/50 flex items-center gap-2">
                    <Icon className={`w-4 h-4 ${cfg.color}`} />
                    <span className="font-semibold text-sm text-foreground">{cfg.label}</span>
                    <span className="ml-auto bg-muted text-muted-foreground text-xs font-bold px-2 py-0.5 rounded-full">{items.length}</span>
                  </div>
                  <div className="flex-1 p-3 space-y-2 min-h-[200px]">
                    {items.length === 0 ? (
                      <p className="text-center text-muted-foreground text-xs py-8">Aucune tâche</p>
                    ) : (
                      items.map(task => <TaskCard key={task.id} task={task} />)
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AppLayout>
  );
}

function TaskCard({ task }: { task: any }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const updateMutation = useUpdateTask();

  const moveStatus = (newStatus: string) => {
    updateMutation.mutate({ id: task.id, data: { status: newStatus as any } }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
        toast({ title: "Tâche mise à jour" });
      }
    });
  };

  const priority = priorityLabels[task.priority] || { label: task.priority, color: "bg-gray-100 text-gray-700" };
  const nextStatus: Record<string, string> = { A_FAIRE: "EN_COURS", EN_COURS: "EN_REVISION", EN_REVISION: "TERMINE" };
  const next = nextStatus[task.status];

  return (
    <div className="bg-muted/30 rounded-xl p-3 hover:bg-muted/50 transition-colors group">
      <div className="flex items-start justify-between gap-2 mb-2">
        <h4 className="text-sm font-semibold text-foreground leading-tight">{task.title}</h4>
        <span className={`shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full ${priority.color}`}>{priority.label}</span>
      </div>
      {task.description && <p className="text-xs text-muted-foreground mb-2 line-clamp-2">{task.description}</p>}
      {task.projectName && <p className="text-[10px] text-muted-foreground/70 mb-2">📂 {task.projectName}</p>}
      {task.dueDate && <p className="text-[10px] text-muted-foreground mb-3">📅 {formatDate(task.dueDate)}</p>}
      {next && (
        <button
          onClick={() => moveStatus(next)}
          disabled={updateMutation.isPending}
          className="w-full text-[10px] font-semibold text-primary/80 hover:text-primary border border-primary/20 hover:border-primary/40 rounded-lg py-1 transition-all"
        >
          {updateMutation.isPending ? "..." : `→ ${statusConfig[next]?.label}`}
        </button>
      )}
    </div>
  );
}

function CreateTaskForm({ onSuccess }: { onSuccess: () => void }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: projects } = useListProjects();
  const { data: users } = useListUsers();

  const createMutation = useCreateTask({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
        toast({ title: "Tâche créée avec succès" });
        onSuccess();
      },
      onError: () => toast({ title: "Erreur", description: "Impossible de créer la tâche.", variant: "destructive" })
    }
  });

  const [form, setForm] = useState({
    title: "",
    description: "",
    projectId: "",
    assignedTo: "",
    priority: "NORMALE" as CreateTaskRequestPriority,
    status: "A_FAIRE" as CreateTaskRequestStatus,
    dueDate: "",
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.projectId || !form.title) return;
    createMutation.mutate({
      data: {
        ...form,
        projectId: parseInt(form.projectId),
        assignedTo: form.assignedTo ? parseInt(form.assignedTo) : undefined,
        dueDate: form.dueDate || undefined,
      }
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 mt-4">
      <div className="space-y-2">
        <Label>Titre *</Label>
        <Input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="Titre de la tâche" required className="rounded-xl" />
      </div>
      <div className="space-y-2">
        <Label>Description</Label>
        <Textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Détails de la tâche..." className="rounded-xl" rows={2} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Projet *</Label>
          <Select value={form.projectId} onValueChange={v => setForm({ ...form, projectId: v })}>
            <SelectTrigger className="rounded-xl"><SelectValue placeholder="Sélectionner" /></SelectTrigger>
            <SelectContent>{projects?.map(p => <SelectItem key={p.id} value={p.id.toString()}>{p.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Assigné à</Label>
          <Select value={form.assignedTo} onValueChange={v => setForm({ ...form, assignedTo: v })}>
            <SelectTrigger className="rounded-xl"><SelectValue placeholder="Optionnel" /></SelectTrigger>
            <SelectContent>{users?.map(u => <SelectItem key={u.id} value={u.id.toString()}>{u.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Priorité</Label>
          <Select value={form.priority} onValueChange={v => setForm({ ...form, priority: v as CreateTaskRequestPriority })}>
            <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.values(CreateTaskRequestPriority).map(p => <SelectItem key={p} value={p}>{priorityLabels[p]?.label || p}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Échéance</Label>
          <Input type="date" value={form.dueDate} onChange={e => setForm({ ...form, dueDate: e.target.value })} className="rounded-xl" />
        </div>
      </div>
      <div className="pt-4 flex justify-end gap-3">
        <Button type="button" variant="outline" onClick={onSuccess} className="rounded-xl">Annuler</Button>
        <Button type="submit" disabled={createMutation.isPending || !form.projectId || !form.title} className="rounded-xl bg-primary hover:bg-primary/90 text-white">
          {createMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
          Créer
        </Button>
      </div>
    </form>
  );
}
