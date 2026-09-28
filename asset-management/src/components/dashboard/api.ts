import { apiGet } from "@/lib/api";

export type DashboardStatusBreakdown = { status: string; count: number; percentage: number };
export type DashboardDepartmentBreakdown = { department_name: string; asset_count: number; percentage: number };
export type DashboardCategoryBreakdown = { category_name: string; asset_count: number };
export type DashboardActivity = {
  title: string;
  action: "CREATE" | "UPDATE" | "ASSIGN" | "RETURN" | "DELETE" | "LOGIN" | "LOGOUT";
  timestamp: string;
};
// Record counts behind the sidebar badges (business summary, not notifications).
export type DashboardAttention = {
  overdue_maintenance_count: number;
  overdue_repair_count: number;
  licenses_attention_count: number;
  low_stock_accessories_count: number;
};
// days_left is computed by the backend from the asset's real warranty_end_date;
// both are null for assets whose warranty status was entered without a date.
export type DashboardWarrantyAlert = {
  asset_code: string;
  name: string;
  status: string;
  warranty_status: string;
  warranty_end_date: string | null;
  days_left: number | null;
};

export type DashboardSummary = {
  total_assets: number;
  available_count: number;
  assigned_count: number;
  under_service_count: number;
  warranty_alerts_count: number;
  warranty_alerts: DashboardWarrantyAlert[];
  total_current_value: number;
  /** Sum(Asset.cost) — what the fleet originally cost. */
  total_purchase_cost: number;
  by_department: DashboardDepartmentBreakdown[];
  by_status: DashboardStatusBreakdown[];
  by_category: DashboardCategoryBreakdown[];
  recent_activity: DashboardActivity[];
  attention: DashboardAttention;
};

export function fetchDashboardSummary() {
  return apiGet<DashboardSummary>("/dashboard/");
}
