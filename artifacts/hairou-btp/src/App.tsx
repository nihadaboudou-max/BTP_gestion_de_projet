import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/hooks/use-auth";
import NotFound from "@/pages/not-found";

// Page Imports
import Login from "@/pages/login";
import Dashboard from "@/pages/dashboard";
import Projects from "@/pages/projects";
import Pointage from "@/pages/pointage";
import PointageDetail from "@/pages/pointage-detail";
import Expenses from "@/pages/expenses";

// Global Fetch Interceptor for JWT
const originalFetch = window.fetch;
window.fetch = async (...args) => {
  let [resource, config] = args;
  const token = localStorage.getItem('hairou_token');
  if (token && typeof resource === 'string' && resource.startsWith('/api')) {
    config = config || {};
    config.headers = {
      ...config.headers,
      Authorization: `Bearer ${token}`
    };
  }
  return originalFetch(resource, config);
};

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

// Auth Guard Component
function ProtectedRoute({ component: Component, ...rest }: any) {
  const { isAuthenticated, isLoading } = useAuth();
  
  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center bg-background text-primary">Chargement...</div>;
  }
  
  if (!isAuthenticated) {
    return <Redirect to="/login" />;
  }
  
  return <Component {...rest} />;
}

function Router() {
  return (
    <Switch>
      <Route path="/login" component={Login} />
      <Route path="/" component={() => <Redirect to="/dashboard" />} />
      
      <Route path="/dashboard">
        {() => <ProtectedRoute component={Dashboard} />}
      </Route>
      
      <Route path="/projets">
        {() => <ProtectedRoute component={Projects} />}
      </Route>
      
      <Route path="/pointage">
        {() => <ProtectedRoute component={Pointage} />}
      </Route>
      
      <Route path="/pointage/:id">
        {() => <ProtectedRoute component={PointageDetail} />}
      </Route>
      
      <Route path="/depenses">
        {() => <ProtectedRoute component={Expenses} />}
      </Route>

      {/* Placeholder for remaining routes */}
      <Route path="/taches" component={() => <ProtectedRoute component={() => <div className="p-8 text-center text-muted-foreground">Page en construction</div>} />} />
      <Route path="/personnel" component={() => <ProtectedRoute component={() => <div className="p-8 text-center text-muted-foreground">Page en construction</div>} />} />
      <Route path="/messages" component={() => <ProtectedRoute component={() => <div className="p-8 text-center text-muted-foreground">Page en construction</div>} />} />
      <Route path="/notifications" component={() => <ProtectedRoute component={() => <div className="p-8 text-center text-muted-foreground">Page en construction</div>} />} />

      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <AuthProvider>
            <Router />
          </AuthProvider>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
