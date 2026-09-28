"use client";

import { useMemo, useState } from "react";
import { ArrowLeft, Boxes, Eye, IndianRupee, ListFilter, Plus, Tag, Tags, X } from "lucide-react";
import { useCan } from "@/components/auth/context";
import { useAssets } from "@/components/assets/context";
import { useBrands } from "@/components/brands/context";
import { BRAND_COLORS, colorFor, initials, type Brand } from "@/components/brands/data";
import { useCategories } from "@/components/categories/context";
import { iconFor as categoryIconFor } from "@/components/categories/data";
import { BrandDetailModal } from "@/components/brands/detail-modal";
import { useToast } from "@/components/ui/toast";
import {
  ColorPicker,
  FieldLabel,
  FormError,
  Modal,
  controlClass,
  primaryButtonClass,
  secondaryButtonClass,
} from "@/components/ui/modal";
import { cn } from "@/lib/utils";
import type { CatalogViewMode } from "@/components/catalog/tabs";

export function BrandsGrid({ viewMode = "cards" }: { viewMode?: CatalogViewMode }) {
  const { brands, createBrand, updateBrand, deleteBrand } = useBrands();
  const { assets } = useAssets();
  const { categories } = useCategories();
  const { showSuccess, showErrorFromException } = useToast();
  const canAdd = useCan("catalog.add_brand");
  const canChange = useCan("catalog.change_brand");
  const canDelete = useCan("catalog.delete_brand");
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<"add" | "edit">("add");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({ name: "", colorKey: BRAND_COLORS[0].key, categoryId: "" as number | "" });
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [viewBrandId, setViewBrandId] = useState<number | null>(null);
  const [viewCategory, setViewCategory] = useState<string | null>(null);
  const [filterBrandId, setFilterBrandId] = useState<number | "">("");
  const [filterCategory, setFilterCategory] = useState<string | "">("");
  const [confirmDelete, setConfirmDelete] = useState<Brand | null>(null);

  const stats = useMemo(() => {
    return brands.map((b) => {
      // Real Asset.brand FK (by its name), not a guess from the asset's name.
      const brandAssets = assets.filter(
        (a) => a.brand === b.name && (!filterCategory || a.category === filterCategory)
      );
      const categories = [...new Set(brandAssets.map((a) => a.category))];
      const totalValue = brandAssets.reduce((sum, a) => sum + a.currentValue, 0);
      // A brand with no assets yet still belongs to its own declared category
      // (set via the Add Brand form), so filters must not hide it.
      const matchesFilterCategory = !filterCategory || categories.includes(filterCategory) || b.categoryName === filterCategory;
      return { ...b, brandAssets, categories, totalValue, matchesFilterCategory };
    });
  }, [brands, assets, filterCategory]);

  const maxAssets = Math.max(1, ...stats.map((s) => s.brandAssets.length));
  const totalAssets = assets.length;
  const viewBrand = stats.find((s) => s.id === viewBrandId) ?? null;
  const sortedByName = useMemo(() => {
    const relevant = filterCategory ? stats.filter((s) => s.matchesFilterCategory) : stats;
    return [...relevant].sort((a, b) => a.name.localeCompare(b.name));
  }, [stats, filterCategory]);
  const displayedStats = filterBrandId
    ? stats.filter((s) => s.id === filterBrandId)
    : filterCategory
      ? stats.filter((s) => s.matchesFilterCategory)
      : stats;
  const filteredBrand = filterBrandId ? stats.find((s) => s.id === filterBrandId) ?? null : null;

  const categoryBreakdown = useMemo(() => {
    if (!filteredBrand) return [];
    const map = new Map<string, { count: number; value: number }>();
    for (const a of filteredBrand.brandAssets) {
      const entry = map.get(a.category) ?? { count: 0, value: 0 };
      entry.count += 1;
      entry.value += a.currentValue;
      map.set(a.category, entry);
    }
    return [...map.entries()]
      .map(([category, stat]) => ({ category, ...stat }))
      .sort((a, b) => b.count - a.count);
  }, [filteredBrand]);
  const maxCategoryCount = Math.max(1, ...categoryBreakdown.map((c) => c.count));

  function handleCategoryChange(newCategory: string) {
    setFilterCategory(newCategory);
    if (filterBrandId && newCategory) {
      const brand = brands.find((b) => b.id === filterBrandId);
      const stillRelevant = brand
        ? brand.categoryName === newCategory ||
          assets.some((a) => a.brand === brand.name && a.category === newCategory)
        : false;
      if (!stillRelevant) setFilterBrandId("");
    }
  }

  function openAddModal() {
    setFormMode("add");
    setEditingId(null);
    setForm({ name: "", colorKey: BRAND_COLORS[brands.length % BRAND_COLORS.length].key, categoryId: "" });
    setFormError(null);
    setFormOpen(true);
  }

  function openEditModal(brand: Brand) {
    setFormMode("edit");
    setEditingId(brand.id);
    setForm({
      name: brand.name,
      colorKey: brand.colorKey,
      categoryId: brand.categoryId ?? "",
    });
    setFormError(null);
    setFormOpen(true);
    setViewBrandId(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const name = form.name.trim();
    if (!name) {
      setFormError("Enter a brand name.");
      return;
    }
    if (
      brands.some(
        (b) => b.name.toLowerCase() === name.toLowerCase() && b.id !== editingId
      )
    ) {
      setFormError("A brand with this name already exists.");
      return;
    }

    setSubmitting(true);
    setFormError(null);
    const input = {
      name,
      colorKey: form.colorKey,
      categoryId: form.categoryId === "" ? null : form.categoryId,
    };
    try {
      if (formMode === "edit" && editingId !== null) {
        await updateBrand(editingId, input);
        showSuccess(`Brand "${name}" updated.`);
      } else {
        await createBrand(input);
        showSuccess(`Brand "${name}" created.`);
      }
      setFormOpen(false);
    } catch (error) {
      showErrorFromException(error);
      setFormError(error instanceof Error ? error.message : "Could not save this brand.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(brand: Brand) {
    try {
      await deleteBrand(brand.id);
      showSuccess(`Brand "${brand.name}" deleted.`);
    } catch (error) {
      showErrorFromException(error, "Could not delete this brand.");
    } finally {
      setConfirmDelete(null);
      setViewBrandId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Brands</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {filterBrandId
              ? `Showing 1 of ${brands.length} brands${filterCategory ? ` · ${filterCategory} only` : ""}`
              : filterCategory
                ? `${displayedStats.length} of ${brands.length} brands supply ${filterCategory}`
                : `${brands.length} brands · ${totalAssets} assets`}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="category-filter" className="flex shrink-0 items-center text-slate-500 dark:text-slate-400">
            <Tags className="h-4 w-4" />
            <span className="sr-only">Filter by category</span>
          </label>
          <select
            id="category-filter"
            value={filterCategory}
            onChange={(e) => handleCategoryChange(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-100"
          >
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.name}>
                {c.name}
              </option>
            ))}
          </select>

          <label htmlFor="brand-jump" className="flex shrink-0 items-center text-slate-500 dark:text-slate-400">
            <ListFilter className="h-4 w-4" />
            <span className="sr-only">Filter by brand</span>
          </label>
          <select
            id="brand-jump"
            value={filterBrandId}
            onChange={(e) => setFilterBrandId(e.target.value ? Number(e.target.value) : "")}
            className="w-44 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-100"
          >
            <option value="">All brands ({sortedByName.length})</option>
            {sortedByName.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}{" "}
                {b.categories.length > 0
                  ? `(${b.categories.join(", ")})`
                  : b.categoryName
                    ? `(${b.categoryName} — no assets yet)`
                    : "(no assets yet)"}
              </option>
            ))}
          </select>

          {canAdd && (
            <button
              type="button"
              onClick={openAddModal}
              className="flex items-center gap-2 rounded-lg bg-blue-600 px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
            >
              <Plus className="h-4 w-4" />
              Add Brand
            </button>
          )}
        </div>
      </div>

      {filteredBrand && !filterCategory ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setFilterBrandId("")}
              className="flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:underline dark:text-blue-400"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              All brands
            </button>
            <button
              type="button"
              onClick={() => {
                setViewBrandId(filteredBrand.id);
                setViewCategory(null);
              }}
              className="text-sm font-medium text-slate-500 hover:underline dark:text-slate-400"
            >
              View all {filteredBrand.name} assets
            </button>
          </div>

          {viewMode === "table" ? (
            <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
              <table className="w-full min-w-[500px] text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-xs uppercase tracking-wider text-slate-400 dark:border-slate-800 dark:text-slate-500">
                    <th className="py-3 pl-4 pr-4 font-semibold">Category</th>
                    <th className="py-3 pr-4 text-center font-semibold">Assets</th>
                    <th className="py-3 pr-4 font-semibold">Asset Value</th>
                    <th className="w-12 py-3 pr-4" />
                  </tr>
                </thead>
                <tbody>
                  {categoryBreakdown.map(({ category, count, value }) => {
                    const CategoryIcon = categoryIconFor(category);
                    return (
                      <tr
                        key={category}
                        onClick={() => {
                          setViewBrandId(filteredBrand.id);
                          setViewCategory(category);
                        }}
                        className="cursor-pointer border-b border-slate-50 transition hover:bg-slate-50 dark:border-slate-800/60 dark:hover:bg-slate-800/40"
                      >
                        <td className="py-3 pl-4 pr-4">
                          <div className="flex items-center gap-2">
                            <CategoryIcon className="h-4 w-4 text-slate-400 dark:text-slate-500" />
                            <span className="font-medium text-slate-800 dark:text-slate-100">{category}</span>
                          </div>
                        </td>
                        <td className="py-3 pr-4 text-center font-medium text-slate-800 dark:text-slate-100">
                          {count}
                        </td>
                        <td className="py-3 pr-4 text-slate-600 dark:text-slate-300">
                          ₹{(value / 100000).toFixed(1)}L
                        </td>
                        <td className="py-3 pr-4">
                          <button
                            type="button"
                            title="View assets"
                            aria-label="View assets"
                            className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 transition hover:bg-blue-50 hover:text-blue-600 dark:hover:bg-blue-500/10 dark:hover:text-blue-400"
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {categoryBreakdown.length === 0 && (
                    <tr>
                      <td colSpan={4} className="py-12 text-center text-sm text-slate-400">
                        No {filterCategory ? `${filterCategory.toLowerCase()} ` : ""}assets recorded for{" "}
                        {filteredBrand.name} yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {categoryBreakdown.map(({ category, count, value }) => {
                const color = colorFor(filteredBrand.colorKey);
                const CategoryIcon = categoryIconFor(category);
                return (
                  <button
                    type="button"
                    key={category}
                    onClick={() => {
                      setViewBrandId(filteredBrand.id);
                      setViewCategory(category);
                    }}
                    className="group flex flex-col rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm shadow-slate-900/[0.02] transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md hover:shadow-slate-900/5 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700"
                  >
                    <div className="flex items-center justify-between">
                      <span className={cn("flex h-11 w-11 items-center justify-center rounded-xl transition group-hover:scale-105", color.icon)}>
                        <CategoryIcon className="h-5 w-5" strokeWidth={2} />
                      </span>
                      <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", color.chip)}>
                        {filteredBrand.name}
                      </span>
                    </div>

                    <p className="mt-4 text-base font-semibold text-slate-900 dark:text-white">{category}</p>
                    <p className="mt-1 flex items-center gap-1 text-xs text-slate-400 dark:text-slate-500">
                      <Boxes className="h-3 w-3" />
                      {count} asset{count === 1 ? "" : "s"}
                    </p>

                    <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                      <div
                        className={cn("h-full rounded-full bg-gradient-to-r", color.bar)}
                        style={{ width: `${(count / maxCategoryCount) * 100}%` }}
                      />
                    </div>

                    <p className="mt-3 flex items-center gap-1 text-xs text-slate-400 dark:text-slate-500">
                      <IndianRupee className="h-3 w-3" />
                      {(value / 100000).toFixed(1)}L current asset value
                    </p>
                  </button>
                );
              })}

              {categoryBreakdown.length === 0 && (
                <div className="col-span-full flex flex-col items-center gap-2 rounded-2xl border border-dashed border-slate-200 py-16 text-slate-400 dark:border-slate-800 dark:text-slate-500">
                  <Boxes className="h-8 w-8" />
                  <p className="text-sm">
                    No {filterCategory ? `${filterCategory.toLowerCase()} ` : ""}assets recorded for{" "}
                    {filteredBrand.name} yet.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      ) : viewMode === "table" ? (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <table className="w-full min-w-[700px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs uppercase tracking-wider text-slate-400 dark:border-slate-800 dark:text-slate-500">
                <th className="py-3 pl-4 pr-4 font-semibold">Brand</th>
                <th className="py-3 pr-4 font-semibold">Categories</th>
                <th className="py-3 pr-4 text-center font-semibold">Assets</th>
                <th className="py-3 pr-4 font-semibold">Asset Value</th>
                <th className="py-3 pr-4 text-center font-semibold">Fleet</th>
                <th className="w-12 py-3 pr-4" />
              </tr>
            </thead>
            <tbody>
              {displayedStats.map((b) => {
                const color = colorFor(b.colorKey);
                const assetCount = b.brandAssets.length;
                const fleetShare = totalAssets > 0 ? Math.round((assetCount / totalAssets) * 100) : 0;
                return (
                  <tr
                    key={b.id}
                    onClick={() => setViewBrandId(b.id)}
                    className="cursor-pointer border-b border-slate-50 transition hover:bg-slate-50 dark:border-slate-800/60 dark:hover:bg-slate-800/40"
                  >
                    <td className="py-3 pl-4 pr-4">
                      <div className="flex items-center gap-2.5">
                        <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-semibold", color.icon)}>
                          {initials(b.name)}
                        </span>
                        <span className="font-medium text-slate-800 dark:text-slate-100">{b.name}</span>
                      </div>
                    </td>
                    <td className="py-3 pr-4 text-slate-600 dark:text-slate-300">
                      {b.categories.length > 0
                        ? b.categories.join(", ")
                        : b.categoryName
                          ? `${b.categoryName} · no assets yet`
                          : "No assets yet"}
                    </td>
                    <td className="py-3 pr-4 text-center font-medium text-slate-800 dark:text-slate-100">
                      {assetCount}
                    </td>
                    <td className="py-3 pr-4 text-slate-600 dark:text-slate-300">
                      ₹{(b.totalValue / 100000).toFixed(1)}L
                    </td>
                    <td className="py-3 pr-4 text-center text-slate-600 dark:text-slate-300">{fleetShare}%</td>
                    <td className="py-3 pr-4">
                      <button
                        type="button"
                        title="View brand"
                        aria-label="View brand"
                        className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 transition hover:bg-blue-50 hover:text-blue-600 dark:hover:bg-blue-500/10 dark:hover:text-blue-400"
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
              {displayedStats.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-sm text-slate-400">
                    No brands match your filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {displayedStats.map((b) => {
            const color = colorFor(b.colorKey);
            const assetCount = b.brandAssets.length;
            const fleetShare = totalAssets > 0 ? Math.round((assetCount / totalAssets) * 100) : 0;
            return (
              <button
                type="button"
                key={b.id}
                onClick={() => setViewBrandId(b.id)}
                className="group flex flex-col rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm shadow-slate-900/[0.02] transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md hover:shadow-slate-900/5 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700"
              >
                <div className="flex items-center justify-between">
                  <span className={cn("flex h-11 w-11 items-center justify-center rounded-xl text-sm font-semibold transition group-hover:scale-105", color.icon)}>
                    {initials(b.name)}
                  </span>
                  <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", color.chip)}>
                    {fleetShare}% of fleet
                  </span>
                </div>

                <p className="mt-4 text-base font-semibold text-slate-900 dark:text-white">{b.name}</p>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  {b.categories.length > 0 ? (
                    b.categories.map((c) => (
                      <span
                        key={c}
                        className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400"
                      >
                        <Tags className="h-2.5 w-2.5" />
                        {c}
                      </span>
                    ))
                  ) : b.categoryName ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                      <Tags className="h-2.5 w-2.5" />
                      {b.categoryName} · no assets yet
                    </span>
                  ) : (
                    <span className="text-xs text-slate-400 dark:text-slate-500">No assets yet</span>
                  )}
                </div>

                <p className="mt-3 flex items-center gap-1 text-xs text-slate-400 dark:text-slate-500">
                  <Boxes className="h-3 w-3" />
                  {assetCount} asset{assetCount === 1 ? "" : "s"}
                </p>

                <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                  <div
                    className={cn("h-full rounded-full bg-gradient-to-r", color.bar)}
                    style={{ width: `${(assetCount / maxAssets) * 100}%` }}
                  />
                </div>

                <p className="mt-3 flex items-center gap-1 text-xs text-slate-400 dark:text-slate-500">
                  <IndianRupee className="h-3 w-3" />
                  {(b.totalValue / 100000).toFixed(1)}L current asset value
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
                <Tag className="h-4.5 w-4.5" />
              </span>
              <div>
                <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                  {formMode === "edit" ? "Edit Brand" : "Add Brand"}
                </h2>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  Manufacturers you procure from — used to group models and match assets.
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

          <form id="brand-form" onSubmit={handleSubmit} className="mt-5 space-y-5">
            <div className="flex items-center gap-3 rounded-lg border border-slate-100 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-800/40">
              <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-sm font-semibold", colorFor(form.colorKey).icon)}>
                {initials(form.name.trim() || "?")}
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">
                  {form.name.trim() || "Brand name"}
                </p>
                <p className="text-xs text-slate-400 dark:text-slate-500">Live preview</p>
              </div>
            </div>

            <div>
              <FieldLabel>Brand name</FieldLabel>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Sony"
                autoFocus
                className={controlClass}
              />
            </div>

            <div>
              <FieldLabel hint="Optional">Category</FieldLabel>
              <select
                value={form.categoryId}
                onChange={(e) => setForm((f) => ({ ...f, categoryId: e.target.value ? Number(e.target.value) : "" }))}
                className={controlClass}
              >
                <option value="">No specific category</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <p className="mt-1.5 text-xs text-slate-400 dark:text-slate-500">
                Only set this if the brand is specific to one category.
              </p>
            </div>


            <div>
              <FieldLabel>Color</FieldLabel>
              <ColorPicker
                colors={BRAND_COLORS}
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
                {submitting ? "Saving…" : formMode === "edit" ? "Save Changes" : "Add Brand"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {viewBrand && (
        <BrandDetailModal
          brand={viewBrand}
          assets={
            viewCategory
              ? viewBrand.brandAssets.filter((a) => a.category === viewCategory)
              : viewBrand.brandAssets
          }
          categoryLabel={viewCategory}
          onClose={() => {
            setViewBrandId(null);
            setViewCategory(null);
          }}
          onEdit={canChange ? openEditModal : undefined}
          onDelete={canDelete ? setConfirmDelete : undefined}
        />
      )}

      {confirmDelete && (
        <Modal onClose={() => setConfirmDelete(null)} maxWidthClassName="max-w-sm" zIndexClassName="z-40">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Delete brand?</h2>
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
