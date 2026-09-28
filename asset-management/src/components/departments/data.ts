import {
  Building2,
  Cpu,
  IndianRupee,
  Megaphone,
  Scale,
  Settings,
  ShieldCheck,
  TrendingUp,
  Users,
  type LucideIcon,
} from "lucide-react";

export type DepartmentColor = {
  key: string;
  icon: string;
  bar: string;
  chip: string;
  /** Solid swatch color (e.g. for color pickers) — not a background/text pair. */
  solid: string;
};

export const DEPARTMENT_COLORS: DepartmentColor[] = [
  {
    key: "blue",
    icon: "bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400",
    bar: "from-blue-500 to-blue-600",
    chip: "bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400",
    solid: "bg-blue-500",
  },
  {
    key: "emerald",
    icon: "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400",
    bar: "from-emerald-500 to-emerald-600",
    chip: "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400",
    solid: "bg-emerald-500",
  },
  {
    key: "red",
    icon: "bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400",
    bar: "from-red-500 to-red-600",
    chip: "bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400",
    solid: "bg-red-500",
  },
  {
    key: "cyan",
    icon: "bg-cyan-50 text-cyan-600 dark:bg-cyan-500/10 dark:text-cyan-400",
    bar: "from-cyan-500 to-cyan-600",
    chip: "bg-cyan-50 text-cyan-600 dark:bg-cyan-500/10 dark:text-cyan-400",
    solid: "bg-cyan-500",
  },
  {
    key: "amber",
    icon: "bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400",
    bar: "from-amber-500 to-amber-600",
    chip: "bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400",
    solid: "bg-amber-500",
  },
  {
    key: "violet",
    icon: "bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-400",
    bar: "from-violet-500 to-violet-600",
    chip: "bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-400",
    solid: "bg-violet-500",
  },
  {
    key: "indigo",
    icon: "bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400",
    bar: "from-indigo-500 to-indigo-600",
    chip: "bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400",
    solid: "bg-indigo-500",
  },
  {
    key: "pink",
    icon: "bg-pink-50 text-pink-600 dark:bg-pink-500/10 dark:text-pink-400",
    bar: "from-pink-500 to-pink-600",
    chip: "bg-pink-50 text-pink-600 dark:bg-pink-500/10 dark:text-pink-400",
    solid: "bg-pink-500",
  },
];

export function colorFor(key: string): DepartmentColor {
  return DEPARTMENT_COLORS.find((c) => c.key === key) ?? DEPARTMENT_COLORS[0];
}

export const DEPARTMENT_ICONS: { label: string; icon: LucideIcon }[] = [
  { label: "Engineering", icon: Cpu },
  { label: "Finance", icon: IndianRupee },
  { label: "Operations", icon: Settings },
  { label: "Sales", icon: TrendingUp },
  { label: "Marketing", icon: Megaphone },
  { label: "People", icon: Users },
  { label: "Legal", icon: Scale },
  { label: "Security", icon: ShieldCheck },
  { label: "General", icon: Building2 },
];

export function iconFor(label: string): LucideIcon {
  return DEPARTMENT_ICONS.find((i) => i.label === label)?.icon ?? Building2;
}

export type Department = {
  id: number;
  name: string;
  iconLabel: string;
  colorKey: string;
};
