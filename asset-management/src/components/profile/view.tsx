"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { Building2, KeyRound, Loader2, Save, ShieldCheck, UserRound } from "lucide-react";
import { ApiError, apiPatch, apiPost } from "@/lib/api";
import { displayNameFor, initialsFor, useCurrentUser, type Me } from "@/components/auth/context";
import { controlClass, FieldLabel, InlineError, primaryButtonClass } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

const inputClass = cn(controlClass, "disabled:cursor-not-allowed disabled:opacity-60");
const submitClass = cn(primaryButtonClass, "flex items-center gap-2");

type FieldErrors = Record<string, string>;

/** DRF 400 body -> first message per field. */
function fieldErrorsFrom(error: unknown): FieldErrors | null {
  if (!(error instanceof ApiError) || error.status !== 400 || !error.details || typeof error.details !== "object") {
    return null;
  }
  const result: FieldErrors = {};
  for (const [field, value] of Object.entries(error.details as Record<string, unknown>)) {
    const message = Array.isArray(value) ? value.find((v): v is string => typeof v === "string") : value;
    if (typeof message === "string") result[field] = message;
  }
  return result;
}

function formatDateTime(value: string | null) {
  return value ? new Date(value).toLocaleString() : "—";
}

function Card({ icon: Icon, title, description, children }: {
  icon: typeof UserRound;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400">
          <Icon className="h-4.5 w-4.5" />
        </span>
        <div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">{title}</h2>
          {description && <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{description}</p>}
        </div>
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function Detail({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">{label}</dt>
      <dd className="mt-1 text-sm text-slate-800 dark:text-slate-100">{value || "—"}</dd>
    </div>
  );
}

function Field({ label, error, children, hint }: { label: string; error?: string; hint?: string; children: ReactNode }) {
  return (
    <div>
      <FieldLabel hint={hint}>{label}</FieldLabel>
      {children}
      {error && <InlineError>{error}</InlineError>}
    </div>
  );
}

function EditProfileForm({ me }: { me: Me }) {
  const { setMe } = useCurrentUser();
  const { showSuccess, showErrorFromException } = useToast();
  const linked = me.employee !== null;
  const [firstName, setFirstName] = useState(me.user.first_name);
  const [lastName, setLastName] = useState(me.user.last_name);
  const [email, setEmail] = useState(me.user.email);
  const [phone, setPhone] = useState(me.employee?.phone ?? "");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [saving, setSaving] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    // Only send what changed; the backend accepts nothing else from /me.
    const payload: Record<string, string> = {};
    if (email !== me.user.email) payload.email = email;
    if (linked) {
      if (phone !== (me.employee?.phone ?? "")) payload.phone = phone;
    } else {
      if (firstName !== me.user.first_name) payload.first_name = firstName;
      if (lastName !== me.user.last_name) payload.last_name = lastName;
    }
    if (Object.keys(payload).length === 0) return;
    setSaving(true);
    setErrors({});
    try {
      const updated = await apiPatch<Me>("/accounts/me/", payload);
      setMe(updated);
      setEmail(updated.user.email);
      setPhone(updated.employee?.phone ?? "");
      showSuccess("Profile updated.");
    } catch (error) {
      const fieldErrors = fieldErrorsFrom(error);
      if (fieldErrors) setErrors(fieldErrors);
      else showErrorFromException(error, "Could not update your profile.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label={linked ? "Name" : "First name"}
          error={errors.first_name}
          hint={linked ? "From your employee record" : undefined}
        >
          <input
            className={inputClass}
            value={linked ? me.employee!.name : firstName}
            onChange={(e) => setFirstName(e.target.value)}
            disabled={linked}
            maxLength={150}
          />
        </Field>
        {!linked && (
          <Field label="Last name" error={errors.last_name}>
            <input className={inputClass} value={lastName} onChange={(e) => setLastName(e.target.value)} maxLength={150} />
          </Field>
        )}
        <Field label="Email" error={errors.email} hint="Used to sign in">
          <input className={inputClass} type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </Field>
        {linked && (
          <Field label="Phone" error={errors.phone}>
            <input className={inputClass} value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" />
          </Field>
        )}
      </div>
      <div className="flex justify-end">
        <button type="submit" disabled={saving} className={submitClass}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save changes
        </button>
      </div>
    </form>
  );
}

function ChangePasswordForm() {
  const { showSuccess, showErrorFromException } = useToast();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [saving, setSaving] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErrors({});
    try {
      const response = await apiPost<{ detail: string; access: string; refresh: string }>(
        "/accounts/me/change-password/",
        { current_password: current, new_password: next, confirm_password: confirm }
      );
      // The backend revoked every earlier session; keep this one signed in.
      window.localStorage.setItem("assetflow.access", response.access);
      window.localStorage.setItem("assetflow.refresh", response.refresh);
      setCurrent("");
      setNext("");
      setConfirm("");
      showSuccess("Password changed. Other signed-in sessions have been signed out.");
    } catch (error) {
      const fieldErrors = fieldErrorsFrom(error);
      if (fieldErrors) setErrors(fieldErrors);
      else showErrorFromException(error, "Could not change your password.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Current password" error={errors.current_password}>
          <input className={inputClass} type="password" autoComplete="current-password" value={current}
            onChange={(e) => setCurrent(e.target.value)} required />
        </Field>
        <Field label="New password" error={errors.new_password}>
          <input className={inputClass} type="password" autoComplete="new-password" value={next}
            onChange={(e) => setNext(e.target.value)} required />
        </Field>
        <Field label="Confirm new password" error={errors.confirm_password}>
          <input className={inputClass} type="password" autoComplete="new-password" value={confirm}
            onChange={(e) => setConfirm(e.target.value)} required />
        </Field>
      </div>
      <p className="text-xs text-slate-400 dark:text-slate-500">
        Must satisfy the password policy in Settings &gt; Security.
      </p>
      <div className="flex justify-end">
        <button type="submit" disabled={saving || !current || !next || !confirm} className={submitClass}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
          Change password
        </button>
      </div>
    </form>
  );
}

/**
 * My Profile — everything shown comes from GET /api/accounts/me/ (User +
 * linked Employee + roles), owned by AuthProvider; this page never fetches
 * its own copy.
 */
export function ProfileView() {
  const { me, loading } = useCurrentUser();

  if (loading && !me) {
    return (
      <div className="space-y-6" aria-busy="true">
        <div className="h-8 w-40 animate-pulse rounded-lg bg-slate-200 dark:bg-slate-800" />
        <div className="h-48 animate-pulse rounded-2xl bg-slate-200/70 dark:bg-slate-800/70" />
      </div>
    );
  }
  if (!me) {
    return <p className="text-sm text-slate-500 dark:text-slate-400">Your profile could not be loaded.</p>;
  }

  const { user, employee, roles } = me;

  return (
    <div className="space-y-6">
      <div className="animate-fade-in-up">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">My Profile</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Your account, organization details and access.</p>
      </div>

      <section className="flex flex-col gap-5 rounded-2xl border border-slate-200 bg-white p-6 sm:flex-row sm:items-center dark:border-slate-800 dark:bg-slate-900">
        <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-blue-600 text-xl font-semibold text-white">
          {initialsFor(user)}
        </span>
        <div className="min-w-0">
          <p className="truncate text-lg font-semibold text-slate-900 dark:text-white">{displayNameFor(user)}</p>
          <p className="truncate text-sm text-slate-500 dark:text-slate-400">{user.email || user.username}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {roles.length === 0 && !user.is_superuser && (
              <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                No role assigned
              </span>
            )}
            {user.is_superuser && (
              <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-medium text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300">
                Superuser
              </span>
            )}
            {roles.map((role) => (
              <span
                key={role.id}
                className={cn(
                  "rounded-full px-2.5 py-0.5 text-xs font-medium",
                  role.is_active
                    ? "bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300"
                    : "bg-slate-100 text-slate-400 line-through dark:bg-slate-800 dark:text-slate-500"
                )}
                title={role.is_active ? undefined : "This role is inactive and grants no permissions."}
              >
                {role.name}
              </span>
            ))}
          </div>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card icon={UserRound} title="Account">
          <dl className="grid gap-4 sm:grid-cols-2">
            <Detail label="Username" value={user.username} />
            <Detail label="Email" value={user.email} />
            <Detail label="Member since" value={formatDateTime(user.date_joined)} />
            <Detail label="Last sign-in" value={formatDateTime(user.last_login)} />
          </dl>
        </Card>

        <Card icon={Building2} title="Organization">
          {employee ? (
            <dl className="grid gap-4 sm:grid-cols-2">
              <Detail label="Employee ID" value={employee.employee_id} />
              <Detail label="Designation" value={employee.designation} />
              <Detail label="Department" value={employee.department_name} />
              <Detail label="Location" value={employee.location_name} />
              <Detail label="Phone" value={employee.phone} />
            </dl>
          ) : (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              This account is not linked to an employee record. An administrator can link it from Roles &amp;
              Permissions &gt; Users.
            </p>
          )}
        </Card>
      </div>

      <Card
        icon={ShieldCheck}
        title="Edit profile"
        description={
          employee
            ? "Your name, designation, department and location are managed on your employee record."
            : undefined
        }
      >
        <EditProfileForm key={`${user.email}|${employee?.phone ?? ""}|${user.first_name}|${user.last_name}`} me={me} />
      </Card>

      <Card icon={KeyRound} title="Change password">
        <ChangePasswordForm />
      </Card>
    </div>
  );
}
