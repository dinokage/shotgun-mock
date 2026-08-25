import { useAuthStore } from "@/store/auth";

/**
 * A simple hook that exposes the current user, or throws if not authenticated.
 * This should only be used inside `<AuthGuard>` where we know the user exists.
 */
export function useCurrentUser() {
  const { currentUser } = useAuthStore();

  if (!currentUser) {
    throw new Error(
      "useCurrentUser must be used within an authenticated context",
    );
  }

  return currentUser;
}
