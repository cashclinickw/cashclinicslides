/* ============================================================
   Cash Clinic — jump-nav.js
   The section picker becomes ONE scrollable line. Choosing a
   section shows that section on its own, like a separate page.

   Screen only. Every rule lives inside @media screen, and the
   focus state is stripped from the PDF snapshot, so saving,
   printing and the Drive PDF always contain the whole report.
   ============================================================ */
(function () {
  "use strict";

  var CSS = [
    "@media screen{",
    "  .jumpnav .jn-items{display:flex!important;flex-wrap:nowrap!important;overflow-x:auto;",
    "    overflow-y:hidden;gap:8px;-webkit-overflow-scrolling:touch;",
    "    scroll-snap-type:x proximity;padding-bottom:8px;scrollbar-width:thin}",
    "  .jumpnav .jn-items::-webkit-scrollbar{height:6px}",
    "  .jumpnav .jn-items::-webkit-scrollbar-track{background:rgba(255,255,255,.08);border-radius:99px}",
    "  .jumpnav .jn-items::-webkit-scrollbar-thumb{background:rgba(255,255,255,.30);border-radius:99px}",
    "  .jumpnav .jn-items > a{flex:0 0 auto!important;white-space:nowrap!important;scroll-snap-align:start}",
    "  .jumpnav .jn-items > a.jn-on{background:var(--cc-gold,#D3A146)!important;",
    "    color:#2F1748!important;font-weight:700}",
    "  .jumpnav .jn-items > a.jn-all{background:rgba(255,255,255,.16)}",
    "  body.jn-focus .jn-hidden{display:none!important}",
    "}"
  ].join("");

  function injectCss() {
    if (document.getElementById("jn-style")) return;
    var s = document.createElement("style");
    s.id = "jn-style";
    s.textContent = CSS;
    (document.head || document.documentElement).appendChild(s);
  }

  function clearHidden() {
    Array.prototype.forEach.call(document.querySelectorAll(".jn-hidden"), function (n) {
      n.classList.remove("jn-hidden");
    });
  }

  function showAll() {
    document.body.classList.remove("jn-focus");
    clearHidden();
    Array.prototype.forEach.call(document.querySelectorAll(".section.jn-active"), function (n) {
      n.classList.remove("jn-active");
    });
    Array.prototype.forEach.call(document.querySelectorAll(".jumpnav .jn-items > a"), function (a) {
      a.classList.remove("jn-on");
    });
    var all = document.querySelector(".jumpnav .jn-all");
    if (all) all.classList.add("jn-on");
  }

  function focusSection(id, pill) {
    var sec = document.getElementById(id);
    if (!sec) return;
    clearHidden();
    Array.prototype.forEach.call(document.querySelectorAll(".section"), function (n) {
      n.classList.remove("jn-active");
    });
    sec.classList.add("jn-active");

    // Hide every sibling of the chosen section (cover, banner, other
    // sections, footer...) but keep the picker and the toolbar.
    var wrap = sec.parentNode;
    if (wrap) {
      Array.prototype.forEach.call(wrap.children, function (ch) {
        if (ch === sec) return;
        if (ch.classList && (ch.classList.contains("jumpnav") || ch.classList.contains("toolbar"))) return;
        if (ch.tagName === "SCRIPT" || ch.tagName === "STYLE") return;
        ch.classList.add("jn-hidden");
      });
    }
    document.body.classList.add("jn-focus");
    Array.prototype.forEach.call(document.querySelectorAll(".jumpnav .jn-items > a"), function (a) {
      a.classList.remove("jn-on");
    });
    if (pill) pill.classList.add("jn-on");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function start() {
    injectCss();
    var nav = document.querySelector(".jumpnav .jn-items");
    if (!nav) return;

    // "الكل" pill returns to the full report
    if (!nav.querySelector(".jn-all")) {
      var all = document.createElement("a");
      all.href = "#";
      all.className = "jn-all jn-on";
      all.innerHTML = '<span class="jn-num">☰</span>الكل';
      all.addEventListener("click", function (e) { e.preventDefault(); showAll(); });
      nav.insertBefore(all, nav.firstChild);
    }

    Array.prototype.forEach.call(nav.querySelectorAll("a"), function (a) {
      if (a.classList.contains("jn-all")) return;
      var href = a.getAttribute("href") || "";
      if (href.charAt(0) !== "#") return;
      var id = href.slice(1);
      a.addEventListener("click", function (e) {
        e.preventDefault();
        focusSection(id, a);
      });
    });

    var title = document.querySelector(".jumpnav .jn-title");
    if (title) title.textContent = "اختر القسم — اسحب لليمين واليسار";
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();

  window.JumpNav = { showAll: showAll, focus: focusSection };
})();
