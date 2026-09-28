"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { Activity, Building2, HelpCircle, Mail, MapPin, Phone } from "lucide-react";
import { displayNameFor, roleLabelFor, useCurrentUser } from "@/components/auth/context";
import { useRuntimeSettings } from "@/components/settings/runtime";

/**
 * Support — there is no support-ticket model or API in the backend, so this
 * page points users at the organization's own contact details, which come
 * from Settings > General (the shared GET /settings/ owned by
 * RuntimeSettingsProvider; no request of its own).
 */
function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function Row({ icon: Icon, label, children }: { icon: typeof Mail; label: string; children: ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400">
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <p className="text-xs font-medium uppercase tracking-wider text-slate-400 dark:text-slate-500">{label}</p>
        <div className="mt-0.5 break-words text-sm text-slate-800 dark:text-slate-200">{children}</div>
      </div>
    </div>
  );
}

export function SupportView() {
  const { me, user } = useCurrentUser();
  const { data, values, error } = useRuntimeSettings();

  const organization = text(values?.organization_name);
  const email = text(values?.company_email);
  const phone = text(values?.company_phone);
  const address = [values?.address, values?.city, values?.state, values?.country].map(text).filter(Boolean).join(", ");
  const system = data?.meta.system;
  const mailto = email
    ? `mailto:${email}?subject=${encodeURIComponent("Asset Management support request")}`
    : null;

  return (
    <div className="space-y-6">
      <div className="animate-fade-in-up">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Support</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Contact your organization&apos;s IT team for help with access, assets or errors.
        </p>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">Contact</h2>
          {!values ? (
            <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">
              {error ?? "Loading contact details…"}
            </p>
          ) : (
            <div className="mt-5 space-y-4">
              <Row icon={Building2} label="Organization">
                {organization || "—"}
              </Row>
              <Row icon={Mail} label="Email">
                {email ? (
                  <a href={`mailto:${email}`} className="text-blue-600 hover:underline dark:text-blue-400">
                    {email}
                  </a>
                ) : (
                  "Not configured"
                )}
              </Row>
              <Row icon={Phone} label="Phone">
                {phone ? (
                  <a href={`tel:${phone.replace(/\s+/g, "")}`} className="text-blue-600 hover:underline dark:text-blue-400">
                    {phone}
                  </a>
                ) : (
                  "Not configured"
                )}
              </Row>
              <Row icon={MapPin} label="Address">
                {address || "Not configured"}
              </Row>
              {!email && !phone && (
                <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-500/10 dark:text-amber-200">
                  No support contact is configured. An administrator can add one in Settings &gt; General.
                </p>
              )}
            </div>
          )}
          {mailto && (
            <a
              href={mailto}
              className="mt-6 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
            >
              <Mail className="h-4 w-4" />
              Email support
            </a>
          )}
        </section>

        <div className="space-y-6">
          <section className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">Include in your request</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              These details help the IT team find your account quickly.
            </p>
            <dl className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <dt className="text-xs font-medium uppercase tracking-wider text-slate-400 dark:text-slate-500">Name</dt>
                <dd className="mt-0.5 text-sm text-slate-800 dark:text-slate-200">{displayNameFor(user)}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wider text-slate-400 dark:text-slate-500">Username</dt>
                <dd className="mt-0.5 text-sm text-slate-800 dark:text-slate-200">{user?.username ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wider text-slate-400 dark:text-slate-500">Role</dt>
                <dd className="mt-0.5 text-sm text-slate-800 dark:text-slate-200">{roleLabelFor(me) || "—"}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wider text-slate-400 dark:text-slate-500">
                  Employee ID
                </dt>
                <dd className="mt-0.5 text-sm text-slate-800 dark:text-slate-200">{me?.employee?.employee_id || "—"}</dd>
              </div>
            </dl>
          </section>

          {system && (
            <section className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
              <Row icon={Activity} label="System status">
                {system.system_status} · API {system.api_version}
              </Row>
            </section>
          )}

          <Link
            href="/dashboard/help-center"
            className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-6 text-sm font-medium text-slate-700 transition hover:border-blue-300 hover:text-blue-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-blue-500/40 dark:hover:text-blue-400"
          >
            <HelpCircle className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            Browse the Help Center for how-to guides
          </Link>
        </div>
      </div>
    </div>
  );
}
