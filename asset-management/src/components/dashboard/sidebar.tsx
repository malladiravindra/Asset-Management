"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ChevronsLeft, ChevronsRight, LogOut, Settings, UserRound, X } from "lucide-react";
import { isNavItemVisible, NAV_SECTIONS } from "@/lib/nav";
import { Logo } from "@/components/brand/logo";
import { cn } from "@/lib/utils";
import { displayNameFor, initialsFor, roleLabelFor, useCurrentUser } from "@/components/auth/context";
import { useDashboard } from "@/components/dashboard/context";
import { useNotifications } from "@/components/notifications/context";

export function Sidebar({
  collapsed,
  onToggle,
  mobileOpen = false,
  onMobileClose,
}: {
  collapsed: boolean;
  onToggle: () => void;
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}) {
  const pathname = usePathname();
  const [profileOpen, setProfileOpen] = useState(false);
  const { me, user, signOut, can } = useCurrentUser();
  const displayName = displayNameFor(user);
  const initials = initialsFor(user);
  const roleLabel = roleLabelFor(me);
  // Badges are backend numbers: the unread count from /api/notifications/
  // and record counts from the /api/dashboard/ summary (one request shared
  // with the Dashboard page) — the sidebar derives nothing from raw lists.
  const { unreadCount } = useNotifications();
  const { data: summary, revalidate } = useDashboard();
  const attention = summary?.attention;
  const serviceAttention = attention
    ? attention.overdue_maintenance_count + attention.overdue_repair_count + attention.licenses_attention_count
    : 0;

  // Permission-gated items appear once /me has loaded, never on a guess.
  const visibleSections = NAV_SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter((item) => isNavItemVisible(item, me, can)),
  })).filter((section) => section.items.length > 0);

  // Keep the badge counts reasonably fresh while navigating (at most one
  // summary request per 30 s; the Dashboard page shares the same data).
  useEffect(() => {
    revalidate(30_000);
  }, [pathname, revalidate]);

  return (
    <>
      {mobileOpen && (
        <button
          type="button"
          aria-label="Close menu"
          className="fixed inset-0 z-30 bg-slate-900/50 lg:hidden"
          onClick={onMobileClose}
        />
      )}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex h-screen w-[264px] shrink-0 flex-col border-r border-slate-200 bg-white transition-transform duration-200 dark:border-slate-800 dark:bg-slate-900",
          "lg:sticky lg:top-0 lg:z-0 lg:translate-x-0 lg:transition-[width]",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
          collapsed ? "lg:w-[76px]" : "lg:w-[264px]"
        )}
      >
      <div className="flex h-16 shrink-0 items-center justify-between border-b border-slate-100 px-5 dark:border-slate-800">
        <div className={cn(collapsed && "lg:hidden")}>
          <Logo />
        </div>
        {collapsed && (
          <span className="hidden h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 shadow-lg shadow-blue-500/30 lg:flex">
            <span className="text-sm font-bold text-white">AF</span>
          </span>
        )}
        <button
          type="button"
          onClick={onMobileClose}
          aria-label="Close menu"
          className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 lg:hidden"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-5">
        {visibleSections.map((section, i) => (
          <div key={section.title ?? i}>
            {section.title && !collapsed && (
              <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                {section.title}
              </p>
            )}
            <ul className="space-y-1">
              {section.items.map((item) => {
                const active =
                  item.href === "/dashboard"
                    ? pathname === "/dashboard"
                    : pathname.startsWith(item.href);
                const Icon = item.icon;
                const badge =
                  item.href === "/dashboard/assets"
                    ? summary?.total_assets
                    : item.href === "/dashboard/notifications"
                      ? unreadCount || undefined
                      : item.href === "/dashboard/service"
                        ? serviceAttention || undefined
                        : item.href === "/dashboard/accessories"
                          ? attention?.low_stock_accessories_count || undefined
                          : item.badge;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      title={collapsed ? item.label : undefined}
                      onClick={onMobileClose}
                      className={cn(
                        "group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition duration-200 ease-in-out hover:-translate-y-0.5 hover:shadow-sm hover:shadow-slate-900/5",
                        active
                          ? "bg-blue-50 text-blue-700 hover:bg-blue-100 dark:bg-blue-500/10 dark:text-blue-400 dark:hover:bg-blue-500/20"
                          : "text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100",
                        collapsed && "justify-center px-0"
                      )}
                    >
                      {active && (
                        <span className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-blue-600" />
                      )}
                      <Icon className="h-[18px] w-[18px] shrink-0" strokeWidth={2} />
                      {!collapsed && <span className="truncate">{item.label}</span>}
                      {!collapsed && badge !== undefined && (
                        <span
                          className={cn(
                            "ml-auto flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold",
                            active
                              ? "bg-blue-600 text-white"
                              : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                          )}
                        >
                          {badge}
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="shrink-0 border-t border-slate-100 p-3 dark:border-slate-800">
        <div className="relative">
          {profileOpen && (
            <>
              <button
                aria-label="Close"
                className="fixed inset-0 z-10 cursor-default"
                onClick={() => setProfileOpen(false)}
              />
              <div className="absolute bottom-full left-0 z-20 mb-2 w-56 overflow-hidden rounded-xl border border-slate-200 bg-white py-1.5 shadow-lg shadow-slate-900/10 dark:border-slate-800 dark:bg-slate-900">
                <div className="border-b border-slate-100 px-4 py-3 dark:border-slate-800">
                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                    {displayName}
                  </p>
                  <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                    {user?.email ?? "Not signed in"}
                  </p>
                </div>
                <Link
                  href="/dashboard/profile"
                  onClick={() => setProfileOpen(false)}
                  className="flex items-center gap-2.5 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  <UserRound className="h-4 w-4" />
                  My profile
                </Link>
                <Link
                  href="/dashboard/settings"
                  onClick={() => setProfileOpen(false)}
                  className="flex items-center gap-2.5 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  <Settings className="h-4 w-4" />
                  Settings
                </Link>
                <button
                  type="button"
                  onClick={() => {
                    setProfileOpen(false);
                    void signOut();
                  }}
                  className="flex w-full cursor-pointer items-center gap-2.5 px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10"
                >
                  <LogOut className="h-4 w-4" />
                  Sign out
                </button>
              </div>
            </>
          )}
          <button
            type="button"
            onClick={() => setProfileOpen((v) => !v)}
            title={collapsed ? [displayName, roleLabel].filter(Boolean).join(" · ") : undefined}
            className={cn(
              "flex w-full cursor-pointer items-center gap-3 rounded-lg px-2 py-2 text-left transition hover:bg-slate-50 dark:hover:bg-slate-800",
              collapsed && "justify-center px-0"
            )}
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-blue-600 text-sm font-semibold text-white">
              {initials}
            </span>
            {!collapsed && (
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">
                  {displayName}
                </p>
                {/* The user's active roles, from GET /api/accounts/me/. */}
                <p className="truncate text-xs text-slate-500 dark:text-slate-400">{roleLabel}</p>
              </div>
            )}
          </button>
        </div>
        <button
          type="button"
          onClick={onToggle}
          className={cn(
            "mt-2 hidden w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-slate-200 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50 dark:border-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 lg:flex"
          )}
        >
          {collapsed ? (
            <ChevronsRight className="h-4 w-4" />
          ) : (
            <>
              <ChevronsLeft className="h-4 w-4" />
              Collapse
            </>
          )}
        </button>
      </div>
      </aside>
    </>
  );
}
