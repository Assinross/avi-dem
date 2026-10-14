#!/usr/bin/env python3
"""Список карт для отрисовки, сгруппированный по фракциям (и нейтральные).

Пишет extracted/art/cards_by_faction.json - только локально: в нём оригинальные названия
(чужая собственность, в репозиторий не идут). Нужны data/cards.json и extracted/cards_full.json.
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from names_factions import FACTIONS  # noqa: E402

ORDER = ['fracture_clans', 'mutation_swarm', 'astral_synklit', 'frontier_union', 'neutral']


def original_name(c):
    """Английское название из выгрузки (без русских рабочих пометок разработчиков)."""
    name = c.get('name') or ''
    out = []
    for word in name.split():
        if any('Ѐ' <= ch <= 'ӿ' for ch in word) or '!' in word:
            break
        out.append(word)
    words = out
    half = len(words) // 2
    if half and words[:half] == words[half:]:  # повтор имени дважды подряд
        words = words[:half]
    return ' '.join(words) or c['code']


def main():
    cards = json.load(open('data/cards.json', encoding='utf-8'))
    orig = {c['code']: c for c in json.load(open('extracted/cards_full.json', encoding='utf-8'))}
    names = {f['id']: f['name'] for f in FACTIONS.values()}
    kwn = json.load(open('data/keywords.json', encoding='utf-8'))
    tribes = json.load(open('data/tribes.json', encoding='utf-8'))

    def effect(c):
        kws = []
        for k in c.get('keywords', []):
            key, _, n = k.partition(':')
            kws.append(kwn.get(key, {}).get('name', key) + (' ' + n if n else ''))
        parts = ([', '.join(kws) + '.'] if kws else []) + ([c['text']] if c['text'] else [])
        return ' '.join(parts)
    groups = {fid: [] for fid in ORDER}
    for c in cards:
        o = orig.get(c['code'], {})
        groups[c['faction']].append({
            'id': c['id'],
            'original_name': original_name(o) if o else c['name'],
            'name': c['name'],
            'faction': names[c['faction']],
            'type': c['type'],
            'element': c['element'],
            'cost': c['cost'],
            'attack': c.get('atk'),
            'health': c.get('hp'),
            'creature_type': tribes.get(c.get('race')),
            'effect': effect(c),
            'rarity': c['rarity'],
            'art': 'assets/' + c['art'] + '.webp',
            'implemented': c.get('impl', True),
        })
    out = [{'faction_id': fid, 'faction': names[fid], 'count': len(groups[fid]), 'cards': groups[fid]} for fid in ORDER]
    os.makedirs('extracted/art', exist_ok=True)
    with open('extracted/art/cards_by_faction.json', 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False, indent=2)
    for g in out:
        print('%-22s %d' % (g['faction'], g['count']))


if __name__ == '__main__':
    main()
