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
- **Submit response** — emails the completed assessment (respondent name,
  framework/regime, scores, and the PDF report attached) straight to your inbox
- **Save / Load** an assessment as a JSON file (also auto-saved in your browser)
- **Export CSV** for analysis or archiving
- **PDF report** — a polished, self-contained document (cover page with bank /
  respondent / regime, total gauge, section charts, and every question with its
  score, chosen rating, and evidence/notes). Click **PDF report**, then choose
  *Save as PDF* in the print dialog

## Emailing submissions (Submit response)

When a respondent clicks **Submit response**, the browser builds the PDF report
and posts it to a small Google Apps Script, which **emails it to you** — names,
framework/regime, and scores in the body, with the PDF attached. No spreadsheet,
no third-party service.

The endpoint is configured at the top of [`app.js`](app.js):

```js
const SUBMIT_ENDPOINT = "";          // paste your Apps Script /exec URL here
const SUBMIT_MODE = "no-cors";       // Apps Script: keep this "no-cors"
```

Set it up once:

1. Go to <https://script.google.com> → **New project** (it does **not** need a
   sheet). Paste the code from [`google-apps-script.gs`](google-apps-script.gs).
2. Set `EMAIL_TO` (top of the script) to the address that should receive
   submissions. Optionally set `CC_RESPONDENT = true` to copy the respondent.
3. **Deploy → New deployment → Web app**, *Execute as: Me*, *Who has access:
   Anyone*. Copy the `/exec` URL into `SUBMIT_ENDPOINT`.
4. On the first deploy, approve the **send email as you** permission
   (*Advanced → Go to project → Allow*).

> If you edit the script later, redeploy so the live URL runs the new code —
> **Deploy → Manage deployments → (pencil) → Version: New version → Deploy**.
> The `/exec` URL stays the same.

The PDF is generated in the browser (via `html2pdf`), so the emailed report looks
like the on-screen **PDF report**. If the PDF can't be generated (e.g. offline),
the email is still sent with all the names, framework, and scores — just without
the attachment. Because Apps Script replies opaquely, the page can't confirm
delivery, so do one test submission after setup. **Save** and **Export CSV**
still work locally regardless.

## Files

```
index.html             Page structure
styles.css             Styling
questionnaire-data.js  All questions, options, and scores
app.js                 Rendering, scoring, save/load/export, submit
google-apps-script.gs  Backend that emails each submission + PDF to you
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

While being filled in, a response is stored only in the visitor's browser. It is
sent anywhere only when the visitor clicks **Submit response**, which emails the
report to the address configured in the Apps Script backend.
