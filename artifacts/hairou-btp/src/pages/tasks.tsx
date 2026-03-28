import { useState } from "react";
import { AppLayout } from "@/components/layout";
import {
  useListTasks, useCreateTask, useUpdateTask, useListProjects, useListUsers,
  CreateTaskRequestPriority, CreateTaskRequestStatus
} from "@workspace/api-client-react";
import { formatDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Loader2, Circle, CheckCircle2, Clock, AlertCircle, UserCheck, CheckCheck, UserRound } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useSocket } from "@/hooks/use-socket";

const priorityLabels: Record<string, { label: string; color: string }> = {
  BASSE:   { label: "Basse",   color: "bg-gray-100 text-gray-600" },
  NORMALE: { label: "Normale", color: "bg-blue-100 text-blue-700" },
  HAUTE:   { label: "Haute",   color: "bg-orange-100 text-orange-700" },
  URGENTE: { label: "Urgente", color: "bg-red-100 text-red-700" },
};

const statusConfig: Record<string, { label: string; icon: any; color: string; bg: string }> = {
  A_FAIRE:  { label: "À faire",  icon: Circle,       color: "text-gray-500",  bg: "bg-gray-50 border-gray-200" },
  EN_COURS: { label: "En cours", icon: Clock,        color: "text-blue-500",  bg: "bg-blue-50 border-blue-200" },
  BLOQUEE:  { label: "Bloquée",  icon: AlertCircle,  color: "text-orange-500", bg: "bg-orange-50 border-orange-200" },
  TERMINEE: { label: "Terminée", icon: CheckCircle2, color: "text-green-500", bg: "bg-green-50 border-green-200" },
};

const statusProgression: Record<string, string> = {
  A_FAIRE: "EN_COURS",
  EN_COURS: "TERMINEE",
};

export default function Tasks() {
  const { data: tasks, isLoading } = useListTasks();
  const { user } = useAuth();
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  // Real-time sync
  useSocket();

  const canCreate = user?.role === "ADMIN" || user?.role === "CHEF_CHANTIER";

  const grouped = {
    A_FAIRE:  tasks?.filter(t => t.status === "A_FAIRE") ?? [],
    EN_COURS: tasks?.filter(t => t.status === "EN_COURS") ?? [],
    BLOQUEE:  tasks?.filter(t => t.status === "BLOQUEE") ?? [],
    TERMINEE: tasks?.filter(t => t.status === "TERMINEE") ?? [],
  };

  return (
    <AppLayout title="Tâches">
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <p className="text-muted-foreground">
            {user?.role === "OUVRIER"
              ? "Vos tâches assignées — confirmez leur réception."
              : "Gestion et suivi des tâches par chantier."}
          </p>
          {canCreate && (
            <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
              <DialogTrigger asChild>
                <Button className="bg-primary hover:bg-primary/90 text-white rounded-xl shadow-lg shadow-primary/20">
                  <Plus className="w-4 h-4 mr-2" />
                  Nouvelle Tâche
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[520px] rounded-2xl">
                <DialogHeader>
                  <DialogTitle className="font-display text-2xl">Créer une Tâche</DialogTitle>
                </DialogHeader>
                <CreateTaskForm onSuccess={() => setIsCreateOpen(false)} />
              </DialogContent>
            </Dialog>
          )}
        </div>

        {/* Ouvrier — pending confirmation banner */}
        {user?.role === "OUVRIER" && (() => {
          const pending = tasks?.filter(t => t.assignedToId === user.id && !t.confirmedAt) ?? [];
          if (pending.length === 0) return null;
          return (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
              <p className="text-amber-800 font-semibold text-sm">
                {pending.length} tâche{pending.length > 1 ? 's' : ''} en attente de confirmation de votre part
              </p>
              <p className="text-amber-600 text-xs mt-1">Confirmez les tâches ci-dessous pour informer votre équipe.</p>
            </div>
          );
        })()}

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
                <div key={status} className={`rounded-2xl border shadow-sm overflow-hidden flex flex-col ${cfg.bg}`}>
                  <div className="px-4 py-3 border-b border-current/10 flex items-center gap-2 bg-white/60">
                    <Icon className={`w-4 h-4 ${cfg.color}`} />
                    <span className="font-semibold text-sm text-foreground">{cfg.label}</span>
                    <span className="ml-auto bg-white/80 text-muted-foreground text-xs font-bold px-2 py-0.5 rounded-full border">{items.length}</span>
                  </div>
                  <div className="flex-1 p-3 space-y-2 min-h-[180px]">
                    {items.length === 0 ? (
                      <p className="text-center text-muted-foreground/60 text-xs py-8">Aucune tâche</p>
                    ) : (
                      items.map(task => (
                        <TaskCard key={task.id} task={task} currentUserId={user?.id} currentUserRole={user?.role} />
                      ))
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

function TaskCard({ task, currentUserId, currentUserRole }: { task: any; currentUserId?: number; currentUserRole?: string }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const updateMutation = useUpdateTask();
  const [confirming, setConfirming] = useState(false);

  const priority = priorityLabels[task.priority] || { label: task.priority, color: "bg-gray-100 text-gray-700" };
  const nextStatus = statusProgression[task.status];

  const isAssignedToMe = task.assignedToId === currentUserId;
  const needsConfirmation = isAssignedToMe && !task.confirmedAt && task.status === "A_FAIRE";

  const moveStatus = (newStatus: string) => {
    updateMutation.mutate({ id: task.id, data: { status: newStatus as any } }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
        toast({ title: "Tâche mise à jour" });
      }
    });
  };

  const handleConfirm = async () => {
    setConfirming(true);
    try {
      const token = localStorage.getItem('hairou_token');
      const res = await fetch(`/api/tasks/${task.id}/confirm`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error();
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      toast({ title: "Tâche confirmée", description: "L'équipe a été notifiée." });
    } catch {
      toast({ title: "Erreur de confirmation", variant: "destructive" });
    } finally {
      setConfirming(false);
    }
  };

  return (
    <div className={`bg-white rounded-xl p-3 shadow-sm border transition-all ${needsConfirmation ? 'border-amber-300 shadow-amber-100' : 'border-border/40 hover:border-primary/20'}`}>
      <div className="flex items-start justify-between gap-2 mb-2">
        <h4 className="text-sm font-semibold text-foreground leading-tight flex-1">{task.title}</h4>
        <span className={`shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full ${priority.color}`}>{priority.label}</span>
      </div>

      {task.description && <p className="text-xs text-muted-foreground mb-2 line-clamp-2">{task.description}</p>}
      {task.projectName && <p className="text-[10px] text-muted-foreground/70 mb-1">📂 {task.projectName}</p>}
      {task.dueDate && <p className="text-[10px] text-muted-foreground mb-2">📅 {formatDate(task.dueDate)}</p>}

      {/* Assignee */}
      {task.assignedToName && (
        <div className="flex items-center gap-1.5 mb-2">
          <UserRound className="w-3 h-3 text-muted-foreground/60" />
          <span className="text-[10px] text-muted-foreground">{task.assignedToName}</span>
          {task.confirmedAt && <CheckCheck className="w-3 h-3 text-green-500 ml-auto" title="Confirmée" />}
        </div>
      )}

      {/* Confirm button for ouvrier */}
      {needsConfirmation && (
        <button
          onClick={handleConfirm}
          disabled={confirming}
          className="w-full text-xs font-semibold text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-300 rounded-lg py-1.5 transition-all mb-1 flex items-center justify-center gap-1"
        >
          {confirming ? <Loader2 className="w-3 h-3 animate-spin" /> : <UserCheck className="w-3 h-3" />}
          Confirmer la réception
        </button>
      )}

      {/* Move to next status — admin/chef or task owner */}
      {nextStatus && (currentUserRole === "ADMIN" || currentUserRole === "CHEF_CHANTIER" || isAssignedToMe) && task.confirmedAt && (
        <button
          onClick={() => moveStatus(nextStatus)}
          disabled={updateMutation.isPending}
          className="w-full text-[11px] font-semibold text-primary/70 hover:text-primary border border-primary/15 hover:border-primary/30 rounded-lg py-1 transition-all"
        >
          {updateMutation.isPending ? "..." : `→ ${statusConfig[nextStatus]?.label}`}
        </button>
      )}

      {/* Admin/chef can move regardless of confirmation */}
      {nextStatus && (currentUserRole === "ADMIN" || currentUserRole === "CHEF_CHANTIER") && !task.confirmedAt && (
        <button
          onClick={() => moveStatus(nextStatus)}
          disabled={updateMutation.isPending}
          className="w-full text-[11px] font-semibold text-muted-foreground/60 hover:text-muted-foreground border border-border/30 hover:border-border/60 rounded-lg py-1 transition-all"
        >
          {updateMutation.isPending ? "..." : `→ ${statusConfig[nextStatus]?.label}`}
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
  const { user: currentUser } = useAuth();

  const createMutation = useCreateTask({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
        toast({ title: "Tâche créée — notification envoyée à l'ouvrier" });
        onSuccess();
      },
      onError: (err: any) => toast({ title: "Erreur", description: err?.data?.message || "Impossible de créer la tâche.", variant: "destructive" })
    }
  });

  const [form, setForm] = useState({
    title: "",
    description: "",
    projectId: "",
    assignedToId: "",
    priority: "NORMALE" as CreateTaskRequestPriority,
    dueDate: "",
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.projectId || !form.title) return;
    createMutation.mutate({
      data: {
        title: form.title,
        description: form.description || undefined,
        projectId: parseInt(form.projectId),
        assignedToId: form.assignedToId ? parseInt(form.assignedToId) : undefined,
        priority: form.priority,
        status: "A_FAIRE" as CreateTaskRequestStatus,
        dueDate: form.dueDate || undefined,
      }
    });
  };

  // Show all users as potential assignees; filter to workers for assignment
  const workers = users?.filter(u => u.role === "OUVRIER" || u.role === "CHEF_CHANTIER");

  return (
    <form onSubmit={handleSubmit} className="space-y-4 mt-4">
      <div className="space-y-2">
        <Label>Titre *</Label>
        <Input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="Ex: Coulage de la dalle" required className="rounded-xl" />
      </div>
      <div className="space-y-2">
        <Label>Description</Label>
        <Textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Détails, instructions..." className="rounded-xl" rows={2} />
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
          <Label>Assigner à</Label>
          <Select value={form.assignedToId} onValueChange={v => setForm({ ...form, assignedToId: v })}>
            <SelectTrigger className="rounded-xl"><SelectValue placeholder="Optionnel" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">— Non assigné —</SelectItem>
              {workers?.map(u => (
                <SelectItem key={u.id} value={u.id.toString()}>
                  {u.name} ({u.role === "OUVRIER" ? "Ouvrier" : "Chef"})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Priorité</Label>
          <Select value={form.priority} onValueChange={v => setForm({ ...form, priority: v as CreateTaskRequestPriority })}>
            <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(priorityLabels).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Échéance</Label>
          <Input type="date" value={form.dueDate} onChange={e => setForm({ ...form, dueDate: e.target.value })} className="rounded-xl" />
        </div>
      </div>

      {form.assignedToId && form.assignedToId !== "none" && (
        <div className="flex items-center gap-2 p-3 bg-blue-50 rounded-xl border border-blue-100">
          <UserCheck className="w-4 h-4 text-blue-600" />
          <p className="text-sm text-blue-700">L'ouvrier recevra une notification et devra confirmer la tâche.</p>
        </div>
      )}

      <div className="pt-4 flex justify-end gap-3">
        <Button type="button" variant="outline" onClick={onSuccess} className="rounded-xl">Annuler</Button>
        <Button type="submit" disabled={createMutation.isPending || !form.projectId || !form.title} className="rounded-xl bg-primary hover:bg-primary/90 text-white">
          {createMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
          Créer et notifier
        </Button>
      </div>
    </form>
  );
}
