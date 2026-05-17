import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { useLocation } from "wouter";
import { User, useGetMe, login as apiLogin, LoginRequest, AuthResponse } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  login: (credentials: LoginRequest) => Promise<void>;
  logout: () => void;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [token, setToken] = useState<string | null>(localStorage.getItem("hairou_token"));

  const { data: user, isLoading: isUserLoading, error } = useGetMe({
    query: {
      enabled: !!token,
      retry: false,
    }
  });

  useEffect(() => {
    if (error) {
      // Token might be invalid or expired
      logout();
    }
  }, [error]);

  const login = async (credentials: LoginRequest) => {
    try {
      const response: AuthResponse = await apiLogin(credentials);
      localStorage.setItem("hairou_token", response.token);
      localStorage.setItem("hairou_refresh_token", response.refreshToken);
      setToken(response.token);
      queryClient.setQueryData(["/api/auth/me"], response.user);
      
      toast({
        title: "Connexion réussie",
        description: `Bienvenue, ${response.user.name}`,
      });
      
      setLocation("/dashboard");
    } catch (err: any) {
      toast({
        title: "Erreur de connexion",
        description: err.message || "Email ou mot de passe incorrect",
        variant: "destructive",
      });
      throw err;
    }
  };

  const logout = () => {
    localStorage.removeItem("hairou_token");
    localStorage.removeItem("hairou_refresh_token");
    setToken(null);
    queryClient.clear();
    setLocation("/login");
  };

  const value = {
    user: user || null,
    isLoading: isUserLoading && !!token,
    login,
    logout,
    isAuthenticated: !!user,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
