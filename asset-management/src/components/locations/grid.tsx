"use client";

import { useMemo, useState } from "react";
import { Boxes, IndianRupee, MapPin, Plus, Search, Users, X } from "lucide-react";
import { useCan } from "@/components/auth/context";
import { useAssets } from "@/components/assets/context";
import { useEmployees } from "@/components/employees/context";
import { useLocations } from "@/components/locations/context";
import { LOCATION_TYPES, typeMeta, type Location, type LocationType } from "@/components/locations/data";
import { LocationDetailModal } from "@/components/locations/detail-modal";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

const labelClass = "mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300";
const inputClass =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-100";

function OptionalTag() {
  return <span className="ml-1 text-xs font-normal text-slate-400 dark:text-slate-500">(Optional)</span>;
}

function SectionDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 pt-2">
      <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
        {label}
      </span>
      <div className="h-px flex-1 bg-slate-100 dark:bg-slate-800" />
    </div>
  );
}

function emptyLocationForm() {
  return {
    name: "",
    type: LOCATION_TYPES[0] as LocationType,
    code: "",
    status: "Active" as "Active" | "Inactive",
    address: "",
    city: "",
    state: "",
    country: "",
    postalCode: "",
    notes: "",
  };
}

export function LocationsGrid() {
  const { locations, createLocation, updateLocation, deleteLocation } = useLocations();
  const { assets } = useAssets();
  const { employees } = useEmployees();
  const { showSuccess, showErrorFromException } = useToast();
  const canAdd = useCan("assets.add_location");
  const canChange = useCan("assets.change_location");
  const canDelete = useCan("assets.delete_location");
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<LocationType | "All">("All");
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<"add" | "edit">("add");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState(emptyLocationForm());
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [viewLocationId, setViewLocationId] = useState<number | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Location | null>(null);

  const stats = useMemo(() => {
    return locations.map((loc) => {
      const locAssets = assets.filter((a) => a.location === loc.name);
      const locEmployees = employees.filter((e) => e.location === loc.name);
      const totalValue = locAssets.reduce((sum, a) => sum + a.currentValue, 0);
      const inRepair = locAssets.filter((a) => a.status === "In Repair").length;
      return { ...loc, locAssets, locEmployees, totalValue, inRepair };
    });
  }, [locations, assets, employees]);

  const totalAssets = assets.length;
  const maxAssets = Math.max(1, ...stats.map((s) => s.locAssets.length));

  const filtered = stats.filter((loc) => {
    const matchesType = typeFilter === "All" || loc.type === typeFilter;
    const q = query.trim().toLowerCase();
    const matchesQuery = !q || loc.name.toLowerCase().includes(q) || loc.address.toLowerCase().includes(q);
    return matchesType && matchesQuery;
  });

  const viewLocation = stats.find((s) => s.id === viewLocationId) ?? null;

  function openAddModal() {
    setFormMode("add");
    setEditingId(null);
    setForm(emptyLocationForm());
    setFormError(null);
    setFormOpen(true);
  }

  function openEditModal(location: Location) {
    setFormMode("edit");
    setEditingId(location.id);
    setForm({
      name: location.name,
      type: location.type,
      code: location.code ?? "",
      status: location.status ?? "Active",
      address: location.address,
      city: location.city ?? "",
      state: location.state ?? "",
      country: location.country ?? "",
      postalCode: location.postalCode ?? "",
      notes: location.notes ?? "",
    });
    setFormError(null);
    setFormOpen(true);
    setViewLocationId(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const name = form.name.trim();
    if (!name) {
      setFormError("Enter a location name.");
      return;
    }
    if (
      locations.some(
        (l) => l.name.toLowerCase() === name.toLowerCase() && l.id !== editingId
      )
    ) {
      setFormError("A location with this name already exists.");
      return;
    }

    setSubmitting(true);
    setFormError(null);
    try {
      const input = {
        name,
        type: form.type as LocationType,
        address: form.address.trim() || "No address on file",
      };
      if (formMode === "edit" && editingId !== null) {
        await updateLocation(editingId, input);
        showSuccess(`Location "${name}" updated.`);
      } else {
        await createLocation(input);
        showSuccess(`Location "${name}" created.`);
      }
      setFormOpen(false);
    } catch (error) {
      showErrorFromException(error);
      setFormError(error instanceof Error ? error.message : "Could not save this location.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(location: Location) {
    try {
      await deleteLocation(location.id);
      showSuccess(`Location "${location.name}" deleted.`);
    } catch (error) {
      showErrorFromException(error, "Could not delete this location.");
    } finally {
      setConfirmDelete(null);
      setViewLocationId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center animate-pin-drop">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Workplaces</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {locations.length} workplaces · {totalAssets} assets · {employees.length} employees
          </p>
        </div>
        {canAdd && (
          <button
            type="button"
            onClick={openAddModal}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
          >
            <Plus className="h-4 w-4" />
            Add Location
          </button>
        )}
      </div>

      <div
        className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between animate-pin-drop"
        style={{ animationDelay: "120ms" }}
      >
        <div className="flex flex-wrap gap-2">
          {(["All", ...LOCATION_TYPES] as const).map((t) => {
            const count = t === "All" ? locations.length : stats.filter((s) => s.type === t).length;
            const active = typeFilter === t;
            return (
              <button
                key={t}
                type="button"
                onClick={() => setTypeFilter(t)}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-sm font-medium transition",
                  active
                    ? "bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400"
                    : "text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                )}
              >
                {t} ({count})
              </button>
            );
          })}
        </div>
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search locations…"
            className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
          />
        </div>
      </div>

      <div
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 animate-pin-drop"
        style={{ animationDelay: "240ms" }}
      >
        {filtered.map((loc) => {
          const meta = typeMeta(loc.type);
          const Icon = meta.icon;
          const assetCount = loc.locAssets.length;
          const fleetShare = totalAssets > 0 ? Math.round((assetCount / totalAssets) * 100) : 0;
          return (
            <button
              type="button"
              key={loc.id}
              onClick={() => setViewLocationId(loc.id)}
              className="group flex flex-col rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm shadow-slate-900/[0.02] transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md hover:shadow-slate-900/5 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700"
            >
              <div className="flex items-start justify-between">
                <span
                  className={cn(
                    "flex h-11 w-11 items-center justify-center rounded-xl transition group-hover:scale-105",
                    meta.iconBg
                  )}
                >
                  <Icon className="h-5 w-5" strokeWidth={2} />
                </span>
                <div className="flex flex-col items-end gap-1.5">
                  <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", meta.chip)}>{loc.type}</span>
                  {loc.inRepair > 0 && (
                    <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-600 dark:bg-red-500/10 dark:text-red-400">
                      {loc.inRepair} in repair
                    </span>
                  )}
                </div>
              </div>

              <p className="mt-4 text-base font-semibold text-slate-900 dark:text-white">{loc.name}</p>
              <p className="mt-1 flex items-center gap-1 truncate text-xs text-slate-400 dark:text-slate-500">
                <MapPin className="h-3 w-3 shrink-0" />
                {loc.address}
              </p>

              <p className="mt-3 flex items-center gap-3 text-xs text-slate-400 dark:text-slate-500">
                <span className="flex items-center gap-1">
                  <Boxes className="h-3 w-3" />
                  {assetCount} asset{assetCount === 1 ? "" : "s"}
                </span>
                <span className="flex items-center gap-1">
                  <Users className="h-3 w-3" />
                  {loc.locEmployees.length} employee{loc.locEmployees.length === 1 ? "" : "s"}
                </span>
              </p>

              <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                <div
                  className={cn("h-full rounded-full bg-gradient-to-r", meta.bar)}
                  style={{ width: `${(assetCount / maxAssets) * 100}%` }}
                />
              </div>

              <p className="mt-3 flex items-center justify-between text-xs text-slate-400 dark:text-slate-500">
                <span className="flex items-center gap-1">
                  <IndianRupee className="h-3 w-3" />
                  {(loc.totalValue / 100000).toFixed(1)}L current asset value
                </span>
                <span>{fleetShare}% of fleet</span>
              </p>
            </button>
          );
        })}

        {filtered.length === 0 && (
          <div className="col-span-full flex flex-col items-center gap-2 rounded-2xl border border-dashed border-slate-200 py-16 text-slate-400 dark:border-slate-800 dark:text-slate-500">
            <MapPin className="h-8 w-8" />
            <p className="text-sm">No locations match your filters.</p>
          </div>
        )}
      </div>

      {formOpen && (
        <Modal onClose={() => setFormOpen(false)} maxWidthClassName="max-w-2xl" variant="content">
            <div className="flex shrink-0 items-center justify-between border-b border-slate-100 p-6 dark:border-slate-800">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                {formMode === "edit" ? "Edit Location" : "Add Location"}
              </h2>
              <button
                type="button"
                onClick={() => setFormOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6">
              <div className="space-y-4">
                <SectionDivider label="Location Information" />

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className={labelClass}>
                      Location Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={form.name}
                      onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                      placeholder="e.g. Chennai Branch"
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>
                      Type <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={form.type}
                      onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as LocationType }))}
                      className={inputClass}
                    >
                      {LOCATION_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className={labelClass}>
                      Location Code
                      <OptionalTag />
                    </label>
                    <input
                      type="text"
                      value={form.code}
                      onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
                      placeholder="e.g. HYD-HQ"
                      className={cn(inputClass, "font-mono")}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>
                      Status <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={form.status}
                      onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as "Active" | "Inactive" }))}
                      className={inputClass}
                    >
                      <option value="Active">Active</option>
                      <option value="Inactive">Inactive</option>
                    </select>
                  </div>
                </div>

                <SectionDivider label="Address" />

                <div>
                  <label className={labelClass}>
                    Address
                    <OptionalTag />
                  </label>
                  <input
                    type="text"
                    value={form.address}
                    onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                    placeholder="e.g. OMR Road, Chennai"
                    className={inputClass}
                  />
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className={labelClass}>
                      City
                      <OptionalTag />
                    </label>
                    <input
                      type="text"
                      value={form.city}
                      onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>
                      State
                      <OptionalTag />
                    </label>
                    <input
                      type="text"
                      value={form.state}
                      onChange={(e) => setForm((f) => ({ ...f, state: e.target.value }))}
                      className={inputClass}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className={labelClass}>
                      Country
                      <OptionalTag />
                    </label>
                    <input
                      type="text"
                      value={form.country}
                      onChange={(e) => setForm((f) => ({ ...f, country: e.target.value }))}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>
                      Postal Code
                      <OptionalTag />
                    </label>
                    <input
                      type="text"
                      value={form.postalCode}
                      onChange={(e) => setForm((f) => ({ ...f, postalCode: e.target.value }))}
                      className={inputClass}
                    />
                  </div>
                </div>

                <div>
                  <label className={labelClass}>
                    Description / Notes
                    <OptionalTag />
                  </label>
                  <textarea
                    value={form.notes}
                    onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                    rows={2}
                    placeholder="e.g. Main office and IT asset storage location"
                    className={cn(inputClass, "resize-none")}
                  />
                </div>

                {formError && (
                  <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-500/10 dark:text-red-400">
                    {formError}
                  </p>
                )}
              </div>

              <div className="mt-5 flex justify-end gap-2 border-t border-slate-100 pt-4 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setFormOpen(false)}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {submitting ? "Saving…" : formMode === "edit" ? "Save Changes" : "Add Location"}
                </button>
              </div>
            </form>
        </Modal>
      )}

      {viewLocation && (
        <LocationDetailModal
          location={viewLocation}
          assets={viewLocation.locAssets}
          employees={viewLocation.locEmployees}
          onClose={() => setViewLocationId(null)}
          onEdit={canChange ? openEditModal : undefined}
          onDelete={canDelete ? setConfirmDelete : undefined}
        />
      )}

      {confirmDelete && (
        <Modal onClose={() => setConfirmDelete(null)} maxWidthClassName="max-w-sm" zIndexClassName="z-40">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Delete location?</h2>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
              This will permanently delete &quot;{confirmDelete.name}&quot;. This can&apos;t be undone.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmDelete(null)}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleDelete(confirmDelete)}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-red-700"
              >
                Delete
              </button>
            </div>
        </Modal>
      )}
    </div>
  );
}
