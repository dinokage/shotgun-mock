import { useState, useMemo } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { stagger } from "@/lib/motion";
import { useAuthStore } from "@/store/auth";
import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ROLE_LABELS, roleLabel } from "@/data/mockData";
import { useUserStore } from "@/store/users";
import { useDepartmentStore } from "@/store/departments";
import {
  Search,
  Filter,
  Mail,
  Building2,
  ExternalLink,
  Users2,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty";
import {
  STUDIO_LEADERSHIP_ROLES,
  LEADERSHIP_ROLES,
  DEPARTMENT_LEADERSHIP_ROLES,
} from "@/store/permissions";

// Roles the studio auto clock-in/out on login/logout (see routes/auth.ts's
// AUTO_CLOCK_IN_ROLES) -- admin keeps no timesheet, so it never gets a live
// presence claim below, only its account status.
const PRESENCE_ROLES = ["artist", "lead", "production_head", "producer"];

// Mirrors PRESENCE_ONLINE_WINDOW_MS in the API's tenant middleware -- must
// stay a few multiples of that middleware's write-throttle window so normal
// usage (which heartbeats at most once per throttle window) never drifts
// stale between writes and flickers to Offline while still in use.
const PRESENCE_ONLINE_WINDOW_MS = 90_000;

// Mirrors the server's attendance-visibility rule exactly (routes/users.ts):
// studio-wide roles see everyone, a lead sees their own department, everyone
// else sees only themselves. GET /users already nulls punchedInAt for rows
// outside this, so without this check "no data" and "actually offline" are
// indistinguishable and a viewer without visibility would see every
// colleague as falsely Offline instead of an honest "no data" state.
const STUDIO_WIDE_ATTENDANCE_ROLES = ["admin", "production_head", "producer"];
function canSeePresence(
  viewer: { id: string; role: string; departmentId: string | null },
  target: { id: string; departmentId: string | null },
): boolean {
  if (target.id === viewer.id) return true;
  if (STUDIO_WIDE_ATTENDANCE_ROLES.includes(viewer.role)) return true;
  return viewer.role === "lead" && target.departmentId === viewer.departmentId;
}

export default function People() {
  const prefersReducedMotion = useReducedMotion();
  const { currentUser } = useAuthStore();
  const users = useUserStore((s) => s.users);
  const departments = useDepartmentStore((s) => s.departments);

  const [search, setSearch] = useState("");
  const [deptFilter, setDeptFilter] = useState("all");

  const filteredUsers = useMemo(() => {
    if (!currentUser) return [];

    // RBAC Rules for Roster Visibility
    const isDeptLeadership = DEPARTMENT_LEADERSHIP_ROLES.includes(
      currentUser.role,
    );
    const isArtist = currentUser.role === "artist";
    const isClient = currentUser.role === "client";

    return users.filter((u) => {
      // 1. Enforce RBAC visibility
      if (isArtist && u.departmentId !== currentUser.departmentId) {
        return false; // Artists only see their own department
      }
      if (isDeptLeadership) {
        const uIsLeadership = LEADERSHIP_ROLES.includes(u.role);
        if (u.departmentId !== currentUser.departmentId && !uIsLeadership) {
          return false; // Dept Leads see their dept + all other leads/producers
        }
      }
      if (isClient && !STUDIO_LEADERSHIP_ROLES.includes(u.role)) {
        return false; // Clients only see their studio points of contact, not the internal roster
      }

      // 2. Apply UI search/filters
      if (
        search &&
        !u.name.toLowerCase().includes(search.toLowerCase()) &&
        !u.title.toLowerCase().includes(search.toLowerCase())
      )
        return false;
      if (deptFilter !== "all" && u.departmentId !== deptFilter) return false;
      return true;
    });
  }, [search, deptFilter, currentUser, users]);

  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-6 h-full flex flex-col">
      <div className="flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Studio Roster</h1>
          <p className="text-muted-foreground mt-1">
            Directory of all {filteredUsers.length} active personnel
          </p>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 shrink-0">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search by name, role..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-11"
          />
        </div>
        <div className="flex gap-2">
          <Select value={deptFilter} onValueChange={setDeptFilter}>
            <SelectTrigger className="w-[200px] h-11">
              <Filter className="w-4 h-4 mr-2 text-muted-foreground" />
              <SelectValue placeholder="Department" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Departments</SelectItem>
              {departments.map((d) => (
                <SelectItem key={d.id} value={d.id}>
                  {d.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {filteredUsers.length === 0 && (
        <Empty className="flex-1">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Users2 />
            </EmptyMedia>
            <EmptyTitle>No people found</EmptyTitle>
            <EmptyDescription>
              {search || deptFilter !== "all"
                ? "Try adjusting your search or department filter."
                : "There's no one visible in your roster yet."}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 overflow-y-auto pb-6">
        {filteredUsers.map((user, i) => {
          const dept = departments.find((d) => d.id === user.departmentId);
          return (
            <motion.div
              key={user.id}
              {...(prefersReducedMotion ? {} : stagger(i))}
            >
              <Link href={`/people/${user.id}`}>
                <Card className="cursor-pointer hover:border-primary/50 transition-all hover:shadow-lg group h-full">
                  <CardContent className="p-5">
                    <div className="flex justify-between items-start mb-4">
                      <Avatar
                        className="w-16 h-16 border-2 shadow-sm"
                        style={{ borderColor: dept?.color || "var(--border)" }}
                      >
                        <AvatarImage src={user.avatar} />
                        <AvatarFallback>{user.name.charAt(0)}</AvatarFallback>
                      </Avatar>
                      {/* A role this person asked for at registration and has
                          not been granted. Shown next to the status badge
                          because it is an action waiting on whoever is
                          reading the roster, not a property of the person. */}
                      {user.requestedRole && (
                        <Badge
                          variant="outline"
                          className="text-[10px] px-1.5 py-0 border-amber-500/40 text-amber-600 bg-amber-500/10 mr-1"
                        >
                          Requested: {roleLabel(user.requestedRole)}
                        </Badge>
                      )}
                      {(() => {
                        // Live clocked-in status, not the account's static
                        // status field -- every card used to show "active"
                        // regardless of whether that person was actually
                        // signed in, which is what this replaces. Re-derives
                        // on every users refetch (App.tsx's ~10s poll), so it
                        // tracks real logins/logouts without a page reload.
                        if (!PRESENCE_ROLES.includes(user.role)) {
                          return (
                            <Badge
                              variant={
                                user.status === "active" ? "default" : "secondary"
                              }
                              className={
                                user.status === "active"
                                  ? "bg-green-500/10 text-green-500 hover:bg-green-500/20 shadow-none text-[10px] px-1.5 py-0"
                                  : "text-[10px] px-1.5 py-0"
                              }
                            >
                              {user.status}
                            </Badge>
                          );
                        }
                        if (!currentUser || !canSeePresence(currentUser, user)) {
                          return (
                            <Badge
                              variant="secondary"
                              className="text-[10px] px-1.5 py-0"
                            >
                              Member
                            </Badge>
                          );
                        }
                        // lastSeenAt is a heartbeat written by every
                        // authenticated request (see touchPresence in the
                        // API's tenant middleware), not the clock-in time --
                        // punchedInAt stays true all day even after someone
                        // closes their laptop without logging out, which is
                        // exactly the stale "always online" bug this badge
                        // used to have.
                        const online =
                          !!user.lastSeenAt &&
                          Date.now() - new Date(user.lastSeenAt).getTime() <
                            PRESENCE_ONLINE_WINDOW_MS;
                        return (
                          <Badge
                            variant={online ? "default" : "secondary"}
                            className={
                              online
                                ? "bg-green-500/10 text-green-500 hover:bg-green-500/20 shadow-none text-[10px] px-1.5 py-0"
                                : "text-[10px] px-1.5 py-0"
                            }
                          >
                            {online ? "Online" : "Offline"}
                          </Badge>
                        );
                      })()}
                    </div>

                    <div className="mb-4">
                      <h3 className="font-semibold text-base group-hover:text-primary transition-colors flex items-center gap-1">
                        {user.name}
                        <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                      </h3>
                      <div className="text-sm text-muted-foreground">
                        {ROLE_LABELS[user.role] || user.title}
                      </div>
                    </div>

                    <div className="space-y-2 text-xs text-muted-foreground">
                      <div className="flex items-center gap-2">
                        <Building2 className="w-3.5 h-3.5" />
                        <span
                          className="font-medium"
                          style={{ color: dept?.color }}
                        >
                          {dept?.name}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Mail className="w-3.5 h-3.5" />
                        <span className="truncate">{user.email}</span>
                      </div>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-1">
                      {(user.skills ?? []).slice(0, 3).map((skill) => (
                        <span
                          key={skill}
                          className="px-1.5 py-0.5 bg-muted rounded-md text-[10px]"
                        >
                          {skill}
                        </span>
                      ))}
                      {(user.skills?.length ?? 0) > 3 && (
                        <span className="px-1.5 py-0.5 bg-muted rounded-md text-[10px]">
                          +{user.skills.length - 3}
                        </span>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </Link>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
