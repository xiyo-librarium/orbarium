"""ブラウザで一周遊ぶ自動テスト（キューブの世界）。
使い方: python3 tools/ui_test.py [出力フォルダ=/tmp/orb_shots]"""
import sys, os, subprocess, time, json
from playwright.sync_api import sync_playwright
sys.path.insert(0, os.path.dirname(__file__))
import math
import mock_real

OUT = sys.argv[1] if len(sys.argv) > 1 else '/tmp/orb_shots'
os.makedirs(OUT, exist_ok=True)
ROOT = os.path.join(os.path.dirname(__file__), '..', 'public')
srv = subprocess.Popen([sys.executable, '-m', 'http.server', '8765', '-d', ROOT], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
problems = []

FLAT = """(n)=>{const {G,E}=window.__orb;const w=G.s.world;for(let y=4;y<44;y++)for(let x=4;x<44;x++){const L=E.W.levelInfo(w,{x0:x,y0:y,x1:x+n-1,y1:y+n-1});if(L.flat)return [x,y];}return null}"""
# 家のとなりで、画面で見えている地面の上面の位置（'grow'：床を足せる段、'tank'：タンクを置ける所）
VIS_ADJ = """(mode)=>{const {G,E}=window.__orb;const w=G.s.world,hs=w.house;
  for(const k in hs.cells){const [cx,cy]=k.split(',').map(Number);for(const [dx,dy] of [[1,0],[0,1],[-1,0],[0,-1]]){const x=cx+dx,y=cy+dy;if(hs.cells[x+','+y])continue;
    const z=E.W.h(w,x,y);
    if(mode==='grow'&&Math.abs(z-hs.z)>1)continue;
    if(mode==='tank'&&(z>=hs.z+3||E.W.canPut(w,x,y,z,'tank')))continue;
    const p=G.view.screenOf(x+0.5,y+0.5,z);const f=G.view.pickAt(p[0],p[1]);
    if(f&&f.type==='terrain'&&f.x===x&&f.y===y&&f.face===4)return p;}}return null}"""
def map_click(page, x, y):
    r = page.evaluate("()=>{const c=document.querySelector('#map2d').getBoundingClientRect();return [c.left,c.top,c.width]}")
    c = (r[2] - 36) / 50
    page.mouse.click(r[0] + 18 + (x + 0.5) * c, r[1] + 18 + (y + 0.5) * c); page.wait_for_timeout(400)
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
        if tag == 'phone': mock_real.block(page)   # スマホでは実データが取れない場合（仮の地形）を通す
        else: mock_real.install(page)
        page.goto('http://localhost:8765/index.html'); page.wait_for_timeout(700)
        page.screenshot(path=f'{OUT}/{tag}_1_title.png')
        page.click('#new'); page.wait_for_timeout(1500)
        page.screenshot(path=f'{OUT}/{tag}_2_trip.png'); overflow(page, tag + ' trip')
        if page.locator('.mailcard.trip').count() != 1: problems.append(f'{tag}: 移動中に友人のメールが出ない')
        page.click('#skip'); page.wait_for_timeout(600)
        if page.locator('#moveplot').count(): problems.append(f'{tag}: 無料の土地なのに場所を変えられる')
        page.screenshot(path=f'{OUT}/{tag}_3_game.png'); overflow(page, tag + ' game')
        if page.locator('.tools [data-cat]').count(): problems.append(f'{tag}: 地図に家・畑・その他のボタンが残っている')
        rinfo = page.evaluate("()=>{const {G,E}=window.__orb;const S=E.SITES[G.s.site],w=G.s.world,v=w.veg||[];const cnt={};v.forEach(c=>cnt[c]=(cnt[c]||0)+1);return {real:!!G.s.real,base:w.base,t0:S.tmean[0],rain0:S.rain[0],lat:S.lat,lon:S.lon,house:!!w.house,pick:G.s.real&&G.s.real.pick,veg:cnt,src:G.s.real&&G.s.real.src}}")
        if tag == 'phone':
            if rinfo['real']: problems.append(f'{tag}: 通信を止めたのに実データ扱いになっている')
        else:
            exp = mock_real.elev(rinfo['lat'], rinfo['lon']) - 6.25 - 6 if rinfo['real'] else 0
            if not rinfo['real'] or abs(rinfo['t0'] - 18.6) > 0.05 or abs(rinfo['base'] - exp) > 8 or not (85 <= rinfo['rain0'] <= 100): problems.append(f'{tag}: 実データが当てはまっていない {rinfo}')
            # 区画：集落（半径70m）・道（東100m）・家からはなれた、空いた50m四方になっているか
            pk = rinfo['pick'] or {}
            e, n = mock_real.en(rinfo['lat'], rinfo['lon'])
            near_house = any(abs(e - he) < 25 + 12 + 5 and abs(n - hn) < 25 + 12 + 4 for he, hn in mock_real.HOUSES)
            if not pk.get('clear') or pk.get('moved', 0) < 95 or math.hypot(e, n) < 70 + 25 or abs(e - 100) < 25 or near_house or 'WorldCover' not in pk.get('checked', []) or 'OpenStreetMap' not in pk.get('checked', []):
                problems.append(f'{tag}: 空いた区画を選べていない pick={pk} e={e:.0f} n={n:.0f}')
            if not rinfo['veg'] or sum(rinfo['veg'].values()) != 2500 or rinfo['veg'].get('50', 0) > 0: problems.append(f'{tag}: 植生がおかしい {rinfo["veg"]}')
            if not (rinfo['src'] or {}).get('lc') or not (rinfo['src'] or {}).get('osm'): problems.append(f'{tag}: 出典が入っていない')
            print(tag, 'pick', pk, 'veg', rinfo['veg'])
        if not rinfo['house']: problems.append(f'{tag}: 実際の斜面に最初の家が置けていない')
        if page.locator('.where a').count() != 1: problems.append(f'{tag}: 場所のリンクがない')
        hs = page.evaluate("()=>{const h=window.__orb.G.s.world.house;return h?{z:h.z,cells:Object.keys(h.cells)}:null}")
        if not hs: problems.append(f'{tag}: 最初のコンテナがない'); b.close(); return
        # 家の設計：設計図をいじっても家は変わらず、［建てる］で払って建つ
        hs0 = page.evaluate("()=>window.__orb.G.s.world.house.furn.map(f=>f.t)")
        if sorted(hs0) != ['bed', 'shower', 'table', 'toilet']: problems.append(f'{tag}: 最初の家具がそろっていない {hs0}')
        c0 = list(map(int, hs['cells'][0].split(',')))
        map_click(page, c0[0], c0[1])
        page.screenshot(path=f'{OUT}/{tag}_4_house.png'); overflow(page, tag + ' house')
        for sel in ['.iso-mini', '.iso-views', '.h-tabs', '[data-act="build"]', '.cats']:
            if page.locator(sel).count() < 1: problems.append(f'{tag}: {sel} がない')
        if page.locator('[data-mode]').count(): problems.append(f'{tag}: 自分で作る/頼むの切り替えが残っている')
        cells = [list(map(int, k.split(','))) for k in hs['cells']]
        x0 = min(c[0] for c in cells); y0 = min(c[1] for c in cells); x1 = max(c[0] for c in cells); y1 = max(c[1] for c in cells)
        cash0 = page.evaluate("()=>window.__orb.G.s.cash")
        page.click('[data-view="top"]'); page.wait_for_timeout(150)
        # 家の南を2列なぞる
        pa = page.evaluate("([x,y,z])=>window.__orb.G.view.screenOf(x,y,z)", [x0 + 0.5, y1 + 1.5, hs['z']])
        pb = page.evaluate("([x,y,z])=>window.__orb.G.view.screenOf(x,y,z)", [x1 + 0.5, y1 + 2.5, hs['z']])
        page.mouse.move(pa[0], pa[1]); page.mouse.down(); page.mouse.move((pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2, steps=4); page.mouse.move(pb[0], pb[1], steps=4); page.mouse.up(); page.wait_for_timeout(150)
        st = page.evaluate("()=>{const {G}=window.__orb;return {draft:Object.keys(G.house.draft.cells).length, built:Object.keys(G.s.world.house.cells).length, cash:G.s.cash}}")
        if st['draft'] <= len(cells): problems.append(f'{tag}: なぞっても設計の床が増えない {st} {page.inner_text("#isoside")[:240]}')
        if st['built'] != len(cells) or abs(st['cash'] - cash0) > 1e-6: problems.append(f'{tag}: 設計しただけで家やお金が変わった {st}')
        page.screenshot(path=f'{OUT}/{tag}_5_draft_top.png')
        # 窓：見えている壁を押す
        page.click('[data-tab3="open"]'); page.click('[data-htool="window"]')
        pt = page.evaluate("""()=>{const {G,E}=window.__orb;const d=G.house.draft;
          for(const o of E.W.houseOuterEdges(d)){if(d.open[o.e])continue;const [t,r]=o.e.split(':');const [ex,ey]=r.split(',').map(Number);
            const p=G.view.screenOf(ex+(t==='h'?0.5:0),ey+(t==='h'?0:0.5),d.z+1);const f=G.view.pickAt(p[0],p[1]);if(f&&f.type==='wall'&&f.e===o.e)return p;}return null}""")
        if pt: page.mouse.click(pt[0], pt[1]); page.wait_for_timeout(80)
        nwin = page.evaluate("()=>Object.values(window.__orb.G.house.draft.open).filter(t=>t==='window').length")
        if nwin < 3: problems.append(f'{tag}: 窓を足せない {nwin}')
        # 素材：屋根を草屋根に
        page.click('[data-tab3="mat"]'); page.click('[data-roof="green"]'); page.wait_for_timeout(100)
        if page.evaluate("()=>window.__orb.G.house.draft.roof") != 'green': problems.append(f'{tag}: 屋根の素材を選べない')
        # 家具：テーブルを動かす
        page.click('[data-tab3="furn"]'); page.click('[data-view="down"]'); page.wait_for_timeout(100)
        ti = page.evaluate("()=>window.__orb.G.house.draft.furn.findIndex(f=>f.t==='table')")
        page.click(f'[data-fmove="{ti}"]')
        pt = page.evaluate("""(ti)=>{const {G,E}=window.__orb;const d=G.house.draft;
          for(const k in d.cells){const [x,y]=k.split(',').map(Number);const f={...d.furn[ti],x,y};if(E.W.furnProblem(d,f,ti)||(x===d.furn[ti].x&&y===d.furn[ti].y))continue;
            const p=G.view.screenOf(x+0.5,y+0.5,d.z+0.1);const g=G.view.pickAt(p[0],p[1]);if(g&&(g.type==='floor')&&g.x===x&&g.y===y)return p;}return null}""", ti)
        before = page.evaluate("(ti)=>{const f=window.__orb.G.house.draft.furn[ti];return [f.x,f.y]}", ti)
        if pt: page.mouse.click(pt[0], pt[1]); page.wait_for_timeout(100)
        after = page.evaluate("(ti)=>{const f=window.__orb.G.house.draft.furn[ti];return [f.x,f.y]}", ti)
        if before == after: problems.append(f'{tag}: 家具を動かせない {page.inner_text("#isoside")[:200]}')
        # 回す：その場で（ボタン）と、持ち上げてRキー
        bi = page.evaluate("()=>window.__orb.G.house.draft.furn.findIndex(f=>f.t==='bed')")
        r0 = page.evaluate("(i)=>window.__orb.G.house.draft.furn[i].r||0", bi)
        page.click(f'[data-frotin="{bi}"]'); page.wait_for_timeout(80)
        r1 = page.evaluate("(i)=>window.__orb.G.house.draft.furn[i].r||0", bi)
        if r1 == r0: problems.append(f'{tag}: ベッドをその場で回せない {page.inner_text("#isoside")[:160]}')
        hit = page.evaluate("""(i)=>{const {G,E}=window.__orb;const d=G.house.draft;const f=d.furn[i];
          for(const [x,y] of E.W.furnCells(f)){for(const zz of [0.45,0.5,0.35]){const p=G.view.screenOf(x+0.5,y+0.5,d.z+zz);const g=G.view.pickAt(p[0],p[1]);if(g&&g.type==='furn'&&g.i===i)return p;}}return null}""", bi)
        if hit:
            page.mouse.click(hit[0], hit[1]); page.wait_for_timeout(80)
            if page.evaluate("()=>window.__orb.G.build.sel") != bi: problems.append(f'{tag}: 3Dで家具を押しても持ち上がらない')
            page.keyboard.press('r'); page.wait_for_timeout(60)
            spot = page.evaluate("""(i)=>{const {G,E}=window.__orb;const d=G.house.draft,st=G.build;
              for(const k in d.cells){const [x,y]=k.split(',').map(Number);const f={...d.furn[i],x,y,r:st.selR};if(E.W.furnProblem(d,f,i))continue;
                const p=G.view.screenOf(x+0.5,y+0.5,d.z+0.1);const g=G.view.pickAt(p[0],p[1]);if(g&&(g.type==='floor'||(g.type==='furn'&&g.i===i))&&g.x===x&&g.y===y)return [p,st.selR];}return null}""", bi)
            if spot:
                page.mouse.click(spot[0][0], spot[0][1]); page.wait_for_timeout(80)
                r2 = page.evaluate("(i)=>window.__orb.G.house.draft.furn[i].r||0", bi)
                if r2 != spot[1] or page.evaluate("()=>window.__orb.G.build.sel") != -1: problems.append(f'{tag}: 持ち上げて回して置けない r={r2} want={spot[1]}')
            else: problems.append(f'{tag}: 回したベッドを置ける場所が見つからない')
        else: problems.append(f'{tag}: 3Dでベッドを押せる場所がない')
        page.screenshot(path=f'{OUT}/{tag}_5a_furn.png')
        page.click('[data-view="up"]'); page.wait_for_timeout(150)
        page.screenshot(path=f'{OUT}/{tag}_5b_preview.png')
        page.click('[data-act="build"]'); page.wait_for_timeout(200)
        st2 = page.evaluate("()=>{const {G}=window.__orb;return {built:Object.keys(G.s.world.house.cells).length, roof:G.s.world.house.roof, cash:G.s.cash}}")
        if st2['built'] <= len(cells) or st2['roof'] != 'green' or st2['cash'] >= cash0: problems.append(f'{tag}: 建てられない {st2} {page.inner_text("#isoside")[-300:]}')
        page.screenshot(path=f'{OUT}/{tag}_5c_built.png')
        page.click('[data-view="cut"]'); page.click('[data-nav="rr"]'); page.wait_for_timeout(450)
        page.screenshot(path=f'{OUT}/{tag}_6_rotated.png')
        page.click('#isox'); page.wait_for_timeout(300)
        if page.locator('.iso3d').count(): problems.append(f'{tag}: 建てた後に閉じられない')
        # 家でない所を押す → 作るものの棚（家・畑・水・小屋と設備・地形）
        map_click(page, x0 - 4, y1 + 2)
        if page.locator('.cats [data-cat]').count() != 5: problems.append(f'{tag}: 拡大した先で作るものを選べない')
        page.click('[data-cat="farm"]'); page.wait_for_timeout(150)
        if page.locator('.tcard').count() < 2: problems.append(f'{tag}: 畑の道具が出ない')
        if page.locator('.tcard:has-text("？")').count(): problems.append(f'{tag}: 覚えていない道具が出ている')
        page.screenshot(path=f'{OUT}/{tag}_5d_menu.png')
        page.click('#isox'); page.wait_for_timeout(200)
        # 水：家の東どなりにタンク（設計図に置く → 頼む）
        page.evaluate("([x,y])=>window.__orb.open3D(x,y,'water')", [x1 + 1, y0]); page.wait_for_timeout(300)
        page.click('[data-tool="tank"]')
        cash1 = page.evaluate("()=>window.__orb.G.s.cash")
        spot = page.evaluate(VIS_ADJ, 'tank')
        if spot: page.mouse.click(spot[0], spot[1]); page.wait_for_timeout(80)
        else: problems.append(f'{tag}: 家のとなりにタンクを置ける見える場所がない')
        if page.evaluate("()=>window.__orb.G.s.cash") != cash1: problems.append(f'{tag}: 設計図に置いただけでお金が減った')
        page.screenshot(path=f'{OUT}/{tag}_6b_other.png'); overflow(page, tag + ' other')
        page.click('#isox'); page.wait_for_timeout(150)
        if page.locator('[data-act="discard"]').count() != 1: problems.append(f'{tag}: 頼んでいない設計があるのに、確かめずに閉じた')
        page.click('[data-act="keep"]'); page.click('[data-act="build"]'); page.wait_for_timeout(150)
        if page.evaluate("()=>window.__orb.G.s.cash") >= cash1: problems.append(f'{tag}: 頼んでもお金が減らない')
        page.click('#isox'); page.wait_for_timeout(200)
        # 畑：家の南、少し離れたところをなぞる → 頼む
        page.evaluate("([x,y])=>window.__orb.open3D(x,y,'farm')", [x0 + 2, y1 + 8]); page.wait_for_timeout(300)
        page.click('[data-tool="beds"]')
        pa = page.evaluate("([x,y,z])=>window.__orb.G.view.screenOf(x,y,z)", [x0 + 0.5, y1 + 6.5, top(page, x0, y1 + 6)])
        pb = page.evaluate("([x,y,z])=>window.__orb.G.view.screenOf(x,y,z)", [x0 + 4.5, y1 + 9.5, top(page, x0 + 4, y1 + 9)])
        page.mouse.move(pa[0], pa[1]); page.mouse.down(); page.mouse.move((pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2, steps=4); page.mouse.move(pb[0], pb[1], steps=4); page.mouse.up(); page.wait_for_timeout(150)
        page.screenshot(path=f'{OUT}/{tag}_6c_farm.png')
        page.click('[data-act="build"]'); page.wait_for_timeout(150)
        page.click('#isox'); page.wait_for_timeout(300)
        if page.locator('.iso3d').count(): problems.append(f'{tag}: 頼んだあとに閉じられない')
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
