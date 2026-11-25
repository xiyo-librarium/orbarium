# 招待：めぐりができた季節の報告に、次の土地からの招待が2通（ウブド・アレンテージョ）。
# ［もう少しここにいる］のあとも、場所の札のとなりの［次の土地へ］とノートのメールから行ける。画像は /tmp/orb_flow/
import os, sys, subprocess, time
from playwright.sync_api import sync_playwright
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..'))
os.makedirs('/tmp/orb_flow', exist_ok=True)
import mock_real
tag = sys.argv[1] if len(sys.argv) > 1 else 'i1'; W, H, DPR = (390, 844, 2) if 'phone' in tag else (1280, 820, 1)
srv = subprocess.Popen([sys.executable, '-m', 'http.server', '8808', '-d', os.path.join(HERE, '..', '..', 'public')], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
U = 'http://localhost:8808'
def shot(page, name, wait=900): page.wait_for_timeout(wait); page.screenshot(path=f'/tmp/orb_flow/{tag}_{name}.png')
def ready(page, t=120000): page.wait_for_function('window.__next && window.__next.v && window.__next.v.lastDraw', timeout=t)
try:
    with sync_playwright() as p:
        b = p.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
        page = b.new_context(viewport={'width': W, 'height': H}, device_scale_factor=DPR).new_page()
        errs = []; page.on('pageerror', lambda e: errs.append('PE ' + str(e))); page.on('console', lambda m: errs.append(m.text[:200]) if m.type == 'error' else None)
        mock_real.install(page)
        page.goto(U + '/?play&new=med&fast=1'); ready(page); page.click('#rBack')
        print('mailBtn before', page.evaluate("!document.querySelector('#mailBtn').hidden"))
        # 章の目標に届いたことにして季節を過ごす
        page.evaluate("(() => { const n = window.__next; n.s.flags.done_med = 0; n.runSeason(); })()")
        page.wait_for_function("!document.querySelector('#report').hidden", timeout=60000); shot(page, '1report')
        print('report invites', page.evaluate("[...document.querySelectorAll('#reportBody [data-go]')].map(b => b.dataset.go + ':' + b.textContent)"), 'back', page.evaluate("document.querySelector('#rBack').textContent"))
        page.evaluate("document.querySelector('#reportBody').scrollTop = 99999"); shot(page, '1breport_end', 300)
        page.click('#rBack'); page.wait_for_timeout(300); shot(page, '2map')
        print('mailBtn', page.evaluate("!document.querySelector('#mailBtn').hidden"), page.evaluate("document.querySelector('#mailBtn').textContent"))
        page.click('#mailBtn'); page.wait_for_timeout(400); shot(page, '3mailtab')
        print('tab', page.evaluate("document.querySelector('#tabs .on').textContent"), 'go', page.evaluate("[...document.querySelectorAll('#sheetBody [data-go]')].map(b => b.dataset.go)"), 'locks', page.evaluate("[...document.querySelectorAll('#sheetBody .lock')].map(l => l.textContent)"))
        # 次の季節にも、同じ招待は二度届かない
        page.click('#sheetX'); page.evaluate("window.__next.runSeason()"); page.wait_for_function("!document.querySelector('#report').hidden", timeout=60000)
        print('again', page.evaluate("document.querySelectorAll('#reportBody [data-go]').length"), page.evaluate("document.querySelector('#rBack').textContent")); page.click('#rBack')
        page.click('#mailBtn'); page.wait_for_timeout(300)
        page.click('#sheetBody [data-go="ubud"]'); page.wait_for_url('**travel=ubud', timeout=20000); ready(page); shot(page, '4travel', 1200)
        page.wait_for_url('**/?play**', timeout=30000); ready(page); shot(page, '5ubud')
        print('ubud', page.evaluate("window.__next.s.site"), 'cash', page.evaluate("window.__next.s.cash"), 'open', page.evaluate("JSON.stringify(window.__next.E.openInvites(window.__next.s).map(i=>i.land))"), 'climate', page.evaluate("document.querySelector('#reportBody h2')?.textContent"))
        page.click('#rBack'); page.wait_for_timeout(300); shot(page, '6ubud_map')
        print('mailBtn ubud', page.evaluate("document.querySelector('#mailBtn').textContent"))
        print('ERRS', errs[:8])
finally:
    srv.terminate()
