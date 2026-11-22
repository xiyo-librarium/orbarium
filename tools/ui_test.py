"""ブラウザで一周遊ぶ自動テスト。
使い方: python3 tools/ui_test.py [出力フォルダ=/tmp/orb_shots]
- コンソールのエラー、横はみ出し、主要な画面のスクリーンショットを集める。"""
import sys, os, subprocess, time, json
from playwright.sync_api import sync_playwright

OUT = sys.argv[1] if len(sys.argv) > 1 else '/tmp/orb_shots'
os.makedirs(OUT, exist_ok=True)
ROOT = os.path.join(os.path.dirname(__file__), '..', 'public')
srv = subprocess.Popen([sys.executable, '-m', 'http.server', '8765', '-d', ROOT], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
problems = []

def map_click(page, x, y):
    pt = page.evaluate("""([x,y])=>{const s=document.getElementById('map');const p=s.createSVGPoint();p.x=x;p.y=y;const q=p.matrixTransform(s.getScreenCTM());return [q.x,q.y]}""", [x, y])
    page.mouse.move(pt[0], pt[1]); page.mouse.down(); page.mouse.up()

def map_drag(page, x0, y0, x1, y1):
    a = page.evaluate("""([x,y])=>{const s=document.getElementById('map');const p=s.createSVGPoint();p.x=x;p.y=y;const q=p.matrixTransform(s.getScreenCTM());return [q.x,q.y]}""", [x0, y0])
    b = page.evaluate("""([x,y])=>{const s=document.getElementById('map');const p=s.createSVGPoint();p.x=x;p.y=y;const q=p.matrixTransform(s.getScreenCTM());return [q.x,q.y]}""", [x1, y1])
    page.mouse.move(*a); page.mouse.down(); page.mouse.move((a[0]+b[0])/2, (a[1]+b[1])/2); page.mouse.move(*b); page.mouse.up()

def overflow(page, tag):
    w = page.evaluate("()=>[document.documentElement.scrollWidth, window.innerWidth]")
    if w[0] > w[1] + 1: problems.append(f'{tag}: 横はみ出し {w[0]} > {w[1]}')

def run(viewport, tag):
    with sync_playwright() as p:
        b = p.chromium.launch()
        page = b.new_page(viewport=viewport)
        errs = []
        page.on('console', lambda m: errs.append(m.text) if m.type == 'error' and 'fonts.g' not in m.text and 'Failed to load resource' not in m.text else None)
        page.on('pageerror', lambda e: errs.append(str(e)))
        page.goto('http://localhost:8765/index.html'); page.wait_for_timeout(800)
        page.screenshot(path=f'{OUT}/{tag}_1_title.png'); overflow(page, tag + ' title')
        page.click('#new'); page.wait_for_timeout(300)
        page.screenshot(path=f'{OUT}/{tag}_2_prologue.png'); overflow(page, tag + ' prologue')
        for _ in range(6): page.click('#next'); page.wait_for_timeout(80)
        page.screenshot(path=f'{OUT}/{tag}_3_invite.png')
        page.click('#go'); page.wait_for_timeout(1800)
        page.screenshot(path=f'{OUT}/{tag}_4_travel.png')
        page.click('#skip'); page.wait_for_timeout(500)
        page.screenshot(path=f'{OUT}/{tag}_5_game_start.png'); overflow(page, tag + ' game')
        # 家（ツールは最初から家）
        map_click(page, 30, 20); page.wait_for_timeout(200)
        map_click(page, 40, 14); page.wait_for_timeout(200)   # タンク
        map_drag(page, 14, 28, 27, 38); page.wait_for_timeout(200)   # 畑
        page.screenshot(path=f'{OUT}/{tag}_6_built.png')
        st = page.evaluate("()=>JSON.parse(localStorage.getItem('orbarium-v1'))")
        kinds = [x['type'] for x in st['items']]
        for k in ['house', 'tank', 'garden']:
            if k not in kinds: problems.append(f'{tag}: {k} が置けていない（{kinds}）')
        for t in ['web', 'book', 'plan', 'sky', 'note']:
            page.click(f'[data-tab="{t}"]'); page.wait_for_timeout(100)
            page.screenshot(path=f'{OUT}/{tag}_7_tab_{t}.png')
        page.click('[data-tab="plan"]'); page.click('[data-cell="0,4"]')   # 金曜を畑へ
        for i in range(8):
            page.click('#close'); page.wait_for_timeout(700)
            if i in (0, 3, 7): page.screenshot(path=f'{OUT}/{tag}_8_wake_{i}.png'); overflow(page, f'{tag} wake{i}')
            page.click('#back'); page.wait_for_timeout(200)
        page.click('[data-tab="web"]'); page.wait_for_timeout(100)
        page.screenshot(path=f'{OUT}/{tag}_9_after2y.png', full_page=True)
        page.click('[data-tab="note"]'); page.wait_for_timeout(100)
        page.screenshot(path=f'{OUT}/{tag}_9_notes.png')
        # 図鑑
        page.click('#menu'); page.click('[data-m="atlas"]'); page.wait_for_timeout(600)
        page.click('[data-a="andenes"]'); page.wait_for_timeout(1000)
        page.screenshot(path=f'{OUT}/{tag}_10_atlas.png')
        page.click('#read'); page.click('#aback'); page.wait_for_timeout(300)
        page.screenshot(path=f'{OUT}/{tag}_11_back.png')
        if errs: problems.extend([f'{tag}: {e}' for e in errs])
        b.close()

try:
    run({'width': 1440, 'height': 900}, 'desk')
    run({'width': 390, 'height': 844}, 'phone')
finally:
    srv.terminate()
print(json.dumps({'problems': problems, 'shots': OUT}, ensure_ascii=False, indent=1))
sys.exit(1 if problems else 0)
