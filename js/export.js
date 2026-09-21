/* ==========================================================================
   AUTOMATED GST & INVOICE VALIDATOR — EXPORT & STATUTORY REPORTING MODULE
   Author: Priyanshu Pandey (IQ4U8)
   ========================================================================== */

const AuditExport = (() => {

  /**
   * Generates and downloads a CSV audit report for bulk invoices
   * @param {Array<Object>} auditedResults
   */
  function exportAuditToCSV(auditedResults) {
    if (!Array.isArray(auditedResults) || auditedResults.length === 0) {
      alert("No audited invoice records available to export.");
      return;
    }

    const headers = [
      "Invoice Number",
      "Invoice Date",
      "Supplier Name",
      "Supplier GSTIN",
      "Recipient Name",
      "Recipient GSTIN",
      "Place of Supply",
      "Supply Type",
      "Taxable Value (INR)",
      "Declared CGST (INR)",
      "Declared SGST (INR)",
      "Declared IGST (INR)",
      "Declared Total GST (INR)",
      "Recalculated GST (INR)",
      "Declared Grand Total (INR)",
      "Statutory Rounded Total (INR)",
      "Variance / Drift (INR)",
      "Compliance Score (%)",
      "Audit Status",
      "Violations Count",
      "Violation Summary"
    ];

    const csvRows = [headers.join(",")];

    auditedResults.forEach(item => {
      const inv = item.invoice;
      const res = item.audit;
      const calc = res.calculated || {};

      const totalDeclaredTax = (Number(inv.cgst || 0) + Number(inv.sgst || 0) + Number(inv.igst || 0)).toFixed(2);
      const totalRecalcTax = (calc.totalComputedTax || 0).toFixed(2);
      const grandDiff = Math.abs((Number(inv.totalAmount || 0)) - (calc.standardRoundedTotal || 0)).toFixed(2);
      const violationSummary = res.violations.map(v => `[${v.severity}] ${v.title}`).join(" | ");

      const row = [
        `"${inv.invoiceNumber || ""}"`,
        `"${inv.invoiceDate || ""}"`,
        `"${(inv.supplierName || "").replace(/"/g, '""')}"`,
        `"${inv.supplierGstin || ""}"`,
        `"${(inv.recipientName || "").replace(/"/g, '""')}"`,
        `"${inv.recipientGstin || ""}"`,
        `"${inv.placeOfSupply || ""}"`,
        `"${calc.posEval ? calc.posEval.type : "UNKNOWN"}"`,
        (Number(inv.taxableAmount || 0)).toFixed(2),
        (Number(inv.cgst || 0)).toFixed(2),
        (Number(inv.sgst || 0)).toFixed(2),
        (Number(inv.igst || 0)).toFixed(2),
        totalDeclaredTax,
        totalRecalcTax,
        (Number(inv.totalAmount || 0)).toFixed(2),
        (calc.standardRoundedTotal || 0).toFixed(2),
        grandDiff,
        res.score,
        `"${res.status}"`,
        res.violations.length,
        `"${violationSummary.replace(/"/g, '""')}"`
      ];

      csvRows.push(row.join(","));
    });

    const csvString = "data:text/csv;charset=utf-8,\uFEFF" + encodeURIComponent(csvRows.join("\r\n"));
    const link = document.createElement("a");
    link.setAttribute("href", csvString);
    link.setAttribute("download", `GST_Audit_Report_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  /**
   * Generates a printable modal summary for the active single invoice
   * @param {Object} invoice
   * @param {Object} auditResult
   */
  function showPrintableSummary(invoice, auditResult) {
    const modalOverlay = document.getElementById("report-modal");
    const modalContent = document.getElementById("report-modal-body");
    if (!modalOverlay || !modalContent) return;

    const calc = auditResult.calculated || {};
    const pos = calc.posEval || {};

    const violationItemsHtml = auditResult.violations.length > 0
      ? auditResult.violations.map(v => `
          <div style="padding: 8px 12px; margin-bottom: 6px; background: ${v.severity === 'CRITICAL' ? '#fff1f2' : '#fffbeb'}; border-left: 4px solid ${v.severity === 'CRITICAL' ? '#f43f5e' : '#f59e0b'}; border-radius: 4px;">
            <div style="font-weight: 700; color: #0f172a; font-size: 0.85rem;">[${v.severity}] ${v.title}</div>
            <div style="font-size: 0.78rem; color: #475569; margin-top: 2px;">${v.desc}</div>
          </div>
        `).join("")
      : `<div style="padding: 10px; background: #ecfdf5; color: #065f46; border-radius: 6px; font-weight: 600; font-size: 0.85rem;">✓ All 10 GST Statutory Checks Cleared. Invoice is compliant for tax filing.</div>`;

    const html = `
      <div style="font-family: 'Inter', sans-serif; color: #0f172a; padding: 10px;">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #10b981; padding-bottom: 12px; margin-bottom: 16px;">
          <div>
            <h2 style="font-size: 1.25rem; font-weight: 800; color: #0f172a; margin: 0;">GST INVOICE AUDIT REPORT</h2>
            <div style="font-size: 0.85rem; color: #64748b; margin-top: 2px;">Verification Under CGST, SGST & IGST Acts and Rules</div>
          </div>
          <div style="text-align: right;">
            <span style="display: inline-block; padding: 4px 12px; border-radius: 9999px; font-weight: 800; font-size: 0.85rem; background: ${auditResult.status === 'PASS' ? '#ecfdf5' : '#fff1f2'}; color: ${auditResult.status === 'PASS' ? '#059669' : '#e11d48'}; border: 1px solid currentColor;">
              AUDIT STATUS: ${auditResult.status} (${auditResult.score}/100)
            </span>
            <div style="font-size: 0.78rem; color: #64748b; margin-top: 4px;">Verified: ${new Date().toLocaleDateString("en-IN")}</div>
          </div>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 16px; font-size: 0.82rem;">
          <div style="background: #f8fafc; padding: 12px; border-radius: 6px; border: 1px solid #e2e8f0;">
            <div style="font-weight: 700; color: #475569; margin-bottom: 4px; text-transform: uppercase;">Supplier Particulars</div>
            <div><strong>Entity:</strong> ${invoice.supplierName || "N/A"}</div>
            <div><strong>GSTIN:</strong> <code>${invoice.supplierGstin || "N/A"}</code></div>
            <div><strong>Origin State:</strong> Code ${invoice.supplierStateCode || (invoice.supplierGstin ? invoice.supplierGstin.substring(0,2) : "")}</div>
          </div>
          <div style="background: #f8fafc; padding: 12px; border-radius: 6px; border: 1px solid #e2e8f0;">
            <div style="font-weight: 700; color: #475569; margin-bottom: 4px; text-transform: uppercase;">Recipient & POS</div>
            <div><strong>Entity:</strong> ${invoice.recipientName || "Consumer (B2C)"}</div>
            <div><strong>GSTIN:</strong> <code>${invoice.recipientGstin || "Unregistered"}</code></div>
            <div><strong>Place of Supply:</strong> ${invoice.placeOfSupply || "N/A"}</div>
            <div><strong>Nature:</strong> <span style="font-weight: 600; color: #0891b2;">${pos.type || "N/A"}</span></div>
          </div>
        </div>

        <div style="margin-bottom: 16px;">
          <div style="font-weight: 700; font-size: 0.88rem; margin-bottom: 8px;">Financial & Tax Assessment:</div>
          <table style="width: 100%; border-collapse: collapse; font-size: 0.82rem; text-align: left;">
            <thead>
              <tr style="background: #f1f5f9; border-bottom: 1px solid #cbd5e1;">
                <th style="padding: 6px 10px;">Metric</th>
                <th style="padding: 6px 10px; text-align: right;">Declared on Invoice</th>
                <th style="padding: 6px 10px; text-align: right;">Verified Statutory Sum</th>
                <th style="padding: 6px 10px; text-align: right;">Status</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style="padding: 6px 10px; border-bottom: 1px solid #e2e8f0;">Taxable Amount</td>
                <td style="padding: 6px 10px; text-align: right; border-bottom: 1px solid #e2e8f0;">₹${Number(invoice.taxableAmount || 0).toFixed(2)}</td>
                <td style="padding: 6px 10px; text-align: right; border-bottom: 1px solid #e2e8f0;">₹${(calc.computedTaxableSum || 0).toFixed(2)}</td>
                <td style="padding: 6px 10px; text-align: right; border-bottom: 1px solid #e2e8f0;">${Math.abs((invoice.taxableAmount || 0) - (calc.computedTaxableSum || 0)) < 1 ? '✓ Match' : '⚠ Drift'}</td>
              </tr>
              <tr>
                <td style="padding: 6px 10px; border-bottom: 1px solid #e2e8f0;">CGST</td>
                <td style="padding: 6px 10px; text-align: right; border-bottom: 1px solid #e2e8f0;">₹${Number(invoice.cgst || 0).toFixed(2)}</td>
                <td style="padding: 6px 10px; text-align: right; border-bottom: 1px solid #e2e8f0;">₹${(calc.computedCgstSum || 0).toFixed(2)}</td>
                <td style="padding: 6px 10px; text-align: right; border-bottom: 1px solid #e2e8f0;">${Number(invoice.cgst || 0) === (calc.computedCgstSum || 0) ? '✓ Match' : '⚠ Error'}</td>
              </tr>
              <tr>
                <td style="padding: 6px 10px; border-bottom: 1px solid #e2e8f0;">SGST</td>
                <td style="padding: 6px 10px; text-align: right; border-bottom: 1px solid #e2e8f0;">₹${Number(invoice.sgst || 0).toFixed(2)}</td>
                <td style="padding: 6px 10px; text-align: right; border-bottom: 1px solid #e2e8f0;">₹${(calc.computedSgstSum || 0).toFixed(2)}</td>
                <td style="padding: 6px 10px; text-align: right; border-bottom: 1px solid #e2e8f0;">${Number(invoice.sgst || 0) === (calc.computedSgstSum || 0) ? '✓ Match' : '⚠ Error'}</td>
              </tr>
              <tr>
                <td style="padding: 6px 10px; border-bottom: 1px solid #e2e8f0;">IGST</td>
                <td style="padding: 6px 10px; text-align: right; border-bottom: 1px solid #e2e8f0;">₹${Number(invoice.igst || 0).toFixed(2)}</td>
                <td style="padding: 6px 10px; text-align: right; border-bottom: 1px solid #e2e8f0;">₹${(calc.computedIgstSum || 0).toFixed(2)}</td>
                <td style="padding: 6px 10px; text-align: right; border-bottom: 1px solid #e2e8f0;">${Number(invoice.igst || 0) === (calc.computedIgstSum || 0) ? '✓ Match' : '⚠ Error'}</td>
              </tr>
              <tr style="font-weight: 800; background: #f8fafc;">
                <td style="padding: 8px 10px;">Grand Total</td>
                <td style="padding: 8px 10px; text-align: right;">₹${Number(invoice.totalAmount || 0).toFixed(2)}</td>
                <td style="padding: 8px 10px; text-align: right; color: #059669;">₹${(calc.standardRoundedTotal || 0).toFixed(2)}</td>
                <td style="padding: 8px 10px; text-align: right;">${Math.abs((invoice.totalAmount || 0) - (calc.standardRoundedTotal || 0)) < 1 ? '✓ Compliant' : '⚠ Mismatch'}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div style="margin-top: 14px;">
          <div style="font-weight: 700; font-size: 0.88rem; margin-bottom: 6px;">Audit Findings & Diagnostics:</div>
          ${violationItemsHtml}
        </div>

        <div style="margin-top: 20px; text-align: right; border-top: 1px solid #e2e8f0; padding-top: 12px;">
          <button onclick="window.print()" style="background: #0f172a; color: #fff; border: none; padding: 8px 16px; border-radius: 6px; font-weight: 600; cursor: pointer; margin-right: 8px;">Print Slip</button>
          <button onclick="document.getElementById('report-modal').classList.remove('open')" style="background: #e2e8f0; color: #0f172a; border: none; padding: 8px 16px; border-radius: 6px; font-weight: 600; cursor: pointer;">Close</button>
        </div>
      </div>
    `;

    modalContent.innerHTML = html;
    modalOverlay.classList.add("open");
  }

  return {
    exportAuditToCSV,
    showPrintableSummary
  };
})();

window.AuditExport = AuditExport;
