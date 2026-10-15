"""Drives receipts/index.html in headless Chromium against a mocked Apps Script endpoint.
Usage: python3 tests/receipts/page-test.py   (serves ./receipts on :8765 itself)
"""
import base64, io, json, os, subprocess, sys, time, threading
from playwright.sync_api import sync_playwright
from PIL import Image

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'receipts')
SHOTS = os.path.join("/tmp", "star-receipts-shots")
os.makedirs(SHOTS, exist_ok=True)
URL = 'http://localhost:8765/index.html'
EXEC = 'https://script.google.com/macros/s/TEST/exec'
PIN = '482913'

server = subprocess.Popen([sys.executable, '-m', 'http.server', '8765', '--bind', '127.0.0.1'], cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)

# ---- mock backend state
S = {'rows': {}, 'cats': ['Grounds', 'Other'], 'calls': [], 'mode': 'ok'}   # mode: ok | offline | lostreply

def backend(route):
    req = route.request
    hdr = {'access-control-allow-origin': '*'}
    if S['mode'] == 'offline':
        return route.abort('connectionfailed')
    body = json.loads(req.post_data or '{}')
    S['calls'].append(body.get('action'))
    def reply(o, status=200):
        route.fulfill(status=status, content_type='application/json', headers=hdr, body=json.dumps(o))
    if body.get('pin') != PIN:
        return reply({'ok': False, 'error': 'pin', 'message': 'PIN not accepted'})
    a = body['action']
    if a == 'ping': return reply({'ok': True})
    if a == 'categories': return reply({'ok': True, 'categories': S['cats']})
    if a == 'addCategory':
        if body['name'] not in S['cats']: S['cats'].append(body['name'])
        return reply({'ok': True, 'added': body['name'], 'categories': S['cats']})
    if a == 'recent':
        rows = [{'captured': '2026-10-15 11:46', 'entity': r['entity'], 'cash': r['cash'], 'category': r['category'], 'amount': r['amount'], 'note': r['note'], 'link': 'https://drive.google.com/file/d/x/view', 'status': 'Captured'} for r in S['rows'].values()]
        return reply({'ok': True, 'rows': rows})
    if a == 'receipt':
        dup = body['id'] in S['rows']
        S['rows'].setdefault(body['id'], body)
        if S['mode'] == 'lostreply':
            return route.fulfill(status=200, content_type='text/html', headers=hdr, body='<html>Google error page</html>')
        return reply({'ok': True, 'duplicate': dup, 'folder': '2026-10 October', 'file': 'f.jpg', 'link': 'x'})
    return reply({'ok': False, 'error': 'bad-action'})

# ---- test files
def big_jpeg():
    im = Image.effect_noise((4000, 3000), 60).convert('RGB')
    b = io.BytesIO(); im.save(b, 'JPEG', quality=95); return b.getvalue()
BIG = big_jpeg()
PDF = b'%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n'

results = []
def check(name, cond, extra=''):
    results.append(bool(cond)); print(('  ok   ' if cond else '  FAIL ') + name + (('  ' + str(extra)) if (extra and not cond) else ''))

try:
    with sync_playwright() as p:
        br = p.chromium.launch()
        ctx = br.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2)
        page = ctx.new_page()
        errors = []
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.on('console', lambda m: errors.append(m.text) if m.type == 'error' and 'net::ERR' not in m.text and 'Failed to load resource' not in m.text else None)
        page.route(lambda u: u.endswith('/config.js'), lambda r: r.fulfill(content_type='application/javascript', body="window.STAR_RECEIPTS={SCRIPT_URL:'%s'};" % EXEC))
        page.route(EXEC, backend)
        dialogs = []
        page.on('dialog', lambda d: (dialogs.append(d.message), d.accept('Pest control') if 'category' in d.message.lower() else d.accept()))

        page.goto(URL)
        page.wait_for_timeout(400)
        check('first open asks for the PIN', page.locator('#pinCard').is_visible() and not page.locator('#capWrap').is_visible())

        page.fill('#pinIn', '000000'); page.click('#pinSave'); page.wait_for_timeout(400)
        check('wrong PIN is refused with a message', page.locator('#pinCard').is_visible() and 'not accepted' in page.inner_text('#pinMsg').lower())

        page.fill('#pinIn', PIN); page.click('#pinSave'); page.wait_for_timeout(600)
        check('right PIN unlocks capture', page.locator('#capWrap').is_visible() and not page.locator('#pinCard').is_visible())
        check('categories loaded from the sheet', 'Grounds' in page.locator('#cat').inner_text() and 'Add new category' in page.locator('#cat').inner_text())
        page.screenshot(path=SHOTS + '/1-capture.png')

        # ---- photo -> compress -> save
        page.set_input_files('#fFile', files=[{'name': 'IMG_0001.jpg', 'mimeType': 'image/jpeg', 'buffer': BIG}])
        page.wait_for_selector('#fields:not([hidden])', timeout=15000)
        check('preview appears after choosing a photo', page.locator('#pvImg').is_visible())
        page.click('#entity button[data-e="Part personal"]')
        check('Part personal reveals the motel share field', page.locator('#pctWrap').is_visible())
        page.fill('#pct', '40'); page.check('#cash'); page.select_option('#cat', 'Grounds')
        page.fill('#amount', 'abc'); page.click('#save'); page.wait_for_timeout(300)
        check('bad amount is stopped before sending', 'receipt' not in S['calls'] and 'total' in page.inner_text('#toast').lower())
        page.fill('#amount', '$84.50'); page.fill('#note', 'hedge trimmer line')
        page.screenshot(path=SHOTS + '/2-fields.png', full_page=True)
        page.click('#save'); page.wait_for_timeout(1200)
        check('a receipt reached the backend', len(S['rows']) == 1, S['calls'])
        r1 = list(S['rows'].values())[0] if S['rows'] else {}
        im = Image.open(io.BytesIO(base64.b64decode(r1.get('data', '')))) if r1 else None
        check('photo was shrunk to 1800px long edge as JPEG', im and im.format == 'JPEG' and max(im.size) <= 1800, im and (im.format, im.size))
        check('compressed payload is a fraction of the original', r1 and len(r1['data']) * 0.75 < len(BIG) * 0.5, r1 and len(r1['data']))
        check('fields sent correctly', r1 and r1['entity'] == 'Part personal' and r1['motelPct'] == 40 and r1['cash'] is True and r1['category'] == 'Grounds' and r1['amount'] == 84.5 and r1['note'] == 'hedge trimmer line')
        check('success toast names the folder and form resets', '2026-10 October' in page.inner_text('#toast') and page.locator('#shoot').is_visible() and page.input_value('#amount') == '')

        # ---- offline queue, then flush
        S['mode'] = 'offline'
        page.set_input_files('#fFile', files=[{'name': 'b.jpg', 'mimeType': 'image/jpeg', 'buffer': BIG}])
        page.wait_for_selector('#fields:not([hidden])', timeout=15000)
        page.click('#save'); page.wait_for_timeout(1000)
        check('no signal: receipt is queued, not lost', page.locator('#qbar').is_visible() and '1 waiting' in page.inner_text('#qtext'), page.inner_text('#toast'))
        page.screenshot(path=SHOTS + '/3-queued.png')
        S['mode'] = 'ok'
        page.click('#qgo'); page.wait_for_timeout(1500)
        check('queue uploads when signal returns', not page.locator('#qbar').is_visible() and len(S['rows']) == 2, len(S['rows']))

        # ---- lost reply: server saved it, phone never heard; retry must not duplicate
        S['mode'] = 'lostreply'
        page.set_input_files('#fFile', files=[{'name': 'c.jpg', 'mimeType': 'image/jpeg', 'buffer': BIG}])
        page.wait_for_selector('#fields:not([hidden])', timeout=15000)
        page.click('#save'); page.wait_for_timeout(1000)
        saved_before_retry = len(S['rows'])
        check('lost reply: queued on the phone while the server already has it', page.locator('#qbar').is_visible() and saved_before_retry == 3)
        S['mode'] = 'ok'
        page.click('#qgo'); page.wait_for_timeout(1500)
        check('retry is recognised as a duplicate, no second row', len(S['rows']) == 3 and not page.locator('#qbar').is_visible(), len(S['rows']))

        # ---- PDF
        page.set_input_files('#fFile', files=[{'name': 'powershop-oct.pdf', 'mimeType': 'application/pdf', 'buffer': PDF}])
        page.wait_for_selector('#fields:not([hidden])', timeout=5000)
        check('PDF shows a chip, not an image', page.locator('#pvPdf').is_visible() and not page.locator('#pvImg').is_visible() and 'powershop-oct.pdf' in page.inner_text('#pvPdf'))
        page.click('#save'); page.wait_for_timeout(1000)
        pdfs = [r for r in S['rows'].values() if r['mime'] == 'application/pdf']
        check('PDF reaches the backend as application/pdf', len(pdfs) == 1 and base64.b64decode(pdfs[0]['data']).startswith(b'%PDF'))

        # ---- add category on the fly
        page.set_input_files('#fFile', files=[{'name': 'd.jpg', 'mimeType': 'image/jpeg', 'buffer': BIG}])
        page.wait_for_selector('#fields:not([hidden])', timeout=15000)
        page.select_option('#cat', '__new__'); page.wait_for_timeout(800)
        check('new category prompt adds it and selects it', 'Pest control' in S['cats'] and page.input_value('#cat') == 'Pest control', (dialogs, S['cats']))
        page.click('#retake'); page.wait_for_timeout(200)
        check('retake returns to the camera buttons', page.locator('#shoot').is_visible() and not page.locator('#fields').is_visible())

        # ---- recent tab
        page.click('nav button[data-tab="recent"]'); page.wait_for_timeout(800)
        check('recent lists saved receipts with an open link', page.locator('#recentList .item').count() >= 4 and page.locator('#recentList a').count() >= 1, page.locator('#recentList .item').count())
        page.screenshot(path=SHOTS + '/4-recent.png', full_page=True)

        # ---- PIN stored on phone survives reload; server revoking it re-prompts
        page.click('nav button[data-tab="cap"]'); page.reload(); page.wait_for_timeout(600)
        check('PIN persists across reloads', page.locator('#capWrap').is_visible())
        S['mode'] = 'ok'
        page.evaluate("localStorage.setItem('receipts-pin','999999')"); page.reload(); page.wait_for_timeout(800)
        check('a stale PIN sends you back to the PIN screen', page.locator('#pinCard').is_visible())

        check('no JS errors in the console', not errors, errors)
        br.close()
finally:
    server.terminate()

print('%d/%d passed' % (sum(results), len(results)))
sys.exit(0 if all(results) else 1)
