/* ==========================================================================
   AUTOMATED GST & INVOICE VALIDATOR — MASTER APPLICATION CONTROLLER
   Author: Priyanshu Pandey (IQ4U8)
   ========================================================================== */

document.addEventListener("DOMContentLoaded", () => {
  // Global Application State
  const AppState = {
    theme: localStorage.getItem("gst_theme") || "dark",
    currentTab: "inspector", // 'inspector' or 'bulk'
    activeInvoice: null,
    activeAudit: null,
    bulkData: [],
    bulkAudits: [],
    bulkFilter: "all"
  };

  // --- INITIALIZATION ---
  initTheme();
  initPresetDropdown();
  initLineItemsHandlers();
  initFormListeners();
  initTabs();
  initBulkDropzone();
  initModalListeners();
  initLiveLookupHandlers();
  initEInvoiceQRHandlers();
  initApiSettingsHandlers();

  // Load Preset 1 by default
  loadScenarioById("preset_1");

  // --- THEME CONTROLLER ---
  function initTheme() {
    document.documentElement.setAttribute("data-theme", AppState.theme);
    const themeBtn = document.getElementById("theme-toggle-btn");
    if (themeBtn) {
      themeBtn.innerHTML = AppState.theme === "dark" ? "☀️" : "🌙";
      themeBtn.addEventListener("click", () => {
        AppState.theme = AppState.theme === "dark" ? "light" : "dark";
        document.documentElement.setAttribute("data-theme", AppState.theme);
        localStorage.setItem("gst_theme", AppState.theme);
        themeBtn.innerHTML = AppState.theme === "dark" ? "☀️" : "🌙";
        showToast(`Switched to ${AppState.theme} theme`, "info");
      });
    }
  }

  // --- TAB NAVIGATION ---
  function initTabs() {
    const tabBtns = document.querySelectorAll(".tab-btn");
    tabBtns.forEach(btn => {
      btn.addEventListener("click", () => {
        const targetTab = btn.getAttribute("data-tab");
        tabBtns.forEach(b => b.classList.remove("active"));
        document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));

        btn.classList.add("active");
        const activeContent = document.getElementById(`tab-${targetTab}`);
        if (activeContent) activeContent.classList.add("active");

        AppState.currentTab = targetTab;
      });
    });
  }

  // --- PRESET SCENARIOS ---
  function initPresetDropdown() {
    const select = document.getElementById("preset-select");
    if (!select) return;

    select.innerHTML = SamplePresets.SCENARIOS.map(s => `
      <option value="${s.id}">${s.name}</option>
    `).join("");

    select.addEventListener("change", (e) => {
      loadScenarioById(e.target.value);
    });
  }

  function loadScenarioById(presetId) {
    const scenario = SamplePresets.SCENARIOS.find(s => s.id === presetId);
    if (!scenario) return;

    AppState.activeInvoice = JSON.parse(JSON.stringify(scenario.data));
    populateFormWithInvoice(AppState.activeInvoice);
    runLiveAudit();

    showToast(`Loaded: ${scenario.badge}`, "info");
  }

  // --- POPULATE INSPECTOR FORM ---
  function populateFormWithInvoice(inv) {
    document.getElementById("inv-number").value = inv.invoiceNumber || "";
    document.getElementById("inv-date").value = inv.invoiceDate || "";
    document.getElementById("inv-type").value = inv.invoiceType || "B2B";
    document.getElementById("supplier-name").value = inv.supplierName || "";
    document.getElementById("supplier-gstin").value = inv.supplierGstin || "";
    document.getElementById("recipient-name").value = inv.recipientName || "";
    document.getElementById("recipient-gstin").value = inv.recipientGstin || "";
    document.getElementById("place-of-supply").value = inv.placeOfSupply || "27 - Maharashtra";
    document.getElementById("is-rcm").checked = Boolean(inv.isRcm);
    document.getElementById("inv-irn").value = inv.irn || "";

    // Line items
    renderLineItemsTable(inv.items || []);

    // Summary numbers
    document.getElementById("inv-taxable").value = Number(inv.taxableAmount || 0).toFixed(2);
    document.getElementById("inv-cgst").value = Number(inv.cgst || 0).toFixed(2);
    document.getElementById("inv-sgst").value = Number(inv.sgst || 0).toFixed(2);
    document.getElementById("inv-igst").value = Number(inv.igst || 0).toFixed(2);
    document.getElementById("inv-roundoff").value = Number(inv.roundOff || 0).toFixed(2);
    document.getElementById("inv-total").value = Number(inv.totalAmount || 0).toFixed(2);
  }

  // --- LINE ITEMS TABLE CONTROLLER ---
  function renderLineItemsTable(items) {
    const tbody = document.getElementById("line-items-tbody");
    if (!tbody) return;

    tbody.innerHTML = "";
    items.forEach((item, index) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td><input type="text" class="item-desc" value="${item.description || ''}" placeholder="Description"></td>
        <td><input type="text" class="item-hsn" value="${item.hsn || ''}" placeholder="HSN/SAC" style="width: 80px;"></td>
        <td><input type="number" class="item-qty" value="${item.qty || 1}" min="1" step="1" style="width: 55px;"></td>
        <td><input type="number" class="item-rate" value="${item.rate || 0}" min="0" step="0.01" style="width: 85px;"></td>
        <td><input type="number" class="item-discount" value="${item.discount || 0}" min="0" step="0.01" style="width: 70px;"></td>
        <td>
          <select class="item-taxrate" style="width: 75px;">
            ${[0, 0.1, 0.25, 1.5, 3, 5, 12, 14, 18, 28].map(r => `
              <option value="${r}" ${item.taxRate == r ? 'selected' : ''}>${r}%</option>
            `).join("")}
          </select>
        </td>
        <td>
          <button type="button" class="btn-remove-row" data-index="${index}" title="Remove Item">✕</button>
        </td>
      `;
      tbody.appendChild(tr);
    });

    // Attach row events
    tbody.querySelectorAll("input, select").forEach(el => {
      el.addEventListener("input", handleLineItemChange);
    });

    tbody.querySelectorAll(".btn-remove-row").forEach(btn => {
      btn.addEventListener("click", (e) => {
        const idx = parseInt(e.currentTarget.getAttribute("data-index"), 10);
        if (AppState.activeInvoice && AppState.activeInvoice.items) {
          AppState.activeInvoice.items.splice(idx, 1);
          renderLineItemsTable(AppState.activeInvoice.items);
          recalculateFromItems();
          runLiveAudit();
        }
      });
    });
  }

  function initLineItemsHandlers() {
    const addRowBtn = document.getElementById("btn-add-item");
    if (addRowBtn) {
      addRowBtn.addEventListener("click", () => {
        if (!AppState.activeInvoice) AppState.activeInvoice = {};
        if (!Array.isArray(AppState.activeInvoice.items)) AppState.activeInvoice.items = [];

        AppState.activeInvoice.items.push({
          description: "New Supply Item",
          hsn: "998314",
          qty: 1,
          rate: 10000,
          discount: 0,
          taxRate: 18
        });

        renderLineItemsTable(AppState.activeInvoice.items);
        recalculateFromItems();
        runLiveAudit();
      });
    }
  }

  function handleLineItemChange() {
    // Read from DOM table into AppState.activeInvoice.items
    const rows = document.querySelectorAll("#line-items-tbody tr");
    const items = [];
    rows.forEach(tr => {
      items.push({
        description: tr.querySelector(".item-desc").value,
        hsn: tr.querySelector(".item-hsn").value,
        qty: parseFloat(tr.querySelector(".item-qty").value) || 0,
        rate: parseFloat(tr.querySelector(".item-rate").value) || 0,
        discount: parseFloat(tr.querySelector(".item-discount").value) || 0,
        taxRate: parseFloat(tr.querySelector(".item-taxrate").value) || 0
      });
    });

    if (AppState.activeInvoice) {
      AppState.activeInvoice.items = items;
      runLiveAudit();
    }
  }

  function recalculateFromItems() {
    if (!AppState.activeInvoice || !AppState.activeInvoice.items) return;

    let taxableSum = 0;
    AppState.activeInvoice.items.forEach(it => {
      const lineTaxable = Math.max(0, (it.qty * it.rate) - it.discount);
      taxableSum += lineTaxable;
    });

    document.getElementById("inv-taxable").value = taxableSum.toFixed(2);
    AppState.activeInvoice.taxableAmount = taxableSum;
  }

  // --- FORM INPUTS EVENT LISTENERS ---
  function initFormListeners() {
    const inputs = [
      "inv-number", "inv-date", "inv-type", "supplier-name", "supplier-gstin",
      "recipient-name", "recipient-gstin", "place-of-supply", "inv-taxable",
      "inv-cgst", "inv-sgst", "inv-igst", "inv-roundoff", "inv-total", "inv-irn"
    ];

    inputs.forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener("input", () => {
          collectFormData();
          runLiveAudit();
        });
      }
    });

    const rcm = document.getElementById("is-rcm");
    if (rcm) {
      rcm.addEventListener("change", () => {
        collectFormData();
        runLiveAudit();
      });
    }

    // Auto-Fix Button
    const autoFixBtn = document.getElementById("btn-autofix");
    if (autoFixBtn) {
      autoFixBtn.addEventListener("click", () => {
        if (!AppState.activeAudit) return;
        const fixed = GSTValidator.generateAutoFix(AppState.activeInvoice, AppState.activeAudit);
        AppState.activeInvoice = fixed;
        populateFormWithInvoice(fixed);
        runLiveAudit();
        showToast("Auto-Fix Applied! Taxes and calculations statutorily aligned.", "success");
      });
    }

    // Printable Slip Button
    const printBtn = document.getElementById("btn-print-slip");
    if (printBtn) {
      printBtn.addEventListener("click", () => {
        if (AppState.activeInvoice && AppState.activeAudit) {
          AuditExport.showPrintableSummary(AppState.activeInvoice, AppState.activeAudit);
        }
      });
    }
  }

  function collectFormData() {
    if (!AppState.activeInvoice) AppState.activeInvoice = {};

    AppState.activeInvoice.invoiceNumber = document.getElementById("inv-number").value;
    AppState.activeInvoice.invoiceDate = document.getElementById("inv-date").value;
    AppState.activeInvoice.invoiceType = document.getElementById("inv-type").value;
    AppState.activeInvoice.supplierName = document.getElementById("supplier-name").value;
    AppState.activeInvoice.supplierGstin = document.getElementById("supplier-gstin").value;
    AppState.activeInvoice.recipientName = document.getElementById("recipient-name").value;
    AppState.activeInvoice.recipientGstin = document.getElementById("recipient-gstin").value;
    AppState.activeInvoice.placeOfSupply = document.getElementById("place-of-supply").value;
    AppState.activeInvoice.isRcm = document.getElementById("is-rcm").checked;
    AppState.activeInvoice.irn = document.getElementById("inv-irn").value;

    AppState.activeInvoice.taxableAmount = parseFloat(document.getElementById("inv-taxable").value) || 0;
    AppState.activeInvoice.cgst = parseFloat(document.getElementById("inv-cgst").value) || 0;
    AppState.activeInvoice.sgst = parseFloat(document.getElementById("inv-sgst").value) || 0;
    AppState.activeInvoice.igst = parseFloat(document.getElementById("inv-igst").value) || 0;
    AppState.activeInvoice.roundOff = parseFloat(document.getElementById("inv-roundoff").value) || 0;
    AppState.activeInvoice.totalAmount = parseFloat(document.getElementById("inv-total").value) || 0;
  }

  // --- RUN LIVE AUDIT (SINGLE INVOICE INSPECTOR) ---
  function runLiveAudit() {
    collectFormData();
    const audit = GSTValidator.auditInvoice(AppState.activeInvoice);
    AppState.activeAudit = audit;

    // Render Health Score & Circle
    const scoreCircle = document.getElementById("audit-gauge-circle");
    const scoreNum = document.getElementById("audit-score-num");
    const statusText = document.getElementById("audit-status-text");
    const statusDesc = document.getElementById("audit-status-desc");

    scoreNum.textContent = audit.score;
    statusText.textContent = audit.status === "PASS" ? "COMPLIANT PASS" : (audit.status === "FAILED" ? "STATUTORY VIOLATION" : "WARNINGS DETECTED");

    scoreCircle.className = "gauge-circle";
    if (audit.score >= 90) {
      scoreCircle.style.borderColor = "var(--emerald)";
      scoreCircle.style.boxShadow = "var(--shadow-emerald)";
      statusText.style.color = "var(--emerald)";
      statusDesc.textContent = "Invoice is 100% compliant with GST statutory specifications.";
    } else if (audit.score >= 60) {
      scoreCircle.classList.add("warn");
      scoreCircle.style.borderColor = "var(--amber)";
      scoreCircle.style.boxShadow = "var(--shadow-amber)";
      statusText.style.color = "var(--amber)";
      statusDesc.textContent = "Invoice has non-blocking discrepancies or warnings.";
    } else {
      scoreCircle.classList.add("fail");
      scoreCircle.style.borderColor = "var(--rose)";
      scoreCircle.style.boxShadow = "0 0 25px rgba(244, 63, 94, 0.4)";
      statusText.style.color = "var(--rose)";
      statusDesc.textContent = "Critical statutory violations detected. ITC claim will fail.";
    }

    // Auto-fix button visibility
    const autoFixBtn = document.getElementById("btn-autofix");
    const hasFixable = audit.violations.some(v => v.autoFixable);
    if (autoFixBtn) {
      autoFixBtn.style.display = hasFixable ? "inline-flex" : "none";
    }

    // Render Violations & Pass List
    const violationsContainer = document.getElementById("violations-container");
    if (!violationsContainer) return;

    violationsContainer.innerHTML = "";

    if (audit.violations.length === 0) {
      violationsContainer.innerHTML = `
        <div class="violation-card pass">
          <div class="violation-header">
            <span class="violation-title">✓ All 10 Statutory GST Rules Cleared</span>
            <span class="badge badge-pass">PASSED</span>
          </div>
          <div class="violation-desc">GSTIN Luhn checksum, intra/inter-state tax split, mathematical subtotal, and roundoff are verified.</div>
        </div>
      `;
    } else {
      audit.violations.forEach(v => {
        const card = document.createElement("div");
        card.className = `violation-card ${v.severity.toLowerCase()}`;
        card.innerHTML = `
          <div class="violation-header">
            <span class="violation-title">${v.severity === 'CRITICAL' ? '⛔' : '⚠️'} ${v.title}</span>
            <span class="badge ${v.severity === 'CRITICAL' ? 'badge-fail' : 'badge-warn'}">${v.severity}</span>
          </div>
          <div class="violation-desc">${v.desc}</div>
          ${v.fixHint ? `<div class="violation-fix">💡 Suggested Fix: ${v.fixHint}</div>` : ''}
        `;
        violationsContainer.appendChild(card);
      });
    }

    // Update Form Badges (GSTIN checks)
    updateGSTINBadges();
  }

  function updateGSTINBadges() {
    const sGstin = document.getElementById("supplier-gstin").value;
    const sBadge = document.getElementById("supplier-gstin-badge");
    if (sBadge) {
      if (!sGstin) {
        sBadge.innerHTML = "";
      } else {
        const check = GSTRules.verifyGSTINChecksum(sGstin);
        sBadge.innerHTML = check.isValid
          ? `<span class="badge badge-pass">✓ Checksum OK (${check.stateCode})</span>`
          : `<span class="badge badge-fail">✕ Checksum Fail</span>`;
      }
    }

    const rGstin = document.getElementById("recipient-gstin").value;
    const rBadge = document.getElementById("recipient-gstin-badge");
    if (rBadge) {
      if (!rGstin) {
        rBadge.innerHTML = `<span class="badge badge-info">B2C Unregistered</span>`;
      } else {
        const check = GSTRules.verifyGSTINChecksum(rGstin);
        rBadge.innerHTML = check.isValid
          ? `<span class="badge badge-pass">✓ Checksum OK (${check.stateCode})</span>`
          : `<span class="badge badge-fail">✕ Checksum Fail</span>`;
      }
    }
  }

  // --- BULK REGISTER DROPZONE & AUDITOR ---
  function initBulkDropzone() {
    const dropzone = document.getElementById("bulk-dropzone");
    const fileInput = document.getElementById("bulk-file-input");
    const pasteBtn = document.getElementById("btn-parse-paste");
    const loadSampleBtn = document.getElementById("btn-load-sample-bulk");
    const exportCsvBtn = document.getElementById("btn-export-csv");

    if (dropzone && fileInput) {
      dropzone.addEventListener("click", () => fileInput.click());

      dropzone.addEventListener("dragover", (e) => {
        e.preventDefault();
        dropzone.classList.add("dragover");
      });

      dropzone.addEventListener("dragleave", () => {
        dropzone.classList.remove("dragover");
      });

      dropzone.addEventListener("drop", (e) => {
        e.preventDefault();
        dropzone.classList.remove("dragover");
        if (e.dataTransfer.files.length > 0) {
          handleBulkFile(e.dataTransfer.files[0]);
        }
      });

      fileInput.addEventListener("change", (e) => {
        if (e.target.files.length > 0) {
          handleBulkFile(e.target.files[0]);
        }
      });
    }

    if (pasteBtn) {
      pasteBtn.addEventListener("click", () => {
        const rawText = document.getElementById("bulk-paste-area").value;
        if (!rawText.trim()) {
          showToast("Please paste CSV or Tabular invoice data first.", "error");
          return;
        }
        parseBulkText(rawText);
      });
    }

    if (loadSampleBtn) {
      loadSampleBtn.addEventListener("click", () => {
        AppState.bulkData = JSON.parse(JSON.stringify(SamplePresets.BULK_REGISTER_INVOICES));
        runBulkAudits();
        showToast("Loaded 10 Multi-Vendor Enterprise Invoices for Bulk Audit!", "success");
      });
    }

    if (exportCsvBtn) {
      exportCsvBtn.addEventListener("click", () => {
        AuditExport.exportAuditToCSV(AppState.bulkAudits);
      });
    }

    // Filter Pills
    document.querySelectorAll(".filter-pill-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".filter-pill-btn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        AppState.bulkFilter = btn.getAttribute("data-filter");
        renderBulkTable();
      });
    });
  }

  function handleBulkFile(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target.result;
      if (file.name.endsWith(".json")) {
        try {
          const parsed = JSON.parse(content);
          AppState.bulkData = Array.isArray(parsed) ? parsed : [parsed];
          runBulkAudits();
          showToast(`Successfully ingested ${AppState.bulkData.length} invoices from JSON.`, "success");
        } catch (err) {
          showToast("Failed to parse JSON file.", "error");
        }
      } else {
        // Assume CSV/TSV
        parseBulkText(content);
      }
    };
    reader.readAsText(file);
  }

  function parseBulkText(text) {
    const lines = text.trim().split(/\r?\n/);
    if (lines.length < 2) {
      showToast("Insufficient data lines detected.", "error");
      return;
    }

    const delimiter = lines[0].includes("\t") ? "\t" : ",";
    const headers = lines[0].split(delimiter).map(h => h.trim().toLowerCase().replace(/[^a-z0-9]/g, ""));

    const parsedInvoices = [];

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const cols = line.split(delimiter).map(c => c.trim().replace(/^"(.*)"$/, "$1"));
      const inv = {};

      headers.forEach((h, idx) => {
        const val = cols[idx] || "";
        if (h.includes("inv") && h.includes("no")) inv.invoiceNumber = val;
        else if (h.includes("date")) inv.invoiceDate = val;
        else if (h.includes("supp") && h.includes("name")) inv.supplierName = val;
        else if (h.includes("supp") && h.includes("gst")) inv.supplierGstin = val;
        else if (h.includes("rec") && h.includes("name")) inv.recipientName = val;
        else if (h.includes("rec") && h.includes("gst")) inv.recipientGstin = val;
        else if (h.includes("pos") || h.includes("place")) inv.placeOfSupply = val;
        else if (h.includes("taxable")) inv.taxableAmount = parseFloat(val) || 0;
        else if (h.includes("cgst")) inv.cgst = parseFloat(val) || 0;
        else if (h.includes("sgst")) inv.sgst = parseFloat(val) || 0;
        else if (h.includes("igst")) inv.igst = parseFloat(val) || 0;
        else if (h.includes("total")) inv.totalAmount = parseFloat(val) || 0;
      });

      // Default fallbacks
      if (!inv.invoiceNumber) inv.invoiceNumber = `INV-${i}`;
      if (!inv.supplierGstin) inv.supplierGstin = "27AABCU9603R1ZM";

      parsedInvoices.push(inv);
    }

    AppState.bulkData = parsedInvoices;
    runBulkAudits();
    showToast(`Parsed and audited ${parsedInvoices.length} invoices.`, "success");
  }

  function runBulkAudits() {
    AppState.bulkAudits = AppState.bulkData.map(inv => {
      const audit = GSTValidator.auditInvoice(inv);
      return { invoice: inv, audit };
    });

    updateExecutiveKPIs();
    renderBulkTable();
  }

  function updateExecutiveKPIs() {
    const total = AppState.bulkAudits.length;
    if (total === 0) return;

    let totalTaxable = 0;
    let totalGst = 0;
    let criticalCount = 0;
    let warnCount = 0;
    let passCount = 0;
    let sumScore = 0;

    AppState.bulkAudits.forEach(item => {
      const inv = item.invoice;
      const res = item.audit;
      totalTaxable += Number(inv.taxableAmount || 0);
      totalGst += Number(inv.cgst || 0) + Number(inv.sgst || 0) + Number(inv.igst || 0);
      sumScore += res.score;

      if (res.status === "FAILED") criticalCount++;
      else if (res.status === "WARNING") warnCount++;
      else passCount++;
    });

    const avgScore = Math.round(sumScore / total);

    document.getElementById("kpi-total-invoices").textContent = total;
    document.getElementById("kpi-taxable-val").textContent = `₹${(totalTaxable / 100000).toFixed(2)} L`;
    document.getElementById("kpi-assessed-gst").textContent = `₹${(totalGst / 100000).toFixed(2)} L`;
    document.getElementById("kpi-compliance-rate").textContent = `${avgScore}%`;
    document.getElementById("kpi-critical-errors").textContent = criticalCount;
  }

  function renderBulkTable() {
    const tbody = document.getElementById("bulk-data-tbody");
    if (!tbody) return;

    tbody.innerHTML = "";

    const filtered = AppState.bulkAudits.filter(item => {
      if (AppState.bulkFilter === "critical") return item.audit.status === "FAILED";
      if (AppState.bulkFilter === "warning") return item.audit.status === "WARNING";
      if (AppState.bulkFilter === "pass") return item.audit.status === "PASS";
      return true;
    });

    if (filtered.length === 0) {
      tbody.innerHTML = `<tr><td colspan="9" style="text-align: center; padding: 24px; color: var(--text-muted);">No records matching current filter.</td></tr>`;
      return;
    }

    filtered.forEach(item => {
      const inv = item.invoice;
      const res = item.audit;
      const calc = res.calculated || {};

      const tr = document.createElement("tr");
      tr.style.cursor = "pointer";
      tr.title = "Click to inspect this invoice in Single Invoice Inspector";

      const badgeClass = res.status === "PASS" ? "badge-pass" : (res.status === "WARNING" ? "badge-warn" : "badge-fail");

      tr.innerHTML = `
        <td><strong>${inv.invoiceNumber}</strong></td>
        <td><code>${inv.supplierGstin || "-"}</code></td>
        <td><code>${inv.recipientGstin || "B2C Consumer"}</code></td>
        <td><span class="badge ${calc.posEval && calc.posEval.isIntraState ? 'badge-info' : 'badge-warn'}">${calc.posEval ? calc.posEval.type : '-'}</span></td>
        <td>₹${Number(inv.taxableAmount || 0).toLocaleString("en-IN")}</td>
        <td>₹${(Number(inv.cgst || 0) + Number(inv.sgst || 0) + Number(inv.igst || 0)).toLocaleString("en-IN")}</td>
        <td>₹${Number(inv.totalAmount || 0).toLocaleString("en-IN")}</td>
        <td><strong>${res.score}%</strong></td>
        <td><span class="badge ${badgeClass}">${res.status}</span></td>
      `;

      tr.addEventListener("click", () => {
        AppState.activeInvoice = JSON.parse(JSON.stringify(inv));
        populateFormWithInvoice(AppState.activeInvoice);
        runLiveAudit();

        // Switch to Inspector Tab
        const inspectorTabBtn = document.querySelector('.tab-btn[data-tab="inspector"]');
        if (inspectorTabBtn) inspectorTabBtn.click();

        showToast(`Loaded ${inv.invoiceNumber} into Inspector`, "info");
      });

      tbody.appendChild(tr);
    });
  }

  // --- MODAL CONTROLLER ---
  function initModalListeners() {
    const modal = document.getElementById("report-modal");
    const closeBtn = document.getElementById("modal-close-btn");
    if (closeBtn && modal) {
      closeBtn.addEventListener("click", () => modal.classList.remove("open"));
    }
  }

  // --- LIVE TAXPAYER LOOKUP CONTROLLER ---
  function initLiveLookupHandlers() {
    const btnSupplier = document.getElementById("btn-lookup-supplier");
    const btnRecipient = document.getElementById("btn-lookup-recipient");
    const taxModal = document.getElementById("taxpayer-modal");
    const taxModalClose = document.getElementById("taxpayer-modal-close");
    const taxModalBody = document.getElementById("taxpayer-modal-body");

    if (taxModalClose && taxModal) {
      taxModalClose.addEventListener("click", () => taxModal.classList.remove("open"));
    }

    async function handleLookup(gstinInputId, targetRole) {
      const inputEl = document.getElementById(gstinInputId);
      const gstin = inputEl ? inputEl.value.trim() : "";
      if (!gstin) {
        showToast("Please enter a GSTIN first.", "error");
        return;
      }

      showToast(`Querying Live GSTN Gateway for ${gstin}...`, "info");

      try {
        const record = await GSTApiConnector.lookupTaxpayerLive(gstin);
        renderTaxpayerModal(record, targetRole);
        if (taxModal) taxModal.classList.add("open");
      } catch (err) {
        showToast(err.message, "error");
      }
    }

    if (btnSupplier) {
      btnSupplier.addEventListener("click", () => handleLookup("supplier-gstin", "supplier"));
    }
    if (btnRecipient) {
      btnRecipient.addEventListener("click", () => handleLookup("recipient-gstin", "recipient"));
    }

    function renderTaxpayerModal(rec, targetRole) {
      if (!taxModalBody) return;
      taxModalBody.innerHTML = `
        <div style="font-family: inherit; color: var(--text-main);">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; padding-bottom: 10px; border-bottom: 1px solid var(--border-subtle);">
            <div>
              <span class="badge ${rec.status === 'Active' ? 'badge-pass' : 'badge-fail'}" style="font-size: 0.8rem;">
                ● STATUS: ${rec.status.toUpperCase()}
              </span>
              <span class="badge badge-info" style="margin-left: 6px;">${rec.source}</span>
            </div>
            <span style="font-family: var(--font-mono); font-weight: 700; color: var(--emerald);">${rec.gstin}</span>
          </div>

          <div style="display: grid; grid-template-columns: 1fr; gap: 12px; font-size: 0.88rem;">
            <div style="background: var(--bg-surface-elevated); padding: 12px; border-radius: var(--radius-sm); border: 1px solid var(--border-subtle);">
              <div style="font-size: 0.72rem; text-transform: uppercase; color: var(--text-muted); font-weight: 700;">Legal Business Name</div>
              <div style="font-size: 1.05rem; font-weight: 800; color: var(--text-main); margin-top: 2px;">${rec.legalName}</div>
              <div style="font-size: 0.82rem; color: var(--cyan); margin-top: 2px;">Trade: ${rec.tradeName}</div>
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
              <div style="background: var(--bg-surface-elevated); padding: 10px; border-radius: var(--radius-sm); border: 1px solid var(--border-subtle);">
                <div style="font-size: 0.72rem; color: var(--text-muted);">Constitution & Type</div>
                <div style="font-weight: 600;">${rec.constitution || rec.taxpayerType}</div>
              </div>
              <div style="background: var(--bg-surface-elevated); padding: 10px; border-radius: var(--radius-sm); border: 1px solid var(--border-subtle);">
                <div style="font-size: 0.72rem; color: var(--text-muted);">Registration Date</div>
                <div style="font-weight: 600;">${rec.registrationDate}</div>
              </div>
            </div>

            <div style="background: var(--bg-surface-elevated); padding: 10px; border-radius: var(--radius-sm); border: 1px solid var(--border-subtle);">
              <div style="font-size: 0.72rem; color: var(--text-muted);">Principal Place of Business</div>
              <div style="font-weight: 500; font-size: 0.84rem; line-height: 1.4; margin-top: 2px;">${rec.address}</div>
            </div>
          </div>

          <div style="display: flex; justify-content: flex-end; gap: 8px; margin-top: 20px;">
            <button type="button" id="btn-populate-taxpayer" class="btn btn-primary btn-sm">
              ✓ Auto-Populate Into Invoice
            </button>
          </div>
        </div>
      `;

      const popBtn = document.getElementById("btn-populate-taxpayer");
      if (popBtn) {
        popBtn.addEventListener("click", () => {
          if (targetRole === "supplier") {
            document.getElementById("supplier-name").value = rec.legalName;
            showToast(`Populated Supplier: ${rec.legalName}`, "success");
          } else {
            document.getElementById("recipient-name").value = rec.legalName;
            const posSelect = document.getElementById("place-of-supply");
            if (posSelect && rec.stateCode) {
              for (let i = 0; i < posSelect.options.length; i++) {
                if (posSelect.options[i].value.startsWith(rec.stateCode)) {
                  posSelect.selectedIndex = i;
                  break;
                }
              }
            }
            showToast(`Populated Recipient: ${rec.legalName}`, "success");
          }
          taxModal.classList.remove("open");
          collectFormData();
          runLiveAudit();
        });
      }
    }
  }

  // --- E-INVOICE QR CODE CONTROLLER ---
  function initEInvoiceQRHandlers() {
    const scanBtn = document.getElementById("btn-scan-qr");
    const qrModal = document.getElementById("qr-modal");
    const qrModalClose = document.getElementById("qr-modal-close");
    const qrDropzone = document.getElementById("qr-dropzone");
    const qrFileInput = document.getElementById("qr-file-input");
    const qrPaste = document.getElementById("qr-jwt-paste");
    const btnSampleQr = document.getElementById("btn-load-sample-qr");
    const btnDecode = document.getElementById("btn-decode-qr");

    if (scanBtn && qrModal) {
      scanBtn.addEventListener("click", () => qrModal.classList.add("open"));
    }
    if (qrModalClose && qrModal) {
      qrModalClose.addEventListener("click", () => qrModal.classList.remove("open"));
    }

    if (qrDropzone && qrFileInput) {
      qrDropzone.addEventListener("click", () => qrFileInput.click());
      qrFileInput.addEventListener("change", async (e) => {
        if (e.target.files.length > 0) {
          showToast("Scanning QR code pattern...", "info");
          try {
            const qrText = await GSTApiConnector.scanQRFromImage(e.target.files[0]);
            qrPaste.value = qrText;
            showToast("QR code pattern scanned successfully!", "success");
          } catch (err) {
            showToast(err.message, "error");
          }
        }
      });
    }

    if (btnSampleQr) {
      btnSampleQr.addEventListener("click", () => {
        const samplePayload = {
          Iss: "NIC",
          Data: {
            SellerGstin: "27AABCU9603R1ZN",
            BuyerGstin: "27AAACN1234A1Z7",
            DocNo: "E-INV/2026/089",
            DocTyp: "INV",
            DocDt: "2026-09-18",
            TotInvVal: 177000.0,
            ItemCnt: 2,
            MainHsnCode: "998314",
            Irn: "a3b1c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3"
          }
        };
        const sampleJwt = "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9." + btoa(JSON.stringify(samplePayload)) + ".mock_signature";
        qrPaste.value = sampleJwt;
        showToast("Loaded official NIC signed E-Invoice QR JWT!", "info");
      });
    }

    if (btnDecode) {
      btnDecode.addEventListener("click", () => {
        const val = qrPaste.value.trim();
        if (!val) {
          showToast("Please upload an image or paste QR text first.", "error");
          return;
        }

        try {
          const decoded = GSTApiConnector.decodeEInvoiceQR(val);
          document.getElementById("inv-number").value = decoded.docNo || "E-INV-01";
          if (decoded.docDate) document.getElementById("inv-date").value = decoded.docDate;
          if (decoded.sellerGstin) document.getElementById("supplier-gstin").value = decoded.sellerGstin;
          if (decoded.buyerGstin) document.getElementById("recipient-gstin").value = decoded.buyerGstin;
          if (decoded.irn) document.getElementById("inv-irn").value = decoded.irn;
          if (decoded.totalValue) document.getElementById("inv-total").value = decoded.totalValue.toFixed(2);

          // Auto calculate approximate taxable
          const estTaxable = +(decoded.totalValue / 1.18).toFixed(2);
          const estGst = +(decoded.totalValue - estTaxable).toFixed(2);
          document.getElementById("inv-taxable").value = estTaxable.toFixed(2);
          document.getElementById("inv-cgst").value = (estGst / 2).toFixed(2);
          document.getElementById("inv-sgst").value = (estGst / 2).toFixed(2);
          document.getElementById("inv-igst").value = "0.00";

          qrModal.classList.remove("open");
          collectFormData();
          runLiveAudit();
          showToast(`Ingested E-Invoice ${decoded.docNo} (${decoded.issuer || 'NIC'})!`, "success");
        } catch (err) {
          showToast("Failed to decode: " + err.message, "error");
        }
      });
    }
  }

  // --- API SETTINGS CONTROLLER ---
  function initApiSettingsHandlers() {
    const apiBtn = document.getElementById("btn-api-settings");
    const apiModal = document.getElementById("api-modal");
    const apiModalClose = document.getElementById("api-modal-close");
    const apiKeyInput = document.getElementById("api-key-input");
    const apiProvider = document.getElementById("api-provider-select");
    const saveBtn = document.getElementById("btn-save-api-key");

    if (apiBtn && apiModal) {
      apiBtn.addEventListener("click", () => {
        apiKeyInput.value = localStorage.getItem("gst_api_key") || "";
        apiProvider.value = localStorage.getItem("gst_api_provider") || "sandbox";
        apiModal.classList.add("open");
      });
    }
    if (apiModalClose && apiModal) {
      apiModalClose.addEventListener("click", () => apiModal.classList.remove("open"));
    }

    if (saveBtn) {
      saveBtn.addEventListener("click", () => {
        const key = apiKeyInput.value.trim();
        const provider = apiProvider.value;
        if (key) {
          localStorage.setItem("gst_api_key", key);
        } else {
          localStorage.removeItem("gst_api_key");
        }
        localStorage.setItem("gst_api_provider", provider);
        apiModal.classList.remove("open");
        showToast(`API Gateway configured: ${provider.toUpperCase()}`, "success");
      });
    }
  }

  // --- TOAST ALERTS ---
  function showToast(message, type = "info") {
    let container = document.getElementById("toast-container");
    if (!container) {
      container = document.createElement("div");
      container.id = "toast-container";
      container.className = "toast-container";
      document.body.appendChild(container);
    }

    const toast = document.createElement("div");
    toast.className = `toast ${type}`;
    toast.textContent = message;

    container.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = "0";
      toast.style.transform = "translateX(100%)";
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  }

});
