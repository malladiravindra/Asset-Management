import { apiGet, apiPatch, apiPost } from "@/lib/api";

/** One settings value as the backend serializes it (DecimalField → string). */
export type SettingValue = string | number | boolean | null;
export type SettingsValues = Record<string, SettingValue>;

export type Choice = { value: string | number; label: string };

/**
 * Everything the Settings UI needs besides the values — returned by the same
 * GET /settings/ call (see SystemSettingsAPIView / _meta in
 * asset_backend/system_settings/views.py), so dropdown options, locked
 * fields and SMTP status are never hardcoded here.
 */
/**
 * active = read by backend logic today; stored = validated and saved but not
 * yet consumed by any module; locked = fixed by a database constraint.
 */
export type FieldStatus = "active" | "stored" | "locked";

export type SettingsMeta = {
  can_edit: boolean;
  locked_fields: Record<string, string>;
  field_status: Record<string, FieldStatus>;
  /** Why each "stored" field is not enforced yet. */
  stored_reasons: Record<string, string>;
  choices: Record<string, Choice[] | string[]>;
  email: {
    smtp_host: string;
    smtp_port: number | null;
    smtp_use_tls: boolean;
    host_user: string;
    password_configured: boolean;
    default_from_email: string;
  };
  system: { api_version: string; system_status: string };
};

export type SettingsResponse = { settings: SettingsValues; meta: SettingsMeta };

export function fetchSettings() {
  return apiGet<SettingsResponse>("/settings/");
}

/** Sends only the changed fields; the backend validates and returns the saved state. */
export function patchSettings(changes: SettingsValues) {
  return apiPatch<SettingsResponse>("/settings/", changes);
}

export function sendTestEmail(recipient: string) {
  return apiPost<{ detail: string; recipient: string }>("/settings/test-email/", recipient ? { recipient } : {});
}
