/* ==========================================================================
   AUTOMATED GST & INVOICE VALIDATOR — ENTERPRISE SAMPLE PRESETS & BATCH SUITES
   Author: Priyanshu Pandey (IQ4U8)
   ========================================================================== */

const SamplePresets = (() => {

  const SCENARIOS = [
    {
      id: "preset_1",
      name: "1. 100% Compliant B2B Tech Invoice (Clean Pass)",
      badge: "CLEAN 100% PASS",
      description: "Statutorily perfect Intra-State B2B tax invoice with verified GSTIN checksums, equal CGST/SGST split, standard 18% slab, and valid HSN codes.",
      data: {
        invoiceNumber: "INV/2026/0842",
        invoiceDate: "2026-09-18",
        invoiceType: "B2B",
        supplierName: "CloudScale Infotech Pvt Ltd",
        supplierGstin: "27AABCU9603R1ZN",
        supplierStateCode: "27",
        recipientName: "Nexus Digital Solutions LLP",
        recipientGstin: "27AAACN1234A1Z7",
        placeOfSupply: "27 - Maharashtra",
        isRcm: false,
        irn: "a3b1c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3",
        taxableAmount: 150000.00,
        cgst: 13500.00,
        sgst: 13500.00,
        igst: 0.00,
        roundOff: 0.00,
        totalAmount: 177000.00,
        items: [
          { description: "Cloud Infrastructure Architecture", hsn: "998314", qty: 1, rate: 90000, discount: 0, taxRate: 18 },
          { description: "DevOps Automated CI/CD Pipeline", hsn: "998315", qty: 2, rate: 30000, discount: 0, taxRate: 18 }
        ]
      }
    },
    {
      id: "preset_2",
      name: "2. Place of Supply Violation (Illegal IGST on Intra-State)",
      badge: "CRITICAL POS MISMATCH",
      description: "Both Supplier and Buyer are in Madhya Pradesh (Code 23), but invoice erroneously charged IGST instead of equal CGST + SGST split.",
      data: {
        invoiceNumber: "SIM/MP/2026/91",
        invoiceDate: "2026-09-16",
        invoiceType: "B2B",
        supplierName: "Satna Industrial Motors Ltd",
        supplierGstin: "23AAACS1429B1Z3",
        supplierStateCode: "23",
        recipientName: "Rewa Engineering Works",
        recipientGstin: "23AAECR4582E1ZI",
        placeOfSupply: "23 - Madhya Pradesh",
        isRcm: false,
        irn: "",
        taxableAmount: 85000.00,
        cgst: 0.00,
        sgst: 0.00,
        igst: 15300.00, // ILLEGAL IGST ON SAME-STATE SUPPLY!
        roundOff: 0.00,
        totalAmount: 100300.00,
        items: [
          { description: "Heavy Duty 3-Phase Induction Motor", hsn: "850152", qty: 1, rate: 85000, discount: 0, taxRate: 18 }
        ]
      }
    },
    {
      id: "preset_3",
      name: "3. Precision Drift & Line Item Discount Mismatch",
      badge: "ARITHMETIC ERROR",
      description: "Line discount was applied on items but invoice summary ignored the discount, creating tax calculation drift and grand total discrepancy.",
      data: {
        invoiceNumber: "APX/DL/26/104",
        invoiceDate: "2026-09-15",
        invoiceType: "B2B",
        supplierName: "Apex Electricals & Hardware",
        supplierGstin: "07AAAAA0000A1Z4",
        supplierStateCode: "07",
        recipientName: "Vertex Construction Corp",
        recipientGstin: "07AAACV9876C1Z1",
        placeOfSupply: "07 - Delhi",
        isRcm: false,
        irn: "",
        taxableAmount: 60000.00, // Should be 50,000 (after 10,000 trade discount)!
        cgst: 5400.00,
        sgst: 5400.00,
        igst: 0.00,
        roundOff: 0.00,
        totalAmount: 70800.00,
        items: [
          { description: "Industrial Copper Wiring (Rolls)", hsn: "854449", qty: 10, rate: 4000, discount: 5000, taxRate: 18 },
          { description: "High-Voltage Distribution Panel", hsn: "853710", qty: 1, rate: 20000, discount: 5000, taxRate: 18 }
        ]
      }
    },
    {
      id: "preset_4",
      name: "4. Corrupted GSTIN Checksum & Non-Standard Tax Rate",
      badge: "CORRUPT GSTIN / SLAB FAIL",
      description: "Supplier GSTIN has a tampered 15th checksum character, plus a line item uses a non-standard 14% tax rate (not in standard GST slabs).",
      data: {
        invoiceNumber: "GEN-GJ-2026-04",
        invoiceDate: "2026-09-14",
        invoiceType: "B2B",
        supplierName: "Genesis Pharma Labs",
        supplierGstin: "24AAACG1234F1Z8", // Corrupt! Expected is 'A'
        supplierStateCode: "24",
        recipientName: "HealthCare First Corp",
        recipientGstin: "29AAACH9876K1ZS",
        placeOfSupply: "29 - Karnataka",
        isRcm: false,
        irn: "",
        taxableAmount: 120000.00,
        cgst: 0.00,
        sgst: 0.00,
        igst: 16800.00,
        roundOff: 0.00,
        totalAmount: 136800.00,
        items: [
          { description: "Specialized Laboratory Diagnostic Kits", hsn: "382200", qty: 20, rate: 6000, discount: 0, taxRate: 14 } // NON-STANDARD SLAB!
        ]
      }
    },
    {
      id: "preset_5",
      name: "5. High-Value B2C Interstate Threshold Violation (>₹2.5L)",
      badge: "RULE 46(F) VIOLATION",
      description: "Interstate consumer sale exceeds ₹2,50,000 threshold without mandated recipient state code & address details.",
      data: {
        invoiceNumber: "TITAN-MUM-88",
        invoiceDate: "2026-09-12",
        invoiceType: "B2C",
        supplierName: "Titan Luxury Furniture Hub",
        supplierGstin: "27AABCU9603R1ZN",
        supplierStateCode: "27",
        recipientName: "Walk-in Retail Customer",
        recipientGstin: "",
        placeOfSupply: "30 - Goa",
        recipientStateCode: "",
        recipientAddress: "",
        isRcm: false,
        irn: "",
        taxableAmount: 340000.00, // EXCEEDS 2.5 LAKH LIMIT!
        cgst: 0.00,
        sgst: 0.00,
        igst: 61200.00,
        roundOff: 0.00,
        totalAmount: 401200.00,
        items: [
          { description: "Handcrafted Teak Dining Suite (10-Seater)", hsn: "940360", qty: 1, rate: 340000, discount: 0, taxRate: 18 }
        ]
      }
    }
  ];

  // Bulk Register Simulation (10 Multi-Vendor Invoices)
  const BULK_REGISTER_INVOICES = [
    {
      invoiceNumber: "INV-2026-101",
      invoiceDate: "2026-09-17",
      supplierName: "Apex Cloud Services",
      supplierGstin: "27AABCU9603R1ZN",
      recipientName: "Zeta Logic Ltd",
      recipientGstin: "27AAACN1234A1Z7",
      placeOfSupply: "27",
      taxableAmount: 50000,
      cgst: 4500,
      sgst: 4500,
      igst: 0,
      totalAmount: 59000,
      taxRate: 18
    },
    {
      invoiceNumber: "INV-2026-102",
      invoiceDate: "2026-09-17",
      supplierName: "Satna Steel Works",
      supplierGstin: "23AAACS1429B1Z3",
      recipientName: "Delta infra",
      recipientGstin: "23AAECR4582E1ZI",
      placeOfSupply: "23",
      taxableAmount: 100000,
      cgst: 0, // ERROR: IGST CHARGED ON INTRASTATE
      sgst: 0,
      igst: 18000,
      totalAmount: 118000,
      taxRate: 18
    },
    {
      invoiceNumber: "INV-2026-103",
      invoiceDate: "2026-09-16",
      supplierName: "Delhi MicroTech",
      supplierGstin: "07AAAAA0000A1Z4",
      recipientName: "Bengaluru Devs",
      recipientGstin: "29AAACH9876K1ZS",
      placeOfSupply: "29",
      taxableAmount: 80000,
      cgst: 0,
      sgst: 0,
      igst: 14400,
      totalAmount: 94400,
      taxRate: 18
    },
    {
      invoiceNumber: "INV-2026-104",
      invoiceDate: "2026-09-16",
      supplierName: "Quantum Agro Chem",
      supplierGstin: "24AAACG1234F1Z8", // Checksum error
      recipientName: "Farmer Co-op",
      recipientGstin: "24AAACN1234A1Z7",
      placeOfSupply: "24",
      taxableAmount: 40000,
      cgst: 2400,
      sgst: 2400,
      igst: 0,
      totalAmount: 44800,
      taxRate: 12
    },
    {
      invoiceNumber: "INV-2026-105",
      invoiceDate: "2026-09-15",
      supplierName: "Blue Ocean Logistics",
      supplierGstin: "27AABCU9603R1ZN",
      recipientName: "Direct Retailer",
      recipientGstin: "",
      placeOfSupply: "27",
      taxableAmount: 25000,
      cgst: 2250,
      sgst: 2250,
      igst: 0,
      totalAmount: 29500,
      taxRate: 18
    },
    {
      invoiceNumber: "INV-2026-106",
      invoiceDate: "2026-09-15",
      supplierName: "Arunachal Tools",
      supplierGstin: "12AAACI1681G1Z0",
      recipientName: "Patna Machineries",
      recipientGstin: "10AAACN1234A1Z4",
      placeOfSupply: "10",
      taxableAmount: 150000,
      cgst: 0,
      sgst: 0,
      igst: 27000,
      totalAmount: 177000,
      taxRate: 18
    },
    {
      invoiceNumber: "INV-2026-107",
      invoiceDate: "2026-09-14",
      supplierName: "Chennai Tech Parks",
      supplierGstin: "33AAAAA0000A1Z4",
      recipientName: "Local Vendor Hub",
      recipientGstin: "33AAACN1234A1Z7",
      placeOfSupply: "33",
      taxableAmount: 72000,
      cgst: 6480,
      sgst: 6000, // ASYMMETRIC CGST/SGST SPLIT!
      igst: 0,
      totalAmount: 84480,
      taxRate: 18
    },
    {
      invoiceNumber: "INV-2026-108",
      invoiceDate: "2026-09-14",
      supplierName: "Jaipur Marble Exporters",
      supplierGstin: "08AAAAA0000A1Z2",
      recipientName: "Gujarat Ceramics",
      recipientGstin: "24AAACG1234F1ZA",
      placeOfSupply: "24",
      taxableAmount: 220000,
      cgst: 0,
      sgst: 0,
      igst: 61600,
      totalAmount: 281600,
      taxRate: 28
    },
    {
      invoiceNumber: "INV-2026-109",
      invoiceDate: "2026-09-13",
      supplierName: "Indore FMCG Distributors",
      supplierGstin: "23AAACS1429B1Z3",
      recipientName: "Bhopal Mart",
      recipientGstin: "23AAECR4582E1ZI",
      placeOfSupply: "23",
      taxableAmount: 18000,
      cgst: 450,
      sgst: 450,
      igst: 0,
      totalAmount: 18900,
      taxRate: 5
    },
    {
      invoiceNumber: "INV-2026-110",
      invoiceDate: "2026-09-12",
      supplierName: "Mumbai Digital Ads",
      supplierGstin: "27AABCU9603R1ZN",
      recipientName: "Pune Electronics",
      recipientGstin: "27AAACN1234A1Z7",
      placeOfSupply: "27",
      taxableAmount: 31000,
      cgst: 2790,
      sgst: 2790,
      igst: 0,
      totalAmount: 36580,
      taxRate: 18
    }
  ];

  return {
    SCENARIOS,
    BULK_REGISTER_INVOICES
  };
})();

window.SamplePresets = SamplePresets;
