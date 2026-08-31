// ----------------------------------------------------------------
// After you deploy the Google Apps Script (see apps-script/Code.gs
// and the README), paste the Web App URL it gives you below.
// It looks like: https://script.google.com/macros/s/AKfycb.../exec
// ----------------------------------------------------------------
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbz-tKM1uy8zMxgkW0tCVK8Dtf6IiECtW2oBzrYx9VW6hvl4sbMLQFTAO0Ld2t3WrMk/exec";

// ----------------------------------------------------------------
// A shared passcode required to view/use either form. This is a light
// deterrent, not real security (see js/access-gate.js) — don't use it to
// gate anything genuinely sensitive.
//
// To set your passcode, open this page in a browser, open the developer
// console (F12), and run:
//   crypto.subtle.digest('SHA-256', new TextEncoder().encode('yourPasscode'))
//     .then(b => console.log(Array.from(new Uint8Array(b)).map(x => x.toString(16).padStart(2,'0')).join('')))
// Paste the resulting hex string below. Never put the plain passcode itself
// here — only the hash.
// ----------------------------------------------------------------
const ACCESS_PASSCODE_HASH = "26a5bc3027baeaed33f2b862e82414cd091a5f2d05df0ab2efb5483d4b00afec";
