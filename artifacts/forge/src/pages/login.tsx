import { useState, useMemo } from 'react';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { useLocation } from 'wouter';
import { useAuthStore } from '@/store/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { USERS, DEPARTMENTS, ROLE_LABELS } from '@/data/mockData';
import { AlertCircle, Eye, EyeOff, ChevronDown } from 'lucide-react';

export default function Login() {
  const { login, loginError, clearError } = useAuthStore();
  const [empId, setEmpId] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showQuickPick, setShowQuickPick] = useState(false);
  const [, setLocation] = useLocation();

  const matchedUser = useMemo(() => {
    if (empId.length < 3) return null;
    const searchId = empId.toUpperCase().startsWith('EMP') ? empId : `EMP${empId}`;
    return USERS.find(u => u.empId.toLowerCase() === searchId.toLowerCase());
  }, [empId]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!matchedUser) return;
    
    setIsLoading(true);
    clearError();

    setTimeout(() => {
      const success = login(matchedUser.empId, password);
      setIsLoading(false);
      if (success) {
        setLocation('/');
      }
    }, 600);
  };

  const quickLogin = (userId: string) => {
    const user = USERS.find(u => u.id === userId);
    if (user) {
      setEmpId(user.empId);
      setPassword(user.password);
      setTimeout(() => {
        const success = login(user.empId, user.password);
        if (success) {
          setLocation('/');
        }
      }, 300);
    }
  };

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

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4 relative overflow-hidden">
      {/* Animated background */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-primary/5 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-purple-500/5 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
        <div className="absolute top-1/3 right-1/3 w-64 h-64 bg-cyan-500/5 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '2s' }} />
      </div>

      <div className="w-full max-w-md relative z-10">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-3 mb-4">
            <div className="w-12 h-12 bg-primary rounded-xl flex items-center justify-center shadow-lg shadow-primary/20">
              <div className="w-6 h-6 bg-card rounded-md" />
            </div>
            <span className="text-4xl font-bold tracking-tight">Forge</span>
          </div>
          <p className="text-muted-foreground text-sm">VFX Production Management Platform</p>
        </div>

        {/* Login Card */}
        <Card className="border-border/50 shadow-2xl backdrop-blur-sm bg-card/95">
          <CardContent className="p-8">
            <div className="mb-6">
              <h2 className="text-xl font-bold">Studio Access</h2>
              <p className="text-sm text-muted-foreground mt-1">Enter your Employee ID to continue.</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="empId" className="text-sm font-medium text-muted-foreground">Employee ID</Label>
                <Input
                  id="empId"
                  placeholder="e.g. EMP-014"
                  value={empId}
                  onChange={(e) => { 
                    setEmpId(e.target.value); 
                    clearError(); 
                  }}
                  className="h-11 bg-background border-border focus:border-primary uppercase"
                  autoFocus
                  autoComplete="username"
                />
              </div>

              {/* Dynamic User Profile Reveal */}
              {matchedUser ? (
                <div className="animate-in fade-in slide-in-from-top-2 duration-300">
                  <div className="flex items-center gap-4 p-4 rounded-xl border border-primary/20 bg-primary/5 mb-4">
                    <img 
                      src={matchedUser.avatar} 
                      alt={matchedUser.name} 
                      className="w-12 h-12 rounded-full object-cover border-2 border-primary/20 shadow-sm"
                    />
                    <div>
                      <div className="font-bold text-foreground">{matchedUser.name}</div>
                      <div className="text-xs font-medium text-primary flex flex-col mt-0.5">
                        <span>{DEPARTMENTS.find(d => d.id === matchedUser.departmentId)?.name || 'Studio'} Dept.</span>
                        <span className="text-muted-foreground">{ROLE_LABELS[matchedUser.role]}</span>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="password" className="text-sm font-medium text-muted-foreground">Secure Password</Label>
                    <div className="relative">
                      <Input
                        id="password"
                        type={showPassword ? 'text' : 'password'}
                        placeholder="Enter password"
                        value={password}
                        onChange={(e) => { setPassword(e.target.value); clearError(); }}
                        className="h-11 bg-background border-border focus:border-primary pr-10"
                        autoComplete="current-password"
                      />
                      <button
                        type="button"
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                        onClick={() => setShowPassword(!showPassword)}
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-xs text-muted-foreground text-center py-2 animate-in fade-in">
                  {empId.length > 2 ? 'Locating employee record...' : 'Awaiting ID...'}
                </div>
              )}

              {loginError && (
                <div className="flex items-center gap-2 text-sm text-red-500 bg-red-500/10 border border-red-500/20 rounded-lg p-3 animate-in slide-in-from-top-2 fade-in duration-200">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  {loginError}
                </div>
              )}

              <Button
                type="submit"
                className="w-full h-11 font-semibold text-sm transition-all"
                disabled={isLoading || !matchedUser || !password}
              >
                {isLoading ? (
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                    Authenticating...
                  </div>
                ) : (
                  'Authorize Access'
                )}
              </Button>
            </form>

            {/* Quick Login */}
            <div className="mt-6 pt-6 border-t border-border">
              <button
                className="w-full flex items-center justify-between text-xs font-semibold text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors mb-3"
                onClick={() => setShowQuickPick(!showQuickPick)}
              >
                Demo — Quick Login Directory
                <ChevronDown className={`w-3 h-3 transition-transform ${showQuickPick ? 'rotate-180' : ''}`} />
              </button>

              {showQuickPick && (
                <div className="space-y-1.5 animate-in slide-in-from-top-2 fade-in duration-200 max-h-64 overflow-y-auto pr-1 custom-scrollbar">
                  <Accordion type="single" collapsible className="w-full space-y-1 text-sm">
                    {Object.entries(groupedUsers).map(([groupName, users]) => (
                      <AccordionItem key={groupName} value={groupName} className="border border-border/50 rounded-lg bg-muted/10 px-3">
                        <AccordionTrigger className="py-2.5 text-xs font-semibold hover:no-underline">{groupName}</AccordionTrigger>
                        <AccordionContent className="space-y-1.5 pb-2">
                          {users.map(user => {
                            if (!user) return null;
                            const dept = DEPARTMENTS.find(d => d.id === user.departmentId);
                            return (
                              <button
                                key={user.id}
                                onClick={() => quickLogin(user.id)}
                                className="w-full flex items-center gap-3 px-3 py-2 rounded-md border border-border/50 bg-background/50 hover:bg-muted/80 hover:border-primary/50 transition-all text-left group"
                              >
                                <img src={user.avatar} alt={user.name} className="w-7 h-7 rounded-full object-cover border border-border" />
                                <div className="flex-1 min-w-0">
                                  <div className="text-xs font-medium truncate group-hover:text-primary transition-colors">{user.name}</div>
                                  <div className="text-[10px] text-muted-foreground truncate">{user.title}</div>
                                </div>
                                <div className="text-[10px] font-mono font-medium text-muted-foreground">{user.empId}</div>
                              </button>
                            );
                          })}
                        </AccordionContent>
                      </AccordionItem>
                    ))}
                  </Accordion>
                  <p className="text-[10px] text-muted-foreground text-center mt-3 mb-1 italic">
                    Password for all demo accounts: <code className="bg-muted px-1 py-0.5 rounded">forge123</code>
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <p className="text-center text-[10px] text-muted-foreground mt-6">
          © 2025 Forge VFX · Production Management Platform · v3.0
        </p>
      </div>
    </div>
  );
}
