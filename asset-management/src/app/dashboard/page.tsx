"use client";

import { useEffect, useMemo } from "react";
import {
  ArrowRight,
  BarChart3,
  Boxes,
  Crown,
  FileText,
  IndianRupee,
  PackageCheck,
  Plus,
  ShieldAlert,
  UserCheck,
  Wrench,
} from "lucide-react";
import Link from "next/link";
import { displayNameFor, useCurrentUser } from "@/components/auth/context";
import { GreetingLabel } from "@/components/dashboard/greeting-label";
import { StatCard } from "@/components/dashboard/stat-card";
import { TodayLabel } from "@/components/dashboard/today-label";
import { useDashboard } from "@/components/dashboard/context";
import { ACTION_META, timeAgo } from "@/components/audit-logs/data";
import { useCategories } from "@/components/categories/context";
import { useDepartments } from "@/components/departments/context";
import { colorFor, iconFor } from "@/components/departments/data";
import { STATUS_BREAKDOWN, statusChip } from "@/components/assets/data";

const QUICK_ACTIONS = [
  {
    label: "Add Asset",
    detail: "Register new asset",
    icon: Plus,
    href: "/dashboard/assets",
    tone: "bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400",
  },
  {
    label: "Assign Asset",
    detail: "Issue to employee",
    icon: UserCheck,
    href: "/dashboard/assignments",
    tone: "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400",
  },
  {
    label: "Maintenance",
    detail: "Preventive service",
    icon: Wrench,
    href: "/dashboard/maintenance",
    tone: "bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400",
  },
  {
    label: "Reports",
    detail: "Export analytics",
    icon: BarChart3,
    href: "/dashboard/reports",
    tone: "bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-400",
  },
  {
    label: "Purchase Order",
    detail: "New procurement",
    icon: FileText,
    href: "/dashboard/purchase-orders",
    tone: "bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400",
  },
];

function buildConicGradient(segments: { count: number; hex: string }[], total: number) {
  let acc = 0;
  const stops = segments.map((s) => {
    const start = acc;
    acc += (s.count / total) * 100;
    return `${s.hex} ${start}% ${acc}%`;
  });
  return `conic-gradient(${stops.join(", ")})`;
}

export default function DashboardPage() {
  const { user } = useCurrentUser();
  // Single source of truth for every stat/breakdown on this page — one
  // GET /api/dashboard/ request, computed server-side from the live
  // database (see asset_backend/dashboard/views.py). Departments/Categories
  // below are only used for their icon/color metadata (name -> swatch),
  // never for counts.
  const { data, loading, error, revalidate } = useDashboard();
  // Visiting the page shows current numbers; a summary loaded moments ago
  // (e.g. by the sidebar on this same navigation) is reused, not re-fetched.
  useEffect(() => {
    revalidate(5_000);
  }, [revalidate]);
  const { departments } = useDepartments();
  const { categories } = useCategories();

  const statusBreakdown = useMemo(() => {
    if (!data) return [];
    return STATUS_BREAKDOWN.map((s) => {
      const row = data.by_status.find((r) => r.status === s.label);
      return { ...s, count: row?.count ?? 0, percentage: row?.percentage ?? 0 };
    });
  }, [data]);

  const departmentBreakdown = useMemo(() => {
    if (!data) return [];
    return data.by_department
      .map((row) => {
        const dept = departments.find((d) => d.name === row.department_name);
        const color = colorFor(dept?.colorKey ?? "blue");
        return {
          label: row.department_name,
          icon: iconFor(dept?.iconLabel ?? ""),
          bar: color.bar,
          chip: color.chip,
          count: row.asset_count,
          percentage: row.percentage,
        };
      })
      .sort((a, b) => b.count - a.count);
  }, [data, departments]);
  const maxDepartmentCount = Math.max(1, ...departmentBreakdown.map((d) => d.count));
  const topDepartments = departmentBreakdown.slice(0, 7);

  const categoryBreakdown = useMemo(() => {
    if (!data) return [];
    return data.by_category
      .map((row) => {
        const cat = categories.find((c) => c.name === row.category_name);
        return {
          label: row.category_name,
          bar: colorFor(cat?.colorKey ?? "blue").bar,
          count: row.asset_count,
        };
      })
      .sort((a, b) => b.count - a.count);
  }, [data, categories]);
  const maxCategoryCount = Math.max(1, ...categoryBreakdown.map((c) => c.count));

  const recentActivity = useMemo(() => {
    if (!data) return [];
    return data.recent_activity.map((log) => ({
      icon: ACTION_META[log.action].icon,
      tone: ACTION_META[log.action].chip,
      text: log.title,
      time: timeAgo(new Date(log.timestamp)),
    }));
  }, [data]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-slate-400 dark:text-slate-500">
        Loading dashboard…
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm font-medium text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400">
        Couldn&apos;t load the dashboard: {error ?? "No data returned by the server."}
      </div>
    );
  }

  const totalAssets = data.total_assets;
  const availableCount = data.available_count;
  const assignedCount = data.assigned_count;
  const underService = data.under_service_count;
  const warrantyAlerts = data.warranty_alerts;
  const availablePct = statusBreakdown.find((s) => s.label === "Available")?.percentage ?? 0;
  const assignedPct = statusBreakdown.find((s) => s.label === "Assigned")?.percentage ?? 0;

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-blue-700 via-blue-600 to-indigo-700 p-8 animate-zoom-in">
        <div className="absolute -right-16 -top-16 h-56 w-56 rounded-full bg-white/10 blur-2xl" />
        <div className="absolute -bottom-20 right-24 h-48 w-48 rounded-full bg-blue-400/20 blur-2xl" />
        <div className="relative flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
          <div>
            <TodayLabel />
            <h1 className="mt-1 text-3xl font-bold text-white">
              <GreetingLabel />, {displayNameFor(user)} 👋
            </h1>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-blue-100">
              Here&apos;s what&apos;s happening with your fleet of {totalAssets} assets today —
              {" "}
              {underService} items need maintenance attention and {data.warranty_alerts_count}{" "}
              warranties expire soon.
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-3">
            <Link
              href="/dashboard/assets"
              className="flex items-center gap-2 rounded-lg bg-white px-4 py-2.5 text-sm font-semibold text-blue-700 shadow-sm transition hover:bg-blue-50"
            >
              <Plus className="h-4 w-4" />
              Add Asset
            </Link>
            <Link
              href="/dashboard/reports"
              className="flex items-center gap-2 rounded-lg bg-white/10 px-4 py-2.5 text-sm font-semibold text-white ring-1 ring-inset ring-white/25 transition hover:bg-white/20"
            >
              View Reports
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
        <StatCard
          icon={Boxes}
          tone="blue"
          label="Total Assets"
          value={String(totalAssets)}
          sublabel="Across all categories"
          style={{ animationDelay: "80ms" }}
        />
        <StatCard
          icon={PackageCheck}
          tone="emerald"
          label="Available"
          value={String(availableCount)}
          sublabel={`${availablePct}% of fleet, ready to deploy`}
          style={{ animationDelay: "140ms" }}
        />
        <StatCard
          icon={UserCheck}
          tone="indigo"
          label="Assigned"
          value={String(assignedCount)}
          sublabel={`${assignedPct}% utilization`}
          style={{ animationDelay: "200ms" }}
        />
        <StatCard
          icon={Wrench}
          tone="amber"
          label="Under Service"
          value={String(underService)}
          sublabel="In repair or scheduled maintenance"
          style={{ animationDelay: "260ms" }}
        />
        <StatCard
          icon={ShieldAlert}
          tone="red"
          label="Warranty Alerts"
          value={String(data.warranty_alerts_count)}
          sublabel="Assets with warranty expiring"
          style={{ animationDelay: "320ms" }}
        />
        <StatCard
          icon={IndianRupee}
          tone="violet"
          label="Current Value"
          value={`₹${(data.total_current_value / 100000).toFixed(1)}L`}
          sublabel={`of ₹${(data.total_purchase_cost / 100000).toFixed(1)}L purchased`}
          style={{ animationDelay: "380ms" }}
        />
      </section>

      <section>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {QUICK_ACTIONS.map((qa, i) =>
            qa.href ? (
              <Link
                key={qa.label}
                href={qa.href}
                style={{ animationDelay: `${420 + i * 60}ms` }}
                className="group flex flex-col items-center gap-3 rounded-2xl border-2 border-slate-200 bg-white px-4 py-6 text-center shadow-sm shadow-slate-900/[0.02] transition hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-md hover:shadow-slate-900/5 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-blue-500 animate-zoom-in"
              >
                <span className={`flex h-12 w-12 items-center justify-center rounded-xl transition group-hover:scale-105 ${qa.tone}`}>
                  <qa.icon className="h-6 w-6" strokeWidth={2} />
                </span>
                <div>
                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                    {qa.label}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">{qa.detail}</p>
                </div>
              </Link>
            ) : (
              <button
                key={qa.label}
                type="button"
                style={{ animationDelay: `${420 + i * 60}ms` }}
                className="group flex flex-col items-center gap-3 rounded-2xl border-2 border-slate-200 bg-white px-4 py-6 text-center shadow-sm shadow-slate-900/[0.02] transition hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-md hover:shadow-slate-900/5 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-blue-500 animate-zoom-in"
              >
                <span className={`flex h-12 w-12 items-center justify-center rounded-xl transition group-hover:scale-105 ${qa.tone}`}>
                  <qa.icon className="h-6 w-6" strokeWidth={2} />
                </span>
                <div>
                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                    {qa.label}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">{qa.detail}</p>
                </div>
              </button>
            )
          )}
        </div>
      </section>

      <section
        className="grid grid-cols-1 gap-4 lg:grid-cols-2 animate-zoom-in"
        style={{ animationDelay: "520ms" }}
      >
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm shadow-slate-900/[0.02] dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                Assets by Department
              </h2>
              <p className="text-xs text-slate-400 dark:text-slate-500">Fleet allocation across teams</p>
            </div>
            <Link
              href="/dashboard/organization?tab=departments"
              className="text-sm font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400"
            >
              View all
            </Link>
          </div>
          <div className="mt-6 space-y-4">
            {topDepartments.map((d, i) => (
              <div key={d.label} className="flex items-center gap-3">
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${d.chip}`}>
                  <d.icon className="h-4.5 w-4.5" strokeWidth={2} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="mb-1.5 flex items-center justify-between text-sm">
                    <span className="flex items-center gap-1.5 font-medium text-slate-700 dark:text-slate-300">
                      {d.label}
                      {i === 0 && d.count > 0 && (
                        <span className="flex items-center gap-0.5 rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-600 dark:bg-amber-500/10 dark:text-amber-400">
                          <Crown className="h-2.5 w-2.5" />
                          Top
                        </span>
                      )}
                    </span>
                    <span className="text-slate-400 dark:text-slate-500">
                      {d.count} assets · {d.percentage}%
                    </span>
                  </div>
                  <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                    <div
                      className={`h-full rounded-full bg-gradient-to-r ${d.bar}`}
                      style={{ width: `${(d.count / maxDepartmentCount) * 100}%` }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm shadow-slate-900/[0.02] dark:border-slate-800 dark:bg-slate-900">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">
              Assets by Status
            </h2>
            <p className="text-xs text-slate-400 dark:text-slate-500">Fleet distribution</p>
          </div>
          <div className="mt-6 flex items-center justify-center">
            <div
              className="relative flex h-36 w-36 items-center justify-center rounded-full"
              style={{ background: buildConicGradient(statusBreakdown, Math.max(1, totalAssets)) }}
            >
              <div className="flex h-24 w-24 flex-col items-center justify-center rounded-full bg-white dark:bg-slate-900">
                <span className="text-xl font-bold text-slate-900 dark:text-white">
                  {totalAssets}
                </span>
                <span className="text-[11px] text-slate-400">assets</span>
              </div>
            </div>
          </div>
          <ul className="mt-6 space-y-3">
            {statusBreakdown.map((s) => (
              <li key={s.label} className="flex items-center gap-3 text-sm">
                <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${s.bar}`} />
                <span className="min-w-0 flex-1 truncate text-slate-600 dark:text-slate-300">
                  {s.label}
                </span>
                <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[11px] font-semibold ${s.chip}`}>
                  {s.percentage}%
                </span>
                <span className="w-5 shrink-0 text-right font-semibold text-slate-800 dark:text-slate-100">
                  {s.count}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section
        className="grid grid-cols-1 gap-4 lg:grid-cols-2 animate-zoom-in"
        style={{ animationDelay: "600ms" }}
      >
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm shadow-slate-900/[0.02] dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">
              Recent Activity
            </h2>
            <Link
              href="/dashboard/assignments"
              className="text-sm font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400"
            >
              View all
            </Link>
          </div>
          <ul className="mt-4 space-y-1">
            {recentActivity.map((a, i) => (
              <li
                key={i}
                className="flex items-start gap-3 rounded-lg px-2 py-2.5 transition hover:bg-slate-50 dark:hover:bg-slate-800/60"
              >
                <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${a.tone}`}>
                  <a.icon className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm text-slate-700 dark:text-slate-200">{a.text}</p>
                  <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">{a.time}</p>
                </div>
              </li>
            ))}
            {recentActivity.length === 0 && (
              <li className="px-2 py-2.5 text-sm text-slate-400 dark:text-slate-500">
                No activity recorded yet.
              </li>
            )}
          </ul>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm shadow-slate-900/[0.02] dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">
              Warranty Alerts
            </h2>
            <span className="flex items-center gap-1.5 rounded-full bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-600 dark:bg-red-500/10 dark:text-red-400">
              <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
              {data.warranty_alerts_count} expiring
            </span>
          </div>
          <ul className="mt-4 space-y-1">
            {warrantyAlerts.map((w) => (
              <li
                key={w.asset_code}
                className="flex items-center gap-3 rounded-lg px-2 py-2.5 transition hover:bg-slate-50 dark:hover:bg-slate-800/60"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-red-50 text-red-500 dark:bg-red-500/10 dark:text-red-400">
                  <ShieldAlert className="h-4.5 w-4.5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">
                    {w.name}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">
                    {w.asset_code} ·{" "}
                    {w.days_left === null
                      ? "Warranty expiring"
                      : `Warranty expires in ${w.days_left} day${w.days_left === 1 ? "" : "s"}`}
                  </p>
                </div>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${statusChip(w.status)}`}>
                  {w.status}
                </span>
              </li>
            ))}
            {warrantyAlerts.length === 0 && (
              <li className="px-2 py-2.5 text-sm text-slate-400 dark:text-slate-500">
                No warranties expiring right now.
              </li>
            )}
          </ul>
        </div>
      </section>

      <section
        className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm shadow-slate-900/[0.02] dark:border-slate-800 dark:bg-slate-900 animate-zoom-in"
        style={{ animationDelay: "680ms" }}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">
            Fleet by Category
          </h2>
          <Link
            href="/dashboard/catalog"
            className="text-sm font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400"
          >
            View all
          </Link>
        </div>
        <div className="mt-6 grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2">
          {categoryBreakdown.map((c) => (
            <div key={c.label}>
              <div className="mb-1.5 flex items-center justify-between text-sm">
                <span className="font-medium text-slate-700 dark:text-slate-300">{c.label}</span>
                <span className="text-slate-400 dark:text-slate-500">{c.count} units</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                <div
                  className={`h-full rounded-full bg-gradient-to-r ${c.bar}`}
                  style={{ width: `${(c.count / maxCategoryCount) * 100}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
