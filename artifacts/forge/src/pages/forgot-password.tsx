import { useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useRequestPasswordReset } from "@/hooks/usePassword";
import { ApiError } from "@/lib/apiClient";
import { Mail } from "lucide-react";

export default function ForgotPassword() {
  const { toast } = useToast();
  const requestReset = useRequestPasswordReset();
  const [email, setEmail] = useState("");
  const [sentMessage, setSentMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const result = await requestReset.mutateAsync({ email });
      setSentMessage(result.message);
    } catch (err) {
      const isRateLimited = err instanceof ApiError && err.status === 429;
      toast({
        title: isRateLimited
          ? "Too many reset requests"
          : "Couldn't send the reset link",
        description:
          err instanceof ApiError
            ? isRateLimited
              ? `${err.message} You can try again in a few minutes.`
              : err.message
            : "Please try again in a moment.",
        variant: "destructive",
      });
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
          <p className="text-muted-foreground text-lg">Reset Your Password</p>
        </div>
        <Card className="bg-card/50 backdrop-blur-sm border-border/50 w-full">
          <CardContent className="pt-6">
            {sentMessage ? (
              <div className="space-y-4 text-center">
                <p className="text-sm text-foreground/90">{sentMessage}</p>
                <p className="text-xs text-muted-foreground">
                  The link expires in 30 minutes and can only be used once. Check
                  your spam folder if it doesn't arrive.
                </p>
                <Link
                  href="/login"
                  className="inline-block text-sm text-primary hover:underline"
                >
                  Back to sign in
                </Link>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Enter your work email and we'll send a reset link if it matches
                  an account.
                </p>
                <div className="space-y-2">
                  <Label htmlFor="email">Work Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@company.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="bg-background/50"
                    autoFocus
                    required
                  />
                </div>
                <Button
                  type="submit"
                  className="w-full gap-2 mt-2"
                  disabled={requestReset.isPending}
                >
                  <Mail className="w-4 h-4" />{" "}
                  {requestReset.isPending ? "Sending..." : "Send Reset Link"}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
        <p className="mt-6 text-center text-sm text-muted-foreground">
          Remembered it?{" "}
          <Link href="/login" className="text-primary hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
