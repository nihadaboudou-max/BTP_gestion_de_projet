/**
 * Page /register-company — Inscription publique d'une nouvelle entreprise.
 *
 * Crée l'entreprise + son compte ADMIN en TRIAL (30 jours).
 * Redirige automatiquement vers le dashboard après création.
 */
import { useState } from "react";
import { useLocation, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { Building2, Loader2, CheckCircle2, ArrowRight, Sparkles, ShieldCheck } from "lucide-react";

const BACKEND = (import.meta as any).env?.VITE_API_URL ?? "https://btp-gestion-de-projet.onrender.com";

export default function RegisterCompany() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { login } = useAuth() as any;
  const [form, setForm] = useState({
    companyName: "",
    ownerName: "",
    email: "",
    password: "",
    phone: "",
    country: "SN",
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (form.password.length < 8) {
      setError("Le mot de passe doit faire au moins 8 caractères");
      return;
    }
    setIsLoading(true);
    try {
      const res = await fetch(`${BACKEND}/api/auth/register-company`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || "Erreur d'inscription");

      // Stocke le token et redirige
      localStorage.setItem("hairou_token", data.token);
      if (data.refreshToken) localStorage.setItem("hairou_refresh", data.refreshToken);

      toast({
        title: "Bienvenue sur HAIROU BTP !",
        description: `Votre entreprise "${data.company.name}" est créée. Essai gratuit 30 jours.`,
      });

      // Force reload pour charger le user dans le context auth
      window.location.href = "/dashboard";
    } catch (err: any) {
      setError(err.message || "Erreur");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary via-primary/90 to-accent/30 flex items-center justify-center p-4">
      <div className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">
        {/* Gauche : Pitch */}
        <div className="text-white space-y-6 hidden lg:block">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-white/10 backdrop-blur rounded-full text-xs font-semibold">
            <Sparkles className="w-3.5 h-3.5" /> 30 jours d'essai gratuit
          </div>
          <h1 className="font-display font-bold text-5xl leading-tight">
            La gestion BTP, <br />enfin simple.
          </h1>
          <p className="text-white/80 text-lg">
            Pointages, paie hebdomadaire, projets, dépenses, signatures électroniques.
            Tout pour faire tourner votre chantier sans paperasse.
          </p>
          <ul className="space-y-3 text-white/90">
            {[
              "Pointage des ouvriers avec signatures électroniques",
              "Paie hebdomadaire automatique (espèces, Mobile Money, virement)",
              "Modes de paiement : au jour, au m², au forfait, prestataire",
              "Multi-projets, multi-utilisateurs, rôles personnalisables",
              "Rapports financiers et export CSV / PDF",
            ].map((t, i) => (
              <li key={i} className="flex items-start gap-2">
                <CheckCircle2 className="w-5 h-5 text-green-300 shrink-0 mt-0.5" />
                <span>{t}</span>
              </li>
            ))}
          </ul>
          <div className="flex items-center gap-2 text-xs text-white/60 mt-8">
            <ShieldCheck className="w-4 h-4" /> Vos données sont isolées et sécurisées par entreprise
          </div>
        </div>

        {/* Droite : Formulaire */}
        <div className="bg-white rounded-3xl p-8 shadow-2xl space-y-5">
          <div className="text-center">
            <div className="w-14 h-14 bg-accent rounded-2xl flex items-center justify-center mx-auto shadow-lg shadow-accent/30">
              <Building2 className="w-7 h-7 text-white" />
            </div>
            <h2 className="font-display font-bold text-3xl text-foreground mt-3">Créer mon entreprise</h2>
            <p className="text-muted-foreground text-sm mt-1">30 jours d'essai gratuit, sans carte bancaire</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">{error}</div>
            )}

            <div>
              <Label>Nom de votre entreprise *</Label>
              <Input value={form.companyName} onChange={e => setForm({ ...form, companyName: e.target.value })} required placeholder="Ex: BTP Konaté & Fils" className="rounded-xl mt-1" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Votre nom complet *</Label>
                <Input value={form.ownerName} onChange={e => setForm({ ...form, ownerName: e.target.value })} required placeholder="Prénom NOM" className="rounded-xl mt-1" />
              </div>
              <div>
                <Label>Téléphone</Label>
                <Input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="77 XXX XX XX" className="rounded-xl mt-1" />
              </div>
            </div>

            <div>
              <Label>Email *</Label>
              <Input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} required placeholder="vous@entreprise.com" className="rounded-xl mt-1" />
            </div>

            <div>
              <Label>Mot de passe * (8 caractères min)</Label>
              <Input type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} required minLength={8} placeholder="••••••••" className="rounded-xl mt-1" />
            </div>

            <Button type="submit" disabled={isLoading} className="w-full rounded-xl bg-accent hover:bg-accent/90 text-white h-12 text-base font-semibold">
              {isLoading ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <ArrowRight className="w-5 h-5 mr-2" />}
              Commencer l'essai gratuit
            </Button>

            <p className="text-xs text-center text-muted-foreground">
              Déjà un compte ? <Link href="/login" className="text-accent font-semibold hover:underline">Connectez-vous</Link>
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
