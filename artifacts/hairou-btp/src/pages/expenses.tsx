import { useState } from "react";
import { AppLayout } from "@/components/layout";
import { useListExpenses, useCreateExpense, useListProjects, CreateExpenseRequestCategory } from "@workspace/api-client-react";
import { formatFCFA, formatDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Receipt, Loader2, CheckCircle2, XCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

export default function Expenses() {
  const { data: expenses, isLoading } = useListExpenses();
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  return (
    <AppLayout title="Dépenses">
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <p className="text-muted-foreground">Historique et soumission des dépenses de chantiers.</p>
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

        {isLoading ? (
          <div className="animate-pulse space-y-4">
            {[1,2,3].map(i => <div key={i} className="h-16 bg-muted/50 rounded-xl" />)}
          </div>
        ) : expenses?.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-16 text-center bg-white rounded-3xl border border-border/50 shadow-sm">
            <div className="w-20 h-20 bg-muted rounded-full flex items-center justify-center mb-4">
              <Receipt className="w-10 h-10 text-muted-foreground/50" />
            </div>
            <h3 className="text-xl font-bold mb-2">Aucune dépense</h3>
            <p className="text-muted-foreground mb-6">Les notes de frais apparaîtront ici.</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-border/50 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-muted/30 text-muted-foreground uppercase font-semibold text-xs border-b border-border/50">
                  <tr>
                    <th className="px-6 py-4">Date</th>
                    <th className="px-6 py-4">Titre & Projet</th>
                    <th className="px-6 py-4">Catégorie</th>
                    <th className="px-6 py-4 text-right">Montant</th>
                    <th className="px-6 py-4">Statut</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {expenses?.map((expense) => (
                    <tr key={expense.id} className="hover:bg-muted/20 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap">{formatDate(expense.date)}</td>
                      <td className="px-6 py-4">
                        <div className="font-semibold text-foreground">{expense.title}</div>
                        <div className="text-xs text-muted-foreground">{expense.projectName}</div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="px-2.5 py-1 bg-gray-100 text-gray-700 rounded-md text-xs font-medium">
                          {expense.category}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right font-bold text-foreground">
                        {formatFCFA(expense.amount)}
                      </td>
                      <td className="px-6 py-4">
                        {expense.status === 'EN_ATTENTE' && <span className="flex items-center text-blue-600 font-medium text-xs"><Loader2 className="w-3 h-3 mr-1 animate-spin" /> En attente</span>}
                        {expense.status === 'APPROUVEE' && <span className="flex items-center text-green-600 font-medium text-xs"><CheckCircle2 className="w-4 h-4 mr-1" /> Approuvée</span>}
                        {expense.status === 'REJETEE' && <span className="flex items-center text-red-600 font-medium text-xs"><XCircle className="w-4 h-4 mr-1" /> Rejetée</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
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
        toast({ title: "Succès", description: "Dépense déclarée avec succès." });
        onSuccess();
      },
      onError: () => {
        toast({ title: "Erreur", description: "Veuillez vérifier les champs.", variant: "destructive" });
      }
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
    if (!formData.projectId) return;
    
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
        <Select value={formData.projectId} onValueChange={v => setFormData({...formData, projectId: v})} required>
          <SelectTrigger className="rounded-xl">
            <SelectValue placeholder="Sélectionner le chantier" />
          </SelectTrigger>
          <SelectContent>
            {projects?.map(p => (
              <SelectItem key={p.id} value={p.id.toString()}>{p.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label>Titre / Description *</Label>
        <Input 
          value={formData.title} 
          onChange={e => setFormData({...formData, title: e.target.value})} 
          placeholder="Achat de ciment..."
          required 
          className="rounded-xl"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Montant (FCFA) *</Label>
          <Input 
            type="number" 
            value={formData.amount} 
            onChange={e => setFormData({...formData, amount: e.target.value})} 
            required 
            className="rounded-xl"
          />
        </div>
        <div className="space-y-2">
          <Label>Date *</Label>
          <Input 
            type="date" 
            value={formData.date} 
            onChange={e => setFormData({...formData, date: e.target.value})} 
            required 
            className="rounded-xl"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label>Catégorie *</Label>
        <Select value={formData.category} onValueChange={v => setFormData({...formData, category: v as CreateExpenseRequestCategory})}>
          <SelectTrigger className="rounded-xl">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.values(CreateExpenseRequestCategory).map(cat => (
              <SelectItem key={cat} value={cat}>{cat}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="pt-4 flex justify-end gap-3">
        <Button type="button" variant="outline" onClick={onSuccess} className="rounded-xl">Annuler</Button>
        <Button 
          type="submit" 
          disabled={createMutation.isPending} 
          className="rounded-xl bg-orange-600 hover:bg-orange-700 text-white"
        >
          {createMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
          Soumettre
        </Button>
      </div>
    </form>
  );
}
