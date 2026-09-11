import { useState, useEffect } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiClient, apiFetch } from "@/lib/apiClient";
import { roleLabel } from "@/data/mockData";
import { UserPlus } from "lucide-react";

interface RegistrationOptions {
  departments: { id: string; name: string }[];
  roles: string[];
}

export default function Register() {
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [requestedRole, setRequestedRole] = useState("artist");
  const [options, setOptions] = useState<RegistrationOptions>({
    departments: [],
    roles: [],
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [optionsError, setOptionsError] = useState<string | null>(null);

  // Department and role lists come from the server rather than being hardcoded
  // here, so a studio that renames a department does not have to rebuild the
  // client for new starters to pick it.
  useEffect(() => {
    apiFetch<RegistrationOptions>("/auth/registration-options")
      .then((next) => {
        setOptions(next);
        setOptionsError(null);
      })
      .catch((err: unknown) => {
        // A failure here must not block registration -- the two fields it
        // feeds are optional and the account is still created without them --
        // but it must not be invisible either. Swallowing it silently meant a
        // failed call simply deleted the department and role pickers from the
        // form, which reads as "this build doesn't have those fields" rather
        // than "the server didn't answer".
        setOptionsError(
          err instanceof Error ? err.message : "Couldn't reach the server.",
        );
      });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      toast({ title: "Passwords don't match", variant: "destructive" });
      return;
    }
    setIsSubmitting(true);
    try {
      await apiClient.post("/auth/register", {
        name,
        email,
        password,
        departmentId: departmentId || undefined,
        requestedRole,
      });
      // POST /auth/register answers identically whether or not the address
      // was already taken (it must not confirm who has an account here), so
      // this screen can't promise the account was created either -- it points
      // at sign-in and lets the login attempt be the source of truth.
      setSubmitted(true);
    } catch (err: any) {
      toast({
        title: "Couldn't create your account",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
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
          <p className="text-muted-foreground text-lg">Create Your Account</p>
        </div>
        <Card className="bg-card/50 backdrop-blur-sm border-border/50 w-full">
          <CardContent className="pt-6">
            {submitted ? (
              <div className="space-y-4 text-center">
                <p className="text-sm text-foreground/90">
                  Registration received. You can now sign in with your email and
                  password.
                </p>
                <p className="text-xs text-muted-foreground">
                  {requestedRole !== "artist"
                    ? `You asked to join as ${roleLabel(requestedRole)}. You will be working as an artist until an administrator approves that.`
                    : "You can start work straight away."}
                </p>
                <Link
                  href="/login"
                  className="inline-block text-sm text-primary hover:underline"
                >
                  Go to sign in
                </Link>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Your Name</Label>
                  <Input
                    id="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="bg-background/50"
                    autoFocus
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Work Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@company.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="bg-background/50"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="bg-background/50"
                    minLength={8}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">Confirm Password</Label>
                  <Input
                    id="confirmPassword"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="bg-background/50"
                    minLength={8}
                    required
                  />
                </div>

                {optionsError && (
                  <p className="text-[11px] text-amber-500 border border-amber-500/30 bg-amber-500/10 rounded-md px-3 py-2">
                    Couldn't load the department and role lists ({optionsError}).
                    You can still create your account — an administrator can set
                    both afterwards.
                  </p>
                )}

                {options.departments.length > 0 && (
                  <div className="space-y-2">
                    <Label htmlFor="department">Department</Label>
                    <Select value={departmentId} onValueChange={setDepartmentId}>
                      <SelectTrigger id="department" className="bg-background/50">
                        <SelectValue placeholder="Which department will you work in?" />
                      </SelectTrigger>
                      <SelectContent>
                        {options.departments.map((d) => (
                          <SelectItem key={d.id} value={d.id}>
                            {d.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-[11px] text-muted-foreground">
                      Your lead needs this to find you and assign you work.
                    </p>
                  </div>
                )}

                {options.roles.length > 0 && (
                  <div className="space-y-2">
                    <Label htmlFor="role">Your role</Label>
                    <Select value={requestedRole} onValueChange={setRequestedRole}>
                      <SelectTrigger id="role" className="bg-background/50">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {options.roles.map((r) => (
                          <SelectItem key={r} value={r}>
                            {roleLabel(r)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {requestedRole !== "artist" && (
                      <p className="text-[11px] text-muted-foreground">
                        Roles above artist need an administrator's approval.
                        You can sign in straight away and will be working as an
                        artist until then.
                      </p>
                    )}
                  </div>
                )}
                <Button
                  type="submit"
                  className="w-full gap-2 mt-2"
                  disabled={isSubmitting}
                >
                  <UserPlus className="w-4 h-4" />{" "}
                  {isSubmitting ? "Creating account..." : "Create Account"}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
        <p className="mt-6 text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link href="/login" className="text-primary hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
