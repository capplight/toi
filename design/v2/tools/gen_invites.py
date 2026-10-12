# Генератор 3 страниц приглашения (05–07). Запуск: python design/v2/tools/gen_invites.py. Макеты статичны, генератор нужен только для правок.
# Generates design/v2/mockups/05..07-invite-*.html (static output; no build needed to view)
import math, os
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "mockups")
P = 'pathLength="1"'

def horn(cls=""):
    return f'''<svg class="{cls}" viewBox="0 0 120 64" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
<path {P} d="M60 60 C60 44 53 32 41 27 C29 22 16 26 13.5 37 C11 47 18 53.5 26 51.5 C32.5 50 34 42.5 29 39.5 C25.5 37.5 21.5 39.5 22.5 43.5"/>
<path {P} d="M60 60 C60 44 67 32 79 27 C91 22 104 26 106.5 37 C109 47 102 53.5 94 51.5 C87.5 50 86 42.5 91 39.5 C94.5 37.5 98.5 39.5 97.5 43.5"/>
<path {P} class="d2" d="M60 46 C58.5 38 53 33.5 46.5 34"/><path {P} class="d2" d="M60 46 C61.5 38 67 33.5 73.5 34"/>
<path {P} class="d3" d="M60 60 V19"/><path {P} class="d3" d="M60 4 L65 11 L60 18 L55 11 Z"/></svg>'''

def shan_paths(cx, cy, s, rays=True, sw=1.5, n=32, delay0=0):
    g = f'<g transform="translate({cx} {cy}) scale({s})" fill="none" stroke="currentColor" stroke-width="{sw/s:.2f}" stroke-linecap="round">'
    g += f'<path {P} d="M0 -40 A40 40 0 1 1 0 40 A40 40 0 1 1 0 -40"/><path {P} class="d2" d="M0 -34 A34 34 0 1 0 0 34 A34 34 0 1 0 0 -34"/>'
    g += f'<path {P} class="d3" d="M-13 -31.4 Q-18 0 -13 31.4"/><path {P} class="d3" d="M13 -31.4 Q18 0 13 31.4"/>'
    g += f'<path {P} class="d4" d="M-31.4 -13 Q0 -18 31.4 -13"/><path {P} class="d4" d="M-31.4 13 Q0 18 31.4 13"/>'
    if rays:
        for i in range(n):
            a = i / n * 2 * math.pi; L = 55 if i % 2 else 62
            g += f'<path {P} class="ray" style="--dd:{delay0 + 600 + i*25}ms" d="M{45*math.cos(a):.2f} {45*math.sin(a):.2f} L{L*math.cos(a):.2f} {L*math.sin(a):.2f}"/>'
    return g + '</g>'

def corner(cls=""):
    return f'''<svg class="{cls}" viewBox="0 0 96 96" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" aria-hidden="true">
<path {P} d="M5 94 V40 C5 20 20 5 40 5 H94"/><path {P} class="d2" d="M15 94 V48 C15 30 30 15 48 15 H94"/>
<path {P} class="d3" d="M26 26 C36 36 48 38 54 32 C60 26 54 18 48 22 C44 25 47 29 50 28"/>
<path {P} class="d3" d="M26 26 C36 36 38 48 32 54 C26 60 18 54 22 48 C25 44 29 47 28 50"/><path {P} class="d4" d="M5 5 L11 11"/></svg>'''

def tulip_line(x, y, s, cls="sway", d="7s", dl="0s", col="currentColor"):
    return f'''<g transform="translate({x} {y}) scale({s})"><g class="{cls}" style="--d:{d};--dl:{dl}" fill="none" stroke="{col}" stroke-width="{1.5/s:.2f}" stroke-linecap="round" stroke-linejoin="round">
<path {P} d="M32 148 C32 118 33 92 32 62"/><path {P} class="d2" d="M32 128 C16 116 10 98 13 80 C23 92 29 104 32 116"/><path {P} class="d2" d="M32 112 C46 102 52 88 50 72 C41 82 35 92 32 102"/>
<path {P} class="d3" d="M32 62 C21 60 15 48 17 30 C23 37 27 40 32 42 C37 40 41 37 47 30 C49 48 43 60 32 62 Z"/><path {P} class="d4" d="M32 42 C27 32 27 22 32 12 C37 22 37 32 32 42"/></g></g>'''

def tulip_fill(x, y, s, fill, stem, d="7s", dl="0s"):
    return f'''<g transform="translate({x} {y}) scale({s})"><g class="sway" style="--d:{d};--dl:{dl}">
<path d="M32 150 C32 118 33 92 32 62" fill="none" stroke="{stem}" stroke-width="3"/><path d="M32 128 C16 116 10 98 13 80 C23 92 29 104 32 116 Z" fill="{stem}"/>
<path d="M32 62 C21 60 15 48 17 30 C23 37 27 40 32 42 C37 40 41 37 47 30 C49 48 43 60 32 62 Z" fill="{fill}"/><path d="M32 46 C27 34 27 24 32 14 C37 24 37 34 32 46 Z" fill="{fill}" opacity=".75"/></g></g>'''

def star(x, y, r, d, dl, col="currentColor"):
    return f'<g transform="translate({x} {y}) scale({r/9:.2f})"><path class="twinkle" style="--d:{d}s;--dl:-{dl}s" fill="{col}" d="M0 -9 C1 -1.5 1.5 -1 9 0 C1.5 1 1 1.5 0 9 C-1 1.5 -1.5 1 -9 0 C-1.5 -1 -1 -1.5 0 -9Z"/></g>'

STARS = [(30,40,3,5,1),(80,24,2,6,2),(120,70,2.5,4,3),(200,30,3.5,7,1.5),(260,60,2,5,4),(240,120,2.5,6,0.5),(40,120,2,4.5,2.5),(160,40,2,5.5,3.5),(280,150,3,6.5,1),(100,140,1.8,5,0.2),(20,190,2.2,7,2.2),(185,95,1.6,4,1.1)]

def cover(t):
    if t == "ak":
        return f'''<svg class="cover" viewBox="0 0 300 370" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
<defs><linearGradient id="sk" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#F8ECD8"/><stop offset=".55" stop-color="#F2D6AE"/><stop offset="1" stop-color="#E7B98C"/></linearGradient>
<radialGradient id="sn" cx=".5" cy=".55" r=".5"><stop offset="0" stop-color="#FFF6E2"/><stop offset=".45" stop-color="#FCE5BC" stop-opacity=".9"/><stop offset="1" stop-color="#FCE5BC" stop-opacity="0"/></radialGradient></defs>
<rect width="300" height="370" fill="url(#sk)"/><circle cx="150" cy="196" r="120" fill="url(#sn)"/>
<g class="draw" style="color:#B48A3E">{shan_paths(150,196,1.25)}</g>
<path d="M0 258 C60 238 110 252 150 246 C200 238 240 230 300 244 V370 H0Z" fill="#E4C69E"/>
<path d="M0 292 C70 274 140 296 200 284 C240 276 270 268 300 276 V370 H0Z" fill="#D6B287"/>
<g transform="translate(212 262)"><path d="M-14 0 Q-14 -15 0 -18 Q14 -15 14 0 Z" fill="#FBF1DF" stroke="#9C6F22" stroke-width="1"/><path d="M-3 0 V-7 H3 V0" fill="#C99A55"/><path d="M-10 -9 Q0 -12 10 -9" fill="none" stroke="#9C6F22" stroke-width=".8"/></g>
<path d="M0 328 C80 312 170 338 300 316 V370 H0Z" fill="#C49A6B"/>
<path d="M0 258 C60 238 110 252 150 246 C200 238 240 230 300 244" fill="none" stroke="#B48A3E" stroke-width=".8" opacity=".7"/></svg>'''
    if t == "kok":
        st = "".join(star(x, y, r, d, dl, "#F1DEB0") for x, y, r, d, dl in STARS)
        return f'''<svg class="cover" viewBox="0 0 300 370" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
<defs><linearGradient id="sk2" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0B1C2E"/><stop offset=".6" stop-color="#1D4268"/><stop offset="1" stop-color="#2E5A82"/></linearGradient>
<mask id="moon"><rect width="300" height="370" fill="#fff"/><circle cx="236" cy="78" r="21" fill="#000"/></mask></defs>
<rect width="300" height="370" fill="url(#sk2)"/>{st}
<circle cx="226" cy="84" r="34" fill="#F1DEB0" opacity=".12"/><circle cx="226" cy="84" r="20" fill="#F1DEB0"/>
<g class="draw" style="color:#D8B26A" opacity=".85">{shan_paths(150,206,1.15)}</g>
<path d="M0 276 L38 236 L66 254 L108 204 L148 250 L184 222 L220 246 L258 210 L300 240 V370 H0Z" fill="#163556"/>
<path d="M108 204 L96 218 L106 214 L116 222 L120 214 Z M258 210 L248 222 L258 218 L266 224 Z" fill="#C9D6E3" opacity=".55"/>
<path d="M0 306 L50 280 L96 298 L150 270 L210 300 L260 282 L300 296 V370 H0Z" fill="#0F2742"/>
<path d="M0 340 C90 322 190 346 300 328 V370 H0Z" fill="#0A1B2E"/></svg>'''
    # kyz
    tl = tulip_fill(30, 250, .62, "#9B2A3A", "#5E6B3A", "6.5s", "-1s") + tulip_fill(70, 236, .74, "#B8394A", "#5E6B3A", "7.5s", "-3s") + tulip_fill(214, 240, .7, "#9B2A3A", "#5E6B3A", "7s", "-2s") + tulip_fill(250, 258, .58, "#C0485A", "#5E6B3A", "6s", "-4s") + tulip_fill(118, 262, .5, "#C0485A", "#5E6B3A", "8s", "-.5s") + tulip_fill(168, 266, .48, "#9B2A3A", "#5E6B3A", "6.8s", "-2.6s")
    return f'''<svg class="cover" viewBox="0 0 300 370" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
<defs><linearGradient id="sk3" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FBEDE4"/><stop offset=".55" stop-color="#F4CDBC"/><stop offset="1" stop-color="#E7A797"/></linearGradient>
<radialGradient id="sn3" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#FFF4EA"/><stop offset="1" stop-color="#FFF4EA" stop-opacity="0"/></radialGradient></defs>
<rect width="300" height="370" fill="url(#sk3)"/><circle cx="150" cy="180" r="110" fill="url(#sn3)"/>
<g class="draw" style="color:#B48A3E">{shan_paths(150,180,1.05, n=24)}</g>
<path d="M0 270 C70 250 140 266 200 254 C240 246 270 248 300 252 V370 H0Z" fill="#E59D8E"/>
<path d="M0 300 C80 284 160 304 300 288 V370 H0Z" fill="#CF7A73"/>{tl}
<path d="M0 338 C90 326 200 346 300 332 V370 H0Z" fill="#A9454F"/></svg>'''

def liner(t):
    if t == "ak":
        tile = '<path d="M20 26 C20 20 17 16 13 15 C9 14 6 17 7 20 C8 22 11 22 11 20 M20 26 C20 20 23 16 27 15 C31 14 34 17 33 20 C32 22 29 22 29 20 M20 26 V10" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>'
        w = 40
    elif t == "kok":
        tile = '<path fill="currentColor" d="M20 12 C20.6 17 21 17.4 26 18 C21 18.6 20.6 19 20 24 C19.4 19 19 18.6 14 18 C19 17.4 19.4 17 20 12Z"/><circle cx="4" cy="34" r="1.2" fill="currentColor"/>'
        w = 40
    else:
        tile = '<path d="M20 28 C20 22 20 19 20 16 M20 16 C16 15.5 14 12 14.6 7 C16.6 9 18 9.8 20 10.4 C22 9.8 23.4 9 25.4 7 C26 12 24 15.5 20 16 Z" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/>'
        w = 40
    return f'''<svg viewBox="0 0 400 282" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><defs><pattern id="lp-{t}" width="{w}" height="{w}" patternUnits="userSpaceOnUse" patternTransform="rotate(0)">{tile}</pattern></defs><rect width="400" height="282" fill="url(#lp-{t})"/></svg>'''

def side(t):
    if t == "ak":
        hs = "".join(f'<g transform="translate(150 {520 + i*120}) scale(.9)">{horn("draw").replace("<svg", "<svg x=\"-60\" y=\"-32\" width=\"120\" height=\"64\"")}</g>' for i in range(4))
        return f'''<svg viewBox="0 0 400 1000" preserveAspectRatio="xMinYMin slice" width="100%" height="100%" aria-hidden="true">
<g class="draw" opacity=".75">{shan_paths(40,250,3.4, sw=1.2)}</g>
<path class="draw" d="M150 470 V1000" fill="none" stroke="currentColor" stroke-width="1" {P}/>
<g opacity=".85">{hs}</g></svg>'''
    if t == "kok":
        rng = [(60,80,4,5,1),(180,140,3,6,2),(300,60,5,7,3),(90,260,2.5,4,0.5),(250,320,3.5,6,1.5),(130,420,2,5,2.5),(320,500,4,6.5,1),(60,560,3,5,3.2),(220,640,2.5,4.5,0.8),(330,760,3.5,7,2),(100,820,2.8,5.5,1.2),(260,900,2,4,0.3),(40,950,3,6,2.6),(190,240,2,5,1.9),(340,380,2.2,4.2,0.7)]
        st = "".join(star(x, y, r*2.6, d, dl) for x, y, r, d, dl in rng)
        return f'''<svg viewBox="0 0 400 1000" preserveAspectRatio="xMinYMin slice" width="100%" height="100%" aria-hidden="true">
<g opacity=".9">{st}</g>
<g transform="translate(330 150)"><circle r="48" fill="currentColor" opacity=".08"/><circle r="28" fill="currentColor" opacity=".85"/></g>
<g class="draw" opacity=".7">{shan_paths(200,560,2.6, sw=1.2)}</g></svg>'''
    tl = tulip_line(40, 520, 2.6, d="8s", dl="-1s") + tulip_line(170, 640, 2.1, d="7s", dl="-3s") + tulip_line(260, 380, 3.2, d="9s", dl="-2s") + tulip_line(120, 300, 1.6, d="6.5s", dl="-4s")
    return f'''<svg viewBox="0 0 400 1000" preserveAspectRatio="xMinYMax slice" width="100%" height="100%" aria-hidden="true">
<g class="draw" style="color:var(--orn-2)">{tl}</g>
<g class="draw" opacity=".8">{shan_paths(60,140,1.6, sw=1.1, n=24)}</g></svg>'''

def scene_extra(t):
    if t == "kok":
        st = "".join(star(x*1.3, y*1.2, r*1.3, d, dl) for x, y, r, d, dl in STARS)
        return f'<svg class="sky" viewBox="0 0 400 300" preserveAspectRatio="xMidYMin slice" style="position:absolute;inset:0;width:100%;height:100%;color:#F1DEB0;opacity:.8" aria-hidden="true">{st}</svg>'
    if t == "kyz":
        return f'''<svg viewBox="0 0 400 160" preserveAspectRatio="xMidYMax meet" style="position:absolute;left:0;right:0;bottom:0;width:100%;height:auto;max-height:28vh;color:var(--orn-2)" aria-hidden="true"><g class="draw">
{tulip_line(4, 60, .62, d="7s", dl="-1s")}{tulip_line(40, 40, .78, d="8s", dl="-2s")}{tulip_line(330, 44, .76, d="7.5s", dl="-3s")}{tulip_line(362, 66, .6, d="6.5s", dl="-1.5s")}</g></svg>'''
    return ""

def minimap():
    s = '<svg class="minimap" viewBox="0 0 220 236" aria-label="Залдағы үстеліңіз: 10-үстел" role="img">'
    s += '<text x="110" y="12">ТӨР</text><rect class="yt" x="75" y="22" width="70" height="14" rx="7"/>'
    for i in range(16):
        r, c = divmod(i, 4); x = 35 + c * 50; y = 66 + r * 42; n = i + 1
        if n == 10:
            s += f'<circle class="me-ring" cx="{x}" cy="{y}" r="13"/><circle class="me" cx="{x}" cy="{y}" r="13"/><text x="{x}" y="{y+4}" style="fill:var(--on-accent);font-size:12px;letter-spacing:0;font-weight:400">10</text><text x="{x}" y="{y+27}" style="fill:var(--accent);font-size:11px;letter-spacing:0;font-weight:400">Сіз осында</text>'
        else:
            s += f'<circle class="t" cx="{x}" cy="{y}" r="11"/>'
    s += '<text x="110" y="231">КІРЕБЕРІС</text></svg>'
    return s

NAMES = {"ak": ("05-invite-ak-shanyraq.html", "«Ақ шаңырақ»", "tpl-ak", "#F4ECDD"), "kok": ("06-invite-kok-tun.html", "«Көк түн»", "tpl-kok", "#0F2338"), "kyz": ("07-invite-kyzgaldak.html", "«Қызғалдақ»", "tpl-kyz", "#F8ECE6")}

ICON = {
 "pin": '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
 "map": '<path d="M14.1 6 9.9 4 3 6.6v13.4l6.9-2.6 4.2 2 6.9-2.6V3.4Z"/><path d="M9.9 4v13.4"/><path d="M14.1 6v13.4"/>',
 "yes": '<circle cx="12" cy="12" r="10"/><path d="m8.5 12 2.5 2.5 4.5-5"/>',
 "no": '<circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/>',
 "minus": '<path d="M5 12h14"/>', "plus": '<path d="M5 12h14"/><path d="M12 5v14"/>',
 "send": '<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>',
 "pencil": '<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>',
}
def ic(n, extra=""):
    return f'<svg viewBox="0 0 24 24" {extra}>{ICON[n]}</svg>'

for t, (fn, title, cls, theme) in NAMES.items():
    html = f'''<!doctype html>
<html lang="kk">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="theme-color" content="{theme}">
<title>Шақыру {title} · Той v2</title>
<!-- Шрифты: свои woff2-подмножества (≈ 30 КБ на два файла); preload только Cormorant — имя семьи на конверте = LCP -->
<!-- в продукте (https): <link rel="preload" href="/fonts/cormorant-garamond-600-kk.woff2" as="font" type="font/woff2" crossorigin>
     в статичном макете выключено: file:// блокирует CORS-preload; сам шрифт грузится через @font-face в invite.css -->
<link rel="stylesheet" href="css/invite.css">
</head>
<body class="inv {cls}">
<!-- ===== Конверт: первый экран. Нажатие «Ашу» запускает музыку (автозапуск запрещён браузерами) ===== -->
<section class="scene" aria-label="Шақыру конверті">
  <div class="scene-decor">{scene_extra(t)}
    {corner("corner c-tl draw")}{corner("corner c-tr draw")}{corner("corner c-bl draw")}{corner("corner c-br draw")}
  </div>
  <div class="scene-inner">
    <p class="env-hello">Сізге тойға шақыру келді</p>
    <p class="env-to">Ерлан ағай отбасы</p>
    <div class="env" aria-hidden="true">
      <div class="env-back">{liner(t)}</div>
      <div class="letter"><span class="l-kick">Үйлену тойы</span><span class="l-names">Айбек пен Дана</span>{horn()}</div>
      <div class="pocket"></div>
      <div class="flap"><i class="f"></i><i class="b"></i></div>
      <span class="seal-glow"></span>
      <span class="seal"><span class="mono">А<i></i>Д</span></span>
    </div>
    <button class="open-btn" id="open">Ашу</button>
    <p class="env-hint" id="hint"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>Ашқанда музыка қосылады</p>
    <div class="lang-pill" role="group" aria-label="Тіл"><button aria-pressed="true">ҚАЗ</button><button aria-pressed="false">РУС</button></div>
  </div>
</section>

<!-- ===== Приглашение ===== -->
<div class="page-bg"></div>
<div class="side-decor l" aria-hidden="true" data-ambient>{side(t)}</div>
<div class="side-decor r" aria-hidden="true" data-ambient>{side(t)}</div>
<div class="inv-bar">
  <div class="lang-pill" role="group" aria-label="Тіл"><button aria-pressed="true">ҚАЗ</button><button aria-pressed="false">РУС</button></div>
  <button class="pill-btn" aria-label="Музыканы өшіру" aria-pressed="true"><span class="eq" aria-hidden="true"><i></i><i></i><i></i></span>Музыка</button>
</div>

<main class="invite">
  <div class="inv-col paper">
    <header class="hero">
      <div class="kicker">Үйлену тойы</div>
      <div class="arch-wrap">
        <div class="arch" data-ambient>{cover(t)}</div>
      </div>
      <h1 class="names serif">Айбек<span class="amp">пен</span>Дана</h1>
      <div class="divider"><i class="ln"></i>{horn("draw")}<i class="ln"></i></div>
    </header>

    <section class="sec reveal">
      <p class="greet">Құрметті<br>Ерлан ағай отбасы!</p>
      <p class="body-text">Сіздерді ұлымыз Айбек пен келініміз Дананың үйлену тойына арналған салтанатты ақ дастарханымыздың қадірлі қонағы болуға шақырамыз.</p>
    </section>

    <section class="sec reveal" aria-label="Күні мен уақыты">
      <div class="datebox">
        <div class="side">Жексенбі</div>
        <div class="mid"><div class="day">15</div><div class="mon">қараша</div></div>
        <div class="side">18:00</div>
      </div>
      <div class="count">Тойға <b>37</b> күн қалды</div>
    </section>

    <section class="sec reveal">
      <div class="card venue">
        {corner("corner k1")}{corner("corner k2")}
        <svg class="ico-pin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">{ICON["pin"]}</svg>
        <h3>«Шаңырақ» мейрамханасы</h3>
        <p>Атырау қ., Абай даңғылы, 15</p>
        <a class="btn-i" href="#" style="margin-top:20px">{ic("map")}Картаны ашу</a>
      </div>
    </section>

    <section class="sec reveal hosts">
      <div class="lbl">Той иелері</div>
      <div class="nm">Серік — Гүлжан</div>
    </section>

    <section class="sec reveal" id="rsvp">
      <!-- Обычная форма POST /i/{{token}}: работает и без JS; JS только даёт −/+ и скрывает число мест при «Келмейміз» -->
      <form class="card rsvp st-form" method="post" action="#rsvp">
        <h2>Тойға келесіз бе?</h2>
        <p class="sub">Жауабыңызды осы жерде белгілеңізші</p>
        <fieldset class="choice" style="border:0;padding:0;margin:0"><legend class="sr-only">Жауабыңыз</legend>
          <label><input type="radio" name="attending" value="yes" checked>{ic("yes")}Келеміз</label>
          <label><input type="radio" name="attending" value="no">{ic("no")}Келе алмаймыз</label>
        </fieldset>
        <div class="seats">
          <label class="q" for="seats">Неше орын керек?</label>
          <div class="stepper-i"><button type="button" data-step="-1" aria-label="Орынды азайту">{ic("minus")}</button><div class="v"><input id="seats" name="seats" type="number" inputmode="numeric" min="1" max="30" value="4"><small>орын</small></div><button type="button" data-step="1" aria-label="Орынды көбейту">{ic("plus")}</button></div>
          <p class="hint">Кішкентай балаларды санамаңыз.</p>
        </div>
        <button class="btn-i fill" type="submit">{ic("send")}Жіберу</button>
        <p class="note">Жауапты той күніне дейін өзгертуге болады.</p>
      </form>

      <div class="card rsvp st-answered keep">
        {horn("done-orn draw")}
        <h2>Рақмет! Сізді күтеміз</h2>
        <div class="done-sum"><svg class="check-draw" viewBox="0 0 24 24"><path pathLength="1" d="M20 6 9 17l-5-5"/></svg>Келеміз · 4 орын</div>
        <p class="note">Жауапты той күніне дейін өзгертуге болады.</p>
        <a class="btn-i" href="#" style="margin-top:16px">{ic("pencil")}Жауапты өзгерту</a>
      </div>

      <div class="card tableno st-notyet" style="margin-top:16px">
        <div class="lbl">Сіздің үстеліңіз</div>
        <p class="note" style="margin-top:12px">Үстел нөмірі әлі белгіленбеген. Той жақындағанда осы бетте көрінеді.</p>
      </div>
      <div class="card tableno st-table" style="margin-top:16px">
        {corner("corner k1")}{corner("corner k2")}{corner("corner k3")}{corner("corner k4")}
        <div class="lbl">Сіздің үстеліңіз</div>
        <div class="n">10</div>
        <div class="unit">үстел</div>
        {minimap()}
        <p class="note">Кіреберісте көмекшіміз Сізді қарсы алып, үстеліңізге апарады.</p>
      </div>
    </section>

    <footer class="foot">
      <div class="wm"><svg viewBox="-32 -32 64 64" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round"><circle r="17"/><path d="M-6 -15.8 Q-8.5 0 -6 15.8 M6 -15.8 Q8.5 0 6 15.8 M-15.8 -6 Q0 -8.5 15.8 -6 M-15.8 6 Q0 8.5 15.8 6"/><path d="M22.0 0.0 L29.0 0.0 M19.1 11.0 L25.1 14.5 M11.0 19.1 L14.5 25.1 M0.0 22.0 L0.0 29.0 M-11.0 19.1 L-14.5 25.1 M-19.1 11.0 L-25.1 14.5 M-22.0 0.0 L-29.0 0.0 M-19.1 -11.0 L-25.1 -14.5 M-11.0 -19.1 L-14.5 -25.1 M-0.0 -22.0 L-0.0 -29.0 M11.0 -19.1 L14.5 -25.1 M19.1 -11.0 L25.1 -14.5"/></svg>Той</div>
      <div style="margin-top:6px">«Той» қызметінде жасалған</div>
    </footer>
  </div>
</main>

<!-- Ванильный JS-островок (в продукте ≤ 10 КБ, без React): конверт + музыка + −/+ + пауза анимаций вне экрана.
     Без JS: форма уходит обычным POST; сервер для no-JS отдаёт сразу открытое приглашение (<noscript> со стилем .scene{{display:none}}). -->
<noscript><style>.scene{{display:none}}.invite{{opacity:1}}</style></noscript>
<script>
  (function () {{
    var h = document.documentElement, st = (location.hash || '').slice(1);
    h.dataset.state = st === 'mid' ? '' : st;
    if (st === 'open' || st === 'answered' || st === 'table' || st === 'notyet') h.classList.add('is-open');
    if (st === 'lite') h.classList.add('lite');
    if (st === 'mid') {{ h.classList.add('is-opening'); setTimeout(function () {{ h.dataset.state = 'mid'; }}, 1150); }}
    document.getElementById('open').addEventListener('click', function () {{
      h.classList.add('is-opening');                         /* + audio.play() в продукте */
      setTimeout(function () {{ h.classList.add('opened'); }}, 2300);
    }});
    document.querySelectorAll('[data-step]').forEach(function (b) {{
      b.addEventListener('click', function () {{ var i = document.getElementById('seats'); i.value = Math.min(30, Math.max(1, (+i.value || 1) + +b.dataset.step)); }});
    }});
    document.querySelectorAll('input[name=attending]').forEach(function (r) {{
      r.addEventListener('change', function () {{ document.querySelector('.seats').hidden = (r.value === 'no' && r.checked); }});
    }});
    if ('IntersectionObserver' in window) {{   /* N4: пауза бесконечных анимаций вне экрана */
      var io = new IntersectionObserver(function (es) {{ es.forEach(function (e) {{ e.target.classList.toggle('paused', !e.isIntersecting); }}); }});
      document.querySelectorAll('[data-ambient], .tableno').forEach(function (el) {{ io.observe(el); }});
    }}
    document.addEventListener('visibilitychange', function () {{ h.classList.toggle('page-hidden', document.hidden); }});
  }})();
</script>
</body>
</html>'''
    # draw classes need .is-open on html; selectors use .is-open ... (html has class)
    open(os.path.join(OUT, fn), "w", encoding="utf8").write(html)
    print(fn, len(html))
