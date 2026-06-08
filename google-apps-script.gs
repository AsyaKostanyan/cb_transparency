/**
 * FPAS Mark II — Central Bank Transparency Index
 * Google Apps Script backend for collecting questionnaire responses.
 *
 * Setup:
 *   1. Create a Google Sheet, then Extensions → Apps Script.
 *   2. Paste this file in, Save.
 *   3. Deploy → New deployment → Web app
 *        Execute as: Me
 *        Who has access: Anyone
 *      Copy the Web app /exec URL.
 *   4. In app.js set:
 *        const SUBMIT_ENDPOINT = "<that /exec URL>";
 *        const SUBMIT_MODE = "no-cors";
 *
 * EMAIL: each submission also emails the generated PDF report to EMAIL_TO
 * (below) as an attachment, sent from the account that owns this script. The
 * first time you redeploy after adding this, Apps Script will ask you to
 * authorize the Gmail/"send email" permission — approve it once.
 *
 * COLUMNS: each submission is also logged across many columns — one numeric
 * column per question score, then one column per question's notes — so the data
 * is easy to sort, average, and chart. Rows go to a dedicated tab named
 * RESPONSES (created automatically); the header is written once, the first time
 * that tab is empty. Old single-cell data on your original tab is left
 * untouched. To start clean, delete the RESPONSES tab and it is recreated.
 *
 * AFTER EDITING: redeploy so the live URL runs the new code —
 *   Deploy → Manage deployments → (pencil) → Version: New version → Deploy.
 * The /exec URL stays the same.
 */

// Where completed assessments are emailed (the PDF report is attached).
// Mail is sent from the Google account that owns/deploys this script.
var EMAIL_TO = "asya.kostanyan.94@gmail.com";
// Optional: also email a copy to the respondent's own address. Set to true to enable.
var CC_RESPONDENT = false;

var SHEET_NAME = "Responses";

// Fixed leading columns (in order).
var META_HEADER = [
  "Received", "Name", "Institution", "Job title", "Work email",
  "Central bank assessed", "Assessment date", "Regime", "Section B scale",
  "Total score", "Total max", "Section A", "Section B", "Section C"
];

function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);

    var data;
    try {
      data = JSON.parse(e.postData.contents);
    } catch (err) {
      data = e.parameter || {};
    }

    var codes = data.question_codes || [];
    var scores = data.scores || {};
    var notes = data.notes || {};

    // Build / write the header row once, when the tab is empty.
    if (sheet.getLastRow() === 0) {
      var header = META_HEADER.slice();
      for (var i = 0; i < codes.length; i++) header.push(codes[i]);                 // score columns
      for (var j = 0; j < codes.length; j++) header.push(codes[j] + " — notes");    // notes columns
      header.push("Summary", "Full JSON");
      sheet.appendRow(header);
      sheet.setFrozenRows(1);
    }

    // Build the data row in the same order as the header.
    var row = [
      new Date(),
      data.name || "",
      data.institution || "",
      data.job_title || "",
      data.work_email || "",
      data.central_bank_assessed || "",
      data.assessment_date || "",
      data.regime || "",
      data.framework || "",
      data.total_score !== undefined ? data.total_score : "",
      data.total_max !== undefined ? data.total_max : "",
      data.section_A !== undefined ? data.section_A : "",
      data.section_B !== undefined ? data.section_B : "",
      data.section_C !== undefined ? data.section_C : ""
    ];
    for (var k = 0; k < codes.length; k++) {
      var sc = scores[codes[k]];
      row.push(sc === undefined || sc === null ? "" : sc);   // numeric score (blank if unanswered)
    }
    for (var m = 0; m < codes.length; m++) {
      var nt = notes[codes[m]];
      row.push(nt === undefined || nt === null ? "" : nt);
    }
    row.push(data.summary || "", data.responses_json || "");

    sheet.appendRow(row);

    // Email the submission (names + framework + PDF). Non-fatal on failure.
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
        "Section A / B / C:     " + (data.section_A) + " / " + (data.section_B) +
          " / " + (data.section_C) + "\n\n" +
        (data.pdf_base64 ? "The full PDF report is attached.\n\n" : "(PDF was not generated for this submission.)\n\n") +
        "----- Full summary -----\n" + (data.summary || "");

      var options = { name: "CBT Index" };
      if (data.pdf_base64) {
        var bytes = Utilities.base64Decode(data.pdf_base64);
        options.attachments = [
          Utilities.newBlob(bytes, "application/pdf", data.pdf_filename || "cbt-report.pdf")
        ];
      }
      if (CC_RESPONDENT && data.work_email) options.cc = data.work_email;
      MailApp.sendEmail(EMAIL_TO, subject, body, options);
    } catch (mailErr) {
      // keep the sheet row even if emailing fails
    }

    return ContentService
      .createTextOutput(JSON.stringify({ result: "ok" }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ result: "error", error: String(err) }))
      .setMimeType(ContentService.MimeType.JSON);
  } finally {
    lock.releaseLock();
  }
}
