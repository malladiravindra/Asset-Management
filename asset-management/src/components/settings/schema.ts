import type { LucideIcon } from "lucide-react";
import {
  Bell,
  Boxes,
  Building2,
  CalendarClock,
  ClipboardList,
  FileBarChart,
  FileText,
  ListChecks,
  Mail,
  Network,
  Server,
  ShieldCheck,
  Wrench,
} from "lucide-react";

/**
 * Layout/labels for the Settings console. This file holds presentation only
 * — which backend field goes in which card, its label and helper text.
 * Values, dropdown options and locked state all come from GET /settings/.
 * Field `key`s are the exact SystemSettings column names.
 */

export type FieldType = "text" | "email" | "url" | "textarea" | "number" | "decimal" | "select" | "toggle";

export type FieldDef = {
  key: string;
  label: string;
  description?: string;
  type: FieldType;
  /** Key into meta.choices; defaults to `key` for selects. */
  choicesKey?: string;
  placeholder?: string;
  min?: number;
  max?: number;
  /** Unit shown after number inputs, e.g. "days". */
  unit?: string;
  required?: boolean;
  /** Disabled (visually nested) while this toggle is off. */
  dependsOn?: string;
  /** Shows a live generated-code preview under the input. */
  preview?: "asset" | "po";
  /** Select allows "not set" (nullable FK). */
  nullable?: boolean;
};

export type FieldGroup = { title: string; description?: string; fields: FieldDef[] };

export type SectionKey =
  | "general"
  | "organization"
  | "assets"
  | "purchase-orders"
  | "assignments"
  | "maintenance"
  | "repairs"
  | "notifications"
  | "security"
  | "email"
  | "reports"
  | "audit-logs"
  | "system";

export type SectionDef = {
  key: SectionKey;
  label: string;
  title: string;
  description: string;
  icon: LucideIcon;
  groups: FieldGroup[];
};

export const SECTIONS: SectionDef[] = [
  {
    key: "general",
    label: "General",
    title: "General Settings",
    description: "Basic organization information and regional preferences used across the application.",
    icon: Building2,
    groups: [
      {
        title: "Organization Information",
        description: "Shown on reports, emails and printed documents.",
        fields: [
          { key: "organization_name", label: "Organization Name", type: "text", required: true },
          {
            key: "organization_logo_url",
            label: "Organization Logo URL",
            type: "url",
            placeholder: "https://example.com/logo.png",
            description: "Public link to a PNG or SVG logo used on reports and documents.",
          },
          { key: "company_email", label: "Company Email", type: "email", placeholder: "it@company.com" },
          { key: "company_phone", label: "Company Phone", type: "text", placeholder: "+91 40 1234 5678" },
        ],
      },
      {
        title: "Address",
        fields: [
          { key: "address", label: "Address", type: "textarea" },
          { key: "city", label: "City", type: "text" },
          { key: "state", label: "State", type: "text" },
          { key: "country", label: "Country", type: "text" },
        ],
      },
      {
        title: "Regional Preferences",
        description: "Controls how dates, times and amounts are displayed.",
        fields: [
          { key: "timezone", label: "Timezone", type: "select" },
          { key: "currency", label: "Currency", type: "select" },
          { key: "date_format", label: "Date Format", type: "select" },
          { key: "time_format", label: "Time Format", type: "select" },
        ],
      },
    ],
  },
  {
    key: "organization",
    label: "Organization",
    title: "Organization Settings",
    description:
      "Organization-wide defaults. Departments, employees and locations themselves are managed in their own modules.",
    icon: Network,
    groups: [
      {
        title: "Defaults",
        description: "Pre-selected for new records when no value is chosen.",
        fields: [
          { key: "default_department", label: "Default Department", type: "select", nullable: true },
          { key: "default_location", label: "Default Location", type: "select", nullable: true },
        ],
      },
      {
        title: "Structure",
        fields: [
          {
            key: "allow_multiple_locations",
            label: "Allow Multiple Locations",
            description: "Operate across more than one office or site.",
            type: "toggle",
          },
          {
            key: "allow_multiple_departments",
            label: "Allow Multiple Departments",
            description: "Organize employees and assets by department.",
            type: "toggle",
          },
        ],
      },
      {
        title: "Employee IDs",
        fields: [
          {
            key: "auto_generate_employee_id",
            label: "Auto Generate Employee ID",
            description: "Assign the next sequential ID when an employee is created.",
            type: "toggle",
          },
          {
            key: "employee_id_prefix",
            label: "Employee ID Prefix",
            description: "Letters or digits only, e.g. EMP → EMP-1001.",
            type: "text",
            required: true,
          },
        ],
      },
    ],
  },
  {
    key: "assets",
    label: "Assets",
    title: "Asset Management",
    description: "How asset codes are generated and which rules apply when assets are created or retired.",
    icon: Boxes,
    groups: [
      {
        title: "Asset Codes",
        description: "Tokens: {PREFIX}, {CATEGORY}, {YEAR}, {NUMBER}. {NUMBER} must come last.",
        fields: [
          {
            key: "auto_generate_asset_code",
            label: "Auto Generate Asset Code",
            description: "Generate a unique code for every new asset.",
            type: "toggle",
          },
          { key: "asset_code_prefix", label: "Asset Code Prefix", type: "text", required: true },
          {
            key: "asset_number_format",
            label: "Asset Number Format",
            type: "text",
            required: true,
            preview: "asset",
          },
          {
            key: "starting_asset_number",
            label: "Starting Asset Number",
            description: "First number issued for a category with no existing assets.",
            type: "number",
            min: 1,
            max: 999999,
          },
        ],
      },
      {
        title: "Defaults",
        fields: [
          { key: "default_asset_status", label: "Default Asset Status", type: "select" },
          { key: "default_asset_condition", label: "Default Asset Condition", type: "select" },
        ],
      },
      {
        title: "Data Rules",
        fields: [
          { key: "require_serial_number", label: "Require Serial Number", type: "toggle" },
          { key: "allow_duplicate_serial_numbers", label: "Allow Duplicate Serial Numbers", type: "toggle" },
          {
            key: "require_asset_image",
            label: "Require Asset Image",
            description: "Block saving an asset without a photo.",
            type: "toggle",
          },
        ],
      },
      {
        title: "Disposal",
        fields: [
          {
            key: "allow_asset_disposal",
            label: "Allow Asset Disposal",
            description: "Permit assets to be permanently retired from the inventory.",
            type: "toggle",
          },
          {
            key: "require_disposal_approval",
            label: "Require Disposal Approval",
            description: "Disposals must be approved before they take effect.",
            type: "toggle",
            dependsOn: "allow_asset_disposal",
          },
        ],
      },
    ],
  },
  {
    key: "purchase-orders",
    label: "Purchase Orders",
    title: "Purchase Orders",
    description: "Numbering, default status and approval rules for procurement.",
    icon: FileText,
    groups: [
      {
        title: "PO Numbering",
        description: "Tokens: {PREFIX}, {YEAR}, {NUMBER}. With {YEAR}, numbering restarts every year.",
        fields: [
          {
            key: "auto_generate_po_number",
            label: "Auto Generate PO Number",
            description: "Assign the next sequential number when an order is created.",
            type: "toggle",
          },
          { key: "po_prefix", label: "PO Prefix", type: "text", required: true },
          { key: "po_number_format", label: "PO Number Format", type: "text", required: true, preview: "po" },
          { key: "default_po_status", label: "Default PO Status", type: "select" },
        ],
      },
      {
        title: "Approval & Receiving",
        fields: [
          {
            key: "po_require_approval",
            label: "Require Purchase Order Approval",
            description: "Orders above the threshold must be approved before ordering.",
            type: "toggle",
          },
          {
            key: "po_approval_threshold",
            label: "Approval Threshold",
            description: "Orders with a total above this amount need approval. 0 = every order.",
            type: "decimal",
            min: 0,
            dependsOn: "po_require_approval",
          },
          {
            key: "allow_partial_receiving",
            label: "Allow Partial Receiving",
            description: "Receive part of an order and keep the rest open.",
            type: "toggle",
          },
          { key: "po_require_vendor", label: "Require Vendor", type: "toggle" },
        ],
      },
    ],
  },
  {
    key: "assignments",
    label: "Assignments",
    title: "Assignments",
    description: "Rules for checking assets out to employees and back in.",
    icon: ClipboardList,
    groups: [
      {
        title: "Numbering",
        fields: [
          {
            key: "auto_generate_assignment_number",
            label: "Auto Generate Assignment Number",
            type: "toggle",
          },
          { key: "assignment_number_prefix", label: "Assignment Number Prefix", type: "text", required: true },
        ],
      },
      {
        title: "Workflow",
        fields: [
          {
            key: "require_employee_acknowledgement",
            label: "Require Employee Acknowledgement",
            description: "Employees confirm receipt of assigned assets.",
            type: "toggle",
          },
          {
            key: "require_return_confirmation",
            label: "Require Return Confirmation",
            description: "Returns are confirmed with a condition check.",
            type: "toggle",
          },
          {
            key: "allow_multiple_assets_per_assignment",
            label: "Allow Multiple Assets Per Assignment",
            type: "toggle",
          },
          {
            key: "allow_reassignment",
            label: "Allow Reassignment",
            description: "Move an assigned asset directly to another employee.",
            type: "toggle",
          },
          { key: "require_assignment_notes", label: "Require Assignment Notes", type: "toggle" },
        ],
      },
    ],
  },
  {
    key: "maintenance",
    label: "Maintenance",
    title: "Maintenance",
    description: "Scheduling behaviour and reminders for maintenance work.",
    icon: CalendarClock,
    groups: [
      {
        title: "Scheduling",
        fields: [
          { key: "default_maintenance_status", label: "Default Maintenance Status", type: "select" },
          {
            key: "allow_preventive_maintenance",
            label: "Allow Preventive Maintenance",
            type: "toggle",
          },
          {
            key: "allow_maintenance_scheduling",
            label: "Allow Maintenance Scheduling",
            description: "Plan maintenance for a future date.",
            type: "toggle",
          },
        ],
      },
      {
        title: "Reminders",
        fields: [
          {
            key: "maintenance_reminder_enabled",
            label: "Maintenance Reminder Enabled",
            type: "toggle",
          },
          {
            key: "maintenance_reminder_days",
            label: "Reminder Before Due Date",
            type: "number",
            unit: "days before due date",
            min: 0,
            max: 365,
            dependsOn: "maintenance_reminder_enabled",
          },
          {
            key: "send_maintenance_email",
            label: "Send Maintenance Email",
            description: "Email the reminder in addition to the in-app notification.",
            type: "toggle",
            dependsOn: "maintenance_reminder_enabled",
          },
          {
            key: "maintenance_notification_days",
            label: "Maintenance Notification Days",
            description: "How far ahead upcoming maintenance appears in notifications.",
            type: "number",
            unit: "days",
            min: 0,
            max: 365,
          },
        ],
      },
    ],
  },
  {
    key: "repairs",
    label: "Repairs",
    title: "Repairs",
    description: "Numbering, required details and completion notifications for repair jobs.",
    icon: Wrench,
    groups: [
      {
        title: "Numbering & Defaults",
        fields: [
          { key: "auto_generate_repair_number", label: "Auto Generate Repair Number", type: "toggle" },
          {
            key: "repair_number_prefix",
            label: "Repair Number Prefix",
            description: "e.g. REP → REP-001.",
            type: "text",
            required: true,
          },
          { key: "default_repair_status", label: "Default Repair Status", type: "select" },
        ],
      },
      {
        title: "Required Details",
        fields: [
          { key: "require_repair_cost", label: "Require Repair Cost", type: "toggle" },
          { key: "require_repair_description", label: "Require Repair Description", type: "toggle" },
        ],
      },
      {
        title: "Completion",
        fields: [
          {
            key: "notify_employee_on_repair_completion",
            label: "Notify Employee On Repair Completion",
            type: "toggle",
          },
          {
            key: "notify_admin_on_repair_completion",
            label: "Notify Admin On Repair Completion",
            type: "toggle",
          },
        ],
      },
    ],
  },
  {
    key: "notifications",
    label: "Notifications",
    title: "Notifications",
    description: "Choose which events send email and in-app notifications.",
    icon: Bell,
    groups: [
      {
        title: "Email Notifications",
        fields: [
          { key: "email_notifications_enabled", label: "Enable Email Notifications", type: "toggle" },
          { key: "email_notify_assignment", label: "Assignment Notification", type: "toggle", dependsOn: "email_notifications_enabled" },
          { key: "email_notify_return", label: "Return Notification", type: "toggle", dependsOn: "email_notifications_enabled" },
          { key: "email_notify_maintenance", label: "Maintenance Notification", type: "toggle", dependsOn: "email_notifications_enabled" },
          { key: "email_notify_repair", label: "Repair Notification", type: "toggle", dependsOn: "email_notifications_enabled" },
          { key: "email_notify_purchase_order", label: "Purchase Order Notification", type: "toggle", dependsOn: "email_notifications_enabled" },
          { key: "email_notify_account", label: "Account Notification", type: "toggle", dependsOn: "email_notifications_enabled" },
          { key: "email_notify_audit", label: "Audit Notification", type: "toggle", dependsOn: "email_notifications_enabled" },
        ],
      },
      {
        title: "In-App Notifications",
        fields: [
          { key: "inapp_notifications_enabled", label: "Enable In-App Notifications", type: "toggle" },
          { key: "inapp_notify_assignment", label: "Assignment Notifications", type: "toggle", dependsOn: "inapp_notifications_enabled" },
          { key: "inapp_notify_maintenance", label: "Maintenance Notifications", type: "toggle", dependsOn: "inapp_notifications_enabled" },
          { key: "inapp_notify_repair", label: "Repair Notifications", type: "toggle", dependsOn: "inapp_notifications_enabled" },
          { key: "inapp_notify_purchase_order", label: "Purchase Order Notifications", type: "toggle", dependsOn: "inapp_notifications_enabled" },
        ],
      },
    ],
  },
  {
    key: "security",
    label: "Security",
    title: "Security",
    description:
      "Session, login and password policy. Secrets such as SECRET_KEY, JWT keys and SMTP passwords are deployment configuration and are never stored here.",
    icon: ShieldCheck,
    groups: [
      {
        title: "Sessions & Login",
        fields: [
          { key: "session_timeout_minutes", label: "Session Timeout", type: "number", unit: "minutes", min: 1, max: 1440 },
          { key: "max_login_attempts", label: "Maximum Login Attempts", type: "number", unit: "attempts", min: 1, max: 20 },
          { key: "account_lockout_minutes", label: "Account Lockout Duration", type: "number", unit: "minutes", min: 1, max: 1440 },
        ],
      },
      {
        title: "Password Policy",
        fields: [
          { key: "minimum_password_length", label: "Minimum Password Length", type: "number", unit: "characters", min: 6, max: 128 },
          {
            key: "password_expiry_days",
            label: "Password Expiry",
            description: "0 = passwords never expire.",
            type: "number",
            unit: "days",
            min: 0,
            max: 3650,
          },
          { key: "password_require_uppercase", label: "Require Uppercase", type: "toggle" },
          { key: "password_require_lowercase", label: "Require Lowercase", type: "toggle" },
          { key: "password_require_number", label: "Require Number", type: "toggle" },
          { key: "password_require_special", label: "Require Special Character", type: "toggle" },
        ],
      },
      {
        title: "One-Time Passwords",
        fields: [
          { key: "otp_expiry_minutes", label: "OTP Expiry", type: "number", unit: "minutes", min: 1, max: 60 },
          { key: "otp_resend_interval_seconds", label: "OTP Resend Interval", type: "number", unit: "seconds", min: 15, max: 3600 },
        ],
      },
    ],
  },
  {
    key: "email",
    label: "Email",
    title: "Email",
    description:
      "Outgoing email identity and delivery status. SMTP credentials are read from the server .env file and cannot be viewed or changed here.",
    icon: Mail,
    groups: [
      {
        title: "Sender",
        fields: [
          { key: "email_notifications_enabled", label: "Email Notifications Enabled", type: "toggle" },
          { key: "email_sender_name", label: "Sender Name", type: "text", placeholder: "AssetFlow" },
          {
            key: "email_sender_email",
            label: "Sender Email",
            description: "Leave blank to send from the SMTP account. Gmail only honours addresses verified as aliases.",
            type: "email",
          },
        ],
      },
    ],
  },
  {
    key: "reports",
    label: "Reports",
    title: "Reports",
    description: "Defaults applied when generating and exporting reports.",
    icon: FileBarChart,
    groups: [
      {
        title: "Defaults",
        fields: [
          { key: "default_report_format", label: "Default Report Format", type: "select" },
          { key: "default_report_date_range", label: "Default Date Range", type: "select" },
        ],
      },
      {
        title: "Report Contents",
        fields: [
          { key: "report_include_logo", label: "Include Organization Logo", type: "toggle" },
          { key: "report_include_generated_date", label: "Include Generated Date", type: "toggle" },
          { key: "report_include_generated_by", label: "Include Generated By", type: "toggle" },
          { key: "report_include_asset_details", label: "Include Asset Details", type: "toggle" },
          {
            key: "report_include_financial_info",
            label: "Include Financial Information",
            description: "Cost and current value columns. Consider who receives exported reports.",
            type: "toggle",
          },
        ],
      },
    ],
  },
  {
    key: "audit-logs",
    label: "Audit Logs",
    title: "Audit Logs",
    description:
      "Choose which events are recorded. Existing audit history is read-only and cannot be edited or deleted from Settings.",
    icon: ListChecks,
    groups: [
      {
        title: "Tracking",
        fields: [
          { key: "audit_logging_enabled", label: "Enable Audit Logging", type: "toggle" },
          { key: "audit_track_create", label: "Track Create", type: "toggle", dependsOn: "audit_logging_enabled" },
          { key: "audit_track_update", label: "Track Update", type: "toggle", dependsOn: "audit_logging_enabled" },
          { key: "audit_track_delete", label: "Track Delete", type: "toggle", dependsOn: "audit_logging_enabled" },
          { key: "audit_track_login", label: "Track Login", type: "toggle", dependsOn: "audit_logging_enabled" },
          { key: "audit_track_logout", label: "Track Logout", type: "toggle", dependsOn: "audit_logging_enabled" },
          { key: "audit_track_permission_changes", label: "Track Permission Changes", type: "toggle", dependsOn: "audit_logging_enabled" },
        ],
      },
      {
        title: "Retention",
        fields: [
          {
            key: "audit_retention_days",
            label: "Retention Period",
            description: "Retention policy for audit records. 0 = keep forever.",
            type: "number",
            unit: "days",
            min: 0,
            max: 3650,
          },
        ],
      },
    ],
  },
  {
    key: "system",
    label: "System",
    title: "System",
    description: "Application identity, language and maintenance mode.",
    icon: Server,
    groups: [
      {
        title: "Application",
        fields: [
          { key: "system_name", label: "System Name", type: "text", required: true },
          { key: "default_language", label: "Default Language", type: "select" },
        ],
      },
      {
        title: "Maintenance Mode",
        fields: [
          {
            key: "maintenance_mode",
            label: "Maintenance Mode",
            description: "Show a maintenance notice to users while work is in progress.",
            type: "toggle",
          },
          { key: "maintenance_message", label: "Maintenance Message", type: "textarea" },
        ],
      },
    ],
  },
];

/** Section that owns a field (first match — a few toggles appear in two sections). */
export function sectionForField(key: string): SectionKey | undefined {
  return SECTIONS.find((s) => s.groups.some((g) => g.fields.some((f) => f.key === key)))?.key;
}

export const SECURITY_FIELDS = new Set(
  SECTIONS.find((s) => s.key === "security")!.groups.flatMap((g) => g.fields.map((f) => f.key)),
);

/** Integer fields, so edited string input can be converted back before saving. */
export const NUMBER_FIELDS = new Set(
  SECTIONS.flatMap((s) => s.groups.flatMap((g) => g.fields)).filter((f) => f.type === "number").map((f) => f.key),
);
