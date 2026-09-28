"use client";

import type { CSSProperties } from "react";
import type { LucideIcon } from "lucide-react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";

type Tone = "blue" | "emerald" | "indigo" | "amber" | "red" | "violet";

const TONE_STYLES: Record<Tone, { icon: string; ring: string; bar: string }> = {
  blue: { icon: "bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400", ring: "from-blue-500 to-blue-600", bar: "bg-blue-500" },
  emerald: { icon: "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400", ring: "from-emerald-500 to-emerald-600", bar: "bg-emerald-500" },
  indigo: { icon: "bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400", ring: "from-indigo-500 to-indigo-600", bar: "bg-indigo-500" },
  amber: { icon: "bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400", ring: "from-amber-500 to-amber-600", bar: "bg-amber-500" },
  red: { icon: "bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400", ring: "from-red-500 to-red-600", bar: "bg-red-500" },
  violet: { icon: "bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-400", ring: "from-violet-500 to-violet-600", bar: "bg-violet-500" },
};

export function StatCard({
  icon: Icon,
  label,
  value,
  sublabel,
  trend,
  tone,
  style,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  sublabel: string;
  trend?: { value: string; direction: "up" | "down"; positive?: boolean };
  tone: Tone;
  style?: CSSProperties;
}) {
  const styles = TONE_STYLES[tone];

  return (
    <div
      style={style}
      className="group relative overflow-hidden rounded-2xl border-2 border-slate-200 bg-white p-5 shadow-sm shadow-slate-900/[0.02] transition hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-md hover:shadow-slate-900/5 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-blue-500 animate-zoom-in">
      <span className={cn("absolute inset-x-0 top-0 h-1 bg-gradient-to-r", styles.ring)} />
      <div className="flex items-start justify-between">
        <span className={cn("flex h-10 w-10 items-center justify-center rounded-xl", styles.icon)}>
          <Icon className="h-5 w-5" strokeWidth={2} />
        </span>
        {trend && (
          <span
            className={cn(
              "flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-semibold",
              trend.positive
                ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400"
                : "bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400"
            )}
          >
            {trend.direction === "up" ? (
              <ArrowUpRight className="h-3 w-3" />
            ) : (
              <ArrowDownRight className="h-3 w-3" />
            )}
            {trend.value}
          </span>
        )}
      </div>
      <p className="mt-4 text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
        {value}
      </p>
      <p className="mt-1 text-sm font-medium text-slate-500 dark:text-slate-400">{label}</p>
      <p className="mt-2.5 text-xs text-slate-400 dark:text-slate-500">{sublabel}</p>
    </div>
  );
}
