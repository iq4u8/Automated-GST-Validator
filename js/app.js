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
  initPlaceOfSupplyDropdown();
  initWorkstationActions();
  initLineItemsHandlers();
  initFormListeners();
  initTabs();
  initHistoryTab();
  initBulkDropzone();
  initModalListeners();
  initLiveLookupHandlers();
  initEInvoiceQRHandlers();
  initApiSettingsHandlers();
  initUPIQRModal();
  initExportNICJSON();
  initExportTallyXML();
  initKeyboardShortcuts();
  initReconciliationTab();
  initToolsTab();
  initBulkAutoFix();

  // Load Preset 1 by default
  loadScenarioById("preset_1");

  // --- PLACE OF SUPPLY INITIALIZATION ---
  function initPlaceOfSupplyDropdown() {
    const posSelect = document.getElementById("place-of-supply");
    if (!posSelect) return;
    posSelect.innerHTML = `<option value="">-- Select Place of Supply (State) --</option>` + Object.entries(GSTRules.STATE_CODES).map(([code, name]) => `
      <option value="${code} - ${name}">${code} - ${name}</option>
    `).join("");
    posSelect.addEventListener("change", () => {
      collectFormData();
      updateSupplyNatureBadge();
      runLiveAudit();
    });
  }

  function updateSupplyNatureBadge() {
    const sGstin = document.getElementById("supplier-gstin").value.trim();
    const posSelect = document.getElementById("place-of-supply");
    const posVal = posSelect && posSelect.value ? posSelect.value.substring(0, 2) : "";
    const badge = document.getElementById("supply-nature-badge");
    if (!badge) return;

    if (!sGstin || !posVal) {
      badge.className = "badge badge-info";
      badge.textContent = "SUPPLY NATURE PENDING";
      return;
    }

    const sCode = sGstin.substring(0, 2);
    const isIntra = (sCode === posVal);
    badge.className = `badge ${isIntra ? 'badge-info' : 'badge-warn'}`;
    badge.textContent = isIntra ? "INTRA-STATE (CGST+SGST)" : "INTER-STATE (IGST)";
  }

  // --- THEME CONTROLLER (LOCKED TO CLASSIC WARM WHITE / IVORY) ---
  function initTheme() {
    document.documentElement.removeAttribute("data-theme");
  }

  // --- TAB NAVIGATION (4 WORKSPACES) ---
  function initTabs() {
    const tabBtns = document.querySelectorAll(".tab-btn");
    tabBtns.forEach(btn => {
      btn.addEventListener("click", () => {
        const targetTab = btn.getAttribute("data-tab");
        switchToTab(targetTab);
      });
    });
  }

  function switchToTab(tabId) {
    const tabBtns = document.querySelectorAll(".tab-btn");
    tabBtns.forEach(b => {
      if (b.getAttribute("data-tab") === tabId) b.classList.add("active");
      else b.classList.remove("active");
    });

    document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));
    const activeContent = document.getElementById(`tab-${tabId}`);
    if (activeContent) activeContent.classList.add("active");

    AppState.currentTab = tabId;

    if (tabId === "scenarios") {
      renderScenariosGrid();
    } else if (tabId === "history") {
      renderAuditHistory();
    } else if (tabId === "recon") {
      if (!AppState.reconResults) loadSampleReconData();
    } else if (tabId === "tools") {
      recalcInterestTool();
      recalcReverseGST();
      recalcEWayBill();
    }
  }

  // --- WORKSTATION ACTIONS (NEW INVOICE, FILE UPLOAD, SAVE AUDIT) ---
  function initWorkstationActions() {
    // New Invoice buttons
    const newBtns = ["btn-header-new", "btn-new-invoice"];
    newBtns.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.addEventListener("click", createNewBlankInvoice);
    });

    // Upload Invoice File buttons
    const uploadBtns = ["btn-header-upload", "btn-upload-file"];
    const fileInput = document.getElementById("single-invoice-file-input");
    uploadBtns.forEach(id => {
      const el = document.getElementById(id);
      if (el && fileInput) {
        el.addEventListener("click", () => fileInput.click());
      }
    });

    if (fileInput) {
      fileInput.addEventListener("change", (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
          parseAndLoadSingleInvoiceFile(event.target.result, file.name);
          fileInput.value = "";
        };
        reader.readAsText(file);
      });
    }

    // Save Audit button
    const saveBtn = document.getElementById("btn-save-audit");
    if (saveBtn) {
      saveBtn.addEventListener("click", saveCurrentAuditToHistory);
    }
  }

  function createNewBlankInvoice() {
    AppState.activeInvoice = {
      invoiceNumber: "",
      invoiceDate: "",
      invoiceType: "B2B",
      ewayBillNo: "",
      supplierName: "",
      supplierGstin: "",
      supplierStateCode: "",
      recipientName: "",
      recipientGstin: "",
      placeOfSupply: "",
      isRcm: false,
      irn: "",
      taxableAmount: 0,
      cgst: 0,
      sgst: 0,
      igst: 0,
      roundOff: 0,
      totalAmount: 0,
      items: [
        { description: "", hsn: "", qty: 1, rate: "", discount: "", taxRate: 18 }
      ]
    };
    populateFormWithInvoice(AppState.activeInvoice);
    runLiveAudit();
    switchToTab("inspector");
    showToast("Opened clean blank invoice. Fill in details to audit.", "info");
  }

  function parseAndLoadSingleInvoiceFile(content, fileName) {
    try {
      let parsed = null;
      if (fileName.endsWith(".json")) {
        const json = JSON.parse(content);
        // If wrapped in e-invoice schema or custom format
        if (json.DocDtls || json.SellerDtls) {
          parsed = {
            invoiceNumber: (json.DocDtls && json.DocDtls.No) || "INV-IMPORTED",
            invoiceDate: (json.DocDtls && json.DocDtls.Dt) || new Date().toISOString().slice(0, 10),
            invoiceType: (json.DocDtls && json.DocDtls.Typ) || "B2B",
            supplierName: (json.SellerDtls && json.SellerDtls.LglNm) || "",
            supplierGstin: (json.SellerDtls && json.SellerDtls.Gstin) || "",
            recipientName: (json.BuyerDtls && json.BuyerDtls.LglNm) || "",
            recipientGstin: (json.BuyerDtls && json.BuyerDtls.Gstin) || "",
            placeOfSupply: (json.BuyerDtls && json.BuyerDtls.Pos) || "27",
            taxableAmount: (json.ValDtls && json.ValDtls.AssVal) || 0,
            cgst: (json.ValDtls && json.ValDtls.CgstVal) || 0,
            sgst: (json.ValDtls && json.ValDtls.SgstVal) || 0,
            igst: (json.ValDtls && json.ValDtls.IgstVal) || 0,
            totalAmount: (json.ValDtls && json.ValDtls.TotInvVal) || 0,
            items: Array.isArray(json.ItemList) ? json.ItemList.map(it => ({
              description: it.PrdDesc || it.ItemDesc || "Imported Item",
              hsn: it.HsnCd || "998314",
              qty: it.Qty || 1,
              rate: it.UnitPrice || 0,
              discount: it.Discount || 0,
              taxRate: it.GstRt || 18
            })) : []
          };
        } else {
          parsed = json;
        }
      } else {
        // Assume CSV
        const lines = content.trim().split(/\r?\n/);
        if (lines.length >= 2) {
          const delimiter = lines[0].includes("\t") ? "\t" : ",";
          const h = lines[0].split(delimiter).map(s => s.trim().toLowerCase().replace(/[^a-z0-9]/g, ""));
          const c = lines[1].split(delimiter).map(s => s.trim().replace(/^"(.*)"$/, "$1"));
          parsed = {
            invoiceNumber: c[h.findIndex(x => x.includes("no") || x.includes("inv"))] || "INV-001",
            invoiceDate: c[h.findIndex(x => x.includes("date"))] || new Date().toISOString().slice(0, 10),
            supplierName: c[h.findIndex(x => x.includes("supp") && x.includes("name"))] || "",
            supplierGstin: c[h.findIndex(x => x.includes("supp") && x.includes("gst"))] || "",
            recipientName: c[h.findIndex(x => x.includes("rec") && x.includes("name"))] || "",
            recipientGstin: c[h.findIndex(x => x.includes("rec") && x.includes("gst"))] || "",
            placeOfSupply: c[h.findIndex(x => x.includes("pos") || x.includes("place"))] || "27",
            taxableAmount: parseFloat(c[h.findIndex(x => x.includes("taxable"))]) || 0,
            cgst: parseFloat(c[h.findIndex(x => x.includes("cgst"))]) || 0,
            sgst: parseFloat(c[h.findIndex(x => x.includes("sgst"))]) || 0,
            igst: parseFloat(c[h.findIndex(x => x.includes("igst"))]) || 0,
            totalAmount: parseFloat(c[h.findIndex(x => x.includes("total"))]) || 0,
            items: []
          };
        }
      }

      if (!parsed) throw new Error("Could not parse file format.");

      AppState.activeInvoice = parsed;
      populateFormWithInvoice(parsed);
      runLiveAudit();
      switchToTab("inspector");
      showToast(`Loaded invoice from ${fileName}`, "success");
    } catch (err) {
      showToast("Error parsing file: " + err.message, "error");
    }
  }

  // --- DEDICATED SCENARIOS & CASE STUDIES TAB ---
  function renderScenariosGrid() {
    const grid = document.getElementById("scenarios-grid");
    if (!grid) return;

    grid.innerHTML = SamplePresets.SCENARIOS.map(s => {
      const inv = s.data;
      const totalTax = (Number(inv.cgst || 0) + Number(inv.sgst || 0) + Number(inv.igst || 0));
      const badgeClass = s.id === 'preset_1' ? 'badge-pass' : 'badge-fail';

      return `
        <div class="scenario-card">
          <div>
            <div class="scenario-card-header">
              <div class="scenario-card-title">${s.name}</div>
              <span class="badge ${badgeClass}">${s.badge}</span>
            </div>
            <div class="scenario-statute-tag">
              ${s.id === 'preset_1' ? 'Section 16 Clean Pass' : (s.id === 'preset_2' ? 'Section 8 IGST Act' : (s.id === 'preset_3' ? 'Trade Discount Rule' : (s.id === 'preset_4' ? 'Modulo 36 Luhn Check' : 'Rule 46(f) Limit')))}
            </div>
            <p class="scenario-card-desc" style="margin-top: 10px;">${s.description}</p>
          </div>

          <div style="display: flex; flex-direction: column; gap: 10px;">
            <div class="scenario-stats-pill">
              <span>Taxable: <strong>₹${Number(inv.taxableAmount || 0).toLocaleString("en-IN")}</strong></span>
              <span>GST: <strong>₹${totalTax.toLocaleString("en-IN")}</strong></span>
              <span>Total: <strong>₹${Number(inv.totalAmount || 0).toLocaleString("en-IN")}</strong></span>
            </div>
            <button type="button" class="btn btn-primary btn-sm btn-load-scenario" data-id="${s.id}" style="width: 100%;">
              Load into Workstation & Audit →
            </button>
          </div>
        </div>
      `;
    }).join("");

    grid.querySelectorAll(".btn-load-scenario").forEach(btn => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-id");
        loadScenarioById(id);
        switchToTab("inspector");
        window.scrollTo({ top: 0, behavior: "smooth" });
      });
    });
  }

  function loadScenarioById(presetId) {
    const scenario = SamplePresets.SCENARIOS.find(s => s.id === presetId);
    if (!scenario) return;

    AppState.activeInvoice = JSON.parse(JSON.stringify(scenario.data));
    populateFormWithInvoice(AppState.activeInvoice);
    runLiveAudit();

    showToast(`Loaded benchmark case: ${scenario.name}`, "info");
  }

  // --- SAVED AUDITS HISTORY TAB ---
  function initHistoryTab() {
    updateHistoryBadgeCount();

    const clearBtn = document.getElementById("btn-clear-history");
    if (clearBtn) {
      clearBtn.addEventListener("click", () => {
        if (confirm("Are you sure you want to clear all saved audits from browser history?")) {
          localStorage.removeItem("gst_saved_audits");
          renderAuditHistory();
          updateHistoryBadgeCount();
          showToast("Audit history cleared.", "info");
        }
      });
    }

    const exportCsvBtn = document.getElementById("btn-export-history-csv");
    if (exportCsvBtn) {
      exportCsvBtn.addEventListener("click", () => {
        const history = JSON.parse(localStorage.getItem("gst_saved_audits") || "[]");
        if (history.length === 0) {
          showToast("No saved audits to export.", "warning");
          return;
        }
        const mapped = history.map(h => ({
          invoice: h.invoice,
          audit: {
            score: h.score,
            status: h.status,
            violations: (h.invoice.violations || []).map(t => ({ severity: "SAVED", title: t })),
            calculated: { posEval: { type: h.invoice.placeOfSupply || "Standard" } }
          }
        }));
        AuditExport.exportAuditToCSV(mapped);
      });
    }
  }

  function saveCurrentAuditToHistory() {
    if (!AppState.activeInvoice) return;

    const history = JSON.parse(localStorage.getItem("gst_saved_audits") || "[]");
    const entry = {
      id: "AUDIT_" + Date.now(),
      timestamp: new Date().toISOString(),
      invoice: JSON.parse(JSON.stringify(AppState.activeInvoice)),
      score: AppState.activeAudit ? AppState.activeAudit.score : 0,
      status: AppState.activeAudit ? AppState.activeAudit.status : "UNKNOWN",
      violationsCount: AppState.activeAudit ? AppState.activeAudit.violations.length : 0
    };

    history.unshift(entry);
    if (history.length > 50) history.pop(); // Cap at 50

    localStorage.setItem("gst_saved_audits", JSON.stringify(history));
    updateHistoryBadgeCount();
    showToast(`Saved Invoice #${entry.invoice.invoiceNumber || 'Untitled'} to Audit History.`, "success");
  }

  function updateHistoryBadgeCount() {
    const history = JSON.parse(localStorage.getItem("gst_saved_audits") || "[]");
    const count = history.length;
    const badge = document.getElementById("history-badge-count");
    const headerCount = document.getElementById("history-header-count");
    if (badge) badge.textContent = count;
    if (headerCount) headerCount.textContent = `${count} Invoice${count === 1 ? '' : 's'}`;
  }

  function renderAuditHistory() {
    const tbody = document.getElementById("history-data-tbody");
    if (!tbody) return;

    const history = JSON.parse(localStorage.getItem("gst_saved_audits") || "[]");
    updateHistoryBadgeCount();

    if (history.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="9" style="text-align: center; padding: 24px; color: var(--text-muted);">
            No saved audits yet. Audit an invoice in the <strong>Workstation</strong> and click <strong>"💾 Save Audit"</strong>.
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = history.map((h, idx) => {
      const inv = h.invoice;
      const dateStr = new Date(h.timestamp).toLocaleDateString("en-IN") + " " + new Date(h.timestamp).toLocaleTimeString("en-IN", { hour: '2-digit', minute: '2-digit' });
      const badgeClass = h.status === "PASS" ? "badge-pass" : (h.status === "WARNING" ? "badge-warn" : "badge-fail");

      return `
        <tr>
          <td><span style="font-size: 0.78rem; color: var(--text-muted);">${dateStr}</span></td>
          <td><strong>${inv.invoiceNumber || '-'}</strong></td>
          <td>${inv.supplierName || inv.supplierGstin || '-'}</td>
          <td>${inv.recipientName || inv.recipientGstin || 'B2C Retail'}</td>
          <td>${inv.placeOfSupply || '-'}</td>
          <td>₹${Number(inv.totalAmount || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>
          <td><strong>${h.score}%</strong></td>
          <td><span class="badge ${badgeClass}">${h.status}</span></td>
          <td>
            <div style="display: flex; gap: 6px;">
              <button type="button" class="btn btn-secondary btn-sm btn-load-history" data-idx="${idx}" title="Load this invoice into Workstation">
                Inspect
              </button>
              <button type="button" class="btn btn-secondary btn-sm btn-del-history" data-idx="${idx}" title="Delete record" style="color: var(--rose-red);">
                ✕
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join("");

    tbody.querySelectorAll(".btn-load-history").forEach(btn => {
      btn.addEventListener("click", () => {
        const idx = parseInt(btn.getAttribute("data-idx"), 10);
        const item = history[idx];
        if (item && item.invoice) {
          AppState.activeInvoice = JSON.parse(JSON.stringify(item.invoice));
          populateFormWithInvoice(AppState.activeInvoice);
          runLiveAudit();
          switchToTab("inspector");
          showToast(`Loaded Invoice #${item.invoice.invoiceNumber} from history`, "info");
        }
      });
    });

    tbody.querySelectorAll(".btn-del-history").forEach(btn => {
      btn.addEventListener("click", () => {
        const idx = parseInt(btn.getAttribute("data-idx"), 10);
        history.splice(idx, 1);
        localStorage.setItem("gst_saved_audits", JSON.stringify(history));
        renderAuditHistory();
      });
    });
  }

  // --- POPULATE INSPECTOR FORM ---
  function populateFormWithInvoice(inv) {
    document.getElementById("inv-number").value = inv.invoiceNumber || "";
    document.getElementById("inv-date").value = inv.invoiceDate || "";
    document.getElementById("inv-type").value = inv.invoiceType || "B2B";
    const ewbInput = document.getElementById("inv-eway-bill");
    if (ewbInput) ewbInput.value = inv.ewayBillNo || "";
    document.getElementById("supplier-name").value = inv.supplierName || "";
    document.getElementById("supplier-gstin").value = inv.supplierGstin || "";
    document.getElementById("recipient-name").value = inv.recipientName || "";
    document.getElementById("recipient-gstin").value = inv.recipientGstin || "";
    
    // Select Place of Supply by code prefix
    const posSelect = document.getElementById("place-of-supply");
    if (posSelect) {
      if (!inv.placeOfSupply) {
        posSelect.value = "";
      } else {
        const posTarget = String(inv.placeOfSupply).substring(0, 2);
        let matched = false;
        for (let i = 0; i < posSelect.options.length; i++) {
          if (posSelect.options[i].value.startsWith(posTarget)) {
            posSelect.selectedIndex = i;
            matched = true;
            break;
          }
        }
        if (!matched) posSelect.value = "";
      }
    }
    updateSupplyNatureBadge();

    document.getElementById("is-rcm").checked = Boolean(inv.isRcm);
    document.getElementById("inv-irn").value = inv.irn || "";

    // Line items
    renderLineItemsTable(inv.items || []);

    // Summary numbers - leave blank if this is an empty draft
    const isBlank = (!inv.supplierGstin && !inv.recipientGstin && (!inv.taxableAmount || Number(inv.taxableAmount) === 0));
    document.getElementById("inv-taxable").value = (!isBlank && inv.taxableAmount !== undefined && inv.taxableAmount !== null && inv.taxableAmount !== "") ? Number(inv.taxableAmount || 0).toFixed(2) : "";
    document.getElementById("inv-cgst").value = (!isBlank && inv.cgst !== undefined && inv.cgst !== null && inv.cgst !== "") ? Number(inv.cgst || 0).toFixed(2) : "";
    document.getElementById("inv-sgst").value = (!isBlank && inv.sgst !== undefined && inv.sgst !== null && inv.sgst !== "") ? Number(inv.sgst || 0).toFixed(2) : "";
    document.getElementById("inv-igst").value = (!isBlank && inv.igst !== undefined && inv.igst !== null && inv.igst !== "") ? Number(inv.igst || 0).toFixed(2) : "";
    document.getElementById("inv-roundoff").value = (!isBlank && inv.roundOff !== undefined && inv.roundOff !== null && inv.roundOff !== "") ? Number(inv.roundOff || 0).toFixed(2) : "";
    document.getElementById("inv-total").value = (!isBlank && inv.totalAmount !== undefined && inv.totalAmount !== null && inv.totalAmount !== "") ? Number(inv.totalAmount || 0).toFixed(2) : "";
  }

  // --- LINE ITEMS TABLE CONTROLLER ---
  function renderLineItemsTable(items) {
    const tbody = document.getElementById("line-items-tbody");
    if (!tbody) return;

    tbody.innerHTML = "";
    items.forEach((item, index) => {
      const tr = document.createElement("tr");
      const rateVal = (item.rate !== undefined && item.rate !== null && item.rate !== "" && Number(item.rate) > 0) ? item.rate : (item.rate === 0 ? "0" : "");
      const discVal = (item.discount !== undefined && item.discount !== null && item.discount !== "" && Number(item.discount) > 0) ? item.discount : "";
      tr.innerHTML = `
        <td><input type="text" class="item-desc" value="${item.description || ''}" placeholder="e.g. Professional Services"></td>
        <td><input type="text" class="item-hsn" value="${item.hsn || ''}" placeholder="HSN/SAC" style="width: 80px;"></td>
        <td><input type="number" class="item-qty" value="${item.qty !== undefined && item.qty !== '' ? item.qty : 1}" min="1" step="1" style="width: 55px;"></td>
        <td><input type="number" class="item-rate" value="${rateVal}" placeholder="0.00" min="0" step="0.01" style="width: 85px;"></td>
        <td><input type="number" class="item-discount" value="${discVal}" placeholder="0.00" min="0" step="0.01" style="width: 70px;"></td>
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

    const isDraft = Boolean(audit.isDraft || audit.status === "DRAFT");

    // Render Health Score & Circle
    const scoreCircle = document.getElementById("audit-gauge-circle");
    const scoreNum = document.getElementById("audit-score-num");
    const statusText = document.getElementById("audit-status-text");
    const statusDesc = document.getElementById("audit-status-desc");

    scoreCircle.className = "gauge-circle";

    if (isDraft) {
      scoreNum.textContent = "—";
      scoreCircle.style.borderColor = "var(--primary-navy)";
      statusText.style.color = "var(--primary-navy)";
      statusText.textContent = "Ready for Entry";
      statusDesc.textContent = "New invoice voucher ready. Fill in details to perform automated statutory audit.";
    } else if (audit.score >= 90) {
      scoreNum.textContent = audit.score;
      scoreCircle.style.borderColor = "var(--emerald-green)";
      statusText.style.color = "var(--emerald-green)";
      statusText.textContent = "All Checks Passed";
      statusDesc.textContent = "Invoice complies with GST invoicing rules and all calculations match.";
    } else if (audit.score >= 60) {
      scoreNum.textContent = audit.score;
      scoreCircle.classList.add("warn");
      scoreCircle.style.borderColor = "var(--amber-warn)";
      statusText.style.color = "var(--amber-warn)";
      statusText.textContent = "Minor Warnings Detected";
      statusDesc.textContent = "Invoice has non-blocking warnings, but tax split and totals are balanced.";
    } else {
      scoreNum.textContent = audit.score;
      scoreCircle.classList.add("fail");
      scoreCircle.style.borderColor = "var(--rose-red)";
      statusText.style.color = "var(--rose-red)";
      statusText.textContent = "Tax Discrepancies Found";
      statusDesc.textContent = "Critical discrepancies detected. Input Tax Credit (ITC) will be rejected if filed as-is.";
    }

    // Auto-fix button visibility
    const autoFixBtn = document.getElementById("btn-autofix");
    const hasFixable = !isDraft && audit.violations.some(v => v.autoFixable);
    if (autoFixBtn) {
      autoFixBtn.style.display = hasFixable ? "inline-flex" : "none";
    }

    // Render Violations & Pass List
    const violationsContainer = document.getElementById("violations-container");
    if (violationsContainer) {
      violationsContainer.innerHTML = "";

      if (isDraft) {
        violationsContainer.innerHTML = `
          <div class="violation-card pass" style="border-left-color: var(--primary-navy);">
            <div class="violation-header">
              <span class="violation-title">ℹ️ Blank Workstation — Ready for Entry</span>
              <span class="badge badge-info">DRAFT</span>
            </div>
            <div class="violation-desc">Enter supplier &amp; buyer details, line items with rates, and Place of Supply to trigger real-time statutory audit.</div>
          </div>
        `;
      } else if (audit.violations.length === 0) {
        violationsContainer.innerHTML = `
          <div class="violation-card pass">
            <div class="violation-header">
              <span class="violation-title">✓ All 10 Statutory GST Rules Cleared</span>
              <span class="badge badge-pass">PASSED</span>
            </div>
            <div class="violation-desc">GSTIN check digits, Place of Supply tax split, HSN codes, line item math, and round-off are verified.</div>
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
            ${v.fixHint ? `<div class="violation-fix">💡 Suggested Action: ${v.fixHint}</div>` : ''}
          `;
          violationsContainer.appendChild(card);
        });
      }
    }

    // Synchronize Top KPI Cards for Single Invoice
    const totalGst = (Number(AppState.activeInvoice.cgst || 0) + Number(AppState.activeInvoice.sgst || 0) + Number(AppState.activeInvoice.igst || 0));
    const critErrors = isDraft ? 0 : audit.violations.filter(v => v.severity === 'CRITICAL').length;

    const kpiStatusBadge = document.getElementById("kpi-status-badge");
    const kpiRate = document.getElementById("kpi-compliance-rate");
    const kpiInvoices = document.getElementById("kpi-total-invoices");
    const kpiTaxable = document.getElementById("kpi-taxable-val");
    const kpiGst = document.getElementById("kpi-assessed-gst");
    const kpiErrors = document.getElementById("kpi-critical-errors");

    if (isDraft) {
      if (kpiStatusBadge) {
        kpiStatusBadge.className = "badge badge-info";
        kpiStatusBadge.textContent = "Draft";
      }
      if (kpiRate) kpiRate.textContent = "Ready";
      if (kpiInvoices) kpiInvoices.textContent = "1 Active";
      if (kpiTaxable) kpiTaxable.textContent = "₹0.00";
      if (kpiGst) kpiGst.textContent = "₹0.00";
      if (kpiErrors) {
        kpiErrors.textContent = "0 Errors";
        kpiErrors.style.color = "var(--emerald-green)";
      }
    } else {
      if (kpiStatusBadge) {
        if (audit.score >= 90) {
          kpiStatusBadge.className = "badge badge-pass";
          kpiStatusBadge.textContent = "Pass";
        } else if (audit.score >= 60) {
          kpiStatusBadge.className = "badge badge-warn";
          kpiStatusBadge.textContent = "Warning";
        } else {
          kpiStatusBadge.className = "badge badge-fail";
          kpiStatusBadge.textContent = "Fail";
        }
      }
      if (kpiRate) kpiRate.textContent = `${audit.score}%`;
      if (kpiInvoices) kpiInvoices.textContent = "1 Active";
      if (kpiTaxable) kpiTaxable.textContent = `₹${Number(AppState.activeInvoice.taxableAmount || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      if (kpiGst) kpiGst.textContent = `₹${totalGst.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      if (kpiErrors) {
        kpiErrors.textContent = `${critErrors} Error${critErrors === 1 ? '' : 's'}`;
        kpiErrors.style.color = critErrors > 0 ? "var(--rose-red)" : "var(--emerald-green)";
      }
    }

    // Update Form Badges (GSTIN checks)
    updateGSTINBadges();

    // Update Section 16(2) ITC Checklist
    updateITCChecklist(audit);

    // Update Amount in Words (Mandatory Legal Clause)
    const wordsEl = document.getElementById("amount-in-words-text");
    if (wordsEl) {
      if (isDraft || !AppState.activeInvoice.totalAmount) {
        wordsEl.textContent = "Awaiting invoice totals...";
      } else {
        wordsEl.textContent = GSTRules.numberToIndianWords(AppState.activeInvoice.totalAmount || 0);
      }
    }

    // Update Financial Period
    const periodEl = document.getElementById("period-badge");
    if (periodEl && audit.calculated && audit.calculated.financialPeriod) {
      periodEl.textContent = `${audit.calculated.financialPeriod.financialYear} · ${audit.calculated.financialPeriod.quarter}`;
    }

    // Update Multi-Dimensional Sub-Scores
    if (audit.scores) {
      const gstinBar = document.getElementById("subscore-gstin-bar");
      const gstinTxt = document.getElementById("subscore-gstin-text");
      if (gstinBar && gstinTxt) {
        gstinTxt.textContent = isDraft ? "—" : `${audit.scores.gstin}%`;
        gstinBar.style.width = isDraft ? "0%" : `${audit.scores.gstin}%`;
        gstinBar.className = `score-bar-fill ${isDraft ? '' : (audit.scores.gstin >= 90 ? 'pass' : (audit.scores.gstin >= 60 ? 'warn' : 'fail'))}`;
      }

      const posBar = document.getElementById("subscore-pos-bar");
      const posTxt = document.getElementById("subscore-pos-text");
      if (posBar && posTxt) {
        posTxt.textContent = isDraft ? "—" : `${audit.scores.pos}%`;
        posBar.style.width = isDraft ? "0%" : `${audit.scores.pos}%`;
        posBar.className = `score-bar-fill ${isDraft ? '' : (audit.scores.pos >= 90 ? 'pass' : (audit.scores.pos >= 60 ? 'warn' : 'fail'))}`;
      }

      const mathBar = document.getElementById("subscore-math-bar");
      const mathTxt = document.getElementById("subscore-math-text");
      if (mathBar && mathTxt) {
        mathTxt.textContent = isDraft ? "—" : `${audit.scores.math}%`;
        mathBar.style.width = isDraft ? "0%" : `${audit.scores.math}%`;
        mathBar.className = `score-bar-fill ${isDraft ? '' : (audit.scores.math >= 90 ? 'pass' : (audit.scores.math >= 60 ? 'warn' : 'fail'))}`;
      }

      const statBar = document.getElementById("subscore-statutory-bar");
      const statTxt = document.getElementById("subscore-statutory-text");
      if (statBar && statTxt) {
        statTxt.textContent = isDraft ? "—" : `${audit.scores.statutory}%`;
        statBar.style.width = isDraft ? "0%" : `${audit.scores.statutory}%`;
        statBar.className = `score-bar-fill ${isDraft ? '' : (audit.scores.statutory >= 90 ? 'pass' : (audit.scores.statutory >= 60 ? 'warn' : 'fail'))}`;
      }
    }
  }

  function updateITCChecklist(audit) {
    const sGstin = document.getElementById("supplier-gstin").value.trim();
    const sCheck = GSTRules.verifyGSTINChecksum(sGstin);
    const isDraft = Boolean(audit && (audit.isDraft || audit.status === "DRAFT"));
    const hasCritical = audit && audit.violations && audit.violations.some(v => v.severity === "CRITICAL");

    const itcBadge = document.getElementById("itc-eligibility-badge");
    if (itcBadge) {
      if (isDraft) {
        itcBadge.className = "badge badge-info";
        itcBadge.textContent = "Awaiting Data";
      } else if (!hasCritical && sCheck.isValid) {
        itcBadge.className = "badge badge-pass";
        itcBadge.textContent = "Eligible for ITC";
      } else {
        itcBadge.className = "badge badge-fail";
        itcBadge.textContent = "ITC Ineligible (Resolve Discrepancies)";
      }
    }

    const chkGstin = document.getElementById("itc-chk-gstin");
    if (chkGstin) {
      if (isDraft) {
        chkGstin.innerHTML = `<span>⏳</span> Enter 15-digit supplier GSTIN`;
      } else {
        chkGstin.innerHTML = sCheck.isValid
          ? `<span>✅</span> Tax invoice specifies valid 15-digit GSTIN (${sCheck.stateCode})`
          : `<span>❌</span> Supplier GSTIN check digit invalid`;
      }
    }

    const chkSplit = document.getElementById("itc-chk-taxsplit");
    if (chkSplit) {
      if (isDraft) {
        chkSplit.innerHTML = `<span>⏳</span> Select Place of Supply (POS)`;
      } else {
        const hasSplitError = audit.violations.some(v => v.ruleId && v.ruleId.includes("POS"));
        chkSplit.innerHTML = !hasSplitError
          ? `<span>✅</span> Place of Supply (POS) matches tax split`
          : `<span>❌</span> Tax split mismatch (CGST/SGST vs IGST)`;
      }
    }

    const chkMath = document.getElementById("itc-chk-math");
    if (chkMath) {
      if (isDraft) {
        chkMath.innerHTML = `<span>⏳</span> Add line items with rates &amp; taxes`;
      } else {
        const hasMathError = audit.violations.some(v => v.ruleId && (v.ruleId.includes("MATH") || v.ruleId.includes("TAXABLE") || v.ruleId.includes("TAX_AMOUNT")));
        chkMath.innerHTML = !hasMathError
          ? `<span>✅</span> Line item rates &amp; subtotal verified`
          : `<span>❌</span> Subtotal calculation discrepancy`;
      }
    }

    const chkRule46 = document.getElementById("itc-chk-rule46");
    if (chkRule46) {
      if (isDraft) {
        chkRule46.innerHTML = `<span>⏳</span> Enter invoice number &amp; date`;
      } else {
        const hasInvNumError = audit.violations.some(v => v.ruleId && (v.ruleId.includes("INVOICE_NUM") || v.ruleId.includes("FUTURE_DATE")));
        chkRule46.innerHTML = !hasInvNumError
          ? `<span>✅</span> Invoice number complies with Rule 46`
          : `<span>❌</span> Rule 46 non-compliant invoice number/date`;
      }
    }

    const chkSec17 = document.getElementById("itc-chk-sec17");
    if (chkSec17) {
      if (isDraft) {
        chkSec17.innerHTML = `<span>⏳</span> Section 17(5) blocked credit verification`;
      } else {
        const hasSec17 = audit.violations.some(v => v.ruleId && v.ruleId.includes("SECTION_17_5"));
        chkSec17.innerHTML = !hasSec17
          ? `<span>✅</span> Cleared Section 17(5) blocked credit restrictions`
          : `<span>⚠️</span> Warning: Potential restricted items under Section 17(5)`;
      }
    }
  }

  function updateGSTINBadges() {
    const sGstin = document.getElementById("supplier-gstin").value.trim();
    const sBadge = document.getElementById("supplier-gstin-badge");
    if (sBadge) {
      if (!sGstin) {
        sBadge.innerHTML = "";
      } else {
        const check = GSTRules.verifyGSTINChecksum(sGstin);
        sBadge.innerHTML = check.isValid
          ? `<span class="badge badge-pass">✓ Valid (${check.stateCode})</span>`
          : `<span class="badge badge-fail">✕ Invalid Check Digit</span>`;
      }
    }

    const rGstin = document.getElementById("recipient-gstin").value.trim();
    const rBadge = document.getElementById("recipient-gstin-badge");
    const invType = document.getElementById("inv-type") ? document.getElementById("inv-type").value : "B2B";
    if (rBadge) {
      if (!rGstin) {
        if (invType === "B2C") {
          rBadge.innerHTML = `<span class="badge badge-info">B2C Unregistered</span>`;
        } else {
          rBadge.innerHTML = "";
        }
      } else {
        const check = GSTRules.verifyGSTINChecksum(rGstin);
        rBadge.innerHTML = check.isValid
          ? `<span class="badge badge-pass">✓ Valid (${check.stateCode})</span>`
          : `<span class="badge badge-fail">✕ Invalid Check Digit</span>`;
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

    document.getElementById("kpi-total-invoices").textContent = `${total} Invoices`;
    document.getElementById("kpi-taxable-val").textContent = `₹${totalTaxable.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    document.getElementById("kpi-assessed-gst").textContent = `₹${totalGst.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    document.getElementById("kpi-compliance-rate").textContent = `${avgScore}%`;
    document.getElementById("kpi-critical-errors").textContent = `${criticalCount} Error${criticalCount === 1 ? '' : 's'}`;
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

  // --- DYNAMIC B2C UPI PAYMENT QR CONTROLLER ---
  function initUPIQRModal() {
    const openBtn = document.getElementById("btn-open-upi-qr");
    const modal = document.getElementById("upi-qr-modal");
    const closeBtn = document.getElementById("upi-qr-modal-close");
    const qrImg = document.getElementById("upi-qr-image");
    const amtText = document.getElementById("upi-qr-amount-text");
    const vpaText = document.getElementById("upi-qr-vpa-text");
    const vpaInput = document.getElementById("upi-merchant-vpa");
    const refreshBtn = document.getElementById("btn-refresh-upi-qr");
    const copyUriBtn = document.getElementById("btn-copy-upi-uri");

    function renderQR() {
      if (!AppState.activeInvoice) return;
      const vpa = (vpaInput && vpaInput.value.trim()) || "accounts@icici";
      const amt = Number(AppState.activeInvoice.totalAmount || 0);
      const invNo = AppState.activeInvoice.invoiceNumber || "INV-001";
      const uri = GSTRules.generateUPIPaymentURI({
        vpa,
        name: AppState.activeInvoice.supplierName || "Merchant Accounts",
        amount: amt,
        invoiceNo: invNo,
        note: `Tax Invoice ${invNo}`
      });

      if (amtText) amtText.textContent = `₹${amt.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;
      if (vpaText) vpaText.textContent = vpa;
      if (qrImg) qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(uri)}`;
      AppState.currentUPIUri = uri;
    }

    if (openBtn && modal) {
      openBtn.addEventListener("click", () => {
        renderQR();
        modal.classList.add("open");
      });
    }

    if (closeBtn && modal) {
      closeBtn.addEventListener("click", () => modal.classList.remove("open"));
    }

    if (refreshBtn) {
      refreshBtn.addEventListener("click", () => {
        renderQR();
        showToast("Dynamic UPI payment QR regenerated.", "info");
      });
    }

    if (copyUriBtn) {
      copyUriBtn.addEventListener("click", () => {
        if (AppState.currentUPIUri) {
          navigator.clipboard.writeText(AppState.currentUPIUri).then(() => {
            showToast("UPI Intent URI copied to clipboard!", "success");
          });
        }
      });
    }
  }

  // --- NIC E-INVOICE JSON SCHEMA (V1.03) EXPORTER ---
  function initExportNICJSON() {
    const btn = document.getElementById("btn-export-nic-json");
    if (!btn) return;

    btn.addEventListener("click", () => {
      if (!AppState.activeInvoice) {
        showToast("No active invoice to export.", "warning");
        return;
      }
      try {
        const payload = GSTRules.generateEInvoiceJSON(AppState.activeInvoice);
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(payload, null, 2));
        const a = document.createElement("a");
        const invNo = (AppState.activeInvoice.invoiceNumber || "EINV").replace(/[^a-zA-Z0-9]/g, "_");
        a.href = dataStr;
        a.download = `EInvoice_${invNo}_v1.03.json`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        showToast(`Exported official NIC E-Invoice JSON Schema v1.03!`, "success");
      } catch (err) {
        showToast("Export error: " + err.message, "error");
      }
    });
  }

  // --- TALLY PRIME / ERP 9 XML EXPORTER ---
  function initExportTallyXML() {
    const btn = document.getElementById("btn-export-tally-xml");
    if (!btn) return;

    btn.addEventListener("click", () => {
      if (!AppState.activeInvoice) {
        showToast("No active invoice to export.", "warning");
        return;
      }
      try {
        const xml = GSTRules.generateTallyXML(AppState.activeInvoice);
        const dataStr = "data:text/xml;charset=utf-8," + encodeURIComponent(xml);
        const a = document.createElement("a");
        const invNo = (AppState.activeInvoice.invoiceNumber || "VOUCHER").replace(/[^a-zA-Z0-9]/g, "_");
        a.href = dataStr;
        a.download = `TallyVoucher_${invNo}.xml`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        showToast(`Exported Tally DayBook XML Voucher!`, "success");
      } catch (err) {
        showToast("Export error: " + err.message, "error");
      }
    });
  }

  // --- PRO KEYBOARD SHORTCUTS CONTROLLER ---
  function initKeyboardShortcuts() {
    const shortcutsBtn = document.getElementById("btn-shortcuts");
    const shortcutsModal = document.getElementById("shortcuts-modal");
    const closeBtn = document.getElementById("shortcuts-modal-close");
    const gotItBtn = document.getElementById("btn-shortcuts-close");

    if (shortcutsBtn && shortcutsModal) {
      shortcutsBtn.addEventListener("click", () => shortcutsModal.classList.add("open"));
    }
    const close = () => shortcutsModal && shortcutsModal.classList.remove("open");
    if (closeBtn) closeBtn.addEventListener("click", close);
    if (gotItBtn) gotItBtn.addEventListener("click", close);

    window.addEventListener("keydown", (e) => {
      // Ignore if user is typing in a textarea or input (except for global Ctrl combos)
      const isInput = ["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName);

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "n") {
        e.preventDefault();
        createNewBlankInvoice();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        saveCurrentAuditToHistory();
      } else if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "f") {
        e.preventDefault();
        const autoFixBtn = document.getElementById("btn-autofix");
        if (autoFixBtn && autoFixBtn.style.display !== "none") {
          autoFixBtn.click();
        }
      } else if (e.altKey && e.key.toLowerCase() === "a") {
        e.preventDefault();
        const addRowBtn = document.getElementById("btn-add-item");
        if (addRowBtn) addRowBtn.click();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "p" && !isInput) {
        e.preventDefault();
        const printBtn = document.getElementById("btn-print-slip");
        if (printBtn) printBtn.click();
      } else if (e.key === "Escape") {
        document.querySelectorAll(".modal-overlay.open").forEach(m => m.classList.remove("open"));
      }
    });
  }

  // --- GSTR-2B VS PURCHASE REGISTER 2-WAY RECONCILIATION MATCHING DESK ---
  function initReconciliationTab() {
    const sampleBtn = document.getElementById("btn-load-sample-recon");
    const runBtn = document.getElementById("btn-run-recon");
    const vendorEmailBtn = document.getElementById("btn-vendor-email");
    const exportCsvBtn = document.getElementById("btn-export-recon-csv");

    if (sampleBtn) sampleBtn.addEventListener("click", loadSampleReconData);
    if (runBtn) runBtn.addEventListener("click", runReconciliation);

    if (vendorEmailBtn) {
      vendorEmailBtn.addEventListener("click", () => {
        const missing = (AppState.reconResults || []).filter(r => r.status === "MISSING_IN_2B");
        if (missing.length === 0) {
          showToast("No delinquent vendors missing in GSTR-2B!", "success");
          return;
        }
        const sampleVendor = missing[0];
        const draft = `Subject: URGENT: Non-reflection of Invoice ${sampleVendor.invNo} in GSTR-2B (ITC Blocked under Section 16(2)(aa))\n\n` +
          `Dear ${sampleVendor.vendorName},\n\n` +
          `Our monthly statutory audit indicates that Invoice #${sampleVendor.invNo} dated ${sampleVendor.invDate} for ₹${sampleVendor.booksTotal.toLocaleString("en-IN")} ` +
          `(GST: ₹${sampleVendor.booksTax.toLocaleString("en-IN")}) has NOT been reflected in our auto-drafted GSTR-2B statement.\n\n` +
          `As per Section 16(2)(aa) of the CGST Act, 2017, we are statutorily barred from availing Input Tax Credit until you file your GSTR-1 return and report this invoice.\n\n` +
          `Kindly confirm whether this invoice has been uploaded to the GST Portal or rectify it in your upcoming return period.\n\n` +
          `Regards,\nTax & Accounts Department`;

        navigator.clipboard.writeText(draft).then(() => {
          alert(`Formal Notice Copied to Clipboard:\n\n` + draft);
        });
      });
    }

    if (exportCsvBtn) {
      exportCsvBtn.addEventListener("click", () => {
        if (!AppState.reconResults || AppState.reconResults.length === 0) {
          showToast("No reconciliation data to export.", "warning");
          return;
        }
        const headers = ["Vendor GSTIN", "Vendor Name", "Invoice No", "Date", "Books Taxable", "2B Taxable", "Books Tax", "2B Tax", "Variance", "Status"];
        const rows = AppState.reconResults.map(r => [
          r.gstin, `"${r.vendorName}"`, `"${r.invNo}"`, r.invDate,
          r.booksTaxable, r.portalTaxable, r.booksTax, r.portalTax, r.variance, r.status
        ]);
        const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
        const a = document.createElement("a");
        a.href = encodeURI(csvContent);
        a.download = `GSTR2B_Reconciliation_${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        showToast("Exported 2-Way Reconciliation Statement (CSV)!", "success");
      });
    }

    // Filter bucket card clicks
    document.querySelectorAll(".recon-bucket-card").forEach(card => {
      card.addEventListener("click", () => {
        document.querySelectorAll(".recon-bucket-card").forEach(c => c.classList.remove("active"));
        card.classList.add("active");
        const bucket = card.getAttribute("data-recon-bucket");
        renderReconciliationTable(bucket);
      });
    });
  }

  function loadSampleReconData() {
    // 5 Enterprise Purchase Register Vouchers (Buyer's Books)
    AppState.reconBooks = [
      { gstin: "27AABCU9603R1ZN", vendorName: "Tata Consultancy Services Ltd", invNo: "TCS/2026/8821", invDate: "2026-09-05", taxable: 100000.0, tax: 18000.0, total: 118000.0 },
      { gstin: "29AAACG2170D1ZZ", vendorName: "Infosys BPM India Pvt Ltd", invNo: "INF/2026/4401", invDate: "2026-09-08", taxable: 250000.0, tax: 45000.0, total: 295000.0 },
      { gstin: "24AAACG1234F1ZA", vendorName: "Reliance Logistics Cargo", invNo: "RL/2026/9012", invDate: "2026-09-12", taxable: 45000.0, tax: 8100.0, total: 53100.0 },
      { gstin: "23AAACS1429B1Z3", vendorName: "Satna Machinery & Tools Corp", invNo: "SMT/2026/1140", invDate: "2026-09-14", taxable: 80000.0, tax: 14400.0, total: 94400.0 }
    ];

    // 5 Invoices Extracted from Official GSTR-2B Tax Portal
    AppState.reconGSTR2B = [
      { gstin: "27AABCU9603R1ZN", vendorName: "Tata Consultancy Services Ltd", invNo: "TCS/2026/8821", invDate: "2026-09-05", taxable: 100000.0, tax: 18000.0, total: 118000.0 },
      { gstin: "29AAACG2170D1ZZ", vendorName: "Infosys BPM India Pvt Ltd", invNo: "INF/2026/4401", invDate: "2026-09-08", taxable: 250000.0, tax: 45000.0, total: 295000.0 },
      { gstin: "24AAACG1234F1ZA", vendorName: "Reliance Logistics Cargo", invNo: "RL/2026/9012", invDate: "2026-09-12", taxable: 45200.0, tax: 8136.0, total: 53336.0 }, // Small variance
      { gstin: "27AAACL3301G1Z8", vendorName: "Larsen & Toubro Infra Solutions", invNo: "LT/2026/3301", invDate: "2026-09-16", taxable: 120000.0, tax: 21600.0, total: 141600.0 } // In 2B but missing in books!
    ];

    runReconciliation();
    showToast("Loaded sample Purchase Books and GSTR-2B portal data!", "info");
  }

  function runReconciliation() {
    if (!AppState.reconBooks || !AppState.reconGSTR2B) {
      loadSampleReconData();
      return;
    }

    const results = [];
    const matched2BIndexes = new Set();

    // Loop through Buyer's Books
    AppState.reconBooks.forEach(bookItem => {
      const normBookNo = bookItem.invNo.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
      const pIdx = AppState.reconGSTR2B.findIndex((p, idx) => {
        if (matched2BIndexes.has(idx)) return false;
        const normPNo = p.invNo.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
        return normBookNo === normPNo && p.gstin.toUpperCase() === bookItem.gstin.toUpperCase();
      });

      if (pIdx !== -1) {
        matched2BIndexes.add(pIdx);
        const pItem = AppState.reconGSTR2B[pIdx];
        const taxDiff = Math.abs(bookItem.tax - pItem.tax);
        const isExact = taxDiff <= 5.00;

        results.push({
          gstin: bookItem.gstin,
          vendorName: bookItem.vendorName,
          invNo: bookItem.invNo,
          invDate: bookItem.invDate,
          booksTaxable: bookItem.taxable,
          portalTaxable: pItem.taxable,
          booksTax: bookItem.tax,
          portalTax: pItem.tax,
          booksTotal: bookItem.total,
          variance: Math.round((bookItem.tax - pItem.tax) * 100) / 100,
          status: isExact ? "MATCHED" : "VARIANCE"
        });
      } else {
        // Missing in GSTR-2B!
        results.push({
          gstin: bookItem.gstin,
          vendorName: bookItem.vendorName,
          invNo: bookItem.invNo,
          invDate: bookItem.invDate,
          booksTaxable: bookItem.taxable,
          portalTaxable: 0,
          booksTax: bookItem.tax,
          portalTax: 0,
          booksTotal: bookItem.total,
          variance: bookItem.tax,
          status: "MISSING_IN_2B"
        });
      }
    });

    // Unrecorded invoices in GSTR-2B
    AppState.reconGSTR2B.forEach((pItem, idx) => {
      if (!matched2BIndexes.has(idx)) {
        results.push({
          gstin: pItem.gstin,
          vendorName: pItem.vendorName,
          invNo: pItem.invNo,
          invDate: pItem.invDate,
          booksTaxable: 0,
          portalTaxable: pItem.taxable,
          booksTax: 0,
          portalTax: pItem.tax,
          booksTotal: pItem.total,
          variance: -pItem.tax,
          status: "MISSING_IN_BOOKS"
        });
      }
    });

    AppState.reconResults = results;

    // Update Buckets KPI Cards
    const matchedList = results.filter(r => r.status === "MATCHED");
    const varianceList = results.filter(r => r.status === "VARIANCE");
    const missing2bList = results.filter(r => r.status === "MISSING_IN_2B");
    const missingBooksList = results.filter(r => r.status === "MISSING_IN_BOOKS");

    document.getElementById("recon-count-matched").textContent = matchedList.length;
    document.getElementById("recon-amt-matched").textContent = `₹${matchedList.reduce((acc, r) => acc + r.booksTax, 0).toLocaleString("en-IN")} ITC Eligible`;

    document.getElementById("recon-count-variance").textContent = varianceList.length;
    document.getElementById("recon-amt-variance").textContent = `±₹${varianceList.reduce((acc, r) => acc + Math.abs(r.variance), 0).toLocaleString("en-IN")} Variance`;

    document.getElementById("recon-count-missing-2b").textContent = missing2bList.length;
    document.getElementById("recon-amt-missing-2b").textContent = `₹${missing2bList.reduce((acc, r) => acc + r.booksTax, 0).toLocaleString("en-IN")} Blocked`;

    document.getElementById("recon-count-missing-books").textContent = missingBooksList.length;
    document.getElementById("recon-amt-missing-books").textContent = `₹${missingBooksList.reduce((acc, r) => acc + r.portalTax, 0).toLocaleString("en-IN")} Unrecorded`;

    renderReconciliationTable("all");
  }

  function renderReconciliationTable(filter = "all") {
    const tbody = document.getElementById("recon-data-tbody");
    const badge = document.getElementById("recon-table-badge");
    const title = document.getElementById("recon-table-title");
    if (!tbody || !AppState.reconResults) return;

    let list = AppState.reconResults;
    if (filter === "matched") list = list.filter(r => r.status === "MATCHED");
    else if (filter === "variance") list = list.filter(r => r.status === "VARIANCE");
    else if (filter === "missing_2b") list = list.filter(r => r.status === "MISSING_IN_2B");
    else if (filter === "missing_books") list = list.filter(r => r.status === "MISSING_IN_BOOKS");

    if (badge) badge.textContent = `${list.length} Record${list.length === 1 ? '' : 's'}`;
    if (title) {
      title.textContent = filter === "all" ? "All Reconciled Items" : `Filtered Items: ${filter.replace(/_/g, " ").toUpperCase()}`;
    }

    if (list.length === 0) {
      tbody.innerHTML = `<tr><td colspan="10" style="text-align: center; padding: 24px; color: var(--text-muted);">No records found matching this bucket filter.</td></tr>`;
      return;
    }

    tbody.innerHTML = list.map(r => {
      let badgeClass = "badge-pass";
      let statusLabel = "MATCHED (Claim ITC)";
      if (r.status === "VARIANCE") {
        badgeClass = "badge-warn";
        statusLabel = "RATE VARIANCE";
      } else if (r.status === "MISSING_IN_2B") {
        badgeClass = "badge-fail";
        statusLabel = "NOT IN 2B (Blocked)";
      } else if (r.status === "MISSING_IN_BOOKS") {
        badgeClass = "badge-info";
        statusLabel = "UNRECORDED";
      }

      return `
        <tr>
          <td><span style="font-family: monospace; font-size: 0.8rem;">${r.gstin}</span></td>
          <td><strong>${r.vendorName}</strong></td>
          <td>${r.invNo}</td>
          <td>${r.invDate}</td>
          <td>₹${r.booksTaxable.toLocaleString("en-IN")}</td>
          <td>₹${r.portalTaxable.toLocaleString("en-IN")}</td>
          <td>₹${r.booksTax.toLocaleString("en-IN")}</td>
          <td>₹${r.portalTax.toLocaleString("en-IN")}</td>
          <td style="color: ${r.variance !== 0 ? 'var(--rose-red)' : 'var(--text-muted)'}; font-weight: 600;">
            ${r.variance > 0 ? '+' : ''}₹${r.variance.toFixed(2)}
          </td>
          <td><span class="badge ${badgeClass}">${statusLabel}</span></td>
        </tr>
      `;
    }).join("");
  }

  // --- CA TOOLS & STATUTORY CALCULATORS TAB ---
  function initToolsTab() {
    const intTax = document.getElementById("calc-tax-principal");
    const intType = document.getElementById("calc-interest-type");
    const intDue = document.getElementById("calc-due-date");
    const intPay = document.getElementById("calc-payment-date");
    const intBtn = document.getElementById("btn-recalc-interest");

    [intTax, intType, intDue, intPay].forEach(el => {
      if (el) el.addEventListener("input", recalcInterestTool);
    });
    if (intBtn) intBtn.addEventListener("click", recalcInterestTool);

    const revGross = document.getElementById("calc-gross-mrp");
    const revRate = document.getElementById("calc-slab-rate");
    const revBtn = document.getElementById("btn-recalc-reverse");

    [revGross, revRate].forEach(el => {
      if (el) el.addEventListener("input", recalcReverseGST);
    });
    if (revBtn) revBtn.addEventListener("click", recalcReverseGST);

    const ewbDist = document.getElementById("calc-ewb-distance");
    const ewbCargo = document.getElementById("calc-cargo-type");
    const ewbBtn = document.getElementById("btn-recalc-ewb");

    [ewbDist, ewbCargo].forEach(el => {
      if (el) el.addEventListener("input", recalcEWayBill);
    });
    if (ewbBtn) ewbBtn.addEventListener("click", recalcEWayBill);
  }

  function recalcInterestTool() {
    const tax = Number(document.getElementById("calc-tax-principal").value) || 0;
    const isExcess = document.getElementById("calc-interest-type").value === "24";
    const dueDate = document.getElementById("calc-due-date").value;
    const payDate = document.getElementById("calc-payment-date").value;

    const res = GSTRules.calculateSection50Interest(tax, dueDate, payDate, isExcess);

    document.getElementById("calc-res-days").textContent = `${res.daysDelayed} Days`;
    document.getElementById("calc-res-rate").textContent = `${res.interestRate}% per annum (${res.ruleReference})`;
    document.getElementById("calc-res-interest").textContent = `₹${res.interestAmount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;
    document.getElementById("calc-res-total").textContent = `₹${res.totalDue.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;
  }

  function recalcReverseGST() {
    const gross = Number(document.getElementById("calc-gross-mrp").value) || 0;
    const rate = Number(document.getElementById("calc-slab-rate").value) || 18;

    const net = Math.round((gross / (1 + rate / 100)) * 100) / 100;
    const gst = Math.round((gross - net) * 100) / 100;
    const half = Math.round((gst / 2) * 100) / 100;

    document.getElementById("calc-res-net").textContent = `₹${net.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;
    document.getElementById("calc-res-gst").textContent = `₹${gst.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;
    document.getElementById("calc-res-split").textContent = `CGST: ₹${half.toLocaleString("en-IN", { minimumFractionDigits: 2 })} | SGST: ₹${half.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;
    document.getElementById("calc-res-gross").textContent = `₹${gross.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;
  }

  function recalcEWayBill() {
    const dist = Number(document.getElementById("calc-ewb-distance").value) || 0;
    const cargo = document.getElementById("calc-cargo-type").value;
    const speed = cargo === "over_dimensional" ? 20 : 200;
    const days = Math.max(1, Math.ceil(dist / speed));

    document.getElementById("calc-ewb-speed").textContent = `${speed} KM per day`;
    document.getElementById("calc-ewb-days").textContent = `${days} Day${days === 1 ? '' : 's'}`;
    document.getElementById("calc-ewb-expiry").textContent = `Midnight of ${days}${days === 1 ? 'st' : (days === 2 ? 'nd' : (days === 3 ? 'rd' : 'th'))} Day`;
  }

  // --- BATCH AUTO-FIX IN BULK REGISTER ---
  function initBulkAutoFix() {
    const btn = document.getElementById("btn-bulk-autofix");
    if (!btn) return;

    btn.addEventListener("click", () => {
      if (!AppState.bulkAudits || AppState.bulkAudits.length === 0) {
        showToast("Please load or paste bulk invoices first.", "warning");
        return;
      }

      let fixedCount = 0;
      AppState.bulkAudits.forEach(item => {
        const inv = item.invoice;
        const pos = inv.placeOfSupply ? inv.placeOfSupply.substring(0, 2) : "27";
        const supp = inv.supplierGstin ? inv.supplierGstin.substring(0, 2) : "27";
        const isIntra = (supp === pos);
        const totTax = (Number(inv.cgst || 0) + Number(inv.sgst || 0) + Number(inv.igst || 0));

        if (isIntra) {
          inv.cgst = Math.round((totTax / 2) * 100) / 100;
          inv.sgst = Math.round((totTax / 2) * 100) / 100;
          inv.igst = 0;
        } else {
          inv.cgst = 0;
          inv.sgst = 0;
          inv.igst = totTax;
        }

        // Re-audit row
        item.audit = GSTValidator.auditInvoice(inv);
        fixedCount++;
      });

      renderBulkTable();
      showToast(`Batch Auto-Fix Applied: Aligned taxes across ${fixedCount} invoices!`, "success");
    });
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
