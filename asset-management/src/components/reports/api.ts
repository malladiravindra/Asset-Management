/**
 * Reports API client — the single place that knows how to talk to the
 * Django /api/reports/ endpoints.  All functions use the shared api.ts
 * helper so JWT auth, token refresh, and error handling are automatic.
 *
 * Field names in the TypeScript types EXACTLY match the JSON keys the
 * Django ReportAssetSerializer / ReportSummaryAPIView produce.
 */
import { apiGet } from "@/lib/api";

// ─── shared API base ─────────────────────────────────────────────────────────

const REPORTS_BASE = "/reports";
const ASSETS_BASE  = `${REPORTS_BASE}/assets`;

// ─── API response types ───────────────────────────────────────────────────────

/** One bucket in the trailing-12-month acquisition trend. */
export interface MonthlyBucket {
  label: string;   // e.g. "Jan"
  year:  number;
  month: number;   // 1-based
  value: number;   // count of assets purchased that month
}

/** One row in a breakdown list (status / department / warranty / condition). */
export interface BreakdownItem {
  label: string;
  count: number;
}

/** Category breakdown row — has extra financial fields. */
export interface CategoryBreakdownItem {
  label: string;
  count: number;
  value: number;   // SUM(current_value)
  cost:  number;   // SUM(cost)
}

/** Full payload returned by GET /api/reports/. */
export interface ReportData {
  // KPIs
  totalAssets:       number;
  utilizationRate:   number;
  totalValue:        number;
  totalCost:         number;
  depreciationPct:   number;
  avgAgeLabel:       string;
  warrantyAttention: number;

  // Breakdowns
  statusBreakdown:     BreakdownItem[];
  departmentBreakdown: BreakdownItem[];
  categoryBreakdown:   CategoryBreakdownItem[];
  warrantyBreakdown:   BreakdownItem[];
  conditionBreakdown:  BreakdownItem[];

  // Acquisition trend
  monthlyAcquisitions: MonthlyBucket[];
  totalAcquired:       number;
}

/** Asset record returned by /api/reports/assets/. Matches the CSV contract. */
export interface ReportAsset {
  id:           number;
  tag:          string;          // asset_code on the backend
  name:         string;
  category:     string;
  department:   string;
  status:       string;
  condition:    string;
  location:     string;
  assignedTo:   string | null;   // assigned_to.name on the backend
  cost:         string | number;
  currentValue: string | number; // current_value on the backend
  purchaseDate: string | null;   // purchase_date on the backend (ISO date)
  warranty:     string;          // warranty_status on the backend
}

// ─── fetchers ─────────────────────────────────────────────────────────────────

/** GET /api/reports/ → full reports payload. */
export function fetchReportData(): Promise<ReportData> {
  return apiGet<ReportData>(`${REPORTS_BASE}/`);
}

/** GET /api/reports/assets/ → all assets (for CSV export). */
export function fetchReportAssets(): Promise<ReportAsset[]> {
  return apiGet<ReportAsset[]>(`${ASSETS_BASE}/`);
}
