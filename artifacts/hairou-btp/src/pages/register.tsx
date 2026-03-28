import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { HardHat, ArrowRight, Loader2, CheckCircle2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function Register() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    role: "OUVRIER",
    password: "",
    confirmPassword: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.password !== form.confirmPassword) {
      toast({ title: "Erreur", description: "Les mots de passe ne correspondent pas", variant: "destructive" });
      return;
    }
    if (form.password.length < 6) {
      toast({ title: "Erreur", description: "Le mot de passe doit contenir au moins 6 caractères", variant: "destructive" });
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          email: form.email,
          phone: form.phone || undefined,
          role: form.role,
          password: form.password,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.message || "Erreur lors de l'inscription");
      }
      setSubmitted(true);
    } catch (err: any) {
      const msg = err?.data?.message || err?.message || "Erreur lors de l'inscription";
      toast({ title: "Erreur", description: msg, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex bg-background">
      <div className="w-full lg:w-1/2 flex items-center justify-center p-8 lg:p-24 z-10 bg-white shadow-2xl relative">
        <div className="w-full max-w-md space-y-8 animate-in fade-in slide-in-from-bottom-8 duration-700">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center shadow-lg shadow-primary/20">
              <HardHat className="text-white w-7 h-7" />
            </div>
            <div>
              <h1 className="font-display font-bold text-3xl tracking-wide text-primary">HAIROU</h1>
              <p className="text-xs text-muted-foreground tracking-widest font-semibold uppercase">Gestion BTP</p>
            </div>
          </div>

          {submitted ? (
            <div className="text-center py-8 space-y-4 animate-in fade-in duration-500">
              <div className="w-20 h-20 rounded-full bg-green-50 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-10 h-10 text-green-600" />
              </div>
              <h2 className="text-2xl font-bold text-foreground">Demande envoyée !</h2>
              <p className="text-muted-foreground text-sm leading-relaxed">
                Votre demande d'accès a été transmise à l'administrateur. Vous recevrez une confirmation dès que votre compte sera approuvé.
              </p>
              <Button onClick={() => navigate("/login")} variant="outline" className="mt-4 rounded-xl w-full h-12">
                Retour à la connexion
              </Button>
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <h2 className="text-3xl font-bold tracking-tight text-foreground">Créer un compte</h2>
                <p className="text-muted-foreground text-sm">Votre compte sera activé après validation par l'administrateur.</p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2 col-span-2">
                    <Label htmlFor="name">Nom complet *</Label>
                    <Input
                      id="name"
                      placeholder="Jean Dupont"
                      value={form.name}
                      onChange={e => setForm({ ...form, name: e.target.value })}
                      required
                      className="h-11 rounded-xl"
                    />
                  </div>

                  <div className="space-y-2 col-span-2">
                    <Label htmlFor="email">Email *</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="votre@email.com"
                      value={form.email}
                      onChange={e => setForm({ ...form, email: e.target.value })}
                      required
                      className="h-11 rounded-xl"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="phone">Téléphone</Label>
                    <Input
                      id="phone"
                      placeholder="+221 77 xxx xxxx"
                      value={form.phone}
                      onChange={e => setForm({ ...form, phone: e.target.value })}
                      className="h-11 rounded-xl"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Rôle *</Label>
                    <Select value={form.role} onValueChange={v => setForm({ ...form, role: v })}>
                      <SelectTrigger className="h-11 rounded-xl"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="OUVRIER">Ouvrier</SelectItem>
                        <SelectItem value="CHEF_CHANTIER">Chef de Chantier</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="password">Mot de passe *</Label>
                    <Input
                      id="password"
                      type="password"
                      placeholder="••••••••"
                      value={form.password}
                      onChange={e => setForm({ ...form, password: e.target.value })}
                      required
                      className="h-11 rounded-xl"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="confirmPassword">Confirmer *</Label>
                    <Input
                      id="confirmPassword"
                      type="password"
                      placeholder="••••••••"
                      value={form.confirmPassword}
                      onChange={e => setForm({ ...form, confirmPassword: e.target.value })}
                      required
                      className="h-11 rounded-xl"
                    />
                  </div>
                </div>

                <Button
                  type="submit"
                  disabled={isLoading}
                  className="w-full h-12 rounded-xl bg-accent hover:bg-accent/90 text-white font-semibold text-base shadow-lg shadow-accent/25 mt-2"
                >
                  {isLoading ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <>
                      Envoyer la demande
                      <ArrowRight className="w-5 h-5 ml-2" />
                    </>
                  )}
                </Button>
              </form>

              <p className="text-center text-sm text-muted-foreground">
                Déjà un compte ?{" "}
                <button onClick={() => navigate("/login")} className="text-primary font-semibold hover:underline">
                  Se connecter
                </button>
              </p>
            </>
          )}
        </div>
      </div>

      <div className="hidden lg:block w-1/2 relative overflow-hidden bg-primary">
        <div className="absolute inset-0 bg-primary/40 mix-blend-multiply z-10" />
        <div className="absolute inset-0 bg-gradient-to-tr from-primary via-transparent to-accent/30 z-10" />
        <img
          src={`${import.meta.env.BASE_URL}images/hero-bg.png`}
          alt="Construction"
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div className="absolute bottom-12 left-12 right-12 z-20 text-white p-8 rounded-2xl glass-panel border-white/10 bg-black/20 text-center backdrop-blur-md">
          <h3 className="font-display text-3xl font-bold mb-4">Rejoignez HAIROU BTP</h3>
          <p className="text-white/80 text-lg">Gérez vos chantiers, pointages et équipes en temps réel.</p>
        </div>
      </div>
    </div>
  );
}
