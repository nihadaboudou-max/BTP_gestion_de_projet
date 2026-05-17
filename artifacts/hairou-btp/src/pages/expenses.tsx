import { useState } from "react";
import { AppLayout } from "@/components/layout";
import {
  useListExpenses, useCreateExpense, useValidateExpense, useListProjects,
  CreateExpenseRequestCategory
} from "@workspace/api-client-react";
import { formatFCFA, formatDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Receipt, Loader2, CheckCircle2, XCircle, Clock, ThumbsUp, ThumbsDown } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";

const categoryLabels: Record<string, string> = {
  MATERIAUX: "Matériaux",
  MAIN_OEUVRE: "Main d'œuvre",
  TRANSPORT: "Transport",
  EQUIPEMENT: "Équipement",
  DIVERS: "Divers",
};

function StatusBadge({ status }: { status: string }) {
  if (status === 'EN_ATTENTE') return (
    <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-50 text-blue-700 border border-blue-200 rounded-full text-xs font-semibold">
      <Clock className="w-3 h-3" /> En attente
    </span>
  );
  if (status === 'APPROUVEE') return (
    <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-green-50 text-green-700 border border-green-200 rounded-full text-xs font-semibold">
      <CheckCircle2 className="w-3 h-3" /> Approuvée
    </span>
  );
  if (status === 'REJETEE') return (
    <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-red-50 text-red-700 border border-red-200 rounded-full text-xs font-semibold">
      <XCircle className="w-3 h-3" /> Rejetée
    </span>
  );
  return <span className="text-xs text-muted-foreground">{status}</span>;
}

export default function Expenses() {
  const { data: expenses, isLoading } = useListExpenses();
  const { user } = useAuth();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [validateTarget, setValidateTarget] = useState<any>(null);

  const isAdmin = user?.role === 'ADMIN';
  const pending = expenses?.filter(e => e.status === 'EN_ATTENTE') ?? [];
  const totalApproved = expenses?.filter(e => e.status === 'APPROUVEE').reduce((s, e) => s + (Number(e.amount) || 0), 0) ?? 0;

  return (
    <AppLayout title="Dépenses">
      <div className="space-y-6">

        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <p className="text-muted-foreground">Historique et soumission des dépenses de chantier.</p>
          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button className="bg-orange-600 hover:bg-orange-700 text-white rounded-xl shadow-lg shadow-orange-600/20">
                <Plus className="w-4 h-4 mr-2" />
                Déclarer une Dépense
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px] rounded-2xl">
              <DialogHeader>
                <DialogTitle className="font-display text-2xl">Nouvelle Dépense</DialogTitle>
              </DialogHeader>
              <CreateExpenseForm onSuccess={() => setIsCreateOpen(false)} />
            </DialogContent>
          </Dialog>
        </div>

        {/* Summary row */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <div className="bg-white rounded-2xl border border-border/50 p-4 shadow-sm">
            <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Total dépenses</p>
            <p className="text-2xl font-display font-bold text-foreground mt-1">{expenses?.length ?? 0}</p>
          </div>
          <div className="bg-white rounded-2xl border border-blue-100 p-4 shadow-sm">
            <p className="text-xs text-blue-600 uppercase tracking-wider font-semibold">En attente</p>
            <p className="text-2xl font-display font-bold text-blue-600 mt-1">{pending.length}</p>
          </div>
          <div className="bg-white rounded-2xl border border-green-100 p-4 shadow-sm col-span-2 sm:col-span-1">
            <p className="text-xs text-green-700 uppercase tracking-wider font-semibold">Total approuvé</p>
            <p className="text-xl font-display font-bold text-green-700 mt-1">{formatFCFA(totalApproved)}</p>
          </div>
        </div>

        {/* Admin validation banner */}
        {isAdmin && pending.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-center justify-between">
            <p className="text-amber-800 text-sm font-medium">
              <span className="font-bold">{pending.length}</span> dépense{pending.length > 1 ? 's' : ''} en attente de validation.
            </p>
            <span className="text-amber-600 text-xs font-semibold">↓ Validez ci-dessous</span>
          </div>
        )}

        {/* Expense table */}
        {isLoading ? (
          <div className="animate-pulse space-y-3">
            {[1, 2, 3].map(i => <div key={i} className="h-16 bg-muted/50 rounded-xl" />)}
          </div>
        ) : expenses?.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-16 text-center bg-white rounded-3xl border border-border/50 shadow-sm">
            <div className="w-20 h-20 bg-muted rounded-full flex items-center justify-center mb-4">
              <Receipt className="w-10 h-10 text-muted-foreground/50" />
            </div>
            <h3 className="text-xl font-bold mb-2">Aucune dépense</h3>
            <p className="text-muted-foreground mb-6">Les notes de frais apparaîtront ici.</p>
            <Button onClick={() => setIsCreateOpen(true)} className="rounded-xl">Déclarer une dépense</Button>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-border/50 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-muted/30 text-muted-foreground uppercase font-semibold text-xs border-b border-border/50">
                  <tr>
                    <th className="px-5 py-4">Date</th>
                    <th className="px-5 py-4">Titre & Projet</th>
                    <th className="px-5 py-4">Catégorie</th>
                    <th className="px-5 py-4 text-right">Montant</th>
                    <th className="px-5 py-4">Statut</th>
                    {isAdmin && <th className="px-5 py-4 text-center">Actions</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {expenses?.map(expense => (
                    <tr key={expense.id} className={`hover:bg-muted/20 transition-colors ${expense.status === 'EN_ATTENTE' && isAdmin ? 'bg-amber-50/30' : ''}`}>
                      <td className="px-5 py-4 whitespace-nowrap text-muted-foreground">{formatDate(expense.date)}</td>
                      <td className="px-5 py-4">
                        <div className="font-semibold text-foreground">{expense.title}</div>
                        <div className="text-xs text-muted-foreground">{expense.projectName}</div>
                        {expense.adminComment && (
                          <div className={`text-xs mt-0.5 italic ${expense.status === 'REJETEE' ? 'text-red-600' : 'text-green-700'}`}>
                            "{expense.adminComment}"
                          </div>
                        )}
                      </td>
                      <td className="px-5 py-4">
                        <span className="px-2.5 py-1 bg-gray-100 text-gray-700 rounded-lg text-xs font-medium">
                          {categoryLabels[expense.category] || expense.category}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-right font-bold text-foreground whitespace-nowrap">
                        {formatFCFA(Number(expense.amount))}
                      </td>
                      <td className="px-5 py-4">
                        <StatusBadge status={expense.status} />
                      </td>
                      {isAdmin && (
                        <td className="px-5 py-4 text-center">
                          {expense.status === 'EN_ATTENTE' ? (
                            <button
                              onClick={() => setValidateTarget(expense)}
                              className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:text-primary/80 border border-primary/20 hover:border-primary/40 px-3 py-1.5 rounded-lg transition-all"
                            >
                              Valider
                            </button>
                          ) : (
                            <span className="text-xs text-muted-foreground/50">—</span>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Admin Validation Modal */}
        {validateTarget && (
          <ValidateExpenseModal
            expense={validateTarget}
            onClose={() => setValidateTarget(null)}
          />
        )}
      </div>
    </AppLayout>
  );
}

function ValidateExpenseModal({ expense, onClose }: { expense: any; onClose: () => void }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [comment, setComment] = useState("");
  const validateMutation = useValidateExpense();

  const handleAction = (approved: boolean) => {
    if (!approved && !comment.trim()) {
      toast({ title: "Commentaire requis pour un rejet", variant: "destructive" });
      return;
    }
    validateMutation.mutate(
      { id: expense.id, data: { approved, comment: comment || undefined } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ["/api/expenses"] });
          toast({ title: approved ? "Dépense approuvée" : "Dépense rejetée" });
          onClose();
        },
        onError: () => toast({ title: "Erreur de validation", variant: "destructive" })
      }
    );
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[450px] rounded-2xl">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">Valider la dépense</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="bg-muted/40 rounded-xl p-4 space-y-1">
            <p className="font-bold text-foreground">{expense.title}</p>
            <p className="text-sm text-muted-foreground">{expense.projectName}</p>
            <p className="text-xl font-bold text-primary mt-2">{formatFCFA(Number(expense.amount))}</p>
          </div>
          <div className="space-y-2">
            <Label>Commentaire <span className="text-muted-foreground text-xs">(obligatoire pour un rejet)</span></Label>
            <Textarea
              value={comment}
              onChange={e => setComment(e.target.value)}
              placeholder="Laissez un message..."
              className="rounded-xl"
              rows={3}
            />
          </div>
        </div>
        <div className="flex gap-3 pt-2">
          <Button variant="outline" onClick={onClose} className="flex-1 rounded-xl">Annuler</Button>
          <Button
            onClick={() => handleAction(false)}
            disabled={validateMutation.isPending}
            variant="destructive"
            className="flex-1 rounded-xl"
          >
            {validateMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <><ThumbsDown className="w-4 h-4 mr-1.5" /> Rejeter</>}
          </Button>
          <Button
            onClick={() => handleAction(true)}
            disabled={validateMutation.isPending}
            className="flex-1 rounded-xl bg-green-600 hover:bg-green-700 text-white"
          >
            {validateMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <><ThumbsUp className="w-4 h-4 mr-1.5" /> Approuver</>}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CreateExpenseForm({ onSuccess }: { onSuccess: () => void }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: projects } = useListProjects();

  const createMutation = useCreateExpense({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/expenses"] });
        toast({ title: "Dépense déclarée avec succès." });
        onSuccess();
      },
      onError: () => toast({ title: "Erreur", description: "Veuillez vérifier les champs.", variant: "destructive" })
    }
  });

  const [formData, setFormData] = useState({
    projectId: "",
    title: "",
    category: "MATERIAUX" as CreateExpenseRequestCategory,
    amount: "",
    date: new Date().toISOString().split('T')[0],
    supplier: "",
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.projectId || !formData.title || !formData.amount) return;
    createMutation.mutate({
      data: {
        ...formData,
        projectId: parseInt(formData.projectId),
        amount: Number(formData.amount),
      }
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 mt-4">
      <div className="space-y-2">
        <Label>Projet *</Label>
        <Select value={formData.projectId} onValueChange={v => setFormData({ ...formData, projectId: v })}>
          <SelectTrigger className="rounded-xl h-11">
            <SelectValue placeholder="Sélectionner le chantier" />
          </SelectTrigger>
          <SelectContent>
            {projects?.map(p => <SelectItem key={p.id} value={p.id.toString()}>{p.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label>Titre / Description *</Label>
        <Input value={formData.title} onChange={e => setFormData({ ...formData, title: e.target.value })} placeholder="Achat de ciment..." required className="rounded-xl" />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Montant (FCFA) *</Label>
          <Input type="number" min="0" value={formData.amount} onChange={e => setFormData({ ...formData, amount: e.target.value })} required className="rounded-xl" />
        </div>
        <div className="space-y-2">
          <Label>Date *</Label>
          <Input type="date" value={formData.date} onChange={e => setFormData({ ...formData, date: e.target.value })} required className="rounded-xl" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Catégorie *</Label>
          <Select value={formData.category} onValueChange={v => setFormData({ ...formData, category: v as CreateExpenseRequestCategory })}>
            <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(categoryLabels).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Fournisseur</Label>
          <Input value={formData.supplier} onChange={e => setFormData({ ...formData, supplier: e.target.value })} placeholder="Optionnel" className="rounded-xl" />
        </div>
      </div>
      <div className="pt-4 flex justify-end gap-3">
        <Button type="button" variant="outline" onClick={onSuccess} className="rounded-xl">Annuler</Button>
        <Button type="submit" disabled={createMutation.isPending || !formData.projectId || !formData.title || !formData.amount} className="rounded-xl bg-orange-600 hover:bg-orange-700 text-white">
          {createMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
          Soumettre
        </Button>
      </div>
    </form>
  );
}
