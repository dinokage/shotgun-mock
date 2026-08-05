import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Route, Switch, Router as WouterRouter } from 'wouter';
import { ThemeProvider } from '@/components/theme-provider';

// Components
import { AppShell } from '@/components/shell/AppShell';

// Pages
import Home from '@/pages/home';
import Projects from '@/pages/projects';
import Tasks from '@/pages/tasks';
import ProjectDetail from '@/pages/project-detail/index';
import Review from '@/pages/review';
import Scheduling from '@/pages/scheduling';
import ImpactAnalysis from '@/pages/impact';
import WorkflowEditor from '@/pages/workflow-editor';
import Marketplace from '@/pages/marketplace';
import Settings from '@/pages/settings';
import Assets from '@/pages/assets';
import AssetDetail from '@/pages/asset-detail';
import Shots from '@/pages/shots';
import ShotDetail from '@/pages/shot-detail';
import Analytics from '@/pages/analytics';
import Publishing from '@/pages/publishing';
import AIWorkspace from '@/pages/ai-workspace';
import Profile from '@/pages/profile';
import SchemaBuilder from '@/pages/schema';
import Audit from '@/pages/audit';
import NotFound from '@/pages/not-found';
import Delivery from '@/pages/delivery';

const queryClient = new QueryClient();

function Router() {
  return (
    <AppShell>
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/projects" component={Projects} />
        <Route path="/projects/:id" component={ProjectDetail} />
        <Route path="/assets" component={Assets} />
        <Route path="/assets/:id" component={AssetDetail} />
        <Route path="/shots" component={Shots} />
        <Route path="/shots/:id" component={ShotDetail} />
        <Route path="/tasks" component={Tasks} />
        <Route path="/review" component={Review} />
        <Route path="/scheduling" component={Scheduling} />
        <Route path="/impact" component={ImpactAnalysis} />
        <Route path="/workflows" component={WorkflowEditor} />
        <Route path="/publishing" component={Publishing} />
        <Route path="/analytics" component={Analytics} />
        <Route path="/ai-workspace" component={AIWorkspace} />
        <Route path="/marketplace" component={Marketplace} />
        <Route path="/profile" component={Profile} />
        <Route path="/schema" component={SchemaBuilder} />
        <Route path="/audit" component={Audit} />
        <Route path="/settings" component={Settings} />
        <Route path="/delivery" component={Delivery} />
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
