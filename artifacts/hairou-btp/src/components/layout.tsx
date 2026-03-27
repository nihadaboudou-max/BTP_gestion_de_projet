import { ReactNode, useState } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { 
  LayoutDashboard, 
  HardHat, 
  CheckSquare, 
  ClipboardList, 
  Users, 
  Receipt, 
  MessageSquare, 
  Bell, 
  LogOut,
  Menu,
  X
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface LayoutProps {
  children: ReactNode;
  title: string;
}

export function AppLayout({ children, title }: LayoutProps) {
  const { user, logout } = useAuth();
  const [location] = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const navItems = [
    { href: "/dashboard", label: "Tableau de Bord", icon: LayoutDashboard },
    { href: "/projets", label: "Projets", icon: HardHat },
    { href: "/taches", label: "Tâches", icon: CheckSquare },
    { href: "/pointage", label: "Pointage", icon: ClipboardList },
    { href: "/personnel", label: "Personnel", icon: Users },
    { href: "/depenses", label: "Dépenses", icon: Receipt },
    { href: "/messages", label: "Messages", icon: MessageSquare },
  ];

  return (
    <div className="min-h-screen bg-background flex w-full overflow-hidden">
      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 lg:hidden backdrop-blur-sm transition-opacity"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed lg:static inset-y-0 left-0 z-50
        w-72 glass-sidebar text-primary-foreground
        transform transition-transform duration-300 ease-in-out
        ${sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}
        flex flex-col
      `}>
        <div className="p-6 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-accent flex items-center justify-center shadow-lg shadow-accent/20">
            <HardHat className="text-white w-6 h-6" />
          </div>
          <div>
            <h1 className="font-display font-bold text-2xl tracking-wide text-white">HAIROU</h1>
            <p className="text-xs text-muted/70 tracking-widest font-semibold uppercase">Gestion BTP</p>
          </div>
        </div>

        <div className="px-6 py-4 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center text-sm font-bold border-2 border-white/10">
              {user?.name?.substring(0, 2).toUpperCase() || "U"}
            </div>
            <div>
              <p className="font-semibold text-sm text-white">{user?.name}</p>
              <p className="text-xs text-muted/70">{user?.role.replace('_', ' ')}</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 px-4 py-6 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const isActive = location.startsWith(item.href);
            return (
              <Link key={item.href} href={item.href} onClick={() => setSidebarOpen(false)}>
                <div className={`
                  flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 cursor-pointer
                  ${isActive 
                    ? "bg-accent text-white shadow-md shadow-accent/20" 
                    : "text-white/70 hover:bg-white/5 hover:text-white"
                  }
                `}>
                  <item.icon className={`w-5 h-5 ${isActive ? "text-white" : "text-white/70"}`} />
                  <span className="font-medium">{item.label}</span>
                </div>
              </Link>
            );
          })}
        </nav>

        <div className="p-4 mt-auto">
          <button 
            onClick={logout}
            className="w-full flex items-center gap-3 px-4 py-3 text-red-400 hover:bg-red-400/10 rounded-xl transition-colors font-medium"
          >
            <LogOut className="w-5 h-5" />
            Déconnexion
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Header */}
        <header className="h-20 bg-white/80 backdrop-blur-md border-b border-border/50 flex items-center justify-between px-6 sticky top-0 z-30">
          <div className="flex items-center gap-4">
            <button 
              className="lg:hidden p-2 -ml-2 text-foreground hover:bg-muted rounded-lg"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu className="w-6 h-6" />
            </button>
            <h2 className="font-display text-2xl font-bold text-foreground tracking-tight">{title}</h2>
          </div>
          
          <div className="flex items-center gap-4">
            <Link href="/notifications">
              <Button variant="ghost" size="icon" className="relative text-muted-foreground hover:text-foreground rounded-full">
                <Bell className="w-5 h-5" />
                <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-destructive rounded-full border border-white"></span>
              </Button>
            </Link>
          </div>
        </header>

        {/* Page Content */}
        <div className="flex-1 overflow-auto p-4 md:p-6 lg:p-8">
          <div className="max-w-7xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
