import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Route, Switch, Router as WouterRouter } from 'wouter';
import { ThemeProvider } from '@/components/theme-provider';

// Components
import { AppShell } from '@/components/shell/AppShell';

// Pages
import Home from '@/pages/home';
import Projects from '@/pages/projects';
import ProjectDetail from '@/pages/project-detail/index';
import Review from '@/pages/review';
import Scheduling from '@/pages/scheduling';
import ImpactAnalysis from '@/pages/impact';
import Workflows from '@/pages/workflows';
import WorkflowEditor from '@/pages/workflow-editor';
import WorkflowRun from '@/pages/workflow-run';
import Marketplace from '@/pages/marketplace';
import PluginDetail from '@/pages/plugin-detail';
import SchemaBuilder from '@/pages/schema-builder';
import AuditLog from '@/pages/audit';
import Settings from '@/pages/settings';

const queryClient = new QueryClient();

function Router() {
  return (
    <AppShell>
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/projects" component={Projects} />
        <Route path="/projects/:id" component={ProjectDetail} />
        <Route path="/review" component={Review} />
        <Route path="/scheduling" component={Scheduling} />
        <Route path="/impact" component={ImpactAnalysis} />
        <Route path="/workflows" component={Workflows} />
        {/* Run must come before id to prevent route conflict */}
        <Route path="/workflows/run/:id" component={WorkflowRun} />
        <Route path="/workflows/:id" component={WorkflowEditor} />
        <Route path="/marketplace" component={Marketplace} />
        <Route path="/marketplace/:id" component={PluginDetail} />
        <Route path="/schema" component={SchemaBuilder} />
        <Route path="/audit" component={AuditLog} />
        <Route path="/settings" component={Settings} />
        <Route component={NotFound} />
      </Switch>
    </AppShell>
  );
}

function App() {
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
            <Router />
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App;
