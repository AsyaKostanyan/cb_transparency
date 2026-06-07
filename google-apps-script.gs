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
 * UPGRADING: this version spreads each submission across many columns — one
 * numeric column per question score, then one column per question's notes —
 * so the data is easy to sort, average, and chart. It writes to a dedicated
 * tab named RESPONSES (created automatically) and writes the header row once,
 * the first time that tab is empty. If you previously collected data with the
 * old single-cell layout, that old tab is left untouched; new submissions go
 * to the RESPONSES tab. To start clean, just delete the RESPONSES tab and it
 * will be recreated with a fresh header on the next submission.
 */

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
