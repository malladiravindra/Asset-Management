"use client";

import { Lock } from "lucide-react";
import { controlClass, InlineError, invalidControlClass } from "@/components/ui/modal";
import { cn } from "@/lib/utils";
import type { Choice, FieldStatus, SettingsValues, SettingValue } from "@/components/settings/api";
import type { FieldDef } from "@/components/settings/schema";

export function Toggle({
  id,
  checked,
  disabled,
  onChange,
  label,
}: {
  id: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
  label: string;
}) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full outline-none transition focus-visible:ring-2 focus-visible:ring-blue-500/40 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900",
        checked ? "bg-blue-600" : "bg-slate-200 dark:bg-slate-700",
        disabled && "cursor-not-allowed opacity-50",
      )}
    >
      <span
        className={cn(
          "inline-block h-5 w-5 rounded-full bg-white shadow-sm ring-1 ring-slate-900/5 transition-transform",
          checked ? "translate-x-5" : "translate-x-0.5",
        )}
      />
    </button>
  );
}

function normalizeChoices(raw: Choice[] | string[] | undefined): Choice[] {
  if (!raw) return [];
  return raw.map((c) => (typeof c === "string" ? { value: c, label: c } : c));
}

/** Live example of the code the backend generator will produce (same padding: asset 4, PO 3). */
function codePreview(kind: "asset" | "po", values: SettingsValues) {
  const year = String(new Date().getFullYear());
  const fmt = String(values[kind === "asset" ? "asset_number_format" : "po_number_format"] ?? "");
  const prefix = String(values[kind === "asset" ? "asset_code_prefix" : "po_prefix"] ?? "").trim().toUpperCase();
  const start = kind === "asset" ? Math.max(1, Number(values.starting_asset_number) || 1) : 1;
  const number = String(start).padStart(kind === "asset" ? 4 : 3, "0");
  return fmt
    .replaceAll("{PREFIX}", prefix)
    .replaceAll("{CATEGORY}", "LAP")
    .replaceAll("{YEAR}", year)
    .replaceAll("{NUMBER}", number);
}

export function SettingField({
  field,
  values,
  choices,
  error,
  lockedReason,
  status,
  storedReason,
  readOnly,
  dirty,
  onChange,
}: {
  field: FieldDef;
  values: SettingsValues;
  choices: Record<string, Choice[] | string[]>;
  error?: string;
  lockedReason?: string;
  status?: FieldStatus;
  storedReason?: string;
  readOnly: boolean;
  dirty: boolean;
  onChange: (key: string, value: SettingValue) => void;
}) {
  const id = `setting-${field.key}`;
  const value = values[field.key];
  const parentOff = field.dependsOn ? values[field.dependsOn] === false : false;
  const disabled = readOnly || Boolean(lockedReason) || parentOff;
  const control = cn(controlClass, error && invalidControlClass, disabled && "cursor-not-allowed opacity-60");

  let input: React.ReactNode;
  switch (field.type) {
    case "toggle":
      input = (
        <Toggle
          id={id}
          label={field.label}
          checked={Boolean(value)}
          disabled={disabled}
          onChange={(next) => onChange(field.key, next)}
        />
      );
      break;
    case "select": {
      const options = normalizeChoices(choices[field.choicesKey ?? field.key]);
      input = (
        <select
          id={id}
          value={value === null || value === undefined ? "" : String(value)}
          disabled={disabled}
          onChange={(e) => {
            const raw = e.target.value;
            if (raw === "") return onChange(field.key, null);
            const match = options.find((o) => String(o.value) === raw);
            onChange(field.key, match ? match.value : raw);
          }}
          className={cn(control, "cursor-pointer")}
        >
          {field.nullable && <option value="">Not set</option>}
          {options.map((o) => (
            <option key={String(o.value)} value={String(o.value)}>
              {o.label}
            </option>
          ))}
        </select>
      );
      break;
    }
    case "textarea":
      input = (
        <textarea
          id={id}
          rows={3}
          value={String(value ?? "")}
          disabled={disabled}
          onChange={(e) => onChange(field.key, e.target.value)}
          className={cn(control, "resize-y")}
        />
      );
      break;
    case "number":
    case "decimal":
      input = (
        <div className="flex items-center gap-2">
          <input
            id={id}
            type="number"
            inputMode={field.type === "decimal" ? "decimal" : "numeric"}
            step={field.type === "decimal" ? "0.01" : "1"}
            min={field.min}
            max={field.max}
            value={value === null || value === undefined ? "" : String(value)}
            disabled={disabled}
            onChange={(e) => onChange(field.key, e.target.value)}
            className={cn(control, field.unit ? "max-w-[9rem]" : "max-w-[12rem]")}
          />
          {field.unit && <span className="text-sm text-slate-500 dark:text-slate-400">{field.unit}</span>}
        </div>
      );
      break;
    default:
      input = (
        <input
          id={id}
          type={field.type === "email" ? "email" : field.type === "url" ? "url" : "text"}
          value={String(value ?? "")}
          placeholder={field.placeholder}
          disabled={disabled}
          onChange={(e) => onChange(field.key, e.target.value)}
          className={control}
        />
      );
  }

  const isToggle = field.type === "toggle";

  return (
    <div
      className={cn(
        "flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:gap-6",
        isToggle ? "sm:items-center" : "sm:items-start",
        field.dependsOn && "sm:pl-4",
      )}
    >
      <div className={cn("min-w-0", isToggle ? "flex-1" : "sm:w-2/5 sm:shrink-0")}>
        <label htmlFor={id} className="flex items-center gap-2 text-sm font-medium text-slate-800 dark:text-slate-100">
          {field.label}
          {field.required && (
            <span className="text-red-500 dark:text-red-400" aria-hidden="true">
              *
            </span>
          )}
          {status === "stored" && (
            <span
              title={`Validated and saved, but not yet applied. ${storedReason ?? ""}`.trim()}
              className="rounded-full bg-slate-100 px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:bg-slate-800 dark:text-slate-400"
            >
              Saved only
            </span>
          )}
          {dirty && (
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500" title="Unsaved change" aria-label="Unsaved change" />
          )}
        </label>
        {field.description && (
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{field.description}</p>
        )}
        {lockedReason && (
          <p className="mt-1 flex items-start gap-1.5 text-xs text-slate-500 dark:text-slate-400">
            <Lock className="mt-0.5 h-3 w-3 shrink-0" />
            {lockedReason}
          </p>
        )}
        {isToggle && error && <InlineError>{error}</InlineError>}
      </div>
      <div className={cn(isToggle ? "shrink-0" : "min-w-0 flex-1")}>
        {input}
        {!isToggle && error && <InlineError>{error}</InlineError>}
        {field.preview && !error && (
          <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
            Preview:{" "}
            <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] text-slate-700 dark:bg-slate-800 dark:text-slate-200">
              {codePreview(field.preview, values) || "—"}
            </code>
          </p>
        )}
      </div>
    </div>
  );
}
