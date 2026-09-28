import { Building2, Building, Laptop, type LucideIcon } from "lucide-react";

export type LocationType = "Headquarters" | "Branch Office" | "Remote";

export type Location = {
  id: number;
  name: string;
  type: LocationType;
  address: string;
  code?: string;
  status?: "Active" | "Inactive";
  city?: string;
  state?: string;
  country?: string;
  postalCode?: string;
  notes?: string;
};

export const LOCATION_TYPES: LocationType[] = ["Headquarters", "Branch Office", "Remote"];

export const LOCATION_TYPE_META: Record<LocationType, { icon: LucideIcon; iconBg: string; chip: string; bar: string }> = {
  Headquarters: {
    icon: Building2,
    iconBg: "bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400",
    chip: "bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400",
    bar: "from-blue-500 to-blue-600",
  },
  "Branch Office": {
    icon: Building,
    iconBg: "bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-400",
    chip: "bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-400",
    bar: "from-violet-500 to-violet-600",
  },
  Remote: {
    icon: Laptop,
    iconBg: "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400",
    chip: "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400",
    bar: "from-emerald-500 to-emerald-600",
  },
};

export function typeMeta(type: LocationType) {
  return LOCATION_TYPE_META[type];
}
