// Gallery runtime — concatenated after the LOGOS / FAMILIES data by
// generate-logos.mjs so the published logos.js is self-contained.
// Assumes `LOGOS` and `FAMILIES` are already defined in this module scope.

(function () {
  "use strict";

  const root = document.documentElement;
  const gallery = document.getElementById("logo-gallery");
  const searchEl = document.getElementById("logo-search");
  const filterEl = document.getElementById("family-filter");
  const themeBtn = document.getElementById("theme-toggle");
  const resultsEl = document.getElementById("results-count");
  const selectionEl = document.getElementById("selection-count");
  const trayItems = document.getElementById("selection-items");
  const trayClear = document.getElementById("selection-clear");

  const shortlist = new Set();
  const MAX = 24;

  // populate the family filter, sorted by name
  FAMILIES.slice()
    .sort((a, b) => a.name.localeCompare(b.name))
    .forEach((f) => {
      const o = document.createElement("option");
      o.value = f.id;
      o.textContent = f.name + " (" + f.count + ")";
      filterEl.appendChild(o);
    });

  function escapeHTML(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function cardHTML(l) {
    const selected = shortlist.has(l.id);
    return (
      '<button class="logo-card' +
      (selected ? " is-selected" : "") +
      '" type="button" data-id="' +
      l.id +
      '" aria-pressed="' +
      selected +
      '">' +
      '<span class="logo-id">' +
      l.id +
      "</span>" +
      '<span class="logo-art">' +
      l.svg +
      "</span>" +
      '<span class="logo-name">' +
      escapeHTML(l.name) +
      "</span>" +
      '<span class="logo-family">' +
      escapeHTML(l.family) +
      "</span>" +
      '<span class="logo-concept">' +
      escapeHTML(l.concept) +
      "</span>" +
      '<span class="logo-spec">' +
      escapeHTML(l.spec) +
      "</span>" +
      "</button>"
    );
  }

  function matches(l, q, fam) {
    if (fam !== "all" && l.familyId !== fam) return false;
    if (!q) return true;
    const hay = (l.name + " " + l.family + " " + l.concept + " " + l.spec + " " + l.id).toLowerCase();
    return hay.includes(q);
  }

  function render() {
    const q = (searchEl.value || "").trim().toLowerCase();
    const fam = filterEl.value;
    const list = LOGOS.filter((l) => matches(l, q, fam));
    gallery.innerHTML = list.map(cardHTML).join("");
    resultsEl.textContent = list.length + " of " + LOGOS.length + " logos";
  }

  function renderTray() {
    const ids = Array.from(shortlist);
    trayItems.innerHTML = ids
      .map((id) => {
        const l = LOGOS.find((x) => x.id === id);
        return (
          '<span class="tray-chip" data-id="' +
          id +
          '">' +
          id +
          " · " +
          escapeHTML(l ? l.name : id) +
          '<button class="tray-x" type="button" data-id="' +
          id +
          '" aria-label="Remove from shortlist">×</button></span>'
        );
      })
      .join("");
    selectionEl.textContent = shortlist.size ? shortlist.size + " shortlisted" : "Nothing selected";
  }

  function syncCard(id, on) {
    const card = gallery.querySelector('.logo-card[data-id="' + id + '"]');
    if (!card) return;
    card.classList.toggle("is-selected", on);
    card.setAttribute("aria-pressed", String(on));
  }

  gallery.addEventListener("click", (e) => {
    const btn = e.target.closest(".logo-card");
    if (!btn) return;
    const id = btn.dataset.id;
    if (shortlist.has(id)) {
      shortlist.delete(id);
    } else {
      if (shortlist.size >= MAX) shortlist.delete(Array.from(shortlist)[0]);
      shortlist.add(id);
    }
    syncCard(id, shortlist.has(id));
    renderTray();
  });

  trayItems.addEventListener("click", (e) => {
    const x = e.target.closest(".tray-x");
    if (!x) return;
    const id = x.dataset.id;
    shortlist.delete(id);
    syncCard(id, false);
    renderTray();
  });

  trayClear.addEventListener("click", () => {
    shortlist.clear();
    gallery
      .querySelectorAll(".logo-card.is-selected")
      .forEach((c) => {
        c.classList.remove("is-selected");
        c.setAttribute("aria-pressed", "false");
      });
    renderTray();
  });

  searchEl.addEventListener("input", render);
  filterEl.addEventListener("change", render);

  themeBtn.addEventListener("click", () => {
    const cur = root.getAttribute("data-theme");
    const next = cur === "dark" ? "paper" : "dark";
    root.setAttribute("data-theme", next);
    themeBtn.textContent = next === "dark" ? "Paper preview" : "Dark preview";
  });

  render();
  renderTray();
})();
