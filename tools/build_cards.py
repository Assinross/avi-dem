#!/usr/bin/env python3
"""Сводная выгрузка карт оригинала: заклинание + существо + тексты.

Читает extracted/json/*.json (результат reg2json.py), пишет
extracted/cards_full.json и extracted/cards_table.tsv. Только для extracted/.
"""
import json
import os

SRC = 'extracted/json'


def load(name):
    with open(os.path.join(SRC, name + '.json'), encoding='utf-8') as f:
        return json.load(f)


def as_list(v):
    if v is None:
        return []
    return v if isinstance(v, list) else [v]


def main():
    spells, creatures, texts = load('CombatSpells'), load('CombatCreatures'), load('ELKTexts')

    def text(key):
        v = texts.get(key or '', {}).get('Translate')
        return ' '.join(as_list(v)) or None

    cards = []
    for code, s in sorted(spells.items()):
        c = creatures.get(code)
        card = {
            'code': code,
            'name': text(s.get('Name')),
            'class': s.get('Class'),
            'color': s.get('Color'),
            'cost': s.get('Cost'),
            'rarity': s.get('Rarity'),
            'use': s.get('Use'),
            'tooltip': text(s.get('ToolTip')),
            'ability': text(s.get('AbilityText')),
        }
        if c:
            card.update(race=c.get('Race'), power=c.get('Power'), toughness=c.get('Toughness'),
                        flags=as_list(c.get('Flags')))
        cards.append(card)
    with open('extracted/cards_full.json', 'w', encoding='utf-8') as f:
        json.dump(cards, f, ensure_ascii=False, indent=1)
    with open('extracted/cards_table.tsv', 'w', encoding='utf-8') as f:
        f.write('code\tcolor\tclass\tcost\trarity\tP/T\tflags\tname\ttooltip\n')
        for c in sorted(cards, key=lambda c: (c['color'] or '', c['class'] or '', c['cost'] or 0)):
            pt = '%s/%s' % (c['power'], c['toughness']) if 'power' in c else ''
            f.write('\t'.join(str(x) for x in (c['code'], c['color'], c['class'], c['cost'], c['rarity'], pt,
                                               ','.join(c.get('flags', [])), c['name'], c['tooltip'])) + '\n')
    print('карт: %d' % len(cards))


if __name__ == '__main__':
    main()
