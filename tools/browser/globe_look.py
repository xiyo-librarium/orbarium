# 地球儀の見た目：はじめ（glow 0）／途中（0.5）／たくさん（1）と、
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
LIVED = "localStorage.setItem('orbarium-carry', JSON.stringify({from:'alen', to:'yama', history:[{site:'med',years:2},{site:'ubud',years:1.5},{site:'alen',years:2}]}))"
try:
    with sync_playwright() as p:
        b = p.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
        def page_of(w, h, dpr=1):
            pg = b.new_context(viewport={'width': w, 'height': h}, device_scale_factor=dpr).new_page()
            pg.errs = []; pg.on('pageerror', lambda e: pg.errs.append('PE ' + str(e))); mock_real.install(pg); return pg
        def ready(pg): pg.wait_for_function('window.__orb && window.__orb.v && window.__orb.v.lastDraw', timeout=120000); pg.wait_for_timeout(1500)
        # 題名の画面：今／机 0・0.5・1
        for name, q in [('desk0', '&glow=0'), ('desk05', '&glow=0.5'), ('desk1', '&glow=1')]:
            pg = page_of(1440, 860); pg.goto(f'{U}/?x=1{q}'); ready(pg); pg.screenshot(path=f'/tmp/orb_flow/globe_{name}.png'); print(name, pg.errs[:3]); pg.close()
        pg = page_of(390, 844, 2); pg.goto(f'{U}/?x=1&glow=0'); ready(pg); pg.screenshot(path='/tmp/orb_flow/globe_desk0_phone.png'); pg.close()
        # 旅：住んだ3つの土地が色づく。動きを撮るため、飛ぶ時間を 130 秒にのばし（flyms。この環境では1コマ撮るのに数秒かかる）、撮れるだけコマを撮る
        # （/tmp/orb_flow/globe_travel_<名前>_NN.png。ffmpeg があれば 12 コマ/秒の動画 globe_travel_<名前>.mp4 にする＝ほぼ本来の速さ）
        for name, q in [('desk', '&glow=0.6')]:
            pg = page_of(1200, 720); pg.goto(U + '/?x=1'); pg.evaluate(LIVED); pg.goto(f'{U}/?travel=yama{q}&flyms=130000')
            pg.wait_for_function('window.__orb && window.__orb.v && window.__orb.v.lastDraw', timeout=120000)
            t0 = time.time(); i = 0
            while time.time() - t0 < 150 and '?travel' in pg.url:
                try: pg.screenshot(path=f'/tmp/orb_flow/globe_travel_{name}_{i:02d}.png'); i += 1
                except Exception: break
                pg.wait_for_timeout(450)
            print(name, 'frames', i, pg.errs[:3])
            if subprocess.run(['which', 'ffmpeg'], capture_output=True).returncode == 0:
                subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-framerate', '12', '-i', f'/tmp/orb_flow/globe_travel_{name}_%02d.png', '-vf', 'scale=960:-2', '-pix_fmt', 'yuv420p', f'/tmp/orb_flow/globe_travel_{name}.mp4'])
            pg.close()
finally:
    srv.terminate()
