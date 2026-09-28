"use client";

import { FileSpreadsheet, Printer } from "lucide-react";
import type { ReportAsset } from "@/components/reports/api";
import { assetsToCSV } from "@/components/reports/data";
import { toDateOnly } from "@/lib/dates";

/**
 * Export PDF — unchanged: still calls window.print().
 * Export CSV  — now receives ReportAsset[] from the API instead of the old
 *               mock Asset[] from generateAssets(), so the download always
 *               reflects real persisted data.
 */
function downloadCSV(assets: ReportAsset[]) {
  const csv = assetsToCSV(assets);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `assetflow-report-${toDateOnly(new Date())}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function ExportButtons({ assets }: { assets: ReportAsset[] }) {
  return (
    <div className="flex shrink-0 items-center gap-2 print:hidden">
      <button
        type="button"
        onClick={() => window.print()}
        className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
      >
        <Printer className="h-4 w-4" />
        Export PDF
      </button>
      <button
        type="button"
        onClick={() => downloadCSV(assets)}
        className="flex items-center gap-2 rounded-lg bg-blue-600 px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
      >
        <FileSpreadsheet className="h-4 w-4" />
        Export CSV
      </button>
    </div>
  );
}
