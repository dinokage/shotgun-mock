import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Route, Switch, Router as WouterRouter, useLocation } from "wouter";
import { ThemeProvider } from "@/components/theme-provider";
import { useEffect, useRef } from "react";
import { useAuthStore } from "@/store/auth";
import { useToast } from "@/hooks/use-toast";
import { useIsLeadership } from "@/hooks/use-capability";

// Components
import { AppShell } from "@/components/shell/AppShell";

// Pages
import Login from "@/pages/login";
import Home from "@/pages/home";
import Projects from "@/pages/projects";
import Tasks from "@/pages/tasks";
import ProjectDetail from "@/pages/project-detail/index";
import Review from "@/pages/review";
import Scheduling from "@/pages/scheduling";
import WorkflowEditor from "@/pages/workflow-editor";
import Workflows from "@/pages/workflows";
import WorkflowRun from "@/pages/workflow-run";
import Marketplace from "@/pages/marketplace";
import PluginDetail from "@/pages/plugin-detail";
import Settings from "@/pages/settings";
import Assets from "@/pages/assets";
import AssetDetail from "@/pages/asset-detail";
import Shots from "@/pages/shots";
import ShotDetail from "@/pages/shot-detail";
import Analytics from "@/pages/analytics";
import Publishing from "@/pages/publishing";
import Profile from "@/pages/profile";
import ProductionDashboard from "@/pages/production";
import Timesheets from "@/pages/timesheets";
import ClientReview from "@/pages/client-review";

import Audit from "@/pages/audit";
import NotFound from "@/pages/not-found";
import Deliveries from "@/pages/deliveries";
import DeliveryDetail from "@/pages/delivery-detail";
import Departments from "@/pages/departments";
import DepartmentDetail from "@/pages/department-detail";
import People from "@/pages/people";
import DailyStandup from "@/pages/daily-standup";
import Chat from "@/pages/chat";
import TrackingGrid from "@/pages/tracking";
import IntegrationsHub from "@/pages/integrations";
import Notifications from "@/pages/notifications";
import FinancialDashboard from "@/pages/financials";
import SchemaBuilder from "@/pages/schema-builder";

import { queryClient } from "@/lib/queryClient";

// Auth Guard component
function AuthGuard({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isInitializing } = useAuthStore();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!isInitializing && !isAuthenticated) {
      setLocation("/login");
    }
  }, [isAuthenticated, isInitializing, setLocation]);

  if (isInitializing || !isAuthenticated) return null;
  return <>{children}</>;
}

function LeadershipGuard({ children }: { children: React.ReactNode }) {
  const { currentUser } = useAuthStore();
  const isLeadership = useIsLeadership();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const hasWarnedRef = useRef(false);

  useEffect(() => {
    if (currentUser && !isLeadership) {
      if (!hasWarnedRef.current) {
        hasWarnedRef.current = true;
        toast({
          description: "You don't have access to that page.",
          variant: "destructive",
        });
      }
      setLocation("/");
    }
  }, [currentUser, isLeadership, setLocation, toast]);

  if (!currentUser || !isLeadership) return null;
  return <>{children}</>;
}

function Router() {
  return (
    <Switch>
      <Route path="/login/:role?" component={Login} />
      <Route path="/client-review" component={ClientReview} />
      {/* Public, outside AuthGuard — external recipients reach a specific
          delivery via its access code, with no Forge login at all. */}
      <Route path="/delivery/:id" component={DeliveryDetail} />

      {/* Protected Routes wrapped in AppShell */}
      <Route path="/.*">
        <AuthGuard>
          <AppShell>
            <Switch>
              <Route path="/" component={Home} />
              <Route path="/projects">
                <LeadershipGuard>
                  <Projects />
                </LeadershipGuard>
              </Route>
              <Route path="/projects/:id">
                <LeadershipGuard>
                  <ProjectDetail />
                </LeadershipGuard>
              </Route>
              <Route path="/assets" component={Assets} />
              <Route path="/assets/:id" component={AssetDetail} />
              <Route path="/shots" component={Shots} />
              <Route path="/shots/:id" component={ShotDetail} />
              <Route path="/tasks" component={Tasks} />
              <Route path="/departments">
                <LeadershipGuard>
                  <Departments />
                </LeadershipGuard>
              </Route>
              <Route path="/departments/:id">
                <LeadershipGuard>
                  <DepartmentDetail />
                </LeadershipGuard>
              </Route>
              <Route path="/people" component={People} />
              <Route path="/people/:id" component={Profile} />
              <Route path="/daily-standup" component={DailyStandup} />
              <Route path="/review" component={Review} />
              <Route path="/scheduling">
                <LeadershipGuard>
                  <Scheduling />
                </LeadershipGuard>
              </Route>
              <Route path="/marketplace">
                <LeadershipGuard>
                  <Marketplace />
                </LeadershipGuard>
              </Route>
              <Route path="/marketplace/:id">
                <LeadershipGuard>
                  <PluginDetail />
                </LeadershipGuard>
              </Route>
              <Route path="/integrations">
                <LeadershipGuard>
                  <IntegrationsHub />
                </LeadershipGuard>
              </Route>
              <Route path="/workflows">
                <LeadershipGuard>
                  <Workflows />
                </LeadershipGuard>
              </Route>
              <Route path="/workflows/new">
                <LeadershipGuard>
                  <WorkflowEditor />
                </LeadershipGuard>
              </Route>
              <Route path="/workflows/run/:id">
                <LeadershipGuard>
                  <WorkflowRun />
                </LeadershipGuard>
              </Route>
              <Route path="/workflows/:id">
                <LeadershipGuard>
                  <WorkflowEditor />
                </LeadershipGuard>
              </Route>
              <Route path="/schema-builder">
                <LeadershipGuard>
                  <SchemaBuilder />
                </LeadershipGuard>
              </Route>
              <Route path="/publishing" component={Publishing} />
              <Route path="/analytics">
                <LeadershipGuard>
                  <Analytics />
                </LeadershipGuard>
              </Route>
              <Route path="/profile" component={Profile} />

              <Route path="/production">
                <LeadershipGuard>
                  <ProductionDashboard />
                </LeadershipGuard>
              </Route>
              <Route path="/financials">
                <LeadershipGuard>
                  <FinancialDashboard />
                </LeadershipGuard>
              </Route>
              <Route path="/audit">
                <LeadershipGuard>
                  <Audit />
                </LeadershipGuard>
              </Route>
              <Route path="/settings">
                <LeadershipGuard>
                  <Settings />
                </LeadershipGuard>
              </Route>
              <Route path="/delivery">
                <LeadershipGuard>
                  <Deliveries />
                </LeadershipGuard>
              </Route>
              <Route path="/chat" component={Chat} />
              <Route path="/tracking" component={TrackingGrid} />
              <Route path="/timesheets" component={Timesheets} />
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
  const { fetchMe } = useAuthStore();

  useEffect(() => {
    fetchMe();
  }, [fetchMe]);

  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <Router />
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App;
