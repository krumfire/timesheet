const HOUR_KEYS = ['regular', 'dplr', 'flsa', 'dpflsa', 'ot', 'dplo', 'sick', 'vacation', 'holiday', 'other'];
const HOUR_LABELS = {
  regular: 'Regular Hours', dplr: 'DPLR', flsa: 'FLSA', dpflsa: 'DPFLSA',
  ot: 'Overtime Hours', dplo: 'DPLO', sick: 'Sick', vacation: 'Vacation',
  holiday: 'Holiday', other: 'Other'
};

let sigPad;

function formatDate(d) {
  return `${d.getMonth() + 1}/${d.getDate()}`;
}
function isoDate(d) {
  return d.toISOString().slice(0, 10);
}
function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}
function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

const DRAFT_STORAGE_KEY = 'krumFireTimesheetDraft_v1';
let draftSaveTimer = null;

function collectDraftState() {
  const week = (tableId) => Array.from(document.querySelectorAll(`#${tableId} tbody tr`)).map(tr => {
    const row = {};
    ['in', 'out', ...HOUR_KEYS].forEach(key => {
      row[key] = tr.querySelector(`input[data-field="${key}"]`).value;
    });
    return row;
  });

  return {
    employeeName: document.getElementById('employeeName').value,
    scheduleCode: document.getElementById('scheduleCode').value,
    payPeriodStart: document.getElementById('payPeriodStart').value,
    notes: document.getElementById('notes').value,
    recipientEmail: document.getElementById('recipientEmail').value,
    sigDate: document.getElementById('sigDate').value,
    attestCheck: document.getElementById('attestCheck').checked,
    week1: week('table-week-1'),
    week2: week('table-week-2'),
    signature: (sigPad && !sigPad.isEmpty()) ? sigPad.toDataURL() : null
  };
}

function saveDraft() {
  clearTimeout(draftSaveTimer);
  draftSaveTimer = setTimeout(() => {
    try {
      localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(collectDraftState()));
    } catch (err) {
      // Storage can fail (private browsing, quota, disabled) — not worth
      // interrupting the person filling out the form over.
      console.error('Could not save draft:', err);
    }
  }, 300);
}

function restoreDraft() {
  let saved;
  try {
    const raw = localStorage.getItem(DRAFT_STORAGE_KEY);
    if (!raw) return;
    saved = JSON.parse(raw);
  } catch (err) {
    console.error('Could not read saved draft:', err);
    return;
  }

  if (saved.employeeName) document.getElementById('employeeName').value = saved.employeeName;
  if (saved.scheduleCode) document.getElementById('scheduleCode').value = saved.scheduleCode;
  if (saved.payPeriodStart) document.getElementById('payPeriodStart').value = saved.payPeriodStart;
  if (saved.notes) document.getElementById('notes').value = saved.notes;
  if (saved.recipientEmail) document.getElementById('recipientEmail').value = saved.recipientEmail;
  if (saved.sigDate) document.getElementById('sigDate').value = saved.sigDate;
  document.getElementById('attestCheck').checked = !!saved.attestCheck;

  const restoreWeek = (tableId, rows) => {
    if (!rows) return;
    const trs = document.querySelectorAll(`#${tableId} tbody tr`);
    rows.forEach((rowData, i) => {
      if (!trs[i]) return;
      ['in', 'out', ...HOUR_KEYS].forEach(key => {
        if (rowData[key]) trs[i].querySelector(`input[data-field="${key}"]`).value = rowData[key];
      });
    });
  };
  restoreWeek('table-week-1', saved.week1);
  restoreWeek('table-week-2', saved.week2);

  if (saved.signature && sigPad) sigPad.loadFromDataURL(saved.signature);

  if (saved.employeeName || saved.payPeriodStart || saved.week1 || saved.week2) {
    setStatus('Restored your unsubmitted entries from this browser.', 'pending');
  }
}

function clearDraft() {
  clearTimeout(draftSaveTimer);
  try {
    localStorage.removeItem(DRAFT_STORAGE_KEY);
  } catch (err) {
    console.error('Could not clear saved draft:', err);
  }
}

function buildWeekRows(tbody, startIndex) {
  tbody.innerHTML = '';
  for (let i = 0; i < 7; i++) {
    const dayOffset = startIndex + i;
    const tr = document.createElement('tr');
    tr.dataset.dayOffset = dayOffset;

    const dayTd = document.createElement('td');
    dayTd.className = 'col-day-cell';
    dayTd.dataset.role = 'day-label';
    dayTd.textContent = '—';
    tr.appendChild(dayTd);

    const inTd = document.createElement('td');
    const inInput = document.createElement('input');
    inInput.type = 'time';
    inInput.dataset.field = 'in';
    inInput.setAttribute('value', '07:00');
    inInput.value = '07:00';
    inTd.appendChild(inInput);
    tr.appendChild(inTd);

    const outTd = document.createElement('td');
    const outInput = document.createElement('input');
    outInput.type = 'time';
    outInput.dataset.field = 'out';
    outInput.setAttribute('value', '07:00');
    outInput.value = '07:00';
    outTd.appendChild(outInput);
    tr.appendChild(outTd);

    HOUR_KEYS.forEach(key => {
      const td = document.createElement('td');
      const input = document.createElement('input');
      input.type = 'number';
      input.min = '0';
      input.step = '0.25';
      input.dataset.field = key;
      input.setAttribute('aria-label', HOUR_LABELS[key] + ' hours');
      td.appendChild(input);
      tr.appendChild(td);
    });

    const totalTd = document.createElement('td');
    totalTd.className = 'total-cell';
    totalTd.dataset.role = 'row-total';
    totalTd.textContent = '0';
    tr.appendChild(totalTd);

    tbody.appendChild(tr);
  }
}

function recalcAll() {
  const start = document.getElementById('payPeriodStart').value;
  const grand = {};
  HOUR_KEYS.forEach(k => grand[k] = 0);
  grand.total = 0;

  [1, 2].forEach(weekNum => {
    const table = document.getElementById(`table-week-${weekNum}`);
    const tbody = table.querySelector('tbody');
    const weekTotals = {};
    HOUR_KEYS.forEach(k => weekTotals[k] = 0);
    let weekGrandTotal = 0;

    Array.from(tbody.querySelectorAll('tr')).forEach(tr => {
      const offset = parseInt(tr.dataset.dayOffset, 10);
      const dayLabelTd = tr.querySelector('[data-role="day-label"]');
      if (start) {
        const d = addDays(new Date(start + 'T00:00:00'), offset);
        dayLabelTd.textContent = formatDate(d);
      } else {
        dayLabelTd.textContent = `Day ${offset + 1}`;
      }

      let rowTotal = 0;
      HOUR_KEYS.forEach(key => {
        const input = tr.querySelector(`input[data-field="${key}"]`);
        const val = parseFloat(input.value) || 0;
        rowTotal += val;
        weekTotals[key] += val;
      });
      rowTotal = round2(rowTotal);
      weekGrandTotal += rowTotal;
      tr.querySelector('[data-role="row-total"]').textContent = rowTotal.toFixed(2).replace(/\.00$/, '');
    });

    weekGrandTotal = round2(weekGrandTotal);
    const tfoot = table.querySelector('tfoot');
    HOUR_KEYS.forEach(key => {
      weekTotals[key] = round2(weekTotals[key]);
      grand[key] += weekTotals[key];
      tfoot.querySelector(`[data-total="${key}"]`).textContent = weekTotals[key].toFixed(2).replace(/\.00$/, '');
    });
    tfoot.querySelector('[data-total="total"]').textContent = weekGrandTotal.toFixed(2).replace(/\.00$/, '');
    grand.total += weekGrandTotal;
  });

  HOUR_KEYS.forEach(key => {
    grand[key] = round2(grand[key]);
    document.querySelector(`[data-grand="${key}"]`).textContent = grand[key].toFixed(2).replace(/\.00$/, '');
  });
  grand.total = round2(grand.total);
  document.querySelector('[data-grand="total"]').textContent = grand.total.toFixed(2).replace(/\.00$/, '');

  updatePayPeriodDisplay();
}

function updatePayPeriodDisplay() {
  const startVal = document.getElementById('payPeriodStart').value;
  const el = document.getElementById('payPeriodDisplay');
  if (!startVal) { el.textContent = '— select a start date —'; return; }
  const start = new Date(startVal + 'T00:00:00');
  const end = addDays(start, 13);
  el.textContent = `${isoDate(start)}  \u2192  ${isoDate(end)}`;
}

function collectData() {
  const employeeName = document.getElementById('employeeName').value.trim();
  const start = document.getElementById('payPeriodStart').value;
  const schedule = document.getElementById('scheduleCode').value.trim();
  const notes = document.getElementById('notes').value.trim();
  const recipient = document.getElementById('recipientEmail').value.trim();
  const sigDate = document.getElementById('sigDate').value;

  const weeks = [1, 2].map(weekNum => {
    const table = document.getElementById(`table-week-${weekNum}`);
    const rows = Array.from(table.querySelectorAll('tbody tr')).map(tr => {
      const row = { day: tr.querySelector('[data-role="day-label"]').textContent };
      row.in = tr.querySelector('input[data-field="in"]').value;
      row.out = tr.querySelector('input[data-field="out"]').value;
      HOUR_KEYS.forEach(key => {
        row[key] = tr.querySelector(`input[data-field="${key}"]`).value || '0';
      });
      row.total = tr.querySelector('[data-role="row-total"]').textContent;
      return row;
    });
    const tfoot = table.querySelector('tfoot');
    const totals = {};
    HOUR_KEYS.concat(['total']).forEach(key => {
      totals[key] = tfoot.querySelector(`[data-total="${key}"]`).textContent;
    });
    return { rows, totals };
  });

  const grand = {};
  HOUR_KEYS.concat(['total']).forEach(key => {
    grand[key] = document.querySelector(`[data-grand="${key}"]`).textContent;
  });

  return { employeeName, start, schedule, notes, recipient, sigDate, weeks, grand };
}

function timeToDayFraction(t) {
  if (!t) return null;
  const [h, m] = t.split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return (h * 60 + m) / 1440;
}

const HOUR_COLUMN_LETTERS = {
  regular: 'D', dplr: 'E', flsa: 'F', dpflsa: 'G', ot: 'H',
  dplo: 'I', sick: 'J', vacation: 'K', holiday: 'L', other: 'M'
};
const WEEK1_ROWS = [8, 9, 10, 11, 12, 13, 14];
const WEEK2_ROWS = [18, 19, 20, 21, 22, 23, 24];

const NOTES_LINE_CELLS = ['F31', 'F32', 'F33', 'F34', 'F35', 'F36'];
const NOTES_MAX_CHARS_PER_LINE = 85;

function wrapNotesIntoLines(text, maxLines) {
  // Respect the line breaks the person actually typed, then soft-wrap any
  // single line that's too long for the box's width.
  const rawLines = text.split(/\r?\n/);
  const wrapped = [];

  rawLines.forEach(rawLine => {
    if (rawLine.length <= NOTES_MAX_CHARS_PER_LINE) {
      wrapped.push(rawLine);
      return;
    }
    let remaining = rawLine;
    while (remaining.length > NOTES_MAX_CHARS_PER_LINE) {
      let breakAt = remaining.lastIndexOf(' ', NOTES_MAX_CHARS_PER_LINE);
      if (breakAt <= 0) breakAt = NOTES_MAX_CHARS_PER_LINE;
      wrapped.push(remaining.slice(0, breakAt).trim());
      remaining = remaining.slice(breakAt).trim();
    }
    if (remaining) wrapped.push(remaining);
  });

  if (wrapped.length > maxLines) {
    // Don't silently drop text that doesn't fit the box — fold anything past
    // the last available line onto that line instead.
    const head = wrapped.slice(0, maxLines - 1);
    const overflow = wrapped.slice(maxLines - 1).join(' ');
    head.push(overflow);
    return head;
  }
  return wrapped;
}

async function buildXlsx(data, signatureDataUrl) {
  const templateBuffer = await fetch('assets/timesheet-template.xlsx').then(r => {
    if (!r.ok) throw new Error('Could not load the spreadsheet template (' + r.status + ')');
    return r.arrayBuffer();
  });

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(templateBuffer);
  const ws = workbook.getWorksheet('Sheet1') || workbook.worksheets[0];

  if (data.schedule) ws.getCell('N1').value = data.schedule;
  ws.getCell('C3').value = data.employeeName;
  if (data.start) {
    const [yy, mm, dd] = data.start.split('-').map(Number);
    ws.getCell('C5').value = new Date(yy, mm - 1, dd);
  }

  const fillWeekRows = (rowNumbers, weekData) => {
    weekData.rows.forEach((day, i) => {
      const row = rowNumbers[i];
      const hasHours = Object.keys(HOUR_COLUMN_LETTERS).some(key => (parseFloat(day[key]) || 0) !== 0);
      if (hasHours) {
        const inFrac = timeToDayFraction(day.in);
        const outFrac = timeToDayFraction(day.out);
        if (inFrac !== null) ws.getCell(`B${row}`).value = inFrac;
        if (outFrac !== null) ws.getCell(`C${row}`).value = outFrac;
      }
      Object.keys(HOUR_COLUMN_LETTERS).forEach(key => {
        const val = parseFloat(day[key]) || 0;
        if (val !== 0) ws.getCell(`${HOUR_COLUMN_LETTERS[key]}${row}`).value = val;
      });
    });
  };
  fillWeekRows(WEEK1_ROWS, data.weeks[0]);
  fillWeekRows(WEEK2_ROWS, data.weeks[1]);

  if (data.notes) {
    wrapNotesIntoLines(data.notes, NOTES_LINE_CELLS.length).forEach((line, i) => {
      ws.getCell(NOTES_LINE_CELLS[i]).value = line;
    });
  }

  if (data.sigDate) {
    const [yy, mm, dd] = data.sigDate.split('-').map(Number);
    ws.getCell('D32').value = new Date(yy, mm - 1, dd);
  }

  if (signatureDataUrl) {
    const imageId = workbook.addImage({ base64: signatureDataUrl, extension: 'png' });
    ws.addImage(imageId, {
      tl: { col: 0, row: 30 },
      br: { col: 4, row: 32 },
      editAs: 'oneCell'
    });
  }

  const outBuffer = await workbook.xlsx.writeBuffer();
  return outBuffer;
}

function arrayBufferToBase64(buffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
  }
  return window.btoa(binary);
}

function setStatus(msg, kind) {
  const el = document.getElementById('statusMsg');
  el.textContent = msg;
  el.className = 'status-msg' + (kind ? ' ' + kind : '');
}

async function submitTimesheet(fields) {
  const formData = new FormData();
  Object.keys(fields).forEach(key => formData.append(key, fields[key]));

  try {
    const resp = await fetch(APPS_SCRIPT_URL, { method: 'POST', body: formData });
    const text = await resp.text();
    let json;
    try { json = JSON.parse(text); } catch (e) { json = null; }

    if (json && json.status === 'success') {
      return { ok: true };
    }
    if (json && json.status === 'error') {
      return { ok: false, message: json.message || 'The email server reported an error.' };
    }
    // Got a response but couldn't parse it as the expected JSON — likely the
    // Apps Script URL is wrong, not deployed, or returned an HTML error page.
    return { ok: false, message: 'Unexpected response from the email server. Check the Apps Script deployment.' };
  } catch (err) {
    // fetch itself failed (network error, or the browser blocked reading the
    // cross-origin response). Fall back to a fire-and-forget submission so the
    // email still has a chance to send, but we can't confirm it worked.
    console.error('fetch submission failed, falling back to iframe:', err);
    await submitViaHiddenIframe(fields);
    return { ok: true, unconfirmed: true };
  }
}

function submitViaHiddenIframe(fields) {
  return new Promise((resolve) => {
    const iframeName = 'submitFrame_' + Date.now();
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

    // Fallback in case the load event doesn't fire in some browsers.
    setTimeout(() => {
      if (!settled) { settled = true; resolve(true); }
    }, 8000);
  });
}

function init() {
  // Wire the submit button up FIRST, before anything else runs, so that even
  // if a later setup step throws, clicking the button still does *something*
  // (shows an error) instead of silently doing nothing.
  document.getElementById('submitBtn').addEventListener('click', onSubmit);

  window.addEventListener('error', (e) => {
    setStatus('Something went wrong on this page (' + e.message + '). Try refreshing.', 'error');
  });

  try {
    const week1Tbody = document.querySelector('#table-week-1 tbody');
    const week2Tbody = document.querySelector('#table-week-2 tbody');
    buildWeekRows(week1Tbody, 0);
    buildWeekRows(week2Tbody, 7);

    const today = new Date();
    document.getElementById('sigDate').value = isoDate(today);

    document.getElementById('payPeriodStart').addEventListener('change', recalcAll);
    document.body.addEventListener('input', (e) => {
      if (e.target.closest('table.timesheet-table')) recalcAll();
    });

    sigPad = createSignaturePad(document.getElementById('sigPad'));
    window.addEventListener('krumfire:gate-unlocked', () => sigPad.resize());
    document.getElementById('clearSig').addEventListener('click', () => {
      sigPad.clear();
      saveDraft();
    });

    restoreDraft();
    recalcAll();

    document.getElementById('startFreshBtn').addEventListener('click', () => {
      if (confirm('Clear all entries on this form? This cannot be undone.')) {
        clearDraft();
        window.location.reload();
      }
    });

    // Autosave everything: typed fields, table entries, checkbox, and the
    // signature (captured on pointer-up, not on every stroke motion).
    document.body.addEventListener('input', saveDraft);
    document.body.addEventListener('change', saveDraft);
    document.getElementById('sigPad').addEventListener('mouseup', saveDraft);
    document.getElementById('sigPad').addEventListener('touchend', saveDraft);
  } catch (err) {
    console.error('Error while setting up the form:', err);
    setStatus('The form did not load correctly (' + err.message + '). Try refreshing the page.', 'error');
  }
}

async function onSubmit() {
  if (!sigPad) {
    setStatus('The signature pad did not load correctly. Try refreshing the page.', 'error');
    return;
  }
  const data = collectData();

  if (!data.employeeName) { setStatus('Enter the employee name.', 'error'); return; }
  if (!data.start) { setStatus('Select a pay period start date.', 'error'); return; }
  if (!data.recipient) { setStatus('Enter the recipient email address.', 'error'); return; }
  if (!document.getElementById('attestCheck').checked) { setStatus('Check the certification box before submitting.', 'error'); return; }
  if (sigPad.isEmpty()) { setStatus('Employee signature is required before submitting.', 'error'); return; }
  if (!APPS_SCRIPT_URL || APPS_SCRIPT_URL.indexOf('PASTE_YOUR') === 0) {
    setStatus('This app is not yet connected to an email backend. See README.md (js/config.js).', 'error');
    return;
  }
  if (!window.ExcelJS) {
    setStatus('The spreadsheet library did not load (check your internet connection or ad blocker) and try again.', 'error');
    return;
  }

  const submitBtn = document.getElementById('submitBtn');
  submitBtn.disabled = true;
  setStatus('Filling in the spreadsheet…', 'pending');

  try {
    const signatureDataUrl = sigPad.toDataURL();
    const xlsxBuffer = await buildXlsx(data, signatureDataUrl);
    const xlsxBase64 = arrayBufferToBase64(xlsxBuffer);
    const filename = `Timesheet_${data.employeeName.replace(/\s+/g, '_')}_${data.start}.xlsx`;

    setStatus('Sending email…', 'pending');

    const result = await submitTimesheet({
      recipient: data.recipient,
      employeeName: data.employeeName,
      payPeriod: `${data.start} to ${isoDate(addDays(new Date(data.start + 'T00:00:00'), 13))}`,
      filename,
      fileBase64: xlsxBase64,
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      emailSubjectPrefix: 'Timesheet submission'
    });

    const blob = new Blob([xlsxBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);

    if (result.ok && !result.unconfirmed) {
      setStatus('Timesheet emailed successfully. A copy has also been downloaded for your records.', 'ok');
      clearDraft();
    } else if (result.ok && result.unconfirmed) {
      setStatus('Timesheet submitted, but this browser could not confirm delivery — check that it arrived, or ask the recipient. A copy has been downloaded for your records.', 'pending');
      clearDraft();
    } else {
      setStatus('The timesheet was NOT emailed: ' + result.message + ' A copy has still been downloaded so you don\'t lose your entries. Your entries are still saved in this browser — fix the issue above and try submitting again.', 'error');
    }
  } catch (err) {
    console.error(err);
    setStatus('Something went wrong generating or sending the timesheet. Try again.', 'error');
  } finally {
    submitBtn.disabled = false;
  }
}

document.addEventListener('DOMContentLoaded', init);
