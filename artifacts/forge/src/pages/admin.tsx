import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { format } from "date-fns";
import {
  useUsers,
  useSendInvite,
  useInvites,
  useRevokeInvite,
  type UserDTO,
} from "@/hooks/useUsers";
import { useAuthStore } from "@/store/auth";
import { ROLE_LABELS } from "@/data/mockData";
import { Badge } from "@/components/ui/badge";
import { useDepartments, useCreateDepartment } from "@/hooks/useDepartments";
import { useRoles } from "@/hooks/useRoles";
import { useProjects } from "@/hooks/useProjects";
import { apiFetch } from "@/lib/apiClient";
import { useCapability } from "@/hooks/use-capability";
import { EmployeeImportDialog } from "@/components/admin/EmployeeImportDialog";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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

const PIPELINES = ["PROD", "3D", "VFX", "2D"];

// Role names are stored as ids ("production_head"); show people the label.
const roleLabel = (name: string | null | undefined) =>
  name ? ((ROLE_LABELS as Record<string, string>)[name] ?? name) : "—";

export default function AdminPanel() {
  // Admin Panel is reachable at /admin regardless of which guard wraps the
  // route (LeadershipGuard also passes production_head/producer/lead) — the
  // spec reserves user create/reassign for Admin only, so the page itself
  // must independently gate on manage_members and bounce anyone else, the
  // same pattern LeadershipGuard uses in App.tsx.
  const canManageUsers = useCapability("manage_members");
  const [, setLocation] = useLocation();
  useEffect(() => {
    if (!canManageUsers) setLocation("/");
  }, [canManageUsers, setLocation]);

  const { data: users = [], refetch: refetchUsers } = useUsers();
  const { data: departments = [], refetch: refetchDepartments } = useDepartments();
  const { data: roles = [] } = useRoles();
  const { data: projects = [] } = useProjects();
  const { toast } = useToast();
  const [createOpen, setCreateOpen] = useState(false);
  // Same reasoning as inviteRoleId/isClientInvite below: a client has no use
  // for a department, and creating one without linking a project put them
  // right back in the two-step "create, then separately remember to grant
  // access" flow -- the client had no way to see anything until an admin
  // did a second, easy-to-forget step in a totally different part of the UI.
  const [createRoleId, setCreateRoleId] = useState("");
  const [createProjectIds, setCreateProjectIds] = useState<string[]>([]);
  const [inviteOpen, setInviteOpen] = useState(false);
  // Controlled so the invite dialog can swap Department for Project the
  // moment "client" is picked -- a client has neither a department nor any
  // use for one, and inviting a client without a project puts them right
  // back in the two-step flow this whole addition exists to avoid.
  const [inviteRoleId, setInviteRoleId] = useState("");
  const isClientInvite =
    roles.find((r) => r.id === inviteRoleId)?.name === "client";
  const isCreateClient =
    roles.find((r) => r.id === createRoleId)?.name === "client";
  const [deptOpen, setDeptOpen] = useState(false);
  const [employeeImportOpen, setEmployeeImportOpen] = useState(false);
  const sendInvite = useSendInvite();
  const createDepartment = useCreateDepartment();
  const { data: invites = [], refetch: refetchInvites } = useInvites(canManageUsers);
  const revokeInvite = useRevokeInvite();
  const currentUserId = useAuthStore((s) => s.currentUser?.id);
  const [deactivateTarget, setDeactivateTarget] = useState<UserDTO | null>(null);
  const [resetPasswordTarget, setResetPasswordTarget] = useState<UserDTO | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [resettingPassword, setResettingPassword] = useState(false);
  const [bulkResetOpen, setBulkResetOpen] = useState(false);
  const [bulkPassword, setBulkPassword] = useState("");
  const [bulkResetting, setBulkResetting] = useState(false);
  const [bulkResetProgress, setBulkResetProgress] = useState({ done: 0, total: 0 });

  if (!canManageUsers) return null;

  const deptName = (id: string | null) =>
    departments.find((d) => d.id === id)?.name ?? "—";

  const pipelineCounts = departments.reduce<Record<string, number>>(
    (acc, d) => {
      acc[d.pipeline] = (acc[d.pipeline] ?? 0) + 1;
      return acc;
    },
    {},
  );

  async function handleCreate(formData: FormData) {
    const roleId = String(formData.get("roleId") ?? "");
    let departmentId = formData.get("departmentId") || null;
    if (departmentId === "none") departmentId = null;
    const isClient = roles.find((r) => r.id === roleId)?.name === "client";

    try {
      const created = await apiFetch<{ id: string }>("/users", {
        method: "POST",
        body: JSON.stringify({
          email: formData.get("email"),
          name: formData.get("name"),
          password: formData.get("password"),
          roleId,
          departmentId: isClient ? null : departmentId,
        }),
      });

      // Granting project access here (not as a separate step later) is the
      // whole point -- it's what makes the client's own portal actually show
      // something the moment they log in: this is the same
      // POST /client-project-access call the project page's own Client
      // Access panel makes, which is also what auto-provisions their "Client
      // — <project>" chat channel (client-project-access.ts's
      // ensureClientProjectChannel), so linking a project here gets them
      // both at once instead of needing a second admin action to remember.
      let grantFailures = 0;
      if (isClient && createProjectIds.length > 0) {
        const results = await Promise.allSettled(
          createProjectIds.map((projectId) =>
            apiFetch("/client-project-access", {
              method: "POST",
              body: JSON.stringify({ userId: created.id, projectId }),
            }),
          ),
        );
        grantFailures = results.filter((r) => r.status === "rejected").length;
      }

      toast(
        isClient && createProjectIds.length > 0
          ? {
              title: "Client created",
              description:
                grantFailures > 0
                  ? `Linked ${createProjectIds.length - grantFailures} of ${createProjectIds.length} project(s) -- ${grantFailures} failed.`
                  : `Linked to ${createProjectIds.length} project${createProjectIds.length === 1 ? "" : "s"}. They can sign in and see it now.`,
              variant: grantFailures > 0 ? "destructive" : undefined,
            }
          : { title: "User created" },
      );
      setCreateOpen(false);
      setCreateRoleId("");
      setCreateProjectIds([]);
      refetchUsers();
    } catch (err: any) {
      toast({
        title: "Failed to create user",
        description: err.message,
        variant: "destructive",
      });
    }
  }

  async function handleInvite(formData: FormData) {
    const email = String(formData.get("email") ?? "");
    const roleId = String(formData.get("roleId") ?? "");
    let departmentId = String(formData.get("departmentId") ?? "") || undefined;
    if (departmentId === "none") departmentId = undefined;
    let projectId = String(formData.get("projectId") ?? "") || undefined;
    if (projectId === "none") projectId = undefined;

    try {
      const result = await sendInvite.mutateAsync(
        isClientInvite ? { email, roleId, projectId } : { email, roleId, departmentId },
      );
      if (result.emailSent) {
        toast({ title: "Invite sent", description: `Sent to ${email}` });
      } else {
        // The invite itself is real and accept-able -- only the email
        // failed (most often bad SMTP credentials). Copying the link
        // straight to the clipboard means the admin still has it even
        // after this toast disappears.
        try {
          await navigator.clipboard.writeText(result.inviteUrl ?? "");
        } catch {
          // Clipboard access can be denied by the browser -- the toast
          // below still names the invite as created either way.
        }
        toast({
          title: "Invite created, but the email failed to send",
          description: `The invite for ${email} exists and works -- its link was copied to your clipboard so you can share it directly. Check the studio's SMTP settings to fix email delivery.`,
        });
      }
      setInviteOpen(false);
      setInviteRoleId("");
      refetchInvites();
    } catch (err: any) {
      toast({
        title: "Failed to send invite",
        description: err.message,
        variant: "destructive",
      });
    }
  }

  async function handleCreateDepartment(formData: FormData) {
    const name = String(formData.get("name") ?? "");
    const abbr = String(formData.get("abbr") ?? "");
    const pipeline = String(formData.get("pipeline") ?? "") as
      | "PROD"
      | "3D"
      | "VFX"
      | "2D";
    try {
      await createDepartment.mutateAsync({ name, abbr, pipeline });
      toast({ title: "Department created" });
      setDeptOpen(false);
      refetchDepartments();
    } catch (err: any) {
      toast({
        title: "Failed to create department",
        description: err.message,
        variant: "destructive",
      });
    }
  }

  async function handleReassignDepartment(
    userId: string,
    departmentId: string,
  ) {
    try {
      await apiFetch(`/users/${userId}`, {
        method: "PATCH",
        body: JSON.stringify({ departmentId: departmentId || null }),
      });
      refetchUsers();
    } catch (err: any) {
      toast({
        title: "Failed to update user",
        description: err.message,
        variant: "destructive",
      });
    }
  }

  // The API already supported role changes and deactivation, including
  // ending the person's sessions; this page just never offered either, so
  // nobody could be promoted, have a role request answered, or be offboarded.
  async function handleChangeRole(user: UserDTO, roleId: string) {
    if (!roleId || roleId === user.roleId) return;
    const newRole = roles.find((r) => r.id === roleId)?.name;
    try {
      await apiFetch(`/users/${user.id}`, {
        method: "PATCH",
        body: JSON.stringify({ roleId }),
      });
      toast({
        title: `${user.name} is now ${roleLabel(newRole)}`,
        description: "They'll be signed out and pick up the new role when they sign back in.",
      });
    } catch (err: any) {
      toast({
        title: "Failed to change role",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      // Refetch on failure too, so the picker snaps back to the real role.
      refetchUsers();
    }
  }

  async function handleSetStatus(user: UserDTO, status: "active" | "inactive") {
    try {
      await apiFetch(`/users/${user.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      toast({
        title: status === "inactive" ? "Account deactivated" : "Account reactivated",
        description:
          status === "inactive"
            ? `${user.name} has been signed out and can no longer sign in.`
            : `${user.name} can sign in again.`,
      });
      setDeactivateTarget(null);
      refetchUsers();
    } catch (err: any) {
      toast({
        title:
          status === "inactive"
            ? "Failed to deactivate account"
            : "Failed to reactivate account",
        description: err.message,
        variant: "destructive",
      });
    }
  }

  async function handleRevokeInvite(id: string, email: string) {
    try {
      await revokeInvite.mutateAsync(id);
      toast({
        title: "Invite revoked",
        description: `The link sent to ${email} no longer works.`,
      });
      refetchInvites();
    } catch (err: any) {
      toast({
        title: "Failed to revoke invite",
        description: err.message,
        variant: "destructive",
      });
    }
  }

  async function handleResetPassword() {
    if (!resetPasswordTarget || newPassword.length < 6) return;
    setResettingPassword(true);
    try {
      await apiFetch(`/users/${resetPasswordTarget.id}`, {
        method: "PATCH",
        body: JSON.stringify({ password: newPassword }),
      });
      toast({
        title: "Password set",
        description: `${resetPasswordTarget.name} has been signed out and needs the new password to sign back in.`,
      });
      setResetPasswordTarget(null);
      setNewPassword("");
    } catch (err: any) {
      toast({
        title: "Failed to set password",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setResettingPassword(false);
    }
  }

  async function handleBulkResetPasswords() {
    if (bulkPassword.length < 6) return;
    // The per-user PATCH route refuses to reset the caller's own password
    // (self-service only, via a different path) -- everyone else in the
    // tenant is a real target.
    const targets = users.filter((u) => u.id !== currentUserId);
    if (targets.length === 0) return;
    setBulkResetting(true);
    setBulkResetProgress({ done: 0, total: targets.length });
    const failures: string[] = [];
    for (const u of targets) {
      try {
        await apiFetch(`/users/${u.id}`, {
          method: "PATCH",
          body: JSON.stringify({ password: bulkPassword }),
        });
      } catch (err: any) {
        failures.push(`${u.name}: ${err.message}`);
      }
      setBulkResetProgress((prev) => ({ ...prev, done: prev.done + 1 }));
    }
    setBulkResetting(false);
    if (failures.length === 0) {
      toast({
        title: "All passwords reset",
        description: `${targets.length} account(s) signed out everywhere and now need the new password.`,
      });
      setBulkResetOpen(false);
      setBulkPassword("");
    } else {
      toast({
        title: `${targets.length - failures.length}/${targets.length} succeeded`,
        description: failures.join("; "),
        variant: "destructive",
      });
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Admin Panel</h1>
        <div className="flex gap-2">
        <Button variant="outline" onClick={() => setEmployeeImportOpen(true)}>
          Import Employees
        </Button>
        <Button
          variant="outline"
          className="text-red-500 hover:text-red-600 hover:bg-red-500/10 border-red-500/30"
          onClick={() => setBulkResetOpen(true)}
        >
          Reset All Passwords
        </Button>
        <Dialog open={deptOpen} onOpenChange={setDeptOpen}>
          <DialogTrigger asChild>
            <Button variant="outline">New Department</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>New Department</DialogTitle>
            </DialogHeader>
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                handleCreateDepartment(new FormData(e.currentTarget));
              }}
            >
              <div>
                <Label htmlFor="dept-name">Name</Label>
                <Input id="dept-name" name="name" placeholder="Animation" required />
              </div>
              <div>
                <Label htmlFor="dept-abbr">Abbreviation</Label>
                <Input id="dept-abbr" name="abbr" placeholder="ANIM" required />
              </div>
              <div>
                <Label htmlFor="dept-pipeline">Pipeline</Label>
                <Select name="pipeline" required>
                  <SelectTrigger id="dept-pipeline">
                    <SelectValue placeholder="Select a pipeline" />
                  </SelectTrigger>
                  <SelectContent>
                    {PIPELINES.map((p) => (
                      <SelectItem key={p} value={p}>
                        {p}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                type="submit"
                className="w-full"
                disabled={createDepartment.isPending}
              >
                {createDepartment.isPending ? "Creating..." : "Create"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
        <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
          <DialogTrigger asChild>
            <Button variant="outline">Invite Member</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Invite Member</DialogTitle>
            </DialogHeader>
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                handleInvite(new FormData(e.currentTarget));
              }}
            >
              <div>
                <Label htmlFor="invite-email">Email</Label>
                <Input id="invite-email" name="email" type="email" required />
              </div>
              <div>
                <Label htmlFor="invite-roleId">Role</Label>
                <Select
                  name="roleId"
                  required
                  value={inviteRoleId}
                  onValueChange={setInviteRoleId}
                >
                  <SelectTrigger id="invite-roleId">
                    <SelectValue placeholder="Select a role" />
                  </SelectTrigger>
                  <SelectContent>
                    {roles.map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        {r.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {isClientInvite ? (
                <div>
                  <Label htmlFor="invite-projectId">Project</Label>
                  <Select name="projectId">
                    <SelectTrigger id="invite-projectId">
                      <SelectValue placeholder="None — grant access later" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None — grant access later</SelectItem>
                      {projects.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <div>
                  <Label htmlFor="invite-departmentId">Department</Label>
                  <Select name="departmentId">
                    <SelectTrigger id="invite-departmentId">
                      <SelectValue placeholder="None — assign later" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None — assign later</SelectItem>
                      {departments.map((d) => (
                        <SelectItem key={d.id} value={d.id}>
                          {d.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <Button
                type="submit"
                className="w-full"
                disabled={sendInvite.isPending}
              >
                {sendInvite.isPending ? "Sending..." : "Send Invite"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
        <Dialog
          open={createOpen}
          onOpenChange={(next) => {
            setCreateOpen(next);
            if (!next) {
              setCreateRoleId("");
              setCreateProjectIds([]);
            }
          }}
        >
          <DialogTrigger asChild>
            <Button>New User</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create User</DialogTitle>
            </DialogHeader>
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                handleCreate(new FormData(e.currentTarget));
              }}
            >
              <div>
                <Label htmlFor="name">Name</Label>
                <Input id="name" name="name" required />
              </div>
              <div>
                <Label htmlFor="email">Email</Label>
                <Input id="email" name="email" type="email" required />
              </div>
              <div>
                <Label htmlFor="password">Temporary Password</Label>
                <Input id="password" name="password" type="password" required />
              </div>
              <div>
                <Label htmlFor="roleId">Role</Label>
                <Select
                  name="roleId"
                  required
                  value={createRoleId}
                  onValueChange={(v) => {
                    setCreateRoleId(v);
                    setCreateProjectIds([]);
                  }}
                >
                  <SelectTrigger id="roleId">
                    <SelectValue placeholder="Select a role" />
                  </SelectTrigger>
                  <SelectContent>
                    {roles.map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        {r.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {isCreateClient ? (
                <div>
                  <Label>Projects</Label>
                  <p className="text-xs text-muted-foreground mb-2">
                    Their episodes, sequences, and shots appear in their
                    portal for every project checked here.
                  </p>
                  <div className="border rounded-md p-2 max-h-40 overflow-y-auto space-y-1">
                    {projects.length === 0 ? (
                      <p className="text-xs text-muted-foreground px-1 py-1">
                        No projects yet.
                      </p>
                    ) : (
                      projects.map((p) => (
                        <label
                          key={p.id}
                          className="flex items-center gap-2 px-1 py-1 text-sm cursor-pointer hover:bg-muted/50 rounded"
                        >
                          <input
                            type="checkbox"
                            checked={createProjectIds.includes(p.id)}
                            onChange={(e) =>
                              setCreateProjectIds((prev) =>
                                e.target.checked
                                  ? [...prev, p.id]
                                  : prev.filter((id) => id !== p.id),
                              )
                            }
                          />
                          {p.name}
                        </label>
                      ))
                    )}
                  </div>
                </div>
              ) : (
                <div>
                  <Label htmlFor="departmentId">Department</Label>
                  <Select name="departmentId">
                    <SelectTrigger id="departmentId">
                      <SelectValue placeholder="None" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {departments.map((d) => (
                        <SelectItem key={d.id} value={d.id}>
                          {d.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <Button type="submit" className="w-full">
                Create
              </Button>
            </form>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4">
        {PIPELINES.map((pipeline) => (
          <Card key={pipeline}>
            <CardHeader>
              <CardTitle className="text-sm text-muted-foreground">
                {pipeline}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">
                {pipelineCounts[pipeline] ?? 0}
              </div>
              <div className="text-xs text-muted-foreground">departments</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Users</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((u) => {
                const isSelf = u.id === currentUserId;
                const isActive = u.status !== "inactive";
                const requested =
                  u.requestedRole && u.requestedRole !== u.role
                    ? roles.find((r) => r.name === u.requestedRole)
                    : undefined;
                return (
                  <TableRow key={u.id}>
                    <TableCell>
                      {u.name}
                      {isSelf && (
                        <span className="ml-2 text-xs text-muted-foreground">
                          (you)
                        </span>
                      )}
                    </TableCell>
                    <TableCell>{u.email}</TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1.5">
                        <Select
                          key={`${u.id}-${u.roleId}`}
                          defaultValue={u.roleId}
                          disabled={isSelf}
                          onValueChange={(val) => handleChangeRole(u, val)}
                        >
                          <SelectTrigger
                            className="w-44"
                            aria-label={`Role for ${u.name}`}
                            title={
                              isSelf
                                ? "Another administrator has to change your role"
                                : undefined
                            }
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {roles.map((r) => (
                              <SelectItem key={r.id} value={r.id}>
                                {roleLabel(r.name)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {requested && (
                          <div className="flex items-center gap-2 text-xs">
                            <span className="text-muted-foreground">
                              Requested {roleLabel(requested.name)}
                            </span>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-6 px-2 text-xs"
                              onClick={() => handleChangeRole(u, requested.id)}
                            >
                              Grant
                            </Button>
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Select
                        key={`${u.id}-${u.departmentId ?? "none"}`}
                        defaultValue={u.departmentId ?? "none"}
                        onValueChange={(val) =>
                          handleReassignDepartment(u.id, val === "none" ? "" : val)
                        }
                      >
                        <SelectTrigger
                          className="w-44"
                          aria-label={`Department for ${u.name}`}
                        >
                          <SelectValue placeholder="None" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">None</SelectItem>
                          {departments.map((d) => (
                            <SelectItem key={d.id} value={d.id}>
                              {d.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Badge variant={isActive ? "outline" : "secondary"}>
                          {isActive ? "Active" : "Deactivated"}
                        </Badge>
                        {!isSelf && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7"
                            onClick={() => setResetPasswordTarget(u)}
                          >
                            Reset password
                          </Button>
                        )}
                        {!isSelf &&
                          (isActive ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 text-destructive hover:text-destructive"
                              onClick={() => setDeactivateTarget(u)}
                            >
                              Deactivate
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7"
                              onClick={() => handleSetStatus(u, "active")}
                            >
                              Reactivate
                            </Button>
                          ))}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Pending Invites</CardTitle>
        </CardHeader>
        <CardContent>
          {invites.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No outstanding invites. Invites you send stay here until
              they're accepted or revoked.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead>Sent</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {invites.map((inv) => (
                  <TableRow key={inv.id}>
                    <TableCell>{inv.email}</TableCell>
                    <TableCell>
                      {roleLabel(roles.find((r) => r.id === inv.roleId)?.name)}
                    </TableCell>
                    <TableCell>{deptName(inv.departmentId)}</TableCell>
                    <TableCell>
                      {format(new Date(inv.createdAt), "d MMM yyyy")}
                    </TableCell>
                    <TableCell>
                      {inv.expired ? (
                        <Badge variant="secondary">Expired</Badge>
                      ) : (
                        format(new Date(inv.expiresAt), "d MMM yyyy")
                      )}
                    </TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-destructive hover:text-destructive"
                        disabled={revokeInvite.isPending}
                        onClick={() => handleRevokeInvite(inv.id, inv.email)}
                      >
                        Revoke
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={!!deactivateTarget}
        onOpenChange={(open) => !open && setDeactivateTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Deactivate {deactivateTarget?.name}?</DialogTitle>
            <DialogDescription>
              They'll be signed out everywhere straight away and won't be able
              to sign in. Their tasks, logs and history stay as they are, and
              you can reactivate the account at any time.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeactivateTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() =>
                deactivateTarget && handleSetStatus(deactivateTarget, "inactive")
              }
            >
              Deactivate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!resetPasswordTarget}
        onOpenChange={(open) => {
          if (!open) {
            setResetPasswordTarget(null);
            setNewPassword("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset password for {resetPasswordTarget?.name}</DialogTitle>
            <DialogDescription>
              They'll be signed out everywhere and need this new password to
              sign back in. Share it with them directly — Forge has no way to
              show it again after this dialog closes.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="reset-password">New password</Label>
            <Input
              id="reset-password"
              type="text"
              minLength={6}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="At least 6 characters"
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setResetPasswordTarget(null);
                setNewPassword("");
              }}
            >
              Cancel
            </Button>
            <Button
              disabled={newPassword.length < 6 || resettingPassword}
              onClick={handleResetPassword}
            >
              {resettingPassword ? "Setting…" : "Set password"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={bulkResetOpen}
        onOpenChange={(open) => {
          if (!open && !bulkResetting) {
            setBulkResetOpen(false);
            setBulkPassword("");
            setBulkResetProgress({ done: 0, total: 0 });
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Reset every password? ({users.length - 1} account
              {users.length - 1 === 1 ? "" : "s"})
            </DialogTitle>
            <DialogDescription>
              Sets this exact password on every account except your own
              (change your own from your profile) and signs all of them out
              everywhere. This can't be undone -- share the new password with
              your team directly, Forge has no way to show it again after
              this closes.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="bulk-reset-password">New password for everyone</Label>
            <Input
              id="bulk-reset-password"
              type="text"
              minLength={6}
              value={bulkPassword}
              onChange={(e) => setBulkPassword(e.target.value)}
              placeholder="At least 6 characters"
              disabled={bulkResetting}
            />
          </div>
          {bulkResetting && (
            <p className="text-sm text-muted-foreground">
              Resetting {bulkResetProgress.done} / {bulkResetProgress.total}…
            </p>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              disabled={bulkResetting}
              onClick={() => {
                setBulkResetOpen(false);
                setBulkPassword("");
              }}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={bulkPassword.length < 6 || bulkResetting}
              onClick={handleBulkResetPasswords}
            >
              {bulkResetting
                ? `Resetting… (${bulkResetProgress.done}/${bulkResetProgress.total})`
                : `Reset all ${users.length - 1} password(s)`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <EmployeeImportDialog
        open={employeeImportOpen}
        onOpenChange={setEmployeeImportOpen}
      />
    </div>
  );
}
