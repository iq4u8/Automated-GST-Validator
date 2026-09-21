# Automated GST & Invoice Validator (GSTAlign)

<div align="center">
  <img src="favicon.svg" width="90" height="90" alt="GSTAlign Logo">
  <h3>Autonomous FinTech Compliance & Statutory Invoice Audit Engine</h3>
  <p>100% Client-Side · Zero-Knowledge Privacy · Real-Time Modulo 36 GSTIN & POS Auditing</p>

  <p>
    <img src="https://img.shields.io/badge/Architecture-100%25%20Zero--Knowledge-10b981?style=flat-square" alt="Zero-Knowledge">
    <img src="https://img.shields.io/badge/GSTIN%20Algorithm-Modulo%2036%20Luhn-06b6d4?style=flat-square" alt="Mod 36">
    <img src="https://img.shields.io/badge/Statutory%20Rules-10%20Rules%20Verified-8b5cf6?style=flat-square" alt="10 Rules">
    <img src="https://img.shields.io/badge/Deployment-Ready%20for%20Vercel-000000?style=flat-square&logo=vercel" alt="Vercel Ready">
  </p>
</div>

---

## ⚡ Overview

**Automated GST & Invoice Validator (GSTAlign)** is an enterprise-grade FinTech tool designed to audit Indian Goods & Services Tax (GST) invoices against statutory tax acts, CGST/SGST/IGST rules, and arithmetic precision tolerances.

Traditional accounting entry often suffers from human error: incorrect tax type assignment (charging IGST within the same state), malformed GSTINs, non-standard tax slabs, and rounding drift that results in Input Tax Credit (ITC) rejection by the GST Network (GSTN). 

GSTAlign performs a **10-pass algorithmic audit** directly inside the browser in microseconds, ensuring that financial data never leaves the user's workstation.

---

## 🛡️ 10 Statutory Compliance Rules Enforced

1. **Modulo 36 Luhn-Variant GSTIN Checksum:** Official Indian GSTN checksum calculation on the 15th character and valid 2-digit state code validation (Codes 01 to 38).
2. **Place of Supply (POS) Engine:** 
   - **Intra-State Supply:** Mandatory 50/50 split between CGST and SGST. Declared IGST is flagged as a critical statutory violation.
   - **Inter-State Supply:** Mandatory IGST. Charging local CGST/SGST is flagged and blocked.
3. **Statutory Tax Slabs:** Validates all line items against official Indian GST rates (`0%`, `0.1%`, `0.25%`, `1.5%`, `3%`, `5%`, `12%`, `18%`, `28%`). Flags arbitrary or illegal tax rates.
4. **Line Item Mathematics:** Cross-verifies `Quantity × Rate − Trade Discount` against declared taxable values.
5. **Tax Slicing & Precision:** Recalculates exact statutory tax sums on line-level items and identifies rate distortions.
6. **Statutory Round-Off Audit (Rule 36(4)):** Enforces standard ±₹1.00 variance tolerance and verifies grand totals.
7. **HSN / SAC Code Structure:** Enforces 4, 6, or 8 numeric digits syntax per statutory reporting standards.
8. **Section 31 Invoice Number & Date Check:** Enforces 16-character alphanumeric rules (with `/` and `-`) and blocks future-dated tax invoices.
9. **High-Value B2C Interstate Threshold (Rule 46(f) Proviso):** Mandatory recipient state code & address capture for inter-state consumer sales exceeding ₹2,50,000.
10. **Reverse Charge Mechanism (RCM) & E-Invoice IRN Check:** Flags recipient tax liability under RCM and validates 64-character SHA-256 E-Invoice hashes.

---

## 🚀 Key Features

- ⚡ **Dual Auditing Workflows:**
  - **Live Single Invoice Inspector:** Real-time form with dynamic line item addition, instant diagnostic badges, and **"1-Click Auto-Fix"** to auto-rebalance taxes and correct rounding discrepancies.
  - **Bulk Register & CSV Auditor:** Ingest multi-vendor invoice registers via drag-and-drop CSV, JSON, or direct clipboard copy-paste from Excel / Tally DayBooks.
- 🎯 **Executive Health Cockpit:** Real-time compliance score (0–100%), assessed taxable metrics, and critical violation counters.
- 🧪 **5 Preloaded Enterprise Scenarios:** Instant demonstration presets showcasing clean passes, POS conflicts, mathematical drift, corrupted checksums, and high-value B2C violations.
- 📊 **Executive Exports:** Download filtered discrepancy audit reports in CSV format or generate a printable Executive Compliance Certificate.
- 🎨 **FinTech Emerald Aesthetic:** Glassmorphism UI with fluid animations, responsive layouts, and dynamic Dark / Light theme switching.

---

## 🛠️ Technology Stack

- **Core Logic:** Vanilla JavaScript (ES6+), pure client-side execution
- **Styling:** Vanilla CSS3 (Custom Design Tokens, Flexbox, CSS Grid)
- **Security & Privacy:** Zero-Knowledge architecture (zero external network requests for financial data)
- **Deployment:** Vercel Static Hosting (`vercel.json`)

---

## 📂 Project Structure

```
Automated GST & Invoice Validator/
├── index.html                 # Semantic Cockpit HTML
├── favicon.svg                # Vector Tax Shield Icon
├── vercel.json                # Static hosting & security configuration
├── README.md                  # Documentation & statutory specifications
├── css/
│   ├── tokens.css             # FinTech Emerald design system & dark/light themes
│   ├── layout.css             # Grid layout, responsive containers, tabs
│   └── components.css         # Health gauges, badge pills, line-items table, modal
└── js/
    ├── gstRules.js            # Modulo 36 Luhn checksum, state codes, slab rules
    ├── validator.js           # Multi-pass statutory audit & 1-Click Auto-Fix engine
    ├── sampleData.js          # 5 enterprise test presets + 10-invoice bulk register
    ├── export.js              # CSV discrepancy exporter & printable audit slip
    └── app.js                 # UI controllers, dropzone, table filters, toasts
```

---

## 💻 Local Setup & Quick Start

1. Clone or navigate to the project directory:
   ```bash
   cd "Automated GST & Invoice Validator"
   ```
2. Open `index.html` directly in any modern browser:
   ```bash
   start index.html
   ```
   *No build steps, node_modules, or server setup required.*

---

## 👤 Author

**Priyanshu Pandey (IQ4U8)**  
- Portfolio: [iq4u8.vercel.app](https://iq4u8.vercel.app)  
- GitHub: [@iq4u8](https://github.com/iq4u8)  
- LinkedIn: [linkedin.com/in/iq4u8](https://linkedin.com/in/iq4u8)
