import { useAuthStore } from '@/store/auth';
import { usePermissionsStore, LEADERSHIP_ROLES, type CapabilityId } from '@/store/permissions';

/**
 * Gates a specific action against the editable Roles & Permissions matrix
 * (Settings > Roles) instead of a hardcoded role list. This is the seam the
 * matrix was built for — it previously had zero effect anywhere outside its
 * own Settings tab because nothing else in the app read it.
 */
export function useCapability(id: CapabilityId): boolean {
  const role = useAuthStore((s) => s.currentUser?.role);
  const scheme = usePermissionsStore((s) => s.scheme);
  if (!role) return false;
  return scheme[role]?.[id] === true;
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
