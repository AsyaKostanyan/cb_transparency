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

- **B4–B8** branch on the chosen framework (single *baseline* scenario vs. multiple
  *risk-management* scenarios) — set with the toggle at the top of Section B.
- **A3** branches on financial-stability responsibility; **C4** on whether decisions
  are made by a committee (MPC) or a single policymaker.
- **B9** allows a partial score (0.1–0.9) when fewer than five financial variables
  are covered.

## Respondent details

Before submitting, each rater provides: **name, institution, job title, work email**,
and the **central bank being assessed**. These are required for submission and are
included with the saved/submitted response.

## Features

- Dropdown rating menus with the exact scoring rubric for every question
- Notes box per question for links, page references, and justification
- Live per-question, per-section, and total scores
- **Submit response** — sends the completed assessment to a central inbox/spreadsheet
- **Save / Load** an assessment as a JSON file (also auto-saved in your browser)
- **Export CSV** for analysis or archiving
- **Print / PDF** for a clean report

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
