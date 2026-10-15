// Runs apps-script/Code.gs against in-memory mocks of the Google services it uses.
// Usage: node tests/receipts/gs-harness.js
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const FIXED_NOW = Date.parse('2026-11-02T00:00:00Z');
class FakeDate extends Date {
  constructor(...a) { if (a.length === 0) super(FIXED_NOW); else super(...a); }
  static now() { return FIXED_NOW; }
}

function makeEnv() {
  const props = {};
  const cache = {};
  let idc = 0;
  const nid = p => p + (++idc);

  // ---- Drive
  class Folder {
    constructor(name, parent) { this.name = name; this.parent = parent; this.id = nid('fld'); this.kids = []; this.files = []; }
    getId() { return this.id; }
    getUrl() { return 'https://drive.google.com/drive/folders/' + this.id; }
    getFoldersByName(n) { const m = this.kids.filter(k => k.name === n); let i = 0; return { hasNext: () => i < m.length, next: () => m[i++] }; }
    createFolder(n) { const f = new Folder(n, this); this.kids.push(f); return f; }
    createFile(blob) { const f = new File(blob, this); this.files.push(f); registry[f.id] = f; return f; }
  }
  class File {
    constructor(blob, parent) { this.blob = blob; this.name = blob.name; this.parent = parent; this.id = nid('file'); this.trashed = false; }
    getId() { return this.id; }
    getUrl() { return 'https://drive.google.com/file/d/' + this.id + '/view'; }
    setTrashed(v) { this.trashed = v; return this; }
    moveTo(f) { this.parent = f; return this; }
  }
  const root = new Folder('My Drive', null);
  const registry = {};
  const DriveApp = {
    getRootFolder: () => root,
    getFolderById: id => { const f = find(root, id); if (!f) throw new Error('no folder ' + id); return f; },
    getFileById: id => registry[id] || { moveTo() {} },
  };
  function find(f, id) { if (f.id === id) return f; for (const k of f.kids) { const r = find(k, id); if (r) return r; } return null; }

  // ---- Sheets
  class Sheet {
    constructor(name) { this.name = name; this.grid = []; this.failAppend = false; }
    getLastRow() { return this.grid.length; }
    getRange(r, c, nr = 1, nc = 1) { return new Range(this, r, c, nr, nc); }
    appendRow(row) { if (this.failAppend) throw new Error('append failed'); this.grid.push(row.slice()); }
    setFrozenRows() {}
    deleteRow(r) { this.grid.splice(r - 1, 1); }
  }
  class Range {
    constructor(s, r, c, nr, nc) { Object.assign(this, { s, r, c, nr, nc }); }
    setValues(v) { for (let i = 0; i < v.length; i++) { const row = this.s.grid[this.r - 1 + i] || (this.s.grid[this.r - 1 + i] = []); for (let j = 0; j < v[i].length; j++) row[this.c - 1 + j] = v[i][j]; } return this; }
    getValues() { const out = []; for (let i = 0; i < this.nr; i++) { const row = this.s.grid[this.r - 1 + i] || []; const o = []; for (let j = 0; j < this.nc; j++) o.push(row[this.c - 1 + j] === undefined ? '' : row[this.c - 1 + j]); out.push(o); } return out; }
    setFontWeight() { return this; }
    clearContent() { for (let i = 0; i < this.nr; i++) for (let j = 0; j < this.nc; j++) { const row = this.s.grid[this.r - 1 + i]; if (row) row[this.c - 1 + j] = ''; } return this; }
    createTextFinder(t) { const self = this; return { matchEntireCell() { return this; }, findNext() { for (let i = 0; i < self.nr; i++) { const row = self.s.grid[self.r - 1 + i]; if (row && String(row[self.c - 1]) === t) return { getRow: () => self.r + i }; } return null; } }; }
  }
  class Spreadsheet {
    constructor() { this.id = 'ss1'; this.sheets = [new Sheet('Sheet1')]; }
    getId() { return this.id; }
    getSheetByName(n) { return this.sheets.find(s => s.name === n) || null; }
    insertSheet(n, i) { const s = new Sheet(n); if (i === 0) this.sheets.unshift(s); else this.sheets.push(s); return s; }
    getSheets() { return this.sheets; }
    deleteSheet(s) { this.sheets = this.sheets.filter(x => x !== s); }
  }
  const ss = new Spreadsheet();
  registry[ss.id] = new File({ name: 'Star Receipts' }, root);
  const SpreadsheetApp = { getActiveSpreadsheet: () => ss, openById: id => { assert.strictEqual(id, 'ss1'); return ss; } };

  // ---- Utilities / misc
  const Utilities = {
    base64Decode: s => Array.from(Buffer.from(s, 'base64')),
    newBlob: (bytes, mime, name) => ({ bytes, mime, name }),
    formatDate: (d, tz, fmt) => {
      const p = {};
      new Intl.DateTimeFormat('en-NZ', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
        .formatToParts(d).forEach(x => { p[x.type] = x.value; });
      return fmt.replace(/yyyy|MM|dd|HH|mm|M/g, t => ({ yyyy: p.year, MM: p.month, dd: p.day, HH: p.hour, mm: p.minute, M: String(Number(p.month)) }[t]));
    },
  };
  const out = [];
  const env = {
    DriveApp, SpreadsheetApp, Utilities,
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => (k in props ? props[k] : null), setProperty: (k, v) => { props[k] = String(v); } }) },
    CacheService: { getScriptCache: () => ({ get: k => (k in cache ? cache[k] : null), put: (k, v) => { cache[k] = v; }, remove: k => { delete cache[k]; } }) },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: s => ({ s, setMimeType() { return this; }, getContent() { return this.s; } }) },
    Logger: { log: m => out.push(String(m)) },
    Date: FakeDate, JSON, Math, Number, String, isNaN, RegExp, Array, Object, Error, parseInt,
  };
  return { env, logs: out, root, ss, props, cache };
}

function load() {
  const e = makeEnv();
  const ctx = vm.createContext(e.env);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', '..', 'apps-script', 'receipts', 'Code.gs'), 'utf8'), ctx, { filename: 'Code.gs' });
  const call = body => JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify(body) } }).getContent());
  return Object.assign(e, { ctx, call });
}

const jpg = Buffer.from('fake-jpeg-bytes').toString('base64');
let passed = 0;
function t(name, fn) { try { fn(); passed++; console.log('  ok   ' + name); } catch (e) { console.log('  FAIL ' + name + '\n       ' + e.message); process.exitCode = 1; } }

console.log('Code.gs harness');
const A = load();
A.ctx.setup();
const pin = (A.logs.find(l => l.startsWith('YOUR PIN IS')) || '').match(/\d{6}/);

t('setup logs a 6-digit PIN and creates Receipts root', () => {
  assert.ok(pin, 'no pin logged');
  assert.ok(A.root.kids.find(k => k.name === 'Receipts'));
});
t('setup creates both tabs, headers, seed categories; removes blank Sheet1', () => {
  assert.deepStrictEqual(A.ss.getSheets().map(s => s.name).sort(), ['Categories', 'Receipts']);
  assert.strictEqual(A.ss.getSheetByName('Receipts').grid[0][0], 'ID');
  assert.strictEqual(A.ss.getSheetByName('Categories').grid.length, 15);
});
t('setup is re-runnable and keeps the PIN', () => {
  const before = A.props.PIN; A.ctx.setup();
  assert.strictEqual(A.props.PIN, before);
  assert.strictEqual(A.ss.getSheetByName('Categories').grid.length, 15);
});
const P = pin[0];

t('wrong PIN rejected, right PIN accepted', () => {
  assert.strictEqual(A.call({ action: 'ping', pin: '000000x' }).error, 'pin');
  assert.strictEqual(A.call({ action: 'ping', pin: P }).ok, true);
});
t('categories returns the seed list', () => {
  const r = A.call({ action: 'categories', pin: P });
  assert.ok(r.categories.includes('Laundry & linen') && r.categories.length === 14);
});
t('receipt saves into Receipts/2026/2026-10 October with name and row', () => {
  const r = A.call({ action: 'receipt', pin: P, id: 'abcd-1234-aaaa', capturedAt: '2026-10-14T01:30:00Z', entity: 'Motel', motelPct: 100, cash: false, category: 'Grounds', amount: 84.5, note: 'hedge trimmer line', mime: 'image/jpeg', data: jpg });
  assert.strictEqual(r.ok, true, JSON.stringify(r));
  assert.strictEqual(r.folder, '2026-10 October');
  assert.strictEqual(r.file, '2026-10-14_1430_84.50_abcd.jpg');   // 01:30Z = 14:30 NZDT
  const root = A.root.kids.find(k => k.name === 'Receipts');
  const month = root.kids.find(k => k.name === '2026').kids.find(k => k.name === '2026-10 October');
  assert.strictEqual(month.files.length, 1);
  const row = A.ss.getSheetByName('Receipts').grid[1];
  assert.strictEqual(row[3], 'Motel'); assert.strictEqual(row[4], 100); assert.strictEqual(row[6], 'Grounds'); assert.strictEqual(row[7], 84.5); assert.strictEqual(row[11], 'Captured');
});
t('same id again is a no-op (idempotent)', () => {
  const r = A.call({ action: 'receipt', pin: P, id: 'abcd-1234-aaaa', capturedAt: '2026-10-14T01:30:00Z', entity: 'Motel', mime: 'image/jpeg', data: jpg });
  assert.strictEqual(r.duplicate, true);
  assert.strictEqual(A.ss.getSheetByName('Receipts').grid.length, 2);
  const month = A.root.kids[0].kids.find(k => k.name === '2026').kids.find(k => k.name === '2026-10 October');
  assert.strictEqual(month.files.length, 1);
});
t('month is taken in NZ time (31 Oct 12:00Z is already 1 Nov in NZ)', () => {
  const r = A.call({ action: 'receipt', pin: P, id: 'zzzz-0001-bbbb', capturedAt: '2026-10-31T12:00:00Z', entity: 'Motel', mime: 'image/jpeg', data: jpg });
  assert.strictEqual(r.folder, '2026-11 November');
});
t('Part personal keeps the motel %, cash flag recorded, formula-looking note defused', () => {
  const r = A.call({ action: 'receipt', pin: P, id: 'qqqq-0002-cccc', capturedAt: '2026-10-20T03:00:00Z', entity: 'Part personal', motelPct: 40, cash: true, note: '=HYPERLINK("x")', mime: 'application/pdf', data: jpg });
  assert.strictEqual(r.ok, true);
  const row = A.ss.getSheetByName('Receipts').grid.slice(-1)[0];
  assert.strictEqual(row[4], 40); assert.strictEqual(row[5], 'Y'); assert.ok(String(row[8]).startsWith("'=")); assert.ok(row[9].endsWith('.pdf')); assert.strictEqual(row[7], '');
});
t('rejects bad type, bad id, empty data, oversize', () => {
  assert.strictEqual(A.call({ action: 'receipt', pin: P, id: 'abcd-9999-dddd', mime: 'text/html', data: jpg }).error, 'bad-type');
  assert.strictEqual(A.call({ action: 'receipt', pin: P, id: '../x', mime: 'image/jpeg', data: jpg }).error, 'bad-id');
  assert.strictEqual(A.call({ action: 'receipt', pin: P, id: 'abcd-9999-eeee', mime: 'image/jpeg', data: '' }).error, 'no-data');
  const big = Buffer.alloc(8 * 1024 * 1024 + 10).toString('base64');
  assert.strictEqual(A.call({ action: 'receipt', pin: P, id: 'abcd-9999-ffff', mime: 'image/jpeg', data: big }).error, 'too-big');
});
t('a wild phone clock falls back to server time', () => {
  const r = A.call({ action: 'receipt', pin: P, id: 'clock-0003-gggg', capturedAt: '2031-01-01T00:00:00Z', entity: 'Motel', mime: 'image/jpeg', data: jpg });
  assert.strictEqual(r.folder, '2026-11 November');
});
t('if the sheet write fails the file is trashed, nothing is left behind', () => {
  A.ss.getSheetByName('Receipts').failAppend = true;
  const r = A.call({ action: 'receipt', pin: P, id: 'fail-0004-hhhh', capturedAt: '2026-11-01T00:00:00Z', entity: 'Motel', mime: 'image/jpeg', data: jpg });
  A.ss.getSheetByName('Receipts').failAppend = false;
  assert.strictEqual(r.ok, false);
  const all = []; (function walk(f) { f.files.forEach(x => all.push(x)); f.kids.forEach(walk); })(A.root);
  assert.ok(all.filter(f => f.name.includes('_hhhh')).every(f => f.trashed));
});
t('recent returns newest first', () => {
  const r = A.call({ action: 'recent', pin: P, n: 3 });
  assert.strictEqual(r.rows.length, 3);
  assert.ok(r.rows[0].captured >= r.rows[1].captured);
});
t('delete removes the row, trashes the file, and is safe to repeat', () => {
  const sh = A.ss.getSheetByName('Receipts');
  const before = sh.grid.length;
  const row = sh.grid[sh.grid.length - 1];
  const fileId = /\/d\/([-\w]+)/.exec(row[10])[1];
  const r = A.call({ action: 'delete', pin: P, id: row[0] });
  assert.strictEqual(r.deleted, true);
  assert.strictEqual(sh.grid.length, before - 1);
  assert.strictEqual(r.fileTrashed, true);
  assert.ok(!sh.grid.some(x => x[0] === row[0]));
  assert.strictEqual(A.call({ action: 'delete', pin: P, id: row[0] }).deleted, false);
  assert.strictEqual(A.call({ action: 'delete', pin: P, id: 'x' }).ok, false);
  assert.strictEqual(A.call({ action: 'delete', pin: 'wrong', id: row[0] }).ok, false);
});
t('addCategory adds, dedupes case-insensitively, and un-hides', () => {
  const a = A.call({ action: 'addCategory', pin: P, name: '  Pest   control ' });
  assert.strictEqual(a.added, 'Pest control'); assert.ok(a.categories.includes('Pest control'));
  const b = A.call({ action: 'addCategory', pin: P, name: 'PEST CONTROL' });
  assert.strictEqual(b.categories.filter(c => c.toLowerCase() === 'pest control').length, 1);
  const cs = A.ss.getSheetByName('Categories'); cs.grid[1][1] = 'N';
  assert.ok(!A.call({ action: 'categories', pin: P }).categories.includes(cs.grid[1][0]));
  A.call({ action: 'addCategory', pin: P, name: cs.grid[1][0] });
  assert.ok(A.call({ action: 'categories', pin: P }).categories.includes(cs.grid[1][0]));
  assert.strictEqual(A.call({ action: 'addCategory', pin: P, name: '   ' }).ok, false);
});
t('brute force locks out, even for the right PIN', () => {
  const B = load(); B.ctx.setup(); const bp = B.logs.find(l => l.startsWith('YOUR PIN')).match(/\d{6}/)[0];
  for (let i = 0; i < 8; i++) assert.strictEqual(B.call({ action: 'ping', pin: 'nope' + i }).error, 'pin');
  assert.strictEqual(B.call({ action: 'ping', pin: bp }).error, 'locked');
});
t('garbage body returns a JSON error, not an exception', () => {
  const out = JSON.parse(A.ctx.doPost({ postData: { contents: 'not json' } }).getContent());
  assert.strictEqual(out.ok, false);
});

console.log(passed + ' passed' + (process.exitCode ? ', with failures' : ''));
