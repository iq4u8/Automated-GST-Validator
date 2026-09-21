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

  return {
    STATE_CODES,
    STANDARD_TAX_SLABS,
    verifyGSTINChecksum,
    evaluatePlaceOfSupply,
    isStandardSlab,
    isValidHSN,
    isValidInvoiceNumber
  };
})();

// Export globally for browser usage
window.GSTRules = GSTRules;
