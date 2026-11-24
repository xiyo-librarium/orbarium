import os, sys, subprocess, time
from playwright.sync_api import sync_playwright
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..'))
os.makedirs('/tmp/orb_flow', exist_ok=True)
import mock_real
tag = sys.argv[1] if len(sys.argv) > 1 else 'e1'; W, H, DPR = (390, 844, 2) if 'phone' in tag else (1280, 820, 1)
srv = subprocess.Popen([sys.executable, '-m', 'http.server', '8806', '-d', os.path.join(HERE, '..', '..', 'public')], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
def shot(page, name): page.wait_for_timeout(1200); page.screenshot(path=f'/tmp/orb_look/{tag}_{name}.png')
try:
    with sync_playwright() as p:
        b = p.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
        page = b.new_context(viewport={'width': W, 'height': H}, device_scale_factor=DPR).new_page()
        errs = []; page.on('pageerror', lambda e: errs.append('PE ' + str(e))); page.on('console', lambda m: errs.append(m.text[:200]) if m.type == 'error' else None)
        mock_real.install(page)
        page.goto('http://localhost:8806/next/?shot=1&fast=1')
        page.wait_for_function('window.__next && window.__next.v && window.__next.v.lastDraw', timeout=120000)
        print('known', page.evaluate("JSON.stringify(window.__next.s.known)"), 'season btn', page.evaluate("document.querySelector('#season').textContent"))
        page.evaluate("window.__next.setTool('shed')"); page.wait_for_timeout(300)
        print('shed locked toast:', page.evaluate("document.querySelector('#toast').textContent"), 'tool', page.evaluate("window.__next.G.tool"))
        shot(page, '0map')
        page.click('#season'); page.wait_for_timeout(1500)
        print('report visible', page.evaluate("!document.querySelector('#report').hidden"))
        print(page.evaluate("document.querySelector('#reportBody').innerText.slice(0,500)").replace('\n', ' / '))
        shot(page, '1report')
        page.click('#rBack'); page.wait_for_timeout(300)
        print('known after', page.evaluate("JSON.stringify(window.__next.s.known)"), 'btn', page.evaluate("document.querySelector('#season').textContent"))
        for i in range(3):
            page.evaluate("window.__next.runSeason()"); page.wait_for_timeout(500)
            print('season', i, page.evaluate("document.querySelector('#reportBody header').innerText.replace(/\\n/g,' ')"), '| learned', page.evaluate("JSON.stringify(window.__next.s.known.slice(-2))"), 'cash', round(page.evaluate("window.__next.s.cash")))
            page.click('#rBack'); page.wait_for_timeout(200)
        page.click('#bookBtn'); page.wait_for_timeout(400); shot(page, '2web')
        for t in ['book', 'plan', 'sky', 'note']:
            page.click(f'#tabs [data-tab="{t}"]'); page.wait_for_timeout(300); shot(page, '3' + t)
        page.click('#tabs [data-tab="plan"]'); page.wait_for_timeout(200)
        page.click('#sheetBody [data-cell="0,0"]'); page.wait_for_timeout(300)
        print('week', page.evaluate("JSON.stringify(window.__next.s.persons[0].week)"))
        print(errs[:5])
finally:
    srv.terminate()
