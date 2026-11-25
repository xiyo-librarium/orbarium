import os, sys, subprocess, time
from playwright.sync_api import sync_playwright
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..'))
os.makedirs('/tmp/orb_flow', exist_ok=True)
import mock_real
tag = sys.argv[1] if len(sys.argv) > 1 else 'e1'; W, H = 1280, 820
srv = subprocess.Popen([sys.executable, '-m', 'http.server', '8823', '-d', os.path.join(HERE, '..', '..', 'public')], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
SC = "([x,y,dz])=>{const n=window.__orb,V=n.v.camera.position.constructor; const s=n.toScreen(new V(x+0.5,n.E.W.h(n.s.world,x,y)+(dz||0.05),y+0.5)); return {x:s.x,y:s.y}}"
try:
    with sync_playwright() as p:
        b = p.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
        page = b.new_context(viewport={'width': W, 'height': H}).new_page()
        errs = []; page.on('pageerror', lambda e: errs.append('PE ' + str(e))); page.on('console', lambda m: errs.append(m.text[:200]) if m.type == 'error' else None)
        mock_real.install(page)
        page.goto('http://localhost:8823/?shot=1&fast=1')
        page.wait_for_function('window.__orb && window.__orb.v && window.__orb.v.lastDraw', timeout=120000)
        page.evaluate("(()=>{const n=window.__orb; n.s.known.push('grey'); n.s.cash+=500; const h=n.house(),b=n.E.W.roofBox(h); n.flyNear({x:b.X0-3,y:h.z,z:b.Y0-2})})()")
        page.wait_for_timeout(300); page.wait_for_function('!window.__orb.v.flying()', timeout=60000); page.wait_for_timeout(500)
        cell = page.evaluate("(()=>{const n=window.__orb,b=n.E.W.roofBox(n.house()); return [b.X0-6, b.Y0-1]})()")
        page.evaluate("window.__orb.setTool('water'); window.__orb.setSub('water','pump')"); page.wait_for_timeout(200)
        pt = page.evaluate(SC, [cell[0], cell[1], 0.02]); page.mouse.click(pt['x'], pt['y']); page.wait_for_timeout(700)
        print('settle', page.evaluate("document.querySelector('#toast').textContent"), page.evaluate("JSON.stringify(window.__orb.E.W.blocksOf(window.__orb.s.world,'pump').map(q=>[q.x,q.y,q.z]))"))
        page.evaluate("window.__orb.setTool(null)"); page.wait_for_timeout(300)
        page.screenshot(path=f'/tmp/orb_flow/{tag}_settle.png')
        q = page.evaluate("(()=>{const q=window.__orb.E.W.blocksOf(window.__orb.s.world,'pump')[0]; return [q.x,q.y]})()")
        a = page.evaluate("(()=>{const n=window.__orb,r=document.querySelector('#c').getBoundingClientRect(); for (let y=60;y<r.height-120;y+=6) for (let x=10;x<r.width-10;x+=6){ const p=n.stage.pick({x:x/r.width*2-1,y:-y/r.height*2+1}); if (p&&p.kind==='pump') return {x:x+r.left,y:y+r.top}; } return null})()")
        print('found pump on screen at', a)
        b2 = {'x': a['x'] + 90, 'y': a['y'] + 40}
        print('pick at a', page.evaluate("(([x,y])=>{const n=window.__orb,r=document.querySelector('#c').getBoundingClientRect(); const V2=n.v.camera.position.constructor; const p=n.stage.pick({x:(x-r.left)/r.width*2-1,y:-(y-r.top)/r.height*2+1}); return p&&p.kind})", [a['x'], a['y']]))
        page.mouse.move(a['x'], a['y']); page.mouse.down(); page.mouse.move((a['x'] + b2['x']) / 2, (a['y'] + b2['y']) / 2, steps=4); page.mouse.move(b2['x'], b2['y'], steps=6); page.wait_for_timeout(300); page.mouse.up(); page.wait_for_timeout(700)
        print('moved', page.evaluate("document.querySelector('#toast').textContent"), page.evaluate("JSON.stringify(window.__orb.E.W.blocksOf(window.__orb.s.world,'pump').map(q=>[q.x,q.y,q.z]))"), 'cam ok')
        page.wait_for_timeout(800); page.screenshot(path=f'/tmp/orb_flow/{tag}_moved.png')
        print(errs[:5])
finally:
    srv.terminate()
