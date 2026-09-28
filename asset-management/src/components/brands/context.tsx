"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { useLoadOnDemand, useRequestLoad, type LoadOptions } from "@/lib/lazy";
import { apiDelete, apiGetAll, apiPatch, apiPost } from "@/lib/api";
import type { Brand } from "@/components/brands/data";

type BrandInput = {
  name: string;
  colorKey?: string;
  categoryId?: number | null;
};

type BrandsContextValue = {
  requestLoad: () => void;
  brands: Brand[];
  createBrand: (input: BrandInput) => Promise<Brand>;
  updateBrand: (id: number, input: BrandInput) => Promise<Brand>;
  deleteBrand: (id: number) => Promise<void>;
};

const BrandsContext = createContext<BrandsContextValue | null>(null);

type BackendBrand = {
  id: number;
  name: string;
  color_key?: string;
  category?: number | null;
  category_name?: string | null;
};

function fromBackend(brand: BackendBrand): Brand {
  return {
    id: brand.id,
    name: brand.name,
    colorKey: brand.color_key || "blue",
    categoryId: brand.category ?? null,
    categoryName: brand.category_name ?? null,
  };
}

function toBackend(input: BrandInput) {
  return {
    name: input.name,
    category: input.categoryId ?? null,
    ...(input.colorKey ? { color_key: input.colorKey } : {}),
  };
}

export function BrandsProvider({ children }: { children: ReactNode }) {
  const [brands, setBrands] = useState<Brand[]>([]);

  const [loadRequested, requestLoad] = useLoadOnDemand();

  // Loads the first time a component on screen reads this context (see lib/lazy.ts).
  useEffect(() => {
    if (!loadRequested) return;
    void apiGetAll<BackendBrand>("/catalog/brands/")
      .then((items) => setBrands(items.map(fromBackend)))
      .catch(() => setBrands([]));
  }, [loadRequested]);

  // Re-fetches the full list from the database — called after every
  // create/update/delete so the list always reflects what the backend
  // actually persisted (the database stays the single source of truth)
  // instead of a client-constructed guess of what changed.
  const refresh = useCallback(() => {
    return apiGetAll<BackendBrand>("/catalog/brands/")
      .then((items) => setBrands(items.map(fromBackend)))
      .catch(() => setBrands([]));
  }, []);

  async function createBrand(input: BrandInput) {
    const created = await apiPost<BackendBrand>("/catalog/brands/", toBackend(input));
    await refresh();
    return fromBackend(created);
  }

  async function updateBrand(id: number, input: BrandInput) {
    const updated = await apiPatch<BackendBrand>(`/catalog/brands/${id}/`, toBackend(input));
    await refresh();
    return fromBackend(updated);
  }

  async function deleteBrand(id: number) {
    await apiDelete(`/catalog/brands/${id}/`);
    await refresh();
  }

  return (
    <BrandsContext.Provider value={{ requestLoad, brands, createBrand, updateBrand, deleteBrand }}>
      {children}
    </BrandsContext.Provider>
  );
}

export function useBrands(options?: LoadOptions) {
  const ctx = useContext(BrandsContext);
  useRequestLoad(ctx?.requestLoad, options);
  if (!ctx) throw new Error("useBrands must be used within a BrandsProvider");
  return ctx;
}
