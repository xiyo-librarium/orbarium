"""植生と家の見た目を確かめるスクリーンショット（作り物の実データで）。
使い方: python3 tools/shot_veg.py [出力フォルダ=/tmp/orb_veg]"""
import sys, os, subprocess, time
from playwright.sync_api import sync_playwright
sys.path.insert(0, os.path.dirname(__file__))
import mock_real
OUT = sys.argv[1] if len(sys.argv) > 1 else '/tmp/orb_veg'
os.makedirs(OUT, exist_ok=True)
ROOT = os.path.join(os.path.dirname(__file__), '..', 'public')
srv = subprocess.Popen([sys.executable, '-m', 'http.server', '8766', '-d', ROOT], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
try:
    with sync_playwright() as p:
        b = p.chromium.launch(); page = b.new_page(viewport={'width': 1440, 'height': 900}, device_scale_factor=2); errs = []
        page.on('pageerror', lambda e: errs.append(str(e)))
        page.on('console', lambda m: errs.append(m.text) if m.type == 'error' and 'Failed to load resource' not in m.text else None)
        mock_real.install(page)
        page.goto('http://localhost:8766/index.html'); page.wait_for_timeout(600)
        page.click('#new'); page.wait_for_timeout(800); page.click('#go'); page.wait_for_timeout(200); page.click('#skip'); page.wait_for_timeout(1500); page.click('.modal [data-m="close"]'); page.wait_for_timeout(200)
        page.screenshot(path=f'{OUT}/1_map.png')
        info = page.evaluate("()=>{const {G,E}=window.__orb;const w=G.s.world;let f=null;for(let y=0;y<50&&!f;y++)for(let x=0;x<50;x++)if(w.veg[y*50+x]===10){f=[x,y];break;}const hs=w.house;const k=Object.keys(hs.cells)[0].split(',').map(Number);return {forest:f,house:k,pick:G.s.real.pick}}")
        print(info)
        fx, fy = info['forest']
        page.evaluate("([x,y])=>window.__orb.openBuild(x,y,{cat:null})", [min(49, fx + 6), min(49, fy + 6)]); page.wait_for_timeout(900)
        page.screenshot(path=f'{OUT}/2_forest.png')
        page.evaluate("()=>{const v=window.__orb.G.view;v.top=true;v.draw()}"); page.wait_for_timeout(300)
        page.screenshot(path=f'{OUT}/3_forest_top.png')
        hx, hy = info['house']
        page.click('#isox'); page.wait_for_timeout(500)
        page.evaluate("([x,y])=>window.__orb.openBuild(x,y,{cat:'house'})", [hx, hy]); page.wait_for_timeout(900)
        page.screenshot(path=f'{OUT}/4_house_cut.png')
        page.evaluate("()=>{const v=window.__orb.G.view;v.wallMode='up';v.draw()}"); page.wait_for_timeout(300)
        page.screenshot(path=f'{OUT}/5_house_up.png')
        for k, ang in enumerate([0, 90, 180, 270]):   # 家具の前後が崩れていないか、4方向から近づいて
            page.evaluate("(a)=>{const v=window.__orb.G.view;v.angle=a;v.wallMode='cut';v.zoom=2.4;v.draw()}", ang); page.wait_for_timeout(250)
            page.screenshot(path=f'{OUT}/6_furn_{ang}.png', clip={'x': 300, 'y': 200, 'width': 760, 'height': 560})
        print('errors', errs[:5])
finally:
    srv.terminate()
