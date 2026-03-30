import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/hooks/use-auth";
import NotFound from "@/pages/not-found";

// Page Imports
import Login from "@/pages/login";
import Register from "@/pages/register";
import Dashboard from "@/pages/dashboard";
import Projects from "@/pages/projects";
import Tasks from "@/pages/tasks";
import Pointage from "@/pages/pointage";
import PointageNew from "@/pages/pointage-new";
import PointageDetail from "@/pages/pointage-detail";
import Expenses from "@/pages/expenses";
import Personnel from "@/pages/personnel";
import Messages from "@/pages/messages";
import Notifications from "@/pages/notifications";
import Administration from "@/pages/administration";
import Finance from "@/pages/finance";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function ProtectedRoute({ component: Component, ...rest }: any) {
  const { isAuthenticated, isLoading } = useAuth();
  
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-primary">
        Chargement...
      </div>
    );
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
      <Route path="/register" component={Register} />
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

      <Route path="/pointage/new">
        {() => <ProtectedRoute component={PointageNew} />}
      </Route>
      
      <Route path="/pointage/:id">
        {() => <ProtectedRoute component={PointageDetail} />}
      </Route>
      
      <Route path="/depenses">
        {() => <ProtectedRoute component={Expenses} />}
      </Route>

      <Route path="/taches">
        {() => <ProtectedRoute component={Tasks} />}
      </Route>

      <Route path="/personnel">
        {() => <ProtectedRoute component={Personnel} />}
      </Route>

      <Route path="/messages">
        {() => <ProtectedRoute component={Messages} />}
      </Route>

      <Route path="/notifications">
        {() => <ProtectedRoute component={Notifications} />}
      </Route>

      <Route path="/administration">
        {() => <ProtectedRoute component={Administration} />}
      </Route>

      <Route path="/finance">
        {() => <ProtectedRoute component={Finance} />}
      </Route>

      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL?.replace(/\/$/, "") ?? ""}>
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
