/**
 * Timesheet submission handler.
 *
 * Deploy this as a Web App (Deploy > New deployment > Web app):
 *   - Execute as: Me
 *   - Who has access: Anyone
 * Then copy the resulting /exec URL into js/config.js as APPS_SCRIPT_URL.
 *
 * Emails are sent from the Google account you deploy this script under,
 * using that account's MailApp quota (roughly 100/day for a plain
 * Gmail account, much higher for Google Workspace).
 */

// Optional: also send a copy to yourself / HR for record-keeping.
// Leave blank ("") to only email the recipient the submitter typed in.
var BCC_RECORD_KEEPING_EMAIL = "";

function doPost(e) {
  try {
    var params = e.parameter;
    var recipient = params.recipient;
    var employeeName = params.employeeName || "Unknown";
    var payPeriod = params.payPeriod || "";
    var filename = params.filename || "Timesheet.xlsx";
    var fileBase64 = params.fileBase64;
    var mimeType = params.mimeType || "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    var subjectPrefix = params.emailSubjectPrefix || "Timesheet submission";

    if (!recipient || !fileBase64) {
      return jsonResponse({ status: "error", message: "Missing recipient or file data." });
    }

    var fileBlob = Utilities.newBlob(
      Utilities.base64Decode(fileBase64),
      mimeType,
      filename
    );

    var subject = subjectPrefix + " - " + employeeName + " (" + payPeriod + ")";
    var body =
      "A signed " + subjectPrefix.toLowerCase() + " has been submitted.\n\n" +
      "Employee: " + employeeName + "\n" +
      "Pay period: " + payPeriod + "\n\n" +
      "The completed, signed document is attached (same layout as the original, with entries and the employee signature filled in).";

    var mailOptions = { attachments: [fileBlob] };
    if (BCC_RECORD_KEEPING_EMAIL) {
      mailOptions.bcc = BCC_RECORD_KEEPING_EMAIL;
    }

    MailApp.sendEmail(recipient, subject, body, mailOptions);

    return jsonResponse({ status: "success" });
  } catch (err) {
    return jsonResponse({ status: "error", message: err.toString() });
  }
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
