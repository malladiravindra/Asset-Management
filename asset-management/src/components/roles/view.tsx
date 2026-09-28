"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ChevronLeft, Loader2, Pencil, Plus, Search, Shield, ShieldOff, Trash2, UserCog, Users, X } from "lucide-react";
import { ApiError, apiDelete, apiGet, apiGetAll, apiPatch, apiPost, apiPut } from "@/lib/api";
import { useCurrentUser } from "@/components/auth/context";
import { useEmployees } from "@/components/employees/context";
import { Toggle } from "@/components/settings/fields";
import {
  controlClass,
  FieldLabel,
  InlineError,
  Modal,
  primaryButtonClass,
  secondaryButtonClass,
} from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

// ── API shapes (asset_backend/accounts/serializers.py) ───────────────────────

type Permission = { id: number; app_label: string; model: string; codename: string; name: string };

type Role = {
  id: number;
  name: string;
  description: string;
  is_active: boolean;
  user_count: number;
  permission_count: number;
  permissions: number[];
  created_by_name: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type RoleSummary = { id: number; name: string; is_active: boolean };

type UserRow = {
  id: number;
  username: string;
  email: string;
  display_name: string;
  is_active: boolean;
  is_staff: boolean;
  is_superuser: boolean;
  roles: RoleSummary[];
  employee: { id: number; employee_id: string | null; name: string } | null;
  last_login: string | null;
};

const ACTIONS = ["view", "add", "change", "delete"] as const;

// Display names for the catalogued models; anything else falls back to the
// model name the backend returns.
const MODEL_LABELS: Record<string, string> = {
  asset: "Assets",
  employee: "Employees",
  department: "Departments",
  location: "Workplaces",
  category: "Categories",
  brand: "Brands",
  model: "Models",
  vendor: "Vendors",
  purchaseorder: "Purchase orders",
  assignment: "Assignments",
  return: "Returns",
  maintenancerecord: "Maintenance",
  repairrecord: "Repairs",
  accessory: "Accessories",
  accessoryassignment: "Accessory assignments",
  softwarelicense: "Software licenses",
  auditlog: "Audit logs",
  systemsettings: "Settings",
  group: "Roles",
  user: "User accounts",
  permission: "Permission catalogue",
};

function modelLabel(model: string) {
  return MODEL_LABELS[model] ?? model;
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

function fieldErrors(error: unknown): Record<string, string> {
  if (!(error instanceof ApiError) || error.status !== 400 || !error.details || typeof error.details !== "object") return {};
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(error.details as Record<string, unknown>)) {
    const message = Array.isArray(value) ? value.find((v): v is string => typeof v === "string") : value;
    if (typeof message === "string") out[key] = message;
  }
  return out;
}

// ── Role editor ─────────────────────────────────────────────────────────────

function RoleEditor({
  role,
  catalogue,
  members,
  onClose,
  onSaved,
}: {
  role: Role | null;
  catalogue: Permission[];
  /** Users holding this role, when the viewer may list users. */
  members: UserRow[] | null;
  onClose: () => void;
  onSaved: (role: Role) => void;
}) {
  const { showErrorFromException } = useToast();
  const [name, setName] = useState(role?.name ?? "");
  const [description, setDescription] = useState(role?.description ?? "");
  const [active, setActive] = useState(role?.is_active ?? true);
  const [selected, setSelected] = useState<Set<number>>(() => new Set(role?.permissions ?? []));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  // model -> action -> permission, in catalogue order
  const matrix = useMemo(() => {
    const rows = new Map<string, { appLabel: string; model: string; cells: Partial<Record<string, Permission>> }>();
    for (const permission of catalogue) {
      const key = `${permission.app_label}.${permission.model}`;
      const action = permission.codename.split("_", 1)[0];
      const row = rows.get(key) ?? { appLabel: permission.app_label, model: permission.model, cells: {} };
      row.cells[action] = permission;
      rows.set(key, row);
    }
    return Array.from(rows.values());
  }, [catalogue]);

  const [query, setQuery] = useState("");
  const visibleRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return matrix;
    return matrix.filter((row) =>
      modelLabel(row.model).toLowerCase().includes(q) ||
      row.appLabel.toLowerCase().includes(q) ||
      Object.values(row.cells).some((p) => p && (p.name.toLowerCase().includes(q) || p.codename.includes(q)))
    );
  }, [matrix, query]);
  const visibleIds = useMemo(
    () => visibleRows.flatMap((row) => Object.values(row.cells).flatMap((p) => (p ? [p.id] : []))),
    [visibleRows]
  );

  function setMany(ids: number[], on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (on) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }

  function toggle(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleRow(ids: number[]) {
    setSelected((prev) => {
      const next = new Set(prev);
      const allOn = ids.every((id) => next.has(id));
      for (const id of ids) {
        if (allOn) next.delete(id);
        else next.add(id);
      }
      return next;
    });
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErrors({});
    const payload = { name: name.trim(), description: description.trim(), is_active: active, permissions: Array.from(selected) };
    try {
      const saved = role
        ? await apiPatch<Role>(`/accounts/roles/${role.id}/`, payload)
        : await apiPost<Role>("/accounts/roles/", payload);
      onSaved(saved);
    } catch (error) {
      const fields = fieldErrors(error);
      if (Object.keys(fields).length) setErrors(fields);
      else showErrorFromException(error, "Could not save this role.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal onClose={onClose} maxWidthClassName="max-w-3xl" variant="content">
      <form onSubmit={submit} className="flex max-h-[90vh] flex-col">
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-100 p-5 dark:border-slate-800">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">{role ? "Edit role" : "New role"}</h2>
            <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
              Permissions are enforced by the server on every request.
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 dark:hover:bg-slate-800">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <FieldLabel required htmlFor="role-name">Name</FieldLabel>
              <input id="role-name" className={controlClass} value={name} onChange={(e) => setName(e.target.value)} required maxLength={150} />
              {errors.name && <InlineError>{errors.name}</InlineError>}
            </div>
            <div>
              <FieldLabel htmlFor="role-description">Description</FieldLabel>
              <input id="role-description" className={controlClass} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={255} />
              {errors.description && <InlineError>{errors.description}</InlineError>}
            </div>
          </div>
          <div className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 px-4 py-3 dark:border-slate-800">
            <div>
              <p className="text-sm font-medium text-slate-800 dark:text-slate-100">Active</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">An inactive role keeps its members but grants no permissions.</p>
            </div>
            <Toggle id="role-active" checked={active} onChange={setActive} label="Active" />
          </div>

          {role && members && (
            <div>
              <FieldLabel hint={`${role.user_count} assigned`}>Currently assigned users</FieldLabel>
              {members.length ? (
                <div className="flex flex-wrap gap-1.5">
                  {members.map((m) => (
                    <span key={m.id} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                      {m.display_name}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-400">No users hold this role.</p>
              )}
            </div>
          )}

          <div>
            <FieldLabel hint={`${selected.size} of ${catalogue.length} selected`}>Permissions</FieldLabel>
            {errors.permissions && <InlineError>{errors.permissions}</InlineError>}
            <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search permissions"
                  aria-label="Search permissions" className={cn(controlClass, "pl-9")} />
              </div>
              <div className="flex shrink-0 gap-2">
                <button type="button" onClick={() => setMany(visibleIds, true)} className={secondaryButtonClass}>
                  {query.trim() ? "Select shown" : "Select all permissions"}
                </button>
                <button type="button" onClick={() => setMany(visibleIds, false)} className={secondaryButtonClass}>
                  {query.trim() ? "Clear shown" : "Clear all permissions"}
                </button>
              </div>
            </div>
            <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
                  <tr>
                    <th className="px-4 py-2.5 text-left font-semibold">Module</th>
                    {ACTIONS.map((action) => (
                      <th key={action} className="px-3 py-2.5 text-center font-semibold">{action}</th>
                    ))}
                    <th className="px-3 py-2.5 text-right font-semibold">Group</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {visibleRows.length === 0 && (
                    <tr><td colSpan={ACTIONS.length + 2} className="px-4 py-6 text-center text-slate-400">No permissions match.</td></tr>
                  )}
                  {visibleRows.map((row) => {
                    const ids = ACTIONS.map((a) => row.cells[a]?.id).filter((id): id is number => id !== undefined);
                    return (
                      <tr key={`${row.appLabel}.${row.model}`}>
                        <td className="px-4 py-2">
                          <button type="button" onClick={() => toggleRow(ids)}
                            className="text-left font-medium text-slate-700 hover:text-blue-600 dark:text-slate-200 dark:hover:text-blue-400"
                            title="Toggle every action for this module">
                            {modelLabel(row.model)}
                          </button>
                          <span className="block text-xs text-slate-400">{row.appLabel}</span>
                        </td>
                        {ACTIONS.map((action) => {
                          const permission = row.cells[action];
                          return (
                            <td key={action} className="px-3 py-2 text-center">
                              {permission ? (
                                <input type="checkbox" checked={selected.has(permission.id)} onChange={() => toggle(permission.id)}
                                  aria-label={permission.name} title={permission.name}
                                  className="h-4 w-4 cursor-pointer rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
                              ) : (
                                <span className="text-slate-300 dark:text-slate-700">—</span>
                              )}
                            </td>
                          );
                        })}
                        <td className="whitespace-nowrap px-3 py-2 text-right text-xs">
                          <button type="button" onClick={() => setMany(ids, true)} className="font-medium text-blue-600 hover:underline dark:text-blue-400">Select all</button>
                          <span className="mx-1 text-slate-300 dark:text-slate-700">·</span>
                          <button type="button" onClick={() => setMany(ids, false)} className="font-medium text-slate-500 hover:underline dark:text-slate-400">Clear all</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="flex shrink-0 justify-end gap-2 border-t border-slate-100 p-4 dark:border-slate-800">
          <button type="button" onClick={onClose} className={secondaryButtonClass}>Cancel</button>
          <button type="submit" disabled={saving || !name.trim()} className={cn(primaryButtonClass, "flex items-center gap-2")}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {role ? "Save role" : "Create role"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ── User access editor ───────────────────────────────────────────────────────

function UserAccessEditor({
  user,
  roles,
  users,
  canLinkEmployee,
  onClose,
  onSaved,
}: {
  user: UserRow;
  roles: Role[];
  users: UserRow[];
  canLinkEmployee: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { showErrorFromException } = useToast();
  // Employees are needed only for the link picker, so they load only here.
  const { employees } = useEmployees({ load: canLinkEmployee });
  const { me } = useCurrentUser();
  const heldRoleIds = useMemo(() => new Set(user.roles.map((r) => r.id)), [user.roles]);
  const [selected, setSelected] = useState<Set<number>>(() => new Set(user.roles.map((r) => r.id)));
  const [employeeId, setEmployeeId] = useState<string>(user.employee ? String(user.employee.id) : "");
  const [saving, setSaving] = useState(false);

  // Employees already linked to a different account can't be picked (one account per employee).
  const takenEmployeeIds = useMemo(
    () => new Set(users.filter((u) => u.id !== user.id && u.employee).map((u) => u.employee!.id)),
    [users, user.id]
  );

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const rolesChanged =
        selected.size !== user.roles.length || user.roles.some((r) => !selected.has(r.id));
      if (rolesChanged) await apiPut(`/accounts/users/${user.id}/roles/`, { roles: Array.from(selected) });

      const previous = user.employee?.id ?? null;
      const next = employeeId ? Number(employeeId) : null;
      if (canLinkEmployee && previous !== next) {
        // Unlink first: an account can belong to only one employee.
        if (previous !== null) await apiPatch(`/organization/employees/${previous}/`, { user: null });
        if (next !== null) await apiPatch(`/organization/employees/${next}/`, { user: user.id });
      }
      onSaved();
    } catch (error) {
      showErrorFromException(error, "Could not update this user's access.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal onClose={onClose} maxWidthClassName="max-w-lg" variant="content">
      <form onSubmit={submit} className="flex max-h-[90vh] flex-col">
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-100 p-5 dark:border-slate-800">
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold text-slate-900 dark:text-white">{user.display_name}</h2>
            <p className="truncate text-sm text-slate-500 dark:text-slate-400">{user.email || user.username}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 dark:hover:bg-slate-800">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5">
          {user.is_superuser && (
            <p className="rounded-xl bg-indigo-50 px-4 py-3 text-sm text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300">
              Superuser — has every permission regardless of roles.
            </p>
          )}
          <div>
            <FieldLabel>Roles</FieldLabel>
            <div className="space-y-2">
              {roles.map((role) => {
                // Mirrors the server rule: an inactive role can't be newly
                // assigned (except by a superuser); a held one can still be removed.
                const locked = !role.is_active && !heldRoleIds.has(role.id) && !me?.user.is_superuser;
                return (
                <label key={role.id} title={locked ? "Inactive roles can't be assigned" : undefined}
                  className={cn("flex items-start gap-3 rounded-xl border border-slate-200 px-4 py-3 dark:border-slate-800",
                    locked ? "cursor-not-allowed opacity-50" : "cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/60")}>
                  <input type="checkbox" checked={selected.has(role.id)} disabled={locked}
                    onChange={() => setSelected((prev) => {
                      const next = new Set(prev);
                      if (next.has(role.id)) next.delete(role.id);
                      else next.add(role.id);
                      return next;
                    })}
                    className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-slate-800 dark:text-slate-100">
                      {role.name}
                      {!role.is_active && <span className="ml-2 text-xs font-normal text-slate-400">(inactive)</span>}
                    </span>
                    {role.description && <span className="block text-xs text-slate-500 dark:text-slate-400">{role.description}</span>}
                  </span>
                </label>
                );
              })}
            </div>
          </div>
          {canLinkEmployee && (
            <div>
              <FieldLabel htmlFor="linked-employee" hint="Profile, name and phone come from this record">Employee record</FieldLabel>
              <select id="linked-employee" className={controlClass} value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
                <option value="">Not linked</option>
                {employees.map((employee) => (
                  <option key={employee.id} value={employee.id} disabled={takenEmployeeIds.has(employee.id)}>
                    {employee.name}
                    {employee.employeeId ? ` · ${employee.employeeId}` : ""}
                    {takenEmployeeIds.has(employee.id) ? " (linked to another account)" : ""}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
        <div className="flex shrink-0 justify-end gap-2 border-t border-slate-100 p-4 dark:border-slate-800">
          <button type="button" onClick={onClose} className={secondaryButtonClass}>Cancel</button>
          <button type="submit" disabled={saving} className={cn(primaryButtonClass, "flex items-center gap-2")}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Save roles
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ── Role details ─────────────────────────────────────────────────────────────

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleString() : "—";
}

function RoleDetails({
  role,
  catalogue,
  members,
  onClose,
}: {
  role: Role;
  catalogue: Permission[];
  members: UserRow[] | null;
  onClose: () => void;
}) {
  // Granted permissions grouped by module, resolved against the catalogue.
  const groups = useMemo(() => {
    const granted = new Set(role.permissions);
    const byModel = new Map<string, Permission[]>();
    for (const permission of catalogue) {
      if (!granted.has(permission.id)) continue;
      const list = byModel.get(permission.model) ?? [];
      list.push(permission);
      byModel.set(permission.model, list);
    }
    return Array.from(byModel.entries());
  }, [role.permissions, catalogue]);

  const facts: [string, string][] = [
    ["Status", role.is_active ? "Active" : "Inactive"],
    ["Users", String(role.user_count)],
    ["Permissions", String(role.permission_count)],
    ["Created by", role.created_by_name ?? "—"],
    ["Created at", formatDate(role.created_at)],
    ["Updated at", formatDate(role.updated_at)],
  ];

  return (
    <Modal onClose={onClose} maxWidthClassName="max-w-2xl" variant="content">
      <div className="flex max-h-[90vh] flex-col">
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-100 p-5 dark:border-slate-800">
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold text-slate-900 dark:text-white">{role.name}</h2>
            <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{role.description || "No description."}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 dark:hover:bg-slate-800">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5">
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {facts.map(([label, value]) => (
              <div key={label} className="rounded-xl border border-slate-200 px-3 py-2 dark:border-slate-800">
                <dt className="text-xs text-slate-500 dark:text-slate-400">{label}</dt>
                <dd className="mt-0.5 truncate text-sm font-medium text-slate-800 dark:text-slate-100">{value}</dd>
              </div>
            ))}
          </dl>
          {members && (
            <div>
              <FieldLabel>Users</FieldLabel>
              {members.length ? (
                <div className="flex flex-wrap gap-1.5">
                  {members.map((m) => (
                    <span key={m.id} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                      {m.display_name}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-400">No users hold this role.</p>
              )}
            </div>
          )}
          {catalogue.length > 0 && (
            <div>
              <FieldLabel>Permissions</FieldLabel>
              {groups.length ? (
                <div className="space-y-2">
                  {groups.map(([model, list]) => (
                    <div key={model} className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm">
                      <span className="w-40 shrink-0 font-medium text-slate-700 dark:text-slate-200">{modelLabel(model)}</span>
                      {list.map((p) => (
                        <span key={p.id} className="rounded-md bg-blue-50 px-1.5 py-0.5 text-xs text-blue-700 dark:bg-blue-500/10 dark:text-blue-300">
                          {p.codename.split("_", 1)[0]}
                        </span>
                      ))}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-400">This role grants no permissions.</p>
              )}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

/**
 * Roles & Permissions. Roles are Django Groups (+ RoleProfile), permissions
 * are Django's own model permissions, membership is User.groups — all read
 * from and written to /api/accounts/{roles,permissions,users}/. This page is
 * the only owner of that data, so it loads it itself, only when opened.
 */
export function RolesPermissionsView() {
  const { me, can, refresh: refreshMe } = useCurrentUser();
  const { showSuccess, showErrorFromException } = useToast();
  const canViewRoles = can("auth.view_group");
  const canViewUsers = can("auth.view_user");
  const canAddRole = can("auth.add_group");
  const canChangeRole = can("auth.change_group");
  const canDeleteRole = can("auth.delete_group");
  const canChangeUsers = can("auth.change_user");
  const canLinkEmployee = canChangeUsers && can("assets.change_employee") && can("assets.view_employee");

  const searchParams = useSearchParams();
  // Until the user picks a tab, derive it: permissions arrive with /me/ after
  // the first render, so a fixed initial value would pick the wrong tab.
  const [pickedTab, setTab] = useState<"roles" | "users" | null>(null);
  const tab = pickedTab ?? (searchParams.get("tab") === "users" || !canViewRoles ? "users" : "roles");
  const [roleQuery, setRoleQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [viewingRole, setViewingRole] = useState<Role | null>(null);
  const [roles, setRoles] = useState<Role[]>([]);
  const [catalogue, setCatalogue] = useState<Permission[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingRole, setEditingRole] = useState<Role | "new" | null>(null);
  const [editingUser, setEditingUser] = useState<UserRow | null>(null);

  const loadUsers = useCallback(() => apiGetAll<UserRow>("/accounts/users/").then(setUsers), []);

  // Load once per visit, as soon as the signed-in user's permissions are known.
  const loadedOnce = useRef(false);
  useEffect(() => {
    if (!me || loadedOnce.current) return;
    loadedOnce.current = true;
    const requests: Promise<unknown>[] = [];
    if (canViewRoles) {
      requests.push(apiGet<Role[]>("/accounts/roles/").then(setRoles));
      if (can("auth.view_permission")) requests.push(apiGet<Permission[]>("/accounts/permissions/").then(setCatalogue));
    }
    if (canViewUsers) requests.push(loadUsers());
    Promise.all(requests)
      .catch((err) => setError(errorMessage(err, "Could not load roles and permissions.")))
      .finally(() => setLoading(false));
  }, [me, can, canViewRoles, canViewUsers, loadUsers]);

  const visibleRoles = useMemo(() => {
    const q = roleQuery.trim().toLowerCase();
    return roles.filter((role) =>
      (statusFilter === "all" || role.is_active === (statusFilter === "active")) &&
      (!q || role.name.toLowerCase().includes(q) || role.description.toLowerCase().includes(q))
    );
  }, [roles, roleQuery, statusFilter]);

  // Members come from the already-loaded Users list (no extra request); null
  // when the viewer may not list users.
  const membersOf = (role: Role) => (canViewUsers ? users.filter((u) => u.roles.some((r) => r.id === role.id)) : null);

  function upsertRole(saved: Role) {
    setRoles((prev) =>
      (prev.some((r) => r.id === saved.id) ? prev.map((r) => (r.id === saved.id ? saved : r)) : [...prev, saved])
        .sort((a, b) => a.name.localeCompare(b.name))
    );
  }

  async function deleteRole(role: Role) {
    if (!window.confirm(`Delete the role "${role.name}"? This cannot be undone.`)) return;
    try {
      await apiDelete(`/accounts/roles/${role.id}/`);
      setRoles((prev) => prev.filter((r) => r.id !== role.id));
      showSuccess(`Role ${role.name} deleted.`);
    } catch (err) {
      showErrorFromException(err, "Could not delete this role.");
    }
  }

  if (me && !canViewRoles && !canViewUsers) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
          <ShieldOff className="h-6 w-6" />
        </span>
        <h1 className="mt-4 text-xl font-bold text-slate-900 dark:text-white">No access</h1>
        <p className="mt-1 max-w-sm text-sm text-slate-500 dark:text-slate-400">
          Your role doesn&apos;t include managing roles or user accounts.
        </p>
      </div>
    );
  }

  const selfIsEditable = (row: UserRow) => row.id !== me?.user.id || me.user.is_superuser;

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center animate-fade-in-up">
        <div>
          <Link href="/dashboard/settings"
            className="mb-1 inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-blue-600 dark:text-slate-400 dark:hover:text-blue-400">
            <ChevronLeft className="h-3.5 w-3.5" /> Settings
          </Link>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Roles &amp; Permissions</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Manage roles and control what users can access in AssetFlow.
          </p>
        </div>
        {tab === "roles" && canAddRole && catalogue.length > 0 && (
          <button type="button" onClick={() => setEditingRole("new")} className={cn(primaryButtonClass, "flex items-center gap-2")}>
            <Plus className="h-4 w-4" />
            Create role
          </button>
        )}
      </div>

      <div className="flex gap-2">
        {canViewRoles && (
          <button type="button" onClick={() => setTab("roles")}
            className={cn("flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition",
              tab === "roles" ? "bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400" : "text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800")}>
            <Shield className="h-4 w-4" /> Roles ({roles.length})
          </button>
        )}
        {canViewUsers && (
          <button type="button" onClick={() => setTab("users")}
            className={cn("flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition",
              tab === "users" ? "bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400" : "text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800")}>
            <Users className="h-4 w-4" /> Users ({users.length})
          </button>
        )}
      </div>

      {error && (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">{error}</p>
      )}

      {loading ? (
        <div className="h-64 animate-pulse rounded-2xl bg-slate-200/70 dark:bg-slate-800/70" aria-busy="true" />
      ) : tab === "roles" ? (
        <div className="space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1 sm:max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input type="search" value={roleQuery} onChange={(e) => setRoleQuery(e.target.value)} placeholder="Search roles"
              aria-label="Search roles" className={cn(controlClass, "pl-9")} />
          </div>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
            aria-label="Filter by status" className={cn(controlClass, "sm:w-44")}>
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
        {visibleRoles.length === 0 && (
          <p className="rounded-2xl border border-dashed border-slate-200 px-4 py-10 text-center text-sm text-slate-400 dark:border-slate-800">
            No roles match.
          </p>
        )}
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {visibleRoles.map((role) => (
            <div key={role.id} className="flex flex-col rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <button type="button" onClick={() => setViewingRole(role)} title="View role details"
                    className="block max-w-full truncate text-left text-base font-semibold text-slate-900 hover:text-blue-600 dark:text-white dark:hover:text-blue-400">
                    {role.name}
                  </button>
                  <p className="mt-0.5 line-clamp-2 text-sm text-slate-500 dark:text-slate-400">{role.description || "No description."}</p>
                </div>
                <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-xs font-medium",
                  role.is_active ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300" : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400")}>
                  {role.is_active ? "Active" : "Inactive"}
                </span>
              </div>
              <div className="mt-4 flex gap-4 text-sm text-slate-600 dark:text-slate-300">
                <span><strong className="font-semibold">{role.user_count}</strong> user{role.user_count === 1 ? "" : "s"}</span>
                <span><strong className="font-semibold">{role.permission_count}</strong> permission{role.permission_count === 1 ? "" : "s"}</span>
              </div>
              {(canChangeRole || canDeleteRole) && (
                <div className="mt-4 flex justify-end gap-2 border-t border-slate-100 pt-4 dark:border-slate-800">
                  {canDeleteRole && (
                    <button type="button" onClick={() => void deleteRole(role)} disabled={role.user_count > 0}
                      title={role.user_count > 0 ? "This role cannot be deleted because users are assigned to it." : "Delete role"}
                      className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40 dark:text-red-400 dark:hover:bg-red-500/10">
                      <Trash2 className="h-4 w-4" /> Delete
                    </button>
                  )}
                  {canChangeRole && catalogue.length > 0 && (
                    <button type="button" onClick={() => setEditingRole(role)}
                      className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800">
                      <Pencil className="h-4 w-4" /> Edit
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
              <tr>
                <th className="px-5 py-3 font-semibold">User</th>
                <th className="px-5 py-3 font-semibold">Email</th>
                <th className="px-5 py-3 font-semibold">Assigned roles</th>
                <th className="px-5 py-3 font-semibold">Employee</th>
                <th className="px-5 py-3 font-semibold">Status</th>
                {canChangeUsers && <th className="px-5 py-3" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {users.map((row) => (
                <tr key={row.id}>
                  <td className="px-5 py-3">
                    <p className="font-medium text-slate-800 dark:text-slate-100">{row.display_name}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{row.username}</p>
                  </td>
                  <td className="px-5 py-3 text-slate-600 dark:text-slate-300">
                    {row.email || <span className="text-slate-400">—</span>}
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex flex-wrap gap-1">
                      {row.is_superuser && (
                        <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300">Superuser</span>
                      )}
                      {row.roles.map((role) => (
                        <span key={role.id} className={cn("rounded-full px-2 py-0.5 text-xs font-medium",
                          role.is_active ? "bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300" : "bg-slate-100 text-slate-400 line-through dark:bg-slate-800 dark:text-slate-500")}>
                          {role.name}
                        </span>
                      ))}
                      {!row.is_superuser && row.roles.length === 0 && <span className="text-xs text-slate-400">No role</span>}
                    </div>
                  </td>
                  <td className="px-5 py-3 text-slate-600 dark:text-slate-300">
                    {row.employee ? `${row.employee.name}${row.employee.employee_id ? ` · ${row.employee.employee_id}` : ""}` : <span className="text-slate-400">Not linked</span>}
                  </td>
                  <td className="px-5 py-3">
                    <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium",
                      row.is_active ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300" : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400")}>
                      {row.is_active ? "Active" : "Disabled"}
                    </span>
                  </td>
                  {canChangeUsers && (
                    <td className="px-5 py-3 text-right">
                      {selfIsEditable(row) ? (
                        <button type="button" onClick={() => setEditingUser(row)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800">
                          <UserCog className="h-4 w-4" /> Edit roles
                        </button>
                      ) : (
                        <span className="text-xs text-slate-400" title="Ask another administrator to change your own roles">You</span>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editingRole && (
        <RoleEditor
          role={editingRole === "new" ? null : editingRole}
          catalogue={catalogue}
          members={editingRole === "new" ? null : membersOf(editingRole)}
          onClose={() => setEditingRole(null)}
          onSaved={(saved) => {
            upsertRole(saved);
            setEditingRole(null);
            showSuccess(`Role ${saved.name} saved.`);
            // Your own permissions may have changed.
            void refreshMe();
          }}
        />
      )}

      {viewingRole && (
        <RoleDetails
          role={viewingRole}
          catalogue={catalogue}
          members={membersOf(viewingRole)}
          onClose={() => setViewingRole(null)}
        />
      )}

      {editingUser && (
        <UserAccessEditor
          user={editingUser}
          roles={roles}
          users={users}
          canLinkEmployee={canLinkEmployee}
          onClose={() => setEditingUser(null)}
          onSaved={() => {
            setEditingUser(null);
            showSuccess("Access updated.");
            void loadUsers().catch(() => undefined);
            // Membership counts on the Roles tab change too.
            if (canViewRoles) void apiGet<Role[]>("/accounts/roles/").then(setRoles).catch(() => undefined);
            if (editingUser.id === me?.user.id) void refreshMe();
          }}
        />
      )}
    </div>
  );
}
