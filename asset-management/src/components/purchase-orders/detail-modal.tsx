"use client";

import { Fragment, useState } from "react";
import { AlertTriangle, Building2, Calendar, FileText, IndianRupee, PackageX, Printer, Trash2, User, X } from "lucide-react";
import { useCan } from "@/components/auth/context";
import {
  PO_STATUS_FLOW,
  PO_STATUS_META,
  itemsSubtotal,
  nextStatus,
  totalUnits,
  totalValue,
  type PurchaseOrder,
} from "@/components/purchase-orders/data";
import { PurchaseOrderBillModal } from "@/components/purchase-orders/bill-modal";
import { printBill } from "@/components/purchase-orders/bill-html";
import { formatDate } from "@/components/assets/data";
import { cn } from "@/lib/utils";

export function PurchaseOrderDetailModal({
  order,
  onClose,
  onAdvance,
  onCancel,
  onDelete,
}: {
  order: PurchaseOrder;
  onClose: () => void;
  onAdvance: (id: number, status: PurchaseOrder["status"]) => void;
  onCancel: (id: number) => void;
  onDelete?: (id: number) => void;
}) {
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [confirmingAdvance, setConfirmingAdvance] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [billOpen, setBillOpen] = useState(false);
  const canChange = useCan("operations.change_purchaseorder");
  const meta = PO_STATUS_META[order.status];
  const StatusIcon = meta.icon;
  const upcoming = nextStatus(order.status);
  const flowIndex = PO_STATUS_FLOW.indexOf(order.status);
  const value = totalValue(order);
  const subtotal = itemsSubtotal(order);
  const units = totalUnits(order);

  return (
    <>
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-slate-900/40 p-4">
      <button aria-label="Close" className="absolute inset-0 cursor-default" onClick={onClose} />
      <div className="relative flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl dark:bg-slate-900">
        <div className="shrink-0 border-b border-slate-100 p-6 dark:border-slate-800">
          <div className="flex items-start justify-between">
            <div>
              <p className="font-mono text-sm font-semibold text-blue-600 dark:text-blue-400">{order.poNumber}</p>
              <h2 className="mt-1 text-xl font-bold text-slate-900 dark:text-white">{order.vendor}</h2>
              {order.vendorEmail && (
                <p className="text-sm text-slate-400 dark:text-slate-500">{order.vendorEmail}</p>
              )}
              <span className={cn("mt-2 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold", meta.chip)}>
                <StatusIcon className="h-3.5 w-3.5" />
                {order.status}
              </span>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              {onDelete && (
                <button
                  type="button"
                  onClick={() => setConfirmingDelete(true)}
                  title="Delete purchase order"
                  aria-label="Delete purchase order"
                  className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 transition hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10 dark:hover:text-red-400"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="h-4.5 w-4.5" />
              </button>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-xl border border-slate-100 p-3 text-center dark:border-slate-800">
              <p className="text-lg font-bold text-slate-900 dark:text-white">{order.items.length}</p>
              <p className="text-xs text-slate-400 dark:text-slate-500">Line Items</p>
            </div>
            <div className="rounded-xl border border-slate-100 p-3 text-center dark:border-slate-800">
              <p className="text-lg font-bold text-slate-900 dark:text-white">{units}</p>
              <p className="text-xs text-slate-400 dark:text-slate-500">Total Units</p>
            </div>
            <div className="col-span-2 rounded-xl border border-slate-100 p-3 text-center dark:border-slate-800 sm:col-span-2">
              <p className="text-lg font-bold text-slate-900 dark:text-white">₹{value.toLocaleString("en-IN")}</p>
              <p className="text-xs text-slate-400 dark:text-slate-500">Order Value</p>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          <div className="space-y-6">
            {order.status !== "Cancelled" ? (
              <div>
                <div className="flex items-start">
                  {PO_STATUS_FLOW.map((step, i) => {
                    const StepIcon = PO_STATUS_META[step].icon;
                    const reached = i <= flowIndex;
                    return (
                      <Fragment key={step}>
                        {i > 0 && (
                          <div className="flex h-8 flex-1 items-center px-1.5">
                            <span
                              className={cn(
                                "h-0.5 w-full",
                                reached ? "bg-blue-500" : "bg-slate-200 dark:bg-slate-800"
                              )}
                            />
                          </div>
                        )}
                        <div className="flex shrink-0 flex-col items-center">
                          <span
                            className={cn(
                              "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2",
                              reached
                                ? "border-blue-500 bg-blue-500 text-white"
                                : "border-slate-200 bg-white text-slate-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-600"
                            )}
                          >
                            <StepIcon className="h-4 w-4" />
                          </span>
                          <p
                            className={cn(
                              "mt-2 max-w-[70px] text-center text-[10px] font-medium leading-tight",
                              reached ? "text-slate-700 dark:text-slate-200" : "text-slate-400 dark:text-slate-600"
                            )}
                          >
                            {step}
                          </p>
                        </div>
                      </Fragment>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3 rounded-xl border border-red-100 bg-red-50 p-4 text-sm text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400">
                <PackageX className="h-5 w-5 shrink-0" />
                This purchase order was cancelled.
              </div>
            )}

            <div className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
              <div>
                <p className="flex items-center gap-1.5 text-xs text-slate-400 dark:text-slate-500">
                  <User className="h-3.5 w-3.5" />
                  Requested By
                </p>
                <p className="mt-1 font-medium text-slate-800 dark:text-slate-100">{order.requestedBy}</p>
              </div>
              <div>
                <p className="flex items-center gap-1.5 text-xs text-slate-400 dark:text-slate-500">
                  <Building2 className="h-3.5 w-3.5" />
                  Department
                </p>
                <p className="mt-1 font-medium text-slate-800 dark:text-slate-100">{order.department}</p>
              </div>
              <div>
                <p className="flex items-center gap-1.5 text-xs text-slate-400 dark:text-slate-500">
                  <Calendar className="h-3.5 w-3.5" />
                  Order Date
                </p>
                <p className="mt-1 font-medium text-slate-800 dark:text-slate-100">{formatDate(order.orderDate)}</p>
              </div>
              <div>
                <p className="flex items-center gap-1.5 text-xs text-slate-400 dark:text-slate-500">
                  <Calendar className="h-3.5 w-3.5" />
                  {order.receivedDate ? "Received Date" : "Expected Date"}
                </p>
                <p className="mt-1 font-medium text-slate-800 dark:text-slate-100">
                  {formatDate(order.receivedDate ?? order.expectedDate)}
                </p>
              </div>
            </div>

            <div>
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                <IndianRupee className="h-3.5 w-3.5" />
                Line Items
              </div>
              <div className="mt-3 overflow-hidden rounded-xl border border-slate-100 dark:border-slate-800">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-400 dark:border-slate-800 dark:bg-slate-800/40 dark:text-slate-500">
                      <th className="px-3 py-2 font-semibold">Item</th>
                      <th className="px-3 py-2 text-center font-semibold">Qty</th>
                      <th className="px-3 py-2 text-right font-semibold">Unit Cost</th>
                      <th className="px-3 py-2 text-right font-semibold">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {order.items.map((item, i) => (
                      <tr key={`${item.name}-${i}`} className="border-b border-slate-50 last:border-0 dark:border-slate-800/60">
                        <td className="px-3 py-2.5">
                          <p className="font-medium text-slate-800 dark:text-slate-100">{item.name}</p>
                          <p className="text-xs text-slate-400 dark:text-slate-500">{item.category}</p>
                        </td>
                        <td className="px-3 py-2.5 text-center text-slate-600 dark:text-slate-300">{item.quantity}</td>
                        <td className="px-3 py-2.5 text-right text-slate-600 dark:text-slate-300">
                          ₹{item.unitCost.toLocaleString("en-IN")}
                        </td>
                        <td className="px-3 py-2.5 text-right font-semibold text-slate-800 dark:text-slate-100">
                          ₹{(item.quantity * item.unitCost).toLocaleString("en-IN")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    {order.tax ? (
                      <>
                        <tr>
                          <td colSpan={3} className="px-3 py-2 text-right text-sm text-slate-500 dark:text-slate-400">
                            Subtotal
                          </td>
                          <td className="px-3 py-2 text-right text-sm font-medium text-slate-700 dark:text-slate-200">
                            ₹{subtotal.toLocaleString("en-IN")}
                          </td>
                        </tr>
                        <tr>
                          <td colSpan={3} className="px-3 py-2 text-right text-sm text-slate-500 dark:text-slate-400">
                            GST{order.gstRate ? ` (${order.gstRate}%)` : ""}
                          </td>
                          <td className="px-3 py-2 text-right text-sm font-medium text-slate-700 dark:text-slate-200">
                            ₹{order.tax.toLocaleString("en-IN")}
                          </td>
                        </tr>
                      </>
                    ) : null}
                    <tr>
                      <td colSpan={3} className="px-3 py-2.5 text-right text-sm font-semibold text-slate-500 dark:text-slate-400">
                        Total
                      </td>
                      <td className="px-3 py-2.5 text-right text-sm font-bold text-slate-900 dark:text-white">
                        ₹{value.toLocaleString("en-IN")}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            {order.notes && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">Notes</p>
                <p className="mt-2 rounded-xl border border-slate-100 p-3 text-sm text-slate-600 dark:border-slate-800 dark:text-slate-300">
                  {order.notes}
                </p>
              </div>
            )}
          </div>
        </div>

        {canChange && order.status !== "Received" && order.status !== "Cancelled" && (
          <div className="flex shrink-0 justify-end gap-2 border-t border-slate-100 p-4 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setConfirmingCancel(true)}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-red-600 transition hover:bg-red-50 dark:border-slate-800 dark:hover:bg-red-500/10"
            >
              Cancel Order
            </button>
            {upcoming && (
              <button
                type="button"
                onClick={() => setConfirmingAdvance(true)}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
              >
                Mark as {upcoming}
              </button>
            )}
          </div>
        )}

        {order.status === "Received" && (
          <div className="flex shrink-0 justify-end gap-2 border-t border-slate-100 p-4 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setBillOpen(true)}
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <FileText className="h-4 w-4" />
              View Bill
            </button>
            <button
              type="button"
              onClick={() => printBill(order)}
              className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
            >
              <Printer className="h-4 w-4" />
              Print Bill
            </button>
          </div>
        )}
      </div>

      {confirmingCancel && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 p-4">
          <button
            aria-label="Close"
            className="absolute inset-0 cursor-default"
            onClick={() => setConfirmingCancel(false)}
          />
          <div className="relative w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl dark:bg-slate-900">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400">
                <AlertTriangle className="h-5 w-5" />
              </span>
              <div>
                <h3 className="text-base font-semibold text-slate-900 dark:text-white">Cancel this order?</h3>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  {order.poNumber} for {order.vendor} will be marked as cancelled. This action cannot be undone.
                </p>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmingCancel(false)}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Keep Order
              </button>
              <button
                type="button"
                onClick={() => {
                  onCancel(order.id);
                  setConfirmingCancel(false);
                }}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-red-700"
              >
                Confirm Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmingDelete && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 p-4">
          <button
            aria-label="Close"
            className="absolute inset-0 cursor-default"
            onClick={() => setConfirmingDelete(false)}
          />
          <div className="relative w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl dark:bg-slate-900">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400">
                <AlertTriangle className="h-5 w-5" />
              </span>
              <div>
                <h3 className="text-base font-semibold text-slate-900 dark:text-white">Delete this purchase order?</h3>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  {order.poNumber} for {order.vendor} will be permanently deleted. This action cannot be undone.
                </p>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmingDelete(false)}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Keep Order
              </button>
              <button
                type="button"
                onClick={() => {
                  onDelete?.(order.id);
                  setConfirmingDelete(false);
                }}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-red-700"
              >
                Confirm Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmingAdvance && upcoming && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 p-4">
          <button
            aria-label="Close"
            className="absolute inset-0 cursor-default"
            onClick={() => setConfirmingAdvance(false)}
          />
          <div className="relative w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl dark:bg-slate-900">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400">
                {(() => {
                  const UpcomingIcon = PO_STATUS_META[upcoming].icon;
                  return <UpcomingIcon className="h-5 w-5" />;
                })()}
              </span>
              <div>
                <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                  Mark as {upcoming}?
                </h3>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  {order.poNumber} for {order.vendor} will move from {order.status} to {upcoming}.
                </p>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmingAdvance(false)}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  onAdvance(order.id, upcoming);
                  setConfirmingAdvance(false);
                }}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>

    {billOpen && <PurchaseOrderBillModal order={order} onClose={() => setBillOpen(false)} />}
    </>
  );
}
