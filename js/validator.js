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
        desc: "Every tax invoice must specify the registered supplier's 15-digit GSTIN under Section 31 of the CGST Act.",
        autoFixable: false
      });
      score -= 30;
    } else {
      const gCheck = GSTRules.verifyGSTINChecksum(supplierGstin);
      if (!gCheck.isValid) {
        violations.push({
          ruleId: "R1_SUPPLIER_GSTIN_INVALID",
          severity: "CRITICAL",
          title: "Supplier GSTIN Check Digit Error",
          desc: `The 15th check digit of supplier GSTIN '${supplierGstin}' failed the official Modulo 36 formula. Expected '${gCheck.expectedChar}', but bill shows '${gCheck.actualChar}'.`,
          fixHint: `Change the last character of Supplier GSTIN to '${gCheck.expectedChar}'.`,
          autoFixable: true,
          fixType: "CORRECT_SUPPLIER_GSTIN",
          suggestedChar: gCheck.expectedChar
        });
        score -= 25;
      } else {
        passes.push({
          ruleId: "R1_SUPPLIER_GSTIN_PASS",
          title: "Supplier GSTIN Verified",
          desc: `Valid 15-digit GSTIN registered in ${gCheck.stateName} (State Code ${gCheck.stateCode}).`
        });
      }
    }

    // --- RULE 2: Recipient GSTIN Checksum & Format (B2B vs B2C) ---
    if (invoiceType === "B2B") {
      if (!recipientGstin) {
        violations.push({
          ruleId: "R2_RECIPIENT_GSTIN_MISSING",
          severity: "CRITICAL",
          title: "Buyer GSTIN Missing on B2B Invoice",
          desc: "For B2B invoices, the buyer's GSTIN is mandatory under Section 31. Without it, the buyer cannot claim Input Tax Credit (ITC) in GSTR-2B.",
          autoFixable: false
        });
        score -= 25;
      } else {
        const rCheck = GSTRules.verifyGSTINChecksum(recipientGstin);
        if (!rCheck.isValid) {
          violations.push({
            ruleId: "R2_RECIPIENT_GSTIN_INVALID",
            severity: "CRITICAL",
            title: "Buyer GSTIN Check Digit Error",
            desc: `The buyer's GSTIN '${recipientGstin}' has an invalid check digit. Calculated expected character is '${rCheck.expectedChar}'.`,
            fixHint: `Change the last character of Buyer GSTIN to '${rCheck.expectedChar}'.`,
            autoFixable: true,
            fixType: "CORRECT_RECIPIENT_GSTIN",
            suggestedChar: rCheck.expectedChar
          });
          score -= 20;
        } else {
          passes.push({
            ruleId: "R2_RECIPIENT_GSTIN_PASS",
            title: "Buyer GSTIN Verified",
            desc: `Valid buyer GSTIN for ${rCheck.stateName}. Eligible for Input Tax Credit.`
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
            title: "Invalid GSTIN Entered on Retail Bill",
            desc: `A GSTIN was specified for a retail consumer bill, but its check digit is invalid (${rCheck.message}).`,
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
          title: "Wrong Tax Charged: IGST on Local Intra-State Supply",
          desc: `Both the seller and the Place of Supply are in ${posEval.supplierState} (Code ${supplierStateCode}). Under Section 8 of the IGST Act, local sales require equal CGST + SGST (50% each). Integrated Tax (IGST ₹${declaredIgst.toFixed(2)}) cannot be charged here. Buyer's GST portal will reject the ITC.`,
          fixHint: "Split declared IGST into equal 50% CGST and 50% SGST.",
          autoFixable: true,
          fixType: "SPLIT_TO_CGST_SGST"
        });
        score -= 30;
      } else if (declaredCgst === 0 && declaredSgst === 0 && (invoice.taxableAmount > 0)) {
        violations.push({
          ruleId: "R3_POS_INTRA_MISSING_TAX",
          severity: "WARNING",
          title: "Local CGST & SGST Not Charged",
          desc: "Transaction is within the same state with positive taxable value, but CGST/SGST amounts are zero (unless goods are specifically exempt).",
          autoFixable: false
        });
        score -= 10;
      } else if (Math.abs(declaredCgst - declaredSgst) > 0.05) {
        violations.push({
          ruleId: "R3_POS_ASYMMETRIC_SPLIT",
          severity: "CRITICAL",
          title: "Unequal CGST and SGST Split",
          desc: `Under GST rules, CGST (₹${declaredCgst.toFixed(2)}) and SGST (₹${declaredSgst.toFixed(2)}) must always be exactly equal. Found a difference of ₹${Math.abs(declaredCgst - declaredSgst).toFixed(2)}.`,
          fixHint: "Balance CGST and SGST into exact 50-50 equal amounts.",
          autoFixable: true,
          fixType: "BALANCE_CGST_SGST"
        });
        score -= 20;
      } else {
        passes.push({
          ruleId: "R3_POS_INTRA_PASS",
          title: "Local Intra-State Tax Split Verified",
          desc: `Correctly mapped to equal CGST + SGST within ${posEval.supplierState}.`
        });
      }
    } else {
      // Different states: Inter-State -> Must have IGST, CGST & SGST must be 0
      if (declaredCgst > 0 || declaredSgst > 0) {
        violations.push({
          ruleId: "R3_POS_INTER_ILLEGAL_CGST_SGST",
          severity: "CRITICAL",
          title: "Wrong Tax Charged: CGST/SGST on Inter-State Supply",
          desc: `Seller is located in ${posEval.supplierState} (Code ${supplierStateCode}) but delivery location is ${posEval.posState} (Code ${posStateCode}). Under Section 7 of the IGST Act, inter-state transactions strictly require Integrated Tax (IGST). Local CGST and SGST cannot be charged.`,
          fixHint: "Combine CGST and SGST into a single IGST amount and set local taxes to zero.",
          autoFixable: true,
          fixType: "MERGE_TO_IGST"
        });
        score -= 30;
      } else if (declaredIgst === 0 && (invoice.taxableAmount > 0)) {
        violations.push({
          ruleId: "R3_POS_INTER_MISSING_IGST",
          severity: "WARNING",
          title: "Inter-State IGST Not Added",
          desc: "Inter-state supply has taxable value, but IGST amount is ₹0.00.",
          autoFixable: false
        });
        score -= 10;
      } else {
        passes.push({
          ruleId: "R3_POS_INTER_PASS",
          title: "Inter-State IGST Structure Verified",
          desc: `Correctly mapped to IGST for supply from ${posEval.supplierState} to ${posEval.posState}.`
        });
      }
    }

    // --- RULE 4 & 5: Line Item Arithmetic & Standard Slab Compliance ---
    const lineItems = Array.isArray(invoice.items) && invoice.items.length > 0
      ? invoice.items
      : [{
          description: "General Supply Item",
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

    lineItems.forEach((item, idx) => {
      const qty = Number(item.qty || 1);
      const rate = Number(item.rate || 0);
      const discount = Number(item.discount || 0);
      const taxRate = Number(item.taxRate || 0);

      const expectedLineTaxable = Math.max(0, (qty * rate) - discount);
      computedTaxableSum += expectedLineTaxable;

      // Slab check
      if (!GSTRules.isStandardSlab(taxRate)) {
        violations.push({
          ruleId: `R4_NON_STANDARD_SLAB_ITEM_${idx + 1}`,
          severity: "WARNING",
          title: `Non-Standard Tax Rate (${taxRate}%) on Item ${idx + 1}`,
          desc: `Item '${item.description || `Row ${idx + 1}`}' uses a ${taxRate}% rate. Official GST slabs are 0%, 0.1%, 0.25%, 1.5%, 3%, 5%, 12%, 18%, and 28%.`,
          autoFixable: false
        });
        score -= 5;
      }

      // Check HSN code
      if (item.hsn && !GSTRules.isValidHSN(item.hsn)) {
        violations.push({
          ruleId: `R5_INVALID_HSN_ITEM_${idx + 1}`,
          severity: "WARNING",
          title: `Invalid HSN / SAC Code '${item.hsn}' on Item ${idx + 1}`,
          desc: "HSN / SAC must be 4, 6, or 8 digits as prescribed by the GST Council.",
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
      violations.push({
        ruleId: "R5_TAXABLE_ARITHMETIC_DRIFT",
        severity: "CRITICAL",
        title: "Item Subtotal Does Not Match Taxable Amount",
        desc: `Sum of item rows after discount is ₹${computedTaxableSum.toFixed(2)}, but invoice states ₹${declaredTaxable.toFixed(2)} (difference: ₹${taxableDiff.toFixed(2)}).`,
        fixHint: `Align invoice taxable amount to item subtotal (₹${computedTaxableSum.toFixed(2)}).`,
        autoFixable: true,
        fixType: "ALIGN_TAXABLE_AMOUNT",
        correctTaxable: computedTaxableSum
      });
      score -= 20;
    } else {
      passes.push({
        ruleId: "R5_MATH_PRECISION_PASS",
        title: "Line Item Calculations Verified",
        desc: `All ${lineItems.length} item rows match the taxable subtotal of ₹${computedTaxableSum.toFixed(2)}.`
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
        title: "Tax Amount Calculation Mismatch",
        desc: `Declared total GST (₹${totalDeclaredTax.toFixed(2)}) differs from item rate calculation (₹${totalComputedTax.toFixed(2)}) by ₹${taxDiff.toFixed(2)}.`,
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
        title: "Round-Off Exceeds Normal ±₹1.00 Margin",
        desc: `Declared round-off ₹${declaredRoundOff.toFixed(2)} is outside standard accounting tolerance (±₹1.00).`,
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
        title: "Invoice Grand Total Inconsistency",
        desc: `Declared Grand Total (₹${declaredGrandTotal.toFixed(2)}) does not match Taxable Subtotal + GST + Round-off (₹${standardRoundedTotal.toFixed(2)}).`,
        fixHint: `Align Grand Total to verified total ₹${standardRoundedTotal.toFixed(2)}.`,
        autoFixable: true,
        fixType: "ALIGN_GRAND_TOTAL",
        correctGrandTotal: standardRoundedTotal
      });
      score -= 20;
    } else {
      passes.push({
        ruleId: "R7_ROUNDOFF_PASS",
        title: "Grand Total & Round-Off Verified",
        desc: "Invoice grand total matches taxable amount plus taxes within standard round-off limits."
      });
    }

    // --- RULE 8: Invoice Number & Date Compliance ---
    if (!GSTRules.isValidInvoiceNumber(invoiceNumber)) {
      violations.push({
        ruleId: "R8_INVALID_INVOICE_NUM",
        severity: "WARNING",
        title: "Invoice Number Does Not Comply with Rule 46",
        desc: `Invoice number '${invoiceNumber}' exceeds 16 characters or contains special characters other than hyphens and slashes.`,
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
          title: "Invoice Date Cannot Be in the Future",
          desc: `Invoice date (${invoiceDate}) is forward-dated. Under GST Rule 47, invoices cannot be issued with future dates.`,
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
          title: "High-Value Consumer Interstate Sale: Missing Address",
          desc: `Invoice taxable amount ₹${declaredTaxable.toLocaleString("en-IN")} exceeds the ₹2,50,000 threshold for inter-state retail sales. Under Rule 46(f), capturing customer name, state code, and delivery address is mandatory.`,
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
        title: "Reverse Charge (RCM) Applicable",
        desc: "Tax on this invoice is payable directly by the recipient to the government. Seller must not collect tax on bill under Section 9(3)/9(4).",
        autoFixable: true,
        fixType: "RCM_SUPPRESS_TAX"
      });
    }

    if (irn) {
      const isHex64 = /^[a-fA-F0-9]{64}$/.test(irn);
      if (!isHex64) {
        violations.push({
          ruleId: "R10_IRN_CORRUPT",
          severity: "CRITICAL",
          title: "Malformed E-Invoice IRN Hash",
          desc: `Declared IRN length is ${irn.length} characters. Must be an exact 64-character hexadecimal SHA-256 hash issued by IRP.`,
          autoFixable: false
        });
        score -= 15;
      } else {
        passes.push({
          ruleId: "R10_IRN_PASS",
          title: "E-Invoice IRN Hash Verified",
          desc: "Valid 64-character SHA-256 Invoice Reference Number."
        });
      }
    }

    // --- RULE 11: Mandatory E-Way Bill Threshold (Rule 138 CGST Rules) ---
    const ewayCheck = GSTRules.evaluateEWayBillRequirement(standardRoundedTotal, posEval.isIntraState, supplierStateCode);
    if (ewayCheck.required && !invoice.ewayBillNo) {
      violations.push({
        ruleId: "R11_EWAY_BILL_MANDATORY",
        severity: "WARNING",
        title: "E-Way Bill Generation Required (Rule 138)",
        desc: ewayCheck.message,
        fixHint: "Generate E-Way Bill on ewaybillgst.gov.in and record 12-digit EWB Number.",
        autoFixable: false
      });
      score -= 5;
    } else if (invoice.ewayBillNo) {
      const cleanEwb = String(invoice.ewayBillNo).trim();
      if (/^[0-9]{12}$/.test(cleanEwb)) {
        passes.push({
          ruleId: "R11_EWAY_BILL_PASS",
          title: "Valid E-Way Bill Number Recorded",
          desc: `EWB No: ${cleanEwb} verified for consignment movement.`
        });
      } else {
        violations.push({
          ruleId: "R11_EWAY_BILL_INVALID",
          severity: "WARNING",
          title: "Invalid E-Way Bill Number Format",
          desc: `Recorded EWB No '${cleanEwb}' must be a 12-digit numeric identifier issued by NIC E-Way Bill Portal.`,
          autoFixable: false
        });
        score -= 5;
      }
    }

    // --- RULE 12: Embedded PAN Entity Structure Validation ---
    if (supplierGstin && supplierGstin.length === 15) {
      const panCheck = GSTRules.validateGSTINPAN(supplierGstin);
      if (!panCheck.isValid) {
        violations.push({
          ruleId: "R12_SUPPLIER_PAN_CORRUPT",
          severity: "CRITICAL",
          title: "Supplier PAN Entity Inconsistency",
          desc: `4th character '${panCheck.entityChar}' in PAN '${panCheck.pan}' is not an authorized Indian Income Tax entity code.`,
          autoFixable: false
        });
        score -= 15;
      } else {
        passes.push({
          ruleId: "R12_SUPPLIER_PAN_PASS",
          title: `Supplier Entity Verified: ${panCheck.entityType}`,
          desc: `PAN ${panCheck.pan} verified as ${panCheck.entityType}.`
        });
      }
    }

    // --- RULE 13: Section 17(5) Blocked ITC Detection ---
    const blockedItemsFound = [];
    lineItems.forEach((it, idx) => {
      const blk = GSTRules.checkBlockedITCKeyword(it.description);
      if (blk) {
        blockedItemsFound.push({ itemNo: idx + 1, desc: it.description, keyword: blk.keyword });
      }
    });

    if (blockedItemsFound.length > 0 && invoiceType === "B2B") {
      violations.push({
        ruleId: "R13_SECTION_17_5_BLOCKED_ITC",
        severity: "WARNING",
        title: "Potential Blocked ITC under Section 17(5)",
        desc: `Item(s) [${blockedItemsFound.map(b => `#${b.itemNo}: '${b.desc}'`).join(", ")}] appear to fall under restricted ITC categories (motor vehicles, food/catering, club memberships). Ensure credit is not claimed in GSTR-3B Table 4(B).`,
        autoFixable: false
      });
      score -= 5;
    } else if (invoiceType === "B2B") {
      passes.push({
        ruleId: "R13_SECTION_17_5_PASS",
        title: "Section 17(5) Restrictions Cleared",
        desc: "No restricted items (motor vehicles, catering, personal consumption) detected in line descriptions."
      });
    }

    // --- RULE 14: 180-Day Rule for ITC Payment (Rule 37 CGST Rules) ---
    if (invoiceDate && invoiceType === "B2B") {
      const invTime = new Date(invoiceDate).getTime();
      const nowTime = new Date().getTime();
      const daysElapsed = Math.floor((nowTime - invTime) / (1000 * 60 * 60 * 24));
      if (daysElapsed > 180 && !invoice.isPaid) {
        violations.push({
          ruleId: "R14_180_DAY_RULE_BREACH",
          severity: "WARNING",
          title: "180-Day Rule Alert: Mandatory ITC Reversal (Rule 37)",
          desc: `Invoice date is ${daysElapsed} days old. Under the 2nd proviso to Section 16(2), if payment is not made to supplier within 180 days, ITC must be reversed with 18% interest under Rule 37.`,
          autoFixable: false
        });
        score -= 10;
      }
    }

    // Multi-Dimensional Score Breakdown
    const gstinViolations = violations.filter(v => v.ruleId.startsWith("R1_") || v.ruleId.startsWith("R2_") || v.ruleId.startsWith("R12_"));
    const posViolations = violations.filter(v => v.ruleId.startsWith("R3_") || v.ruleId.startsWith("R4_"));
    const mathViolations = violations.filter(v => v.ruleId.startsWith("R5_") || v.ruleId.startsWith("R6_") || v.ruleId.startsWith("R7_"));
    const statutoryViolations = violations.filter(v => v.ruleId.startsWith("R8_") || v.ruleId.startsWith("R9_") || v.ruleId.startsWith("R10_") || v.ruleId.startsWith("R11_") || v.ruleId.startsWith("R13_") || v.ruleId.startsWith("R14_"));

    const scores = {
      overall: Math.max(0, Math.min(100, Math.round(score))),
      gstin: Math.max(0, 100 - gstinViolations.reduce((acc, v) => acc + (v.severity === "CRITICAL" ? 30 : 15), 0)),
      pos: Math.max(0, 100 - posViolations.reduce((acc, v) => acc + (v.severity === "CRITICAL" ? 35 : 15), 0)),
      math: Math.max(0, 100 - mathViolations.reduce((acc, v) => acc + (v.severity === "CRITICAL" ? 25 : 10), 0)),
      statutory: Math.max(0, 100 - statutoryViolations.reduce((acc, v) => acc + (v.severity === "CRITICAL" ? 20 : 10), 0))
    };

    // Normalized Score
    score = scores.overall;
    let status = "PASS";
    if (violations.some(v => v.severity === "CRITICAL")) {
      status = "FAILED";
    } else if (violations.some(v => v.severity === "WARNING")) {
      status = "WARNING";
    }

    return {
      score,
      status,
      scores,
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
        totalComputedTax,
        ewayCheck,
        financialPeriod: GSTRules.getFinancialPeriod(invoiceDate)
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

    // 6. If RCM is enabled, seller cannot collect tax on bill (tax is paid directly by recipient)
    if (fixed.isRcm) {
      fixed.cgst = 0;
      fixed.sgst = 0;
      fixed.igst = 0;
      fixed.totalAmount = fixed.taxableAmount;
      fixed.roundOff = 0;
    }

    return fixed;
  }

  return {
    auditInvoice,
    generateAutoFix
  };
})();

// Export globally
window.GSTValidator = GSTValidator;
