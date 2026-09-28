import Link from "next/link";
import { Rocket } from "lucide-react";
import { NAV_ITEMS } from "@/lib/nav";

function titleFromSlug(slug: string[]) {
  const href = `/dashboard/${slug.join("/")}`;
  const match = NAV_ITEMS.find((item) => item.href === href);
  if (match) return match.label;

  const last = slug[slug.length - 1] ?? "";
  return last
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export default async function ComingSoonPage(props: PageProps<"/dashboard/[...slug]">) {
  const { slug } = await props.params;
  const title = titleFromSlug(slug);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
      <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400">
        <Rocket className="h-7 w-7" />
      </span>
      <h1 className="mt-5 text-2xl font-bold text-slate-900 dark:text-white">{title}</h1>
      <p className="mt-2 max-w-sm text-sm text-slate-500 dark:text-slate-400">
        Coming soon — this module is on the roadmap and isn&apos;t built yet.
      </p>
      <Link
        href="/dashboard"
        className="mt-6 flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
      >
        Back to Dashboard
      </Link>
    </div>
  );
}
