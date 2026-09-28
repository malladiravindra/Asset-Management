export type ModelEntry = {
  id: number;
  name: string;
  category: string;
  categoryId: number;
  brand: string;
  brandId: number;
  spec: string;
  /** Internal/vendor model code, e.g. "LAT-5440". Stored inside the backend's
   *  free-form `specifications` JSON alongside `spec` — no schema change. */
  code: string;
  /** Longer free-text description, also folded into `specifications`. */
  description: string;
};

export function brandFromName(name: string) {
  const first = name.split(" ")[0];
  if (["MacBook", "iPhone", "iPad"].includes(first)) return "Apple";
  return first;
}
