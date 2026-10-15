# Star Receipts: acceptance checklist (Phase 1)

"Up to standard" means every row below passes. Claude (in chat) checks the A rows remotely. Chris does the B rows on his phone, and Claude confirms the results afterwards in Drive and the sheet. Record Pass or Fail and a note.

## A. Deployed correctly (checked remotely)

| # | Check | Expect | Result |
| --- | --- | --- | --- |
| A1 | Open `/paihia-star-ops/receipts/` | Page loads, green header "Star Receipts" | |
| A2 | Open `/paihia-star-ops/floor/` | Unchanged, Out tab still works | |
| A3 | `receipts/config.js` | `SCRIPT_URL` is a `https://script.google.com/macros/s/.../exec` URL | |
| A4 | GET the `/exec` URL | `{"ok":true,"service":"star-receipts"}` | |
| A5 | Search the repo for "pin", "password", "token", bank or account numbers | Only the word "PIN" in page text and docs. No actual values | |
| A6 | Page `<head>` | Contains `noindex` | |

## B. On Chris's phone

| # | Do this | Expect | Result |
| --- | --- | --- | --- |
| B1 | Open the page fresh, enter a wrong PIN | "PIN not accepted", stays locked | |
| B2 | Enter the right PIN, close and reopen the page | Unlocked, no second prompt | |
| B3 | Take photo of a real receipt, set Motel, a category and the total, Save | Toast "Saved to 2026-10 October" (or the current month). The form resets | |
| B4 | Open Drive: `Receipts / 2026 / <month>` | The file is there, named `YYYY-MM-DD_HHMM_<total, if entered>_<4 chars>.jpg`. Opening it, the total and supplier are legible. File is roughly under 1 MB | |
| B5 | Open the sheet, `Receipts` tab | One row: entity, category, total, file link, status `Captured`. The link opens the photo | |
| B6 | Save one as Part personal with motel share 40 and Paid cash ticked | Row shows Motel % 40 and Cash `Y` | |
| B7 | Choose a PDF invoice from Files, Save | PDF lands in the same month folder, row added | |
| B8 | Airplane mode on, photograph and Save | Message says queued. "1 waiting to upload" shows | |
| B9 | Airplane mode off, tap Upload now | Queue clears. Drive and the sheet show exactly one copy | |
| B10 | Choose "+ Add new category", type a name | It appears in the dropdown and in the `Categories` tab | |
| B11 | Add a row by hand in the `Categories` tab, reload the page | The new category is in the dropdown | |
| B12 | Recent tab | Last receipts listed newest first, with an open link | |
| B13 | The first receipt photographed on or after 1 November (NZ time) | Goes to `2026-11 November`, not October | |

## C. Readiness for the monthly audit (Claude, in chat)

Run after Chris has captured three to five real receipts.

| # | Check | Expect | Result |
| --- | --- | --- | --- |
| C1 | Claude reads the receipt images from Drive using the connector | Supplier, date, total and GST are extractable from the photos | |
| C2 | Claude can write audit columns (M to S) back into the sheet | Cells update. If not, the audit delivers the reconciliation as a file in the month folder instead | |
| C3 | Match the captured receipts against the next bank statement PDF | Receipts matched, unmatched lines listed (the exceptions list) | |

C1 and C2 decide how the audit works. Do not build further until they are known.

## D. Basics

| # | Check | Expect | Result |
| --- | --- | --- | --- |
| D1 | Sheet and `Receipts` folder sharing | Private to Chris. Not link-shared | |
| D2 | Eight wrong PINs in a row, then the right one | "Too many attempts". It clears after 15 minutes | |

## Sign-off

All A and B rows pass, and C1 and C2 answered: Phase 1 is accepted. Anything that fails goes back as a fix list, and only the failing rows are re-run.
