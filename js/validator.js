/* ==========================================================================
   AUTOMATED GST & INVOICE VALIDATOR — MULTI-PASS COMPLIANCE AUDIT ENGINE
   Author: Priyanshu Pandey (IQ4U8)
   Description: 10 statutory validation rules, scoring algorithm, diagnosis,
                and 1-Click Auto-Fix generator for Indian GST invoices.
   ========================================================================== */

const GSTValidator = (() => {

  /**
   * Runs complete 10-rule statutory audit on an invoice object
   * @param {Object} invoice
   * @returns {Object} Audit Result with score, violations, and auto-fix recommendations
   */
  function auditInvoice(invoice) {
    const violations = [];
    const passes = [];
    let score = 100;

    if (!invoice) {
      return {
        score: 0,
        status: "FAILED",
        violations: [{ ruleId: "ERR_000", severity: "CRITICAL", title: "Empty Invoice", desc: "No invoice data provided." }],
        passes: [],
        calculated: {}
      };
    }

    // Extract core parameters
    const supplierGstin = String(invoice.supplierGstin || "").trim().toUpperCase();
    const recipientGstin = String(invoice.recipientGstin || "").trim().toUpperCase();
    const invoiceType = invoice.invoiceType || (recipientGstin ? "B2B" : "B2C");
    const invoiceNumber = String(invoice.invoiceNumber || "").trim();
    const invoiceDate = invoice.invoiceDate || "";
    const isRcm = Boolean(invoice.isRcm);
    const irn = String(invoice.irn || "").trim();

    // Derived State Codes
    const supplierStateCode = supplierGstin ? supplierGstin.substring(0, 2) : String(invoice.supplierStateCode || "27");
    const posStateCode = invoice.placeOfSupply
      ? String(invoice.placeOfSupply).substring(0, 2)
      : (recipientGstin ? recipientGstin.substring(0, 2) : supplierStateCode);

    // --- RULE 1: Supplier GSTIN Checksum & Format ---
    if (!supplierGstin) {
      violations.push({
        ruleId: "R1_SUPPLIER_GSTIN_MISSING",
        severity: "CRITICAL",
        title: "Supplier GSTIN Missing",
        desc: "Every tax invoice must feature the registered Supplier GSTIN.",
        autoFixable: false
      });
      score -= 30;
    } else {
      const gCheck = GSTRules.verifyGSTINChecksum(supplierGstin);
      if (!gCheck.isValid) {
        violations.push({
          ruleId: "R1_SUPPLIER_GSTIN_INVALID",
          severity: "CRITICAL",
          title: "Supplier GSTIN Checksum Mismatch",
          desc: `${gCheck.message}. Calculated expected character '${gCheck.expectedChar}', but invoice has '${gCheck.actualChar}'.`,
          fixHint: `Correct Supplier GSTIN 15th checksum character to '${gCheck.expectedChar}'.`,
          autoFixable: true,
          fixType: "CORRECT_SUPPLIER_GSTIN",
          suggestedChar: gCheck.expectedChar
        });
        score -= 25;
      } else {
        passes.push({
          ruleId: "R1_SUPPLIER_GSTIN_PASS",
          title: "Supplier GSTIN Verified",
          desc: `Valid 15-character GSTIN verified against Modulo 36 algorithm (${gCheck.stateName}).`
        });
      }
    }

    // --- RULE 2: Recipient GSTIN Checksum & Format (B2B vs B2C) ---
    if (invoiceType === "B2B") {
      if (!recipientGstin) {
        violations.push({
          ruleId: "R2_RECIPIENT_GSTIN_MISSING",
          severity: "CRITICAL",
          title: "B2B Buyer GSTIN Missing",
          desc: "Under Section 31 of CGST Act, B2B invoices strictly mandate recipient GSTIN to claim ITC.",
          autoFixable: false
        });
        score -= 25;
      } else {
        const rCheck = GSTRules.verifyGSTINChecksum(recipientGstin);
        if (!rCheck.isValid) {
          violations.push({
            ruleId: "R2_RECIPIENT_GSTIN_INVALID",
            severity: "CRITICAL",
            title: "Recipient GSTIN Checksum Mismatch",
            desc: `${rCheck.message}. Checksum failed for buyer PAN.`,
            fixHint: `Correct Buyer GSTIN checksum character to '${rCheck.expectedChar}'.`,
            autoFixable: true,
            fixType: "CORRECT_RECIPIENT_GSTIN",
            suggestedChar: rCheck.expectedChar
          });
          score -= 20;
        } else {
          passes.push({
            ruleId: "R2_RECIPIENT_GSTIN_PASS",
            title: "Buyer GSTIN Verified",
            desc: `Valid Buyer GSTIN for ITC claiming (${rCheck.stateName}).`
          });
        }
      }
    } else {
      // B2C Invoice
      if (recipientGstin) {
        const rCheck = GSTRules.verifyGSTINChecksum(recipientGstin);
        if (!rCheck.isValid) {
          violations.push({
            ruleId: "R2_B2C_GSTIN_WARN",
            severity: "WARNING",
            title: "Unverified Consumer GSTIN Provided",
            desc: `A GSTIN was specified on a B2C bill, but its checksum failed (${rCheck.message}).`,
            autoFixable: false
          });
          score -= 5;
        }
      }
    }

    // --- RULE 3: Place of Supply & Tax Type Coherence (Intra vs Inter State) ---
    const posEval = GSTRules.evaluatePlaceOfSupply(supplierStateCode, posStateCode);
    const declaredCgst = Number(invoice.cgst || 0);
    const declaredSgst = Number(invoice.sgst || 0);
    const declaredIgst = Number(invoice.igst || 0);

    if (posEval.isIntraState) {
      // Same state: Supplier State == POS State -> Must have CGST + SGST, IGST must be 0
      if (declaredIgst > 0) {
        violations.push({
          ruleId: "R3_POS_INTRA_ILLEGAL_IGST",
          severity: "CRITICAL",
          title: "Illegal IGST on Intra-State Supply",
          desc: `Supplier State (${supplierStateCode} - ${posEval.supplierState}) and Place of Supply (${posStateCode} - ${posEval.posState}) are identical. Charging IGST (₹${declaredIgst.toFixed(2)}) is a statutory violation. Must charge equal CGST + SGST.`,
          fixHint: "Convert declared IGST into equal 50/50 split of CGST and SGST.",
          autoFixable: true,
          fixType: "SPLIT_TO_CGST_SGST"
        });
        score -= 30;
      } else if (declaredCgst === 0 && declaredSgst === 0 && (invoice.taxableAmount > 0)) {
        violations.push({
          ruleId: "R3_POS_INTRA_MISSING_TAX",
          severity: "WARNING",
          title: "Intra-State CGST/SGST Not Charged",
          desc: "Taxable transaction in same state but CGST/SGST values are zero (unless exempt/zero-rated).",
          autoFixable: false
        });
        score -= 10;
      } else if (Math.abs(declaredCgst - declaredSgst) > 0.05) {
        violations.push({
          ruleId: "R3_POS_ASYMMETRIC_SPLIT",
          severity: "CRITICAL",
          title: "CGST and SGST Unequal Split Mismatch",
          desc: `Statutory mandate requires CGST (₹${declaredCgst.toFixed(2)}) and SGST (₹${declaredSgst.toFixed(2)}) to be 100% equal. Difference: ₹${Math.abs(declaredCgst - declaredSgst).toFixed(2)}.`,
          fixHint: "Balance CGST and SGST to exact 50% split.",
          autoFixable: true,
          fixType: "BALANCE_CGST_SGST"
        });
        score -= 20;
      } else {
        passes.push({
          ruleId: "R3_POS_INTRA_PASS",
          title: "Intra-State Tax Structure Valid",
          desc: `Clean Intra-State transaction (${supplierStateCode} -> ${posStateCode}) with balanced CGST and SGST.`
        });
      }
    } else {
      // Different states: Inter-State -> Must have IGST, CGST & SGST must be 0
      if (declaredCgst > 0 || declaredSgst > 0) {
        violations.push({
          ruleId: "R3_POS_INTER_ILLEGAL_CGST_SGST",
          severity: "CRITICAL",
          title: "Illegal CGST/SGST on Inter-State Supply",
          desc: `Supplier State (${supplierStateCode} - ${posEval.supplierState}) differs from Place of Supply (${posStateCode} - ${posEval.posState}). Charging local CGST/SGST on inter-state supply is disallowed. Must charge IGST.`,
          fixHint: "Merge CGST + SGST into singular IGST rate and zero out local taxes.",
          autoFixable: true,
          fixType: "MERGE_TO_IGST"
        });
        score -= 30;
      } else if (declaredIgst === 0 && (invoice.taxableAmount > 0)) {
        violations.push({
          ruleId: "R3_POS_INTER_MISSING_IGST",
          severity: "WARNING",
          title: "Inter-State IGST Not Charged",
          desc: "Inter-state supply with positive taxable amount but IGST is zero.",
          autoFixable: false
        });
        score -= 10;
      } else {
        passes.push({
          ruleId: "R3_POS_INTER_PASS",
          title: "Inter-State Tax Structure Valid",
          desc: `Clean Inter-State transaction (${supplierStateCode} -> ${posStateCode}) mapped to IGST.`
        });
      }
    }

    // --- RULE 4 & 5: Line Item Arithmetic & Standard Slab Compliance ---
    const lineItems = Array.isArray(invoice.items) && invoice.items.length > 0
      ? invoice.items
      : [{
          description: "General Supply",
          hsn: invoice.hsn || "998314",
          qty: 1,
          rate: invoice.taxableAmount || 0,
          discount: 0,
          taxRate: invoice.taxRate || 18
        }];

    let computedTaxableSum = 0;
    let computedCgstSum = 0;
    let computedSgstSum = 0;
    let computedIgstSum = 0;
    let hasNonStandardSlab = false;
    let hasMathDrift = false;

    lineItems.forEach((item, idx) => {
      const qty = Number(item.qty || 1);
      const rate = Number(item.rate || 0);
      const discount = Number(item.discount || 0);
      const taxRate = Number(item.taxRate || 0);

      const expectedLineTaxable = Math.max(0, (qty * rate) - discount);
      computedTaxableSum += expectedLineTaxable;

      // Slab check
      if (!GSTRules.isStandardSlab(taxRate)) {
        hasNonStandardSlab = true;
        violations.push({
          ruleId: `R4_NON_STANDARD_SLAB_ITEM_${idx + 1}`,
          severity: "WARNING",
          title: `Non-Standard GST Slab (${taxRate}%) on Item ${idx + 1}`,
          desc: `Rate ${taxRate}% does not match official GST slabs (0%, 0.1%, 0.25%, 1.5%, 3%, 5%, 12%, 18%, 28%).`,
          autoFixable: false
        });
        score -= 5;
      }

      // Check HSN code
      if (item.hsn && !GSTRules.isValidHSN(item.hsn)) {
        violations.push({
          ruleId: `R5_INVALID_HSN_ITEM_${idx + 1}`,
          severity: "WARNING",
          title: `Invalid HSN/SAC Code '${item.hsn}'`,
          desc: "HSN/SAC must be 4, 6, or 8 numeric digits.",
          autoFixable: false
        });
        score -= 5;
      }

      // Compute item taxes based on POS
      const itemTaxVal = expectedLineTaxable * (taxRate / 100);
      if (posEval.isIntraState) {
        computedCgstSum += (itemTaxVal / 2);
        computedSgstSum += (itemTaxVal / 2);
      } else {
        computedIgstSum += itemTaxVal;
      }
    });

    // Check declared taxable value vs recalculated taxable sum
    const declaredTaxable = Number(invoice.taxableAmount || 0);
    const taxableDiff = Math.abs(declaredTaxable - computedTaxableSum);
    if (taxableDiff > 1.00) {
      hasMathDrift = true;
      violations.push({
        ruleId: "R5_TAXABLE_ARITHMETIC_DRIFT",
        severity: "CRITICAL",
        title: "Taxable Value Precision Drift",
        desc: `Declared Taxable Amount (₹${declaredTaxable.toFixed(2)}) deviates from line-items calculation sum (₹${computedTaxableSum.toFixed(2)}) by ₹${taxableDiff.toFixed(2)}.`,
        fixHint: `Update invoice taxable amount to ₹${computedTaxableSum.toFixed(2)}.`,
        autoFixable: true,
        fixType: "ALIGN_TAXABLE_AMOUNT",
        correctTaxable: computedTaxableSum
      });
      score -= 20;
    } else {
      passes.push({
        ruleId: "R5_MATH_PRECISION_PASS",
        title: "Line Item Mathematics Verified",
        desc: `All ${lineItems.length} line items align with subtotal arithmetic (₹${computedTaxableSum.toFixed(2)}).`
      });
    }

    // --- RULE 6: Recalculated Tax Sum vs Declared Tax Check ---
    const totalDeclaredTax = declaredCgst + declaredSgst + declaredIgst;
    const totalComputedTax = computedCgstSum + computedSgstSum + computedIgstSum;
    const taxDiff = Math.abs(totalDeclaredTax - totalComputedTax);

    if (taxDiff > 1.50) {
      violations.push({
        ruleId: "R6_TAX_AMOUNT_MISMATCH",
        severity: "CRITICAL",
        title: "Total GST Calculation Mismatch",
        desc: `Declared tax (₹${totalDeclaredTax.toFixed(2)}) does not match statutory formula rate computation (₹${totalComputedTax.toFixed(2)}). Difference: ₹${taxDiff.toFixed(2)}.`,
        fixHint: posEval.isIntraState
          ? `Set CGST to ₹${computedCgstSum.toFixed(2)} and SGST to ₹${computedSgstSum.toFixed(2)}.`
          : `Set IGST to ₹${computedIgstSum.toFixed(2)}.`,
        autoFixable: true,
        fixType: "RECALCULATE_TAXES",
        computedCgst: computedCgstSum,
        computedSgst: computedSgstSum,
        computedIgst: computedIgstSum
      });
      score -= 20;
    }

    // --- RULE 7: Statutory Round-off Audit (Rule 36(4)) ---
    const declaredGrandTotal = Number(invoice.totalAmount || 0);
    const declaredRoundOff = Number(invoice.roundOff || 0);
    const expectedGrandTotalRaw = computedTaxableSum + totalComputedTax;
    const standardRoundedTotal = Math.round(expectedGrandTotalRaw);
    const computedRoundOff = +(standardRoundedTotal - expectedGrandTotalRaw).toFixed(2);

    if (Math.abs(declaredRoundOff) > 1.00) {
      violations.push({
        ruleId: "R7_ROUNDOFF_EXCESS",
        severity: "WARNING",
        title: "Excessive Round-Off Tolerance",
        desc: `Declared round-off ₹${declaredRoundOff.toFixed(2)} exceeds standard statutory ±₹1.00 margin.`,
        autoFixable: true,
        fixType: "CORRECT_ROUNDOFF",
        correctRoundOff: computedRoundOff
      });
      score -= 10;
    }

    const grandTotalDiff = Math.abs(declaredGrandTotal - standardRoundedTotal);
    if (grandTotalDiff > 1.00) {
      violations.push({
        ruleId: "R7_GRAND_TOTAL_MISMATCH",
        severity: "CRITICAL",
        title: "Grand Total Inconsistency",
        desc: `Declared Grand Total (₹${declaredGrandTotal.toFixed(2)}) deviates from verified Taxable + GST sum (₹${standardRoundedTotal.toFixed(2)}).`,
        fixHint: `Align Grand Total to ₹${standardRoundedTotal.toFixed(2)}.`,
        autoFixable: true,
        fixType: "ALIGN_GRAND_TOTAL",
        correctGrandTotal: standardRoundedTotal
      });
      score -= 20;
    } else {
      passes.push({
        ruleId: "R7_ROUNDOFF_PASS",
        title: "Statutory Round-Off Compliant",
        desc: `Grand Total aligns with Indian statutory limits (±₹1.00 round-off standard).`
      });
    }

    // --- RULE 8: Invoice Number & Date Compliance ---
    if (!GSTRules.isValidInvoiceNumber(invoiceNumber)) {
      violations.push({
        ruleId: "R8_INVALID_INVOICE_NUM",
        severity: "WARNING",
        title: "Invoice Number Rule 46 Non-Compliant",
        desc: `Invoice number '${invoiceNumber}' exceeds 16 chars or contains forbidden characters (only alphanumeric, '-' and '/' allowed).`,
        autoFixable: false
      });
      score -= 10;
    }

    if (invoiceDate) {
      const invDateTime = new Date(invoiceDate).getTime();
      const now = new Date().getTime();
      if (invDateTime > now + 86400000) {
        violations.push({
          ruleId: "R8_FUTURE_DATE",
          severity: "CRITICAL",
          title: "Future Invoice Date Detected",
          desc: `Invoice date (${invoiceDate}) is ahead of current date. Future-dated tax invoices violate GST Rule 47.`,
          autoFixable: false
        });
        score -= 15;
      }
    }

    // --- RULE 9: High-Value B2C Inter-State Supply Rule ---
    if (invoiceType === "B2C" && !posEval.isIntraState && declaredTaxable > 250000) {
      if (!invoice.recipientStateCode && !invoice.recipientAddress) {
        violations.push({
          ruleId: "R9_HIGH_VALUE_B2C_UNRECORDED",
          severity: "CRITICAL",
          title: "High-Value B2C Interstate Threshold Violation",
          desc: `Invoice taxable value ₹${declaredTaxable.toLocaleString("en-IN")} exceeds ₹2,50,000 threshold for inter-state consumer supply. Rule 46(f) mandates capturing recipient state code & address.`,
          autoFixable: false
        });
        score -= 25;
      }
    }

    // --- RULE 10: RCM & E-Invoice / IRN Compliance ---
    if (isRcm) {
      violations.push({
        ruleId: "R10_RCM_NOTIFICATION",
        severity: "WARNING",
        title: "Reverse Charge Mechanism (RCM) Active",
        desc: "Supplier cannot collect tax from recipient. Recipient must self-pay GST directly to the Government.",
        autoFixable: false
      });
    }

    if (irn) {
      const isHex64 = /^[a-fA-F0-9]{64}$/.test(irn);
      if (!isHex64) {
        violations.push({
          ruleId: "R10_IRN_CORRUPT",
          severity: "CRITICAL",
          title: "Malformed E-Invoice IRN Hash",
          desc: `Declared IRN hash length is ${irn.length} chars (must be exactly 64 hexadecimal characters).`,
          autoFixable: false
        });
        score -= 15;
      } else {
        passes.push({
          ruleId: "R10_IRN_PASS",
          title: "E-Invoice IRN Hash Valid",
          desc: "Valid 64-character SHA-256 e-invoice Invoice Reference Number."
        });
      }
    }

    // Normalized Score
    score = Math.max(0, Math.min(100, Math.round(score)));
    let status = "PASS";
    if (violations.some(v => v.severity === "CRITICAL")) {
      status = "FAILED";
    } else if (violations.some(v => v.severity === "WARNING")) {
      status = "WARNING";
    }

    return {
      score,
      status,
      violations,
      passes,
      calculated: {
        posEval,
        computedTaxableSum,
        computedCgstSum,
        computedSgstSum,
        computedIgstSum,
        computedRoundOff,
        standardRoundedTotal,
        totalDeclaredTax,
        totalComputedTax
      }
    };
  }

  /**
   * Generates a perfectly compliant Auto-Fixed invoice object
   * @param {Object} originalInvoice
   * @param {Object} auditResult
   * @returns {Object} Fixed invoice
   */
  function generateAutoFix(originalInvoice, auditResult) {
    const fixed = JSON.parse(JSON.stringify(originalInvoice));
    const calc = auditResult.calculated;

    // 1. Fix Supplier GSTIN Checksum
    if (fixed.supplierGstin) {
      const sCheck = GSTRules.verifyGSTINChecksum(fixed.supplierGstin);
      if (!sCheck.isValid && sCheck.expectedChar) {
        fixed.supplierGstin = fixed.supplierGstin.substring(0, 14) + sCheck.expectedChar;
      }
    }

    // 2. Fix Buyer GSTIN Checksum
    if (fixed.recipientGstin) {
      const rCheck = GSTRules.verifyGSTINChecksum(fixed.recipientGstin);
      if (!rCheck.isValid && rCheck.expectedChar) {
        fixed.recipientGstin = fixed.recipientGstin.substring(0, 14) + rCheck.expectedChar;
      }
    }

    // 3. Align Taxable Amount
    fixed.taxableAmount = +(calc.computedTaxableSum.toFixed(2));

    // 4. Align Taxes according to Place of Supply
    if (calc.posEval.isIntraState) {
      fixed.cgst = +(calc.computedCgstSum.toFixed(2));
      fixed.sgst = +(calc.computedSgstSum.toFixed(2));
      fixed.igst = 0;
    } else {
      fixed.cgst = 0;
      fixed.sgst = 0;
      fixed.igst = +(calc.computedIgstSum.toFixed(2));
    }

    // 5. Align RoundOff & Grand Total
    fixed.roundOff = calc.computedRoundOff;
    fixed.totalAmount = calc.standardRoundedTotal;

    return fixed;
  }

  return {
    auditInvoice,
    generateAutoFix
  };
})();

// Export globally
window.GSTValidator = GSTValidator;
