export type StatusLabel = "Assigned" | "Available" | "In Repair" | "Reserved" | "Maintenance";

// Display metadata (label order + colors) per asset status. Counts always
// come from the backend (e.g. /api/dashboard/ by_status).
export const STATUS_BREAKDOWN: {
  label: StatusLabel;
  hex: string;
  bar: string;
  chip: string;
}[] = [
  { label: "Assigned", hex: "#3b82f6", bar: "bg-blue-500", chip: "bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400" },
  { label: "Available", hex: "#10b981", bar: "bg-emerald-500", chip: "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400" },
  { label: "In Repair", hex: "#ef4444", bar: "bg-red-500", chip: "bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400" },
  { label: "Reserved", hex: "#8b5cf6", bar: "bg-violet-500", chip: "bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-400" },
  { label: "Maintenance", hex: "#f59e0b", bar: "bg-amber-500", chip: "bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400" },
];

export function statusChip(label: string) {
  return (
    STATUS_BREAKDOWN.find((s) => s.label === label)?.chip ??
    "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
  );
}

export const CATEGORY_SINGULAR: Record<string, string> = {
  Laptops: "Laptop",
  Desktops: "Desktop",
  Monitors: "Monitor",
  "Mobile Devices": "Mobile Device",
  Networking: "Networking",
  Peripherals: "Peripheral",
};

const now = new Date();
export const TODAY = new Date(now.getFullYear(), now.getMonth(), now.getDate());

export function formatDate(d: Date) {
  return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
}

export function addDays(d: Date, days: number) {
  return new Date(d.getTime() + days * 86_400_000);
}

export const CONDITION_STYLES: Record<string, string> = {
  Good: "bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400",
  Fair: "bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400",
  Poor: "bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400",
};

export const WARRANTY_STYLES: Record<string, string> = {
  Active: "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400",
  Expiring: "bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400",
  Expired: "bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400",
};

export type Asset = {
  id: number;
  tag: string;
  assetTag: string;
  name: string;
  category: string;
  serial: string;
  department: string;
  location: string;
  assignedTo: string | null;
  status: StatusLabel;
  condition: "Good" | "Fair" | "Poor";
  cost: number;
  currentValue: number;
  // Real backend purchase_date; null when none was recorded (never
  // substituted with created_at or today).
  purchaseDate: Date | null;
  // The same value as the raw 'YYYY-MM-DD' string (null when not recorded).
  purchaseDateRaw: string | null;
  vendor: string;
  // Catalog brand/model names from the Asset.brand / Asset.model FKs ("" when unset).
  brand: string;
  model: string;
  warranty: "Active" | "Expiring" | "Expired";
  // Real warranty dates from the backend (null when none is on file).
  // `warranty` is derived from warrantyEndDate by the backend.
  warrantyStartDate: Date | null;
  warrantyEndDate: Date | null;
  warrantyProvider: string;
  warrantyDaysRemaining: number | null;
};
