/* ================================================================
   Cash Clinic — Reports Firebase bridge (client side)
   ----------------------------------------------------------------
   Loaded by each report. Provides:
     CaseCloud.save(reportType)   -> save this report to Firestore as
                                     "complete", which triggers the Cloud
                                     Function to make a PDF and drop it in
                                     the case's Drive folder.
     CaseCloud.load(caseId)       -> load a case's merged data back.
   Uses the report's own collectCase()/collectCaseData() to gather data,
   and snapshots the filled HTML so the PDF matches what you see.
   ================================================================ */
(function () {
  "use strict";

  // 1) PASTE your NEW reports Firebase project's web config here
  //    (Firebase console → Project settings → "Your apps" → Web app → Config)
  var firebaseConfig = {
    apiKey: "AIzaSyArXZayBYV6krbbc0eqgDaQX4k3ursjQG8",
    authDomain: "cash-reports-ecc5a.firebaseapp.com",
    projectId: "cash-reports-ecc5a",
    storageBucket: "cash-reports-ecc5a.firebasestorage.app",
    messagingSenderId: "670162264331",
    appId: "1:670162264331:web:d145e0e5b4b990924e820e",
  };

  // Lazy-load the Firebase SDK (modular, from CDN) only when needed.
  var _fb = null;
  async function fb() {
    if (_fb) return _fb;
    var appMod = await import("https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js");
    var fsMod = await import("https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js");
    var authMod = await import("https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js");
    var app = appMod.initializeApp(firebaseConfig);
    var dbx = fsMod.getFirestore(app);
    var auth = authMod.getAuth(app);
    _fb = { app: app, db: dbx, auth: auth, fs: fsMod, authMod: authMod };
    return _fb;
  }

  // Ensure we are signed in (anonymous is fine for an internal tool;
  // switch to email sign-in later if you want named staff).
  async function ensureAuth(ctx) {
    if (ctx.auth.currentUser) return ctx.auth.currentUser;
    var cred = await ctx.authMod.signInAnonymously(ctx.auth);
    return cred.user;
  }

  // Build the canonical case object from whatever collector the report has.
  function collectData() {
    try {
      if (typeof window.collectCase === "function") return window.collectCase();
      if (typeof window.collectCaseData === "function") return window.collectCaseData();
    } catch (e) {}
    return { base: {} };
  }

  // Derive a stable caseId from the case number (fallback to a timestamp).
  function caseIdFrom(data) {
    var b = (data && data.base) || {};
    var raw = (b.caseNo || "").toString().replace(/[^0-9A-Za-z]/g, "");
    return raw ? "case-" + raw : "case-" + Date.now();
  }

  // Snapshot the filled report as standalone HTML (inputs' values inlined)
  // so the server-side PDF looks exactly like the screen.
  function snapshotHtml() {
    // Reflect current field values into the DOM attributes so they survive serialization.
    document.querySelectorAll("input, textarea, select").forEach(function (el) {
      if (el.type === "checkbox" || el.type === "radio") {
        if (el.checked) el.setAttribute("checked", "checked");
        else el.removeAttribute("checked");
      } else if (el.tagName === "SELECT") {
        Array.prototype.forEach.call(el.options, function (o) {
          if (o.selected) o.setAttribute("selected", "selected");
          else o.removeAttribute("selected");
        });
      } else if (el.tagName === "TEXTAREA") {
        // Textarea content lives between the tags, not in a value attribute.
        el.textContent = el.value || "";
      } else {
        el.setAttribute("value", el.value || "");
      }
    });
    // Hide the toolbar/no-print parts in the snapshot.
    var clone = document.documentElement.cloneNode(true);
    clone.querySelectorAll(".no-print, .toolbar").forEach(function (n) {
      n.parentNode && n.parentNode.removeChild(n);
    });
    return "<!DOCTYPE html>\n" + clone.outerHTML;
  }

  var CaseCloud = {
    /**
     * Save this report to the cloud as complete.
     * @param {string} reportType  one of s1|s2|s3|s4|invoice
     */
    save: async function (reportType) {
      try {
        var ctx = await fb();
        await ensureAuth(ctx);

        var data = collectData();
        var caseId = caseIdFrom(data);
        var html = snapshotHtml();

        var ref = ctx.fs.doc(ctx.db, "cases", caseId, "sessions", reportType);

        await ctx.fs.setDoc(
          ref,
          {
            reportType: reportType,
            status: "complete",
            base: (data && data.base) || {},
            data: data,
            html: html,
            pdfGenerated: false, // reset so a fresh PDF is made for this version
            updatedAt: ctx.fs.serverTimestamp(),
          },
          { merge: true }
        );

        // Touch the case root so it appears in listings.
        await ctx.fs.setDoc(
          ctx.fs.doc(ctx.db, "cases", caseId),
          {
            caseId: caseId,
            base: (data && data.base) || {},
            lastUpdated: ctx.fs.serverTimestamp(),
          },
          { merge: true }
        );

        return { ok: true, caseId: caseId };
      } catch (e) {
        console.error("CaseCloud.save failed", e);
        return { ok: false, error: String(e && e.message ? e.message : e) };
      }
    },

    /** Load a case's merged data (latest of each session). */
    load: async function (caseId) {
      try {
        var ctx = await fb();
        await ensureAuth(ctx);
        var snap = await ctx.fs.getDocs(
          ctx.fs.collection(ctx.db, "cases", caseId, "sessions")
        );
        var merged = { base: {} };
        snap.forEach(function (d) {
          var v = d.data();
          if (v.data) merged = Object.assign(merged, v.data);
          if (v.base) merged.base = Object.assign({}, merged.base, v.base);
        });
        return merged;
      } catch (e) {
        console.error("CaseCloud.load failed", e);
        return null;
      }
    },

    /**
     * List every case with its completed-stage info, for the pipeline board.
     * Returns an array of:
     *   { caseId, base, stages:{s1,s2,s3,s4,invoice}, nextStage, updatedAt }
     * where stages.* is true when that report is complete.
     */
    listCases: async function () {
      try {
        var ctx = await fb();
        await ensureAuth(ctx);

        var ORDER = ["s1", "s2", "s3", "s4", "invoice"];
        var casesSnap = await ctx.fs.getDocs(ctx.fs.collection(ctx.db, "cases"));

        var results = [];
        // For each case, read its sessions subcollection to see what's complete.
        var caseDocs = [];
        casesSnap.forEach(function (d) { caseDocs.push(d); });

        for (var i = 0; i < caseDocs.length; i++) {
          var cdoc = caseDocs[i];
          var croot = cdoc.data() || {};
          var caseId = cdoc.id;

          var sessSnap = await ctx.fs.getDocs(
            ctx.fs.collection(ctx.db, "cases", caseId, "sessions")
          );

          var stages = { s1: false, s2: false, s3: false, s4: false, invoice: false };
          var base = croot.base || {};
          var latest = null;
          sessSnap.forEach(function (sd) {
            var v = sd.data() || {};
            var rt = v.reportType || sd.id;
            if (v.status === "complete") stages[rt] = true;
            if (v.base) base = Object.assign({}, base, v.base);
            if (v.pdfDriveLink) {
              stages[rt + "_pdf"] = v.pdfDriveLink;
            }
          });

          // Determine the next stage that still needs doing (enforced order).
          var nextStage = null;
          for (var k = 0; k < ORDER.length; k++) {
            if (!stages[ORDER[k]]) { nextStage = ORDER[k]; break; }
          }

          results.push({
            caseId: caseId,
            base: base,
            stages: stages,
            nextStage: nextStage,                  // null means fully done
            driveFolderId: croot.driveFolderId || null,
            lastUpdated: croot.lastUpdated || null,
          });
        }

        return results;
      } catch (e) {
        console.error("CaseCloud.listCases failed", e);
        return null;
      }
    },
  };

  window.CaseCloud = CaseCloud;

  // ---- Auto-load a case from the cloud when opened via ?case=case-XX ----
  // Base-field aliases (same idea as case-chain), so we can fill any report.
  var BASE_IDS = {
    caseNo:      ["ce_caseNo", "cd_caseNo"],
    charityRef:  ["ce_charityRef", "cd_charityRef"],
    name:        ["ce_name", "cd_name", "ce_fullName"],
    charity:     ["ce_charity"],
    age:         ["ce_age", "cd_age"],
    marital:     ["ce_marital", "cd_marital"],
    kids:        ["ce_kids", "cd_kids"],
    kidsDetails: ["ce_kidsDetails", "cd_kidsDetails"],
    problem:     ["ce_problem", "cd_problem"],
  };

  function fillBase(base) {
    if (!base) return;
    Object.keys(BASE_IDS).forEach(function (key) {
      if (base[key] == null || base[key] === "") return;
      var ids = BASE_IDS[key];
      for (var i = 0; i < ids.length; i++) {
        var el = document.getElementById(ids[i]);
        if (el && !el.value) {
          el.value = base[key];
          try { el.dispatchEvent(new Event("input", { bubbles: true })); } catch (e) {}
          try { el.dispatchEvent(new Event("change", { bubbles: true })); } catch (e) {}
          break;
        }
      }
    });
  }

  async function autoLoadFromUrl() {
    try {
      var params = new URLSearchParams(window.location.search);
      var caseId = params.get("case");
      if (!caseId) return;

      var merged = await CaseCloud.load(caseId);
      if (!merged) return;

      // Let the report restore its own rich data if it can.
      window.loadedCase = merged;
      try {
        if (typeof window.applyCase === "function") window.applyCase(merged);
      } catch (e) { console.warn("applyCase failed", e); }

      // Always ensure base identity fields are filled.
      fillBase(merged.base);

      // Small banner so the consultant knows which case is loaded.
      var name = (merged.base && merged.base.name) || caseId;
      var bar = document.createElement("div");
      bar.textContent = "تم تحميل الحالة: " + name + " (" + caseId + ")";
      bar.style.cssText =
        "position:sticky;top:0;z-index:60;background:#2A898C;color:#fff;" +
        "padding:8px 14px;font-family:'IBM Plex Sans Arabic',sans-serif;font-weight:700;" +
        "font-size:13px;text-align:center;border-radius:0 0 10px 10px;";
      if (document.body) document.body.insertBefore(bar, document.body.firstChild);
    } catch (e) {
      console.error("autoLoadFromUrl failed", e);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () { setTimeout(autoLoadFromUrl, 200); });
  } else {
    setTimeout(autoLoadFromUrl, 200);
  }
})();
