import { Suspense } from "react";
import { RolesPermissionsView } from "@/components/roles/view";

export default function RolesPermissionsPage() {
  return (
    <Suspense fallback={null}>
      <RolesPermissionsView />
    </Suspense>
  );
}
