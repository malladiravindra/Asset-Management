import {
  CheckCircle2,
  Clock,
  FileEdit,
  PackageCheck,
  PackageSearch,
  Truck,
  XCircle,
  type LucideIcon,
} from "lucide-react";

export type PurchaseOrderStatus =
  | "Draft"
  | "Pending Approval"
  | "Approved"
  | "Ordered"
  | "Partially Received"
  | "Received"
  | "Cancelled";

export const PURCHASE_ORDER_STATUSES: PurchaseOrderStatus[] = [
  "Draft",
  "Pending Approval",
  "Approved",
  "Ordered",
  "Partially Received",
  "Received",
  "Cancelled",
];

export const PO_STATUS_META: Record<
  PurchaseOrderStatus,
  { icon: LucideIcon; chip: string; dot: string }
> = {
  Draft: {
    icon: FileEdit,
    chip: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
    dot: "bg-slate-400",
  },
  "Pending Approval": {
    icon: Clock,
    chip: "bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400",
    dot: "bg-amber-500",
  },
  Approved: {
    icon: CheckCircle2,
    chip: "bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400",
    dot: "bg-blue-500",
  },
  Ordered: {
    icon: Truck,
    chip: "bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-400",
    dot: "bg-violet-500",
  },
  "Partially Received": {
    icon: PackageSearch,
    chip: "bg-cyan-50 text-cyan-600 dark:bg-cyan-500/10 dark:text-cyan-400",
    dot: "bg-cyan-500",
  },
  Received: {
    icon: PackageCheck,
    chip: "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400",
    dot: "bg-emerald-500",
  },
  Cancelled: {
    icon: XCircle,
    chip: "bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400",
    dot: "bg-red-500",
  },
};

// The natural forward path through a purchase order's lifecycle, used to
// suggest the next status and to render a progress trail in the UI.
export const PO_STATUS_FLOW: PurchaseOrderStatus[] = [
  "Draft",
  "Pending Approval",
  "Approved",
  "Ordered",
  "Partially Received",
  "Received",
];

export function nextStatus(status: PurchaseOrderStatus): PurchaseOrderStatus | null {
  const idx = PO_STATUS_FLOW.indexOf(status);
  if (idx === -1 || idx === PO_STATUS_FLOW.length - 1) return null;
  return PO_STATUS_FLOW[idx + 1];
}

export type PurchaseOrderItem = {
  name: string;
  category: string;
  quantity: number;
  unitCost: number;
};

export type PurchaseOrder = {
  id: number;
  poNumber: string;
  vendor: string;
  vendorCompanyName?: string;
  vendorEmail?: string;
  vendorPhone?: string;
  vendorAddress?: string;
  department: string;
  requestedBy: string;
  items: PurchaseOrderItem[];
  status: PurchaseOrderStatus;
  orderDate: Date;
  expectedDate: Date;
  receivedDate: Date | null;
  notes: string;
  gstRate?: number;
  tax?: number;
};

export const GST_RATES = [0, 5, 12, 18, 28];

export function totalUnits(order: PurchaseOrder) {
  return order.items.reduce((sum, item) => sum + item.quantity, 0);
}

export function itemsSubtotal(order: PurchaseOrder) {
  return order.items.reduce((sum, item) => sum + item.quantity * item.unitCost, 0);
}

export function totalValue(order: PurchaseOrder) {
  return itemsSubtotal(order) + (order.tax ?? 0);
}
