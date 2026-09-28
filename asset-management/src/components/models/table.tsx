"use client";

import { useMemo, useState } from "react";
import { Boxes, Eye, Layers, Loader2, Plus, Search, Sparkles, X } from "lucide-react";
import { useCan } from "@/components/auth/context";
import { useAssets } from "@/components/assets/context";
import { useModels } from "@/components/models/context";
import { useCategories } from "@/components/categories/context";
import { useBrands } from "@/components/brands/context";
import type { ModelEntry } from "@/components/models/data";
import { ModelDetailModal } from "@/components/models/detail-modal";
import { useToast } from "@/components/ui/toast";
import {
  FieldLabel,
  FormError,
  InlineError,
  Modal,
  controlClass,
  invalidControlClass,
  primaryButtonClass,
  secondaryButtonClass,
} from "@/components/ui/modal";
import { cn } from "@/lib/utils";
import type { CatalogViewMode } from "@/components/catalog/tabs";

const emptyForm = {
  name: "",
  // Chosen from the backend's categories; no hardcoded default.
  category: "",
  brand: "" as number | "",
  code: "",
  spec: "",
  description: "",
};

type ModelFormErrors = Partial<Record<"name" | "category" | "brand", string>>;

export function ModelsTable({ viewMode = "table" }: { viewMode?: CatalogViewMode }) {
  const { models, createModel, updateModel, deleteModel } = useModels();
  const { assets } = useAssets();
  const { categories } = useCategories();
  const { brands, createBrand } = useBrands();
  const { showSuccess, showErrorFromException } = useToast();
  const canAdd = useCan("catalog.add_model");
  const canChange = useCan("catalog.change_model");
  const canDelete = useCan("catalog.delete_model");
  const canAddBrand = useCan("catalog.add_brand");
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string | "All">("All");
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<"add" | "edit">("add");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<ModelFormErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [viewModelId, setViewModelId] = useState<number | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<ModelEntry | null>(null);

  // Inline "Create Brand" affordance shown in the form's empty state instead
  // of forcing a trip out to the Brands tab.
  const [quickAddBrandOpen, setQuickAddBrandOpen] = useState(false);
  const [quickAddBrandName, setQuickAddBrandName] = useState("");
  const [quickAddBrandError, setQuickAddBrandError] = useState<string | null>(null);
  const [quickAddBrandSubmitting, setQuickAddBrandSubmitting] = useState(false);

  const stats = useMemo(() => {
    return models.map((m) => {
      // Real Asset.model FK (model names are unique), not the asset's own name.
      const modelAssets = assets.filter((a) => a.model === m.name);
      return { ...m, modelAssets };
    });
  }, [models, assets]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return stats.filter((m) => {
      const matchesCategory = categoryFilter === "All" || m.category === categoryFilter;
      const matchesQuery =
        !q ||
        m.name.toLowerCase().includes(q) ||
        m.brand.toLowerCase().includes(q) ||
        m.category.toLowerCase().includes(q);
      return matchesCategory && matchesQuery;
    });
  }, [stats, search, categoryFilter]);

  const totalAssets = assets.length;
  const brandCount = new Set(models.map((m) => m.brand)).size;
  const viewModel = stats.find((m) => m.id === viewModelId) ?? null;

  // A brand scoped to one category (via the Add Brand form) should only be
  // offered while that category is selected — brands with no declared
  // category aren't scoped to anything, so they stay available everywhere.
  const brandOptions = useMemo(
    () => brands.filter((b) => !b.categoryName || b.categoryName === form.category),
    [brands, form.category]
  );

  function resetQuickAddBrand() {
    setQuickAddBrandOpen(false);
    setQuickAddBrandName("");
    setQuickAddBrandError(null);
  }

  function openAddModal() {
    setFormMode("add");
    setEditingId(null);
    setForm(emptyForm);
    setFormError(null);
    setFieldErrors({});
    resetQuickAddBrand();
    setFormOpen(true);
  }

  function openEditModal(model: ModelEntry) {
    setFormMode("edit");
    setEditingId(model.id);
    setForm({
      name: model.name,
      category: model.category,
      brand: model.brandId,
      code: model.code,
      spec: model.spec,
      description: model.description,
    });
    setFormError(null);
    setFieldErrors({});
    resetQuickAddBrand();
    setFormOpen(true);
    setViewModelId(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const name = form.name.trim();
    const errors: ModelFormErrors = {};

    if (!name) {
      errors.name = "Enter a model name.";
    } else if (
      models.some((m) => m.name.toLowerCase() === name.toLowerCase() && m.id !== editingId)
    ) {
      errors.name = "A model with this name already exists.";
    }

    const categoryMatch = categories.find((c) => c.name === form.category);
    if (!categoryMatch) {
      errors.category = "Select a valid category.";
    }

    const brandMatch = brands.find((b) => b.id === form.brand);
    if (!brandMatch) {
      errors.brand = "Select a brand.";
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      setFormError(null);
      return;
    }
    // Narrowed by the checks above, but TS can't see through `errors`.
    if (!categoryMatch || !brandMatch) return;

    setFieldErrors({});
    setSubmitting(true);
    setFormError(null);
    const input = {
      name,
      categoryId: categoryMatch.id,
      brandId: brandMatch.id,
      code: form.code.trim(),
      spec: form.spec.trim(),
      description: form.description.trim(),
    };
    try {
      if (formMode === "edit" && editingId !== null) {
        await updateModel(editingId, input);
        showSuccess(`Model "${name}" updated.`);
      } else {
        await createModel(input);
        showSuccess(`Model "${name}" created.`);
      }
      setFormOpen(false);
    } catch (error) {
      showErrorFromException(error);
      setFormError(error instanceof Error ? error.message : "Could not save this model.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleQuickAddBrand() {
    const name = quickAddBrandName.trim();
    if (!name) {
      setQuickAddBrandError("Enter a brand name.");
      return;
    }
    if (brands.some((b) => b.name.toLowerCase() === name.toLowerCase())) {
      setQuickAddBrandError("A brand with this name already exists.");
      return;
    }
    const categoryMatch = categories.find((c) => c.name === form.category);
    setQuickAddBrandSubmitting(true);
    setQuickAddBrandError(null);
    try {
      const created = await createBrand({ name, categoryId: categoryMatch?.id ?? null });
      setForm((f) => ({ ...f, brand: created.id }));
      setFieldErrors((prev) => ({ ...prev, brand: undefined }));
      showSuccess(`Brand "${created.name}" created.`);
      resetQuickAddBrand();
    } catch (error) {
      showErrorFromException(error);
      setQuickAddBrandError(error instanceof Error ? error.message : "Could not create this brand.");
    } finally {
      setQuickAddBrandSubmitting(false);
    }
  }

  async function handleDelete(model: ModelEntry) {
    try {
      await deleteModel(model.id);
      showSuccess(`Model "${model.name}" deleted.`);
    } catch (error) {
      showErrorFromException(error, "Could not delete this model.");
    } finally {
      setConfirmDelete(null);
      setViewModelId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Models</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {models.length} models · {brandCount} brands · {totalAssets} assets in fleet
          </p>
        </div>
        {canAdd && (
          <button
            type="button"
            onClick={openAddModal}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
          >
            <Plus className="h-4 w-4" />
            Add Model
          </button>
        )}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-900/[0.02] dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search models, brands..."
              className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-500/20 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-100"
            />
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setCategoryFilter("All")}
              className={cn(
                "rounded-full px-3 py-1.5 text-sm font-medium transition",
                categoryFilter === "All"
                  ? "bg-blue-600 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
              )}
            >
              All
            </button>
            {categories.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setCategoryFilter(c.name)}
                className={cn(
                  "rounded-full px-3 py-1.5 text-sm font-medium transition",
                  categoryFilter === c.name
                    ? "bg-blue-600 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                )}
              >
                {c.name}
              </button>
            ))}
          </div>
        </div>
      </div>

      {viewMode === "table" ? (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm shadow-slate-900/[0.02] dark:border-slate-800 dark:bg-slate-900">
          <table className="w-full min-w-[800px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs uppercase tracking-wider text-slate-400 dark:border-slate-800 dark:text-slate-500">
                <th className="py-3 pl-4 pr-4 font-semibold">Model</th>
                <th className="py-3 pr-4 font-semibold">Brand</th>
                <th className="py-3 pr-4 font-semibold">Spec</th>
                <th className="py-3 pr-4 text-center font-semibold">Units</th>
                <th className="py-3 pr-4 font-semibold">Status</th>
                <th className="w-12 py-3 pr-4" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((m) => {
                const count = m.modelAssets.length;
                return (
                  <tr
                    key={m.id}
                    className="border-b border-slate-50 transition hover:bg-slate-50 dark:border-slate-800/60 dark:hover:bg-slate-800/40"
                  >
                    <td className="py-3 pl-4 pr-4">
                      <p className="font-medium text-slate-800 dark:text-slate-100">{m.name}</p>
                      <p className="text-xs text-slate-400 dark:text-slate-500">{m.category}</p>
                    </td>
                    <td className="py-3 pr-4 text-slate-600 dark:text-slate-300">{m.brand}</td>
                    <td className="py-3 pr-4 font-mono text-xs text-slate-500 dark:text-slate-400">
                      {m.spec}
                    </td>
                    <td className="py-3 pr-4 text-center font-medium text-slate-800 dark:text-slate-100">
                      {count}
                    </td>
                    <td className="py-3 pr-4">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold",
                          count > 0
                            ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400"
                            : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
                        )}
                      >
                        <span className="h-1.5 w-1.5 rounded-full bg-current" />
                        {count > 0 ? "In Stock" : "No Units"}
                      </span>
                    </td>
                    <td className="py-3 pr-4">
                      <button
                        type="button"
                        onClick={() => setViewModelId(m.id)}
                        title="View units"
                        aria-label="View units"
                        className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 transition hover:bg-blue-50 hover:text-blue-600 dark:hover:bg-blue-500/10 dark:hover:text-blue-400"
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-sm text-slate-400">
                    No models match your search or filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((m) => {
            const count = m.modelAssets.length;
            return (
              <button
                type="button"
                key={m.id}
                onClick={() => setViewModelId(m.id)}
                className="group flex flex-col rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm shadow-slate-900/[0.02] transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md hover:shadow-slate-900/5 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700"
              >
                <div className="flex items-center justify-between">
                  <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-600 dark:bg-blue-500/10 dark:text-blue-400">
                    {m.category}
                  </span>
                  <span
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold",
                      count > 0
                        ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400"
                        : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
                    )}
                  >
                    <span className="h-1.5 w-1.5 rounded-full bg-current" />
                    {count > 0 ? "In Stock" : "No Units"}
                  </span>
                </div>

                <p className="mt-4 text-base font-semibold text-slate-900 dark:text-white">{m.name}</p>
                <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">{m.brand}</p>
                <p className="mt-2 truncate font-mono text-xs text-slate-500 dark:text-slate-400">{m.spec}</p>

                <p className="mt-4 flex items-center gap-1 text-xs text-slate-400 dark:text-slate-500">
                  <Boxes className="h-3 w-3" />
                  {count} unit{count === 1 ? "" : "s"} in fleet
                </p>
              </button>
            );
          })}

          {filtered.length === 0 && (
            <div className="col-span-full flex flex-col items-center gap-2 rounded-2xl border border-dashed border-slate-200 py-16 text-slate-400 dark:border-slate-800 dark:text-slate-500">
              <Search className="h-8 w-8" />
              <p className="text-sm">No models match your search or filters.</p>
            </div>
          )}
        </div>
      )}

      {formOpen && (
        <Modal onClose={() => setFormOpen(false)} maxWidthClassName="max-w-lg">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400">
                <Layers className="h-4.5 w-4.5" />
              </span>
              <div>
                <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                  {formMode === "edit" ? "Edit Model" : "Create Model"}
                </h2>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  A reusable product configuration — brand, specs and defaults — that assets get assigned against.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setFormOpen(false)}
              aria-label="Close"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <form id="model-form" onSubmit={handleSubmit} noValidate className="mt-5 space-y-5">
            <div className="rounded-lg border border-slate-100 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-800/40">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                <Sparkles className="h-3 w-3" />
                Live preview
              </div>
              <div className="mt-1.5 flex items-center justify-between gap-2">
                <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">
                  {form.name.trim() || "Model name"}
                  {form.code.trim() && (
                    <span className="ml-1.5 font-mono text-xs font-normal text-slate-400 dark:text-slate-500">
                      · {form.code.trim()}
                    </span>
                  )}
                </p>
                <span className="shrink-0 rounded-full bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-600 dark:bg-blue-500/10 dark:text-blue-400">
                  {form.category}
                </span>
              </div>
              <p className="mt-0.5 truncate text-xs text-slate-400 dark:text-slate-500">
                {brands.find((b) => b.id === form.brand)?.name ?? "No brand selected"}
                {form.spec.trim() ? ` · ${form.spec.trim()}` : ""}
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <FieldLabel htmlFor="model-category" required>
                  Category
                </FieldLabel>
                <select
                  id="model-category"
                  value={form.category}
                  aria-invalid={Boolean(fieldErrors.category)}
                  onChange={(e) => {
                    const nextCategory = e.target.value;
                    setForm((f) => {
                      const selectedBrand = brands.find((b) => b.id === f.brand);
                      const brandStillValid = !selectedBrand?.categoryName || selectedBrand.categoryName === nextCategory;
                      return { ...f, category: nextCategory, brand: brandStillValid ? f.brand : "" };
                    });
                    setFieldErrors((prev) => ({ ...prev, category: undefined }));
                  }}
                  className={cn(controlClass, fieldErrors.category && invalidControlClass)}
                >
                  <option value="">Select a category</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.name}>
                      {c.name}
                    </option>
                  ))}
                </select>
                {fieldErrors.category && <InlineError>{fieldErrors.category}</InlineError>}
              </div>

              <div>
                <FieldLabel htmlFor="model-brand" required>
                  Brand
                </FieldLabel>
                <select
                  id="model-brand"
                  value={form.brand}
                  aria-invalid={Boolean(fieldErrors.brand)}
                  onChange={(e) => {
                    const brandId = e.target.value ? Number(e.target.value) : "";
                    const selectedBrand = brands.find((b) => b.id === brandId);
                    setForm((f) => ({
                      ...f,
                      brand: brandId,
                      // Brands scoped to one category (via the Add Brand form)
                      // should file their models under that same category.
                      category: selectedBrand?.categoryName ?? f.category,
                    }));
                    setFieldErrors((prev) => ({ ...prev, brand: undefined }));
                  }}
                  className={cn(controlClass, fieldErrors.brand && invalidControlClass)}
                >
                  <option value="">Select a brand</option>
                  {brandOptions.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                      {b.categoryName ? ` (${b.categoryName})` : ""}
                    </option>
                  ))}
                </select>
                {fieldErrors.brand && <InlineError>{fieldErrors.brand}</InlineError>}

                {brandOptions.length === 0 ? (
                  <div className="mt-2 flex flex-col items-start gap-2 rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-3 dark:border-slate-700 dark:bg-slate-800/40">
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      No brands available for {form.category}.
                    </p>
                    {canAddBrand && !quickAddBrandOpen && (
                      <button
                        type="button"
                        onClick={() => setQuickAddBrandOpen(true)}
                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 transition hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Create Brand
                      </button>
                    )}
                  </div>
                ) : (
                  canAddBrand && !quickAddBrandOpen && (
                    <button
                      type="button"
                      onClick={() => setQuickAddBrandOpen(true)}
                      className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-blue-600 transition hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      New brand
                    </button>
                  )
                )}

                {quickAddBrandOpen && (
                  <div className="mt-2 space-y-2 rounded-lg border border-blue-200 bg-blue-50/60 p-3 dark:border-blue-500/30 dark:bg-blue-500/10">
                    <label htmlFor="quick-add-brand" className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      New brand name
                    </label>
                    <div className="flex gap-2">
                      <input
                        id="quick-add-brand"
                        type="text"
                        autoFocus
                        value={quickAddBrandName}
                        onChange={(e) => {
                          setQuickAddBrandName(e.target.value);
                          setQuickAddBrandError(null);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            void handleQuickAddBrand();
                          }
                        }}
                        placeholder="e.g. Dell"
                        className={cn(controlClass, "bg-white dark:bg-slate-900")}
                      />
                      <button
                        type="button"
                        onClick={() => void handleQuickAddBrand()}
                        disabled={quickAddBrandSubmitting}
                        className={cn(primaryButtonClass, "shrink-0 px-3")}
                      >
                        {quickAddBrandSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Add"}
                      </button>
                    </div>
                    {quickAddBrandError && <InlineError>{quickAddBrandError}</InlineError>}
                    <button
                      type="button"
                      onClick={resetQuickAddBrand}
                      className="text-xs font-medium text-slate-500 transition hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <FieldLabel htmlFor="model-name" required>
                  Model name
                </FieldLabel>
                <input
                  id="model-name"
                  type="text"
                  value={form.name}
                  aria-invalid={Boolean(fieldErrors.name)}
                  onChange={(e) => {
                    setForm((f) => ({ ...f, name: e.target.value }));
                    setFieldErrors((prev) => ({ ...prev, name: undefined }));
                  }}
                  placeholder="e.g. Dell Latitude 5440"
                  autoFocus
                  className={cn(controlClass, fieldErrors.name && invalidControlClass)}
                />
                {fieldErrors.name && <InlineError>{fieldErrors.name}</InlineError>}
              </div>

              <div>
                <FieldLabel htmlFor="model-code" hint="Optional">
                  Model code
                </FieldLabel>
                <input
                  id="model-code"
                  type="text"
                  value={form.code}
                  onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
                  placeholder="e.g. LAT-5440"
                  className={cn(controlClass, "font-mono")}
                />
              </div>
            </div>

            <div>
              <FieldLabel htmlFor="model-spec" hint="Optional">
                Specifications
              </FieldLabel>
              <input
                id="model-spec"
                type="text"
                value={form.spec}
                onChange={(e) => setForm((f) => ({ ...f, spec: e.target.value }))}
                placeholder="e.g. Intel Core i5 · 16GB RAM · 512GB SSD"
                className={controlClass}
              />
            </div>

            <div>
              <FieldLabel htmlFor="model-description" hint="Optional">
                Description
              </FieldLabel>
              <textarea
                id="model-description"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Notes for your team — typical use case, warranty terms, procurement links…"
                rows={3}
                className={cn(controlClass, "resize-none")}
              />
            </div>

            {formError && <FormError>{formError}</FormError>}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setFormOpen(false)}
                disabled={submitting}
                className={cn(secondaryButtonClass, "disabled:cursor-not-allowed disabled:opacity-60")}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className={cn(primaryButtonClass, "inline-flex items-center gap-2")}
              >
                {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                {submitting
                  ? formMode === "edit"
                    ? "Saving…"
                    : "Creating…"
                  : formMode === "edit"
                    ? "Save Changes"
                    : "Create Model"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {viewModel && (
        <ModelDetailModal
          model={viewModel}
          assets={viewModel.modelAssets}
          onClose={() => setViewModelId(null)}
          onEdit={canChange ? openEditModal : undefined}
          onDelete={canDelete ? setConfirmDelete : undefined}
        />
      )}

      {confirmDelete && (
        <Modal onClose={() => setConfirmDelete(null)} maxWidthClassName="max-w-sm" zIndexClassName="z-40">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Delete model?</h2>
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
