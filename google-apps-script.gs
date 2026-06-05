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
 * Each submission is appended as one row; the full JSON is stored in the last
 * column so nothing is lost.
 */

function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];

    var data;
    try {
      data = JSON.parse(e.postData.contents);
    } catch (err) {
      data = e.parameter || {};
    }

    // Write a header row once.
    // NOTE: if you are upgrading an existing sheet that already has a header row,
    // insert a "Regime" column after "Assessment date" (or clear row 1 so this
    // header is rewritten) to keep columns aligned with the data below.
    if (sheet.getLastRow() === 0) {
      sheet.appendRow([
        "Received", "Name", "Institution", "Job title", "Work email",
        "Central bank assessed", "Assessment date", "Regime", "Section B scale",
        "Total score", "Total max", "Section A", "Section B", "Section C",
        "Summary", "Full JSON"
      ]);
    }

    sheet.appendRow([
      new Date(),
      data.name || "",
      data.institution || "",
      data.job_title || "",
      data.work_email || "",
      data.central_bank_assessed || "",
      data.assessment_date || "",
      data.regime || "",
      data.framework || "",
      data.total_score || "",
      data.total_max || "",
      data.section_A || "",
      data.section_B || "",
      data.section_C || "",
      data.summary || "",
      data.responses_json || ""
    ]);

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
