"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, HelpCircle, Search } from "lucide-react";
import { useCurrentUser } from "@/components/auth/context";
import { isNavItemVisible, NAV_ITEMS } from "@/lib/nav";
import { cn } from "@/lib/utils";

/**
 * Static product documentation — there is no help/FAQ model in the backend,
 * so the articles live here. Each topic links to its module only when the
 * sidebar would show that module to the signed-in user (same rule, see
 * isNavItemVisible); the API still enforces access on every request.
 */
type HelpTopic = {
  key: string;
  title: string;
  /** Sidebar route this topic documents, if any. */
  href?: string;
  summary: string;
  points: string[];
};

const TOPICS: HelpTopic[] = [
  {
    key: "getting-started",
    title: "Getting Started",
    href: "/dashboard",
    summary: "Sign in, find your way around and understand what you can see.",
    points: [
      "The Dashboard summarizes asset counts, status breakdowns, warranty alerts and recent activity.",
      "The sidebar only lists the modules your role grants access to. Ask an administrator if something you need is missing.",
      "Use Collapse at the bottom of the sidebar to switch to an icon-only menu.",
    ],
  },
  {
    key: "assets",
    title: "Assets",
    href: "/dashboard/assets",
    summary: "Register, track and update every asset in the inventory.",
    points: [
      "Each asset has a code, category, brand, model, cost, current value, warranty and location.",
      "Statuses are Available, Assigned, Reserved, In Repair and Maintenance.",
      "Current value defaults to the purchase cost when left blank.",
    ],
  },
  {
    key: "catalog",
    title: "Catalog",
    href: "/dashboard/catalog",
    summary: "Categories, brands and models that assets are classified by.",
    points: [
      "Create categories and brands first, then models that belong to them.",
      "Assets pick their category, brand and model from the catalog.",
    ],
  },
  {
    key: "people",
    title: "People",
    href: "/dashboard/organization",
    summary: "Departments and employees who receive assets.",
    points: [
      "Organization has Departments and Employees tabs.",
      "An employee record can be linked to a login account from Roles & Permissions > Users.",
    ],
  },
  {
    key: "locations",
    title: "Locations",
    href: "/dashboard/locations",
    summary: "Workplaces where assets and employees are based.",
    points: ["Locations appear under Workplaces in the sidebar and are used by assets and employees."],
  },
  {
    key: "vendors",
    title: "Vendors",
    href: "/dashboard/vendors",
    summary: "Suppliers you purchase assets and services from.",
    points: ["Vendors are selected when creating purchase orders."],
  },
  {
    key: "purchase-orders",
    title: "Purchase Orders",
    href: "/dashboard/purchase-orders",
    summary: "Raise, approve and receive orders from vendors.",
    points: [
      "Orders move through Draft, Pending Approval, Approved, Ordered, Partially Received and Received, or Cancelled.",
      "A bill can be generated and printed from an order's details.",
    ],
  },
  {
    key: "assignments",
    title: "Assignments",
    href: "/dashboard/assignments",
    summary: "Hand assets to employees and track who holds what.",
    points: ["Assigning an asset marks it Assigned; returning it makes it available again."],
  },
  {
    key: "returns",
    title: "Returns",
    href: "/dashboard/service",
    summary: "Record assets coming back from employees.",
    points: ["Returns are on the first tab of Service."],
  },
  {
    key: "maintenance",
    title: "Maintenance",
    href: "/dashboard/service",
    summary: "Schedule and log routine maintenance.",
    points: ["Open Service > Maintenance. Overdue maintenance is counted in the Service badge in the sidebar."],
  },
  {
    key: "repairs",
    title: "Repairs",
    href: "/dashboard/service",
    summary: "Track assets sent for repair.",
    points: ["Open Service > Repairs. Overdue repairs are counted in the Service badge in the sidebar."],
  },
  {
    key: "accessories",
    title: "Accessories",
    href: "/dashboard/accessories",
    summary: "Stock and assign accessories such as chargers and peripherals.",
    points: [
      "Assign Accessory issues items from stock to an employee.",
      "The sidebar badge shows how many accessories are low on stock.",
    ],
  },
  {
    key: "software-licenses",
    title: "Software Licenses",
    href: "/dashboard/service",
    summary: "Keep track of software licenses and their renewal.",
    points: ["Open Service > Software Licenses. Licenses that need attention are counted in the Service badge."],
  },
  {
    key: "reports",
    title: "Reports",
    href: "/dashboard/reports",
    summary: "Filter the asset register and export it.",
    points: ["Export CSV downloads the filtered assets; Export PDF opens the print dialog."],
  },
  {
    key: "audit-logs",
    title: "Audit Logs",
    href: "/dashboard/audit-logs",
    summary: "A record of who changed what, and when.",
    points: [
      "Create, update and delete actions are logged with the user who made them.",
      "Role, permission and user-role changes are logged when permission tracking is enabled in Settings.",
    ],
  },
  {
    key: "settings",
    title: "Settings",
    href: "/dashboard/settings",
    summary: "Organization details, formats, numbering, notifications and security.",
    points: [
      "Every signed-in user can view settings; only users allowed to change settings can save.",
      "Currency, timezone, date format and numbering defaults set here are used across the app.",
    ],
  },
  {
    key: "roles-permissions",
    title: "Roles & Permissions",
    href: "/dashboard/roles-permissions",
    summary: "Define roles, choose their permissions and assign them to users.",
    points: [
      "A role grants a set of view, add, change and delete permissions per module.",
      "An inactive role keeps its members but grants no permissions.",
      "You can only grant permissions you hold yourself, and you can't change your own roles.",
      "A role with users assigned can't be deleted. Move its users to another role first.",
    ],
  },
  {
    key: "profile",
    title: "Profile",
    href: "/dashboard/profile",
    summary: "Your account, employee details and password.",
    points: [
      "Update your email and, when linked to an employee record, your phone number.",
      "Changing your password signs out your other sessions.",
    ],
  },
];

function matches(topic: HelpTopic, query: string) {
  if (!query) return true;
  const haystack = [topic.title, topic.summary, ...topic.points].join(" ").toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => haystack.includes(word));
}

export function HelpCenterView() {
  const { me, can } = useCurrentUser();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string>(TOPICS[0].key);

  const visibleHrefs = useMemo(
    () => new Set(NAV_ITEMS.filter((item) => isNavItemVisible(item, me, can)).map((item) => item.href)),
    [me, can]
  );
  const results = useMemo(() => TOPICS.filter((topic) => matches(topic, query.trim())), [query]);
  const current = results.find((t) => t.key === selected) ?? results[0];

  return (
    <div className="space-y-6">
      <div className="animate-fade-in-up">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Help Center</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          How each part of Asset Management works.
        </p>
      </div>

      <div className="relative max-w-xl">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search help topics"
          aria-label="Search help topics"
          className="w-full rounded-lg border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
        />
      </div>

      {results.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center dark:border-slate-800 dark:bg-slate-900">
          <HelpCircle className="mx-auto h-8 w-8 text-slate-300 dark:text-slate-600" />
          <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">No help topics match “{query.trim()}”.</p>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
          <nav aria-label="Help topics" className="rounded-2xl border border-slate-200 bg-white p-2 dark:border-slate-800 dark:bg-slate-900">
            <ul className="space-y-0.5">
              {results.map((topic) => (
                <li key={topic.key}>
                  <button
                    type="button"
                    onClick={() => setSelected(topic.key)}
                    aria-current={current?.key === topic.key ? "true" : undefined}
                    className={cn(
                      "w-full cursor-pointer rounded-lg px-3 py-2 text-left text-sm font-medium transition",
                      current?.key === topic.key
                        ? "bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400"
                        : "text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
                    )}
                  >
                    {topic.title}
                  </button>
                </li>
              ))}
            </ul>
          </nav>

          {current && (
            <article className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">{current.title}</h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{current.summary}</p>
              <ul className="mt-5 space-y-3">
                {current.points.map((point) => (
                  <li key={point} className="flex gap-3 text-sm text-slate-700 dark:text-slate-300">
                    <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500" />
                    <span>{point}</span>
                  </li>
                ))}
              </ul>
              {current.href && visibleHrefs.has(current.href) && (
                <Link
                  href={current.href}
                  className="mt-6 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
                >
                  Open {current.title}
                  <ArrowRight className="h-4 w-4" />
                </Link>
              )}
            </article>
          )}
        </div>
      )}
    </div>
  );
}
