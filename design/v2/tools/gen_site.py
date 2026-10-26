# -*- coding: utf-8 -*-
"""Генератор макетов публичного сайта «Той» (design/v2/site/*.html).

Тексты берутся из content/site/{kk,ru}/*.md как есть (без «lorem»): заголовки, абзацы,
списки, таблицы, FAQ, карточки тілек и текстов приглашений. Маркеры <!-- BLOCK: … -->
превращаются в компоненты сайта (SITE_DESIGN.md, раздел 4). Точечные правки вида
«абзац → компонент» (расхождение источников, «халық аузынан», факт) — в TRANSFORMS.

Запуск: python design/v2/tools/gen_site.py   (Python 3.10+, без зависимостей)
Новые строки интерфейса, которых нет в контенте, помечены в SITE_DESIGN.md как [ВЫЧИТКА].
"""
import re
import json
import urllib.parse
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
CONTENT = ROOT / "content" / "site"
OUT = ROOT / "design" / "v2" / "site"

# Реальный URL → файл макета (остальные ссылки ведут на «#», реальный путь — в data-url)
MOCK = {
    "/kk": "kk-home.html", "/ru": "ru-home.html",
    "/kk/tilekter": "kk-tilekter.html", "/kk/tilekter/sundet-toi": "kk-tilekter-sundet-toi.html",
    "/kk/dastur/betashar": "kk-dastur-betashar.html", "/kk/shaqyru/qyz-uzatu": "kk-shaqyru-qyz-uzatu.html",
    "/ru/rassadka-gostei": "ru-rassadka-gostei.html",
    "/kk/shaqyru/ulgi/ak-shanyraq": "../mockups/05-invite-ak-shanyraq.html",
    "/kk/shaqyru/ulgi/kok-tun": "../mockups/06-invite-kok-tun.html",
    "/kk/shaqyru/ulgi/qyzgaldaq": "../mockups/07-invite-kyzgaldak.html",
    "/ru/priglashenie/shablon/ak-shanyrak": "../mockups/05-invite-ak-shanyraq.html",
    "/ru/priglashenie/shablon/kok-tun": "../mockups/06-invite-kok-tun.html",
    "/ru/priglashenie/shablon/kyzgaldak": "../mockups/07-invite-kyzgaldak.html",
}


def href(url):
    url = url.strip()
    base = url.split("#")[0]
    if base in MOCK:
        return f'href="{MOCK[base]}"'
    if url.startswith("http"):
        return f'href="{url}" rel="noopener"'
    return f'href="#" data-url="{url}"'


def ico(name, cls="ico"):
    return f'<svg class="{cls}" aria-hidden="true"><use href="#i-{name}"/></svg>'


def orn(name, cls):
    return f'<svg class="{cls}" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" aria-hidden="true"><use href="#o-{name}"/></svg>'


# ---------------------------------------------------------------- строки интерфейса
UI = {
    "kk": dict(
        home="Басты бет", menu="Мәзір", close="Жабу", lang="Тіл", cta="Шақыру жасау",
        nav=[("shaqyru", "Шақыру", "/kk/shaqyru", "Үлгілер, демо және шақыру мәтіні"),
             ("tilekter", "Тілектер", "/kk/tilekter", "Тойға айтатын тілек пен бата"),
             ("dastur", "Дәстүр", "/kk/dastur", "Той дәстүрлерінің мәні мен реті"),
             ("otyrgyzu", "Отырғызу", "/kk/otyrgyzu-jospary", "Дөңгелек үстелдер және төр"),
             ("baga", "Баға", "/kk/baga", None)],
        sub=[("Үйлену тойы", "/kk/shaqyru/uilenu-toi"), ("Қыз ұзату", "/kk/shaqyru/qyz-uzatu"), ("Сүндет той", "/kk/shaqyru/sundet-toi"), ("Мерейтой", "/kk/shaqyru/mereitoi")],
        foot_about="{BRAND} — қазақ тойын ұйымдастыратын отбасыларға арналған сервис.",
        foot_cols=[("Бөлімдер", [("Шақыру", "/kk/shaqyru"), ("Тілектер", "/kk/tilekter"), ("Дәстүр", "/kk/dastur"), ("Отырғызу жоспары", "/kk/otyrgyzu-jospary")]),
                   ("Пайдалы", [("Сұрақтар", "/kk/suraqtar"), ("Қонақтар тізімі", "/kk/qonaqtar-tizimi"), ("Шығындар", "/kk/toi-shygyny"), ("Біз туралы", "/kk/biz-turaly"), ("Байланыс", "/kk/bailanys")]),
                   ("Құжаттар", [("Құпиялық", "/kk/qupiyalyq-sayasaty"), ("Шарттар", "/kk/paidalanu-sharttary")])],
        soon="жақында", copy="Көшіру", wa="WhatsApp", wa_full="WhatsApp-қа жіберу",
        use_text="Осы мәтінмен жасау", toc="Мазмұны", tip="Біздің кеңес", tip_sub="дәстүр емес, кеңес",
        folk="Халық аузынан", differ="Деректер әртүрлі", sources="Дереккөздер", faq_hint="",
        demo_open="Демоны ашу", demo_use="Осы үлгімен жасау", demo_badge="Демо · әуенмен",
        related="Осы тойға қатысты", filter="Сүзгі және бөлімдер", sections="Бөлімдер",
        who="Кімге, кімнен", length="Ұзындығы", all="Барлығы", reset="Сүзгіні тазалау",
        empty="Бұл сүзгі бойынша тілек жоқ.", updated="Жаңартылды", reviewed="Тексерген",
        print="Тізімді басып шығару", glossary="Мақаладағы сөздер", glossary_more="Той сөздігі",
        copyright="© 2026 {BRAND}", skip="Мазмұнға өту", type="Түрі",
        lens={"qysqa": "қысқа", "ortasha": "орташа", "uzaq": "ұзақ"},
    ),
    "ru": dict(
        home="Главная", menu="Меню", close="Закрыть", lang="Язык", cta="Создать приглашение",
        nav=[("priglashenie", "Приглашения", "/ru/priglashenie", "Шаблоны, демо и тексты приглашений"),
             ("rassadka", "Рассадка гостей", "/ru/rassadka-gostei", "Төр, круглые столы и план рассадки"),
             ("traditsii", "Традиции", "/ru/traditsii", "Смысл и порядок обрядов тоя"),
             ("tseny", "Цены", "/ru/tseny", None)],
        sub=[("Қыз ұзату", "/ru/priglashenie/kyz-uzatu"), ("Сүндет той", "/ru/priglashenie/sundet-toi"), ("Юбилей", "/ru/priglashenie/yubilei")],
        foot_about="{BRAND} — сервис для казахского тоя.",
        foot_cols=[("Разделы", [("Приглашения", "/ru/priglashenie"), ("Рассадка гостей", "/ru/rassadka-gostei"), ("Традиции", "/ru/traditsii"), ("Поздравления на казахском", "/ru/pozdravleniya-na-kazakhskom")]),
                   ("Полезное", [("Вопросы", "/ru/voprosy"), ("Список гостей", "/ru/spisok-gostei"), ("Бюджет тоя", "/ru/byudzhet-toya"), ("О нас", "/ru/o-nas"), ("Контакты", "/ru/kontakty")]),
                   ("Документы", [("Конфиденциальность", "/ru/politika-konfidentsialnosti"), ("Условия", "/ru/usloviya-ispolzovaniya")])],
        soon="скоро", copy="Копировать", wa="WhatsApp", wa_full="Отправить в WhatsApp",
        use_text="Создать с этим текстом", toc="Содержание", tip="Наш совет", tip_sub="совет, а не обычай",
        folk="Народные пословицы", differ="Источники расходятся", sources="Источники",
        demo_open="Открыть демо", demo_use="Создать по этому шаблону", demo_badge="Демо · с музыкой",
        related="По теме", filter="Фильтр и разделы", sections="Разделы", who="Кому", length="Длина",
        all="Все", reset="Сбросить фильтр", empty="По этому фильтру ничего нет.", updated="Обновлено",
        reviewed="Проверил", print="Распечатать список", glossary="Слова из статьи", glossary_more="Словарь тоя",
        copyright="© 2026 {BRAND}", skip="К содержанию", type="Тип",
        lens={"qysqa": "короткий", "ortasha": "средний", "uzaq": "длинный"},
    ),
}

TPL = {
    # id: (класс палитры, файл обложки, kk-название, ru-название, kk-настроение, ru-настроение, slug kk, slug ru)
    "ak": ("tpl-ak", "cover-svg-ak.svg", "Ақ шаңырақ", "Ақ шаңырақ", "ақ, күндізгі, салтанатты", "светлый, дневной, с золотым шаңыраком над степью", "/kk/shaqyru/ulgi/ak-shanyraq", "/ru/priglashenie/shablon/ak-shanyrak"),
    "kok": ("tpl-kok", "cover-svg-kok.svg", "Көк түн", "Көк түн", "кешкі тойға", "вечерний, со звёздным небом и горами", "/kk/shaqyru/ulgi/kok-tun", "/ru/priglashenie/shablon/kok-tun"),
    "kyz": ("tpl-kyz", "cover-svg-kyz.svg", "Қызғалдақ", "Қызғалдақ", "көктемгі, жастарға", "весенний, с тюльпанами", "/kk/shaqyru/ulgi/qyzgaldaq", "/ru/priglashenie/shablon/kyzgaldak"),
}
TPL_ALIAS = {"ak-shanyraq": "ak", "ak-shanyrak": "ak", "kok-tun": "kok", "qyzgaldaq": "kyz", "kyzgaldak": "kyz"}


# ---------------------------------------------------------------- inline
def inl(s):
    s = re.sub(r"[ 	]{2,}", " ", s.strip())
    s = re.sub(r" +([.,;:!?])", r"", s)
    s = re.sub(r"\[([^\]]+)\]\(([^)]+)\)", lambda m: f"<a {href(m.group(2))}>{m.group(1)}</a>", s)
    s = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", s)
    s = re.sub(r"(?<![\w*])\*(?!\s)(.+?)(?<!\s)\*(?![\w*])", r'<span class="em">\1</span>', s)
    s = s.replace("{BRAND}", '<span class="brand-ph">{BRAND}</span>')
    s = re.sub(r"\{(PRICE|FREE|REVIEWER|REVIEW_DATE|EMAIL|SUPPORT_WHATSAPP|SUPPORT_HOURS)\}", r'<span class="ph">{\1}</span>', s)
    s = s.replace("⟦folk⟧", "").strip()
    return s


def slug(t):
    tr = str.maketrans({"ә": "a", "ғ": "g", "қ": "q", "ң": "n", "ө": "o", "ұ": "u", "ү": "u", "һ": "h", "і": "i", "а": "a", "б": "b", "в": "v", "г": "g", "д": "d", "е": "e", "ё": "e", "ж": "zh", "з": "z", "и": "i", "й": "i", "к": "k", "л": "l", "м": "m", "н": "n", "о": "o", "п": "p", "р": "r", "с": "s", "т": "t", "у": "u", "ф": "f", "х": "h", "ц": "ts", "ч": "ch", "ш": "sh", "щ": "sh", "ы": "y", "э": "e", "ю": "yu", "я": "ya", "ь": "", "ъ": ""})
    t = re.sub(r"<[^>]+>", "", t).lower().translate(tr)
    return re.sub(r"[^a-z0-9]+", "-", t).strip("-")[:48]


# ---------------------------------------------------------------- парсер
def load(path):
    raw = path.read_text(encoding="utf-8")
    fm, body = {}, raw
    m = re.match(r"---\n(.*?)\n---\n(.*)", raw, re.S)
    if m:
        for line in m.group(1).splitlines():
            if ":" in line:
                k, v = line.split(":", 1)
                fm[k.strip()] = v.strip().strip('"')
        body = m.group(2)
    body = re.sub(r"<!--\s*folk[^>]*-->", " ⟦folk⟧", body)
    body = re.sub(r"<!--\s*(/?)BLOCK:?\s*(.*?)-->", lambda m: f"\n@@{'/' if m.group(1) else ''}BLOCK {m.group(2).strip()}@@\n", body, flags=re.S)
    body = re.sub(r"<!--.*?-->", "", body, flags=re.S)
    return fm, body


def tokenize(body):
    lines = [l.rstrip() for l in body.split("\n")]
    toks, i = [], 0
    while i < len(lines):
        l = lines[i]
        s = l.strip()
        if not s:
            i += 1; continue
        if s.startswith("@@"):
            m = re.match(r"@@(/?)BLOCK ?(.*?)@@$", s, re.S)
            if m:
                toks.append(("end",) if m.group(1) else ("block", m.group(2)))
            i += 1; continue
        m = re.match(r"(#{1,3})\s+(.*?)(?:\s*\{#([\w-]+)\})?$", s)
        if m:
            toks.append(("h", len(m.group(1)), m.group(2), m.group(3))); i += 1; continue
        if s in ("---", "***"):
            toks.append(("hr",)); i += 1; continue
        if s.startswith("|"):
            rows = []
            while i < len(lines) and lines[i].strip().startswith("|"):
                cells = [c.strip() for c in lines[i].strip().strip("|").split("|")]
                if not all(re.fullmatch(r":?-{3,}:?", c) for c in cells):
                    rows.append(cells)
                i += 1
            toks.append(("table", rows)); continue
        if s.startswith(">"):
            q = []
            while i < len(lines) and lines[i].strip().startswith(">"):
                q.append(re.sub(r"^>\s?", "", lines[i].strip())); i += 1
            toks.append(("quote", tokenize("\n".join(q)))); continue
        if re.match(r"^- ", s):
            items = []
            while i < len(lines) and re.match(r"^\s*- ", lines[i]):
                items.append(re.sub(r"^\s*- ", "", lines[i]).strip()); i += 1
            toks.append(("ul", items)); continue
        if re.match(r"^\d+\.\s", s):
            items = []
            while i < len(lines) and lines[i].strip():
                t = lines[i].strip()
                if re.match(r"^\d+\.\s", t):
                    items.append(re.sub(r"^\d+\.\s", "", t))
                elif t.startswith("@@") or t.startswith("#"):
                    break
                else:
                    items[-1] += "\n" + t
                i += 1
            start = int(re.match(r"^(\d+)", s).group(1))
            toks.append(("ol", items, start)); continue
        para = [s]; i += 1
        while i < len(lines) and lines[i].strip() and not re.match(r"^(#|@@|\||>|- |\d+\.\s)", lines[i].strip()):
            para.append(lines[i].strip()); i += 1
        toks.append(("p", "\n".join(para)))
    return toks


# ---------------------------------------------------------------- компоненты
def btn(text, url, cls="primary", extra=""):
    return f'<a class="btn {cls}" {href(url)}{extra}>{text}</a>'


def tip_box(lang, inner_html):
    u = UI[lang]
    return (f'<aside class="voice tip" aria-label="{u["tip"]}"><p class="voice-label">{ico("bulb")}{u["tip"]}'
            f'<span class="muted" style="text-transform:none;letter-spacing:0;font-weight:400">· {u["tip_sub"]}</span></p>{inner_html}</aside>')


def faq_html(items):
    out = ['<div class="faq">']
    for q, ans in items:
        out.append(f'<details><summary><h3>{inl(q)}</h3><span class="tg">{ico("down", "ico sm")}</span></summary><div class="ans">{ans}</div></details>')
    out.append("</div>")
    return "".join(out)


def demo_html(lang, tid, kind=None, names=None, page_hint=""):
    cls, cover, nkk, nru, mkk, mru, ukk, uru = TPL[tid]
    u = UI[lang]
    name = nkk if lang == "kk" else nru
    alt = f"{name} — тойға шақыру билеті үлгісі" if lang == "kk" else f"Шаблон приглашения {name}"
    cap = f"«{name}» — тойға шақыру билеті үлгісі" if lang == "kk" else f"Шаблон приглашения «{name}»"
    kind = kind or ("Үйлену тойы" if lang == "kk" else "Свадьба")
    names = names or ("Айбек пен Дана" if lang == "kk" else "Айбек и Дана")
    date = "15.05.2027 · сенбі · 18:00" if lang == "kk" else "15.05.2027 · суббота · 18:00"
    openw = "Ашу" if lang == "kk" else "Открыть"
    mood = mkk if lang == "kk" else mru
    url = ukk if lang == "kk" else uru
    music = "Музыка қонақ басқанда ғана қосылады." if lang == "kk" else "Музыка включается, только если гость сам нажмёт на кнопку."
    return f'''<div class="demo">
  <figure class="demo-figure">
    <div class="phone"><div class="phone-screen {cls}">
      <div class="arch"><img src="../assets/covers/{cover}" width="300" height="370" alt="{alt}" loading="lazy" decoding="async"></div>
      <p class="kind">{kind}</p><p class="names">{names}</p><p class="date">{date}</p><span class="open" aria-hidden="true">{openw}</span>
    </div></div>
    <figcaption class="caption" style="text-align:center;margin-top:.75rem">{cap}</figcaption>
  </figure>
  <div class="demo-text">
    <span class="demo-badge">{ico("music", "ico sm")}{u["demo_badge"]}</span>
    <h3>«{name}»</h3>
    <p>{mood[0].upper() + mood[1:]}.</p>
    <div class="btn-row stack">{btn(u["demo_open"] + ico("arrow", "ico sm"), url, "primary")}{btn(u["demo_use"], "/e/new?template=" + tid, "secondary")}</div>
    <p class="caption">{music}</p>
  </div>
</div>'''


def tpl_cards(lang):
    u = UI[lang]
    out = ['<ul class="tpl-cards" role="list" style="list-style:none;margin:0;padding:0">']
    for tid in ("ak", "kok", "kyz"):
        cls, cover, nkk, nru, mkk, mru, ukk, uru = TPL[tid]
        name, mood, url = (nkk, mkk, ukk) if lang == "kk" else (nru, mru, uru)
        alt = f"{name} — тойға шақыру билеті үлгісі" if lang == "kk" else f"Шаблон приглашения {name}"
        out.append(f'''<li><figure class="tpl-card" style="margin:0"><div class="mini"><img src="../assets/covers/{cover}" width="300" height="370" alt="{alt}" loading="lazy" decoding="async"></div>
  <div><h3>«{name}»</h3><p>{mood[0].upper() + mood[1:]}</p><a class="link-more" {href(url)}>{u["demo_open"]}{ico("arrow", "ico sm")}</a></div></figure></li>''')
    out.append("</ul>")
    return "".join(out)


def tiles(items, five=False):
    out = [f'<ul class="tiles{" five" if five else ""}">']
    for label, url in items:
        if url:
            out.append(f'<li><a {href(url)}>{label}{ico("right")}</a></li>')
        else:
            out.append(f'<li><span class="soon-tile">{label} <span class="soon-badge">жақында</span></span></li>')
    out.append("</ul>")
    return "".join(out)


def related_html(lang, items, three=False, title=None):
    u = UI[lang]
    lis = "".join(f'<li><a {href(url)}><span class="ri">{ico(ic)}</span><span><span class="rk">{k}</span><b>{t}</b></span>{ico("arrow", "ico arr")}</a></li>' for k, t, url, ic in items)
    return f'<section class="related" aria-labelledby="rel-h"><h2 id="rel-h">{title or u["related"]}</h2><ul class="rel-cards{" three" if three else ""}">{lis}</ul></section>'


def cta_banner(lang, title, text, url, cta=None):
    u = UI[lang]
    return f'''<section class="cta-banner" aria-labelledby="cta-h">{orn("shanyraq", "orn")}
  <h2 id="cta-h">{title}</h2><p>{text}</p>
  <div class="btn-row">{btn(cta or u["cta"], url, "gold")}</div></section>'''


def hall_svg_file(lang):
    """Схема зала: ТӨР, стол молодых, ряды круглых столов, вход. Шрифт крупный — читается при ширине 328 px."""
    L = {"kk": ("ТӨР", "Жастар үстелі", "КІРЕБЕРІС", "құдалар"), "ru": ("ТӨР", "Стол молодых", "ВХОД", "сваты")}[lang]
    W, H = 640, 520
    parts = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}" font-family="Onest, Noto Sans, Arial, sans-serif">',
             f'<rect width="{W}" height="{H}" rx="20" fill="#FFFDF8"/>',
             f'<rect x="20" y="20" width="{W-40}" height="64" rx="14" fill="#FBF0D9" stroke="#B48A3E" stroke-width="2"/>',
             f'<text x="{W/2}" y="64" text-anchor="middle" font-size="34" font-weight="600" letter-spacing="6" fill="#7A5200">{L[0]}</text>',
             f'<rect x="{W/2-150}" y="104" width="300" height="56" rx="28" fill="#F1DFB0" stroke="#7A5200" stroke-width="2"/>',
             f'<text x="{W/2}" y="141" text-anchor="middle" font-size="26" font-weight="600" fill="#17202C">{L[1]}</text>']
    import math
    fills = ["#F1DFB0", "#F1DFB0", "#D3E4EE", "#E2DDF2", "#F6DCCB", "#D5ECE5", "#E5E0D5", "#F2D8E0"]
    k = 0
    for row, y in enumerate((236, 356)):
        for col in range(4):
            x = 100 + col * 147
            fill = fills[k] if k < 2 else fills[2 + (k % 6)]
            for c in range(10):
                a = c * math.pi / 5
                parts.append(f'<circle cx="{x + 52*math.cos(a):.1f}" cy="{y + 52*math.sin(a):.1f}" r="9" fill="#6E7480"/>')
            parts.append(f'<circle cx="{x}" cy="{y}" r="38" fill="{fill}" stroke="rgba(23,32,44,.28)" stroke-width="2"/>')
            parts.append(f'<text x="{x}" y="{y+11}" text-anchor="middle" font-size="30" font-weight="600" fill="#17202C">{k+1}</text>')
            k += 1
    parts.append(f'<text x="{100+73}" y="306" text-anchor="middle" font-size="22" fill="#535C69">{L[3]}</text>')
    parts.append(f'<rect x="{W/2-90}" y="{H-58}" width="180" height="38" rx="10" fill="#EEE6D6" stroke="#857760" stroke-width="2"/>')
    parts.append(f'<text x="{W/2}" y="{H-31}" text-anchor="middle" font-size="22" font-weight="600" letter-spacing="3" fill="#17202C">{L[2]}</text></svg>')
    name = "otyrgyzu-sxemasy.svg" if lang == "kk" else "rassadka-gostei-shema.svg"
    (OUT / "assets" / name).write_text("\n".join(parts), encoding="utf-8")
    return name


# ---------------------------------------------------------------- рендер токенов
class R:
    def __init__(self, lang, cfg):
        self.lang, self.cfg, self.u = lang, cfg, UI[lang]
        self.h2s = []

    def render(self, toks):
        out, i = [], 0
        while i < len(toks):
            t = toks[i]
            k = t[0]
            if k == "block":
                spec = t[1]
                name = spec.split()[0].lower() if spec else ""
                if name in ("faq",):
                    j, items = self.collect_faq(toks, i + 1)
                    out.append(faq_html(items)); i = j; continue
                if name == "tilek-list":
                    j = self.find_end(toks, i + 1)
                    out.append(self.tilek_list(toks[i + 1:j])); i = j + 1; continue
                if name == "invite-text-cards":
                    j = self.find_end(toks, i + 1)
                    out.append(self.invite_cards(toks[i + 1:j])); i = j + 1; continue
                if name in ("template-cards", "templatecards"):
                    j = self.find_end(toks, i + 1, soft=True)
                    out.append(tpl_cards(self.lang)); i = j + 1 if j < len(toks) and toks[j][0] == "end" else i + 1; continue
                if name in ("toi-cards", "toitypecards", "occasion-cards"):
                    if name == "toitypecards":
                        items = [(re.sub(r"\s*\(.*?\)", "", a).strip(), b.split()[0]) for a, b in re.findall(r"- (.+?) → (\S+)", spec)]
                        out.append(tiles(items)); i += 1; continue
                    j = self.find_end(toks, i + 1)
                    items = []
                    for tk in toks[i + 1:j]:
                        if tk[0] == "ul":
                            for it in tk[1]:
                                m = re.match(r"\[(.+?)\]\((.+?)\)", it)
                                items.append((m.group(1), m.group(2)) if m else (it.strip(), None))
                    out.append(tiles(items, five=(name == "occasion-cards"))); i = j + 1; continue
                if name in ("cta", "cta-secondary"):
                    j = i; btns = []
                    while j < len(toks) and toks[j][0] == "block" and toks[j][1].split()[0].lower() in ("cta", "cta-secondary"):
                        btns.append(self.parse_cta(toks[j][1])); j += 1
                    out.append(self.cta_row(btns)); i = j; continue
                if name in ("demo-invite", "demoinvite"):
                    m = re.search(r"(ak-shanyra[qk]|kok-tun|qyzgaldaq|kyzgaldak)", spec)
                    tid = TPL_ALIAS[m.group(1)]
                    out.append(demo_html(self.lang, tid, **self.cfg.get("demo_args", {}))); i += 1; continue
                if name == "caption":
                    out.append(f'<p class="caption">{re.search(chr(34) + "(.+?)" + chr(34), spec).group(1)}.</p>'); i += 1; continue
                if name == "related-cluster":
                    if self.cfg.get("related"):
                        out.append(related_html(self.lang, self.cfg["related"], three=len(self.cfg["related"]) == 3))
                    i += 1; continue
                if name == "print-checklist":
                    out.append(f'<p><button class="btn secondary" type="button" onclick="window.print()">{ico("printer")}{self.u["print"]}</button></p>'); i += 1; continue
                if name == "hallscheme":
                    f = hall_svg_file(self.lang)
                    alt = re.search(r"alt: «(.+?)»", spec).group(1)
                    cap = "Стол молодых — обычно у төра. Это ориентир, а не правило." if self.lang == "ru" else ""
                    out.append(f'<figure class="figure"><img src="assets/{f}" width="640" height="520" alt="{alt}" loading="lazy" decoding="async"><figcaption>{cap}</figcaption></figure>'); i += 1; continue
                if name == "tablecalc":
                    out.append(self.calc()); i += 1; continue
                if name == "screenshot":
                    out.append('<figure class="figure" style="max-width:22rem"><img src="../screenshots/03-hall_360.png" width="360" height="740" alt="Экран «Зал» в {BRAND}: круглые столы, төр и стол молодых, вымышленные данные" loading="lazy" decoding="async"><figcaption>Экран «Зал» с вымышленными данными.</figcaption></figure>'.replace("{BRAND}", "сервисе")); i += 1; continue
                i += 1; continue  # callout и прочие маркеры-обёртки
            if k == "end" or k == "hr":
                i += 1; continue
            if k == "h":
                lvl, text, hid = t[1], t[2], t[3]
                if lvl == 1:
                    i += 1; continue
                hid = hid or slug(text)
                if lvl == 2 and text.strip() in ("Дереккөздер", "Источники"):
                    j = i + 1
                    out.append(self.sources(toks[j][1] if j < len(toks) and toks[j][0] == "ul" else []))
                    i = j + 1; continue
                if lvl == 2:
                    self.h2s.append((hid, re.sub(r"<[^>]+>", "", inl(text))))
                out.append(f'<h{lvl} id="{hid}">{inl(text)}</h{lvl}>'); i += 1; continue
            if k == "p":
                out.append(self.para(t[1])); i += 1; continue
            if k == "ul":
                out.append("<ul>" + "".join(f"<li>{inl(x)}</li>" for x in t[1]) + "</ul>"); i += 1; continue
            if k == "ol":
                out.append(f'<ol class="steps">' + "".join(f"<li>{inl(x)}</li>" for x in t[1]) + "</ol>"); i += 1; continue
            if k == "table":
                rows = t[1]
                head = "".join(f'<th scope="col"{" class=num" if re.fullmatch(r"[\d ]+", rows[1][n] if len(rows) > 1 else "") else ""}>{inl(c)}</th>' for n, c in enumerate(rows[0]))
                body = "".join("<tr>" + "".join(f'<td{" class=num" if re.fullmatch(r"[\d ]+", c) else ""}>{inl(c)}</td>' for c in r) + "</tr>" for r in rows[1:])
                out.append(f'<div class="table-wrap" tabindex="0" role="region" aria-label="{re.sub(r"<[^>]+>", "", inl(rows[0][0]))}"><table><thead><tr>{head}</tr></thead><tbody>{body}</tbody></table></div>'); i += 1; continue
            if k == "quote":
                inner = t[1]
                first = inner[0][1] if inner and inner[0][0] == "p" else ""
                if re.match(r"\*\*(Біздің кеңес|Наш совет)\.\*\*", first):
                    inner = [("p", re.sub(r"^\*\*(Біздің кеңес|Наш совет)\.\*\*\s*", "", first))] + inner[1:]
                    sub = R(self.lang, self.cfg)
                    body = sub.render([x for x in inner if not (x[0] == "p" and not x[1].strip())]).replace('<ol class="steps">', "<ol>")
                    out.append(tip_box(self.lang, body))
                else:
                    out.append("<blockquote>" + R(self.lang, self.cfg).render(inner) + "</blockquote>")
                i += 1; continue
            i += 1
        return "\n".join(out)

    def para(self, s):
        s2 = s.strip()
        if re.fullmatch(r"\*[^*].*[^*]\*", s2) and "Мәтінді тексерген" in s2:
            return f'<p class="reviewed">{ico("shield")}<span>{inl(s2.strip("*"))}</span></p>'
        if re.fullmatch(r"\*[^*].*[^*]\*", s2):
            return f'<p class="caption">{inl(s2.strip("*"))}</p>'
        return f"<p>{inl(s2)}</p>"

    def find_end(self, toks, j, soft=False):
        while j < len(toks) and toks[j][0] != "end":
            if soft and toks[j][0] in ("h", "block"):
                return j
            j += 1
        return j

    def collect_faq(self, toks, j):
        items, cur = [], None
        stop = self.cfg.get("faq_stop")
        while j < len(toks):
            t = toks[j]
            if t[0] == "end" or t[0] == "hr" or (t[0] == "h" and t[1] <= 2) or t[0] == "block":
                if t[0] == "end":
                    j += 1
                break
            if t[0] == "p" and stop and re.search(stop, t[1]):
                break
            if t[0] == "h" and t[1] == 3:
                cur = [t[2], []]; items.append(cur)
            elif cur is not None:
                cur[1].append(self.para(t[1]) if t[0] == "p" else R(self.lang, self.cfg).render([t]))
            j += 1
        return j, [(q, "".join(a)) for q, a in items]

    def parse_cta(self, spec):
        m = re.search(r'text="(.+?)"', spec) or re.search(r'"(.+?)"', spec)
        text = m.group(1)
        u = re.search(r'href="(.+?)"', spec)
        sec = "secondary" in spec.lower()
        return (text, u.group(1) if u else "#", sec)

    def cta_row(self, btns):
        hero = ' data-hero-cta' if not getattr(self, "_hero_done", False) else ""
        self._hero_done = True
        b = "".join(btn(t, u, "secondary" if s else "primary") for t, u, s in btns)
        return f'<div class="btn-row stack"{hero}>{b}</div>'

    # ---------- тілек
    def tilek_list(self, toks):
        cfg = self.cfg["tilek"]
        out, gi, cards_open = [], -1, False
        u = self.u
        def close():
            nonlocal cards_open
            if cards_open:
                out.append("</div></section>"); cards_open = False
        for t in toks:
            if t[0] == "h" and t[1] == 2:
                close(); gi += 1
                gid, who = cfg["groups"][gi], cfg["who"][gi]
                self.h2s.append((gid, re.sub(r"<[^>]+>", "", inl(t[2]))))
                out.append(f'<section class="tilek-group" aria-labelledby="{gid}"><h2 id="{gid}">{inl(t[2])}</h2>')
                self._who = who; self._gid = gid
                continue
            if t[0] != "p":
                continue
            s = t[1].strip()
            m = re.match(r"^\*\*(\d+)\.\*\*\s*\*([^*]+)\*\s*—\s*(.*)$", s, re.S)
            if not m:
                if re.fullmatch(r"\*\*[^*]+\*\*", s):  # подгруппа в хабе
                    if cards_open:
                        out.append("</div>"); cards_open = False
                    out.append(f'<h3 style="margin-top:1.5rem">{s.strip("*")}</h3>')
                else:
                    if cards_open:
                        out.append("</div>"); cards_open = False
                    out.append(f'<p class="g-intro">{inl(s)}</p>')
                continue
            if not cards_open:
                out.append('<div class="cards">'); cards_open = True
            out.append(self.tcard(int(m.group(1)), m.group(2).strip(), m.group(3)))
        close()
        empty = f'<div class="empty" data-empty hidden><p style="margin:0 0 .5rem">{u["empty"]}</p><button class="btn secondary" type="button" data-reset>{u["reset"]}</button></div>'
        return empty + "\n".join(out)

    def tcard(self, no, lenlabel, text):
        u, cfg = self.u, self.cfg["tilek"]
        folk = "⟦folk⟧" in text
        text = text.replace("⟦folk⟧", "").strip()
        text = re.sub(r"^<br>\s*", "", text)
        poem = "<br>" in text
        frm = None
        mm = re.match(r"^\((\w+)\)\s*", text)
        if mm:
            frm, text = mm.group(1), text[mm.end():]
        lenmap = {"қысқа": "qysqa", "орташа": "ortasha", "ұзақ": "uzaq", "короткий": "qysqa"}
        lk = lenmap.get(lenlabel)
        tags = []
        if lk:
            tags.append(f'<span class="tag len" data-len="{lk}"><span class="sr-only">{u["length"]}: </span>{u["lens"][lk]}</span>')
        if folk:
            tags.append(f'<span class="tag folk">{ico("quote", "ico")}{"халық батасы" if lenlabel == "халық батасы" else u["folk"].lower()}</span>')
        if poem:
            tags.append('<span class="tag poem">өлең</span>')
        if self._gid in cfg.get("bata_groups", []) and not folk:
            tags.append('<span class="tag bata">бата</span>')
        if frm:
            tags.append(f'<span class="tag from">{frm}</span>')
        who = self._who
        if cfg.get("hub"):
            who = " ".join(x for x in (("poem" if poem else ""), ("bata" if (folk or self._gid in cfg.get("bata_groups", [])) else "")) if x) or "prose"
        lines = [re.sub(r"\s+", " ", x).strip() for x in re.split(r"<br>\s*", text)]
        body = "\n".join(inl(x) for x in lines if x) if poem else inl(text)
        plain = re.sub(r"<[^>]+>", "", body)
        # Без JS ссылка несёт только адрес карточки (лёгкий HTML); островок по нажатию подставляет сам текст.
        wa = "https://wa.me/?text=" + urllib.parse.quote("https://{DOMAIN}" + self.cfg["url"] + f"?utm_source=tilek_share#t{no}")
        src = ""
        return f'''<article class="tcard" id="t{no}" data-who="{who}" data-len="{lk or 'folk'}" aria-label="№ {no}">
  <div class="tcard-top"><span class="tcard-no">№ {no}</span>{"".join(tags)}</div>
  <p class="tcard-text{" poem" if poem else ""}">{body}</p>{src}
  <div class="tcard-actions"><button class="btn row copy" type="button" data-copy>{ico("copy", "ico sm")}<span class="lbl">{u["copy"]}</span></button><a class="btn row wa" href="{wa}" data-wa target="_blank" rel="noopener" aria-label="{u["wa_full"]}">{ico("wa", "ico sm fill")}<span>{u["wa"]}</span></a></div>
</article>'''

    # ---------- тексты приглашения
    def invite_cards(self, toks):
        u = self.u
        out, open_ = [], False
        label = None
        for t in toks:
            if t[0] == "p" and re.fullmatch(r"\*\*[^*]+\*\*", t[1].strip()):
                if open_:
                    out.append("</div>"); open_ = False
                label = t[1].strip().strip("*")
                out.append(f'<h3 style="margin-top:1.5rem">{label}</h3>')
                continue
            if t[0] == "ol":
                if not open_:
                    out.append('<div class="cards">'); open_ = True
                for n, it in enumerate(t[1]):
                    no = t[2] + n
                    parts = it.split("\n")
                    def fill(s):
                        return re.sub(r"\[([^\]]+)\](?!\()", r'<span class="fill">[\1]</span>', inl(s))
                    body = fill(parts[0]) + "".join(f'<span class="tr-ru" lang="ru">{fill(p)}</span>' for p in parts[1:])
                    tag = '<span class="tag from">{BRAND} үлгісі</span>'.replace("{BRAND}", '<span class="brand-ph">{BRAND}</span>') if label == "Үлгі мәтіндер" else ""
                    out.append(f'''<article class="tcard" id="m{no}" aria-label="№ {no}"><div class="tcard-top"><span class="tcard-no">№ {no}</span>{tag}</div>
  <p class="tcard-text">{body}</p>
  <div class="tcard-actions"><button class="btn row copy" type="button" data-copy>{ico("copy", "ico sm")}<span class="lbl">{u["copy"]}</span></button>{btn(u["use_text"], self.cfg.get("cta_url", "/e/new"), "row secondary")}</div></article>''')
        if open_:
            out.append("</div>")
        return "\n".join(out)

    def sources(self, items):
        lis = []
        for n, it in enumerate(items, 1):
            m = re.match(r"(.*?)\s+—\s+(https?://\S+)$", it)
            if m:
                host = urllib.parse.urlparse(m.group(2)).netloc
                lis.append(f'<li id="src-{n}">{inl(m.group(1))} — <a href="{m.group(2)}" rel="noopener" target="_blank">{host}{ico("ext", "ico sm")}</a></li>')
            else:
                lis.append(f'<li id="src-{n}">{inl(it)}</li>')
        return f'<section class="sources" aria-labelledby="src-h"><h2 id="src-h">{ico("book")}{self.u["sources"]}</h2><ol>{"".join(lis)}</ol></section>'

    def calc(self):
        return '''<form class="calc" data-calc action="#" method="get" aria-labelledby="calc-h">
  <h3 id="calc-h">Калькулятор столов</h3>
  <div class="calc-grid">
    <div class="field"><label for="g">Гостей</label><input id="g" name="guests" type="number" inputmode="numeric" min="1" value="150"></div>
    <div class="field"><label for="p">Мест за столом</label><select id="p" name="per"><option value="10">10</option><option value="11">11</option><option value="12" selected>12</option></select></div>
    <button class="btn primary" type="submit">Посчитать</button>
  </div>
  <p class="calc-out" role="status" aria-live="polite"><span data-calc-g>150</span> гостей, по <span data-calc-p>12</span> мест → <b data-calc-out>13</b> столов</p>
</form>'''


# ---------------------------------------------------------------- каркас страницы
def head(lang, fm, cfg):
    title = fm.get("title", "") + " · {BRAND}"
    alts = ""
    if cfg.get("pair_url"):
        kk, ru = (cfg["url"], cfg["pair_url"]) if lang == "kk" else (cfg["pair_url"], cfg["url"])
        if cfg.get("pair_real", True):
            alts = (f'\n<link rel="alternate" hreflang="kk-KZ" href="https://{{DOMAIN}}{kk}">'
                    f'\n<link rel="alternate" hreflang="ru-KZ" href="https://{{DOMAIN}}{ru}">'
                    f'\n<link rel="alternate" hreflang="x-default" href="https://{{DOMAIN}}{kk}">')
    preload = ("../assets/fonts/cormorant-garamond-600-kk.woff2" if cfg["tpl"] == "landing" or cfg.get("hub") else "../assets/fonts/onest-600-kk.woff2")
    return f'''<!doctype html>
<html lang="{lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title}</title>
<meta name="description" content="{fm.get("description", "")}">
<link rel="canonical" href="https://{{DOMAIN}}{cfg["url"]}">{alts}
<!-- Макет: сгенерирован design/v2/tools/gen_site.py из {cfg["src"]}. Состояния (#hash): {cfg.get("states", "—")} -->
<link rel="preload" href="{preload}" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="css/site.css">
</head>'''


def header(lang, cfg):
    u = UI[lang]
    cur = cfg.get("nav")
    nav = "".join(f'<a {href(url)}{" aria-current=page" if key == cur else ""}>{label}</a>' for key, label, url, _ in u["nav"])
    pair = cfg.get("pair_url") or cfg.get("lang_fallback")
    kk_el = '<span aria-current="true" lang="kk">ҚАЗ</span>' if lang == "kk" else f'<a {href(pair)} hreflang="kk" lang="kk" aria-label="Қазақша">ҚАЗ</a>'
    ru_el = '<span aria-current="true" lang="ru">РУС</span>' if lang == "ru" else f'<a {href(pair)} hreflang="ru" lang="ru" aria-label="Русский">РУС</a>'
    lang_sw = f'<nav class="lang" aria-label="{u["lang"]}">{kk_el}{ru_el}</nav>'
    items = []
    for key, label, url, desc in u["nav"]:
        d = f"<small>{desc}</small>" if desc else f'<small><span class="soon-badge">{u["soon"]}</span></small>'
        items.append(f'<li><a {href(url)}{" aria-current=page" if key == cur else ""}><b>{label}</b>{d}{ico("right")}</a></li>')
    extra = (f'<li><a {href("/kk/suraqtar")}><b>Сұрақтар</b><small>Жиі қойылатын сұрақтар</small>{ico("right")}</a></li>' if lang == "kk"
             else f'<li><a {href("/ru/voprosy")}><b>Вопросы</b><small>Частые вопросы</small>{ico("right")}</a></li>')
    sub = "".join(f'<a class="chip" {href(url)}>{t}</a>' for t, url in u["sub"])
    return f'''<body{' class="has-sticky"' if cfg.get("sticky") else ""}>
<a class="skip" href="#main">{u["skip"]}</a>
<header class="site-header">
  <div class="wrap">
    <a class="brand" {href("/" + lang)} aria-label="{{BRAND}} — {u["home"]}">{orn("shanyraq", "")}<span class="brand-name">{{BRAND}}</span></a>
    <nav class="nav" aria-label="{u["menu"]}">{nav}</nav>
    {lang_sw}
    {btn(u["cta"], "/login?next=/e/new", "primary header-cta")}
    <details class="menu">
      <summary aria-label="{u["menu"]}">{ico("menu", "ico i-open")}{ico("x", "ico i-close")}<span>{u["menu"]}</span></summary>
      <div class="menu-panel">
        <ul class="menu-list">{"".join(items[:1])}</ul>
        <div class="menu-sub">{sub}</div>
        <ul class="menu-list">{"".join(items[1:])}{extra}</ul>
        <div class="menu-foot">
          <div class="menu-lang"><span>{u["lang"]}</span>{lang_sw}</div>
          {btn(u["cta"], "/login?next=/e/new", "primary block")}
        </div>
      </div>
    </details>
  </div>
</header>'''


def crumbs(lang, cfg):
    if not cfg.get("crumbs"):
        return ""
    lis = "".join(f'<li><a {href(url)}>{t}</a></li>' for t, url in cfg["crumbs"])
    label = "Навигациялық жол" if lang == "kk" else "Навигационная цепочка"
    return f'<nav class="crumbs wrap" aria-label="{label}"><ol>{lis}<li><span aria-current="page">{cfg["crumb_self"]}</span></li></ol></nav>'


def footer(lang, cfg):
    u = UI[lang]
    cols = "".join(f'<div class="foot-col"><h2>{h}</h2><ul>{"".join(f"<li><a {href(url)}>{t}</a></li>" for t, url in links)}</ul></div>' for h, links in u["foot_cols"])
    pair = cfg.get("pair_url") or cfg.get("lang_fallback")
    kk_el = '<span aria-current="true">Қазақша</span>' if lang == "kk" else f'<a {href(pair)} hreflang="kk" lang="kk">Қазақша</a>'
    ru_el = '<span aria-current="true">Русский</span>' if lang == "ru" else f'<a {href(pair)} hreflang="ru" lang="ru">Русский</a>'
    sticky = (f'<div class="sticky-cta is-hidden">{btn(u["cta"], cfg.get("cta_url", "/login?next=/e/new"), "primary")}</div>' if cfg.get("sticky") else "")
    return f'''<footer class="site-footer">
  <div class="wrap">
    <div class="foot-grid">
      <div><a class="foot-brand" {href("/" + lang)}>{orn("shanyraq", "")}{{BRAND}}</a><p class="foot-about">{inl(u["foot_about"])}</p></div>
      {cols}
    </div>
    <div class="foot-bottom"><span>{inl(u["copyright"])}</span><nav class="lang" aria-label="{u["lang"]}">{kk_el}{ru_el}</nav></div>
  </div>
</footer>
{sticky}
<div class="toast" id="toast" role="status" aria-live="polite" hidden>{ico("check")}<span class="msg"></span></div>
<script src="js/site.js" defer></script>
</body>
</html>'''


# ---------------------------------------------------------------- шаблоны страниц
def split_intro(toks):
    """H1, вступление (абзацы до первого H2/блока-контейнера) и остальное."""
    h1 = next(t[2] for t in toks if t[0] == "h" and t[1] == 1)
    idx = next(i for i, t in enumerate(toks) if t[0] == "h" and t[1] == 1)
    intro, j = [], idx + 1
    while j < len(toks) and toks[j][0] == "p":
        intro.append(toks[j][1]); j += 1
    return h1, intro, toks[j:]


def apply_transforms(html, cfg):
    for old, new in cfg.get("transforms", []):
        if old not in html:
            raise SystemExit(f"[transform] не найдено в {cfg['out']}: {old[:70]}…")
        html = html.replace(old, new, 1)
    return html


def page_article(fm, toks, cfg):
    lang = cfg["lang"]; u = UI[lang]
    h1, intro, rest = split_intro(toks)
    r = R(lang, cfg)
    # CTA сразу после вступления → в шапку статьи
    hero_cta = ""
    if rest and rest[0][0] == "block" and rest[0][1].split()[0].lower() == "cta":
        hero_cta = r.cta_row([r.parse_cta(rest[0][1])]); rest = rest[1:]
    # финальный CTA → баннер
    final = None
    if rest and rest[-1][0] == "block" and rest[-1][1].split()[0].lower() == "cta":
        final = r.parse_cta(rest[-1][1]); rest = rest[:-1]
    body = r.render(rest)
    meta = ""
    if cfg.get("meta"):
        meta = (f'<div class="page-meta"><span>{ico("clock")}{u["updated"]}: <span class="ph">{{UPDATED}}</span></span>'
                f'<span>{ico("shield")}{u["reviewed"]}: <span class="ph">{{REVIEWER}}</span></span></div>')
    lead = f'<p class="lead">{inl(intro[0])}</p>' + "".join(f"<p>{inl(p)}</p>" for p in intro[1:]) if intro else ""
    toc_items = "".join(f'<li><a href="#{i}">{t}</a></li>' for i, t in r.h2s)
    toc_m = f'<details class="toc" data-m><summary>{u["toc"]}{ico("down")}</summary><ol>{toc_items}</ol></details>' if cfg.get("toc") else ""
    toc_d = f'<nav class="toc" aria-label="{u["toc"]}"><p class="toc-title">{u["toc"]}</p><ol>{toc_items}</ol></nav>' if cfg.get("toc") else ""
    aside_cta = (f'<div class="voice practice" style="background:var(--paper);border-color:var(--line)"><p class="voice-label" style="color:var(--ink)">{ico("send")}{cfg["aside_cta"][0]}</p><p class="small">{cfg["aside_cta"][1]}</p>'
                 f'<p style="margin-top:.75rem">{btn(u["cta"], cfg.get("cta_url", "/login?next=/e/new"), "primary block")}</p></div>') if cfg.get("aside_cta") else ""
    is_tilek = cfg["tpl"] == "tilek"
    filt = tilek_filter(lang, cfg, r) if is_tilek else ""
    aside = f'<aside class="article-aside{" tilek-aside" if is_tilek else ""}" aria-label="{u["sections"] if is_tilek else u["toc"]}"><div class="sticky">{filt}{toc_d}{aside_cta}</div></aside>'
    banner = ""
    if final or cfg.get("banner"):
        t, txt = cfg["banner"]
        banner = f'<div class="wrap section">{cta_banner(lang, t, txt, final[1] if final else cfg.get("cta_url", "/login?next=/e/new"), final[0] if final else None)}</div>'
    h1cls = "t-hero" if cfg.get("hub") else "t-h1"
    html = f'''{head(lang, fm, cfg)}
{header(lang, cfg)}
<main id="main">
{crumbs(lang, cfg)}
<div class="wrap">
  <header class="page-head">
    <h1 class="{h1cls}">{inl(h1)}</h1>
    {lead}
    {meta}
    {('<div style="margin-top:1.25rem">' + hero_cta + '</div>') if hero_cta else ""}
  </header>
  <div class="article-layout{" is-tilek" if is_tilek else ""}">
    {aside}
    <div class="article-main">
      {toc_m}
      <div class="prose">
{body}
      </div>
    </div>
  </div>
</div>
{banner}
</main>
{footer(lang, cfg)}'''
    return apply_transforms(html, cfg)


def tilek_filter(lang, cfg, r):
    u = UI[lang]; tc = cfg["tilek"]
    who = "".join(f'<button class="chip" type="button" data-f="who:{k}" aria-pressed="{str(k == "all").lower()}">{t}</button>' for k, t in tc["who_chips"])
    ln = "".join(f'<button class="chip" type="button" data-f="len:{k}" aria-pressed="{str(k == "all").lower()}">{t}</button>' for k, t in [("all", u["all"]), ("qysqa", "Қысқа"), ("ortasha", "Орташа"), ("uzaq", "Ұзақ")])
    groups = "".join(f'<a href="#{g}">{t}</a>' for g, t in zip(tc["groups"], tc["group_labels"]))
    return f'''<details class="filter" data-filter-wrap>
  <summary>{ico("filter", "ico sm")}{u["filter"]}<span class="count" data-filter-sum>{tc["total"]} тілек</span>{ico("down", "ico chev")}</summary>
  <div class="filter-body" data-filter>
    <fieldset class="filter-group"><legend>{tc.get("who_label", u["who"])}</legend><div class="chips">{who}</div></fieldset>
    <fieldset class="filter-group"><legend>{u["length"]}</legend><div class="chips">{ln}</div></fieldset>
    <div class="filter-status"><span data-filter-count role="status" aria-live="polite"></span><button type="button" data-reset>{u["reset"]}</button></div>
    <div class="filter-group"><p>{u["sections"]}</p><nav class="group-nav" aria-label="{u["sections"]}">{groups}</nav></div>
  </div>
</details>'''


def page_landing(fm, toks, cfg):
    lang = cfg["lang"]; u = UI[lang]
    h1, intro, rest = split_intro(toks)
    r = R(lang, cfg)
    ctas = []
    while rest and rest[0][0] == "block" and rest[0][1].split()[0].lower() in ("cta", "cta-secondary"):
        ctas.append(r.parse_cta(rest[0][1])); rest = rest[1:]
    final = None
    if rest and rest[-1][0] == "block" and rest[-1][1].split()[0].lower() == "cta":
        final = r.parse_cta(rest[-1][1]); rest = rest[:-1]
    # секции по H2
    secs, cur = [], None
    for t in rest:
        if t[0] == "h" and t[1] == 2:
            cur = [t, []]; secs.append(cur)
        elif cur is not None:
            cur[1].append(t)
    out = []
    for n, (h, body) in enumerate(secs):
        title, hid = h[2], h[3] or slug(h[2])
        conf = next((c for key, c in cfg["sections"].items() if title.startswith(key)), {})
        kind = conf.get("kind", "plain")
        bg = " bg-paper" if conf.get("paper") else ""
        if kind == "how":
            pre = [t for t in body if t[0] == "p"]
            ol = next(t for t in body if t[0] == "ol")
            lis = []
            for it in ol[1]:
                m = re.match(r'(<a id="(\w+)"></a>)?\*\*(.+?)\*\*\s*(.*)', it, re.S)
                aid = f' id="{m.group(2)}"' if m.group(2) else ""
                lis.append(f'<li{aid}><div class="h-top"><h3>{m.group(3).rstrip(".")}</h3></div><p>{inl(m.group(4))}</p></li>')
            after = [t for t in body if t[0] == "p" and body.index(t) > body.index(ol)]
            pre_ = [t for t in pre if body.index(t) < body.index(ol)]
            out.append(f'<section class="section{bg}" aria-labelledby="{hid}"><div class="wrap"><div class="section-head"><h2 id="{hid}">{inl(title)}</h2>{"".join(r.para(p[1]) for p in pre_)}</div><ol class="how">{"".join(lis)}</ol>'
                       f'{"".join(f"<div class=prose style=max-width:var(--measure);margin-top:1.5rem>{r.para(p[1])}</div>" for p in after)}</div></section>')
            continue
        inner = R(lang, cfg).render(body)
        if kind == "feature":
            art = conf.get("art", "")
            rev = " rev" if conf.get("rev") else ""
            out.append(f'<section class="section{bg}" aria-labelledby="{hid}"><div class="wrap"><div class="feature{rev}"><div class="f-text prose"><h2 id="{hid}">{inl(title)}</h2>{inner}</div><div class="f-art" aria-hidden="true">{art}</div></div></div></section>')
        elif kind == "demo":
            out.append(f'<section class="section{bg}" aria-labelledby="{hid}"><div class="wrap"><div class="section-head prose"><h2 id="{hid}">{inl(title)}</h2></div><div class="prose" style="max-width:none">{inner}</div></div></section>')
        else:
            out.append(f'<section class="section{bg}" aria-labelledby="{hid}"><div class="wrap"><div class="prose" style="max-width:{conf.get("width", "var(--measure)")}"><h2 id="{hid}">{inl(title)}</h2>{inner}</div></div></section>')
    btns = "".join(btn(t, uu, "secondary" if s else "primary") for t, uu, s in ctas)
    t, txt = cfg["banner"]
    html = f'''{head(lang, fm, cfg)}
{header(lang, cfg)}
<main id="main">
<section class="hero" aria-labelledby="h1">
  {orn("shanyraq", "orn-bg")}
  <div class="wrap hero-grid">
    <div>
      <h1 id="h1" class="t-hero">{inl(h1)}</h1>
      <p class="lead">{inl(intro[0])}</p>
      <div class="btn-row stack" data-hero-cta>{btns}</div>
      <ul class="trust">{"".join(f"<li>{ico('check')}{x}</li>" for x in cfg["trust"])}</ul>
    </div>
    <div class="hero-art" aria-hidden="true">{cfg["hero_art"]}</div>
  </div>
</section>
{"".join(out)}
<div class="wrap section">{cta_banner(lang, t, txt, final[1] if final else "/e/new", final[0] if final else None)}</div>
</main>
{footer(lang, cfg)}'''
    return apply_transforms(html, cfg)


# ---------------------------------------------------------------- иллюстрации (мини-UI)
def art_lists(lang):
    rows = ([("Әкесі", "Ерлан ағай отбасы", "4 адам"), ("Анасы", "Сәуле апай отбасы", "3 адам"), ("Жастар", "Курстастар", "6 адам")] if lang == "kk"
            else [("Папа", "Семья Ерлана", "4 чел."), ("Мама", "Семья Сауле", "3 чел."), ("Молодые", "Однокурсники", "6 чел.")])
    tot = "Барлығы бір тойда · 1 тізім" if lang == "kk" else "Всё в одном списке тоя"
    return "".join(f'<div class="ui-row"><span><span class="ui-pill who">{a}</span> <b>{b}</b></span><span class="muted">{c}</span></div>' for a, b, c in rows) + f'<div class="ui-total">{tot}</div>'


def art_replies(lang):
    if lang == "kk":
        rows = [("Ерлан ағай отбасы", "yes", "Келеміз · 4"), ("Сәуле апай отбасы", "wait", "Жауап жоқ"), ("Бақыт аға отбасы", "yes", "Келеміз · 2")]
        tot = ("Мейрамханаға:", "240 адам → 24 үстел")
    else:
        rows = [("Семья Ерлана", "yes", "Придём · 4"), ("Семья Сауле", "wait", "Не ответили"), ("Семья Бахыта", "yes", "Придём · 2")]
        tot = ("Для ресторана:", "240 человек → 24 стола")
    return "".join(f'<div class="ui-row"><b>{a}</b><span class="ui-pill {b}">{c}</span></div>' for a, b, c in rows) + f'<div class="ui-total"><span>{tot[0]}</span><span>{tot[1]}</span></div>'


def art_hall(lang):
    f = hall_svg_file(lang)
    return f'<img src="assets/{f}" width="640" height="520" alt="" loading="lazy" decoding="async">'


def art_door(lang):
    q, name, tbl, ok = (("Ер", "Ерлан ағай отбасы", "7-үстел", "Келді") if lang == "kk" else ("Ер", "Семья Ерлана", "стол 7", "Пришли"))
    return (f'<div class="ui-row" style="background:var(--paper);border:1.5px solid var(--line-strong);min-height:3.5rem">{ico("offline", "ico sm")}<span style="flex:1">{q}|</span></div>'
            f'<div class="ui-row" style="margin-top:.75rem"><span><b>{name}</b><br><span class="muted">{tbl}</span></span><span class="ui-pill yes">{ico("check", "ico sm")} {ok}</span></div>')


def art_hero(lang):
    if lang == "kk":
        a, b, c, d = "Сізге тойға шақыру келді", "Келеміз · 4 орын", "Сіздің үстеліңіз", "7"
    else:
        a, b, c, d = "Вам приглашение на той", "Придём · 4 места", "Ваш стол", "7"
    return f'''<div style="display:grid;gap:.875rem;max-width:22rem;margin-left:auto">
  <div class="f-art" style="padding:1rem;border-radius:1.25rem 1.25rem 1.25rem .25rem;background:#E7F6EC;border-color:#CBE8D4"><p style="margin:0;font-weight:600;display:flex;align-items:center;gap:.5rem;color:var(--success-ink)">{ico("wa", "ico sm fill")}WhatsApp</p><p style="margin:.375rem 0 0">{a}</p><p style="margin:.25rem 0 0;color:var(--lapis);text-decoration:underline">https://…/i/••••</p></div>
  <div class="f-art" style="padding:1rem;display:flex;flex-wrap:wrap;gap:.5rem;justify-content:space-between;align-items:center"><b>{"Ерлан ағай отбасы" if lang == "kk" else "Семья Ерлана"}</b><span class="ui-pill yes">{b}</span></div>
  <div class="f-art" style="padding:1.25rem;text-align:center;background:var(--night);color:var(--on-night);border-color:var(--night)"><p style="margin:0;color:var(--on-night-2)">{c}</p><p style="margin:.25rem 0 0;font:600 4rem/1 var(--font-display);color:var(--gold-bright)">{d}</p></div>
</div>'''


def art_order():
    cats = [("Құдалар", "#F1DFB0"), ("Нағашылар", "#E2DDF2"), ("Өз туыстар", "#D3E4EE"), ("Достар", "#F6DCCB"), ("Әріптестер", "#E5E0D5")]
    rows = "".join(f'<div class="ui-row"><span style="display:flex;align-items:center;gap:.625rem"><b class="num" style="width:1.5rem">{n}</b><span style="width:.75rem;height:.75rem;transform:rotate(45deg);background:{c};outline:1px solid rgba(23,32,44,.3)"></span>{t}</span><span class="muted small">{"төрге жақын" if n == 1 else ""}</span></div>' for n, (t, c) in enumerate(cats, 1))
    return f'<figure class="figure" style="margin-top:1.25rem"><div aria-hidden="true">{rows}</div><figcaption>«Отырғызу реті»: тізімде алдыңғы санаттар төрге жақын отырады.</figcaption></figure>'


# ---------------------------------------------------------------- страницы
def differ(lang, items, foot=""):
    u = UI[lang]
    vs = "".join(f'<div class="differ-v"><p class="who"><b>{"АӘ"[n] if lang == "kk" else "АБ"[n]}</b>{w}</p><p>{t}</p></div>' for n, (w, t) in enumerate(items))
    f = f'<p class="differ-foot">{foot}</p>' if foot else ""
    return f'<aside class="differ" aria-label="{u["differ"]}"><p class="differ-head" style="margin:0">{ico("split")}{u["differ"]}</p><div class="differ-body">{vs}</div>{f}</aside>'


def folk(lang, pairs, label=None):
    u = UI[lang]
    body = "".join(f'<p class="q">{q}</p>' + (f'<p class="q-tr">{tr}</p>' if tr else "") for q, tr in pairs)
    return f'<aside class="voice folk" aria-label="{label or u["folk"]}">{orn("koshkar", "orn")}<p class="voice-label">{label or u["folk"]}</p>{body}</aside>'


SUNDET_TILEK = dict(
    groups=["balaga", "ata-anasyna", "atasy-men-ajesinen", "nagashylarynan", "qysqa", "olenmen", "aq-bata"],
    group_labels=["Балаға", "Ата-анасына", "Атасы мен әжесінен", "Нағашыларынан", "Қысқа", "Өлеңмен", "Ақ бата"],
    who=["bala", "ata-ana", "ata-aje", "nagashy", "bala", "bala", "bala"],
    who_chips=[("all", "Барлығы"), ("bala", "Балаға"), ("ata-ana", "Ата-анасына"), ("ata-aje", "Атасы мен әжесінен"), ("nagashy", "Нағашыларынан")],
    bata_groups=["aq-bata"], total=60,
)
HUB_TILEK = dict(
    hub=True, groups=["eng-jaqsy-20", "qysqa", "olenmen"], group_labels=["Ең жақсы 20", "Қысқа", "Өлеңмен"],
    who=["", "", ""], who_label="Түрі", who_chips=[("all", "Барлығы"), ("poem", "Өлеңмен"), ("bata", "Бата")],
    bata_groups=[], total=38,
)

PAGES = [
    dict(out="kk-home.html", src="kk/home-kk.md", lang="kk", tpl="landing", url="/kk", pair_url="/ru", sticky=True,
         states="#menu — мобильное меню; #faq — FAQ раскрыт",
         trust=["WhatsApp арқылы", "Қонақ ештеңе орнатпайды", "Залда интернетсіз де жұмыс істейді"],
         hero_art=art_hero("kk"),
         banner=("Тізімнен үстел нөміріне дейін — бір жерде", "Шақыру жасап, WhatsApp арқылы жіберіңіз. Жауаптар мен үстел нөмірлері өзі жиналады."),
         sections={"Тойға шақыру қалай": dict(kind="how", paper=True),
                   "Қонақ не көреді": dict(kind="demo"),
                   "Тізімді ата-анаңызбен": dict(kind="feature", art=art_lists("kk"), paper=True),
                   "Кім келеді": dict(kind="feature", art=art_replies("kk"), rev=True),
                   "Отырғызу": dict(kind="feature", art=art_hall("kk"), paper=True),
                   "Той күні": dict(kind="feature", art=art_door("kk"), rev=True),
                   "Шақыру үлгілері": dict(kind="demo", paper=True),
                   "Қай тойға": dict(kind="demo"),
                   "Сұрақтар": dict(width="48rem", paper=True)},),
    dict(out="kk-tilekter.html", src="kk/tilekter-hub.md", lang="kk", tpl="tilek", hub=True, url="/kk/tilekter", pair_url="/ru/pozdravleniya-na-kazakhskom", nav="tilekter",
         states="#filter — фильтр раскрыт; #filtered; #copied; #copy-fail; #menu", tilek=HUB_TILEK,
         banner=("Өз тойыңызға дайындалып жүрсіз бе?", "Шақыру жасап, WhatsApp арқылы жібересіз, қонақтар жауап береді, ал Сіз оларды үстелдерге отырғызасыз.")),
    dict(out="kk-tilekter-sundet-toi.html", src="kk/tilek-sundet-toi.md", lang="kk", tpl="tilek", url="/kk/tilekter/sundet-toi", nav="tilekter",
         lang_fallback="/ru/pozdravleniya-na-kazakhskom", crumbs=[("Басты бет", "/kk"), ("Тілектер", "/kk/tilekter")], crumb_self="Сүндет тойға тілек",
         states="#filter — фильтр раскрыт (телефон); #filtered — «Ата-анасына» + «Орташа»; #copied — «Көшірілді»; #copy-fail — буфер недоступен; #faq; #menu",
         tilek=SUNDET_TILEK,
         related=[("Дәстүр", "Сүндет той дәстүрі", "/kk/dastur/sundet-toi", "book"), ("Шақыру", "Сүндет тойға шақыру", "/kk/shaqyru/sundet-toi", "send"),
                  ("Тілек", "Ақ бата", "/kk/tilekter/bata", "heart"), ("Тілек", "Бесік тойға тілек", "/kk/tilekter/besik-toi", "heart")],
         banner=("Сүндет тойға қонақ шақырасыз ба?", "Шақыруды WhatsApp арқылы жіберіңіз: қонақтар жауап береді, Сіз оларды үстелдерге отырғызасыз."),
         cta_url="/login?next=/e/new%3Fkind%3Dsundet",
         transforms=[
             ("<p>Сүндет тойда балаға көршілері мен туыстары көрімдік береді. Этнолог М. Егизбаеваның айтуынша, дәстүрде бала туғанда оған тай атап қойған, сүндеттен кейін бала сол тайға мінген. Қалада тайдың орнын «тақ» басқан. Ал этнолог С. Құлсариева балаларды таққа отырғызу қазаққа мүлде тән емес дейді. Яғни таққа отырғызу туралы мамандардың пікірі екі түрлі.</p>",
              "<p>Сүндет тойда балаға көршілері мен туыстары көрімдік береді.</p>" + differ("kk", [("Этнолог М. Егизбаева", "Дәстүрде бала туғанда оған тай атап қойған, сүндеттен кейін бала сол тайға мінген. Қалада тайдың орнын «тақ» басқан."), ("Этнолог С. Құлсариева", "Балаларды таққа отырғызу қазаққа мүлде тән емес.")], "Яғни таққа отырғызу туралы мамандардың пікірі екі түрлі.")),
         ]),
    dict(out="kk-dastur-betashar.html", src="kk/dastur-betashar.md", lang="kk", tpl="article", url="/kk/dastur/betashar", pair_url="/ru/traditsii/betashar", nav="dastur",
         crumbs=[("Басты бет", "/kk"), ("Дәстүр", "/kk/dastur")], crumb_self="Беташар", toc=True, meta=True,
         states="#toc — оглавление раскрыто (телефон); #faq; #menu",
         aside_cta=("Үйлену тойына шақыру", "Қонақтар тізімі, WhatsApp арқылы шақыру және отырғызу — бір жерде."),
         related=[("Дәстүр", "Үйлену тойы", "/kk/dastur/uilenu-toi", "book"), ("Шақыру", "Үйлену тойына шақыру", "/kk/shaqyru/uilenu-toi", "send"),
                  ("Тілек", "Келінге тілек", "/kk/tilekter/kelinge", "heart"), ("Тілек", "Ақ бата", "/kk/tilekter/bata", "heart")],
         banner=("Үйлену тойына шақыру жасаңыз", "Қонақтар WhatsApp-та жауап береді, Сіз оларды дөңгелек үстелдерге отырғызасыз."),
         transforms=[
             ("<p>2024 жылы беташар ЮНЕСКО-ның адамзаттың материалдық емес мәдени мұрасының репрезентативтік тізіміне енді. Бұл шешім (19.COM 7.b.45) Парагвайдың Асунсьон қаласында өткен сессияда қабылданды.</p>",
              '<div class="fact"><span class="big">2024</span><p>2024 жылы беташар ЮНЕСКО-ның адамзаттың материалдық емес мәдени мұрасының репрезентативтік тізіміне енді. Бұл шешім (19.COM 7.b.45) Парагвайдың Асунсьон қаласында өткен сессияда қабылданды.<a class="fn" href="#src-1" aria-label="Дереккөз 1">1</a></p></div>'),
             ("<p>Этнограф С. Кенжеахметұлы «Жеті қазына» еңбегінде: «Жаңа түскен келінді беташар дәстүрі жасалмай ешкім көре алмайды», — деп жазады.</p>",
              "<blockquote><p>«Жаңа түскен келінді беташар дәстүрі жасалмай ешкім көре алмайды»</p><cite>Этнограф С. Кенжеахметұлы, «Жеті қазына»</cite></blockquote>"),
             ("<p>Халық аузында «Келіннің бетін кім ашса — сол ыстық» деген сөз бар.</p>", folk("kk", [("«Келіннің бетін кім ашса — сол ыстық»", "")])),
             ("<li>Келіннің беті ашылады. Қазақстандық деректерде бет қамшының немесе домбыраның сабымен ашылады, ЮНЕСКО сипаттамасында жабуды ақын көтереді.</li>",
              '<li>Келіннің беті ашылады.<div style="margin-top:.75rem">' + differ("kk", [("Қазақстандық деректерде", "Бет қамшының немесе домбыраның сабымен ашылады."), ("ЮНЕСКО сипаттамасында", 'Жабуды ақын көтереді.<a class="fn" href="#src-1" aria-label="Дереккөз 1">1</a>')]) + "</div></li>"),
             ("<p>Беташар жырының мәтіні туралы бір ескерту.", f'<div class="note">{ico("info")}<p>Беташар жырының мәтіні туралы бір ескерту.'),
             ("ол — авторлық шығарма.</p>", "ол — авторлық шығарма.</p></div>"),
             ("<p>Этнограф Байахмет Жұмабайұлының пікірінше, беташардағы табаққа салынған ақша жастарға тиесілі, келіннің бетін ашқан адамға емес.",
              '<p>Этнограф Байахмет Жұмабайұлының пікірінше, беташардағы табаққа салынған ақша жастарға тиесілі, келіннің бетін ашқан адамға емес.<a class="fn" href="#src-4" aria-label="Дереккөз 4">4</a>'),
             ('<h2 id="suraqtar">', '<aside class="glossary" aria-labelledby="gl-h"><p class="g-title" id="gl-h">' + ico("book", "ico sm") + 'Мақаладағы сөздер</p><dl>'
              '<dt><a href="#" data-url="/kk/dastur/toi-sozdigi#korimdik">Көрімдік</a></dt><dd>Келінді немесе баланы алғаш көргенде берілетін сыйлық.</dd>'
              '<dt><a href="#" data-url="/kk/dastur/toi-sozdigi#shashu">Шашу</a></dt><dd>Қуанышты оқиғаға орай шашылатын тәтті, тиын.</dd></dl>'
              '<p style="margin:.75rem 0 0"><a class="link-more" href="#" data-url="/kk/dastur/toi-sozdigi">Той сөздігі' + ico("arrow", "ico sm") + '</a></p></aside>\n<h2 id="suraqtar">'),
             ('<section class="sources"', related_html("kk", [("Дәстүр", "Үйлену тойы", "/kk/dastur/uilenu-toi", "book"), ("Шақыру", "Үйлену тойына шақыру", "/kk/shaqyru/uilenu-toi", "send"), ("Тілек", "Келінге тілек", "/kk/tilekter/kelinge", "heart"), ("Тілек", "Ақ бата", "/kk/tilekter/bata", "heart")]) + '\n<section class="sources"'),
         ]),
    dict(out="kk-shaqyru-qyz-uzatu.html", src="kk/shaqyru-qyz-uzatu.md", lang="kk", tpl="article", url="/kk/shaqyru/qyz-uzatu", pair_url="/ru/priglashenie/kyz-uzatu", nav="shaqyru",
         crumbs=[("Басты бет", "/kk"), ("Шақыру", "/kk/shaqyru")], crumb_self="Қыз ұзату", toc=True, sticky=True,
         cta_url="/login?next=/e/new%3Fkind%3Dkyz_uzatu",
         states="#toc; #copied — «Көшірілді» на тексте приглашения; #faq; #menu",
         demo_args=dict(kind="Қыз ұзату", names="Дана"),
         aside_cta=("Қыз ұзатуға шақыру", "«Қызғалдақ» үлгісі, әуен, қонақтардың жауабы және отырғызу."),
         related=[("Дәстүр", "Қыз ұзату дәстүрі", "/kk/dastur/qyz-uzatu", "book"), ("Тілек", "Қыз ұзатуға тілек", "/kk/tilekter/qyz-uzatu", "heart"),
                  ("Тілек", "Құдаларға тілек", "/kk/tilekter/qudalarga", "heart"), ("Дәстүр", "Сырға салу", "/kk/dastur/syrga-salu", "book")],
         banner=("Қыз ұзату тойына шақыруды бүгін жасаңыз", "Үлгіні таңдап, мәтінді жазасыз. Әр отбасына жеке сілтеме WhatsApp арқылы барады."),
         transforms=[("Толығырақ: <a href=\"#\" data-url=\"/kk/otyrgyzu-jospary\">отырғызу жоспары</a>.</p>", "Толығырақ: <a href=\"#\" data-url=\"/kk/otyrgyzu-jospary\">отырғызу жоспары</a>.</p>" + art_order())]),
    dict(out="ru-home.html", src="ru/home-ru.md", lang="ru", tpl="landing", url="/ru", pair_url="/kk", sticky=True, faq_stop=r"^Если вы готовы",
         states="#menu; #faq",
         trust=["Через WhatsApp", "Гостю ничего не нужно устанавливать", "Вход работает без интернета"],
         hero_art=art_hero("ru"),
         banner=("Приглашение на той — за один вечер", "Если вы готовы начать, создайте приглашение онлайн — первые гости смогут ответить уже сегодня."),
         sections={"Как это работает": dict(kind="how", paper=True), "Онлайн-приглашение": dict(kind="demo"),
                   "Список гостей": dict(kind="feature", art=art_lists("ru"), paper=True), "Кто придёт": dict(kind="feature", art=art_replies("ru"), rev=True),
                   "Рассадка": dict(kind="feature", art=art_hall("ru"), paper=True), "Помощник": dict(kind="feature", art=art_door("ru"), rev=True),
                   "Шаблоны": dict(kind="demo", paper=True), "Для какого": dict(kind="demo"), "Вопросы": dict(width="48rem", paper=True)},
         transforms=[("Цена <span class=\"brand-ph\">{BRAND}</span>: <span class=\"ph\">{PRICE}</span>.", "<span class=\"soon-badge\">Цена <span class=\"brand-ph\">{BRAND}</span> — скоро</span>"),
                     ("<p>Если вы готовы начать, создайте приглашение онлайн — первые гости смогут ответить уже сегодня. Остальное — в разделе <a href=\"#\" data-url=\"/ru/voprosy\">«Все вопросы»</a>.</p>",
                      "<p><a class=\"link-more\" href=\"#\" data-url=\"/ru/voprosy\">Все вопросы" + ico("arrow", "ico sm") + "</a></p>")]),
    dict(out="ru-rassadka-gostei.html", src="ru/rassadka.md", lang="ru", tpl="article", url="/ru/rassadka-gostei", pair_url="/kk/otyrgyzu-jospary", nav="rassadka",
         crumbs=[("Главная", "/ru")], crumb_self="Рассадка гостей", toc=True, meta=True, sticky=True,
         states="#toc; #faq; #menu",
         aside_cta=("План рассадки онлайн", "Список, ответы, круглые столы и номер стола каждой семье в WhatsApp."),
         banner=("Составьте план рассадки онлайн", "Сначала нужен список и ответы — начните с приглашения, а столы сервис поможет расставить."),
         related=[("Приглашение", "Пригласительные на свадьбу и той", "/ru/priglashenie", "send"), ("Функция", "Список гостей", "/ru/spisok-gostei", "list"), ("Традиция", "Что такое қыз ұзату", "/ru/traditsii/kyz-uzatu", "book")],
         transforms=[
             ('<div class="btn-row stack"><a class="btn primary" href="#" data-url="/e/new">Составить план рассадки</a></div>\n<section class="sources"', '<section class="sources"'),
             ('<h3 id="traditsiya">Традиция</h3>', '<p class="tradition-label">' + orn("koshkar", "") + 'Традиция · как описано для дома</p>'),
             ('<h3 id="kak-delayut-segodnya">Как делают сегодня</h3>\n<p>Это практика, а не обычай.</p>',
              '<div class="voice practice"><p class="voice-label">' + ico("users", "ico") + 'Как делают сегодня</p><p>Это практика, а не обычай.</p>'),
             ('<h2 id="kto-sidit-za-stolom-molodozhenov">', '</div>\n<h2 id="kto-sidit-za-stolom-molodozhenov">'),
             ("<p>О төр есть и другие народные пословицы: «Есіктен кіріп, төр менікі деме» — «войдя в дверь, не говори, что төр твой» — и «Төрдегі күлсе, есіктегі жымияды» — «если засмеётся сидящий на төре, улыбнётся и тот, кто у двери».</p>",
              folk("ru", [("«Есіктен кіріп, төр менікі деме»", "«Войдя в дверь, не говори, что төр твой»"), ("«Төрдегі күлсе, есіктегі жымияды»", "«Если засмеётся сидящий на төре, улыбнётся и тот, кто у двери»")], "Народные пословицы о төр")),
             ('<p>Сначала нужен список и ответы — начните с приглашения: <a href="#" data-url="/ru/priglashenie">пригласительные на свадьбу и той</a>.</p>',
              related_html("ru", [("Приглашение", "Пригласительные на свадьбу и той", "/ru/priglashenie", "send"), ("Функция", "Список гостей", "/ru/spisok-gostei", "list"), ("Традиция", "Что такое қыз ұзату", "/ru/traditsii/kyz-uzatu", "book")], three=True)),
         ]),
]


def main():
    (OUT / "assets").mkdir(parents=True, exist_ok=True)
    for cfg in PAGES:
        fm, body = load(CONTENT / cfg["src"])
        toks = tokenize(body)
        html = page_landing(fm, toks, cfg) if cfg["tpl"] == "landing" else page_article(fm, toks, cfg)
        (OUT / cfg["out"]).write_text(html, encoding="utf-8")
        print("ok", cfg["out"], len(html.encode()) // 1024, "KB")


if __name__ == "__main__":
    main()
