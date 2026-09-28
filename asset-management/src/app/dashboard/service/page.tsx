import { Suspense } from "react";
import { ServiceTabs } from "@/components/service/tabs";

export default function ServicePage() {
  return (
    <Suspense fallback={null}>
      <ServiceTabs />
    </Suspense>
  );
}
