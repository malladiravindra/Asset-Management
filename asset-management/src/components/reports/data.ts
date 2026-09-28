/**
 * Reports display helpers.
 *
 * The compute* functions that previously ran against the in-memory mock Asset
 * arrays have been removed from Reports usage — all calculations now come from
 * the Django backend (ReportSummaryAPIView).  The remaining items here are
 * purely presentation helpers:
 *
 *  • STATUS_META / WARRANTY_META / CONDITION_META — colour/chip metadata
 *    consumed by report-view.tsx to decorate the backend-provided breakdown
 *    items with the correct hex colours and Tailwind chip classes.
 *  • currency() — number → "₹X.XL" / "₹X.XK" formatter.
 *  • assetsToCSV() — converts the /api/reports/assets/ response into a
 *    downloadable CSV string (still generated in the browser, but now always
 *    backed by real API data).
 */

import type { ReportAsset } from "@/components/reports/api";

// ─── status ──────────────────────────────────────────────────────────────────

const STATUS_META: Record<string, { hex: string; chip: string }> = {
  Assigned: {
    hex: "#3b82f6",
    chip: "bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400",
  },
  Available: {
    hex: "#10b981",
    chip: "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400",
  },
  "In Repair": {
    hex: "#ef4444",
    chip: "bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400",
  },
  Reserved: {
    hex: "#8b5cf6",
    chip: "bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-400",
  },
  Maintenance: {
    hex: "#f59e0b",
    chip: "bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400",
  },
};

// ─── warranty ─────────────────────────────────────────────────────────────────

const WARRANTY_META: Record<string, { hex: string; chip: string }> = {
  Active: {
    hex: "#10b981",
    chip: "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400",
  },
  Expiring: {
    hex: "#f59e0b",
    chip: "bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400",
  },
  Expired: {
    hex: "#ef4444",
    chip: "bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400",
  },
};

// ─── condition ────────────────────────────────────────────────────────────────

const CONDITION_META: Record<string, { hex: string; chip: string }> = {
  Good: {
    hex: "#3b82f6",
    chip: "bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400",
  },
  Fair: {
    hex: "#f59e0b",
    chip: "bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400",
  },
  Poor: {
    hex: "#ef4444",
    chip: "bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400",
  },
};

// ─── exports ──────────────────────────────────────────────────────────────────

export { STATUS_META, WARRANTY_META, CONDITION_META };

/** Currency formatter: 1_00_000 → "₹1.0L", 5_000 → "₹5.0K", 500 → "₹500" */
export function currency(n: number) {
  if (Math.abs(n) >= 100_000) return `₹${(n / 100_000).toFixed(1)}L`;
  if (Math.abs(n) >= 1_000)   return `₹${(n / 1_000).toFixed(1)}K`;
  return `₹${n.toLocaleString("en-IN")}`;
}

/**
 * Convert a list of assets from the Reports API (/api/reports/assets/) into a
 * CSV string.  The column names and field order match the spec (§24, §29).
 *
 * NOTE: The CSV is still generated in the browser (the existing Export CSV
 * button behaviour is preserved), but the source data now always comes from
 * the real API rather than the old generateAssets() mock seed.
 */
export function assetsToCSV(assets: ReportAsset[]): string {
  const header = [
    "Asset Tag",
    "Name",
    "Category",
    "Department",
    "Status",
    "Condition",
    "Location",
    "Assigned To",
    "Purchase Cost",
    "Current Value",
    "Purchase Date",
    "Warranty",
  ];

  const rows = assets.map((a) => [
    a.tag,
    a.name,
    a.category,
    a.department,
    a.status,
    a.condition,
    a.location,
    a.assignedTo ?? "—",
    a.cost,
    a.currentValue,
    a.purchaseDate ?? "—",
    a.warranty,
  ]);

  const escape = (v: string | number | null) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };

  return [header, ...rows].map((r) => r.map(escape).join(",")).join("\n");
}
