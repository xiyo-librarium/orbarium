# 家の中の壁：壁を下げて、床の線をなぞると間仕切り。部屋を閉じると扉が自動でつく。間仕切りを押すと［間仕切り｜扉｜外す］。
# ✓で一度に払う。建物のカードに部屋ごとの広さとベッド。画像は /tmp/orb_flow/
import os, sys, subprocess, time
from playwright.sync_api import sync_playwright
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..'))
os.makedirs('/tmp/orb_flow', exist_ok=True)
import mock_real
tag = sys.argv[1] if len(sys.argv) > 1 else 'm1'; W, H, DPR = (390, 844, 2) if 'phone' in tag else (1280, 820, 1)
srv = subprocess.Popen([sys.executable, '-m', 'http.server', '8823', '-d', os.path.join(HERE, '..', '..', 'public')], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
def shot(page, name, wait=900): page.wait_for_timeout(wait); page.screenshot(path=f'/tmp/orb_flow/{tag}_{name}.png')
try:
    with sync_playwright() as p:
        b = p.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
        page = b.new_context(viewport={'width': W, 'height': H}, device_scale_factor=DPR, has_touch='phone' in tag).new_page()
        errs = []; page.on('pageerror', lambda e: errs.append('PE ' + str(e))); page.on('console', lambda m: errs.append(m.text[:200]) if m.type == 'error' else None)
        mock_real.install(page)
        page.goto('http://localhost:8823/?shot=1&fast=1')
        page.wait_for_function('window.__next && window.__next.v && window.__next.v.lastDraw', timeout=120000)
        # 家を少し大きくしておく（5×4）、近くへ、壁を下げる
        page.evaluate("""(()=>{const n=window.__next,W=n.E.W,h=n.house(),b=W.roofBox(h); n.s.cash+=300;
          const d=W.cloneHouse(h); W.draftAddRect(n.s.world,d,b.X0,b.Y0,b.X1,b.Y1); W.settleFurn(d); W.buildBuilding(n.s,d);
          const b2=W.roofBox(n.house()); n.flyNear({x:(b2.X0+b2.X1)/2,y:h.z,z:(b2.Y0+b2.Y1)/2})})()""")
        page.wait_for_timeout(300); page.wait_for_function('!window.__next.v.flying()', timeout=60000)
        page.click('#cut'); page.wait_for_timeout(600)
        print('house', page.evaluate("JSON.stringify(window.__next.E.W.roofBox(window.__next.house()))"), 'hint', page.evaluate("document.querySelector('#hint').textContent"))
        # 家具のない線を探して、端から端までなぞる
        L = page.evaluate("""(()=>{const n=window.__next,W=n.E.W,h=n.house(),bx=W.roofBox(h),V=n.v.camera.position.constructor;
          const furn=new Set(h.furn.flatMap(f=>W.furnCells(f).map(c=>c.join(','))));
          const sc=(x,y)=>{const q=n.toScreen(new V(x,h.z+0.01,y));return {x:q.x,y:q.y}};
          for (let x=bx.X0+1;x<bx.X1;x++){ if(furn.has(x+','+bx.Y0)||furn.has(x+','+(bx.Y1-1))) continue; return {line:'v:'+x, a:sc(x+0.06,bx.Y0+0.32), b:sc(x+0.06,bx.Y1-0.32)}; }
          for (let y=bx.Y0+1;y<bx.Y1;y++){ if(furn.has(bx.X0+','+y)||furn.has((bx.X1-1)+','+y)) continue; return {line:'h:'+y, a:sc(bx.X0+0.32,y+0.06), b:sc(bx.X1-0.32,y+0.06)}; }
          return null})()""")
        print('line', L)
        page.mouse.move(L['a']['x'], L['a']['y']); page.mouse.down()
        for i in range(1, 13): page.mouse.move(L['a']['x'] + (L['b']['x'] - L['a']['x']) * i / 12, L['a']['y'] + (L['b']['y'] - L['a']['y']) * i / 12); page.wait_for_timeout(30)
        shot(page, '1drag', 300); print('tip', page.evaluate("document.querySelector('#tip').textContent"))
        page.mouse.up(); page.wait_for_timeout(800)
        print('inner', page.evaluate("JSON.stringify(window.__next.house().inner)"), 'rooms', page.evaluate("JSON.stringify(window.__next.E.W.rooms(window.__next.house()).map(r=>[r.cells.length,r.beds,r.outDoor]))"),
              'editing', page.evaluate("!!window.__next.G.edit"), 'toast', page.evaluate("document.querySelector('#toast').textContent"))
        shot(page, '2walls')
        # 中の扉を押す
        dpt = page.evaluate("""(()=>{const n=window.__next,h=n.house(),V=n.v.camera.position.constructor; const e=Object.keys(h.inner).find(k=>h.inner[k]==='wall'); if(!e) return null;
          const [t,r]=e.split(':'),[x,y]=r.split(',').map(Number); const q=n.toScreen(new V(t==='h'?x+0.5:x, h.z+1.0, t==='h'?y:y+0.5)); return {x:q.x,y:q.y,e}})()""")
        page.mouse.click(dpt['x'], dpt['y']); page.wait_for_timeout(700); shot(page, '3pick', 300)
        print('pick', page.evaluate("document.querySelector('.pick:not([hidden]) .pick-h')?.textContent"), page.evaluate("[...document.querySelectorAll('.pick:not([hidden]) .pick-o button')].map(b=>b.textContent+(b.disabled?'(×)':''))"))
        page.evaluate("document.querySelector('.pick:not([hidden]) [data-p=\"door\"]').click()"); page.wait_for_timeout(600)
        print('after door', page.evaluate("JSON.stringify(window.__next.house().inner)"))
        cash0 = page.evaluate("window.__next.s.cash")
        page.evaluate("document.querySelector('#draftYes').click()"); page.wait_for_timeout(800)
        print('paid', round(cash0 - page.evaluate("window.__next.s.cash"), 2), 'editing', page.evaluate("!!window.__next.G.edit"), 'est', page.evaluate("JSON.stringify(window.__next.E.W.estimate(window.__next.s.world, window.__next.E.W.newHouse(0), window.__next.house()).lines.filter(l=>/間仕切|中の扉/.test(l.label)).map(l=>l.label+l.n))"))
        page.evaluate("window.__next.select({kind:'building',id:'main'})"); page.wait_for_timeout(500); shot(page, '4card', 300)
        print('card rooms', page.evaluate("document.querySelector('#card .rooms')?.innerText.replace(/\\n/g,' ')"))
        print('ERRS', errs[:6])
finally:
    srv.terminate()
