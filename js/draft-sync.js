// Cross-device draft sync. A "sync code" links drafts saved from different
// browsers/devices via the Apps Script backend + a Google Sheet. Each
// person/browser is assigned a random code automatically the first time
// they use a form — this keeps different people's drafts from colliding
// in the shared sheet without anyone having to invent a unique code
// themselves. To link a second device, read the code shown on the first
// and type it in on the second (overwriting that device's own auto-
// assigned code, which is fine — it had nothing synced yet).
//
// This is entirely best-effort: if it's not configured server-side, or the
// network fails, everything silently falls back to the existing
// browser-only autosave — no error shown for this specific feature, since
// it's a convenience layer on top of behavior that already works without
// it.
const SYNC_CODE_STORAGE_KEY = 'krumFireSyncCode';
const SYNC_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no 0/O/1/I/L — avoids look-alike mixups when read aloud or copied by hand

function generateRandomSyncCode() {
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += SYNC_CODE_ALPHABET[Math.floor(Math.random() * SYNC_CODE_ALPHABET.length)];
  }
  return code;
}

function getSyncCode() {
  try {
    return (localStorage.getItem(SYNC_CODE_STORAGE_KEY) || '').trim();
  } catch (e) {
    return '';
  }
}

function setSyncCode(code) {
  const normalized = (code || '').trim().toUpperCase();
  try {
    if (normalized) {
      localStorage.setItem(SYNC_CODE_STORAGE_KEY, normalized);
    } else {
      localStorage.removeItem(SYNC_CODE_STORAGE_KEY);
    }
  } catch (e) { /* ignore */ }
  return normalized;
}

// Returns the existing code, or assigns and returns a fresh random one if
// this device/browser doesn't have one yet.
function ensureSyncCode() {
  const existing = getSyncCode();
  if (existing) return existing;
  return setSyncCode(generateRandomSyncCode());
}

function syncBackendReady() {
  return !!(typeof APPS_SCRIPT_URL !== 'undefined' && APPS_SCRIPT_URL && APPS_SCRIPT_URL.indexOf('PASTE_YOUR') !== 0);
}

async function pushDraftToCloud(formType, draftObj) {
  const syncCode = getSyncCode();
  if (!syncCode || !syncBackendReady()) return { ok: false };

  try {
    const formData = new FormData();
    formData.append('action', 'saveDraft');
    formData.append('syncCode', syncCode);
    formData.append('formType', formType);
    formData.append('dataJson', JSON.stringify(draftObj));
    const resp = await fetch(APPS_SCRIPT_URL, { method: 'POST', body: formData });
    const json = JSON.parse(await resp.text());
    return json.status === 'success' ? { ok: true } : { ok: false, message: json.message };
  } catch (e) {
    console.error('Cloud draft sync (save) failed:', e);
    return { ok: false, message: e.message };
  }
}

async function pullDraftFromCloud(formType) {
  const syncCode = getSyncCode();
  if (!syncCode || !syncBackendReady()) return { ok: false };

  try {
    const formData = new FormData();
    formData.append('action', 'loadDraft');
    formData.append('syncCode', syncCode);
    formData.append('formType', formType);
    const resp = await fetch(APPS_SCRIPT_URL, { method: 'POST', body: formData });
    const json = JSON.parse(await resp.text());
    if (json.status !== 'success') return { ok: false, message: json.message };
    if (!json.found) return { ok: true, found: false };
    return { ok: true, found: true, data: JSON.parse(json.dataJson), updatedAt: json.updatedAt };
  } catch (e) {
    console.error('Cloud draft sync (load) failed:', e);
    return { ok: false, message: e.message };
  }
}

// Wires up a sync-code input + button pair present on the page. Calls
// onManualSync(code) when the person presses the button or hits Enter, so
// the calling page can trigger an immediate pull/push. Assigns a fresh
// random code automatically if this device doesn't have one yet, so codes
// don't collide across different people by default.
function initSyncControls(inputId, buttonId, statusId, onManualSync) {
  const input = document.getElementById(inputId);
  const button = document.getElementById(buttonId);
  const statusEl = statusId ? document.getElementById(statusId) : null;
  if (!input || !button) return;

  const isNewCode = !getSyncCode();
  const code = ensureSyncCode();
  input.value = code;

  const setStatusText = (msg) => { if (statusEl) statusEl.textContent = msg; };
  if (isNewCode) {
    setStatusText('Your sync code is ' + code + ' — enter it on another device to continue this entry there.');
  }

  const runSync = async () => {
    const enteredCode = setSyncCode(input.value);
    input.value = enteredCode;
    if (!enteredCode) {
      // Field was cleared — reassign a fresh code rather than leaving sync disabled by accident.
      input.value = ensureSyncCode();
    }
    setStatusText('Syncing…');
    const result = await onManualSync(input.value);
    setStatusText(result || '');
  };

  button.addEventListener('click', runSync);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') runSync(); });
}
