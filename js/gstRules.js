/* ==========================================================================
   AUTOMATED GST & INVOICE VALIDATOR — STATUTORY GST RULES & ENGINES
   Author: Priyanshu Pandey (IQ4U8)
   Description: Official Indian GST specifications, Modulo 36 Checksum,
                State Codes, Slabs, and Place of Supply (POS) algorithms.
   ========================================================================== */

const GSTRules = (() => {
  // Official 38 Indian GST State & Union Territory Codes
  const STATE_CODES = {
    "01": "Jammu and Kashmir",
    "02": "Himachal Pradesh",
    "03": "Punjab",
    "04": "Chandigarh",
    "05": "Uttarakhand",
    "06": "Haryana",
    "07": "Delhi",
    "08": "Rajasthan",
    "09": "Uttar Pradesh",
    "10": "Bihar",
    "11": "Sikkim",
    "12": "Arunachal Pradesh",
    "13": "Nagaland",
    "14": "Manipur",
    "15": "Mizoram",
    "16": "Tripura",
    "17": "Meghalaya",
    "18": "Assam",
    "19": "West Bengal",
    "20": "Jharkhand",
    "21": "Odisha",
    "22": "Chhattisgarh",
    "23": "Madhya Pradesh",
    "24": "Gujarat",
    "26": "Dadra & Nagar Haveli and Daman & Diu",
    "27": "Maharashtra",
    "29": "Karnataka",
    "30": "Goa",
    "31": "Lakshadweep",
    "32": "Kerala",
    "33": "Tamil Nadu",
    "34": "Puducherry",
    "35": "Andaman and Nicobar Islands",
    "36": "Telangana",
    "37": "Andhra Pradesh",
    "38": "Ladakh",
    "97": "Other Territory",
    "99": "Centre Jurisdiction / Special Category"
  };

  // Official Standard GST Rate Slabs in India (%)
  const STANDARD_TAX_SLABS = [0, 0.1, 0.25, 1.5, 3, 5, 12, 18, 28];

  // GSTIN Modulo 36 Character Set
  const MOD36_CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

  /**
   * Validates GSTIN structure via standard format regex
   * Pattern: 2 digits state + 5 alpha PAN + 4 digits PAN + 1 alpha PAN + 1 entity + 'Z' + 1 checksum
   */
  const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

  /**
   * Calculates and verifies the 15th character of GSTIN using Modulo 36 Luhn-variant algorithm
   * @param {string} gstin - 15-character GSTIN
   * @returns {{isValid: boolean, expectedChar: string, actualChar: string, message: string}}
   */
  function verifyGSTINChecksum(gstin) {
    if (!gstin || typeof gstin !== "string") {
      return { isValid: false, expectedChar: "", actualChar: "", message: "GSTIN is missing or empty" };
    }

    const clean = gstin.trim().toUpperCase();

    if (clean.length !== 15) {
      return { isValid: false, expectedChar: "", actualChar: "", message: `Invalid GSTIN length (${clean.length}/15 chars)` };
    }

    if (!GSTIN_REGEX.test(clean)) {
      return { isValid: false, expectedChar: "", actualChar: clean[14], message: "Invalid GSTIN pattern or missing standard 'Z' 14th character" };
    }

    const stateCode = clean.substring(0, 2);
    if (!STATE_CODES[stateCode]) {
      return { isValid: false, expectedChar: "", actualChar: clean[14], message: `Unrecognized State Code '${stateCode}'` };
    }

    // Official GSTN Modulo 36 Luhn-variant algorithm
    // Traverses from right to left (index 13 down to 0) with alternating factor starting at 2
    let sum = 0;
    let factor = 2;
    const mod = MOD36_CHARS.length; // 36

    for (let i = 13; i >= 0; i--) {
      const char = clean[i];
      const codePoint = MOD36_CHARS.indexOf(char);
      if (codePoint === -1) {
        return { isValid: false, expectedChar: "", actualChar: clean[14], message: `Invalid character '${char}' at index ${i + 1}` };
      }

      let digit = factor * codePoint;
      factor = (factor === 2) ? 1 : 2;
      digit = Math.floor(digit / mod) + (digit % mod);
      sum += digit;
    }

    const checkCodePoint = (mod - (sum % mod)) % mod;
    const expectedChar = MOD36_CHARS[checkCodePoint];
    const actualChar = clean[14];

    const isValid = (expectedChar === actualChar);

    return {
      isValid,
      expectedChar,
      actualChar,
      stateCode,
      stateName: STATE_CODES[stateCode],
      pan: clean.substring(2, 12),
      message: isValid
        ? `Valid GSTIN with verified checksum '${actualChar}' (${STATE_CODES[stateCode]})`
        : `Checksum mismatch: expected '${expectedChar}', got '${actualChar}'`
    };
  }

  /**
   * Determine Place of Supply (POS) Classification: Intra-State vs Inter-State
   * @param {string} supplierStateCode - 2 digit state code of supplier
   * @param {string} placeOfSupplyStateCode - 2 digit state code of Place of Supply
   * @returns {{isIntraState: boolean, type: string, rule: string}}
   */
  function evaluatePlaceOfSupply(supplierStateCode, placeOfSupplyStateCode) {
    const sCode = String(supplierStateCode || "").trim().padStart(2, "0");
    const pCode = String(placeOfSupplyStateCode || "").trim().padStart(2, "0");

    if (!sCode || !pCode) {
      return {
        isIntraState: true,
        type: "UNKNOWN",
        rule: "Missing state code for supplier or Place of Supply"
      };
    }

    const isIntra = (sCode === pCode);
    return {
      isIntraState: isIntra,
      type: isIntra ? "INTRA_STATE" : "INTER_STATE",
      supplierState: STATE_CODES[sCode] || `Code ${sCode}`,
      posState: STATE_CODES[pCode] || `Code ${pCode}`,
      rule: isIntra
        ? `Intra-State Supply (Supplier: ${sCode}, POS: ${pCode}) -> Mandatory CGST + SGST (50/50 split), IGST must be 0.`
        : `Inter-State Supply (Supplier: ${sCode}, POS: ${pCode}) -> Mandatory IGST only, CGST & SGST must be 0.`
    };
  }

  /**
   * Checks whether a tax rate is an official Indian GST slab
   * @param {number} rate
   * @returns {boolean}
   */
  function isStandardSlab(rate) {
    const num = Number(rate);
    return STANDARD_TAX_SLABS.includes(num);
  }

  /**
   * Validates HSN/SAC Code format (4, 6, or 8 numeric digits)
   * @param {string|number} code
   * @returns {boolean}
   /**
   * Validates HSN/SAC Code format (4, 6, or 8 numeric digits)
   * @param {string|number} code
   * @returns {boolean}
   */
  function isValidHSN(code) {
    if (!code) return false;
    const str = String(code).trim();
    return /^(?:[0-9]{4}|[0-9]{6}|[0-9]{8})$/.test(str);
  }

  /**
   * Validates Invoice Number under GST Rule 46 (max 16 characters, alphanumeric with '/' and '-')
   * @param {string} invNum
   * @returns {boolean}
   */
  function isValidInvoiceNumber(invNum) {
    if (!invNum || typeof invNum !== "string") return false;
    const trimmed = invNum.trim();
    return trimmed.length > 0 && trimmed.length <= 16 && /^[a-zA-Z0-9\/-]+$/.test(trimmed);
  }

  // Official Indian Income Tax PAN Entity Types (4th Character of PAN)
  const PAN_ENTITY_TYPES = {
    "A": "Association of Persons (AOP)",
    "B": "Body of Individuals (BOI)",
    "C": "Company / Corporation",
    "F": "Partnership Firm / LLP",
    "G": "Government Body / Department",
    "H": "Hindu Undivided Family (HUF)",
    "L": "Local Authority / Municipal Corp",
    "J": "Artificial Juridical Person",
    "P": "Individual / Proprietorship",
    "T": "Trust / Society"
  };

  // Union Territories without Legislature (Subject to UTGST instead of SGST)
  const UTGST_STATE_CODES = ["04", "26", "31", "35", "38", "97"];

  /**
   * Validates embedded PAN structure and entity type inside a GSTIN
   * @param {string} gstin
   * @returns {{isValid: boolean, pan: string, entityChar: string, entityType: string, message: string}}
   */
  function validateGSTINPAN(gstin) {
    if (!gstin || gstin.length < 12) {
      return { isValid: false, pan: "", entityChar: "", entityType: "Unknown", message: "GSTIN too short for PAN extraction" };
    }
    const clean = gstin.trim().toUpperCase();
    const pan = clean.substring(2, 12);
    const panRegex = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;
    if (!panRegex.test(pan)) {
      return { isValid: false, pan, entityChar: "", entityType: "Invalid", message: `Extracted PAN '${pan}' is malformed` };
    }
    const entityChar = pan[3];
    const entityType = PAN_ENTITY_TYPES[entityChar] || "Unknown Entity";
    const isValid = Boolean(PAN_ENTITY_TYPES[entityChar]);
    return {
      isValid,
      pan,
      entityChar,
      entityType,
      message: isValid ? `Valid PAN '${pan}' (${entityType})` : `Invalid 4th PAN character '${entityChar}'`
    };
  }

  /**
   * Checks whether supply location falls under UTGST rather than SGST
   * @param {string} stateCode
   * @returns {boolean}
   */
  function isUTGST(stateCode) {
    const code = String(stateCode || "").trim().padStart(2, "0");
    return UTGST_STATE_CODES.includes(code);
  }

  /**
   * Evaluates mandatory E-Way Bill generation under Rule 138 of CGST Rules
   * Consignment value threshold: ₹50,000 inter-state, or state-specific intra-state
   * @param {number} invoiceTotal
   * @param {boolean} isIntraState
   * @param {string} stateCode
   * @returns {{required: boolean, threshold: number, message: string}}
   */
  function evaluateEWayBillRequirement(invoiceTotal, isIntraState, stateCode) {
    const val = Number(invoiceTotal) || 0;
    // Delhi intra-state threshold is ₹1,00,000; Maharashtra & others standard ₹50,000 (except intra-district)
    const threshold = (isIntraState && (stateCode === "07" || stateCode === "29")) ? 100000 : 50000;
    const required = val >= threshold;
    return {
      required,
      threshold,
      value: val,
      message: required
        ? `Consignment value (₹${val.toLocaleString("en-IN")}) exceeds ₹${threshold.toLocaleString("en-IN")} threshold. E-Way Bill (Part A & B) is mandatory under Rule 138.`
        : `Consignment value is below ₹${threshold.toLocaleString("en-IN")}. E-Way Bill not mandatorily required for movement.`
    };
  }

  /**
   * Section 17(5) Blocked Input Tax Credit (ITC) keyword scanner
   */
  const SECTION_17_5_KEYWORDS = [
    "motor vehicle", "motor car", "vehicle", "car purchase", "aircraft", "vessel",
    "food and beverage", "catering", "outdoor catering", "beauty treatment", "health club",
    "gym membership", "cosmetic surgery", "plastic surgery", "life insurance employee",
    "travel benefits to employee", "club membership", "personal consumption", "free gift",
    "sample gift", "lost goods", "destroyed goods", "written off", "stolen"
  ];

  function checkBlockedITCKeyword(description) {
    if (!description || typeof description !== "string") return null;
    const lower = description.toLowerCase();
    for (const kw of SECTION_17_5_KEYWORDS) {
      if (lower.includes(kw)) {
        return { isBlocked: true, keyword: kw, reason: `Matches blocked ITC item '${kw}' under Section 17(5) of CGST Act.` };
      }
    }
    return null;
  }

  /**
   * Calculates Financial Year and Tax Quarter from date string (YYYY-MM-DD)
   * @param {string} dateStr
   * @returns {{financialYear: string, quarter: string, monthName: string, returnPeriod: string}}
   */
  function getFinancialPeriod(dateStr) {
    const d = dateStr ? new Date(dateStr) : new Date();
    if (isNaN(d.getTime())) {
      return { financialYear: "FY 2025-26", quarter: "Q4", monthName: "March", returnPeriod: "032026" };
    }
    const year = d.getFullYear();
    const month = d.getMonth() + 1; // 1-12
    const fyStart = month >= 4 ? year : year - 1;
    const fyEnd = fyStart + 1;
    const fyShort = `${fyStart}-${String(fyEnd).slice(-2)}`;

    let q = "Q1";
    if (month >= 4 && month <= 6) q = "Q1";
    else if (month >= 7 && month <= 9) q = "Q2";
    else if (month >= 10 && month <= 12) q = "Q3";
    else q = "Q4";

    const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    const monthName = months[month - 1];
    const returnPeriod = `${String(month).padStart(2, "0")}${year}`;

    return {
      financialYear: `FY ${fyShort}`,
      quarter: q,
      monthName,
      returnPeriod
    };
  }

  /**
   * Section 50 Interest Calculator under CGST Act
   * Section 50(1): 18% p.a. for delayed tax payment
   * Section 50(3): 24% p.a. for undue/excess claim of Input Tax Credit
   */
  function calculateSection50Interest(taxAmount, dueDateStr, paymentDateStr, isExcessITC = false) {
    const principal = Math.max(0, Number(taxAmount) || 0);
    const dueDate = new Date(dueDateStr);
    const paymentDate = new Date(paymentDateStr);

    if (isNaN(dueDate.getTime()) || isNaN(paymentDate.getTime()) || paymentDate <= dueDate) {
      return { daysDelayed: 0, interestRate: isExcessITC ? 24 : 18, interestAmount: 0, principal };
    }

    const diffMs = paymentDate.getTime() - dueDate.getTime();
    const daysDelayed = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    const rate = isExcessITC ? 24 : 18;
    const interest = Math.round(((principal * rate * daysDelayed) / (365 * 100)) * 100) / 100;

    return {
      principal,
      daysDelayed,
      interestRate: rate,
      interestAmount: interest,
      totalDue: Math.round((principal + interest) * 100) / 100,
      ruleReference: isExcessITC ? "Section 50(3) CGST Act (24% p.a.)" : "Section 50(1) CGST Act (18% p.a.)"
    };
  }

  /**
   * Converts numerical amount into official Indian legal currency words (Lakhs & Crores)
   * @param {number} amount
   * @returns {string} E.g. "INR One Lakh Twenty Thousand Four Hundred Fifty Only"
   */
  function numberToIndianWords(amount) {
    const num = Math.round(Number(amount) || 0);
    if (num === 0) return "INR Zero Only";

    const a = ['', 'One ', 'Two ', 'Three ', 'Four ', 'Five ', 'Six ', 'Seven ', 'Eight ', 'Nine ', 'Ten ', 'Eleven ', 'Twelve ', 'Thirteen ', 'Fourteen ', 'Fifteen ', 'Sixteen ', 'Seventeen ', 'Eighteen ', 'Nineteen '];
    const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

    function inWords(n) {
      let str = '';
      if (n > 19) {
        str += b[Math.floor(n / 10)] + (n % 10 !== 0 ? ' ' + a[n % 10] : ' ');
      } else {
        str += a[n];
      }
      return str;
    }

    let n = num;
    let words = '';

    const crore = Math.floor(n / 10000000);
    n %= 10000000;
    const lakh = Math.floor(n / 100000);
    n %= 100000;
    const thousand = Math.floor(n / 1000);
    n %= 1000;
    const hundred = Math.floor(n / 100);
    n %= 100;

    if (crore > 0) words += (inWords(crore) + 'Crore ');
    if (lakh > 0) words += (inWords(lakh) + 'Lakh ');
    if (thousand > 0) words += (inWords(thousand) + 'Thousand ');
    if (hundred > 0) words += (inWords(hundred) + 'Hundred ');
    if (n > 0) words += inWords(n);

    return `INR ${words.trim()} Only`;
  }

  /**
   * Generates official NIC E-Invoice JSON Schema (v1.03) payload
   * Specification: einvoice1.gst.gov.in JSON Schema
   * @param {Object} invoice
   * @returns {Object} JSON Schema v1.03
   */
  function generateEInvoiceJSON(invoice) {
    const sGstin = invoice.supplierGstin || "";
    const rGstin = invoice.recipientGstin || "";
    const pos = invoice.placeOfSupply ? invoice.placeOfSupply.substring(0, 2) : (rGstin ? rGstin.substring(0, 2) : "27");
    const isIntra = (sGstin.substring(0, 2) === pos);

    let totAssVal = 0;
    let totCgst = 0;
    let totSgst = 0;
    let totIgst = 0;

    const itemList = (invoice.lineItems || []).map((item, idx) => {
      const taxable = Math.round(((Number(item.qty) || 1) * (Number(item.rate) || 0) - (Number(item.discount) || 0)) * 100) / 100;
      totAssVal += taxable;
      const rate = Number(item.taxRate) || 18;
      const cgst = isIntra ? Math.round((taxable * (rate / 2) / 100) * 100) / 100 : 0;
      const sgst = isIntra ? cgst : 0;
      const igst = !isIntra ? Math.round((taxable * rate / 100) * 100) / 100 : 0;
      totCgst += cgst;
      totSgst += sgst;
      totIgst += igst;

      return {
        ItemNo: String(idx + 1),
        PrdDesc: item.description || "Commercial Supply",
        IsServc: (item.hsn && item.hsn.startsWith("99")) ? "Y" : "N",
        HsnCd: String(item.hsn || "8471"),
        Qty: Number(item.qty) || 1,
        Unit: "NOS",
        UnitPrice: Number(item.rate) || 0,
        TotAmt: (Number(item.qty) || 1) * (Number(item.rate) || 0),
        Discount: Number(item.discount) || 0,
        AssAmt: taxable,
        GstRt: rate,
        IgstAmt: igst,
        CgstAmt: cgst,
        SgstAmt: sgst,
        TotItemVal: Math.round((taxable + cgst + sgst + igst) * 100) / 100
      };
    });

    const totInvVal = Math.round((totAssVal + totCgst + totSgst + totIgst) * 100) / 100;

    return {
      Version: "1.03",
      TranDtls: {
        TaxSch: "GST",
        SupTyp: rGstin ? "B2B" : "B2C",
        RegRev: invoice.isRcm ? "Y" : "N",
        IgstOnIntra: "N"
      },
      DocDtls: {
        Typ: "INV",
        No: invoice.invoiceNumber || "INV/2026/001",
        Dt: invoice.invoiceDate ? invoice.invoiceDate.split("-").reverse().join("/") : "21/09/2026"
      },
      SellerDtls: {
        Gstin: sGstin,
        LglNm: invoice.supplierName || "Registered Supplier",
        Addr1: "Commercial Premises",
        Loc: STATE_CODES[sGstin.substring(0, 2)] || "Commercial Hub",
        Pin: 400001,
        Stcd: sGstin.substring(0, 2)
      },
      BuyerDtls: {
        Gstin: rGstin || "URP",
        LglNm: invoice.recipientName || "Enterprise Buyer",
        Pos: pos,
        Addr1: "Corporate Office",
        Loc: STATE_CODES[pos] || "Business Centre",
        Pin: 110001,
        Stcd: pos
      },
      ItemList: itemList,
      ValDtls: {
        AssVal: totAssVal,
        CgstVal: totCgst,
        SgstVal: totSgst,
        IgstVal: totIgst,
        CesVal: 0,
        StCesVal: 0,
        Discount: 0,
        OthChrg: 0,
        RndOffAmt: 0,
        TotInvVal: totInvVal
      }
    };
  }

  /**
   * Generates standard Tally Prime / ERP 9 Import XML format for Voucher DayBook
   * @param {Object} invoice
   * @returns {string} Tally XML string
   */
  function generateTallyXML(invoice) {
    const sGstin = invoice.supplierGstin || "";
    const rGstin = invoice.recipientGstin || "";
    const invNo = invoice.invoiceNumber || "INV-001";
    const dateFormatted = (invoice.invoiceDate || "2026-09-21").replace(/-/g, "");
    const grandTotal = invoice.lineItems
      ? invoice.lineItems.reduce((acc, it) => acc + ((it.qty * it.rate - (it.discount || 0)) * (1 + (it.taxRate || 18) / 100)), 0)
      : 10000;

    return `<?xml version="1.0" encoding="UTF-8"?>
<ENVELOPE>
  <HEADER>
    <TALLYREQUEST>Import Data</TALLYREQUEST>
  </HEADER>
  <BODY>
    <IMPORTDATA>
      <REQUESTDESC>
        <REPORTNAME>Vouchers</REPORTNAME>
      </REQUESTDESC>
      <REQUESTDATA>
        <TALLYMESSAGE xmlns:UDF="TallyUDF">
          <VOUCHER VCHTYPE="Sales" ACTION="Create" OBJVIEW="Accounting Voucher View">
            <DATE>${dateFormatted}</DATE>
            <VOUCHERNUMBER>${invNo}</VOUCHERNUMBER>
            <PARTYLEDGERNAME>${invoice.recipientName || "Sundry Debtors"}</PARTYLEDGERNAME>
            <PERSISTEDVIEW>Accounting Voucher View</PERSISTEDVIEW>
            <BASICBUYERNAME>${invoice.recipientName || "Buyer Company"}</BASICBUYERNAME>
            <PARTYGSTIN>${rGstin}</PARTYGSTIN>
            <PLACEOFSUPPLY>${invoice.placeOfSupply ? STATE_CODES[invoice.placeOfSupply.substring(0, 2)] : "Maharashtra"}</PLACEOFSUPPLY>
            <ALLLEDGERENTRIES.LIST>
              <LEDGERNAME>${invoice.recipientName || "Sundry Debtors"}</LEDGERNAME>
              <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
              <AMOUNT>-${grandTotal.toFixed(2)}</AMOUNT>
            </ALLLEDGERENTRIES.LIST>
            <ALLLEDGERENTRIES.LIST>
              <LEDGERNAME>GST Sales Account</LEDGERNAME>
              <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
              <AMOUNT>${(grandTotal * 0.847).toFixed(2)}</AMOUNT>
            </ALLLEDGERENTRIES.LIST>
          </VOUCHER>
        </TALLYMESSAGE>
      </REQUESTDATA>
    </IMPORTDATA>
  </BODY>
</ENVELOPE>`;
  }

  /**
   * Generates standard Dynamic UPI Payment URI according to NPCI / RBI specifications
   * @param {{vpa: string, name: string, amount: number, invoiceNo: string, note: string}}
   * @returns {string} upi://pay URI
   */
  function generateUPIPaymentURI({ vpa, name, amount, invoiceNo, note }) {
    const cleanVpa = encodeURIComponent(vpa || "accounts@paytm");
    const cleanName = encodeURIComponent(name || "Merchant Accounts");
    const cleanAmt = Number(amount || 0).toFixed(2);
    const cleanRef = encodeURIComponent(invoiceNo || "INV");
    const cleanNote = encodeURIComponent(note || `GST Invoice ${invoiceNo}`);
    return `upi://pay?pa=${cleanVpa}&pn=${cleanName}&am=${cleanAmt}&cu=INR&tr=${cleanRef}&tn=${cleanNote}`;
  }

  return {
    STATE_CODES,
    UTGST_STATE_CODES,
    STANDARD_TAX_SLABS,
    PAN_ENTITY_TYPES,
    SECTION_17_5_KEYWORDS,
    verifyGSTINChecksum,
    validateGSTINPAN,
    evaluatePlaceOfSupply,
    isUTGST,
    isStandardSlab,
    isValidHSN,
    isValidInvoiceNumber,
    evaluateEWayBillRequirement,
    checkBlockedITCKeyword,
    getFinancialPeriod,
    calculateSection50Interest,
    numberToIndianWords,
    generateEInvoiceJSON,
    generateTallyXML,
    generateUPIPaymentURI
  };
})();

// Export globally for browser usage
window.GSTRules = GSTRules;
