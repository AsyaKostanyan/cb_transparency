/**
 * FPAS Mark II — Central Bank Transparency Index
 * Google Apps Script backend: emails each submission (names + framework + the
 * PDF report) to EMAIL_TO. No spreadsheet is used.
 *
 * Setup:
 *   1. Go to https://script.google.com → New project (it does NOT need to be
 *      attached to a sheet). Paste this file in, Save.
 *   2. Set EMAIL_TO below to the address that should receive submissions.
 *   3. Deploy → New deployment → Web app
 *        Execute as: Me
 *        Who has access: Anyone
 *      Copy the Web app /exec URL.
 *   4. In app.js set:
 *        const SUBMIT_ENDPOINT = "<that /exec URL>";
 *        const SUBMIT_MODE = "no-cors";
 *   5. The first deploy asks you to authorize the "send email as you"
 *      permission — approve it. (Advanced → Go to project → Allow.)
 *
 * AFTER EDITING: redeploy so the live URL runs the new code —
 *   Deploy → Manage deployments → (pencil) → Version: New version → Deploy.
 * The /exec URL stays the same.
 */

// Where completed assessments are emailed (the PDF report is attached).
// Mail is sent from the Google account that owns/deploys this script.
var EMAIL_TO = "asya.kostanyan.94@gmail.com";
// Optional: also send a copy to the respondent's own address.
var CC_RESPONDENT = false;

function doPost(e) {
  try {
    var data;
    try {
      data = JSON.parse(e.postData.contents);
    } catch (err) {
      data = e.parameter || {};
    }

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

    return ContentService
      .createTextOutput(JSON.stringify({ result: "ok" }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ result: "error", error: String(err) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
