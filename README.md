# FPAS Mark II — Central Bank Transparency Index

An interactive questionnaire (GitHub Pages site) for scoring the transparency of
inflation-targeting central banks, based on the *Index for Transparency for
Inflation-Targeting Central Banks* (FPAS Mark II, The Better Policy Project).

Each item is rated with a dropdown menu and supports free-text evidence/notes.
Section subtotals and the overall transparency score update live.

## Sections

| Section | Title | Max score |
|--------|-------------------------------------|:--:|
| A | Monetary Policy Objectives | 4 |
| B | Forecasting and Policy Analysis System | 14 |
| C | Policy Process | 7 |
| **Total** | | **25** |

- **Regime Detection** is completed once at the top of the questionnaire. Two
  diagnostic questions (RD1, RD2) classify the bank as **Non-FPAS**, **FPAS Mark I**,
  or **FPAS Mark II**. That single classification then drives **B4–B8** automatically:
  Non-FPAS / Mark I use the *baseline* scale (B4.1–B8.1); Mark II uses the *prudent
  risk-management* scale (B4.2–B8.2). The scale is no longer chosen by hand.
  For **Non-FPAS** banks, Section B items **B1 and B3–B8 are automatically scored 0**
  (locked, read-only) since they require a forecasting system; only **B2** and **B9**
  are rated.
- **A3** branches on financial-stability responsibility; **C4** on whether decisions
  are made by a committee (MPC) or a single policymaker.
- **B9** allows a partial score (0.1–0.9) when fewer than five financial variables
  are covered.

## Respondent details

Before submitting, each rater provides: **name, institution, job title, work email**,
and the **central bank being assessed**. These are required for submission and are
included with the saved/submitted response.

## Features

- **Regime Detection** that auto-selects the Section B scale (no manual toggle)
- Dropdown rating menus with the exact scoring rubric for every question
- Notes box per question for links, page references, and justification
- Live per-question, per-section, and total scores
- **Charts** — a results panel (total gauge, section bars, per-question breakdown)
  rendered when you Save, or any time via the **Charts** button
- **Submit response** — sends the completed assessment to a central inbox/spreadsheet
- **Save / Load** an assessment as a JSON file (also auto-saved in your browser)
- **Export CSV** for analysis or archiving
- **PDF report** — a polished, self-contained document (cover page with bank /
  respondent / regime, total gauge, section charts, and every question with its
  score, chosen rating, and evidence/notes). Click **PDF report**, then choose
  *Save as PDF* in the print dialog

## Collecting responses centrally

The **Submit response** button POSTs each completed assessment to an endpoint you
configure at the top of [`app.js`](app.js):

```js
const SUBMIT_ENDPOINT = "";     // paste your endpoint URL here
const SUBMIT_MODE = "cors";     // "cors" for Formspree, "no-cors" for Apps Script
```

Until an endpoint is set, Submit explains that collection isn't configured (Save /
Export CSV still work). Pick **one** of the two options below.

### Option A — Formspree (easiest, recommended)

1. Sign up free at <https://formspree.io>, create a form, and copy its endpoint
   (looks like `https://formspree.io/f/abcdwxyz`).
2. Set `SUBMIT_ENDPOINT` to that URL and keep `SUBMIT_MODE = "cors"`.
3. Responses arrive in your Formspree inbox (and can forward to email / Google
   Sheets / Slack). Each submission includes the respondent fields, section and
   total scores, a readable `summary`, and the full `responses_json`.

### Option B — Google Sheets (via Apps Script)

1. Create a Google Sheet → **Extensions → Apps Script**.
2. Paste the code from [`google-apps-script.gs`](google-apps-script.gs).
3. **Deploy → New deployment → Web app**, *Execute as: Me*, *Who has access:
   Anyone*. Copy the `/exec` URL.
4. Set `SUBMIT_ENDPOINT` to that URL and `SUBMIT_MODE = "no-cors"`.
   (Apps Script web apps don't send CORS headers, so the page submits
   fire-and-forget; rows still land in your sheet.)

Each submission is written as **one row spread across many columns** — the
respondent/meta fields, the regime, section and total scores, then **one numeric
column per question** (`A1 … C6`) followed by **one notes column per question**
(`A1 — notes …`), and finally the readable `Summary` and full `responses_json`.
This makes the data easy to sort, average, and chart directly in the sheet.

Rows are written to a dedicated tab named **Responses** (created automatically).
The header is written once, the first time that tab is empty.

**Upgrading an existing backend:** after pasting the new code, redeploy so the
live URL runs it — **Deploy → Manage deployments → (edit, pencil) → Version: New
version → Deploy**. The `/exec` URL stays the same. Old single-cell data on your
original tab is left untouched; new submissions go to the **Responses** tab. To
start clean, delete the **Responses** tab and it is recreated on the next submit.

## Files

```
index.html             Page structure
styles.css             Styling
questionnaire-data.js  All questions, options, and scores
app.js                 Rendering, scoring, save/load/export, submit
google-apps-script.gs  Optional backend for collecting responses in Google Sheets
.nojekyll              Tells GitHub Pages to serve files as-is
```

## Run locally

Just open `index.html` in any modern browser — no build step or server required.

## Publish on GitHub Pages

1. Create a repository on GitHub and push these files to the `main` branch:
   ```bash
   git init
   git add .
   git commit -m "FPAS Mark II Central Bank Transparency Index"
   git branch -M main
   git remote add origin https://github.com/<you>/<repo>.git
   git push -u origin main
   ```
2. On GitHub: **Settings → Pages → Build and deployment**.
   Set **Source** = *Deploy from a branch*, **Branch** = `main`, folder = `/ (root)`.
3. The site will be live at `https://<you>.github.io/<repo>/` within a minute or two.

Responses are stored only in the visitor's browser; nothing is sent to a server.
