"use client";

import { useMemo, useState } from "react";
import { Boxes, Eye, IndianRupee, Plus, X } from "lucide-react";
import { useAssets } from "@/components/assets/context";
import { useCan } from "@/components/auth/context";
import { useCategories } from "@/components/categories/context";
import {
  CATEGORY_COLORS,
  CATEGORY_ICONS,
  colorFor,
  iconFor,
  type Category,
} from "@/components/categories/data";
import { CategoryDetailModal } from "@/components/categories/detail-modal";
import { useToast } from "@/components/ui/toast";
import {
  ColorPicker,
  FieldLabel,
  FormError,
  IconPicker,
  Modal,
  controlClass,
  primaryButtonClass,
  secondaryButtonClass,
} from "@/components/ui/modal";
import { cn } from "@/lib/utils";
import type { CatalogViewMode } from "@/components/catalog/tabs";

export function CategoriesGrid({ viewMode = "cards" }: { viewMode?: CatalogViewMode }) {
  const { categories, createCategory, updateCategory, deleteCategory } = useCategories();
  const { assets } = useAssets();
  const { showSuccess, showErrorFromException } = useToast();
  const canAdd = useCan("catalog.add_category");
  const canChange = useCan("catalog.change_category");
  const canDelete = useCan("catalog.delete_category");
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<"add" | "edit">("add");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({
    name: "",
    iconLabel: CATEGORY_ICONS[0].slug,
    colorKey: CATEGORY_COLORS[0].key,
  });
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [viewCategoryId, setViewCategoryId] = useState<number | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Category | null>(null);

  const stats = useMemo(() => {
    return categories.map((c) => {
      const categoryAssets = assets.filter((a) => a.category === c.name);
      const totalValue = categoryAssets.reduce((sum, a) => sum + a.currentValue, 0);
      const modelCount = new Set(categoryAssets.map((a) => a.name)).size;
      return { ...c, categoryAssets, totalValue, modelCount };
    });
  }, [categories, assets]);

  const maxAssets = Math.max(1, ...stats.map((s) => s.categoryAssets.length));
  const totalAssets = assets.length;
  const viewCategory = stats.find((s) => s.id === viewCategoryId) ?? null;

  function openAddModal() {
    setFormMode("add");
    setEditingId(null);
    setForm({
      name: "",
      iconLabel: CATEGORY_ICONS[0].slug,
      colorKey: CATEGORY_COLORS[categories.length % CATEGORY_COLORS.length].key,
    });
    setFormError(null);
    setFormOpen(true);
  }

  function openEditModal(category: Category) {
    setFormMode("edit");
    setEditingId(category.id);
    setForm({
      name: category.name,
      iconLabel: category.iconLabel,
      colorKey: category.colorKey,
    });
    setFormError(null);
    setFormOpen(true);
    setViewCategoryId(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const name = form.name.trim();
    if (!name) {
      setFormError("Enter a category name.");
      return;
    }
    if (
      categories.some(
        (c) => c.name.toLowerCase() === name.toLowerCase() && c.id !== editingId
      )
    ) {
      setFormError("A category with this name already exists.");
      return;
    }

    setSubmitting(true);
    setFormError(null);
    try {
      if (formMode === "edit" && editingId !== null) {
        await updateCategory(editingId, { name, iconLabel: form.iconLabel, colorKey: form.colorKey });
        showSuccess(`Category "${name}" updated.`);
      } else {
        await createCategory({ name, iconLabel: form.iconLabel, colorKey: form.colorKey });
        showSuccess(`Category "${name}" created.`);
      }
      setFormOpen(false);
    } catch (error) {
      showErrorFromException(error);
      setFormError(error instanceof Error ? error.message : "Could not save this category.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(category: Category) {
    try {
      await deleteCategory(category.id);
      showSuccess(`Category "${category.name}" deleted.`);
    } catch (error) {
      showErrorFromException(error, "Could not delete this category.");
    } finally {
      setConfirmDelete(null);
      setViewCategoryId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Categories</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {categories.length} categories · {totalAssets} assets
          </p>
        </div>
        {canAdd && (
          <button
            type="button"
            onClick={openAddModal}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
          >
            <Plus className="h-4 w-4" />
            Add Category
          </button>
        )}
      </div>

      {viewMode === "table" ? (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <table className="w-full min-w-[700px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs uppercase tracking-wider text-slate-400 dark:border-slate-800 dark:text-slate-500">
                <th className="py-3 pl-4 pr-4 font-semibold">Category</th>
                <th className="py-3 pr-4 text-center font-semibold">Assets</th>
                <th className="py-3 pr-4 text-center font-semibold">Models</th>
                <th className="py-3 pr-4 text-center font-semibold">Fleet</th>
                <th className="py-3 pr-4 font-semibold">Asset Value</th>
                <th className="w-12 py-3 pr-4" />
              </tr>
            </thead>
            <tbody>
              {stats.map((c) => {
                const Icon = iconFor(c.iconLabel);
                const color = colorFor(c.colorKey);
                const assetCount = c.categoryAssets.length;
                const fleetShare = totalAssets > 0 ? Math.round((assetCount / totalAssets) * 100) : 0;
                return (
                  <tr
                    key={c.id}
                    onClick={() => setViewCategoryId(c.id)}
                    className="cursor-pointer border-b border-slate-50 transition hover:bg-slate-50 dark:border-slate-800/60 dark:hover:bg-slate-800/40"
                  >
                    <td className="py-3 pl-4 pr-4">
                      <div className="flex items-center gap-2.5">
                        <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", color.icon)}>
                          <Icon className="h-4 w-4" strokeWidth={2} />
                        </span>
                        <span className="font-medium text-slate-800 dark:text-slate-100">{c.name}</span>
                      </div>
                    </td>
                    <td className="py-3 pr-4 text-center font-medium text-slate-800 dark:text-slate-100">
                      {assetCount}
                    </td>
                    <td className="py-3 pr-4 text-center text-slate-600 dark:text-slate-300">{c.modelCount}</td>
                    <td className="py-3 pr-4 text-center text-slate-600 dark:text-slate-300">{fleetShare}%</td>
                    <td className="py-3 pr-4 text-slate-600 dark:text-slate-300">
                      ₹{(c.totalValue / 100000).toFixed(1)}L
                    </td>
                    <td className="py-3 pr-4">
                      <button
                        type="button"
                        title="View category"
                        aria-label="View category"
                        className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 transition hover:bg-blue-50 hover:text-blue-600 dark:hover:bg-blue-500/10 dark:hover:text-blue-400"
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
              {stats.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-sm text-slate-400">
                    No categories yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {stats.map((c) => {
            const Icon = iconFor(c.iconLabel);
            const color = colorFor(c.colorKey);
            const assetCount = c.categoryAssets.length;
            const fleetShare = totalAssets > 0 ? Math.round((assetCount / totalAssets) * 100) : 0;
            return (
              <button
                type="button"
                key={c.id}
                onClick={() => setViewCategoryId(c.id)}
                className="group flex flex-col rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm shadow-slate-900/[0.02] transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md hover:shadow-slate-900/5 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700"
              >
                <div className="flex items-center justify-between">
                  <span className={cn("flex h-11 w-11 items-center justify-center rounded-xl transition group-hover:scale-105", color.icon)}>
                    <Icon className="h-5 w-5" strokeWidth={2} />
                  </span>
                  <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", color.chip)}>
                    {fleetShare}% of fleet
                  </span>
                </div>

                <p className="mt-4 text-base font-semibold text-slate-900 dark:text-white">{c.name}</p>
                <p className="mt-1 flex items-center gap-3 text-xs text-slate-400 dark:text-slate-500">
                  <span className="flex items-center gap-1">
                    <Boxes className="h-3 w-3" />
                    {assetCount} asset{assetCount === 1 ? "" : "s"}
                  </span>
                  <span>{c.modelCount} model{c.modelCount === 1 ? "" : "s"}</span>
                </p>

                <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                  <div
                    className={cn("h-full rounded-full bg-gradient-to-r", color.bar)}
                    style={{ width: `${(assetCount / maxAssets) * 100}%` }}
                  />
                </div>

                <p className="mt-3 flex items-center gap-1 text-xs text-slate-400 dark:text-slate-500">
                  <IndianRupee className="h-3 w-3" />
                  {(c.totalValue / 100000).toFixed(1)}L current asset value
                </p>
              </button>
            );
          })}
        </div>
      )}

      {formOpen && (
        <Modal onClose={() => setFormOpen(false)} maxWidthClassName="max-w-lg">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400">
                <Boxes className="h-4.5 w-4.5" />
              </span>
              <div>
                <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                  {formMode === "edit" ? "Edit Category" : "Add Category"}
                </h2>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  Group assets by device type for reporting and filters.
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

          <form id="category-form" onSubmit={handleSubmit} className="mt-5 space-y-5">
            <div className="flex items-center gap-3 rounded-lg border border-slate-100 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-800/40">
              <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-lg", colorFor(form.colorKey).icon)}>
                {(() => {
                  const PreviewIcon = iconFor(form.iconLabel);
                  return <PreviewIcon className="h-5 w-5" strokeWidth={2} />;
                })()}
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">
                  {form.name.trim() || "Category name"}
                </p>
                <p className="text-xs text-slate-400 dark:text-slate-500">Live preview</p>
              </div>
            </div>

            <div>
              <FieldLabel>Category name</FieldLabel>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Tablets"
                autoFocus
                className={controlClass}
              />
            </div>

            <div>
              <FieldLabel>Icon</FieldLabel>
              <IconPicker
                options={CATEGORY_ICONS}
                value={form.iconLabel}
                onChange={(iconLabel) => setForm((f) => ({ ...f, iconLabel }))}
              />
            </div>

            <div>
              <FieldLabel>Color</FieldLabel>
              <ColorPicker
                colors={CATEGORY_COLORS}
                value={form.colorKey}
                onChange={(colorKey) => setForm((f) => ({ ...f, colorKey }))}
              />
            </div>

            {formError && <FormError>{formError}</FormError>}

            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setFormOpen(false)} className={secondaryButtonClass}>
                Cancel
              </button>
              <button type="submit" disabled={submitting} className={primaryButtonClass}>
                {submitting ? "Saving…" : formMode === "edit" ? "Save Changes" : "Add Category"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {viewCategory && (
        <CategoryDetailModal
          category={viewCategory}
          assets={viewCategory.categoryAssets}
          onClose={() => setViewCategoryId(null)}
          onEdit={canChange ? openEditModal : undefined}
          onDelete={canDelete ? setConfirmDelete : undefined}
        />
      )}

      {confirmDelete && (
        <Modal onClose={() => setConfirmDelete(null)} maxWidthClassName="max-w-sm" zIndexClassName="z-40">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Delete category?</h2>
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
