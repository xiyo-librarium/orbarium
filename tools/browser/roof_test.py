import os, sys, subprocess, time, json
from playwright.sync_api import sync_playwright
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..'))
os.makedirs('/tmp/orb_flow', exist_ok=True)
import mock_real
tag = sys.argv[1] if len(sys.argv) > 1 else 'e1'; site = sys.argv[2] if len(sys.argv) > 2 else 'med'; W, H = 1280, 820
srv = subprocess.Popen([sys.executable, '-m', 'http.server', '8813', '-d', os.path.join(HERE, '..', '..', 'public')], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
CAM = "([dx,dy,dz])=>{const n=window.__orb,v=n.v,h=n.house(),b=n.E.W.roofBox(h),cx=(b.X0+b.X1)/2,cy=(b.Y0+b.Y1)/2; v.controls.target.set(cx,h.z+1.5,cy); v.camera.position.set(cx+dx,h.z+1.5+dy,cy+dz); v.controls.update(); v.req();}"
def shot(page, name, wait=1500): page.wait_for_timeout(wait); page.screenshot(path=f'/tmp/orb_flow/{tag}_{name}.png')
try:
    with sync_playwright() as p:
        b = p.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
        page = b.new_context(viewport={'width': W, 'height': H}).new_page()
        errs = []; page.on('pageerror', lambda e: errs.append('PE ' + str(e))); page.on('console', lambda m: errs.append(m.text[:200]) if m.type == 'error' else None)
        mock_real.install(page)
        page.goto(f'http://localhost:8813/?play&new={site}')
        page.wait_for_function('window.__orb && window.__orb.v && window.__orb.v.lastDraw', timeout=120000)
        page.click('#rBack')
        page.evaluate("(()=>{const n=window.__orb; n.s.known.push('offgrid'); n.s.cash += 500; })()")
        page.evaluate("(()=>{const n=window.__orb,h=n.house(),b=n.E.W.roofBox(h);n.flyNear({x:(b.X0+b.X1)/2,y:h.z,z:(b.Y0+b.Y1)/2})})()")
        page.wait_for_timeout(300); page.wait_for_function('!window.__orb.v.flying()', timeout=60000)
        sel = "window.__orb.select({kind:'building',id:'main'})"
        page.evaluate(sel); page.wait_for_timeout(300)
        page.click('#card [data-act="method:local"]'); page.wait_for_timeout(400)
        page.evaluate(sel); page.wait_for_timeout(300)
        print('card rows', page.evaluate("[...document.querySelectorAll('#card .row > span:first-child')].map(x=>x.textContent).join(' | ')"))
        print('shape', page.evaluate("document.querySelector('#card [data-act^=\"shape\"].on')?.textContent"), page.evaluate("JSON.stringify([window.__orb.house().roofShape, window.__orb.house().roofDir])"))
        for k in range(8): page.click('#card [data-act="pv:1"]'); page.wait_for_timeout(150)
        print('pv', page.evaluate("window.__orb.house().pv"), page.evaluate("document.querySelector('#toast').textContent"))
        page.evaluate("window.__orb.select(null)")
        page.evaluate(CAM, [3, 9, 10]); shot(page, 'pv_s')
        page.evaluate(CAM, [-3, 9, -10]); shot(page, 'pv_n')
        if site == 'med':
            page.evaluate(sel); page.wait_for_timeout(300); page.click('#card [data-act="shape:mono"]'); page.wait_for_timeout(500)
            print('mono', page.evaluate("JSON.stringify([window.__orb.house().roofShape, window.__orb.house().roofDir])"), page.evaluate("document.querySelector('#toast').textContent"))
            print('rows', page.evaluate("[...document.querySelectorAll('#card .row > span:first-child')].map(x=>x.textContent).join(' | ')"))
            page.screenshot(path=f'/tmp/orb_flow/{tag}_card.png')
            page.evaluate("window.__orb.select(null)"); page.evaluate(CAM, [6, 9, 9]); shot(page, 'mono')
            page.evaluate(sel); page.wait_for_timeout(300); page.click('#card [data-act="rdir:e"]'); page.wait_for_timeout(500)
            page.evaluate("window.__orb.select(null)"); page.evaluate(CAM, [9, 9, 4]); shot(page, 'mono_e')
            page.evaluate(sel); page.wait_for_timeout(300); page.click('#card [data-act="shape:gable"]'); page.wait_for_timeout(400); page.click('#card [data-act="rdir:ew"]'); page.wait_for_timeout(500)
            print('gable ew', page.evaluate("JSON.stringify([window.__orb.house().roofShape, window.__orb.house().roofDir])"))
            page.evaluate("window.__orb.select(null)"); page.evaluate(CAM, [6, 9, 9]); shot(page, 'gable_ew')
        print(errs[:6])
finally:
    srv.terminate()
