# Star Receipts: handoff brief for Claude Code

You are placing files that were already written and tested. Do not redesign anything. Your job is to get them into the repo cleanly and open a pull request. Chris reviews and merges; he does the Google steps himself.

## What this is

A phone page at `/receipts/` for Paihia Star Motel. Chris photographs a receipt (or picks a PDF invoice), tags it Motel or Part personal, optionally sets a category and total, and taps Save. A Google Apps Script files the image into Drive at `Receipts / 2026 / 2026-10 October /` and appends a row to a private Google Sheet. A monthly audit against the bank statement happens separately, in a Claude chat. This is Phase 1: capture only, no AI.

## Repo conventions (from the existing Star Floor page)

- Static site on GitHub Pages, one HTML file per tool, vanilla JS, no build step.
- Palette and layout copy `/floor/`: green `#2F4F3A`, cream `#f6f1e8`, bottom nav.
- Pages POST `text/plain` JSON to a Google Apps Script `/exec` URL.
- Do not touch `/floor/`, the root `config.js`, or anything outside the paths below.

## Files to add (this archive mirrors the repo root)

| Path | What |
| --- | --- |
| `receipts/index.html` | The capture page |
| `receipts/config.js` | `window.STAR_RECEIPTS = { SCRIPT_URL: '' }`. Filled in after Chris deploys the script |
| `apps-script/receipts/Code.gs` | Backend. Chris pastes it into Apps Script. It does not run from the repo |
| `apps-script/receipts/appsscript.json` | Manifest, kept for reference |
| `docs/receipts/DEPLOY.md` | Chris's click-by-click for Google |
| `docs/receipts/ACCEPTANCE.md` | Checklist Claude (in chat) signs off against |
| `tests/receipts/gs-harness.js` | Runs Code.gs against mocked Google services. `node tests/receipts/gs-harness.js` |
| `tests/receipts/page-test.py` | Headless Chromium test of the page. Needs `playwright` and `Pillow`; skip it if they are not installed |

## Steps

1. `git pull`, then `git checkout -b receipts`.
2. Copy the files in above, keeping the paths exactly. If a path already exists with different content, stop and report it instead of overwriting.
3. Run `node tests/receipts/gs-harness.js`. Expect `16 passed`. If Playwright and Pillow are available, run `python3 tests/receipts/page-test.py`. Expect `24/24 passed`.
4. Commit and push the `receipts` branch. Open a pull request into `main` titled "Add Star Receipts capture page (Phase 1)". Do not merge it.
5. Tell Chris the PR link and that the next step is `docs/receipts/DEPLOY.md`.
6. When Chris gives you the Apps Script web app URL (it ends in `/exec`), set it as `SCRIPT_URL` in `receipts/config.js`, commit to the same branch and update the PR. Chris then merges, and GitHub Pages publishes it at `/receipts/`.

## Rules

- Never put a PIN, password, API key or personal data in the repo. The `/exec` URL in `config.js` is fine; the PIN gates it.
- The repo is public, so do not paste bank details, account numbers or receipt images into commits, issues or PR text.
- Do not change behaviour in `index.html` or `Code.gs`. If you think something is wrong, describe it in the PR description and leave the code as it is, so it can be reviewed in chat.
- You cannot deploy the Apps Script or grant Drive access. Those are Chris's clicks in `DEPLOY.md`.
- If anything fails or surprises you, say so plainly in the PR description. Do not work around it silently.
