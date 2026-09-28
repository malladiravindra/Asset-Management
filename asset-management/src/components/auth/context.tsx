"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { apiGet, logoutRequest } from "@/lib/api";

/** GET/PATCH /api/accounts/me/ — see asset_backend/accounts/serializers.py me_payload. */
export type MeUser = {
  id: number;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  display_name: string;
  is_active: boolean;
  is_staff: boolean;
  is_superuser: boolean;
  last_login: string | null;
  date_joined: string | null;
};

export type MeEmployee = {
  id: number;
  employee_id: string | null;
  name: string;
  phone: string;
  designation: string;
  department: number | null;
  department_name: string | null;
  location: number | null;
  location_name: string | null;
};

export type MeRole = { id: number; name: string; is_active: boolean };

export type Me = {
  user: MeUser;
  employee: MeEmployee | null;
  roles: MeRole[];
  /** Effective Django permissions, e.g. "assets.delete_asset". */
  permissions: string[];
};

export type CurrentUser = MeUser;

// Pre-/me sessions cached {id, username, email} here; the backend is now the
// only source, so the stale copy is removed on load.
const LEGACY_USER_STORAGE_KEY = "assetflow.user";

type AuthContextValue = {
  me: Me | null;
  user: CurrentUser | null;
  loading: boolean;
  /** Re-read /me (after a profile edit, or a role change by an admin). */
  refresh: () => Promise<void>;
  /** Replace /me with a response the caller already has (PATCH /me returns it). */
  setMe: (me: Me) => void;
  /** Blacklist the refresh token, clear the session and go to the login page. */
  signOut: () => Promise<void>;
  /** UI visibility only — every endpoint enforces the same permission server-side. */
  can: (permission: string) => boolean;
};

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * The one owner of "who is signed in and what may they do": fetches
 * GET /api/accounts/me/ once when the dashboard mounts and shares it with the
 * sidebar, topbar, greeting, Profile page and every permission check.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      setMe(await apiGet<Me>("/accounts/me/"));
    } catch {
      setMe(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.removeItem(LEGACY_USER_STORAGE_KEY);
    } catch {
      // storage unavailable — nothing to clean up
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load /me once; state is set when the request resolves
    void refresh();
  }, [refresh]);

  const signOut = useCallback(async () => {
    await logoutRequest();
    setMe(null);
    router.push("/");
  }, [router]);

  const can = useCallback(
    (permission: string) => Boolean(me && (me.user.is_superuser || me.permissions.includes(permission))),
    [me]
  );

  return (
    <AuthContext.Provider value={{ me, user: me?.user ?? null, loading, refresh, setMe, signOut, can }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useCurrentUser() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useCurrentUser must be used within an AuthProvider");
  return ctx;
}

/** Shorthand for permission-aware UI: const canDelete = useCan("assets.delete_asset"). */
export function useCan(permission: string) {
  return useCurrentUser().can(permission);
}

// --- Display helpers -------------------------------------------------

export function displayNameFor(user: CurrentUser | null): string {
  if (user?.display_name) return user.display_name;
  if (user?.username) return user.username;
  return "Signed in";
}

export function initialsFor(user: CurrentUser | null): string {
  if (!user) return "?";
  const name = displayNameFor(user);
  const parts = name.split(/[.\-_\s]+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase() || "?";
}

/** The role line under the user's name: their active roles from the database. */
export function roleLabelFor(me: Me | null): string {
  if (!me) return "";
  const active = me.roles.filter((r) => r.is_active).map((r) => r.name);
  if (active.length) return active.join(", ");
  if (me.user.is_superuser) return "Superuser";
  return "No role assigned";
}
