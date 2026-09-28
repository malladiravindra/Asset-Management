"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { useLoadOnDemand, useRequestLoad, type LoadOptions } from "@/lib/lazy";
import { apiDelete, apiGetAll, apiPatch, apiPost } from "@/lib/api";
import type { ModelEntry } from "@/components/models/data";

type ModelInput = {
  name: string;
  categoryId: number;
  brandId: number;
  spec?: string;
  /** Internal/vendor model code — folded into `specifications`, see toBackend(). */
  code?: string;
  description?: string;
};

type ModelsContextValue = {
  requestLoad: () => void;
  models: ModelEntry[];
  createModel: (input: ModelInput) => Promise<ModelEntry>;
  updateModel: (id: number, input: ModelInput) => Promise<ModelEntry>;
  deleteModel: (id: number) => Promise<void>;
};

const ModelsContext = createContext<ModelsContextValue | null>(null);

type BackendModel = {
  id: number;
  name: string;
  category: number;
  category_name: string;
  brand: number;
  brand_name: string;
  specifications?: { summary?: string; code?: string; description?: string } | null;
};

function fromBackend(model: BackendModel): ModelEntry {
  return {
    id: model.id,
    name: model.name,
    category: model.category_name,
    categoryId: model.category,
    brand: model.brand_name,
    brandId: model.brand,
    spec: model.specifications?.summary ?? "",
    code: model.specifications?.code ?? "",
    description: model.specifications?.description ?? "",
  };
}

function toBackend(input: ModelInput) {
  const payload: Record<string, unknown> = {
    name: input.name,
    category: input.categoryId,
    brand: input.brandId,
  };
  // `specifications` is a free-form JSONField on the backend — summary, code
  // and description all live inside it as plain keys, so no migration is
  // needed to carry the new fields end to end.
  const specifications: Record<string, string> = {};
  if (input.spec) specifications.summary = input.spec;
  if (input.code) specifications.code = input.code;
  if (input.description) specifications.description = input.description;
  if (Object.keys(specifications).length > 0) {
    payload.specifications = specifications;
  }
  return payload;
}

export function ModelsProvider({ children }: { children: ReactNode }) {
  const [models, setModels] = useState<ModelEntry[]>([]);

  const [loadRequested, requestLoad] = useLoadOnDemand();

  // Loads the first time a component on screen reads this context (see lib/lazy.ts).
  useEffect(() => {
    if (!loadRequested) return;
    void apiGetAll<BackendModel>("/catalog/models/")
      .then((items) => setModels(items.map(fromBackend)))
      .catch(() => setModels([]));
  }, [loadRequested]);

  // Re-fetches the full list from the database — called after every
  // create/update/delete so the list always reflects what the backend
  // actually persisted (the database stays the single source of truth)
  // instead of a client-constructed guess of what changed.
  const refresh = useCallback(() => {
    return apiGetAll<BackendModel>("/catalog/models/")
      .then((items) => setModels(items.map(fromBackend)))
      .catch(() => setModels([]));
  }, []);

  async function createModel(input: ModelInput) {
    const created = await apiPost<BackendModel>("/catalog/models/", toBackend(input));
    await refresh();
    return fromBackend(created);
  }

  async function updateModel(id: number, input: ModelInput) {
    const updated = await apiPatch<BackendModel>(`/catalog/models/${id}/`, toBackend(input));
    await refresh();
    return fromBackend(updated);
  }

  async function deleteModel(id: number) {
    await apiDelete(`/catalog/models/${id}/`);
    await refresh();
  }

  return (
    <ModelsContext.Provider value={{ requestLoad, models, createModel, updateModel, deleteModel }}>
      {children}
    </ModelsContext.Provider>
  );
}

export function useModels(options?: LoadOptions) {
  const ctx = useContext(ModelsContext);
  useRequestLoad(ctx?.requestLoad, options);
  if (!ctx) throw new Error("useModels must be used within a ModelsProvider");
  return ctx;
}
