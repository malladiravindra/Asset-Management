import { Suspense } from "react";
import { CatalogTabs } from "@/components/catalog/tabs";

export default function CatalogPage() {
  return (
    <Suspense fallback={null}>
      <CatalogTabs />
    </Suspense>
  );
}
