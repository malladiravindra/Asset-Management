"use client";

import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Check, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DepartmentColor } from "@/components/departments/data";

let openModalCount = 0;

function lockBodyScroll() {
  if (typeof document === "undefined") return () => {};
  if (openModalCount === 0) {
    document.body.style.overflow = "hidden";
  }
  openModalCount++;
  return () => {
    openModalCount = Math.max(0, openModalCount - 1);
    if (openModalCount === 0) {
      document.body.style.overflow = "";
    }
  };
}

/**
 * Shared modal shell: fixed full-viewport overlay (itself scrollable) with a
 * centered panel capped at 90vh. Because the overlay scrolls and the panel's
 * max-height is viewport-relative, the panel can never render taller than the
 * viewport and lose its top (header) or bottom (footer) off-screen — even
 * when its content is long or the browser window is short.
 *
 * Rendered through a portal into document.body. Several page wrappers in
 * this app use a mount-in animation (see globals.css .animate-*) that ends
 * with `animation-fill-mode: both`, which keeps a non-"none" `transform` on
 * that element permanently — and per the CSS spec, any ancestor with a
 * transform becomes the containing block for `position: fixed` descendants
 * instead of the viewport. Without the portal, a modal opened from inside
 * one of those pages would be confined to that ancestor's box rather than
 * the real viewport, breaking centering and the 90vh cap.
 *
 * `variant="content"` is for dialogs that manage their own internal
 * shrink-0 header / scrollable body / shrink-0 footer layout (e.g. detail
 * modals); `variant="panel"` (default) scrolls the whole panel as one block,
 * matching the existing Add/Edit form dialogs.
 */
export function Modal({
  onClose,
  children,
  maxWidthClassName = "max-w-md",
  variant = "panel",
  panelClassName,
  zIndexClassName = "z-30",
}: {
  onClose: () => void;
  children: ReactNode;
  maxWidthClassName?: string;
  variant?: "panel" | "content";
  panelClassName?: string;
  zIndexClassName?: string;
}) {
  // Guards the portal against a hypothetical server render rather than a
  // setState-driven "mounted" flag — this component is only ever rendered
  // after a client-side event (e.g. `{formOpen && <Modal>}`), so `document`
  // is always defined by the time it actually renders.
  useEffect(() => lockBodyScroll(), []);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div className={cn("fixed inset-0 overflow-y-auto bg-slate-900/40", zIndexClassName)}>
      <button aria-label="Close" className="fixed inset-0 cursor-default" onClick={onClose} />
      <div className="flex min-h-full items-center justify-center p-4">
        <div
          className={cn(
            "relative max-h-[90vh] w-full rounded-2xl bg-white shadow-xl dark:bg-slate-900",
            maxWidthClassName,
            variant === "panel" ? "overflow-y-auto p-6" : "flex flex-col overflow-hidden",
            panelClassName,
          )}
        >
          {children}
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** Shared text-input / select styling so every form field in the app matches. */
export const controlClass =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-100";

export const secondaryButtonClass =
  "rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800";

export const primaryButtonClass =
  "rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-70";

/** Small-caps field label used across form modals, with an optional inline hint. */
export function FieldLabel({
  children,
  hint,
  required,
  htmlFor,
}: {
  children: React.ReactNode;
  hint?: string;
  /** Shows a red asterisk after the label for fields the form won't submit without. */
  required?: boolean;
  htmlFor?: string;
}) {
  return (
    <div className="mb-1.5 flex items-baseline justify-between gap-2">
      <label
        htmlFor={htmlFor}
        className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400"
      >
        {children}
        {required && (
          <span className="ml-0.5 text-red-500 dark:text-red-400" aria-hidden="true">
            *
          </span>
        )}
      </label>
      {hint && <span className="text-[11px] text-slate-400 dark:text-slate-500">{hint}</span>}
    </div>
  );
}

/** Inline, per-field validation message shown directly under a control. */
export function InlineError({ children }: { children: React.ReactNode }) {
  return (
    <p role="alert" className="mt-1.5 text-xs font-medium text-red-600 dark:text-red-400">
      {children}
    </p>
  );
}

/** Border/ring treatment to layer onto `controlClass` when a field is invalid. */
export const invalidControlClass =
  "border-red-300 focus:border-red-500 focus:ring-red-500/20 dark:border-red-500/40";

/** Solid-color swatch picker (category/brand accent color) with a check mark on the active swatch. */
export function ColorPicker({
  colors,
  value,
  onChange,
}: {
  colors: DepartmentColor[];
  value: string;
  onChange: (key: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-3">
      {colors.map((c) => {
        const active = value === c.key;
        return (
          <button
            key={c.key}
            type="button"
            title={c.key}
            aria-label={`Color: ${c.key}`}
            aria-pressed={active}
            onClick={() => onChange(c.key)}
            className={cn(
              "flex h-9 w-9 items-center justify-center rounded-full outline-none transition",
              c.solid,
              active
                ? "ring-2 ring-slate-900 ring-offset-2 ring-offset-white dark:ring-white dark:ring-offset-slate-900"
                : "hover:scale-110 focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2"
            )}
          >
            {active && <Check className="h-4 w-4 text-white" strokeWidth={3} />}
          </button>
        );
      })}
    </div>
  );
}

/** Icon-swatch picker (category glyph) — same sizing/spacing/selected-ring language as `ColorPicker`. */
export function IconPicker({
  options,
  value,
  onChange,
  columns = 7,
}: {
  options: { slug: string; label: string; icon: LucideIcon }[];
  value: string;
  onChange: (slug: string) => void;
  columns?: number;
}) {
  return (
    <div className="grid gap-2.5" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
      {options.map((opt) => {
        const Icon = opt.icon;
        const active = value === opt.slug;
        return (
          <button
            key={opt.slug}
            type="button"
            title={opt.label}
            aria-label={opt.label}
            aria-pressed={active}
            onClick={() => onChange(opt.slug)}
            className={cn(
              "flex h-11 w-11 items-center justify-center rounded-lg border outline-none transition",
              active
                ? "border-blue-600 bg-blue-50 text-blue-600 ring-2 ring-blue-600/30 dark:bg-blue-500/10 dark:text-blue-400"
                : "border-slate-200 text-slate-500 hover:border-slate-300 hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-slate-400 dark:border-slate-800 dark:text-slate-400 dark:hover:bg-slate-800"
            )}
          >
            <Icon className="h-4.5 w-4.5" />
          </button>
        );
      })}
    </div>
  );
}

export function FormError({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-500/10 dark:text-red-400">
      {children}
    </p>
  );
}
