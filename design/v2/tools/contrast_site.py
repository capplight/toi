# -*- coding: utf-8 -*-
"""Контраст пар цветов публичного сайта (WCAG 2.x, относительная яркость). Запуск: python design/v2/tools/contrast_site.py"""

def lum(h):
    h = h.lstrip("#"); c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    c = [x / 12.92 if x <= 0.03928 else ((x + 0.055) / 1.055) ** 2.4 for x in c]
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]

def ratio(a, b):
    la, lb = sorted((lum(a), lum(b)), reverse=True)
    return (la + 0.05) / (lb + 0.05)

PAIRS = [  # (что, текст/графика, фон, порог)
    ("Текст на фоне страницы", "#17202C", "#F7F2E9", 4.5),
    ("Вторичный текст (крошки, подписи)", "#535C69", "#F7F2E9", 4.5),
    ("Вторичный текст на карточке", "#535C69", "#FFFDF8", 4.5),
    ("Ссылка lapis на ivory", "#1C3B5E", "#F7F2E9", 4.5),
    ("Кнопка primary: белый на lapis", "#FFFFFF", "#1C3B5E", 4.5),
    ("Чип выбран: белый на lapis", "#FFFFFF", "#1C3B5E", 4.5),
    ("Рамка чипа/поля line-strong на paper (графика)", "#857760", "#FFFDF8", 3.0),
    ("Совет: метка lapis на lapis-soft", "#1C3B5E", "#E6EDF5", 4.5),
    ("Совет: текст ink на lapis-soft", "#17202C", "#E6EDF5", 4.5),
    ("Совет: пояснение ink-2 на lapis-soft", "#535C69", "#E6EDF5", 4.5),
    ("Халық аузынан: метка gold-ink на gold-soft", "#7A5200", "#FBF0D9", 4.5),
    ("Халық аузынан: текст ink-2 на gold-soft", "#535C69", "#FBF0D9", 4.5),
    ("Практика: ink-2 на sand", "#535C69", "#EEE6D6", 4.5),
    ("Расхождение: ink на sand (шапка)", "#17202C", "#EEE6D6", 4.5),
    ("Метка длины ink-2 на sand", "#535C69", "#EEE6D6", 4.5),
    ("Метка «өлең» lapis на lapis-soft", "#1C3B5E", "#E6EDF5", 4.5),
    ("Метка «бата» success-ink на success-soft", "#155C38", "#E5F3EA", 4.5),
    ("Кнопка WhatsApp: success-ink на paper", "#155C38", "#FFFDF8", 4.5),
    ("Рамка WhatsApp success на paper (графика)", "#1D7447", "#FFFDF8", 3.0),
    ("«Көшірілді»: success-ink на success-soft", "#155C38", "#E5F3EA", 4.5),
    ("Плейсхолдер [есімі] gold-ink на gold-soft", "#7A5200", "#FBF0D9", 4.5),
    ("«Жақында» gold-ink на gold-soft", "#7A5200", "#FBF0D9", 4.5),
    ("CTA-баннер: заголовок on-night на night", "#F4EBDA", "#0F2338", 4.5),
    ("CTA-баннер: текст on-night-2 на night", "#C9BFAE", "#0F2338", 4.5),
    ("CTA-баннер: on-night-2 на светлом углу #24496F", "#C9BFAE", "#24496F", 4.5),
    ("Кнопка gold: night на gold-bright", "#0F2338", "#D8B26A", 4.5),
    ("Футер: заголовки gold-bright на night", "#D8B26A", "#0F2338", 4.5),
    ("Футер: ссылки on-night на night", "#F4EBDA", "#0F2338", 4.5),
    ("Футер: вторичный on-night-2 на night", "#C9BFAE", "#0F2338", 4.5),
    ("Фокус lapis на ivory (графика)", "#1C3B5E", "#F7F2E9", 3.0),
    ("Фокус gold-bright на night (графика)", "#D8B26A", "#0F2338", 3.0),
    ("Номер шага gold-ink на paper", "#7A5200", "#FFFDF8", 4.5),
    ("Тост: белый на ink", "#FFFFFF", "#17202C", 4.5),
    ("Орнамент gold на ivory (декор, не текст)", "#B48A3E", "#F7F2E9", 0),
]

if __name__ == "__main__":
    bad = 0
    for name, fg, bg, need in PAIRS:
        r = ratio(fg, bg); ok = r >= need
        bad += not ok
        print(f"{'OK ' if ok else 'BAD'} {r:5.2f}:1  (≥{need})  {name}  {fg} / {bg}")
    print("Нарушений:", bad)
