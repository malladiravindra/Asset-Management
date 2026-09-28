"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { LayoutGrid } from "lucide-react";
import { EmployeesTable } from "@/components/employees/table";
import { DepartmentsGrid } from "@/components/departments/grid";
import { cn } from "@/lib/utils";

const TABS = [
  { key: "departments", label: "Departments" },
  { key: "employees", label: "Employees" },
] as const;

type TabKey = (typeof TABS)[number]["key"];
export type OrganizationViewMode = "cards" | "table";

export function OrganizationTabs() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tab: TabKey = searchParams.get("tab") === "employees" ? "employees" : "departments";
  const [viewMode, setViewMode] = useState<OrganizationViewMode>("cards");

  function selectTab(key: TabKey) {
    const params = new URLSearchParams(searchParams.toString());
    // "departments" is the default tab (see `tab` above: no/unrecognized
    // ?tab= falls back to "departments") — so clearing the param here, not
    // for "employees", is what keeps this in sync with that default.
    if (key === "departments") params.delete("tab");
    else params.set("tab", key);
    const query = params.toString();
    router.replace(`/dashboard/organization${query ? `?${query}` : ""}`, { scroll: false });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 animate-scale-fade">
        <div className="flex gap-6">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => selectTab(t.key)}
              className={cn(
                "relative pb-3 text-sm font-medium transition",
                tab === t.key
                  ? "text-blue-600 dark:text-blue-400"
                  : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
              )}
            >
              {t.label}
              {tab === t.key && (
                <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-blue-600" />
              )}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 pb-2.5">
          <label htmlFor="organization-view-mode" className="flex shrink-0 items-center text-slate-500 dark:text-slate-400">
            <LayoutGrid className="h-4 w-4" />
            <span className="sr-only">View as</span>
          </label>
          <select
            id="organization-view-mode"
            value={viewMode}
            onChange={(e) => setViewMode(e.target.value as OrganizationViewMode)}
            className="cursor-pointer rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-100"
          >
            <option value="cards">Cards</option>
            <option value="table">Table</option>
          </select>
        </div>
      </div>

      <div className="animate-scale-fade" style={{ animationDelay: "120ms" }}>
        {tab === "employees" && <EmployeesTable viewMode={viewMode} />}
        {tab === "departments" && <DepartmentsGrid viewMode={viewMode} />}
      </div>
    </div>
  );
}
