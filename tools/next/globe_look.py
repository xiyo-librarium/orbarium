# 地球儀の見た目くらべ（試験中の机の地球儀 ?look=desk）。今の見た目／机・はじめ（glow 0）／途中（0.5）／たくさん（1）と、
# 寄っていく動きのコマ。画像は /tmp/orb_flow/globe_*.png
import os, sys, subprocess, time
from playwright.sync_api import sync_playwright
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..'))
os.makedirs('/tmp/orb_flow', exist_ok=True)
import mock_real
srv = subprocess.Popen([sys.executable, '-m', 'http.server', '8824', '-d', os.path.join(HERE, '..', '..', 'public')], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
U = 'http://localhost:8824'
LIVED = "localStorage.setItem('orbarium-next-carry', JSON.stringify({from:'alen', to:'yama', history:[{site:'med',years:2},{site:'ubud',years:1.5},{site:'alen',years:2}]}))"
try:
    with sync_playwright() as p:
        b = p.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
        def page_of(w, h, dpr=1):
            pg = b.new_context(viewport={'width': w, 'height': h}, device_scale_factor=dpr).new_page()
            pg.errs = []; pg.on('pageerror', lambda e: pg.errs.append('PE ' + str(e))); mock_real.install(pg); return pg
        def ready(pg): pg.wait_for_function('window.__next && window.__next.v && window.__next.v.lastDraw', timeout=120000); pg.wait_for_timeout(1500)
        # 題名の画面：今／机 0・0.5・1
        for name, q in [('now', ''), ('desk0', '&look=desk&glow=0'), ('desk05', '&look=desk&glow=0.5'), ('desk1', '&look=desk&glow=1')]:
            pg = page_of(1440, 860); pg.goto(f'{U}/?x=1{q}'); ready(pg); pg.screenshot(path=f'/tmp/orb_flow/globe_{name}.png'); print(name, pg.errs[:3]); pg.close()
        pg = page_of(390, 844, 2); pg.goto(f'{U}/?x=1&look=desk&glow=0'); ready(pg); pg.screenshot(path='/tmp/orb_flow/globe_desk0_phone.png'); pg.close()
        # 旅：住んだ3つの土地が色づく。寄っていくコマ（今の見た目と机）
        for name, q in [('travel_now', ''), ('travel_desk', '&look=desk&glow=0.6')]:
            # 動きを撮るため、飛ぶ時間を 24 秒にのばす（flyms）。コマは 0.5〜25 秒
            pg = page_of(1440, 860); pg.goto(U + '/?x=1'); pg.evaluate(LIVED); pg.goto(f'{U}/?travel=yama{q}&flyms=24000')
            pg.wait_for_function('window.__next && window.__next.v && window.__next.v.lastDraw', timeout=120000)
            t0 = time.time()
            for i, ms in enumerate([500, 6000, 12000, 15500, 18500, 21500, 24500, 26800]):
                pg.wait_for_timeout(max(0, int(ms - (time.time() - t0) * 1000))); pg.screenshot(path=f'/tmp/orb_flow/globe_{name}_{i}.png')
            print(name, pg.errs[:3]); pg.close()
finally:
    srv.terminate()
