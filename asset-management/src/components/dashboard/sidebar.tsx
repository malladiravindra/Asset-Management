"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Fragment, useEffect, useState, type MouseEvent, type FocusEvent } from "react";
import { ChevronsLeft, ChevronsRight, X } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { cn } from "@/lib/utils";
import type { NavItem } from "@/lib/nav";
import { displayNameFor, initialsFor, roleLabelFor, useCurrentUser } from "@/components/auth/context";
import { ITEM_BY_HREF, isActiveHref, NAV_LAYOUT, useNavItems } from "@/components/dashboard/nav-layout";

/** Sidebar widths; the shell and header offset themselves by the same numbers. */
export const SIDEBAR_WIDTH = 240;
export const SIDEBAR_RAIL_WIDTH = 72;

const rowBase =
  "group relative flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500";
const rowIdle =
  "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100";
const rowActive = "bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400";

type Tip = { label: string; top: number };

function ActiveBar() {
  return (
    <span aria-hidden="true" className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-blue-600 dark:bg-blue-400" />
  );
}

function Badge({ value, active, hiddenInRail }: { value: number; active: boolean; hiddenInRail: boolean }) {
  return (
    <span
      className={cn(
        "ml-auto flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold",
        active ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
        hiddenInRail && "lg:hidden"
      )}
    >
      {value}
    </span>
  );
}

export function Sidebar({
  collapsed,
  onToggle,
  mobileOpen = false,
  onMobileClose,
}: {
  collapsed: boolean;
  onToggle: () => void;
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}) {
  const pathname = usePathname();
  const { me, user } = useCurrentUser();
  const displayName = displayNameFor(user);
  const initials = initialsFor(user);
  const roleLabel = roleLabelFor(me);
  const { visibleHrefs, badgeFor } = useNavItems(pathname);

  const [tip, setTip] = useState<Tip | null>(null);

  // `collapsed` only means "icon rail" at lg and above; the mobile drawer is
  // always full width. Every rail-specific class below is therefore lg:-prefixed.
  const rail = (railClass: string) => (collapsed ? railClass : "");

  // Escape closes the off-canvas drawer.
  useEffect(() => {
    if (!mobileOpen) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onMobileClose?.();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [mobileOpen, onMobileClose]);

  function showTip(e: MouseEvent<HTMLElement> | FocusEvent<HTMLElement>, label: string) {
    if (!collapsed) return;
    const r = e.currentTarget.getBoundingClientRect();
    setTip({ label, top: r.top + r.height / 2 });
  }
  const hideTip = () => setTip(null);
  const tipProps = (label: string) => ({
    onMouseEnter: (e: MouseEvent<HTMLElement>) => showTip(e, label),
    onFocus: (e: FocusEvent<HTMLElement>) => showTip(e, label),
    onMouseLeave: hideTip,
    onBlur: hideTip,
  });

  function renderLink(item: NavItem) {
    const active = isActiveHref(pathname, item.href);
    const Icon = item.icon;
    const badge = badgeFor(item);
    return (
      <Link
        href={item.href}
        onClick={() => {
          hideTip();
          onMobileClose?.();
        }}
        aria-current={active ? "page" : undefined}
        {...tipProps(item.label)}
        className={cn(rowBase, active ? rowActive : rowIdle, rail("lg:justify-center lg:px-0"))}
      >
        {active && <ActiveBar />}
        <Icon className="h-[18px] w-[18px] shrink-0" strokeWidth={2} />
        <span className={cn("truncate", rail("lg:hidden"))}>{item.label}</span>
        {badge !== undefined && <Badge value={badge} active={active} hiddenInRail={collapsed} />}
      </Link>
    );
  }

  return (
    <>
      {mobileOpen && (
        <button
          type="button"
          aria-label="Close menu"
          tabIndex={-1}
          className="fixed inset-0 z-40 cursor-default bg-slate-900/50 lg:hidden"
          onClick={onMobileClose}
        />
      )}
      <aside
        id="app-sidebar"
        style={{ ["--sidebar-w" as string]: `${collapsed ? SIDEBAR_RAIL_WIDTH : SIDEBAR_WIDTH}px` }}
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex h-screen w-[240px] flex-col border-r border-slate-200 bg-white transition-[transform,width] duration-200 dark:border-slate-800 dark:bg-slate-900",
          "lg:translate-x-0 lg:w-[var(--sidebar-w)]",
          mobileOpen ? "translate-x-0 shadow-xl" : "-translate-x-full"
        )}
      >
        <div className={cn("flex h-16 shrink-0 items-center justify-between border-b border-slate-100 px-5 dark:border-slate-800", rail("lg:justify-center lg:px-0"))}>
          <Link href="/dashboard" aria-label="AssetFlow home" onClick={onMobileClose} className="rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
            <span className={rail("lg:hidden")}>
              <Logo />
            </span>
            {collapsed && (
              <span className="hidden h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 shadow-lg shadow-blue-500/30 lg:flex">
                <span className="text-sm font-bold text-white">AF</span>
              </span>
            )}
          </Link>
          <button
            type="button"
            onClick={onMobileClose}
            aria-label="Close menu"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 transition-colors duration-150 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:hover:bg-slate-800 lg:hidden"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav aria-label="Main" onScroll={hideTip} className="thin-scrollbar flex-1 overflow-y-auto overflow-x-hidden px-3 py-4">
          <ul className="space-y-1">
            {NAV_LAYOUT.map((entry) => {
              if (entry.kind === "link") {
                const item = ITEM_BY_HREF.get(entry.href);
                if (!item || !visibleHrefs.has(item.href)) return null;
                return <li key={item.href}>{renderLink(item)}</li>;
              }

              const items = entry.hrefs
                .map((h) => ITEM_BY_HREF.get(h))
                .filter((i): i is NavItem => i !== undefined && visibleHrefs.has(i.href));
              if (items.length === 0) return null;
              return (
                <Fragment key={entry.id}>
                  {/* Non-clickable section label; in the icon rail it becomes a thin divider. */}
                  <li
                    aria-hidden="true"
                    className={cn(
                      "px-3 pb-1 pt-4 text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500",
                      rail("lg:mx-3 lg:mt-3 lg:border-t lg:border-slate-200 lg:p-0 lg:pt-3 lg:text-[0px] dark:lg:border-slate-800")
                    )}
                  >
                    {entry.label}
                  </li>
                  {items.map((item) => (
                    <li key={item.href}>{renderLink(item)}</li>
                  ))}
                </Fragment>
              );
            })}
          </ul>
        </nav>

        <div className="shrink-0 border-t border-slate-100 p-3 dark:border-slate-800">
          <Link
            href="/dashboard/profile"
            onClick={onMobileClose}
            {...tipProps([displayName, roleLabel].filter(Boolean).join(" · "))}
            className={cn(
              "flex items-center gap-3 rounded-lg px-2 py-2 transition-colors duration-150 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:hover:bg-slate-800",
              rail("lg:justify-center lg:px-0")
            )}
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-blue-600 text-sm font-semibold text-white">
              {initials}
            </span>
            <div className={cn("min-w-0", rail("lg:hidden"))}>
              <p className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">{displayName}</p>
              <p className="truncate text-xs text-slate-500 dark:text-slate-400">{roleLabel}</p>
            </div>
          </Link>
          <button
            type="button"
            onClick={() => {
              hideTip();
              onToggle();
            }}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            {...tipProps("Expand")}
            className="mt-2 hidden w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-slate-200 py-2 text-sm font-medium text-slate-600 transition-colors duration-150 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 lg:flex"
          >
            {collapsed ? (
              <ChevronsRight className="h-4 w-4" />
            ) : (
              <>
                <ChevronsLeft className="h-4 w-4" />
                Collapse
              </>
            )}
          </button>
        </div>

        {/* Rail tooltips are positioned from the hovered row, so the nav's own
            overflow can't clip them. */}
        {collapsed && tip && (
          <span
            role="tooltip"
            style={{ top: tip.top }}
            className="pointer-events-none fixed left-[80px] z-50 hidden -translate-y-1/2 whitespace-nowrap rounded-md bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-white shadow-lg dark:bg-slate-700 lg:block"
          >
            {tip.label}
          </span>
        )}
      </aside>
    </>
  );
}
