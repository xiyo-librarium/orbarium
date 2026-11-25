import os, sys, subprocess, time
from playwright.sync_api import sync_playwright
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..'))
os.makedirs('/tmp/orb_flow', exist_ok=True)
import mock_real
tag = sys.argv[1] if len(sys.argv) > 1 else 'e1'; PHONE = 'phone' in tag; W, H, DPR = (390, 844, 2) if PHONE else (1280, 820, 1)
srv = subprocess.Popen([sys.executable, '-m', 'http.server', '8818', '-d', os.path.join(HERE, '..', '..', 'public')], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
CAM = "([dx,dy,dz])=>{const n=window.__orb,v=n.v,h=n.house(),b=n.E.W.roofBox(h),cx=(b.X0+b.X1)/2,cy=(b.Y0+b.Y1)/2; v.controls.target.set(cx,h.z+1.2,cy); v.camera.position.set(cx+dx,h.z+1.2+dy,cy+dz); v.controls.update(); v.req();}"
def shot(page, name, wait=1300): page.wait_for_timeout(wait); page.screenshot(path=f'/tmp/orb_flow/{tag}_{name}.png')
try:
    with sync_playwright() as p:
        b = p.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
        page = b.new_context(viewport={'width': W, 'height': H}, device_scale_factor=DPR).new_page()
        errs = []; page.on('pageerror', lambda e: errs.append('PE ' + str(e))); page.on('console', lambda m: errs.append(m.text[:200]) if m.type == 'error' else None)
        mock_real.install(page)
        page.goto('http://localhost:8818/?play&new=med')
        page.wait_for_function('window.__orb && window.__orb.v && window.__orb.v.lastDraw', timeout=120000)
        page.click('#rBack')
        page.evaluate("(()=>{const n=window.__orb,h=n.house(),b=n.E.W.roofBox(h);n.flyNear({x:(b.X0+b.X1)/2,y:h.z,z:(b.Y0+b.Y1)/2})})()")
        page.wait_for_timeout(300); page.wait_for_function('!window.__orb.v.flying()', timeout=60000)
        page.evaluate(CAM, [6, 8, 10] if not PHONE else [7, 10, 13])
        st = lambda: page.evaluate("JSON.stringify({cash: Math.round(window.__orb.s.cash*10)/10, edit: !!window.__orb.G.edit, chip: document.querySelector('#cash').textContent, bar: document.querySelector('#draft').hidden ? null : document.querySelector('#draftTxt').innerText.replace(/\\n/g,' '), season: getComputedStyle(document.querySelector('#season')).display})")
        print('start', st())
        page.evaluate("window.__orb.select({kind:'building',id:'main'})"); page.wait_for_timeout(300)
        page.click('#card [data-act="method:local"]'); page.wait_for_timeout(600)
        print('local', st()); shot(page, 'e1local')
        page.click('#card [data-act="shape:mono"]'); page.wait_for_timeout(600)
        page.evaluate("window.__orb.select(null)")
        # 畑をなぞる（編集の中で）
        page.evaluate("window.__orb.setTool('field')"); page.wait_for_timeout(200)
        page.evaluate("(()=>{const n=window.__orb,h=n.house(),b=n.E.W.roofBox(h); n.traced({a:{x:b.X0-1,y:b.Y1+2},b:{x:b.X0+2,y:b.Y1+3}})})()"); page.wait_for_timeout(800)
        print('field', st()); shot(page, 'e2field')
        page.click('#undo'); page.wait_for_timeout(600); print('undo', st())
        page.click('#draftNo'); page.wait_for_timeout(700); print('cancel', st(), page.evaluate("JSON.stringify([window.__orb.house().wall, window.__orb.house().roof])"))
        shot(page, 'e3cancel')
        page.evaluate("window.__orb.setTool('field')"); page.evaluate("(()=>{const n=window.__orb,h=n.house(),b=n.E.W.roofBox(h); n.traced({a:{x:b.X0-1,y:b.Y1+2},b:{x:b.X0+2,y:b.Y1+3}})})()"); page.wait_for_timeout(700)
        page.click('#draftYes'); page.wait_for_timeout(700); print('confirm', st(), page.evaluate("document.querySelector('#toast').textContent"))
        page.click('#undo'); page.wait_for_timeout(500); print('undo after confirm', st())
        print(errs[:6])
finally:
    srv.terminate()
