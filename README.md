# Paihia Star — Floor + Desk

Floor, Desk and Receipts are browser tools. The Sheet is the data path for Floor and Desk.

## Find the source for a task

- **Floor and Desk behaviour.** Open [Floor](floor/index.html) or [Desk](desk/index.html). Follow shared configuration in [config.js](config.js) or the [operations script](apps-script/Code.gs) when the issue crosses the Sheet boundary.
- **Receipts.** Start with [handoff](docs/receipts/HANDOFF.md) for intent, [receipt UI](receipts/index.html) and [receipt Apps Script](apps-script/receipts/Code.gs) for current code. Use [acceptance](docs/receipts/ACCEPTANCE.md) for checks and [deployment](docs/receipts/DEPLOY.md) only for rollout questions.
- Configuration and code show what is wired in this checkout. Verify deployment separately before reporting live behaviour or changing access.

**Sheet:** https://docs.google.com/spreadsheets/d/1uEPMq9wCpCeJoga3EOTyyBKsceV9rWNxBvd8Z1UkPeU/edit

**URLs** (after GitHub Pages is on, source = `main`, folder = `/`):

- Floor (casuals): https://stackmochris.github.io/paihia-star-ops/floor/
- Desk (Chris + Mara): https://stackmochris.github.io/paihia-star-ops/desk/

## You must do two things once

### 1. Share the sheet so Desk can read it

Sheet → Share → General access → **Anyone with the link → Viewer**.

Used-last, PAR, Keys, Find are read as CSV. Private sheet = empty Desk.

### 2. Deploy the write pipe (used-last + anomalies)

1. https://script.google.com → New project
2. Paste `apps-script/Code.gs`
3. Deploy → New deployment → Type **Web app**
   - Execute as: **Me**
   - Who has access: **Anyone**
4. Copy the web app URL into `config.js` → `SCRIPT_URL`
5. Commit / push

Floor taps then land on the **UsedLast** tab. Desk Store shows them.

## What stays local

Room-flip ticks on Floor. Pulse AM/PM ticks on Desk. Chris inspects the room, not the phone.

## Tabs in the sheet

UsedLast · Anomalies · PAR · Keys · Find · Config
