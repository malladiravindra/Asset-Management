"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Bell,
  Boxes,
  Building,
  Building2,
  Cable,
  ChevronRight,
  Home,
  LogOut,
  MapPin,
  Menu,
  RefreshCw,
  Search,
  Settings,
  Store,
  Tags,
  UserRound,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import { NAV_SECTIONS } from "@/lib/nav";
import { displayNameFor, initialsFor, roleLabelFor, useCurrentUser } from "@/components/auth/context";
import { ThemeToggle } from "@/components/dashboard/theme-toggle";
import { useAssets } from "@/components/assets/context";
import { useEmployees } from "@/components/employees/context";
import { useDepartments } from "@/components/departments/context";
import { useLocations } from "@/components/locations/context";
import { useVendors } from "@/components/vendors/context";
import { useCategories } from "@/components/categories/context";
import { useBrands } from "@/components/brands/context";
import { useModels } from "@/components/models/context";
import { useNotifications } from "@/components/notifications/context";
import {
  iconFor as notificationIconFor,
  chipFor as notificationChipFor,
  formatNotificationTime,
} from "@/components/notifications/data";
import { cn } from "@/lib/utils";

const MAX_RESULTS_PER_GROUP = 4;
const MAX_NOTIFICATIONS_PREVIEW = 5;

const ALL_ITEMS = NAV_SECTIONS.flatMap((s) => s.items);

type SearchGroup = {
  key: string;
  label: string;
  icon: LucideIcon;
  href: string;
  items: { id: number; primary: string; secondary: string }[];
};

export function Topbar({
  onMenuClick,
  collapsed,
}: {
  onMenuClick?: () => void;
  collapsed?: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { me, user, signOut } = useCurrentUser();
  const displayName = displayNameFor(user);
  const initials = initialsFor(user);
  const roleLabel = roleLabelFor(me);
  const [notifOpen, setNotifOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState("");

  const current = ALL_ITEMS.find((item) =>
    item.href === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(item.href)
  );

  const q = query.trim().toLowerCase();
  const searchOpen = q.length > 0;

  // Search reads the lists the current page already uses; anything else is
  // fetched only once the user actually types here (never on every page load).
  const onAssets = pathname.startsWith("/dashboard/assets");
  const onOrganization = pathname.startsWith("/dashboard/organization");
  const onLocations = pathname.startsWith("/dashboard/locations");
  const onVendors = pathname.startsWith("/dashboard/vendors");
  const onCatalog = pathname.startsWith("/dashboard/catalog");
  const onDefault = !onAssets && !onOrganization && !onLocations && !onVendors && !onCatalog;
  const { assets } = useAssets({ load: searchOpen && (onAssets || onDefault) });
  const { employees } = useEmployees({ load: searchOpen && (onOrganization || onDefault) });
  const { departments } = useDepartments({ load: searchOpen && onOrganization });
  const { locations } = useLocations({ load: searchOpen && onLocations });
  const { vendors } = useVendors({ load: searchOpen && (onVendors || onDefault) });
  const { categories } = useCategories({ load: searchOpen && onCatalog });
  const { brands } = useBrands({ load: searchOpen && onCatalog });
  const { models } = useModels({ load: searchOpen && onCatalog });
  const { notifications, unreadCount, total: notificationTotal, markAsRead, revalidate } = useNotifications();

  const placeholder = pathname.startsWith("/dashboard/assets")
    ? "Search assets, tags, serials..."
    : pathname.startsWith("/dashboard/organization")
      ? "Search employees, departments..."
      : pathname.startsWith("/dashboard/locations")
        ? "Search locations..."
        : pathname.startsWith("/dashboard/vendors")
          ? "Search vendors..."
          : pathname.startsWith("/dashboard/catalog")
            ? "Search categories, brands, models..."
            : "Search assets, employees, vendors...";

  const groups: SearchGroup[] = useMemo(() => {
    if (!q) return [];

    if (pathname.startsWith("/dashboard/assets")) {
      const items = assets
        .filter(
          (a) =>
            a.name.toLowerCase().includes(q) ||
            a.tag.toLowerCase().includes(q) ||
            a.serial.toLowerCase().includes(q)
        )
        .slice(0, MAX_RESULTS_PER_GROUP)
        .map((a) => ({ id: a.id, primary: a.name, secondary: `${a.tag} · ${a.serial}` }));
      return items.length
        ? [{ key: "assets", label: "Assets", icon: Boxes, href: "/dashboard/assets", items }]
        : [];
    }

    if (pathname.startsWith("/dashboard/organization")) {
      const result: SearchGroup[] = [];
      const employeeItems = employees
        .filter(
          (e) =>
            e.name.toLowerCase().includes(q) ||
            e.employeeId.toLowerCase().includes(q) ||
            e.email.toLowerCase().includes(q)
        )
        .slice(0, MAX_RESULTS_PER_GROUP)
        .map((e) => ({ id: e.id, primary: e.name, secondary: `${e.employeeId} · ${e.designation}` }));
      if (employeeItems.length) {
        result.push({ key: "employees", label: "Employees", icon: Users, href: "/dashboard/organization", items: employeeItems });
      }
      const departmentItems = departments
        .filter((d) => d.name.toLowerCase().includes(q))
        .slice(0, MAX_RESULTS_PER_GROUP)
        .map((d) => ({ id: d.id, primary: d.name, secondary: d.iconLabel }));
      if (departmentItems.length) {
        result.push({ key: "departments", label: "Departments", icon: Building, href: "/dashboard/organization", items: departmentItems });
      }
      return result;
    }

    if (pathname.startsWith("/dashboard/locations")) {
      const items = locations
        .filter((l) => l.name.toLowerCase().includes(q) || l.address.toLowerCase().includes(q))
        .slice(0, MAX_RESULTS_PER_GROUP)
        .map((l) => ({ id: l.id, primary: l.name, secondary: l.address }));
      return items.length
        ? [{ key: "locations", label: "Locations", icon: MapPin, href: "/dashboard/locations", items }]
        : [];
    }

    if (pathname.startsWith("/dashboard/vendors")) {
      const items = vendors
        .filter((v) => v.name.toLowerCase().includes(q))
        .slice(0, MAX_RESULTS_PER_GROUP)
        .map((v) => ({ id: v.id, primary: v.name, secondary: v.type }));
      return items.length
        ? [{ key: "vendors", label: "Vendors", icon: Store, href: "/dashboard/vendors", items }]
        : [];
    }

    if (pathname.startsWith("/dashboard/catalog")) {
      const result: SearchGroup[] = [];
      const categoryItems = categories
        .filter((c) => c.name.toLowerCase().includes(q))
        .slice(0, MAX_RESULTS_PER_GROUP)
        .map((c) => ({ id: c.id, primary: c.name, secondary: "Category" }));
      if (categoryItems.length) {
        result.push({ key: "categories", label: "Categories", icon: Tags, href: "/dashboard/catalog", items: categoryItems });
      }
      const brandItems = brands
        .filter((b) => b.name.toLowerCase().includes(q))
        .slice(0, MAX_RESULTS_PER_GROUP)
        .map((b) => ({ id: b.id, primary: b.name, secondary: "Brand" }));
      if (brandItems.length) {
        result.push({ key: "brands", label: "Brands", icon: Building2, href: "/dashboard/catalog", items: brandItems });
      }
      const modelItems = models
        .filter((m) => m.name.toLowerCase().includes(q) || m.brand.toLowerCase().includes(q))
        .slice(0, MAX_RESULTS_PER_GROUP)
        .map((m) => ({ id: m.id, primary: m.name, secondary: `${m.category} · ${m.brand}` }));
      if (modelItems.length) {
        result.push({ key: "models", label: "Models", icon: Cable, href: "/dashboard/catalog", items: modelItems });
      }
      return result;
    }

    // Default: search across the most common entities.
    const result: SearchGroup[] = [];
    const assetItems = assets
      .filter(
        (a) =>
          a.name.toLowerCase().includes(q) ||
          a.tag.toLowerCase().includes(q) ||
          a.serial.toLowerCase().includes(q)
      )
      .slice(0, MAX_RESULTS_PER_GROUP)
      .map((a) => ({ id: a.id, primary: a.name, secondary: `${a.tag} · ${a.serial}` }));
    if (assetItems.length) {
      result.push({ key: "assets", label: "Assets", icon: Boxes, href: "/dashboard/assets", items: assetItems });
    }
    const employeeItems = employees
      .filter(
        (e) =>
          e.name.toLowerCase().includes(q) ||
          e.employeeId.toLowerCase().includes(q) ||
          e.email.toLowerCase().includes(q)
      )
      .slice(0, MAX_RESULTS_PER_GROUP)
      .map((e) => ({ id: e.id, primary: e.name, secondary: `${e.employeeId} · ${e.designation}` }));
    if (employeeItems.length) {
      result.push({ key: "employees", label: "Employees", icon: Users, href: "/dashboard/organization", items: employeeItems });
    }
    const vendorItems = vendors
      .filter((v) => v.name.toLowerCase().includes(q))
      .slice(0, MAX_RESULTS_PER_GROUP)
      .map((v) => ({ id: v.id, primary: v.name, secondary: v.type }));
    if (vendorItems.length) {
      result.push({ key: "vendors", label: "Vendors", icon: Store, href: "/dashboard/vendors", items: vendorItems });
    }
    return result;
  }, [pathname, q, assets, employees, departments, locations, vendors, categories, brands, models]);

  const totalMatches = groups.reduce((sum, g) => sum + g.items.length, 0);

  function goTo(href: string) {
    router.push(href);
    setQuery("");
  }

  function handleRefresh() {
    setRefreshing(true);
    window.setTimeout(() => window.location.reload(), 400);
  }

  return (
    <header
      className={cn(
        "fixed inset-x-0 top-0 z-20 flex h-16 items-center gap-3 border-b border-slate-200 bg-white/80 px-4 backdrop-blur transition-[left] duration-200 dark:border-slate-800 dark:bg-slate-900/80 sm:gap-4 sm:px-6",
        collapsed ? "lg:left-[76px]" : "lg:left-[264px]"
      )}
    >
      <button
        type="button"
        onClick={onMenuClick}
        aria-label="Open menu"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800 lg:hidden"
      >
        <Menu className="h-5 w-5" />
      </button>

      <button
        type="button"
        onClick={() => {
          if (pathname === "/dashboard") return;
          router.back();
        }}
        disabled={pathname === "/dashboard"}
        aria-label="Go back"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent dark:text-slate-400 dark:hover:bg-slate-800"
      >
        <ArrowLeft className="h-4.5 w-4.5" />
      </button>

      <div className="flex min-w-0 items-center gap-1.5 text-sm">
        <Link
          href="/dashboard"
          aria-label="Go to dashboard home"
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-300"
        >
          <Home className="h-4 w-4" />
        </Link>
        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-300 dark:text-slate-600" />
        <span className="truncate font-semibold text-slate-800 dark:text-slate-100">
          {current?.label ?? "Dashboard"}
        </span>
      </div>

      <div className="relative ml-4 hidden max-w-md flex-1 sm:block">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={placeholder}
          className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-8 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-500/20 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-100 dark:focus:bg-slate-800"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery("")}
            aria-label="Clear search"
            className="absolute right-2.5 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full text-slate-400 hover:bg-slate-200 hover:text-slate-600 dark:hover:bg-slate-700 dark:hover:text-slate-200"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}

        {searchOpen && (
          <>
            <button
              aria-label="Close search results"
              className="fixed inset-0 z-10 cursor-default"
              onClick={() => setQuery("")}
            />
            <div className="absolute left-0 right-0 z-20 mt-2 max-h-96 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg shadow-slate-900/10 dark:border-slate-800 dark:bg-slate-900">
              {totalMatches === 0 ? (
                <p className="px-4 py-6 text-center text-sm text-slate-400 dark:text-slate-500">
                  No matches for &ldquo;{query}&rdquo;.
                </p>
              ) : (
                <div className="py-1.5">
                  {groups.map((group) => (
                    <div key={group.key}>
                      <p className="px-4 pb-1 pt-2 text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                        {group.label}
                      </p>
                      {group.items.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => goTo(group.href)}
                          className="flex w-full items-center gap-3 px-4 py-2 text-left hover:bg-slate-50 dark:hover:bg-slate-800/60"
                        >
                          <group.icon className="h-4 w-4 shrink-0 text-slate-400" />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium text-slate-800 dark:text-slate-100">
                              {item.primary}
                            </span>
                            <span className="block truncate text-xs text-slate-400 dark:text-slate-500">
                              {item.secondary}
                            </span>
                          </span>
                        </button>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      <div className="ml-auto flex items-center gap-2">
        <button
          type="button"
          onClick={handleRefresh}
          aria-label="Refresh"
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition hover:bg-slate-50 hover:text-slate-700 dark:border-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
        >
          <RefreshCw className={cn("h-4.5 w-4.5", refreshing && "animate-spin")} />
        </button>

        <ThemeToggle />

        <div className="relative">
          <button
            type="button"
            onClick={() => {
              const opening = !notifOpen;
              setNotifOpen(opening);
              setUserOpen(false);
              // Opening the bell only previews; a notification is marked
              // read when it is actually opened.
              if (opening) revalidate(15_000);
            }}
            aria-label="Notifications"
            className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition hover:bg-slate-50 hover:text-slate-700 dark:border-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
          >
            <Bell className="h-4.5 w-4.5" />
            {unreadCount > 0 && (
              <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-red-500 ring-2 ring-white dark:ring-slate-900" />
            )}
          </button>

          {notifOpen && (
            <>
              <button
                aria-label="Close"
                className="fixed inset-0 z-10 cursor-default"
                onClick={() => setNotifOpen(false)}
              />
              <div className="absolute right-0 z-20 mt-2 w-80 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg shadow-slate-900/10 dark:border-slate-800 dark:bg-slate-900">
                <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 dark:border-slate-800">
                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                    Notifications
                  </p>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                    {notificationTotal} total
                  </span>
                </div>
                <ul className="max-h-80 overflow-y-auto">
                  {notifications.slice(0, MAX_NOTIFICATIONS_PREVIEW).map((n) => {
                    const Icon = notificationIconFor(n.type);
                    return (
                      <li key={n.id}>
                        <Link
                          href="/dashboard/notifications"
                          onClick={() => {
                            void markAsRead(n.id);
                            setNotifOpen(false);
                          }}
                          className={cn(
                            "flex cursor-pointer gap-3 border-b border-slate-50 px-4 py-3 last:border-0 hover:bg-slate-50 dark:border-slate-800/60 dark:hover:bg-slate-800/60",
                            !n.read && "bg-blue-50/40 dark:bg-blue-500/[0.04]"
                          )}
                        >
                          <span
                            className={cn(
                              "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
                              notificationChipFor(n.type)
                            )}
                          >
                            <Icon className="h-4 w-4" strokeWidth={2} />
                          </span>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-slate-800 dark:text-slate-100">
                              {n.title}
                            </p>
                            <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">
                              {n.message}
                            </p>
                            <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
                              {formatNotificationTime(n.createdAt)}
                            </p>
                          </div>
                        </Link>
                      </li>
                    );
                  })}
                  {notifications.length === 0 && (
                    <li className="px-4 py-6 text-center text-sm text-slate-400 dark:text-slate-500">
                      No notifications yet.
                    </li>
                  )}
                </ul>
                <Link
                  href="/dashboard/notifications"
                  onClick={() => setNotifOpen(false)}
                  className="block border-t border-slate-100 px-4 py-2.5 text-center text-sm font-medium text-blue-600 hover:bg-slate-50 dark:border-slate-800 dark:text-blue-400 dark:hover:bg-slate-800/60"
                >
                  View all
                </Link>
              </div>
            </>
          )}
        </div>

        <div className="relative">
          <button
            type="button"
            onClick={() => {
              setUserOpen((v) => !v);
              setNotifOpen(false);
            }}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-blue-600 text-sm font-semibold text-white"
          >
            {initials}
          </button>

          {userOpen && (
            <>
              <button
                aria-label="Close"
                className="fixed inset-0 z-10 cursor-default"
                onClick={() => setUserOpen(false)}
              />
              <div className="absolute right-0 z-20 mt-2 w-56 overflow-hidden rounded-xl border border-slate-200 bg-white py-1.5 shadow-lg shadow-slate-900/10 dark:border-slate-800 dark:bg-slate-900">
                <div className="border-b border-slate-100 px-4 py-3 dark:border-slate-800">
                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                    {displayName}
                  </p>
                  <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                    {user?.email ?? "Not signed in"}
                  </p>
                  {roleLabel && (
                    <p className="mt-0.5 truncate text-xs text-slate-400 dark:text-slate-500">{roleLabel}</p>
                  )}
                </div>
                <Link
                  href="/dashboard/profile"
                  onClick={() => setUserOpen(false)}
                  className="flex items-center gap-2.5 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  <UserRound className="h-4 w-4" />
                  My profile
                </Link>
                <Link
                  href="/dashboard/settings"
                  onClick={() => setUserOpen(false)}
                  className="flex items-center gap-2.5 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  <Settings className="h-4 w-4" />
                  Settings
                </Link>
                <button
                  type="button"
                  onClick={() => void signOut()}
                  className="flex w-full items-center gap-2.5 px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10"
                >
                  <LogOut className="h-4 w-4" />
                  Sign out
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
