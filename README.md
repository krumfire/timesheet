# KFD Forms — digital fill, sign & submit

A static web app with two forms:

- **`index.html`** — the "14 Day Schedule TIME RECORD (non-exempt)" biweekly
  timesheet
- **`timeoff.html`** — the City of Krum Time Off Request form

Both work the same way: auto-calculate anything the original document
calculates, capture a hand-drawn employee signature, and submit **the
original file itself** — same layout, same colors/branding, same formulas
where applicable — with entries filled in, emailed to whoever you specify.
No server required to host it, and the two forms submit and email
completely independently of each other.

City Hall's requirement was that submitted documents must be the actual
original files, unchanged, not redesigned copies — so this app doesn't
rebuild either document from scratch:

- The timesheet opens the real `assets/timesheet-template.xlsx` file in the
  browser, writes only the specific cells that hold employee name, pay
  period, daily hours, notes, signature date, and the signature image, and
  leaves every formula, column, color, and border exactly as it was.
- The time off request opens the real `assets/time-off-request-template.pdf`
  file and overlays the typed entries and signature directly on top of it at
  the same positions as the original form's blank lines — the underlying
  PDF (including the City seal) is untouched.

It's built as plain HTML/CSS/JS so it can be hosted for free on **GitHub
Pages**. Since GitHub Pages only serves static files, actually *sending*
email is handled by a small **Google Apps Script** you deploy once under
your own Google account (free, no billing needed) — the same script backs
both forms.

## How it works

```
Browser (GitHub Pages)  --fills cells in the original .xlsx-->  in-memory workbook
                                                                        |
                                                                        v
                                                         --submits filled .xlsx-->
                                                                        |
                                                                        v
                                                        Google Apps Script Web App
                                                                        |
                                                                        v
                                                             MailApp.sendEmail(...)
                                                                        |
                                                                        v
                                                       Recipient's inbox (.xlsx attached)
```

Nothing you type is stored anywhere except in that one outgoing email — there
is no database.

## 1. Deploy the email backend (Google Apps Script)

1. Go to [script.google.com](https://script.google.com) and sign in with the
   Google account you want emails to be sent *from*.
2. Click **New project**.
3. Delete the placeholder code and paste in the contents of
   [`apps-script/Code.gs`](apps-script/Code.gs) from this repo.
4. (Optional) Set `BCC_RECORD_KEEPING_EMAIL` near the top if you want every
   submission auto-BCC'd to an HR/records inbox.
5. Click **Deploy → New deployment**.
   - Click the gear icon next to "Select type" and choose **Web app**.
   - Execute as: **Me**
   - Who has access: **Anyone**
   - Click **Deploy**.
6. The first time, Google will ask you to authorize the script (it needs
   permission to send email on your behalf) — click through the consent
   screen (you may see an "unverified app" warning since it's your own
   private script; click **Advanced → Go to project (unsafe)** to proceed).
7. Copy the **Web app URL** it gives you — it looks like:
   `https://script.google.com/macros/s/AKfycb.../exec`

If you ever edit `Code.gs`, you need to **Deploy → Manage deployments →
Edit → New version** for the changes to go live at the same URL.

## 2. Connect the frontend to it

Open `js/config.js` in this repo and paste your URL in:

```js
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycb.../exec";
```

### Set a shared passcode

Both forms are gated behind a shared passcode so the page isn't wide open to
anyone who finds the URL. This is a **light deterrent, not real security** —
GitHub Pages can't enforce server-side auth, so anyone determined enough to
view the page source could work around it. It's meant to keep out casual
visitors and search engines, not a determined attacker; don't use it to
gate anything genuinely sensitive.

To set it: open any page from this app in a browser, open the developer
console (F12 → Console tab), and run:

```js
crypto.subtle.digest('SHA-256', new TextEncoder().encode('yourPasscode'))
  .then(b => console.log(Array.from(new Uint8Array(b)).map(x => x.toString(16).padStart(2,'0')).join('')));
```

(replace `'yourPasscode'` with the actual passcode you want). Copy the long
hex string it prints, and paste it into `js/config.js`:

```js
const ACCESS_PASSCODE_HASH = "the hex string you copied";
```

Never put the plain passcode itself in `config.js` — only the hash. Share
the plain passcode with your crew some other way (verbally, a text, etc.).
Anyone entering it correctly stays unlocked on that browser until they
clear their browser data or you change the passcode.

## 3. Host it on GitHub Pages

1. Create a new GitHub repository and push everything in this folder to it —
   including `assets/timesheet-template.xlsx`, which the app needs at
   runtime to build each submission.
2. In the repo, go to **Settings → Pages**.
3. Under **Build and deployment**, set **Source** to "Deploy from a branch",
   branch `main`, folder `/ (root)`. Save.
4. GitHub will give you a URL like `https://yourusername.github.io/reponame/`
   — that's the live app.

## 4. Using the app

1. Fill in employee name and the pay period start date — the app fills in
   the day/date for all 14 rows automatically and computes the end date.
2. Enter hours per day per column (Regular, DPLR, FLSA, DPFLSA, Overtime,
   DPLO, Sick, Vacation, Holiday, Other). Row totals, week totals, and the
   pay-period grand total update live in the browser, matching the original
   spreadsheet's `SUM` formulas (which also still live inside the file
   itself — opening the submitted `.xlsx` in Excel or Sheets recalculates
   them the normal way).
3. Add notes if needed.
4. Sign in the employee signature box, check the certification box, confirm
   the date.
5. Enter the recipient's email address (whoever should receive the
   completed timesheet).
6. Click **Sign & submit timesheet**. The app opens the original template,
   writes your entries into the correct cells, embeds the signature as an
   image over the employee signature line, emails the resulting `.xlsx`
   through your Apps Script, and also downloads a copy to the submitter's
   own computer as a receipt.

The **director signature** is not captured digitally — the submitted
spreadsheet's director signature line is left blank, matching the original
file, for the director to sign by hand after printing.

**Entries are saved automatically in the browser** (name, pay period, every
hour entered, notes, and the signature) as you type, so refreshing the page
or closing the tab by accident doesn't lose your work. This is stored only
in that browser (`localStorage`, nothing sent anywhere) and is cleared
automatically once a timesheet is successfully emailed. Use the **Start
fresh** button next to the pay-period field to manually clear it — handy on
a shared station computer, or if the form is being reused for a different
person or pay period without submitting first.

## 5. Using the Time Off Request form

Click **Request Time Off →** in the timesheet's header, or go directly to
`timeoff.html`. It works the same way as the timesheet:

1. Fill in employee name, hours requested/available for each category
   (Vacation, Sick, Comp, Holiday, Other), beginning/thru dates, and the
   return-to-work date.
2. Sign in the signature box and confirm the date.
3. Enter the recipient's email (defaults to `rcornelius@krumfire.com`, same
   as the timesheet — change it if a request needs to go elsewhere).
4. Click **Sign & submit request**. This fills in and emails the *original*
   Time Off Request PDF, completely separately from the timesheet — it's a
   different button, different file, different email, though both use the
   same Apps Script backend to send.

The **Supervisor** and **Finance Director** signature lines are left blank
in the submitted PDF, same as the Director signature on the timesheet — printed and signed by hand after submission (the form itself notes the
Finance Director's signature verifies time available, not approval).

Entries autosave in the browser the same way the timesheet's do, under a
separate draft key, and clear once a request is successfully emailed.

## Files

```
index.html                              the timesheet form
timeoff.html                            the time off request form
css/style.css                           shared styling
css/timeoff.css                         time off form-specific styling
js/config.js                            <- put your Apps Script URL and passcode hash here
js/access-gate.js                       shared passcode gate (used by both forms)
js/signature-pad.js                     dependency-free canvas signature capture (used by both forms)
js/app.js                               timesheet: calculations, spreadsheet filling, submission
js/timeoff.js                           time off request: PDF filling, submission
apps-script/Code.gs                     paste into script.google.com (backs both forms)
assets/timesheet-template.xlsx          the original spreadsheet — do not edit
assets/time-off-request-template.pdf    the original time off form — do not edit
```

## Customizing

- **Schedule label** ("FIRE 106 HOURS"): editable directly in the form; the
  value typed in is written into cell `N1` of the submitted spreadsheet.
- **Column set**: edit `HOUR_KEYS` / `HOUR_LABELS` / `HOUR_COLUMN_LETTERS`
  at the top of `js/app.js` and the matching `<th>` cells in `index.html`
  if your department's pay codes or column layout differ. `HOUR_COLUMN_LETTERS`
  must match the actual column letters in `timesheet-template.xlsx`.
- **Time off form field positions**: `TO_POSITIONS` at the top of
  `js/timeoff.js` maps each field to an exact `[x, y]` position on the PDF
  page (measured from the original form's text, top-left origin, converted
  to PDF coordinates inside `buildTimeOffPdf()`). If City Hall issues a
  revised time off form, replace `assets/time-off-request-template.pdf` and
  re-measure these coordinates — the easiest way is opening the new PDF
  with a tool like PyMuPDF (`page.get_text("words")`) to get exact
  positions for each blank line, the same way the current ones were
  measured.
- **Template changes**: if City Hall issues a revised spreadsheet, replace
  `assets/timesheet-template.xlsx` with the new file. As long as the cell
  addresses for employee name (`C3`), pay period start (`C5`), the daily
  rows (`8–14` and `18–24`), notes (`F31`), and the employee signature date
  (`D32`) stay the same, no code changes are needed. If the new template
  moves any of those, update the corresponding cell references in
  `buildXlsx()` in `js/app.js`.
- **Daily email cap**: MailApp on a free Gmail account is capped around
  100 emails/day, which is far more than one person will submit — fine for
  this use case even shared across a small crew.

## Limitations

- Anyone who knows the shared passcode can submit a timesheet under any
  name they type in — the passcode gates *access to the page*, not *who
  someone claims to be* on the form. If that distinction matters, this
  would need real authentication (e.g. putting the GitHub Pages URL behind
  your department's existing SSO/network restrictions), which is beyond
  what a static site can do on its own.
- The passcode gate itself is client-side only (see the setup section
  above) — it deters casual/accidental visitors and search engines, not a
  determined attacker with browser dev tools.
- The employee signature is embedded as a floating image positioned over
  the signature line — it doesn't go in a cell — so it won't show up if the
  file is opened in a tool that strips images, but will in Excel, Google
  Sheets, LibreOffice, and Numbers.

## Troubleshooting: "I submitted, but no email arrived"

The app now reports the actual result of the send (success, a specific
error, or "couldn't confirm") in the status line under the submit button —
if you haven't seen that message yet, submit again and read it first, since
it usually points straight at the problem.

Most common causes, in order of likelihood:

1. **`Code.gs` on script.google.com is out of date.** If you ever edit
   `apps-script/Code.gs` in this repo, that change does nothing on its own —
   you have to paste the updated code into the script at
   [script.google.com](https://script.google.com) and then
   **Deploy → Manage deployments → Edit (pencil icon) → New version → Deploy**.
   Editing the file in GitHub and editing the live script are two separate
   places; keeping them in sync is manual.
2. **Check spam/junk** in the recipient's inbox.
3. **Check the Apps Script execution log.** In script.google.com, open the
   project → **Executions** (left sidebar) → look at the most recent
   `doPost` run. This shows the actual error if something failed inside the
   script (bad recipient, quota exceeded, etc.), which is much more precise
   than anything the browser can tell you.
4. **Quota exceeded.** A plain Gmail account is capped around 100
   `MailApp.sendEmail` calls/day. Unlikely for normal use, but shows up in
   the Executions log if it happens.
5. **Wrong Apps Script URL.** Confirm `js/config.js` has the `/exec` URL
   (not `/dev`) from your most recent deployment — every new deployment
   version can get a new URL depending on how you deployed it.
