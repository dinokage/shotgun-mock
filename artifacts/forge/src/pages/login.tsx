import { useState } from "react";
import { useLocation } from "wouter";
import { useAuthStore } from "@/store/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Lock, Building2 } from "lucide-react";

export const ROLE_LANDING_ROUTE: Record<string, string> = {
  admin: "/",
  lead: "/production",
  artist: "/tasks",
  // client-review.tsx is the one route a signed-in client account can reach
  // (registered outside AuthGuard/RoleRouteGuard entirely, see App.tsx) --
  // without this entry a client fell through to "/", which RoleRouteGuard
  // immediately bounces back to "/login" with no explanation, stranding an
  // otherwise-successful login.
  client: "/client-review",
};

export default function Login() {
  const { login, loginLdap, currentUser } = useAuthStore();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // "Company Login" posts to the LDAP/AD route (POST /auth/login/ldap) with
  // the person's own Windows/PC username and password -- same directory
  // account, no separate Forge password to remember or admin to provision
  // one for. Kept as a fully separate form/mode (not merged into the one
  // above) since the two routes take different field names (username vs
  // email) and fail for different reasons.
  const [mode, setMode] = useState<"forge" | "ldap">("forge");
  const [ldapUsername, setLdapUsername] = useState("");
  const [ldapPassword, setLdapPassword] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    const success = await login(email, password);
    if (success) {
      const role = useAuthStore.getState().currentUser?.role;
      setLocation(ROLE_LANDING_ROUTE[role ?? ""] ?? "/");
    } else {
      toast({
        title: "Login Failed",
        description: "Invalid Employee ID/Email or Password.",
        variant: "destructive",
      });
      setIsLoading(false);
    }
  };

  const handleLdapSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    const success = await loginLdap(ldapUsername, ldapPassword);
    if (success) {
      const role = useAuthStore.getState().currentUser?.role;
      setLocation(ROLE_LANDING_ROUTE[role ?? ""] ?? "/");
    } else {
      toast({
        title: "Login Failed",
        description:
          useAuthStore.getState().loginError ??
          "Invalid company username or password.",
        variant: "destructive",
      });
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-primary/5 rounded-full blur-3xl animate-pulse" />
        <div
          className="absolute bottom-0 right-1/4 w-96 h-96 bg-purple-500/5 rounded-full blur-3xl animate-pulse"
          style={{ animationDelay: "1s" }}
        />
      </div>
      <div className="w-full max-w-sm relative z-10 flex flex-col items-center">
        <div className="text-center mb-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="inline-flex items-center gap-3 mb-4">
            <div className="w-16 h-16 bg-primary rounded-xl flex items-center justify-center shadow-lg shadow-primary/20">
              <div className="w-8 h-8 bg-card rounded-md" />
            </div>
            <span className="text-5xl font-bold tracking-tight">Forge</span>
          </div>
          <p className="text-muted-foreground text-lg">Employee Sign In</p>
        </div>
        <Card className="bg-card/50 backdrop-blur-sm border-border/50 w-full">
          <CardContent className="pt-6">
            <div className="flex rounded-lg border border-border/50 p-1 mb-5 bg-background/30">
              <button
                type="button"
                onClick={() => setMode("forge")}
                className={`flex-1 rounded-md py-1.5 text-sm font-medium transition-colors ${
                  mode === "forge"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Forge Account
              </button>
              <button
                type="button"
                onClick={() => setMode("ldap")}
                className={`flex-1 rounded-md py-1.5 text-sm font-medium transition-colors ${
                  mode === "ldap"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Company Login
              </button>
            </div>
            {mode === "forge" ? (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Employee ID or Email</Label>
                  <Input
                    id="email"
                    type="text"
                    placeholder="employee@company.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="bg-background/50"
                    autoFocus
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="bg-background/50"
                  />
                </div>
                <Button
                  type="submit"
                  className="w-full gap-2 mt-2"
                  disabled={isLoading}
                >
                  <Lock className="w-4 h-4" />{" "}
                  {isLoading ? "Signing in..." : "Sign In"}
                </Button>
              </form>
            ) : (
              <form onSubmit={handleLdapSubmit} className="space-y-4">
                <p className="text-xs text-muted-foreground -mt-1">
                  Sign in with the same username and password you use to log
                  into your work PC.
                </p>
                <div className="space-y-2">
                  <Label htmlFor="ldap-username">Company Username</Label>
                  <Input
                    id="ldap-username"
                    type="text"
                    placeholder="jsmith"
                    value={ldapUsername}
                    onChange={(e) => setLdapUsername(e.target.value)}
                    className="bg-background/50"
                    autoFocus
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ldap-password">Password</Label>
                  <Input
                    id="ldap-password"
                    type="password"
                    placeholder="••••••••"
                    value={ldapPassword}
                    onChange={(e) => setLdapPassword(e.target.value)}
                    className="bg-background/50"
                  />
                </div>
                <Button
                  type="submit"
                  className="w-full gap-2 mt-2"
                  disabled={isLoading}
                >
                  <Building2 className="w-4 h-4" />{" "}
                  {isLoading ? "Signing in..." : "Sign In"}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
        <p className="mt-6 text-center text-sm text-muted-foreground">
          <a href="/forgot-password" className="text-primary hover:underline">
            Forgot your password?
          </a>
        </p>
        <p className="mt-2 text-center text-sm text-muted-foreground">
          Reviewing as a client?{" "}
          <a href="/client-review" className="text-primary hover:underline">
            Use your access link instead
          </a>
        </p>
      </div>
    </div>
  );
}
