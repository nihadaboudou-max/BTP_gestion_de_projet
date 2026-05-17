/**
 * WorkerModal — Modal complète d'ajout/édition d'un ouvrier.
 * Réutilisable depuis /personnel ET depuis le pointage (création à la volée).
 * Tous les champs sont saisissables, certains sont obligatoires (Nom, Métier).
 */
import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, UserPlus, Phone, IdCard, MapPin, Briefcase, DollarSign, Calendar, FileText, AlertCircle } from "lucide-react";

export interface WorkerData {
  id?: number;
  name: string;
  trade: string;
  phone?: string;
  idNumber?: string;
  emergencyContact?: string;
  address?: string;
  birthDate?: string;
  hireDate?: string;
  notes?: string;
  dailyWage?: number;
  contractType?: "CDI" | "CDD" | "JOURNALIER";
}

interface WorkerModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Si fourni → mode édition */
  initial?: Partial<WorkerData>;
  /** Callback : appelé avec les données nettoyées au submit */
  onSubmit: (data: WorkerData) => Promise<void> | void;
  /** Texte du bouton submit (par défaut: "Enregistrer") */
  submitLabel?: string;
  /** Titre custom */
  title?: string;
  /** En cours de soumission */
  isLoading?: boolean;
}

const contractLabels: Record<string, string> = {
  CDI: "CDI",
  CDD: "CDD",
  JOURNALIER: "Journalier",
};

const specialityGroups = [
  {
    label: "Ouvriers & Artisans",
    options: [
      "Maçon", "Ferrailleur", "Coffreur", "Carreleur", "Charpentier", "Menuisier",
      "Électricien", "Plombier", "Peintre", "Étancheur", "Façadier", "Couvreur",
      "Soudeur", "Manœuvre", "Chef d'équipe",
    ],
  },
  {
    label: "Direction & Encadrement",
    options: ["Directeur de Travaux", "Conducteur de Travaux", "Chef de Chantier", "Ingénieur BTP", "Architecte"],
  },
  {
    label: "Engins & Logistique",
    options: ["Conducteur d'engin", "Chauffeur / Livreur", "Magasinier", "Grutier"],
  },
  {
    label: "Sécurité & Contrôle",
    options: ["Agent de Sécurité", "Contrôleur de Qualité", "Responsable HSE"],
  },
  {
    label: "Autres",
    options: ["Technicien", "Stagiaire", "Prestataire", "Autre"],
  },
];

export function WorkerModal({
  open,
  onOpenChange,
  initial,
  onSubmit,
  submitLabel = "Enregistrer",
  title,
  isLoading = false,
}: WorkerModalProps) {
  const [form, setForm] = useState<WorkerData>({
    name: "",
    trade: "",
    phone: "",
    idNumber: "",
    emergencyContact: "",
    address: "",
    birthDate: "",
    hireDate: new Date().toISOString().slice(0, 10),
    notes: "",
    dailyWage: 0,
    contractType: "JOURNALIER",
  });
  const [useCustomTrade, setUseCustomTrade] = useState(false);
  const [customTrade, setCustomTrade] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setForm({
        name: initial?.name || "",
        trade: initial?.trade || "",
        phone: initial?.phone || "",
        idNumber: initial?.idNumber || "",
        emergencyContact: initial?.emergencyContact || "",
        address: initial?.address || "",
        birthDate: initial?.birthDate || "",
        hireDate: initial?.hireDate || new Date().toISOString().slice(0, 10),
        notes: initial?.notes || "",
        dailyWage: initial?.dailyWage ?? 0,
        contractType: initial?.contractType || "JOURNALIER",
      });
      // Si le métier initial ne fait pas partie de la liste prédéfinie → mode custom
      const allOptions = specialityGroups.flatMap(g => g.options);
      if (initial?.trade && !allOptions.includes(initial.trade)) {
        setUseCustomTrade(true);
        setCustomTrade(initial.trade);
      } else {
        setUseCustomTrade(false);
        setCustomTrade("");
      }
      setError(null);
    }
  }, [open, initial]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const finalTrade = useCustomTrade ? customTrade.trim() : form.trade;

    if (!form.name.trim()) { setError("Le nom est obligatoire"); return; }
    if (!finalTrade) { setError("Le métier / fonction est obligatoire"); return; }

    const payload: WorkerData = {
      ...form,
      name: form.name.trim(),
      trade: finalTrade,
      phone: form.phone?.trim() || undefined,
      idNumber: form.idNumber?.trim() || undefined,
      emergencyContact: form.emergencyContact?.trim() || undefined,
      address: form.address?.trim() || undefined,
      birthDate: form.birthDate || undefined,
      hireDate: form.hireDate || undefined,
      notes: form.notes?.trim() || undefined,
      dailyWage: form.dailyWage ? Number(form.dailyWage) : 0,
    };

    try {
      await onSubmit(payload);
    } catch (err: any) {
      setError(err?.message || "Erreur lors de l'enregistrement");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[640px] rounded-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl flex items-center gap-2">
            <UserPlus className="w-6 h-6 text-secondary" />
            {title || (initial?.id ? "Modifier l'ouvrier" : "Nouvel ouvrier")}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5 mt-2">
          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}

          {/* Section 1 : Identité */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Identité</h4>
            <div className="space-y-2">
              <Label>Nom complet *</Label>
              <Input
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
                placeholder="Prénom NOM"
                required
                className="rounded-xl"
                autoFocus
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="flex items-center gap-1.5"><Phone className="w-3.5 h-3.5" /> Téléphone</Label>
                <Input
                  value={form.phone}
                  onChange={e => setForm({ ...form, phone: e.target.value })}
                  placeholder="77 XXX XX XX"
                  className="rounded-xl"
                />
              </div>
              <div className="space-y-2">
                <Label className="flex items-center gap-1.5"><IdCard className="w-3.5 h-3.5" /> N° CNI / Identité</Label>
                <Input
                  value={form.idNumber}
                  onChange={e => setForm({ ...form, idNumber: e.target.value })}
                  placeholder="Numéro CNI / Passeport"
                  className="rounded-xl"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5" /> Date de naissance</Label>
                <Input
                  type="date"
                  value={form.birthDate}
                  onChange={e => setForm({ ...form, birthDate: e.target.value })}
                  className="rounded-xl"
                />
              </div>
              <div className="space-y-2">
                <Label>Contact urgence</Label>
                <Input
                  value={form.emergencyContact}
                  onChange={e => setForm({ ...form, emergencyContact: e.target.value })}
                  placeholder="Nom / téléphone proche"
                  className="rounded-xl"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5" /> Adresse</Label>
              <Input
                value={form.address}
                onChange={e => setForm({ ...form, address: e.target.value })}
                placeholder="Quartier, rue, ville…"
                className="rounded-xl"
              />
            </div>
          </div>

          {/* Section 2 : Contrat & Salaire */}
          <div className="space-y-3 pt-4 border-t border-border/50">
            <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Contrat & Rémunération</h4>

            <div className="space-y-2">
              <Label className="flex items-center gap-1.5"><Briefcase className="w-3.5 h-3.5" /> Métier / Fonction *</Label>
              {!useCustomTrade ? (
                <Select
                  value={form.trade}
                  onValueChange={v => {
                    if (v === "__custom__") { setUseCustomTrade(true); return; }
                    setForm({ ...form, trade: v });
                  }}
                >
                  <SelectTrigger className="rounded-xl"><SelectValue placeholder="Sélectionner le métier" /></SelectTrigger>
                  <SelectContent>
                    {specialityGroups.map(group => (
                      <div key={group.label}>
                        <div className="px-2 py-1.5 text-xs font-bold text-muted-foreground uppercase tracking-wide bg-muted/40">
                          {group.label}
                        </div>
                        {group.options.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                      </div>
                    ))}
                    <SelectItem value="__custom__">Autre (saisie libre)…</SelectItem>
                  </SelectContent>
                </Select>
              ) : (
                <div className="flex gap-2">
                  <Input
                    value={customTrade}
                    onChange={e => setCustomTrade(e.target.value)}
                    placeholder="Saisir le métier…"
                    className="rounded-xl flex-1"
                  />
                  <Button type="button" variant="outline" size="sm" className="rounded-xl"
                    onClick={() => setUseCustomTrade(false)}>
                    ← Liste
                  </Button>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Type de contrat</Label>
                <Select value={form.contractType} onValueChange={v => setForm({ ...form, contractType: v as any })}>
                  <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(contractLabels).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="flex items-center gap-1.5"><DollarSign className="w-3.5 h-3.5" /> Salaire jour (FCFA)</Label>
                <Input
                  type="number"
                  min="0"
                  value={form.dailyWage}
                  onChange={e => setForm({ ...form, dailyWage: parseFloat(e.target.value) || 0 })}
                  placeholder="15 000"
                  className="rounded-xl"
                />
              </div>
              <div className="space-y-2">
                <Label>Date d'embauche</Label>
                <Input
                  type="date"
                  value={form.hireDate}
                  onChange={e => setForm({ ...form, hireDate: e.target.value })}
                  className="rounded-xl"
                />
              </div>
            </div>
          </div>

          {/* Section 3 : Notes */}
          <div className="space-y-2 pt-4 border-t border-border/50">
            <Label className="flex items-center gap-1.5"><FileText className="w-3.5 h-3.5" /> Notes / Observations</Label>
            <Textarea
              value={form.notes}
              onChange={e => setForm({ ...form, notes: e.target.value })}
              placeholder="Compétences particulières, restrictions médicales, etc."
              rows={3}
              className="rounded-xl resize-none"
            />
          </div>

          {/* Actions */}
          <div className="pt-4 flex justify-end gap-3 border-t border-border/50">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="rounded-xl">
              Annuler
            </Button>
            <Button
              type="submit"
              disabled={isLoading}
              className="rounded-xl bg-secondary hover:bg-secondary/90 text-white px-6"
            >
              {isLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {submitLabel}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
