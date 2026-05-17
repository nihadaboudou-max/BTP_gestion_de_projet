/**
 * WorkerSelectorModal — Sélecteur d'ouvrier existant
 *
 * Affiche la liste de tous les ouvriers de la base avec recherche
 * (nom, téléphone, métier, CNI). Permet d'ajouter en un clic à la fiche.
 * Bouton "Créer un nouvel ouvrier" en bas pour basculer vers WorkerModal.
 */
import { useState, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useListPersonnel } from "@workspace/api-client-react";
import { formatFCFA } from "@/lib/format";
import { Search, UserPlus, Phone, IdCard, Briefcase, Plus, Users, Loader2 } from "lucide-react";

interface WorkerSelectorModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** IDs des ouvriers déjà sur la fiche (à exclure du sélecteur) */
  excludeIds?: number[];
  /** Callback : ouvrier existant sélectionné */
  onSelect: (worker: { id: number; name: string; trade: string; phone?: string | null; dailyWage?: number }) => Promise<void> | void;
  /** Callback : l'utilisateur clique sur "Créer un nouvel ouvrier" */
  onCreateNew: () => void;
  /** En cours d'ajout */
  isAdding?: boolean;
}

export function WorkerSelectorModal({
  open,
  onOpenChange,
  excludeIds = [],
  onSelect,
  onCreateNew,
  isAdding = false,
}: WorkerSelectorModalProps) {
  const { data: personnel, isLoading } = useListPersonnel();
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const available = useMemo(() => {
    const list = (personnel || []).filter((p: any) => p.isActive && !p.archived && !excludeIds.includes(p.id));
    if (!search.trim()) return list;
    const q = search.toLowerCase().trim();
    return list.filter((p: any) =>
      p.name.toLowerCase().includes(q) ||
      (p.trade || "").toLowerCase().includes(q) ||
      (p.phone || "").toLowerCase().includes(q) ||
      (p.idNumber || "").toLowerCase().includes(q)
    );
  }, [personnel, search, excludeIds]);

  const handlePick = async (worker: any) => {
    setSelectedId(worker.id);
    try {
      await onSelect({
        id: worker.id,
        name: worker.name,
        trade: worker.trade,
        phone: worker.phone,
        dailyWage: Number(worker.dailyWage) || 0,
      });
    } finally {
      setSelectedId(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[680px] rounded-2xl max-h-[88vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl flex items-center gap-2">
            <Users className="w-6 h-6 text-primary" />
            Ajouter un ouvrier à la fiche
          </DialogTitle>
        </DialogHeader>

        {/* Recherche */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Rechercher par nom, téléphone, métier, CNI..."
            className="pl-9 rounded-xl h-11"
            autoFocus
          />
        </div>

        {/* Conseil */}
        <p className="text-xs text-muted-foreground -mt-1">
          {excludeIds.length > 0 && `${excludeIds.length} ouvrier(s) déjà sur la fiche • `}
          {available.length} ouvrier(s) disponible(s)
        </p>

        {/* Liste */}
        <div className="flex-1 overflow-y-auto -mx-2 px-2">
          {isLoading ? (
            <div className="py-12 text-center text-muted-foreground">
              <Loader2 className="w-6 h-6 animate-spin inline-block mr-2" />
              Chargement des ouvriers…
            </div>
          ) : available.length === 0 ? (
            <div className="py-10 text-center">
              <Users className="w-10 h-10 text-muted-foreground/30 mx-auto mb-2" />
              <p className="font-bold text-foreground">
                {search ? "Aucun résultat" : "Aucun ouvrier disponible"}
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                {search
                  ? "Aucun ouvrier ne correspond. Créez-en un nouveau ci-dessous."
                  : "Tous les ouvriers sont déjà sur la fiche, ou la base est vide."}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {available.map((p: any) => (
                <button
                  key={p.id}
                  onClick={() => handlePick(p)}
                  disabled={isAdding || selectedId === p.id}
                  className="w-full flex items-center gap-3 p-3 rounded-xl border border-border/50 bg-white hover:bg-primary/5 hover:border-primary/40 transition-all text-left disabled:opacity-50 disabled:cursor-wait"
                >
                  <div className="w-10 h-10 rounded-full bg-secondary/10 flex items-center justify-center font-bold text-secondary text-sm border border-secondary/20 shrink-0">
                    {p.name.substring(0, 2).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-foreground truncate">{p.name}</p>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <Briefcase className="w-3 h-3" /> {p.trade}
                      </span>
                      {p.phone && (
                        <span className="inline-flex items-center gap-1">
                          <Phone className="w-3 h-3" /> {p.phone}
                        </span>
                      )}
                      {p.idNumber && (
                        <span className="inline-flex items-center gap-1">
                          <IdCard className="w-3 h-3" /> {p.idNumber}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    {p.dailyWage > 0 && (
                      <p className="text-xs font-semibold text-primary">{formatFCFA(Number(p.dailyWage))}/j</p>
                    )}
                    <div className="mt-1">
                      {selectedId === p.id ? (
                        <Loader2 className="w-4 h-4 animate-spin text-primary inline" />
                      ) : (
                        <Plus className="w-5 h-5 text-primary inline" />
                      )}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Footer : créer un nouvel ouvrier */}
        <div className="border-t border-border/40 pt-4 flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
          <p className="text-xs text-muted-foreground">
            L'ouvrier n'existe pas encore dans la base ?
          </p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} className="rounded-xl">
              Fermer
            </Button>
            <Button
              onClick={onCreateNew}
              className="rounded-xl bg-secondary hover:bg-secondary/90 text-white"
            >
              <UserPlus className="w-4 h-4 mr-2" />
              Créer un nouvel ouvrier
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
