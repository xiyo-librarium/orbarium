import os, sys, subprocess, time
from playwright.sync_api import sync_playwright
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..'))
os.makedirs('/tmp/orb_flow', exist_ok=True)
import mock_real
tag = sys.argv[1] if len(sys.argv) > 1 else 'e1'; W, H = 1280, 820
srv = subprocess.Popen([sys.executable, '-m', 'http.server', '8821', '-d', os.path.join(HERE, '..', '..', 'public')], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
CAM = "([dx,dy,dz])=>{const n=window.__next,v=n.v,h=n.house(),b=n.E.W.roofBox(h),cx=(b.X0+b.X1)/2,cy=(b.Y0+b.Y1)/2; v.controls.target.set(cx,h.z+1.2,cy+1.5); v.camera.position.set(cx+dx,h.z+1.2+dy,cy+dz); v.controls.update(); v.req();}"
try:
    with sync_playwright() as p:
        b = p.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
        page = b.new_context(viewport={'width': W, 'height': H}).new_page()
        errs = []; page.on('pageerror', lambda e: errs.append('PE ' + str(e)))
        mock_real.install(page)
        page.goto('http://localhost:8821/next/?shot=1&fast=1')
        page.wait_for_function('window.__next && window.__next.v && window.__next.v.lastDraw', timeout=120000)
        print(page.evaluate("""(()=>{const n=window.__next,W=n.E.W,s=n.s,h=n.house(),b=W.roofBox(h); const d=W.cloneHouse(h);
          // 南の壁：窓3つつづき＋両開きの扉
          const south=W.houseOuterEdges(d).filter(o=>o.dir==='s').map(o=>o.e).sort(); for (const e of Object.keys(d.open)) if (south.includes(e)) delete d.open[e];
          south.slice(0,3).forEach(e=>d.open[e]='window'); 
          const east=W.houseOuterEdges(d).filter(o=>o.dir==='e').map(o=>o.e).sort(); for (const e of Object.keys(d.open)) if (east.includes(e)) delete d.open[e]; east.slice(1,3).forEach(e=>d.open[e]='door');
          W.settleFurn(d); const err=W.buildBuilding(s,d);
          // 生け垣：南に一列とL字
          const y=b.Y1+1; for (let x=b.X0-3;x<b.X0;x++) W.put(s,x,y,W.h(s.world,x,y),'hedge','hire'); for (let k=1;k<3;k++) W.put(s,b.X0-3,y-k,W.h(s.world,b.X0-3,y-k),'hedge','hire');
          W.put(s,b.X0-6,y,W.h(s.world,b.X0-6,y),'hedge','hire');
          n.stage.rebuild(); return JSON.stringify({err, south, east, open:d.open}); })()"""))
        page.evaluate(CAM, [3, 6, 12]); page.wait_for_timeout(1800); page.screenshot(path=f'/tmp/orb_flow/{tag}_south.png')
        page.evaluate(CAM, [12, 5, 3]); page.wait_for_timeout(1800); page.screenshot(path=f'/tmp/orb_flow/{tag}_east.png')
        page.evaluate(CAM, [-6, 8, 10]); page.wait_for_timeout(1800); page.screenshot(path=f'/tmp/orb_flow/{tag}_hedge.png')
        print(errs[:4])
finally:
    srv.terminate()
