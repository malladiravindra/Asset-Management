import {
  Cpu,
  Laptop,
  Monitor,
  Mouse,
  Package,
  Router,
  Smartphone,
  type LucideIcon,
} from "lucide-react";
import { DEPARTMENT_COLORS, colorFor } from "@/components/departments/data";

export { DEPARTMENT_COLORS as CATEGORY_COLORS, colorFor };

// `slug` is the value persisted on the backend (catalog.Category.icon, e.g.
// "laptop", "cpu", "package") — NOT the display label. Keep them in sync with
// whatever icon slugs the backend/fixtures actually use.
export const CATEGORY_ICONS: { slug: string; label: string; icon: LucideIcon }[] = [
  { slug: "laptop", label: "Laptops", icon: Laptop },
  { slug: "cpu", label: "Desktops", icon: Cpu },
  { slug: "monitor", label: "Monitors", icon: Monitor },
  { slug: "smartphone", label: "Mobile Devices", icon: Smartphone },
  { slug: "router", label: "Networking", icon: Router },
  { slug: "mouse", label: "Peripherals", icon: Mouse },
  { slug: "package", label: "General", icon: Package },
];

export function iconFor(slug: string): LucideIcon {
  return CATEGORY_ICONS.find((i) => i.slug === slug)?.icon ?? Package;
}

export type Category = {
  id: number;
  name: string;
  /** Backend icon slug (catalog.Category.icon), e.g. "laptop" — see CATEGORY_ICONS. */
  iconLabel: string;
  colorKey: string;
  description?: string;
};
