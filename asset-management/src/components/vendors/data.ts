import { Package, ShoppingCart, Store, Truck, type LucideIcon } from "lucide-react";

export type VendorType = "Distributor" | "Software Publisher" | "Marketplace" | "Retailer";

export type Vendor = {
  id: number;
  name: string;
  companyName?: string;
  type: VendorType;
  email: string;
  phone: string;
  status: "Active" | "Inactive";
  contactPerson?: string;
  vendorCode?: string;
  gstNumber?: string;
  address?: string;
  city?: string;
  state?: string;
  country?: string;
  postalCode?: string;
  paymentTerms?: string;
  currency?: string;
  notes?: string;
};

export const VENDOR_TYPES: VendorType[] = ["Distributor", "Software Publisher", "Marketplace", "Retailer"];

export const PAYMENT_TERMS = ["Due on Receipt", "Net 15", "Net 30", "Net 45", "Net 60"];

export const CURRENCIES = [
  { code: "INR", label: "INR (₹)" },
  { code: "USD", label: "USD ($)" },
  { code: "EUR", label: "EUR (€)" },
  { code: "GBP", label: "GBP (£)" },
];


export const VENDOR_TYPE_META: Record<VendorType, { icon: LucideIcon; iconBg: string; chip: string; bar: string }> = {
  Distributor: {
    icon: Truck,
    iconBg: "bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400",
    chip: "bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400",
    bar: "from-blue-500 to-blue-600",
  },
  "Software Publisher": {
    icon: Package,
    iconBg: "bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-400",
    chip: "bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-400",
    bar: "from-violet-500 to-violet-600",
  },
  Marketplace: {
    icon: ShoppingCart,
    iconBg: "bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400",
    chip: "bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400",
    bar: "from-amber-500 to-amber-600",
  },
  Retailer: {
    icon: Store,
    iconBg: "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400",
    chip: "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400",
    bar: "from-emerald-500 to-emerald-600",
  },
};

export function typeMeta(type: VendorType) {
  return VENDOR_TYPE_META[type];
}

export function initials(name: string) {
  return name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}
