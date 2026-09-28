import {
  Cloud,
  Code,
  Infinity as InfinityIcon,
  MessageSquare,
  Monitor,
  Package,
  Palette,
  RefreshCw,
  ShieldCheck,
  ShoppingBag,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { TODAY, formatDate } from "@/components/assets/data";

export { formatDate };

export type LicenseCategory =
  | "Productivity"
  | "Security"
  | "Design"
  | "Development"
  | "Communication"
  | "Cloud Storage"
  | "Operating System"
  | "Other";

export const LICENSE_CATEGORIES: LicenseCategory[] = [
  "Productivity",
  "Security",
  "Design",
  "Development",
  "Communication",
  "Cloud Storage",
  "Operating System",
  "Other",
];

export const LICENSE_CATEGORY_META: Record<LicenseCategory, { icon: LucideIcon; chip: string }> = {
  Productivity: { icon: Package, chip: "bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400" },
  Security: { icon: ShieldCheck, chip: "bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400" },
  Design: { icon: Palette, chip: "bg-pink-50 text-pink-600 dark:bg-pink-500/10 dark:text-pink-400" },
  Development: { icon: Code, chip: "bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-400" },
  Communication: {
    icon: MessageSquare,
    chip: "bg-cyan-50 text-cyan-600 dark:bg-cyan-500/10 dark:text-cyan-400",
  },
  "Cloud Storage": { icon: Cloud, chip: "bg-sky-50 text-sky-600 dark:bg-sky-500/10 dark:text-sky-400" },
  "Operating System": {
    icon: Monitor,
    chip: "bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400",
  },
  Other: { icon: Package, chip: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300" },
};

export type LicenseType = "Monthly" | "Annual" | "Perpetual" | "One-Time";

export const LICENSE_TYPES: LicenseType[] = ["Monthly", "Annual", "Perpetual", "One-Time"];

export const LICENSE_TYPE_META: Record<LicenseType, { icon: LucideIcon; chip: string; costSuffix: string }> = {
  Monthly: { icon: RefreshCw, chip: "bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400", costSuffix: "/mo" },
  Annual: { icon: RefreshCw, chip: "bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-400", costSuffix: "/yr" },
  Perpetual: {
    icon: InfinityIcon,
    chip: "bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400",
    costSuffix: "one-time",
  },
  "One-Time": {
    icon: ShoppingBag,
    chip: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
    costSuffix: "one-time",
  },
};

export function termDaysFor(type: LicenseType) {
  if (type === "Monthly") return 30;
  if (type === "Annual") return 365;
  if (type === "One-Time") return 365;
  return 0;
}

export type LicenseStatus = "Active" | "Expiring Soon" | "Expired" | "Perpetual";

export const LICENSE_STATUSES: LicenseStatus[] = ["Active", "Expiring Soon", "Expired", "Perpetual"];

export const LICENSE_STATUS_META: Record<LicenseStatus, { icon: LucideIcon; chip: string }> = {
  Active: { icon: CheckCircle2, chip: "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400" },
  "Expiring Soon": { icon: AlertTriangle, chip: "bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400" },
  Expired: { icon: XCircle, chip: "bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400" },
  Perpetual: { icon: InfinityIcon, chip: "bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400" },
};

export type SoftwareLicense = {
  id: number;
  licenseId: string;
  name: string;
  vendor: string;
  category: LicenseCategory;
  licenseType: LicenseType;
  licenseKey: string;
  totalSeats: number;
  seatsUsed: number;
  // null when not recorded — never substituted with today.
  purchaseDate: Date | null;
  expiryDate: Date | null;
  autoRenew: boolean;
  cost: number;
  notes: string;
};

export function availableSeats(l: SoftwareLicense) {
  return l.totalSeats - l.seatsUsed;
}

export function utilizationPct(l: SoftwareLicense) {
  return l.totalSeats > 0 ? Math.round((l.seatsUsed / l.totalSeats) * 100) : 0;
}

export function daysToExpiry(l: SoftwareLicense) {
  if (!l.expiryDate) return null;
  return Math.round((l.expiryDate.getTime() - TODAY.getTime()) / 86_400_000);
}

export function licenseStatus(l: SoftwareLicense): LicenseStatus {
  if (l.licenseType === "Perpetual" || !l.expiryDate) return "Perpetual";
  const days = daysToExpiry(l);
  if (days === null) return "Perpetual";
  if (days < 0) return "Expired";
  if (days <= 30) return "Expiring Soon";
  return "Active";
}

export function maskLicenseKey(key: string) {
  if (key.length <= 4) return key;
  return `${"•".repeat(Math.max(0, key.length - 4))}${key.slice(-4)}`;
}

