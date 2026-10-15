#!/usr/bin/env python3
"""Подключение картинок из art_inbox/ к игре.

Для каждой записи art_inbox/prompts.json, у которой в art_inbox/ лежит файл
(<id>.png, .jpg или .webp), обрезает картинку по центру под формат и сохраняет WebP
в assets/<out>.webp. Затем пересобирает манифест data/assets.json по файлам в assets/.

Форматы: карты 3:4 (600x800), герои 1:1 (512x512), фоны 16:9 (1280x720), карты глав 3:2 (1200x800).
Нужен Pillow. Запуск: python3 tools/import_art.py
"""
import json
import os

from PIL import Image

SIZES = {'heroes': (512, 512), 'backgrounds': (1280, 720), 'cards': (600, 800), 'maps': (1200, 800)}


def fit(im, w, h):
    """Обрезать по центру до пропорций w:h и привести к размеру w x h."""
    sw, sh = im.size
    if sw * h > sh * w:
        nw = sh * w // h
        im = im.crop(((sw - nw) // 2, 0, (sw - nw) // 2 + nw, sh))
    else:
        nh = sw * h // w
        im = im.crop((0, (sh - nh) // 2, sw, (sh - nh) // 2 + nh))
    return im.resize((w, h), Image.LANCZOS)


def main():
    items = json.load(open('art_inbox/prompts.json', encoding='utf-8'))
    done = 0
    for x in items:
        base = os.path.join('art_inbox', x['file'][:-4])
        src = next((base + e for e in ('.png', '.jpg', '.webp') if os.path.exists(base + e)), None)
        if not src:
            continue
        w, h = SIZES[x['out'].split('/')[0]]
        dst = os.path.join('assets', x['out'] + '.webp')
        if os.path.exists(dst) and os.path.getmtime(dst) >= os.path.getmtime(src):
            continue
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        fit(Image.open(src).convert('RGB'), w, h).save(dst, 'WEBP', quality=84, method=6)
        done += 1
        print('%s -> %s' % (src, dst))
    arts = []
    for root, _, files in os.walk('assets'):
        for f in files:
            if f.endswith('.webp'):
                arts.append(os.path.relpath(os.path.join(root, f), 'assets')[:-5])
    with open('data/assets.json', 'w', encoding='utf-8') as f:
        json.dump(sorted(arts), f, ensure_ascii=False, indent=1)
    print('Новых: %d, всего в манифесте: %d' % (done, len(arts)))


if __name__ == '__main__':
    main()
