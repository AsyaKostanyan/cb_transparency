/* =============================================================================
   FPAS Mark II — Central Bank Transparency Index
   Application logic: rendering, scoring, save/load/export
   ============================================================================= */

const STORAGE_KEY = "fpas-cbt-index-v1";

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
const SUBMIT_ENDPOINT = "https://script.google.com/macros/s/AKfycbzsxVAj5f6hVQkqihVCjJKMH5MIwXXUo85Z87YaADVKM0RUTf9tWl6OR_esmneiA5B0/exec";
const SUBMIT_MODE = "no-cors";           // "cors" for Formspree, "no-cors" for Apps Script (Google Sheets)

const EMPTY_META = { name: "", institution: "", job: "", email: "", bank: "", date: "" };

/* ---- State -------------------------------------------------------------- */
const state = {
  meta: { ...EMPTY_META },
  framework: "scenarios",          // 'baseline' | 'scenarios' (Section B branch)
  answers: {}                      // code -> { sel, branch, custom, notes }
};

/* Resolve which options array is active for a question, given current state. */
function activeBranchKey(q) {
  if (q.framework) return state.framework;                 // B4–B8
  if (q.branchToggle) {                                     // A3, C4
    const ans = state.answers[q.code];
    return (ans && ans.branch) || q.branchToggle.options[0].key;
  }
  return null;
}
function activeOptions(q) {
  const key = activeBranchKey(q);
  return key ? q.branches[key].options : q.options;
}

/* Score for one question (number) and its max (number). */
function questionScore(q) {
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

/* ---- Rendering ---------------------------------------------------------- */
function render() {
  const main = document.getElementById("questionnaire");
  main.innerHTML = "";

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

    // Section B framework toggle
    if (sec.id === "B") {
      const note = document.createElement("p");
      note.className = "section-note";
      note.textContent = sec.frameworkNote;
      secEl.appendChild(note);

      const ft = document.createElement("div");
      ft.className = "framework-toggle";
      ft.innerHTML = `
        <span class="ft-label">Framework:</span>
        <div class="seg" id="framework-seg">
          <button type="button" data-fw="baseline">Single baseline scenario</button>
          <button type="button" data-fw="scenarios">Multiple (risk-management) scenarios</button>
        </div>
        <span class="ft-hint" style="font-size:.8rem;color:var(--muted);">Applies to B4–B8</span>`;
      secEl.appendChild(ft);
    }

    sec.questions.forEach((q) => secEl.appendChild(renderQuestion(q)));
    main.appendChild(secEl);
  });

  // wire framework segment
  const fwSeg = document.getElementById("framework-seg");
  if (fwSeg) {
    fwSeg.querySelectorAll("button").forEach((b) => {
      b.addEventListener("click", () => {
        state.framework = b.dataset.fw;
        save();
        render();           // re-render B questions for the new branch
      });
    });
  }

  refreshFrameworkButtons();
  updateScores();
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

function refreshFrameworkButtons() {
  const fwSeg = document.getElementById("framework-seg");
  if (!fwSeg) return;
  fwSeg.querySelectorAll("button").forEach((b) =>
    b.classList.toggle("active", b.dataset.fw === state.framework)
  );
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
  toast("Saved to file");
}

function exportCsv() {
  save();
  const rows = [["Section", "Question", "Branch", "Rating", "Score", "Max", "Notes"]];
  QUESTIONNAIRE.sections.forEach((sec) => {
    sec.questions.forEach((q) => {
      const ans = state.answers[q.code] || {};
      const opts = activeOptions(q);
      const chosen = ans.sel != null ? opts[ans.sel] : null;
      const branch = activeBranchKey(q) || "";
      rows.push([
        sec.id,
        q.code,
        branch,
        chosen ? chosen.label : "",
        ans.sel != null ? fmt(questionScore(q)) : "",
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
      state.framework = data.framework || "scenarios";
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
  let total = 0, totalMax = 0;
  const sectionLines = [], answerRows = [];
  QUESTIONNAIRE.sections.forEach((sec) => {
    const s = sectionScore(sec), m = sectionMax(sec);
    total += s; totalMax += m;
    sectionLines.push(`Section ${sec.id} (${sec.title}): ${fmt(s)} / ${fmt(m)}`);
    sec.questions.forEach((q) => {
      const ans = state.answers[q.code] || {};
      const opts = activeOptions(q);
      const chosen = ans.sel != null ? opts[ans.sel] : null;
      answerRows.push({
        q: q.code,
        branch: activeBranchKey(q) || "",
        rating: chosen ? chosen.label : "(not answered)",
        score: ans.sel != null ? fmt(questionScore(q)) : "",
        notes: ans.notes || ""
      });
    });
  });

  const summary =
    `FPAS Mark II — Central Bank Transparency Index\n` +
    `Central bank assessed: ${state.meta.bank}\n` +
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
    framework: state.framework,
    total_score: fmt(total),
    total_max: fmt(totalMax),
    section_A: fmt(sectionScore(QUESTIONNAIRE.sections[0])),
    section_B: fmt(sectionScore(QUESTIONNAIRE.sections[1])),
    section_C: fmt(sectionScore(QUESTIONNAIRE.sections[2])),
    _subject: `CBT Index — ${state.meta.bank} (${state.meta.name})`,
    summary: summary,
    responses_json: JSON.stringify(state),
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
  btn.textContent = "Submitting…";

  const payload = buildPayload();

  try {
    if (SUBMIT_MODE === "no-cors") {
      // Google Apps Script web app: fire-and-forget (response is opaque).
      await fetch(SUBMIT_ENDPOINT, {
        method: "POST",
        mode: "no-cors",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(payload)
      });
      toast("Response submitted. Thank you!");
    } else {
      const res = await fetch(SUBMIT_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        toast("Response submitted. Thank you!");
      } else {
        throw new Error("HTTP " + res.status);
      }
    }
  } catch (e) {
    alert(
      "Submission failed (" + e.message + ").\n\n" +
      "Please check your connection and try again, or use Save to download your " +
      "response and send it manually."
    );
  } finally {
    btn.disabled = false;
    btn.textContent = original;
  }
}

function resetAll() {
  if (!confirm("Clear all ratings and notes? This cannot be undone.")) return;
  state.meta = { ...EMPTY_META };
  state.framework = "scenarios";
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
  document.getElementById("btn-export").addEventListener("click", exportCsv);
  document.getElementById("btn-print").addEventListener("click", () => window.print());
  document.getElementById("btn-submit").addEventListener("click", submitResponse);
  document.getElementById("btn-reset").addEventListener("click", resetAll);

  const fileInput = document.getElementById("file-input");
  document.getElementById("btn-load").addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", (e) => {
    if (e.target.files[0]) loadFromFile(e.target.files[0]);
    e.target.value = "";
  });
}

document.addEventListener("DOMContentLoaded", init);
