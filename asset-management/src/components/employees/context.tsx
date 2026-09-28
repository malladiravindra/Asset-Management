"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useLoadOnDemand, useRequestLoad, type LoadOptions } from "@/lib/lazy";
import { apiDelete, apiGetAll, apiPatch, apiPost } from "@/lib/api";
import type { Employee, EmployeeStatus } from "@/components/employees/data";

type EmployeeInput = {
  name: string;
  email: string;
  phone: string;
  designation: string;
  departmentId: number | null;
  locationId: number;
  status: "active" | "inactive";
};

type EmployeesContextValue = {
  requestLoad: () => void;
  employees: Employee[];
  createEmployee: (input: EmployeeInput) => Promise<Employee>;
  updateEmployee: (id: number, input: EmployeeInput) => Promise<Employee>;
  deleteEmployee: (id: number) => Promise<void>;
};

const EmployeesContext = createContext<EmployeesContextValue | null>(null);

type BackendEmployee = {
  id: number;
  employee_id: string | null;
  name: string;
  email: string;
  phone?: string;
  department?: number | null;
  department_name?: string | null;
  location?: number | null;
  location_name?: string | null;
  designation?: string;
  status: "active" | "inactive";
};

function fromBackend(employee: BackendEmployee): Employee {
  return {
    id: employee.id,
    // Server-generated; blank only for legacy rows that predate it.
    employeeId: employee.employee_id ?? "",
    name: employee.name,
    email: employee.email,
    phone: employee.phone ?? "",
    department: employee.department_name ?? "",
    designation: employee.designation ?? "",
    location: employee.location_name ?? "",
    status: (employee.status === "active" ? "Active" : "Inactive") as EmployeeStatus,
  };
}

function toBackend(input: EmployeeInput) {
  return {
    name: input.name,
    email: input.email,
    phone: input.phone,
    // Always sent (even when empty) so a PATCH can clear them.
    designation: input.designation ?? "",
    department: input.departmentId ?? null,
    location: input.locationId,
    status: input.status,
  };
}

export function EmployeesProvider({ children }: { children: ReactNode }) {
  const [employees, setEmployees] = useState<Employee[]>([]);

  const [loadRequested, requestLoad] = useLoadOnDemand();

  // Loads the first time a component on screen reads this context (see lib/lazy.ts).
  useEffect(() => {
    if (!loadRequested) return;
    void apiGetAll<BackendEmployee>("/organization/employees/")
      .then((items) => setEmployees(items.map(fromBackend)))
      .catch(() => setEmployees([]));
  }, [loadRequested]);

  async function createEmployee(input: EmployeeInput) {
    const created = await apiPost<BackendEmployee>("/organization/employees/", toBackend(input));
    const employee = fromBackend(created);
    setEmployees((prev) => [employee, ...prev]);
    return employee;
  }

  async function updateEmployee(id: number, input: EmployeeInput) {
    const updated = await apiPatch<BackendEmployee>(`/organization/employees/${id}/`, toBackend(input));
    const employee = fromBackend(updated);
    setEmployees((prev) => prev.map((e) => (e.id === id ? employee : e)));
    return employee;
  }

  async function deleteEmployee(id: number) {
    await apiDelete(`/organization/employees/${id}/`);
    setEmployees((prev) => prev.filter((e) => e.id !== id));
  }

  return (
    <EmployeesContext.Provider value={{ requestLoad, employees, createEmployee, updateEmployee, deleteEmployee }}>
      {children}
    </EmployeesContext.Provider>
  );
}

export function useEmployees(options?: LoadOptions) {
  const ctx = useContext(EmployeesContext);
  useRequestLoad(ctx?.requestLoad, options);
  if (!ctx) throw new Error("useEmployees must be used within an EmployeesProvider");
  return ctx;
}
