/**
 * PageHeader — Barre de navigation locale (Retour / Précédent / Accueil)
 * Réutilisable sur toutes les pages détail pour une navigation intuitive.
 *
 * Usage:
 *   <PageHeader
 *     backTo="/pointage"
 *     backLabel="Retour aux fiches"
 *     title="Fiche du 15/05"
 *     subtitle="Projet ABC · Chef Dupont"
 *   />
 */
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Home } from "lucide-react";

interface PageHeaderProps {
  /** Destination du bouton Retour (par défaut history.back()) */
  backTo?: string;
  backLabel?: string;
  /** Titre principal (optionnel — sinon utilise le titre du Layout) */
  title?: string;
  /** Sous-titre / contexte */
  subtitle?: string;
  /** Afficher le bouton "Suivant" (history.forward) */
  showForward?: boolean;
  /** Cacher le bouton Accueil */
  hideHome?: boolean;
}

export function PageHeader({
  backTo,
  backLabel = "Retour",
  title,
  subtitle,
  showForward = false,
  hideHome = false,
}: PageHeaderProps) {
  const [, navigate] = useLocation();

  const handleBack = () => {
    if (backTo) {
      navigate(backTo);
    } else if (typeof window !== "undefined" && window.history.length > 1) {
      window.history.back();
    } else {
      navigate("/dashboard");
    }
  };

  const handleForward = () => {
    if (typeof window !== "undefined") window.history.forward();
  };

  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
      <div className="flex items-center gap-2 flex-shrink-0">
        <Button
          variant="ghost"
          size="sm"
          onClick={handleBack}
          className="rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted/50 px-3"
        >
          <ChevronLeft className="w-4 h-4 mr-1" />
          {backLabel}
        </Button>
        {showForward && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleForward}
            className="rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted/50 px-2"
            title="Page suivante"
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        )}
        {!hideHome && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/dashboard")}
            className="rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted/50 px-2"
            title="Tableau de bord"
          >
            <Home className="w-4 h-4" />
          </Button>
        )}
      </div>

      {(title || subtitle) && (
        <div className="border-l border-border/40 pl-3 hidden sm:block">
          {title && <p className="font-semibold text-sm text-foreground leading-tight">{title}</p>}
          {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
        </div>
      )}
    </div>
  );
}
