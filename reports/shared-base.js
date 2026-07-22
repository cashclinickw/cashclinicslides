/* ============================================================
   Cash Clinic — shared-base.js
   Personal data is entered once in session 1 and carries
   automatically into sessions 2, 3 and the final session.
   Fields stay editable in every report — if something changed,
   the consultant can correct it and the new value is saved back
   to the case.
   ============================================================ */
(function () {
  "use strict";

  /* canonical key  ->  the element ids each report happens to use */
  var MAP = {
    caseNo:      ["ce_caseNo", "cd_caseNo"],
    charityRef:  ["ce_charityRef", "cd_charityRef"],
    name:        ["ce_name", "cd_name"],
    charity:     ["ce_charity", "cd_charity"],
    nationality: ["ce_nat", "cd_nat"],
    dob:         ["ce_dob", "cd_dob"],
    age:         ["ce_age", "cd_age"],
    marital:     ["ce_marital", "cd_marital"],
    employment:  ["ce_job", "ce_employment", "cd_employment", "cd_job"],
    salary:      ["ce_salary", "cd_salary"],
    kids:        ["ce_kids", "cd_kids"],
    kidsDetails: ["ce_kidsDetails", "cd_kidsDetails"],
    problem:     ["ce_problem", "cd_problem"]
  };

  function el(ids) {
    for (var i = 0; i < ids.length; i++) {
      var e = document.getElementById(ids[i]);
      if (e) return e;
    }
    return null;
  }

  /* Session 1 keeps the children in a table; flatten it to one line
     so the other reports can show it in their single text box. */
  function childrenText() {
    var tb = document.querySelector("#tChildren tbody");
    if (!tb) return "";
    var out = [];
    Array.prototype.forEach.call(tb.querySelectorAll("tr"), function (tr) {
      var f = tr.querySelectorAll("input, select");
      var age = f[0] ? (f[0].value || "").trim() : "";
      var mar = f[1] ? (f[1].value || "").trim() : "";
      var job = f[2] ? (f[2].value || "").trim() : "";
      var parts = [];
      if (age) parts.push(age + " سنة");
      if (mar) parts.push(mar);
      if (job) parts.push(job);
      if (parts.length) out.push(parts.join(" — "));
    });
    return out.join(" / ");
  }

  function collect() {
    var out = {};
    Object.keys(MAP).forEach(function (k) {
      var e = el(MAP[k]);
      if (e && e.value !== undefined && String(e.value).trim() !== "") {
        out[k] = e.value;
      }
    });
    var kt = childrenText();
    if (kt && !out.kidsDetails) out.kidsDetails = kt;
    return out;
  }

  /* Fill any field this report has that is still empty. */
  function apply(base, opts) {
    if (!base) return;
    var force = !!(opts && opts.force);
    Object.keys(MAP).forEach(function (k) {
      var v = base[k];
      if (v === undefined || v === null || String(v) === "") return;
      var e = el(MAP[k]);
      if (!e) return;
      if (!force && String(e.value || "").trim() !== "") return; // don't clobber typed data
      e.value = v;
    });
    // session 1: rebuild the children rows from the saved text if empty
    var tb = document.querySelector("#tChildren tbody");
    if (tb && !tb.querySelector("tr") && base.kidsDetails && typeof window.addRow === "function") {
      String(base.kidsDetails).split("/").forEach(function (chunk) {
        var bits = chunk.split("—").map(function (s) { return s.trim(); });
        var tr = window.addRow("child");
        if (!tr) return;
        var f = tr.querySelectorAll("input, select");
        if (f[0]) f[0].value = (bits[0] || "").replace(/[^\d]/g, "");
        if (f[1]) f[1].value = bits[1] || "";
        if (f[2]) f[2].value = bits[2] || "";
      });
    }
    if (typeof window.calcAge === "function") { try { window.calcAge(); } catch (e) {} }
    if (typeof window.recalc === "function") { try { window.recalc(); } catch (e) {} }
  }

  window.SharedBase = { collect: collect, apply: apply, map: MAP };
})();
