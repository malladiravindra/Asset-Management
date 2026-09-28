import type { LucideIcon } from "lucide-react";
import {
  Bell,
  Boxes,
  Cable,
  ClipboardList,
  FileBarChart,
  FileText,
  HelpCircle,
  Headphones,
  LayoutDashboard,
  ListChecks,
  MapPin,
  Settings,
  Shield,
  Store,
  Tags,
  UserCircle,
  Users,
  Wrench,
} from "lucide-react";

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  badge?: number;
  /** Shown only to users holding at least one of these Django permissions
   *  (from GET /api/accounts/me/). Navigation visibility only — the API
   *  enforces the same permissions on every request. */
  permissions?: string[];
  /** Also shown to is_staff users (the page's API admits staff). */
  staffAccess?: boolean;
};

export type NavSection = {
  title?: string;
  items: NavItem[];
};

export const NAV_SECTIONS: NavSection[] = [
  {
    items: [{ label: "Dashboard", href: "/dashboard", icon: LayoutDashboard }],
  },
  {
    title: "Inventory",
    items: [
      { label: "All Assets", href: "/dashboard/assets", icon: Boxes, permissions: ["assets.view_asset"] },
      {
        label: "Catalog",
        href: "/dashboard/catalog",
        icon: Tags,
        permissions: ["catalog.view_category", "catalog.view_brand", "catalog.view_model"],
      },
    ],
  },
  {
    title: "Organization",
    items: [
      {
        label: "Organization",
        href: "/dashboard/organization",
        icon: Users,
        permissions: ["assets.view_employee", "assets.view_department"],
      },
      { label: "Workplaces", href: "/dashboard/locations", icon: MapPin, permissions: ["assets.view_location"] },
      { label: "Vendors", href: "/dashboard/vendors", icon: Store, permissions: ["organization.view_vendor"] },
    ],
  },
  {
    title: "Operations",
    items: [
      {
        label: "Purchase Orders",
        href: "/dashboard/purchase-orders",
        icon: FileText,
        permissions: ["operations.view_purchaseorder"],
      },
      {
        label: "Assignments",
        href: "/dashboard/assignments",
        icon: ClipboardList,
        permissions: ["operations.view_assignment"],
      },
      {
        label: "Service",
        href: "/dashboard/service",
        icon: Wrench,
        permissions: ["operation.view_maintenancerecord", "operation.view_repairrecord", "operation.view_softwarelicense"],
      },
      { label: "Accessories", href: "/dashboard/accessories", icon: Cable, permissions: ["operation.view_accessory"] },
    ],
  },
  {
    items: [
      { label: "Reports", href: "/dashboard/reports", icon: FileBarChart, permissions: ["assets.view_asset"] },
      {
        label: "Audit Logs",
        href: "/dashboard/audit-logs",
        icon: ListChecks,
        permissions: ["aduitlog.view_auditlog"],
        staffAccess: true,
      },
      { label: "Notifications", href: "/dashboard/notifications", icon: Bell },
    ],
  },
  {
    title: "Settings",
    items: [
      // GET /api/settings/ admits every signed-in user (read-only unless
      // they hold system_settings.change_systemsettings or are staff).
      { label: "Settings", href: "/dashboard/settings", icon: Settings },
      {
        label: "Roles & Permissions",
        href: "/dashboard/roles-permissions",
        icon: Shield,
        permissions: ["auth.view_group", "auth.view_user"],
      },
      { label: "Profile", href: "/dashboard/profile", icon: UserCircle },
      { label: "Help Center", href: "/dashboard/help-center", icon: HelpCircle },
      { label: "Support", href: "/dashboard/support", icon: Headphones },
    ],
  },
];

export const NAV_ITEMS: NavItem[] = NAV_SECTIONS.flatMap((section) => section.items);

/** Whether `item` is shown to the signed-in user. Permission-gated items
 *  stay hidden until /me has loaded, never shown on a guess. */
export function isNavItemVisible(
  item: NavItem,
  me: { user: { is_staff: boolean } } | null,
  can: (permission: string) => boolean
): boolean {
  if (!item.permissions) return true;
  if (me === null) return false;
  return Boolean(item.staffAccess && me.user.is_staff) || item.permissions.some((p) => can(p));
}
