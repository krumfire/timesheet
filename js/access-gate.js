// Lightweight client-side passcode gate. This is NOT real security — a static
// GitHub Pages site has no server to enforce access control, so this only
// keeps out casual/accidental visitors and search-engine crawlers, not
// anyone determined enough to view the page source. Don't rely on it to
// protect genuinely sensitive data. See README.md for setup.
//
// The form content stays hidden by default via CSS (body:not(.gate-unlocked)
// .sheet{display:none}) so there's no flash of visible content before this
// script runs — this file only ever adds the "gate-unlocked" class once the
// correct passcode is confirmed, and never touches document.body before
// DOMContentLoaded.
(function () {
  const STORAGE_KEY = 'krumFireAccessUnlockedHash';

  async function sha256Hex(text) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  function unlock() {
    document.body.classList.add('gate-unlocked');
    const overlay = document.getElementById('accessGate');
    if (overlay) overlay.remove();
    // Anything that measured its own size while .sheet was display:none
    // (e.g. the signature pad canvas) got a bogus zero size — let that code
    // know it's safe to re-measure now that the content is actually visible.
    window.dispatchEvent(new Event('krumfire:gate-unlocked'));
  }

  function showNotConfiguredMessage() {
    const overlay = document.createElement('div');
    overlay.id = 'accessGate';
    overlay.innerHTML = `
      <div class="access-gate-card">
        <h2>Access gate not configured</h2>
        <p>Set <code>ACCESS_PASSCODE_HASH</code> in <code>js/config.js</code> before using this app. See README.md.</p>
      </div>`;
    document.body.appendChild(overlay);
  }

  function buildGateUI() {
    const overlay = document.createElement('div');
    overlay.id = 'accessGate';
    overlay.innerHTML = `
      <div class="access-gate-card">
        <h2>Enter passcode</h2>
        <p>This form is for Krum Fire Department use. Enter the shared passcode to continue.</p>
        <input type="password" id="accessGatePasscode" autocomplete="off" />
        <button type="button" id="accessGateSubmit" class="primary-btn">Continue</button>
        <div id="accessGateError" class="access-gate-error"></div>
      </div>`;
    document.body.appendChild(overlay);

    const input = document.getElementById('accessGatePasscode');
    const errorEl = document.getElementById('accessGateError');
    const submit = document.getElementById('accessGateSubmit');

    const attempt = async () => {
      errorEl.textContent = '';
      const enteredHash = await sha256Hex(input.value);
      if (enteredHash === ACCESS_PASSCODE_HASH) {
        try { localStorage.setItem(STORAGE_KEY, enteredHash); } catch (e) { /* ignore */ }
        unlock();
      } else {
        errorEl.textContent = 'Incorrect passcode. Try again.';
        input.value = '';
        input.focus();
      }
    };
    submit.addEventListener('click', attempt);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') attempt(); });
    setTimeout(() => input.focus(), 50);
  }

  async function initGate() {
    if (!ACCESS_PASSCODE_HASH || ACCESS_PASSCODE_HASH.indexOf('PASTE_YOUR') === 0) {
      showNotConfiguredMessage();
      return;
    }

    let storedHash = null;
    try { storedHash = localStorage.getItem(STORAGE_KEY); } catch (e) { /* ignore */ }

    if (storedHash === ACCESS_PASSCODE_HASH) {
      unlock();
      return;
    }

    buildGateUI();
  }

  document.addEventListener('DOMContentLoaded', initGate);
})();
