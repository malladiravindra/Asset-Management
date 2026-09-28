import { itemsSubtotal, totalValue, type PurchaseOrder } from "@/components/purchase-orders/data";
import { formatDate } from "@/components/assets/data";

function esc(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function inr(n: number) {
  return `₹${n.toLocaleString("en-IN")}`;
}

export function buildBillHtml(order: PurchaseOrder): string {
  const subtotal = itemsSubtotal(order);
  const total = totalValue(order);
  const receivedDate = order.receivedDate ? formatDate(order.receivedDate) : "—";

  const itemRows = order.items
    .map(
      (item) => `
        <tr>
          <td class="item-name">${esc(item.name)}</td>
          <td class="muted">${esc(item.category)}</td>
          <td class="center">${item.quantity}</td>
          <td class="right">${inr(item.unitCost)}</td>
          <td class="right strong">${inr(item.quantity * item.unitCost)}</td>
        </tr>`
    )
    .join("");

  const notesBlock = order.notes
    ? `
      <div class="section">
        <p class="label">Notes</p>
        <p class="notes">${esc(order.notes)}</p>
      </div>`
    : "";

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>${esc(order.poNumber)} — Bill</title>
<style>
  @page { size: A4; margin: 14mm; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
    color: #0f172a;
    font-size: 13px;
  }
  .section { padding: 18px 0; border-bottom: 1px solid #e2e8f0; }
  .section:last-child { border-bottom: none; }
  .header { text-align: center; }
  .brand { font-size: 22px; font-weight: 700; }
  .tagline { margin-top: 4px; color: #94a3b8; font-size: 11px; font-weight: 600; letter-spacing: 0.15em; text-transform: uppercase; }
  .doc-numbers { margin-top: 14px; display: flex; justify-content: center; gap: 32px; font-size: 13px; }
  .doc-numbers .value { font-family: monospace; font-weight: 600; }
  .grid-2 { display: flex; gap: 24px; }
  .grid-2 > div { flex: 1; }
  .label { color: #94a3b8; font-size: 10px; font-weight: 600; letter-spacing: 0.05em; text-transform: uppercase; margin: 0; }
  .field { margin: 6px 0 0; }
  .name { margin: 6px 0 0; font-size: 13px; font-weight: 600; }
  .muted { color: #64748b; }
  table { width: 100%; border-collapse: collapse; margin-top: 12px; }
  th { text-align: left; padding: 8px 10px 8px 0; font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; color: #64748b; border-bottom: 1px solid #e2e8f0; }
  td { padding: 9px 10px 9px 0; border-bottom: 1px solid #f1f5f9; font-size: 13px; }
  tr:last-child td { border-bottom: none; }
  .item-name { font-weight: 500; }
  .center { text-align: center; }
  .right { text-align: right; }
  .strong { font-weight: 600; }
  .totals { margin-left: auto; width: 260px; }
  .totals-row { display: flex; justify-content: space-between; padding: 4px 0; font-size: 13px; }
  .totals-row.total { border-top: 1px solid #e2e8f0; margin-top: 6px; padding-top: 10px; font-weight: 700; font-size: 15px; }
  .notes { margin-top: 6px; color: #475569; }
  .footer-note { text-align: center; color: #94a3b8; font-size: 11px; }
</style>
</head>
<body>
  <div class="section header">
    <div class="brand">${esc(order.vendorCompanyName || order.vendor)}</div>
    <div class="tagline">Purchase Bill</div>
    <div class="doc-numbers">
      <div><span class="muted">PO Number: </span><span class="value">${esc(order.poNumber)}</span></div>
    </div>
  </div>

  <div class="section grid-2">
    <div>
      <p class="label">Vendor Information</p>
      <p class="field"><span class="muted">Vendor Name: </span>${esc(order.vendor)}</p>
      <p class="field"><span class="muted">Email: </span>${esc(order.vendorEmail || "—")}</p>
      <p class="field"><span class="muted">Phone: </span>${esc(order.vendorPhone || "—")}</p>
    </div>
    <div>
      <p class="label">Purchase Information</p>
      <p class="field"><span class="muted">Order Date: </span>${formatDate(order.orderDate)}</p>
      <p class="field"><span class="muted">Expected Date: </span>${formatDate(order.expectedDate)}</p>
      <p class="field"><span class="muted">Received Date: </span>${receivedDate}</p>
      <p class="field"><span class="muted">Received Date: </span>${receivedDate}</p>
    </div>
  </div>

  <div class="section grid-2">
    <div>
      <p class="label">Billed To</p>
      <p class="name">${esc(order.department)}</p>
    </div>
    <div>
      <p class="label">Requested By</p>
      <p class="name">${esc(order.requestedBy)}</p>
    </div>
  </div>

  <div class="section">
    <p class="label">Items</p>
    <table>
      <thead>
        <tr>
          <th>Item</th>
          <th>Category</th>
          <th class="center">Qty</th>
          <th class="right">Unit Cost</th>
          <th class="right">Subtotal</th>
        </tr>
      </thead>
      <tbody>${itemRows}</tbody>
    </table>
  </div>

  <div class="section">
    <div class="totals">
      <div class="totals-row"><span class="muted">Subtotal</span><span>${inr(subtotal)}</span></div>
      <div class="totals-row"><span class="muted">GST${order.gstRate ? ` (${order.gstRate}%)` : ""}</span><span>${inr(order.tax ?? 0)}</span></div>
      <div class="totals-row total"><span>Total</span><span>${inr(total)}</span></div>
    </div>
  </div>

  ${notesBlock}

  <div class="section">
    <p class="footer-note">This is a system-generated bill and does not require a signature.</p>
  </div>
</body>
</html>`;
}

export function printBill(order: PurchaseOrder) {
  const win = window.open("", "_blank", "width=850,height=1000");
  if (!win) return;
  win.document.open();
  win.document.write(buildBillHtml(order));
  win.document.close();
  win.focus();
  const triggerPrint = () => win.print();
  if (win.document.readyState === "complete") {
    triggerPrint();
  } else {
    win.onload = triggerPrint;
    setTimeout(triggerPrint, 400);
  }
}
