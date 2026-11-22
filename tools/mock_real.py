"""テスト用：実在の土地のデータ（標高タイルと気象）を、決まった形の作り物で返す。
ブラウザの通信を横取りして、取ってくる・読む・当てはめる、の流れ全体を確かめるため。"""
import io, json, math, re, datetime
from PIL import Image

LAT0, LON0 = 6.27269, -75.66148
M = 111320.0

def elev(lat, lon):   # 東へ25%で上る斜面に、南北方向のゆるい尾根
    ex = (lon - LON0) * M * math.cos(math.radians(LAT0)); ny = (lat - LAT0) * M
    return 1950 + 0.25 * ex + 6 * math.cos(ny / 40)

def tile_png(z, x, y):
    n = 2 ** z; im = Image.new('RGB', (256, 256)); px = im.load()
    for j in range(256):
        lat = math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * (y * 256 + j + 0.5) / (256 * n)))))
        for i in range(256):
            lon = (x * 256 + i + 0.5) / (256 * n) * 360 - 180
            v = elev(lat, lon) + 32768
            r = int(v // 256); g = int(v) % 256; b = int((v - math.floor(v)) * 256)
            px[i, j] = (r, g, b)
    buf = io.BytesIO(); im.save(buf, 'PNG'); return buf.getvalue()

def climate_json():
    t, d0 = [], datetime.date(2014, 1, 1)
    while d0 <= datetime.date(2023, 12, 31): t.append(d0.isoformat()); d0 += datetime.timedelta(days=1)
    m = [int(s[5:7]) for s in t]
    return json.dumps({'daily': {'time': t,
        'temperature_2m_mean': [18.5 + 0.1 * k for k in m], 'temperature_2m_max': [24.0 + 0.1 * k for k in m], 'temperature_2m_min': [14.0 for k in m],
        'precipitation_sum': [6.0 if (i % 2 == 0) else 0.0 for i, _ in enumerate(t)], 'sunshine_duration': [5 * 3600.0 for _ in t]}})

def install(page):
    cache = {}
    def tiles(route):
        mt = re.search(r'/terrarium/(\d+)/(\d+)/(\d+)\.png', route.request.url)
        key = mt.groups()
        if key not in cache: cache[key] = tile_png(*map(int, key))
        route.fulfill(status=200, body=cache[key], headers={'Content-Type': 'image/png', 'Access-Control-Allow-Origin': '*'})
    clim = climate_json()
    page.route('**/elevation-tiles-prod/terrarium/**', tiles)
    page.route('**/archive-api.open-meteo.com/**', lambda r: r.fulfill(status=200, body=clim, headers={'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*'}))

def block(page):   # 実データを取れないとき（仮の地形にもどる道）を試す
    page.route('**/elevation-tiles-prod/**', lambda r: r.abort())
    page.route('**/archive-api.open-meteo.com/**', lambda r: r.abort())
