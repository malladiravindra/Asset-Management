"use client";

import { Printer, X } from "lucide-react";
import { itemsSubtotal, totalValue, type PurchaseOrder } from "@/components/purchase-orders/data";
import { printBill } from "@/components/purchase-orders/bill-html";
import { formatDate } from "@/components/assets/data";

export function PurchaseOrderBillModal({ order, onClose }: { order: PurchaseOrder; onClose: () => void }) {
  const subtotal = itemsSubtotal(order);
  const total = totalValue(order);
  const receivedDate = order.receivedDate ? formatDate(order.receivedDate) : "—";

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 p-4">
      <button aria-label="Close" className="absolute inset-0 cursor-default" onClick={onClose} />
      <div className="relative flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl dark:bg-slate-900">
        <div className="flex shrink-0 items-center justify-end gap-2 border-b border-slate-100 p-4 dark:border-slate-800">
          <button
            type="button"
            onClick={() => printBill(order)}
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <Printer className="h-3.5 w-3.5" />
            Print
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="divide-y divide-slate-100 px-8 text-slate-900 dark:divide-slate-800 dark:text-slate-100">
            <div className="py-6 text-center">
              <p className="text-2xl font-bold">{order.vendorCompanyName || order.vendor}</p>
              <p className="mt-1 text-xs font-semibold uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">
                Purchase Bill
              </p>
              <div className="mt-4 flex items-center justify-center gap-8 text-sm">
                <p>
                  <span className="text-slate-400 dark:text-slate-500">PO Number: </span>
                  <span className="font-mono font-semibold">{order.poNumber}</span>
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-6 py-5 text-sm">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                  Vendor Information
                </p>
                <div className="mt-2 space-y-1">
                  <p>
                    <span className="text-slate-400 dark:text-slate-500">Vendor Name: </span>
                    {order.vendor}
                  </p>
                  <p>
                    <span className="text-slate-400 dark:text-slate-500">Email: </span>
                    {order.vendorEmail || "—"}
                  </p>
                  <p>
                    <span className="text-slate-400 dark:text-slate-500">Phone: </span>
                    {order.vendorPhone || "—"}
                  </p>
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                  Purchase Information
                </p>
                <div className="mt-2 space-y-1">
                  <p>
                    <span className="text-slate-400 dark:text-slate-500">Order Date: </span>
                    {formatDate(order.orderDate)}
                  </p>
                  <p>
                    <span className="text-slate-400 dark:text-slate-500">Expected Date: </span>
                    {formatDate(order.expectedDate)}
                  </p>
                  <p>
                    <span className="text-slate-400 dark:text-slate-500">Received Date: </span>
                    {receivedDate}
                  </p>
                  <p>
                    <span className="text-slate-400 dark:text-slate-500">Received Date: </span>
                    {receivedDate}
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-6 py-5 text-sm">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                  Billed To
                </p>
                <p className="mt-2 font-medium">{order.department}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                  Requested By
                </p>
                <p className="mt-2 font-medium">{order.requestedBy}</p>
              </div>
            </div>

            <div className="py-5">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">Items</p>
              <table className="mt-3 w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wider text-slate-400 dark:border-slate-800 dark:text-slate-500">
                    <th className="py-2 pr-3 font-semibold">Item</th>
                    <th className="px-3 py-2 font-semibold">Category</th>
                    <th className="px-3 py-2 text-center font-semibold">Qty</th>
                    <th className="px-3 py-2 text-right font-semibold">Unit Cost</th>
                    <th className="py-2 pl-3 text-right font-semibold">Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  {order.items.map((item, i) => (
                    <tr key={`${item.name}-${i}`} className="border-b border-slate-50 last:border-0 dark:border-slate-800/60">
                      <td className="py-2.5 pr-3 font-medium">{item.name}</td>
                      <td className="px-3 py-2.5 text-slate-500 dark:text-slate-400">{item.category}</td>
                      <td className="px-3 py-2.5 text-center">{item.quantity}</td>
                      <td className="px-3 py-2.5 text-right">₹{item.unitCost.toLocaleString("en-IN")}</td>
                      <td className="py-2.5 pl-3 text-right font-semibold">
                        ₹{(item.quantity * item.unitCost).toLocaleString("en-IN")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="py-5">
              <div className="ml-auto max-w-xs space-y-1.5 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400 dark:text-slate-500">Subtotal</span>
                  <span className="font-medium">₹{subtotal.toLocaleString("en-IN")}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400 dark:text-slate-500">GST{order.gstRate ? ` (${order.gstRate}%)` : ""}</span>
                  <span className="font-medium">₹{(order.tax ?? 0).toLocaleString("en-IN")}</span>
                </div>
                <div className="flex items-center justify-between border-t border-slate-100 pt-1.5 text-base font-bold dark:border-slate-800">
                  <span>Total</span>
                  <span>₹{total.toLocaleString("en-IN")}</span>
                </div>
              </div>
            </div>

            {order.notes && (
              <div className="py-5">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">Notes</p>
                <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{order.notes}</p>
              </div>
            )}

            <div className="py-6 text-center">
              <button
                type="button"
                onClick={() => printBill(order)}
                className="rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
              >
                Print Bill
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
