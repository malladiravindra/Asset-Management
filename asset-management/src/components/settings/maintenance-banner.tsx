"use client";

import Link from "next/link";
import { Construction } from "lucide-react";
import { useRuntimeSettings } from "@/components/settings/runtime";

/**
 * Shown while Settings > System > Maintenance Mode is on. The backend
 * (system_settings.middleware.MaintenanceModeMiddleware) answers non-staff
 * API calls with 503 in that state; this banner tells those users why.
 * Staff keep full access and see a reminder instead.
 */
export function MaintenanceBanner() {
  const { values, canEdit } = useRuntimeSettings();
  if (!values?.maintenance_mode) return null;

  return (
    <div
      role="status"
      className="mb-4 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 sm:mb-6 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200 print:hidden"
    >
      <Construction className="mt-0.5 h-4 w-4 shrink-0" />
      {canEdit ? (
        <span>
          Maintenance mode is on — non-administrator users are blocked.{" "}
          <Link href="/dashboard/settings?section=system" className="font-semibold underline underline-offset-2">
            Turn it off in Settings
          </Link>
          .
        </span>
      ) : (
        <span>{String(values.maintenance_message || "The system is undergoing maintenance.")}</span>
      )}
    </div>
  );
}
