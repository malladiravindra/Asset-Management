"use client";

import { useCallback, useEffect, useRef, useState, type ComponentType, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export type TabBarItem<K extends string> = {
  key: K;
  label: string;
  icon: ComponentType<{ className?: string }>;
  /** Small status dot after the label. */
  indicator?: "error" | "dirty";
};

/** Shared tab-button styling, also used by `trailing` links so they line up with the tabs. */
export const tabButtonClass =
  "relative flex shrink-0 items-center gap-2 whitespace-nowrap rounded-lg px-3.5 py-2 text-sm font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 dark:focus-visible:ring-offset-slate-900";
export const tabIdleClass =
  "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100";

/**
 * Horizontal tab bar: sticky below the 64px app navbar, never wraps, scrolls
 * sideways with a hidden scrollbar and fade edges, keeps the active tab centered,
 * and supports Left/Right/Home/End. Tab ids are `${idPrefix}-tab-${key}`; point
 * the content panel at `${idPrefix}-panel` / `aria-labelledby` the active tab.
 */
export function TabBar<K extends string>({
  tabs,
  active,
  onSelect,
  ariaLabel,
  idPrefix,
  trailing,
}: {
  tabs: TabBarItem<K>[];
  active: K;
  onSelect: (key: K) => void;
  ariaLabel: string;
  idPrefix: string;
  /** Extra non-tab items (e.g. links) rendered after a divider, outside the tablist. */
  trailing?: ReactNode;
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });

  const updateEdges = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    setEdges({ left: el.scrollLeft > 4, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 4 });
  }, []);

  useEffect(() => {
    updateEdges();
    window.addEventListener("resize", updateEdges);
    return () => window.removeEventListener("resize", updateEdges);
  }, [updateEdges]);

  // Keep the active tab visible whenever it changes.
  useEffect(() => {
    document
      .getElementById(`${idPrefix}-tab-${active}`)
      ?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }, [active, idPrefix]);

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const i = tabs.findIndex((t) => t.key === active);
    let next = -1;
    if (e.key === "ArrowRight") next = (i + 1) % tabs.length;
    else if (e.key === "ArrowLeft") next = (i - 1 + tabs.length) % tabs.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = tabs.length - 1;
    if (next < 0) return;
    e.preventDefault();
    onSelect(tabs[next].key);
    document.getElementById(`${idPrefix}-tab-${tabs[next].key}`)?.focus();
  }

  return (
    <div className="sticky top-16 z-10 -mx-1 px-1 py-1">
      <div className="relative rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div
          ref={scrollerRef}
          onScroll={updateEdges}
          className="flex flex-nowrap items-center gap-1 overflow-x-auto p-1.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          <div role="tablist" aria-label={ariaLabel} onKeyDown={onKeyDown} className="flex flex-nowrap gap-1">
            {tabs.map((t) => {
              const isActive = t.key === active;
              const Icon = t.icon;
              return (
                <button
                  key={t.key}
                  id={`${idPrefix}-tab-${t.key}`}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  aria-controls={`${idPrefix}-panel`}
                  tabIndex={isActive ? 0 : -1}
                  onClick={() => onSelect(t.key)}
                  className={cn(
                    tabButtonClass,
                    isActive ? "bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400" : tabIdleClass,
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span>{t.label}</span>
                  {t.indicator === "error" ? (
                    <span className="h-2 w-2 rounded-full bg-red-500" aria-label="Has errors" />
                  ) : t.indicator === "dirty" ? (
                    <span className="h-2 w-2 rounded-full bg-amber-500" aria-label="Unsaved changes" />
                  ) : null}
                  {isActive && (
                    <span aria-hidden="true" className="absolute inset-x-2 -bottom-1.5 h-0.5 rounded-full bg-blue-600 dark:bg-blue-400" />
                  )}
                </button>
              );
            })}
          </div>

          {trailing && (
            <>
              <span aria-hidden="true" className="mx-1 h-5 w-px shrink-0 bg-slate-200 dark:bg-slate-700" />
              {trailing}
            </>
          )}
        </div>

        {/* Fade edges hint at horizontal overflow */}
        <div
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute inset-y-0 left-0 w-8 rounded-l-xl bg-gradient-to-r from-white to-transparent transition-opacity duration-150 dark:from-slate-900",
            edges.left ? "opacity-100" : "opacity-0",
          )}
        />
        <div
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute inset-y-0 right-0 w-8 rounded-r-xl bg-gradient-to-l from-white to-transparent transition-opacity duration-150 dark:from-slate-900",
            edges.right ? "opacity-100" : "opacity-0",
          )}
        />
      </div>
    </div>
  );
}
