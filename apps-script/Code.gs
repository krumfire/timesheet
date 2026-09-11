/**
 * Backs both forms: emails completed submissions, and syncs in-progress
 * drafts across devices/browsers via a Google Sheet.
 *
 * Deploy this as a Web App (Deploy > New deployment > Web app):
 *   - Execute as: Me
 *   - Who has access: Anyone
 * Then copy the resulting /exec URL into js/config.js as APPS_SCRIPT_URL.
 *
 * Emails are sent from the Google account you deploy this script under,
 * using that account's MailApp quota (roughly 100/day for a plain
 * Gmail account, much higher for Google Workspace).
 *
 * DRAFT SYNC SETUP (only needed if you want the "sync code" feature that
 * lets someone start a form on their phone and continue it on a PC):
 *   1. Create a new blank Google Sheet (sheets.google.com > Blank).
 *   2. Copy its ID from the URL: docs.google.com/spreadsheets/d/THIS_PART/edit
 *   3. Paste it into DRAFT_SHEET_ID below.
 *   4. Redeploy (Deploy > Manage deployments > Edit > New version).
 * If you leave DRAFT_SHEET_ID blank, email sending still works fine —
 * only the cross-device sync feature is disabled, and the app falls back
 * to browser-only autosave (same as before).
 */

// Optional: also send a copy to yourself / HR for record-keeping.
// Leave blank ("") to only email the recipient the submitter typed in.
var BCC_RECORD_KEEPING_EMAIL = "";

// The Google Sheet ID used to store in-progress drafts for cross-device
// sync. Leave as "" to disable draft sync (email sending is unaffected).
var DRAFT_SHEET_ID = "";

// How long a synced draft is kept before it's treated as stale and no
// longer returned (in days). Old rows are cleaned up opportunistically.
var DRAFT_MAX_AGE_DAYS = 14;

function doPost(e) {
  var params = e.parameter;
  var action = params.action || "sendEmail";

  try {
    if (action === "saveDraft") return handleSaveDraft(params);
    if (action === "loadDraft") return handleLoadDraft(params);
    return handleSendEmail(params);
  } catch (err) {
    return jsonResponse({ status: "error", message: err.toString() });
  }
}

function handleSendEmail(params) {
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
}

function handleSaveDraft(params) {
  if (!DRAFT_SHEET_ID) {
    return jsonResponse({ status: "error", message: "Draft sync is not configured on the server." });
  }
  var syncCode = normalizeSyncCode(params.syncCode);
  var formType = params.formType;
  var dataJson = params.dataJson;
  if (!syncCode || !formType || !dataJson) {
    return jsonResponse({ status: "error", message: "Missing syncCode, formType, or dataJson." });
  }
  // A sensible cap so one runaway draft can't fill the sheet; well above
  // what a normal form (including a signature image) needs.
  if (dataJson.length > 200000) {
    return jsonResponse({ status: "error", message: "Draft is too large to sync." });
  }

  var sheet = getDraftSheet();
  var rows = sheet.getDataRange().getValues();
  var now = new Date();
  var rowIndex = findDraftRow(rows, syncCode, formType);

  if (rowIndex > -1) {
    sheet.getRange(rowIndex + 1, 3).setValue(dataJson);
    sheet.getRange(rowIndex + 1, 4).setValue(now);
  } else {
    sheet.appendRow([syncCode, formType, dataJson, now]);
  }

  cleanupOldDrafts(sheet);

  return jsonResponse({ status: "success", updatedAt: now.getTime() });
}

function handleLoadDraft(params) {
  if (!DRAFT_SHEET_ID) {
    return jsonResponse({ status: "error", message: "Draft sync is not configured on the server." });
  }
  var syncCode = normalizeSyncCode(params.syncCode);
  var formType = params.formType;
  if (!syncCode || !formType) {
    return jsonResponse({ status: "error", message: "Missing syncCode or formType." });
  }

  var sheet = getDraftSheet();
  var rows = sheet.getDataRange().getValues();
  var rowIndex = findDraftRow(rows, syncCode, formType);

  if (rowIndex === -1) {
    return jsonResponse({ status: "success", found: false });
  }

  var row = rows[rowIndex];
  var updatedAt = row[3] instanceof Date ? row[3].getTime() : null;
  return jsonResponse({ status: "success", found: true, dataJson: row[2], updatedAt: updatedAt });
}

function normalizeSyncCode(code) {
  // Case/whitespace-insensitive so "AB12" and "ab12 " match the same draft.
  return (code || "").toString().trim().toUpperCase();
}

function findDraftRow(rows, syncCode, formType) {
  for (var i = 1; i < rows.length; i++) { // skip header row
    // Google Sheets can silently store a numeric-looking code (e.g. "482100")
    // as a Number rather than text, which would fail a strict === comparison
    // against the string we're looking for — coerce both sides to string.
    if (String(rows[i][0]) === String(syncCode) && String(rows[i][1]) === String(formType)) return i;
  }
  return -1;
}

function getDraftSheet() {
  var ss = SpreadsheetApp.openById(DRAFT_SHEET_ID);
  var sheet = ss.getSheetByName("Drafts");
  if (!sheet) {
    sheet = ss.insertSheet("Drafts");
    sheet.appendRow(["syncCode", "formType", "dataJson", "updatedAt"]);
    // Force columns A and B to plain text so a numeric-looking sync code
    // (e.g. "482100") is never silently reinterpreted as a Number, which
    // would break the exact-match lookup in findDraftRow.
    sheet.getRange("A1:B10000").setNumberFormat("@");
  }
  return sheet;
}

function cleanupOldDrafts(sheet) {
  var rows = sheet.getDataRange().getValues();
  var cutoff = new Date(Date.now() - DRAFT_MAX_AGE_DAYS * 24 * 60 * 60 * 1000);
  // Delete from the bottom up so row indices stay valid as rows are removed.
  for (var i = rows.length - 1; i >= 1; i--) {
    var updatedAt = rows[i][3];
    if (updatedAt instanceof Date && updatedAt < cutoff) {
      sheet.deleteRow(i + 1);
    }
  }
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
