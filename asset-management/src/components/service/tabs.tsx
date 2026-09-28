"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { ReturnsTable } from "@/components/returns/table";
import { MaintenanceTable } from "@/components/maintenance/table";
import { RepairsTable } from "@/components/repairs/table";
import { SoftwareLicensesTable } from "@/components/software-licenses/table";
import { cn } from "@/lib/utils";

const TABS = [
  { key: "returns", label: "Returns" },
  { key: "maintenance", label: "Maintenance" },
  { key: "repairs", label: "Repairs" },
  { key: "software-licenses", label: "Software Licenses" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export function ServiceTabs() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requested = searchParams.get("tab");
  const tab: TabKey = TABS.some((t) => t.key === requested) ? (requested as TabKey) : "returns";

  function selectTab(key: TabKey) {
    const params = new URLSearchParams(searchParams.toString());
    if (key === "returns") params.delete("tab");
    else params.set("tab", key);
    const query = params.toString();
    router.replace(`/dashboard/service${query ? `?${query}` : ""}`, { scroll: false });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 dark:border-slate-800 animate-swing-in">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => selectTab(t.key)}
            className={cn(
              "relative cursor-pointer rounded-t-md px-3 pb-3 pt-1.5 text-sm font-medium transition",
              tab === t.key
                ? "text-blue-600 dark:text-blue-400"
                : "text-slate-500 hover:bg-slate-50 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800/60 dark:hover:text-slate-200"
            )}
          >
            {t.label}
            {tab === t.key && (
              <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-blue-600" />
            )}
          </button>
        ))}
      </div>

      {/* No wrapper animation here — ReturnsTable/MaintenanceTable/RepairsTable/
          SoftwareLicensesTable each already animate their own top-level content
          as standalone modules; adding one here would double up with theirs. */}
      <div>
        {tab === "returns" && <ReturnsTable />}
        {tab === "maintenance" && <MaintenanceTable />}
        {tab === "repairs" && <RepairsTable />}
        {tab === "software-licenses" && <SoftwareLicensesTable />}
      </div>
    </div>
  );
}
