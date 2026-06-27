/* ================================================================
   Cash Clinic — Case Chain
   Automatic report linking via a shared "live case" in localStorage.
   Fill report 1 → click "احفظ وانتقل للتالي" → next report opens pre-filled.
   Each report can also generate a settlement invoice that aggregates
   data from every session completed so far.
   ================================================================ */
(function () {
  'use strict';

  var LIVE_KEY = 'cc_case_live';

  // Canonical ordered flow of the program
  var FLOW = [
    { id: 's1', file: 's1-diagnostic.html',   label: 'الجلسة الأولى التشخيصية' },
    { id: 's2', file: 's2-accounting.html',   label: 'الجلسة المحاسبية' },
    { id: 's3', file: 's3-followup.html',     label: 'الجلسة الثالثة (المتابعة)' },
    { id: 's4', file: 's4-final.html',        label: 'التقرير الختامي الشامل' }
  ];
  var INVOICE_FILE = 'invoice-interactive.html';

  // Base-field aliases: canonical key -> list of element IDs used across reports
  var BASE_MAP = {
    caseNo:      ['ce_caseNo', 'cd_caseNo'],
    charityRef:  ['ce_charityRef', 'cd_charityRef'],
    name:        ['ce_name', 'cd_name', 'ce_fullName'],
    charity:     ['ce_charity'],
    age:         ['ce_age', 'cd_age'],
    marital:     ['ce_marital', 'cd_marital'],
    kids:        ['ce_kids', 'cd_kids'],
    kidsDetails: ['ce_kidsDetails', 'cd_kidsDetails'],
    problem:     ['ce_problem', 'cd_problem']
  };

  function readLive() {
    try {
      var raw = localStorage.getItem(LIVE_KEY);
      return raw ? JSON.parse(raw) : { schema: 'cashclinic-case', version: 3, base: {} };
    } catch (e) {
      return { schema: 'cashclinic-case', version: 3, base: {} };
    }
  }

  function writeLive(obj) {
    try { localStorage.setItem(LIVE_KEY, JSON.stringify(obj)); return true; }
    catch (e) { return false; }
  }

  function getEl(ids) {
    for (var i = 0; i < ids.length; i++) {
      var el = document.getElementById(ids[i]);
      if (el) return el;
    }
    return null;
  }

  // Pull base fields FROM the page into a base object
  function readBaseFromPage() {
    var base = {};
    Object.keys(BASE_MAP).forEach(function (key) {
      var el = getEl(BASE_MAP[key]);
      if (el && el.value) base[key] = el.value;
    });
    return base;
  }

  // Push base fields FROM a base object INTO the page (only fills empty unless force)
  function applyBaseToPage(base, force) {
    if (!base) return;
    Object.keys(BASE_MAP).forEach(function (key) {
      if (base[key] == null || base[key] === '') return;
      var el = getEl(BASE_MAP[key]);
      if (el && (force || !el.value)) {
        el.value = base[key];
        // fire input so any recalc listeners pick it up
        try { el.dispatchEvent(new Event('input', { bubbles: true })); } catch (e) {}
        try { el.dispatchEvent(new Event('change', { bubbles: true })); } catch (e) {}
      }
    });
  }

  // Merge this report's exported case (from its own collectCase/collectCaseData) into live
  function mergeReportIntoLive() {
    var live = readLive();
    var contributed = null;

    // Each report exposes its own collector; call whichever exists.
    try {
      if (typeof window.collectCase === 'function') contributed = window.collectCase();
      else if (typeof window.collectCaseData === 'function') contributed = window.collectCaseData();
    } catch (e) { contributed = null; }

    if (contributed && typeof contributed === 'object') {
      // contributed already includes a merged base + this session's data
      live = Object.assign(live, contributed);
    }

    // Always overlay the freshest base from the visible page
    live.base = Object.assign({}, live.base || {}, readBaseFromPage());
    live.schema = 'cashclinic-case';
    live.version = 3;
    writeLive(live);
    return live;
  }

  // Apply the live case to the current page (base + call report's own applyCase if present)
  function hydrateFromLive() {
    var live = readLive();
    if (!live) return;

    // Let the report restore its own rich session data first
    try {
      if (typeof window.applyCase === 'function') {
        window.loadedCase = live;
        window.applyCase(live);
      }
    } catch (e) {}

    // Then ensure base fields are filled (covers reports without applyCase)
    applyBaseToPage(live.base, false);

    // Make the loaded case available to the report's own collectors
    window.loadedCase = live;
  }

  // Find the next report in the flow after the current one
  function nextOf(currentId) {
    for (var i = 0; i < FLOW.length; i++) {
      if (FLOW[i].id === currentId) return FLOW[i + 1] || null;
    }
    return null;
  }

  // "Save & go to next" — merge, persist, navigate
  function saveAndNext(currentId) {
    mergeReportIntoLive();
    var nxt = nextOf(currentId);
    if (nxt) {
      window.location.href = nxt.file;
    } else {
      // last report → offer invoice
      if (confirm('تم حفظ بيانات هذه الجلسة. هل تريد إنشاء فاتورة التسوية الآن؟')) {
        window.location.href = INVOICE_FILE;
      }
    }
  }

  // "Generate invoice" — merge current, then open invoice (aggregates everything)
  function generateInvoice() {
    mergeReportIntoLive();
    window.location.href = INVOICE_FILE;
  }

  // Expose API
  window.CaseChain = {
    saveAndNext: saveAndNext,
    generateInvoice: generateInvoice,
    hydrate: hydrateFromLive,
    merge: mergeReportIntoLive,
    read: readLive,
    write: writeLive,
    FLOW: FLOW
  };

  // Auto-hydrate on load (after the report's own scripts have run)
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { setTimeout(hydrateFromLive, 60); });
  } else {
    setTimeout(hydrateFromLive, 60);
  }
})();
