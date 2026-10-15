/**
 * Star Receipts: Apps Script backend (container-bound to the "Star Receipts" Google Sheet).
 *
 * First run: open the function dropdown, pick `setup`, press Run, approve the Google permission prompts.
 * Then: Deploy > New deployment > Web app > Execute as "Me" > Who has access "Anyone".
 * See DEPLOY.md for the click-by-click version.
 *
 * Actions (POST, text/plain JSON body, every call carries the PIN):
 *   ping, categories, addCategory, receipt, recent
 */

var TZ = 'Pacific/Auckland';
var ROOT_NAME = 'Receipts';
var SHEET_NAME = 'Receipts';
var CAT_SHEET = 'Categories';
var MAX_BYTES = 8 * 1024 * 1024;
var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
var ALLOWED_MIME = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic', 'application/pdf': 'pdf' };
var MAX_FAILS = 8;       // wrong-PIN attempts allowed ...
var LOCK_SECONDS = 900;  // ... per 15 minutes

// Columns A..L are written by the capture page. M..S are for the monthly audit.
var HEADERS = [
  'ID', 'Captured (NZ)', 'Month folder', 'Entity', 'Motel %', 'Cash', 'Category', 'Amount (entered)', 'Note', 'File', 'File link', 'Status',
  'Receipt date', 'Supplier', 'Total', 'GST', 'Supplier GST no.', 'Bank match', 'Audit notes'
];
var SEED_CATS = ['Laundry & linen', 'Cleaning & guest supplies', 'Guest consumables', 'Repairs & maintenance', 'Electricity', 'Phone & internet',
  'Fuel & vehicle', 'Postage', 'Accounting', 'Booking.com commission', 'Rates & insurance', 'Grounds', 'Capital item', 'Other'];

/* ------------------------------------------------------------------ setup */

/** Run once from the editor. Safe to run again: it only fills in what is missing. */
function setup() {
  var props = PropertiesService.getScriptProperties();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  props.setProperty('SHEET_ID', ss.getId());

  var rec = ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME, 0);
  if (rec.getLastRow() === 0) {
    rec.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]).setFontWeight('bold');
    rec.setFrozenRows(1);
  }
  var cat = ss.getSheetByName(CAT_SHEET) || ss.insertSheet(CAT_SHEET);
  if (cat.getLastRow() === 0) {
    cat.getRange(1, 1, 1, 2).setValues([['Category', 'Hide (type N)']]).setFontWeight('bold');
    cat.getRange(2, 1, SEED_CATS.length, 1).setValues(SEED_CATS.map(function (c) { return [c]; }));
    cat.setFrozenRows(1);
  }
  var blank = ss.getSheetByName('Sheet1');
  if (blank && ss.getSheets().length > 1 && blank.getLastRow() === 0) ss.deleteSheet(blank);

  var root = getOrCreateFolder_(DriveApp.getRootFolder(), ROOT_NAME);
  props.setProperty('ROOT_ID', root.getId());
  try { DriveApp.getFileById(ss.getId()).moveTo(root); } catch (e) { /* already there or not allowed: harmless */ }

  if (!props.getProperty('PIN')) {
    var pin = ('000000' + Math.floor(Math.random() * 1000000)).slice(-6);
    props.setProperty('PIN', pin);
    Logger.log('YOUR PIN IS: ' + pin + '  (change it any time in Project Settings > Script properties > PIN)');
  } else {
    Logger.log('PIN already set (Project Settings > Script properties > PIN).');
  }
  Logger.log('Setup done. Drive folder: ' + root.getUrl());
}

/* --------------------------------------------------------------- web app */

function doGet() {
  return json_({ ok: true, service: 'star-receipts' });
}

function doPost(e) {
  try {
    var req = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    var gate = checkPin_(req.pin);
    if (gate) return json_({ ok: false, error: gate, message: gate === 'locked' ? 'Too many attempts' : 'PIN not accepted' });

    switch (req.action) {
      case 'ping': return json_({ ok: true });
      case 'categories': return json_({ ok: true, categories: getCategories_() });
      case 'addCategory': return json_(addCategory_(req.name));
      case 'receipt': return json_(saveReceipt_(req));
      case 'recent': return json_({ ok: true, rows: recent_(Number(req.n) || 25) });
      default: return json_({ ok: false, error: 'bad-action', message: 'Unknown action' });
    }
  } catch (err) {
    return json_({ ok: false, error: 'server', message: String(err && err.message ? err.message : err) });
  }
}

/* ------------------------------------------------------------------- auth */

function checkPin_(pin) {
  var cache = CacheService.getScriptCache();
  var fails = Number(cache.get('fails') || 0);
  if (fails >= MAX_FAILS) return 'locked';
  var expected = PropertiesService.getScriptProperties().getProperty('PIN');
  if (!expected || String(pin || '') !== String(expected)) {
    cache.put('fails', String(fails + 1), LOCK_SECONDS);
    return 'pin';
  }
  if (fails) cache.remove('fails');
  return '';
}

/* ------------------------------------------------------------- categories */

function sheet_(name) {
  var id = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  if (!id) throw new Error('Run setup() once from the editor first');
  var sh = SpreadsheetApp.openById(id).getSheetByName(name);
  if (!sh) throw new Error('Missing tab: ' + name);
  return sh;
}

function getCategories_() {
  var sh = sheet_(CAT_SHEET);
  var n = sh.getLastRow() - 1;
  if (n < 1) return SEED_CATS.slice();
  var rows = sh.getRange(2, 1, n, 2).getValues();
  var out = [];
  rows.forEach(function (r) {
    var name = String(r[0] || '').trim();
    if (name && String(r[1] || '').trim().toUpperCase() !== 'N') out.push(name);
  });
  return out.length ? out : SEED_CATS.slice();
}

function addCategory_(name) {
  name = String(name || '').replace(/\s+/g, ' ').trim().slice(0, 40);
  if (!name) return { ok: false, error: 'bad-name', message: 'Name is empty' };
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    var sh = sheet_(CAT_SHEET);
    var n = sh.getLastRow() - 1;
    var rows = n > 0 ? sh.getRange(2, 1, n, 2).getValues() : [];
    for (var i = 0; i < rows.length; i++) {
      if (String(rows[i][0]).trim().toLowerCase() === name.toLowerCase()) {
        if (String(rows[i][1] || '').trim().toUpperCase() === 'N') sh.getRange(i + 2, 2).clearContent();   // un-hide
        return { ok: true, added: String(rows[i][0]).trim(), categories: getCategories_() };
      }
    }
    sh.appendRow([name, '']);
    return { ok: true, added: name, categories: getCategories_() };
  } finally { lock.releaseLock(); }
}

/* ---------------------------------------------------------------- receipts */

function saveReceipt_(req) {
  var id = String(req.id || '');
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(id)) return { ok: false, error: 'bad-id', message: 'Bad receipt id' };
  var ext = ALLOWED_MIME[String(req.mime || '')];
  if (!ext) return { ok: false, error: 'bad-type', message: 'Only photos and PDFs are accepted' };
  if (!req.data || typeof req.data !== 'string') return { ok: false, error: 'no-data', message: 'No file received' };

  var captured = new Date(req.capturedAt);
  if (isNaN(captured.getTime())) captured = new Date();
  var now = new Date();
  if (captured.getTime() > now.getTime() + 36e5 || captured.getTime() < now.getTime() - 400 * 864e5) captured = now;   // distrust a wild phone clock

  var bytes = Utilities.base64Decode(req.data);
  if (bytes.length > MAX_BYTES) return { ok: false, error: 'too-big', message: 'File is over 8 MB' };

  var lock = LockService.getScriptLock();
  try { lock.waitLock(25000); } catch (e) { return { ok: false, error: 'busy', message: 'Busy, retry' }; }
  try {
    var sh = sheet_(SHEET_NAME);

    // Idempotent: a retried upload with the same id never creates a second file or row.
    var hit = sh.getRange(1, 1, Math.max(sh.getLastRow(), 1), 1).createTextFinder(id).matchEntireCell(true).findNext();
    if (hit) {
      var prior = sh.getRange(hit.getRow(), 1, 1, HEADERS.length).getValues()[0];
      return { ok: true, duplicate: true, folder: prior[2], file: prior[9], link: prior[10] };
    }

    var monthFolderName = Utilities.formatDate(captured, TZ, 'yyyy-MM') + ' ' + MONTHS[Number(Utilities.formatDate(captured, TZ, 'M')) - 1];
    var yearFolderName = Utilities.formatDate(captured, TZ, 'yyyy');
    var root = DriveApp.getFolderById(PropertiesService.getScriptProperties().getProperty('ROOT_ID'));
    var folder = getOrCreateFolder_(getOrCreateFolder_(root, yearFolderName), monthFolderName);

    var amount = (req.amount === '' || req.amount == null) ? '' : Number(req.amount);
    if (amount !== '' && (isNaN(amount) || amount < 0 || amount > 1e7)) amount = '';
    var fname = Utilities.formatDate(captured, TZ, 'yyyy-MM-dd_HHmm') + (amount !== '' ? '_' + amount.toFixed(2) : '') + '_' + id.replace(/[^A-Za-z0-9]/g, '').slice(0, 4) + '.' + ext;

    var file = folder.createFile(Utilities.newBlob(bytes, req.mime, fname));
    try {
      var entity = req.entity === 'Part personal' ? 'Part personal' : 'Motel';
      var pct = entity === 'Motel' ? 100 : Math.max(0, Math.min(100, Math.round(Number(req.motelPct)) || 0));
      var row = [
        id, Utilities.formatDate(captured, TZ, 'yyyy-MM-dd HH:mm'), monthFolderName, entity, pct, req.cash ? 'Y' : '',
        clean_(req.category, 40), amount, clean_(req.note, 300), fname, file.getUrl(), 'Captured'
      ];
      while (row.length < HEADERS.length) row.push('');
      sh.appendRow(row);
    } catch (e) {
      file.setTrashed(true);   // never leave a file with no sheet row
      throw e;
    }
    return { ok: true, folder: monthFolderName, file: fname, link: file.getUrl() };
  } finally { lock.releaseLock(); }
}

function recent_(n) {
  n = Math.max(1, Math.min(50, n));
  var sh = sheet_(SHEET_NAME);
  var last = sh.getLastRow();
  if (last < 2) return [];
  var start = Math.max(2, last - n + 1);
  var vals = sh.getRange(start, 1, last - start + 1, HEADERS.length).getValues();
  return vals.reverse().map(function (r) {
    return { captured: r[1], entity: r[3], cash: r[5] === 'Y', category: r[6], amount: r[7], note: r[8], link: r[10], status: r[11] };
  });
}

/* ---------------------------------------------------------------- helpers */

function getOrCreateFolder_(parent, name) {
  var it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : parent.createFolder(name);
}

function clean_(s, max) {
  s = String(s == null ? '' : s).replace(/[\r\n\t]+/g, ' ').trim().slice(0, max);
  return /^[=+\-@]/.test(s) ? "'" + s : s;   // stop sheet formula injection
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
