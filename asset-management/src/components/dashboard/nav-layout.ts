import { useEffect } from "react";
import { isNavItemVisible, NAV_SECTIONS, type NavItem } from "@/lib/nav";
import { useCurrentUser } from "@/components/auth/context";
import { useDashboard } from "@/components/dashboard/context";
import { useNotifications } from "@/components/notifications/context";

// Every route/icon comes from NAV_SECTIONS (src/lib/nav.ts); this only decides
// how items are grouped into top-level links and labelled sections.
export type NavEntry =
  | { kind: "link"; href: string }
  | { kind: "section"; id: string; label: string; hrefs: string[] };

export const NAV_LAYOUT: NavEntry[] = [
  { kind: "link", href: "/dashboard" },
  { kind: "section", id: "inventory", label: "Inventory", hrefs: ["/dashboard/assets", "/dashboard/catalog"] },
  {
    kind: "section",
    id: "organization",
    label: "Organization",
    hrefs: ["/dashboard/organization", "/dashboard/locations", "/dashboard/vendors"],
  },
  {
    kind: "section",
    id: "operations",
    label: "Operations",
    hrefs: [
      "/dashboard/purchase-orders",
      "/dashboard/assignments",
      "/dashboard/service",
      "/dashboard/accessories",
    ],
  },
  { kind: "link", href: "/dashboard/reports" },
  { kind: "section", id: "more", label: "More", hrefs: ["/dashboard/audit-logs", "/dashboard/notifications"] },
  {
    kind: "section",
    id: "settings",
    label: "Settings",
    hrefs: [
      "/dashboard/settings",
      "/dashboard/roles-permissions",
      "/dashboard/profile",
      "/dashboard/help-center",
      "/dashboard/support",
    ],
  },
];

export const ITEM_BY_HREF = new Map<string, NavItem>(NAV_SECTIONS.flatMap((s) => s.items).map((i) => [i.href, i]));

export function isActiveHref(pathname: string, href: string) {
  return href === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(href);
}

/**
 * Permission-filtered nav items plus their count badges. Permission-gated items
 * appear once /me has loaded, never on a guess. Badges are backend numbers:
 * unread count from /api/notifications/ and record counts from the shared
 * /api/dashboard/ summary.
 */
export function useNavItems(pathname: string) {
  const { me, can } = useCurrentUser();
  const { unreadCount } = useNotifications();
  const { data: summary, revalidate } = useDashboard();
  const attention = summary?.attention;
  const serviceAttention = attention
    ? attention.overdue_maintenance_count + attention.overdue_repair_count + attention.licenses_attention_count
    : 0;

  // Keep the badge counts reasonably fresh while navigating (at most one
  // summary request per 30 s; the Dashboard page shares the same data).
  useEffect(() => {
    revalidate(30_000);
  }, [pathname, revalidate]);

  const visibleHrefs = new Set(
    NAV_SECTIONS.flatMap((s) => s.items)
      .filter((item) => isNavItemVisible(item, me, can))
      .map((item) => item.href)
  );

  function badgeFor(item: NavItem): number | undefined {
    if (item.href === "/dashboard/assets") return summary?.total_assets;
    if (item.href === "/dashboard/notifications") return unreadCount || undefined;
    if (item.href === "/dashboard/service") return serviceAttention || undefined;
    if (item.href === "/dashboard/accessories") return attention?.low_stock_accessories_count || undefined;
    return item.badge;
  }

  return { visibleHrefs, badgeFor };
}
