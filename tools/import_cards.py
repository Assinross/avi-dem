#!/usr/bin/env python3
"""Импорт всех карт оригинала в data/cards.json.

Числа (стоимость, сила, здоровье, флаги, редкость) берутся из extracted/cards_full.json,
названия, тексты, типы существ и способности - свои, описаны ниже в SPEC.
Карта со способностью todo(...) получает "impl": false и не попадает в колоды и награды.

Запуск: python3 tools/import_cards.py   (нужна папка extracted/, см. tools/build_cards.py)
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from cards_spec import SPEC, SKIP, SPECIAL, KEEP_IDS, EXTRA_CARDS  # noqa: E402
from names_factions import FACTIONS, TRIBES, NAMES, TEXTS  # noqa: E402

ELEMENT = {'Red': 'chaos', 'Green': 'life', 'Blue': 'movement', 'Black': 'synthesis', 'White': 'white'}
TYPE = {'Creature': 'creature', 'Sorcery': 'sorcery', 'Enchantment': 'enchantment'}
RARITY = {'Common': 'common', 'Rare': 'rare', 'Unique': 'unique', 'Cantrip': 'cantrip'}
FLAG = {'Fly': 'flying', 'FS': 'firstStrike', 'Trample': 'trample', 'Restless': 'restless', 'Lifetap': 'lifetap',
        'UB': 'unblockable', 'Elusive': 'elusive', 'NoAttack': 'noAttack', 'Berserk': 'berserk', 'NSS': 'haste',
        'Disenchant': 'disenchant', 'NoTarget': 'untargetable', 'NoUntap': 'noUntap', 'Destroy': 'deadly',
        'NoAffect': None, 'Outerplanar': 'pale', 'TeamAttack': None}


def keywords_from_flags(flags):
    out = []
    for f in flags:
        name, _, arg = f.partition('(')
        arg = arg.rstrip(')')
        if name == 'Regen':
            out.append('regen:' + arg)
        elif name == 'Discard':
            out.append('discard:' + arg)
        elif FLAG.get(name):
            out.append(FLAG[name])
    return out


def main():
    with open('extracted/cards_full.json', encoding='utf-8') as f:
        orig = {c['code']: c for c in json.load(f)}
    cards, missing = [], []
    for code, c in sorted(orig.items(), key=lambda kv: (kv[1]['color'], kv[1]['class'], kv[1]['cost'], kv[0])):
        if c['use'] != '+' or code in SKIP:
            continue
        spec = SPEC.get(code)
        if not spec:
            missing.append(code)
            continue
        card = {
            'id': KEEP_IDS.get(code, code.lower()),
            'code': code,
            'name': NAMES.get(code, spec['name']),
            'element': ELEMENT[c['color']],
            'faction': FACTIONS[ELEMENT[c['color']]]['id'],
            'type': spec.get('type') or TYPE[c['class']],
            'rarity': RARITY.get(c['rarity'], 'common'),
            'cost': c['cost'],
        }
        if card['type'] == 'creature':
            card['atk'] = c['power']
            card['hp'] = c['toughness']
            card['race'] = spec['race']
            kw = keywords_from_flags(c.get('flags', []))
            for k in spec.get('kw', []):
                if k.startswith('-'):
                    kw = [x for x in kw if x.split(':')[0] != k[1:]]
                elif k not in kw:
                    kw.append(k)
            card['keywords'] = kw
        for k in ('target', 'targetFilter', 'attach', 'xCost', 'sacrifice', 'blockPhase', 'release'):
            if k in spec:
                card[k] = spec[k]
        abilities = spec.get('ab', [])
        todo = [a['todo'] for a in abilities if 'todo' in a]
        card['abilities'] = [a for a in abilities if 'todo' not in a]
        card['text'] = TEXTS.get(code, spec.get('text', ''))
        if todo:
            card['impl'] = False
        if code in SPECIAL or c['color'] == 'White':
            card['special'] = True
        if code in SPECIAL or c['color'] == 'White':
            card['faction'] = 'neutral'
        card['art'] = 'cards/%s/%s' % (card['faction'], card['id'])
        card['focus'] = [0.5, 0.4]
        cards.append(card)
    for extra in EXTRA_CARDS:
        extra = dict(extra, faction='neutral', art='cards/neutral/' + extra['id'])
        cards.append(extra)
    with open('data/tribes.json', 'w', encoding='utf-8') as f:
        json.dump(TRIBES, f, ensure_ascii=False, indent=1)
    if missing:
        print('нет описания для:', ' '.join(missing))
    with open('data/cards.json', 'w', encoding='utf-8') as f:
        f.write('[\n' + ',\n'.join('  ' + json.dumps(c, ensure_ascii=False) for c in cards) + '\n]\n')
    impl = sum(1 for c in cards if c.get('impl', True))
    print('карт: %d, реализовано: %d, в ожидании: %d' % (len(cards), impl, len(cards) - impl))


if __name__ == '__main__':
    main()
