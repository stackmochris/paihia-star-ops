# Star Receipts: deploy (Chris, about 10 minutes)

Do this once. The page and the script are already written; this connects them to your Google account. Steps 1 to 5 are yours, because they need your Google sign-in and permission clicks.

## 1. Make the sheet

1. Go to https://sheets.new and name the new sheet **Star Receipts**.
2. Leave it empty. The setup step builds the tabs.

## 2. Add the script

1. In the sheet: **Extensions > Apps Script**.
2. Delete the placeholder code. Paste in the whole of `apps-script/receipts/Code.gs`.
3. Rename the project (top left) to **Star Receipts** and press **Save**.

## 3. Run setup once

1. In the function dropdown above the editor, pick **setup** and press **Run**.
2. Google asks for permission. Choose your account. If it says "Google hasn't verified this app", click **Advanced**, then **Go to Star Receipts (unsafe)**, then **Allow**. This is normal for a script you wrote for your own account.
3. When it finishes, open **Execution log** at the bottom. It prints:
   - `YOUR PIN IS: 000000` (six digits). Write it down.
   - the link to the new `Receipts` folder in My Drive.

   The script creates the `Receipts` folder at the top level of My Drive, creates the two tabs (`Receipts` and `Categories`) with the starter categories, and moves the sheet into the `Receipts` folder.

## 4. Deploy it as a web app

1. **Deploy > New deployment**.
2. Click the gear next to "Select type" and choose **Web app**.
3. Set **Execute as: Me** and **Who has access: Anyone**. ("Anyone" only means the page can reach the script. Every request still needs your PIN.)
4. Click **Deploy** and copy the **Web app URL**. It ends in `/exec`.

## 5. Hand the URL over

Give the URL to Claude Code (or the bot). It goes into `receipts/config.js` as `SCRIPT_URL`, and the PR gets merged. Then Claude (in chat) runs the acceptance checks.

## 6. Put it on your phone

1. Open `https://stackmochris.github.io/paihia-star-ops/receipts/` on your phone.
2. Enter the PIN once. It stays on that phone.
3. Share menu > **Add to Home Screen**.

## Later

- **After any code change** to `Code.gs`: **Deploy > Manage deployments**, click the pencil, set **Version: New version**, **Deploy**. The URL stays the same. Choosing "New deployment" creates a different URL and breaks the page.
- **Change the PIN:** Apps Script > **Project Settings** (gear) > **Script properties** > edit `PIN`. Then use **Change PIN on this phone** at the bottom of the Recent tab.
- **Add a category:** type it in a new row of the `Categories` tab, or choose "+ Add new category" in the page. To hide one, type `N` beside it.
- **Keep it private:** do not share the sheet or the `Receipts` folder, and do not turn on "anyone with the link" for either. The Star Floor sheet is link-readable by design; this one must not be.

## Who does what

| Step | You | Claude Code / bot |
| --- | --- | --- |
| Create sheet, paste script, run setup, approve permissions, deploy | Yes | No (needs your Google sign-in) |
| Put files in the repo, open PR, set `SCRIPT_URL`, publish | Merge the PR | Yes |
| Check it against ACCEPTANCE.md | Photograph the test receipts | Claude (in chat) |
