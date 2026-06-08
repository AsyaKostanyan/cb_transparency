/**
 * FPAS Mark II — Central Bank Transparency Index
 * Google Apps Script backend.
 *
 * On every submission it SAVES THE PDF REPORT to a Google Drive folder
 * (primary) and also tries to EMAIL it (best effort). No spreadsheet is used.
 * The PDF is the same report the app generates (names, framework, scores, and
 * the full per-question detail).
 *
 * Setup:
 *   1. https://script.google.com → New project. Paste this file in, Save.
 *   2. Set EMAIL_TO below (used for the optional email copy).
 *   3. Run ▸ authorize (in the editor) once and approve the Drive + Gmail
 *      permissions. (Advanced → Go to project → Allow.)
 *   4. Deploy → New deployment → Web app
 *        Execute as: Me
 *        Who has access: Anyone           <-- must be "Anyone" (no login)
 *      Copy the /exec URL into SUBMIT_ENDPOINT in app.js.
 *
 * AFTER EDITING: redeploy so the live URL runs the new code —
 *   Deploy → Manage deployments → (pencil) → Version: New version → Deploy.
 */

// Drive folder where submitted PDFs are saved (created automatically if absent).
var DRIVE_FOLDER_NAME = "CBT Index Submissions";

// Optional email copy of each submission (best effort; needs the Gmail scope).
var EMAIL_TO = "asya.kostanyan.94@gmail.com";
var SEND_EMAIL = true;          // set false to skip emailing entirely
var CC_RESPONDENT = false;

/* Run this once from the editor (Run ▸ authorize) to grant Drive + Gmail
   permissions, then redeploy. It also drops a marker file + test email. */
function authorize() {
  var folder = getFolder_();
  folder.createFile("cbt-index-authorized.txt", "Authorized " + new Date(), "text/plain");
  if (SEND_EMAIL) {
    MailApp.sendEmail(EMAIL_TO, "CBT Index — test email",
      "Drive + email are authorized and working.");
  }
}

/* Visiting the /exec URL in a browser hits this — confirms it is deployed and
   public (you should see the "...is live" text, not a Google sign-in page). */
function doGet(e) {
  return ContentService
    .createTextOutput("CBT Index backend is live. POST submissions to this URL.")
    .setMimeType(ContentService.MimeType.TEXT);
}

function doPost(e) {
  try {
    var data;
    try {
      data = JSON.parse(e.postData.contents);
    } catch (err) {
      data = e.parameter || {};
    }

    var result = { drive: false, email: false };
    var baseName = buildBaseName_(data);

    // ---- Save to Google Drive (primary) ----
    try {
      var folder = getFolder_();
      if (data.pdf_base64) {
        var bytes = Utilities.base64Decode(data.pdf_base64);
        var pdf = Utilities.newBlob(bytes, "application/pdf", baseName + ".pdf");
        folder.createFile(pdf);
      } else {
        // No PDF generated client-side: still keep the submission as text.
        folder.createFile(baseName + ".txt", data.summary || "(no summary)", "text/plain");
      }
      result.drive = true;
    } catch (driveErr) {
      result.driveError = String(driveErr);
    }

    // ---- Email a copy (best effort) ----
    if (SEND_EMAIL) {
      try {
        var subject = "CBT Index — " + (data.central_bank_assessed || "(central bank)") +
          (data.regime ? " (" + data.regime + ")" : "") +
          (data.name ? " — " + data.name : "");
        var body =
          "New Central Bank Transparency Index submission\n" +
          "----------------------------------------------\n" +
          "Central bank assessed: " + (data.central_bank_assessed || "") + "\n" +
          "Framework / regime:    " + (data.regime || "") +
            (data.framework ? " (" + data.framework + " scale)" : "") + "\n" +
          "Respondent:            " + (data.name || "") +
            (data.job_title ? ", " + data.job_title : "") + "\n" +
          "Institution:           " + (data.institution || "") + "\n" +
          "Work email:            " + (data.work_email || "") + "\n" +
          "Assessment date:       " + (data.assessment_date || "") + "\n" +
          "Total score:           " + (data.total_score !== undefined ? data.total_score : "") +
            " / " + (data.total_max !== undefined ? data.total_max : "") + "\n" +
          "Section A / B / C:     " + data.section_A + " / " + data.section_B + " / " + data.section_C + "\n\n" +
          (data.pdf_base64 ? "The full PDF report is attached and saved to Drive.\n\n"
                           : "(PDF was not generated for this submission.)\n\n") +
          "----- Full summary -----\n" + (data.summary || "");
        var options = { name: "CBT Index" };
        if (data.pdf_base64) {
          options.attachments = [
            Utilities.newBlob(Utilities.base64Decode(data.pdf_base64), "application/pdf", baseName + ".pdf")
          ];
        }
        if (CC_RESPONDENT && data.work_email) options.cc = data.work_email;
        MailApp.sendEmail(EMAIL_TO, subject, body, options);
        result.email = true;
      } catch (mailErr) {
        result.emailError = String(mailErr);
      }
    }

    return ContentService
      .createTextOutput(JSON.stringify({ result: "ok", details: result }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ result: "error", error: String(err) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/* Find (or create) the destination Drive folder. */
function getFolder_() {
  var it = DriveApp.getFoldersByName(DRIVE_FOLDER_NAME);
  return it.hasNext() ? it.next() : DriveApp.createFolder(DRIVE_FOLDER_NAME);
}

/* Build a readable, filesystem-safe base filename from the submission. */
function buildBaseName_(data) {
  var parts = [
    "CBT Index",
    data.central_bank_assessed || "central-bank",
    data.name || "",
    data.assessment_date || nowStamp_()
  ].filter(function (p) { return p; });
  var name = parts.join(" - ").replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim();
  return name.substring(0, 180);
}

function nowStamp_() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd HH-mm");
}
