/* =====================================================================
   Cash Clinic — shared report features
   Adds to every interactive report:
     • saveReportData(reportType, btn)  -> save DATA ONLY to the database (no PDF)
     • openClients(reportType)          -> list saved clients, load one back
     • signature pads (draw with finger/mouse), captured into the PDF
   Requires: case-cloud.js loaded first (window.CaseCloud).
   Each report sets  window.REPORT_TYPE = 's1' | 's2' | 's3' | 's4' | 'invoice'
   ===================================================================== */
(function () {
  "use strict";

  function RT() { return window.REPORT_TYPE || "s1"; }

  // ---- exact snapshot of every form field, for perfect reload ----
  function fieldSnapshot() {
    var d = {};
    document.querySelectorAll("input, textarea, select").forEach(function (el, i) {
      d["f" + i] = (el.type === "checkbox" || el.type === "radio") ? el.checked : el.value;
    });
    return d;
  }
  window.fieldSnapshot = window.fieldSnapshot || fieldSnapshot;

  function restoreFields(fieldsRaw) {
    document.querySelectorAll("input, textarea, select").forEach(function (el, i) {
      var k = "f" + i;
      if (fieldsRaw[k] !== undefined) {
        if (el.type === "checkbox" || el.type === "radio") el.checked = fieldsRaw[k];
        else el.value = fieldsRaw[k];
      }
    });
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (m) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m];
    });
  }

  // ---------- Save DATA ONLY (no PDF) ----------
  window.saveReportData = async function (btn) {
    if (!window.CaseCloud || !window.CaseCloud.saveDataOnly) {
      alert("وحدة الحفظ السحابي غير محمّلة."); return;
    }
    var old = btn.textContent; btn.textContent = "⏳ جاري حفظ البيانات..."; btn.disabled = true;
    try {
      var snap = (typeof window.fieldSnapshot === "function") ? window.fieldSnapshot() : null;
      var res = await window.CaseCloud.saveDataOnly(RT(), snap);
      if (res && res.ok) {
        btn.textContent = "✓ حُفظت البيانات في السحابة";
        setTimeout(function () { btn.textContent = old; btn.disabled = false; }, 3500);
      } else {
        btn.textContent = "⚠️ تعذّر حفظ البيانات"; btn.disabled = false; console.error(res && res.error);
      }
    } catch (e) { btn.textContent = "⚠️ خطأ"; btn.disabled = false; console.error(e); }
  };

  // ---------- Clients list ----------
  window.openClients = async function () {
    var modal = document.getElementById("clientsModal");
    var body = document.getElementById("clientsBody");
    if (!modal) return;
    modal.style.display = "flex";
    body.innerHTML = '<div style="padding:30px;text-align:center;color:#756E80">⏳ جاري تحميل قائمة العملاء...</div>';
    if (!window.CaseCloud) { body.innerHTML = '<div style="padding:30px;text-align:center;color:#962D38">وحدة السحابة غير محمّلة.</div>'; return; }
    try {
      var cases = await window.CaseCloud.listCases();
      if (!cases || !cases.length) { body.innerHTML = '<div style="padding:30px;text-align:center;color:#756E80">لا يوجد عملاء محفوظون بعد.</div>'; return; }
      body.innerHTML = cases.map(function (c) {
        var b = c.base || {};
        var nm = b.name || "(بدون اسم)";
        var no = b.caseNo ? ("# " + b.caseNo) : "";
        var ref = b.charityRef ? ("مرجع: " + b.charityRef) : "";
        return '<div class="cl-row">' +
          '<div class="cl-info"><div class="cl-name">' + esc(nm) + '</div><div class="cl-meta">' + esc(no) + " " + esc(ref) + '</div></div>' +
          '<button class="cl-load" onclick="loadClientData(\'' + c.caseId + '\')">فتح في التقرير ↩</button>' +
          "</div>";
      }).join("");
    } catch (e) {
      body.innerHTML = '<div style="padding:30px;text-align:center;color:#962D38">تعذّر تحميل القائمة.</div>'; console.error(e);
    }
  };
  window.closeClients = function () { var m = document.getElementById("clientsModal"); if (m) m.style.display = "none"; };

  window.loadClientData = async function (caseId) {
    var body = document.getElementById("clientsBody");
    if (body) body.innerHTML = '<div style="padding:30px;text-align:center;color:#756E80">⏳ جاري فتح بيانات العميل...</div>';
    try {
      var r = await window.CaseCloud.loadReport(caseId, RT());
      if (!r) { alert("ما فيه بيانات محفوظة لهذا العميل في هذا التقرير."); window.closeClients(); return; }
      window.loadedCase = r.data || null;
      if (r.fieldsRaw) restoreFields(r.fieldsRaw);
      else if (r.base) {
        var set = function (id, val) { var el = document.getElementById(id); if (el && val) el.value = val; };
        // fill common base ids across reports (cd_ and ce_ variants)
        set("ce_caseNo", r.base.caseNo); set("cd_caseNo", r.base.caseNo);
        set("ce_charityRef", r.base.charityRef); set("cd_charityRef", r.base.charityRef);
        set("ce_name", r.base.name); set("cd_name", r.base.name);
        set("ce_charity", r.base.charity);
      }
      // let the report re-run its calculations + apply logic
      if (typeof window.recalc === "function") { try { window.recalc(); } catch (e) {} }
      if (typeof window.applyCase === "function" && window.loadedCase) { try { window.applyCase(window.loadedCase); } catch (e) {} }
      // restore any signatures
      if (typeof window.restoreAllSigs === "function") window.restoreAllSigs();
      window.closeClients();
      setTimeout(function () { window.scrollTo({ top: 0, behavior: "smooth" }); }, 100);
    } catch (e) { alert("تعذّر فتح بيانات العميل."); console.error(e); }
  };

  // ---------- Signature pads (draw with finger/mouse) ----------
  window.initSigPad = function (n) {
    var canvas = document.getElementById("sigPad" + n);
    if (!canvas) return;
    var ctx = canvas.getContext("2d");
    var drawing = false, dirty = false;
    function resize() {
      var rect = canvas.getBoundingClientRect();
      if (!rect.width) return;
      var ratio = window.devicePixelRatio || 1;
      var data = dirty ? canvas.toDataURL() : null;
      canvas.width = rect.width * ratio; canvas.height = rect.height * ratio;
      ctx.scale(ratio, ratio);
      ctx.lineWidth = 2.2; ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.strokeStyle = "#1B1226";
      if (data) { var img = new Image(); img.onload = function () { ctx.drawImage(img, 0, 0, rect.width, rect.height); }; img.src = data; }
    }
    setTimeout(resize, 60);
    window.addEventListener("resize", resize);
    function pos(e) { var rect = canvas.getBoundingClientRect(); var t = e.touches ? e.touches[0] : e; return { x: t.clientX - rect.left, y: t.clientY - rect.top }; }
    function start(e) { drawing = true; dirty = true; var p = pos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y); e.preventDefault(); }
    function move(e) { if (!drawing) return; var p = pos(e); ctx.lineTo(p.x, p.y); ctx.stroke(); e.preventDefault(); }
    function end() { if (!drawing) return; drawing = false; window.saveSig(n); }
    canvas.addEventListener("mousedown", start); canvas.addEventListener("mousemove", move); window.addEventListener("mouseup", end);
    canvas.addEventListener("touchstart", start, { passive: false }); canvas.addEventListener("touchmove", move, { passive: false }); canvas.addEventListener("touchend", end);
    canvas._setDirty = function (v) { dirty = v; };
  };
  window.saveSig = function (n) {
    var canvas = document.getElementById("sigPad" + n);
    var hidden = document.getElementById("sigData" + n);
    var img = document.getElementById("sigImg" + n);
    if (!canvas || !hidden) return;
    var url = canvas.toDataURL("image/png");
    hidden.value = url;
    if (img) { img.src = url; img.style.display = "block"; }
  };
  window.clearSig = function (n) {
    var canvas = document.getElementById("sigPad" + n);
    var hidden = document.getElementById("sigData" + n);
    var img = document.getElementById("sigImg" + n);
    if (canvas) { var ctx = canvas.getContext("2d"); ctx.clearRect(0, 0, canvas.width, canvas.height); if (canvas._setDirty) canvas._setDirty(false); }
    if (hidden) hidden.value = "";
    if (img) { img.src = ""; img.style.display = "none"; }
  };
  window.restoreSig = function (n) {
    var hidden = document.getElementById("sigData" + n);
    var img = document.getElementById("sigImg" + n);
    var canvas = document.getElementById("sigPad" + n);
    if (hidden && hidden.value && img) {
      img.src = hidden.value; img.style.display = "block";
      if (canvas) { var ctx = canvas.getContext("2d"); var im = new Image(); im.onload = function () { var r = canvas.getBoundingClientRect(); ctx.drawImage(im, 0, 0, r.width, r.height); if (canvas._setDirty) canvas._setDirty(true); }; im.src = hidden.value; }
    }
  };
  // init all pads present on the page + provide a restore-all helper
  window.initAllSigs = function () {
    var pads = document.querySelectorAll("[id^='sigPad']");
    pads.forEach(function (p) { var n = p.id.replace("sigPad", ""); window.initSigPad(n); });
  };
  window.restoreAllSigs = function () {
    var pads = document.querySelectorAll("[id^='sigPad']");
    pads.forEach(function (p) { var n = p.id.replace("sigPad", ""); window.restoreSig(n); });
  };

  // auto-init signatures once DOM is ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () { setTimeout(window.initAllSigs, 100); });
  } else {
    setTimeout(window.initAllSigs, 100);
  }
})();
