let toSigPad;

const TO_DRAFT_KEY = 'krumFireLeaveRequestDraft_v2';
let toDraftSaveTimer = null;

const TO_TEXT_FIELD_IDS = [
  'toEmployeeName', 'toDepartment', 'toDateSubmitted',
  'toFirstDay', 'toLastDay', 'toReturnDate',
  'toAVacation', 'toASick', 'toAComp', 'toAHoliday', 'toAOther', 'toACommentsA',
  'toAbsenceDates', 'toBVacation', 'toBSick', 'toBComp', 'toBHoliday', 'toBOther', 'toACommentsB',
  'toSigDate', 'toRecipientEmail'
];

function toIsoDate(d) {
  return d.toISOString().slice(0, 10);
}

function toFormatDate(isoStr) {
  if (!isoStr) return '';
  const [yy, mm, dd] = isoStr.split('-');
  if (!yy || !mm || !dd) return isoStr;
  return `${mm}/${dd}/${yy}`;
}

function toGetPurpose() {
  return document.getElementById('toPurposeAccrued').checked ? 'accrued' : 'advance';
}

function toUpdateSectionVisibility() {
  const purpose = toGetPurpose();
  document.getElementById('sectionA').classList.toggle('to-section-inactive', purpose !== 'advance');
  document.getElementById('sectionB').classList.toggle('to-section-inactive', purpose !== 'accrued');
}

function toRecalcTotals() {
  const sumIds = (ids) => ids.reduce((sum, id) => sum + (parseFloat(document.getElementById(id).value) || 0), 0);
  const totalA = sumIds(['toAVacation', 'toASick', 'toAComp', 'toAHoliday', 'toAOther']);
  const totalB = sumIds(['toBVacation', 'toBSick', 'toBComp', 'toBHoliday', 'toBOther']);
  document.getElementById('toTotalRequested').value = totalA ? totalA : '';
  document.getElementById('toTotalApplied').value = totalB ? totalB : '';
}

function toCollectData() {
  const data = { purpose: toGetPurpose() };
  TO_TEXT_FIELD_IDS.forEach(id => { data[id] = document.getElementById(id).value; });
  data.toTotalRequested = document.getElementById('toTotalRequested').value;
  data.toTotalApplied = document.getElementById('toTotalApplied').value;
  return data;
}

function toSetStatus(msg, kind) {
  const el = document.getElementById('toStatusMsg');
  el.textContent = msg;
  el.className = 'status-msg' + (kind ? ' ' + kind : '');
}

function toCollectDraftState() {
  const data = toCollectData();
  data.signature = (toSigPad && !toSigPad.isEmpty()) ? toSigPad.toDataURL() : null;
  return data;
}

function toSaveDraft() {
  clearTimeout(toDraftSaveTimer);
  toDraftSaveTimer = setTimeout(() => {
    try {
      localStorage.setItem(TO_DRAFT_KEY, JSON.stringify(toCollectDraftState()));
    } catch (err) {
      console.error('Could not save leave request draft:', err);
    }
  }, 300);
}

function toRestoreDraft() {
  let saved;
  try {
    const raw = localStorage.getItem(TO_DRAFT_KEY);
    if (!raw) return;
    saved = JSON.parse(raw);
  } catch (err) {
    console.error('Could not read saved leave request draft:', err);
    return;
  }

  let restoredSomething = false;
  TO_TEXT_FIELD_IDS.forEach(id => {
    if (saved[id]) {
      document.getElementById(id).value = saved[id];
      restoredSomething = true;
    }
  });
  if (saved.purpose === 'accrued') {
    document.getElementById('toPurposeAccrued').checked = true;
    restoredSomething = true;
  }
  if (saved.signature && toSigPad) {
    toSigPad.loadFromDataURL(saved.signature);
    restoredSomething = true;
  }
  toUpdateSectionVisibility();
  toRecalcTotals();
  if (restoredSomething) {
    toSetStatus('Restored your unsubmitted entries from this browser.', 'pending');
  }
}

function toClearDraft() {
  clearTimeout(toDraftSaveTimer);
  try {
    localStorage.removeItem(TO_DRAFT_KEY);
  } catch (err) {
    console.error('Could not clear saved leave request draft:', err);
  }
}

// Field positions were measured directly from the original PDF (text/line
// baselines, top-left origin) and converted to pdf-lib's bottom-left
// coordinate system inside buildLeaveRequestPdf(). Each entry is [x, fitzY].
const TO_POSITIONS = {
  employeeName: [26, 278.6],
  department: [246, 278.6],
  dateSubmitted: [421, 278.6],

  purposeAdvanceCheck: [25.5, 187.9],
  purposeAccruedCheck: [25.5, 214.1],

  firstDay: [165, 330.2],
  lastDay: [420, 330.2],
  returnDate: [165, 355.6],
  totalRequested: [420, 355.6],
  aVacation: [165, 399.8],
  aSick: [165, 418.5],
  aComp: [165, 437.2],
  aHoliday: [165, 456.0],
  aOther: [165, 474.7],
  commentsA: [298, 392],

  absenceDates: [165, 526.3],
  totalApplied: [420, 526.3],
  bVacation: [165, 570.5],
  bSick: [165, 589.2],
  bComp: [165, 607.9],
  bHoliday: [165, 626.6],
  bOther: [165, 645.4],
  commentsB: [298, 562],

  employeeSigDate: [420, 697.0]
};
const TO_PAGE_HEIGHT = 792;
const TO_COMMENTS_MAX_CHARS_PER_LINE = 46;

function toWrapComment(text, maxLines) {
  if (!text) return [];
  const rawLines = text.split(/\r?\n/);
  const wrapped = [];
  rawLines.forEach(rawLine => {
    let remaining = rawLine;
    while (remaining.length > TO_COMMENTS_MAX_CHARS_PER_LINE) {
      let breakAt = remaining.lastIndexOf(' ', TO_COMMENTS_MAX_CHARS_PER_LINE);
      if (breakAt <= 0) breakAt = TO_COMMENTS_MAX_CHARS_PER_LINE;
      wrapped.push(remaining.slice(0, breakAt).trim());
      remaining = remaining.slice(breakAt).trim();
    }
    if (remaining) wrapped.push(remaining);
  });
  if (wrapped.length > maxLines) {
    const head = wrapped.slice(0, maxLines - 1);
    head.push(wrapped.slice(maxLines - 1).join(' '));
    return head;
  }
  return wrapped;
}

async function buildLeaveRequestPdf(data, signatureDataUrl) {
  const templateBytes = await fetch('assets/leave-request-template.pdf').then(r => {
    if (!r.ok) throw new Error('Could not load the leave request template (' + r.status + ')');
    return r.arrayBuffer();
  });

  const { PDFDocument, StandardFonts, rgb } = PDFLib;
  const pdfDoc = await PDFDocument.load(templateBytes);
  const page = pdfDoc.getPage(0);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const size = 10;
  const color = rgb(0, 0, 0.55);

  const toY = ([, fitzY], nudge = 2) => TO_PAGE_HEIGHT - fitzY + nudge;
  const draw = (text, key, opts = {}) => {
    if (!text && text !== 0) return;
    const pos = TO_POSITIONS[key];
    page.drawText(String(text), { x: pos[0], y: toY(pos, opts.nudge), size: opts.size || size, font: opts.font || font, color });
  };

  draw(data.toEmployeeName, 'employeeName');
  draw(data.toDepartment, 'department');
  draw(toFormatDate(data.toDateSubmitted), 'dateSubmitted');

  if (data.purpose === 'advance') {
    page.drawText('X', { x: TO_POSITIONS.purposeAdvanceCheck[0] + 0.5, y: toY(TO_POSITIONS.purposeAdvanceCheck, 1.5), size: 9.5, font: boldFont, color });
  } else {
    page.drawText('X', { x: TO_POSITIONS.purposeAccruedCheck[0] + 0.5, y: toY(TO_POSITIONS.purposeAccruedCheck, 1.5), size: 9.5, font: boldFont, color });
  }

  if (data.purpose === 'advance') {
    draw(toFormatDate(data.toFirstDay), 'firstDay');
    draw(toFormatDate(data.toLastDay), 'lastDay');
    draw(toFormatDate(data.toReturnDate), 'returnDate');
    draw(data.toTotalRequested, 'totalRequested');
    draw(data.toAVacation, 'aVacation');
    draw(data.toASick, 'aSick');
    draw(data.toAComp, 'aComp');
    draw(data.toAHoliday, 'aHoliday');
    draw(data.toAOther, 'aOther');
    toWrapComment(data.toACommentsA, 6).forEach((line, i) => {
      page.drawText(line, { x: TO_POSITIONS.commentsA[0], y: TO_PAGE_HEIGHT - TO_POSITIONS.commentsA[1] - i * 13, size: 9, font, color: rgb(0, 0, 0) });
    });
  } else {
    draw(data.toAbsenceDates, 'absenceDates');
    draw(data.toTotalApplied, 'totalApplied');
    draw(data.toBVacation, 'bVacation');
    draw(data.toBSick, 'bSick');
    draw(data.toBComp, 'bComp');
    draw(data.toBHoliday, 'bHoliday');
    draw(data.toBOther, 'bOther');
    toWrapComment(data.toACommentsB, 6).forEach((line, i) => {
      page.drawText(line, { x: TO_POSITIONS.commentsB[0], y: TO_PAGE_HEIGHT - TO_POSITIONS.commentsB[1] - i * 13, size: 9, font, color: rgb(0, 0, 0) });
    });
  }

  draw(toFormatDate(data.toSigDate), 'employeeSigDate');

  if (signatureDataUrl) {
    const sigImage = await pdfDoc.embedPng(signatureDataUrl);
    const sigHeight = 24;
    const sigWidth = sigImage.width * (sigHeight / sigImage.height);
    page.drawImage(sigImage, {
      x: 165,
      y: TO_PAGE_HEIGHT - 697.0 + 4,
      width: Math.min(sigWidth, 120),
      height: sigHeight
    });
  }

  return pdfDoc.save();
}

async function toSubmitRequest(fields) {
  const formData = new FormData();
  Object.keys(fields).forEach(key => formData.append(key, fields[key]));

  try {
    const resp = await fetch(APPS_SCRIPT_URL, { method: 'POST', body: formData });
    const text = await resp.text();
    let json;
    try { json = JSON.parse(text); } catch (e) { json = null; }

    if (json && json.status === 'success') return { ok: true };
    if (json && json.status === 'error') return { ok: false, message: json.message || 'The email server reported an error.' };
    return { ok: false, message: 'Unexpected response from the email server. Check the Apps Script deployment.' };
  } catch (err) {
    console.error('fetch submission failed, falling back to iframe:', err);
    await toSubmitViaHiddenIframe(fields);
    return { ok: true, unconfirmed: true };
  }
}

function toSubmitViaHiddenIframe(fields) {
  return new Promise((resolve) => {
    const iframeName = 'toSubmitFrame_' + Date.now();
    const iframe = document.createElement('iframe');
    iframe.name = iframeName;
    iframe.style.display = 'none';
    document.body.appendChild(iframe);

    const form = document.createElement('form');
    form.method = 'POST';
    form.action = APPS_SCRIPT_URL;
    form.target = iframeName;

    Object.keys(fields).forEach(key => {
      const input = document.createElement('input');
      input.type = 'hidden';
      input.name = key;
      input.value = fields[key];
      form.appendChild(input);
    });

    document.body.appendChild(form);

    let settled = false;
    iframe.addEventListener('load', () => {
      if (settled) return;
      settled = true;
      resolve(true);
      setTimeout(() => { iframe.remove(); form.remove(); }, 500);
    });

    form.submit();
    setTimeout(() => { if (!settled) { settled = true; resolve(true); } }, 8000);
  });
}

function toArrayBufferToBase64(buffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
  }
  return window.btoa(binary);
}

async function toOnSubmit() {
  if (!toSigPad) {
    toSetStatus('The signature pad did not load correctly. Try refreshing the page.', 'error');
    return;
  }
  const data = toCollectData();

  if (!data.toEmployeeName) { toSetStatus('Enter the employee name.', 'error'); return; }
  if (!data.toDateSubmitted) { toSetStatus('Enter the date submitted.', 'error'); return; }
  if (data.purpose === 'advance' && (!data.toFirstDay || !data.toLastDay || !data.toReturnDate)) {
    toSetStatus('Fill in the first day, last day, and return-to-work date for Section A.', 'error');
    return;
  }
  if (data.purpose === 'accrued' && !data.toAbsenceDates) {
    toSetStatus('Fill in the date(s) of absence for Section B.', 'error');
    return;
  }
  if (!data.toRecipientEmail) { toSetStatus('Enter the recipient email address.', 'error'); return; }
  if (toSigPad.isEmpty()) { toSetStatus('Sign in the signature box before submitting.', 'error'); return; }
  if (!APPS_SCRIPT_URL || APPS_SCRIPT_URL.indexOf('PASTE_YOUR') === 0) {
    toSetStatus('This app is not yet connected to an email backend. See README.md (js/config.js).', 'error');
    return;
  }
  if (!window.PDFLib) {
    toSetStatus('The PDF library did not load (check your internet connection or ad blocker) and try again.', 'error');
    return;
  }

  const submitBtn = document.getElementById('toSubmitBtn');
  submitBtn.disabled = true;
  toSetStatus('Filling in the form…', 'pending');

  try {
    const signatureDataUrl = toSigPad.toDataURL();
    const pdfBytes = await buildLeaveRequestPdf(data, signatureDataUrl);
    const pdfBase64 = toArrayBufferToBase64(pdfBytes);
    const filename = `LeaveRequest_${data.toEmployeeName.replace(/\s+/g, '_')}_${data.toDateSubmitted}.pdf`;

    toSetStatus('Sending email…', 'pending');

    const period = data.purpose === 'advance'
      ? `${data.toFirstDay} to ${data.toLastDay}`
      : `absence ${data.toAbsenceDates}`;

    const result = await toSubmitRequest({
      recipient: data.toRecipientEmail,
      employeeName: data.toEmployeeName,
      payPeriod: period,
      filename,
      fileBase64: pdfBase64,
      mimeType: 'application/pdf',
      emailSubjectPrefix: 'Leave request'
    });

    const blob = new Blob([pdfBytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);

    if (result.ok && !result.unconfirmed) {
      toSetStatus('Leave request emailed successfully. A copy has also been downloaded for your records.', 'ok');
      toClearDraft();
    } else if (result.ok && result.unconfirmed) {
      toSetStatus('Request submitted, but this browser could not confirm delivery — check that it arrived, or ask the recipient. A copy has been downloaded for your records.', 'pending');
      toClearDraft();
    } else {
      toSetStatus('The request was NOT emailed: ' + result.message + ' A copy has still been downloaded so you don\'t lose your entries. Your entries are still saved in this browser — fix the issue above and try submitting again.', 'error');
    }
  } catch (err) {
    console.error(err);
    toSetStatus('Something went wrong generating or sending the request. Try again.', 'error');
  } finally {
    submitBtn.disabled = false;
  }
}

function toInit() {
  document.getElementById('toSubmitBtn').addEventListener('click', toOnSubmit);

  window.addEventListener('error', (e) => {
    toSetStatus('Something went wrong on this page (' + e.message + '). Try refreshing.', 'error');
  });

  try {
    const today = new Date();
    document.getElementById('toSigDate').value = toIsoDate(today);
    document.getElementById('toDateSubmitted').value = toIsoDate(today);

    document.getElementById('toPurposeAdvance').addEventListener('change', toUpdateSectionVisibility);
    document.getElementById('toPurposeAccrued').addEventListener('change', toUpdateSectionVisibility);
    toUpdateSectionVisibility();

    document.querySelectorAll('.to-a-hours, .to-b-hours').forEach(el => {
      el.addEventListener('input', toRecalcTotals);
    });

    toSigPad = createSignaturePad(document.getElementById('toSigPad'));
    window.addEventListener('krumfire:gate-unlocked', () => toSigPad.resize());
    document.getElementById('toClearSig').addEventListener('click', () => {
      toSigPad.clear();
      toSaveDraft();
    });

    toRestoreDraft();

    document.body.addEventListener('input', toSaveDraft);
    document.body.addEventListener('change', toSaveDraft);
    document.getElementById('toSigPad').addEventListener('mouseup', toSaveDraft);
    document.getElementById('toSigPad').addEventListener('touchend', toSaveDraft);
  } catch (err) {
    console.error('Error while setting up the leave request form:', err);
    toSetStatus('The form did not load correctly (' + err.message + '). Try refreshing the page.', 'error');
  }
}

document.addEventListener('DOMContentLoaded', toInit);
