import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useUsers, useSendInvite } from "@/hooks/useUsers";
import { useDepartments, useCreateDepartment } from "@/hooks/useDepartments";
import { useRoles } from "@/hooks/useRoles";
import { apiFetch } from "@/lib/apiClient";
import { useCapability } from "@/hooks/use-capability";
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
  const { toast } = useToast();
  const [createOpen, setCreateOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [deptOpen, setDeptOpen] = useState(false);
  const sendInvite = useSendInvite();
  const createDepartment = useCreateDepartment();

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
    try {
      await apiFetch("/users", {
        method: "POST",
        body: JSON.stringify({
          email: formData.get("email"),
          name: formData.get("name"),
          password: formData.get("password"),
          roleId,
          departmentId: formData.get("departmentId") || null,
        }),
      });
      toast({ title: "User created" });
      setCreateOpen(false);
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
    const departmentId = String(formData.get("departmentId") ?? "") || undefined;
    try {
      await sendInvite.mutateAsync({ email, roleId, departmentId });
      toast({ title: "Invite sent", description: `Sent to ${email}` });
      setInviteOpen(false);
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

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Admin Panel</h1>
        <div className="flex gap-2">
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
                <Select name="roleId" required>
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
              <div>
                <Label htmlFor="invite-departmentId">Department</Label>
                <Select name="departmentId">
                  <SelectTrigger id="invite-departmentId">
                    <SelectValue placeholder="None — assign later" />
                  </SelectTrigger>
                  <SelectContent>
                    {departments.map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
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
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
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
                <Select name="roleId" required>
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
              <div>
                <Label htmlFor="departmentId">Department</Label>
                <Select name="departmentId">
                  <SelectTrigger id="departmentId">
                    <SelectValue placeholder="None" />
                  </SelectTrigger>
                  <SelectContent>
                    {departments.map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
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
                <TableHead>Department</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Reassign Department</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((u) => (
                <TableRow key={u.id}>
                  <TableCell>{u.name}</TableCell>
                  <TableCell>{u.email}</TableCell>
                  <TableCell>{deptName(u.departmentId)}</TableCell>
                  <TableCell>{u.status}</TableCell>
                  <TableCell>
                    <Select
                      key={`${u.id}-${u.departmentId ?? "none"}`}
                      defaultValue={u.departmentId ?? ""}
                      onValueChange={(val) =>
                        handleReassignDepartment(u.id, val)
                      }
                    >
                      <SelectTrigger className="w-48">
                        <SelectValue placeholder="None" />
                      </SelectTrigger>
                      <SelectContent>
                        {departments.map((d) => (
                          <SelectItem key={d.id} value={d.id}>
                            {d.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
