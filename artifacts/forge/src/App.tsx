import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Route, Switch, Router as WouterRouter, useLocation } from 'wouter';
import { ThemeProvider } from '@/components/theme-provider';
import { useEffect } from 'react';
import { useAuthStore } from '@/store/auth';

// Components
import { AppShell } from '@/components/shell/AppShell';

// Pages
import Login from '@/pages/login';
import Home from '@/pages/home';
import Projects from '@/pages/projects';
import Tasks from '@/pages/tasks';
import ProjectDetail from '@/pages/project-detail/index';
import Review from '@/pages/review';
import Scheduling from '@/pages/scheduling';
import WorkflowEditor from '@/pages/workflow-editor';
import Marketplace from '@/pages/marketplace';
import Settings from '@/pages/settings';
import Assets from '@/pages/assets';
import AssetDetail from '@/pages/asset-detail';
import Shots from '@/pages/shots';
import ShotDetail from '@/pages/shot-detail';
import Analytics from '@/pages/analytics';
import Publishing from '@/pages/publishing';
import Profile from '@/pages/profile';
import ProductionDashboard from '@/pages/production';
import Timesheets from '@/pages/timesheets';
import ClientReview from '@/pages/client-review';

import Audit from '@/pages/audit';
import NotFound from '@/pages/not-found';
import Delivery from '@/pages/delivery';
import Departments from '@/pages/departments';
import DepartmentDetail from '@/pages/department-detail';
import People from '@/pages/people';
import DailyStandup from '@/pages/daily-standup';
import Chat from '@/pages/chat';
import TrackingGrid from '@/pages/tracking';
import IntegrationsHub from '@/pages/integrations';
import Notifications from '@/pages/notifications';
import FinancialDashboard from '@/pages/financials';

const queryClient = new QueryClient();

// Auth Guard component
function AuthGuard({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuthStore();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!isAuthenticated) {
      setLocation('/login');
    }
  }, [isAuthenticated, setLocation]);

  if (!isAuthenticated) return null;
  return <>{children}</>;
}

const LEADERSHIP_ROLES = ['vfx_producer', 'production_manager', 'coordinator', 'supervisor', 'lead'];

function LeadershipGuard({ children }: { children: React.ReactNode }) {
  const { currentUser } = useAuthStore();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (currentUser && !LEADERSHIP_ROLES.includes(currentUser.role)) {
      setLocation('/');
    }
  }, [currentUser, setLocation]);

  if (!currentUser || !LEADERSHIP_ROLES.includes(currentUser.role)) return null;
  return <>{children}</>;
}

function Router() {
  return (
    <Switch>
      <Route path="/login" component={Login} />
      <Route path="/client-review" component={ClientReview} />
      
      {/* Protected Routes wrapped in AppShell */}
      <Route path="/.*">
        <AuthGuard>
          <AppShell>
            <Switch>
              <Route path="/" component={Home} />
              <Route path="/projects">
                <LeadershipGuard><Projects /></LeadershipGuard>
              </Route>
              <Route path="/projects/:id">
                <LeadershipGuard><ProjectDetail /></LeadershipGuard>
              </Route>
              <Route path="/assets" component={Assets} />
              <Route path="/assets/:id" component={AssetDetail} />
              <Route path="/shots" component={Shots} />
              <Route path="/shots/:id" component={ShotDetail} />
              <Route path="/tasks" component={Tasks} />
              <Route path="/departments">
                <LeadershipGuard><Departments /></LeadershipGuard>
              </Route>
              <Route path="/departments/:id">
                <LeadershipGuard><DepartmentDetail /></LeadershipGuard>
              </Route>
              <Route path="/people" component={People} />
              <Route path="/people/:id" component={Profile} />
              <Route path="/daily-standup" component={DailyStandup} />
              <Route path="/review" component={Review} />
              <Route path="/scheduling">
                <LeadershipGuard><Scheduling /></LeadershipGuard>
              </Route>
              <Route path="/marketplace">
                <LeadershipGuard><Marketplace /></LeadershipGuard>
              </Route>
              <Route path="/integrations">
                <LeadershipGuard><IntegrationsHub /></LeadershipGuard>
              </Route>
              <Route path="/workflows">
                <LeadershipGuard><WorkflowEditor /></LeadershipGuard>
              </Route>
              <Route path="/publishing" component={Publishing} />
              <Route path="/analytics">
                <LeadershipGuard><Analytics /></LeadershipGuard>
              </Route>
              <Route path="/profile" component={Profile} />
              
              <Route path="/production">
                <LeadershipGuard><ProductionDashboard /></LeadershipGuard>
              </Route>
              <Route path="/financials">
                <LeadershipGuard><FinancialDashboard /></LeadershipGuard>
              </Route>
              <Route path="/audit">
                <LeadershipGuard><Audit /></LeadershipGuard>
              </Route>
              <Route path="/settings" component={Settings} />
              <Route path="/delivery" component={Delivery} />
              <Route path="/chat" component={Chat} />
              <Route path="/tracking" component={TrackingGrid} />
              <Route path="/review" component={Review} />
              <Route path="/timesheets" component={Timesheets} />
              <Route path="/daily-standup" component={DailyStandup} />
              <Route path="/notifications" component={Notifications} />
              <Route component={NotFound} />
            </Switch>
          </AppShell>
        </AuthGuard>
      </Route>
    </Switch>
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
