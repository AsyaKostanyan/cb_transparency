/* =============================================================================
   FPAS Mark II — Central Bank Transparency Index
   Application logic: rendering, scoring, save/load/export
   ============================================================================= */

const STORAGE_KEY = "fpas-cbt-index-v2";

/* =============================================================================
   SUBMISSION CONFIG
   -----------------------------------------------------------------------------
   Paste your collection endpoint below to enable the "Submit response" button.
   All responses will be delivered there automatically.

   • Formspree (easiest):  create a free form at https://formspree.io and paste
     its endpoint, e.g.  "https://formspree.io/f/abcdwxyz"
   • Google Apps Script:   deploy a Web App (doPost) and paste its /exec URL.
     For Apps Script also set SUBMIT_MODE = "no-cors" below (see README).

   Leave SUBMIT_ENDPOINT empty ("") to keep the site local-only; the Submit
   button will then explain that collection is not configured.
   ============================================================================= */
const SUBMIT_ENDPOINT = "https://script.google.com/macros/s/AKfycbzRfczH0uS7h1OzL68es3Z1evf96bxI7HpSDN9Uj7bRyUcsF8XzwGah8VmCl7Sqld0/exec";
const SUBMIT_MODE = "no-cors";           // "no-cors" for the Apps Script email backend

const EMPTY_META = { name: "", institution: "", job: "", email: "", bank: "", date: "" };

/* ---- State -------------------------------------------------------------- */
const state = {
  meta: { ...EMPTY_META },
  rd: { RD1: null, RD2: null },    // Regime Detection answers (option keys)
  regime: null,                    // 'non-fpas' | 'mark-i' | 'mark-ii' | null
  answers: {}                      // code -> { sel, branch, custom, notes }
};

/* Derive the regime from the two diagnostic answers. */
function computeRegime() {
  const rd = state.rd || {};
  if (rd.RD1 === "no") return "non-fpas";
  if (rd.RD1 === "yes") {
    if (rd.RD2 === "no") return "mark-i";
    if (rd.RD2 === "yes") return "mark-ii";
  }
  return null;
}
/* Section B scale ('baseline' | 'scenarios') implied by the detected regime. */
function regimeScale() {
  if (!state.regime) return null;
  const r = REGIME_DETECTION.regimes[state.regime];
  return r ? r.scale : null;
}
/* Back-compat: older saves stored a manual `framework` toggle, not a regime. */
function migrateFramework(framework) {
  if (framework === "scenarios") return "mark-ii";
  if (framework === "baseline") return "mark-i";
  return null;
}
/* Keep the RD answers in sync with a regime set programmatically (load/migrate). */
function reconcileRdFromRegime() {
  if (state.regime === "non-fpas") state.rd = { RD1: "no", RD2: null };
  else if (state.regime === "mark-i") state.rd = { RD1: "yes", RD2: "no" };
  else if (state.regime === "mark-ii") state.rd = { RD1: "yes", RD2: "yes" };
}

/* Codes the current regime forces to 0 (e.g. Non-FPAS zeroes most of Section B). */
function autoZeroCodes() {
  const r = state.regime ? REGIME_DETECTION.regimes[state.regime] : null;
  return (r && r.autoZero) || [];
}
function isAutoZeroed(q) {
  return autoZeroCodes().indexOf(q.code) !== -1;
}

/* Resolve which options array is active for a question, given current state. */
function activeBranchKey(q) {
  if (q.framework) return regimeScale();                   // B4–B8 (null until regime set)
  if (q.branchToggle) {                                     // A3, C4
    const ans = state.answers[q.code];
    return (ans && ans.branch) || q.branchToggle.options[0].key;
  }
  return null;
}
function activeOptions(q) {
  const key = activeBranchKey(q);
  if (q.framework) return key ? q.branches[key].options : [];  // no options until regime set
  return key ? q.branches[key].options : q.options;
}

/* Score for one question (number) and its max (number). */
function questionScore(q) {
  if (isAutoZeroed(q)) return 0;                 // forced 0 under the active regime
  const ans = state.answers[q.code] || {};
  const opts = activeOptions(q);
  let score = 0;
  if (ans.sel != null && opts[ans.sel]) {
    const opt = opts[ans.sel];
    score = opt.custom ? (ans.custom != null ? ans.custom : opt.custom.default) : opt.score;
  }
  return score;
}
function optionsMax(opts) {
  return opts.reduce((m, o) => Math.max(m, o.custom ? o.custom.max : o.score), 0);
}
/* Reference maximum = highest score across ALL branches, so the stated section
   maxima (A=4, B=14, C=7, total=25) stay fixed regardless of branch toggles. */
function questionMax(q) {
  if (q.branches) {
    return Object.values(q.branches).reduce((m, b) => Math.max(m, optionsMax(b.options)), 0);
  }
  return optionsMax(q.options);
}
function sectionScore(sec) {
  return sec.questions.reduce((s, q) => s + questionScore(q), 0);
}
function sectionMax(sec) {
  return sec.questions.reduce((s, q) => s + questionMax(q), 0);
}

const fmt = (n) => (Math.round(n * 100) / 100).toFixed(2).replace(/\.00$/, ".0").replace(/(\.\d)0$/, "$1");

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/* ---- Rendering ---------------------------------------------------------- */
function render() {
  const main = document.getElementById("questionnaire");
  main.innerHTML = "";

  // Regime Detection panel (rendered once, before the sections)
  main.appendChild(renderRegimePanel());

  QUESTIONNAIRE.sections.forEach((sec) => {
    const secEl = document.createElement("section");
    secEl.className = "section";
    secEl.id = "section-" + sec.id;

    secEl.innerHTML = `
      <div class="section-head">
        <span class="sec-id">${sec.id}</span>
        <h2>${sec.title}</h2>
        <span class="sec-score" id="secscore-${sec.id}"></span>
      </div>`;

    // Section B: explanatory note + read-only regime/scale banner (auto-detected)
    if (sec.id === "B") {
      const note = document.createElement("p");
      note.className = "section-note";
      note.textContent = sec.frameworkNote;
      secEl.appendChild(note);
      secEl.appendChild(renderScaleBanner());
    }

    sec.questions.forEach((q) => secEl.appendChild(renderQuestion(q)));
    main.appendChild(secEl);
  });

  updateScores();
}

/* Regime Detection: two diagnostic questions that auto-classify the bank. */
function renderRegimePanel() {
  const RD = REGIME_DETECTION;
  const panel = document.createElement("section");
  panel.className = "regime-panel";
  panel.id = "regime-panel";

  panel.innerHTML = `
    <div class="regime-head">
      <span class="regime-step">RD</span>
      <div>
        <h2>${RD.title}</h2>
        <p class="regime-sub">${RD.subtitle}</p>
      </div>
    </div>
    <p class="regime-intro">${RD.intro}</p>
    <div class="regime-questions" id="regime-questions"></div>
    <div class="regime-result" id="regime-result"></div>`;

  const qWrap = panel.querySelector("#regime-questions");

  RD.questions.forEach((rq) => {
    // Honour showWhen conditions (RD2 only appears once RD1 = yes)
    if (rq.showWhen) {
      const ok = Object.entries(rq.showWhen).every(([k, v]) => state.rd[k] === v);
      if (!ok) return;
    }
    const card = document.createElement("div");
    card.className = "rd-card";
    const current = state.rd[rq.code];
    card.innerHTML = `
      <div class="q-top">
        <span class="q-code">${rq.code}</span>
        <p class="q-text">${rq.text}</p>
      </div>
      <div class="rd-options">
        ${rq.options
          .map(
            (o) => `
          <label class="rd-opt ${current === o.key ? "selected" : ""}">
            <input type="radio" name="rd-${rq.code}" value="${o.key}" ${current === o.key ? "checked" : ""}/>
            <span>${o.label}</span>
          </label>`
          )
          .join("")}
      </div>`;
    card.querySelectorAll("input[type=radio]").forEach((input) => {
      input.addEventListener("change", () => {
        state.rd[rq.code] = input.value;
        // If RD1 changes away from 'yes', RD2 no longer applies
        if (rq.code === "RD1" && input.value !== "yes") state.rd.RD2 = null;
        state.regime = computeRegime();
        save();
        render();
      });
    });
    qWrap.appendChild(card);
  });

  // Result badge
  const result = panel.querySelector("#regime-result");
  if (state.regime) {
    const r = RD.regimes[state.regime];
    result.innerHTML = `
      <div class="regime-badge regime-${state.regime}">
        <span class="regime-badge-label">Detected regime</span>
        <strong>${r.label}</strong>
      </div>
      <p class="regime-desc">${r.desc}</p>`;
  } else {
    result.innerHTML = `<p class="regime-pending">Answer the question${state.rd.RD1 === "yes" ? "s" : ""} above to classify the regime and unlock the Section&nbsp;B scale (B4–B8).</p>`;
  }

  return panel;
}

/* Read-only banner shown in Section B reflecting the auto-detected scale. */
function renderScaleBanner() {
  const wrap = document.createElement("div");
  wrap.className = "scale-banner";
  if (state.regime) {
    const r = REGIME_DETECTION.regimes[state.regime];
    wrap.classList.add("regime-" + state.regime);
    wrap.innerHTML = `
      <span class="ft-label">Section B scale (B4–B8):</span>
      <span class="scale-chip">${r.label}</span>
      <span class="scale-detail">${r.short}</span>
      <a href="#regime-panel" class="scale-edit">Change in Regime Detection ↑</a>`;
  } else {
    wrap.classList.add("scale-unset");
    wrap.innerHTML = `
      <span class="ft-label">Section B scale (B4–B8):</span>
      <span class="scale-detail">Not set — <a href="#regime-panel">complete Regime Detection</a> to score B4–B8.</span>`;
  }
  return wrap;
}

function renderQuestion(q) {
  const card = document.createElement("div");
  card.className = "q-card";
  card.id = "q-" + q.code;

  card.innerHTML = `
    <div class="q-top">
      <span class="q-code">${q.code}</span>
      <p class="q-text">${q.text}</p>
    </div>`;

  // Auto-zeroed under the active regime (e.g. Non-FPAS): locked at 0, read-only.
  if (isAutoZeroed(q)) {
    card.classList.add("q-card-zeroed");
    const r = REGIME_DETECTION.regimes[state.regime];
    const note = document.createElement("div");
    note.className = "q-autozero";
    note.innerHTML = `
      <span class="q-score-pill scored-0">${fmt(0)}</span>
      <p>Automatically scored <strong>0</strong> under the <strong>${r.label}</strong> regime. In Section&nbsp;B, only <strong>B2</strong> and <strong>B9</strong> are rated for ${r.label} banks.</p>`;
    card.appendChild(note);
    return card;
  }

  // per-question branch toggle (A3, C4)
  if (q.branchToggle) {
    const wrap = document.createElement("div");
    wrap.className = "framework-toggle";
    const cur = activeBranchKey(q);
    wrap.innerHTML =
      `<span class="ft-label">${q.branchToggle.label}:</span>
       <div class="seg branch-seg">` +
      q.branchToggle.options
        .map((o) => `<button type="button" data-branch="${o.key}" class="${o.key === cur ? "active" : ""}">${o.label}</button>`)
        .join("") +
      `</div>`;
    wrap.querySelectorAll("button").forEach((b) => {
      b.addEventListener("click", () => {
        ensureAns(q.code).branch = b.dataset.branch;
        ensureAns(q.code).sel = null;     // reset selection on branch change
        save();
        render();
      });
    });
    card.appendChild(wrap);
  }

  // Framework questions (B4–B8) are locked until the regime is detected.
  if (q.framework && !state.regime) {
    const lock = document.createElement("p");
    lock.className = "q-locked";
    lock.innerHTML = `Scored on the baseline or prudent risk-management scale once the regime is set — <a href="#regime-panel">complete Regime Detection</a>.`;
    card.appendChild(lock);
    return card;
  }

  // branch note (for framework questions B4–B8)
  const bk = activeBranchKey(q);
  if (bk && q.branches[bk] && q.branches[bk].note) {
    const bn = document.createElement("p");
    bn.className = "branch-note";
    bn.textContent = q.branches[bk].note;
    card.appendChild(bn);
  }

  const opts = activeOptions(q);
  const ans = state.answers[q.code] || {};

  const controls = document.createElement("div");
  controls.className = "q-controls";

  // --- rating select ---
  const rate = document.createElement("div");
  rate.className = "q-rate";
  const selId = "sel-" + q.code;
  let optionsHtml = `<option value="">— Select a rating —</option>`;
  opts.forEach((o, i) => {
    const val = o.custom ? `${o.custom.min}–${o.custom.max}` : fmt(o.score);
    optionsHtml += `<option value="${i}" ${ans.sel === i ? "selected" : ""}>[${val}] ${o.label}</option>`;
  });

  rate.innerHTML = `
    <label for="${selId}">Rating</label>
    <div class="q-row">
      <select class="rate-select" id="${selId}">${optionsHtml}</select>
      <span class="q-score-pill" id="pill-${q.code}">—</span>
    </div>
    <div class="custom-score" id="custom-${q.code}">
      <label for="cust-${q.code}" style="text-transform:none;letter-spacing:0;">Partial score:</label>
      <input type="number" id="cust-${q.code}" />
    </div>`;
  controls.appendChild(rate);

  // --- notes ---
  const notes = document.createElement("div");
  notes.className = "q-notes";
  notes.innerHTML = `
    <label for="note-${q.code}">Evidence / notes (links, page refs, justification)</label>
    <textarea id="note-${q.code}" placeholder="Add supporting evidence or explanation…">${(ans.notes || "").replace(/</g, "&lt;")}</textarea>`;
  controls.appendChild(notes);

  card.appendChild(controls);

  // wire select
  const sel = rate.querySelector("select");
  sel.addEventListener("change", () => {
    const a = ensureAns(q.code);
    a.sel = sel.value === "" ? null : Number(sel.value);
    const chosen = a.sel != null ? opts[a.sel] : null;
    if (chosen && chosen.custom && a.custom == null) a.custom = chosen.custom.default;
    save();
    toggleCustom(q);
    updateScores();
  });

  // wire custom number
  const custInput = rate.querySelector("input[type=number]");
  custInput.addEventListener("input", () => {
    const a = ensureAns(q.code);
    let v = parseFloat(custInput.value);
    if (isNaN(v)) v = 0;
    a.custom = v;
    save();
    updateScores();
  });

  // wire notes
  notes.querySelector("textarea").addEventListener("input", (e) => {
    ensureAns(q.code).notes = e.target.value;
    save();
  });

  // init custom visibility/value
  setTimeout(() => toggleCustom(q), 0);

  return card;
}

function toggleCustom(q) {
  const opts = activeOptions(q);
  const ans = state.answers[q.code] || {};
  const chosen = ans.sel != null ? opts[ans.sel] : null;
  const box = document.getElementById("custom-" + q.code);
  const input = document.getElementById("cust-" + q.code);
  if (!box || !input) return;
  if (chosen && chosen.custom) {
    box.classList.add("show");
    input.min = chosen.custom.min;
    input.max = chosen.custom.max;
    input.step = chosen.custom.step;
    input.value = ans.custom != null ? ans.custom : chosen.custom.default;
  } else {
    box.classList.remove("show");
  }
}

/* ---- Scores ------------------------------------------------------------- */
function updateScores() {
  let total = 0, totalMax = 0;
  const chips = [];

  QUESTIONNAIRE.sections.forEach((sec) => {
    const s = sectionScore(sec), m = sectionMax(sec);
    total += s; totalMax += m;

    const secEl = document.getElementById("secscore-" + sec.id);
    if (secEl) secEl.textContent = `${fmt(s)} / ${fmt(m)}`;

    chips.push(
      `<div class="score-chip">
         <span class="chip-label">Section ${sec.id}</span>
         <span class="chip-value">${fmt(s)} / ${fmt(m)}</span>
         <span class="chip-bar"><span style="width:${m ? (s / m) * 100 : 0}%"></span></span>
       </div>`
    );

    // per-question pills
    sec.questions.forEach((q) => {
      const pill = document.getElementById("pill-" + q.code);
      if (!pill) return;
      const ans = state.answers[q.code] || {};
      if (ans.sel == null) {
        pill.textContent = "—";
        pill.className = "q-score-pill";
      } else {
        const sc = questionScore(q), mx = optionsMax(activeOptions(q));
        pill.textContent = fmt(sc);
        pill.className =
          "q-score-pill " + (sc <= 0 ? "scored-0" : sc >= mx ? "scored-full" : "scored-partial");
      }
    });
  });

  document.getElementById("total-score").textContent = fmt(total);
  document.getElementById("total-max").textContent = fmt(totalMax);
  document.getElementById("score-sections").innerHTML = chips.join("");
}

/* ---- State helpers ------------------------------------------------------ */
function ensureAns(code) {
  if (!state.answers[code]) state.answers[code] = { sel: null, notes: "" };
  return state.answers[code];
}

const META_FIELDS = ["name", "institution", "job", "email", "bank", "date"];

function save() {
  META_FIELDS.forEach((f) => {
    const el = document.getElementById("meta-" + f);
    if (el) state.meta[f] = el.value;
  });
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) {}
}

function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    Object.assign(state, data);
    if (!state.rd) state.rd = { RD1: null, RD2: null };
    // Migrate a pre-regime save that only had a manual `framework`.
    if (state.regime == null && data.framework) {
      state.regime = migrateFramework(data.framework);
      reconcileRdFromRegime();
    }
    // Keep the derived regime consistent with the stored RD answers.
    if (state.regime == null) state.regime = computeRegime();
    delete state.framework;
  } catch (e) {}
}

function applyMetaToForm() {
  META_FIELDS.forEach((f) => {
    const el = document.getElementById("meta-" + f);
    if (el) el.value = state.meta[f] || "";
  });
}

/* ---- Import / Export ---------------------------------------------------- */
function downloadFile(name, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

function saveToFile() {
  save();
  const bank = (state.meta.bank || "central-bank").replace(/[^\w-]+/g, "-").toLowerCase();
  downloadFile(`cbt-index-${bank}.json`, JSON.stringify(state, null, 2), "application/json");
  showResults();              // render charts whenever results are saved
  toast("Saved to file");
}

function exportCsv() {
  save();
  const regimeInfo = state.regime ? REGIME_DETECTION.regimes[state.regime] : null;
  const rows = [
    ["Central bank assessed", state.meta.bank || ""],
    ["Detected regime", regimeInfo ? regimeInfo.label : "(not detected)"],
    ["Section B scale", regimeInfo ? regimeInfo.short : ""],
    [],
    ["Section", "Question", "Branch", "Rating", "Score", "Max", "Notes"]
  ];
  QUESTIONNAIRE.sections.forEach((sec) => {
    sec.questions.forEach((q) => {
      const ans = state.answers[q.code] || {};
      const opts = activeOptions(q);
      const az = isAutoZeroed(q);
      const chosen = ans.sel != null ? opts[ans.sel] : null;
      const branch = activeBranchKey(q) || "";
      const rating = az
        ? `Automatically 0 (${regimeInfo ? regimeInfo.label : "regime rule"})`
        : (chosen ? chosen.label : "");
      rows.push([
        sec.id,
        q.code,
        branch,
        rating,
        (az || ans.sel != null) ? fmt(questionScore(q)) : "",
        fmt(questionMax(q)),
        ans.notes || ""
      ]);
    });
    rows.push([sec.id, "SUBTOTAL", "", "", fmt(sectionScore(sec)), fmt(sectionMax(sec)), ""]);
  });
  let total = 0, totalMax = 0;
  QUESTIONNAIRE.sections.forEach((s) => { total += sectionScore(s); totalMax += sectionMax(s); });
  rows.push(["", "TOTAL", "", "", fmt(total), fmt(totalMax), ""]);

  const csv = rows
    .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
    .join("\r\n");
  const bank = (state.meta.bank || "central-bank").replace(/[^\w-]+/g, "-").toLowerCase();
  downloadFile(`cbt-index-${bank}.csv`, "﻿" + csv, "text/csv;charset=utf-8");
  toast("Exported CSV");
}

function loadFromFile(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      state.meta = { ...EMPTY_META, ...(data.meta || {}) };
      state.rd = { RD1: null, RD2: null, ...(data.rd || {}) };
      state.regime = data.regime || migrateFramework(data.framework);
      // keep rd answers consistent with a migrated/loaded regime
      reconcileRdFromRegime();
      state.answers = data.answers || {};
      applyMetaToForm();
      render();
      save();
      toast("Loaded");
    } catch (e) {
      toast("Could not read file");
    }
  };
  reader.readAsText(file);
}

/* ---- Results & charts --------------------------------------------------- */
function levelOf(score, max) {
  if (max <= 0) return "none";
  if (score <= 0) return "zero";
  if (score >= max) return "full";
  return "partial";
}

/* Donut gauge (inline SVG). pct 0–100.
   Colours/rotation are baked in as presentation attributes (not CSS) so the
   gauge also renders correctly when rasterized into the emailed PDF. */
function donutSVG(pct, centerTop, centerSub) {
  const r = 54, c = 2 * Math.PI * r;
  const off = c * (1 - Math.max(0, Math.min(100, pct)) / 100);
  return `
    <svg viewBox="0 0 140 140" class="donut" role="img" aria-label="${centerTop} ${centerSub}">
      <circle cx="70" cy="70" r="${r}" fill="none" stroke="#e1e7ee" stroke-width="12"></circle>
      <circle cx="70" cy="70" r="${r}" fill="none" stroke="#1f6feb" stroke-width="12"
        stroke-linecap="round" transform="rotate(-90 70 70)"
        stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${off.toFixed(1)}"></circle>
      <text x="70" y="68" text-anchor="middle" font-size="26" font-weight="800" fill="#0f2a43">${centerTop}</text>
      <text x="70" y="88" text-anchor="middle" font-size="13" font-weight="600" fill="#5b6b7b">${centerSub}</text>
    </svg>`;
}

/* Horizontal bar (score / max) with coloured fill. */
function barRow(label, score, max, levelClass) {
  const pct = max > 0 ? (score / max) * 100 : 0;
  return `
    <div class="bar-row">
      <span class="bar-label">${label}</span>
      <span class="bar-track"><span class="bar-fill ${levelClass}" style="width:${pct.toFixed(1)}%"></span></span>
      <span class="bar-value">${fmt(score)} / ${fmt(max)}</span>
    </div>`;
}

function buildResultsHTML() {
  const sections = QUESTIONNAIRE.sections;
  let total = 0, totalMax = 0;
  sections.forEach((s) => { total += sectionScore(s); totalMax += sectionMax(s); });
  const totalPct = totalMax > 0 ? (total / totalMax) * 100 : 0;

  const regimeInfo = state.regime ? REGIME_DETECTION.regimes[state.regime] : null;
  const regimeLabel = regimeInfo ? regimeInfo.label : "Not detected";

  // Section comparison bars
  const sectionBars = sections
    .map((sec) => {
      const s = sectionScore(sec), m = sectionMax(sec);
      return barRow(`Section ${sec.id} — ${sec.title}`, s, m, "lvl-" + levelOf(s, m));
    })
    .join("");

  // Per-question breakdown grouped by section
  const questionGroups = sections
    .map((sec) => {
      const rows = sec.questions
        .map((q) => {
          const ans = state.answers[q.code] || {};
          const opts = activeOptions(q);
          const az = isAutoZeroed(q);
          const answered = az || (ans.sel != null && opts.length > 0);
          const score = az ? 0 : (answered ? questionScore(q) : 0);
          // achievable max for the active regime/branch (matches the live pills)
          const max = opts.length ? optionsMax(opts) : questionMax(q);
          const lvl = answered ? "lvl-" + levelOf(score, max) : "lvl-na";
          const valText = answered ? `${fmt(score)} / ${fmt(max)}` : "—";
          const pct = answered && max > 0 ? (score / max) * 100 : 0;
          return `
            <div class="bar-row">
              <span class="bar-label bar-code">${q.code}</span>
              <span class="bar-track"><span class="bar-fill ${lvl}" style="width:${pct.toFixed(1)}%"></span></span>
              <span class="bar-value">${valText}</span>
            </div>`;
        })
        .join("");
      return `<div class="chart-card">
                <h4>Section ${sec.id} · ${sec.title}</h4>
                <div class="bar-chart">${rows}</div>
              </div>`;
    })
    .join("");

  const meta = state.meta;
  const subline = [meta.bank, meta.date].filter(Boolean).join(" · ");

  return `
    <div class="results-head">
      <div>
        <h2>Results & charts</h2>
        <p class="results-sub">${subline || "Live snapshot of the current assessment"}</p>
      </div>
      <div class="results-actions">
        <button type="button" class="btn btn-primary" id="btn-results-pdf">Download PDF</button>
        <button type="button" class="btn" id="btn-results-close">Close</button>
      </div>
    </div>

    <div class="results-grid">
      <div class="chart-card gauge-card">
        <h4>Total transparency score</h4>
        <div class="gauge-wrap">
          ${donutSVG(totalPct, fmt(total), "/ " + fmt(totalMax))}
          <div class="gauge-meta">
            <span class="gauge-pct">${Math.round(totalPct)}%</span>
            <span class="gauge-regime regime-${state.regime || "unset"}">${regimeLabel}</span>
          </div>
        </div>
      </div>

      <div class="chart-card">
        <h4>Section scores</h4>
        <div class="bar-chart">${sectionBars}</div>
      </div>
    </div>

    <h3 class="results-subhead">Per-question breakdown</h3>
    <div class="results-grid">${questionGroups}</div>`;
}

function showResults() {
  const panel = document.getElementById("results");
  if (!panel) return;
  panel.innerHTML = buildResultsHTML();
  panel.classList.remove("hidden");
  const closeBtn = document.getElementById("btn-results-close");
  if (closeBtn) closeBtn.addEventListener("click", () => panel.classList.add("hidden"));
  const pdfBtn = document.getElementById("btn-results-pdf");
  if (pdfBtn) pdfBtn.addEventListener("click", printReport);
  panel.scrollIntoView({ behavior: "smooth", block: "start" });
}

/* ---- Printable PDF report ---------------------------------------------- */
function buildReportHTML() {
  const sections = QUESTIONNAIRE.sections;
  let total = 0, totalMax = 0;
  sections.forEach((s) => { total += sectionScore(s); totalMax += sectionMax(s); });
  const totalPct = totalMax > 0 ? (total / totalMax) * 100 : 0;

  const ri = state.regime ? REGIME_DETECTION.regimes[state.regime] : null;
  const regimeLabel = ri ? ri.label : "Not detected";
  const m = state.meta;

  const sectionBars = sections
    .map((sec) => {
      const s = sectionScore(sec), mx = sectionMax(sec);
      return barRow(`Section ${sec.id} — ${sec.title}`, s, mx, "lvl-" + levelOf(s, mx));
    })
    .join("");

  const sectionDetail = sections
    .map((sec) => {
      const qHtml = sec.questions
        .map((q) => {
          const ans = state.answers[q.code] || {};
          const opts = activeOptions(q);
          const az = isAutoZeroed(q);
          const chosen = (!az && ans.sel != null) ? opts[ans.sel] : null;
          const answered = az || ans.sel != null;
          const score = answered ? questionScore(q) : null;
          const max = opts.length ? optionsMax(opts) : questionMax(q);
          const lvl = answered ? levelOf(score, max) : "na";
          const scoreText = answered ? `${fmt(score)} / ${fmt(max)}` : `— / ${fmt(max)}`;
          const ratingText = az
            ? `Automatically 0 — ${regimeLabel} regime`
            : (chosen ? chosen.label : "Not answered");
          const branch = activeBranchKey(q);
          const branchNote = (branch && q.branches && q.branches[branch] && q.branches[branch].note)
            ? `<p class="rep-q-branch">${escapeHtml(q.branches[branch].note)}</p>` : "";
          const notes = (ans.notes || "").trim();
          return `
            <div class="rep-q">
              <div class="rep-q-head">
                <span class="rep-q-code">${q.code}</span>
                <span class="rep-q-score lvl-${lvl}">${scoreText}</span>
              </div>
              <p class="rep-q-text">${escapeHtml(q.text)}</p>
              ${branchNote}
              <p class="rep-q-rating">${escapeHtml(ratingText)}</p>
              ${notes ? `<p class="rep-q-notes"><strong>Evidence / notes:</strong> ${escapeHtml(notes)}</p>` : ""}
            </div>`;
        })
        .join("");
      return `
        <section class="rep-section">
          <h3>Section ${sec.id} · ${sec.title}
            <span class="rep-sec-score">${fmt(sectionScore(sec))} / ${fmt(sectionMax(sec))}</span>
          </h3>
          ${qHtml}
        </section>`;
    })
    .join("");

  const metaRow = (label, val) =>
    `<div><span>${label}</span>${escapeHtml(val || "—")}</div>`;

  return `
    <div class="rep-cover">
      <p class="rep-eyebrow">FPAS Mark II · The Better Policy Project</p>
      <h1>An Index for Transparency for Inflation-Targeting Central Banks</h1>
      <h2 class="rep-bank">${escapeHtml(m.bank || "(central bank)")}</h2>
      <div class="rep-meta">
        ${metaRow("Respondent", [m.name, m.job].filter(Boolean).join(", "))}
        ${metaRow("Institution", m.institution)}
        ${metaRow("Email", m.email)}
        ${metaRow("Assessment date", m.date)}
        ${metaRow("Detected regime", regimeLabel)}
      </div>
    </div>

    <div class="rep-overview">
      <div class="rep-gauge">
        ${donutSVG(totalPct, fmt(total), "/ " + fmt(totalMax))}
        <div class="rep-gauge-meta">
          <div class="rep-total">${fmt(total)} <span>/ ${fmt(totalMax)}</span></div>
          <div class="rep-pct">${Math.round(totalPct)}% overall transparency</div>
          <div class="rep-regime regime-${state.regime || "unset"}">${regimeLabel}</div>
        </div>
      </div>
      <div class="rep-bars">
        <h3>Section scores</h3>
        <div class="bar-chart">${sectionBars}</div>
      </div>
    </div>

    ${ri ? `<p class="rep-regime-note">${escapeHtml(ri.desc)}</p>` : ""}

    <h2 class="rep-detail-head">Detailed responses</h2>
    ${sectionDetail}

    <p class="rep-foot">FPAS Mark II — Central Bank Transparency Index · The Better Policy Project</p>`;
}

function printReport() {
  save();
  const rep = document.getElementById("report");
  if (!rep) { window.print(); return; }
  rep.innerHTML = buildReportHTML();
  document.body.classList.add("report-mode");
  let done = false;
  const cleanup = () => {
    if (done) return;
    done = true;
    document.body.classList.remove("report-mode");
    window.removeEventListener("afterprint", cleanup);
  };
  window.addEventListener("afterprint", cleanup);
  setTimeout(cleanup, 60000); // safety net if afterprint never fires
  window.print();
}

/* Lazy-load the html2pdf library (only when we actually need to email a PDF). */
const HTML2PDF_SRC = "https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.3/html2pdf.bundle.min.js";
let _html2pdfPromise = null;
function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error("Failed to load " + src));
    document.head.appendChild(s);
  });
}
function ensureHtml2pdf() {
  if (window.html2pdf) return Promise.resolve();
  if (!_html2pdfPromise) _html2pdfPromise = loadScript(HTML2PDF_SRC);
  return _html2pdfPromise;
}
/* Reject if a promise takes longer than ms (so the PDF step can't hang submit). */
function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), ms))
  ]);
}

/* Render the report off-screen and return it as a base64 PDF (no data: prefix). */
async function generateReportPdfBase64() {
  await ensureHtml2pdf();
  const rep = document.getElementById("report");
  if (!rep || !window.html2pdf) throw new Error("PDF generator unavailable");
  rep.innerHTML = buildReportHTML();
  rep.classList.add("rendering");
  const bank = (state.meta.bank || "central-bank").replace(/[^\w-]+/g, "-").toLowerCase();
  const filename = `cbt-index-${bank}.pdf`;
  const opt = {
    margin: [10, 10, 12, 10],
    filename: filename,
    image: { type: "jpeg", quality: 0.98 },
    html2canvas: { scale: 2, backgroundColor: "#ffffff", useCORS: true },
    jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
    pagebreak: { mode: ["css", "legacy"] }
  };
  try {
    const dataUri = await window.html2pdf().set(opt).from(rep).outputPdf("datauristring");
    return { base64: dataUri.split(",")[1], filename: filename };
  } finally {
    rep.classList.remove("rendering");
    rep.innerHTML = "";
  }
}

/* ---- Submit (central collection) --------------------------------------- */
const REQUIRED_META = [
  { f: "name", label: "Your name" },
  { f: "institution", label: "Institution" },
  { f: "job", label: "Job title" },
  { f: "email", label: "Work email" },
  { f: "bank", label: "Central bank assessed" }
];

function validateRespondent() {
  save();
  let firstBad = null;
  const missing = [];
  REQUIRED_META.forEach(({ f, label }) => {
    const el = document.getElementById("meta-" + f);
    const val = (state.meta[f] || "").trim();
    const emailBad = f === "email" && val && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val);
    const bad = !val || emailBad;
    if (el) el.classList.toggle("invalid", bad);
    if (bad) {
      missing.push(emailBad ? "a valid Work email" : label);
      if (!firstBad) firstBad = el;
    }
  });
  if (firstBad) {
    firstBad.focus();
    toast("Please complete: " + missing.join(", "));
    return false;
  }
  return true;
}

/* Build a flat, human-readable payload (good for Formspree/Sheets columns) +
   the full machine-readable state as a JSON string. */
function buildPayload() {
  const round2 = (n) => Math.round(n * 100) / 100;
  let total = 0, totalMax = 0;
  const sectionLines = [], answerRows = [];
  QUESTIONNAIRE.sections.forEach((sec) => {
    const s = sectionScore(sec), m = sectionMax(sec);
    total += s; totalMax += m;
    sectionLines.push(`Section ${sec.id} (${sec.title}): ${fmt(s)} / ${fmt(m)}`);
    sec.questions.forEach((q) => {
      const ans = state.answers[q.code] || {};
      const opts = activeOptions(q);
      const az = isAutoZeroed(q);
      const chosen = ans.sel != null ? opts[ans.sel] : null;
      const answered = az || ans.sel != null;
      answerRows.push({
        q: q.code,
        branch: activeBranchKey(q) || "",
        rating: az ? "Automatically 0 (regime rule)" : (chosen ? chosen.label : "(not answered)"),
        score: answered ? fmt(questionScore(q)) : "",
        notes: ans.notes || ""
      });
    });
  });

  const regimeInfo = state.regime ? REGIME_DETECTION.regimes[state.regime] : null;
  const regimeLabel = regimeInfo ? regimeInfo.label : "(not detected)";

  const summary =
    `FPAS Mark II — Central Bank Transparency Index\n` +
    `Central bank assessed: ${state.meta.bank}\n` +
    `Detected regime: ${regimeLabel}\n` +
    `Respondent: ${state.meta.name}, ${state.meta.job}, ${state.meta.institution} <${state.meta.email}>\n` +
    `Date: ${state.meta.date || "(not set)"}\n\n` +
    `TOTAL SCORE: ${fmt(total)} / ${fmt(totalMax)}\n` +
    sectionLines.join("\n") + "\n\n" +
    answerRows
      .map((r) => `${r.q}${r.branch ? " [" + r.branch + "]" : ""}: ${r.score}  — ${r.rating}` +
        (r.notes ? `\n    notes: ${r.notes}` : ""))
      .join("\n");

  return {
    name: state.meta.name,
    institution: state.meta.institution,
    job_title: state.meta.job,
    work_email: state.meta.email,
    central_bank_assessed: state.meta.bank,
    assessment_date: state.meta.date,
    regime: regimeLabel,
    framework: regimeScale() || "",
    total_score: round2(total),
    total_max: round2(totalMax),
    section_A: round2(sectionScore(QUESTIONNAIRE.sections[0])),
    section_B: round2(sectionScore(QUESTIONNAIRE.sections[1])),
    section_C: round2(sectionScore(QUESTIONNAIRE.sections[2])),
    _subject: `CBT Index — ${state.meta.bank} (${state.meta.name})`,
    summary: summary,
    submitted_at_iso: new Date().toISOString()
  };
}

async function submitResponse() {
  if (!validateRespondent()) return;

  if (!SUBMIT_ENDPOINT) {
    alert(
      "Central collection is not configured yet.\n\n" +
      "An administrator needs to paste a Formspree (or Google Apps Script) endpoint " +
      "into SUBMIT_ENDPOINT at the top of app.js. See the README for setup.\n\n" +
      "In the meantime you can use Save or Export CSV to download your response."
    );
    return;
  }

  const btn = document.getElementById("btn-submit");
  const original = btn.textContent;
  btn.disabled = true;

  const payload = buildPayload();

  // Attach the PDF report so the backend can email it. Non-fatal: never let PDF
  // generation block or hang the submission (cap it with a timeout).
  try {
    btn.textContent = "Preparing PDF…";
    const pdf = await withTimeout(generateReportPdfBase64(), 25000);
    payload.pdf_base64 = pdf.base64;
    payload.pdf_filename = pdf.filename;
  } catch (e) {
    console.warn("PDF generation skipped:", e);
  }

  btn.textContent = "Submitting…";

  let sent = false;
  try {
    if (SUBMIT_MODE === "no-cors") {
      // Google Apps Script web app: fire-and-forget (response is opaque).
      await fetch(SUBMIT_ENDPOINT, {
        method: "POST",
        mode: "no-cors",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(payload)
      });
      sent = true;
    } else {
      const res = await fetch(SUBMIT_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(payload)
      });
      sent = res.ok;
      if (!res.ok) throw new Error("HTTP " + res.status);
    }
  } catch (e) {
    console.error("Submission error:", e);
  } finally {
    btn.disabled = false;
    btn.textContent = original;
  }

  // Always show the charts after a submit attempt.
  showResults();
  toast(sent ? "Response submitted. Thank you!" : "Could not reach the server — your charts are shown; try Submit again.");
}

function resetAll() {
  if (!confirm("Clear all ratings and notes? This cannot be undone.")) return;
  state.meta = { ...EMPTY_META };
  state.rd = { RD1: null, RD2: null };
  state.regime = null;
  state.answers = {};
  try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
  applyMetaToForm();
  render();
  toast("Reset");
}

/* ---- Toast -------------------------------------------------------------- */
let toastTimer;
function toast(msg) {
  let el = document.querySelector(".toast");
  if (!el) {
    el = document.createElement("div");
    el.className = "toast";
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 1800);
}

/* ---- Init --------------------------------------------------------------- */
function init() {
  loadFromStorage();
  applyMetaToForm();
  render();

  META_FIELDS.forEach((f) => {
    const el = document.getElementById("meta-" + f);
    if (el) el.addEventListener("input", () => { el.classList.remove("invalid"); save(); });
  });

  document.getElementById("btn-save").addEventListener("click", saveToFile);
  const chartsBtn = document.getElementById("btn-charts");
  if (chartsBtn) chartsBtn.addEventListener("click", showResults);
  document.getElementById("btn-export").addEventListener("click", exportCsv);
  document.getElementById("btn-print").addEventListener("click", printReport);
  document.getElementById("btn-submit").addEventListener("click", submitResponse);
  document.getElementById("btn-reset").addEventListener("click", resetAll);

  const fileInput = document.getElementById("file-input");
  document.getElementById("btn-load").addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", (e) => {
    if (e.target.files[0]) loadFromFile(e.target.files[0]);
    e.target.value = "";
  });
}

/* The loader injects this script dynamically, so the DOM may already be ready. */
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
