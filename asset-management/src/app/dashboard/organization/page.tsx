import { Suspense } from "react";
import { OrganizationTabs } from "@/components/organization/tabs";

export default function OrganizationPage() {
  return (
    <Suspense fallback={null}>
      <OrganizationTabs />
    </Suspense>
  );
}
