"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { tokenStore } from "@/lib/api";
import type { SessionUser, UserRole } from "@/lib/types";

const USER_KEY = "wayaz.user";

const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);

  const onStorage = (event: StorageEvent) => {
    if (event.key === USER_KEY || event.key === null) listener();
  };
  window.addEventListener("storage", onStorage);

  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

function emit(): void {
  for (const listener of listeners) listener();
}

let cachedRaw: string | null = null;
let cachedUser: SessionUser | null = null;

function readStoredUser(): SessionUser | null {
  if (!tokenStore.access) return null;

  const raw = window.localStorage.getItem(USER_KEY);
  if (!raw) return null;

  if (raw !== cachedRaw) {
    try {
      cachedUser = JSON.parse(raw) as SessionUser;
    } catch {
      window.localStorage.removeItem(USER_KEY);
      cachedUser = null;
    }
    cachedRaw = raw;
  }

  return cachedUser;
}

function subscribeReady(): () => void {
  return () => {};
}

interface AuthContextValue {
  user: SessionUser | null;
  ready: boolean;
  isAuthenticated: boolean;
  canManage: boolean;
  signIn: (user: SessionUser) => void;
  signOut: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const user = useSyncExternalStore(subscribe, readStoredUser, () => null);
  const ready = useSyncExternalStore(subscribeReady, () => true, () => false);

  const signIn = useCallback((next: SessionUser) => {
    window.localStorage.setItem(USER_KEY, JSON.stringify(next));
    emit();
  }, []);

  const signOut = useCallback(() => {
    tokenStore.clear();
    window.localStorage.removeItem(USER_KEY);
    emit();
  }, []);

  const value = useMemo<AuthContextValue>(() => {
    const staffRoles: UserRole[] = ["admin", "staff"];
    const canManage = Boolean(
      user &&
        (staffRoles.includes(user.role) || user.is_staff || user.is_superuser),
    );

    return {
      user,
      ready,
      isAuthenticated: Boolean(user),
      canManage,
      signIn,
      signOut,
    };
  }, [user, ready, signIn, signOut]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}
