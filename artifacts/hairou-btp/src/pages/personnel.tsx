import { useState } from "react";
import { AppLayout } from "@/components/layout";
import { useListPersonnel, useCreatePersonnel, CreatePersonnelRequestContractType } from "@workspace/api-client-react";
import { formatFCFA } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Users, Phone, Briefcase, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

const contractLabels: Record<string, string> = {
  CDI: "CDI",
  CDD: "CDD",
  JOURNALIER: "Journalier",
  FREELANCE: "Freelance",
};

const specialityOptions = [
  "Maçon", "Électricien", "Plombier", "Charpentier", "Peintre",
  "Ferrailleur", "Carreleur", "Conducteur d'engin", "Manœuvre", "Chef d'équipe",
];

export default function Personnel() {
  const { data: personnel, isLoading } = useListPersonnel();
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  const active = personnel?.filter(p => p.isActive) ?? [];
  const inactive = personnel?.filter(p => !p.isActive) ?? [];

  return (
    <AppLayout title="Personnel">
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <p className="text-muted-foreground">Gérez votre équipe et leurs informations contractuelles.</p>
          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button className="bg-secondary hover:bg-secondary/90 text-white rounded-xl shadow-lg shadow-secondary/20">
                <Plus className="w-4 h-4 mr-2" />
                Ajouter un ouvrier
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px] rounded-2xl">
              <DialogHeader>
                <DialogTitle className="font-display text-2xl">Nouvel Employé</DialogTitle>
              </DialogHeader>
              <CreatePersonnelForm onSuccess={() => setIsCreateOpen(false)} />
            </DialogContent>
          </Dialog>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <div className="bg-white rounded-2xl border border-border/50 p-4 shadow-sm">
            <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Total Personnel</p>
            <p className="text-3xl font-display font-bold text-foreground mt-1">{personnel?.length ?? 0}</p>
          </div>
          <div className="bg-white rounded-2xl border border-border/50 p-4 shadow-sm">
            <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Actifs</p>
            <p className="text-3xl font-display font-bold text-green-600 mt-1">{active.length}</p>
          </div>
          <div className="bg-white rounded-2xl border border-border/50 p-4 shadow-sm">
            <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Inactifs</p>
            <p className="text-3xl font-display font-bold text-red-400 mt-1">{inactive.length}</p>
          </div>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {[1, 2, 3, 4, 5, 6].map(i => <div key={i} className="h-36 bg-muted/50 rounded-2xl animate-pulse" />)}
          </div>
        ) : personnel?.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-16 text-center bg-white rounded-3xl border border-border/50 shadow-sm">
            <div className="w-20 h-20 bg-muted rounded-full flex items-center justify-center mb-4">
              <Users className="w-10 h-10 text-muted-foreground/50" />
            </div>
            <h3 className="text-xl font-bold mb-2">Aucun ouvrier enregistré</h3>
            <p className="text-muted-foreground mb-6">Ajoutez votre premier employé pour commencer.</p>
            <Button onClick={() => setIsCreateOpen(true)} className="rounded-xl">Ajouter un ouvrier</Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {personnel?.map(p => (
              <div key={p.id} className={`bg-white rounded-2xl border shadow-sm p-5 transition-all hover:shadow-md ${p.isActive ? 'border-border/50' : 'border-red-100 opacity-70'}`}>
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-full bg-secondary/10 flex items-center justify-center font-bold text-secondary text-sm border border-secondary/20">
                      {p.name.substring(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <h4 className="font-bold text-foreground">{p.name}</h4>
                      <p className="text-xs text-muted-foreground">{p.speciality}</p>
                    </div>
                  </div>
                  <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${p.isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
                    {p.isActive ? 'Actif' : 'Inactif'}
                  </span>
                </div>
                <div className="space-y-1.5 text-xs text-muted-foreground">
                  {p.phone && (
                    <div className="flex items-center gap-2">
                      <Phone className="w-3 h-3" />
                      <span>{p.phone}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <Briefcase className="w-3 h-3" />
                    <span>{contractLabels[p.contractType] || p.contractType}</span>
                  </div>
                  {p.dailyWage && (
                    <div className="flex items-center justify-between mt-3 pt-3 border-t border-border/40">
                      <span className="font-medium">Salaire journalier</span>
                      <span className="font-bold text-primary">{formatFCFA(Number(p.dailyWage))}</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}

function CreatePersonnelForm({ onSuccess }: { onSuccess: () => void }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const createMutation = useCreatePersonnel({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/personnel"] });
        toast({ title: "Employé ajouté avec succès" });
        onSuccess();
      },
      onError: () => toast({ title: "Erreur", description: "Impossible d'ajouter l'employé.", variant: "destructive" })
    }
  });

  const [form, setForm] = useState({
    name: "",
    phone: "",
    speciality: "",
    contractType: "JOURNALIER" as CreatePersonnelRequestContractType,
    dailyWage: "",
    nationalId: "",
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.speciality) return;
    createMutation.mutate({
      data: {
        ...form,
        dailyWage: form.dailyWage ? Number(form.dailyWage) : undefined,
        nationalId: form.nationalId || undefined,
        phone: form.phone || undefined,
      }
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 mt-4">
      <div className="space-y-2">
        <Label>Nom complet *</Label>
        <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Prénom NOM" required className="rounded-xl" />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Téléphone</Label>
          <Input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="77 XXX XX XX" className="rounded-xl" />
        </div>
        <div className="space-y-2">
          <Label>Numéro CNI</Label>
          <Input value={form.nationalId} onChange={e => setForm({ ...form, nationalId: e.target.value })} placeholder="Optionnel" className="rounded-xl" />
        </div>
      </div>
      <div className="space-y-2">
        <Label>Spécialité *</Label>
        <Select value={form.speciality} onValueChange={v => setForm({ ...form, speciality: v })}>
          <SelectTrigger className="rounded-xl"><SelectValue placeholder="Sélectionner la spécialité" /></SelectTrigger>
          <SelectContent>{specialityOptions.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Type de contrat *</Label>
          <Select value={form.contractType} onValueChange={v => setForm({ ...form, contractType: v as CreatePersonnelRequestContractType })}>
            <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
            <SelectContent>{Object.entries(contractLabels).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Salaire Journalier (FCFA)</Label>
          <Input type="number" value={form.dailyWage} onChange={e => setForm({ ...form, dailyWage: e.target.value })} placeholder="15000" className="rounded-xl" />
        </div>
      </div>
      <div className="pt-4 flex justify-end gap-3">
        <Button type="button" variant="outline" onClick={onSuccess} className="rounded-xl">Annuler</Button>
        <Button type="submit" disabled={createMutation.isPending || !form.name || !form.speciality} className="rounded-xl bg-secondary hover:bg-secondary/90 text-white">
          {createMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
          Ajouter
        </Button>
      </div>
    </form>
  );
}
