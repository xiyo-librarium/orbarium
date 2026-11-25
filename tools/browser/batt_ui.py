import os, sys, subprocess, time
from playwright.sync_api import sync_playwright
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..'))
os.makedirs('/tmp/orb_flow', exist_ok=True)
import mock_real
tag = sys.argv[1] if len(sys.argv) > 1 else 'e1'; W, H = 1280, 820
srv = subprocess.Popen([sys.executable, '-m', 'http.server', '8822', '-d', os.path.join(HERE, '..', '..', 'public')], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
try:
    with sync_playwright() as p:
        b = p.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
        page = b.new_context(viewport={'width': W, 'height': H}).new_page()
        errs = []; page.on('pageerror', lambda e: errs.append('PE ' + str(e))); page.on('console', lambda m: errs.append(m.text[:200]) if m.type == 'error' else None)
        mock_real.install(page)
        page.goto('http://localhost:8822/?shot=1&fast=1')
        page.wait_for_function('window.__orb && window.__orb.v && window.__orb.v.lastDraw', timeout=120000)
        page.evaluate("(()=>{const n=window.__orb; n.s.known.push('offgrid'); n.s.cash+=500; const h=n.house(),b=n.E.W.roofBox(h); n.flyNear({x:(b.X0+b.X1)/2,y:h.z,z:(b.Y0+b.Y1)/2})})()")
        page.wait_for_timeout(300); page.wait_for_function('!window.__orb.v.flying()', timeout=60000)
        page.evaluate("window.__orb.select({kind:'building',id:'main'})"); page.wait_for_timeout(300)
        print('row', page.evaluate("[...document.querySelectorAll('#card .row')].map(r=>r.innerText.replace(/\\n/g,' ')).filter(x=>x.includes('蓄電池')).join('|')"))
        page.click('#card [data-act="placebatt"]'); page.wait_for_timeout(300); page.wait_for_function('!window.__orb.v.flying()', timeout=60000); page.wait_for_timeout(600)
        print('placing', page.evaluate("JSON.stringify(window.__orb.G.placing)"), 'cut', page.evaluate("window.__orb.stage.cut"), page.evaluate("document.querySelector('#hint').textContent"))
        # 空いた床のマス（家具のない所）を押す
        pt = page.evaluate("""(()=>{const n=window.__orb,W=n.E.W,h=n.house(),V=n.v.camera.position.constructor; const furn=new Set(h.furn.flatMap(f=>W.furnCells(f).map(c=>c.join(','))));
          for (const k of Object.keys(h.cells)) { if (furn.has(k)) continue; const [x,y]=k.split(',').map(Number); const s=n.toScreen(new V(x+0.5,h.z+0.02,y+0.5)); if (s.x>40&&s.y>100&&s.y<640) return {x:s.x,y:s.y,k}; } return null})()""")
        print('target', pt)
        page.mouse.click(pt['x'], pt['y']); page.wait_for_timeout(800)
        print('after', page.evaluate("document.querySelector('#toast').textContent"), page.evaluate("JSON.stringify(window.__orb.E.W.blocksOf(window.__orb.s.world,'batt').map(q=>[q.x,q.y,q.z]))"), 'kWh', page.evaluate("window.__orb.E.W.analyze(window.__orb.s.world, window.__orb.E.SITES.med, 1).battKwh"))
        page.wait_for_timeout(1200); page.screenshot(path=f'/tmp/orb_flow/{tag}_batt.png')
        print(errs[:5])
finally:
    srv.terminate()
