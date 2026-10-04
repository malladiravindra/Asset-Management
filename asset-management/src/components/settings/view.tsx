"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  Eye,
  Loader2,
  RefreshCw,
  Send,
  Shield,
  ShieldAlert,
  Users,
  XCircle,
} from "lucide-react";
import { useCurrentUser } from "@/components/auth/context";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/toast";
import { TabBar, tabButtonClass, tabIdleClass } from "@/components/ui/tab-bar";
import {
  controlClass,
  FieldLabel,
  InlineError,
  Modal,
  primaryButtonClass,
  secondaryButtonClass,
} from "@/components/ui/modal";
import {
  fetchSettings,
  patchSettings,
  sendTestEmail,
  type SettingsMeta,
  type SettingsValues,
  type SettingValue,
} from "@/components/settings/api";
import {
  NUMBER_FIELDS,
  SECTIONS,
  SECURITY_FIELDS,
  sectionForField,
  type FieldDef,
  type SectionKey,
} from "@/components/settings/schema";
import { SettingField } from "@/components/settings/fields";
import { useRuntimeSettings } from "@/components/settings/runtime";

const cardClass = "rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 dark:border-slate-800 dark:bg-slate-900";

const ALL_FIELDS: FieldDef[] = SECTIONS.flatMap((s) => s.groups.flatMap((g) => g.fields));
const FIELD_BY_KEY = new Map(ALL_FIELDS.map((f) => [f.key, f]));

function norm(value: SettingValue | undefined) {
  return value === null || value === undefined ? "" : String(value);
}

function sectionKeysFor(section: SectionKey) {
  const def = SECTIONS.find((s) => s.key === section)!;
  return new Set(def.groups.flatMap((g) => g.fields.map((f) => f.key)));
}

/** Client-side checks mirroring the backend's rules, for instant feedback. The backend stays authoritative. */
function validate(values: SettingsValues, keys: string[]) {
  const errors: Record<string, string> = {};
  for (const key of keys) {
    const field = FIELD_BY_KEY.get(key);
    if (!field) continue;
    const raw = norm(values[key]).trim();
    if (field.required && !raw) {
      errors[key] = `${field.label} is required.`;
      continue;
    }
    if (field.type === "number" || field.type === "decimal") {
      if (raw === "" || Number.isNaN(Number(raw))) {
        errors[key] = `${field.label} must be a number.`;
      } else if (field.type === "number" && !Number.isInteger(Number(raw))) {
        errors[key] = `${field.label} must be a whole number.`;
      } else if (field.min !== undefined && Number(raw) < field.min) {
        errors[key] = `${field.label} must be greater than or equal to ${field.min}.`;
      } else if (field.max !== undefined && Number(raw) > field.max) {
        errors[key] = `${field.label} must be less than or equal to ${field.max}.`;
      }
    }
  }
  return errors;
}

function firstMessage(value: unknown) {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.find((v): v is string => typeof v === "string");
  return undefined;
}

export function SettingsView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { showSuccess, showError, showErrorFromException } = useToast();
  const { can } = useCurrentUser();
  // Access management lives on its own page (Roles & Permissions); Settings
  // links to it, shown only to those whose permissions allow it. The page
  // and its APIs enforce the same permissions themselves.
  const accessLinks = [
    { label: "Roles & Permissions", href: "/dashboard/roles-permissions", icon: Shield, show: can("auth.view_group") },
    { label: "Users", href: "/dashboard/roles-permissions?tab=users", icon: Users, show: can("auth.view_user") },
  ].filter((l) => l.show);
  // GET /settings/ is owned by RuntimeSettingsProvider; this page seeds its
  // form from that response and hands saves back via applyRuntimeSettings.
  const {
    data: runtimeData,
    error: runtimeError,
    refresh: refreshRuntimeSettings,
    apply: applyRuntimeSettings,
  } = useRuntimeSettings();

  const requested = searchParams.get("section");
  const active: SectionKey = SECTIONS.some((s) => s.key === requested) ? (requested as SectionKey) : "general";

  const [initial, setInitial] = useState<SettingsValues | null>(null);
  const [form, setForm] = useState<SettingsValues>({});
  const [meta, setMeta] = useState<SettingsMeta | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [confirmReasons, setConfirmReasons] = useState<string[] | null>(null);
  const [pendingHref, setPendingHref] = useState<string | null>(null);

  const applyLoaded = useCallback((data: Awaited<ReturnType<typeof fetchSettings>>) => {
    setInitial(data.settings);
    setForm(data.settings);
    setMeta(data.meta);
    setErrors({});
  }, []);

  // Seed the form once the shared settings response is available (it may
  // still be loading when this page opens directly).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time seed from the shared response
    if (runtimeData && initial === null) applyLoaded(runtimeData);
  }, [runtimeData, initial, applyLoaded]);

  const loadError = initial === null ? runtimeError : null;

  function load() {
    void refreshRuntimeSettings();
  }

  const dirtyKeys = useMemo(() => {
    if (!initial) return [] as string[];
    return Object.keys(initial).filter((k) => norm(form[k]) !== norm(initial[k]));
  }, [form, initial]);
  const dirtySet = useMemo(() => new Set(dirtyKeys), [dirtyKeys]);
  const isDirty = dirtyKeys.length > 0;
  const canEdit = Boolean(meta?.can_edit);

  // ── Unsaved-changes guard: browser reload/close + in-app link clicks ────
  useEffect(() => {
    if (!isDirty) return;
    function onBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault();
      e.returnValue = "";
    }
    // Capture phase on document runs before React's root listener, so
    // stopping it here keeps next/link from navigating while dirty.
    function onClick(e: MouseEvent) {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const anchor = (e.target as HTMLElement | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!anchor || anchor.target === "_blank") return;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin || url.pathname === window.location.pathname) return;
      e.preventDefault();
      e.stopPropagation();
      setPendingHref(url.pathname + url.search + url.hash);
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onClick, true);
    };
  }, [isDirty]);

  function selectSection(key: SectionKey) {
    const params = new URLSearchParams(searchParams.toString());
    if (key === "general") params.delete("section");
    else params.set("section", key);
    const query = params.toString();
    router.replace(`/dashboard/settings${query ? `?${query}` : ""}`, { scroll: false });
  }

  function updateField(key: string, value: SettingValue) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setJustSaved(false);
    if (errors[key]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
  }

  function discardChanges() {
    if (initial) setForm(initial);
    setErrors({});
  }

  function focusFirstError(errorMap: Record<string, string>) {
    const firstKey = Object.keys(errorMap).find((k) => sectionForField(k));
    const section = firstKey ? sectionForField(firstKey) : undefined;
    if (section && !sectionKeysFor(active).has(firstKey!)) selectSection(section);
  }

  function dangerousChangeReasons() {
    if (!initial || !meta) return [];
    // Wording follows the server-reported field status, so the dialog never
    // claims a stored-only setting takes effect.
    const storedNote = (key: string) =>
      meta.field_status[key] === "stored" ? " (saved only — not yet enforced by the application)" : "";
    const reasons: string[] = [];
    if (dirtySet.has("maintenance_mode") && form.maintenance_mode === true) {
      reasons.push(`Maintenance mode will be turned ON${storedNote("maintenance_mode")}.`);
    }
    if (dirtySet.has("allow_asset_disposal") && form.allow_asset_disposal === true) {
      reasons.push(`Asset disposal will be allowed${storedNote("allow_asset_disposal")}.`);
    }
    if (dirtySet.has("audit_logging_enabled") && form.audit_logging_enabled === false) {
      reasons.push(`Audit logging will be turned OFF${storedNote("audit_logging_enabled")}.`);
    }
    const security = dirtyKeys.filter((k) => SECURITY_FIELDS.has(k));
    if (security.length) {
      const allStored = security.every((k) => meta.field_status[k] === "stored");
      reasons.push(
        `Security policy will change: ${security.map((k) => FIELD_BY_KEY.get(k)?.label ?? k).join(", ")}` +
          (allStored ? " (saved only — not yet enforced by the application)." : "."),
      );
    }
    return reasons;
  }

  function requestSave() {
    if (!isDirty || saving || !canEdit) return;
    const clientErrors = validate(form, dirtyKeys);
    if (Object.keys(clientErrors).length) {
      setErrors(clientErrors);
      focusFirstError(clientErrors);
      showError("Please fix the highlighted fields before saving.");
      return;
    }
    const reasons = dangerousChangeReasons();
    if (reasons.length) {
      setConfirmReasons(reasons);
      return;
    }
    void save();
  }

  async function save() {
    setConfirmReasons(null);
    setSaving(true);
    const payload: SettingsValues = {};
    for (const key of dirtyKeys) {
      const value = form[key];
      payload[key] = NUMBER_FIELDS.has(key) && norm(value).trim() !== "" ? Number(value) : value;
    }
    try {
      const data = await patchSettings(payload);
      setInitial(data.settings);
      setForm(data.settings);
      setMeta(data.meta);
      setErrors({});
      setJustSaved(true);
      showSuccess("Settings saved successfully.");
      // Modules consuming settings at runtime (banner, form defaults) pick up
      // the saved values from this PATCH response — no second GET.
      applyRuntimeSettings(data);
    } catch (error) {
      if (error instanceof ApiError && error.status === 400 && error.details && typeof error.details === "object") {
        const fieldErrors: Record<string, string> = {};
        const otherMessages: string[] = [];
        for (const [key, value] of Object.entries(error.details as Record<string, unknown>)) {
          const message = firstMessage(value);
          if (!message) continue;
          if (FIELD_BY_KEY.has(key)) fieldErrors[key] = message;
          else otherMessages.push(message); // e.g. non_field_errors / detail — no field to highlight
        }
        setErrors(fieldErrors);
        focusFirstError(fieldErrors);
        if (otherMessages.length) showError(otherMessages.join(" "));
        if (Object.keys(fieldErrors).length) showError("Some settings are invalid. Please review the highlighted fields.");
        if (!otherMessages.length && !Object.keys(fieldErrors).length) showErrorFromException(error);
      } else if (error instanceof ApiError && error.status === 403) {
        showError("You don't have permission to change settings.");
      } else {
        showErrorFromException(error, "Could not save settings. Please try again.");
      }
    } finally {
      setSaving(false);
    }
  }

  // ── Loading / error states ───────────────────────────────────────────────
  if (loadError) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center text-center">
        <XCircle className="h-10 w-10 text-red-500" />
        <h1 className="mt-4 text-lg font-semibold text-slate-900 dark:text-white">Settings could not be loaded</h1>
        <p className="mt-1 max-w-md text-sm text-slate-500 dark:text-slate-400">{loadError}</p>
        <button type="button" onClick={() => void load()} className={cn(primaryButtonClass, "mt-5 flex items-center gap-2")}>
          <RefreshCw className="h-4 w-4" />
          Retry
        </button>
      </div>
    );
  }

  if (!initial || !meta) {
    return (
      <div className="space-y-6" aria-busy="true">
        <div className="h-8 w-40 animate-pulse rounded-lg bg-slate-200 dark:bg-slate-800" />
        <div className="h-14 animate-pulse rounded-xl bg-slate-200/70 dark:bg-slate-800/70" />
        <div className="h-96 animate-pulse rounded-2xl bg-slate-200/70 dark:bg-slate-800/70" />
      </div>
    );
  }

  const section = SECTIONS.find((s) => s.key === active)!;
  const updatedAt = initial.updated_at ? new Date(String(initial.updated_at)) : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-end animate-fade-in-up">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Settings</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Configure how {String(initial.system_name || "the application")} behaves for your organization.
          </p>
        </div>
        {updatedAt && (
          <p className="text-xs text-slate-400 dark:text-slate-500">
            Last updated {updatedAt.toLocaleString()}
            {initial.updated_by_name ? ` by ${initial.updated_by_name}` : ""}
          </p>
        )}
      </div>

      {!canEdit && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
          <Eye className="mt-0.5 h-4 w-4 shrink-0" />
          <span>View only — only administrators can change application settings.</span>
        </div>
      )}

      {/* ── Category tabs ───────────────────────────────────────────────── */}
      <SettingsTabs
        active={active}
        onSelect={selectSection}
        accessLinks={accessLinks}
        dirtyKeys={dirtyKeys}
        errorKeys={Object.keys(errors)}
      />

      <div>
        {/* ── Active section ──────────────────────────────────────────── */}
        <div key={active} id="settings-panel" role="tabpanel" aria-labelledby={`settings-tab-${active}`} className="min-w-0 space-y-5 animate-fade-in-up">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">{section.title}</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{section.description}</p>
          </div>

          {active === "system" && <SystemInfoCard meta={meta} maintenanceOn={initial.maintenance_mode === true} />}

          {section.groups.map((group) => (
            <section key={group.title} className={cardClass}>
              <div className="mb-4 border-b border-slate-100 pb-3 dark:border-slate-800">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">{group.title}</h3>
                {group.description && (
                  <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{group.description}</p>
                )}
              </div>
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {group.fields.map((field) => (
                  <SettingField
                    key={field.key}
                    field={field}
                    values={form}
                    choices={meta.choices}
                    error={errors[field.key]}
                    lockedReason={meta.locked_fields[field.key]}
                    status={meta.field_status[field.key]}
                    storedReason={meta.stored_reasons?.[field.key]}
                    readOnly={!canEdit || saving}
                    dirty={dirtySet.has(field.key)}
                    onChange={updateField}
                  />
                ))}
              </div>
            </section>
          ))}

          {active === "email" && (
            <EmailStatusCard
              meta={meta}
              canEdit={canEdit}
              senderDirty={dirtySet.has("email_sender_name") || dirtySet.has("email_sender_email")}
            />
          )}

          {/* ── Save bar ─────────────────────────────────────────────── */}
          {canEdit && (
            <div className="sticky bottom-4 z-10 flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white/95 px-5 py-3 shadow-lg shadow-slate-900/5 backdrop-blur sm:flex-row sm:items-center sm:justify-between dark:border-slate-800 dark:bg-slate-900/95">
              <p className="text-sm" aria-live="polite">
                {saving ? (
                  <span className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
                    <Loader2 className="h-4 w-4 animate-spin" /> Saving...
                  </span>
                ) : isDirty ? (
                  <span className="flex items-center gap-2 text-amber-700 dark:text-amber-300">
                    <AlertTriangle className="h-4 w-4" />
                    {dirtyKeys.length} unsaved change{dirtyKeys.length === 1 ? "" : "s"}
                  </span>
                ) : justSaved ? (
                  <span className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 className="h-4 w-4" /> Saved successfully
                  </span>
                ) : (
                  <span className="text-slate-400 dark:text-slate-500">All changes saved</span>
                )}
              </p>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={discardChanges} disabled={!isDirty || saving} className={cn(secondaryButtonClass, "disabled:cursor-not-allowed disabled:opacity-50")}>
                  Cancel
                </button>
                <button type="button" onClick={requestSave} disabled={!isDirty || saving} className={cn(primaryButtonClass, "flex items-center gap-2 disabled:opacity-50")}>
                  {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                  {saving ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {confirmReasons && (
        <Modal onClose={() => setConfirmReasons(null)} maxWidthClassName="max-w-lg">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400">
              <ShieldAlert className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-white">Confirm sensitive changes</h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">These changes affect everyone using the application:</p>
              <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm text-slate-700 dark:text-slate-300">
                {confirmReasons.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            </div>
          </div>
          <div className="mt-6 flex justify-end gap-2">
            <button type="button" onClick={() => setConfirmReasons(null)} className={secondaryButtonClass}>
              Cancel
            </button>
            <button type="button" onClick={() => void save()} className={primaryButtonClass}>
              Confirm &amp; Save
            </button>
          </div>
        </Modal>
      )}

      {pendingHref && (
        <Modal onClose={() => setPendingHref(null)}>
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">You have unsaved changes.</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Discard changes?</p>
          <div className="mt-6 flex justify-end gap-2">
            <button type="button" onClick={() => setPendingHref(null)} className={secondaryButtonClass}>
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                const href = pendingHref;
                setPendingHref(null);
                discardChanges();
                router.push(href);
              }}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-red-700"
            >
              Discard
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

type AccessLink = { label: string; href: string; icon: React.ComponentType<{ className?: string }>; show: boolean };

function SettingsTabs({
  active,
  onSelect,
  accessLinks,
  dirtyKeys,
  errorKeys,
}: {
  active: SectionKey;
  onSelect: (key: SectionKey) => void;
  accessLinks: AccessLink[];
  dirtyKeys: string[];
  errorKeys: string[];
}) {
  const tabs = SECTIONS.map((s) => {
    const keys = sectionKeysFor(s.key);
    return {
      key: s.key,
      label: s.label,
      icon: s.icon,
      indicator: errorKeys.some((k) => keys.has(k)) ? ("error" as const) : dirtyKeys.some((k) => keys.has(k)) ? ("dirty" as const) : undefined,
    };
  });
  return (
    <TabBar
      tabs={tabs}
      active={active}
      onSelect={onSelect}
      ariaLabel="Settings categories"
      idPrefix="settings"
      trailing={
        accessLinks.length > 0
          ? accessLinks.map((l) => (
              <Link key={l.href} href={l.href} className={cn(tabButtonClass, tabIdleClass)}>
                <l.icon className="h-4 w-4 shrink-0" />
                <span>{l.label}</span>
              </Link>
            ))
          : undefined
      }
    />
  );
}

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5 first:pt-0 last:pb-0">
      <dt className="text-sm text-slate-500 dark:text-slate-400">{label}</dt>
      <dd className="text-right text-sm font-medium text-slate-800 dark:text-slate-100">{children}</dd>
    </div>
  );
}

function StatusBadge({ ok, okLabel, badLabel }: { ok: boolean; okLabel: string; badLabel: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold",
        ok
          ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300"
          : "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300",
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", ok ? "bg-emerald-500" : "bg-amber-500")} />
      {ok ? okLabel : badLabel}
    </span>
  );
}

function SystemInfoCard({ meta, maintenanceOn }: { meta: SettingsMeta; maintenanceOn: boolean }) {
  return (
    <section className={cardClass}>
      <div className="mb-4 border-b border-slate-100 pb-3 dark:border-slate-800">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-white">System Information</h3>
        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">Reported live by the server. Read-only.</p>
      </div>
      <dl className="divide-y divide-slate-100 dark:divide-slate-800">
        <InfoRow label="API Version">{meta.system.api_version}</InfoRow>
        <InfoRow label="System Status">
          <StatusBadge ok={meta.system.system_status === "operational"} okLabel="Operational" badLabel="Degraded" />
        </InfoRow>
        <InfoRow label="Maintenance Mode">
          <StatusBadge ok={!maintenanceOn} okLabel="Off" badLabel="On" />
        </InfoRow>
      </dl>
    </section>
  );
}

function EmailStatusCard({ meta, canEdit, senderDirty }: { meta: SettingsMeta; canEdit: boolean; senderDirty: boolean }) {
  const { showSuccess, showError } = useToast();
  const [recipient, setRecipient] = useState("");
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [recipientError, setRecipientError] = useState<string | null>(null);

  async function runTest() {
    setTesting(true);
    setResult(null);
    setRecipientError(null);
    try {
      const response = await sendTestEmail(recipient.trim());
      setResult({ ok: true, message: response.detail });
      showSuccess(response.detail);
    } catch (error) {
      const details = error instanceof ApiError ? (error.details as Record<string, unknown> | null) : null;
      const fieldMessage = details && typeof details === "object" ? firstMessage(details.recipient) : undefined;
      if (fieldMessage) setRecipientError(fieldMessage);
      const message =
        fieldMessage ??
        (error instanceof ApiError && error.status === 403
          ? "You don't have permission to send test emails."
          : error instanceof ApiError
            ? error.message
            : "Could not reach the server.");
      setResult({ ok: false, message });
      showError(message);
    } finally {
      setTesting(false);
    }
  }

  const e = meta.email;
  return (
    <>
      <section className={cardClass}>
        <div className="mb-4 border-b border-slate-100 pb-3 dark:border-slate-800">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">SMTP Configuration</h3>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            Read from the server environment (.env). Credentials are never sent to the browser.
          </p>
        </div>
        <dl className="divide-y divide-slate-100 dark:divide-slate-800">
          <InfoRow label="SMTP Host">{e.smtp_host || "—"}</InfoRow>
          <InfoRow label="SMTP Port">{e.smtp_port ?? "—"}</InfoRow>
          <InfoRow label="SMTP TLS">
            <StatusBadge ok={e.smtp_use_tls} okLabel="Enabled" badLabel="Disabled" />
          </InfoRow>
          <InfoRow label="SMTP Account">{e.host_user || "—"}</InfoRow>
          <InfoRow label="SMTP Password">
            <StatusBadge ok={e.password_configured} okLabel="Configured" badLabel="Missing" />
          </InfoRow>
        </dl>
      </section>

      <section className={cardClass}>
        <div className="mb-4 border-b border-slate-100 pb-3 dark:border-slate-800">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Test Email Configuration</h3>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            Sends a real email through the server. The result below is exactly what the mail server reported.
          </p>
        </div>
        {senderDirty && (
          <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-500/10 dark:text-amber-200">
            Save your sender changes first — the test uses the saved settings.
          </p>
        )}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1">
            <FieldLabel htmlFor="test-email-recipient" hint="Optional">
              Recipient
            </FieldLabel>
            <input
              id="test-email-recipient"
              type="email"
              value={recipient}
              onChange={(ev) => setRecipient(ev.target.value)}
              placeholder="Defaults to your account email"
              disabled={!canEdit || testing}
              className={cn(controlClass, (!canEdit || testing) && "cursor-not-allowed opacity-60")}
            />
          </div>
          <button
            type="button"
            onClick={() => void runTest()}
            disabled={!canEdit || testing}
            className={cn(primaryButtonClass, "flex items-center justify-center gap-2 disabled:opacity-50")}
          >
            {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {testing ? "Sending..." : "Send Test Email"}
          </button>
        </div>
        {recipientError && <InlineError>{recipientError}</InlineError>}
        {result && !recipientError && (
          <p
            role="status"
            className={cn(
              "mt-4 flex items-start gap-2 rounded-lg px-3 py-2 text-sm",
              result.ok
                ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-200"
                : "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300",
            )}
          >
            {result.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0" />}
            {result.message}
          </p>
        )}
      </section>
    </>
  );
}
