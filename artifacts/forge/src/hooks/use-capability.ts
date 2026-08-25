import { useAuthStore } from "@/store/auth";
import {
  usePermissionsStore,
  LEADERSHIP_ROLES,
  type CapabilityId,
} from "@/store/permissions";

/**
 * Gates a specific action against the editable Roles & Permissions matrix
 * (Settings > Roles) instead of a hardcoded role list. This is the seam the
 * matrix was built for — it previously had zero effect anywhere outside its
 * own Settings tab because nothing else in the app read it.
 */
export function useCapability(id: CapabilityId): boolean {
  const user = useAuthStore((s) => s.currentUser);
  if (!user) return false;
  // Fallback to true for admin just in case, but real RBAC handles admin fully
  if (user.role === "admin") return true;
  // Read directly from the capabilities array returned by API
  return user.capabilities?.includes(id) ?? false;
}

/**
 * Coarse "is this person studio leadership" check, for routes/UI that gate
 * on seniority rather than one specific capability (e.g. LeadershipGuard).
 * Reads the single shared LEADERSHIP_ROLES list in store/permissions.ts.
 */
export function useIsLeadership(): boolean {
  const role = useAuthStore((s) => s.currentUser?.role);
  return !!role && LEADERSHIP_ROLES.includes(role);
}
