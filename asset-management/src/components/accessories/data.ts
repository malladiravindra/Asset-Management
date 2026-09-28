import { AlertTriangle, CheckCircle2, XCircle, type LucideIcon } from "lucide-react";

export type AccessoryCondition = "Good" | "Fair" | "Poor";

export const ACCESSORY_CONDITIONS: AccessoryCondition[] = ["Good", "Fair", "Poor"];

export type AccessoryItemStatus = "Active" | "Inactive" | "Discontinued";

export const ACCESSORY_STATUSES: AccessoryItemStatus[] = ["Active", "Inactive", "Discontinued"];

export type StockStatus = "In Stock" | "Low Stock" | "Out of Stock";

export const STOCK_STATUS_META: Record<StockStatus, { icon: LucideIcon; chip: string }> = {
  "In Stock": { icon: CheckCircle2, chip: "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400" },
  "Low Stock": { icon: AlertTriangle, chip: "bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400" },
  "Out of Stock": { icon: XCircle, chip: "bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400" },
};

export type Accessory = {
  id: number;
  sku: string;
  name: string;
  category: string;
  brand: string;
  model: string;
  description: string;
  totalQty: number;
  assignedQty: number;
  reorderThreshold: number;
  reorderQty: number;
  unitCost: number;
  vendor: string;
  // null when not recorded — never substituted with today.
  purchaseDate: Date | null;
  purchaseOrder: string;
  warrantyExpiry: Date | null;
  location: string;
  storageLocation: string;
  condition: AccessoryCondition;
  itemStatus: AccessoryItemStatus;
  lastRestocked: Date | null;
};

export function availableQty(a: Accessory) {
  return a.totalQty - a.assignedQty;
}

export function stockStatus(a: Accessory): StockStatus {
  const available = availableQty(a);
  if (available <= 0) return "Out of Stock";
  if (available <= a.reorderThreshold) return "Low Stock";
  return "In Stock";
}

export function stockValue(a: Accessory) {
  return a.totalQty * a.unitCost;
}
