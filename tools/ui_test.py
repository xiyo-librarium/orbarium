"""ブラウザで一周遊ぶ自動テスト（キューブの世界）。
使い方: python3 tools/ui_test.py [出力フォルダ=/tmp/orb_shots]"""
import sys, os, subprocess, time, json
from playwright.sync_api import sync_playwright

OUT = sys.argv[1] if len(sys.argv) > 1 else '/tmp/orb_shots'
os.makedirs(OUT, exist_ok=True)
ROOT = os.path.join(os.path.dirname(__file__), '..', 'public')
srv = subprocess.Popen([sys.executable, '-m', 'http.server', '8765', '-d', ROOT], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
problems = []

FLAT = """(n)=>{const {G,E}=window.__orb;const w=G.s.world;for(let y=4;y<44;y++)for(let x=4;x<44;x++){const L=E.W.levelInfo(w,{x0:x,y0:y,x1:x+n-1,y1:y+n-1});if(L.flat)return [x,y];}return null}"""
def iso_click(page, x, y, z):
    pt = page.evaluate("([x,y,z])=>window.__orb.G.view.screenOf(x,y,z)", [x, y, z])
    page.mouse.click(pt[0], pt[1]); page.wait_for_timeout(60)
def top(page, x, y):
    return page.evaluate("([x,y])=>window.__orb.E.W.h(window.__orb.G.s.world,x,y)", [x, y])
def blocks(page):
    return page.evaluate("()=>{const b=window.__orb.G.s.world.blocks;const c={};for(const k in b){c[b[k].t]=(c[b[k].t]||0)+1}return c}")
def overflow(page, tag):
    w = page.evaluate("()=>[document.documentElement.scrollWidth, window.innerWidth]")
    if w[0] > w[1] + 1: problems.append(f'{tag}: 横はみ出し {w[0]} > {w[1]}')

def run(viewport, tag):
    with sync_playwright() as p:
        b = p.chromium.launch(); page = b.new_page(viewport=viewport); errs = []
        page.on('console', lambda m: errs.append(m.text) if m.type == 'error' and 'Failed to load resource' not in m.text else None)
        page.on('pageerror', lambda e: errs.append(str(e)))
        page.goto('http://localhost:8765/index.html'); page.wait_for_timeout(700)
        page.screenshot(path=f'{OUT}/{tag}_1_title.png')
        page.click('#new'); page.wait_for_timeout(1200); page.click('#skip'); page.wait_for_timeout(300)
        page.screenshot(path=f'{OUT}/{tag}_2_prologue.png'); overflow(page, tag + ' prologue')
        page.click('#skip'); page.click('#go'); page.wait_for_timeout(300); page.click('#skip'); page.wait_for_timeout(400)
        page.screenshot(path=f'{OUT}/{tag}_3_game.png'); overflow(page, tag + ' game')
        if page.locator('[data-cat]').count() != 3: problems.append(f'{tag}: 地図のボタンが3つでない')
        hs = page.evaluate("()=>{const h=window.__orb.G.s.world.house;return h?{z:h.z,cells:Object.keys(h.cells),walls:Object.keys(h.walls)}:null}")
        if not hs: problems.append(f'{tag}: 最初のコンテナがない'); b.close(); return
        # 家の画面
        page.click('[data-cat="house"]'); page.wait_for_timeout(400)
        page.screenshot(path=f'{OUT}/{tag}_4_house.png'); overflow(page, tag + ' house')
        if page.locator('.iso-mini').count() != 1: problems.append(f'{tag}: 小さな地図がない')
        page.click('[data-mode="hire"]')
        # 鋼板の壁を断熱壁に（北面の1枚）
        cells = [list(map(int, k.split(','))) for k in hs['cells']]
        x0 = min(c[0] for c in cells); y0 = min(c[1] for c in cells); x1 = max(c[0] for c in cells); y1 = max(c[1] for c in cells)
        page.click('[data-panel="ins"]')
        def edge_click(ex, ey, horiz):
            pt = page.evaluate("([x,y,z])=>window.__orb.G.view.screenOf(x,y,z)", [ex + (0.5 if horiz else 0), ey + (0 if horiz else 0.5), hs['z'] + 1.3])
            page.mouse.click(pt[0], pt[1]); page.wait_for_timeout(60)
        # 見えている面（南と東）を押す
        edge_click(x0 + 2, y1 + 1, True)
        edge_click(x1 + 1, y0, False)
        n_ins = page.evaluate("()=>Object.values(window.__orb.G.s.world.house.walls).filter(w=>w.t==='ins').length")
        if n_ins < 1: problems.append(f'{tag}: 壁を断熱壁に替えられない {page.inner_text("#isoside")[:160]}')
        # 床を広げる：南どなり2マス
        page.click('[data-tool="grow"]')
        for dx in (0, 1, 2):
            tx, ty = x0 + dx, y1 + 1
            iso_click(page, tx + 0.5, ty + 0.5, top(page, tx, ty))
        n_cells = page.evaluate("()=>Object.keys(window.__orb.G.s.world.house.cells).length")
        if n_cells <= len(cells): problems.append(f'{tag}: 床が広がらない {n_cells} {page.inner_text("#isoside")[:200]}')
        page.screenshot(path=f'{OUT}/{tag}_5_house_grown.png')
        page.click('[data-showroof]'); page.wait_for_timeout(100)
        page.screenshot(path=f'{OUT}/{tag}_5b_noroof.png')
        page.click('[data-nav="rr"]'); page.wait_for_timeout(450)
        page.screenshot(path=f'{OUT}/{tag}_6_rotated.png')
        page.click('#isox'); page.wait_for_timeout(300)
        # その他：家の東どなりにタンク
        page.click('[data-cat="other"]'); page.wait_for_timeout(100)
        page.evaluate("([x,y])=>window.__orb.open3D(x,y,'other')", [x1 + 1, y0]); page.wait_for_timeout(300)
        page.click('[data-mode="hire"]'); page.click('[data-tool="tank"]')
        tx, ty = x1 + 1, y0
        iso_click(page, tx + 0.5, ty + 0.5, top(page, tx, ty))
        page.screenshot(path=f'{OUT}/{tag}_6b_other.png'); overflow(page, tag + ' other')
        page.click('#isox'); page.wait_for_timeout(200)
        # 畑：家の南、少し離れたところ
        page.click('[data-cat="farm"]'); page.wait_for_timeout(100)
        page.evaluate("([x,y])=>window.__orb.open3D(x,y,'farm')", [x0 + 2, y1 + 6]); page.wait_for_timeout(300)
        page.click('[data-mode="hire"]'); page.click('[data-tool="beds"]')
        iso_click(page, x0 + 0.5, y1 + 4.5, top(page, x0, y1 + 4)); iso_click(page, x0 + 4.5, y1 + 7.5, top(page, x0 + 4, y1 + 7)); page.wait_for_timeout(150)
        page.screenshot(path=f'{OUT}/{tag}_6c_farm.png')
        page.click('#isox'); page.wait_for_timeout(300)
        c = blocks(page)
        if c.get('tank', 0) < 1: problems.append(f'{tag}: タンクが置けない {c}')
        if c.get('bed', 0) < 8: problems.append(f'{tag}: 畑が広がらない {c}')
        fed = page.evaluate("()=>window.__orb.E.summarize(window.__orb.G.s).A.fedTanks")
        if fed < 1: problems.append(f'{tag}: 家の隣のタンクに雨が入らない')
        page.screenshot(path=f'{OUT}/{tag}_7_map.png')
        page.click('[data-tab="plan"]'); page.click('[data-cell="0,3"]'); page.click('[data-cell="0,3"]')
        for i in range(6):
            page.click('#close'); page.wait_for_timeout(600)
            if i in (0, 5): page.screenshot(path=f'{OUT}/{tag}_8_wake_{i}.png'); overflow(page, f'{tag} wake{i}')
            page.click('#back'); page.wait_for_timeout(150)
        page.click('[data-tab="web"]'); page.wait_for_timeout(100)
        page.screenshot(path=f'{OUT}/{tag}_9_cycles.png', full_page=True)
        st = page.evaluate("()=>{const {G,E}=window.__orb;const S=E.summarize(G.s);return {house:!!S.house,pending:S.pending,diag:S.diag.map(d=>d.text)}}")
        if not st['house']: problems.append(f'{tag}: 1年半たっても家になっていない {st}')
        if errs: problems.extend([f'{tag}: {e}' for e in errs])
        b.close()

try:
    run({'width': 1440, 'height': 900}, 'desk')
    run({'width': 390, 'height': 844}, 'phone')
finally:
    srv.terminate()
print(json.dumps({'problems': problems, 'shots': OUT}, ensure_ascii=False, indent=1))
sys.exit(1 if problems else 0)
