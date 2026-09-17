# KFD Forms — digital fill, sign & submit

A static web app with two forms:

- **`index.html`** — the "14 Day Schedule TIME RECORD (non-exempt)" biweekly
  timesheet
- **`timeoff.html`** — the City of Krum "Leave Request or Application of
  Accrued Hours" form

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
- The leave request opens the real `assets/leave-request-template.pdf`
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

### Enable cross-device sync (optional)

Both forms have a **Sync code** field. Each person gets a random code
(e.g. `JT4821`) assigned automatically the first time they open a form —
you don't invent one, which keeps different people's drafts from
colliding with each other in the shared sheet. To continue on a second
device, read the code shown on the first device and type it in on the
second. This needs one extra one-time setup step, since it stores
in-progress drafts in a Google Sheet:

1. Go to [sheets.google.com](https://sheets.google.com) and create a new
   blank spreadsheet (any name).
2. Copy its ID from the URL — the long string between `/d/` and `/edit`:
   `docs.google.com/spreadsheets/d/`**`THIS_PART`**`/edit`
3. Open your Apps Script project, paste that ID into `DRAFT_SHEET_ID` near
   the top of `Code.gs`.
4. **Deploy → Manage deployments → Edit → New version → Deploy.**

The script creates a "Drafts" tab in that sheet automatically the first
time something syncs. If you skip this setup, both forms still work
exactly as before — the sync code field just won't do anything, and
autosave stays browser-only.

**Important trade-off:** once this is enabled, every autosave pushes the
current draft to the shared sheet in the background under that person's
assigned code — not just when someone deliberately links a second device.
This is what makes "enter on your phone, immediately open on your PC"
work without an extra step, but it does mean draft data leaves the device
automatically for anyone using either form, whether or not they ever
intend to switch devices. If that's not acceptable for your situation,
leave `DRAFT_SHEET_ID` blank and skip this feature — autosave stays fully
on-device with no setup needed.

**Note:** synced drafts aren't encrypted and rely on the sync code being
kept private, the same way the [passcode gate](#set-a-shared-passcode)
does. Auto-assigned codes are random from a 6-character, ~1-billion-value
space, so accidental collisions between different people are very
unlikely — but anyone who does see or guess a code can read that draft,
so don't rely on this for anything highly sensitive, and treat a code
like a lightweight password once assigned.

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

   **On a phone** (screens ≤720px wide), the 14-column table is replaced
   with a tap-to-expand list — one row per day showing the date and that
   day's total, with in/out and regular hours inside once expanded, and a
   "+ Add leave type" button that only shows Vacation/Sick/DPLR/etc. when
   you actually need one, instead of all 10 columns at once. It reads from
   and writes to the exact same fields as the desktop table (not a
   separate copy), so switching between a phone and a PC mid-entry, or
   using [cross-device sync](#enable-cross-device-sync-optional) between
   them, works exactly the same either way.
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
in that browser (`localStorage`, nothing sent anywhere by default) and is
cleared automatically once a timesheet is successfully emailed. Use the
**Start fresh** button next to the pay-period field to manually clear it —
handy on a shared station computer, or if the form is being reused for a
different person or pay period without submitting first.

**To continue on a different device or browser**, the **Sync code** field
already has a code in it — assigned automatically, unique to this device.
Read that code (or the status line under it, which shows it the first
time) and type it into the Sync code field on your other device, then tap
**Sync now** there — your entries appear. Whichever device has the most
recent changes "wins" when syncing, so it's safe to tap **Sync now** any
time to pull in changes made elsewhere. This needs the one-time sync setup
above; without it, the field does nothing and entries stay local to that
device only. The timesheet and Leave Request form sync independently of
each other, even when using the same code.

## 5. Using the Leave Request form

Click **Request Time Off →** in the timesheet's header, or go directly to
`timeoff.html`. It works the same way as the timesheet, including its own
**Sync code** field for continuing entries on another device:

1. Pick a **Purpose** at the top — *Advance Request for Time Off* (Section A)
   or *Application of Accrued Hours Following an Absence* (Section B). Only
   the matching section is used; the other is dimmed and skipped when
   filling the PDF, exactly like the original form's "select one" intent.
2. Fill in employee name, department, and date submitted.
3. Fill in the fields for whichever section applies — dates, and hours per
   category (Vacation, Sick, Comp Time, Holiday, Other). The "Total hours"
   field for that section fills in automatically as you type. Add comments
   if needed.
4. Sign in the signature box and confirm the date.
5. Enter the recipient's email (defaults to `rcornelius@krumfire.com`, same
   as the timesheet — change it if a request needs to go elsewhere).
6. Click **Sign & submit request**. This fills in and emails the *original*
   Leave Request PDF, completely separately from the timesheet — it's a
   different button, different file, different email, though both use the
   same Apps Script backend to send.

The **Supervisor signature** and **Approved/Denied** checkboxes are left
blank in the submitted PDF, same as the Director signature on the
timesheet — completed by hand after submission.

Entries autosave in the browser the same way the timesheet's do, under a
separate draft key, and clear once a request is successfully emailed.

## Files

```
index.html                          the timesheet form
timeoff.html                        the leave request form
css/style.css                       shared styling
css/timeoff.css                     leave request form-specific styling
js/config.js                        <- put your Apps Script URL and passcode hash here
js/access-gate.js                   shared passcode gate (used by both forms)
js/draft-sync.js                    shared cross-device draft sync (used by both forms)
js/signature-pad.js                 dependency-free canvas signature capture (used by both forms)
js/app.js                           timesheet: calculations, spreadsheet filling, submission
js/timeoff.js                       leave request: PDF filling, submission
apps-script/Code.gs                 paste into script.google.com (backs both forms)
assets/timesheet-template.xlsx      the original spreadsheet — do not edit
assets/leave-request-template.pdf   the original leave request form — do not edit
```

## Customizing

- **Synced draft retention**: `DRAFT_MAX_AGE_DAYS` near the top of `Code.gs`
  (default 14) controls how long an unsubmitted synced draft is kept before
  it's treated as stale and cleaned up. Doesn't affect browser-only
  autosave (drafts stay on-device indefinitely until submitted or cleared).
- **Schedule label** ("FIRE 106 HOURS"): editable directly in the form; the
  value typed in is written into cell `N1` of the submitted spreadsheet.
- **Column set**: edit `HOUR_KEYS` / `HOUR_LABELS` / `HOUR_COLUMN_LETTERS`
  at the top of `js/app.js` and the matching `<th>` cells in `index.html`
  if your department's pay codes or column layout differ. `HOUR_COLUMN_LETTERS`
  must match the actual column letters in `timesheet-template.xlsx`.
- **Leave request field positions**: `TO_POSITIONS` at the top of
  `js/timeoff.js` maps each field to an exact `[x, y]` position on the PDF
  page (measured from the original form's text/line positions, top-left
  origin, converted to PDF coordinates inside `buildLeaveRequestPdf()`). If
  City Hall issues a revised form, replace
  `assets/leave-request-template.pdf` and re-measure these coordinates —
  the easiest way is opening the new PDF with a tool like PyMuPDF
  (`page.get_text("words")` for label positions, `page.get_drawings()` for
  the blank lines and comment boxes) to get exact positions, the same way
  the current ones were measured.
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

## Troubleshooting: "Sync failed" / "Sync check failed"

The sync status text now shows the actual reason after a failed sync
attempt — read that first. The most likely causes:

1. **`DRAFT_SHEET_ID` isn't set yet, or `Code.gs` wasn't redeployed after
   setting it.** This is by far the most common cause — cross-device sync
   needs the one-time [setup above](#enable-cross-device-sync-optional) in
   addition to the basic email setup; having email working does **not**
   mean sync is configured. The status will say "Draft sync is not
   configured on the server" if this is the issue.
2. **`Code.gs` on script.google.com is out of date** — same issue and same
   fix as the email troubleshooting above: editing the file in this repo
   doesn't do anything until you paste it into script.google.com and
   deploy a new version.
3. **Check the Apps Script execution log** (script.google.com → your
   project → Executions) for the actual server-side error, same as with
   email delivery issues.
4. **Wrong Google Sheet ID**, or the Apps Script account doesn't have
   access to that sheet — confirm `DRAFT_SHEET_ID` is the ID from the
   sheet's URL (the part between `/d/` and `/edit`), and that it was
   created under the same Google account the script runs as.
5. **"You do not have permission to call SpreadsheetApp.openById"** — this
   means Google hasn't authorized the script for Sheets access yet. Adding
   a new service (Sheets) to a script that was already authorized for
   something else (Mail) requires a separate, explicit re-authorization —
   redeploying alone doesn't grant it. Fix:
   1. Open the project at [script.google.com](https://script.google.com).
   2. Next to the **Run** (▷) button, use the function dropdown to select
      **`getDraftSheet`**.
   3. Click **Run**.
   4. A dialog appears — click **Review permissions**, choose your account,
      click **Advanced** if you see an unverified-app warning, then
      **Go to [project name] (unsafe)**, then **Allow**.
   This applies immediately to the existing deployment — no new deployment
   version needed.
