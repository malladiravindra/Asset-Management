"use client";

import { useEffect, useState } from "react";
import { Boxes, Clock3, Crown, IndianRupee, ShieldAlert, UserCheck } from "lucide-react";
import { StatCard } from "@/components/dashboard/stat-card";
import { DonutChart } from "@/components/reports/donut-chart";
import { TrendChart } from "@/components/reports/trend-chart";
import { ExportButtons } from "@/components/reports/export-buttons";
import {
  fetchReportData,
  fetchReportAssets,
  type ReportData,
  type ReportAsset,
} from "@/components/reports/api";
import { STATUS_META, WARRANTY_META, CONDITION_META, currency } from "@/components/reports/data";

const CARD =
  "rounded-2xl border border-slate-200 bg-white p-6 shadow-sm shadow-slate-900/[0.02] dark:border-slate-800 dark:bg-slate-900";

export function ReportView() {
  const [data, setData]         = useState<ReportData | null>(null);
  const [assets, setAssets]     = useState<ReportAsset[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        setError(null);
        // Fetch the summary and the asset list in parallel.
        const [summary, assetList] = await Promise.all([
          fetchReportData(),
          fetchReportAssets(),
        ]);
        if (!cancelled) {
          setData(summary);
          setAssets(assetList);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Failed to load report data."
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, []);

  // ── loading state ────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex min-h-64 items-center justify-center text-sm text-slate-400 dark:text-slate-500">
        Loading report data…
      </div>
    );
  }

  // ── error state ──────────────────────────────────────────────────────────
  if (error || !data) {
    return (
      <div className="flex min-h-64 items-center justify-center text-sm text-red-500">
        {error ?? "Could not load report data. Please try again."}
      </div>
    );
  }

  // ── derived display values ───────────────────────────────────────────────
  const totalAssets     = data.totalAssets || 1;   // denominator guard
  const departmentTotal = data.departmentBreakdown.reduce((s, d) => s + d.count, 0) || 1;
  const departmentMax   = Math.max(...data.departmentBreakdown.map((d) => d.count), 1);
  const categoryMax     = Math.max(...data.categoryBreakdown.map((c) => c.count), 1);

  // Attach display metadata (hex colour, chip class) from the local lookup
  // tables — the backend sends only the structural data (label + count).
  const statusBreakdown = data.statusBreakdown.map((s) => ({
    ...s,
    ...(STATUS_META[s.label] ?? { hex: "#94a3b8", chip: "bg-slate-100 text-slate-600" }),
  }));

  const warrantyBreakdown = data.warrantyBreakdown.map((w) => ({
    ...w,
    ...(WARRANTY_META[w.label] ?? { hex: "#94a3b8", chip: "bg-slate-100 text-slate-600" }),
  }));

  const conditionBreakdown = data.conditionBreakdown.map((c) => ({
    ...c,
    ...(CONDITION_META[c.label] ?? { hex: "#94a3b8", chip: "bg-slate-100 text-slate-600" }),
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between animate-blur-in">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Reports &amp; Analytics</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Fleet-wide insights across status, departments, categories, and financials.
          </p>
        </div>
        <ExportButtons assets={assets} />
      </div>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5 animate-blur-in" style={{ animationDelay: "120ms" }}>
        <StatCard
          icon={Boxes}
          tone="blue"
          label="Total Assets"
          value={String(data.totalAssets)}
          sublabel="Tracked across all categories"
        />
        <StatCard
          icon={UserCheck}
          tone="indigo"
          label="Utilization Rate"
          value={`${data.utilizationRate}%`}
          sublabel="Currently assigned to employees"
        />
        <StatCard
          icon={IndianRupee}
          tone="violet"
          label="Fleet Value"
          value={currency(data.totalValue)}
          sublabel={`of ${currency(data.totalCost)} purchased · ${data.depreciationPct}% depreciated`}
        />
        <StatCard
          icon={Clock3}
          tone="amber"
          label="Average Asset Age"
          value={data.avgAgeLabel}
          sublabel="Since original purchase date"
        />
        <StatCard
          icon={ShieldAlert}
          tone="red"
          label="Warranty Attention"
          value={String(data.warrantyAttention)}
          sublabel="Assets expiring or already expired"
        />
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2 animate-blur-in" style={{ animationDelay: "240ms" }}>
        <div className={CARD}>
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">Status Distribution</h2>
            <p className="text-xs text-slate-400 dark:text-slate-500">Current lifecycle state of the fleet</p>
          </div>
          <div className="mt-6 flex flex-col items-center gap-6 sm:flex-row sm:items-center">
            <DonutChart
              segments={statusBreakdown}
              centerValue={String(data.totalAssets)}
              centerLabel="assets"
            />
            <ul className="w-full flex-1 space-y-1.5">
              {statusBreakdown.map((s) => (
                <li
                  key={s.label}
                  className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-1.5 text-sm transition hover:bg-slate-50 dark:hover:bg-slate-800/60"
                >
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: s.hex }} />
                  <span className="min-w-0 flex-1 truncate text-slate-600 dark:text-slate-300">{s.label}</span>
                  <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[11px] font-semibold ${s.chip}`}>
                    {Math.round((s.count / totalAssets) * 100)}%
                  </span>
                  <span className="w-6 shrink-0 text-right font-semibold text-slate-800 dark:text-slate-100">
                    {s.count}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className={CARD}>
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">Department Distribution</h2>
            <p className="text-xs text-slate-400 dark:text-slate-500">Fleet allocation across teams</p>
          </div>
          <div className="mt-6 space-y-4">
            {data.departmentBreakdown.map((d, i) => (
              <div key={d.label} className="flex items-center gap-3">
                {/* Department icon/chip not available from backend — use a simple coloured
                    dot so the layout is preserved without introducing fake data. */}
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                  <span className="text-xs font-bold">{d.label.slice(0, 2).toUpperCase()}</span>
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
                      {d.count} assets · {Math.round((d.count / departmentTotal) * 100)}%
                    </span>
                  </div>
                  <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-indigo-600"
                      style={{ width: `${(d.count / departmentMax) * 100}%` }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2 animate-blur-in" style={{ animationDelay: "360ms" }}>
        <div className={CARD}>
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">Fleet by Category</h2>
            <p className="text-xs text-slate-400 dark:text-slate-500">Units and purchase value by category</p>
          </div>
          <div className="mt-6 space-y-4">
            {data.categoryBreakdown.map((c) => (
              <div key={c.label}>
                <div className="mb-1.5 flex items-center justify-between text-sm">
                  <span className="font-medium text-slate-700 dark:text-slate-300">{c.label}</span>
                  <span className="text-slate-400 dark:text-slate-500">
                    {c.count} units · {currency(c.value)}
                  </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-blue-500 to-blue-600"
                    style={{ width: `${(c.count / categoryMax) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className={CARD}>
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">Warranty &amp; Condition Health</h2>
            <p className="text-xs text-slate-400 dark:text-slate-500">Coverage status and physical condition</p>
          </div>
          <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2">
            <div>
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                Warranty
              </p>
              <div className="space-y-2.5">
                {warrantyBreakdown.map((w) => (
                  <div key={w.label} className="flex items-center gap-2.5 text-sm">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: w.hex }} />
                    <span className="min-w-0 flex-1 truncate text-slate-600 dark:text-slate-300">{w.label}</span>
                    <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[11px] font-semibold ${w.chip}`}>
                      {w.count}
                    </span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                Condition
              </p>
              <div className="space-y-2.5">
                {conditionBreakdown.map((c) => (
                  <div key={c.label} className="flex items-center gap-2.5 text-sm">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: c.hex }} />
                    <span className="min-w-0 flex-1 truncate text-slate-600 dark:text-slate-300">{c.label}</span>
                    <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[11px] font-semibold ${c.chip}`}>
                      {c.count}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className={`${CARD} animate-blur-in`} style={{ animationDelay: "480ms" }}>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">Acquisition Trend</h2>
            <p className="text-xs text-slate-400 dark:text-slate-500">Assets purchased over the last 12 months</p>
          </div>
          <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-600 dark:bg-blue-500/10 dark:text-blue-400">
            {data.totalAcquired} acquired
          </span>
        </div>
        <div className="mt-4">
          <TrendChart data={data.monthlyAcquisitions} />
        </div>
      </section>
    </div>
  );
}
