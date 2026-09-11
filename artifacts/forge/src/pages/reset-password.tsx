import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useResetPassword } from "@/hooks/usePassword";
import { ApiError } from "@/lib/apiClient";
import { Lock } from "lucide-react";

const MIN_PASSWORD_LENGTH = 8;
const REDIRECT_DELAY_MS = 3000;

export default function ResetPassword() {
  const token = new URLSearchParams(window.location.search).get("token") ?? "";
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const resetPassword = useResetPassword();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [doneMessage, setDoneMessage] = useState<string | null>(null);
  const [tokenError, setTokenError] = useState<string | null>(null);

  useEffect(() => {
    if (!doneMessage) return;
    // Long enough to read the confirmation before the sign-in screen replaces
    // it; the link below is there for anyone who doesn't want to wait.
    const timer = setTimeout(() => setLocation("/login"), REDIRECT_DELAY_MS);
    return () => clearTimeout(timer);
  }, [doneMessage, setLocation]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast({
        title: "Passwords don't match",
        description: "New password and confirmation must match.",
        variant: "destructive",
      });
      return;
    }
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      toast({
        title: "Password too short",
        description: `Use at least ${MIN_PASSWORD_LENGTH} characters.`,
        variant: "destructive",
      });
      return;
    }
    setTokenError(null);
    try {
      const result = await resetPassword.mutateAsync({ token, newPassword });
      setDoneMessage(result.message);
    } catch (err) {
      if (err instanceof ApiError && err.status === 400) {
        setTokenError(err.message);
        return;
      }
      toast({
        title:
          err instanceof ApiError && err.status === 429
            ? "Too many attempts"
            : "Couldn't reset your password",
        description:
          err instanceof ApiError && err.status === 429
            ? `${err.message} You can try again in a few minutes.`
            : err instanceof ApiError
              ? err.message
              : "Please try again in a moment.",
        variant: "destructive",
      });
    }
  };

  const blockingError = !token
    ? "This reset link is missing its token."
    : tokenError;

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
          <p className="text-muted-foreground text-lg">Choose a New Password</p>
        </div>
        <Card className="bg-card/50 backdrop-blur-sm border-border/50 w-full">
          <CardContent className="pt-6">
            {doneMessage ? (
              <div className="space-y-4 text-center">
                <p className="text-sm text-foreground/90">{doneMessage}</p>
                <p className="text-xs text-muted-foreground">
                  Any other device you were signed in on has been signed out.
                </p>
                <Link
                  href="/login"
                  className="inline-block text-sm text-primary hover:underline"
                >
                  Go to sign in
                </Link>
              </div>
            ) : blockingError ? (
              <div className="space-y-4 text-center">
                <p className="text-sm text-destructive">{blockingError}</p>
                <Link
                  href="/forgot-password"
                  className="inline-block text-sm text-primary hover:underline"
                >
                  Request a new reset link
                </Link>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="new-password">New Password</Label>
                  <Input
                    id="new-password"
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="bg-background/50"
                    minLength={MIN_PASSWORD_LENGTH}
                    autoFocus
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirm-password">Confirm New Password</Label>
                  <Input
                    id="confirm-password"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="bg-background/50"
                    minLength={MIN_PASSWORD_LENGTH}
                    required
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  At least {MIN_PASSWORD_LENGTH} characters. This link works once
                  and expires 30 minutes after it was requested.
                </p>
                <Button
                  type="submit"
                  className="w-full gap-2 mt-2"
                  disabled={resetPassword.isPending}
                >
                  <Lock className="w-4 h-4" />{" "}
                  {resetPassword.isPending ? "Saving..." : "Set New Password"}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
        <p className="mt-6 text-center text-sm text-muted-foreground">
          <Link href="/login" className="text-primary hover:underline">
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
