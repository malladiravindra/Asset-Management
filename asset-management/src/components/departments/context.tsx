"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useLoadOnDemand, useRequestLoad, type LoadOptions } from "@/lib/lazy";
import { apiDelete, apiGetAll, apiPatch, apiPost } from "@/lib/api";
import { DEPARTMENT_COLORS, DEPARTMENT_ICONS, type Department } from "@/components/departments/data";

type DepartmentInput = {
  name: string;
  iconLabel: string;
  colorKey: string;
};

type DepartmentsContextValue = {
  requestLoad: () => void;
  departments: Department[];
  createDepartment: (input: DepartmentInput) => Promise<Department>;
  updateDepartment: (id: number, input: DepartmentInput) => Promise<Department>;
  deleteDepartment: (id: number) => Promise<void>;
};

const DepartmentsContext = createContext<DepartmentsContextValue | null>(null);

type BackendDepartment = { id: number; name: string; icon_label?: string; color_key?: string };

function fromBackend(department: BackendDepartment): Department {
  return {
    id: department.id,
    name: department.name,
    // Older rows predate the icon/color pickers and have no icon_label or
    // color_key saved — fall back to a per-department pick instead of
    // collapsing them all to the same icon/color.
    iconLabel:
      department.icon_label || DEPARTMENT_ICONS[department.id % DEPARTMENT_ICONS.length].label,
    colorKey:
      department.color_key || DEPARTMENT_COLORS[department.id % DEPARTMENT_COLORS.length].key,
  };
}

function toBackend(input: DepartmentInput) {
  return { name: input.name, icon_label: input.iconLabel, color_key: input.colorKey };
}

export function DepartmentsProvider({ children }: { children: ReactNode }) {
  const [departments, setDepartments] = useState<Department[]>([]);

  const [loadRequested, requestLoad] = useLoadOnDemand();

  // Loads the first time a component on screen reads this context (see lib/lazy.ts).
  useEffect(() => {
    if (!loadRequested) return;
    void apiGetAll<BackendDepartment>("/organization/departments/")
      .then((items) => setDepartments(items.map(fromBackend)))
      .catch(() => setDepartments([]));
  }, [loadRequested]);

  async function createDepartment(input: DepartmentInput) {
    const created = await apiPost<BackendDepartment>("/organization/departments/", toBackend(input));
    const department = fromBackend(created);
    setDepartments((prev) => [...prev, department]);
    return department;
  }

  async function updateDepartment(id: number, input: DepartmentInput) {
    const updated = await apiPatch<BackendDepartment>(`/organization/departments/${id}/`, toBackend(input));
    const department = fromBackend(updated);
    setDepartments((prev) => prev.map((d) => (d.id === id ? department : d)));
    return department;
  }

  async function deleteDepartment(id: number) {
    await apiDelete(`/organization/departments/${id}/`);
    setDepartments((prev) => prev.filter((d) => d.id !== id));
  }

  return (
    <DepartmentsContext.Provider value={{ requestLoad, departments, createDepartment, updateDepartment, deleteDepartment }}>
      {children}
    </DepartmentsContext.Provider>
  );
}

export function useDepartments(options?: LoadOptions) {
  const ctx = useContext(DepartmentsContext);
  useRequestLoad(ctx?.requestLoad, options);
  if (!ctx) throw new Error("useDepartments must be used within a DepartmentsProvider");
  return ctx;
}
