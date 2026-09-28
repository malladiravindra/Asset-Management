"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { LayoutGrid } from "lucide-react";
import { CategoriesGrid } from "@/components/categories/grid";
import { BrandsGrid } from "@/components/brands/grid";
import { ModelsTable } from "@/components/models/table";
import { cn } from "@/lib/utils";

const TABS = [
  { key: "categories", label: "Categories" },
  { key: "brands", label: "Brands" },
  { key: "models", label: "Models" },
] as const;

type TabKey = (typeof TABS)[number]["key"];
export type CatalogViewMode = "cards" | "table";

export function CatalogTabs() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requested = searchParams.get("tab");
  const tab: TabKey = TABS.some((t) => t.key === requested) ? (requested as TabKey) : "categories";
  const [viewMode, setViewMode] = useState<CatalogViewMode>("cards");

  function selectTab(key: TabKey) {
    const params = new URLSearchParams(searchParams.toString());
    if (key === "categories") params.delete("tab");
    else params.set("tab", key);
    const query = params.toString();
    router.replace(`/dashboard/catalog${query ? `?${query}` : ""}`, { scroll: false });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 animate-unfold-in">
        <div className="flex gap-2">
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

        <div className="flex items-center gap-2 pb-2.5">
          <label htmlFor="catalog-view-mode" className="flex shrink-0 items-center text-slate-500 dark:text-slate-400">
            <LayoutGrid className="h-4 w-4" />
            <span className="sr-only">View as</span>
          </label>
          <select
            id="catalog-view-mode"
            value={viewMode}
            onChange={(e) => setViewMode(e.target.value as CatalogViewMode)}
            className="cursor-pointer rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-100"
          >
            <option value="cards">Cards</option>
            <option value="table">Table</option>
          </select>
        </div>
      </div>

      <div className="animate-unfold-in" style={{ animationDelay: "120ms" }}>
        {tab === "categories" && <CategoriesGrid viewMode={viewMode} />}
        {tab === "brands" && <BrandsGrid viewMode={viewMode} />}
        {tab === "models" && <ModelsTable viewMode={viewMode} />}
      </div>
    </div>
  );
}
