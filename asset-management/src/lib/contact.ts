/**
 * Shared email/phone normalization + validation — the one place every
 * Create/Edit form gets this from, so the same rules apply everywhere
 * instead of each form inventing its own regex (Employees and Vendors
 * used to each have a different, incomplete check). Mirrors the backend's
 * own shared validators exactly — see
 * asset_backend/common/validators.py.
 */

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Trim + lowercase, matching the backend's normalize_email(). */
export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

/** Basic structural check — the same shape the backend's EmailField enforces. */
export function isValidEmail(value: string): boolean {
  return EMAIL_PATTERN.test(normalizeEmail(value));
}

/**
 * Accepts common Indian phone input formats (spaces/dashes/parentheses as
 * separators, an optional "+91"/"91" country code, or a leading trunk
 * "0") and returns the bare 10-digit number. Returns `""` for blank input
 * (an optional field left empty is not an error) or `null` if what's left
 * over isn't exactly 10 digits. Mirrors the backend's
 * normalize_indian_phone().
 */
export function normalizeIndianPhone(value: string): string | null {
  const raw = value.trim();
  if (!raw) return "";

  let cleaned = raw.replace(/[\s\-().]/g, "");
  if (cleaned.startsWith("+91")) {
    cleaned = cleaned.slice(3);
  } else if (cleaned.startsWith("91") && cleaned.length === 12) {
    cleaned = cleaned.slice(2);
  } else if (cleaned.startsWith("0") && cleaned.length === 11) {
    cleaned = cleaned.slice(1);
  }

  return /^\d{10}$/.test(cleaned) ? cleaned : null;
}

/** True for blank input (nothing to validate yet) or a normalizable 10-digit number. */
export function isValidIndianPhone(value: string): boolean {
  return normalizeIndianPhone(value) !== null;
}
