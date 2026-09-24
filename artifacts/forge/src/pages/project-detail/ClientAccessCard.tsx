import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Users, X } from "lucide-react";
import { useUsers } from "@/hooks/useUsers";
import {
  useClientProjectAccess,
  useGrantClientProjectAccess,
  useRevokeClientProjectAccess,
} from "@/hooks/useClientProjectAccess";
import { useToast } from "@/hooks/use-toast";

/**
 * Grants a real, signed-in client account visibility into this project
 * (routes/client-project-access.ts). Separate from the anonymous
 * "Share with Client" link on review.tsx -- that generates a code for
 * someone with no Forge account; this is for a client who already has one.
 */
export default function ClientAccessCard({ project }: { project: any }) {
  const { data: users = [] } = useUsers();
  const { data: grants = [] } = useClientProjectAccess();
  const grantAccess = useGrantClientProjectAccess();
  const revokeAccess = useRevokeClientProjectAccess();
  const { toast } = useToast();
  const [selectedClientId, setSelectedClientId] = useState("");

  const clientUsers = users.filter((u) => u.role === "client");
  const projectGrants = grants.filter((g) => g.projectId === project.id);
  const grantedUserIds = new Set(projectGrants.map((g) => g.userId));
  const availableClients = clientUsers.filter((u) => !grantedUserIds.has(u.id));

  const handleGrant = async () => {
    if (!selectedClientId) return;
    try {
      const result = await grantAccess.mutateAsync({
        userId: selectedClientId,
        projectId: project.id,
      });
      setSelectedClientId("");
      toast(
        result.emailSent
          ? {
              title: "Client access granted",
              description: "They've been emailed to let them know.",
            }
          : { title: "Client access granted" },
      );
    } catch (err: any) {
      toast({
        title: "Couldn't grant access",
        description: err?.message ?? "Something went wrong.",
        variant: "destructive",
      });
    }
  };

  const handleRevoke = async (id: string) => {
    try {
      await revokeAccess.mutateAsync(id);
      toast({ title: "Client access revoked" });
    } catch (err: any) {
      toast({
        title: "Couldn't revoke access",
        description: err?.message ?? "Something went wrong.",
        variant: "destructive",
      });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Users className="w-4 h-4" /> Client Access
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {projectGrants.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No signed-in clients have access to this project yet.
          </p>
        ) : (
          <div className="space-y-1.5">
            {projectGrants.map((g) => (
              <div
                key={g.id}
                className="flex items-center justify-between text-sm bg-muted/50 rounded px-2.5 py-1.5"
              >
                <div>
                  <div className="font-medium">{g.userName ?? g.userEmail}</div>
                  {g.userName && (
                    <div className="text-xs text-muted-foreground">
                      {g.userEmail}
                    </div>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => handleRevoke(g.id)}
                  disabled={revokeAccess.isPending}
                >
                  <X className="w-3.5 h-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}

        {availableClients.length > 0 ? (
          <div className="flex items-center gap-2 pt-1">
            <Select
              value={selectedClientId}
              onValueChange={setSelectedClientId}
            >
              <SelectTrigger className="h-9 flex-1">
                <SelectValue placeholder="Grant a client access..." />
              </SelectTrigger>
              <SelectContent>
                {availableClients.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.name} ({u.email})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="sm"
              onClick={handleGrant}
              disabled={!selectedClientId || grantAccess.isPending}
            >
              Grant
            </Button>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            {clientUsers.length === 0
              ? "No client accounts exist yet."
              : "Every client account already has access to this project."}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
