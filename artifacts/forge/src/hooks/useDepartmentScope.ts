import { useAuthStore } from "@/store/auth";
import { STUDIO_LEADERSHIP_ROLES } from "@/store/permissions";

/**
 * Whether the current user's view of departments/tasks/etc. should be
 * limited to their own department (producer/lead/artist), or spans every
 * department (admin/production_head). Client never reaches authenticated
 * pages, so it's not represented here.
 */
export function useDepartmentScope(): {
  scoped: boolean;
  departmentId: string | null;
} {
  const currentUser = useAuthStore((s) => s.currentUser);
  if (!currentUser) return { scoped: true, departmentId: null };
  const scoped = !STUDIO_LEADERSHIP_ROLES.includes(currentUser.role);
  return { scoped, departmentId: currentUser.departmentId ?? null };
}
