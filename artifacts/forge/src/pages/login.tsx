import { useState, useMemo } from 'react';
import { useLocation } from 'wouter';
import { useAuthStore } from '@/store/auth';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { USERS, DEPARTMENTS } from '@/data/mockData';
import { MonitorPlay, Briefcase, Video, Crown, ChevronDown, Lock } from 'lucide-react';

export default function Login() {
  const { login } = useAuthStore();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [showQuickPick, setShowQuickPick] = useState(false);
  
  const [empId, setEmpId] = useState('');
  const [password, setPassword] = useState('');

  // Group users by department (Supervisor, Lead, Artist)
  const groupedUsers = useMemo(() => {
    const groups: Record<string, typeof USERS> = {};
    
    // Add Leadership / Studio wide group first
    groups['Studio Leadership'] = [
      USERS.find(u => u.role === 'vfx_producer'),
      USERS.find(u => u.role === 'production_manager'),
    ].filter(Boolean) as typeof USERS;

    // Add 3 users for each department (Supervisor, Lead, Artist)
    DEPARTMENTS.forEach(dept => {
      const deptUsers = USERS.filter(u => u.departmentId === dept.id);
      if (deptUsers.length === 0) return;
      
      const supervisor = deptUsers.find(u => u.role === 'supervisor');
      const lead = deptUsers.find(u => u.role === 'lead');
      const artist = deptUsers.find(u => u.role === 'artist' || u.role === 'senior_artist');
      
      groups[dept.name] = [supervisor, lead, artist].filter(Boolean) as typeof USERS;
    });

    return groups;
  }, []);

  const quickLogin = (role: string, customUserId?: string) => {
    setIsLoading(true);
    let user;
    if (customUserId) {
      user = USERS.find(u => u.id === customUserId);
    } else if (role === 'client') {
      user = USERS.find(u => u.name === 'External Client');
    } else if (role === 'artist') {
      user = USERS.find(u => u.role === 'artist');
    } else if (role === 'lead') {
      user = USERS.find(u => u.role === 'lead');
    } else if (role === 'manager') {
      user = USERS.find(u => u.role === 'vfx_producer' || u.role === 'production_manager');
    }

    if (user) {
      setTimeout(() => {
        login(user.empId, user.password);
        if (role === 'client') {
          setLocation('/client-review');
        } else if (role === 'manager') {
          setLocation('/production');
        } else if (role === 'artist') {
          setLocation('/tasks');
        } else {
          setLocation('/');
        }
      }, 600);
    } else {
      setIsLoading(false);
    }
  };

  const handleManualLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    const user = USERS.find(u => u.empId === empId && u.password === password);
    
    setTimeout(() => {
      if (user) {
        login(empId, password);
        if (user.role === 'vfx_producer' || user.role === 'production_manager') {
          setLocation('/production');
        } else if (user.role === 'artist' || user.role === 'senior_artist') {
          setLocation('/tasks');
        } else {
          setLocation('/');
        }
      } else {
        toast({ title: 'Login Failed', description: 'Invalid Employee ID or Password.', variant: 'destructive' });
      }
      setIsLoading(false);
    }, 600);
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4 relative overflow-hidden">
      {/* Animated background */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-primary/5 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-purple-500/5 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
      </div>

      <div className="w-full max-w-4xl relative z-10 flex flex-col items-center">
        {/* Logo */}
        <div className="text-center mb-12 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="inline-flex items-center gap-3 mb-4">
            <div className="w-16 h-16 bg-primary rounded-xl flex items-center justify-center shadow-lg shadow-primary/20">
              <div className="w-8 h-8 bg-card rounded-md" />
            </div>
            <span className="text-5xl font-bold tracking-tight">Forge</span>
          </div>
          <p className="text-muted-foreground text-lg">Select Your Portal</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 w-full animate-in fade-in slide-in-from-bottom-8 duration-700">
          
          {/* Client Portal */}
          <Card className="hover:border-primary/50 hover:shadow-lg transition-all cursor-pointer group bg-card/80 backdrop-blur-sm" onClick={() => quickLogin('client')}>
            <CardContent className="p-8 flex flex-col items-center text-center gap-4">
              <div className="w-16 h-16 rounded-full bg-emerald-500/10 flex items-center justify-center group-hover:scale-110 transition-transform">
                <MonitorPlay className="w-8 h-8 text-emerald-500" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-foreground group-hover:text-emerald-500 transition-colors">Client Portal</h3>
                <p className="text-xs text-muted-foreground mt-2">External review & approvals.</p>
              </div>
            </CardContent>
          </Card>

          {/* Artist Portal */}
          <Card className="hover:border-primary/50 hover:shadow-lg transition-all cursor-pointer group bg-card/80 backdrop-blur-sm" onClick={() => quickLogin('artist')}>
            <CardContent className="p-8 flex flex-col items-center text-center gap-4">
              <div className="w-16 h-16 rounded-full bg-blue-500/10 flex items-center justify-center group-hover:scale-110 transition-transform">
                <Video className="w-8 h-8 text-blue-500" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-foreground group-hover:text-blue-500 transition-colors">Artist Portal</h3>
                <p className="text-xs text-muted-foreground mt-2">Task execution & time tracking.</p>
              </div>
            </CardContent>
          </Card>

          {/* Lead Portal */}
          <Card className="hover:border-primary/50 hover:shadow-lg transition-all cursor-pointer group bg-card/80 backdrop-blur-sm" onClick={() => quickLogin('lead')}>
            <CardContent className="p-8 flex flex-col items-center text-center gap-4">
              <div className="w-16 h-16 rounded-full bg-purple-500/10 flex items-center justify-center group-hover:scale-110 transition-transform">
                <Crown className="w-8 h-8 text-purple-500" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-foreground group-hover:text-purple-500 transition-colors">Lead Portal</h3>
                <p className="text-xs text-muted-foreground mt-2">Department oversight & QC.</p>
              </div>
            </CardContent>
          </Card>

          {/* Production Portal */}
          <Card className="hover:border-primary/50 hover:shadow-lg transition-all cursor-pointer group bg-card/80 backdrop-blur-sm" onClick={() => quickLogin('manager')}>
            <CardContent className="p-8 flex flex-col items-center text-center gap-4">
              <div className="w-16 h-16 rounded-full bg-orange-500/10 flex items-center justify-center group-hover:scale-110 transition-transform">
                <Briefcase className="w-8 h-8 text-orange-500" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-foreground group-hover:text-orange-500 transition-colors">Production</h3>
                <p className="text-xs text-muted-foreground mt-2">Global pipeline & schedules.</p>
              </div>
            </CardContent>
          </Card>

        </div>

        {isLoading && (
          <div className="mt-8 text-sm text-muted-foreground animate-pulse flex items-center gap-2">
            <div className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
            Authenticating...
          </div>
        )}

        {/* Traditional Login Form */}
        <div className="mt-12 w-full max-w-sm">
          <Card className="bg-card/50 backdrop-blur-sm border-border/50">
            <CardContent className="pt-6">
              <form onSubmit={handleManualLogin} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="empId">Employee ID</Label>
                  <Input 
                    id="empId" 
                    placeholder="e.g. EMP001" 
                    value={empId}
                    onChange={e => setEmpId(e.target.value)}
                    className="bg-background/50"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input 
                    id="password" 
                    type="password"
                    placeholder="••••••••" 
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    className="bg-background/50"
                  />
                </div>
                <Button type="submit" className="w-full gap-2 mt-2">
                  <Lock className="w-4 h-4" /> Secure Login
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>

        {/* Quick Login Directory */}
        <div className="mt-16 w-full max-w-2xl bg-card/50 backdrop-blur-md border border-border/50 rounded-xl p-6 shadow-xl animate-in fade-in slide-in-from-bottom-12 duration-1000">
          <button
            className="w-full flex items-center justify-between text-xs font-semibold text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors mb-3"
            onClick={() => setShowQuickPick(!showQuickPick)}
          >
            Demo — Full Studio Directory
            <ChevronDown className={`w-4 h-4 transition-transform ${showQuickPick ? 'rotate-180' : ''}`} />
          </button>

          {showQuickPick && (
            <div className="space-y-1.5 animate-in slide-in-from-top-2 fade-in duration-200 mt-4 max-h-96 overflow-y-auto pr-2 custom-scrollbar">
              <Accordion type="single" collapsible className="w-full space-y-2 text-sm">
                {Object.entries(groupedUsers).map(([groupName, users]) => (
                  <AccordionItem key={groupName} value={groupName} className="border border-border/50 rounded-lg bg-muted/20 px-4">
                    <AccordionTrigger className="py-3 text-sm font-semibold hover:no-underline">{groupName}</AccordionTrigger>
                    <AccordionContent className="space-y-2 pb-3">
                      {users.map(user => {
                        if (!user) return null;
                        const dept = DEPARTMENTS.find(d => d.id === user.departmentId);
                        return (
                          <button
                            key={user.id}
                            onClick={() => quickLogin('custom', user.id)}
                            className="w-full flex items-center gap-4 px-4 py-2.5 rounded-md border border-border/50 bg-background/50 hover:bg-muted/80 hover:border-primary/50 transition-all text-left group"
                          >
                            <img src={user.avatar} alt={user.name} className="w-8 h-8 rounded-full object-cover border border-border" />
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium truncate group-hover:text-primary transition-colors">{user.name}</div>
                              <div className="text-xs text-muted-foreground truncate">{user.title}</div>
                            </div>
                            <div className="text-xs font-mono font-medium text-muted-foreground">{user.empId}</div>
                          </button>
                        );
                      })}
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
