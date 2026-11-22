"""テスト用：実在の土地のデータ（標高タイル・気象・土地の被覆・建物と道）を、決まった形の作り物で返す。
ブラウザの通信を横取りして、取ってくる・読む・区画を選ぶ・当てはめる、の流れ全体を確かめるため。
作り物の土地：もとの地点のまわり半径70mに集落（被覆＝建物）、東100mに南北の道、ところどころ家、北西に林。"""
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

def en(lat, lon):   # もとの地点から東・北へ何m
    return (lon - LON0) * M * math.cos(math.radians(LAT0)), (lat - LAT0) * M

def landcover(lat, lon):
    e, n = en(lat, lon)
    if math.hypot(e, n) < 70: return 50
    if (n > 60 and e < -30) or (e < -118 and n > 2): return 10
    if (int((e + 1000) // 20) + int((n + 1000) // 20)) % 6 == 0: return 20
    if 150 < n < 200 and -60 < e < 0: return 40
    return 30

def lc_png(z, x, y):   # 値がそのまま入った灰色の PNG（Planetary Computer の返し方）
    n = 2 ** z; im = Image.new('L', (256, 256)); px = im.load()
    for j in range(256):
        lat = math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * (y * 256 + j + 0.5) / (256 * n)))))
        for i in range(256):
            lon = (x * 256 + i + 0.5) / (256 * n) * 360 - 180
            px[i, j] = landcover(lat, lon)
    buf = io.BytesIO(); im.save(buf, 'PNG'); return buf.getvalue()

HOUSES = [(150, -150), (-200, 110), (60, 180), (-130, -170)]
def osm_json():
    mx = M * math.cos(math.radians(LAT0))
    ll = lambda e, n: {'lat': LAT0 + n / M, 'lon': LON0 + e / mx}
    els = []
    for k, (e, n) in enumerate(HOUSES):
        els.append({'type': 'way', 'id': 100 + k, 'tags': {'building': 'house'}, 'geometry': [ll(e - 5, n - 4), ll(e + 5, n - 4), ll(e + 5, n + 4), ll(e - 5, n + 4), ll(e - 5, n - 4)]})
    els.append({'type': 'way', 'id': 200, 'tags': {'highway': 'unclassified'}, 'geometry': [ll(100, -340), ll(100, 0), ll(104, 340)]})
    els.append({'type': 'way', 'id': 201, 'tags': {'highway': 'path'}, 'geometry': [ll(-300, -20), ll(300, -40)]})
    return json.dumps({'elements': els})

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
    cors = {'Access-Control-Allow-Origin': '*'}
    page.route('**/api/stac/v1/search**', lambda r: r.fulfill(status=200, body=json.dumps({'features': [{'id': 'ESA_WorldCover_10m_2021_v200_N06W078'}]}), headers={'Content-Type': 'application/json', **cors}))
    lcache = {}
    def lct(route):
        mt = re.search(r'/WebMercatorQuad/(\d+)/(\d+)/(\d+)@', route.request.url); key = mt.groups()
        if key not in lcache: lcache[key] = lc_png(*map(int, key))
        route.fulfill(status=200, body=lcache[key], headers={'Content-Type': 'image/png', **cors})
    page.route('**/api/data/v1/item/tiles/**', lct)
    page.route('**/services.terrascope.be/**', lambda r: r.abort())
    osm = osm_json()
    page.route('**/overpass-api.de/**', lambda r: r.fulfill(status=200, body=osm, headers={'Content-Type': 'application/json', **cors}))

def block(page):   # 実データを取れないとき（仮の地形にもどる道）を試す
    for u in ['**/elevation-tiles-prod/**', '**/archive-api.open-meteo.com/**', '**/planetarycomputer.microsoft.com/**', '**/services.terrascope.be/**', '**/overpass-api.de/**']:
        page.route(u, lambda r: r.abort())
