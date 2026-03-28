import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { HardHat, ArrowRight, Loader2 } from "lucide-react";

export default function Login() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      await login({ email, password });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex bg-background">
      {/* Left side - Form */}
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

          <div className="space-y-2 mt-12">
            <h2 className="text-3xl font-bold tracking-tight text-foreground">Bon retour</h2>
            <p className="text-muted-foreground">Connectez-vous pour accéder à vos chantiers.</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6 mt-8">
            <div className="space-y-2">
              <Label htmlFor="email">Adresse Email</Label>
              <Input 
                id="email" 
                type="email" 
                placeholder="votre@email.com" 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="h-12 px-4 rounded-xl bg-background border-border/50 focus:border-primary focus:ring-primary/20 transition-all"
              />
            </div>
            
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Mot de passe</Label>
                <a href="#" className="text-sm text-primary font-medium hover:underline">Oublié ?</a>
              </div>
              <Input 
                id="password" 
                type="password" 
                placeholder="••••••••" 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="h-12 px-4 rounded-xl bg-background border-border/50 focus:border-primary focus:ring-primary/20 transition-all"
              />
            </div>

            <Button 
              type="submit" 
              disabled={isLoading} 
              className="w-full h-12 rounded-xl bg-accent hover:bg-accent/90 text-white font-semibold text-lg shadow-lg shadow-accent/25 hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300"
            >
              {isLoading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  Se Connecter
                  <ArrowRight className="w-5 h-5 ml-2" />
                </>
              )}
            </Button>
          </form>
        </div>
      </div>

      {/* Right side - Image */}
      <div className="hidden lg:block w-1/2 relative overflow-hidden bg-primary">
        <div className="absolute inset-0 bg-primary/40 mix-blend-multiply z-10" />
        <div className="absolute inset-0 bg-gradient-to-tr from-primary via-transparent to-accent/30 z-10" />
        <img 
          src={`${import.meta.env.BASE_URL}images/hero-bg.png`}
          alt="Construction Blueprint" 
          className="absolute inset-0 w-full h-full object-cover"
        />
        
        <div className="absolute bottom-12 left-12 right-12 z-20 text-white p-8 rounded-2xl glass-panel border-white/10 bg-black/20 text-center backdrop-blur-md">
          <h3 className="font-display text-3xl font-bold mb-4">L'excellence sur chaque chantier</h3>
          <p className="text-white/80 text-lg">Gérez vos projets, vos équipes et vos finances en temps réel avec la plateforme HAIROU.</p>
        </div>
      </div>
    </div>
  );
}
