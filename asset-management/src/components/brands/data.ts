import { DEPARTMENT_COLORS, colorFor } from "@/components/departments/data";

export { DEPARTMENT_COLORS as BRAND_COLORS, colorFor };

export type Brand = {
  id: number;
  name: string;
  colorKey: string;
  categoryId: number | null;
  categoryName: string | null;
};

export function initials(name: string) {
  return name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}
