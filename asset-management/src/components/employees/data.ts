import type { Asset } from "@/components/assets/data";

export type EmployeeStatus = "Active" | "On Leave" | "Inactive";

export type Employee = {
  id: number;
  employeeId: string;
  name: string;
  email: string;
  phone: string;
  department: string;
  designation: string;
  location: string;
  status: EmployeeStatus;
};

export function assetsFor(assets: Asset[], employeeName: string) {
  return assets.filter((a) => a.assignedTo === employeeName);
}

export const EMPLOYEE_STATUS_STYLES: Record<EmployeeStatus, string> = {
  Active: "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400",
  "On Leave": "bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400",
  Inactive: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400",
};
