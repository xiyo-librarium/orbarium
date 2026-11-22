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
        spot = page.evaluate(FLAT, 6)
        if not spot: problems.append(f'{tag}: 平らな場所がない'); b.close(); return
        x, y = spot
        page.evaluate("([x,y])=>window.__orb.open3D(x,y,'house')", [x + 2, y + 2]); page.wait_for_timeout(400)
        page.screenshot(path=f'{OUT}/{tag}_4_iso.png'); overflow(page, tag + ' iso')
        z = top(page, x, y)
        iso_click(page, x + 0.5, y + 0.5, z); iso_click(page, x + 5.5, y + 5.5, z)
        page.wait_for_timeout(200)
        c = blocks(page)
        if c.get('roof_tin', 0) < 30: problems.append(f'{tag}: 部屋が建たない {c} {page.inner_text("#isoside")[:200]}')
        page.screenshot(path=f'{OUT}/{tag}_5_room.png')
        # 雨水タンク：南の軒の隣、地面の上に
        page.click('[data-cat3="water"]'); page.wait_for_timeout(100); page.click('[data-tool="tank"]'); tz = top(page, x + 2, y + 6)
        iso_click(page, x + 2.5, y + 6.5, tz); page.wait_for_timeout(100)
        # 畑：坂の下に広げる
        page.click('[data-cat3="farm"]'); page.wait_for_timeout(100)
        iso_click(page, x + 0.5, y + 7.5, top(page, x, y + 7)); iso_click(page, x + 5.5, y + 9.5, top(page, x + 5, y + 9)); page.wait_for_timeout(150)
        c = blocks(page)
        if c.get('tank', 0) < 1: problems.append(f'{tag}: タンクが置けない {c}')
        if c.get('bed', 0) < 10: problems.append(f'{tag}: 畑が広がらない {c}')
        page.click('[data-nav="rr"]'); page.wait_for_timeout(450)
        page.screenshot(path=f'{OUT}/{tag}_6_rotated.png')
        side = page.inner_text('#isoside')
        page.click('#isox'); page.wait_for_timeout(300)
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
