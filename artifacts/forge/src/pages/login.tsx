import { useState, useEffect } from 'react';
import { useLocation, useParams, Link } from 'wouter';
import { useAuthStore } from '@/store/auth';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { MonitorPlay, Briefcase, Video, Crown, Lock, Users, ArrowLeft } from 'lucide-react';

export default function Login() {
  const { login } = useAuthStore();
  const [, setLocation] = useLocation();
  const params = useParams<{ role?: string }>();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // Auto-fill form if a role is selected
  useEffect(() => {
    if (params?.role) {
      const roleToEmail: Record<string, string> = {
        admin: 'admin@nebula.co', // We should add an admin if needed
        producer: 'maya@nebula.co',
        manager: 'sarah@nebula.co',
        lead: 'david@nebula.co',
        artist: 'liam@nebula.co',
        client: 'client@nebula.co',
      };
      setEmail(roleToEmail[params.role] || params.role);
      setPassword('forge123'); // Auto-fill password for ease of use
    } else {
      setEmail('');
      setPassword('');
    }
  }, [params?.role]);

  const handleManualLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    const success = await login(email, password);
    if (success) {
      if (email.includes('client')) {
        setLocation('/client-review');
      } else if (email.includes('producer') || email.includes('manager')) {
        setLocation('/production');
      } else if (email.includes('artist')) {
        setLocation('/tasks');
      } else {
        setLocation('/');
      }
    } else {
      toast({ title: 'Login Failed', description: 'Invalid Email or Password.', variant: 'destructive' });
      setIsLoading(false);
    }
  };

  const portalCards = [
    { title: 'Admin', role: 'admin', icon: Crown, desc: 'System Administration', delay: '0' },
    { title: 'Producer', role: 'producer', icon: Briefcase, desc: 'Project Management', delay: '100' },
    { title: 'Manager', role: 'manager', icon: Users, desc: 'Team & Resource Planning', delay: '200' },
    { title: 'Lead', role: 'lead', icon: MonitorPlay, desc: 'Department Leadership', delay: '300' },
    { title: 'Artist', role: 'artist', icon: Video, desc: 'Creative Production', delay: '400' },
    { title: 'Client', role: 'client', icon: MonitorPlay, desc: 'External Review', delay: '500' },
  ];

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4 relative overflow-hidden">
      {/* Animated background */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-primary/5 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-purple-500/5 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
      </div>

      <div className="w-full max-w-4xl relative z-10 flex flex-col items-center">
        {/* Logo */}
        <div className="text-center mb-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="inline-flex items-center gap-3 mb-4">
            <div className="w-16 h-16 bg-primary rounded-xl flex items-center justify-center shadow-lg shadow-primary/20">
              <div className="w-8 h-8 bg-card rounded-md" />
            </div>
            <span className="text-5xl font-bold tracking-tight">Forge</span>
          </div>
          <p className="text-muted-foreground text-lg">
            {params?.role ? `Sign in as ${params.role.charAt(0).toUpperCase() + params.role.slice(1)}` : 'Select your workspace portal'}
          </p>
        </div>

        {isLoading && (
          <div className="mt-8 text-sm text-muted-foreground animate-pulse flex items-center gap-2">
            <div className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
            Authenticating...
          </div>
        )}

        {!params?.role ? (
          /* Role Selection Portals */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 w-full">
            {portalCards.map((portal) => (
              <Link key={portal.role} href={`/login/${portal.role}`}>
                <div 
                  className={`animate-in fade-in slide-in-from-bottom-8 duration-700 cursor-pointer group`}
                  style={{ animationDelay: `${portal.delay}ms`, animationFillMode: 'both' }}
                >
                  <Card className="bg-card/50 backdrop-blur-sm border-border/50 hover:bg-card/80 hover:border-primary/50 transition-all h-full">
                    <CardContent className="pt-6 flex flex-col items-center text-center gap-4">
                      <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary group-hover:scale-110 group-hover:bg-primary/20 transition-all">
                        <portal.icon className="w-6 h-6" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-lg">{portal.title} Portal</h3>
                        <p className="text-sm text-muted-foreground">{portal.desc}</p>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          /* Traditional Login Form for specific role */
          <div className="w-full max-w-sm animate-in fade-in slide-in-from-bottom-8 duration-700">
            <Card className="bg-card/50 backdrop-blur-sm border-border/50">
              <CardContent className="pt-6">
                <form onSubmit={handleManualLogin} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="email">Email or Emp ID</Label>
                    <Input 
                      id="email" 
                      type="text"
                      placeholder="e.g. admin or employee@company.com" 
                      value={email}
                      onChange={e => setEmail(e.target.value)}
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
                      autoFocus
                    />
                  </div>
                  <Button type="submit" className="w-full gap-2 mt-2" disabled={isLoading}>
                    <Lock className="w-4 h-4" /> Secure Login
                  </Button>
                </form>
              </CardContent>
            </Card>
            <div className="mt-6 text-center">
              <Link href="/login" className="text-sm text-muted-foreground hover:text-primary transition-colors flex items-center justify-center gap-2">
                <ArrowLeft className="w-4 h-4" /> Back to Portals
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
