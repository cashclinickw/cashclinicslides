/* ============================================================
   Cash Clinic — field-flow.js
   Fixes two things across every report:
   1) Writing boxes grow as you type (Enter works, nothing hidden).
   2) When printing / saving the PDF, every field's text is swapped
      for a normal flowing paragraph, so long answers wrap across
      pages instead of being cut off inside a fixed-height box.
   Loaded by: s1-diagnostic, s2-accounting, s3-followup,
              s4-final, invoice-interactive
   ============================================================ */
(function () {
  "use strict";

  /* ---------- styles (also travel into the PDF snapshot) ---------- */
  var CSS = [
    ".ff-print,.ff-mirror{white-space:pre-wrap;overflow-wrap:anywhere;word-break:break-word;",
    "line-height:1.7;min-height:1.2em}",
    ".ff-mirror{display:none}",
    "body.ff-printing input:not([type=checkbox]):not([type=radio]),",
    "body.ff-printing textarea{display:none!important}",
    "body.ff-printing .ff-mirror{display:block!important}",
    "@media print{",
    "  .section{page-break-inside:auto!important;break-inside:auto!important}",
    "  .field{page-break-inside:auto!important;break-inside:auto!important}",
    "  .sec-head{page-break-after:avoid;break-after:avoid}",
    "  .sub{page-break-after:avoid;break-after:avoid}",
    "  .ff-print,.ff-mirror{border:0!important;background:transparent!important;padding:2px 0!important}",
    "  table,tr,td,th{page-break-inside:avoid}",
    "}"
  ].join("");

  function injectCss() {
    if (document.getElementById("ff-style")) return;
    var s = document.createElement("style");
    s.id = "ff-style";
    s.textContent = CSS;
    (document.head || document.documentElement).appendChild(s);
  }

  /* ---------- 1. auto-grow textareas ---------- */
  function grow(t) {
    if (!t || t.tagName !== "TEXTAREA") return;
    t.style.height = "auto";
    t.style.height = Math.max(t.scrollHeight + 2, 40) + "px";
  }

  function bind(root) {
    var list = (root || document).querySelectorAll("textarea");
    Array.prototype.forEach.call(list, function (t) {
      if (t.getAttribute("data-ff") === "1") return;
      t.setAttribute("data-ff", "1");
      t.style.overflow = "hidden";
      t.addEventListener("input", function () { grow(t); });
      grow(t);
    });
  }

  /* Re-bind when rows are added dynamically (quotes, children, tables). */
  function watch() {
    if (!window.MutationObserver) return;
    var mo = new MutationObserver(function (muts) {
      var hit = false;
      muts.forEach(function (m) {
        Array.prototype.forEach.call(m.addedNodes || [], function (n) {
          if (n.nodeType === 1 &&
              (n.tagName === "TEXTAREA" || n.querySelector && n.querySelector("textarea"))) hit = true;
        });
      });
      if (hit) bind(document);
    });
    mo.observe(document.body, { childList: true, subtree: true });
  }

  /* ---------- 2. printable text ---------- */
  function valueOf(el) {
    if (el.tagName === "TEXTAREA") return el.value || el.textContent || "";
    var v = el.value;
    if (v === undefined || v === null || v === "") v = el.getAttribute("value") || "";
    return v;
  }

  function isTextField(el) {
    if (el.tagName === "TEXTAREA") return true;
    if (el.tagName !== "INPUT") return false;
    var t = (el.getAttribute("type") || "text").toLowerCase();
    return t === "text" || t === "number" || t === "date" || t === "tel" || t === "email";
  }

  /* Replace fields with static text blocks — used on the PDF snapshot clone. */
  function flatten(root) {
    if (!root) return root;
    // never let the on-screen "one section at a time" view reach the PDF
    try {
      var bd = root.querySelector ? root.querySelector("body") : null;
      if (bd) bd.classList.remove("jn-focus");
      Array.prototype.forEach.call(root.querySelectorAll(".jn-active, .jn-hidden"), function (n) {
        n.classList.remove("jn-active");
        n.classList.remove("jn-hidden");
      });
    } catch (e) {}
    var els = root.querySelectorAll("input, textarea");
    Array.prototype.forEach.call(els, function (el) {
      if (!isTextField(el)) return;
      var d = document.createElement("div");
      d.className = "ff-print " + (el.className || "");
      var st = el.getAttribute("style") || "";
      d.setAttribute("style", st.replace(/height\s*:[^;]*;?/gi, ""));
      d.textContent = valueOf(el);
      if (el.parentNode) el.parentNode.replaceChild(d, el);
    });
    return root;
  }

  /* Mirror fields for browser print (non-destructive — undone afterwards). */
  function addMirrors() {
    removeMirrors();
    var els = document.querySelectorAll("input, textarea");
    Array.prototype.forEach.call(els, function (el) {
      if (!isTextField(el)) return;
      var d = document.createElement("div");
      d.className = "ff-mirror";
      d.textContent = valueOf(el);
      if (el.parentNode) el.parentNode.insertBefore(d, el.nextSibling);
    });
    document.body.classList.add("ff-printing");
  }

  function removeMirrors() {
    document.body.classList.remove("ff-printing");
    var m = document.querySelectorAll(".ff-mirror");
    Array.prototype.forEach.call(m, function (n) {
      n.parentNode && n.parentNode.removeChild(n);
    });
  }

  function start() {
    injectCss();
    bind(document);
    watch();
    window.addEventListener("beforeprint", addMirrors);
    window.addEventListener("afterprint", removeMirrors);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }

  window.FieldFlow = {
    flatten: flatten,
    grow: grow,
    bind: bind,
    addMirrors: addMirrors,
    removeMirrors: removeMirrors
  };
})();
