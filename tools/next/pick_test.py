import os, sys, subprocess, time, json
from playwright.sync_api import sync_playwright
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..'))
os.makedirs('/tmp/orb_flow', exist_ok=True)
import mock_real
tag = sys.argv[1] if len(sys.argv) > 1 else 'e1'; PHONE = 'phone' in tag; W, H, DPR = (390, 844, 2) if PHONE else (1280, 820, 1)
srv = subprocess.Popen([sys.executable, '-m', 'http.server', '8808', '-d', os.path.join(HERE, '..', '..', 'public')], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
def shot(page, name, wait=900): page.wait_for_timeout(wait); page.screenshot(path=f'/tmp/orb_flow/{tag}_{name}.png')
try:
    with sync_playwright() as p:
        b = p.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
        ctx = b.new_context(viewport={'width': W, 'height': H}, device_scale_factor=DPR, has_touch=PHONE, is_mobile=PHONE)
        page = ctx.new_page()
        errs = []; page.on('pageerror', lambda e: errs.append('PE ' + str(e))); page.on('console', lambda m: errs.append(m.text[:200]) if m.type == 'error' else None)
        mock_real.install(page)
        page.goto('http://localhost:8808/next/?shot=1')
        page.wait_for_function('window.__next && window.__next.v && window.__next.v.lastDraw', timeout=120000)
        page.evaluate("(()=>{const n=window.__next,h=n.house(),b=n.E.W.roofBox(h);n.flyNear({x:(b.X0+b.X1)/2,y:h.z,z:(b.Y0+b.Y1)/2})})()")
        page.wait_for_timeout(300); page.wait_for_function('!window.__next.v.flying()', timeout=60000); page.wait_for_timeout(600)
        # 家具がじゃまになる外壁で、画面に見えている（カメラ側を向いた）ものを探す
        info = page.evaluate("""(()=>{const n=window.__next,W=n.E.W,h=n.house(),cam=n.v.camera.position; const out=[];
          for (const o of W.houseOuterEdges(h)) { if (h.open[o.e]) continue; const [t,r]=o.e.split(':'),[ex,ey]=r.split(',').map(Number),al=t==='h';
            const mx=al?ex+0.5:ex, my=al?ey:ey+0.5, nv={n:[0,-1],s:[0,1],w:[-1,0],e:[1,0]}[o.dir]; const face=(cam.x-mx)*nv[0]+(cam.z-my)*nv[1];
            if (face<=0) continue; const d=W.cloneHouse(h); d.open[o.e]='door'; const bad=d.furn.filter((f,i)=>W.furnProblem(d,f,i)).map(f=>f.t);
            const sc=n.toScreen(new (n.v.camera.position.constructor)(mx+nv[0]*0.1,h.z+1.5,my+nv[1]*0.1));
            out.push({e:o.e,bad,x:sc.x,y:sc.y,face}); }
          return out; })()""")
        info = [i for i in info if 20 < i['x'] < W - 20 and 80 < i['y'] < H - 160]
        print('candidate walls', len(info), [ (i['e'], i['bad']) for i in info][:6])
        tgt = next((i for i in info if i['bad']), info[0])
        (page.tap if PHONE else page.click)('#c', position={'x': tgt['x'], 'y': tgt['y']}); page.wait_for_timeout(500)
        print('pick shown', page.evaluate("!document.querySelector('.pick:not(.furnbar)').hidden"), page.evaluate("[...document.querySelectorAll('.pick:not(.furnbar) .pick-o button')].map(b=>b.innerText.replace(/\\n/g,' ')+(b.disabled?'(x)':''))"))
        print('note', page.evaluate("document.querySelector('.pick:not(.furnbar) .pick-n').innerText"))
        shot(page, 'p1pick')
        page.click('.pick:not(.furnbar) [data-p="door"]'); page.wait_for_timeout(600)
        print('toast', page.evaluate("document.querySelector('#toast').textContent"), 'open', page.evaluate("JSON.stringify(window.__next.house().open)"))
        print('problems', page.evaluate("JSON.stringify(window.__next.E.W.houseProblems(window.__next.house()))"))
        shot(page, 'p2door')
        page.click('.pick:not(.furnbar) [data-p="x"]'); page.wait_for_timeout(200)
        print('draft before confirm', page.evaluate("window.__next.G.draft && window.__next.G.draft.what"), 'cash', page.evaluate("Math.round(window.__next.s.cash*10)/10"))
        page.click('#draftYes'); page.wait_for_timeout(600)
        print('after confirm', page.evaluate("document.querySelector('#toast').textContent"), 'open', page.evaluate("JSON.stringify(window.__next.house().open)"))
        # 中を見る
        page.click('#cut'); page.wait_for_timeout(400)
        page.evaluate("(()=>{const n=window.__next,v=n.v,c=v.controls.target.clone();v.lookAt(c,%s,55,60)})()" % ('16' if PHONE else '11'))
        page.wait_for_timeout(1500); shot(page, 'p3cut')
        f = page.evaluate("""(()=>{const n=window.__next,W=n.E.W,h=n.house(); const i=h.furn.findIndex(f=>f.t==='bed'); const cs=W.furnCells(h.furn[i]); const cx=cs.reduce((a,c)=>a+c[0]+0.5,0)/cs.length, cy=cs.reduce((a,c)=>a+c[1]+0.5,0)/cs.length;
           const V=n.v.camera.position.constructor, sc=n.toScreen(new V(cx,h.z+0.45,cy));
           // 空いた床のマス
           const occ=new Set(h.furn.flatMap(f=>W.furnCells(f).map(c=>c.join(',')))); let free=null;
           for (const k in h.cells) { const [x,y]=k.split(',').map(Number); const g={...h.furn[i],x,y}; if (!W.furnProblem(h,g,i) && !occ.has(k)) { free=[x,y]; break; } }
           const fs = free ? n.toScreen(new V(free[0]+0.5, h.z, free[1]+0.5)) : null; const head=W.furnCells(h.furn[i])[0];
           return {i, r:h.furn[i].r, x:sc.x, y:sc.y, free, fx: fs&&fs.x, fy: fs&&fs.y, head, cells: cs}; })()""")
        print('bed', f)
        (page.tap if PHONE else page.click)('#c', position={'x': f['x'], 'y': f['y']}); page.wait_for_timeout(500)
        print('fbar', page.evaluate("!document.querySelector('.furnbar').hidden"), page.evaluate("document.querySelector('.furnbar').innerText.replace(/\\n/g,' / ')"))
        shot(page, 'p4furn')
        print('cam0', page.evaluate("window.__next.v.camera.position.toArray().map(x=>x.toFixed(2)).join(',')"))
        page.click('.furnbar [data-f="rot"]'); page.wait_for_timeout(500)
        print('after rot', page.evaluate("JSON.stringify(window.__next.house().furn[%d])" % f['i']), page.evaluate("document.querySelector('#toast').textContent"))
        # 引きずる（マウス）
        if f['free']:
            f2 = page.evaluate("""(()=>{const n=window.__next,W=n.E.W,h=n.house(),i=%d; const cs=W.furnCells(h.furn[i]); const V=n.v.camera.position.constructor; const sc=n.toScreen(new V(cs[0][0]+0.5,h.z+0.45,cs[0][1]+0.5)); return {x:sc.x,y:sc.y,cells:cs}})()""" % f['i'])
            # 置ける場所：頭のマスごと動かす先
            dest = page.evaluate("""(()=>{const n=window.__next,W=n.E.W,h=n.house(),i=%d,f=h.furn[i]; for (const k in h.cells){const [x,y]=k.split(',').map(Number); if (x===f.x&&y===f.y) continue; const g={...f,x,y}; if(!W.furnProblem(h,g,i)){const V=n.v.camera.position.constructor; const s=n.toScreen(new V(x+0.5,h.z,y+0.5)); if (s.x>20&&s.y>90&&s.y<%d) return {x,y,sx:s.x,sy:s.y};}} return null})()""" % (f['i'], H - 160))
            print('drag dest', dest)
            if dest:
                if PHONE:
                    cdp = ctx.new_cdp_session(page)
                    def tp(t, x, y): cdp.send('Input.dispatchTouchEvent', {'type': t, 'touchPoints': [] if t == 'touchEnd' else [{'x': x, 'y': y, 'id': 1}]})
                    tp('touchStart', f2['x'], f2['y'])
                    for k in range(1, 13): tp('touchMove', f2['x'] + (dest['sx'] - f2['x']) * k / 12, f2['y'] + (dest['sy'] - f2['y']) * k / 12); page.wait_for_timeout(30)
                    page.wait_for_timeout(300); shot(page, 'p5drag', 300); tp('touchEnd', 0, 0); page.wait_for_timeout(600)
                else:
                    page.mouse.move(f2['x'], f2['y']); page.mouse.down(); page.mouse.move((f2['x'] + dest['sx']) / 2, (f2['y'] + dest['sy']) / 2, steps=5); page.mouse.move(dest['sx'], dest['sy'], steps=8)
                    page.wait_for_timeout(300); shot(page, 'p5drag', 300)
                    page.mouse.up(); page.wait_for_timeout(600)
                print('camera moved?', page.evaluate("window.__next.v.camera.position.toArray().map(x=>x.toFixed(2)).join(',')"))
                print('after drag', page.evaluate("JSON.stringify(window.__next.house().furn[%d])" % f['i']), page.evaluate("document.querySelector('#toast').textContent"))
                shot(page, 'p6dropped')
        # 壁を下げたまま壁を押す
        print('ERRS', errs[:8])
finally:
    srv.terminate()
