import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiClient, ApiError } from "@/lib/apiClient";
import { Lock } from "lucide-react";

interface InviteInfo {
  email: string;
  roleName: string;
  tenantName: string;
}

export default function AcceptInvite() {
  const token = new URLSearchParams(window.location.search).get("token") ?? "";
  const { toast } = useToast();
  const [invite, setInvite] = useState<InviteInfo | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!token) {
      setLoadError("This invite link is missing its token.");
      return;
    }
    apiClient
      .get<InviteInfo>(`/invites/${token}`)
      .then(setInvite)
      .catch((err) =>
        setLoadError(
          err instanceof ApiError && err.status === 404
            ? "This invite is invalid or has expired. Ask your admin to send a new one."
            : "Couldn't load this invite. Try again in a moment.",
        ),
      );
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      toast({
        title: "Passwords don't match",
        variant: "destructive",
      });
      return;
    }
    setIsSubmitting(true);
    try {
      await apiClient.post(`/invites/${token}/accept`, { name, password });
      // A real session cookie was just set -- a full reload lets the app's
      // normal bootstrap (fetchMe on load) hydrate everything fresh, same
      // as this app already does after a normal login.
      window.location.assign("/");
    } catch (err: any) {
      toast({
        title: "Couldn't accept invite",
        description: err.message,
        variant: "destructive",
      });
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
          <p className="text-muted-foreground text-lg">
            {invite
              ? `Join ${invite.tenantName} as ${invite.roleName}`
              : "Accept Your Invite"}
          </p>
        </div>
        <Card className="bg-card/50 backdrop-blur-sm border-border/50 w-full">
          <CardContent className="pt-6">
            {loadError ? (
              <p className="text-sm text-destructive text-center">
                {loadError}
              </p>
            ) : !invite ? (
              <p className="text-sm text-muted-foreground text-center">
                Loading invite...
              </p>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input value={invite.email} disabled className="bg-background/30" />
                </div>
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
                <Button
                  type="submit"
                  className="w-full gap-2 mt-2"
                  disabled={isSubmitting}
                >
                  <Lock className="w-4 h-4" />{" "}
                  {isSubmitting ? "Joining..." : "Join Forge"}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
