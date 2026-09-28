"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { useLoadOnDemand, useRequestLoad, type LoadOptions } from "@/lib/lazy";
import { apiDelete, apiGetAll, apiPatch, apiPost } from "@/lib/api";
import { CATEGORY_COLORS, type Category } from "@/components/categories/data";

type CategoryInput = {
  name: string;
  iconLabel: string;
  colorKey: string;
};

type CategoriesContextValue = {
  requestLoad: () => void;
  categories: Category[];
  createCategory: (input: CategoryInput) => Promise<Category>;
  updateCategory: (id: number, input: CategoryInput) => Promise<Category>;
  deleteCategory: (id: number) => Promise<void>;
};

const CategoriesContext = createContext<CategoriesContextValue | null>(null);

type BackendCategory = { id: number; name: string; icon?: string; color?: string };

function fromBackend(category: BackendCategory): Category {
  return {
    id: category.id,
    name: category.name,
    iconLabel: category.icon || "package",
    // Older rows predate the color picker and have no color saved — fall
    // back to a per-category color instead of collapsing them all to blue.
    colorKey: category.color || CATEGORY_COLORS[category.id % CATEGORY_COLORS.length].key,
  };
}

function toBackend(input: CategoryInput) {
  return { name: input.name, icon: input.iconLabel, color: input.colorKey };
}

export function CategoriesProvider({ children }: { children: ReactNode }) {
  const [categories, setCategories] = useState<Category[]>([]);

  const [loadRequested, requestLoad] = useLoadOnDemand();

  // Loads the first time a component on screen reads this context (see lib/lazy.ts).
  useEffect(() => {
    if (!loadRequested) return;
    void apiGetAll<BackendCategory>("/catalog/categories/")
      .then((items) => setCategories(items.map(fromBackend)))
      .catch(() => setCategories([]));
  }, [loadRequested]);

  // Re-fetches the full list from the database — called after every
  // create/update/delete so the list always reflects what the backend
  // actually persisted (the database stays the single source of truth)
  // instead of a client-constructed guess of what changed.
  const refresh = useCallback(() => {
    return apiGetAll<BackendCategory>("/catalog/categories/")
      .then((items) => setCategories(items.map(fromBackend)))
      .catch(() => setCategories([]));
  }, []);

  async function createCategory(input: CategoryInput) {
    const created = await apiPost<BackendCategory>("/catalog/categories/", toBackend(input));
    await refresh();
    return fromBackend(created);
  }

  async function updateCategory(id: number, input: CategoryInput) {
    const updated = await apiPatch<BackendCategory>(`/catalog/categories/${id}/`, toBackend(input));
    await refresh();
    return fromBackend(updated);
  }

  async function deleteCategory(id: number) {
    await apiDelete(`/catalog/categories/${id}/`);
    await refresh();
  }

  return (
    <CategoriesContext.Provider value={{ requestLoad, categories, createCategory, updateCategory, deleteCategory }}>
      {children}
    </CategoriesContext.Provider>
  );
}

export function useCategories(options?: LoadOptions) {
  const ctx = useContext(CategoriesContext);
  useRequestLoad(ctx?.requestLoad, options);
  if (!ctx) throw new Error("useCategories must be used within a CategoriesProvider");
  return ctx;
}
