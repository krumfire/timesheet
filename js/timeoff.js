let toSigPad;

const TO_DRAFT_KEY = 'krumFireTimeOffDraft_v1';
let toDraftSaveTimer = null;

const TO_FIELD_IDS = [
  'toEmployeeName', 'toVacationHrs', 'toVacationAvail', 'toSickHrs', 'toSickAvail',
  'toCompHrs', 'toCompAvail', 'toHolidayHrs', 'toHolidayAvail', 'toOtherHrs',
  'toBeginDate', 'toThruDate', 'toReturnDate', 'toSigDate', 'toRecipientEmail'
];

function toIsoDate(d) {
  return d.toISOString().slice(0, 10);
}

function toCollectData() {
  const data = {};
  TO_FIELD_IDS.forEach(id => { data[id] = document.getElementById(id).value; });
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
      console.error('Could not save time off draft:', err);
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
    console.error('Could not read saved time off draft:', err);
    return;
  }

  let restoredSomething = false;
  TO_FIELD_IDS.forEach(id => {
    if (saved[id]) {
      document.getElementById(id).value = saved[id];
      restoredSomething = true;
    }
  });
  if (saved.signature && toSigPad) {
    toSigPad.loadFromDataURL(saved.signature);
    restoredSomething = true;
  }
  if (restoredSomething) {
    toSetStatus('Restored your unsubmitted entries from this browser.', 'pending');
  }
}

function toClearDraft() {
  clearTimeout(toDraftSaveTimer);
  try {
    localStorage.removeItem(TO_DRAFT_KEY);
  } catch (err) {
    console.error('Could not clear saved time off draft:', err);
  }
}

// Field positions were measured directly from the original PDF (text
// baselines, top-left origin) and converted to pdf-lib's bottom-left
// coordinate system inside buildTimeOffPdf(). Each entry is [x, fitzY1].
const TO_POSITIONS = {
  employeeName: [102, 256.1],
  vacationHrs: [210, 297.5],
  vacationAvail: [450, 297.5],
  sickHrs: [176, 325.1],
  sickAvail: [450, 325.1],
  compHrs: [182, 352.7],
  compAvail: [450, 352.7],
  holidayHrs: [148, 380.3],
  holidayAvail: [449, 380.3],
  otherHrs: [133, 407.9],
  beginDate: [184, 449.3],
  thruDate: [360, 449.3],
  returnDate: [273, 476.9],
  employeeSigText: [227, 518.3],
  employeeSigDate: [466, 518.3]
};
const TO_PAGE_HEIGHT = 792;

function toFormatDate(isoStr) {
  if (!isoStr) return '';
  const [yy, mm, dd] = isoStr.split('-');
  if (!yy || !mm || !dd) return isoStr;
  return `${mm}/${dd}/${yy}`;
}

async function buildTimeOffPdf(data, signatureDataUrl) {
  const templateBytes = await fetch('assets/time-off-request-template.pdf').then(r => {
    if (!r.ok) throw new Error('Could not load the time off request template (' + r.status + ')');
    return r.arrayBuffer();
  });

  const { PDFDocument, StandardFonts, rgb } = PDFLib;
  const pdfDoc = await PDFDocument.load(templateBytes);
  const page = pdfDoc.getPage(0);
  const font = await pdfDoc.embedFont(StandardFonts.TimesRoman);
  const size = 11;
  const color = rgb(0, 0, 0.55);

  const toY = ([, fitzY1], nudge = 2) => TO_PAGE_HEIGHT - fitzY1 + nudge;
  const draw = (text, key, opts = {}) => {
    if (!text) return;
    const pos = TO_POSITIONS[key];
    page.drawText(String(text), { x: pos[0], y: toY(pos, opts.nudge), size: opts.size || size, font, color });
  };

  draw(data.toEmployeeName, 'employeeName');
  draw(data.toVacationHrs, 'vacationHrs');
  draw(data.toVacationAvail, 'vacationAvail');
  draw(data.toSickHrs, 'sickHrs');
  draw(data.toSickAvail, 'sickAvail');
  draw(data.toCompHrs, 'compHrs');
  draw(data.toCompAvail, 'compAvail');
  draw(data.toHolidayHrs, 'holidayHrs');
  draw(data.toHolidayAvail, 'holidayAvail');
  draw(data.toOtherHrs, 'otherHrs');
  draw(toFormatDate(data.toBeginDate), 'beginDate');
  draw(toFormatDate(data.toThruDate), 'thruDate');
  draw(toFormatDate(data.toReturnDate), 'returnDate');
  draw(toFormatDate(data.toSigDate), 'employeeSigDate');

  if (signatureDataUrl) {
    const sigImage = await pdfDoc.embedPng(signatureDataUrl);
    const sigPos = TO_POSITIONS.employeeSigText;
    const sigHeight = 26;
    const sigWidth = sigImage.width * (sigHeight / sigImage.height);
    page.drawImage(sigImage, {
      x: sigPos[0],
      y: TO_PAGE_HEIGHT - sigPos[1] - 4,
      width: Math.min(sigWidth, 190),
      height: sigHeight
    });
  } else {
    draw(data.toEmployeeName, 'employeeSigText');
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
  if (!data.toBeginDate || !data.toThruDate || !data.toReturnDate) {
    toSetStatus('Fill in the beginning date, thru date, and return-to-work date.', 'error');
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
    const pdfBytes = await buildTimeOffPdf(data, signatureDataUrl);
    const pdfBase64 = toArrayBufferToBase64(pdfBytes);
    const filename = `TimeOffRequest_${data.toEmployeeName.replace(/\s+/g, '_')}_${data.toBeginDate}.pdf`;

    toSetStatus('Sending email…', 'pending');

    const result = await toSubmitRequest({
      recipient: data.toRecipientEmail,
      employeeName: data.toEmployeeName,
      payPeriod: `${data.toBeginDate} to ${data.toThruDate}`,
      filename,
      fileBase64: pdfBase64,
      mimeType: 'application/pdf',
      emailSubjectPrefix: 'Time off request'
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
      toSetStatus('Time off request emailed successfully. A copy has also been downloaded for your records.', 'ok');
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
    console.error('Error while setting up the time off form:', err);
    toSetStatus('The form did not load correctly (' + err.message + '). Try refreshing the page.', 'error');
  }
}

document.addEventListener('DOMContentLoaded', toInit);
