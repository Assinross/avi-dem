#!/usr/bin/env python3
"""Вырезать сгенерированные картинки со снимка экрана страницы perchance.org.

Снимок 800x1100 (окно браузера 800x1100, фрейм генератора увеличен zoom 1.7, картинка в одну колонку).
Картинка - полоса строк, где не-белые и края (x=141, x=W-155), и почти вся ширина. Яркие белые
полосы внутри картинки до 20 строк склеиваются. Обрезается 6 px по краю (скругления сайта).

Запуск: python3 tools/grab_shot.py <снимок.jpg> <префикс>  -> <префикс>_1.png, _2.png ...
"""
import sys
from PIL import Image

src, prefix = sys.argv[1], sys.argv[2]
im = Image.open(src).convert('RGB')
W, H = im.size
px = im.load()


def white(x, y):
    r, g, b = px[x, y]
    return r > 238 and g > 238 and b > 238


# Левый и правый край - по средней строке самого длинного не-белого участка
def edges(y):
    xs = [x for x in range(W) if not white(x, y)]
    return (xs[0], xs[-1]) if xs else None


# строки, где у полей (x=150 и x=W-160) не белое - это строки картинки
rows = []
for y in range(H):
    inside = sum(1 for x in range(150, W - 150, 6) if not white(x, y))
    edge = not white(141, y) and not white(W - 155, y)
    rows.append(y > 28 and edge and inside > 0.6 * len(range(150, W - 150, 6)))
# склеить короткие разрывы (яркие белые полосы внутри картинки)
y = 1
while y < H:
    if not rows[y] and rows[y - 1]:
        g = y
        while g < H and not rows[g]:
            g += 1
        if g < H and g - y <= 20:
            for k in range(y, g):
                rows[k] = True
        y = g
    y += 1
n, y = 0, 0
while y < H:
    if rows[y]:
        y0 = y
        while y < H and rows[y]:
            y += 1
        if y - y0 > 300:
            mid = (y0 + y) // 2
            # горизонтальные границы по нескольким строкам
            ls, rs = [], []
            for yy in range(y0 + 20, y - 20, 40):
                x = 0
                while x < W and white(x, yy):
                    x += 1
                xr = W - 1
                while xr > 0 and white(xr, yy):
                    xr -= 1
                ls.append(x)
                rs.append(xr)
            x0, x1 = sorted(ls)[len(ls) // 2], sorted(rs)[len(rs) // 2]
            n += 1
            box = (x0 + 6, y0 + 6, x1 - 5, y - 6)
            im.crop(box).save('%s_%d.png' % (prefix, n))
            print('%s_%d.png' % (prefix, n), box, (box[2] - box[0], box[3] - box[1]))
    y += 1
if not n:
    print('картинок не найдено')
