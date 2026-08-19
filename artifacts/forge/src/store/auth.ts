import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { USERS } from '@/data/mockData';
import type { User } from '@/data/mockData';

interface AuthState {
  currentUser: User | null;
  isAuthenticated: boolean;
  loginError: string | null;
  login: (empId: string, password: string) => boolean;
  logout: () => void;
  switchUser: (userId: string) => void;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      currentUser: null,
      isAuthenticated: false,
      loginError: null,

      login: (empId: string, password: string) => {
        const user = USERS.find(
          (u) => u.empId.toLowerCase() === empId.toLowerCase() && u.password === password
        );

        if (user) {
          set({ currentUser: user, isAuthenticated: true, loginError: null });
          return true;
        }

        set({ loginError: 'Invalid Employee ID or password.' });
        return false;
      },

      logout: () => {
        set({ currentUser: null, isAuthenticated: false, loginError: null });
      },

      switchUser: (userId: string) => {
        const user = USERS.find((u) => u.id === userId);
        if (user) {
          set({ currentUser: user, isAuthenticated: true, loginError: null });
        }
      },

      clearError: () => set({ loginError: null }),
    }),
    {
      name: 'forge-auth',
      // Strip the plaintext `password` field before it round-trips through
      // localStorage — the in-memory currentUser keeps the full User shape
      // (other consumers type it as `User`), but persisted state never
      // retains the credential.
      partialize: (state) => ({
        currentUser: state.currentUser
          ? (({ password: _password, ...safeUser }) => safeUser)(state.currentUser)
          : null,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);
