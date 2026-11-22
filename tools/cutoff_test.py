"""ボタンの見切れを点検する。いろいろな画面サイズ × 主な画面で、
ボタンが画面や親要素の枠からはみ出して一部しか見えていないものを探す。
使い方: python3 tools/cutoff_test.py [出力フォルダ]"""
import sys, os, subprocess, time, json
from playwright.sync_api import sync_playwright
import os as _os, sys as _sys
_sys.path.insert(0, _os.path.dirname(__file__))
import mock_real
OUT = sys.argv[1] if len(sys.argv) > 1 else '/tmp/orb_cut'
os.makedirs(OUT, exist_ok=True)
ROOT = os.path.join(os.path.dirname(__file__), '..', 'public')
srv = subprocess.Popen([sys.executable, '-m', 'http.server', '8767', '-d', ROOT], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
SIZES = [(1288, 686), (1440, 900), (1280, 680), (1024, 640), (1366, 768), (820, 1180), (390, 844), (360, 640), (844, 390)]
CHECK = r"""() => {
  const out = [];
  const docScrollY = document.scrollingElement.scrollHeight > innerHeight + 1;
  for (const b of document.querySelectorAll('button, a.btn, .cell')) {
    if (b.closest('.list') || b.closest('.iso-side') || b.closest('.panel')) continue;   // 図鑑の一覧はスクロールで見る前提
    const r = b.getBoundingClientRect(); if (!r.width || !r.height || getComputedStyle(b).visibility === 'hidden') continue;
    let L = 0, T = 0, R = innerWidth, B = innerHeight, scrollable = false;
    if (docScrollY) { T = -1e9; B = 1e9; }
    for (let p = b.parentElement; p; p = p.parentElement) {
      const cs = getComputedStyle(p);
      if (/(hidden|auto|scroll|clip)/.test(cs.overflow + cs.overflowX + cs.overflowY)) {
        const q = p.getBoundingClientRect();
        const sx = p.scrollWidth > p.clientWidth + 1 && /(auto|scroll)/.test(cs.overflowX);
        const sy = p.scrollHeight > p.clientHeight + 1 && /(auto|scroll)/.test(cs.overflowY);
        if (sx || sy) scrollable = true;
        L = Math.max(L, q.left); T = Math.max(T, q.top); R = Math.min(R, q.right); B = Math.min(B, q.bottom);
      }
    }
    const w = Math.max(0, Math.min(r.right, R) - Math.max(r.left, L)), h = Math.max(0, Math.min(r.bottom, B) - Math.max(r.top, T));
    const f = (w * h) / (r.width * r.height);
    if (b.scrollWidth > b.clientWidth + 2 || b.scrollHeight > b.clientHeight + 2) out.push({ t: '文字がはみ出す: ' + (b.textContent || '').trim().slice(0, 20), f: 0.5, scrollable: false });
    if (f < 0.98) out.push({ t: (b.textContent || b.getAttribute('aria-label') || '').trim().slice(0, 24), f: +f.toFixed(2), scrollable });
  }
  return out;
}"""
report = {}
def snap(page, tag, state):
    res = page.evaluate(CHECK)
    bad = [x for x in res if 0 < x['f'] < 0.98 or (x['f'] == 0 and not x['scrollable'])]
    if bad: report[f'{tag} {state}'] = bad; page.screenshot(path=f'{OUT}/{tag}_{state}.png')
def click(page, sel, tag):
    try: page.click(sel, timeout=2500)
    except Exception:
        report.setdefault(f'{tag} 押せない', []).append(sel)
        page.evaluate("(s)=>document.querySelector(s)?.click()", sel)
def mc(page, x, y):
    pt = page.evaluate("""([x,y])=>{const s=document.getElementById('map');const p=s.createSVGPoint();p.x=x;p.y=y;const q=p.matrixTransform(s.getScreenCTM());return [q.x,q.y]}""", [x, y])
    page.mouse.click(pt[0], pt[1])
with sync_playwright() as p:
    b = p.chromium.launch()
    for (W, H) in SIZES:
        tag = f'{W}x{H}'
        pg = b.new_page(viewport={'width': W, 'height': H})
        mock_real.install(pg)
        pg.goto('http://localhost:8767/index.html'); pg.wait_for_timeout(400)
        snap(pg, tag, 'title')
        click(pg, '#new', tag); pg.wait_for_timeout(600); snap(pg, tag, 'trip')
        click(pg, '#skip', tag); pg.wait_for_timeout(500)
        snap(pg, tag, 'game0')
        pg.evaluate("()=>{const {G}=window.__orb;G.s.known=['house','tank','garden','heap','toilet','grey','saving','catch','mulch','terrace','offgrid','deep','hedge','chicken','pond','insulation','greenhouse'];G.s.flags.done_med=1;G.s.cash=900;}")
        for cat in [None, 'house', 'farm', 'water', 'gear', 'land']:
            pg.evaluate("(c)=>{const h=window.__orb.G.s.world.house;const k=Object.keys(h.cells)[0].split(',').map(Number);window.__orb.open3D(k[0],k[1],c)}", cat); pg.wait_for_timeout(200); snap(pg, tag, 'iso_' + str(cat)); click(pg, '#isox', tag); pg.wait_for_timeout(150)
        for t in ['book', 'plan', 'sky', 'note', 'web']:
            click(pg, f'[data-tab="{t}"]', tag); pg.wait_for_timeout(60); snap(pg, tag, 'tab_' + t)
        click(pg, '#close', tag); pg.wait_for_timeout(700); snap(pg, tag, 'wake')
        click(pg, '#back', tag); pg.wait_for_timeout(150)
        click(pg, '#menu', tag); pg.wait_for_timeout(100); snap(pg, tag, 'menu')
        click(pg, '[data-m="next"]', tag); pg.wait_for_timeout(100); snap(pg, tag, 'choose')
        click(pg, '[data-m="close"]', tag); pg.wait_for_timeout(100)
        click(pg, '#menu', tag); click(pg, '[data-m="atlas"]', tag); pg.wait_for_timeout(500); snap(pg, tag, 'atlas')
        click(pg, '[data-a="qanat"]', tag); pg.wait_for_timeout(300); snap(pg, tag, 'atlas_card')
        pg.close()
    b.close()
srv.terminate()
print(json.dumps(report, ensure_ascii=False, indent=1))
sys.exit(1 if report else 0)
