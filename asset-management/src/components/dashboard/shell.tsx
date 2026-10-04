"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Sidebar } from "@/components/dashboard/sidebar";
import { Breadcrumb, Topbar } from "@/components/dashboard/topbar";
import { Providers } from "@/components/providers";
import { MaintenanceBanner } from "@/components/settings/maintenance-banner";
import { cn } from "@/lib/utils";

const COLLAPSED_KEY = "assetflow.sidebar.collapsed";
const COLLAPSED_EVENT = "assetflow:sidebar-collapsed";

// Sidebar collapsed state lives in localStorage so it survives reloads. Read
// through useSyncExternalStore: the server (and first hydration) render the
// expanded sidebar, then React swaps in the stored value without a mismatch.
function subscribeCollapsed(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(COLLAPSED_EVENT, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(COLLAPSED_EVENT, callback);
  };
}
function readCollapsed() {
  try {
    return window.localStorage.getItem(COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
}
function toggleCollapsed() {
  try {
    window.localStorage.setItem(COLLAPSED_KEY, readCollapsed() ? "0" : "1");
  } catch {
    // storage unavailable: the toggle just won't persist
  }
  window.dispatchEvent(new Event(COLLAPSED_EVENT));
}

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const collapsed = useSyncExternalStore(subscribeCollapsed, readCollapsed, () => false);
  // The mobile drawer remembers the route it was opened on, so it closes by
  // itself when the route changes.
  const [drawerOpenAt, setDrawerOpenAt] = useState<string | null>(null);
  const mobileOpen = drawerOpenAt === pathname;
  // null = auth not checked yet, false = no token (redirect in flight),
  // true = token present. Providers (and every data-fetching context inside
  // it — Assets, Employees, Departments, etc.) must not mount until this is
  // true: they each fetch on mount with no auth check of their own, so
  // rendering them before this check runs sends an unauthenticated request
  // to every protected endpoint (this is what was causing the stray
  // "GET /api/assets/ 401" — the fetch effects were firing before this
  // component's own effect below had a chance to redirect).
  const [authorized, setAuthorized] = useState<boolean | null>(null);

  useEffect(() => {
    // Purely client-side guard — this app has no server-rendered session,
    // only a JWT access token in localStorage (see src/lib/api.ts). Reading
    // it can only happen after mount (no `window` during SSR), and the
    // redirect below is a genuine side effect (imperative navigation) —
    // both legitimately belong in an effect despite the lint rule's usual
    // preference for computing state during render.
    if (window.localStorage.getItem("assetflow.access")) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- see above
      setAuthorized(true);
    } else {
      setAuthorized(false);
      router.replace("/");
      return;
    }
  }, [router]);

  // Don't mount Providers (and its ~15 immediate API calls) until we know
  // there's a token to send — otherwise every request 401s before the
  // redirect to login even lands.
  if (!authorized) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-950">
        <span className="text-sm text-slate-400 dark:text-slate-500">Loading…</span>
      </div>
    );
  }

  return (
    <Providers>
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
        <div className="print:hidden">
          <Sidebar
            collapsed={collapsed}
            onToggle={toggleCollapsed}
            mobileOpen={mobileOpen}
            onMobileClose={() => setDrawerOpenAt(null)}
          />
          <Topbar collapsed={collapsed} onMenuClick={() => setDrawerOpenAt(pathname)} />
        </div>
        <div
          className={cn(
            "transition-[padding-left] duration-200 print:pl-0",
            collapsed ? "lg:pl-[72px]" : "lg:pl-[240px]"
          )}
        >
          <div className="h-16 print:hidden" aria-hidden="true" />
          <main className="w-full p-4 sm:p-6 xl:p-8 print:p-0">
            <Breadcrumb />
            <MaintenanceBanner />
            {children}
          </main>
        </div>
      </div>
    </Providers>
  );
}
